@echo off
set "DEV_TOOLS=C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
set "SCRCPY_PATH=%DEV_TOOLS%\scrcpy\scrcpy-win64-v2.4"
set "ADB_PATH=%DEV_TOOLS%\platform-tools"

echo [*] Starting TimeKey Phone Mirroring...
echo [*] Make sure USB Debugging is ON.
echo [*] Current Path: %SCRCPY_PATH%

if not exist "%SCRCPY_PATH%\scrcpy.exe" (
    echo [!] ERROR: scrcpy.exe not found in %SCRCPY_PATH%
    pause
    exit /b
)

cd /d "%SCRCPY_PATH%"
start "" scrcpy.exe --window-title "TIMEKEY - TROPA LAB PHONE" --always-on-top --shortcut-mod=lctrl+lalt

exit