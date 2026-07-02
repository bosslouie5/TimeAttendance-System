# Pro Alias Setup for Web-Dev
$HostsPath = "C:\Windows\System32\drivers\etc\hosts"
$Alias = "127.0.0.1 Web-Dev"

echo "======================================================"
echo "      WEB-DEV LINK ACTIVATOR (SaaS PROTOTYPE)"
echo "======================================================"
echo ""

try {
    $Content = Get-Content $HostsPath
    if ($Content -notcontains $Alias) {
        echo "[*] Adding Web-Dev mapping to your system..."
        # Requires Admin
        Add-Content -Path $HostsPath -Value "`n$Alias" -ErrorAction Stop
        echo "[SUCCESS] Maaari mo nang gamitin ang http://Web-Dev:4001 sa browser mo!"
    } else {
        echo "[INFO] Web-Dev is already active on this laptop."
    }
} catch {
    echo ""
    echo "[ERROR] Kailangan ng Administrator rights para ma-update ang system hosts."
    echo "------------------------------------------------------"
    echo "PAANO I-FIX:"
    echo "1. I-right click itong file (ACTIVATE_WEB_DEV_LINK.ps1)."
    echo "2. Piliin ang 'Run with PowerShell'."
    echo "3. I-click ang 'YES' kapag nag-prompt ang Windows."
    echo "------------------------------------------------------"
}

echo ""
echo "Press any key to exit..."
$x = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
