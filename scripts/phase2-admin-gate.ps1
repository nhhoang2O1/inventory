$ErrorActionPreference = 'Stop'
$ScriptDirectory = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $Candidate = Join-Path (Get-Location) 'scripts'
  if (-not (Test-Path -LiteralPath $Candidate)) {
    throw 'Cannot determine project path. Run this script from the warehouse-wms root or invoke the .ps1 file with -File.'
  }
  $Candidate
} else {
  $PSScriptRoot
}
$ProjectRoot = Split-Path -Parent $ScriptDirectory
$LogPath = Join-Path $ProjectRoot 'phase2-admin-gate.log'
$StatusPath = Join-Path $ProjectRoot 'phase2-admin-gate.status'

Set-Content -LiteralPath $LogPath -Value "Phase 2 gate started: $(Get-Date -Format o)" -Encoding utf8
Set-Content -LiteralPath $StatusPath -Value 'RUNNING' -Encoding ascii

function Invoke-GateCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Add-Content -LiteralPath $LogPath -Value "`n=== $Name ===" -Encoding utf8
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command *>&1 | Tee-Object -FilePath $LogPath -Append
    $CommandExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
  if ($CommandExitCode -ne 0) {
    throw "$Name failed with exit code $CommandExitCode"
  }
}

$ApiProcess = $null
$WorkerProcess = $null

try {
  Set-Location -LiteralPath $ProjectRoot

  $DockerService = Get-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue
  if ($null -ne $DockerService -and $DockerService.Status -ne 'Running') {
    Start-Service -Name 'com.docker.service'
  }

  $DockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $DockerDesktop
  }

  $DockerReady = $false
  for ($Attempt = 0; $Attempt -lt 36; $Attempt++) {
    cmd.exe /d /c "docker ps >nul 2>&1"
    if ($LASTEXITCODE -eq 0) {
      $DockerReady = $true
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $DockerReady) {
    throw 'Docker engine did not become ready within 180 seconds.'
  }

  Invoke-GateCommand -Name 'npm install and lockfile' -Command {
    npm.cmd install --ignore-scripts --no-audit --no-fund
  }
  Invoke-GateCommand -Name 'foundation verify' -Command { npm.cmd run verify }
  Invoke-GateCommand -Name 'workspace build' -Command { npm.cmd run build }
  Invoke-GateCommand -Name 'workspace tests' -Command { npm.cmd test }
  Invoke-GateCommand -Name 'compose validation' -Command {
    docker compose --env-file .env.example --profile full config --quiet
  }
  Invoke-GateCommand -Name 'start PostgreSQL' -Command {
    docker compose --env-file .env.example up -d postgres
  }

  $DatabaseReady = $false
  for ($Attempt = 0; $Attempt -lt 24; $Attempt++) {
    cmd.exe /d /c "docker compose exec -T postgres pg_isready -U wms_app -d warehouse_wms >nul 2>&1"
    if ($LASTEXITCODE -eq 0) {
      $DatabaseReady = $true
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $DatabaseReady) {
    throw 'PostgreSQL did not become ready within 120 seconds.'
  }

  $env:DATABASE_URL = 'postgresql://wms_app:wms_local_only@localhost:55432/warehouse_wms'
  $env:API_PORT = '3000'
  $env:CORS_ORIGINS = 'http://localhost:5173'
  Invoke-GateCommand -Name 'migration first run' -Command { npm.cmd run db:migrate }
  Invoke-GateCommand -Name 'migration idempotent second run' -Command { npm.cmd run db:migrate }
  Invoke-GateCommand -Name 'migration status' -Command { npm.cmd run db:migrate:status }

  $ApiProcess = Start-Process -FilePath 'node.exe' -ArgumentList 'backend/api/dist/main.js' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  $WorkerProcess = Start-Process -FilePath 'node.exe' -ArgumentList 'backend/worker/dist/main.js' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru

  $ApiReady = $false
  for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    try {
      $Response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/health' -Headers @{ 'X-Correlation-Id' = '6a45bf43-53c1-45bc-8c5c-f207ef62a1b5' } -UseBasicParsing
      if ($Response.StatusCode -eq 200 -and $Response.Headers['X-Correlation-Id']) {
        $ApiReady = $true
        Add-Content -LiteralPath $LogPath -Value "API smoke PASS: HTTP $($Response.StatusCode), correlation=$($Response.Headers['X-Correlation-Id'])" -Encoding utf8
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $ApiReady) {
    throw 'API health smoke test failed.'
  }

  Invoke-GateCommand -Name 'database foundation smoke' -Command {
    docker compose exec -T postgres psql -U wms_app -d warehouse_wms -v ON_ERROR_STOP=1 -c "SELECT to_regclass('platform.idempotency_record'), to_regclass('platform.outbox_event'), to_regclass('audit.audit_event');"
  }

  Set-Content -LiteralPath $StatusPath -Value 'PASSED' -Encoding ascii
  Add-Content -LiteralPath $LogPath -Value "`nPhase 2 runtime gate PASSED: $(Get-Date -Format o)" -Encoding utf8
} catch {
  Set-Content -LiteralPath $StatusPath -Value 'FAILED' -Encoding ascii
  Add-Content -LiteralPath $LogPath -Value "`nFAILED: $($_.Exception.Message)" -Encoding utf8
  throw
} finally {
  if ($null -ne $ApiProcess -and -not $ApiProcess.HasExited) { Stop-Process -Id $ApiProcess.Id -Force }
  if ($null -ne $WorkerProcess -and -not $WorkerProcess.HasExited) { Stop-Process -Id $WorkerProcess.Id -Force }
}
