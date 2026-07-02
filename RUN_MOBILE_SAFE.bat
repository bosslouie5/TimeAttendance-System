@echo off
setlocal enabledelayedexpansion

echo [SAFE MODE] Starting Mobile App for Company Laptop...
echo.

set "SCRIPT_DIR=%~dp0"
set "ADB_PATH=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS\adb\adb.exe"
set "DEV_SYSTEM=%SCRIPT_DIR%DEV_SYSTEM.bat"

:: Ensure Android SDK is available for native-run
set "ANDROID_SDK_ROOT=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS\Sdk"
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
set "PATH=%ANDROID_SDK_ROOT%\platform-tools;%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin;%PATH%"

echo Checking local backend on port 4002...
netstat -ano | findstr ":4002" >nul
if errorlevel 1 (
  echo Backend not running on port 4002.
  echo Starting DEV_SYSTEM.bat in a new window...
  start "DEV SYSTEM" cmd /k "cd /d "%SCRIPT_DIR%" && call "%DEV_SYSTEM%""
  echo Waiting for backend to start...
  for /l %%i in (1,1,30) do (
    netstat -ano | findstr ":4002" >nul && goto :backend_ready
    timeout /t 1 >nul
  )
  echo WARNING: Backend did not start within 30 seconds. Continue anyway.
) else (
  echo Backend already running on port 4002.
)

:backend_ready

echo 1. Setting up USB Bridge...
if not exist "%ADB_PATH%" (
  echo ERROR: adb not found at %ADB_PATH%
  echo Check your DEV_TOOLS installation.
  pause
  exit /b 1
)
"%ADB_PATH%" devices
"%ADB_PATH%" reverse tcp:4002 tcp:4002
"%ADB_PATH%" reverse tcp:4001 tcp:4001
"%ADB_PATH%" reverse --list

echo 2. Building and Syncing App...
cd mobile-app
call npm run build
call npx cap sync android

echo 3. Launching on Phone...
call npx cap run android

echo.
echo DONE! Kapag nawalan ulit ng koneksyon, i-run mo lang itong RUN_MOBILE_SAFE.bat
pause
