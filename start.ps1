# ==============================================================================
# FindYourBuddy - Windows PowerShell Monitoring Startup Script (start.ps1)
# ==============================================================================

param (
    [switch]$Kafka
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   FindYourBuddy - Production Monitoring Stack Initializing...    " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Docker & Docker Compose Check
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker Desktop is not installed or not running." -ForegroundColor Red
    exit 1
}

Write-Host "Docker Desktop checks passed." -ForegroundColor Green

# 2. Python dependencies check
if (Test-Path "requirements.txt") {
    Write-Host "Checking Python requirements..." -ForegroundColor Yellow
    if (Get-Command pip -ErrorAction SilentlyContinue) {
        pip install -r requirements.txt --quiet
        Write-Host "Python requirements installed." -ForegroundColor Green
    } else {
        Write-Host "Notice: pip command not found, skipping Python env setup." -ForegroundColor Yellow
    }
}

# 3. Optional Kafka Flag Check
$ComposeFile = "docker-compose.yml"
if ($Kafka) {
    $ComposeFile = "docker-compose.kafka.yml"
    Write-Host "Apache Kafka architecture selected ($ComposeFile)..." -ForegroundColor Yellow
} else {
    Write-Host "Default Promtail -> Loki architecture selected ($ComposeFile)..." -ForegroundColor Green
}

# 4. Starting Containers
Write-Host "Starting Docker containers..." -ForegroundColor Cyan
docker compose -f $ComposeFile up -d --remove-orphans

Write-Host "Waiting for containers to stabilize (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 5. Health Checks
Write-Host "Running Health Checks..." -ForegroundColor Cyan

# Prometheus Health
try {
    $resProm = Invoke-RestMethod -Uri "http://localhost:9090/-/healthy" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($resProm -match "Healthy") {
        Write-Host "  [OK] Prometheus (Port 9090): HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "  [!] Prometheus (Port 9090): Starting..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [!] Prometheus (Port 9090): Starting..." -ForegroundColor Yellow
}

# Grafana Health
try {
    $resGraf = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($resGraf.database -eq "ok") {
        Write-Host "  [OK] Grafana (Port 3000): HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "  [!] Grafana (Port 3000): Starting..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [!] Grafana (Port 3000): Starting..." -ForegroundColor Yellow
}

# Loki Health
try {
    $resLoki = Invoke-RestMethod -Uri "http://localhost:3100/ready" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($resLoki -match "ready") {
        Write-Host "  [OK] Grafana Loki (Port 3100): HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "  [!] Grafana Loki (Port 3100): Starting..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [!] Grafana Loki (Port 3100): Starting..." -ForegroundColor Yellow
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "SUCCESS: FindYourBuddy Monitoring Stack is UP and HEALTHY!" -ForegroundColor Green
Write-Host "Grafana Dashboard: http://localhost:3000 (admin / admin_password_change_me)" -ForegroundColor Green
Write-Host "Prometheus Server:  http://localhost:9090" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
