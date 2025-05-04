// Import environment variables
require("dotenv").config();

// Import required libraries
const express = require("express");
const { NodeSSH } = require("node-ssh");
const cors = require("cors");

const proxyport = process.env.PORT;
const app = express();
const ssh = new NodeSSH();

// Middleware to parse JSON request bodies
app.use(express.json());

// Allowed HTTP methods
const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"];

// Configure CORS for future Cloudflare frontend (adjust origin as needed)
app.use(
  cors({
    methods: ALLOWED_METHODS,
    allowedHeaders: ["Content-Type", "Authorization"],
    origin: "*", // Allow all origins for now; update to Cloudflare domain later (e.g., 'https://yourapp.cloudflarepages.dev')
    optionsSuccessStatus: 204,
  })
);

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
      privateKey: process.env.SSH_KEY,
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

// Add tunnel endpoint
app.post("/add", async (req, res) => {
  console.log("req: ", req.body);
  try {
    // Object
    const { num1, num2 } = req.body;
    console.log(`Request to add ${num1} and ${num2}`);

    if (!num1 || !num2) {
      return res.status(400).send("Missing num1 or num2 in query parameters");
    }

    // Connect to the department server
    await ssh.connect({
      host: process.env.SSH_HOST,
      username: process.env.SSH_USERNAME,
      privateKey: process.env.SSH_KEY,
    });

    // Execute curl command on the department server
    const payload = JSON.stringify({
      num1: parseFloat(num1),
      num2: parseFloat(num2),
    });
    const curlcommand = `curl -X POST -H "Content-Type: application/json" -d '${payload}' http://localhost:${process.env.DESTINATION_PORT}/add`;
    const result = await ssh.execCommand(curlcommand);

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

// Handle all HTTP methods (GET, POST, etc.) for the /api endpoint
app.all("/api/*", async (req, res) => {
  console.log("Tunnel Request Coming:", {
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body,
  });

  // Block unsupported methods
  if (!ALLOWED_METHODS.includes(req.method)) {
    console.log(`Method ${req.method} not allowed.`);
    return res
      .status(405)
      .send(
        `Method ${req.method} not allowed. Only GET, POST, PATCH, DELETE are supported.`
      );
  }

  try {
    // Connect to the department server
    await ssh.connect({
      host: process.env.SSH_HOST,
      username: process.env.SSH_USERNAME,
      privateKey: process.env.SSH_KEY,
    });

    // Prepare headers for curl (excluding host and connection-specific headers)
    const headers = Object.entries(req.headers)
      .filter(
        ([key]) =>
          !["host", "connection", "content-length"].includes(key.toLowerCase())
      )
      .map(([key, value]) => `-H "${key}: ${value}"`)
      .join(" ");

    // Prepare the request body (if any)
    const body = ["POST", "PUT"].includes(req.method)
      ? JSON.stringify(req.body)
      : "";
    const bodyFlag = body ? `-d '${body}'` : "";

    // Construct the target URL with the original path
    const targetPath = req.path.startsWith("/api/")
      ? req.path.replace("/api", "")
      : "/hello";

    // Append query parameters if any
    const queryString =
      req.query && Object.keys(req.query).length > 0
        ? "?" + new URLSearchParams(req.query).toString()
        : "";

    const targetUrl = `http://localhost:${process.env.DESTINATION_PORT}${targetPath}${queryString}`;
    console.log("Target: ", targetUrl);
    // Construct the curl command to forward the request
    const curlCommand = `curl -X ${req.method} ${headers} ${bodyFlag} "${targetUrl}"`;

    // Execute the curl command on the department server
    const result = await ssh.execCommand(curlCommand);

    // Log the response from the department server
    console.log("Department Server Response:", {
      stdout: result.stdout,
      //stderr: result.stderr,
      exitCode: result.code,
    });

    // Check if the command was successful
    if (result.code === 0) {
      // Try to parse the response as JSON if possible, otherwise send as plain text
      try {
        const jsonResponse = JSON.parse(result.stdout);
        res.json(jsonResponse);
      } catch (e) {
        res.send(result.stdout);
      }
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
