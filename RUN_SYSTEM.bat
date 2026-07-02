@echo off
title [ONLINE] Time Attendance - Production System
setlocal enabledelayedexpansion

:: Set Portable Environment
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS%\jdk-17.0.10+7"

:: Auto-download tools if missing (Rule 4)
if not exist "%NODE_PATH%\node.exe" (
    echo [!] Tools not found in DEV_TOOLS. Downloading now...
    powershell -ExecutionPolicy Bypass -File ".\SET_UP_TOOLS.ps1"
)

set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

set "ESC="
set "GREEN=%ESC%[32m"
set "CYAN=%ESC%[36m"
set "RESET=%ESC%[0m"

cls
echo %GREEN%======================================================%RESET%
echo           RUNNING ONLINE PRODUCTION SYSTEM
echo %GREEN%======================================================%RESET%
echo.
echo  [%GREEN%STATUS%RESET%] System is LIVE on Port 4001
echo  [%GREEN%STATUS%RESET%] Database: data.json (Real Clients)
echo.

:: Detect IP for Admin Portal
set PORT=4001
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4 Address"') do (set "raw_ip=%%a" & set "ip=!raw_ip: =!" & set "LAST_IP=!ip!")
echo  [%CYAN%LINKS%RESET%] PORTAL: http://%LAST_IP%:4001/portal/[tenant-id]
echo.
echo %CYAN%------------------------------------------------------%RESET%
echo  KEEP THIS WINDOW OPEN TO SERVE YOUR CLIENTS.
echo  (Para sa Development, gamitin ang DEV_SYSTEM.bat)
echo %CYAN%------------------------------------------------------%RESET%
echo.
echo [%YELLOW%*%RESET%] Clearing Port 4001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4001 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

cd backend
set SYSTEM_MODE=production
node server.js
pause
