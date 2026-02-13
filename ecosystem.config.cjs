module.exports = {
  apps: [{
    name: 'agent-bolla',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // Restart configuration
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Advanced features
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true,

    // Monitoring
    instance_var: 'INSTANCE_ID',

    // Environment variables can be loaded from .env file
    // PM2 will automatically load from .env in the same directory
  }]
};
