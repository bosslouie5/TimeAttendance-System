param(
    [Parameter(Mandatory=$true)]
    [string]$Path,

    [Parameter(Mandatory=$true)]
    [string]$Version
)

if (-not (Test-Path $Path)) {
    Write-Error "Gradle file not found: $Path"
    exit 1
}

$text = [IO.File]::ReadAllText($Path)
$match = [regex]::Match($text, 'versionCode\s+(\d+)')
if ($match.Success) {
    $next = [int]$match.Groups[1].Value + 1
    $text = [regex]::Replace($text, 'versionCode\s+\d+', "versionCode $next")
}
$replacement = 'versionName "' + $Version + '"'
$text = [regex]::Replace($text, 'versionName\s+"[^"]*"', $replacement)
[IO.File]::WriteAllText($Path, $text)
Write-Output "Updated $Path to version $Version"
