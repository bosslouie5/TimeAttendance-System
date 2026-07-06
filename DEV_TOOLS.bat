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
echo   [0] MASTER SYNC (Combined Workflow - Best for Tropa)
echo   [1] DEPLOY ALL TO WEB (Sync 4001 to GitHub/Render)
echo   [2] RUN TEST LAB (Port 4002 - Local/Online)
echo   [3] REBUILD ALL LAB UI (Build 4002 Code)
echo   [4] SYNC LAB TO PRODUCTION (Move 4002 to 4001)
echo   [5] BUMP MOBILE APP VERSION (Trigger OTA)
echo.
echo   [B] CREATE SAFETY BACKUP (Checkpoint)
echo   [R] REVERT SOURCE CODE (Restore from Checkpoint)
echo.
echo   [6] STOP ALL SYSTEMS (Stop Node ^& Tunnel)
echo   [7] EXIT ALL
echo.
echo   ------------------------------------------------------
set /p choice="Master Tropa, choose an action: "

if /i "%choice%"=="0" goto MASTER_SYNC
if /i "%choice%"=="1" goto BUILD_DEPLOY_ALL
if /i "%choice%"=="2" goto RUN_LAB
if /i "%choice%"=="3" goto REBUILD_LAB_ALL
if /i "%choice%"=="4" goto SYNC_DATA
if /i "%choice%"=="5" goto BUMP_VERSION
if /i "%choice%"=="B" goto BACKUP_CODE
if /i "%choice%"=="R" goto REVERT_CODE
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
if "%INTERNAL_CALL%"=="1" exit /b
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
echo [*] DATA MODE: LOCAL JSON (Privacy Mode Active)
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
pushd backend
del /f /q tunnel.log >nul 2>&1
del /f /q active_link.txt >nul 2>&1
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
echo [*] DATA MODE: LOCAL JSON (Privacy Mode Active)
"%ADB_EXE%" reverse tcp:4002 tcp:4002
taskkill /F /IM node.exe /T >nul 2>&1
pushd backend
del /f /q tunnel.log >nul 2>&1
del /f /q active_link.txt >nul 2>&1
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
echo [*] Closing browsers used for testing...
taskkill /F /IM msedge.exe /T >nul 2>&1
taskkill /F /IM firefox.exe /T >nul 2>&1
echo [CLEAN] All processes stopped.
pause
goto MENU

:BUILD_DEPLOY_ALL
cls
echo.
echo !!! Step 1: INITIATING GLOBAL PRODUCTION DEPLOYMENT !!!
echo.
set "VER_FILE=backend\version.json"
set "CONFIG_FILE=mobile-app\src\app_config.json"
set "CURRENT_VER=1.0.0"
if exist "%VER_FILE%" (
    for /f "delims=" %%v in ('powershell -Command "(Get-Content %VER_FILE% | ConvertFrom-Json).version"') do set "CURRENT_VER=%%v"
)

echo [STATUS] Current System Version: %CURRENT_VER%
if "%BUMP_DONE%"=="1" goto SKIP_BUMP
set /p bump="Bump version before deploy? (Y/N/Already Done='A'): "
if /i "%bump%"=="A" goto SKIP_BUMP
if /i "%bump%"=="N" goto SKIP_BUMP

:: USE THE SAME PRO GUI
set "psCommand=Add-Type -AssemblyName System.Windows.Forms; $form = New-Object Windows.Forms.Form; $form.Text = 'DEPLOYMENT - VERSION BUMP'; $form.Size = New-Object Drawing.Size(400,250); $form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $lbl = New-Object Windows.Forms.Label; $lbl.Text = 'Enter New Version (Current: %CURRENT_VER%):'; $lbl.Location = '20,20'; $lbl.Size = '300,20'; $txt = New-Object Windows.Forms.TextBox; $txt.Text = '%CURRENT_VER%'; $txt.Location = '20,45'; $txt.Size = '340,30'; $lbl2 = New-Object Windows.Forms.Label; $lbl2.Text = 'Deployment Changelog:'; $lbl2.Location = '20,80'; $lbl2.Size = '300,20'; $txt2 = New-Object Windows.Forms.TextBox; $txt2.Text = 'Production Release %date%'; $txt2.Location = '20,105'; $txt2.Size = '340,30'; $btn = New-Object Windows.Forms.Button; $btn.Text = 'CONFIRM VERSION ^& DEPLOY'; $btn.Location = '20,150'; $btn.Size = '340,40'; $btn.DialogResult = [Windows.Forms.DialogResult]::OK; $form.AcceptButton = $btn; $form.Controls.AddRange(@($lbl,$txt,$lbl2,$txt2,$btn)); $form.Add_Shown({$txt.Focus()}); if($form.ShowDialog() -eq 'OK'){$txt.Text + '|' + $txt2.Text}"

for /f "tokens=1,2 delims=|" %%a in ('powershell -Command "%psCommand%"') do (
    set "NEW_VER=%%a"
    set "msg=%%b"
)

if "!NEW_VER!"=="" (
    echo [ABORTED] Deployment cancelled.
    pause
    goto MENU
)

echo [*] Updating Version Files for Deployment...
powershell -Command "$v = @{ version='!NEW_VER!'; buildDate=(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ'); changelog='!msg!'; apkUrl='/api/master/download-apk/TimeKey_Master.apk'; forceUpdate=$false }; $v | ConvertTo-Json | Set-Content '%VER_FILE%'"
if exist "%CONFIG_FILE%" (
    powershell -Command "$c = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $c.version = '!NEW_VER!'; $c.buildDate = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ'); $c | ConvertTo-Json | Set-Content '%CONFIG_FILE%'"
)

:SKIP_BUMP
echo [*] CLOUD DEPLOYMENT MODE ACTIVE...
echo [*] (Laptop building is disabled. Cloud will handle All Builds)

echo [*] Pushing Source Code to GitHub...
cd /d "%ROOT_DIR%"
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Production Sync: %date% %time%" >nul 2>&1
"%GIT_EXE%" push origin main

echo.
echo [SUCCESS] SOURCE CODE UPLOADED!
echo [*] GitHub Cloud is now building your Website and APK.
echo [*] Please wait 5-8 minutes for the process to finish.
echo Web: https://timeattendance-system.onrender.com/dev
if "%INTERNAL_CALL%"=="1" exit /b
pause
goto MENU

:BUMP_VERSION
cls
echo.
echo [*] Fetching current system version...
set "VER_FILE=backend\version.json"
set "CONFIG_FILE=mobile-app\src\app_config.json"
set "ADMIN_CONFIG=web-admin\src\app_config.json"
set "CURRENT_VER=1.0.0"

:: Get current version from mobile config first as it's the source of truth for the app
if exist "%CONFIG_FILE%" (
    for /f "delims=" %%v in ('powershell -Command "(Get-Content %CONFIG_FILE% | ConvertFrom-Json).version"') do set "CURRENT_VER=%%v"
) else if exist "%VER_FILE%" (
    for /f "delims=" %%v in ('powershell -Command "(Get-Content %VER_FILE% | ConvertFrom-Json).version"') do set "CURRENT_VER=%%v"
)

:: PRO GUI FOR VERSION BUMP (Pre-filled with CURRENT_VER)
set "psCommand=Add-Type -AssemblyName System.Windows.Forms; $form = New-Object Windows.Forms.Form; $form.Text = 'TIMEKEY - VERSION BUMP'; $form.Size = New-Object Drawing.Size(400,250); $form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $lbl = New-Object Windows.Forms.Label; $lbl.Text = 'Enter New Version (Current: %CURRENT_VER%):'; $lbl.Location = '20,20'; $lbl.Size = '300,20'; $txt = New-Object Windows.Forms.TextBox; $txt.Text = '%CURRENT_VER%'; $txt.Location = '20,45'; $txt.Size = '340,30'; $lbl2 = New-Object Windows.Forms.Label; $lbl2.Text = 'Changelog:'; $lbl2.Location = '20,80'; $lbl2.Size = '300,20'; $txt2 = New-Object Windows.Forms.TextBox; $txt2.Text = 'Performance enhancements and security updates.'; $txt2.Location = '20,105'; $txt2.Size = '340,30'; $btn = New-Object Windows.Forms.Button; $btn.Text = 'BUMP VERSION NOW'; $btn.Location = '20,150'; $btn.Size = '340,40'; $btn.DialogResult = [Windows.Forms.DialogResult]::OK; $form.AcceptButton = $btn; $form.Controls.AddRange(@($lbl,$txt,$lbl2,$txt2,$btn)); $form.Add_Shown({$txt.Focus()}); if($form.ShowDialog() -eq 'OK'){$txt.Text + '|' + $txt2.Text}"

for /f "tokens=1,2 delims=|" %%a in ('powershell -Command "%psCommand%"') do (
    set "NEW_VER=%%a"
    set "msg=%%b"
)

if "!NEW_VER!"=="" goto MENU

echo.
echo [*] Updating All Version Files (Backend, Mobile, Admin)...
powershell -Command "$v = @{ version='!NEW_VER!'; buildDate=(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ'); changelog='!msg!'; apkUrl='/api/master/download-apk/TimeKey_Master.apk'; forceUpdate=$false }; $v | ConvertTo-Json | Set-Content '%VER_FILE%'"

if exist "%CONFIG_FILE%" (
    powershell -Command "$c = Get-Content '%CONFIG_FILE%' | ConvertFrom-Json; $c.version = '!NEW_VER!'; $c.buildDate = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ'); $c | ConvertTo-Json | Set-Content '%CONFIG_FILE%'"
)

if exist "%ADMIN_CONFIG%" (
    powershell -Command "$c = Get-Content '%ADMIN_CONFIG%' | ConvertFrom-Json; $c.version = '!NEW_VER!'; $c.buildDate = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ'); $c | ConvertTo-Json | Set-Content '%ADMIN_CONFIG%'"
)

echo.
echo [SUCCESS] Version bumped to !NEW_VER! across all modules.
if "%INTERNAL_CALL%"=="1" exit /b
pause
goto MENU

:SYNC_DATA
cls
echo.
echo !!! Step 4: SYNCING LAB TO PRODUCTION (4002 -> 4001) !!!
if "%INTERNAL_CALL%"=="1" goto START_SYNC
set /p confirm="Proceed? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU
:START_SYNC
echo [*] Copying dist-test to production dist folders...
if exist "web-dev\dist-test" (rd /s /q "web-dev\dist" >nul 2>&1 & xcopy /s /i /y "web-dev\dist-test" "web-dev\dist" >nul 2>&1)
if exist "web-admin\dist-test" (rd /s /q "web-admin\dist" >nul 2>&1 & xcopy /s /i /y "web-admin\dist-test" "web-admin\dist" >nul 2>&1)
if exist "mobile-app\dist-test" (rd /s /q "mobile-app\dist" >nul 2>&1 & xcopy /s /i /y "mobile-app\dist-test" "mobile-app\dist" >nul 2>&1)
echo [SUCCESS] Production folders updated.
if "%INTERNAL_CALL%"=="1" exit /b
pause
goto MENU

:MASTER_SYNC
cls
echo.
echo   ______________________________________________________
echo  ^|                                                      ^|
echo  ^|           TIMEKEY MASTER AUTO-SYNC WORKFLOW        ^|
echo  ^|______________________________________________________^|
echo.
echo   Tropa, this will run the following sequence:
echo   1. REBUILD LAB UI [3]
echo   2. BUMP VERSION [5] (Optional)
echo   3. SYNC TO PRODUCTION [4]
echo   4. DEPLOY TO WEB [1]
echo.
set /p mobile_edit="Master, did you edit the Mobile App? (Y/N): "

set "INTERNAL_CALL=1"
set "BUMP_DONE=0"

echo.
echo [*] Step 1/4: Rebuilding All Lab UI...
call :REBUILD_LAB_ALL

if /i "%mobile_edit%"=="Y" (
    echo.
    echo [*] Step 2/4: Bumping Mobile App Version...
    call :BUMP_VERSION
    set "BUMP_DONE=1"
) else (
    echo.
    echo [*] Step 2/4: Skipping Version Bump...
)

echo.
echo [*] Step 3/4: Syncing Lab to Production...
call :SYNC_DATA

echo.
echo [*] Step 4/4: Deploying to GitHub and Render...
call :BUILD_DEPLOY_ALL

set "INTERNAL_CALL="
set "BUMP_DONE="
echo.
echo [MASTER SUCCESS] All systems synced and deployed!
pause
goto MENU
