// Acceptance tests for Phase 1 rules (PRD-0 + Test Contract v1.0). One test ≈ one acceptance criterion
// (IDs match docs/proof/phase-1/README.md). Each runs the real Sim through the same loop as headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Sim as RawSim, parseScenario } from "../src/sim/sim.js";
import { run } from "../src/sim/runner.js";
import { TUNING as T } from "../src/sim/tuning.js";

// Scenarios always go through parseScenario, exactly like the CLI.
class Sim extends RawSim {
  constructor({ seed = 0, scenario = {} } = {}) {
    super({ seed, scenario: parseScenario(scenario) });
  }
}
const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, motes: [], shades: [], ...extra });
const parse = (out) => out.trim().split("\n").map((l) => JSON.parse(l));
const events = (lines, name) => lines.filter((l) => l.type === "event" && l.name === name);
function stepN(sim, n, frameAt = () => null) {
  const evs = [];
  for (let k = 0; k < n && sim.state === "playing"; k++) evs.push(...sim.step(frameAt(k)));
  return evs;
}

test("AC-01 tick model: snapshot 0 before input, --ticks N runs N steps, time_left = dur - steps/60", () => {
  const lines = parse(run({ seed: 1, scenario: parseScenario(quiet()), ticks: 120, snapshotEvery: 60 }));
  const snaps = lines.filter((l) => l.type === "snapshot");
  assert.deepEqual(snaps.map((s) => s.tick), [0, 60, 120]);
  assert.equal(snaps[0].time_left_s, T.night1_duration_s);
  assert.equal(snaps[2].time_left_s, T.night1_duration_s - 2);
  assert.deepEqual(lines.at(-1), { type: "end", ticks: 120, state: "playing", score: 0 });
  assert.deepEqual(snaps[0].player.pos, [0, 0, 0]);
});

test("AC-02 movement: speed = player_speed, camera yaw rotates move per contract formula", () => {
  const sim = new Sim({ scenario: quiet() });
  stepN(sim, 60, (k) => (k === 0 ? { move: [0, 1] } : null));
  assert.ok(Math.abs(sim.player.z - T.player_speed) < 1e-9 && Math.abs(sim.player.x) < 1e-9);
  const s2 = new Sim({ scenario: quiet() });
  // yaw 90°: move [0,1] -> x' = sin90 = +1, z' = cos90 = 0
  stepN(s2, 60, (k) => (k === 0 ? { move: [0, 1], cam_yaw_deg: 90 } : null));
  assert.ok(Math.abs(s2.player.x - T.player_speed) < 1e-9 && Math.abs(s2.player.z) < 1e-9);
  const s3 = new Sim({ scenario: quiet() });
  stepN(s3, 60, (k) => (k === 0 ? { move: [1, 1] } : null)); // normalised
  assert.ok(Math.abs(Math.hypot(s3.player.x, s3.player.z) - T.player_speed) < 1e-9);
});

test("AC-03 jump: player leaves the ground and lands back at y=0", () => {
  const sim = new Sim({ scenario: quiet() });
  sim.step({ jump: true });
  assert.ok(sim.player.y > 0);
  stepN(sim, 120, (k) => (k === 0 ? { jump: false } : null));
  assert.equal(sim.player.y, 0);
});

test("AC-04 pickup within pickup_radius (<=), +per_mote, respects carry_capacity", () => {
  const sim = new Sim({ scenario: quiet({ motes: [[0, 0, T.pickup_radius]], player: { carried: 0 } }) });
  const ev = sim.step(null);
  assert.deepEqual(ev.map((e) => [e.name, e.data, e.tick]), [["mote_picked", { carried: 1 }, 1]]);
  assert.equal(sim.score, T.score.per_mote);
  const full = new Sim({ scenario: quiet({ motes: [[0, 0, 0.5]], player: { carried: T.carry_capacity } }) });
  assert.deepEqual(full.step(null), []);
  assert.equal(full.motes.length, 1);
});

test("AC-05 deposit on interact edge, lantern lit at lantern_cost, +per_lantern", () => {
  const sim = new Sim({ scenario: quiet({ player: { pos: [0, 0, 25 - T.interact_radius], carried: T.lantern_cost } }) });
  const ev = sim.step({ interact: true });
  assert.deepEqual(ev.map((e) => e.name), ["deposit", "lantern_lit"]);
  assert.deepEqual(ev[0].data, { lantern_id: "L1", amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.equal(sim.score, T.score.per_lantern);
  assert.equal(sim.player.carried, 0);
  // holding interact does not re-trigger (edge only)
  const s2 = new Sim({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 2 } }) });
  assert.equal(s2.step({ interact: true }).length, 1);
  s2.player.carried = 2;
  assert.equal(s2.step({ interact: true }).length, 0);
});

test("AC-06 partial deposit and out-of-range interact", () => {
  const sim = new Sim({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 3 }, lanterns: [{ id: "L1", deposited: 3 }] }) });
  const ev = sim.step({ interact: true });
  assert.deepEqual(ev.map((e) => e.name), ["deposit", "lantern_lit"]);
  assert.equal(ev[0].data.amount, 2);
  assert.equal(sim.player.carried, 1);
  const far = new Sim({ scenario: quiet({ player: { pos: [0, 0, 25 - T.interact_radius - 0.1], carried: 3 } }) });
  assert.deepEqual(far.step({ interact: true }), []);
});

test("AC-07 pulse: costs pulse_cost, stuns + pushes shades in radius, cooldown, +per_stun", () => {
  const sim = new Sim({ scenario: quiet({ player: { carried: 2 }, shades: [{ id: "A", pos: [T.pulse_radius, 0, 0] }, { id: "B", pos: [-20, 0, 0] }] }) });
  const ev = sim.step({ pulse: true });
  assert.deepEqual(ev.map((e) => [e.name, e.data]), [["pulse", { stunned_ids: ["A"] }]]);
  assert.equal(sim.player.carried, 2 - T.pulse_cost);
  assert.equal(sim.score, T.score.per_stun);
  const a = sim.shades[0];
  assert.ok(Math.abs(a.x - (T.pulse_radius + T.pulse_push_m)) < 1e-9, "pushed by pulse_push_m");
  assert.equal(sim.snapshot().shades[0].state, "stunned");
  // stunned shade does not move for pulse_stun_s
  const x0 = a.x;
  stepN(sim, T.pulse_stun_s * 60 - 1, (k) => (k === 0 ? { pulse: false } : null));
  assert.equal(a.x, x0);
  assert.equal(sim.snapshot().shades[0].state, "stunned");
  sim.step(null);
  assert.equal(sim.snapshot().shades[0].state, "chase");
  assert.ok(a.x < x0);
});

test("AC-08 pulse cooldown and not enough light", () => {
  const sim = new Sim({ scenario: quiet({ player: { carried: 3 } }) });
  assert.equal(sim.step({ pulse: true }).length, 1);
  sim.step({ pulse: false });
  assert.equal(sim.step({ pulse: true }).length, 0, "still on cooldown");
  const broke = new Sim({ scenario: quiet({ player: { carried: 0 } }) });
  assert.equal(broke.step({ pulse: true }).length, 0);
});

test("AC-09 shade hit: -1 flame, drops floor(carried*hit_drop_ratio), invulnerability", () => {
  const sim = new Sim({ scenario: quiet({ player: { carried: 5 }, shades: [{ pos: [0.5, 0, 0] }] }) });
  const ev = sim.step(null);
  assert.deepEqual(ev.map((e) => [e.name, e.data]), [["player_hit", { by: "shade", flames: T.flames - 1, dropped: Math.floor(5 * T.hit_drop_ratio) }]]);
  // no second hit during invuln_s
  const more = stepN(sim, T.invuln_s * 60 - 1);
  assert.equal(events(more.map((e) => ({ type: "event", ...e })), "player_hit").length, 0);
  assert.equal(sim.step(null)[0]?.name, "player_hit");
});

test("AC-10 lose: no flames -> game_over lost/no_flames and run stops", () => {
  const lines = parse(run({ seed: 3, scenario: parseScenario(quiet({ player: { flames: 1 }, shades: [{ pos: [0.5, 0, 0] }] })), ticks: 500 }));
  const go = events(lines, "game_over");
  assert.deepEqual(go[0].data, { result: "lost", reason: "no_flames" });
  assert.deepEqual(lines.at(-1), { type: "end", ticks: 1, state: "lost", score: 0 });
});

test("AC-11 lose at dawn when time runs out", () => {
  const lines = parse(run({ seed: 1, scenario: parseScenario(quiet({ time_left_s: 1 })), ticks: 500 }));
  assert.deepEqual(events(lines, "game_over")[0], { type: "event", tick: 60, name: "game_over", data: { result: "lost", reason: "dawn" } });
  assert.equal(lines.at(-1).ticks, 60);
});

test("AC-12 win: lighting the last lantern -> won/all_lit with time + flame bonus", () => {
  const lanterns = ["L1", "L2", "L3", "L4"].map((id) => ({ id, lit: true })).concat([{ id: "L5", pos: [0, 0, 2] }]);
  const sim = new Sim({ scenario: quiet({ lanterns, player: { carried: T.lantern_cost }, time_left_s: 100 }) });
  assert.equal(sim.score, 0, "scenario setup gives no points");
  const ev = sim.step({ interact: true });
  assert.deepEqual(ev.map((e) => e.name), ["deposit", "lantern_lit", "game_over"]);
  assert.deepEqual(ev[2].data, { result: "won", reason: "all_lit" });
  const left = Math.floor(100 - 1 / 60);
  assert.equal(sim.score, T.score.per_lantern + left * T.score.per_second_left + T.flames * T.score.per_flame_left);
});

test("AC-13 shades never enter safe_radius of a lantern (player hiding at lantern is safe)", () => {
  const sim = new Sim({ scenario: quiet({ player: { pos: [0, 0, 25] }, shades: [{ pos: [0, 0, 10] }, { pos: [10, 0, 25] }] }) });
  const evs = stepN(sim, 600);
  for (const L of sim.lanterns) for (const s of sim.shades) assert.ok(Math.hypot(s.x - L.x, s.z - L.z) > T.safe_radius);
  assert.equal(evs.filter((e) => e.name === "player_hit").length, 0);
});

test("AC-14 shades chase at shade_speed", () => {
  const sim = new Sim({ scenario: quiet({ player: { pos: [0, 0, -5] }, shades: [{ pos: [-20, 0, -5] }] }) });
  stepN(sim, 60);
  assert.ok(Math.abs(sim.shades[0].x - (-20 + T.shade_speed)) < 1e-9);
});

test("AC-15 default night: 5 lanterns, random motes, shades spawn with shade_spawned events", () => {
  const lines = parse(run({ seed: 42, ticks: 1800 }));
  const s0 = lines[0];
  assert.equal(s0.lanterns.length, T.lantern_count_night1);
  assert.ok(s0.motes_active > 0 && s0.shades.length > 0);
  const lines2 = parse(run({ seed: 42, ticks: 1900, scenario: parseScenario({ player: { pos: [0, 0, 25] } }) }));
  assert.ok(events(lines2, "shade_spawned").length >= 1);
});

test("AC-16 determinism: same seed+scenario+inputs -> identical output; different seed differs", () => {
  const frames = [{ tick: 0, move: [0.3, 1], cam_yaw_deg: 30 }, { tick: 300, pulse: true }, { tick: 301, pulse: false }];
  const a = run({ seed: 9, frames, ticks: 3000 });
  const b = run({ seed: 9, frames, ticks: 3000 });
  assert.equal(a, b);
  assert.notEqual(a, run({ seed: 10, frames, ticks: 3000 }));
});

test("AC-17 coordinates rounded to 3 decimals", () => {
  const lines = parse(run({ seed: 5, frames: [{ tick: 0, move: [0.123, 0.77] }], ticks: 37, snapshotEvery: 37 }));
  for (const s of lines.filter((l) => l.type === "snapshot")) {
    for (const v of [...s.player.pos, ...s.shades.flatMap((x) => x.pos)]) assert.equal(v, Math.round(v * 1000) / 1000);
  }
});
