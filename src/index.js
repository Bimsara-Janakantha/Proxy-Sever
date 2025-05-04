// Import environment variables
require("dotenv").config();

// Import required libraries
const express = require("express");
const { NodeSSH } = require("node-ssh");
const cors = require("cors");
const fs = require("fs-extra");
const Busboy = require("busboy");
const os = require("os");
const path = require("path");

const proxyport = process.env.PORT;
const app = express();
const ssh = new NodeSSH();

// Allowed HTTP methods
const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"];

// Middleware to parse JSON request bodies
app.use(express.json());

app.use(
  cors({
    methods: ALLOWED_METHODS,
    allowedHeaders: ["Content-Type", "Authorization"],
    origin: "*",
    optionsSuccessStatus: 204,
  })
);

app.get("/", (req, res) => {
  console.log("Hello to a stranger!");
  res.status(200).send("Hello, I'm Proxy server. I can hear you!");
});

app.get("/test", async (req, res) => {
  console.log("Tunnel Test Request");
  try {
    await ssh.connect({
      host: process.env.SSH_HOST,
      username: process.env.SSH_USERNAME,
      privateKey: process.env.SSH_KEY,
    });

    const result = await ssh.execCommand(
      `curl http://localhost:${process.env.DESTINATION_PORT}/`
    );

    if (result.code === 0) {
      res.send(result.stdout);
    } else {
      res.status(500).send("Error from MainBackend: " + result.stderr);
    }
  } catch (err) {
    console.error("SSH Error:", err);
    res.status(500).send("SSH connection failed");
  } finally {
    ssh.dispose();
  }
});

// Universal API tunnel with FormData support
app.all("/api/*", async (req, res) => {
  console.log("Incoming request:", {
    method: req.method,
    headers: req.headers,
    query: req.query,
  });

  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(405).send(`Method ${req.method} not allowed.`);
  }

  const contentType = req.headers["content-type"] || "";
  const isMultipart = contentType.startsWith("multipart/form-data");

  // If multipart/form-data (FormData), handle with Busboy
  if (isMultipart && req.method === "PATCH") {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-"));
    const fields = {};
    const files = [];

    const busboy = Busboy({ headers: req.headers });

    busboy.on("file", (fieldname, file, filename) => {
      const filepath = path.join(tempDir, filename);
      const writeStream = fs.createWriteStream(filepath);
      file.pipe(writeStream);
      files.push({ fieldname, filepath, filename });
    });

    busboy.on("field", (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on("finish", async () => {
      try {
        await ssh.connect({
          host: process.env.SSH_HOST,
          username: process.env.SSH_USERNAME,
          privateKey: process.env.SSH_KEY,
        });

        const remoteTmp = `/tmp/upload-${Date.now()}`;
        await ssh.execCommand(`mkdir -p ${remoteTmp}`);

        for (const f of files) {
          await ssh.putFile(f.filepath, `${remoteTmp}/${f.filename}`);
        }

        const formFlags = [
          ...files.map(
            (f) => `-F "${f.fieldname}=@${remoteTmp}/${f.filename}"`
          ),
          ...Object.entries(fields).map(([k, v]) => {
            // If it's userInfo, parse and re-stringify it to ensure valid JSON
            let safeValue = v;
            if (k === "userInfo") {
              try {
                const parsed = JSON.parse(v); // Ensure it's valid JSON
                safeValue = JSON.stringify(parsed); // Then stringify properly
              } catch (e) {
                console.warn(`Warning: Could not JSON.parse field ${k}`, e);
                safeValue = v;
              }
            }
            return `-F "${k}=${safeValue}"`;
          }),
        ].join(" ");

        const targetPath = req.path.replace("/api", "");
        const targetUrl = `http://localhost:${process.env.DESTINATION_PORT}${targetPath}`;

        const curlCommand = `curl -X PATCH ${formFlags} "${targetUrl}"`;
        const result = await ssh.execCommand(curlCommand);

        if (result.code === 0) {
          try {
            const json = JSON.parse(result.stdout);
            res.json(json);
          } catch {
            res.send(result.stdout);
          }
        } else {
          res.status(500).send("Error from backend: " + result.stderr);
        }
      } catch (err) {
        console.error("SSH error:", err);
        res.status(500).send("SSH connection failed");
      } finally {
        ssh.dispose();
        await fs.remove(tempDir);
      }
    });

    req.pipe(busboy);
  } else {
    // Regular JSON or query request
    try {
      await ssh.connect({
        host: process.env.SSH_HOST,
        username: process.env.SSH_USERNAME,
        privateKey: process.env.SSH_KEY,
      });

      const headers = Object.entries(req.headers)
        .filter(
          ([key]) =>
            !["host", "connection", "content-length"].includes(
              key.toLowerCase()
            )
        )
        .map(([key, value]) => `-H "${key}: ${value}"`)
        .join(" ");

      const body =
        ["POST", "PATCH", "DELETE"].includes(req.method) && req.body
          ? `-d '${JSON.stringify(req.body)}'`
          : "";

      const targetPath = req.path.replace("/api", "");
      const queryString =
        Object.keys(req.query).length > 0
          ? "?" + new URLSearchParams(req.query).toString()
          : "";

      const targetUrl = `http://localhost:${process.env.DESTINATION_PORT}${targetPath}${queryString}`;
      const curlCommand = `curl -X ${req.method} ${headers} ${body} "${targetUrl}"`;

      const result = await ssh.execCommand(curlCommand);

      if (result.code === 0) {
        try {
          const json = JSON.parse(result.stdout);
          res.json(json);
        } catch {
          res.send(result.stdout);
        }
      } else {
        res.status(500).send("Error from backend: " + result.stderr);
      }
    } catch (err) {
      console.error("SSH Error:", err);
      res.status(500).send("SSH connection failed");
    } finally {
      ssh.dispose();
    }
  }
});

app.listen(proxyport, () => {
  console.log(`Proxy server running at http://localhost:${proxyport}`);
});
