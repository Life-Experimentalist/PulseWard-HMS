// PM2 ecosystem file — non-Docker production deployments
// Usage:
//   pm2 start ecosystem.config.cjs        # start all
//   pm2 reload ecosystem.config.cjs       # zero-downtime reload
//   pm2 logs                              # tail all logs
//   pm2 monit                             # live dashboard
//   pm2 save && pm2 startup               # persist across reboots

module.exports = {
  apps: [
    {
      name: 'pulseward-api',
      script: 'node',
      args: ['--no-warnings', 'services/api-gateway/src'],
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        API_PORT: 8787,
      },
      env_file: '.env',
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
