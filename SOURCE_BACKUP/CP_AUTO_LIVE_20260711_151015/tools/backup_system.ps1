param (
    [string]$Action = "backup",
    [string]$CheckpointName = ""
)

$RootDir = Get-Location
$BackupDir = Join-Path $RootDir "SOURCE_BACKUP"
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir }

function Create-Backup {
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $Foldername = if ($CheckpointName) { "CP_$($CheckpointName)_$Timestamp" } else { "AUTO_$Timestamp" }
    $TargetDir = Join-Path $BackupDir $Foldername

    Write-Host "Creating Checkpoint: $Foldername" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $TargetDir | Out-Null

    # Define source folders to backup
    $Folders = @("backend", "mobile-app/src", "web-admin/src", "web-dev/src", "tools")
    $Files = @("package.json", "DEV_TOOLS.bat", "README.md")

    foreach ($f in $Folders) {
        $src = Join-Path $RootDir $f
        if (Test-Path $src) {
            $dest = Join-Path $TargetDir $f
            New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
            Copy-Item -Path $src -Destination $dest -Recurse -Force
        }
    }

    foreach ($f in $Files) {
        $src = Join-Path $RootDir $f
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination $TargetDir -Force
        }
    }

    $TimestampTxt = Join-Path $BackupDir "timestamp.txt"
    "Checkpoint created at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Foldername]" | Out-File $TimestampTxt
    Write-Host "Success: Checkpoint Saved." -ForegroundColor Green
}

function Restore-Backup {
    $Items = Get-ChildItem -Path $BackupDir -Directory | Sort-Object LastWriteTime -Descending
    if ($Items.Count -eq 0) {
        Write-Host "Error: No checkpoints found." -ForegroundColor Red
        return
    }

    Write-Host "`nSelect Checkpoint to Restore:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $Items.Count; $i++) {
        Write-Host "[$($i+1)] $($Items[$i].Name) ($($Items[$i].LastWriteTime))"
    }

    $choice = Read-Host "Input number (0 to cancel)"
    if ($choice -eq "0" -or -not $choice) { return }

    $Selected = $Items[[int]$choice - 1]
    Write-Host "Restoring from $($Selected.Name)..." -ForegroundColor Cyan

    # Restore logic
    Copy-Item -Path "$($Selected.FullName)\*" -Destination $RootDir -Recurse -Force
    Write-Host "Success: System Reverted to $($Selected.Name)." -ForegroundColor Green
}

if ($Action -eq "backup") { Create-Backup }
elseif ($Action -eq "restore") { Restore-Backup }
