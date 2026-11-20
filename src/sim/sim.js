// Đảo Đèn Lồng — deterministic game simulation (no rendering, no DOM).
// Shared by the browser game (src/web) and the headless runner (src/headless.js).
// Tick model follows Test Contract v1.0: step(k) reads input of tick k and produces state k+1.
import { TUNING as T, WORLD as W } from "./tuning.js";

export class ValidationError extends Error {}

const DT = 1 / W.tick_rate;
const secToTicks = (s) => Math.round(s * W.tick_rate);
const r3 = (v) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};
const hdist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// mulberry32 — small, fast, deterministic PRNG
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultLanterns() {
  const out = [];
  for (let i = 0; i < T.lantern_count_night1; i++) {
    const a = (i * 2 * Math.PI) / T.lantern_count_night1;
    out.push({
      id: "L" + (i + 1),
      x: r3(W.lantern_ring_radius * Math.sin(a)),
      z: r3(W.lantern_ring_radius * Math.cos(a)),
      deposited: 0,
      lit: false,
    });
  }
  return out;
}

// ---------- validation helpers ----------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
function vec(v, n, what) {
  if (!Array.isArray(v) || v.length !== n || !v.every(isNum)) throw new ValidationError(`${what} must be an array of ${n} numbers`);
  return v;
}
function obj(v, what) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new ValidationError(`${what} must be an object`);
  return v;
}

export function parseScenario(raw) {
  obj(raw, "scenario");
  const s = {};
  if (raw.player !== undefined) {
    const p = obj(raw.player, "scenario.player");
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec(p.pos, 3, "player.pos");
    if (p.carried !== undefined) {
      if (!isInt(p.carried) || p.carried < 0) throw new ValidationError("player.carried must be an integer >= 0");
      s.player.carried = p.carried;
    }
    if (p.flames !== undefined) {
      if (!isInt(p.flames) || p.flames < 0) throw new ValidationError("player.flames must be an integer >= 0");
      s.player.flames = p.flames;
    }
  }
  for (const k of ["random_motes", "random_shades"]) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "boolean") throw new ValidationError(`${k} must be boolean`);
      s[k] = raw[k];
    }
  }
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) throw new ValidationError("motes must be an array");
    s.motes = raw.motes.map((m, i) => {
      if (Array.isArray(m)) return { pos: vec(m, 3, `motes[${i}]`) };
      obj(m, `motes[${i}]`);
      if (m.id !== undefined && typeof m.id !== "string") throw new ValidationError(`motes[${i}].id must be a string`);
      return { id: m.id, pos: vec(m.pos, 3, `motes[${i}].pos`) };
    });
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) throw new ValidationError("shades must be an array");
    s.shades = raw.shades.map((sh, i) => {
      obj(sh, `shades[${i}]`);
      if (sh.id !== undefined && typeof sh.id !== "string") throw new ValidationError(`shades[${i}].id must be a string`);
      return { id: sh.id, pos: vec(sh.pos, 3, `shades[${i}].pos`) };
    });
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) throw new ValidationError("lanterns must be an array");
    s.lanterns = raw.lanterns.map((l, i) => {
      obj(l, `lanterns[${i}]`);
      if (typeof l.id !== "string" || !/^L[1-9]\d*$/.test(l.id)) throw new ValidationError(`lanterns[${i}].id must be like "L1"`);
      const o = { id: l.id };
      if (l.pos !== undefined) o.pos = vec(l.pos, 3, `lanterns[${i}].pos`);
      if (l.deposited !== undefined) {
        if (!isInt(l.deposited) || l.deposited < 0) throw new ValidationError(`lanterns[${i}].deposited must be an integer >= 0`);
        o.deposited = l.deposited;
      }
      if (l.lit !== undefined) {
        if (typeof l.lit !== "boolean") throw new ValidationError(`lanterns[${i}].lit must be boolean`);
        o.lit = l.lit;
      }
      return o;
    });
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s <= 0) throw new ValidationError("time_left_s must be a number > 0");
    s.time_left_s = raw.time_left_s;
  }
  return s;
}

export function parseInputs(raw) {
  obj(raw, "inputs");
  if (!Array.isArray(raw.frames)) throw new ValidationError("inputs.frames must be an array");
  let last = -1;
  return raw.frames.map((f, i) => {
    obj(f, `frames[${i}]`);
    if (!isInt(f.tick) || f.tick < 0) throw new ValidationError(`frames[${i}].tick must be an integer >= 0`);
    if (f.tick <= last) throw new ValidationError(`frames[${i}].tick must be strictly increasing`);
    last = f.tick;
    const o = { tick: f.tick };
    if (f.move !== undefined) o.move = vec(f.move, 2, `frames[${i}].move`);
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) throw new ValidationError(`frames[${i}].cam_yaw_deg must be a number`);
      o.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const b of ["jump", "interact", "pulse", "dash"]) {
      if (f[b] !== undefined) {
        if (typeof f[b] !== "boolean") throw new ValidationError(`frames[${i}].${b} must be boolean`);
        o[b] = f[b];
      }
    }
    return o;
  });
}

// ---------- simulation ----------
export class Sim {
  constructor({ seed = 0, scenario = {} } = {}) {
    this.rng = makeRng(seed);
    this.tick = 0; // index of the current state
    this.state = "playing";
    this.result = null;
    this.score = 0;
    this.events = []; // events produced by the last step
    this.nextMote = 1;
    this.nextShade = 1;
    this.held = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };

    const sc = scenario;
    this.randomMotes = sc.random_motes !== false;
    this.randomShades = sc.random_shades !== false;
    this.timeStart = sc.time_left_s ?? T.night1_duration_s;

    const pp = sc.player?.pos ?? [0, 0, 0];
    this.player = {
      x: pp[0], y: Math.max(0, pp[1]), z: pp[2], vy: 0,
      carried: sc.player?.carried ?? 0,
      flames: sc.player?.flames ?? T.flames,
      invulnUntil: 0, pulseReadyAt: 0, facing: 0,
    };

    this.lanterns = defaultLanterns();
    for (const l of sc.lanterns ?? []) {
      const L = this.lanterns.find((q) => q.id === l.id);
      if (!L) throw new ValidationError(`unknown lantern id ${l.id}`);
      if (l.pos) { L.x = l.pos[0]; L.z = l.pos[2]; }
      if (l.deposited !== undefined) L.deposited = Math.min(l.deposited, T.lantern_cost);
      if (l.lit === true) { L.lit = true; if (l.deposited === undefined) L.deposited = T.lantern_cost; }
      else if (l.lit === false) L.lit = false;
      if (L.deposited >= T.lantern_cost) L.lit = true;
    }

    this.motes = [];
    if (sc.motes) for (const m of sc.motes) this.addMote(m.pos[0], m.pos[2], m.id);
    else if (this.randomMotes) for (let i = 0; i < W.mote_target; i++) this.spawnRandomMote();

    this.shades = [];
    if (sc.shades) for (const s of sc.shades) this.addShade(s.pos[0], s.pos[2], s.id);
    else if (this.randomShades) for (let i = 0; i < W.shade_initial; i++) this.spawnRandomShade(false);
  }

  get timeLeft() {
    return Math.max(0, this.timeStart - this.tick / W.tick_rate);
  }

  emit(name, data) {
    this.events.push({ type: "event", tick: this.tick, name, data });
  }

  addMote(x, z, id) {
    let mid = id;
    if (mid === undefined) {
      do mid = "M" + this.nextMote++;
      while (this.motes.some((m) => m.id === mid));
    }
    this.motes.push({ id: mid, x, z });
  }

  spawnRandomMote() {
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(W.mote_min_r ** 2 + this.rng() * (W.mote_max_r ** 2 - W.mote_min_r ** 2));
    this.addMote(r3(r * Math.cos(a)), r3(r * Math.sin(a)));
  }

  uniqueShadeId() {
    let id;
    do id = "S" + this.nextShade++;
    while (this.shades.some((s) => s.id === id));
    return id;
  }

  addShade(x, z, id) {
    const sh = { id: id ?? this.uniqueShadeId(), x, z, stunUntil: 0 };
    this.shades.push(sh);
    return sh;
  }

  spawnRandomShade(withEvent) {
    const p = this.player;
    let x = 0, z = 0;
    for (let tries = 0; tries < 24; tries++) {
      const a = this.rng() * Math.PI * 2;
      x = r3(W.shade_spawn_r * Math.cos(a));
      z = r3(W.shade_spawn_r * Math.sin(a));
      if (hdist(x, z, p.x, p.z) >= W.shade_spawn_min_player_dist) break;
    }
    const sh = this.addShade(x, z);
    this.keepOutOfSafe(sh);
    if (withEvent) this.emit("shade_spawned", { id: sh.id });
  }

  keepOutOfSafe(sh) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const L of this.lanterns) {
        const d = hdist(sh.x, sh.z, L.x, L.z);
        if (d <= T.safe_radius) {
          const nx = d > 1e-9 ? (sh.x - L.x) / d : 1, nz = d > 1e-9 ? (sh.z - L.z) / d : 0;
          const m = T.safe_radius + 0.01;
          sh.x = L.x + nx * m;
          sh.z = L.z + nz * m;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  clampIsland(o) {
    const d = Math.hypot(o.x, o.z);
    if (d > W.island_radius) { o.x *= W.island_radius / d; o.z *= W.island_radius / d; }
  }

  // Apply an input frame (only fields present change; see contract section C).
  applyFrame(f) {
    const prev = { ...this.held };
    for (const k of ["move", "cam_yaw_deg", "jump", "interact", "pulse", "dash"]) if (f[k] !== undefined) this.held[k] = f[k];
    return {
      jump: this.held.jump && !prev.jump,
      interact: this.held.interact && !prev.interact,
      pulse: this.held.pulse && !prev.pulse,
    };
  }

  // One gameplay step. `frame` = input frame for this tick (or null). Returns events of this step.
  step(frame) {
    this.events = [];
    if (this.state !== "playing") return this.events;
    const edges = frame ? this.applyFrame(frame) : { jump: false, interact: false, pulse: false };
    this.tick += 1;
    const t = this.tick;
    const p = this.player;

    // 1. movement (camera-relative), contract C formula
    let [mx, mz] = this.held.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = (this.held.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    p.x += wx * T.player_speed * DT;
    p.z += wz * T.player_speed * DT;
    if (Math.hypot(wx, wz) > 1e-6) p.facing = Math.atan2(wx, wz);
    this.clampIsland(p);

    // 2. jump / gravity (cosmetic for rules: all distances are horizontal)
    if (edges.jump && p.y <= 0) p.vy = W.jump_speed;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= W.gravity * DT;
      p.y += p.vy * DT;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }

    // 3. pick up motes
    for (let i = 0; i < this.motes.length && p.carried < T.carry_capacity; ) {
      const m = this.motes[i];
      if (hdist(p.x, p.z, m.x, m.z) <= T.pickup_radius) {
        this.motes.splice(i, 1);
        p.carried += 1;
        this.score += T.score.per_mote;
        this.emit("mote_picked", { carried: p.carried });
      } else i++;
    }

    // 4. interact -> deposit into nearest unlit lantern in range
    if (edges.interact && p.carried > 0) {
      let best = null, bd = Infinity;
      for (const L of this.lanterns) {
        if (L.lit) continue;
        const d = hdist(p.x, p.z, L.x, L.z);
        if (d <= T.interact_radius && d < bd) { best = L; bd = d; }
      }
      if (best) {
        const amount = Math.min(p.carried, T.lantern_cost - best.deposited);
        if (amount > 0) {
          p.carried -= amount;
          best.deposited += amount;
          this.emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= T.lantern_cost) {
            best.lit = true;
            this.score += T.score.per_lantern;
            this.emit("lantern_lit", { lantern_id: best.id });
            if (this.lanterns.every((L) => L.lit)) return this.finish("won", "all_lit");
          }
        }
      }
    }

    // 5. light pulse
    if (edges.pulse && t >= p.pulseReadyAt && p.carried >= T.pulse_cost) {
      p.carried -= T.pulse_cost;
      p.pulseReadyAt = t + secToTicks(T.pulse_cooldown_s);
      const stunned = [];
      for (const sh of this.shades) {
        const d = hdist(p.x, p.z, sh.x, sh.z);
        if (d <= T.pulse_radius) {
          const nx = d > 1e-9 ? (sh.x - p.x) / d : Math.sin(p.facing);
          const nz = d > 1e-9 ? (sh.z - p.z) / d : Math.cos(p.facing);
          sh.x += nx * T.pulse_push_m;
          sh.z += nz * T.pulse_push_m;
          this.clampIsland(sh);
          this.keepOutOfSafe(sh);
          sh.stunUntil = t + secToTicks(T.pulse_stun_s);
          stunned.push(sh.id);
          this.score += T.score.per_stun;
        }
      }
      this.emit("pulse", { stunned_ids: stunned });
    }

    // 6. shades chase (stunned ones freeze), never enter a lantern's safe radius
    for (const sh of this.shades) {
      if (t < sh.stunUntil) continue;
      const d = hdist(p.x, p.z, sh.x, sh.z);
      if (d > 1e-9) {
        const stepLen = Math.min(d, T.shade_speed * DT);
        sh.x += ((p.x - sh.x) / d) * stepLen;
        sh.z += ((p.z - sh.z) / d) * stepLen;
      }
      this.clampIsland(sh);
      this.keepOutOfSafe(sh);
    }

    // 7. shade contact
    if (t >= p.invulnUntil) {
      for (const sh of this.shades) {
        if (t < sh.stunUntil) continue;
        if (hdist(p.x, p.z, sh.x, sh.z) <= T.shade_hit_radius) {
          p.flames -= 1;
          const dropped = Math.floor(p.carried * T.hit_drop_ratio);
          p.carried -= dropped;
          p.invulnUntil = t + secToTicks(T.invuln_s);
          this.emit("player_hit", { by: "shade", flames: p.flames, dropped });
          if (p.flames <= 0) return this.finish("lost", "no_flames");
          break;
        }
      }
    }

    // 8. spawns
    if (this.randomShades && t % secToTicks(W.shade_spawn_every_s) === 0 && this.shades.length < W.shade_max) this.spawnRandomShade(true);
    if (this.randomMotes && t % secToTicks(W.mote_respawn_s) === 0 && this.motes.length < W.mote_target) this.spawnRandomMote();

    // 9. dawn
    if (this.timeStart - t / W.tick_rate <= 1e-9) return this.finish("lost", "dawn");
    return this.events;
  }

  finish(result, reason) {
    this.state = result;
    this.result = { result, reason };
    if (result === "won") {
      this.score += Math.floor(this.timeLeft + 1e-9) * T.score.per_second_left;
      this.score += this.player.flames * T.score.per_flame_left;
    }
    this.emit("game_over", { result, reason });
    return this.events;
  }

  isStunned(sh) {
    return this.tick < sh.stunUntil;
  }

  snapshot() {
    const p = this.player;
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.tick,
      state: this.state,
      time_left_s: r3(this.timeLeft),
      score: this.score,
      player: { pos: [r3(p.x), r3(p.y), r3(p.z)], flames: p.flames, carried: p.carried },
      lanterns: this.lanterns.map((L) => ({ id: L.id, pos: [r3(L.x), 0, r3(L.z)], lit: L.lit, deposited: L.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: [r3(s.x), W.shade_height, r3(s.z)], state: this.isStunned(s) ? "stunned" : "chase" })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: [r3(m.x), 0, r3(m.z)] })),
    };
  }
}
