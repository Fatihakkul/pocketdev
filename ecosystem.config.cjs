module.exports = {
  apps: [
    {
      name: "pocketdev",
      script: "dist/index.js",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
