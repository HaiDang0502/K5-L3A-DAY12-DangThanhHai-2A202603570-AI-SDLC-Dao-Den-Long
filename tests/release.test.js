// Ticket-04 (Contract v1.3): RL-xx — leaderboard rules + export CLI, bench scene & metric formulas, soak CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertEntry, validEntry, isoWithZone } from "../src/leaderboard.js";
import { benchSim, frameStats } from "../src/sim/bench.js";

const root = new URL("..", import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), "ddl-rel-"));
const E = (name, score, at, extra = {}) => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });

test("RL-01 leaderboard: score desc, ties -> earlier first, top 10, name 3-12 [A-Za-z0-9_] (+ Vietnamese)", () => {
  let b = [];
  b = insertEntry(b, E("bob_1", 500, "2026-11-20T10:00:00+07:00"));
  b = insertEntry(b, E("ann", 500, "2026-11-20T09:00:00+07:00"));
  b = insertEntry(b, E("Mây_đêm", 900, "2026-11-20T11:00:00+07:00"));
  assert.deepEqual(b.map((e) => e.name), ["Mây_đêm", "ann", "bob_1"]);
  for (let i = 0; i < 12; i++) b = insertEntry(b, E(`p${i}xx`, 100 + i, "2026-11-20T12:00:00+07:00"));
  assert.equal(b.length, 10);
  assert.equal(b[9].score, 105); // 900, 500, 500, then 111..105
  for (const bad of ["ab", "thirteen_char", "no space", "x-y", ""]) assert.equal(validEntry(E(bad, 1, "2026-11-20T00:00:00Z")), false, bad);
  assert.equal(validEntry(E("ok", 1, "2026-11-20T00:00:00Z", { nights_won: 4 })), false);
  assert.match(isoWithZone(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});

test("RL-02 export: run_cmd --export-leaderboard out.json writes {entries:[...]} in order from disk", () => {
  const data = join(tmp, "data");
  mkdirSync(data);
  writeFileSync(join(data, "leaderboard.json"), JSON.stringify({ entries: [E("top", 9, "2026-11-20T00:00:00Z"), E("low", 1, "2026-11-20T00:00:00Z")] }));
  const out = join(tmp, "lb.json");
  const r = spawnSync(process.execPath, ["scripts/serve.js", "--export-leaderboard", out], { cwd: root, encoding: "utf8", env: { ...process.env, DDL_DATA_DIR: data } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")).entries.map((e) => e.name), ["top", "low"]);
});

test("RL-03 bench scene: 200 wandering shades, 100 motes, L1-L3 lit fuel 100; no spawns/damage/pickup/fuel loss/end", () => {
  const s = benchSim(42);
  assert.equal(s.shades.length, 200);
  assert.equal(s.motes.length, 100);
  assert.deepEqual(s.lanterns.map((L) => L.lit), [true, true, true, false, false]);
  const first = JSON.stringify(s.shades.slice(0, 3).map((x) => [x.x, x.z]));
  for (let i = 0; i < 60 * 40; i++) s.step(null);
  assert.equal(s.state, "playing");
  assert.equal(s.shades.length, 200);
  assert.ok(s.shades.every((x) => x.state === "wander"));
  assert.equal(s.motes.length, 100);
  assert.equal(s.player.flames, 3);
  assert.deepEqual(s.lanterns.slice(0, 3).map((L) => L.fuel / 60), [100, 100, 100]);
  assert.notEqual(JSON.stringify(s.shades.slice(0, 3).map((x) => [x.x, x.z])), first, "shades move");
  assert.equal(JSON.stringify(benchSim(42).shades.map((x) => [x.x, x.z])), JSON.stringify(benchSim(42).shades.map((x) => [x.x, x.z])), "seeded");
});

test("RL-04 frame metrics follow the Ticket-04 definitions", () => {
  const dts = [...Array(98).fill(10), 40, 50]; // 100 frames
  const m = frameStats(dts);
  assert.equal(m.frames, 100);
  assert.equal(m.avg_fps, Math.round((1000 * 100) / (980 + 90) * 10) / 10);
  assert.equal(m.p1_low_fps, 20); // k = ceil(0.01*100) = 1 -> worst 50 ms
  assert.equal(m.frame_ms_p95, 10);
});

test("RL-05 soak CLI: nights rotate, writes the v1.3 fields, crashes 0", () => {
  const out = join(tmp, "soak.json");
  const r = spawnSync(process.execPath, ["--expose-gc", "scripts/soak.js", "--seed", "7", "--nights", "4", "--out", out], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, "utf8"));
  for (const k of ["nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"]) assert.ok(k in j, k);
  assert.equal(j.nights, 4);
  assert.equal(j.crashes, 0);
  assert.equal(j.results.length, 4);
});
