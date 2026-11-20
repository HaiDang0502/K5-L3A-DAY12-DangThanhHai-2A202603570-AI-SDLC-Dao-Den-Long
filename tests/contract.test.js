// Contract-level tests: game.contract.json matches the code, and the real CLI behaves per section B/E.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TUNING } from "../src/sim/tuning.js";

const root = new URL("..", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("game.contract.json", root), "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "ddl-"));
const cli = (...args) => spawnSync(process.execPath, ["src/headless.js", ...args], { cwd: root, encoding: "utf8" });

test("CT-01 game.contract.json tuning equals the values the game uses", () => {
  assert.equal(contract.contract_version, "1.1");
  assert.deepEqual(contract.tuning, JSON.parse(JSON.stringify(TUNING)));
  for (const k of ["team", "build_cmd", "run_cmd", "headless_cmd"]) assert.equal(typeof contract[k], "string");
});

test("CT-02 CLI writes JSONL: snapshots, events, end line last; exit 0", () => {
  const out = join(tmp, "a.jsonl");
  const r = cli("--seed", "7", "--night", "1", "--ticks", "100", "--out", out);
  assert.equal(r.status, 0, r.stderr);
  const lines = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].type, "snapshot");
  assert.equal(lines[0].tick, 0);
  assert.equal(lines.filter((l) => l.type === "snapshot").length, 11); // default --snapshot-every 10
  assert.deepEqual(Object.keys(lines.at(-1)), ["type", "ticks", "state", "score"]);
  assert.equal(lines.at(-1).type, "end");
  const snap = lines[0];
  for (const k of ["tick", "sim_tick", "state", "time_left_s", "score", "player", "lanterns", "shades", "motes_active"]) assert.ok(k in snap, k);
});

test("CT-03 malformed inputs / scenario -> exit 2 with stderr", () => {
  const bad = join(tmp, "bad.json");
  writeFileSync(bad, "{not json");
  for (const flag of ["--inputs", "--scenario"]) {
    const r = cli("--seed", "1", "--night", "1", flag, bad, "--ticks", "5", "--out", join(tmp, "x.jsonl"));
    assert.equal(r.status, 2);
    assert.ok(r.stderr.length > 0);
  }
  const dec = join(tmp, "dec.json");
  writeFileSync(dec, JSON.stringify({ frames: [{ tick: 3 }, { tick: 2 }] }));
  assert.equal(cli("--seed", "1", "--night", "1", "--inputs", dec, "--ticks", "5", "--out", join(tmp, "y.jsonl")).status, 2);
  const badType = join(tmp, "bt.json");
  writeFileSync(badType, JSON.stringify({ frames: [{ tick: 0, pulse: "yes" }] }));
  assert.equal(cli("--seed", "1", "--night", "1", "--inputs", badType, "--ticks", "5", "--out", join(tmp, "z.jsonl")).status, 2);
});

test("CT-04 other errors -> non-zero exit", () => {
  assert.notEqual(cli("--seed", "1", "--night", "1", "--ticks", "5").status, 0); // no --out
  assert.notEqual(cli("--seed", "1", "--night", "9", "--ticks", "5", "--out", join(tmp, "n.jsonl")).status, 0);
});

test("CT-05 contract example scenario + inputs run and pick the mote at the exact tick", () => {
  const out = join(tmp, "ex.jsonl");
  const r = cli("--seed", "1", "--night", "1", "--scenario", "tests/scenarios/contract_example.scenario.json", "--inputs", "tests/scenarios/contract_example.inputs.json", "--ticks", "300", "--out", out);
  assert.equal(r.status, 0, r.stderr);
  const lines = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const pick = lines.find((l) => l.name === "mote_picked");
  // v1.1: mote at z=5, pickup 1.0 -> reached when z = 4.0 = 6 m/s * 40/60 s (was tick 35 with v1.0 radius 1.5)
  assert.equal(pick.tick, 40);
});
