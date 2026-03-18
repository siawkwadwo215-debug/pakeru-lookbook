/**
 * PAKERU Lookbook — Server with centralized storage
 *
 * The SERVER is the single source of truth.
 * - Pieces metadata stored in data/pieces.json
 * - Product images stored in data/uploads/
 * - Splash video stored in data/media/
 * - API endpoints for CRUD
 * - WebSocket broadcasts changes to all connected clients (phone lookbook)
 *
 * Run:   node server.js
 * PC:    http://localhost:3000        → Admin portal
 * Phone: http://<your-ip>:3000       → Lookbook
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { networkInterfaces } = require("os");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PIECES_FILE = path.join(DATA_DIR, "pieces.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Ensure directories exist
[DATA_DIR, UPLOADS_DIR, MEDIA_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ═══════════════════ PERSISTENT STORAGE ═══════════════════
function loadPieces() {
  try {
    if (fs.existsSync(PIECES_FILE)) return JSON.parse(fs.readFileSync(PIECES_FILE, "utf-8"));
  } catch (e) { console.warn("Failed to load pieces:", e.message); }
  return [];
}

function savePieces(pieces) {
  fs.writeFileSync(PIECES_FILE, JSON.stringify(pieces, null, 2), "utf-8");
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch (e) { console.warn("Failed to load settings:", e.message); }
  return {};
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// Log what we have on startup
const existingPieces = loadPieces();
const existingSettings = loadSettings();
console.log(`  Loaded ${existingPieces.length} pieces from database.`);
console.log(`  Splash video: ${existingSettings.splashVideo ? "YES" : "not set"}`);

// MIME types
const MIME = {
  ".html":"text/html", ".css":"text/css", ".js":"application/javascript",
  ".json":"application/json", ".png":"image/png", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".gif":"image/gif", ".svg":"image/svg+xml",
  ".ico":"image/x-icon", ".ttf":"font/ttf", ".otf":"font/otf",
  ".woff":"font/woff", ".woff2":"font/woff2", ".webp":"image/webp",
  ".mp4":"video/mp4", ".webm":"video/webm", ".ogg":"video/ogg",
};

// ═══════════════════ HTTP SERVER ═══════════════════
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  // ── API: GET /api/pieces ──
  if (pathname === "/api/pieces" && req.method === "GET") {
    const pieces = loadPieces();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(pieces));
    return;
  }

  // ── API: POST /api/pieces (save full list) ──
  if (pathname === "/api/pieces" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const pieces = JSON.parse(body);
        savePieces(pieces);
        broadcastToAll(JSON.stringify({ type: "sync", pieces }));
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: POST /api/upload (upload image as base64 JSON) ──
  if (pathname === "/api/upload" && req.method === "POST") {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const data = JSON.parse(raw);
        const match = data.image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) { res.writeHead(400); res.end('{"error":"Invalid image"}'); return; }
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const buf = Buffer.from(match[2], "base64");
        const filename = Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex") + "." + ext;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, buf);
        const imageUrl = "/data/uploads/" + filename;
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ url: imageUrl }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: POST /api/upload-video (upload splash video as raw binary) ──
  if (pathname === "/api/upload-video" && req.method === "POST") {
    const ext = (req.headers["x-file-ext"] || "mp4").replace(/[^a-z0-9]/gi, "");
    const filename = "splash_" + Date.now().toString(36) + "." + ext;
    const filepath = path.join(MEDIA_DIR, filename);

    // Remove old splash video if it exists
    const settings = loadSettings();
    if (settings.splashVideo) {
      const oldPath = path.join(ROOT, settings.splashVideo);
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch(_){} }
    }

    const writeStream = fs.createWriteStream(filepath);
    let totalBytes = 0;

    req.on("data", chunk => { totalBytes += chunk.length; writeStream.write(chunk); });
    req.on("end", () => {
      writeStream.end(() => {
        const videoUrl = "/data/media/" + filename;
        settings.splashVideo = videoUrl;
        saveSettings(settings);
        // Broadcast video update to all clients
        broadcastToAll(JSON.stringify({ type: "settings", settings }));
        console.log(`  Video uploaded: ${filename} (${(totalBytes/1024/1024).toFixed(1)} MB)`);
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ url: videoUrl, size: totalBytes }));
      });
    });
    req.on("error", (e) => {
      writeStream.destroy();
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // ── API: DELETE /api/video (remove splash video) ──
  if (pathname === "/api/video" && req.method === "DELETE") {
    const settings = loadSettings();
    if (settings.splashVideo) {
      const oldPath = path.join(ROOT, settings.splashVideo);
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch(_){} }
      delete settings.splashVideo;
      saveSettings(settings);
      broadcastToAll(JSON.stringify({ type: "settings", settings }));
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end('{"ok":true}');
    return;
  }

  // ── API: GET /api/settings ──
  if (pathname === "/api/settings" && req.method === "GET") {
    const settings = loadSettings();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(settings));
    return;
  }

  // ── API: POST /api/settings (update settings) ──
  if (pathname === "/api/settings" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const incoming = JSON.parse(body);
        const current = loadSettings();
        const merged = { ...current, ...incoming };
        saveSettings(merged);
        broadcastToAll(JSON.stringify({ type: "settings", settings: merged }));
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: DELETE /api/image?file=... ──
  if (pathname === "/api/image" && req.method === "DELETE") {
    const file = url.searchParams.get("file");
    if (file) {
      const fp = path.join(ROOT, file);
      if (fp.startsWith(UPLOADS_DIR) && fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end('{"ok":true}');
    return;
  }

  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-File-Ext",
    });
    res.end();
    return;
  }

  // ── Static files ──
  let filePath = path.join(ROOT, pathname === "/" ? "index.html" : decodeURIComponent(pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  // Stream large files (video) instead of loading into memory
  if (ext === ".mp4" || ext === ".webm" || ext === ".ogg") {
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end("Not Found"); return; }
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      // Support Range requests for video seeking on mobile
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  fs.readFile(filePath, (err, fileData) => {
    if (err) {
      if (err.code === "ENOENT") { res.writeHead(404); res.end("Not Found"); }
      else { res.writeHead(500); res.end("Server Error"); }
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(fileData);
  });
});

// ═══════════════════ WEBSOCKET ═══════════════════
const clients = new Set();

server.on("upgrade", (req, socket) => {
  if (req.url !== "/ws") { socket.destroy(); return; }

  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-5AB5DC085B63")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );

  clients.add(socket);

  socket.on("data", (buf) => {
    if (buf.length < 2) return;
    const opcode = buf[0] & 0x0F;
    if (opcode === 0x08) { clients.delete(socket); socket.end(); return; }
    if (opcode === 0x09) {
      const pong = Buffer.alloc(2); pong[0] = 0x8A; pong[1] = 0x00;
      socket.write(pong);
    }
  });

  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

function sendWS(socket, data) {
  const payload = Buffer.from(data, "utf-8");
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch (_) {}
}

function broadcastToAll(data) {
  for (const client of clients) {
    if (!client.destroyed) sendWS(client, data);
  }
}

// ═══════════════════ START ═══════════════════
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("");
  console.log("  ╔══════════════════════════════════════════════╗");
  console.log("  ║           PAKERU LOOKBOOK SERVER             ║");
  console.log("  ╠══════════════════════════════════════════════╣");
  console.log("  ║                                              ║");
  console.log(`  ║  PC (Admin):  http://localhost:${PORT}          ║`);
  console.log(`  ║  Phone:       http://${ip}:${PORT}     ║`);
  console.log("  ║                                              ║");
  console.log("  ║  Data persists between restarts.             ║");
  console.log("  ║  Pieces: data/pieces.json                    ║");
  console.log("  ║  Images: data/uploads/                       ║");
  console.log("  ║  Video:  data/media/                         ║");
  console.log("  ║                                              ║");
  console.log("  ╚══════════════════════════════════════════════╝");
  console.log("");
});
