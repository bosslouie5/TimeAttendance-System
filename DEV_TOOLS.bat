@echo off
title TIMEKEY MASTER TOOLBOX - PRO EDITION (V6.5)
setlocal enabledelayedexpansion

:: PATHS configuration
set "ROOT_DIR=%~dp0"
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "GIT_EXE=%DEV_TOOLS%\Git\cmd\git.exe"
set "ADB_EXE=%DEV_TOOLS%\platform-tools\adb.exe"

:: LOCK PORTABLE ENVIRONMENT
set "PATH=%NODE_PATH%;%NODE_PATH%\node_modules\npm\bin;%DEV_TOOLS%\platform-tools;%DEV_TOOLS%\Git\cmd;%PATH%"

:MENU
cd /d "%ROOT_DIR%"
set "choice="
set "last_backup=NEVER"
if exist "SOURCE_BACKUP\timestamp.txt" set /p last_backup=<"SOURCE_BACKUP\timestamp.txt"

cls
echo   ______________________________________________________
echo  ^|                                                      ^|
echo  ^|           TIMEKEY MASTER CONTROL CENTER v6.5       ^|
echo  ^|       Infrastructure ^& Developer Productivity Tool    ^|
echo  ^|______________________________________________________^|
echo.
echo   [ SYSTEM STATUS ]
echo   Mode: Developer Testing (Port 4002)
echo   Last Safety Backup: !last_backup!
echo.
echo   [1] DEPLOY ALL TO WEB (Commit 4001 to GitHub)
echo   [2] RUN TEST LAB (Port 4002 - Local/Online)
echo   [3] REBUILD ALL LAB UI (Refresh 4002 Code)
echo   [4] SYNC LAB TO PRODUCTION (Move 4002 Updates to 4001)
echo.
echo   [B] CREATE SAFETY BACKUP (Checkpoint)
echo   [R] REVERT SOURCE CODE (Restore from Checkpoint)
echo.
echo   [S] START SAAS HUB (Production Port 4001)
echo   [6] STOP ALL SYSTEMS (Stop SaaS ^& Browsers)
echo   [7] EXIT ALL
echo.
echo   ------------------------------------------------------
set /p choice="Master Tropa, choose an action: "

if /i "%choice%"=="1" goto BUILD_DEPLOY_ALL
if /i "%choice%"=="2" goto RUN_LAB
if /i "%choice%"=="3" goto REBUILD_LAB_ALL
if /i "%choice%"=="4" goto SYNC_DATA
if /i "%choice%"=="B" goto BACKUP_CODE
if /i "%choice%"=="R" goto REVERT_CODE
if /i "%choice%"=="S" goto SAAS_START
if /i "%choice%"=="6" goto STOP_ALL
if /i "%choice%"=="7" exit
goto MENU

:BACKUP_CODE
cls
echo.
echo [*] Creating High-Stability Source Backup...
if exist "SOURCE_BACKUP" rd /s /q "SOURCE_BACKUP"
mkdir "SOURCE_BACKUP"
mkdir "SOURCE_BACKUP\backend"
mkdir "SOURCE_BACKUP\web-dev\src"
mkdir "SOURCE_BACKUP\web-admin\src"
mkdir "SOURCE_BACKUP\mobile-app\src"

echo [...] Copying Backend...
copy "backend\*.js" "SOURCE_BACKUP\backend\" /y >nul 2>&1
copy "backend\*.json" "SOURCE_BACKUP\backend\" /y >nul 2>&1
echo [...] Copying Web-Dev...
xcopy /s /i /y "web-dev\src" "SOURCE_BACKUP\web-dev\src" >nul 2>&1
echo [...] Copying Web-Admin...
xcopy /s /i /y "web-admin\src" "SOURCE_BACKUP\web-admin\src" >nul 2>&1
echo [...] Copying Mobile-App...
xcopy /s /i /y "mobile-app\src" "SOURCE_BACKUP\mobile-app\src" >nul 2>&1
if exist "package.json" copy "package.json" "SOURCE_BACKUP\" /y >nul 2>&1

:: Record timestamp
set "tstamp=%date% %time%"
echo !tstamp! > "SOURCE_BACKUP\timestamp.txt"

echo.
echo [SUCCESS] Stable point created at !tstamp!.
ping 127.0.0.1 -n 3 >nul
goto MENU

:REVERT_CODE
cls
echo.
if not exist "SOURCE_BACKUP" (
    echo [!] CRITICAL ERROR: No backup archive found.
    echo Please create a backup first using [B].
    pause
    goto MENU
)

set /p tstamp=<"SOURCE_BACKUP\timestamp.txt"
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo    WARNING: IRREVERSIBLE ACTION DETECTED
echo    Restoring to backup from: !tstamp!
echo    All current changes will be PERMANENTLY DELETED.
echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
set /p confirm="Type 'CONFIRM' to proceed with restoration: "
if /i "%confirm%" neq "CONFIRM" (
    echo [!] Restoration aborted by user.
    pause
    goto MENU
)

echo [*] Nuking current source and restoring from stable point...
xcopy /s /i /y "SOURCE_BACKUP\backend" "backend" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-dev\src" "web-dev\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-admin\src" "web-admin\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\mobile-app\src" "mobile-app\src" >nul 2>&1
if exist "SOURCE_BACKUP\package.json" copy /y "SOURCE_BACKUP\package.json" "." >nul 2>&1

echo.
echo [SUCCESS] System reverted to !tstamp!.
pause
goto MENU

:SAAS_START
cls
echo.
echo [*] SaaS Production Hub (Port 4001)
echo [?] Select Deployment Mode:
echo  [0] ONLINE - Cloudflare Tunnel (External Hub)
echo  [1] LOCAL - Local Production Test
echo.
set /p saas_mode="Mode Choice (0/1): "
if "%saas_mode%"=="0" goto SAAS_ONLINE
if "%saas_mode%"=="1" goto SAAS_LOCAL
goto MENU

:SAAS_ONLINE
cls
echo [*] Activating SaaS Production Hub ONLINE (Port 4001)...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=production
start /b node server.js > server_prod.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
popd
echo [ONLINE] SaaS Hub is LIVE. Check tunnel.log for public URL.
ping 127.0.0.1 -n 6 >nul
goto MENU

:SAAS_LOCAL
cls
echo [*] Activating SaaS Production Hub LOCAL (Port 4001)...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=production
start /b node server.js > server_prod.log 2>&1
popd
echo [SUCCESS] SaaS System running on Port 4001.
ping 127.0.0.1 -n 4 >nul
start "" "http://127.0.0.1:4001/dev"
goto MENU

:REBUILD_LAB_ALL
cls
echo.
echo [*] Executing Full UI Lab Rebuild (Updating 4002 Code)...
pushd web-dev
call npx vite build --outDir dist-test --emptyOutDir
popd
pushd web-admin
call npx vite build --outDir dist-test --emptyOutDir
popd
pushd mobile-app
call npx vite build --outDir dist-test --emptyOutDir
popd
echo.
echo [SUCCESS] All Lab Builds Refreshed.
pause
goto MENU

:RUN_LAB
cls
echo.
echo [*] Starting Lab Testing on Port 4002...
if not exist "backend\data-test.json" (
    if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul 2>&1
)
echo [?] Select Lab Deployment Environment:
echo  [0] ONLINE - Cloudflare Tunnel (External Access)
echo  [1] LOCAL - USB Bridge (Android Debug Mode)
echo.
set /p lab_mode="Environment Choice (0/1): "
if "%lab_mode%"=="0" goto LAB_ONLINE
if "%lab_mode%"=="1" goto LAB_LOCAL
goto MENU

:LAB_ONLINE
cls
echo [*] Activating SaaS Lab Tunnel (Port 4002)...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
popd
echo [ONLINE] Tunneling active. Check tunnel.log for public URL.
ping 127.0.0.1 -n 6 >nul
goto MENU

:LAB_LOCAL
cls
echo [*] Activating Local USB Bridge...
"%ADB_EXE%" reverse tcp:4002 tcp:4002
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1
popd
echo [ACTIVE] Launching Lab Control Center...
ping 127.0.0.1 -n 4 >nul
start "" "http://127.0.0.1:4002/dev"
goto MENU

:STOP_ALL
cls
echo.
echo [*] Global System Force Stop in progress...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /IM chrome.exe /T >nul 2>&1
taskkill /F /IM msedge.exe /T >nul 2>&1
echo.
echo [CLEAN] All background processes terminated.
pause
goto MENU

:BUILD_DEPLOY_ALL
cls
echo.
echo !!! INITIATING GLOBAL PRODUCTION DEPLOYMENT (GitHub Commit) !!!
echo.
echo [*] Step 1: Building Web Admin...
pushd web-admin
call npm run build
popd
echo [*] Step 2: Building Web Dev...
pushd web-dev
call npm run build
popd
echo [*] Step 3: Building Mobile App Web-View...
pushd mobile-app
call npm run build
popd

echo [*] Step 4: Preparing Deployment Folder...
if exist "web_deploy" rd /s /q "web_deploy"
mkdir "web_deploy"
mkdir "web_deploy\dev"
mkdir "web_deploy\app"
echo. > "web_deploy\.nojekyll"
echo Last Deploy: %date% %time% > "web_deploy\version.txt"

echo [*] Step 5: Copying Builds...
xcopy /s /i /y "web-admin\dist\*" "web_deploy\"
xcopy /s /i /y "web-dev\dist\*" "web_deploy\dev\"
xcopy /s /i /y "mobile-app\dist\*" "web_deploy\app\"

echo [*] Step 6: Deploying to GitHub Pages...
cd /d "%ROOT_DIR%\web_deploy"
"%GIT_EXE%" init >nul 2>&1
"%GIT_EXE%" config user.name "bosslouie5"
"%GIT_EXE%" config user.email "johnlouiecruz23@gmail.com"
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Production Build: %date% %time%" >nul 2>&1
"%GIT_EXE%" remote add origin https://github.com/bosslouie5/TimeAttendance-System.git >nul 2>&1
"%GIT_EXE%" push -f origin master:gh-pages

echo [*] Step 7: Updating Source Repository...
cd /d "%ROOT_DIR%"
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Source Update: %date% %time%" >nul 2>&1
"%GIT_EXE%" push origin main

echo.
echo [SUCCESS] PRODUCTION SYSTEM IS LIVE ON GITHUB!
rd /s /q "web_deploy"
pause
goto MENU

:SYNC_DATA
cls
echo.
echo !!! SYNCING LAB TO PRODUCTION (4002 -> 4001) !!!
echo This will update the Production UI with current Lab progress.
set /p confirm="Proceed? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
echo [*] Syncing distribution folders...
if exist "web-dev\dist-test" (rd /s /q "web-dev\dist" >nul 2>&1 & xcopy /s /i /y "web-dev\dist-test" "web-dev\dist" >nul 2>&1)
if exist "web-admin\dist-test" (rd /s /q "web-admin\dist" >nul 2>&1 & xcopy /s /i /y "web-admin\dist-test" "web-admin\dist" >nul 2>&1)
if exist "mobile-app\dist-test" (rd /s /q "mobile-app\dist" >nul 2>&1 & xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist" >nul 2>&1)
echo.
echo [SUCCESS] Lab logic successfully pushed to Production!
pause
goto MENU
