@echo off
title TIMEKEY MASTER TOOLBOX (V5.7)
setlocal enabledelayedexpansion

:: COLORS
set "ESC="
set "CYAN=%ESC%[36m"
set "YELLOW=%ESC%[33m"
set "GREEN=%ESC%[32m"
set "MAGENTA=%ESC%[35m"
set "RED=%ESC%[31m"
set "RESET=%ESC%[0m"

:: PATHS
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "GIT_EXE=%DEV_TOOLS%\Git\cmd\git.exe"
set "ADB_EXE=%DEV_TOOLS%\platform-tools\adb.exe"
set "PATH=%NODE_PATH%;%DEV_TOOLS%\platform-tools;%PATH%"

:MENU
cls
echo %CYAN%======================================================%RESET%
echo           TIMEKEY MASTER TOOLBOX (V5.7)
echo %CYAN%======================================================%RESET%
echo.
echo  [1] %GREEN%🚀 DEPLOY ALL TO WEB (Admin, Dev, and App)%RESET%
echo  [2] %YELLOW%🧪 RUN TEST LAB (PORT 4002)%RESET%
echo  [3] %CYAN%🔨 REBUILD ALL LAB UI (PORT 4002)%RESET%
echo  [4] %MAGENTA%🔄 SYNC LAB TO PRODUCTION%RESET%
echo.
echo  [S] %CYAN%🌐 START SAAS HUB (PORT 4001)%RESET%
echo  [6] %RED%🛑 STOP EVERYTHING (Kill Server and Browser)%RESET%
echo  [7] EXIT
echo.
echo %CYAN%------------------------------------------------------%RESET%
set /p choice="Pili ka, Master Tropa: "

if "%choice%"=="1" goto BUILD_DEPLOY_ALL
if "%choice%"=="2" goto RUN_LAB
if "%choice%"=="3" goto REBUILD_LAB_ALL
if "%choice%"=="4" goto SYNC_DATA
if /i "%choice%"=="S" goto SAAS_START
if "%choice%"=="6" goto STOP_ALL
if "%choice%"=="7" exit
goto MENU

:REBUILD_LAB_ALL
echo.
echo [%CYAN%*%RESET%] Building Dev Portal (Lab)...
cd web-dev
call npx vite build --outDir dist-test
cd ..
echo [%CYAN%*%RESET%] Building Admin Portal (Lab)...
cd web-admin
call npx vite build --outDir dist-test
cd ..
echo [%CYAN%*%RESET%] Building Mobile App (Lab)...
cd mobile-app
call npx vite build --outDir dist-test
cd ..
echo [%GREEN%SUCCESS%RESET%] All Lab Builds Ready.
pause
goto MENU

:BUILD_DEPLOY_ALL
echo.
echo %YELLOW%!!! PREPARING GLOBAL DEPLOYMENT !!!%RESET%
echo This will update Admin, Dev, and Mobile App on GitHub.
echo.

:: 1. Create a unified deploy folder
if exist "web_deploy" rd /s /q "web_deploy"
mkdir "web_deploy"
mkdir "web_deploy\dev"
mkdir "web_deploy\app"

:: 2. Build everything to production dist
echo [%CYAN%*%RESET%] Building Admin (Root)...
cd web-admin
call npx vite build
cd ..
xcopy /s /i /y "web-admin\dist" "web_deploy"

echo [%CYAN%*%RESET%] Building Dev Portal...
cd web-dev
call npx vite build
cd ..
xcopy /s /i /y "web-dev\dist" "web_deploy\dev"

echo [%CYAN%*%RESET%] Building Mobile App (PWA)...
cd mobile-app
call npx vite build
cd ..
xcopy /s /i /y "mobile-app\dist" "web_deploy\app"

:: 3. Push to GitHub gh-pages
echo [%GREEN%*%RESET%] Pushing Unified Build to GitHub...
cd web_deploy
"%GIT_EXE%" init >nul 2>&1
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Global Build V5.7: Multi-Portal Sync"
"%GIT_EXE%" remote add origin https://github.com/bosslouie5/TimeAttendance-System.git >nul 2>&1
"%GIT_EXE%" push -f origin master:gh-pages

:: 4. Update Source Repo
cd ..
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Source Sync V5.7"
"%GIT_EXE%" push origin main

echo.
echo %GREEN%[SUCCESS] SYSTEM IS NOW LIVE!%RESET%
echo Admin: https://bosslouie5.github.io/TimeAttendance-System/
echo Dev:   https://bosslouie5.github.io/TimeAttendance-System/dev/
echo App:   https://bosslouie5.github.io/TimeAttendance-System/app/
echo.
rd /s /q "web_deploy"
pause
goto MENU

:RUN_LAB
echo.
if not exist "backend\data-test.json" (
    echo [%YELLOW%*%RESET%] Initializing Lab Data from Production...
    if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul
)
echo [?] Saan mo ite-test, Master?
echo  [0] ONLINE - SaaS Tunnel
echo  [1] LOCAL - USB Bridge
set /p lab_mode="Pili ka (0/1): "
if "%lab_mode%"=="0" goto LAB_ONLINE
if "%lab_mode%"=="1" goto LAB_LOCAL
goto MENU

:LAB_ONLINE
cls
echo [%YELLOW%*%RESET%] Starting SaaS Lab...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
cd ..
echo %GREEN%SUCCESS: System running. Check GitHub for link update.%RESET%
pause
goto MENU

:LAB_LOCAL
cls
echo [%YELLOW%*%RESET%] Activating USB Bridge...
"%ADB_EXE%" reverse tcp:4002 tcp:4002
cd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
start msedge.exe --app="http://127.0.0.1:4002/dev"
cd ..
goto MENU

:SYNC_DATA
echo %RED%!!! SYNC WARNING !!!%RESET%
set /p confirm="Sync 4002 to 4001? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
copy /y "backend\data-test.json" "backend\data.json"
xcopy /s /i /y "web-dev\dist-test" "web-dev\dist"
xcopy /s /i /y "web-admin\dist-test" "web-admin\dist"
xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist"
echo %GREEN%Synced!%RESET%
pause
goto MENU

:SAAS_START
cls
echo [%CYAN%*%RESET%] Starting SAAS HUB Port 4001...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=production
start /b node server.js > server.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
cd ..
echo %GREEN%Live on Port 4001!%RESET%
pause
goto MENU

:STOP_ALL
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
echo %GREEN%All Halted.%RESET%
pause
goto MENU
