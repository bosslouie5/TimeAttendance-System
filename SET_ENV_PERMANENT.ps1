# Run this script as Administrator to set Environment Variables permanently

$studioPath = "C:\Users\60003078\Desktop\Advance Software\android-studio\bin\studio64.exe"
$javaPath = "C:\Users\60003078\Desktop\Advance Software\android-studio\jbr"

Write-Host "Setting Environment Variables..." -ForegroundColor Cyan

# Set for Current User
[Environment]::SetEnvironmentVariable("CAPACITOR_ANDROID_STUDIO_PATH", $studioPath, "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, "User")

# Add JAVA_HOME/bin to Path if not already there
$oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($oldPath -notlike "*$javaPath\bin*") {
    $newPath = $oldPath + ";$javaPath\bin"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "Path updated with Java bin folder." -ForegroundColor Green
}

Write-Host "Done! Please RESTART VS Code and Android Studio to apply changes." -ForegroundColor Yellow
Write-Host "After restarting, you can just run 'npx cap open android' without errors." -ForegroundColor White
