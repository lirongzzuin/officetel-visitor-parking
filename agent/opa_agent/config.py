"""
설정 관리 — 환경변수 우선, config.json 폴백
"""
import json
import os
from pathlib import Path

# 설치 경로
if os.name == "nt":
    BASE_DIR = Path("C:/Program Files/OfficetelParking")
else:
    BASE_DIR = Path.home() / ".officetel"

CONFIG_PATH = BASE_DIR / "config.json"
LOG_DIR     = BASE_DIR / "logs"

def _load_file() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text("utf-8"))
    return {}

def get(key: str, default: str = "") -> str:
    return os.environ.get(key) or _load_file().get(key, default)

# ── 클라우드 ──────────────────────────────────────────────
CLOUD_API_BASE       = lambda: get("CLOUD_API_BASE", "https://your-app.vercel.app")
AGENT_TOKEN          = lambda: get("AGENT_TOKEN", "")
CLOUD_POLL_SEC       = lambda: int(get("CLOUD_POLL_SEC", "60"))
HEARTBEAT_SEC        = lambda: int(get("HEARTBEAT_SEC", "60"))
UPDATE_CHECK_SEC     = lambda: int(get("UPDATE_CHECK_SEC", "3600"))

# ── Cartan 어댑터 ─────────────────────────────────────────
CARTAN_SCENARIO      = lambda: get("CARTAN_SCENARIO", "S1")
CARTAN_DRY_RUN       = lambda: get("CARTAN_DRY_RUN", "true").lower() == "true"
CARTAN_DB_PATH       = lambda: get("CARTAN_DB_PATH", "")
CARTAN_VISITOR_TABLE = lambda: get("CARTAN_VISITOR_TABLE", "")
CARTAN_PLATE_COL     = lambda: get("CARTAN_PLATE_COL", "")
CARTAN_UNIT_COL      = lambda: get("CARTAN_UNIT_COL", "")
CARTAN_VALID_FROM    = lambda: get("CARTAN_VALID_FROM", "")
CARTAN_VALID_UNTIL   = lambda: get("CARTAN_VALID_UNTIL", "")

# ── GitHub Releases 자동 업데이트 ─────────────────────────
GITHUB_REPO          = lambda: get("GITHUB_REPO", "lirongzzuin/officetel-visitor-parking")
GITHUB_TOKEN         = lambda: get("GITHUB_TOKEN", "")  # 비공개 repo면 필요

# ── 로깅 ─────────────────────────────────────────────────
LOG_LEVEL            = lambda: get("LOG_LEVEL", "INFO")

def write_config(data: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = _load_file()
    existing.update(data)
    CONFIG_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), "utf-8")
