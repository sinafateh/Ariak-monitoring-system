module.exports = {
  apps: [{
    name: "monitoring-server",
    script: "server/index.js",
    cwd: "C:/Users/Electronic/Desktop/monitoring system v2",
    env: {
      NODE_ENV: "production",
      PORT: 3001,
      API_PORT: 3001,
      WORKSPACE_KEY: "monitoring-system",
    },
    time: true,
    autorestart: true,
    max_memory_restart: "512M",
  }],
};
