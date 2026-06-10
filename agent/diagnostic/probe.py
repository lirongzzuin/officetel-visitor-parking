"""
탄탄코어 Cartan800 DB 탐침 v2.5
더블클릭 실행 → 바탕화면에 보고서 저장 + 메모장 자동 열기

의존성: Python 표준 라이브러리만 사용 (sqlite3 내장)
빌드: pyinstaller --onefile probe.py --name cartan_probe
"""

# ── 안전한 import (실패해도 프로그램 계속) ───────────────
import os
import sys
import socket
import shutil
import sqlite3
import subprocess
import tempfile
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# winreg는 section_registry() 내부에서 lazy import (최상단 import 실패 방지)

# ════════════════════════════════════════════════════════════
# 보고서 쓰기 유틸 (전역 파일 핸들)
# ════════════════════════════════════════════════════════════
_fp = None
_report_path: Path | None = None


def _pick_path(ts: str) -> Path:
    """바탕화면 → 문서 → Temp → 실행 디렉토리 순으로 쓰기 가능한 경로 반환"""
    fname = f"cartan_probe_{ts}.txt"
    home = Path.home()
    candidates = [
        home / "Desktop"            / fname,
        home / "바탕 화면"          / fname,
        home / "OneDrive" / "Desktop"    / fname,
        home / "OneDrive" / "바탕 화면"  / fname,
        home / "Documents"          / fname,
        home / "문서"               / fname,
        Path(tempfile.gettempdir()) / fname,
        Path(sys.executable).parent / fname if getattr(sys, "frozen", False) else Path.cwd() / fname,
    ]
    for p in candidates:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("", encoding="utf-8")
            return p
        except Exception:
            continue
    # 최후 폴백 — 항상 성공
    return Path(tempfile.gettempdir()) / fname


def _open_report(ts: str) -> Path:
    global _fp, _report_path
    _report_path = _pick_path(ts)
    _fp = open(_report_path, "w", encoding="utf-8")
    return _report_path


def _close_report():
    global _fp
    try:
        if _fp:
            _fp.close()
    except Exception:
        pass


def log(text: str = "") -> None:
    print(text)
    try:
        if _fp:
            _fp.write(text + "\n")
            _fp.flush()
    except Exception:
        pass


def sep(char: str = "=", n: int = 64) -> None:
    log(char * n)


# ════════════════════════════════════════════════════════════
# 셸 명령 실행
# ════════════════════════════════════════════════════════════
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


# ════════════════════════════════════════════════════════════
# 각 섹션 — 개별 예외 처리, 실패해도 다음 섹션 계속
# ════════════════════════════════════════════════════════════

def section_system() -> None:
    try:
        sep()
        log("  탄탄코어 Cartan800 DB 탐침 보고서 v2.5")
        log(f"  생성: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        log(f"  PC명: {os.environ.get('COMPUTERNAME','?')}  /  사용자: {os.environ.get('USERNAME','?')}")
        log(f"  보고서: {_report_path}")
        sep()
        log("")
        log("[1/9] 시스템 정보")
        sep("-")
        log(run("ver"))
        log(run('systeminfo | findstr /C:"OS Name" /C:"OS Version" /C:"Total Physical Memory"'))
        for d in "CDEFGH":
            try:
                u = shutil.disk_usage(f"{d}:\\")
                log(f"  디스크 {d}:\\  여유 {bytes_fmt(u.free)} / 전체 {bytes_fmt(u.total)}")
            except Exception:
                pass
    except Exception as e:
        log(f"  [섹션1 오류] {e}")


def section_processes() -> list[int]:
    cartan_pids: list[int] = []
    try:
        log("")
        log("[2/9] 실행 중인 프로세스")
        sep("-")
        raw = run("tasklist /v /fo csv")
        kw = ("cartan", "tantan", "parking", "주차", "barrier", "gate", "lprs", "anpr",
              "cartan800", "anprdata", "tantancore")
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
                except Exception:
                    pass
                found = True
        if not found:
            log("  (키워드 매칭 없음 — 아래 '창 있는 프로세스' 목록에서 직접 확인)")
        log("")
        log("  [창이 있는 모든 프로세스]")
        for line in raw.splitlines()[1:]:
            parts = [p.strip('"') for p in line.split('","')]
            title = parts[8] if len(parts) > 8 else ""
            if title and title not in ("N/A", ""):
                log(f"    {parts[0]:<35} 창: {title}")
    except Exception as e:
        log(f"  [섹션2 오류] {e}")
    return cartan_pids


def section_registry() -> list[str]:
    found_paths: list[str] = []
    try:
        import winreg  # lazy import — Windows 전용

        log("")
        log("[3/9] Windows 레지스트리 탐색")
        sep("-")
        kw = ["cartan", "tantan", "parking", "주차", "barrier", "gate"]

        def read_key(hive, path):
            result = {}
            try:
                k = winreg.OpenKey(hive, path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
                i = 0
                while True:
                    try:
                        n, d, _ = winreg.EnumValue(k, i)
                        result[n] = d
                        i += 1
                    except OSError:
                        break
                winreg.CloseKey(k)
            except Exception:
                pass
            return result

        # Uninstall 키 탐색
        for hive, suffix in (
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        ):
            try:
                k = winreg.OpenKey(hive, suffix, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
                i = 0
                while True:
                    try:
                        sub_name = winreg.EnumKey(k, i)
                        i += 1
                        if any(kw_ in sub_name.lower() for kw_ in kw):
                            vals = read_key(k, sub_name)
                            log(f"  ✅  Uninstall: {sub_name}")
                            for vk, vv in vals.items():
                                log(f"       {vk}: {vv}")
                            if "InstallLocation" in vals:
                                found_paths.append(vals["InstallLocation"])
                    except OSError:
                        break
                winreg.CloseKey(k)
            except Exception:
                pass

        # 직접 경로 탐색
        for hive, path in [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\TantanCore"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\TantanCore"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Cartan"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Cartan"),
            (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\TantanCore"),
            (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Cartan"),
        ]:
            vals = read_key(hive, path)
            if vals:
                log(f"  ✅  레지스트리: {path}")
                for vk, vv in vals.items():
                    log(f"       {vk}: {vv}")
                for key in ("InstallPath", "DBPath", "InstallLocation"):
                    if key in vals:
                        found_paths.append(vals[key])

        if not found_paths:
            log("  (레지스트리에서 Cartan 항목 없음 — 파일 탐색으로 진행)")

    except ImportError:
        log("  [섹션3] winreg 모듈 없음 (Windows 전용)")
    except Exception as e:
        log(f"  [섹션3 오류] {e}")
    return found_paths


_CONFIG_EXTS = {".ini", ".json", ".xml", ".cfg", ".conf", ".toml", ".config", ".properties"}
_DB_EXTS     = {".db", ".sqlite", ".sqlite3", ".s3db", ".mdb", ".accdb"}
_SKIP_DIRS   = {
    "windows", "winsxs", "system32", "syswow64",
    "node_modules", ".git", "chrome", "google",
    "microsoft", "edge", "mozilla", "temp", "tmp",
}


def _read_safe(path: Path, max_bytes: int = 4000) -> str:
    try:
        data = path.read_bytes()[:max_bytes]
        for enc in ("utf-8", "cp949", "latin-1"):
            try:
                return data.decode(enc)
            except Exception:
                pass
    except Exception:
        pass
    return "(읽기 실패)"


def section_install_dirs(reg_paths: list[str]) -> list[Path]:
    found_dbs: list[Path] = []
    try:
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

        processed: set = set()

        def process_dir(d: Path) -> None:
            try:
                key = str(d.resolve())
            except Exception:
                key = str(d)
            if key in processed:
                return
            processed.add(key)
            log(f"\n  📁  {d}")
            try:
                for item in sorted(d.rglob("*")):
                    try:
                        if not item.is_file():
                            continue
                        sz = bytes_fmt(item.stat().st_size)
                        log(f"       {item}  [{sz}]")
                        ext = item.suffix.lower()
                        if ext in _DB_EXTS and item.stat().st_size > 512:
                            found_dbs.append(item)
                        if ext in _CONFIG_EXTS and item.stat().st_size < 200_000:
                            content = _read_safe(item)
                            log(f"\n       ── {item.name} 내용 ──")
                            for line in content.splitlines()[:50]:
                                log(f"       {line}")
                            log("")
                    except Exception:
                        pass
            except Exception as e:
                log(f"       (탐색 오류: {e})")

        # 레지스트리 경로 직접 처리
        for rp in reg_paths:
            if rp:
                p = Path(rp)
                if p.is_dir():
                    process_dir(p)

        # 일반 경로에서 키워드 일치 폴더
        for base in bases:
            if not base.exists():
                continue
            try:
                for item in base.iterdir():
                    if item.is_dir() and any(k in item.name.lower() for k in kw):
                        process_dir(item)
            except Exception:
                pass

    except Exception as e:
        log(f"  [섹션4 오류] {e}")
    return found_dbs


def section_db_scan(known_dbs: list[Path]) -> list[Path]:
    all_dbs: list[Path] = list(known_dbs)
    try:
        log("")
        log("[5/9] 데이터베이스 파일 전체 탐색")
        sep("-")
        log("  드라이브 전체 탐색 중... (시간이 걸릴 수 있습니다)")

        known_set = {str(p.resolve()) for p in known_dbs}
        for drive in "CDEFGH":
            base = Path(f"{drive}:\\")
            if not base.exists():
                continue
            try:
                for root, dirs, files in os.walk(base, topdown=True):
                    dirs[:] = [
                        d for d in dirs
                        if d.lower() not in _SKIP_DIRS and not d.startswith("$")
                    ]
                    for f in files:
                        if Path(f).suffix.lower() in _DB_EXTS:
                            fp = Path(root) / f
                            try:
                                key = str(fp.resolve())
                                if fp.stat().st_size > 512 and key not in known_set:
                                    all_dbs.append(fp)
                                    known_set.add(key)
                            except Exception:
                                pass
            except Exception:
                pass

        for p in all_dbs:
            try:
                sz  = bytes_fmt(p.stat().st_size)
                mod = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
                log(f"  [DB] {p}  ({sz}, 수정: {mod})")
            except Exception:
                pass
        if not all_dbs:
            log("  (DB 파일을 찾지 못했습니다)")
    except Exception as e:
        log(f"  [섹션5 오류] {e}")
    return all_dbs


def section_sqlite_schema(all_dbs: list[Path]) -> list[Path]:
    parking_dbs: list[Path] = []
    try:
        log("")
        log("[6/9] SQLite 스키마 + 샘플 데이터")
        log("      (기존 데이터를 분석하므로 Cartan에서 등록 테스트 불필요)")
        sep("-")

        sqlite_dbs = [p for p in all_dbs if p.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".s3db"}]
        if not sqlite_dbs:
            log("  SQLite 파일 없음 — .mdb/.accdb 파일이 있으면 경로를 메모하세요")
            return parking_dbs

        kw = ["visitor", "guest", "car", "plate", "barrier", "visit", "방문", "주차", "차량"]

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
                is_parking = False
                for tbl in tables:
                    try:
                        cols = cur.execute(f'PRAGMA table_info("{tbl}")').fetchall()
                        col_names = [c["name"].lower() for c in cols]
                        is_tbl_parking = (
                            any(k in tbl.lower() for k in kw) or
                            any(any(k in c for k in ["plate","car","visitor","unit","dong","ho","valid"]) for c in col_names)
                        )
                        if is_tbl_parking:
                            is_parking = True
                            log(f"  │\n  │  ★ [주차 관련 테이블: {tbl}]")
                        else:
                            log(f"  │\n  │  [테이블: {tbl}]")
                        for c in cols:
                            pk = " ★PK" if c["pk"] else ""
                            nn = " NOT NULL" if c["notnull"] else ""
                            log(f"  │    {c['name']:<30} {c['type']}{nn}{pk}")
                        cnt = cur.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
                        log(f"  │    행 수: {cnt:,}")
                        if cnt > 0:
                            rows = cur.execute(
                                f'SELECT * FROM "{tbl}" ORDER BY rowid DESC LIMIT 5'
                            ).fetchall()
                            log(f"  │    최근 5행 (날짜/차번 형식 파악용)")
                            log(f"  │    컬럼: {', '.join(c['name'] for c in cols)}")
                            for row in rows:
                                log(f"  │      {tuple(row)}")
                    except Exception as te:
                        log(f"  │    (테이블 {tbl} 오류: {te})")
                if is_parking:
                    parking_dbs.append(path)
                con.close()
            except sqlite3.DatabaseError:
                log(f"  │  ⚠  SQLite가 아닌 파일이거나 암호화됨")
            except Exception as e:
                log(f"  │  ⚠  오류: {e}")
            log(f"  └─ 완료")
    except Exception as e:
        log(f"  [섹션6 오류] {e}")
    return parking_dbs


_found_passwords: dict[str, str] = {}  # db_path → password


def section_access_schema(all_dbs: list[Path]) -> list[Path]:
    """ODBC + OLE DB 두 방식, 32/64-bit PS 모두 시도해서 .mdb 스키마 읽기 (v2.6)"""
    parking_dbs: list[Path] = []
    try:
        log("")
        log("[6b/9] Microsoft Access (.mdb) 스키마 + 샘플 데이터")
        log("       (ODBC + OLE DB, 64-bit + 32-bit PS 모두 시도)")
        sep("-")

        access_dbs = [p for p in all_dbs if p.suffix.lower() in {".mdb", ".accdb"}]
        if not access_dbs:
            log("  .mdb/.accdb 파일 없음 — 건너뜀")
            return parking_dbs

        ps32 = r"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
        ps64 = "powershell.exe"

        # ── ODBC 드라이버 목록 확인 (진단용) ──────────────────────────
        log("  [ODBC 드라이버 목록]")
        odbc_list_script = (
            "Get-OdbcDriver | "
            "Where-Object { $_.Name -like '*Access*' -or $_.Name -like '*Excel*' } | "
            "Select-Object Name,Platform | Format-Table -AutoSize"
        )
        for bits, ps_exe in [("64-bit", ps64), ("32-bit", ps32)]:
            try:
                r = subprocess.run(
                    [ps_exe, "-NoProfile", "-NonInteractive",
                     "-ExecutionPolicy", "Bypass", "-Command", odbc_list_script],
                    capture_output=True, text=True, timeout=10,
                    encoding="utf-8", errors="replace",
                )
                out = (r.stdout + r.stderr).strip()
                if out:
                    log(f"  [{bits}]")
                    for ln in out.splitlines():
                        if ln.strip():
                            log(f"    {ln}")
                else:
                    log(f"  [{bits}] Access ODBC 드라이버 없음")
            except FileNotFoundError:
                log(f"  [{bits}] powershell.exe 없음: {ps_exe}")
            except Exception as e:
                log(f"  [{bits}] 오류: {e}")
        log("")

        kw = ["visitor", "guest", "car", "plate", "visit", "방문", "주차", "carno",
              "dong", "intime", "outtime", "unit", "ho", "valid", "anpr"]

        # ── ODBC 방식 스크립트 (System.Data.Odbc — OLE DB와 완전히 다른 드라이버) ──
        # 'Not a valid password' 오류 시 일반적인 Cartan 비밀번호 후보로 자동 재시도
        ps_odbc = r"""
$db = '{db_path}'
$drivers = @(
  'Microsoft Access Driver (*.mdb, *.accdb)',
  'Microsoft Access Driver (*.mdb)'
)
# 보수적으로 3개만 시도 — 1차는 빈 비밀번호, 2~3차는 가장 유력한 후보 (시스템 락아웃 위험 차단)
$passwords = @('', 'cartan', 'tantan')
# 시도 간 대기 — 빠른 연속 시도로 인한 의도치 않은 부작용 방지
$sleepBetween = 1.0
foreach ($drv in $drivers) {{
 foreach ($pwd in $passwords) {{
  try {{
    Start-Sleep -Seconds $sleepBetween
    $pwdPart = if ($pwd -ne '') {{ "PWD=$pwd;" }} else {{ '' }}
    $cs = "Driver={{$drv}};DBQ=$db;${{pwdPart}}ReadOnly=1;"
    $conn = New-Object System.Data.Odbc.OdbcConnection($cs)
    $conn.Open()
    if ($pwd -ne '') {{ Write-Host "PASSWORD_FOUND:$pwd" }}
    Write-Host "PROVIDER_OK:ODBC/$drv"
    $schema = $conn.GetSchema('Tables')
    $tnames = @()
    foreach ($row in $schema.Rows) {{
      if ($row['TABLE_TYPE'] -eq 'TABLE') {{ $tnames += $row['TABLE_NAME'] }}
    }}
    Write-Host "TABLES:$($tnames -join ',')"
    foreach ($tbl in $tnames) {{
      try {{
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT TOP 5 * FROM [$tbl]"
        $rd = $cmd.ExecuteReader()
        $cols = @(); for ($i=0; $i -lt $rd.FieldCount; $i++) {{ $cols += $rd.GetName($i) }}
        Write-Host "TABLE:$tbl|COLS:$($cols -join ',')"
        $n = 0
        while ($rd.Read() -and $n -lt 5) {{
          $vals = @(); for ($i=0; $i -lt $rd.FieldCount; $i++) {{ $vals += [string]$rd[$i] }}
          Write-Host "ROW:$($vals -join '|')"
          $n++
        }}
        $rd.Close()
      }} catch {{ Write-Host "TBL_ERR:$tbl $_" }}
    }}
    $conn.Close()
    exit 0
  }} catch {{
    $err = $_.Exception.Message
    if ($err -notlike '*password*' -and $err -notlike '*Password*') {{
      Write-Host "PROV_FAIL:ODBC/$drv $err"
      break  # 비밀번호 외 다른 오류면 다음 비밀번호 시도 무의미
    }}
  }}
 }}
}}
Write-Host "ALL_PROVIDERS_FAILED"
"""

        # ── OLE DB 방식 스크립트 (ADODB COM 자동화) ─────────────────────
        # 'Not a valid password' 오류 시 일반적인 Cartan 비밀번호 후보로 자동 재시도
        ps_oledb = r"""
$db = '{db_path}'
$providers = @('Microsoft.ACE.OLEDB.12.0', 'Microsoft.Jet.OLEDB.4.0')
# 보수적으로 3개만 시도 — 1차는 빈 비밀번호, 2~3차는 가장 유력한 후보 (시스템 락아웃 위험 차단)
$passwords = @('', 'cartan', 'tantan')
# 시도 간 대기 — 빠른 연속 시도로 인한 의도치 않은 부작용 방지
$sleepBetween = 1.0
foreach ($prov in $providers) {{
 foreach ($pwd in $passwords) {{
  try {{
    Start-Sleep -Seconds $sleepBetween
    $conn = New-Object -ComObject ADODB.Connection
    $pwdPart = if ($pwd -ne '') {{ ";Jet OLEDB:Database Password=$pwd" }} else {{ '' }}
    $conn.Open("Provider=$prov;Data Source=$db;Mode=Read${{pwdPart}};")
    if ($pwd -ne '') {{ Write-Host "PASSWORD_FOUND:$pwd" }}
    Write-Host "PROVIDER_OK:OLEDB/$prov"
    $sc = $conn.OpenSchema(20)
    $tnames = @()
    while (-not $sc.EOF) {{
      if ($sc.Fields('TABLE_TYPE').Value -eq 'TABLE') {{
        $tnames += $sc.Fields('TABLE_NAME').Value
      }}
      $sc.MoveNext()
    }}
    $sc.Close()
    Write-Host "TABLES:$($tnames -join ',')"
    foreach ($tbl in $tnames) {{
      try {{
        $rs = $conn.Execute("SELECT TOP 5 * FROM [$tbl]")
        $cols = @(); for ($i=0;$i-lt$rs.Fields.Count;$i++){{$cols+=$rs.Fields($i).Name}}
        Write-Host "TABLE:$tbl|COLS:$($cols -join ',')"
        $n=0; while (-not $rs.EOF -and $n-lt 5) {{
          $vals=@(); for($i=0;$i-lt$rs.Fields.Count;$i++){{$vals+=[string]$rs.Fields($i).Value}}
          Write-Host "ROW:$($vals -join '|')"
          $rs.MoveNext(); $n++
        }}
        $rs.Close()
      }} catch {{ Write-Host "TBL_ERR:$tbl $_" }}
    }}
    $conn.Close()
    exit 0
  }} catch {{
    $err = $_.Exception.Message
    if ($err -notlike '*password*' -and $err -notlike '*Password*') {{
      Write-Host "PROV_FAIL:OLEDB/$prov $err"
      break
    }}
  }}
 }}
}}
Write-Host "ALL_PROVIDERS_FAILED"
"""

        # 시도 순서: ODBC 64 → ODBC 32 → OLE DB 64 → OLE DB 32
        attempts = [
            ("ODBC",  ps64, "64-bit", ps_odbc),
            ("ODBC",  ps32, "32-bit", ps_odbc),
            ("OLEDB", ps64, "64-bit", ps_oledb),
            ("OLEDB", ps32, "32-bit", ps_oledb),
        ]

        for path in access_dbs:
            log(f"\n  ┌─ {path}")
            provider_ok = False
            is_parking  = False
            all_raw: list[str] = []   # 모든 시도의 원시 출력 누적

            for method, ps_exe, bits, template in attempts:
                if provider_ok:
                    break
                script = template.format(db_path=str(path))
                try:
                    r = subprocess.run(
                        [ps_exe, "-NoProfile", "-NonInteractive",
                         "-ExecutionPolicy", "Bypass", "-Command", script],
                        capture_output=True, text=True, timeout=30,
                        encoding="utf-8", errors="replace",
                    )
                    out = (r.stdout + r.stderr).strip()
                    all_raw.append(f"── [{method}/{bits}] ──\n{out}")
                    if "PROVIDER_OK" in out:
                        provider_ok = True
                        log(f"  │  [사용 방식: {method} / {bits}]")
                        col_names: list[str] = []
                        for line in out.splitlines():
                            if line.startswith("PASSWORD_FOUND:"):
                                pwd = line.split(":", 1)[1]
                                _found_passwords[str(path)] = pwd
                                log(f"  │  🔑  비밀번호 발견: '{pwd}'")
                            elif line.startswith("PROVIDER_OK:"):
                                log(f"  │  ✅  드라이버: {line.split(':', 1)[1]}")
                            elif line.startswith("TABLES:"):
                                tables = [t for t in line.split(":", 1)[1].split(",") if t]
                                log(f"  │  테이블 목록 ({len(tables)}개): {', '.join(tables)}")
                            elif line.startswith("TABLE:"):
                                parts = line.split("|COLS:")
                                tbl = parts[0].replace("TABLE:", "")
                                col_names = parts[1].split(",") if len(parts) > 1 else []
                                tbl_parking = (
                                    any(k in tbl.lower() for k in kw) or
                                    any(any(k in c.lower() for k in kw) for c in col_names)
                                )
                                marker = "★" if tbl_parking else " "
                                log(f"  │\n  │  {marker} [{tbl}]")
                                log(f"  │    컬럼: {', '.join(col_names)}")
                                if tbl_parking:
                                    is_parking = True
                            elif line.startswith("ROW:"):
                                log(f"  │    {line[4:]}")
                            elif line.startswith("PROV_FAIL:"):
                                log(f"  │  (시도 실패: {line})")
                            elif line.startswith("TBL_ERR:"):
                                log(f"  │  (테이블 오류: {line})")
                    else:
                        # 실패 요약 한 줄만
                        fail_lines = [l for l in out.splitlines() if "FAIL" in l or "오류" in l or "Error" in l]
                        summary = fail_lines[0] if fail_lines else (out[:120] if out else "(출력 없음)")
                        log(f"  │  [{method}/{bits}] 실패: {summary}")

                except FileNotFoundError:
                    all_raw.append(f"── [{method}/{bits}] PS 없음: {ps_exe}")
                    log(f"  │  [{method}/{bits}] powershell 없음 (경로: {ps_exe})")
                except Exception as e:
                    all_raw.append(f"── [{method}/{bits}] 예외: {e}")
                    log(f"  │  [{method}/{bits}] 예외: {e}")

            if not provider_ok:
                log("  │")
                log("  │  ⚠  모든 방식 실패 — 전체 원시 출력:")
                for chunk in all_raw:
                    for ln in chunk.splitlines()[:8]:
                        log(f"  │    {ln}")

            if is_parking:
                parking_dbs.append(path)
            log(f"  └─ 완료")

    except Exception as e:
        log(f"  [섹션6b 오류] {e}")
    return parking_dbs


def section_db_access_test(all_dbs: list[Path]) -> None:
    try:
        log("")
        log("[7/9] DB 동시 접근 테스트 (★ 실제 데이터 변경 없음 — 모두 ROLLBACK)")
        sep("-")
        sqlite_dbs = [p for p in all_dbs if p.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".s3db"}]
        if not sqlite_dbs:
            log("  SQLite DB 없음 — 건너뜀")
            return
        for path in sqlite_dbs:
            log(f"\n  테스트: {path}")
            read_ok = write_ok = wal_ok = False
            journal_mode = "?"
            err = ""
            try:
                con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
                con.execute("SELECT 1").fetchone()
                read_ok = True
                journal_mode = con.execute("PRAGMA journal_mode").fetchone()[0]
                wal_ok = (journal_mode == "wal")
                con.close()
            except Exception as e:
                err += f"read:{e} "
            try:
                con2 = sqlite3.connect(str(path), timeout=3)
                cur2 = con2.cursor()
                tables = [r[0] for r in cur2.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()]
                if tables:
                    tbl = tables[0]
                    ncols = len(cur2.execute(f'PRAGMA table_info("{tbl}")').fetchall())
                    nulls = ", ".join(["NULL"] * ncols)
                    try:
                        cur2.execute("BEGIN")
                        cur2.execute(f'INSERT INTO "{tbl}" VALUES ({nulls})')
                        cur2.execute("ROLLBACK")
                        write_ok = True
                    except sqlite3.IntegrityError:
                        cur2.execute("ROLLBACK")
                        write_ok = True
                    except Exception as we:
                        try:
                            cur2.execute("ROLLBACK")
                        except Exception:
                            pass
                        err += f"write:{we} "
                con2.close()
            except Exception as e:
                err += f"write_conn:{e} "
            log(f"  읽기: {'✅ 성공' if read_ok else '❌ 실패'}")
            log(f"  쓰기: {'✅ 성공 (ROLLBACK 완료)' if write_ok else '❌ 실패'}")
            log(f"  저널: {journal_mode} {'(WAL — 동시 접근 지원)' if wal_ok else '(WAL 아님 — 에이전트가 전환 예정)'}")
            if err:
                log(f"  오류: {err}")
            if read_ok and write_ok:
                log("  → ✅ S1 시나리오 (직접 SQLite) 사용 가능")
            elif read_ok:
                log("  → ⚠  읽기만 가능 — S5 방식(UI 자동화) 검토 필요")
            else:
                log("  → ❌ 접근 불가")
    except Exception as e:
        log(f"  [섹션7 오류] {e}")


def section_network() -> None:
    try:
        log("")
        log("[8/9] 네트워크 & 카메라 탐지")
        sep("-")
        log(run("ipconfig"))
        log("")
        log("  [ARP 테이블]")
        log(run("arp -a"))
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            subnet = ".".join(local_ip.split(".")[:3])
        except Exception:
            log("  (서브넷 탐지 실패 — 포트 스캔 건너뜀)")
            return
        log(f"\n  [포트 스캔: {subnet}.1~.254]  약 20~40초 소요")
        target_ports = [554, 80, 8080, 8888, 37777, 34567]

        def probe_port(ip: str, port: int) -> tuple[str, int, bool]:
            try:
                with socket.create_connection((ip, port), timeout=0.12):
                    return ip, port, True
            except Exception:
                return ip, port, False

        tasks = [(f"{subnet}.{i}", p) for i in range(1, 255) for p in target_ports]
        open_hosts: dict[str, list[int]] = {}
        with ThreadPoolExecutor(max_workers=150) as ex:
            for ip, port, ok in ex.map(lambda t: probe_port(*t), tasks):
                if ok:
                    open_hosts.setdefault(ip, []).append(port)
        if open_hosts:
            for ip, ports in sorted(open_hosts.items()):
                notes = []
                if 554   in ports: notes.append("RTSP 카메라")
                if 37777 in ports: notes.append("Dahua NVR")
                if 34567 in ports: notes.append("HIKVISION NVR")
                note = "  ← " + " / ".join(notes) if notes else ""
                log(f"  ✅  {ip:<18} 포트: {', '.join(map(str, sorted(ports)))}{note}")
        else:
            log("  (개방 포트 없음)")
    except Exception as e:
        log(f"  [섹션8 오류] {e}")


def section_open_files(cartan_pids: list[int]) -> None:
    try:
        log("")
        log("[9/9] Cartan 프로세스 오픈 파일")
        sep("-")
        if not cartan_pids:
            log("  Cartan 프로세스 미실행 — Cartan 켠 상태에서 재실행하면 DB 경로 자동 탐지")
            return
        for pid in cartan_pids:
            log(f"  PID {pid}:")
            log(run(f'wmic process where "ProcessId={pid}" get ExecutablePath,CommandLine /format:list'))
            net = run(f'netstat -ano | findstr "{pid}"')
            if net.strip():
                log(f"  포트:\n{net}")
        exe_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
        handle_exe = exe_dir / "handle64.exe"
        if handle_exe.exists():
            log("\n  [handle64 오픈 파일]")
            for pid in cartan_pids:
                out = run(f'"{handle_exe}" -p {pid} -nobanner', timeout=15)
                for line in out.splitlines():
                    if any(ext in line.lower() for ext in [".db", ".sqlite", ".mdb", ".dat"]):
                        log(f"    {line}")
        else:
            log("  (handle64.exe 없음 — DB 경로는 섹션 [5/9]에서 확인)")
    except Exception as e:
        log(f"  [섹션9 오류] {e}")


def section_summary(all_dbs: list[Path], parking_dbs: list[Path]) -> None:
    try:
        sep()
        log("")
        log("  ✅  탐침 완료!")
        sep("-")
        log(f"  발견된 DB 파일 수: {len(all_dbs)}")
        log(f"  주차 관련 DB 수:   {len(parking_dbs)}")
        if parking_dbs:
            log("")
            log("  ★ 주차 관련 DB:")
            for p in parking_dbs:
                log(f"    {p}")

        # CARTAN_SCENARIO 자동 추천
        # 우선순위 1) 경로에 Cartan/TANTAN 포함된 DB
        # 우선순위 2) 스키마 분석으로 주차 관련으로 판정된 DB
        # 우선순위 3) 전체 DB에서 확장자만으로
        log("")
        log("  ─────────────────────────────────────────────────────")
        log("  CARTAN_SCENARIO 추천")
        log("  ─────────────────────────────────────────────────────")
        sqlite_exts = {".db", ".sqlite", ".sqlite3", ".s3db"}
        access_exts = {".mdb", ".accdb"}

        # 경로에 Cartan/TANTAN/CARTAN800 포함된 DB만 추출 — 가장 신뢰 가능
        path_kw = ["cartan", "tantan", "anprdata", "anprpark"]
        cartan_path_dbs = [
            p for p in all_dbs
            if any(kw in str(p).lower() for kw in path_kw)
        ]

        recommended_db: Path | None = None
        scenario: str | None = None
        reason: str = ""

        if cartan_path_dbs:
            # 경로 우선 — visitor/방문 관련 키워드 우선
            preferred = [p for p in cartan_path_dbs if "anprdata" in str(p).lower()]
            recommended_db = preferred[0] if preferred else cartan_path_dbs[0]
            ext = recommended_db.suffix.lower()
            if ext in access_exts:
                scenario = "S2"
                reason = "Cartan 설치 경로의 .mdb 파일 발견"
            elif ext in sqlite_exts:
                scenario = "S1"
                reason = "Cartan 설치 경로의 .db 파일 발견"
        elif parking_dbs:
            # 스키마 분석에 의존
            has_sqlite = any(p.suffix.lower() in sqlite_exts for p in parking_dbs)
            has_access = any(p.suffix.lower() in access_exts for p in parking_dbs)
            if has_access:
                recommended_db = next(p for p in parking_dbs if p.suffix.lower() in access_exts)
                scenario = "S2"
                reason = "스키마에서 주차 관련 테이블 발견 (.mdb)"
            elif has_sqlite:
                recommended_db = next(p for p in parking_dbs if p.suffix.lower() in sqlite_exts)
                scenario = "S1"
                reason = "스키마에서 주차 관련 테이블 발견 (.db) — 무관 DB 가능성 확인 필요"

        if scenario and recommended_db:
            log(f'  → CARTAN_SCENARIO = "{scenario}"  ({reason})')
            log(f'  → CARTAN_DB_PATH  = "{recommended_db}"')
            log(f'                       (config.json 에는 역슬래시 \\\\ 두 번)')
            pwd = _found_passwords.get(str(recommended_db))
            if pwd is not None:
                log(f'  → CARTAN_DB_PASSWORD = "{pwd}"  (자동 발견)')
            elif scenario == "S2":
                log('  → CARTAN_DB_PASSWORD = ""    (자동 발견 실패 — 수동 확인 필요)')
                log('                              [4/9] CarTan.exe.config 또는 벤더 문의')
        elif all_dbs:
            log("  → 판단 불가 — Cartan/TANTAN 경로의 DB가 발견되지 않음")
            log("    [4/9] 설치 폴더 탐색 결과 수동 확인 필요")
        else:
            log("  → DB 파일 없음 — Cartan 실행 중인지 확인 필요")

        log("")
        log("  ─────────────────────────────────────────────────────")
        log("  config.json 에 입력할 값 (보고서 [6/9] 또는 [6b/9]에서 확인)")
        log("  ─────────────────────────────────────────────────────")
        log("  □ CARTAN_SCENARIO       → 위 추천값 참고 (S1 또는 S2)")
        log("  □ CARTAN_DB_PATH        → DB 파일 전체 경로")
        log("  □ CARTAN_DB_PASSWORD    → .mdb가 비밀번호 보호되면 입력, 아니면 \"\" 빈 문자열")
        log("                            ([6b/9] 에서 'Not a valid password' 오류 시 필요)")
        log("                            CarTan.exe.config (또는 [4/9]) 에서 ConnectionString 확인")
        log("  □ CARTAN_VISITOR_TABLE  → ★ 표시 테이블명")
        log("  □ CARTAN_PLATE_COL      → 차량번호 컬럼명")
        log("  □ CARTAN_UNIT_COL       → 동/호수 컬럼명")
        log("  □ CARTAN_VALID_FROM     → 허용 시작 시각 컬럼명")
        log("  □ CARTAN_VALID_UNTIL    → 허용 종료 시각 컬럼명")
        log("  □ 날짜 형식  → 최근 5행 샘플에서 확인")
        log("  □ 차번 형식  → 최근 5행 샘플에서 확인")
        log("")
        log("  □ DB 읽기/쓰기 가능?  → [7/9] ✅ 확인")
        log("")
        log(f"  보고서 위치: {_report_path}")
        sep()
    except Exception as e:
        log(f"  [요약 오류] {e}")


# ════════════════════════════════════════════════════════════
# 메인
# ════════════════════════════════════════════════════════════
def main() -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("=" * 60)
    print("  탄탄코어 Cartan800 DB 탐침 v2.5")
    print("  시작 중...")
    print("=" * 60)

    # 보고서 파일 열기
    try:
        report_path = _open_report(ts)
        print(f"  보고서 위치: {report_path}")
    except Exception as e:
        print(f"  [경고] 보고서 파일 생성 실패: {e}")
        print("  콘솔 출력만 진행합니다.")

    print()

    # 각 섹션 독립 실행 — 하나 실패해도 다음 계속
    cartan_pids: list[int] = []
    reg_paths:   list[str] = []
    install_dbs: list[Path] = []
    all_dbs:     list[Path] = []
    parking_dbs: list[Path] = []

    for label, fn, *args in [
        ("시스템 정보",      section_system),
        ("프로세스",         section_processes),
        ("레지스트리",       section_registry),
    ]:
        print(f"  [{label}] 진행 중...")
        try:
            result = fn()
            if label == "프로세스":
                cartan_pids = result or []
            elif label == "레지스트리":
                reg_paths = result or []
        except Exception as e:
            log(f"  [{label} 오류] {e}\n{traceback.format_exc()}")

    print("  [설치 폴더] 진행 중...")
    try:
        install_dbs = section_install_dirs(reg_paths) or []
    except Exception as e:
        log(f"  [설치 폴더 오류] {e}")

    print("  [DB 전체 탐색] 진행 중... (1~2분 소요)")
    try:
        all_dbs = section_db_scan(install_dbs) or []
    except Exception as e:
        log(f"  [DB 탐색 오류] {e}")

    print("  [SQLite 스키마] 진행 중...")
    try:
        parking_dbs = section_sqlite_schema(all_dbs) or []
    except Exception as e:
        log(f"  [스키마 오류] {e}")

    print("  [Access (.mdb) 스키마] 진행 중...")
    try:
        access_parking = section_access_schema(all_dbs) or []
        for p in access_parking:
            if p not in parking_dbs:
                parking_dbs.append(p)
    except Exception as e:
        log(f"  [Access 스키마 오류] {e}")

    print("  [DB 접근 테스트] 진행 중...")
    try:
        section_db_access_test(all_dbs)
    except Exception as e:
        log(f"  [접근 테스트 오류] {e}")

    print("  [네트워크 스캔] 진행 중... (20~40초 소요)")
    try:
        section_network()
    except Exception as e:
        log(f"  [네트워크 오류] {e}")

    print("  [오픈 파일] 진행 중...")
    try:
        section_open_files(cartan_pids)
    except Exception as e:
        log(f"  [오픈 파일 오류] {e}")

    section_summary(all_dbs, parking_dbs)
    _close_report()

    print(f"\n✅  완료!  보고서: {_report_path}")

    # 메모장으로 자동 열기
    try:
        if _report_path and _report_path.exists():
            os.startfile(str(_report_path))
    except Exception:
        pass


# ── 진입점: 여기서 input()을 보장 → 창이 절대 안 닫힘 ──
if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("\n" + "=" * 60)
        print("  [치명 오류]")
        print(traceback.format_exc())
        print("=" * 60)
        try:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            err_file = Path(tempfile.gettempdir()) / f"probe_error_{ts}.txt"
            err_file.write_text(traceback.format_exc(), encoding="utf-8")
            print(f"  오류 로그 저장: {err_file}")
        except Exception:
            pass
    finally:
        input("\n엔터를 누르면 창이 닫힙니다...")
