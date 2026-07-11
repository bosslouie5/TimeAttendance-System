param(
  [string]$ApiBase = 'http://localhost:4002',
  [string]$Tenant = '949230',
  [string]$ManagerId = '0000',
  [string]$ManagerName = 'AutoManager'
)

Write-Host "Running E2E smoke test against $ApiBase for tenant $Tenant"
$headers = @{ 'x-tenant-id' = $Tenant; 'Content-Type' = 'application/json' }

# 1) Create a leave request
$leave = @{ id = "e2e-" + [int](Get-Date -UFormat %s); employeeId = 'E2E_EMP'; employeeName = 'E2E Tester'; type = 'Sick Leave'; startDate = (Get-Date).ToString('yyyy-MM-dd'); endDate = (Get-Date).AddDays(1).ToString('yyyy-MM-dd'); reason = 'E2E test'; reportsTo = $ManagerId; status = 'Pending'; tenantId = $Tenant }
$body = ($leave | ConvertTo-Json -Depth 5)
Write-Host "Creating leave..."
try {
  $res = Invoke-RestMethod -Uri "$ApiBase/api/hr/leaves" -Method Post -Body $body -ContentType 'application/json' -Headers @{ 'x-tenant-id' = $Tenant }
  Write-Host "Created leave id:" $res.id
} catch {
  Write-Host "Create leave failed:" $_.Exception.Message
  exit 2
}

$leaveId = $res.id
Start-Sleep -Seconds 1

# 2) Poll notifications
Write-Host "Fetching notifications..."
try {
  $notes = Invoke-RestMethod -Uri "$ApiBase/api/hr/notifications?tenant=$Tenant" -Method Get -Headers @{ 'x-tenant-id' = $Tenant }
  Write-Host "Notifications count:" ($notes | Measure-Object).Count
} catch {
  Write-Host "Failed fetching notifications:" $_.Exception.Message
}

# 3) Manager approve the leave
$body2 = @{ status = 'Approved'; managerId = $ManagerId; managerName = $ManagerName } | ConvertTo-Json
Write-Host "Approving leave $leaveId as manager $ManagerId"
try {
  $apr = Invoke-RestMethod -Uri "$ApiBase/api/hr/leaves/$leaveId/manager-approve" -Method Put -Body $body2 -ContentType 'application/json' -Headers @{ 'x-tenant-id' = $Tenant }
  Write-Host "Approve response status:" $apr.status
} catch {
  Write-Host "Approve failed:" $_.Exception.Message
  exit 3
}

Start-Sleep -Seconds 1

# 4) Fetch notifications again
Write-Host "Fetching notifications after approval..."
try {
  $notes2 = Invoke-RestMethod -Uri "$ApiBase/api/hr/notifications?tenant=$Tenant" -Method Get -Headers @{ 'x-tenant-id' = $Tenant }
  Write-Host "Notifications count after:" ($notes2 | Measure-Object).Count
  $latest = $notes2 | Select-Object -First 5
  $latest | ForEach-Object { Write-Host "- $($_.title) : $($_.message)" }
} catch {
  Write-Host "Failed fetching notifications after approval:" $_.Exception.Message
}

Write-Host "E2E smoke completed."