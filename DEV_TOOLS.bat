@echo off
title Developer Toolbox - correction v3.1
setlocal enabledelayedexpansion

set "ESC="
set "CYAN=%ESC%[36m"
set "YELLOW=%ESC%[33m"
set "GREEN=%ESC%[32m"
set "MAGENTA=%ESC%[35m"
set "RED=%ESC%[31m"
set "RESET=%ESC%[0m"

:: ADB PATH
set "ADB="C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS\adb\adb.exe""

:MENU
cls
echo %CYAN%======================================================%RESET%
echo           TIMEKEY DEVELOPER TOOLBOX (V4.0)
echo %CYAN%======================================================%RESET%
echo.
echo  [0] %YELLOW%RUN TIMEKEY DEV SYSTEM%RESET% (Port 4002)
echo  [S] %CYAN%RUN TIMEKEY SAAS TEST%RESET% (Public Link)
echo  [1] %GREEN%ACTIVATE USB CONNECT%RESET% (No Internet / Phone Sync)
echo  [2] %YELLOW%REBUILD LOCAL TEST%RESET% (Build Dev Lab UI)
echo  [3] %MAGENTA%RUN MOBILE SAFE%RESET% (Start phone app on local dev)
echo  [4] %MAGENTA%COMMIT LOCAL TO WEB%RESET% (Push changes to Online)
echo.
echo  [5] %CYAN%INITIAL SETUP / REPAIR%RESET% (Install Modules)
echo  [6] %RED%STOP EVERYTHING%RESET% (Kill all system instances)
echo  [7] EXIT
echo.
echo %CYAN%------------------------------------------------------%RESET%
set /p choice="Pili ka, tropa (0-7): "

if "%choice%"=="0" goto RUN_DEV_SYSTEM
if /i "%choice%"=="S" goto RUN_SAAS_TEST
if "%choice%"=="1" goto USB_REVERSE
if "%choice%"=="2" goto REBUILD_TEST
if "%choice%"=="3" goto RUN_MOBILE_SAFE
if "%choice%"=="4" goto COMMIT_CHANGES
if "%choice%"=="5" goto INITIAL_SETUP
if "%choice%"=="6" goto STOP_ALL
if "%choice%"=="7" exit
goto MENU

:USB_REVERSE
echo.
echo [%GREEN%*%RESET%] Activating USB Reverse Bridge...
%ADB% kill-server >nul 2>&1
%ADB% start-server >nul 2>&1
echo.
echo [%CYAN%DEVICE LIST%RESET%]
%ADB% devices
echo.
echo [%CYAN%MAPPING PORTS%RESET%]
%ADB% reverse tcp:4002 tcp:4002
%ADB% reverse tcp:4001 tcp:4001
echo.
echo [%GREEN%SUCCESS%RESET%] USB Bridge Active!
echo TIP: Sa Mobile App, gamitin ang URL: %YELLOW%http://127.0.0.1:4002/api%RESET%
echo.
pause
goto MENU

:REBUILD_TEST
echo.
echo [%YELLOW%*%RESET%] Building Local Test components...
cd web-dev && call npx vite build --outDir dist-test
cd ../web-admin && call npx vite build --outDir dist-test
cd ../mobile-app && call npx vite build --outDir dist-test
cd ..
echo.
echo [%GREEN%SUCCESS%RESET%] Local Dev Lab updated.
pause
goto MENU

:RUN_MOBILE_SAFE
echo.
echo [%MAGENTA%*%RESET%] Starting Mobile Safe Flow...
call "%~dp0RUN_MOBILE_SAFE.bat"
echo.
pause
goto MENU

:COMMIT_CHANGES
echo.
echo %RED%!!! WARNING !!!%RESET%
echo Isasalin mo ang mga bagong code mula sa Lab papunta sa LIVE Clients.
set /p confirm="Sigurado ka ba, tropa? (Y/N): "
if /i "%confirm%" neq "Y" goto MENU

echo.
echo [%MAGENTA%*%RESET%] Deploying to Production...
xcopy /s /y web-dev\dist-test\* web-dev\dist\
xcopy /s /y web-admin\dist-test\* web-admin\dist\
xcopy /s /y mobile-app\dist-test\* mobile-app\dist\
echo.
echo [%GREEN%SUCCESS%RESET%] Online System is now UPDATED.
pause
goto MENU

:INITIAL_SETUP
echo.
echo [%CYAN%*%RESET%] Fixing modules...
call npm install
cd backend && call npm install
cd ..
echo [%GREEN%DONE%RESET%]
pause
goto MENU

:STOP_ALL
echo.
echo [%RED%*%RESET%] Stopping all processes...
taskkill /F /IM node.exe /T >nul 2>&1
echo [%GREEN%DONE%RESET%]
pause
goto MENU

:RUN_DEV_SYSTEM
echo.
echo [%YELLOW%*%RESET%] Checking Data Persistence...
if exist "backend\data.json" (
    if not exist "backend\data-test.json" (
        echo [%YELLOW%*%RESET%] No test data found. Initializing Lab from Live Data...
        copy /y "backend\data.json" "backend\data-test.json" >nul
    ) else (
        echo [%GREEN%*%RESET%] Existing Lab Data found. Keeping your test tenants safe!
    )
)

echo [%YELLOW%*%RESET%] Starting TIMEKEY.DEV Local Instance...
:: Set Portable Environment (Rule 4)
set "DEV_TOOLS_PATH=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS_PATH%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS_PATH%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS_PATH%\jdk-17.0.10+7"

if not exist "%NODE_PATH%\node.exe" (
    echo [!] Tools not found. Downloading...
    powershell -ExecutionPolicy Bypass -File ".\SET_UP_TOOLS.ps1"
)

set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

echo  [%YELLOW%STATUS%RESET%] System is running on Port 4002
echo  [%YELLOW%STATUS%RESET%] Database: data-test.json (Sync'd from Live)
echo  [%CYAN%MOBILE LINK%RESET%] http://127.0.0.1:4002/api
echo.
cd backend
set SYSTEM_MODE=test
:: Launch Timekey as a Clean Desktop App (Ninja Style)
start chrome.exe --app="http://127.0.0.1:4002/dev"
node server.js
cd ..
pause
goto MENU

:RUN_SAAS_TEST
echo.
echo [%CYAN%*%RESET%] Checking Data Persistence...
if exist "backend\data.json" (
    if not exist "backend\data-test.json" (
        echo [%CYAN%*%RESET%] Initializing Lab Data from Live...
        copy /y "backend\data.json" "backend\data-test.json" >nul
    ) else (
        echo [%GREEN%*%RESET%] Using existing Lab Data.
    )
)

echo [%CYAN%*%RESET%] Preparing SaaS Environment (Port 4002)...
set "DEV_TOOLS_PATH=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "NODE_PATH=%DEV_TOOLS_PATH%\node-v20.11.1-win-x64"
set "ADB_PATH=%DEV_TOOLS_PATH%\platform-tools"
set "JAVA_HOME=%DEV_TOOLS_PATH%\jdk-17.0.10+7"
set "PATH=%NODE_PATH%;%ADB_PATH%;%JAVA_HOME%\bin;%PATH%"

:: Kill old tunnels
taskkill /F /IM cloudflared.exe /T >nul 2>&1

echo [%CYAN%*%RESET%] Starting Test Server & Tunnel...
cd backend
set SYSTEM_MODE=test
start /b node server.js > server_test.log 2>&1

echo.
echo [%GREEN%SUCCESS%RESET%] Launching SaaS Tunnel for Port 4002...
echo ------------------------------------------------------
echo  AUTO-OPENING Browser kapag ready na ang link...
echo  Check "CURRENT_SERVER_LINK.txt" on Desktop for the URL.
echo ------------------------------------------------------

set "CF_EXE=%DEV_TOOLS_PATH%\cloudflared.exe"
if exist "%CF_EXE%" (
    "%CF_EXE%" tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
) else (
    npx -y cloudflared tunnel --url http://127.0.0.1:4002 > tunnel.log 2>&1
)
cd ..
pause
goto MENU
