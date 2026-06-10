"""
GitHub Releases 기반 자동 업데이트 (v2 — 안정성 강화)

흐름:
  1. GitHub API로 최신 릴리즈 태그 조회
  2. 현재 버전과 비교
  3. 새 버전이면 EXE 다운로드 → 임시 파일 저장
  4. 교체 배치 스크립트 생성 (sc stop → 상태 대기 → 복사 → sc start → 검증)
  5. 배치 분리 실행 → 현재 프로세스 종료

핵심 개선:
  - sc stop 으로 NSSM 자동 재시작 차단 (net stop 대비 명확한 종료)
  - STOPPED/RUNNING 상태 폴링 대기 (race condition 차단)
  - 새 EXE 실행 실패 시 자동 롤백 (.bak 으로 복귀)
  - 모든 단계를 update.log 에 기록
"""
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from . import __version__
from . import config as cfg

logger = logging.getLogger(__name__)

ASSET_NAME = "officetel_agent.exe"
SERVICE_NAME = "OfficetelParkingAgent"

# 단일 인스턴스 보장 — 동시 업데이트 차단
_update_lock = threading.Lock()


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
        sha = hashlib.sha256(data).hexdigest()[:16]
        logger.info("다운로드 완료: %s (%d bytes, sha256=%s)", dest, len(data), sha)
        return True
    except Exception as e:
        logger.error("다운로드 실패: %s", e)
        return False


def _find_asset(release: dict) -> Optional[int]:
    for asset in release.get("assets", []):
        if asset["name"] == ASSET_NAME:
            return asset["id"]
    return None


def _build_update_bat(current_exe: Path, new_exe: Path) -> Path:
    """
    교체 배치 스크립트 생성.
    경로에 공백 포함 ("Program Files") → 모든 경로 큰따옴표 처리.
    """
    install_dir = current_exe.parent
    backup_exe  = install_dir / (current_exe.name + ".bak")
    bat_path    = install_dir / "_opa_update.bat"
    log_path    = install_dir / "logs" / "update.log"
    # logs 디렉토리 보장
    log_path.parent.mkdir(parents=True, exist_ok=True)

    bat_content = f"""@echo off
chcp 65001 >nul
set "LOG={log_path}"
echo. >> "%LOG%"
echo ==================================================== >> "%LOG%"
echo [%date% %time%] Update started (target v{cfg.GITHUB_REPO()}) >> "%LOG%"

:: ────────────────────────────────────────────────────────
:: 1. 서비스 중지 (NSSM 자동 재시작 차단)
:: ────────────────────────────────────────────────────────
echo Stopping service {SERVICE_NAME}... >> "%LOG%"
sc stop {SERVICE_NAME} >> "%LOG%" 2>&1

:: STOPPED 상태 폴링 대기 (최대 30초)
set /a STOP_WAIT=0
:stop_loop
timeout /t 1 /nobreak >nul
sc query {SERVICE_NAME} | findstr /C:"STATE" | findstr /C:"STOPPED" >nul
if not errorlevel 1 goto stopped
set /a STOP_WAIT+=1
if %STOP_WAIT% lss 30 goto stop_loop

:: 30초 후에도 안 멈추면 강제 종료
echo WARN: Service did not stop in 30 sec — forcing taskkill >> "%LOG%"
taskkill /f /im {current_exe.name} >> "%LOG%" 2>&1
timeout /t 2 /nobreak >nul

:stopped
echo [%date% %time%] Service confirmed STOPPED >> "%LOG%"

:: ────────────────────────────────────────────────────────
:: 2. 백업
:: ────────────────────────────────────────────────────────
if exist "{backup_exe}" del /f /q "{backup_exe}" 2>nul
copy /y "{current_exe}" "{backup_exe}" >nul
if errorlevel 1 (
    echo ERROR: Backup creation failed >> "%LOG%"
    goto start_service
)
echo [%date% %time%] Backup created: {backup_exe.name} >> "%LOG%"

:: ────────────────────────────────────────────────────────
:: 3. 교체
:: ────────────────────────────────────────────────────────
copy /y "{new_exe}" "{current_exe}" >nul
if errorlevel 1 (
    echo ERROR: Replace failed — restoring backup >> "%LOG%"
    copy /y "{backup_exe}" "{current_exe}" >nul
    goto start_service
)
echo [%date% %time%] EXE replaced successfully >> "%LOG%"

:start_service
:: ────────────────────────────────────────────────────────
:: 4. 서비스 시작
:: ────────────────────────────────────────────────────────
echo Starting service {SERVICE_NAME}... >> "%LOG%"
sc start {SERVICE_NAME} >> "%LOG%" 2>&1

:: RUNNING 상태 폴링 대기 (최대 15초)
set /a START_WAIT=0
:start_loop
timeout /t 1 /nobreak >nul
sc query {SERVICE_NAME} | findstr /C:"STATE" | findstr /C:"RUNNING" >nul
if not errorlevel 1 goto running
set /a START_WAIT+=1
if %START_WAIT% lss 15 goto start_loop

:: ────────────────────────────────────────────────────────
:: 5. 시작 실패 → 자동 롤백
:: ────────────────────────────────────────────────────────
echo ERROR: Service failed to start in 15 sec — ROLLBACK >> "%LOG%"
sc stop {SERVICE_NAME} >> "%LOG%" 2>&1
timeout /t 3 /nobreak >nul
copy /y "{backup_exe}" "{current_exe}" >nul
echo Rolled back to previous EXE >> "%LOG%"
sc start {SERVICE_NAME} >> "%LOG%" 2>&1
goto cleanup

:running
echo [%date% %time%] ==== Update SUCCESS — service RUNNING ==== >> "%LOG%"

:cleanup
:: ────────────────────────────────────────────────────────
:: 6. 정리
:: ────────────────────────────────────────────────────────
del /f /q "{new_exe}" >nul 2>&1
del /f /q "%~f0"
"""
    bat_path.write_text(bat_content, encoding="cp949")
    return bat_path


def apply_update(new_exe: Path) -> None:
    current_exe = Path(sys.executable)
    bat_path    = _build_update_bat(current_exe, new_exe)

    # 분리 프로세스로 BAT 실행 — 부모 종료해도 계속 실행됨
    subprocess.Popen(
        f'cmd /c ""{bat_path}""',
        shell=True,
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    logger.info("업데이터 배치 실행됨 — 1초 후 프로세스 종료 (BAT이 sc stop/start 수행)")
    # BAT이 sc stop 으로 자기 자신을 막 정지시키기 전에 살짝 대기
    time.sleep(1)
    os._exit(0)


def check_and_update() -> bool:
    """
    업데이트 확인 + 적용.
    return: 새 버전 적용 시작 시 True (이 경우 함수는 반환되지 않음 — 프로세스 종료),
            업데이트 없음 또는 실패 시 False.
    """
    if not _update_lock.acquire(blocking=False):
        logger.debug("이미 업데이트 진행 중 — 스킵")
        return False
    try:
        release = get_latest_release()
        if not release:
            return False

        tag = release.get("tag_name", "")
        if not is_newer(tag):
            logger.debug("최신 버전입니다 (현재=%s, 최신=%s)", __version__, tag)
            return False

        logger.info("새 버전 발견: %s → %s", __version__, tag)
        asset_id = _find_asset(release)
        if not asset_id:
            logger.warning("릴리즈에 %s 없음", ASSET_NAME)
            return False

        tmp = Path(tempfile.mkdtemp()) / ASSET_NAME
        if not _download_asset(asset_id, tmp):
            logger.error("업데이트 다운로드 실패 — 현재 버전 유지")
            return False

        apply_update(tmp)  # 이 함수는 반환되지 않음 (os._exit)
        return True
    finally:
        _update_lock.release()
