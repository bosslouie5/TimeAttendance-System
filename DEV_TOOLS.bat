@echo off
title TIMEKEY MASTER TOOLBOX (V5.5)
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
echo           TIMEKEY MASTER TOOLBOX (V5.5)
echo %CYAN%======================================================%RESET%
echo.
echo  [1] %GREEN%🚀 DEPLOY PRODUCTION (4001 to GITHUB)%RESET%
echo  [2] %YELLOW%🧪 RUN TEST LAB (PORT 4002)%RESET%
echo  [3] %CYAN%🔨 BUILD LAB UI (FOR PORT 4002)%RESET%
echo  [4] %MAGENTA%🔄 SYNC LAB TO PRODUCTION%RESET%
echo.
echo  [S] %CYAN%🌐 START SAAS HUB (PORT 4001)%RESET%
echo  [6] %RED%🛑 STOP EVERYTHING (Kill Server ^& Browser)%RESET%
echo  [7] EXIT
echo.
echo %CYAN%------------------------------------------------------%RESET%
set /p choice="Pili ka, Master Tropa: "

if "%choice%"=="1" goto BUILD_DEPLOY
if "%choice%"=="2" goto RUN_LAB
if "%choice%"=="3" goto BUILD_LAB
if "%choice%"=="4" goto SYNC_DATA
if /i "%choice%"=="S" goto SAAS_START
if "%choice%"=="6" goto STOP_ALL
if "%choice%"=="7" exit
goto MENU

:LOADING
echo.
echo %CYAN%  [ NINJA LOADING ] %RESET%
echo %YELLOW%  Initializing System Components...%RESET%
echo.
echo  [**********          ] 25%%
ping 127.0.0.1 -n 2 >nul
echo  [****************    ] 50%%
ping 127.0.0.1 -n 2 >nul
echo  [********************] 100%%
echo.
echo %GREEN%  [OK] Server Active. Waiting for Handshake...%RESET%
echo.
goto :EOF

:BUILD_LAB
echo.
echo [%CYAN%*%RESET%] Building UI for Test Lab...
cd web-dev
call npx vite build --outDir dist-test
cd ..
echo [%GREEN%SUCCESS%RESET%] Lab Build Ready in dist-test folder.
pause
goto MENU

:BUILD_DEPLOY
echo.
echo [%GREEN%*%RESET%] Step 1: Pushing Build to GitHub Pages...
cd web-dev/dist
"%GIT_EXE%" init >nul 2>&1
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Build V5.5: Production Update"
"%GIT_EXE%" remote add origin https://github.com/bosslouie5/TimeAttendance-System.git >nul 2>&1
"%GIT_EXE%" push -f origin master:gh-pages
cd ../..
echo [%GREEN%*%RESET%] Step 2: Updating Source and Registry...
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Ninja Build V5.5: Source Sync"
"%GIT_EXE%" push origin main
echo %GREEN%[SUCCESS] System is now Live on GitHub!%RESET%
pause
goto MENU

:RUN_LAB
echo.
if not exist "backend\data-test.json" (
    echo [%YELLOW%*%RESET%] Initializing Lab Data from Production...
    if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul
) else (
    echo [%GREEN%*%RESET%] Using existing Lab Data 4002.
)
echo [?] Saan mo ite-test, Master?
echo  [0] ONLINE - SaaS Tunnel
echo  [1] LOCAL - USB Bridge
set /p lab_mode="Pili ka (0/1): "
if "%lab_mode%"=="0" goto LAB_ONLINE
if "%lab_mode%"=="1" goto LAB_LOCAL
echo %RED%Mali ang pindot mo, Master.%RESET%
pause
goto MENU

:LAB_ONLINE
cls
call :LOADING
echo [%YELLOW%*%RESET%] Starting SaaS Lab on Port 4002...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=test
if exist "tunnel.log" del "tunnel.log"
start /b node server.js > server_test.log 2>&1
echo [%YELLOW%*%RESET%] Launching Tunnel ^& Auto-Opening Browser...
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
cd ..
echo %GREEN%SUCCESS: System running in background.%RESET%
ping 127.0.0.1 -n 5 >nul
goto MENU

:LAB_LOCAL
cls
call :LOADING
echo [%YELLOW%*%RESET%] Activating USB Reverse Bridge...
"%ADB_EXE%" kill-server >nul 2>&1
"%ADB_EXE%" start-server >nul 2>&1
"%ADB_EXE%" reverse tcp:4002 tcp:4002
echo [%GREEN%DONE%RESET%] USB Bridge Active!
echo [%YELLOW%*%RESET%] Starting Local Lab on Port 4002...
taskkill /F /IM node.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
start msedge.exe --app="http://127.0.0.1:4002/dev"
cd ..
echo %GREEN%SUCCESS: Local Lab started.%RESET%
ping 127.0.0.1 -n 3 >nul
goto MENU

:SYNC_DATA
echo %RED%!!! SYNC WARNING !!!%RESET%
echo Ililipat nito ang lahat ng Data at Build mula 4002 papuntang 4001.
set /p confirm="Sigurado ka ba, Master? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
echo [%MAGENTA%*%RESET%] Syncing Data and Build...
copy /y "backend\data-test.json" "backend\data.json"
if exist "web-dev\dist-test" (
    if exist "web-dev\dist" rd /s /q "web-dev\dist"
    xcopy /s /i /y "web-dev\dist-test" "web-dev\dist"
)
if exist "web-admin\dist-test" (
    if exist "web-admin\dist" rd /s /q "web-admin\dist"
    xcopy /s /i /y "web-admin\dist-test" "web-admin\dist"
)
echo [%GREEN%SUCCESS%RESET%] Lab is now synced to Production!
pause
goto MENU

:SAAS_START
cls
call :LOADING
echo [%CYAN%*%RESET%] Starting Official SAAS HUB Port 4001...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
cd backend
set SYSTEM_MODE=production
start /b node server.js > server.log 2>&1
echo [%CYAN%*%RESET%] Launching Stealth Tunnel...
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
cd ..
echo %GREEN%SUCCESS: SaaS Hub broadcasting...%RESET%
ping 127.0.0.1 -n 5 >nul
goto MENU

:STOP_ALL
echo [%RED%*%RESET%] Nuking all system processes and Browsers...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /IM chrome.exe /T >nul 2>&1
taskkill /F /IM msedge.exe /T >nul 2>&1
echo [%GREEN%DONE%RESET%] System Halted. All Browsers Closed.
pause
goto MENU
