@echo off
chcp 65001 >nul

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║     OO오피스텔 주차 관리 에이전트 제거 프로그램          ║
echo ╚══════════════════════════════════════════════════════╝
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo [오류] 관리자 권한 필요. 우클릭 → 관리자 권한으로 실행.
    pause & exit /b 1
)

set SERVICE_NAME=OfficetelParkingAgent
set INSTALL_DIR=C:\Program Files\OfficetelParking
set NSSM=%INSTALL_DIR%\nssm.exe

echo 서비스 중지 중...
net stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 2 /nobreak >nul

echo 서비스 제거 중...
"%NSSM%" remove "%SERVICE_NAME%" confirm >nul 2>&1

echo 파일 제거 중... (로그는 보존)
if exist "%INSTALL_DIR%\officetel_agent.exe" del /f /q "%INSTALL_DIR%\officetel_agent.exe"
if exist "%INSTALL_DIR%\nssm.exe"            del /f /q "%INSTALL_DIR%\nssm.exe"

echo.
echo 제거 완료. 로그 파일은 %INSTALL_DIR%\logs 에 보존됩니다.
echo 완전 삭제가 필요하면 해당 폴더를 수동으로 삭제하세요.
pause
