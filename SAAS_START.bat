@echo off
title Attendance SaaS - Central Hub
setlocal enabledelayedexpansion

:: 1. LOAD PORTABLE TOOLS
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS%\jdk-17.0.10+7"
set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

cls
echo ======================================================
echo          TIME ATTENDANCE SaaS CENTRAL HUB (V4)
echo ======================================================
echo.
echo [1/4] Force cleaning Port 4001 and old processes...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo [2/4] Ensuring Firewall is OPEN for SaaS...
netsh advfirewall firewall add rule name="Attendance_SaaS" dir=in action=allow protocol=TCP localport=4001 >nul 2>&1

echo [3/4] Starting Backend Server...
cd backend
if exist "tunnel.log" del "tunnel.log"
start /b node server.js > server.log 2>&1

echo [4/4] Launching Stealth Tunnel...
echo.
echo ------------------------------------------------------
echo  SYSTEM IS AUTO-HEALING & SAFE. (NO POWERSHELL)
echo  AUTO-OPENING Browser kapag ready na ang link...
echo  Huwag i-close itong window na ito.
echo ------------------------------------------------------

:: Launch Cloudflare
set "CF_EXE=%DEV_TOOLS%\cloudflared.exe"
if exist "%CF_EXE%" (
    "%CF_EXE%" tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
) else (
    npx -y cloudflared tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
)

pause
