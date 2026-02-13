#!/bin/bash
#
# Agent Bolla - Linux/Mac Startup Script
# Use: ./start-bolla.sh [--background]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🤖 Agent Bolla - Bash Startup"
echo "═══════════════════════════════════════════════════════════"
echo "Working Directory: $SCRIPT_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if dist exists
if [ ! -f "dist/index.js" ]; then
    echo "❌ Error: dist/index.js not found!"
    echo "   Run: npm run build"
    exit 1
fi

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    HAS_PM2=1
else
    HAS_PM2=0
fi

# Stop existing instances
echo "🔄 Stopping existing instances..."
if [ $HAS_PM2 -eq 1 ]; then
    pm2 delete agent-bolla 2>/dev/null || true
fi
pkill -f "node.*dist/index.js" 2>/dev/null || true
sleep 1

# Background mode flag
BACKGROUND_MODE=0
if [ "$1" = "--background" ] || [ "$1" = "-b" ]; then
    BACKGROUND_MODE=1
fi

# Start foreground (for QR code) unless background flag is set
if [ $BACKGROUND_MODE -eq 0 ]; then
    echo "📱 Starting in foreground mode for QR code scanning..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⏳ Scan the QR code when it appears, then press Ctrl+C"
    echo ""

    # Create temp log
    TEMP_LOG="/tmp/bolla-startup-$$.log"
    rm -f "$TEMP_LOG"

    # Start agent
    node dist/index.js 2>&1 | tee "$TEMP_LOG" &
    AGENT_PID=$!

    # Wait for Ctrl+C or timeout
    (
        sleep 60
        if kill -0 $AGENT_PID 2>/dev/null; then
            echo ""
            echo "⚠️  Timeout (60s). Stopping foreground process..."
            kill $AGENT_PID 2>/dev/null || true
        fi
    ) &
    TIMEOUT_PID=$!

    # Wait for process to end (Ctrl+C or timeout)
    wait $AGENT_PID 2>/dev/null || true
    kill $TIMEOUT_PID 2>/dev/null || true

    # Cleanup
    rm -f "$TEMP_LOG"
    echo ""
    echo "✅ QR code scan phase complete."
    sleep 1
fi

# Start in background
echo ""
if [ $HAS_PM2 -eq 1 ]; then
    echo "🚀 Starting with PM2 (24/7 mode)..."
    pm2 start ecosystem.config.cjs
    pm2 save

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✨ Agent Bolla is now running in background!"
    echo ""
    echo "📊 Useful commands:"
    echo "   pm2 logs agent-bolla    → View logs"
    echo "   pm2 status              → Check status"
    echo "   pm2 restart agent-bolla → Restart"
    echo "   pm2 stop agent-bolla    → Stop"
    echo "   pm2 monit               → Live monitor"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
else
    echo "⚠️  PM2 not available. Install with: npm install -g pm2"
    echo "🚀 Starting in foreground mode..."
    echo "   (Press Ctrl+C to stop)"
    echo ""
    exec node dist/index.js
fi
