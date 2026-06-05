"""
탄탄코어 Cartan800 DB 탐침 v1.0
더블클릭으로 실행 → 바탕화면에 보고서 저장

의존성: Python 표준 라이브러리만 사용 (sqlite3 내장)
빌드: pyinstaller --onefile probe.py --name cartan_probe
"""

import os
import sys
import time
import json
import socket
import sqlite3
import struct
import ctypes
import shutil
import platform
import subprocess
import threading
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── 보고서 경로 ───────────────────────────────────────────────
DESKTOP = Path.home() / "Desktop"
REPORT_PATH = DESKTOP / f"cartan_probe_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

lines: list[str] = []

def log(text: str = "") -> None:
    print(text)
    lines.append(text)

def sep(char: str = "=", n: int = 64) -> None:
    log(char * n)

def write_report() -> None:
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")

# ── 유틸 ─────────────────────────────────────────────────────
def run(cmd: str, timeout: int = 10) -> str:
    try:
        r = subprocess.run(
            cmd, shell=True, capture_output=True,
            text=True, timeout=timeout, encoding="cp949", errors="replace"
        )
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"(실행 오류: {e})"

def probe_port(ip: str, port: int, timeout: float = 0.15) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except:
        return False

def bytes_fmt(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

# ════════════════════════════════════════════════════════════
# 1. 시스템 정보
# ════════════════════════════════════════════════════════════
def section_system() -> None:
    sep()
    log(f"  탄탄코어 Cartan800 DB 탐침 보고서")
    log(f"  생성: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"  PC명: {platform.node()}  /  사용자: {os.environ.get('USERNAME','?')}")
    sep()
    log("")
    log("[1/7] 시스템 정보")
    sep("-")

    log(f"OS      : {platform.platform()}")
    log(f"아키텍처: {platform.machine()}")
    log(f"Python  : {sys.version.split()[0]}  (EXE 내장)")

    # 디스크
    for d in "CDEFGH":
        try:
            usage = shutil.disk_usage(f"{d}:\\")
            free  = bytes_fmt(usage.free)
            total = bytes_fmt(usage.total)
            log(f"디스크  : {d}:\\  여유 {free} / 전체 {total}")
        except:
            pass

# ════════════════════════════════════════════════════════════
# 2. 실행 프로세스 탐지
# ════════════════════════════════════════════════════════════
def section_processes() -> None:
    log("")
    log("[2/7] 실행 중인 프로세스")
    sep("-")

    raw = run("tasklist /v /fo csv")
    kw = ("cartan","tantan","parking","주차","barrier","gate","lprs","anpr")

    log("  [Cartan / 주차 관련 프로세스]")
    found = False
    for line in raw.splitlines()[1:]:  # 헤더 제거
        lower = line.lower()
        if any(k in lower for k in kw):
            parts = [p.strip('"') for p in line.split('","')]
            if parts:
                log(f"  ✅  {parts[0]}  (PID {parts[1] if len(parts)>1 else '?'})")
                found = True
    if not found:
        log("  (발견 없음 — Cartan이 실행 중이지 않거나 이름이 다를 수 있습니다)")

    log("")
    log("  [전체 프로세스 목록]")
    for line in raw.splitlines()[1:]:
        parts = [p.strip('"') for p in line.split('","')]
        name = parts[0] if parts else ""
        pid  = parts[1] if len(parts)>1 else ""
        title= parts[8] if len(parts)>8 else ""
        if title and title != "N/A":
            log(f"    {name:<35} PID:{pid:<7} 창: {title}")

# ════════════════════════════════════════════════════════════
# 3. 설치 폴더 탐색
# ════════════════════════════════════════════════════════════
def section_install_dirs() -> None:
    log("")
    log("[3/7] 주차 관련 설치 폴더 탐색")
    sep("-")

    kw = ["cartan","tantan","parking","barrier","gate","lprs","anpr","주차"]
    bases = [
        Path("C:/Program Files"),
        Path("C:/Program Files (x86)"),
        Path("C:/ProgramData"),
        Path("C:/"),
        Path("D:/"),
    ]
    found_any = False
    for base in bases:
        if not base.exists():
            continue
        try:
            for item in base.iterdir():
                if any(k in item.name.lower() for k in kw):
                    log(f"  📁  {item}")
                    found_any = True
                    try:
                        for child in item.rglob("*"):
                            if child.suffix.lower() in (".exe",".dll",".db",".sqlite",
                                                        ".mdb",".ini",".cfg",".json",".xml"):
                                sz = bytes_fmt(child.stat().st_size)
                                log(f"       {child}  [{sz}]")
                    except:
                        pass
        except:
            pass
    if not found_any:
        log("  (설치 폴더 발견 없음)")

# ════════════════════════════════════════════════════════════
# 4. DB 파일 전체 탐색
# ════════════════════════════════════════════════════════════
SKIP_DIRS = {
    "windows", "winsxs", "system32", "syswow64",
    "node_modules", ".git", "google", "chrome",
    "microsoft", "appdata",
}
DB_EXTS = {".db", ".sqlite", ".sqlite3", ".s3db", ".mdb", ".accdb"}

def _walk_drive(drive: str) -> list[Path]:
    result: list[Path] = []
    base = Path(f"{drive}:\\")
    if not base.exists():
        return result
    try:
        for root, dirs, files in os.walk(base):
            root_p = Path(root)
            # 스킵할 폴더 제거 (in-place)
            dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS]
            for f in files:
                if Path(f).suffix.lower() in DB_EXTS:
                    fp = root_p / f
                    try:
                        if fp.stat().st_size > 512:
                            result.append(fp)
                    except:
                        pass
    except:
        pass
    return result

def section_db_files() -> list[Path]:
    log("")
    log("[4/7] 데이터베이스 파일 탐색")
    sep("-")
    log("  탐색 중... (시간이 걸릴 수 있습니다)")

    all_dbs: list[Path] = []
    for drive in "CDEFGH":
        dbs = _walk_drive(drive)
        all_dbs.extend(dbs)

    if not all_dbs:
        log("  (DB 파일 없음)")
    else:
        for p in sorted(all_dbs, key=lambda x: x.stat().st_size, reverse=True):
            sz  = bytes_fmt(p.stat().st_size)
            mod = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            log(f"  [DB] {p}")
            log(f"       크기: {sz}  /  수정: {mod}")

    return all_dbs

# ════════════════════════════════════════════════════════════
# 5. SQLite 스키마 분석 (Python 내장 sqlite3 사용)
# ════════════════════════════════════════════════════════════
def _probe_sqlite(path: Path) -> None:
    log(f"\n  ┌─ {path}")
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
        con.row_factory = sqlite3.Row
        cur = con.cursor()

        tables = [r[0] for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()]
        log(f"  │  테이블 수: {len(tables)}")
        log(f"  │  테이블 목록: {', '.join(tables)}")

        for tbl in tables:
            log(f"  │")
            log(f"  │  [테이블: {tbl}]")

            # 컬럼 정보
            cols = cur.execute(f'PRAGMA table_info("{tbl}")').fetchall()
            for c in cols:
                pk = " ★PK" if c["pk"] else ""
                nn = " NOT NULL" if c["notnull"] else ""
                log(f"  │    {c['name']:<25} {c['type']}{nn}{pk}")

            # 행 수
            cnt = cur.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
            log(f"  │    행 수: {cnt:,}")

            # 최근 3행 (rowid 역순)
            try:
                rows = cur.execute(
                    f'SELECT * FROM "{tbl}" ORDER BY rowid DESC LIMIT 3'
                ).fetchall()
                if rows:
                    col_names = [c["name"] for c in cols]
                    log(f"  │    최근 3행 (컬럼: {', '.join(col_names)})")
                    for row in rows:
                        log(f"  │      {tuple(row)}")
            except Exception as e:
                log(f"  │    (샘플 조회 오류: {e})")

        con.close()
    except sqlite3.DatabaseError:
        log(f"  │  ⚠  SQLite가 아닌 파일이거나 암호화됨")
    except Exception as e:
        log(f"  │  ⚠  오류: {e}")
    log(f"  └─ 완료")


def section_sqlite_schema(all_dbs: list[Path]) -> None:
    log("")
    log("[5/7] SQLite 스키마 자동 분석 (Python 내장 sqlite3)")
    sep("-")

    sqlite_dbs = [p for p in all_dbs if p.suffix.lower() in {".db",".sqlite",".sqlite3",".s3db"}]
    if not sqlite_dbs:
        log("  SQLite 파일 없음 — MS Access 또는 다른 형식일 수 있습니다")
        log("  MS Access(.mdb/.accdb) 파일이 있다면 파일명과 경로를 메모해 주세요")
        return

    for p in sqlite_dbs:
        _probe_sqlite(p)

# ════════════════════════════════════════════════════════════
# 6. 네트워크 & 카메라 탐지
# ════════════════════════════════════════════════════════════
def _get_local_subnet() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ".".join(ip.split(".")[:3])
    except:
        return None

def section_network() -> None:
    log("")
    log("[6/7] 네트워크 & 카메라 탐지")
    sep("-")

    log("  [IP 및 게이트웨이]")
    log(run("ipconfig /all"))

    log("")
    log("  [ARP 테이블 — 연결된 장비 목록]")
    log(run("arp -a"))

    subnet = _get_local_subnet()
    if not subnet:
        log("  (서브넷 탐지 실패)")
        return

    log(f"\n  [포트 스캔: {subnet}.1 ~ .254]")
    log(f"  대상 포트: 554(RTSP), 80, 8080, 8888, 37777(Dahua NVR)")
    log("  (약 20~40초 소요)")

    target_ports = [554, 80, 8080, 8888, 37777]
    open_hosts: dict[str, list[int]] = {}

    def scan(ip: str, port: int) -> tuple[str, int, bool]:
        return ip, port, probe_port(ip, port, timeout=0.12)

    tasks = [(f"{subnet}.{i}", p) for i in range(1, 255) for p in target_ports]
    with ThreadPoolExecutor(max_workers=100) as ex:
        futs = {ex.submit(scan, ip, port): (ip, port) for ip, port in tasks}
        for fut in as_completed(futs):
            ip, port, ok = fut.result()
            if ok:
                open_hosts.setdefault(ip, []).append(port)

    if open_hosts:
        for ip, ports in sorted(open_hosts.items()):
            pstr = ", ".join(map(str, sorted(ports)))
            flag = " ← RTSP 카메라 가능성!" if 554 in ports else ""
            flag += " ← NVR 가능성!" if 37777 in ports else ""
            log(f"  ✅  {ip:<18} 열린 포트: {pstr}{flag}")
    else:
        log("  (열린 포트 없음 — 카메라가 다른 네트워크에 있을 수 있습니다)")

# ════════════════════════════════════════════════════════════
# 7. Cartan 프로세스 오픈 파일
# ════════════════════════════════════════════════════════════
def section_open_files() -> None:
    log("")
    log("[7/7] Cartan 프로세스 오픈 파일")
    sep("-")

    # wmic으로 cartan 실행파일 경로 확인
    raw = run('wmic process where "name like \'%cartan%\' or name like \'%tantan%\'" '
              'get ProcessId,ExecutablePath,CommandLine /format:list')
    if raw.strip():
        log("  Cartan 프로세스 정보:")
        log(raw)
    else:
        log("  (Cartan 프로세스가 현재 실행되지 않음)")
        log("  → Cartan을 실행한 뒤 이 프로그램을 다시 실행하면 더 많은 정보를 얻을 수 있습니다")

    # handle64.exe가 같은 폴더에 있으면 오픈 파일도 분석
    handle_exe = Path(sys.executable).parent / "handle64.exe"
    if getattr(sys, "frozen", False):
        handle_exe = Path(sys.executable).parent / "handle64.exe"
    else:
        handle_exe = Path(__file__).parent / "handle64.exe"

    if handle_exe.exists():
        log("\n  [handle64.exe로 오픈 파일 분석]")
        pids_raw = run('wmic process where "name like \'%cartan%\'" get ProcessId /value')
        for line in pids_raw.splitlines():
            if "ProcessId=" in line:
                pid = line.split("=")[1].strip()
                if pid:
                    result = run(f'"{handle_exe}" -p {pid} -nobanner', timeout=15)
                    for l in result.splitlines():
                        if any(ext in l.lower() for ext in [".db", ".sqlite", ".mdb", ".dat", ".bin"]):
                            log(f"    {l}")
    else:
        log("\n  (handle64.exe 없음 — Sysinternals handle64.exe를 같은 폴더에 넣으면 상세 분석 가능)")

# ════════════════════════════════════════════════════════════
# 메인
# ════════════════════════════════════════════════════════════
def main() -> None:
    print("탄탄코어 Cartan800 DB 탐침 시작...")
    print(f"보고서: {REPORT_PATH}\n")

    section_system()
    section_processes()
    section_install_dirs()
    all_dbs = section_db_files()
    section_sqlite_schema(all_dbs)
    section_network()
    section_open_files()

    sep()
    log("")
    log("  ✅  탐침 완료!")
    log(f"  보고서 저장됨: {REPORT_PATH}")
    log("")
    log("  공유 방법: 카카오톡 / 이메일 / USB 복사")
    sep()

    write_report()

    # Windows: 메모장으로 자동 열기
    if sys.platform == "win32":
        os.startfile(str(REPORT_PATH))

    print(f"\n완료! 보고서: {REPORT_PATH}")
    if sys.platform == "win32":
        input("\n엔터를 누르면 창이 닫힙니다...")

if __name__ == "__main__":
    main()
