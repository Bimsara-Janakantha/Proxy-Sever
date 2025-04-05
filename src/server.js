// Import environment variables
require("dotenv").config();

// Import required libraries
const express = require("express");
const { NodeSSH } = require("node-ssh");
const fs = require("fs");

const app = express();
const ssh = new NodeSSH();

const proxyport = process.env.PORT;

// Welcome endpoint
app.get("/", async (req, res) => {
  console.log("New request from stranger!");
  res.status(200).send("Hello, I'm Proxy server. I can hear you!");
});

// Test tunnel endpoint
app.get("/test", async (req, res) => {
  console.log("Tunnel Request Comming");
  try {
    // Connect to the department server
    await ssh.connect({
      host: process.env.SSH_HOST,
      username: process.env.SSH_USERNAME,
      privateKey: fs.readFileSync(process.env.SSH_KEY_PATH, "utf8"),
    });

    // Execute curl command on the department server
    const result = await ssh.execCommand(
      `curl http://localhost:${process.env.DESTINATION_PORT}/hello`
    );

    // Check if the command was successful
    if (result.code === 0) {
      res.send(result.stdout);
    } else {
      res.status(500).send("Error from MainBackend: " + result.stderr);
    }
  } catch (err) {
    console.error("SSH Error:", err);
    res.status(500).send("SSH connection failed");
  } finally {
    ssh.dispose(); // Clean up the SSH connection
  }
});

app.listen(proxyport, () => {
  console.log(`TunnelBackend running on localhost:${proxyport}`);
});
