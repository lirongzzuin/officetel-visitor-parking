"""
GitHub Releases 기반 자동 업데이트

흐름:
  1. GitHub API로 최신 릴리즈 태그 조회
  2. 현재 버전과 비교
  3. 새 버전이면 EXE 다운로드 → 임시 파일 저장
  4. 교체 배치 스크립트 생성 → 실행 후 프로세스 종료
  5. NSSM이 서비스 재시작 → 새 EXE로 기동

Windows 파일 잠금 우회:
  실행 중인 EXE는 직접 덮어쓸 수 없으므로
  cmd 배치 스크립트를 분리 프로세스로 실행한 뒤 현재 프로세스 종료.
"""
import hashlib
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional

import urllib.error
import json

from . import __version__
from . import config as cfg

logger = logging.getLogger(__name__)

ASSET_NAME = "officetel_agent.exe"


def _github_headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = cfg.GITHUB_TOKEN()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def get_latest_release() -> Optional[dict]:
    url = f"https://api.github.com/repos/{cfg.GITHUB_REPO()}/releases/latest"
    req = urllib.request.Request(url, headers=_github_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.warning("업데이트 확인 실패: %s", e)
        return None


def _tag_to_semver(tag: str) -> tuple[int, ...]:
    return tuple(int(x) for x in tag.lstrip("v").split(".") if x.isdigit())


def is_newer(tag: str) -> bool:
    try:
        return _tag_to_semver(tag) > _tag_to_semver(__version__)
    except Exception:
        return False


def _download_asset(asset_id: int, dest: Path) -> bool:
    """GitHub release asset 다운로드 — private 레포 대응 (API URL + octet-stream)"""
    url = f"https://api.github.com/repos/{cfg.GITHUB_REPO()}/releases/assets/{asset_id}"
    headers = _github_headers()
    headers["Accept"] = "application/octet-stream"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        dest.write_bytes(data)
        logger.info("다운로드 완료: %s (%d bytes)", dest, len(data))
        return True
    except Exception as e:
        logger.error("다운로드 실패: %s", e)
        return False


def _find_asset(release: dict) -> Optional[int]:
    """ASSET_NAME 일치하는 asset_id 반환"""
    for asset in release.get("assets", []):
        if asset["name"] == ASSET_NAME:
            return asset["id"]
    return None


def apply_update(new_exe: Path) -> None:
    """
    배치 스크립트를 생성해 분리 프로세스로 실행 후 현재 프로세스 종료.
    NSSM이 서비스를 재시작하면 새 EXE가 기동된다.
    """
    current_exe = Path(sys.executable)
    backup_exe  = current_exe.with_suffix(".bak")
    bat_path    = current_exe.parent / "_opa_update.bat"

    bat = f"""@echo off
chcp 65001 >nul
echo 업데이트 적용 중...
timeout /t 3 /nobreak >nul
if exist "{backup_exe}" del /f /q "{backup_exe}"
copy /y "{current_exe}" "{backup_exe}" >nul
copy /y "{new_exe}" "{current_exe}" >nul
if errorlevel 1 (
    echo 복사 실패 — 롤백
    copy /y "{backup_exe}" "{current_exe}" >nul
    goto :done
)
echo 업데이트 성공. 서비스 재시작...
net stop OfficetelParkingAgent >nul 2>&1
net start OfficetelParkingAgent >nul 2>&1
:done
del /f /q "{new_exe}" >nul 2>&1
del /f /q "%~f0"
"""
    bat_path.write_text(bat, encoding="cp949")
    subprocess.Popen(
        f'cmd /c "{bat_path}"',
        shell=True,
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    logger.info("업데이터 배치 실행 완료. 프로세스 종료 (NSSM이 재시작).")
    os._exit(0)


def check_and_update() -> None:
    release = get_latest_release()
    if not release:
        return

    tag = release.get("tag_name", "")
    if not is_newer(tag):
        logger.debug("최신 버전입니다 (현재=%s, 최신=%s)", __version__, tag)
        return

    logger.info("새 버전 발견: %s → %s", __version__, tag)
    asset_id = _find_asset(release)
    if not asset_id:
        logger.warning("릴리즈에 %s 없음", ASSET_NAME)
        return

    tmp = Path(tempfile.mkdtemp()) / ASSET_NAME
    if _download_asset(asset_id, tmp):
        apply_update(tmp)
    else:
        logger.error("업데이트 다운로드 실패 — 현재 버전 유지")
