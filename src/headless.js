#!/usr/bin/env node
// Headless runner — Test Contract v1.0, section B.
// node src/headless.js --seed <int> --night 1 [--scenario f.json] [--inputs f.json] --ticks <int> --out f.jsonl [--snapshot-every 10]
import { readFileSync, writeFileSync } from "node:fs";
import { parseScenario, parseInputs, ValidationError } from "./sim/sim.js";
import { run } from "./sim/runner.js";

function fail(code, msg) {
  process.stderr.write(`headless: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) fail(1, `unexpected argument ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) fail(1, `missing value for ${k}`);
    a[k.slice(2)] = v;
    i++;
  }
  return a;
}

function intArg(a, name, { required = false, def, min = -Infinity } = {}) {
  if (a[name] === undefined) {
    if (required) fail(1, `--${name} is required`);
    return def;
  }
  if (!/^-?\d+$/.test(a[name])) fail(1, `--${name} must be an integer`);
  const n = Number(a[name]);
  if (n < min) fail(1, `--${name} must be >= ${min}`);
  return n;
}

function readJson(path, kind) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    fail(2, `cannot read ${kind} file ${path}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(2, `${kind} file is not valid JSON: ${e.message}`);
  }
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const seed = intArg(a, "seed", { required: true });
  const night = intArg(a, "night", { required: true });
  if (night !== 1) fail(1, `night ${night} is not available (only night 1)`);
  const ticks = intArg(a, "ticks", { required: true, min: 0 });
  const snapshotEvery = intArg(a, "snapshot-every", { def: 10, min: 1 });
  if (!a.out) fail(1, "--out is required");

  let scenario = {};
  let frames = [];
  try {
    if (a.scenario) scenario = parseScenario(readJson(a.scenario, "scenario"));
    if (a.inputs) frames = parseInputs(readJson(a.inputs, "inputs"));
    const out = run({ seed, scenario, frames, ticks, snapshotEvery });
    writeFileSync(a.out, out);
  } catch (e) {
    if (e instanceof ValidationError) fail(2, e.message);
    fail(1, e.stack || String(e));
  }
}

main();
