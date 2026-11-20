// Regenerates headless evidence through the REAL CLI (node src/headless.js ...). Nothing is hand-edited.
// Usage: npm run proof -> docs/proof/phase-3/{*.jsonl, inputs/*, results.md}; exit 1 if any check fails.
// IDs P2-xx = Ticket-02 rules still in force (expectations updated where Ticket-03 replaced them), P3-xx = Ticket-03.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { playBot } from "./bot.js";

const DIR = "docs/proof/phase-3";
mkdirSync(`${DIR}/inputs`, { recursive: true });
const Q = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [] };
const put = (name, obj) => { const f = `${DIR}/inputs/${name}.json`; writeFileSync(f, JSON.stringify(obj)); return f; };

function cli(name, night, { scenario, inputs, ticks, every = 10, seed = 1, keep = true }) {
  const out = `${DIR}/${name}.jsonl`;
  const args = ["--seed", String(seed), "--night", String(night), ...(scenario ? ["--scenario", scenario] : []), ...(inputs ? ["--inputs", inputs] : []), "--ticks", String(ticks), "--snapshot-every", String(every), "--out", out];
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, ["src/headless.js", ...args], { encoding: "utf8" });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const text = r.status === 0 ? readFileSync(out, "utf8") : "";
  if (!keep) rmSync(out, { force: true });
  const lines = text ? text.trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { status: r.status, stderr: r.stderr.trim(), lines, text, ms, cmd: `node src/headless.js ${args.join(" ")}` };
}
const ev = (r, n) => r.lines.filter((l) => l.type === "event" && l.name === n);
const snap = (r, t) => r.lines.find((l) => l.type === "snapshot" && l.tick === t);
const end = (r) => r.lines.at(-1);
const results = [];
const check = (id, req, r, ok, obs) => results.push({ id, req, cmd: r.cmd, ok: !!ok, obs });

// --- Part 1 standard numbers ---
let r = cli("p01_pickup_deposit", 1, { scenario: put("pickup_deposit", { ...Q, player: { pos: [0, 0, 20] }, motes: [[0, 0, 21], [0, 2, 22], [0, 0, 22.5]] }), inputs: put("pickup_deposit.in", { frames: [{ tick: 0, move: [0, 1] }, { tick: 30, move: [0, 0], interact: true }] }), ticks: 40, every: 1 });
check("P2-01", "Pickup XZ <= 1.0 & height <= 1.5 (mote at Y=2 is skipped); deposit radius 2; +5 per deposited mote (v1.2)", r,
  ev(r, "mote_picked").length === 2 && ev(r, "deposit")[0]?.data.amount === 2 && snap(r, 31)?.score === 10,
  `picked=${ev(r, "mote_picked").length}; deposit=${JSON.stringify(ev(r, "deposit")[0]?.data)}; score@31=${snap(r, 31)?.score}`);

r = cli("p02_pulse", 1, { scenario: put("pulse", { ...Q, player: { carried: 5 }, shades: [{ id: "S1", pos: [4.9, 0.8, 0] }, { id: "S2", pos: [0, 1, 6] }] }), inputs: put("pulse.in", { frames: [{ tick: 0, pulse: true }] }), ticks: 125, every: 1 });
check("P2-02", "Pulse: cost 3, 3D radius 5 from feet+0.8, push 4 m in 15 ticks, stunned 120 ticks, +5", r,
  JSON.stringify(ev(r, "pulse")[0]?.data) === '{"stunned_ids":["S1"]}' && snap(r, 15).shades[0].pos[0] === 8.9 && snap(r, 120).shades[0].state === "stunned" && snap(r, 121).shades[0].state !== "stunned" && snap(r, 1).player.carried === 2 && snap(r, 1).score === 5,
  `S1 x@15=${snap(r, 15).shades[0].pos[0]}; state@120=${snap(r, 120).shades[0].state}, @121=${snap(r, 121).shades[0].state}; carried=${snap(r, 1).player.carried}`);

r = cli("p03_shade_hit", 1, { scenario: put("hit", { ...Q, player: { carried: 7 }, shades: [{ id: "S1", pos: [0.5, 1, 0], state: "chase" }] }), ticks: 100, every: 1 });
const drops = snap(r, 1).motes.filter((m) => m.kind === "dropped");
check("P2-03", "Shade hit: -1 flame, drop floor(7/2)=3 motes on 1.5-2.5 m ring (ttl 8 s), invuln 90, shade recoil", r,
  JSON.stringify(ev(r, "player_hit")[0]?.data) === '{"by":"shade","flames":2,"dropped":3}' && drops.length === 3 && drops.every((m) => m.ttl_s === 8 && Math.hypot(m.pos[0], m.pos[2]) >= 1.49 && Math.hypot(m.pos[0], m.pos[2]) <= 2.51) && snap(r, 1).shades[0].state === "recoil",
  `hit=${JSON.stringify(ev(r, "player_hit")[0]?.data)}; drops=${JSON.stringify(drops.map((m) => m.pos))}`);

r = cli("p04_fall", 1, { scenario: put("fall", { ...Q, player: { pos: [39.9, 0, 0], carried: 4 } }), inputs: put("fall.in", { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }, { tick: 10, move: [0, 0] }] }), ticks: 200, every: 1 });
const fh = ev(r, "player_hit")[0];
check("P2-04", "Fall Y<-10 once: -1 flame, lose all motes, wait 60 ticks, respawn at start with invuln", r,
  JSON.stringify(fh?.data) === '{"by":"fall","flames":2,"dropped":0,"lost":4}' && ev(r, "player_hit").length === 1 && JSON.stringify(snap(r, fh.tick + 60).player.pos) === "[0,0,0]" && snap(r, fh.tick + 60).player.invuln === true,
  `hit@${fh?.tick}=${JSON.stringify(fh?.data)}; pos@+60=${JSON.stringify(snap(r, fh.tick + 60)?.player.pos)}`);

r = cli("p05_safe_zone", 1, { scenario: put("safe", { ...Q, player: { pos: [0, 0, 24], carried: 10 }, shades: [{ id: "S1", pos: [0, 1, 21], state: "chase" }, { id: "S2", pos: [3, 1, 12], state: "chase" }] }), inputs: put("safe.in", { frames: [{ tick: 0, interact: true }] }), ticks: 600, every: 10 });
let minD = Infinity;
for (const s of r.lines.filter((l) => l.type === "snapshot" && l.tick >= 30)) for (const g of s.shades) minD = Math.min(minD, Math.hypot(g.pos[0], g.pos[2] - 25));
check("P2-05", "Lit lantern: shade inside evicted to 6 m within 30 ticks without damage; shades blocked at 6 m edge", r,
  ev(r, "lantern_lit").length === 1 && ev(r, "player_hit").length === 0 && minD >= 6, `min dist after eviction=${minD.toFixed(3)}; hits=${ev(r, "player_hit").length}`);

r = cli("p06_schedule_n1", 1, { scenario: put("sched", { random_motes: true, player: { pos: [0, 0, 25] }, lanterns: [{ id: "L1", lit: true }] }), ticks: 3300, every: 240 });
check("P2-06", "Night 1 schedules: 20 motes at start, +1 per 240 ticks (24 points); shades 2 @300 then every 480, max 6", r,
  snap(r, 0).motes_active === 20 && snap(r, 960).motes_active === 24 && JSON.stringify(ev(r, "shade_spawned").map((e) => e.tick)) === "[300,300,780,1260,1740,2220]",
  `motes@0=${snap(r, 0).motes_active} @960=${snap(r, 960).motes_active}; shade ticks=${JSON.stringify(ev(r, "shade_spawned").map((e) => e.tick))}`);

// --- Part 3 features ---
r = cli("p07_dash", 1, { scenario: put("dash", Q), inputs: put("dash.in", { frames: [{ tick: 0, dash: true }, { tick: 1, dash: false }, { tick: 50, dash: true }, { tick: 51, dash: false }, { tick: 90, dash: true }] }), ticks: 100, every: 1 });
check("P2-07", "Dash 14 m/s x 12 ticks = 2.8 m along facing, cooldown 1.5 s from start", r,
  JSON.stringify(ev(r, "dash").map((e) => e.tick)) === "[1,91]" && snap(r, 12).player.pos[2] === 2.8, `dash ticks=${JSON.stringify(ev(r, "dash").map((e) => e.tick))}; z@12=${snap(r, 12).player.pos[2]}`);

r = cli("p08_pause", 1, { scenario: put("pause", Q), inputs: put("pause.in", { frames: [{ tick: 0, move: [0, 1] }, { tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 40, pause: true }] }), ticks: 60, every: 5 });
check("P2-08", "Pause: tick runs, sim_tick/time frozen, state paused, paused/resumed events", r,
  snap(r, 20).state === "paused" && snap(r, 20).sim_tick === 10 && snap(r, 40).player.pos[2] === snap(r, 15).player.pos[2] && ev(r, "resumed")[0]?.tick === 41,
  `@20 state=${snap(r, 20).state} sim_tick=${snap(r, 20).sim_tick}; resumed@${ev(r, "resumed")[0]?.tick}`);

r = cli("p09_drifter", 2, { scenario: put("drifter", { ...Q, player: { carried: 5 }, drifters: [{ id: "D1", pos: [-10, 1.5, 0] }] }), ticks: 400, every: 10 });
check("P2-09", "Gió Lạc: idle->chase (>=5 motes, <=15 m), steals min(3,n) once, flee 240 ticks, removed; no flame loss", r,
  JSON.stringify(ev(r, "drifter_steal")[0]?.data) === '{"drifter_id":"D1","amount":3,"carried":2}' && snap(r, 400).drifters[0].state === "removed" && ev(r, "player_hit").length === 0,
  `steal=${JSON.stringify(ev(r, "drifter_steal")[0]?.data)}@${ev(r, "drifter_steal")[0]?.tick}; final=${snap(r, 400).drifters[0].state}`);

r = cli("p10_drifter_pulse", 2, { scenario: put("drifter_pulse", { ...Q, player: { carried: 6 }, drifters: [{ id: "D1", pos: [-3, 1.5, 0], state: "flee", stolen: 3, state_ticks_left: 200 }] }), inputs: put("drifter_pulse.in", { frames: [{ tick: 0, pulse: true }] }), ticks: 125, every: 1 });
check("P2-10", "Pulse on a fleeing Gió Lạc with loot: drops all as dropped motes, vanishes after 120 ticks", r,
  JSON.stringify(ev(r, "drifter_drop")[0]?.data) === '{"drifter_id":"D1","amount":3}' && snap(r, 121).drifters[0].state === "removed" && snap(r, 1).motes.length === 3,
  `drop=${JSON.stringify(ev(r, "drifter_drop")[0]?.data)}; state@121=${snap(r, 121).drifters[0].state}`);

r = cli("p11_charm", 2, { scenario: put("charm", { ...Q, player: { pos: [34.5, 0, 0] } }), inputs: put("charm.in", { frames: [{ tick: 1, move: [0, 1], cam_yaw_deg: 90 }, { tick: 61, move: [0, 0], dash: true }, { tick: 62, dash: false }, { tick: 80, dash: true }] }), ticks: 2702, every: 1 });
const cdx = snap(r, 61).player.pos[0] - snap(r, 1).player.pos[0];
check("P2-11", "Bùa Gió: charm_picked 600 ticks, run 7.2 m/s, dash with no cooldown, respawns after 2700", r,
  ev(r, "charm_picked")[0]?.data.charm_ticks === 600 && Math.abs(cdx - 7.2) < 1e-6 && JSON.stringify(ev(r, "dash").map((e) => e.tick)) === "[62,81]" && snap(r, 2701).charms[0].available,
  `moved ${cdx.toFixed(3)} m in 1 s; dash ticks=${JSON.stringify(ev(r, "dash").map((e) => e.tick))}; available@2701=${snap(r, 2701).charms[0].available}`);

r = cli("p12_pad_n2", 2, { scenario: put("pad_n2", { ...Q, player: { pos: [20, 0, 18] } }), ticks: 120, every: 1 });
const land = r.lines.find((x) => x.type === "snapshot" && x.tick > 10 && x.player.grounded);
check("P2-12", "Night 2 pad: 14 m/s up + 24 m/s to island B, ~1.4 s flight, lands on B", r,
  land && land.tick >= 80 && land.tick <= 90 && Math.hypot(land.player.pos[0] - 70, land.player.pos[2]) <= 28, `landed tick ${land?.tick} at ${JSON.stringify(land?.player.pos)}`);

const a = Math.PI / 6;
r = cli("p13_ramp_pad_n3", 3, { scenario: put("ramp_n3", { ...Q, player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }), inputs: put("ramp_n3.in", { frames: [{ tick: 0, move: [-Math.cos(a), -Math.sin(a)] }] }), ticks: 80, every: 80 });
const r2 = cli("p13b_pad_n3", 3, { scenario: put("pad_n3", { ...Q, player: { pos: [0, 3, 13] } }), ticks: 90, every: 1 });
const land3 = r2.lines.find((x) => x.type === "snapshot" && x.tick > 5 && x.player.grounded);
check("P2-13", "Night 3: ramp climbs to tier 1 (Y=3); pad (0,3,13) lands on tier 2 (Y=6)", r,
  snap(r, 80).player.pos[1] === 3 && land3?.player.pos[1] === 6, `ramp y@80=${snap(r, 80).player.pos[1]}; pad landing=${JSON.stringify(land3?.player.pos)}@${land3?.tick}`);

r = cli("p14_wind_n3", 3, { scenario: put("wind", { ...Q, wind_enabled: true, player: { pos: [0, 0, -30] } }), ticks: 2110, every: 10 });
check("P2-14", "Night 3 wind: gust at 30 s for 5 s, 2 m/s push, in snapshot", r,
  snap(r, 1800).wind.active && !snap(r, 2110).wind.active && !snap(r, 1790).wind.active, `wind@1800=${JSON.stringify(snap(r, 1800).wind)}; @2110=${JSON.stringify(snap(r, 2110).wind)}`);

// --- whole nights: playability, determinism, performance ---
let botSeed = 0, bot = null;
for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) { const b = playBot(s, 1); if (b.state === "won") { botSeed = s; bot = b; break; } }
bot ??= playBot(2, 1);
const botIn = put("bot_n1.in", { frames: bot.frames });
r = cli("p15_bot_n1", 1, { inputs: botIn, ticks: 21600, every: 600, seed: botSeed || 2 });
const rr = cli("p15_bot_n1_run2", 1, { inputs: botIn, ticks: 21600, every: 600, seed: botSeed || 2, keep: false });
const h = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
check("P2-15", "Night 1 played from the default start to dawn by the autopilot through the CLI (won = dawn_survived); byte-identical rerun", r,
  end(r).state === "won" && ev(r, "game_over")[0]?.data.reason === "dawn_survived" && r.text === rr.text,
  `seed ${botSeed || "none won"}; end=${JSON.stringify(end(r))}; lit events=${ev(r, "lantern_lit").length}, out=${ev(r, "lantern_out").length}; sha ${h(r.text)} == ${h(rr.text)}`);

for (const n of [1, 2, 3]) {
  // huge flame count keeps Mây alive so the whole night (all spawns, wind, drifters) really runs to dawn
  r = cli(`p16_perf_n${n}`, n, { scenario: put(`perf_n${n}`, { player: { flames: 1000000 } }), ticks: 21600, every: 10, seed: 11, keep: false });
  const full = [0, 14400, 16200, 18000][n]; // Ticket-03: 240 / 270 / 300 s
  check(`P2-16.${n}`, `Night ${n}: full night (${full} ticks to dawn, all spawns on) headless in <= 30 s`, r,
    r.status === 0 && end(r).ticks === full && ev(r, "game_over")[0]?.data.reason === "dawn" && r.ms <= 30000, `end=${JSON.stringify(end(r))}; ${r.ms.toFixed(0)} ms`);
}
// --- Ticket-03 ---
r = cli("p18_fuel_out_relight", 1, { scenario: put("relight", { ...Q, player: { pos: [0, 0, 24], carried: 6 }, lanterns: [{ id: "L1", lit: true, fuel: 1 }] }), inputs: put("relight.in", { frames: [{ tick: 70, interact: true }] }), ticks: 80, every: 10 });
check("P3-01", "Fuel decays 1/s; at 0 -> lantern_out, deposited 0, ever_lit kept; relight costs 5, +40, relight:true", r,
  ev(r, "lantern_out")[0]?.tick === 60 && JSON.stringify(ev(r, "lantern_lit")[0]?.data) === '{"lantern_id":"L1","relight":true}' && ev(r, "deposit")[0]?.data.amount === 5 && end(r).score === 65,
  `out@${ev(r, "lantern_out")[0]?.tick}; lit=${JSON.stringify(ev(r, "lantern_lit")[0]?.data)}; score=${end(r).score}`);
r = cli("p19_refuel", 1, { scenario: put("refuel", { ...Q, player: { pos: [0, 0, 24], carried: 9 }, lanterns: [{ id: "L1", lit: true, fuel: 55 }] }), inputs: put("refuel.in", { frames: [{ tick: 0, interact: true }] }), ticks: 2, every: 1 });
check("P3-02", "Refuel: used = min(carried, ceil((100-fuel)/10)) = 5, fuel capped at 100, +5 per mote", r,
  JSON.stringify(ev(r, "refuel")[0]?.data) === '{"lantern_id":"L1","amount":5,"fuel":100}' && snap(r, 1).score === 25, `refuel=${JSON.stringify(ev(r, "refuel")[0]?.data)}`);
r = cli("p20_drain", 1, { scenario: put("drain", { ...Q, player: { pos: [-30, 0, 0] }, lanterns: [{ id: "L1", lit: true, fuel: 29 }], shades: [{ id: "S1", pos: [0, 1, 20], state: "wander" }] }), ticks: 600, every: 10 });
const firstDrain = r.lines.find((x) => x.type === "snapshot" && x.shades[0]?.state === "drain");
check("P3-03", "Fuel < 30: no safe zone; wandering shade walks to the weak lantern, drains (state drain, fuel_drain every 60 ticks) until lantern_out", r,
  firstDrain && ev(r, "fuel_drain").length >= 2 && ev(r, "lantern_out").length === 1 && ev(r, "fuel_drain")[1].tick - ev(r, "fuel_drain")[0].tick === 60,
  `drain from tick ${firstDrain?.tick}; fuel_drain x${ev(r, "fuel_drain").length}; out@${ev(r, "lantern_out")[0]?.tick}`);
r = cli("p21_dawn_win", 2, { scenario: put("dawn_win", { ...Q, lanterns: ["L1", "L2", "L3", "L4"].map((id) => ({ id, lit: true, fuel: 50 })), time_left_s: 1 }), ticks: 100, every: 60 });
const r3 = cli("p21b_dawn_lose", 2, { scenario: put("dawn_lose", { ...Q, lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true, fuel: 50 })), time_left_s: 1 }), ticks: 100, every: 60 });
check("P3-04", "Night 2 dawn: 4/6 lit -> won dawn_survived (+ (50+49) per lit + 50 per flame); 3/6 -> lost dawn", r,
  ev(r, "game_over")[0]?.data.reason === "dawn_survived" && end(r).score === 4 * 99 + 150 && ev(r3, "game_over")[0]?.data.reason === "dawn",
  `4 lit: ${JSON.stringify(end(r))}; 3 lit: ${JSON.stringify(end(r3))}`);
r = cli("p22_no_early_win", 1, { scenario: put("all_lit", { ...Q, lanterns: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true })) }), ticks: 600, every: 600 });
check("P3-05", "All lanterns lit does not end the night (no early win)", r, end(r).state === "playing" && ev(r, "game_over").length === 0, `end=${JSON.stringify(end(r))}`);
r = cli("p23_capacity", 1, { scenario: put("capacity", { ...Q, player: { pos: [0, 0, 24], carried: 10 }, motes: Array.from({ length: 14 }, (_, i) => [0.05 * i, 0, 24]) }), inputs: put("capacity.in", { frames: [{ tick: 0, interact: true }] }), ticks: 2, every: 1 });
check("P3-06", "Capacity = 10 + 2 x successful lights: after one light Mây carries 12", r, snap(r, 2).player.capacity === 12 && snap(r, 2).player.carried === 12, `capacity=${snap(r, 2).player.capacity}, carried=${snap(r, 2).player.carried}`);

r = cli("p17_bad_input", 1, { inputs: put("bad.in", { frames: [{ tick: 0, pause: "yes" }] }), ticks: 5 });
check("P2-17", "Malformed v1.1 input (pause not boolean) -> exit 2", r, r.status === 2, `exit ${r.status}: ${r.stderr}`);

const pass = results.filter((x) => x.ok).length;
const md = [
  "# Phase 3 — headless evidence (generated)", "",
  `Generated by \`npm run proof\` with Node ${process.version}, ${os.platform()} ${os.arch()}, CPU: ${os.cpus()[0]?.model ?? "?"}. Do not edit by hand.`, "",
  `**${pass}/${results.length} checks passed.**`, "",
  "| ID | Requirement | Result | Observed |", "|---|---|---|---|",
  ...results.map((x) => `| ${x.id} | ${x.req} | ${x.ok ? "PASS" : "**FAIL**"} | ${x.obs.replace(/\|/g, "\\|")} |`), "",
  "## Commands", "", ...results.map((x) => `- ${x.id}: \`${x.cmd}\``), "",
].join("\n");
writeFileSync(`${DIR}/results.md`, md);
console.log(md.split("## Commands")[0]);
process.exit(pass === results.length ? 0 : 1);
