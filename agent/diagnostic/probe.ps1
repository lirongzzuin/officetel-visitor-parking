# ============================================================
# Cartan800 DB 탐침 스크립트 v1.0
# 관리실 Windows PC에서 실행 → 바탕화면에 보고서 저장
#
# 실행 방법:
#   1. USB를 꽂는다
#   2. probe.bat 더블클릭 (또는 이 파일을 우클릭 → PowerShell로 실행)
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$ReportPath = "$env:USERPROFILE\Desktop\cartan_probe_$ts.txt"
$SqlitePath = "$PSScriptRoot\sqlite3.exe"

function Log {
    param([string]$text = "")
    Write-Host $text
    Add-Content -Path $ReportPath -Value $text -Encoding UTF8
}

function Sep { Log ("=" * 62) }
function SubSep { Log ("-" * 62) }

Sep
Log "  탄탄코어 Cartan800 DB 탐침 보고서"
Log "  생성: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log "  PC명: $env:COMPUTERNAME  /  사용자: $env:USERNAME"
Sep

# ──────────────────────────────────────────────────
# 1. 시스템 정보
# ──────────────────────────────────────────────────
Log ""
Log "[1/7] 시스템 정보"
SubSep
$os = Get-CimInstance Win32_OperatingSystem
Log "OS      : $($os.Caption) (빌드 $($os.BuildNumber))"
Log "아키텍처: $($os.OSArchitecture)"
Log "RAM     : $([math]::Round($os.TotalVisibleMemorySize/1MB, 1)) GB"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $free = [math]::Round($_.FreeSpace/1GB,1)
    $total = [math]::Round($_.Size/1GB,1)
    Log "디스크  : $($_.DeviceID)  여유 ${free}GB / 전체 ${total}GB"
}

# Python 설치 여부
$pyVer = python --version 2>&1
Log "Python  : $pyVer"

# ──────────────────────────────────────────────────
# 2. Cartan 관련 프로세스 탐지
# ──────────────────────────────────────────────────
Log ""
Log "[2/7] 실행 중인 프로세스 (주차/Cartan 관련)"
SubSep

$keywords = "cartan|tantan|parking|주차|barrier|gate|car|lprs|anpr|camera|cam"
$procs = Get-Process | Where-Object {
    $_.Name -imatch $keywords -or
    ($_.Path -and $_.Path -imatch $keywords) -or
    ($_.MainWindowTitle -and $_.MainWindowTitle -imatch $keywords)
}

if ($procs) {
    $procs | ForEach-Object {
        Log "  PID $($_.Id)  $($_.Name)"
        if ($_.Path) { Log "    경로: $($_.Path)" }
        if ($_.MainWindowTitle) { Log "    창: $($_.MainWindowTitle)" }
    }
} else {
    Log "  (주차 관련 프로세스 없음 — Cartan이 현재 실행 중이지 않을 수 있습니다)"
}

Log ""
Log "  [모든 실행 프로세스 (창 있는 것만)]"
Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Sort-Object Name |
    ForEach-Object { Log "    $($_.Name.PadRight(30)) $($_.MainWindowTitle)" }

# ──────────────────────────────────────────────────
# 3. 설치 폴더 탐색
# ──────────────────────────────────────────────────
Log ""
Log "[3/7] 주차 관련 설치 폴더 탐색"
SubSep

$installBases = @("C:\Program Files", "C:\Program Files (x86)", "C:\ProgramData", "C:\", "D:\", "E:\")
$installKw = @("cartan","tantan","parking","주차","barrier","gate","lprs","anpr")

foreach ($base in $installBases) {
    if (-not (Test-Path $base)) { continue }
    Get-ChildItem $base -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -imatch ($installKw -join "|") } |
        ForEach-Object {
            Log "  발견: $($_.FullName)"
            # 하위 파일도 나열
            Get-ChildItem $_.FullName -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -imatch "\.(exe|dll|db|sqlite|mdb|ini|cfg|json|xml|conf)$" } |
                ForEach-Object { Log "    $($_.FullName)  [$([math]::Round($_.Length/1KB,1)) KB]" }
        }
}

# ──────────────────────────────────────────────────
# 4. DB 파일 전체 탐색
# ──────────────────────────────────────────────────
Log ""
Log "[4/7] 데이터베이스 파일 탐색 (.db .sqlite .mdb .accdb)"
SubSep
Log "  탐색 중... (시간이 걸릴 수 있습니다)"

$dbExts   = @("*.db","*.sqlite","*.sqlite3","*.s3db","*.mdb","*.accdb")
$skipDirs = "Windows\\WinSxS|AppData\\Local\\Google|AppData\\Local\\Microsoft|node_modules|\.git"
$allDbs   = [System.Collections.Generic.List[string]]::new()

foreach ($drive in @("C:\","D:\","E:\")) {
    if (-not (Test-Path $drive)) { continue }
    foreach ($ext in $dbExts) {
        Get-ChildItem -Path $drive -Recurse -Filter $ext -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -gt 512 -and $_.FullName -notmatch $skipDirs } |
            ForEach-Object {
                $sz = [math]::Round($_.Length/1KB, 1)
                Log "  [DB] $($_.FullName)"
                Log "       크기: ${sz} KB  /  수정: $($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
                $allDbs.Add($_.FullName)
            }
    }
}

if ($allDbs.Count -eq 0) { Log "  (DB 파일을 찾지 못했습니다)" }

# ──────────────────────────────────────────────────
# 5. SQLite 스키마 자동 분석
# ──────────────────────────────────────────────────
Log ""
Log "[5/7] SQLite 스키마 분석"
SubSep

$sqliteDbs = $allDbs | Where-Object { $_ -imatch "\.(db|sqlite|sqlite3|s3db)$" }

if (-not (Test-Path $SqlitePath)) {
    Log "  ⚠  sqlite3.exe 없음 (USB에 담아오지 않았거나 같은 폴더에 없습니다)"
    Log "  → 수동 확인: https://sqlite.org/download.html 에서 다운로드"
} elseif ($sqliteDbs.Count -eq 0) {
    Log "  SQLite DB 파일 없음 (MS Access 또는 다른 형식일 수 있음)"
} else {
    foreach ($dbPath in $sqliteDbs) {
        Log ""
        Log "  ┌─ $dbPath"

        # 테이블 목록
        $tables = (& $SqlitePath $dbPath ".tables" 2>&1) -split "\s+" | Where-Object { $_ -ne "" }
        Log "  │  테이블: $($tables -join ', ')"

        foreach ($tbl in $tables) {
            Log "  │"
            Log "  │  [테이블: $tbl]"

            # 스키마
            $schema = & $SqlitePath $dbPath ".schema `"$tbl`"" 2>&1
            $schema | ForEach-Object { Log "  │    $_" }

            # 행 수
            $cnt = & $SqlitePath $dbPath "SELECT COUNT(*) FROM `"$tbl`";" 2>&1
            Log "  │    행 수: $cnt"

            # 샘플 데이터 (최신 3행)
            $headers = & $SqlitePath $dbPath ".headers on" 2>&1
            $sample  = & $SqlitePath $dbPath "SELECT * FROM `"$tbl`" ORDER BY rowid DESC LIMIT 3;" 2>&1
            Log "  │    최근 3행:"
            $sample | ForEach-Object { Log "  │      $_" }
        }
        Log "  └─ 분석 완료"
    }
}

# ──────────────────────────────────────────────────
# 6. 네트워크 & 카메라 탐지
# ──────────────────────────────────────────────────
Log ""
Log "[6/7] 네트워크 정보 & 카메라 탐지"
SubSep

# IP 주소
$myIPs = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch "^127\.|^169\." }
$myIPs | ForEach-Object {
    Log "  IP  : $($_.IPAddress)  /  인터페이스: $($_.InterfaceAlias)"
}

# 게이트웨이
Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    ForEach-Object { Log "  GW  : $($_.NextHop)" }

# DNS
Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.ServerAddresses } |
    ForEach-Object { Log "  DNS : $($_.ServerAddresses -join ', ')  ($($_.InterfaceAlias))" }

# ARP 테이블 (같은 네트워크 장비 목록)
Log ""
Log "  [ARP 테이블 — 연결된 모든 장비]"
arp -a 2>&1 | ForEach-Object { Log "    $_" }

# RTSP 포트(554) 스캔
$primaryIP = ($myIPs | Where-Object { $_.IPAddress -notmatch "^172\.|^10\." } | Select-Object -First 1).IPAddress
if (-not $primaryIP) { $primaryIP = ($myIPs | Select-Object -First 1).IPAddress }
$subnet = $primaryIP -replace "\.\d+$", ""

Log ""
Log "  [카메라 RTSP 포트 스캔 — $subnet.1 ~ $subnet.254 포트 554]"
Log "  (약 30초 소요)"

$rtspHosts = @()
1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $tcp = New-Object System.Net.Sockets.TcpClient
    $ar  = $tcp.BeginConnect($ip, 554, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(120, $false)) {
        try {
            $tcp.EndConnect($ar)
            Log "  ✅  $ip:554 열림 (RTSP 가능성 높음)"
            $rtspHosts += $ip
        } catch {}
    }
    $tcp.Close()
}

if ($rtspHosts.Count -eq 0) {
    Log "  포트 554 열린 장비 없음"
    Log "  → 카메라가 다른 포트(8554, 10554, 80)를 쓸 수 있습니다"
    Log "  → 또는 같은 서브넷이 아닐 수 있습니다"
}

# HTTP(80/8080) 포트도 간단 확인 (DVR/NVR 웹 페이지)
Log ""
Log "  [DVR/NVR 웹관리 포트 스캔 — 포트 80, 8080, 8888]"
foreach ($port in @(80, 8080, 8888)) {
    1..254 | ForEach-Object {
        $ip = "$subnet.$_"
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar  = $tcp.BeginConnect($ip, $port, $null, $null)
        if ($ar.AsyncWaitHandle.WaitOne(80, $false)) {
            try {
                $tcp.EndConnect($ar)
                if ($ip -ne $primaryIP) {
                    Log "  ✅  $ip:$port 열림 (DVR/NVR 웹 페이지일 수 있음)"
                }
            } catch {}
        }
        $tcp.Close()
    }
}

# ──────────────────────────────────────────────────
# 7. Cartan 프로세스 오픈 파일 (Process Handle)
# ──────────────────────────────────────────────────
Log ""
Log "[7/7] Cartan 프로세스가 열고 있는 파일 (Handle 분석)"
SubSep

# handle.exe (Sysinternals) 가 USB에 있으면 사용
$handleExe = "$PSScriptRoot\handle.exe"
if (Test-Path $handleExe) {
    $cartanPids = (Get-Process | Where-Object { $_.Name -imatch "cartan|tantan" }).Id
    foreach ($pid in $cartanPids) {
        Log "  PID $pid 오픈 파일:"
        & $handleExe -p $pid 2>&1 | Where-Object { $_ -imatch "\.(db|sqlite|mdb|accdb|dat|bin)" } |
            ForEach-Object { Log "    $_" }
    }
} else {
    Log "  handle.exe 없음 (Sysinternals handle.exe를 USB에 담아오면 자동 분석됩니다)"
    Log "  다운로드: https://learn.microsoft.com/sysinternals/downloads/handle"
}

# ──────────────────────────────────────────────────
# 완료
# ──────────────────────────────────────────────────
Sep
Log ""
Log "  보고서 저장 완료!"
Log "  파일 위치: $ReportPath"
Log ""
Log "  다음 중 하나로 공유해 주세요:"
Log "    1. 이 txt 파일을 카카오톡으로 전송"
Log "    2. USB에 복사"
Log "    3. 이메일 첨부 전송"
Sep

# 결과 파일 자동 열기
Start-Process notepad.exe $ReportPath
