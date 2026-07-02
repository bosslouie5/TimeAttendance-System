@echo off
title Emergency Shutdown
echo [!] Stopping Time Attendance Services (Safe Mode)...
:: Kill only the server and the tunnel
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM cloudflared.exe /T >nul 2>&1
:: We DON'T kill java.exe anymore to keep Android Studio stable
echo [OK] Server and Tunnel are closed. IDE remains safe.
pause
