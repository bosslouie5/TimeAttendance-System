@echo off
title Time Attendance All-in-One Bootstrapper
echo ==========================================
echo    TIME ATTENDANCE PROJECT - FULL SETUP
echo ==========================================

:: 0. ENSURE TOOLS ARE PRESENT (Rule 4)
echo [0/5] Checking Dev Tools...
powershell -ExecutionPolicy Bypass -File ".\SET_UP_TOOLS.ps1"

:: Set Portable Environment
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS%\jdk-17.0.10+7"
set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

:: 1. KILL OLD PROCESSES
echo [1/5] Cleaning up old processes...
taskkill /F /IM node.exe /T >nul 2>&1

:: 2. FIREWALL FIX (SUREBALL)
echo [2/5] Ensuring Firewall is OPEN...
netsh advfirewall firewall add rule name="Time Attendance 4001" dir=in action=allow protocol=TCP localport=4001 >nul 2>&1

:: 3. BUILD WEB APPS
echo [3/5] Building Web Dashboards...
echo Building Web-Dev...
cd web-dev
call npm install --quiet
call npm run build
cd ..

echo Building Web-Admin...
cd web-admin
call npm install --quiet
call npm run build
cd ..

:: 4. PREPARE MOBILE SYNC
echo [4/5] Syncing Mobile App Data...
cd mobile-app
call npm install --quiet
:: Use Portable ADB
adb reverse tcp:4002 tcp:4002 >nul 2>&1
adb reverse tcp:4001 tcp:4001 >nul 2>&1
cd ..

:: 5. START UNIFIED SERVER
echo [5/5] Starting Unified Server on Port 4001...
echo.
echo ==========================================
echo SUCCESS! Open your browser to:
echo.
echo WEB ADMIN (Local):   http://localhost:4001
echo WEB ADMIN (Network): http://10.222.166.29:4001
echo.
echo MOBILE API:          http://10.222.166.29:4001/api
echo ==========================================
echo.
cd backend
call npm install --quiet
node server.js
pause
