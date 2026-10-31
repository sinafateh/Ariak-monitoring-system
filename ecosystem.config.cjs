const path = require("node:path");
const fs = require("node:fs");

const dataDirectory = path.resolve(__dirname, "..", `${path.basename(__dirname)}-data`);
const logDirectory = path.join(dataDirectory, "logs");
fs.mkdirSync(logDirectory, { recursive: true });

module.exports = {
  apps: [
    {
      name: "monitoring-server",
      script: "server/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        API_PORT: 3001,
        WORKSPACE_KEY: "monitoring-system",
        MONITORING_DATA_DIR: dataDirectory,
        MONITORING_LOG_DIR: logDirectory,
      },
      out_file: path.join(logDirectory, "pm2-out.log"),
      error_file: path.join(logDirectory, "pm2-error.log"),
      merge_logs: true,
      time: true,
      autorestart: true,
      max_memory_restart: "512M",
    },
  ],
};
