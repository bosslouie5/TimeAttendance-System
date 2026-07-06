@echo off
title TIMEKEY MASTER CONTROL v7.0 (PRO)
setlocal enabledelayedexpansion

:: ==========================================
:: PORTABLE PATHS CONFIGURATION
:: ==========================================
set "ROOT_DIR=%~dp0"
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "GIT_EXE=%DEV_TOOLS%\Git\cmd\git.exe"
set "ADB_EXE=%DEV_TOOLS%\platform-tools\adb.exe"
set "CLOUDFLARED=%DEV_TOOLS%\cloudflared.exe"

:: LOCK PATH TO PORTABLE TOOLS ONLY
set "PATH=%NODE_PATH%;%NODE_PATH%\node_modules\npm\bin;%DEV_TOOLS%\platform-tools;%DEV_TOOLS%\Git\cmd;%PATH%"

:MENU
cd /d "%ROOT_DIR%"
set "last_backup=NEVER"
if exist "SOURCE_BACKUP\timestamp.txt" set /p last_backup=<"SOURCE_BACKUP\timestamp.txt"

cls
echo   ______________________________________________________
echo  ^|                                                      ^|
echo  ^|        TIMEKEY MASTER CONTROL CENTER v7.0 (PRO)     ^|
echo  ^|______________________________________________________^|
echo.
echo   [ STATUS ]
echo   Environment: Developer Lab (Port 4002)
echo   Backup Checkpoint: !last_backup!
echo.
echo   [1] START TEST LAB (Web/API/Tunnel - 4002)
echo   [2] MOBILE DEV LAB (Mirror + Sync + Run)
echo   [3] MASTER SYNC    (Full Automation: Build to Deploy)
echo.
echo   [4] SAFETY BACKUP  (Create Point)
echo   [5] REVERT CODE    (Restore Point)
echo.
echo   [6] STOP ALL       (Force Kill Processes)
echo   [0] EXIT
echo   ______________________________________________________
set /p choice="Master Tropa, input command: "

if "%choice%"=="1" goto START_LAB
if "%choice%"=="2" goto MOBILE_LAB
if "%choice%"=="3" goto MASTER_SYNC
if "%choice%"=="4" goto BACKUP
if "%choice%"=="5" goto REVERT
if "%choice%"=="6" goto STOP_ALL
if "%choice%"=="0" exit
goto MENU

:START_LAB
cls
echo [*] Initializing Port 4002 Lab...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
"%ADB_EXE%" reverse tcp:4002 tcp:4002
pushd backend
set SYSTEM_MODE=test
set "MONGODB_URI="
start /b node server.js > server_test.log 2>&1
if exist "%CLOUDFLARED%" (
    start /b "" "%CLOUDFLARED%" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
    echo [OK] Cloudflare Tunnel Active.
)
popd
echo [OK] Lab running at http://localhost:4002/dev
ping 127.0.0.1 -n 3 >nul
start "" "http://localhost:4002/dev"
goto MENU

:MOBILE_LAB
cls
echo [*] Activating Mobile Developer Lab...
taskkill /F /IM scrcpy.exe /T >nul 2>&1
"%ADB_EXE%" kill-server >nul 2>&1
"%ADB_EXE%" start-server >nul 2>&1
"%ADB_EXE%" reverse tcp:4002 tcp:4002
if exist "MIRROR_PHONE.bat" start /b "" cmd /c "MIRROR_PHONE.bat"
pushd mobile-app
echo [*] Building UI...
call npx vite build --outDir dist-test --emptyOutDir
echo [*] Syncing Capacitor...
call npx cap sync android
echo [*] Launching on Device...
call npx cap run android
popd
pause
goto MENU

:MASTER_SYNC
cls
echo.
echo [!] WARNING: This will sync LAB (4002) to PRODUCTION (4001) and DEPLOY LIVE.
set /p confirm="Proceed with Full Sync? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU

set "INTERNAL_CALL=1"

echo [*] 1/4 Checking for Version Bump...
call :VERSION_BUMP_UI

echo [*] 2/4 Rebuilding All Lab Assets with Version !NEW_V!...
pushd web-dev & call npx vite build --outDir dist-test --emptyOutDir & popd
pushd web-admin & call npx vite build --outDir dist-test --emptyOutDir & popd
pushd mobile-app & call npx vite build --outDir dist-test --emptyOutDir & popd

echo [*] 3/4 Syncing Lab to Main Folders...
if exist "web-dev\dist" rd /s /q "web-dev\dist"
if exist "web-admin\dist" rd /s /q "web-admin\dist"
if exist "mobile-app\dist" rd /s /q "mobile-app\dist"

if exist "web-dev\dist-test" xcopy /s /i /y "web-dev\dist-test" "web-dev\dist" >nul 2>&1
if exist "web-admin\dist-test" xcopy /s /i /y "web-admin\dist-test" "web-admin\dist" >nul 2>&1
if exist "mobile-app\dist-test" xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist" >nul 2>&1

echo [*] 4/4 Deploying to Cloud (GitHub)...
"%GIT_EXE%" add .
:: Force add dist folders because they are in .gitignore
"%GIT_EXE%" add -f web-dev/dist/
"%GIT_EXE%" add -f web-admin/dist/
"%GIT_EXE%" add -f mobile-app/dist/
"%GIT_EXE%" commit -m "Production Release: %date% %time%"
"%GIT_EXE%" push origin main

set "INTERNAL_CALL="
echo [SUCCESS] Full Sync Complete.
pause
goto MENU

:VERSION_BUMP_UI
set "VER_FILE=backend/version.json"
set "CONFIG_FILE=mobile-app/src/app_config.json"
set "ADMIN_CONFIG=web-admin/src/app_config.json"
set "PKG_FILE=mobile-app/package.json"
set "GRADLE_FILE=mobile-app/android/app/build.gradle"
set "CUR_V=1.0.0"
if exist "%CONFIG_FILE%" for /f "delims=" %%v in ('powershell -Command "(Get-Content %CONFIG_FILE% | ConvertFrom-Json).version"') do set "CUR_V=%%v"

echo.
echo [ VERSION BUMP ]
echo Current Version: %CUR_V%
set /p NEW_V="Enter New Version (or press Enter to keep): "
if "!NEW_V!"=="" set "NEW_V=%CUR_V%"

:: Use Node to update JSON files (Guarantees UTF-8 without BOM and handles paths correctly)
node -e "const fs=require('fs'); const v={version:'!NEW_V!', buildDate:new Date().toISOString()}; fs.writeFileSync('%VER_FILE%', JSON.stringify(v, null, 2), 'utf8');"
node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('%CONFIG_FILE%', 'utf8').replace(/^\uFEFF/, '')); c.version='!NEW_V!'; c.buildDate=new Date().toISOString(); fs.writeFileSync('%CONFIG_FILE%', JSON.stringify(c, null, 2), 'utf8');"
if exist "%ADMIN_CONFIG%" node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('%ADMIN_CONFIG%', 'utf8').replace(/^\uFEFF/, '')); c.version='!NEW_V!'; c.buildDate=new Date().toISOString(); fs.writeFileSync('%ADMIN_CONFIG%', JSON.stringify(c, null, 2), 'utf8');"

:: Sync package.json
if exist "%PKG_FILE%" (
    node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('%PKG_FILE%', 'utf8').replace(/^\uFEFF/, '')); p.version='!NEW_V!'; fs.writeFileSync('%PKG_FILE%', JSON.stringify(p, null, 2), 'utf8');"
    echo [OK] package.json updated.
)

:: Increment Gradle Version Code using Node (Safe from BOM/Encoding issues)
if exist "%GRADLE_FILE%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%GRADLE_FILE%', 'utf8'); c=c.replace(/versionCode (\d+)/, (m, v) => 'versionCode ' + (parseInt(v) + 1)); fs.writeFileSync('%GRADLE_FILE%', c, 'utf8');"
    echo [OK] Gradle Version Code Incremented.
)
exit /b

:BACKUP
cls
echo [*] Safeguarding source code...
if exist "SOURCE_BACKUP" rd /s /q "SOURCE_BACKUP"
mkdir "SOURCE_BACKUP"
mkdir "SOURCE_BACKUP\backend"
mkdir "SOURCE_BACKUP\web-dev\src"
mkdir "SOURCE_BACKUP\web-admin\src"
mkdir "SOURCE_BACKUP\mobile-app\src"
copy "backend\*.js" "SOURCE_BACKUP\backend\" /y >nul 2>&1
copy "backend\*.json" "SOURCE_BACKUP\backend\" /y >nul 2>&1
xcopy /s /i /y "web-dev\src" "SOURCE_BACKUP\web-dev\src" >nul 2>&1
xcopy /s /i /y "web-admin\src" "SOURCE_BACKUP\web-admin\src" >nul 2>&1
xcopy /s /i /y "mobile-app\src" "SOURCE_BACKUP\mobile-app\src" >nul 2>&1
echo %date% %time% > "SOURCE_BACKUP\timestamp.txt"
echo [OK] Safety Checkpoint Created.
ping 127.0.0.1 -n 2 >nul
goto MENU

:REVERT
cls
if not exist "SOURCE_BACKUP" echo [!] No backup found. & pause & goto MENU
set /p confirm="Restore from checkpoint? (Type 'CONFIRM'): "
if /i "%confirm%" neq "CONFIRM" goto MENU
xcopy /s /i /y "SOURCE_BACKUP\backend" "backend" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-dev\src" "web-dev\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\web-admin\src" "web-admin\src" >nul 2>&1
xcopy /s /i /y "SOURCE_BACKUP\mobile-app\src" "mobile-app\src" >nul 2>&1
echo [OK] System Reverted.
pause
goto MENU

:STOP_ALL
cls
echo [*] Global System Force Stop...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
taskkill /F /IM scrcpy.exe /T >nul 2>&1
echo [OK] Processes Cleared.
pause
goto MENU
