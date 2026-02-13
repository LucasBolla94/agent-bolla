module.exports = {
  apps: [{
    name: 'agent-bolla',
    script: './dist/index.js',
    cwd: '/root/agent-bolla',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/root/agent-bolla/logs/err.log',
    out_file: '/root/agent-bolla/logs/out.log',
    log_file: '/root/agent-bolla/logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // Restart configuration
    min_uptime: '5s',
    max_restarts: 10,
    restart_delay: 4000,
    kill_timeout: 5000,
  }]
};
