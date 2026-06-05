"""
탄탄코어 Cartan800 DB 탐침 v2.0
더블클릭 실행 → 바탕화면에 보고서 저장 + 메모장 자동 열기

수집 정보:
  [1] 시스템 정보 (OS, 디스크, Python)
  [2] Cartan 관련 프로세스
  [3] Windows 레지스트리 (설치 경로 자동 탐지)
  [4] 설치 폴더 및 설정 파일 내용
  [5] 데이터베이스 파일 전체 탐색
  [6] SQLite 스키마 + 샘플 데이터 (기존 데이터로 형식 파악 — 등록 테스트 불필요)
  [7] DB 동시 접근 테스트 (Cartan 실행 중 읽기/쓰기 가능한지 — ROLLBACK으로 안전)
  [8] 네트워크 & 카메라 포트 스캔
  [9] Cartan 프로세스 오픈 파일

의존성: Python 표준 라이브러리만 사용 (sqlite3 내장)
빌드: pyinstaller --onefile probe.py --name cartan_probe
"""

import json
import logging
import os
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import winreg
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# ── 보고서 경로 ───────────────────────────────────────────
DESKTOP = Path.home() / "Desktop"
REPORT_PATH = DESKTOP / f"cartan_probe_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
_fp = None  # 파일 핸들 (incremental write)

def _open_report():
    global _fp
    _fp = open(REPORT_PATH, "w", encoding="utf-8")

def log(text: str = "") -> None:
    print(text)
    if _fp:
        _fp.write(text + "\n")
        _fp.flush()

def close_report():
    if _fp:
        _fp.close()

def sep(char: str = "=", n: int = 64) -> None:
    log(char * n)

def run(cmd: str, timeout: int = 10) -> str:
    try:
        r = subprocess.run(
            cmd, shell=True, capture_output=True,
            text=True, timeout=timeout, encoding="cp949", errors="replace",
        )
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"(실행 오류: {e})"

def bytes_fmt(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

def probe_port(ip: str, port: int, timeout: float = 0.12) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except:
        return False

# ════════════════════════════════════════════════════════════
# 1. 시스템 정보
# ════════════════════════════════════════════════════════════
def section_system() -> None:
    sep()
    log("  탄탄코어 Cartan800 DB 탐침 보고서 v2.0")
    log(f"  생성: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"  PC명: {os.environ.get('COMPUTERNAME','?')}  /  사용자: {os.environ.get('USERNAME','?')}")
    sep()
    log("")
    log("[1/9] 시스템 정보")
    sep("-")

    log(run("ver"))  # Windows 버전
    log("")
    log(run("systeminfo | findstr /C:\"OS Name\" /C:\"OS Version\" /C:\"Total Physical Memory\""))

    for d in "CDEFGH":
        try:
            usage = shutil.disk_usage(f"{d}:\\")
            log(f"디스크 {d}:\\  여유 {bytes_fmt(usage.free)} / 전체 {bytes_fmt(usage.total)}")
        except:
            pass

# ════════════════════════════════════════════════════════════
# 2. 실행 프로세스
# ════════════════════════════════════════════════════════════
def section_processes() -> list[int]:
    log("")
    log("[2/9] 실행 중인 프로세스")
    sep("-")

    raw = run("tasklist /v /fo csv")
    kw = ("cartan", "tantan", "parking", "주차", "barrier", "gate", "lprs", "anpr")
    cartan_pids = []

    log("  [Cartan / 주차 관련 프로세스]")
    found = False
    for line in raw.splitlines()[1:]:
        lower = line.lower()
        if any(k in lower for k in kw):
            parts = [p.strip('"') for p in line.split('","')]
            pid_str = parts[1] if len(parts) > 1 else ""
            log(f"  ✅  {parts[0]}  (PID {pid_str})")
            try:
                cartan_pids.append(int(pid_str.replace(",", "")))
            except:
                pass
            found = True

    if not found:
        log("  (발견 없음 — Cartan이 현재 실행되지 않거나 이름이 다를 수 있음)")

    log("")
    log("  [창이 있는 모든 프로세스]")
    for line in raw.splitlines()[1:]:
        parts = [p.strip('"') for p in line.split('","')]
        title = parts[8] if len(parts) > 8 else ""
        if title and title not in ("N/A", ""):
            log(f"    {parts[0]:<35} 창: {title}")

    return cartan_pids

# ════════════════════════════════════════════════════════════
# 3. Windows 레지스트리 탐색
# ════════════════════════════════════════════════════════════
def _query_reg(hive, path: str) -> dict:
    result = {}
    try:
        key = winreg.OpenKey(hive, path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
        i = 0
        while True:
            try:
                name, data, _ = winreg.EnumValue(key, i)
                result[name] = data
                i += 1
            except OSError:
                break
        winreg.CloseKey(key)
    except:
        pass
    return result

def section_registry() -> list[str]:
    log("")
    log("[3/9] Windows 레지스트리 탐색 (설치 경로 자동 탐지)")
    sep("-")

    kw = ["cartan", "tantan", "parking", "주차", "barrier", "gate"]
    found_paths = []

    # 탐색할 레지스트리 경로
    search_roots = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\TantanCore"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\TantanCore"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Cartan"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Cartan"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\TantanCore"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Cartan"),
    ]

    # Uninstall 키에서 키워드 검색
    for hive, suffix in (
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ):
        try:
            key = winreg.OpenKey(hive, suffix, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
            i = 0
            while True:
                try:
                    sub_name = winreg.EnumKey(key, i)
                    i += 1
                    if any(k in sub_name.lower() for k in kw):
                        sub_key = winreg.OpenKey(key, sub_name, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
                        vals = {}
                        j = 0
                        while True:
                            try:
                                n, d, _ = winreg.EnumValue(sub_key, j)
                                vals[n] = d
                                j += 1
                            except:
                                break
                        log(f"  ✅  Uninstall 키: {sub_name}")
                        for vk, vv in vals.items():
                            log(f"       {vk}: {vv}")
                        if "InstallLocation" in vals:
                            found_paths.append(vals["InstallLocation"])
                        winreg.CloseKey(sub_key)
                except OSError:
                    break
            winreg.CloseKey(key)
        except:
            pass

    for hive, path in search_roots:
        vals = _query_reg(hive, path)
        if vals:
            log(f"  ✅  레지스트리: {path}")
            for k, v in vals.items():
                log(f"       {k}: {v}")
            if "InstallPath" in vals:
                found_paths.append(vals["InstallPath"])
            if "DBPath" in vals:
                found_paths.append(vals["DBPath"])

    if not found_paths:
        log("  (레지스트리에서 Cartan 관련 항목 없음 — 파일 탐색으로 진행)")

    return found_paths

# ════════════════════════════════════════════════════════════
# 4. 설치 폴더 및 설정 파일 내용
# ════════════════════════════════════════════════════════════
CONFIG_EXTS = {".ini", ".json", ".xml", ".cfg", ".conf", ".txt", ".toml"}
DB_EXTS     = {".db", ".sqlite", ".sqlite3", ".s3db", ".mdb", ".accdb"}
SKIP_DIRS   = {
    "windows", "winsxs", "system32", "syswow64",
    "node_modules", ".git", "chrome", "google",
    "microsoft", "edge", "mozilla", "temp", "tmp",
}

def _read_file_safe(path: Path, max_bytes: int = 4000) -> str:
    try:
        data = path.read_bytes()[:max_bytes]
        for enc in ("utf-8", "cp949", "latin-1"):
            try:
                return data.decode(enc)
            except:
                pass
    except:
        pass
    return "(읽기 실패)"

def section_install_dirs(reg_paths: list[str]) -> list[Path]:
    log("")
    log("[4/9] 설치 폴더 탐색 + 설정 파일 내용")
    sep("-")

    kw = ["cartan", "tantan", "parking", "barrier", "gate", "lprs", "주차"]
    bases = [
        Path("C:/Program Files"),
        Path("C:/Program Files (x86)"),
        Path("C:/ProgramData"),
        Path("D:/"),
    ] + [Path(p) for p in reg_paths if p]

    all_dbs: list[Path] = []

    def process_dir(d: Path) -> None:
        log(f"\n  📁  {d}")
        for item in sorted(d.rglob("*")):
            try:
                if item.is_file():
                    sz = bytes_fmt(item.stat().st_size)
                    log(f"       {item}  [{sz}]")
                    if item.suffix.lower() in DB_EXTS and item.stat().st_size > 512:
                        all_dbs.append(item)
                    if item.suffix.lower() in CONFIG_EXTS and item.stat().st_size < 200_000:
                        content = _read_file_safe(item)
                        log(f"\n       ── {item.name} 내용 ──")
                        for cline in content.splitlines()[:50]:
                            log(f"       {cline}")
                        log("")
            except:
                pass

    processed: set[Path] = set()

    def maybe_process(d: Path) -> None:
        try:
            resolved = d.resolve()
        except:
            resolved = d
        if resolved in processed or not d.is_dir():
            return
        processed.add(resolved)
        process_dir(d)

    # 레지스트리에서 얻은 경로는 직접 처리 (Cartan 폴더 자체)
    for rp in reg_paths:
        if rp:
            maybe_process(Path(rp))

    # 일반 설치 경로 하위에서 키워드 일치 폴더 탐색
    for base in bases:
        if not base.exists():
            continue
        try:
            for item in base.iterdir():
                if item.is_dir() and any(k in item.name.lower() for k in kw):
                    maybe_process(item)
        except:
            pass

    return all_dbs

# ════════════════════════════════════════════════════════════
# 5. DB 파일 전체 탐색 (설치 폴더에서 못 찾은 경우 보완)
# ════════════════════════════════════════════════════════════
def section_db_scan(known_dbs: list[Path]) -> list[Path]:
    log("")
    log("[5/9] 데이터베이스 파일 전체 탐색")
    sep("-")
    log("  탐색 중...")

    found: list[Path] = list(known_dbs)
    known_set = {p.resolve() for p in known_dbs}

    for drive in "CDEFGH":
        base = Path(f"{drive}:\\")
        if not base.exists():
            continue
        for root, dirs, files in os.walk(base, topdown=True):
            dirs[:] = [
                d for d in dirs
                if d.lower() not in SKIP_DIRS and not d.startswith("$")
            ]
            for f in files:
                if Path(f).suffix.lower() in DB_EXTS:
                    fp = Path(root) / f
                    try:
                        if fp.stat().st_size > 512 and fp.resolve() not in known_set:
                            found.append(fp)
                            known_set.add(fp.resolve())
                    except:
                        pass

    for p in found:
        try:
            sz  = bytes_fmt(p.stat().st_size)
            mod = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            log(f"  [DB] {p}  ({sz}, 수정: {mod})")
        except:
            pass

    if not found:
        log("  (DB 파일을 찾지 못했습니다)")
    return found

# ════════════════════════════════════════════════════════════
# 6. SQLite 스키마 + 샘플 데이터
#    기존 등록 데이터로 형식 파악 → Cartan 등록 테스트 불필요
# ════════════════════════════════════════════════════════════
def _probe_sqlite_schema(path: Path) -> list[str]:
    """테이블 목록 반환 (읽기 전용 연결)"""
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
        con.row_factory = sqlite3.Row
        tables = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()]
        con.close()
        return tables
    except:
        return []

def section_sqlite_schema(all_dbs: list[Path]) -> list[Path]:
    log("")
    log("[6/9] SQLite 스키마 + 샘플 데이터")
    log("      (기존 데이터를 분석하므로 Cartan에서 등록 테스트 불필요)")
    sep("-")

    sqlite_dbs = [p for p in all_dbs if p.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".s3db"}]
    if not sqlite_dbs:
        log("  SQLite 파일 없음 — MS Access(.mdb/.accdb) 파일이 있으면 파일명과 경로를 메모하세요")
        return []

    parking_dbs: list[Path] = []
    for path in sqlite_dbs:
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

            is_parking_db = False
            kw = ["visitor", "guest", "car", "plate", "barrier", "visit", "방문", "주차", "차량"]

            for tbl in tables:
                cols = cur.execute(f'PRAGMA table_info("{tbl}")').fetchall()
                col_names = [c["name"].lower() for c in cols]

                # 주차 관련 테이블인지 판별
                if any(k in tbl.lower() for k in kw) or any(
                    any(k in c for k in ["plate", "car", "visitor", "unit", "dong", "ho", "valid"])
                    for c in col_names
                ):
                    is_parking_db = True
                    log(f"  │")
                    log(f"  │  ★ [주차 관련 테이블: {tbl}]")
                else:
                    log(f"  │")
                    log(f"  │  [테이블: {tbl}]")

                # 컬럼 상세
                for c in cols:
                    pk = " ★PK" if c["pk"] else ""
                    nn = " NOT NULL" if c["notnull"] else ""
                    log(f"  │    {c['name']:<30} {c['type']}{nn}{pk}")

                # 행 수
                cnt = cur.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
                log(f"  │    행 수: {cnt:,}")

                # 최근 5행 (날짜·차량번호 형식 파악용)
                if cnt > 0:
                    try:
                        rows = cur.execute(
                            f'SELECT * FROM "{tbl}" ORDER BY rowid DESC LIMIT 5'
                        ).fetchall()
                        col_display = [c["name"] for c in cols]
                        log(f"  │    최근 5행 ← 날짜/차량번호 형식 파악용")
                        log(f"  │    컬럼: {', '.join(col_display)}")
                        for row in rows:
                            log(f"  │      {tuple(row)}")
                    except Exception as e:
                        log(f"  │    (샘플 조회 오류: {e})")

            if is_parking_db:
                parking_dbs.append(path)
            con.close()

        except sqlite3.DatabaseError:
            log(f"  │  ⚠  SQLite가 아닌 파일이거나 암호화됨 (Access 또는 독점 형식)")
        except Exception as e:
            log(f"  │  ⚠  오류: {e}")
        log(f"  └─ 완료")

    return parking_dbs

# ════════════════════════════════════════════════════════════
# 7. DB 동시 접근 테스트
#    Cartan 실행 중에도 우리 에이전트가 읽고 쓸 수 있는지 확인
#    ★ 실제 데이터 변경 없음 — 모든 쓰기는 ROLLBACK으로 취소
# ════════════════════════════════════════════════════════════
def _test_db_access(path: Path) -> dict:
    result = {"path": str(path), "read_ok": False, "write_ok": False, "wal_ok": False, "error": ""}
    try:
        # 읽기 테스트
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
        con.execute("SELECT 1").fetchone()
        result["read_ok"] = True
        con.close()

        # WAL 모드 확인 (읽기만 — 설정하지 않음, Cartan에 영향 없음)
        con2 = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
        journal = con2.execute("PRAGMA journal_mode").fetchone()[0]
        result["wal_ok"] = (journal == "wal")
        result["journal_mode"] = journal
        con2.close()

        # 쓰기 접근 테스트 (ROLLBACK — 실제 데이터 변경 없음)
        con3 = sqlite3.connect(str(path), timeout=3)
        cur3 = con3.cursor()
        tables = [r[0] for r in cur3.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]

        if tables:
            tbl = tables[0]
            cols = [r[1] for r in cur3.execute(f'PRAGMA table_info("{tbl}")').fetchall()]
            placeholders = ", ".join(["NULL"] * len(cols))
            try:
                cur3.execute("BEGIN")
                cur3.execute(f'INSERT INTO "{tbl}" VALUES ({placeholders})')
                cur3.execute("ROLLBACK")  # ← 반드시 취소 (실제 쓰기 없음)
                result["write_ok"] = True
            except sqlite3.IntegrityError:
                # NOT NULL 등 제약으로 INSERT 실패해도 트랜잭션은 열렸음 → 쓰기 접근은 OK
                cur3.execute("ROLLBACK")
                result["write_ok"] = True
            except Exception as e:
                try:
                    cur3.execute("ROLLBACK")
                except:
                    pass
                result["write_ok"] = False
                result["error"] += f"write_test: {e} | "
        con3.close()

    except Exception as e:
        result["error"] += str(e)

    return result

def section_db_access_test(all_dbs: list[Path]) -> None:
    log("")
    log("[7/9] DB 동시 접근 테스트 (★ 실제 데이터 변경 없음 — 모두 ROLLBACK)")
    sep("-")
    log("      이 테스트는 Cartan이 실행 중인 상태에서 우리 에이전트가")
    log("      DB를 읽고 쓸 수 있는지 확인합니다.")
    log("")

    sqlite_dbs = [p for p in all_dbs if p.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".s3db"}]
    if not sqlite_dbs:
        log("  SQLite DB 없음 — 테스트 건너뜀")
        return

    for path in sqlite_dbs:
        log(f"  테스트 대상: {path}")
        r = _test_db_access(path)
        read_icon  = "✅" if r["read_ok"]  else "❌"
        write_icon = "✅" if r["write_ok"] else "❌"
        wal_icon   = "✅" if r["wal_ok"]   else "⚠ "

        journal_str = r.get("journal_mode", "?")
        log(f"  읽기 접근:   {read_icon}  {'성공' if r['read_ok']  else '실패 — 파일이 잠겨있거나 암호화됨'}")
        log(f"  쓰기 접근:   {write_icon}  {'성공 (ROLLBACK 완료)' if r['write_ok'] else '실패 — 에이전트가 Cartan에 반영 불가'}")
        log(f"  저널 모드:   {wal_icon}  현재={journal_str}  {'(동시 접근 지원)' if r['wal_ok'] else '(WAL 아님 — 에이전트가 첫 실행 시 WAL로 전환 예정)'}")

        if r["error"]:
            log(f"  오류 상세:   {r['error']}")

        if not r["read_ok"]:
            log("  → 해결책: Cartan을 잠시 종료하고 DB를 복사하거나, UI 자동화(S5) 방식 고려")
        elif r["read_ok"] and not r["write_ok"]:
            log("  → 해결책: Cartan이 DB를 exclusive lock으로 열고 있음 → S5 방식 필요")
        elif r["read_ok"] and r["write_ok"]:
            log("  → ✅ 에이전트가 Cartan 실행 중에도 DB에 직접 반영 가능 (S1 시나리오 진행)")
        log("")

# ════════════════════════════════════════════════════════════
# 8. 네트워크 & 카메라 포트 스캔
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
    log("[8/9] 네트워크 & 카메라 탐지")
    sep("-")
    log(run("ipconfig"))
    log("")
    log("  [ARP 테이블]")
    log(run("arp -a"))

    subnet = _get_local_subnet()
    if not subnet:
        log("  (서브넷 탐지 실패)")
        return

    log(f"\n  [포트 스캔: {subnet}.1~.254]")
    log("  포트: 554(RTSP), 80, 8080, 8888, 37777(Dahua NVR), 34567(HIKVISION)")
    log("  (약 20~40초 소요)")

    target_ports = [554, 80, 8080, 8888, 37777, 34567]
    open_hosts: dict[str, list[int]] = {}

    def scan(ip: str, port: int) -> tuple[str, int, bool]:
        return ip, port, probe_port(ip, port)

    tasks = [(f"{subnet}.{i}", p) for i in range(1, 255) for p in target_ports]
    with ThreadPoolExecutor(max_workers=150) as ex:
        futs = {ex.submit(scan, ip, port): (ip, port) for ip, port in tasks}
        for fut in as_completed(futs):
            ip, port, ok = fut.result()
            if ok:
                open_hosts.setdefault(ip, []).append(port)

    if open_hosts:
        for ip, ports in sorted(open_hosts.items()):
            pstr = ", ".join(map(str, sorted(ports)))
            notes = []
            if 554 in ports:   notes.append("RTSP 카메라 가능성!")
            if 37777 in ports: notes.append("Dahua NVR")
            if 34567 in ports: notes.append("HIKVISION NVR")
            note = "  ← " + " / ".join(notes) if notes else ""
            log(f"  ✅  {ip:<18} 포트: {pstr}{note}")
    else:
        log("  (개방 포트 없음 — 카메라가 다른 네트워크에 있을 수 있음)")

# ════════════════════════════════════════════════════════════
# 9. Cartan 오픈 파일 (handle64.exe 있을 때만)
# ════════════════════════════════════════════════════════════
def section_open_files(cartan_pids: list[int]) -> None:
    log("")
    log("[9/9] Cartan 프로세스 오픈 파일")
    sep("-")

    if not cartan_pids:
        log("  Cartan 프로세스가 실행 중이지 않음 — Cartan을 실행한 뒤 재실행하면 DB 경로를 자동 탐지합니다")
        return

    # wmic으로 실행 파일 경로 + 작업 디렉토리
    for pid in cartan_pids:
        exe_info = run(f'wmic process where "ProcessId={pid}" get ExecutablePath,CommandLine,WorkingSetSize /format:list')
        log(f"  PID {pid}:\n{exe_info}")
        # 열린 파일 목록 (wmic handle → Windows 7 이상 가능)
        handle_info = run(f'wmic process where "ProcessId={pid}" get HandleCount /format:list')
        log(f"  핸들 수: {handle_info.strip()}")
        # netstat으로 Cartan이 사용 중인 포트 확인
        net_info = run(f'netstat -ano | findstr "{pid}"')
        if net_info.strip():
            log(f"  네트워크 포트:\n{net_info}")

    # handle64.exe (Sysinternals)
    exe_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    handle_exe = exe_dir / "handle64.exe"

    if handle_exe.exists():
        log("\n  [handle64.exe 오픈 파일 분석]")
        for pid in cartan_pids:
            out = run(f'"{handle_exe}" -p {pid} -nobanner', timeout=15)
            for line in out.splitlines():
                if any(ext in line.lower() for ext in [".db", ".sqlite", ".mdb", ".dat", ".bin"]):
                    log(f"    {line}")
    else:
        log("\n  ℹ  handle64.exe 없음")
        log("     https://learn.microsoft.com/sysinternals/downloads/handle 에서 다운로드 후")
        log(f"     이 파일과 같은 폴더({exe_dir})에 넣으면 DB 경로를 자동 탐지합니다.")

# ════════════════════════════════════════════════════════════
# 결과 요약
# ════════════════════════════════════════════════════════════
def section_summary(all_dbs: list[Path], parking_dbs: list[Path]) -> None:
    sep()
    log("")
    log("  ✅  탐침 완료! 요약")
    sep("-")
    log(f"  발견된 DB 파일 수: {len(all_dbs)}")
    log(f"  주차 관련 DB 수:   {len(parking_dbs)}")
    if parking_dbs:
        log("")
        log("  ★ 주차 관련 DB (우선 확인 대상):")
        for p in parking_dbs:
            log(f"    {p}")
    log("")
    log("  ─────────────────────────────────────────────────────")
    log("  📋  에이전트 config.json 설정을 위한 체크리스트")
    log("  ─────────────────────────────────────────────────────")
    log("  보고서의 [6/9] 섹션에서 아래 항목을 확인하세요:")
    log("")
    log("  □ CARTAN_DB_PATH      → [5/9] 또는 [6/9]에서 .db/.sqlite 파일 전체 경로")
    log("  □ CARTAN_TABLE_VISITOR → ★ 표시된 주차 관련 테이블명")
    log("  □ CARTAN_COL_PLATE    → 차량번호 저장 컬럼명 (예: car_number, plate_no)")
    log("  □ CARTAN_COL_UNIT     → 동/호수 컬럼명 (예: dong, ho, unit)")
    log("  □ CARTAN_COL_VALID_FROM → 허용 시작 시각 컬럼명 (예: start_dt, valid_from)")
    log("  □ CARTAN_COL_VALID_UNTIL → 허용 종료 시각 컬럼명 (예: end_dt, valid_until)")
    log("  □ 날짜 형식           → 최근 5행 샘플 데이터에서 확인 (예: 2025-01-15 or 20250115)")
    log("  □ 차량번호 형식       → 최근 5행 샘플 데이터에서 확인 (예: 12가3456 or 12 가 3456)")
    log("")
    log("  □ DB 읽기 가능?       → [7/9] 읽기 접근 ✅ 확인")
    log("  □ DB 쓰기 가능?       → [7/9] 쓰기 접근 ✅ 확인")
    log("  □ 에이전트 시나리오   → 읽기+쓰기 ✅ → S1(직접 SQLite)  |  실패 → S5(UI 자동화) 필요")
    log("")
    log("  공유 방법: 이 txt 파일을 카카오톡으로 전송")
    log(f"  파일 위치: {REPORT_PATH}")
    sep()

# ════════════════════════════════════════════════════════════
# 메인
# ════════════════════════════════════════════════════════════
def main() -> None:
    _open_report()
    print(f"탄탄코어 Cartan800 DB 탐침 v2.0 시작\n보고서: {REPORT_PATH}\n")

    try:
        section_system()
        cartan_pids = section_processes()
        reg_paths   = section_registry()
        install_dbs = section_install_dirs(reg_paths)
        all_dbs     = section_db_scan(install_dbs)
        parking_dbs = section_sqlite_schema(all_dbs)
        section_db_access_test(all_dbs)
        section_network()
        section_open_files(cartan_pids)
        section_summary(all_dbs, parking_dbs)
    except Exception as e:
        log(f"\n\n[오류] {e}")
        import traceback
        log(traceback.format_exc())
    finally:
        close_report()

    if sys.platform == "win32":
        try:
            os.startfile(str(REPORT_PATH))
        except:
            pass

    print(f"\n완료! 보고서: {REPORT_PATH}")
    if sys.platform == "win32":
        input("\n엔터를 누르면 창이 닫힙니다...")

if __name__ == "__main__":
    main()
