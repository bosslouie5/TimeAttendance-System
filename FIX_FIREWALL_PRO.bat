@echo off
title Firewall Master Unlocker - Attendance System
echo Requesting Administrative Privileges...

:: Check for Admin
fltmc >nul 2>&1 || (
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /b
)

echo.
echo ======================================================
echo    UNBLOCKING PORT 4001 FOR NETWORK ACCESS
echo ======================================================
echo.

:: Delete old rules to avoid conflict
netsh advfirewall firewall delete rule name="Time Attendance 4001" >nul 2>&1
netsh advfirewall firewall delete rule name="Attendance_System_In" >nul 2>&1

:: Add the Pro Rule (Allow all profiles, all subnets)
echo [*] Opening Port 4001 (TCP)...
netsh advfirewall firewall add rule name="Attendance_System_In" dir=in action=allow protocol=TCP localport=4001 profile=any description="Allow incoming attendance traffic"

echo.
echo [*] Optimizing Network Visibility...
:: Enable Network Discovery (Para mahanap ang hostname na MBM-IT83)
netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes >nul 2>&1

echo.
echo ======================================================
echo    DONE! Pwede mo nang i-refresh ang browser sa ibang PC.
echo    URL: http://MBM-IT83:4001
echo ======================================================
pause
