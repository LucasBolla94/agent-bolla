#!/usr/bin/env node

/**
 * Universal Startup Script for Agent Bolla
 * Works on: Windows, Linux, macOS - via SSH or local
 */

const { spawn, exec } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const { platform } = require('os');

const isWindows = platform() === 'win32';
const projectDir = __dirname;
const distPath = join(projectDir, 'dist', 'index.js');
const logsDir = join(projectDir, 'logs');

// Ensure logs directory exists
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

console.log('🤖 Agent Bolla - Universal Startup');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Platform: ${platform()}`);
console.log(`Node: ${process.version}`);
console.log(`SSH: ${process.env.SSH_CONNECTION ? 'Yes' : 'No'}`);
console.log(`Working Dir: ${projectDir}`);
console.log('═══════════════════════════════════════════════════════════\n');

// Check if dist exists
if (!existsSync(distPath)) {
  console.error('❌ Error: dist/index.js not found!');
  console.error('   Run: npm run build');
  process.exit(1);
}

// Check if PM2 is available
function checkPM2() {
  return new Promise((resolve) => {
    exec('pm2 -v', (error) => {
      resolve(!error);
    });
  });
}

// Stop existing instances
async function stopExisting() {
  const hasPM2 = await checkPM2();

  if (hasPM2) {
    console.log('🔄 Stopping existing PM2 instances...');
    await new Promise((resolve) => {
      exec('pm2 delete agent-bolla', () => resolve());
    });
  }

  // Kill any running node processes on the dist file
  if (!isWindows) {
    await new Promise((resolve) => {
      exec(`pkill -f "node ${distPath}"`, () => resolve());
    });
  } else {
    await new Promise((resolve) => {
      exec(`taskkill /F /FI "WINDOWTITLE eq node*${distPath}*" 2>NUL`, () => resolve());
    });
  }

  // Wait a bit for processes to die
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// Start in foreground mode (for QR code scanning)
function startForeground() {
  return new Promise((resolve, reject) => {
    console.log('📱 Starting in foreground mode...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏳ Waiting for WhatsApp QR code...\n');

    const child = spawn('node', [distPath], {
      cwd: projectDir,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let connected = false;
    let timeout = setTimeout(() => {
      if (!connected) {
        console.log('\n⚠️  QR code timeout (60s). Continuing in background...');
        child.kill();
        resolve();
      }
    }, 60000);

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0 || connected) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    // Listen for WhatsApp connection (user can press Ctrl+C after scanning)
    process.on('SIGINT', () => {
      console.log('\n✅ QR code scanned? Continuing to background mode...');
      connected = true;
      clearTimeout(timeout);
      child.kill();
      resolve();
    });
  });
}

// Start in background mode with PM2
async function startBackground() {
  const hasPM2 = await checkPM2();

  if (hasPM2) {
    console.log('\n🚀 Starting with PM2 (24/7 mode)...');
    return new Promise((resolve, reject) => {
      const pm2Start = spawn('pm2', ['start', 'ecosystem.config.cjs'], {
        cwd: projectDir,
        stdio: 'inherit'
      });

      pm2Start.on('exit', (code) => {
        if (code === 0) {
          exec('pm2 save', () => {
            console.log('\n✨ Agent Bolla is now running in background!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📊 Useful commands:');
            console.log('   pm2 logs agent-bolla    → View logs');
            console.log('   pm2 status              → Check status');
            console.log('   pm2 restart agent-bolla → Restart');
            console.log('   pm2 stop agent-bolla    → Stop');
            console.log('   pm2 monit               → Live monitor');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            resolve();
          });
        } else {
          reject(new Error(`PM2 start failed with code ${code}`));
        }
      });
    });
  } else {
    console.log('\n⚠️  PM2 not available. Install with: npm install -g pm2');
    console.log('🚀 Starting in foreground mode instead...');
    console.log('   (Press Ctrl+C to stop)\n');

    const child = spawn('node', [distPath], {
      cwd: projectDir,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    process.on('SIGINT', () => {
      console.log('\n👋 Stopping agent...');
      child.kill();
      process.exit(0);
    });

    return new Promise((resolve) => {
      child.on('exit', () => resolve());
    });
  }
}

// Main execution
async function main() {
  try {
    await stopExisting();

    // If --background flag, skip foreground mode
    if (process.argv.includes('--background') || process.argv.includes('-b')) {
      console.log('⚡ Starting directly in background mode...\n');
      await startBackground();
    } else {
      // Start in foreground first (for QR code)
      await startForeground().catch(err => {
        console.error('Error in foreground mode:', err.message);
      });

      // Then start in background
      await startBackground();
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
