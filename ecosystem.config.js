module.exports = {
  apps: [{
    name: 'invima',
    script: 'src/server.js',
    node_args: '--max-old-space-size=2048',
    max_memory_restart: '1800M',
    env: { NODE_ENV: 'production' }
  }]
};
