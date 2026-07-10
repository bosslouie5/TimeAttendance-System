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
echo   [1] START TEST LAB    (Build + Run + Tunnel - 4002)
echo   [2] MOBILE DEV LAB    (Mirror + Sync + Run)
echo   [3] MASTER SYNC       (Full Automation: Build to Deploy)
echo.
echo   [4] SIGNED APK BUILD  (Release APK for TimeKey Pro)
echo   [5] SAFETY BACKUP     (Create Point)

echo   [6] REVERT CODE    (Restore Point)
echo.
echo   [7] STOP ALL       (Force Kill Processes)
echo   [0] EXIT
echo   ______________________________________________________
set /p choice="Master Tropa, input command: "

if "%choice%"=="1" goto START_LAB
if "%choice%"=="2" goto MOBILE_LAB
if "%choice%"=="3" goto MASTER_SYNC
if "%choice%"=="4" goto BUILD_SIGNED_APK
if "%choice%"=="5" goto BACKUP
if "%choice%"=="6" goto REVERT
if "%choice%"=="7" goto STOP_ALL
if "%choice%"=="0" exit
goto MENU

:START_LAB
cls
echo [*] 1/4 Syncing Live Data to Lab...
if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul

echo [*] 2/4 Rebuilding UI (Lab Mode)...
pushd web-dev & call npx vite build --outDir dist-test --emptyOutDir & popd
pushd web-admin & call npx vite build --outDir dist-test --emptyOutDir & popd
pushd mobile-app & call npx vite build --outDir dist-test --emptyOutDir & popd

echo [*] 3/4 Initializing Port 4002 Lab...
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

echo [*] 4/4 Launching Browser...
echo [OK] Lab running at http://localhost:4002/dev
ping 127.0.0.1 -n 3 >nul
start "" "http://localhost:4002/dev"
goto MENU

:MOBILE_LAB
cls
echo [*] Activating Mobile Developer Lab (Port 4002)...
taskkill /F /IM scrcpy.exe /T >nul 2>&1
"%ADB_EXE%" kill-server >nul 2>&1
"%ADB_EXE%" start-server >nul 2>&1
"%ADB_EXE%" reverse tcp:4002 tcp:4002

:: Inject Local API URL for Lab Build
set "CONFIG_FILE=mobile-app/src/app_config.json"
set "BAK_CONFIG=mobile-app/src/app_config.json.bak"
if exist "%CONFIG_FILE%" (
    copy /y "%CONFIG_FILE%" "%BAK_CONFIG%" >nul
    node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('%CONFIG_FILE%', 'utf8').replace(/^\uFEFF/, '')); c.defaultApiUrl='http://localhost:4002/api'; fs.writeFileSync('%CONFIG_FILE%', JSON.stringify(c, null, 2), 'utf8');"
    echo [OK] Local API URL injected for Lab Build.
)

if exist "MIRROR_PHONE.bat" start /b "" cmd /c "MIRROR_PHONE.bat"
pushd mobile-app
echo [*] Building UI (Lab Mode)...
call npx vite build --outDir dist-test --emptyOutDir
echo [*] Syncing Capacitor...
call npx cap sync android
echo [*] Launching on Device...
call npx cap run android
popd

:: Restore Production URL
if exist "%BAK_CONFIG%" (
    move /y "%BAK_CONFIG%" "%CONFIG_FILE%" >nul
    echo [OK] Production config restored.
)

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

if exist "mobile-app\android\release-key.jks" (
    echo.
    set /p buildSigned="Build signed APK now? (Y/N): "
    if /i "!buildSigned!"=="Y" (
        set "INTERNAL_CALL=1"
        call :BUILD_SIGNED_APK
    )
)

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

:: Increment Gradle Version Code and update versionName using PowerShell helper
if exist "%GRADLE_FILE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "tools\update_android_version.ps1" "%GRADLE_FILE%" "!NEW_V!"
    echo [OK] Gradle Version Code and Name Updated.
    :: Extract the NEW versionCode that was just incremented
    for /f "tokens=2" %%a in ('findstr "versionCode" "%GRADLE_FILE%"') do set "NEW_VC=%%a"
    set "NEW_VC=!NEW_VC: =!"
) else (
    set "NEW_VC=0"
)

:: Use Node to update JSON files with both Version Name and Version Code
node -e "const fs=require('fs'); const v={version:'!NEW_V!', versionCode:'!NEW_VC!', buildDate:new Date().toISOString()}; fs.writeFileSync('%VER_FILE%', JSON.stringify(v, null, 2), 'utf8');"
node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('%CONFIG_FILE%', 'utf8').replace(/^\uFEFF/, '')); c.version='!NEW_V!'; c.versionCode='!NEW_VC!'; c.buildDate=new Date().toISOString(); fs.writeFileSync('%CONFIG_FILE%', JSON.stringify(c, null, 2), 'utf8');"
if exist "%ADMIN_CONFIG%" node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('%ADMIN_CONFIG%', 'utf8').replace(/^\uFEFF/, '')); c.version='!NEW_V!'; c.versionCode='!NEW_VC!'; c.buildDate=new Date().toISOString(); fs.writeFileSync('%ADMIN_CONFIG%', JSON.stringify(c, null, 2), 'utf8');"

:: Sync package.json
if exist "%PKG_FILE%" (
    node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('%PKG_FILE%', 'utf8').replace(/^\uFEFF/, '')); p.version='!NEW_V!'; fs.writeFileSync('%PKG_FILE%', JSON.stringify(p, null, 2), 'utf8');"
    echo [OK] package.json updated.
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

:BUILD_SIGNED_APK
cls
set "BUMPED="
set "GRADLE_FILE=mobile-app/android/app/build.gradle"

if "!INTERNAL_CALL!"=="" (
    echo [*] Checking for Version Bump before Build...
    call :VERSION_BUMP_UI
    set "BUMPED=1"
)

:: Ensure NEW_VC is set even if no bump happened in this call (e.g. from Master Sync)
if "!NEW_VC!"=="" (
    if exist "%GRADLE_FILE%" (
        for /f "tokens=2" %%a in ('findstr "versionCode" "%GRADLE_FILE%"') do set "NEW_VC=%%a"
        set "NEW_VC=!NEW_VC: =!"
    )
)

:: If we still don't have NEW_V (unlikely), get it from config
if "!NEW_V!"=="" (
    set "CONFIG_FILE=mobile-app/src/app_config.json"
    if exist "!CONFIG_FILE!" for /f "delims=" %%v in ('powershell -Command "(Get-Content !CONFIG_FILE! | ConvertFrom-Json).version"') do set "NEW_V=%%v"
)

echo [*] Building signed Android APK for TimeKey Pro [Version: !NEW_V! (Code: !NEW_VC!)]...
if not exist "mobile-app\android\release-key.jks" (
    echo [ERROR] release-key.jks not found in mobile-app\android.
    echo [INFO] Place your keystore at mobile-app\android\release-key.jks or generate it there.
    pause
    goto MENU
)

:: CRITICAL: If version was bumped or we are in Master Sync, we MUST rebuild and sync web assets to Android
if "!BUMPED!"=="1" (
    echo [*] Rebuilding Mobile UI for New Version...
    pushd mobile-app & call npx vite build --outDir dist --emptyOutDir & popd
)

echo [*] Syncing Capacitor Assets...
pushd mobile-app
call npx cap sync android
popd

pushd mobile-app\android
echo [*] Running Gradle Build (assembleRelease)...
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo [ERROR] Signed APK build failed.
    popd
    pause
    goto MENU
)
set "APK_SOURCE=app\build\outputs\apk\release\app-release.apk"
if exist "%APK_SOURCE%" (
    copy /y "%APK_SOURCE%" "..\app-release-TimeKey-Pro.apk" >nul

    :: Sync to Backend for OTA Updates
    if not exist "..\..\backend\apks" mkdir "..\..\backend\apks"
    copy /y "%APK_SOURCE%" "..\..\backend\apks\TimeKey_Master.apk" >nul

    :: Create latest-version.json for Broadcast
    node -e "const fs=require('fs'); const v={version:'!NEW_V!', versionCode:'!NEW_VC!', downloadUrl:'/api/master/download-apk/TimeKey_Master.apk', releaseDate:new Date().toISOString(), notes:'System Update v!NEW_V!'}; fs.writeFileSync('../../backend/apks/latest-version.json', JSON.stringify(v, null, 2), 'utf8');"

    echo [OK] Signed APK created and Synced for OTA updates.
) else (
    echo [ERROR] APK output not found after build.
)
popd
pause
goto MENU
goto MENU
