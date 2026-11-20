// Simple autopilot that plays Night 1 and records its inputs as a contract inputs file.
// Used as evidence that the default night is winnable from start to end through the headless CLI.
// Usage: node scripts/bot.js <seed> <out-inputs.json>
import { writeFileSync } from "node:fs";
import { Sim } from "../src/sim/sim.js";
import { TUNING as T } from "../src/sim/tuning.js";

export function playBot(seed, maxTicks = 300 * 60) {
  const sim = new Sim({ seed });
  const frames = [];
  let prev = { move: [0, 0], interact: false, pulse: false };
  for (let k = 0; k < maxTicks && sim.state === "playing"; k++) {
    const p = sim.player;
    const near = (o) => Math.hypot(o.x - p.x, o.z - p.z);
    const unlit = sim.lanterns.filter((L) => !L.lit).sort((a, b) => near(a) - near(b));
    const need = unlit.length ? T.lantern_cost - unlit[0].deposited : 0;
    let target;
    if (p.carried >= Math.min(need, T.carry_capacity) + 1 || (p.carried >= need && p.carried > 0)) target = unlit[0];
    else target = [...sim.motes].sort((a, b) => near(a) - near(b))[0] ?? unlit[0];
    let move = [0, 0];
    const d = near(target);
    if (d > 0.3) move = [(target.x - p.x) / d, (target.z - p.z) / d]; // cam_yaw 0: move == world dir
    move = move.map((v) => Math.round(v * 1000) / 1000);
    const atLantern = target === unlit[0] && d <= T.interact_radius - 0.5;
    const threat = sim.shades.some((s) => !sim.isStunned(s) && near(s) < 3);
    const f = { move, interact: atLantern && !prev.interact, pulse: threat && !prev.pulse };
    const frame = { tick: k };
    if (f.move[0] !== prev.move[0] || f.move[1] !== prev.move[1]) frame.move = f.move;
    if (f.interact !== prev.interact) frame.interact = f.interact;
    if (f.pulse !== prev.pulse) frame.pulse = f.pulse;
    if (Object.keys(frame).length > 1) frames.push(frame);
    prev = f;
    sim.step(frame);
  }
  return { frames, state: sim.state, score: sim.score, ticks: sim.tick };
}

if (process.argv[1]?.endsWith("bot.js")) {
  const seed = Number(process.argv[2] ?? 1);
  const r = playBot(seed);
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ frames: r.frames }));
  console.log(JSON.stringify({ seed, state: r.state, score: r.score, ticks: r.ticks, frames: r.frames.length }));
}
