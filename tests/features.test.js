// Ticket-02 Part 3 / Part 2 features: one or more HEADLESS scenarios each (FT-xx), run through the real runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScenario, parseInputs } from "../src/sim/sim.js";
import { run } from "../src/sim/runner.js";

const quiet = (x = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [], ...x });
const go = ({ night = 1, scenario = {}, frames = [], ticks, every = 1 }) =>
  run({ seed: 7, night, scenario: parseScenario(scenario), frames: parseInputs({ frames }), ticks, snapshotEvery: every }).trim().split("\n").map((l) => JSON.parse(l));
const ev = (l, n) => l.filter((x) => x.type === "event" && x.name === n);
const snap = (l, t) => l.find((x) => x.type === "snapshot" && x.tick === t);

test("FT-01 dash: 14 m/s for 12 ticks (2.8 m), cooldown 1.5 s from start, facing when idle, height kept in air", () => {
  const l = go({ scenario: quiet(), frames: [{ tick: 0, dash: true }, { tick: 1, dash: false }, { tick: 50, dash: true }, { tick: 51, dash: false }, { tick: 90, dash: true }], ticks: 100 });
  assert.deepEqual(ev(l, "dash").map((e) => e.tick), [1, 91]);
  assert.ok(Math.abs(snap(l, 12).player.pos[2] - 2.8) < 1e-9, "idle dash goes along facing +Z");
  assert.equal(snap(l, 1).player.dash_cd_s, 1.5);
  const air = go({ scenario: quiet(), frames: [{ tick: 0, jump: true }, { tick: 10, dash: true }], ticks: 22 });
  const y = snap(air, 11).player.pos[1];
  assert.equal(snap(air, 22).player.pos[1], y, "air dash keeps height");
});

test("FT-02 pause: tick advances, sim_tick/time/cooldowns frozen, state paused, events paused/resumed", () => {
  const l = go({ scenario: quiet({ player: { pulse_cd_ticks: 100 } }), frames: [{ tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 40, pause: true }], ticks: 60 });
  assert.deepEqual(ev(l, "paused").map((e) => e.tick), [11]);
  assert.deepEqual(ev(l, "resumed").map((e) => e.tick), [41]);
  const a = snap(l, 20), b = snap(l, 40), c = snap(l, 50);
  assert.equal(a.state, "paused");
  assert.equal(a.sim_tick, 10);
  assert.equal(b.sim_tick, 10);
  assert.equal(b.player.pulse_cd_s, snap(l, 11).player.pulse_cd_s);
  assert.equal(c.sim_tick, 20); // ticks 1-10 run, 11-40 paused, 41 resumes -> 41..50 = 10 more
  assert.equal(c.state, "playing");
});

test("FT-03 drifter: idle -> chase (>=5 motes, <=15 m) -> steals min(3, carried) once -> flee 240 ticks -> removed", () => {
  const l = go({ night: 2, scenario: quiet({ player: { carried: 5 }, drifters: [{ id: "D1", pos: [-10, 1.5, 0] }] }), ticks: 400, every: 10 });
  const st = ev(l, "drifter_steal");
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].data, { drifter_id: "D1", amount: 3, carried: 2 });
  assert.equal(snap(l, 10).drifters[0].state, "chase");
  const t = st[0].tick;
  const after = l.filter((x) => x.type === "snapshot" && x.tick > t && x.tick < t + 240);
  assert.ok(after.every((s) => s.drifters[0].state === "flee" && s.drifters[0].stolen === 3));
  assert.equal(l.at(-1).type, "end");
  assert.equal(snap(l, 400).drifters[0].state, "removed");
  assert.equal(ev(l, "player_hit").length, 0, "drifters never take flames");
  const lazy = go({ night: 2, scenario: quiet({ player: { carried: 4 }, drifters: [{ id: "D1", pos: [-10, 1.5, 0] }] }), ticks: 30, every: 30 });
  assert.equal(snap(lazy, 30).drifters[0].state, "idle");
});

test("FT-04 pulse vs drifter: chase -> flee without stealing; flee with loot -> drops all as dropped motes, vanishes after 120", () => {
  const a = go({ night: 2, scenario: quiet({ player: { carried: 6 }, drifters: [{ id: "D1", pos: [-4, 1.5, 0], state: "chase" }] }), frames: [{ tick: 0, pulse: true }], ticks: 5 });
  assert.equal(snap(a, 1).drifters[0].state, "flee");
  assert.equal(ev(a, "drifter_steal").length, 0);
  const b = go({ night: 2, scenario: quiet({ player: { carried: 6 }, drifters: [{ id: "D1", pos: [-3, 1.5, 0], state: "flee", stolen: 3, state_ticks_left: 200 }] }), frames: [{ tick: 0, pulse: true }], ticks: 125 });
  assert.deepEqual(ev(b, "drifter_drop")[0].data, { drifter_id: "D1", amount: 3 });
  assert.equal(snap(b, 1).motes.filter((m) => m.kind === "dropped").length, 3);
  assert.equal(snap(b, 120).drifters[0].state, "flee");
  assert.equal(snap(b, 121).drifters[0].state, "removed");
});

test("FT-05 drifter schedule: spawns at 1200/2400.. on nights 2-3 only, max 2, ids D1, D2", () => {
  const l = go({ night: 2, scenario: { random_shades: false, random_motes: false }, ticks: 3700, every: 100 });
  assert.deepEqual(snap(l, 1200).drifters.map((d) => d.id), ["D1"]);
  assert.deepEqual(snap(l, 3700).drifters.map((d) => d.id), ["D1", "D2"]);
  const n1 = go({ night: 1, scenario: { random_shades: false, random_motes: false }, ticks: 1300, every: 1300 });
  assert.equal(snap(n1, 1300).drifters.length, 0);
});

test("FT-06 Wind charm: pickup -> charm_picked 600 ticks, speed 7.2, dash without cooldown, respawn after 2700", () => {
  const l = go({ night: 2, scenario: quiet({ player: { pos: [34.5, 0, 0] } }), frames: [{ tick: 1, move: [0, 1], cam_yaw_deg: 90 }, { tick: 61, move: [0, 0], dash: true }, { tick: 62, dash: false }, { tick: 70, dash: true }, { tick: 71, dash: false }, { tick: 80, dash: true }], ticks: 2800, every: 1 });
  assert.deepEqual(ev(l, "charm_picked")[0].data, { charm_id: "C1", charm_ticks: 600 });
  const dx = snap(l, 61).player.pos[0] - snap(l, 1).player.pos[0];
  assert.ok(Math.abs(dx - 7.2) < 1e-6, `moved ${dx}`);
  // press at 70 is ignored (still dashing until tick 73); press at 80 works with no cooldown
  assert.deepEqual(ev(l, "dash").map((e) => e.tick), [62, 81]);
  assert.equal(snap(l, 1).charms[0].available, false);
  assert.equal(snap(l, 2701).charms[0].available, true);
});

test("FT-07 night 2 jump pad launches 14 m/s up, 24 m/s toward the other island; lands on island B", () => {
  const l = go({ night: 2, scenario: quiet({ player: { pos: [20, 0, 18] } }), ticks: 120, every: 1 });
  const s1 = snap(l, 1);
  assert.ok(s1.player.vel[1] > 13 && Math.abs(Math.hypot(s1.player.vel[0], s1.player.vel[2]) - 24) < 1e-2);
  const landed = l.find((x) => x.type === "snapshot" && x.tick > 10 && x.player.grounded);
  assert.ok(landed.tick >= 80 && landed.tick <= 90, `flight ~1.4 s, got ${landed.tick}`);
  assert.ok(Math.hypot(landed.player.pos[0] - 70, landed.player.pos[2]) <= 28);
  assert.equal(ev(l, "player_hit").length, 0);
});

test("FT-08 night 2 bridge is walkable, stepping off it falls", () => {
  const ok = go({ night: 2, scenario: quiet({ player: { pos: [27, 0, 0] } }), frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }], ticks: 180, every: 180 });
  assert.equal(ev(ok, "player_hit").length, 0);
  assert.ok(snap(ok, 180).player.pos[0] > 44);
  const off = go({ night: 2, scenario: quiet({ player: { pos: [35, 0, 0] } }), frames: [{ tick: 0, move: [0, 1] }], ticks: 200 });
  assert.equal(ev(off, "player_hit")[0].data.by, "fall");
});

test("FT-09 night 3 terrain: tier walls block, ramps climb to tier 1, pad reaches tier 2, tower blocks", () => {
  const w = go({ night: 3, scenario: quiet({ player: { pos: [-30, 0, 5] } }), frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }], ticks: 120, every: 120 });
  assert.ok(snap(w, 120).player.pos[0] <= -23.4 && snap(w, 120).player.pos[1] === 0, "blocked by tier-1 cliff at r=24");
  const a = (30 * Math.PI) / 180;
  // walk radially inward along the 30 deg ramp: world dir = (-cos30, -sin30)
  const dir = [-Math.cos(a), -Math.sin(a)];
  const yaw = 0; // with yaw 0, move [x,z] maps to world (x, z)
  const climb = go({ night: 3, scenario: quiet({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }), frames: [{ tick: 0, move: dir, cam_yaw_deg: yaw }], ticks: 80, every: 80 });
  assert.equal(snap(climb, 80).player.pos[1], 3, "on tier 1 after the ramp");
  const pad = go({ night: 3, scenario: quiet({ player: { pos: [0, 3, 13] } }), ticks: 90, every: 1 });
  const land = pad.find((x) => x.type === "snapshot" && x.tick > 5 && x.player.grounded);
  assert.equal(land.player.pos[1], 6, "pad lands on tier 2");
  const tower = go({ night: 3, scenario: quiet({ player: { pos: [0, 6, 6] } }), frames: [{ tick: 0, move: [0, -1] }], ticks: 120, every: 120 });
  assert.ok(Math.hypot(snap(tower, 120).player.pos[0], snap(tower, 120).player.pos[2]) >= 2, "tower is solid");
});

test("FT-10 night 3 wind: gust every 30 s for 5 s pushes 2 m/s; reported in snapshot", () => {
  const l = go({ night: 3, scenario: quiet({ wind_enabled: true, player: { pos: [0, 0, -30] } }), ticks: 1800 + 300 + 10, every: 1 });
  const s = snap(l, 1800);
  assert.equal(s.wind.active, true);
  const e = snap(l, 1860);
  const moved = Math.hypot(e.player.pos[0] - s.player.pos[0], e.player.pos[2] - s.player.pos[2]);
  assert.ok(Math.abs(moved - 2) < 2e-3, `moved ${moved}`); // snapshot coords are rounded to 3 decimals
  assert.equal(snap(l, 2100).wind.active, false);
  assert.equal(snap(l, 1799).wind.active, false);
});

test("FT-11 snapshot v1.1 fields", () => {
  const s = go({ night: 2, ticks: 0 })[0];
  for (const k of ["night", "wind", "motes", "drifters", "charms"]) assert.ok(k in s, k);
  for (const k of ["vel", "grounded", "invuln", "dash_cd_s", "pulse_cd_s", "charm_s"]) assert.ok(k in s.player, k);
  assert.deepEqual(Object.keys(s.motes[0]), ["id", "pos", "kind", "ttl_s"]);
  assert.deepEqual(s.charms, [{ id: "C1", available: true, respawn_s: 0 }]);
  assert.equal(s.lanterns.length, 6);
  assert.equal(go({ night: 3, ticks: 0 })[0].lanterns.length, 7);
});
