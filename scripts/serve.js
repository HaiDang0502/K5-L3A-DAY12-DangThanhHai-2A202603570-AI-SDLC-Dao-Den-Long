// Zero-dependency static server for the web build: http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
// Only these folders are served.
const ALLOWED = ["/src/", "/node_modules/three/"];

createServer(async (req, res) => {
  let url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/") url = "/src/web/index.html";
  const file = normalize(join(ROOT, url));
  if (!file.startsWith(ROOT) || !ALLOWED.some((p) => url.startsWith(p))) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`Đảo Đèn Lồng: open http://localhost:${PORT}`));
