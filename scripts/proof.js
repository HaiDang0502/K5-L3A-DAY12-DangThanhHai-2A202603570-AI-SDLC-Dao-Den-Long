// Regenerates headless evidence for Phase 1 through the REAL CLI (node src/headless.js ...).
// Every check compares actual CLI output with an expectation; nothing is hand-edited.
// Usage: npm run proof   -> writes docs/proof/phase-1/{*.jsonl,inputs/*,results.md}; exit 1 if any check fails.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { playBot } from "./bot.js";

const DIR = "docs/proof/phase-1";
const SC = "tests/scenarios";
mkdirSync(`${DIR}/inputs`, { recursive: true });

function cli(name, args) {
  const out = `${DIR}/${name}.jsonl`;
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, ["src/headless.js", ...args, "--out", out], { encoding: "utf8" });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const text = r.status === 0 ? readFileSync(out, "utf8") : "";
  const lines = text ? text.trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { status: r.status, stderr: r.stderr.trim(), lines, text, ms, cmd: `node src/headless.js ${args.join(" ")} --out ${out}` };
}
const ev = (r, name) => r.lines.filter((l) => l.type === "event" && l.name === name);
const end = (r) => r.lines.at(-1);

const results = [];
function check(id, requirement, r, ok, observed) {
  results.push({ id, requirement, cmd: r.cmd, ok: !!ok, observed });
}

// P-01 contract example
let r = cli("p01_contract_example", ["--seed", "1", "--night", "1", "--scenario", `${SC}/contract_example.scenario.json`, "--inputs", `${SC}/contract_example.inputs.json`, "--ticks", "300", "--snapshot-every", "60"]);
check("P-01", "Contract example runs; mote picked at tick 35 (z=3.5 m, pickup 1.5 m); pulse stuns S1", r,
  r.status === 0 && ev(r, "mote_picked")[0]?.tick === 35 && ev(r, "pulse")[0]?.data.stunned_ids.includes("S1"),
  `exit ${r.status}; mote_picked@${ev(r, "mote_picked")[0]?.tick}; pulse=${JSON.stringify(ev(r, "pulse")[0]?.data)}`);

// P-02 full night won by autopilot from the default start
const bot = playBot(1);
writeFileSync(`${DIR}/inputs/bot_seed1.inputs.json`, JSON.stringify({ frames: bot.frames }));
r = cli("p02_bot_win_seed1", ["--seed", "1", "--night", "1", "--inputs", `${DIR}/inputs/bot_seed1.inputs.json`, "--ticks", "18000", "--snapshot-every", "600"]);
check("P-02", "Night 1 playable start -> win: 5 lanterns lit, game_over won/all_lit", r,
  end(r)?.state === "won" && ev(r, "lantern_lit").length === 5 && ev(r, "game_over")[0]?.data.reason === "all_lit",
  `end=${JSON.stringify(end(r))}; lantern_lit=${ev(r, "lantern_lit").length}; motes=${ev(r, "mote_picked").length}; hits=${ev(r, "player_hit").length}`);

// P-03 determinism: same command twice -> byte-identical
const r2 = cli("p02_bot_win_seed1_run2", ["--seed", "1", "--night", "1", "--inputs", `${DIR}/inputs/bot_seed1.inputs.json`, "--ticks", "18000", "--snapshot-every", "600"]);
const h = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
check("P-03", "Determinism: identical output for same seed + inputs", r2, r.text === r2.text && r.text.length > 0, `sha256 ${h(r.text)} vs ${h(r2.text)}`);

// P-04 lose by flames
writeFileSync(`${DIR}/inputs/lose_flames.scenario.json`, JSON.stringify({ random_motes: false, random_shades: false, motes: [], player: { carried: 4 }, shades: [{ id: "S9", pos: [8, 0, 0] }] }));
r = cli("p04_lose_flames", ["--seed", "1", "--night", "1", "--scenario", `${DIR}/inputs/lose_flames.scenario.json`, "--ticks", "2000"]);
const hits = ev(r, "player_hit");
check("P-04", "Shade contact: -1 flame each hit, invuln 1.5 s (90 ticks) between hits, drop floor(carried*0.5), lose at 0 flames", r,
  end(r)?.state === "lost" && hits.length === 3 && hits[1].tick - hits[0].tick >= 90 && hits[0].data.dropped === 2 && ev(r, "game_over")[0]?.data.reason === "no_flames",
  `hits=${JSON.stringify(hits.map((x) => [x.tick, x.data.flames, x.data.dropped]))}; end=${JSON.stringify(end(r))}`);

// P-05 lose at dawn
writeFileSync(`${DIR}/inputs/dawn.scenario.json`, JSON.stringify({ random_motes: false, random_shades: false, motes: [], shades: [], time_left_s: 5 }));
r = cli("p05_lose_dawn", ["--seed", "1", "--night", "1", "--scenario", `${DIR}/inputs/dawn.scenario.json`, "--ticks", "1000", "--snapshot-every", "60"]);
check("P-05", "Time runs out -> lost/dawn exactly at tick 300 (5 s)", r,
  end(r)?.state === "lost" && end(r)?.ticks === 300 && ev(r, "game_over")[0]?.data.reason === "dawn", `end=${JSON.stringify(end(r))}`);

// P-06 safe radius: player stands at a lantern with 3 shades around -> never hit, shades stay > 6 m
writeFileSync(`${DIR}/inputs/safe.scenario.json`, JSON.stringify({ random_motes: false, random_shades: false, motes: [], player: { pos: [0, 0, 24] }, shades: [{ pos: [0, 0, 10] }, { pos: [12, 0, 25] }, { pos: [-12, 0, 30] }] }));
r = cli("p06_safe_radius", ["--seed", "1", "--night", "1", "--scenario", `${DIR}/inputs/safe.scenario.json`, "--ticks", "1200", "--snapshot-every", "10"]);
let minD = Infinity;
for (const s of r.lines.filter((l) => l.type === "snapshot")) for (const L of s.lanterns) for (const g of s.shades) minD = Math.min(minD, Math.hypot(g.pos[0] - L.pos[0], g.pos[2] - L.pos[2]));
check("P-06", "Shades never enter safe_radius (6 m) of a lantern; player at lantern is never hit", r,
  ev(r, "player_hit").length === 0 && minD > 6, `min shade-lantern distance=${minD.toFixed(3)} m; hits=${ev(r, "player_hit").length}`);

// P-07 pulse stun duration + push
writeFileSync(`${DIR}/inputs/pulse.scenario.json`, JSON.stringify({ random_motes: false, random_shades: false, motes: [], player: { carried: 2 }, shades: [{ id: "S1", pos: [5, 0, 0] }] }));
writeFileSync(`${DIR}/inputs/pulse.inputs.json`, JSON.stringify({ frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }] }));
r = cli("p07_pulse", ["--seed", "1", "--night", "1", "--scenario", `${DIR}/inputs/pulse.scenario.json`, "--inputs", `${DIR}/inputs/pulse.inputs.json`, "--ticks", "130", "--snapshot-every", "1"]);
const snap = (t) => r.lines.find((l) => l.type === "snapshot" && l.tick === t);
check("P-07", "Pulse: costs 1 mote, pushes shade 4 m, stunned for 2 s (ticks 1..120), then chases", r,
  snap(1)?.shades[0].pos[0] === 9 && snap(1)?.player.carried === 1 && snap(120)?.shades[0].state === "stunned" && snap(121)?.shades[0].state === "chase" && snap(1)?.score === 20,
  `t1 pos=${JSON.stringify(snap(1)?.shades[0].pos)} carried=${snap(1)?.player.carried} score=${snap(1)?.score}; t120=${snap(120)?.shades[0].state}; t121=${snap(121)?.shades[0].state}`);

// P-08 malformed input -> exit 2
writeFileSync(`${DIR}/inputs/malformed.inputs.json`, '{"frames":[{"tick":10},{"tick":10}]}');
r = cli("p08_malformed", ["--seed", "1", "--night", "1", "--inputs", `${DIR}/inputs/malformed.inputs.json`, "--ticks", "10"]);
check("P-08", "Malformed inputs file -> exit code 2 + message on stderr", r, r.status === 2 && r.stderr.length > 0, `exit ${r.status}; stderr="${r.stderr}"`);

// P-09 speed of a full 5-minute night without inputs
writeFileSync(`${DIR}/inputs/no_shades.scenario.json`, JSON.stringify({ random_shades: false, shades: [] }));
r = cli("p09_full_night", ["--seed", "7", "--night", "1", "--scenario", `${DIR}/inputs/no_shades.scenario.json`, "--ticks", "18000", "--snapshot-every", "600"]);
check("P-09", "Full 5-minute night (18000 ticks, random motes on) runs headless to dawn, fast, no window/GPU", r,
  r.status === 0 && end(r)?.ticks === 18000 && ev(r, "game_over")[0]?.data.reason === "dawn" && r.ms < 5000,
  `end=${JSON.stringify(end(r))}; wall time ${r.ms.toFixed(0)} ms (incl. Node startup)`);

// ---- report ----
const pass = results.filter((x) => x.ok).length;
const md = [
  "# Phase 1 — headless evidence (generated)",
  "",
  `Generated by \`npm run proof\` (scripts/proof.js) with Node ${process.version} on ${process.platform}. Do not edit by hand.`,
  "",
  `**${pass}/${results.length} checks passed.**`,
  "",
  "| ID | Requirement | Result | Observed |",
  "|---|---|---|---|",
  ...results.map((x) => `| ${x.id} | ${x.requirement} | ${x.ok ? "PASS" : "**FAIL**"} | ${x.observed.replace(/\|/g, "\\|")} |`),
  "",
  "## Commands",
  "",
  ...results.map((x) => `- ${x.id}: \`${x.cmd}\``),
  "",
].join("\n");
writeFileSync(`${DIR}/results.md`, md);
console.log(md);
process.exit(pass === results.length ? 0 : 1);
