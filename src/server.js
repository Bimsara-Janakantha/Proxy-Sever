require("dotenv").config();
const express = require("express");
const { Client } = require("ssh2");
const { createProxyMiddleware } = require("http-proxy-middleware");
const morgan = require("morgan"); // Added for HTTP request logging

const app = express();
const PORT = process.env.PORT || 3000;

// Add HTTP request logging
app.use(morgan("dev"));

// Validate environment variables
const requiredVars = ["SSH_HOST", "SSH_USERNAME", "SSH_PASSWORD"];
requiredVars.forEach((varName) => {
  if (!process.env[varName]) throw new Error(`Missing ${varName} in .env`);
  console.log(`${varName} : ${process.env[varName]}`);
});

// SSH Tunnel
const conn = new Client();

conn
  .on("ready", () => {
    console.log("SSH tunnel established");

    conn.forwardOut(
      "127.0.0.1",
      process.env.LOCAL_TUNNEL_PORT,
      "127.0.0.1",
      process.env.DESTINATION_PORT,
      (err, stream) => {
        if (err) {
          console.error("SSH Forwarding Error:", err.message);
          console.log("\nTroubleshooting:");
          console.log(
            `1. Verify department server is running on port ${process.env.DESTINATION_PORT}`
          );
          console.log("2. Check netstat: netstat -tulnp | grep 5000");
          console.log(
            "3. Test direct access: curl http://localhost:5000/hello"
          );
          return;
        }
        console.log(
          `Tunnel active: localhost:${process.env.LOCAL_TUNNEL_PORT} → department:${process.env.DESTINATION_PORT}`
        );
      }
    );
  })
  .connect({
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT),
    username: process.env.SSH_USERNAME,
    password: process.env.SSH_PASSWORD,
  })
  .on("error", (err) => {
    console.error("SSH Connection Error:", err);
  });

// Enhanced Proxy Middleware with logging
/* app.use(
  "/",
  createProxyMiddleware({
    target: `http://localhost:${process.env.LOCAL_TUNNEL_PORT}`,
    changeOrigin: true,
    logLevel: "debug",
    onProxyReq: (proxyReq, req, res) => {
      console.log("\nOutgoing Request:");
      console.log(`  Method: ${req.method}`);
      console.log(`  Path: ${req.path}`);
      console.log(`  Headers: ${JSON.stringify(req.headers, null, 2)}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log("\nIncoming Response:");
      console.log(`  Status: ${proxyRes.statusCode}`);
      console.log(`  Headers: ${JSON.stringify(proxyRes.headers, null, 2)}`);
    },
    onError: (err, req, res) => {
      console.error("Proxy Error:", err);
      res.status(500).send("Proxy Error");
    },
  })
); */

app.get("/hello", (req, res) => {
  console.log("Request:", req);
  res.status(200).send("Hello, Proxy server can hear you!");
});

app.listen(PORT, () => {
  console.log(`\nProxy Server running on http://localhost:${PORT}`);
  console.log(`Try accessing: http://localhost:${PORT}/hello`);
});
