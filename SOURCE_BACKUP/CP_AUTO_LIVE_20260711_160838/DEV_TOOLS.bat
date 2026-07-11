@echo off
title TIMEKEY PRO MASTER CONTROL
setlocal enabledelayedexpansion

:: --- PORTABLE PATHS ---
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "GIT_EXE=%DEV_TOOLS%\Git\cmd\git.exe"
set "ADB_EXE=%DEV_TOOLS%\platform-tools\adb.exe"
set "PATH=%NODE_PATH%;%NODE_PATH%\node_modules\npm\bin;%DEV_TOOLS%\platform-tools;%DEV_TOOLS%\Git\cmd;%PATH%"

:MENU
cls
echo ======================================================
echo            TIMEKEY PRO MASTER CONTROL
echo ======================================================
echo.
echo   [1] START TESTING (Port 4002 - Safe Lab)
echo   [2] SYNC MOBILE   (ADB + Mirror Phone)
echo.
echo   [3] SAVE BACKUP   (Check-point)
echo   [4] REVERT CODE   (Restore Backup)
echo.
echo   [5] GO LIVE NOW   (Deploy to GitHub/Render/APK)
echo.
echo   [6] STOP ALL      (Kill Processes)
echo   [0] EXIT
echo.
set /p choice="Ano gagawin natin, Tropa? "

if "%choice%"=="1" goto LAB
if "%choice%"=="2" goto MOBILE
if "%choice%"=="3" goto BACKUP
if "%choice%"=="4" goto REVERT
if "%choice%"=="5" goto GOLIVE
if "%choice%"=="6" goto STOP
if "%choice%"=="0" exit
goto MENU

:LAB
cls
echo [*] Starting Developer Lab on Port 4002...
taskkill /F /IM node.exe /T >nul 2>&1
echo [*] Syncing data-test.json...
if exist "backend\data.json" copy /y "backend\data.json" "backend\data-test.json" >nul
:: Set to Test URL
call :SET_URL "http://localhost:4002/api"
pushd backend
set SYSTEM_MODE=test
set PORT=4002
start /b node server.js > server_test.log 2>&1
popd
echo [OK] Lab is LIVE at http://localhost:4002/dev
timeout /t 2 >nul
start "" "http://localhost:4002/dev"
goto MENU

:MOBILE
cls
echo [*] Syncing with Android Device...
"%ADB_EXE%" reverse tcp:4002 tcp:4002
if exist "MIRROR_PHONE.bat" start /b "" cmd /c "MIRROR_PHONE.bat"
pushd mobile-app
call npx vite build --outDir dist --emptyOutDir
call npx cap sync android
call npx cap run android
popd
pause
goto MENU

:BACKUP
cls
echo [*] Creating Safety Checkpoint...
powershell -ExecutionPolicy Bypass -File "tools\backup_system.ps1" -Action "backup"
pause
goto MENU

:REVERT
cls
echo [*] Restoring Code from Backup...
powershell -ExecutionPolicy Bypass -File "tools\backup_system.ps1" -Action "restore"
pause
goto MENU

:GOLIVE
cls
echo [!] WARNING: PROMOTING TO PRODUCTION (PORT 4001)
set /p confirm="Sigurado ka na ba? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU

:: VERSION BUMP STEP
echo.
set "CONFIG_FILE=mobile-app/src/app_config.json"
if exist "%CONFIG_FILE%" for /f "delims=" %%v in ('powershell -Command "(Get-Content %CONFIG_FILE% | ConvertFrom-Json).version"') do set "CUR_V=%%v"
echo Current Version: %CUR_V%
set /p NEW_V="Enter New Version (e.g. 1.0.5): "
if "!NEW_V!"=="" set "NEW_V=%CUR_V%"

echo [*] Step 1: Auto-Backup...
powershell -ExecutionPolicy Bypass -File "tools\backup_system.ps1" -Action "backup" -CheckpointName "AUTO_LIVE"

echo [*] Step 2: Updating Version and Switching to Production URL...
call :SET_URL "https://timeattendance-system.onrender.com/api"
:: Sync version to configs and Gradle
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\update_android_version.ps1" "mobile-app/android/app/build.gradle" "!NEW_V!"
node -e "const fs=require('fs'); ['web-admin','web-dev','mobile-app'].forEach(m=>{ const p=`${m}/src/app_config.json`; if(fs.existsSync(p)){ const c=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')); c.version='!NEW_V!'; fs.writeFileSync(p,JSON.stringify(c,null,2)); } })"
node -e "const fs=require('fs'); const v={version:'!NEW_V!', buildDate:new Date().toISOString()}; fs.writeFileSync('backend/version.json', JSON.stringify(v, null, 2), 'utf8');"
:: Update Metadata for Update Notifications
node -e "const fs=require('fs'); const path=require('path'); const v='!NEW_V!'; const meta={version:v, downloadUrl:'/api/master/download-apk/TimeKey_Master.apk', releaseDate:new Date().toISOString(), notes:'System Update v'+v}; ['backend/apks','apks'].forEach(d=>{ fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(path.join(d,'latest-version.json'), JSON.stringify(meta, null, 2)); });"

echo [*] Step 3: Building All Modules...
pushd web-dev & call npx vite build --emptyOutDir & popd
pushd web-admin & call npx vite build --emptyOutDir & popd
pushd mobile-app & call npx vite build --emptyOutDir & popd

echo [*] Step 4: Finalizing APK Build...
call :BUILD_APK

echo [*] Step 5: Pushing to GitHub (Render Auto-Deploy)...
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Production Release: v!NEW_V! - %date% %time%"
"%GIT_EXE%" push origin main

echo [SUCCESS] System is now LIVE v!NEW_V!! Port 4001 and Render updated.
pause
goto MENU

:STOP
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
echo [CLEAN] All processes stopped.
pause
goto MENU

:SET_URL
set "URL=%~1"
node -e "const fs=require('fs'); ['web-admin','web-dev','mobile-app'].forEach(m=>{ const p=`${m}/src/app_config.json`; if(fs.existsSync(p)){ const c=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')); c.defaultApiUrl='%URL%'; fs.writeFileSync(p,JSON.stringify(c,null,2)); } })"
exit /b

:BUILD_APK
pushd mobile-app
call npx cap sync android
cd android & call gradlew.bat assembleRelease & cd ..
if exist "android\app\build\outputs\apk\release\app-release.apk" (
    if not exist "..\apks" mkdir "..\apks"
    copy /y "android\app\build\outputs\apk\release\app-release.apk" "..\apks\TimeKey_Master.apk" >nul
)
popd
exit /b
