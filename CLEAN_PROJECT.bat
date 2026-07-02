@echo off
echo Cleaning Project...
echo Killing node processes...
taskkill /F /IM node.exe /T >nul 2>&1

echo Deleting node_modules and build folders...
for /d /r . %%d in (node_modules, dist, build, .vite) do (
    if exist "%%d" (
        echo Deleting "%%d"...
        rd /s /q "%%d"
    )
)

echo.
echo Clean Complete! Run START_PROJECT.bat to reinstall and start.
pause
