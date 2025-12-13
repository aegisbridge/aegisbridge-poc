module.exports = {
  apps: [
    {
      name: "aegisbridge-relayer",
      script: "scripts/relayer_bidir_service_nofb.js",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        RELAYER_MODE: "bidir",
        HEALTH_PORT: "8081"
      }
    }
  ]
};
