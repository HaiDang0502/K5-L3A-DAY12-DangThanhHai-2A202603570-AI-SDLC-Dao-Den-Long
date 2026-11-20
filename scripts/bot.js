// Autopilot that plays a night and records its inputs as a contract inputs file (evidence that every
// night is playable to the end through the real headless CLI). Usage: node scripts/bot.js <seed> [out.json] [night]
import { writeFileSync } from "node:fs";
import { Sim } from "../src/sim/sim.js";
import { TUNING as T } from "../src/sim/tuning.js";

const hd = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const A30 = Math.PI / 6;

// Next waypoint from the player towards a target, using bridge / ramps / pad.
function waypoint(sim, p, t) {
  if (sim.night === 2) {
    const side = (x, z) => (hd(x, z, 0, 0) <= 28.5 ? "A" : hd(x, z, 70, 0) <= 28.5 ? "B" : "bridge");
    const ps = side(p.x, p.z), ts = side(t.x, t.z);
    if (ps !== ts && ps !== "bridge" && ts !== "bridge") {
      const [ex, ez] = ps === "A" ? [24, 0] : [46, 0];
      if (hd(p.x, p.z, ex, ez) > 1) return [ex, ez];
      return ps === "A" ? [48, 0] : [22, 0];
    }
    if (ps === "bridge") return [t.x < 35 ? 22 : 48, 0];
  }
  if (sim.night === 3) {
    const ty = t.y ?? 0;
    if (ty > p.y + 0.5) {
      if (p.y < 2.5) {
        // go to the nearest ramp foot (r=31) then walk up to r=22
        const ramps = [[Math.cos(A30), Math.sin(A30)], [-Math.cos(A30), Math.sin(A30)]];
        const [ux, uz] = ramps.sort((a, b) => hd(p.x, p.z, a[0] * 31, a[1] * 31) - hd(p.x, p.z, b[0] * 31, b[1] * 31))[0];
        const along = p.x * ux + p.z * uz, lat = Math.abs(-p.x * uz + p.z * ux);
        if (lat > 0.6 || along > 31.5) return [ux * 31, uz * 31];
        return [ux * 21, uz * 21];
      }
      if (ty > 4.5) return [0, 13]; // tier 1 -> pad up to tier 2
    }
    if (ty < p.y - 0.5 && p.y > 2.5 && p.y < 4.5) {
      // tier 1 -> walk down the nearest ramp
      const ux = p.x >= 0 ? Math.cos(A30) : -Math.cos(A30), uz = Math.sin(A30);
      const along = p.x * ux + p.z * uz, lat = Math.abs(-p.x * uz + p.z * ux);
      if (lat > 0.6 || along < 21) return [ux * 21, uz * 21];
      return [ux * 32, uz * 32];
    }
    if (ty < p.y - 0.5 && p.y > 4.5) return [p.x * 1.6 || 0, p.z * 1.6 || 9.5]; // step off tier 2
  }
  return [t.x, t.z];
}

export function playBot(seed, night = 1, maxTicks = 360 * 60) {
  const sim = new Sim({ seed, night });
  const frames = [];
  let prev = { move: [0, 0], interact: false, pulse: false, dash: false };
  for (let k = 0; k < maxTicks && sim.state === "playing"; k++) {
    const p = sim.player;
    const near = (o) => hd(o.x, o.z, p.x, p.z);
    const reach = (o) => Math.abs((o.y ?? 0) - p.y) < 1.5 || sim.night !== 3 || true;
    const unlit = sim.lanterns.filter((L) => !L.lit).sort((a, b) => near(a) - near(b));
    const motes = sim.motes.filter(reach).sort((a, b) => near(a) + 8 * Math.abs(a.y - p.y) - near(b) - 8 * Math.abs(b.y - p.y));
    const L = unlit[0];
    const need = L ? T.lantern_cost - L.deposited : 0;
    const goLantern = p.carried >= Math.min(need, 6) || (p.carried > 0 && (!motes[0] || near(L) < 4));
    const target = goLantern ? L : motes[0] ?? L;
    const [wx, wz] = p.dead ? [p.x, p.z] : waypoint(sim, p, target);
    let dx = wx - p.x, dz = wz - p.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    // repel from active shades
    const active = sim.shades.filter((s) => s.state === "chase" || s.state === "wander");
    for (const s of active) {
      const d = near(s);
      if (d < 6 && d > 1e-6) { const w = (6 - d) / 6 * 1.6; dx += ((p.x - s.x) / d) * w; dz += ((p.z - s.z) / d) * w; }
    }
    let ml = Math.hypot(dx, dz);
    let move = ml > 1e-6 && dl > 0.2 ? [dx / ml, dz / ml] : [0, 0];
    move = move.map((v) => Math.round(v * 1000) / 1000);
    const atLantern = target === L && L && near(L) <= T.interact_radius - 0.3 && Math.abs(L.y - p.y) < 1;
    const close = active.filter((s) => near(s) < 2.4);
    const pulse = close.length > 0 && p.carried >= T.pulse_cost && p.pulseCd === 0;
    const dash = close.length > 0 && !pulse && p.dashCd === 0 && p.grounded && sim.night !== 3;
    const f = { move, interact: atLantern && !prev.interact, pulse: pulse && !prev.pulse, dash: dash && !prev.dash };
    const frame = { tick: k };
    if (f.move[0] !== prev.move[0] || f.move[1] !== prev.move[1]) frame.move = f.move;
    for (const b of ["interact", "pulse", "dash"]) if (f[b] !== prev[b]) frame[b] = f[b];
    if (Object.keys(frame).length > 1) frames.push(frame);
    prev = f;
    sim.step(frame);
  }
  return { frames, state: sim.state, score: sim.score, ticks: sim.tick };
}

if (process.argv[1]?.endsWith("bot.js")) {
  const seed = Number(process.argv[2] ?? 1), night = Number(process.argv[4] ?? 1);
  const r = playBot(seed, night);
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ frames: r.frames }));
  console.log(JSON.stringify({ seed, night, state: r.state, score: r.score, ticks: r.ticks, frames: r.frames.length }));
}
