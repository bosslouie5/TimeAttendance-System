@echo off
title TIMEKEY MASTER TOOLBOX - PRO EDITION (V6.6)
setlocal enabledelayedexpansion

:: PATHS configuration
set "ROOT_DIR=%~dp0"
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "GIT_EXE=%DEV_TOOLS%\Git\cmd\git.exe"
set "ADB_EXE=%DEV_TOOLS%\platform-tools\adb.exe"

:: MONGODB CONFIGURATION (Atlas Cloud)
:: ISOLATED ENVIRONMENTS: PRODUCTION ONLY
:: Port 4002 will strictly use LOCAL JSON files for privacy.
set "MONGODB_URI_PROD=mongodb+srv://johnlouiecruz23_db_user:b6VvErL6I1HPFG06@timekeydev.2fvpmdy.mongodb.net/TimeKeyPROD?retryWrites=true&w=majority&appName=TimeKeyDev"

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
echo  ^|           TIMEKEY MASTER CONTROL CENTER v6.6       ^|
echo  ^|       Infrastructure ^& Developer Productivity Tool    ^|
echo  ^|______________________________________________________^|
echo.
echo   [ SYSTEM STATUS ]
echo   Mode: Developer Testing (Port 4002)
echo   Database: MongoDB Atlas (Cloud)
echo   Last Safety Backup: !last_backup!
echo.
echo   [1] DEPLOY ALL TO WEB (Sync 4001 to GitHub/Render)
echo   [2] RUN TEST LAB (Port 4002 - Local/Online)
echo   [3] REBUILD ALL LAB UI (Build 4002 Code)
echo   [4] SYNC LAB TO PRODUCTION (Move 4002 to 4001)
echo.
echo   [B] CREATE SAFETY BACKUP (Checkpoint)
echo   [R] REVERT SOURCE CODE (Restore from Checkpoint)
echo.
echo   [S] START SAAS HUB (Production Port 4001)
echo   [6] STOP ALL SYSTEMS (Stop Node ^& Tunnel)
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

set "tstamp=%date% %time%"
echo !tstamp! > "SOURCE_BACKUP\timestamp.txt"
echo [SUCCESS] Stable point created.
ping 127.0.0.1 -n 3 >nul
goto MENU

:REVERT_CODE
cls
echo.
if not exist "SOURCE_BACKUP" (
    echo [!] ERROR: No backup found.
    pause
    goto MENU
)
set /p confirm="Type 'CONFIRM' to restore: "
if /i "%confirm%" neq "CONFIRM" goto MENU
xcopy /s /i /y "SOURCE_BACKUP\backend" "backend" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-dev\src" "web-dev\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-admin\src" "web-admin\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\mobile-app\src" "mobile-app\src" >nul 2>&1
echo [SUCCESS] Reverted to stable point.
pause
goto MENU

:SAAS_START
cls
echo.
echo [*] Starting SaaS Production (Port 4001)
echo  [0] ONLINE - Cloudflare Tunnel
echo  [1] LOCAL - Internal Network Only
set /p saas_mode="Choice: "
if "%saas_mode%"=="0" goto SAAS_ONLINE
if "%saas_mode%"=="1" goto SAAS_LOCAL
goto MENU

:SAAS_ONLINE
cls
echo [*] Activating SaaS Port 4001 ONLINE...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=production
set "MONGODB_URI=%MONGODB_URI_PROD%"
start /b node server.js > server_prod.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4001 > tunnel.log 2>&1
popd
echo [LIVE] Check tunnel.log for link.
ping 127.0.0.1 -n 5 >nul
goto MENU

:SAAS_LOCAL
cls
echo [*] Activating SaaS Port 4001 LOCAL...
taskkill /F /IM node.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=production
set "MONGODB_URI=%MONGODB_URI_PROD%"
start /b node server.js > server_prod.log 2>&1
popd
echo [LIVE] Running on http://localhost:4001
ping 127.0.0.1 -n 3 >nul
start "" "http://localhost:4001/dev"
goto MENU

:REBUILD_LAB_ALL
cls
echo.
echo [*] Step 3: Executing Full UI Lab Rebuild (4002 Code)...
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
echo [SUCCESS] Lab Builds (4002) Refreshed.
pause
goto MENU

:RUN_LAB
cls
echo.
echo [*] Starting Lab Testing on Port 4002...
echo  [0] ONLINE - Cloudflare Tunnel
echo  [1] LOCAL - USB Bridge
set /p lab_mode="Choice: "
if "%lab_mode%"=="0" goto LAB_ONLINE
if "%lab_mode%"=="1" goto LAB_LOCAL
goto MENU

:LAB_ONLINE
cls
echo [*] Activating Lab Port 4002 ONLINE...
echo [*] DATA MODE: LOCAL JSON (Laptop Privacy Active)
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=test
set "MONGODB_URI="
start /b node server.js > server_test.log 2>&1
start /b "" "%DEV_TOOLS%\cloudflared.exe" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
popd
echo [LIVE] Monitoring tunnel.log...
ping 127.0.0.1 -n 6 >nul
goto MENU

:LAB_LOCAL
cls
echo [*] Activating Lab Port 4002 LOCAL...
echo [*] DATA MODE: LOCAL JSON (Laptop Privacy Active)
"%ADB_EXE%" reverse tcp:4002 tcp:4002
taskkill /F /IM node.exe /T >nul 2>&1
pushd backend
set SYSTEM_MODE=test
set "MONGODB_URI="
start /b node server.js > server_test.log 2>&1
popd
echo [LIVE] Running on http://localhost:4002
ping 127.0.0.1 -n 4 >nul
start "" "http://localhost:4002/dev"
goto MENU

:STOP_ALL
cls
echo [*] Global System Force Stop...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
echo [CLEAN] All processes stopped.
pause
goto MENU

:BUILD_DEPLOY_ALL
cls
echo.
echo !!! Step 1: INITIATING GLOBAL PRODUCTION DEPLOYMENT !!!
echo.
echo [*] Building Production Assets...
pushd web-admin
call npm run build
popd
pushd web-dev
call npm run build
popd
pushd mobile-app
call npm run build
popd

echo [*] Preparing GitHub Pages Deployment...
if exist "web_deploy" rd /s /q "web_deploy"
mkdir "web_deploy"
mkdir "web_deploy\dev"
mkdir "web_deploy\app"
mkdir "web_deploy\apks"
xcopy /s /i /y "web-admin\dist\*" "web_deploy\"
xcopy /s /i /y "web-dev\dist\*" "web_deploy\dev\"
xcopy /s /i /y "mobile-app\dist\*" "web_deploy\app\"
echo [*] Copying APKs to Deployment...
if not exist "web_deploy\apks" mkdir "web_deploy\apks"
xcopy /y "backend\apks\*" "web_deploy\apks\"
:: Ensure a Master APK exists for GitHub distribution
if not exist "web_deploy\apks\TimeKey_Master.apk" (
    echo [*] Creating Master APK from first available build...
    for %%f in (backend\apks\*.apk) do (
        copy "%%f" "web_deploy\apks\TimeKey_Master.apk" /y >nul
        goto :MASTER_DONE
    )
)
:MASTER_DONE
echo Last Deploy: %date% %time% > "web_deploy\version.txt"

echo [*] Pushing to GitHub (Render will auto-deploy)...
cd /d "%ROOT_DIR%"
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Production Sync: %date% %time%" >nul 2>&1
"%GIT_EXE%" push origin main

cd /d "%ROOT_DIR%\web_deploy"
"%GIT_EXE%" init >nul 2>&1
"%GIT_EXE%" config user.name "bosslouie5"
"%GIT_EXE%" config user.email "johnlouiecruz23@gmail.com"
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Build Update: %date% %time%" >nul 2>&1
"%GIT_EXE%" remote add origin https://github.com/bosslouie5/TimeAttendance-System.git >nul 2>&1
"%GIT_EXE%" push -f origin master:gh-pages

echo.
echo [SUCCESS] PRODUCTION DEPLOYED!
echo Web: https://timeattendance-system.onrender.com/dev
rd /s /q "web_deploy"
pause
goto MENU

:SYNC_DATA
cls
echo.
echo !!! Step 4: SYNCING LAB TO PRODUCTION (4002 -> 4001) !!!
set /p confirm="Proceed? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
echo [*] Copying dist-test to production dist folders...
if exist "web-dev\dist-test" (rd /s /q "web-dev\dist" >nul 2>&1 & xcopy /s /i /y "web-dev\dist-test" "web-dev\dist" >nul 2>&1)
if exist "web-admin\dist-test" (rd /s /q "web-admin\dist" >nul 2>&1 & xcopy /s /i /y "web-admin\dist-test" "web-admin\dist" >nul 2>&1)
if exist "mobile-app\dist-test" (rd /s /q "mobile-app\dist" >nul 2>&1 & xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist" >nul 2>&1)
echo [SUCCESS] Production folders updated.
pause
goto MENU
