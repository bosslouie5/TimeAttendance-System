@echo off
echo Pro-Level Build and Run (Portable Edition)
echo.

:: Kill any existing node processes
taskkill /F /IM node.exe /T >nul 2>&1

:: Build Web Dashboards
echo Building Web-Dev...
cd web-dev
call npm run build
cd ..

echo Building Web-Admin...
cd web-admin
call npm run build
cd ..

:: Start Backend
echo Starting Unified Server on port 4001...
cd backend
start cmd /k "title Unified Server && node server.js"

echo.
echo ==========================================
echo SUCCESS! Dashboards are ready:
echo Dev:   http://localhost:4001/dev
echo Admin: http://localhost:4001/
echo ==========================================
pause
