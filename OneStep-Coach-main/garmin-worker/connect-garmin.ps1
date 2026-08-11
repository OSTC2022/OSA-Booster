# ONE STEP Garmin Connector launcher (no passwords embedded)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host ""
Write-Host "ONE STEP Garmin Connector"
Write-Host ""
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (Test-Path $py) {
  & $py -m app.connect_member
} else {
  python -m app.connect_member
}
Write-Host ""
Read-Host "Press Enter to close"
