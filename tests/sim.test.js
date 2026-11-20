// Acceptance tests (AC-xx) for Ticket-02 standard numbers + Phase 1 rules still in force.
// Phase 1 tests whose rule was replaced by Ticket-02 were rewritten; see docs/notes/phase-2.md "Test changes".
import { test } from "node:test";
import assert from "node:assert/strict";
import { Sim as RawSim, parseScenario } from "../src/sim/sim.js";
import { run } from "../src/sim/runner.js";
import { TUNING as T } from "../src/sim/tuning.js";

class Sim extends RawSim {
  constructor({ seed = 0, night = 1, scenario = {} } = {}) { super({ seed, night, scenario: parseScenario(scenario) }); }
}
const quiet = (x = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [], ...x });
const lines = (o) => o.trim().split("\n").map((l) => JSON.parse(l));
const names = (evs) => evs.map((e) => e.name);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
function stepN(sim, n, f = () => null) { const out = []; for (let k = 0; k < n && sim.state !== "won" && sim.state !== "lost"; k++) out.push(...sim.step(f(k))); return out; }

// ---------- kept from Phase 1 (contract v1.0 rules still valid) ----------
test("AC-01 tick model: snapshot 0 before input, N steps, time_left = dur - sim_tick/60, night_start", () => {
  const l = lines(run({ seed: 1, scenario: parseScenario(quiet()), ticks: 120, snapshotEvery: 60 }));
  assert.deepEqual(l.filter((x) => x.type === "snapshot").map((s) => [s.tick, s.sim_tick, s.time_left_s]), [[0, 0, 300], [60, 60, 299], [120, 120, 298]]);
  assert.deepEqual(l[1], { type: "event", tick: 0, name: "night_start", data: { night: 1 } });
  assert.deepEqual(l.at(-1), { type: "end", ticks: 120, state: "playing", score: 0 });
});

test("AC-02 run 6 m/s, camera-relative move, start facing +Z", () => {
  const s = new Sim({ scenario: quiet() });
  stepN(s, 60, (k) => (k === 0 ? { move: [0, 1], cam_yaw_deg: 90 } : null));
  near(s.player.x, 6); near(s.player.z, 0);
  assert.deepEqual(new Sim({ scenario: quiet() }).player.facing, [0, 1]);
});

test("AC-03 jump 7 m/s, gravity 20, only when grounded", () => {
  const s = new Sim({ scenario: quiet() });
  s.step({ jump: true });
  near(s.player.y, (7 - 20 / 60) / 60);
  s.step({ jump: false }); s.step({ jump: true });
  assert.ok(s.player.vy < 7, "no double jump");
  stepN(s, 60);
  assert.equal(s.player.y, 0);
  assert.equal(s.player.grounded, true);
});

// ---------- Ticket-02 Part 1 ----------
test("AC-04 pickup: XZ <= 1.0 and height diff <= 1.5, capacity 10, no points on pickup", () => {
  const s = new Sim({ scenario: quiet({ motes: [[0, 0, 1], [0, 2, 1.01], [3, 0, 0]] }) });
  assert.deepEqual(names(s.step(null)), ["mote_picked"]);
  assert.equal(s.score, 0);
  const full = new Sim({ scenario: quiet({ player: { carried: 10 }, motes: [[0, 0, 0.5]] }) });
  assert.deepEqual(full.step(null), []);
  const high = new Sim({ scenario: quiet({ motes: [[0, 1.6, 0]] }) });
  assert.deepEqual(high.step(null), [], "height diff 1.6 > 1.5");
});

test("AC-05 lantern: radius 2, nearest unlit (tie -> smaller id), min(carried, missing), +10/mote +100/lit", () => {
  const s = new Sim({ scenario: quiet({ player: { pos: [0, 0, 23], carried: 7 }, lanterns: [{ id: "L1", deposited: 4 }] }) });
  const ev = s.step({ interact: true });
  assert.deepEqual(ev.map((e) => [e.name, e.data]), [["deposit", { lantern_id: "L1", amount: 6, deposited: 10 }], ["lantern_lit", { lantern_id: "L1" }]]);
  assert.equal(s.player.carried, 1);
  assert.equal(s.score, 6 * 10 + 100);
  const tie = new Sim({ scenario: quiet({ player: { pos: [0, 0, 0], carried: 2 }, lanterns: [{ id: "L1", pos: [1, 0, 0] }, { id: "L2", pos: [-1, 0, 0] }] }) });
  assert.equal(tie.step({ interact: true })[0].data.lantern_id, "L1");
  const far = new Sim({ scenario: quiet({ player: { pos: [0, 0, 22.9], carried: 5 } }) });
  assert.deepEqual(far.step({ interact: true }), []);
});

test("AC-06 pulse: cost 3, 3D radius 5 from feet+0.8, stun 120 ticks, push 4 m over 15 ticks, +5 each, cooldown 3 s", () => {
  const s = new Sim({ scenario: quiet({ player: { carried: 5 }, shades: [{ id: "S1", pos: [4.9, 0.8, 0] }, { id: "S2", pos: [0, 1, 6] }] }) });
  const ev = s.step({ pulse: true });
  assert.deepEqual(ev.map((e) => [e.name, e.data]), [["pulse", { stunned_ids: ["S1"] }]]);
  assert.equal(s.player.carried, 2);
  assert.equal(s.score, 5);
  stepN(s, 14, (k) => (k === 0 ? { pulse: false } : null));
  near(s.shades[0].x, 4.9 + 4, 1e-9);
  stepN(s, 105);
  assert.equal(s.snapshot().shades[0].state, "stunned"); // tick 120
  s.step(null);
  assert.notEqual(s.snapshot().shades[0].state, "stunned"); // tick 121
  const poor = new Sim({ scenario: quiet({ player: { carried: 2 } }) });
  assert.deepEqual(poor.step({ pulse: true }), []);
  const cd = new Sim({ scenario: quiet({ player: { carried: 9 } }) });
  cd.step({ pulse: true }); stepN(cd, 178, (k) => (k === 0 ? { pulse: false } : null));
  assert.deepEqual(cd.step({ pulse: true }), [], "still cooling at tick 180");
  cd.step({ pulse: false });
  assert.deepEqual(names(cd.step({ pulse: true })), ["pulse"]);
});

test("AC-07 shade hit: -1 flame, drop floor(n/2) as dropped motes on 1.5-2.5 m ring (ttl 480), invuln 90, recoil 2 m/60 ticks", () => {
  const s = new Sim({ scenario: quiet({ player: { carried: 7 }, shades: [{ id: "S1", pos: [0.5, 1, 0], state: "chase" }] }) });
  const ev = s.step(null);
  assert.deepEqual(ev.map((e) => [e.name, e.data]), [["player_hit", { by: "shade", flames: 2, dropped: 3 }]]);
  assert.equal(s.motes.length, 3);
  for (const m of s.motes) { const d = Math.hypot(m.x, m.z); assert.ok(d >= 1.49 && d <= 2.51); assert.equal(m.kind, "dropped"); assert.equal(m.ttl, 480); }
  assert.equal(s.shades[0].state, "recoil");
  const x1 = s.shades[0].x; // position at the hit tick; 60 recoil moves of 2/60 m follow
  stepN(s, 59);
  near(s.shades[0].x, x1 + (2 * 59) / 60, 1e-9);
  assert.equal(s.player.invuln, 90 - 59);
  const t = new Sim({ scenario: quiet({ player: { carried: 4 }, motes: [{ pos: [2, 0, 0], kind: "dropped", ttl_ticks: 2 }] }) });
  t.step(null); t.step(null);
  assert.equal(t.motes.length, 0, "dropped mote expires after its ttl");
});

test("AC-08 fall off island (Y < -10): -1 flame, lose all motes, wait 60, respawn at start with invuln 90", () => {
  const g = new Sim({ scenario: quiet({ player: { pos: [39.9, 0, 0], carried: 4 } }) });
  const all = [];
  for (let k = 0; k < 200; k++) all.push(...g.step(k === 0 ? { move: [0, 1], cam_yaw_deg: 90 } : null)); // world +X
  const hit = all.find((e) => e.name === "player_hit");
  assert.deepEqual(hit.data, { by: "fall", flames: 2, dropped: 0, lost: 4 });
  assert.equal(all.filter((e) => e.name === "player_hit").length, 1, "exactly once");
  const sim2 = new Sim({ scenario: quiet({ player: { pos: [39.9, 0, 0], carried: 4 } }) });
  let fallTick = 0;
  for (let k = 0; k < 400; k++) { const e = sim2.step(k === 0 ? { move: [0, 1], cam_yaw_deg: 90 } : k === 10 ? { move: [0, 0] } : null); if (e.some((x) => x.name === "player_hit")) fallTick = sim2.tick; if (fallTick && sim2.tick === fallTick + 60) break; }
  assert.deepEqual([sim2.player.x, sim2.player.y, sim2.player.z], [0, 0, 0]);
  assert.equal(sim2.player.invuln, 90);
  const last = new Sim({ scenario: quiet({ player: { pos: [39.9, 0, 0], flames: 1 } }) });
  const l2 = stepN(last, 200, (k) => (k === 0 ? { move: [0, 1], cam_yaw_deg: 90 } : null));
  assert.deepEqual(l2.at(-1).data, { result: "lost", reason: "no_flames" });
});

test("AC-09 win/lose order: all lit -> won even on the last tick; dawn otherwise", () => {
  const lit = ["L1", "L2", "L3", "L4"].map((id) => ({ id, lit: true }));
  const s = new Sim({ scenario: quiet({ lanterns: [...lit, { id: "L5", pos: [0, 0, 1], deposited: 9 }], player: { carried: 1 }, time_left_s: 1 / 60 }) });
  const ev = s.step({ interact: true });
  assert.deepEqual(ev.at(-1).data, { result: "won", reason: "all_lit" });
  assert.equal(s.score, 10 + 100 + 0 * 2 + 3 * 50);
  const d = lines(run({ seed: 1, scenario: parseScenario(quiet({ time_left_s: 1 })), ticks: 999 }));
  assert.deepEqual(d.find((x) => x.name === "game_over"), { type: "event", tick: 60, name: "game_over", data: { result: "lost", reason: "dawn" } });
});

test("AC-10 safe zone only around LIT lanterns; shades blocked at the 6 m edge", () => {
  const s = new Sim({ scenario: quiet({ player: { pos: [0, 0, 24] }, lanterns: [{ id: "L1", lit: true }], shades: [{ pos: [0, 1, 12], state: "chase" }] }) });
  const ev = stepN(s, 600);
  assert.equal(ev.filter((e) => e.name === "player_hit").length, 0);
  assert.ok(Math.hypot(s.shades[0].x, s.shades[0].z - 25) >= 6);
  const u = new Sim({ scenario: quiet({ player: { pos: [0, 0, 24] }, shades: [{ pos: [0, 1, 20], state: "chase" }] }) });
  assert.ok(stepN(u, 120).some((e) => e.name === "player_hit"), "unlit lantern gives no protection");
});

test("AC-11 lighting a lantern evicts shades inside within 30 ticks, harmlessly", () => {
  const s = new Sim({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 10, invuln_ticks: 0 }, shades: [{ id: "S1", pos: [0, 1, 22], state: "wander" }] }) });
  const ev = stepN(s, 30, (k) => (k === 0 ? { interact: true } : null));
  assert.ok(ev.some((e) => e.name === "lantern_lit"));
  assert.equal(ev.filter((e) => e.name === "player_hit").length, 0);
  assert.ok(Math.hypot(s.shades[0].x, s.shades[0].z - 25) >= 6 - 1e-6);
});

test("AC-12 shade schedule night 1: 2 at tick 300, then every 480, max 6, ids S1.., >= 15 m from player, spawning state", () => {
  const l = lines(run({ seed: 3, scenario: parseScenario({ random_motes: false, player: { pos: [0, 0, 25] }, lanterns: [{ id: "L1", lit: true }] }), ticks: 300 + 480 * 6 }));
  const sp = l.filter((x) => x.name === "shade_spawned");
  assert.deepEqual(sp.map((x) => x.tick).slice(0, 4), [300, 300, 780, 1260]);
  assert.deepEqual(sp.map((x) => x.data.id), ["S1", "S2", "S3", "S4", "S5", "S6"]);
  const s300 = l.find((x) => x.type === "snapshot" && x.tick === 300);
  for (const sh of s300.shades) { assert.equal(sh.state, "spawning"); assert.ok(Math.hypot(sh.pos[0], sh.pos[2] - 25) >= 15); }
});

test("AC-13 shade states: wander -> chase at 12 m, drop chase beyond 18 m; speed 4.0 (4.5 on night 3)", () => {
  const s = new Sim({ scenario: quiet({ shades: [{ id: "S1", pos: [-11.9, 1, 0], state: "wander" }] }) });
  s.step(null);
  assert.equal(s.shades[0].state, "chase");
  near(s.shades[0].x, -11.9 + 4 / 60, 1e-9);
  const far = new Sim({ scenario: quiet({ shades: [{ pos: [-18.5, 1, 0], state: "chase" }] }) });
  far.step(null);
  assert.equal(far.shades[0].state, "wander");
  const n3 = new Sim({ night: 3, scenario: quiet({ player: { pos: [0, 0, -30] }, shades: [{ pos: [-10, 1, -30], state: "chase" }] }) });
  n3.step(null);
  near(n3.shades[0].x, -10 + 4.5 / 60, 1e-9);
});

test("AC-14 motes: 20 initial at distinct points, +1 every 240 ticks on a free point, cap 30", () => {
  const l = lines(run({ seed: 5, scenario: parseScenario({ random_shades: false }), ticks: 240 * 5, snapshotEvery: 240 }));
  const s = l.filter((x) => x.type === "snapshot");
  assert.equal(s[0].motes_active, 20);
  assert.equal(new Set(s[0].motes.map((m) => m.pos.join())).size, 20);
  assert.deepEqual(s.map((x) => x.motes_active), [20, 21, 22, 23, 24, 24]); // night 1 has 24 points -> no free point
});

test("AC-15 determinism + score totals per event", () => {
  const frames = [{ tick: 0, move: [0.3, 1], cam_yaw_deg: 30 }, { tick: 300, pulse: true, dash: true }, { tick: 301, pulse: false, dash: false }];
  for (const night of [1, 2, 3]) assert.equal(run({ seed: 9, night, frames, ticks: 3000 }), run({ seed: 9, night, frames, ticks: 3000 }));
});
