$DevToolsPath = "C:\Users\60003078\Desktop\Advance Software\DEV_TOOLS"
if (!(Test-Path $DevToolsPath)) {
    New-Item -ItemType Directory -Path $DevToolsPath -Force
}

function Install-Tool {
    param ($Name, $Url, $CheckFile, $IsZip = $true)
    $FullCheckPath = Join-Path $DevToolsPath $CheckFile

    if (!(Test-Path $FullCheckPath)) {
        Write-Host "Tool missing: $Name"
        if ($IsZip) {
            $ZipPath = Join-Path $DevToolsPath "$Name.zip"
            Write-Host "Downloading $Name (ZIP)..."
            try {
                Invoke-WebRequest -Uri $Url -OutFile $ZipPath -ErrorAction Stop
                Write-Host "Extracting $Name..."

                # Special handling for Git (MinGit)
                if ($Name -eq "Git") {
                    $GitFolder = Join-Path $DevToolsPath "Git"
                    if (!(Test-Path $GitFolder)) { New-Item -ItemType Directory -Path $GitFolder }
                    Expand-Archive -Path $ZipPath -DestinationPath $GitFolder -Force
                } else {
                    Expand-Archive -Path $ZipPath -DestinationPath $DevToolsPath -Force
                }

                Remove-Item $ZipPath -Force
                Write-Host "OK: $Name installed."
            } catch {
                Write-Host "ERROR: Failed to install $Name."
            }
        } else {
            Write-Host "Downloading $Name (Binary)..."
            try {
                Invoke-WebRequest -Uri $Url -OutFile $FullCheckPath -ErrorAction Stop
                Write-Host "OK: $Name installed."
            } catch {
                Write-Host "ERROR: Failed to download $Name."
            }
        }
    } else {
        Write-Host "OK: $Name exists at $FullCheckPath"
    }
}

# 1. Portable Node.js (v20.11.1)
Install-Tool "NodeJS" "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip" "node-v20.11.1-win-x64\node.exe"

# 2. Portable JDK 17 (Temurin)
Install-Tool "JDK" "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip" "jdk-17.0.10+7\bin\java.exe"

# 3. Platform Tools (ADB)
Install-Tool "ADB" "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" "platform-tools\adb.exe"

# 4. Cloudflared (Latest Binary)
Install-Tool "Cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" "cloudflared.exe" $false

# 5. Portable Git (MinGit for Windows)
Install-Tool "Git" "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/MinGit-2.44.0-64-bit.zip" "Git\cmd\git.exe"

Write-Host "--- Ensuring Node Modules are installed ---"
$OriginalPath = Get-Location
$env:PATH = "$(Join-Path $DevToolsPath "node-v20.11.1-win-x64");$(Join-Path $DevToolsPath "Git\cmd");$env:PATH"

Write-Host "Installing Root Modules..."
npm install

Set-Location $OriginalPath
Write-Host "=========================================="
Write-Host "   NINJA PORTABLE ENVIRONMENT IS READY    "
Write-Host "=========================================="
