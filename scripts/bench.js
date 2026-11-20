// Benchmark (bench_cmd): node scripts/bench.js --seed 42 --duration 30 --out bench.json
// Opens a real Chrome/Chromium/Edge window 1280x720 (vsync + frame-rate limit disabled) on the standard
// bench scene (?bench=1), the page measures frame times after a 3 s warm-up and posts the result back.
// Browser path: env CHROME_PATH, else the usual install locations on macOS / Linux / Windows.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, platform, release, arch, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { startServer } from "./serve.js";

const T0 = performance.now(); // "process start" for load_ms
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const seed = Number(arg("seed", 42)), duration = Number(arg("duration", 30)), out = arg("out", "bench.json");
if (!Number.isInteger(seed) || !(duration > 0)) { console.error("usage: --seed <int> --duration <s> --out <file>"); process.exit(1); }

function findBrowser() {
  const c = [process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
  return c.find((p) => existsSync(p));
}
const browser = findBrowser();
if (!browser) { console.error("bench: no Chrome/Chromium/Edge found; set CHROME_PATH"); process.exit(1); }

let firstFrameAt = null, child = null, profile = null;
const done = new Promise((resolve) => {
  globalThis.__benchDone = resolve;
});
const server = await startServer({
  port: 0, quiet: true,
  extra: async (req, res) => {
    const url = new URL(req.url, "http://x").pathname;
    if (process.env.BENCH_DEBUG) console.error(`[bench] ${req.method} ${url} +${Math.round(performance.now() - T0)}ms`);
    if (url === "/bench/first-frame") { firstFrameAt ??= performance.now(); res.writeHead(204).end(); return true; }
    if (url === "/bench/result" && req.method === "POST") {
      let s = ""; for await (const c of req) s += c;
      res.writeHead(204).end();
      globalThis.__benchDone(JSON.parse(s));
      return true;
    }
    return false;
  },
});
const port = server.address().port;
profile = mkdtempSync(join(tmpdir(), "ddl-bench-"));
const url = `http://localhost:${port}/?bench=1&seed=${seed}&duration=${duration}`;
child = spawn(browser, [
  `--app=${url}`, "--window-size=1280,720", "--window-position=40,40", `--user-data-dir=${profile}`,
  "--disable-gpu-vsync", "--disable-frame-rate-limit", "--no-first-run", "--no-default-browser-check",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
], { stdio: "ignore" });
const timeout = setTimeout(() => { console.error("bench: timed out (no result from the page)"); cleanup(1); }, (duration + 60) * 1000);

function cleanup(code) {
  clearTimeout(timeout);
  try { child?.kill(); } catch {}
  server.close();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 800);
}

const r = await done;
let gpu = r.gpu || "unknown GPU";
let osName = `${platform()} ${release()} ${arch()}`;
try { if (platform() === "darwin") osName = "macOS " + execSync("sw_vers -productVersion").toString().trim(); } catch {}
const result = {
  contract_version: "1.3",
  avg_fps: r.avg_fps,
  p1_low_fps: r.p1_low_fps,
  frame_ms_p95: r.frame_ms_p95,
  frames: r.frames,
  load_ms: Math.round((firstFrameAt ?? performance.now()) - T0),
  peak_mem_mb: null,
  peak_mem_note: "Web build: browser RSS is not exposed to the page; js_heap_peak_mb is the page JS heap (Chrome performance.memory).",
  js_heap_peak_mb: r.js_heap_peak_mb,
  vsync_off: true,
  renderer: `Three.js r${r.three} WebGL2 in ${browser.split(/[\\/]/).pop()} (${r.ua}); GPU: ${gpu}`,
  os: `${osName}; CPU: ${cpus()[0]?.model ?? "?"}; RAM: ${Math.round(totalmem() / 2 ** 30)} GB`,
  measured_s: r.measured_s,
  seed,
};
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
cleanup(0);
