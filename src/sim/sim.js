// Đảo Đèn Lồng — deterministic simulation, Test Contract v1.1 (Ticket-02).
// The step follows the mandatory per-tick order of Ticket-02 (numbered comments below).
import { TUNING as T, WORLD as W } from "./tuning.js";
import { NIGHTS } from "./maps.js";

export class ValidationError extends Error {}

const R = W.tick_rate, DT = 1 / R;
const sec = (s) => Math.round(s * R);
const r3 = (v) => { const x = Math.round(v * 1000) / 1000; return Object.is(x, -0) ? 0 : x; };
const hd = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const idNum = (id) => Number(String(id).replace(/\D/g, "")) || 0;
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const SHADE_STATES = ["spawning", "wander", "chase", "recoil", "stunned", "drain"];
// Fuel is kept in integer units of 1/60 (Ticket-03 precision note): 100 fuel = 6000 units.
const FU = 60, FUEL_MAX = T.fuel_max * FU, LOW = T.low_fuel_threshold * FU;
const r1 = (v) => Math.round(v * 10) / 10;
const DRIFTER_STATES = ["idle", "chase", "flee", "removed"];

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- validation ----------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const fail = (m) => { throw new ValidationError(m); };
const vec = (v, n, w) => (Array.isArray(v) && v.length === n && v.every(isNum) ? v : fail(`${w} must be an array of ${n} numbers`));
const obj = (v, w) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : fail(`${w} must be an object`));
const optInt = (o, k, w) => { if (o[k] !== undefined && (!isInt(o[k]) || o[k] < 0)) fail(`${w}.${k} must be an integer >= 0`); return o[k]; };
const optBool = (o, k, w) => { if (o[k] !== undefined && typeof o[k] !== "boolean") fail(`${w}.${k} must be boolean`); return o[k]; };
const optStr = (o, k, w) => { if (o[k] !== undefined && typeof o[k] !== "string") fail(`${w}.${k} must be a string`); return o[k]; };

export function parseScenario(raw) {
  obj(raw, "scenario");
  const s = {};
  if (raw.player !== undefined) {
    const p = obj(raw.player, "player");
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec(p.pos, 3, "player.pos");
    for (const k of ["carried", "flames", "invuln_ticks", "dash_cd_ticks", "pulse_cd_ticks", "charm_ticks", "successful_lights"]) if (optInt(p, k, "player") !== undefined) s.player[k] = p[k];
  }
  for (const k of ["random_motes", "random_shades", "random_drifters", "wind_enabled"]) if (optBool(raw, k, "scenario") !== undefined) s[k] = raw[k];
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) fail("motes must be an array");
    s.motes = raw.motes.map((m, i) => {
      if (Array.isArray(m)) return { pos: vec(m, 3, `motes[${i}]`) };
      obj(m, `motes[${i}]`);
      if (m.kind !== undefined && m.kind !== "random" && m.kind !== "dropped") fail(`motes[${i}].kind must be random|dropped`);
      return { id: optStr(m, "id", `motes[${i}]`), pos: vec(m.pos, 3, `motes[${i}].pos`), kind: m.kind, ttl_ticks: optInt(m, "ttl_ticks", `motes[${i}]`) };
    });
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) fail("shades must be an array");
    s.shades = raw.shades.map((sh, i) => {
      obj(sh, `shades[${i}]`);
      if (sh.state !== undefined && !SHADE_STATES.includes(sh.state)) fail(`shades[${i}].state must be one of ${SHADE_STATES}`);
      return { id: optStr(sh, "id", `shades[${i}]`), pos: vec(sh.pos, 3, `shades[${i}].pos`), state: sh.state, state_ticks_left: optInt(sh, "state_ticks_left", `shades[${i}]`), target_lantern_id: optStr(sh, "target_lantern_id", `shades[${i}]`) };
    });
  }
  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) fail("drifters must be an array");
    s.drifters = raw.drifters.map((d, i) => {
      obj(d, `drifters[${i}]`);
      if (d.state !== undefined && !DRIFTER_STATES.includes(d.state)) fail(`drifters[${i}].state must be one of ${DRIFTER_STATES}`);
      return { id: optStr(d, "id", `drifters[${i}]`), pos: vec(d.pos, 3, `drifters[${i}].pos`), state: d.state, stolen: optInt(d, "stolen", `drifters[${i}]`), state_ticks_left: optInt(d, "state_ticks_left", `drifters[${i}]`) };
    });
  }
  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) fail("charms must be an array");
    s.charms = raw.charms.map((c, i) => {
      obj(c, `charms[${i}]`);
      return { id: optStr(c, "id", `charms[${i}]`), pos: c.pos === undefined ? undefined : vec(c.pos, 3, `charms[${i}].pos`), available: optBool(c, "available", `charms[${i}]`), respawn_ticks: optInt(c, "respawn_ticks", `charms[${i}]`) };
    });
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) fail("lanterns must be an array");
    s.lanterns = raw.lanterns.map((l, i) => {
      obj(l, `lanterns[${i}]`);
      if (typeof l.id !== "string" || !/^L[1-9]\d*$/.test(l.id)) fail(`lanterns[${i}].id must be like "L1"`);
      if (l.fuel !== undefined && (!isNum(l.fuel) || l.fuel < 0 || l.fuel > T.fuel_max)) fail(`lanterns[${i}].fuel must be a number in [0, ${T.fuel_max}]`);
      return { id: l.id, pos: l.pos === undefined ? undefined : vec(l.pos, 3, `lanterns[${i}].pos`), deposited: optInt(l, "deposited", `lanterns[${i}]`), lit: optBool(l, "lit", `lanterns[${i}]`), fuel: l.fuel, ever_lit: optBool(l, "ever_lit", `lanterns[${i}]`) };
    });
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s <= 0) fail("time_left_s must be a number > 0");
    s.time_left_s = raw.time_left_s;
  }
  return s;
}

export function parseInputs(raw) {
  obj(raw, "inputs");
  if (!Array.isArray(raw.frames)) fail("inputs.frames must be an array");
  let last = -1;
  return raw.frames.map((f, i) => {
    obj(f, `frames[${i}]`);
    if (!isInt(f.tick) || f.tick < 0) fail(`frames[${i}].tick must be an integer >= 0`);
    if (f.tick <= last) fail(`frames[${i}].tick must be strictly increasing`);
    last = f.tick;
    const o = { tick: f.tick };
    if (f.move !== undefined) o.move = vec(f.move, 2, `frames[${i}].move`);
    if (f.cam_yaw_deg !== undefined) { if (!isNum(f.cam_yaw_deg)) fail(`frames[${i}].cam_yaw_deg must be a number`); o.cam_yaw_deg = f.cam_yaw_deg; }
    for (const b of ["jump", "interact", "pulse", "dash", "pause"]) if (optBool(f, b, `frames[${i}]`) !== undefined) o[b] = f[b];
    return o;
  });
}

// ---------- simulation ----------
export class Sim {
  // bench = Ticket-04 benchmark scene: no spawns, damage, pickup, fuel loss or end of night (not a contract option)
  constructor({ seed = 0, night = 1, scenario = {}, bench = false } = {}) {
    this.bench = bench;
    const N = NIGHTS[night];
    if (!N) throw new ValidationError(`night ${night} does not exist`);
    this.N = N;
    this.night = night;
    this.rng = makeRng(seed);
    this.tick = 0;
    this.simTick = 0;
    this.paused = false;
    this.state = "playing";
    this.result = null;
    this.score = 0;
    this.events = [];
    this.next = { M: 1, S: 1, D: 1 };
    this.held = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
    const sc = scenario;
    this.randomMotes = sc.random_motes !== false;
    this.randomShades = sc.random_shades !== false;
    this.randomDrifters = N.drifters && sc.random_drifters !== false;
    this.windEnabled = sc.wind_enabled ?? N.wind;
    this.timeStart = sc.time_left_s ?? N.duration_s;
    this.wind = { active: false, dir: 0, ticks: 0 };

    const sp = sc.player ?? {};
    const pos = sp.pos ?? N.start;
    this.player = {
      x: pos[0], y: pos[1], z: pos[2], vx: 0, vy: 0, vz: 0,
      grounded: false, facing: [0, 1], launched: null,
      carried: sp.carried ?? 0, flames: sp.flames ?? T.flames,
      invuln: sp.invuln_ticks ?? 0, dashCd: sp.dash_cd_ticks ?? 0, pulseCd: sp.pulse_cd_ticks ?? 0, charm: sp.charm_ticks ?? 0,
      dashLeft: 0, dead: 0, lights: sp.successful_lights ?? 0,
    };
    const g = N.ground(pos[0], pos[2]);
    if (g !== null && Math.abs(pos[1] - g) < 1e-6) { this.player.y = g; this.player.grounded = true; }

    this.lanterns = N.lanterns.map(([x, y, z], i) => ({ id: "L" + (i + 1), x, y, z, deposited: 0, lit: false, fuel: 0, everLit: false, relit: 0 }));
    for (const l of sc.lanterns ?? []) {
      const L = this.lanterns.find((q) => q.id === l.id) ?? fail(`unknown lantern id ${l.id}`);
      if (l.pos) [L.x, L.y, L.z] = l.pos;
      if (l.ever_lit !== undefined) L.everLit = l.ever_lit;
      if (l.deposited !== undefined) L.deposited = Math.min(l.deposited, this.costOf(L));
      if (l.lit === true && l.deposited === undefined) L.deposited = this.costOf(L);
      L.lit = l.lit ?? L.deposited >= this.costOf(L);
      if (L.lit) { L.everLit = l.ever_lit ?? true; L.fuel = Math.round((l.fuel ?? T.fuel_max) * FU); L.deposited = this.costOf(L); }
      if (L.lit && L.fuel <= 0) { L.lit = false; L.deposited = 0; L.fuel = 0; }
    }

    this.motes = [];
    if (sc.motes) for (const m of sc.motes) this.addMote(m.pos[0], m.pos[1], m.pos[2], m.kind ?? "random", m.kind === "dropped" ? m.ttl_ticks ?? W.drop_ttl : null, m.id);
    else if (this.randomMotes) {
      const pts = this.shuffled(N.motePoints.map((_, i) => i)).slice(0, W.mote_initial);
      for (const i of pts) { const [x, y, z] = N.motePoints[i]; this.addMote(x, y, z, "random", null, undefined, i); }
    }

    this.shades = [];
    for (const s of sc.shades ?? []) {
      const sh = this.addShade(s.pos[0], s.pos[2], s.id, s.state ?? "wander", s.state_ticks_left ?? 0);
      sh.y = s.pos[1];
      if (s.target_lantern_id !== undefined) {
        if (!this.lanterns.some((L) => L.id === s.target_lantern_id)) fail(`unknown target_lantern_id ${s.target_lantern_id}`);
        sh.target = s.target_lantern_id;
      }
    }
    this.drifters = [];
    for (const d of sc.drifters ?? []) {
      const dr = this.addDrifter(d.pos[0], d.pos[2], d.id, d.state ?? "idle");
      dr.y = d.pos[1];
      dr.stolen = d.stolen ?? 0;
      if (d.state_ticks_left !== undefined) dr.left = d.state_ticks_left;
    }
    this.charms = (sc.charms ?? N.charms.map((pos, i) => ({ id: "C" + (i + 1), pos }))).map((c, i) => {
      const def = N.charms[i] ?? [0, 0, 0];
      const p = c.pos ?? def;
      return { id: c.id ?? "C" + (i + 1), x: p[0], y: p[1], z: p[2], available: c.available ?? true, respawn: c.available === false ? c.respawn_ticks ?? W.charm_respawn : 0 };
    });
  }

  // ---------- helpers ----------
  shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  get timeLeft() { return Math.max(0, this.timeStart - this.simTick / R); }
  get capacity() { return Math.min(T.capacity_max, T.carry_capacity + W.capacity_per_light * this.player.lights); }
  costOf(L) { return L.everLit ? T.relight_cost : T.lantern_cost; }
  get speed() { return this.player.charm > 0 ? W.charm_speed : T.player_speed; }
  emit(name, data = {}) { this.events.push({ type: "event", tick: this.tick, name, data }); }
  groundAt(x, z) { return this.N.ground(x, z); }
  inTower(x, z, pad = 0) { const t = this.N.tower; return !!t && hd(x, z, t.x, t.z) <= t.r + pad; }
  // Ticket-03: a lit lantern with fuel < 30 loses its safe zone (exactly 30 keeps it)
  safeLantern(L) { return L.lit && L.fuel >= LOW; }
  litSafe(x, z) { return this.lanterns.some((L) => this.safeLantern(L) && hd(x, z, L.x, L.z) <= T.safe_radius); }
  // Float entities (shades/drifters) may go anywhere above ground except into the bell tower.
  floatOk(x, z) { return this.groundAt(x, z) !== null && !this.inTower(x, z); }

  addMote(x, y, z, kind, ttl, id, point = -1) {
    let mid = id;
    if (mid === undefined) do mid = "M" + this.next.M++; while (this.motes.some((m) => m.id === mid));
    this.motes.push({ id: mid, x, y, z, kind, ttl, point });
  }
  addShade(x, z, id, state, left) {
    let sid = id;
    if (sid === undefined) do sid = "S" + this.next.S++; while (this.shades.some((s) => s.id === sid));
    const g = this.groundAt(x, z) ?? 0;
    const sh = { id: sid, x, y: g + W.shade_height, z, state, left, push: null, evict: 0, wx: x, wz: z };
    this.shades.push(sh);
    return sh;
  }
  addDrifter(x, z, id, state) {
    let did = id;
    if (did === undefined) do did = "D" + this.next.D++; while (this.drifters.some((d) => d.id === did));
    const d = { id: did, x, y: (this.groundAt(x, z) ?? 0) + W.drifter_height, z, state, stolen: 0, left: 0, used: false, wx: x, wz: z };
    this.drifters.push(d);
    return d;
  }
  dropMotes(n, cx, cz, cy) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, r = W.drop_r_min + this.rng() * (W.drop_r_max - W.drop_r_min);
      const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
      this.addMote(r3(x), this.groundAt(x, z) ?? cy, r3(z), "dropped", W.drop_ttl);
    }
  }

  applyFrame(f) {
    const prev = { ...this.held };
    for (const k of Object.keys(this.held)) if (f && f[k] !== undefined) this.held[k] = f[k];
    const e = {};
    for (const k of ["jump", "interact", "pulse", "dash", "pause"]) e[k] = this.held[k] && !prev[k];
    return e;
  }

  // ---------- one tick ----------
  step(frame) {
    this.events = [];
    if (this.state !== "playing" && this.state !== "paused") return this.events;
    // 1. input; pause first
    const e = this.applyFrame(frame);
    this.tick += 1;
    if (e.pause) {
      this.paused = !this.paused;
      this.state = this.paused ? "paused" : "playing";
      this.emit(this.paused ? "paused" : "resumed");
      if (this.paused) return this.events;
    }
    if (this.paused) return this.events;
    this.simTick += 1;
    const p = this.player, N = this.N;

    // 2. counters
    for (const k of ["invuln", "dashCd", "pulseCd", "charm"]) if (p[k] > 0) p[k]--;
    for (const sh of this.shades) if (sh.left > 0) sh.left--;
    for (const d of this.drifters) if (d.left > 0) d.left--;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      if (m.ttl !== null && --m.ttl <= 0) this.motes.splice(i, 1);
    }
    for (const c of this.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    if (this.wind.active && --this.wind.ticks <= 0) this.wind.active = false;
    // Ticket-03: fuel decay (1/s) + drain (5/s per draining shade), then lanterns at fuel <= 0 go out
    if (!this.bench) for (const L of this.lanterns) if (L.lit) L.fuel -= Math.round(T.fuel_decay_per_s);
    for (const sh of [...this.shades].sort(byId)) {
      if (sh.state !== "drain" || this.bench) continue;
      const L = this.lanterns.find((q) => q.id === sh.target);
      if (!L || !L.lit) continue;
      L.fuel -= Math.round(T.drain_per_s);
      sh.drainT = (sh.drainT ?? 0) + 1;
      if (sh.drainT % W.drain_event_every === 0) this.emit("fuel_drain", { lantern_id: L.id, shade_id: sh.id, fuel: r1(Math.max(0, L.fuel) / FU) });
    }
    for (const L of this.lanterns) {
      if (L.lit && L.fuel <= 0) {
        L.lit = false; L.fuel = 0; L.deposited = 0;
        this.emit("lantern_out", { lantern_id: L.id });
      }
    }
    if (p.dead > 0 && --p.dead === 0 && p.flames > 0) {
      [p.x, p.y, p.z] = N.start;
      p.vx = p.vy = p.vz = 0;
      p.launched = null;
      p.dashLeft = 0;
      p.grounded = true;
      p.invuln = sec(T.invuln_s);
    }

    // 3. move Mây, then fall check
    if (p.dead === 0) this.movePlayer(e);

    if (p.dead === 0 && !this.bench) {
      // 4. pick up motes & charms
      for (let i = 0; i < this.motes.length && p.carried < this.capacity; ) {
        const m = this.motes[i];
        if (hd(p.x, p.z, m.x, m.z) <= T.pickup_radius && Math.abs(p.y - m.y) <= W.pickup_dy) {
          this.motes.splice(i, 1);
          p.carried++;
          this.emit("mote_picked", { carried: p.carried });
        } else i++;
      }
      for (const c of this.charms) {
        if (c.available && hd(p.x, p.z, c.x, c.z) <= T.pickup_radius && Math.abs(p.y - c.y) <= W.pickup_dy) {
          c.available = false;
          c.respawn = W.charm_respawn;
          p.charm = W.charm_ticks;
          this.emit("charm_picked", { charm_id: c.id, charm_ticks: p.charm });
        }
      }
      // 5. interact with lanterns
      if (e.interact && p.carried > 0) {
        let best = null, bd = Infinity;
        // candidates: unlit, or lit but not full of fuel
        for (const L of this.lanterns) {
          if (L.lit && L.fuel >= FUEL_MAX) continue;
          const d = hd(p.x, p.z, L.x, L.z);
          if (d <= T.interact_radius && (d < bd || (d === bd && idNum(L.id) < idNum(best.id)))) { best = L; bd = d; }
        }
        if (best && best.lit) {
          // refuel: used = min(carried, ceil((100 - fuel) / 10))
          const per = T.fuel_per_mote * FU;
          const used = Math.min(p.carried, Math.ceil((FUEL_MAX - best.fuel) / per));
          const before = best.fuel;
          best.fuel = Math.min(FUEL_MAX, best.fuel + per * used);
          p.carried -= used;
          this.score += used * T.score.per_mote;
          this.emit("refuel", { lantern_id: best.id, amount: used, fuel: r1(best.fuel / FU) });
          if (before < LOW && best.fuel >= LOW) best.justLit = true; // safe zone regained -> evict shades inside
        } else if (best) {
          const cost = this.costOf(best);
          const amount = Math.min(p.carried, cost - best.deposited);
          p.carried -= amount;
          best.deposited += amount;
          this.score += amount * T.score.per_mote;
          this.emit("deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= cost) {
            const relight = best.everLit;
            best.lit = true;
            best.fuel = FUEL_MAX;
            best.everLit = true;
            if (relight) best.relit++;
            p.lights++;
            this.score += relight ? T.score.per_relight : T.score.per_lantern;
            this.emit("lantern_lit", { lantern_id: best.id, relight });
            best.justLit = true;
          }
        }
      }
    }

    // 6. safe zones: shades inside a just-lit lantern are evicted within 30 ticks (harmless meanwhile)
    for (const L of this.lanterns) {
      if (!L.justLit) continue;
      L.justLit = false;
      for (const sh of this.shades) if (hd(sh.x, sh.z, L.x, L.z) <= T.safe_radius) { sh.evict = W.evict_ticks; sh.evictFrom = L; }
    }
    for (const sh of this.shades) {
      if (sh.evict <= 0) continue;
      const L = sh.evictFrom, d = hd(sh.x, sh.z, L.x, L.z);
      const nx = d > 1e-9 ? (sh.x - L.x) / d : 1, nz = d > 1e-9 ? (sh.z - L.z) / d : 0;
      const target = T.safe_radius + 1e-3;
      const stepLen = Math.max(0, (target - d) / sh.evict);
      sh.x += nx * stepLen;
      sh.z += nz * stepLen;
      sh.evict--;
      this.setShadeY(sh);
    }

    // 7. pulse
    if (p.dead === 0 && e.pulse && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
      p.carried -= T.pulse_cost;
      p.pulseCd = sec(T.pulse_cooldown_s);
      const cy = p.y + W.pulse_center_dy, stunned = [];
      const inR = (o) => Math.hypot(o.x - p.x, o.y - cy, o.z - p.z) <= T.pulse_radius;
      for (const sh of [...this.shades].sort(byId)) {
        if (!inR(sh)) continue;
        const d = hd(sh.x, sh.z, p.x, p.z);
        this.score += sh.state === "drain" ? T.score.per_stun_draining : T.score.per_stun;
        sh.state = "stunned";
        sh.left = sec(T.pulse_stun_s);
        sh.push = { dx: d > 1e-9 ? (sh.x - p.x) / d : 1, dz: d > 1e-9 ? (sh.z - p.z) / d : 0, left: W.pulse_push_ticks, per: T.pulse_push_m / W.pulse_push_ticks };
        stunned.push(sh.id);
      }
      for (const dr of [...this.drifters].sort(byId)) {
        if (!inR(dr)) continue;
        if (dr.state === "chase") { dr.state = "flee"; dr.left = W.drifter_flee_ticks; }
        else if (dr.state === "flee" && dr.stolen > 0) {
          const amount = dr.stolen;
          for (let i = 0; i < amount; i++) this.addMote(r3(dr.x), this.groundAt(dr.x, dr.z) ?? 0, r3(dr.z), "dropped", W.drop_ttl);
          dr.stolen = 0;
          dr.left = W.drifter_drop_vanish;
          this.emit("drifter_drop", { drifter_id: dr.id, amount });
        }
      }
      this.emit("pulse", { stunned_ids: stunned });
    }

    // 8. move shades and drifters
    for (const sh of this.shades) this.moveShade(sh);
    for (const dr of this.drifters) this.moveDrifter(dr);

    // 9. contact: drifters steal first, then shades hit (ascending id)
    if (p.dead === 0 && !this.bench) {
      for (const dr of [...this.drifters].sort(byId)) {
        if (dr.state !== "chase" || dr.used || p.carried <= 0) continue;
        if (hd(dr.x, dr.z, p.x, p.z) <= W.drifter_steal_r) {
          const amount = Math.min(W.drifter_steal_max, p.carried);
          p.carried -= amount;
          dr.stolen = amount;
          dr.used = true;
          dr.state = "flee";
          dr.left = W.drifter_flee_ticks;
          this.emit("drifter_steal", { drifter_id: dr.id, amount, carried: p.carried });
        }
      }
      for (const sh of [...this.shades].sort(byId)) {
        if (sh.state !== "wander" && sh.state !== "chase") continue;
        if (sh.evict > 0) continue;
        if (hd(sh.x, sh.z, p.x, p.z) > T.shade_hit_radius || Math.abs(sh.y - p.y) > W.hit_dy) continue;
        if (p.invuln > 0) continue; // touching an invulnerable Mây does nothing
        p.flames--;
        const dropped = Math.floor(p.carried * T.hit_drop_ratio);
        p.carried -= dropped;
        this.dropMotes(dropped, p.x, p.z, p.y);
        p.invuln = sec(T.invuln_s);
        const d = hd(sh.x, sh.z, p.x, p.z);
        sh.state = "recoil";
        sh.left = W.recoil_ticks;
        sh.push = { dx: d > 1e-9 ? (sh.x - p.x) / d : 1, dz: d > 1e-9 ? (sh.z - p.z) / d : 0, left: W.recoil_ticks, per: W.recoil_m / W.recoil_ticks };
        this.emit("player_hit", { by: "shade", flames: p.flames, dropped });
        break; // at most one flame lost per tick
      }
    }

    // 10. scheduled spawns (new entities interact from the next tick)
    const st = this.simTick;
    if (this.randomMotes && st % W.mote_every === 0 && this.motes.length < W.mote_cap) {
      const used = new Set(this.motes.filter((m) => m.point >= 0).map((m) => m.point));
      const free = N.motePoints.map((_, i) => i).filter((i) => !used.has(i));
      if (free.length) { const i = free[Math.floor(this.rng() * free.length)]; const [x, y, z] = N.motePoints[i]; this.addMote(x, y, z, "random", null, undefined, i); }
    }
    if (this.randomShades && st >= W.shade_first_spawn && (st - W.shade_first_spawn) % N.shadeEvery === 0) {
      const n = st === W.shade_first_spawn ? W.shade_first_count : 1;
      for (let k = 0; k < n && this.shades.length < N.shadeMax; k++) {
        const ok = N.shadePoints.filter(([x, , z]) => hd(x, z, p.x, p.z) >= W.shade_min_player_dist && !this.litSafe(x, z) && !this.shades.some((s) => hd(s.x, s.z, x, z) < 0.5));
        if (!ok.length) break;
        const [x, , z] = ok[Math.floor(this.rng() * ok.length)];
        const sh = this.addShade(x, z, undefined, "spawning", W.shade_spawning_ticks);
        this.emit("shade_spawned", { id: sh.id });
      }
    }
    if (this.randomDrifters && st % W.drifter_every === 0 && this.drifters.filter((d) => d.state !== "removed").length < W.drifter_max) {
      const [x, , z] = N.shadePoints[Math.floor(this.rng() * N.shadePoints.length)];
      this.addDrifter(x, z, undefined, "idle");
    }
    if (this.windEnabled && st % W.wind_every === 0) this.wind = { active: true, dir: Math.floor(this.rng() * 360), ticks: W.wind_ticks };

    // 11. win / lose
    if (this.bench) return this.events;
    // Ticket-03: no early win. Flames first, then dawn: won if lit lanterns >= ceil(0.6 * total)
    if (p.flames <= 0) return this.finish("lost", "no_flames");
    if (this.timeStart - st / R <= 1e-9) {
      const lit = this.lanterns.filter((L) => L.lit).length;
      return lit >= this.litNeeded ? this.finish("won", "dawn_survived") : this.finish("lost", "dawn");
    }
    return this.events;
  }

  movePlayer(e) {
    const p = this.player, N = this.N;
    // horizontal intent
    let [mx, mz] = this.held.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = (this.held.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th), wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const moving = Math.hypot(wx, wz) > 1e-6;
    if (moving) { const l = Math.hypot(wx, wz); p.facing = [wx / l, wz / l]; }
    // dash (edge; ignored while dashing; no cooldown with the Wind charm)
    if (e.dash && p.dashLeft === 0 && (p.dashCd === 0 || p.charm > 0)) {
      p.dashLeft = sec(T.dash_duration_s);
      p.dashCd = p.charm > 0 ? 0 : sec(T.dash_cooldown_s);
      p.dashDir = moving ? [wx / Math.hypot(wx, wz), wz / Math.hypot(wx, wz)] : p.facing.slice();
      this.emit("dash");
    }
    let vx, vz;
    if (p.dashLeft > 0) { vx = p.dashDir[0] * T.dash_speed; vz = p.dashDir[1] * T.dash_speed; }
    else if (p.launched) { [vx, vz] = p.launched; }
    else { vx = wx * this.speed; vz = wz * this.speed; }
    if (this.wind.active) { const a = (this.wind.dir * Math.PI) / 180; vx += Math.cos(a) * W.wind_speed; vz += Math.sin(a) * W.wind_speed; }
    // jump
    if (e.jump && p.grounded) { p.vy = W.jump_speed; p.grounded = false; }
    // horizontal move with walls (ledges higher than step_height and the bell tower block)
    const blocked = (x, z) => {
      if (this.inTower(x, z, 0.3) && p.y < N.tower?.top) return true;
      const g = this.groundAt(x, z);
      return g !== null && g > p.y + W.step_height;
    };
    const nx = p.x + vx * DT, nz = p.z + vz * DT;
    if (!blocked(nx, nz)) { p.x = nx; p.z = nz; }
    else if (!blocked(nx, p.z)) p.x = nx;
    else if (!blocked(p.x, nz)) p.z = nz;
    // vertical
    const g = this.groundAt(p.x, p.z);
    if (p.dashLeft > 0) {
      p.dashLeft--;
      if (!p.grounded) p.vy = 0; // air dash keeps height
      else if (g !== null && p.y - g <= W.step_height) p.y = g; // follow ramps
      else p.grounded = false;
    } else if (p.grounded) {
      if (g !== null && p.y - g <= W.step_height && p.y - g >= -W.step_height) p.y = g;
      else p.grounded = false;
    } else {
      p.vy -= W.gravity * DT;
      p.y += p.vy * DT;
      if (g !== null && p.y <= g && p.vy <= 0 && p.y >= g - W.step_height - 1) { p.y = g; p.vy = 0; p.grounded = true; p.launched = null; }
    }
    p.vx = vx; p.vz = vz;
    // jump pads
    if (p.grounded) {
      for (const pad of N.pads) {
        if (hd(p.x, p.z, pad.x, pad.z) <= 1 && Math.abs(p.y - pad.y) < 0.05) {
          let dx, dz;
          if (pad.to) { const d = hd(pad.to[0], pad.to[1], p.x, p.z); dx = (pad.to[0] - p.x) / d; dz = (pad.to[1] - p.z) / d; }
          else [dx, dz] = pad.dir;
          p.launched = [dx * pad.h, dz * pad.h];
          [p.vx, p.vz] = p.launched;
          p.vy = pad.vy;
          p.grounded = false;
          break;
        }
      }
    }
    // fall off the island
    if (p.y < W.fall_y) {
      p.flames--;
      const lost = p.carried;
      p.carried = 0;
      p.dead = W.respawn_wait_ticks;
      p.vx = p.vy = p.vz = 0;
      p.launched = null;
      p.dashLeft = 0;
      this.emit("player_hit", { by: "fall", flames: p.flames, dropped: 0, lost });
    }
  }

  setShadeY(sh) { const g = this.groundAt(sh.x, sh.z); if (g !== null) sh.y = g + W.shade_height; }

  // move a floating entity by (dx,dz) unless that leaves the island, enters the tower, or (shades) a lit safe zone
  tryMove(o, dx, dz, isShade) {
    const nx = o.x + dx, nz = o.z + dz;
    if (!this.floatOk(nx, nz)) return false;
    if (isShade && this.litSafe(nx, nz)) {
      // blocked at the 6 m edge of the lit lantern
      for (const L of this.lanterns) {
        if (!L.lit) continue;
        const d = hd(nx, nz, L.x, L.z);
        if (d <= T.safe_radius) {
          const ux = d > 1e-9 ? (nx - L.x) / d : 1, uz = d > 1e-9 ? (nz - L.z) / d : 0;
          const ex = L.x + ux * (T.safe_radius + 1e-3), ez = L.z + uz * (T.safe_radius + 1e-3);
          if (this.floatOk(ex, ez) && !this.litSafe(ex, ez)) { o.x = ex; o.z = ez; }
          return false;
        }
      }
    }
    o.x = nx;
    o.z = nz;
    return true;
  }

  moveShade(sh) {
    const p = this.player;
    if (sh.state === "spawning") { if (sh.left === 0) sh.state = "wander"; else return; }
    if (sh.state === "stunned" || sh.state === "recoil") {
      if (sh.push && sh.push.left > 0) {
        if (this.tryMove(sh, sh.push.dx * sh.push.per, sh.push.dz * sh.push.per, true)) sh.push.left--;
        else sh.push.left = 0; // stop at obstacles
        this.setShadeY(sh);
      }
      if (sh.left > 0) return;
      sh.state = "wander";
      sh.push = null;
    }
    if (sh.evict > 0) return;
    const d = hd(sh.x, sh.z, p.x, p.z);
    if (sh.state === "drain") {
      const L = this.lanterns.find((q) => q.id === sh.target);
      if (p.dead === 0 && d <= T.safe_radius) sh.state = "chase";
      else if (!L || !L.lit || L.fuel >= LOW || hd(sh.x, sh.z, L.x, L.z) > W.drain_reach) sh.state = "wander";
      else return; // drains standing still
    }
    if (p.dead > 0) { if (sh.state === "chase") sh.state = "wander"; }
    else if (sh.state === "wander" && d <= W.shade_detect && !this.bench) sh.state = "chase"; // bench: shades keep wandering
    else if (sh.state === "chase" && d > W.shade_lose) sh.state = "wander";
    let tx, tz, speed;
    const nearestL = (pred) => this.lanterns.filter(pred).sort((a, b) => hd(sh.x, sh.z, a.x, a.z) - hd(sh.x, sh.z, b.x, b.z) || idNum(a.id) - idNum(b.id))[0];
    const weak = sh.state === "wander" ? nearestL((L) => L.lit && L.fuel < LOW) : null;
    const dark = sh.state === "wander" && !weak ? nearestL((L) => !L.lit) : null;
    if (sh.state === "chase") { tx = p.x; tz = p.z; speed = this.N.shadeSpeed; }
    else if (weak) {
      sh.target = weak.id;
      if (hd(sh.x, sh.z, weak.x, weak.z) <= W.drain_reach) { sh.state = "drain"; sh.drainT = 0; return; }
      tx = weak.x; tz = weak.z; speed = W.shade_wander_speed;
    } else if (dark) {
      sh.target = dark.id;
      if (hd(sh.x, sh.z, dark.x, dark.z) <= W.drain_reach) return; // loiters at the dark lantern
      tx = dark.x; tz = dark.z; speed = W.shade_wander_speed;
    } else {
      if (hd(sh.x, sh.z, sh.wx, sh.wz) < 0.5) {
        const a = this.rng() * Math.PI * 2, r = 2 + this.rng() * 6;
        const cx = sh.x + Math.cos(a) * r, cz = sh.z + Math.sin(a) * r;
        if (this.floatOk(cx, cz)) { sh.wx = cx; sh.wz = cz; }
      }
      tx = sh.wx; tz = sh.wz; speed = W.shade_wander_speed;
    }
    const dt = hd(sh.x, sh.z, tx, tz);
    if (dt > 1e-9) {
      const s = Math.min(dt, speed * DT);
      if (!this.tryMove(sh, ((tx - sh.x) / dt) * s, ((tz - sh.z) / dt) * s, true)) { sh.wx = sh.x; sh.wz = sh.z; }
    }
    this.setShadeY(sh);
  }

  moveDrifter(dr) {
    const p = this.player;
    if (dr.state === "removed") return;
    if (dr.state === "flee") {
      if (dr.left === 0) { dr.state = "removed"; dr.stolen = 0; return; }
      const d = hd(dr.x, dr.z, p.x, p.z);
      const ux = d > 1e-9 ? (dr.x - p.x) / d : 1, uz = d > 1e-9 ? (dr.z - p.z) / d : 0;
      dr.x += ux * W.drifter_speed * DT; // drifters fly: they may leave the island while fleeing
      dr.z += uz * W.drifter_speed * DT;
      return;
    }
    const d = hd(dr.x, dr.z, p.x, p.z);
    const want = !dr.used && p.dead === 0 && p.carried >= W.drifter_trigger_carried && d <= W.drifter_trigger_dist;
    dr.state = want ? "chase" : "idle";
    let tx = dr.wx, tz = dr.wz, speed = W.drifter_idle_speed;
    if (dr.state === "chase") { tx = p.x; tz = p.z; speed = W.drifter_speed; }
    else if (hd(dr.x, dr.z, dr.wx, dr.wz) < 0.5) {
      const pts = this.N.shadePoints;
      const [x, , z] = pts[Math.floor(this.rng() * pts.length)];
      dr.wx = x; dr.wz = z; tx = x; tz = z;
    }
    const dt = hd(dr.x, dr.z, tx, tz);
    if (dt > 1e-9) { const s = Math.min(dt, speed * DT); this.tryMove(dr, ((tx - dr.x) / dt) * s, ((tz - dr.z) / dt) * s, false); }
    const g = this.groundAt(dr.x, dr.z);
    if (g !== null) dr.y = g + W.drifter_height;
  }

  finish(result, reason) {
    this.state = result;
    this.result = { result, reason };
    if (result === "won") {
      for (const L of this.lanterns) if (L.lit) this.score += T.score.per_lit_lantern_at_dawn + Math.floor(L.fuel / FU) * T.score.per_fuel_at_dawn;
      this.score += this.player.flames * T.score.per_flame_left;
    }
    this.emit("game_over", { result, reason });
    return this.events;
  }

  get litNeeded() { return Math.ceil(T.win_ratio * this.lanterns.length - 1e-9); }
  fuelOf(L) { return L.fuel / FU; }
  isStunned(sh) { return sh.state === "stunned"; }

  snapshot() {
    const p = this.player;
    return {
      type: "snapshot",
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: r3(this.timeLeft),
      score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.dir },
      player: {
        pos: [r3(p.x), r3(p.y), r3(p.z)], vel: [r3(p.vx), r3(p.vy), r3(p.vz)], grounded: p.grounded,
        flames: p.flames, carried: p.carried, invuln: p.invuln > 0,
        dash_cd_s: r3(p.dashCd / R), pulse_cd_s: r3(p.pulseCd / R), charm_s: r3(p.charm / R), capacity: this.capacity,
      },
      lanterns: this.lanterns.map((L) => ({ id: L.id, pos: [r3(L.x), r3(L.y), r3(L.z)], lit: L.lit, deposited: L.deposited, fuel: r1(L.lit ? L.fuel / FU : 0), ever_lit: L.everLit, relit_count: L.relit })),
      shades: this.shades.map((s) => ({ id: s.id, pos: [r3(s.x), r3(s.y), r3(s.z)], state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: [r3(m.x), r3(m.y), r3(m.z)], kind: m.kind, ttl_s: m.ttl === null ? null : r3(m.ttl / R) })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: [r3(d.x), r3(d.y), r3(d.z)], state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: r3(c.respawn / R) })),
    };
  }
}
