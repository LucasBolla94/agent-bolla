# 🚀 How to Start Agent Bolla

This guide covers starting Agent Bolla on any platform (Windows, Linux, macOS) via SSH or local terminal.

---

## 📋 Prerequisites

1. **Node.js 20+** installed
2. **PostgreSQL** running and configured (check `.env`)
3. **Project built**: Run `npm run build` first
4. **(Optional) PM2** for 24/7 operation: `npm install -g pm2`

---

## 🖥️ Quick Start (Any Platform)

### Option 1: Universal Node.js Script (Recommended)

```bash
# First time or after code changes
npm run build

# Start with QR code scanning
node start.js

# Or skip QR code (if already authenticated)
node start.js --background
```

**What it does:**
- ✅ Works on Windows, Linux, macOS
- ✅ Works via SSH or local terminal
- ✅ Auto-detects PM2 availability
- ✅ Handles QR code scanning gracefully
- ✅ Falls back to foreground if PM2 not available

---

## 🐧 Linux / macOS

### Option 2: Bash Script

```bash
# Make executable (first time only)
chmod +x start-bolla.sh

# Start with QR code scanning
./start-bolla.sh

# Or skip QR code (if already authenticated)
./start-bolla.sh --background
```

### Quick Commands

```bash
# Build and start
npm run build && node start.js

# Using npm scripts
npm run start  # Runs node dist/index.js directly
```

---

## 🪟 Windows

### Option 3: PowerShell Script

```powershell
# Start with QR code scanning
.\start-bolla.ps1

# Or skip QR code (if already authenticated)
.\start-bolla.ps1 -Background
```

### Option 4: Command Prompt (CMD)

```cmd
REM Build first
npm run build

REM Start with Node.js script
node start.js

REM Or start directly
npm run start
```

### Windows Terminal Tips

- Use **Windows Terminal** for best experience
- Increase font size for QR code readability
- If QR code not readable, zoom out the terminal window

---

## 🌐 SSH Connections

When connecting via SSH, the QR code will be displayed with optimized characters for terminal compatibility.

### SSH Tips

1. **Use modern SSH clients:**
   - Windows: Windows Terminal, MobaXterm
   - macOS: iTerm2, Terminal
   - Linux: Any terminal with UTF-8 support

2. **If QR code is unreadable:**
   - Increase terminal font size
   - Zoom out the window
   - Use a terminal with better Unicode support
   - The script will show raw QR text as fallback

3. **Scan with WhatsApp:**
   - Open WhatsApp on phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code on screen

4. **After scanning:**
   - Press `Ctrl+C` to stop the QR code mode
   - Agent will automatically start in background with PM2
   - Or it will continue in foreground if PM2 not available

---

## 📦 PM2 Management (24/7 Operation)

If PM2 is installed, the agent runs in background automatically.

```bash
# View logs
pm2 logs agent-bolla

# Check status
pm2 status

# Restart agent
pm2 restart agent-bolla

# Stop agent
pm2 stop agent-bolla

# Live monitoring
pm2 monit

# Remove from PM2
pm2 delete agent-bolla
```

---

## 🔧 Troubleshooting

### QR Code Not Showing

**Solution:**
1. Check that WhatsApp is enabled in `.env`: `WHATSAPP_ENABLED=true`
2. Build the project: `npm run build`
3. Clear auth data: `rm -rf data/whatsapp-auth`

### "dist/index.js not found"

**Solution:**
```bash
npm run build
```

### Port Already in Use

**Solution:**
```bash
# Stop existing instances
pm2 delete agent-bolla

# Or kill node processes
pkill -f "node.*dist/index.js"  # Linux/Mac
taskkill /F /IM node.exe         # Windows
```

### PM2 Not Found

**Solution:**
```bash
# Install globally
npm install -g pm2

# Or use without PM2 (foreground mode)
node dist/index.js
```

### SSH Timeout During QR Scan

**Solution:**
1. The script has a 60-second timeout
2. After timeout, it continues to background automatically
3. WhatsApp session persists, so re-run to authenticate:
   ```bash
   node start.js
   ```

### Database Connection Failed

**Solution:**
1. Check PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql  # Linux
   ```
2. Verify `.env` DATABASE_URL
3. Test connection:
   ```bash
   psql "postgresql://agent_user:agent_secure_pass_2026@localhost:5432/agent_db"
   ```

---

## 📝 Environment Variables

Key settings in `.env`:

```bash
# WhatsApp
WHATSAPP_ENABLED=true
WHATSAPP_AUTH_DIR=data/whatsapp-auth

# Owner contact
OWNER_WHATSAPP=5511999999999

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agent_db

# AI Model
AI_API_URL=https://ai.bolla.network/api/generate
AI_API_MODEL=llama3.2:3b
```

---

## 🎯 Recommended Workflow

### First Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure .env file
cp .env.example .env
nano .env  # Edit with your settings

# 3. Build project
npm run build

# 4. Start agent (will show QR code)
node start.js

# 5. Scan QR code with WhatsApp

# 6. Press Ctrl+C after scanning
# Agent automatically starts in background with PM2
```

### Daily Operation

```bash
# Start agent (no QR needed if already authenticated)
node start.js --background

# Or with PM2
pm2 start agent-bolla
pm2 logs agent-bolla
```

### After Code Changes

```bash
# 1. Rebuild
npm run build

# 2. Restart
pm2 restart agent-bolla

# Or without PM2
pkill -f "node.*dist/index.js" && node start.js --background
```

---

## 🌟 Platform-Specific Notes

### Windows (SSH via PuTTY, MobaXterm)

- QR code may need terminal zoom adjustment
- Use `start-bolla.ps1` in PowerShell
- Or `node start.js` in CMD/PowerShell

### Linux (SSH)

- QR code works best in UTF-8 terminals
- Use `./start-bolla.sh` or `node start.js`
- PM2 recommended for server deployment

### macOS (Local or SSH)

- iTerm2 recommended for best QR rendering
- Use `./start-bolla.sh` or `node start.js`

### WSL (Windows Subsystem for Linux)

- Use Linux instructions
- QR code renders well in Windows Terminal
- Can access Windows filesystem: `/mnt/c/...`

---

## 📚 Additional Resources

- **PM2 Documentation**: https://pm2.keymetrics.io/
- **Baileys (WhatsApp)**: https://github.com/WhiskeySockets/Baileys
- **PostgreSQL Setup**: Check `database/` directory

---

## 🆘 Getting Help

If you encounter issues:

1. Check logs: `pm2 logs agent-bolla` or `cat logs/combined.log`
2. Verify `.env` configuration
3. Ensure database is accessible
4. Try rebuilding: `npm run build`
5. Check GitHub issues or documentation

---

**Happy automation! 🤖**
