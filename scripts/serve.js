// Game server (run_cmd): static files + local leaderboard API stored on disk.
//   node scripts/serve.js                                  -> http://localhost:8080
//   node scripts/serve.js --export-leaderboard out.json    -> writes {"entries": [...]} and exits
// Leaderboard file: data/leaderboard.json (override with env DDL_DATA_DIR).
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { insertEntry } from "../src/leaderboard.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.DDL_DATA_DIR ? resolve(process.env.DDL_DATA_DIR) : join(ROOT, "data");
const LB_FILE = join(DATA_DIR, "leaderboard.json");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const ALLOWED = ["/src/", "/node_modules/three/"];

export function loadLeaderboard() {
  try { return existsSync(LB_FILE) ? JSON.parse(readFileSync(LB_FILE, "utf8")).entries ?? [] : []; } catch { return []; }
}
async function saveLeaderboard(entries) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LB_FILE, JSON.stringify({ entries }, null, 2));
}
const body = (req) => new Promise((ok, bad) => { let s = ""; req.on("data", (c) => { s += c; if (s.length > 1e6) bad(new Error("too big")); }); req.on("end", () => ok(s)); });
const json = (res, code, obj) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(obj));

// extra: optional handler(req, res) -> true if handled (used by the benchmark runner)
export function startServer({ port = Number(process.env.PORT) || 8080, extra = null, quiet = false } = {}) {
  const server = createServer(async (req, res) => {
    try {
      if (extra && (await extra(req, res))) return;
      let url = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (url === "/api/leaderboard") {
        if (req.method === "GET") return json(res, 200, { entries: loadLeaderboard() });
        if (req.method === "POST") {
          const entries = insertEntry(loadLeaderboard(), JSON.parse(await body(req)));
          await saveLeaderboard(entries);
          return json(res, 200, { entries });
        }
      }
      if (url === "/") url = "/src/web/index.html";
      const file = normalize(join(ROOT, url));
      if (!file.startsWith(ROOT) || !ALLOWED.some((p) => url.startsWith(p))) return res.writeHead(404).end("not found");
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(data);
    } catch (e) {
      json(res, String(e.message).includes("invalid") ? 400 : 404, { error: String(e.message) });
    }
  });
  return new Promise((ok) => server.listen(port, () => { if (!quiet) console.log(`Đảo Đèn Lồng: open http://localhost:${server.address().port}`); ok(server); }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--export-leaderboard");
  if (i >= 0) {
    const out = process.argv[i + 1];
    if (!out) { console.error("usage: --export-leaderboard <out.json>"); process.exit(1); }
    await writeFile(out, JSON.stringify({ entries: loadLeaderboard() }, null, 2));
    console.log(`leaderboard exported to ${out}`);
  } else startServer();
}
