require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const { NodeSSH } = require("node-ssh");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const cors = require("cors");

const app = express();
const ssh = new NodeSSH();
const proxyport = process.env.PORT || 3000;

const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"];

app.use(cors({ origin: "*", methods: ALLOWED_METHODS }));
app.use(express.json());
app.use(fileUpload());

app.get("/", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send("Proxy Server Alive");
});

app.all("/api/*", async (req, res) => {
  const isFormData = req.files && Object.keys(req.files).length > 0;
  const method = req.method;
  const targetPath = req.path.replace("/api", "");
  const targetUrl = `http://localhost:${process.env.DESTINATION_PORT}${targetPath}`;

  try {
    await ssh.connect({
      host: process.env.SSH_HOST,
      username: process.env.SSH_USERNAME,
      privateKey: process.env.SSH_KEY,
    });

    let curlCommand = `curl -X ${method}`;

    if (isFormData) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-"));
      const remoteTmp = `/tmp/upload-${Date.now()}`;
      await ssh.execCommand(`mkdir -p ${remoteTmp}`);

      for (const key in req.files) {
        const file = req.files[key];
        const localPath = path.join(tempDir, file.name);
        await file.mv(localPath);
        await ssh.putFile(localPath, `${remoteTmp}/${file.name}`);
        curlCommand += ` -F "${key}=@${remoteTmp}/${file.name}"`;
      }

      for (const key in req.body) {
        curlCommand += ` -F "${key}=${req.body[key]}"`;
      }

      curlCommand += ` "${targetUrl}"`;
      await fs.remove(tempDir);
    } else {
      // Non-form-data case (JSON or query)
      const headers = `-H "Content-Type: application/json"`;
      const body =
        ["POST", "PATCH", "DELETE"].includes(method) && req.body
          ? `-d '${JSON.stringify(req.body)}'`
          : "";
      curlCommand = `curl -X ${method} ${headers} ${body} "${targetUrl}"`;
    }

    const result = await ssh.execCommand(curlCommand);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (result.code === 0) {
      try {
        res.json(JSON.parse(result.stdout));
      } catch {
        res.send(result.stdout);
      }
    } else {
      res.status(500).send("Error from backend: " + result.stderr);
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).send("Proxy failure");
  } finally {
    ssh.dispose();
  }
});

app.listen(proxyport, () => {
  console.log(`Proxy server running at http://localhost:${proxyport}`);
});
