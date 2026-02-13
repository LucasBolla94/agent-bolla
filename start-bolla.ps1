# Agent Bolla - Windows PowerShell Startup Script
# Use: .\start-bolla.ps1 [-Background]

param(
    [switch]$Background
)

$ErrorActionPreference = "Stop"

Write-Host "🤖 Agent Bolla - PowerShell Startup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Working Directory: $PSScriptRoot" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Set working directory
Set-Location $PSScriptRoot

# Check if dist exists
if (-not (Test-Path "dist\index.js")) {
    Write-Host "❌ Error: dist\index.js not found!" -ForegroundColor Red
    Write-Host "   Run: npm run build" -ForegroundColor Yellow
    exit 1
}

# Check if PM2 is available
$HasPM2 = $false
try {
    pm2 -v | Out-Null
    $HasPM2 = $true
} catch {
    $HasPM2 = $false
}

# Stop existing instances
Write-Host "🔄 Stopping existing instances..." -ForegroundColor Yellow

if ($HasPM2) {
    pm2 delete agent-bolla 2>$null | Out-Null
}

# Kill any node processes running dist/index.js
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdline = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
    if ($cmdline -like "*dist\index.js*" -or $cmdline -like "*dist/index.js*") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

# Start foreground (for QR code) unless background flag is set
if (-not $Background) {
    Write-Host "📱 Starting in foreground mode for QR code scanning..." -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "⏳ Scan the QR code when it appears, then press Ctrl+C" -ForegroundColor Yellow
    Write-Host ""

    # Start agent process
    $process = Start-Process -FilePath "node" -ArgumentList "dist\index.js" -NoNewWindow -PassThru

    # Wait for user to press Ctrl+C or timeout after 60 seconds
    $timeout = 60
    $elapsed = 0

    try {
        while (-not $process.HasExited -and $elapsed -lt $timeout) {
            Start-Sleep -Seconds 1
            $elapsed++
        }

        if ($elapsed -ge $timeout) {
            Write-Host ""
            Write-Host "⚠️  Timeout (60s). Stopping foreground process..." -ForegroundColor Yellow
        }
    } finally {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host ""
    Write-Host "✅ QR code scan phase complete." -ForegroundColor Green
    Start-Sleep -Seconds 1
}

# Start in background
Write-Host ""
if ($HasPM2) {
    Write-Host "🚀 Starting with PM2 (24/7 mode)..." -ForegroundColor Green
    pm2 start ecosystem.config.cjs
    pm2 save

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "✨ Agent Bolla is now running in background!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Useful commands:" -ForegroundColor Cyan
    Write-Host "   pm2 logs agent-bolla    → View logs" -ForegroundColor Gray
    Write-Host "   pm2 status              → Check status" -ForegroundColor Gray
    Write-Host "   pm2 restart agent-bolla → Restart" -ForegroundColor Gray
    Write-Host "   pm2 stop agent-bolla    → Stop" -ForegroundColor Gray
    Write-Host "   pm2 monit               → Live monitor" -ForegroundColor Gray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "⚠️  PM2 not available. Install with: npm install -g pm2" -ForegroundColor Yellow
    Write-Host "🚀 Starting in foreground mode..." -ForegroundColor Green
    Write-Host "   (Press Ctrl+C to stop)" -ForegroundColor Yellow
    Write-Host ""

    # Run in foreground
    & node dist\index.js
}
