@echo off
title TIMEKEY MASTER TOOLBOX (V6.0)
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
set "choice="
cls
echo %CYAN%======================================================%RESET%
echo           TIMEKEY MASTER TOOLBOX (V6.0)
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

if exist "web_deploy" rd /s /q "web_deploy"
mkdir "web_deploy"
mkdir "web_deploy\dev"
mkdir "web_deploy\app"

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

echo [%GREEN%*%RESET%] Pushing Unified Build to GitHub...
cd web_deploy
"%GIT_EXE%" init >nul 2>&1
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Global Build: Multi-Portal Sync"
"%GIT_EXE%" remote add origin https://github.com/bosslouie5/TimeAttendance-System.git >nul 2>&1
"%GIT_EXE%" push -f origin master:gh-pages

cd ..
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Source Sync"
"%GIT_EXE%" push origin main

echo.
echo %GREEN%[SUCCESS] SYSTEM IS NOW LIVE!%RESET%
rd /s /q "web_deploy"
pause
goto MENU

:RUN_LAB
set "lab_mode="
echo.
if not exist "backend\data-test.json" (
    if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul
)
echo [?] Saan mo ite-test, Master?
echo  [0] ONLINE - SaaS Tunnel (Port 4002)
echo  [1] LOCAL - USB Bridge (Port 4002)
set /p lab_mode="Pili ka (0/1): "
if "%lab_mode%"=="0" goto LAB_ONLINE
if "%lab_mode%"=="1" goto LAB_LOCAL
goto MENU

:LAB_ONLINE
cls
echo [%YELLOW%*%RESET%] Starting SaaS Lab on Port 4002...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
cd ..
echo %GREEN%SUCCESS: Lab System running in background.%RESET%
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
set "confirm="
echo %YELLOW%!!! SYNCING UI/LOGIC ONLY !!!%RESET%
set /p confirm="Proceed with UI Sync 4002 -> 4001? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
echo [%MAGENTA%*%RESET%] Transferring Build Files...

if exist "web-dev\dist-test" (
    if exist "web-dev\dist" rd /s /q "web-dev\dist"
    xcopy /s /i /y "web-dev\dist-test" "web-dev\dist"
)
if exist "web-admin\dist-test" (
    if exist "web-admin\dist" rd /s /q "web-admin\dist"
    xcopy /s /i /y "web-admin\dist-test" "web-admin\dist"
)
if exist "mobile-app\dist-test" (
    if exist "mobile-app\dist" rd /s /q "mobile-app\dist"
    xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist"
)

echo [%GREEN%SUCCESS%RESET%] UI Logic is now synced to Production!
pause
goto MENU

:SAAS_START
cls
echo [%CYAN%*%RESET%] Starting Official SAAS HUB Port 4001...
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
echo [%RED%*%RESET%] Executing Global System Nuke...

:: Kill processes using standard Taskkill
taskkill /F /T /IM node.exe >nul 2>&1
taskkill /F /T /IM cloudflared.exe >nul 2>&1
taskkill /F /T /IM msedge.exe >nul 2>&1
taskkill /F /T /IM chrome.exe >nul 2>&1

:: Fallback: Use PowerShell for stuck background processes
powershell -Command "Stop-Process -Name node, cloudflared, msedge, chrome -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo %GREEN%[SUCCESS] All systems and browsers have been force-stopped.%RESET%
pause
goto MENU
