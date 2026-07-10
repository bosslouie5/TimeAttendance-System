@echo off
setlocal

set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
:: Standardized Portable Paths
set "NODE_PATH=%DEV_TOOLS%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS%\jdk-17.0.10+7"
set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

echo [BUILD] Using Java from: %JAVA_HOME%
echo [BUILD] Using Node from: %NODE_PATH%

cd /d "%~dp0"

echo [BUILD] Step 1: Vite...
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%

echo [BUILD] Step 2: Capacitor...
call npx cap sync android
if %errorlevel% neq 0 exit /b %errorlevel%

echo [BUILD] Step 3: Gradle...
cd android
call gradlew.bat clean assembleRelease
if %errorlevel% neq 0 exit /b %errorlevel%

echo [BUILD] DONE!
exit /b 0
