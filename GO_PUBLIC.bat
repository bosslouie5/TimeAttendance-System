@echo off
title Multi-Tunnel Public Access - SaaS Pro
setlocal enabledelayedexpansion

:: Define the path to your cloudflared.exe (No-Admin Local Mode)
set "CF_PATH=C:\Users\60003078\Desktop\Advance Software\cloudflared.exe"

:START
cls
echo.
echo ======================================================
echo    PUBLIC TUNNEL SELECTOR (SaaS Internet Access)
echo ======================================================
echo.
echo  [1] Localtunnel (Standard)
echo  [2] Pinggy SSH (Fastest - Best for restricted)
echo  [3] Cloudflare (Ultimate - Bypass Company Firewall)
echo  [4] EXIT
echo.
echo ------------------------------------------------------
set /p choice="Pili ka ng Tunnel Engine (1-3): "

if "%choice%"=="4" exit

echo.
echo TIP: Pwede mong i-type ang "dev" para sa 4002 o "online" para sa 4001
set /p t_port="Anong Port ang i-tu-tunnel? (4001 o 4002): "

:: Auto-convert words to numbers
set "target_port=%t_port%"
if /i "%t_port%"=="dev" set "target_port=4002"
if /i "%t_port%"=="online" set "target_port=4001"

if "%choice%"=="1" goto LOCALTUNNEL
if "%choice%"=="2" goto PINGGY
if "%choice%"=="3" goto CLOUDFLARE
goto START

:LOCALTUNNEL
echo.
echo [*] Requesting Localtunnel URL for Port %target_port%...
npx -y localtunnel --port %target_port%
pause
goto START

:PINGGY
echo.
echo [*] Requesting Pinggy SSH URL for Port %target_port%...
:: Added -tt to fix "Pseudo-terminal will not be allocated" error
ssh -p 443 -o StrictHostKeyChecking=no -tt -R0:localhost:%target_port% a.pinggy.io
pause
goto START

:CLOUDFLARE
echo.
if exist "%CF_PATH%" (
    echo [*] Launching Cloudflare Tunnel using local binary...
    echo ------------------------------------------------------
    "%CF_PATH%" tunnel --url http://localhost:%target_port%
) else (
    echo [*] Launching Cloudflare Tunnel using npx (No binary found)...
    echo ------------------------------------------------------
    npx -y cloudflared tunnel --url http://localhost:%target_port%
)
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Cloudflare failed. Baka kailangan i-update ang Node.js
    echo o sadyang sobrang higpit ng IT niyo.
    pause
)
goto START
