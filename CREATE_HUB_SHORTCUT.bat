@echo off
title Timekey HUB Shortcut Creator
echo ======================================================
echo          TIMEKEY HUB SHORTCUT CREATOR (V4)
echo ======================================================
echo.
echo Gagawa tayo ng Desktop Icon para maging standalone app
echo ang HUB mo sa laptop na ito.
echo.

set "HUB_URL=https://bosslouie5.github.io/TimeAttendance-System/"
set "SC_NAME=Timekey HUB.url"
set "DESKTOP_PATH=%USERPROFILE%\Desktop"

:: Create a specialized shortcut for App Mode
powershell -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%DESKTOP_PATH%\Timekey HUB.lnk');$s.TargetPath='chrome.exe';$s.Arguments='--app=%HUB_URL%';$s.Save()"

echo [OK] Shortcut created on Desktop!
echo [OK] Standalone App Mode Active.
echo.
echo Maari mo nang gamitin ang icon sa Desktop para i-manage ang system
echo nang walang nakikitang URL bar.
echo ------------------------------------------------------
pause
