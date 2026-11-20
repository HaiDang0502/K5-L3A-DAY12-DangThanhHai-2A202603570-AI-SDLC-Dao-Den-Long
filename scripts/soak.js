// Soak test (soak_cmd): node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json
// Runs nights 1 -> 2 -> 3 -> 1 ... headless in ONE process; night i uses seed (seed + i); random inputs by seed:
// new move direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact.
import { writeFileSync } from "node:fs";
import { Sim, makeRng } from "../src/sim/sim.js";
import { NIGHTS } from "../src/sim/maps.js";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const seed = Number(arg("seed", 7)), nights = Number(arg("nights", 10)), out = arg("out", "soak.json");
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) { console.error("usage: --seed <int> --nights <n> --out <file>"); process.exit(1); }
const rssMb = () => { globalThis.gc?.(); return Math.round((process.memoryUsage().rss / 2 ** 20) * 10) / 10; };

export function playNight(night, s, onLoaded) {
  const sim = new Sim({ seed: s, night });
  onLoaded?.();
  const rng = makeRng(s ^ 0x5eed);
  const maxTicks = NIGHTS[night].duration_s * 60;
  let move = [0, 0];
  for (let k = 0; k < maxTicks && sim.state !== "won" && sim.state !== "lost"; k++) {
    if (k % 30 === 0) { const a = rng() * Math.PI * 2; move = [Math.cos(a), Math.sin(a)]; }
    sim.step({ move, cam_yaw_deg: 0, jump: rng() < 0.05, dash: rng() < 0.03, pulse: rng() < 0.02, interact: rng() < 0.1, pause: false });
  }
  return { sim, result: sim.state === "won" ? "won" : "lost" }; // ran to the standard duration -> dawn decided it
}

const t0 = performance.now();
const results = [];
let crashes = 0, memStart = null;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  try {
    let { sim, result } = playNight(night, seed + i, () => { if (i === 0) memStart = rssMb(); }); // RSS right after night 1 is loaded
    results.push(result);
    sim = null; // reset before the next night
  } catch (e) {
    crashes++;
    results.push("crash");
    console.error(`night ${i + 1} crashed:`, e);
  }
}
// let V8 hand freed pages back (memory reducer) before reading RSS after the last reset
for (let k = 0; k < 3; k++) { globalThis.gc?.(); await new Promise((r) => setTimeout(r, 200)); }
const memEnd = rssMb(); // after resetting the last night
const report = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round((performance.now() - t0) / 100) / 10, seed, gc_exposed: typeof globalThis.gc === "function", node: process.version };
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
process.exit(crashes === 0 ? 0 : 1);
