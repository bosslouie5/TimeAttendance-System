# Ninja Auto-Start Installer
$ProjectDir = "C:\Users\60003078\Desktop\Advance Software\Time Attendance App"
$VbsFile = "$ProjectDir\GO_LIVE_SILENT.vbs"
$StartupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$ShortcutPath = "$StartupFolder\WinSysHelper.lnk" # Stealth Name

echo "Configuring System Assistant..."

# 1. Create Stealth Startup Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsFile`""
$Shortcut.WorkingDirectory = $ProjectDir
$Shortcut.WindowStyle = 7
$Shortcut.Save()

# 2. Run the Stealth Network Config
Start-Process "$ProjectDir\SYSHOST_NET_CONFIG.bat" -Wait

echo "------------------------------------------------------"
echo "System Optimization Complete."
echo "------------------------------------------------------"

# Run it now for the first time
Start-Process "wscript.exe" -ArgumentList "`"$VbsFile`""
