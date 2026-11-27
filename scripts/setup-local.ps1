$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backend = Join-Path $root 'backend'
$envPath = Join-Path $backend '.env'
$examplePath = Join-Path $backend '.env.example'
Set-Location $root
Write-Host "=== Pose and Pics: Local XAMPP Startup ===" -ForegroundColor Cyan

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { Write-Host "Install Node.js LTS first." -ForegroundColor Red; exit 1 }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Host "npm was not found. Reinstall Node.js." -ForegroundColor Red; exit 1 }

if (-not (Test-Path $envPath)) {
  if (-not (Test-Path $examplePath)) { Write-Host 'Missing backend/.env.example' -ForegroundColor Red; exit 1 }
  Copy-Item $examplePath $envPath
  Write-Host 'Created backend/.env from example.' -ForegroundColor Yellow
}
$content = [IO.File]::ReadAllText($envPath)
$secretLine = [regex]::Match($content, '(?m)^JWT_SECRET[ \t]*=[ \t]*([^\r\n]*)')
$secretValue = if ($secretLine.Success) { $secretLine.Groups[1].Value.Trim() } else { '' }
if ($secretValue.Length -lt 32 -or $secretValue.StartsWith('REPLACE_')) {
  [byte[]] $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $privateSecret = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  if ($secretLine.Success) { $content = [regex]::Replace($content, '(?m)^JWT_SECRET[ \t]*=[ \t]*[^\r\n]*', "JWT_SECRET=$privateSecret") }
  else { $content += "`r`nJWT_SECRET=$privateSecret`r`n" }
  [IO.File]::WriteAllText($envPath, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Generated a private JWT_SECRET in backend/.env. Keep this file and do not publish it.' -ForegroundColor Green
}

$portLine = [regex]::Match($content, '(?m)^PORT\s*=\s*(\d+)')
$backendPort = if ($portLine.Success) { [int]$portLine.Groups[1].Value } else { 5000 }
foreach ($port in @($backendPort, 5173)) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -gt 0) {
    Write-Host "`nPort $port is already occupied. Close the OLD terminal that started that server." -ForegroundColor Red
    foreach ($pidValue in $owners) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
      Write-Host "  PID: $pidValue" -ForegroundColor Yellow
      if ($process) { Write-Host "  Process: $($process.Name) | $($process.CommandLine)" }
    }
    Write-Host 'If this is already the current server, open the Wi-Fi URL printed by Vite rather than starting another copy.' -ForegroundColor Yellow
    Write-Host 'Otherwise, press Ctrl+C in the previous backend/frontend terminal and rerun this launcher.'
    exit 1
  }
}

if (-not ((Test-Path (Join-Path $root 'node_modules/express/package.json')) -and (Test-Path (Join-Path $root 'node_modules/.bin/nodemon.cmd')) -and (Test-Path (Join-Path $root 'node_modules/.bin/vite.cmd')))) {
  Write-Host 'Installing project dependencies (requires internet for first install)...' -ForegroundColor Yellow
  & npm.cmd install --include=dev
  if ($LASTEXITCODE -ne 0) { Write-Host 'npm install failed. Check internet/npm error above.' -ForegroundColor Red; exit 1 }
}
Write-Host 'Checking/creating missing database and tables (existing rows preserved)...' -ForegroundColor Cyan
& npm.cmd run db:init --workspace=backend
if ($LASTEXITCODE -ne 0) { Write-Host 'Database schema initialization failed. Check details above.' -ForegroundColor Red; exit 1 }
Write-Host '`nSetup checks passed. The START-POSE-AND-PICS.cmd launcher will open backend/frontend terminals.' -ForegroundColor Green
exit 0
