// Ticket-03 "Đèn cạn dầu" (Contract v1.2): FL-xx, each a headless scenario through the real runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScenario, parseInputs } from "../src/sim/sim.js";
import { run } from "../src/sim/runner.js";

const Q = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [] };
const go = ({ night = 1, scenario = {}, frames = [], ticks, every = 1 }) =>
  run({ seed: 3, night, scenario: parseScenario({ ...Q, ...scenario }), frames: parseInputs({ frames }), ticks, snapshotEvery: every }).trim().split("\n").map((l) => JSON.parse(l));
const ev = (l, n) => l.filter((x) => x.type === "event" && x.name === n);
const snap = (l, t) => l.find((x) => x.type === "snapshot" && x.tick === t);
const L1 = (s) => s.lanterns[0];

test("FL-01 fuel: lighting sets 100, decays 1/s exactly (integer 1/60 units), snapshot fields", () => {
  const l = go({ scenario: { player: { pos: [0, 0, 24], carried: 10 } }, frames: [{ tick: 0, interact: true }], ticks: 601, every: 60 });
  assert.deepEqual(ev(l, "lantern_lit")[0].data, { lantern_id: "L1", relight: false });
  assert.equal(L1(snap(l, 600)).fuel, 90); // lit at tick 1 with 100, then 599 ticks of decay = 90.017 -> 90.0
  assert.equal(L1(snap(l, 0)).fuel, 0);
  assert.deepEqual([L1(snap(l, 60)).ever_lit, L1(snap(l, 60)).relit_count], [true, 0]);
  assert.equal(snap(l, 60).player.capacity, 12);
});

test("FL-02 lantern runs out: lantern_out, deposited 0, ever_lit kept; relight costs 5, +40, relight:true", () => {
  const l = go({ scenario: { player: { pos: [0, 0, 24], carried: 6 }, lanterns: [{ id: "L1", lit: true, fuel: 1 }] }, frames: [{ tick: 70, interact: true }], ticks: 80 });
  assert.equal(ev(l, "lantern_out")[0].tick, 60);
  const s = snap(l, 60);
  assert.deepEqual([L1(s).lit, L1(s).deposited, L1(s).fuel, L1(s).ever_lit], [false, 0, 0, true]);
  assert.deepEqual(ev(l, "deposit")[0].data, { lantern_id: "L1", amount: 5, deposited: 5 });
  assert.deepEqual(ev(l, "lantern_lit")[0].data, { lantern_id: "L1", relight: true });
  assert.equal(snap(l, 71).score, 5 * 5 + 40);
  assert.equal(L1(snap(l, 71)).relit_count, 1);
});

test("FL-03 refuel: used = min(carried, ceil((100-fuel)/10)), +5 each; full lantern not selectable", () => {
  const l = go({ scenario: { player: { pos: [0, 0, 24], carried: 9 }, lanterns: [{ id: "L1", lit: true, fuel: 55 }] }, frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }, { tick: 2, interact: true }], ticks: 4 });
  assert.deepEqual(ev(l, "refuel")[0].data, { lantern_id: "L1", amount: 5, fuel: 100 }); // ceil(45.0167/10)=5
  assert.equal(snap(l, 1).player.carried, 4);
  assert.equal(snap(l, 1).score, 25);
  // decay runs (step 2) before interact (step 5): at the 2nd press fuel is 99.983 -> not full -> used = 1
  assert.deepEqual(ev(l, "refuel")[1].data, { lantern_id: "L1", amount: 1, fuel: 100 });
});

test("FL-03b candidates: lit-but-not-full lanterns count; nearest wins, tie -> smaller id", () => {
  // Because decay happens before interaction, a lantern is "full" (used = 0) only in theory; the rule is in sim.js.
  const l = go({ scenario: { player: { pos: [0, 0, 0], carried: 3 }, lanterns: [{ id: "L1", pos: [1, 0, 0], lit: true, fuel: 100 }, { id: "L2", pos: [-1.5, 0, 0] }] }, frames: [{ tick: 0, interact: true }], ticks: 1 });
  assert.deepEqual(ev(l, "refuel")[0].data, { lantern_id: "L1", amount: 1, fuel: 100 });
  const t = go({ scenario: { player: { pos: [0, 0, 0], carried: 3 }, lanterns: [{ id: "L2", pos: [-1, 0, 0] }, { id: "L1", pos: [1, 0, 0], lit: true, fuel: 50 }] }, frames: [{ tick: 0, interact: true }], ticks: 1 });
  assert.equal(ev(t, "refuel")[0].data.lantern_id, "L1", "tie -> smaller id even if it is a refuel");
});

test("FL-04 capacity = 10 + 2 x successful lights (max 20), scenario lights count, HUD field", () => {
  const l = go({ scenario: { player: { successful_lights: 7 } }, ticks: 0 });
  assert.equal(l[0].player.capacity, 20);
  const m = go({ scenario: { player: { pos: [0, 0, 24], carried: 10 }, motes: Array.from({ length: 14 }, (_, i) => [0.05 * i, 0, 24]) }, frames: [{ tick: 0, interact: true }], ticks: 2 });
  assert.equal(snap(m, 2).player.carried, 12, "capacity grew to 12 after the light");
});

test("FL-05 safe zone lost below 30 fuel (30 exactly keeps it); wander shade goes to weak lantern and drains 5/s", () => {
  const l = go({ scenario: { player: { pos: [-30, 0, 0] }, lanterns: [{ id: "L1", lit: true, fuel: 29 }], shades: [{ id: "S1", pos: [0, 1, 20], state: "wander" }] }, ticks: 600, every: 10 });
  const drainStart = l.find((x) => x.type === "snapshot" && x.shades[0].state === "drain");
  assert.ok(drainStart, "shade reaches the weak lantern and drains");
  assert.ok(ev(l, "fuel_drain").length >= 1);
  assert.deepEqual(Object.keys(ev(l, "fuel_drain")[0].data), ["lantern_id", "shade_id", "fuel"]);
  assert.ok(ev(l, "lantern_out").length === 1);
  // exactly 30 keeps the zone: a chasing shade outside stays blocked at the 6 m edge this tick
  const s30 = go({ scenario: { player: { pos: [0, 0, 24] }, lanterns: [{ id: "L1", lit: true, fuel: 30 + 1 / 60 }], shades: [{ id: "S1", pos: [0, 1, 18.95], state: "chase" }] }, ticks: 1 });
  assert.ok(25 - snap(s30, 1).shades[0].pos[2] >= 6 - 1e-3, "fuel 30.0 after decay still blocks");
  const s29 = go({ scenario: { player: { pos: [0, 0, 24] }, lanterns: [{ id: "L1", lit: true, fuel: 30 }], shades: [{ id: "S1", pos: [0, 1, 18.95], state: "chase" }] }, ticks: 1 });
  assert.ok(25 - snap(s29, 1).shades[0].pos[2] < 6, "fuel 29.98 < 30 -> no zone");
  const keep = go({ scenario: { player: { pos: [0, 0, 24] }, lanterns: [{ id: "L1", lit: true, fuel: 40 }], shades: [{ id: "S1", pos: [0, 1, 14], state: "chase" }] }, ticks: 600, every: 10 });
  assert.equal(ev(keep, "player_hit").length, 0, "fuel >= 30 still protects until it decays below 30");
});

test("FL-06 drain transitions: chase when Mây within 6 m; stunned by pulse (+15); wander when refuelled >= 30", () => {
  const base = { lanterns: [{ id: "L1", lit: true, fuel: 25 }], shades: [{ id: "S1", pos: [0, 1, 23.5], state: "drain", target_lantern_id: "L1" }] };
  const a = go({ scenario: { ...base, player: { pos: [0, 0, 18] } }, ticks: 2 });
  assert.equal(snap(a, 1).shades[0].state, "chase");
  const b = go({ scenario: { ...base, player: { pos: [0, 0, 19.5], carried: 3 } }, frames: [{ tick: 0, pulse: true }], ticks: 1 });
  assert.equal(snap(b, 1).shades[0].state, "stunned");
  assert.equal(snap(b, 1).score, 15);
  const c = go({ scenario: { ...base, player: { pos: [-40, 0, 0] } }, ticks: 121 });
  assert.equal(snap(c, 1).shades[0].state, "drain");
  assert.equal(L1(snap(c, 60)).fuel, Math.round((25 - 60 * 6 / 60) * 10) / 10); // 1 + 5 per second
});

test("FL-07 refuelling to >= 30 evicts shades inside 6 m within 30 ticks, harmless meanwhile", () => {
  const l = go({ scenario: { player: { pos: [0, 0, 23.2], carried: 2, invuln_ticks: 0 }, lanterns: [{ id: "L1", lit: true, fuel: 20 }], shades: [{ id: "S1", pos: [0, 1, 27], state: "drain", target_lantern_id: "L1" }] }, frames: [{ tick: 0, interact: true }], ticks: 31 });
  assert.equal(ev(l, "refuel")[0].data.fuel, 39.9); // 20 - (1+5)/60 this tick + 20
  assert.equal(ev(l, "player_hit").length, 0);
  const s = snap(l, 31).shades[0];
  assert.ok(Math.hypot(s.pos[0], s.pos[2] - 25) >= 6 - 1e-3);
});

test("FL-08 dawn: won dawn_survived iff lit >= ceil(0.6 n); bonus 50 + floor(fuel) per lit lantern + 50 per flame", () => {
  const lit = (ids, fuel = 50) => ids.map((id) => ({ id, lit: true, fuel }));
  const w = go({ scenario: { lanterns: lit(["L1", "L2", "L3"]), time_left_s: 1 }, ticks: 100 });
  assert.deepEqual(ev(w, "game_over")[0], { type: "event", tick: 60, name: "game_over", data: { result: "won", reason: "dawn_survived" } });
  assert.equal(w.at(-1).score, 3 * (50 + 49) + 3 * 50);
  const lose = go({ scenario: { lanterns: lit(["L1", "L2"]), time_left_s: 1 }, ticks: 100 });
  assert.deepEqual(ev(lose, "game_over")[0].data, { result: "lost", reason: "dawn" });
  assert.equal(lose.at(-1).score, 0);
  const n2 = go({ night: 2, scenario: { lanterns: lit(["L1", "L2", "L3"]), time_left_s: 1 }, ticks: 100 });
  assert.equal(ev(n2, "game_over")[0].data.result, "lost", "night 2 needs 4/6");
  const n3 = go({ night: 3, scenario: { player: { pos: [0, 0, -30] }, lanterns: lit(["L1", "L2", "L3", "L4", "L5"]), time_left_s: 1 }, ticks: 100 });
  assert.equal(ev(n3, "game_over")[0].data.result, "won", "night 3 needs 5/7");
});

test("FL-09 no early win: all lanterns lit keeps playing until dawn", () => {
  const ids = ["L1", "L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true }));
  const l = go({ scenario: { lanterns: ids }, ticks: 600 });
  assert.equal(l.at(-1).state, "playing");
  assert.equal(ev(l, "game_over").length, 0);
});

test("FL-10 lit:true without fuel defaults to 100; bad fuel -> exit-2 validation error", () => {
  assert.equal(L1(go({ scenario: { lanterns: [{ id: "L1", lit: true }] }, ticks: 0 })[0]).fuel, 100);
  assert.throws(() => parseScenario({ lanterns: [{ id: "L1", fuel: 140 }] }), /fuel/);
});
