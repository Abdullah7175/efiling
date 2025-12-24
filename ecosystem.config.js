module.exports = {
  apps: [
    {
      name: 'wmp',
      script: '.next/standalone/server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        HOSTNAME: '0.0.0.0',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://119.30.113.18:5000',
        APP_BASE_DIR: '/opt/wmp16'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        HOSTNAME: '0.0.0.0',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://119.30.113.18:5000',
        APP_BASE_DIR: '/opt/wmp16'
      },
      error_file: './logs/wmp-error.log',
      out_file: './logs/wmp-out.log',
      log_file: './logs/wmp-combined.log',
      time: true,
      max_memory_restart: '3G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next'],
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
