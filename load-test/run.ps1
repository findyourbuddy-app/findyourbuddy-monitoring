# Run the FindYourBuddy k6 load / stress test.
#
#   .\run.ps1                                      # load profile, VUS=200, localhost:8001
#   $env:BASE_URL="https://api.example.com"; .\run.ps1
#   $env:SCENARIO="smoke"; .\run.ps1
#   $env:SCENARIO="stress"; $env:RATE="600"; $env:VUS="400"; .\run.ps1
#   .\run.ps1 -Grafana                             # stream results into the stack (dashboard 5)
#
# With no local k6 binary it falls back to the grafana/k6 Docker image.

param([switch]$Grafana)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:BASE_URL)  { $env:BASE_URL  = "http://localhost:8001" }
if (-not $env:SCENARIO)  { $env:SCENARIO  = "load" }

function Get-K6Env([string]$TargetUrl) {
  $args = @("-e", "BASE_URL=$TargetUrl", "-e", "SCENARIO=$($env:SCENARIO)")
  foreach ($key in @("VUS", "RATE", "USERS", "PASSWORD", "P95_MS", "P99_MS", "FAIL_RATE", "SOAK_DURATION", "RUN_ID")) {
    $val = [Environment]::GetEnvironmentVariable($key)
    if ($val) { $args += @("-e", "$key=$val") }
  }
  return $args
}

if ($Grafana) {
  Write-Host ">> Streaming into Prometheus/Grafana. Bring the stack up first: .\..\start.ps1"
  Push-Location ..
  docker compose -f docker-compose.yml -f load-test/docker-compose.k6.yml run --rm k6
  Pop-Location
  exit $LASTEXITCODE
}

if (Get-Command k6 -ErrorAction SilentlyContinue) {
  & k6 run @(Get-K6Env $env:BASE_URL) scenario.js
  exit $LASTEXITCODE
}

Write-Host ">> k6 not found on PATH, using the grafana/k6 Docker image."
$dockerUrl = $env:BASE_URL -replace "localhost", "host.docker.internal" -replace "127.0.0.1", "host.docker.internal"
& docker run --rm -i --add-host host.docker.internal:host-gateway `
  @(Get-K6Env $dockerUrl) -v "$($PWD.Path):/scripts" -w /scripts grafana/k6:0.54.0 run scenario.js
exit $LASTEXITCODE
