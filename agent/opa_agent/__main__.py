"""
OO오피스텔 주차 관리 에이전트 — 메인 루프

실행: python -m opa_agent
서비스: NSSM으로 Windows Service 등록

루프 구성 (각 태스크는 독립 스레드):
  - Heartbeat   : 60초마다 클라우드에 상태 전송
  - Sync        : 60초마다 sync_queue 처리 (Cartan ↔ 클라우드)
  - Commands    : 60초마다 원격 명령 확인
  - UpdateCheck : 3600초마다 GitHub Releases 자동 업데이트 확인
"""
import logging
import logging.handlers
import os
import sys
import time
import threading
import signal
from datetime import datetime, timezone
from pathlib import Path

from . import __version__, SERVICE_NAME
from . import config as cfg
from . import cloud_client as cloud
from . import updater
from .cartan import get_adapter
from .cartan.base import CartanAdapter, VisitorRecord

# ── 로깅 설정 ─────────────────────────────────────────────
LOG_DIR = cfg.BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=getattr(logging, cfg.LOG_LEVEL(), "INFO"),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.handlers.RotatingFileHandler(
            LOG_DIR / "agent.log",
            maxBytes=5 * 1024 * 1024,   # 5 MB
            backupCount=5,
            encoding="utf-8",
        ),
    ],
)

logger = logging.getLogger(__name__)

# ── 공유 상태 ─────────────────────────────────────────────
_stop_event = threading.Event()
_stats = {
    "cartan_ok": False,
    "last_sync": None,
    "queue_processed": 0,
    "error_count": 0,
}
_adapter: CartanAdapter | None = None


# ════════════════════════════════════════════════════════════
# 태스크: Heartbeat
# ════════════════════════════════════════════════════════════
def task_heartbeat() -> None:
    while not _stop_event.is_set():
        try:
            ok = cloud.send_heartbeat(
                cartan_ok=_stats["cartan_ok"],
                last_sync=_stats["last_sync"],
                queue_processed=_stats["queue_processed"],
                error_count=_stats["error_count"],
            )
            logger.debug("Heartbeat %s", "OK" if ok else "FAIL")
        except Exception as e:
            logger.warning("Heartbeat 오류: %s", e)
        _stop_event.wait(cfg.HEARTBEAT_SEC())


# ════════════════════════════════════════════════════════════
# 태스크: Sync Queue 처리 (클라우드 → Cartan)
# ════════════════════════════════════════════════════════════
def _process_queue_item(item: dict) -> None:
    global _adapter
    if _adapter is None:
        return

    qid    = item.get("id", "?")
    action = item.get("action", "")
    pl     = item.get("payload", {})

    try:
        if action == "add_visitor":
            from datetime import timedelta
            plate = pl.get("plate_normalized", "")
            unit  = pl.get("unit_number", "")
            vdate = pl.get("valid_date", "")   # YYYY-MM-DD
            if not all([plate, unit, vdate]):
                cloud.ack_queue_item(qid, False, "필드 누락")
                return

            d = datetime.strptime(vdate, "%Y-%m-%d")
            record = VisitorRecord(
                plate=plate,
                plate_display=pl.get("plate_display", plate),
                unit=unit,
                valid_from=d.replace(hour=6),
                valid_until=d.replace(hour=18),
                external_id=pl.get("registration_id"),
            )
            ok = _adapter.add_visitor(record)
            cloud.ack_queue_item(qid, ok)
            if ok:
                _stats["queue_processed"] += 1

        elif action == "remove_visitor":
            plate = pl.get("plate_normalized", "")
            vdate = pl.get("valid_date", "")
            ok = _adapter.remove_visitor(plate, vdate)
            cloud.ack_queue_item(qid, ok)

        else:
            logger.warning("알 수 없는 action: %s", action)
            cloud.ack_queue_item(qid, False, f"unknown action: {action}")

    except Exception as e:
        logger.error("queue item %s 처리 오류: %s", qid, e)
        _stats["error_count"] += 1
        cloud.ack_queue_item(qid, False, str(e))


def task_sync() -> None:
    while not _stop_event.is_set():
        global _adapter
        try:
            # Cartan health check
            if _adapter is not None:
                _stats["cartan_ok"] = _adapter.health_check()
            else:
                _stats["cartan_ok"] = False

            if _stats["cartan_ok"]:
                items = cloud.get_sync_queue()
                if items:
                    logger.info("sync_queue %d건 처리", len(items))
                    for item in items:
                        _process_queue_item(item)
                    _stats["last_sync"] = datetime.now(timezone.utc)
        except Exception as e:
            logger.error("Sync 오류: %s", e)
            _stats["error_count"] += 1

        _stop_event.wait(cfg.CLOUD_POLL_SEC())


# ════════════════════════════════════════════════════════════
# 태스크: 원격 명령
# ════════════════════════════════════════════════════════════
def task_commands() -> None:
    while not _stop_event.is_set():
        try:
            cmds = cloud.get_pending_commands()
            for cmd in cmds:
                cid  = cmd.get("id", "?")
                name = cmd.get("cmd", "")
                logger.info("원격 명령: %s", name)

                if name == "update":
                    cloud.ack_command(cid, "업데이트 확인 시작")
                    updater.check_and_update()

                elif name == "restart":
                    cloud.ack_command(cid, "재시작")
                    _stop_event.set()
                    os._exit(0)   # NSSM이 재시작

                elif name == "set_dry_run":
                    val = str(cmd.get("params", {}).get("enabled", "true")).lower()
                    cfg.write_config({"CARTAN_DRY_RUN": val})
                    cloud.ack_command(cid, f"dry_run={val}")

                elif name == "dump_logs":
                    log_file = LOG_DIR / "agent.log"
                    tail = ""
                    if log_file.exists():
                        lines = log_file.read_text("utf-8", errors="replace").splitlines()
                        tail = "\n".join(lines[-100:])
                    cloud.ack_command(cid, tail[:4000])

                elif name == "reload_config":
                    cloud.ack_command(cid, "config 재로드 (다음 주기에 반영)")

                else:
                    cloud.ack_command(cid, f"알 수 없는 명령: {name}")

        except Exception as e:
            logger.warning("Commands 오류: %s", e)

        _stop_event.wait(cfg.CLOUD_POLL_SEC())


# ════════════════════════════════════════════════════════════
# 태스크: 자동 업데이트
# ════════════════════════════════════════════════════════════
def task_update_check() -> None:
    # 기동 직후 1분 대기 후 첫 번째 체크
    _stop_event.wait(60)
    while not _stop_event.is_set():
        try:
            updater.check_and_update()
        except Exception as e:
            logger.warning("UpdateCheck 오류: %s", e)
        _stop_event.wait(cfg.UPDATE_CHECK_SEC())


# ════════════════════════════════════════════════════════════
# 시작
# ════════════════════════════════════════════════════════════
def main() -> None:
    global _adapter

    logger.info("=" * 60)
    logger.info("OO오피스텔 주차 관리 에이전트 v%s 시작", __version__)
    logger.info("dry_run=%s  scenario=%s", cfg.CARTAN_DRY_RUN(), cfg.CARTAN_SCENARIO())
    logger.info("=" * 60)

    # Cartan 어댑터 초기화 (실패해도 계속 — heartbeat는 cartan_ok=false로 전송)
    try:
        _adapter = get_adapter()
        _stats["cartan_ok"] = _adapter.health_check()
        logger.info("Cartan 어댑터 초기화 OK (%s)", _adapter.scenario)
    except NotImplementedError as e:
        logger.warning("Cartan 어댑터 미구현: %s", e)
    except Exception as e:
        logger.error("Cartan 어댑터 오류: %s", e)

    # 종료 시그널
    def _graceful_stop(sig, frame):
        logger.info("종료 신호 수신 (%s)", sig)
        _stop_event.set()

    signal.signal(signal.SIGTERM, _graceful_stop)
    signal.signal(signal.SIGINT,  _graceful_stop)

    # 스레드 시작
    threads = [
        threading.Thread(target=task_heartbeat,    name="heartbeat",    daemon=True),
        threading.Thread(target=task_sync,          name="sync",         daemon=True),
        threading.Thread(target=task_commands,      name="commands",     daemon=True),
        threading.Thread(target=task_update_check,  name="update_check", daemon=True),
    ]
    for t in threads:
        t.start()
        logger.debug("스레드 시작: %s", t.name)

    logger.info("에이전트 실행 중. Ctrl+C로 종료.")
    _stop_event.wait()
    logger.info("에이전트 종료.")


if __name__ == "__main__":
    main()
