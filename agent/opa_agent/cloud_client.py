"""
클라우드 API 통신 클라이언트
Next.js API Routes (/api/agent/*) 와 통신
"""
import json
import logging
import socket
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Optional

from . import __version__
from . import config as cfg

logger = logging.getLogger(__name__)


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg.AGENT_TOKEN()}",
        "X-Agent-Version": __version__,
    }


def _request(method: str, path: str, body: Any = None, timeout: int = 15) -> Optional[dict]:
    url = cfg.CLOUD_API_BASE().rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        logger.warning("%s %s → HTTP %d", method, path, e.code)
        return None
    except Exception as e:
        logger.warning("%s %s 실패: %s", method, path, e)
        return None


# ── Heartbeat ─────────────────────────────────────────────
@dataclass
class HeartbeatPayload:
    agent_version: str
    cartan_ok: bool
    camera_ok: bool
    last_sync_success: Optional[str]  # ISO 8601
    queue_processed: int
    error_count: int
    hostname: str


def send_heartbeat(
    cartan_ok: bool,
    camera_ok: bool = True,  # 카메라 미사용 환경 — 기본 True (오탐 방지)
    last_sync: Optional[datetime] = None,
    queue_processed: int = 0,
    error_count: int = 0,
) -> bool:
    payload = HeartbeatPayload(
        agent_version=__version__,
        cartan_ok=cartan_ok,
        camera_ok=camera_ok,
        last_sync_success=last_sync.isoformat() if last_sync else None,
        queue_processed=queue_processed,
        error_count=error_count,
        hostname=socket.gethostname(),
    )
    result = _request("POST", "/api/agent/heartbeat", asdict(payload))
    return result is not None


# ── Sync Queue ────────────────────────────────────────────
def get_sync_queue() -> list[dict]:
    result = _request("GET", "/api/agent/sync-queue")
    return result.get("items", []) if result else []


def ack_queue_item(queue_id: str, success: bool, error: Optional[str] = None) -> None:
    _request("POST", f"/api/agent/ack/{queue_id}", {
        "success": success,
        "error": error,
    })


# ── Remote Commands ───────────────────────────────────────
def get_pending_commands() -> list[dict]:
    result = _request("GET", "/api/agent/commands")
    return result.get("commands", []) if result else []


def ack_command(cmd_id: str, result_msg: str) -> None:
    _request("POST", f"/api/agent/command-ack/{cmd_id}", {"result": result_msg})


# ── Version check ─────────────────────────────────────────
def get_latest_version() -> Optional[dict]:
    return _request("GET", "/api/agent/version")
