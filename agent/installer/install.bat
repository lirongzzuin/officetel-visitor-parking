@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║     OO오피스텔 주차 관리 에이전트 설치 프로그램          ║
echo ║     버전: 자동 감지됨                                ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:: ── 관리자 권한 확인 ───────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo [오류] 이 프로그램은 관리자 권한으로 실행해야 합니다.
    echo         설치 파일을 우클릭 → "관리자 권한으로 실행" 을 선택하세요.
    pause
    exit /b 1
)

:: ── 경로 설정 ──────────────────────────────────────────
set INSTALL_DIR=C:\Program Files\OfficetelParking
set EXE_NAME=officetel_agent.exe
set SERVICE_NAME=OfficetelParkingAgent
set SERVICE_DISPLAY=OO오피스텔 주차 관리 에이전트
set NSSM=%~dp0nssm.exe

:: ── NSSM 존재 확인 ────────────────────────────────────
if not exist "%NSSM%" (
    echo [오류] nssm.exe 를 찾을 수 없습니다.
    echo         설치 폴더에 nssm.exe 가 있어야 합니다: %NSSM%
    pause
    exit /b 1
)

:: ── EXE 존재 확인 ─────────────────────────────────────
if not exist "%~dp0%EXE_NAME%" (
    echo [오류] %EXE_NAME% 을 찾을 수 없습니다.
    echo         설치 폴더: %~dp0
    pause
    exit /b 1
)

:: ── config.json 확인 ──────────────────────────────────
if not exist "%~dp0config.json" (
    echo [오류] config.json 을 찾을 수 없습니다.
    echo         config.json.example 을 복사하여 값을 채워넣으세요.
    pause
    exit /b 1
)

echo [1/6] 설치 디렉토리 생성: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"

echo [2/6] 파일 복사...
copy /y "%~dp0%EXE_NAME%"    "%INSTALL_DIR%\%EXE_NAME%"   >nul
copy /y "%~dp0config.json"   "%INSTALL_DIR%\config.json"  >nul
copy /y "%NSSM%"             "%INSTALL_DIR%\nssm.exe"     >nul 2>&1

:: ── 기존 서비스 제거 ──────────────────────────────────
echo [3/6] 기존 서비스 확인...
sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo       기존 서비스 발견 → 중지 및 제거
    net stop "%SERVICE_NAME%" >nul 2>&1
    "%NSSM%" remove "%SERVICE_NAME%" confirm >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: ── 서비스 등록 ──────────────────────────────────────
echo [4/6] Windows 서비스 등록...
"%NSSM%" install "%SERVICE_NAME%"  "%INSTALL_DIR%\%EXE_NAME%"
"%NSSM%" set "%SERVICE_NAME%" DisplayName "%SERVICE_DISPLAY%"
"%NSSM%" set "%SERVICE_NAME%" Description "OO오피스텔 방문차량 관리 — Cartan 연동 에이전트"
"%NSSM%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM%" set "%SERVICE_NAME%" AppDirectory "%INSTALL_DIR%"
"%NSSM%" set "%SERVICE_NAME%" AppEnvironmentExtra "CONFIG_PATH=%INSTALL_DIR%\config.json"

:: 충돌 시 복구 설정: 1분 후 재시작 (3회), 이후 10분 후 재시작
"%NSSM%" set "%SERVICE_NAME%" AppThrottle 1500
"%NSSM%" set "%SERVICE_NAME%" AppExit Default Restart

:: 로그 설정
"%NSSM%" set "%SERVICE_NAME%" AppStdout "%INSTALL_DIR%\logs\stdout.log"
"%NSSM%" set "%SERVICE_NAME%" AppStderr "%INSTALL_DIR%\logs\stderr.log"
"%NSSM%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM%" set "%SERVICE_NAME%" AppRotateBytes 5242880

:: ── Windows Defender 예외 등록 ───────────────────────
echo [5/6] Windows Defender 예외 등록...
powershell -command "Add-MpPreference -ExclusionPath '%INSTALL_DIR%'" >nul 2>&1

:: ── 서비스 시작 ──────────────────────────────────────
echo [6/6] 서비스 시작...
net start "%SERVICE_NAME%"
if errorlevel 1 (
    echo [경고] 서비스 시작 실패. 로그를 확인하세요: %INSTALL_DIR%\logs\
) else (
    echo       서비스가 성공적으로 시작되었습니다!
)

echo.
echo ════════════════════════════════════════════════════════
echo   설치 완료!
echo.
echo   설치 경로: %INSTALL_DIR%
echo   서비스명:  %SERVICE_NAME%
echo   로그 위치: %INSTALL_DIR%\logs\agent.log
echo.
echo   서비스 상태 확인:
echo     services.msc 열기 → "OO오피스텔 주차 관리 에이전트" 확인
echo.
echo   문의: 관리 담당자에게 연락하세요
echo ════════════════════════════════════════════════════════
echo.
pause
