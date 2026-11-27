# Stops only selected old Node/Vite dev processes occupying project ports,
# after displaying their command lines and asking for confirmation.
$ErrorActionPreference = 'Stop'
Write-Host 'Pose and Pics — inspect old dev servers (ports 5000/5173)' -ForegroundColor Cyan
$listeners = @(Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) {
  Write-Host 'Ports 5000 and 5173 are free.' -ForegroundColor Green
  exit 0
}
$entries = @()
foreach ($conn in $listeners) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $proc) { continue }
  Write-Host "`nPort $($conn.LocalPort) / PID $($proc.ProcessId): $($proc.Name)"
  Write-Host "Command: $($proc.CommandLine)"
  if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -match '(?i)(vite|src[\\/]server\.js)') {
    $entries += $proc
  } else {
    Write-Host '  Not a recognized Node/Vite dev process; this script will NOT stop it.' -ForegroundColor Yellow
  }
}
$entries = @($entries | Sort-Object ProcessId -Unique)
if ($entries.Count -eq 0) {
  Write-Host 'No recognizable old Node/Vite dev process was found. Stop the owners manually.' -ForegroundColor Yellow
  exit 1
}
Write-Host "`nThese $($entries.Count) recognized dev process(es) can be stopped." -ForegroundColor Yellow
$choice = Read-Host "Type STOP to close ONLY the listed Node/Vite processes (or press Enter to cancel)"
if ($choice -cne 'STOP') { Write-Host 'Cancelled. No processes were stopped.'; exit 0 }
foreach ($proc in $entries) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped PID $($proc.ProcessId)." -ForegroundColor Green
  } catch { Write-Host "Could not stop PID $($proc.ProcessId): $_" -ForegroundColor Red }
}
Write-Host 'Done. You can start the updated project launcher.'
