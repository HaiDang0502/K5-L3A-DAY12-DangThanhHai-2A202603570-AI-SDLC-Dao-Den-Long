// Đảo Đèn Lồng — browser front-end. Rules live only in ../sim; this file renders sim state, turns
// keyboard/mouse into contract-style input frames (60 fixed ticks/s) and runs menus / 3-night flow.
import * as THREE from "three";
import { Sim, makeRng } from "../sim/sim.js";
import { NIGHTS } from "../sim/maps.js";
import { TUNING as T, WORLD as W } from "../sim/tuning.js";
import { Sfx } from "./sfx.js";
import { benchSim, frameStats } from "../sim/bench.js";
import { insertEntry, isoWithZone, NAME_RE } from "../leaderboard.js";
import { REVISION } from "three";

// ---------- standard palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lit: 0xffb347, core: 0xffe9b0, off: 0x5b5f6e, mote: 0xfff6c2, moteGlow: 0xffe58a,
  shade: 0x120a1a, rim: 0x7a3cff, rimCB: 0x00b3ff, stunned: 0x3a3450, shirt: 0xe8e2d0, red: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const STORY = {
  1: "Ông Đăng: “Sương đen đã nuốt Đảo Bến. Con hãy gom đom đóm, thắp lại năm chiếc đèn trước khi trời sáng.”",
  2: "Ông Đăng: “Đảo Cau có hai hòn nối bằng cây cầu tre. Cẩn thận Gió Lạc — chúng thích cướp đom đóm của người mang nhiều.”",
  3: "Ông Đăng: “Đảo Chuông cao ba tầng, gió mạnh thổi từng cơn. Thắp đủ bảy đèn, tiếng chuông sẽ gọi bình minh về.”",
};

const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.fog, 30, 140);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
const ambient = new THREE.AmbientLight(0xb8c4ff, 0.15);
const moon = new THREE.DirectionalLight(0x9fa8ff, 0.5);
moon.position.set(-30, 60, -20);
scene.add(ambient, moon);

// ---------- settings (persisted) ----------
const DEFAULT_KEYS = { up: "w", down: "s", left: "a", right: "d", jump: " ", dash: "shift", interact: "e", pulse: "f", pause: "p" };
const ACTION_NAMES = { up: "Đi lên", down: "Đi xuống", left: "Sang trái", right: "Sang phải", jump: "Nhảy", dash: "Lướt", interact: "Tương tác / nạp đèn", pulse: "Tỏa Sáng", pause: "Tạm dừng" };
const keyLabel = (k) => ({ " ": "Space", shift: "Shift", control: "Ctrl", alt: "Alt", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", escape: "Esc" }[k] ?? k.toUpperCase());
// cb = colour-blind palette, reduce = reduced motion, big = large text (x1.25); all persisted
const settings = { volume: 0.7, sens: 1, cb: false, reduce: false, big: false, keys: { ...DEFAULT_KEYS } };
try { const saved = JSON.parse(localStorage.getItem("ddl-settings") || "{}"); Object.assign(settings, saved, { keys: { ...DEFAULT_KEYS, ...(saved.keys || {}) } }); } catch {}
const saveSettings = () => { try { localStorage.setItem("ddl-settings", JSON.stringify(settings)); } catch {} };
const sfx = new Sfx();
sfx.setVolume(settings.volume);
const applyCB = () => {
  document.body.classList.toggle("cb", !!settings.cb);
  document.body.classList.toggle("reduce", !!settings.reduce);
  document.documentElement.classList.toggle("big", !!settings.big);
  const kd = document.getElementById("k-dash"), kp = document.getElementById("k-pulse");
  if (kd) kd.textContent = keyLabel(settings.keys.dash);
  if (kp) kp.textContent = keyLabel(settings.keys.pulse);
};
applyCB();

// ---------- shared materials / geometry ----------
const M = {
  grass: new THREE.MeshLambertMaterial({ color: C.grass }),
  sand: new THREE.MeshLambertMaterial({ color: C.sand }),
  wood: new THREE.MeshLambertMaterial({ color: C.wood }),
  cliff: new THREE.MeshLambertMaterial({ color: 0x3b3a4a }),
  sea: new THREE.MeshBasicMaterial({ color: C.sea }),
  pad: new THREE.MeshBasicMaterial({ color: C.gold }),
  stone: new THREE.MeshLambertMaterial({ color: 0x6d6a78 }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x24493f }),
};
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,246,194,1)");
  g.addColorStop(0.35, "rgba(255,229,138,0.6)");
  g.addColorStop(1, "rgba(255,229,138,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: C.moteGlow });
const moteGeo = new THREE.SphereGeometry(0.12, 8, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: C.mote });
function moteMesh(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat));
  const s = new THREE.Sprite(glowMat);
  s.scale.setScalar(1.2 * scale);
  g.add(s);
  return g;
}

// ---------- world building per night ----------
let world = null;
function disk(r, y, mat, cx = 0, cz = 0, depth = 10) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 64), mat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, y + 0.001, cz);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, depth, 64, 1, true), M.cliff);
  side.position.set(cx, y - depth / 2, cz);
  g.add(top, side);
  return g;
}
function trees(g, rng, n, okFn) {
  const geo = new THREE.ConeGeometry(1, 3, 6);
  geo.translate(0, 2.2, 0);
  const im = new THREE.InstancedMesh(geo, M.leaf, n);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let tries = 0; tries < n * 10 && k < n; tries++) {
    const x = (rng() - 0.5) * 180, z = (rng() - 0.5) * 120;
    const y = okFn(x, z);
    if (y === null) continue;
    const s = 0.7 + rng() * 0.6;
    m4.makeScale(s, s, s).setPosition(x, y, z);
    im.setMatrixAt(k++, m4);
  }
  im.count = k;
  g.add(im);
}
function buildWorld(night, sim) {
  if (world) scene.remove(world);
  const g = new THREE.Group();
  const N = NIGHTS[night], rng = makeRng(night * 101);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 32), M.sea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -9;
  g.add(sea);
  if (night === 1) {
    g.add(disk(40, 0, M.grass));
    const beach = new THREE.Mesh(new THREE.RingGeometry(37.5, 40, 64), M.sand);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.01;
    g.add(beach);
  } else if (night === 2) {
    g.add(disk(28, 0, M.grass, 0, 0), disk(28, 0, M.grass, 70, 0));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), M.wood);
    bridge.position.set(35, -0.14, 0);
    g.add(bridge);
    const plankM = new THREE.MeshLambertMaterial({ color: 0x4d331f });
    for (let x = 26.5; x <= 44; x += 1.5) { const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 4.1), plankM); plank.position.set(x, -0.12, 0); g.add(plank); }
  } else {
    g.add(disk(45, 0, M.grass));
    const ringTop = new THREE.Mesh(new THREE.RingGeometry(12, 24, 48, 1, Math.PI, Math.PI), M.grass);
    ringTop.rotation.x = -Math.PI / 2;
    ringTop.position.y = 3.001;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 3, 48, 1, true, -Math.PI / 2, Math.PI), M.cliff);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 3, 32, 1, true, -Math.PI / 2, Math.PI), M.cliff);
    outer.position.y = inner.position.y = 1.5;
    for (const sx of [-1, 1]) { const end = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.2), M.cliff); end.position.set(sx * 18, 1.5, 0.1); g.add(end); }
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40), M.cliff);
    t2.position.y = 3;
    const t2top = new THREE.Mesh(new THREE.CircleGeometry(8, 40), M.sand);
    t2top.rotation.x = -Math.PI / 2;
    t2top.position.y = 6.002;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 16), M.stone);
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 16), new THREE.MeshLambertMaterial({ color: C.red }));
    roof.position.y = 15.2;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), new THREE.MeshLambertMaterial({ color: C.gold }));
    bell.position.y = 13.2;
    g.add(ringTop, outer, inner, t2, t2top, tower, roof, bell);
    for (const a of [30, 150]) {
      const th = (a * Math.PI) / 180, len = Math.hypot(6, 3);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 3), M.wood);
      ramp.position.set(27 * Math.cos(th), 1.5, 27 * Math.sin(th));
      ramp.rotation.y = -th;
      ramp.rotateZ(Math.atan2(3, 6));
      g.add(ramp);
    }
  }
  for (const pad of N.pads) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), M.pad);
    m.position.set(pad.x, pad.y + 0.06, pad.z);
    g.add(m);
  }
  const free = (x, z) => {
    const y = N.ground(x, z);
    if (y === null || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => N.ground(x + a, z + b) !== y)) return null;
    if (sim.lanterns.some((L) => Math.hypot(L.x - x, L.z - z) < 5)) return null;
    if (N.motePoints.some(([mx, , mz]) => Math.hypot(mx - x, mz - z) < 2)) return null;
    if (Math.hypot(x - N.start[0], z - N.start[2]) < 4 || (night === 3 && Math.hypot(x, z) < 10)) return null;
    return y;
  };
  trees(g, rng, night === 2 ? 50 : 60, free);
  world = g;
  scene.add(g);
}

// ---------- lanterns ----------
function buildLantern(L) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 4.6, 8), M.wood);
  post.position.y = 2.3;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.16), M.wood);
  arm.position.set(0.7, 4.6, 0);
  const paper = new THREE.MeshBasicMaterial({ color: C.off });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), paper);
  lamp.scale.set(1, 1.25, 1);
  lamp.position.set(1.4, 3.8, 0);
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.05), new THREE.MeshBasicMaterial({ color: 0x1a1a22 }));
  tear.position.set(1.4 + 0.25, 3.8, 0.58);
  tear.rotation.z = 0.5;
  const fuelBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x222233, side: THREE.DoubleSide }));
  const fuelFg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: C.lit, side: THREE.DoubleSide }));
  const fuelBar = new THREE.Group();
  fuelFg.position.z = 0.01;
  fuelBar.add(fuelBg, fuelFg);
  fuelBar.position.set(1.4, 5.3, 0);
  const coreM = new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), coreM);
  core.position.copy(lamp.position);
  const light = new THREE.PointLight(C.lit, 0, 22, 1.5);
  light.position.copy(lamp.position);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const safe = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 56), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0 }));
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.03;
  g.add(post, arm, lamp, core, light, ring, safe, tear, fuelBar);
  g.position.set(L.x, L.y, L.z);
  world.add(g);
  return { g, paper, coreM, light, ring, safe, shown: -1, lamp, tear, fuelBar, fuelFg };
}

// ---------- Mây ----------
const player = new THREE.Group();
const carryGroup = new THREE.Group();
let hatLight;
{
  const shirt = new THREE.MeshLambertMaterial({ color: C.shirt });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.0, 12), shirt);
  body.position.y = 0.65;
  const scarfM = new THREE.MeshLambertMaterial({ color: C.red });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 16), scarfM);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.15;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.04), scarfM);
  tail.position.set(0.12, 0.95, -0.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf2c9a0 }));
  head.position.y = 1.4;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 20), new THREE.MeshLambertMaterial({ color: 0xe3c77e, emissive: 0x3a2e14 }));
  hat.position.y = 1.74;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  string.position.set(0.55, 1.37, 0.25);
  const mini = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: C.lit }));
  mini.scale.y = 1.3;
  mini.position.set(0.55, 1.14, 0.25);
  hatLight = new THREE.PointLight(C.lit, 4, 10, 1.6);
  hatLight.position.copy(mini.position);
  player.add(body, scarf, tail, head, hat, string, mini, hatLight, carryGroup);
  scene.add(player);
}

// ---------- shades, drifters, charms ----------
const shadeGeo = new THREE.SphereGeometry(0.7, 14, 10);
const shadeTail = new THREE.ConeGeometry(0.55, 1.1, 12);
const rimGeo = new THREE.SphereGeometry(0.78, 14, 10);
function buildShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: C.shade });
  const body = new THREE.Mesh(shadeGeo, mat);
  body.scale.y = 1.15;
  const tail = new THREE.Mesh(shadeTail, mat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.8;
  const rimM = new THREE.MeshBasicMaterial({ color: C.rim, side: THREE.BackSide, transparent: true, opacity: 0.7 });
  const rim = new THREE.Mesh(rimGeo, rimM);
  rim.scale.y = 1.15;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xd9c4ff });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeM), e2 = e1.clone();
  e1.position.set(-0.2, 0.2, 0.6);
  e2.position.set(0.2, 0.2, 0.6);
  g.add(body, tail, rim, e1, e2);
  scene.add(g);
  return { g, mat, rimM, eyeM };
}
function buildDrifter() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: C.drifter, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const geo = new THREE.PlaneGeometry(3, 0.35, 16, 1);
  const ribbon = new THREE.Mesh(geo, mat);
  const loot = new THREE.Group();
  g.add(ribbon, loot);
  scene.add(g);
  return { g, ribbon, base: geo.attributes.position.array.slice(), loot };
}
function buildCharm() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.05), new THREE.MeshBasicMaterial({ color: C.red }));
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.02, 0.03), new THREE.MeshBasicMaterial({ color: C.gold }));
  g.add(border, card);
  world.add(g);
  return g;
}

// pulse ring + wind leaves + sky lanterns (visual only)
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseT = -1;
const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 0.12), new THREE.MeshBasicMaterial({ color: 0x9fbf6a, side: THREE.DoubleSide }), 120);
leaves.visible = false;
scene.add(leaves);
const skyLanterns = [];
const skyMat = new THREE.MeshBasicMaterial({ color: C.lit });
function releaseSkyLanterns(x, y, z) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 8), skyMat);
    m.position.set(x + (Math.random() - 0.5) * 3, y + 4 + Math.random() * 2, z + (Math.random() - 0.5) * 3);
    m.userData = { vy: 1 + Math.random() * 0.8, sway: Math.random() * 6, life: 12 };
    scene.add(m);
    skyLanterns.push(m);
  }
}

// ---------- game flow ----------
const q = new URLSearchParams(location.search);
let sim = null, night = 1, mode = "menu", totalScore = 0, introNight = 1;
const nightScores = {};
const views = { lanterns: new Map(), motes: new Map(), shades: new Map(), drifters: new Map(), charms: new Map() };
let camYaw = 0, camPitch = 0.42, camDist = 9, acc = 0, last = performance.now();
const CAM_MIN = 4, CAM_MAX = 22;
const keys = new Set();
const pending = { jump: false, interact: false, pulse: false, dash: false, pause: false };
let lastCountdown = -1, windWarned = false;

function clearViews() {
  for (const m of Object.values(views)) {
    for (const v of m.values()) { const o = v.g ?? v; o.parent?.remove(o); }
    m.clear();
  }
  for (const s of skyLanterns.splice(0)) scene.remove(s);
}

function startNight(n) {
  night = n;
  clearViews();
  const seed = Number(q.get("seed")) || (Date.now() & 0x7fffffff);
  const lit = Math.min(NIGHTS[n].lanterns.length - 1, Number(q.get("lit")) || 0);
  sim = new Sim({ seed, night: n, scenario: lit ? { lanterns: Array.from({ length: lit }, (_, i) => ({ id: "L" + (i + 1), lit: true })) } : {} });
  buildWorld(n, sim);
  for (const L of sim.lanterns) views.lanterns.set(L.id, buildLantern(L));
  camYaw = n === 3 ? 0 : 0;
  lastCountdown = -1;
  mode = "play";
  hideOverlay();
  $("hud").classList.remove("hidden");
  sfx.startMusic();
  if (n === 1 || !sessionSeed) { sessionSeed = seed; savedThisRun = false; }
  window.__game = { sim, night: n, seed };
}

// ---------- overlay screens ----------
function showCard(html) { $("card").innerHTML = html; $("overlay").classList.remove("hidden"); }
function hideOverlay() { $("overlay").classList.add("hidden"); }
const CONTROLS = () => { const k = (a) => keyLabel(settings.keys[a]); return `<table class="keys">
  <tr><td>${k("up")} ${k("left")} ${k("down")} ${k("right")}</td><td>Di chuyển theo camera</td></tr>
  <tr><td>Di chuột / Z C</td><td>Xoay camera (bấm vào màn chơi để khóa chuột)</td></tr>
  <tr><td>Cuộn chuột</td><td>Camera xa / gần</td></tr>
  <tr><td>${k("jump")}</td><td>Nhảy</td></tr><tr><td>${k("dash")}</td><td>Lướt</td></tr>
  <tr><td>${k("interact")}</td><td>Nạp ánh sáng / châm dầu</td></tr>
  <tr><td>${k("pulse")} / chuột phải</td><td>Tỏa Sáng (3 đom đóm)</td></tr>
  <tr><td>Esc / ${k("pause")}</td><td>Tạm dừng</td></tr></table>`; };
function menu() {
  mode = "menu";
  $("hud").classList.add("hidden");
  showCard(`<h1>Đảo Đèn Lồng</h1><p class="sub">Ba hòn đảo · ba đêm</p>
  <p>Giúp Mây gom đom đóm, giữ các Đèn Lồng Lớn sáng tới bình minh và né Bóng Mực trong sương đen.</p>${CONTROLS()}
  <div class="btns"><button class="btn" data-a="new">Chơi từ Đêm 1 (Enter)</button><button class="btn ghost" data-a="night2">Đêm 2</button><button class="btn ghost" data-a="night3">Đêm 3</button><button class="btn ghost" data-a="board">Bảng xếp hạng</button><button class="btn ghost" data-a="settings">Cài đặt</button></div>`);
}
function intro(n) {
  mode = "intro";
  introNight = n;
  $("hud").classList.add("hidden");
  const N = NIGHTS[n];
  showCard(`<h2>Đêm ${n} – ${N.name}</h2><p class="sub">${N.lanterns.length} Đèn Lồng Lớn · ${N.duration_s} giây · giữ ít nhất ${Math.ceil(T.win_ratio * N.lanterns.length - 1e-9)} đèn sáng tới bình minh</p>
  <p class="quote">${STORY[n]}</p><div class="btns"><button class="btn" data-a="go">Bắt đầu (Enter)</button></div>`);
}
function result() {
  const won = sim.state === "won";
  mode = "result";
  if (won) nightScores[night] = sim.score;
  totalScore = Object.values(nightScores).reduce((a, b) => a + b, 0);
  const why = { dawn_survived: "Mây đã giữ đảo sáng tới bình minh!", dawn: "Bình minh đến mà đảo chưa đủ đèn sáng.", no_flames: "Mây đã hết Ngọn Lửa." }[sim.result.reason];
  if (won) sfx.win(); else sfx.lose();
  sfx.stopMusic();
  if (won && night === 3) {
    mode = "dawn";
    setTimeout(() => showCard(`<h1>Bình Minh</h1><p>Tiếng chuông Đảo Chuông vang lên, ba hòn đảo bừng sáng.</p>
    <p class="sub">Đêm 1: ${nightScores[1] ?? 0} · Đêm 2: ${nightScores[2] ?? 0} · Đêm 3: ${nightScores[3] ?? 0}</p>
    <h2>Tổng điểm: ${totalScore}</h2>${saveForm()}<div class="btns"><button class="btn ghost" data-a="board">Bảng xếp hạng</button><button class="btn ghost" data-a="menu">Về menu</button></div>`), 900);
    return;
  }
  setTimeout(() => showCard(`<h2>${won ? "Thắng" : "Thua"} – Đêm ${night}</h2><p>${why}</p><p>Điểm đêm này: <b>${sim.score}</b>${won ? "" : " (chỉ đêm thắng được cộng)"} · Tổng: <b>${totalScore}</b></p>
  ${won ? "" : saveForm()}<div class="btns">${won ? `<button class="btn" data-a="next">Đêm ${night + 1} (Enter)</button>` : `<button class="btn" data-a="retry">Chơi lại Đêm ${night} (Enter)</button>`}<button class="btn ghost" data-a="menu">Về menu</button></div>`), 900);
}
function pauseMenu() {
  showCard(`<h2>Tạm dừng</h2><div class="btns"><button class="btn" data-a="resume">Tiếp tục</button><button class="btn ghost" data-a="retry">Chơi lại Đêm</button>
  <button class="btn ghost" data-a="settings">Cài đặt</button><button class="btn ghost" data-a="menu">Về menu</button></div>`);
}
function settingsCard() {
  showCard(`<h2>Cài đặt</h2>
  <label class="set">Âm lượng <input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
  <label class="set">Độ nhạy chuột <input id="sens" type="range" min="0.2" max="3" step="0.1" value="${settings.sens}"></label>
  <label class="set">Bảng màu dễ phân biệt (mù màu) <input id="cb" type="checkbox" ${settings.cb ? "checked" : ""}></label>
  <label class="set">Giảm chuyển động (tắt rung camera, chớp màn hình) <input id="reduce" type="checkbox" ${settings.reduce ? "checked" : ""}></label>
  <label class="set">Chữ lớn (×1.25) <input id="big" type="checkbox" ${settings.big ? "checked" : ""}></label>
  <div class="btns"><button class="btn ghost" data-a="keys">Đổi phím</button><button class="btn" data-a="back">Xong</button></div>`);
  $("reduce").onchange = (e) => { settings.reduce = e.target.checked; saveSettings(); applyCB(); };
  $("big").onchange = (e) => { settings.big = e.target.checked; saveSettings(); applyCB(); };
  $("vol").oninput = (e) => { settings.volume = Number(e.target.value); sfx.setVolume(settings.volume); saveSettings(); };
  $("sens").oninput = (e) => { settings.sens = Number(e.target.value); saveSettings(); };
  $("cb").onchange = (e) => { settings.cb = e.target.checked; saveSettings(); applyCB(); };
}
$("card").addEventListener("click", (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a;
  if (!a) return;
  sfx.unlock();
  act(a);
});
function act(a) {
  if (a === "new") { for (const k in nightScores) delete nightScores[k]; totalScore = 0; intro(1); }
  else if (a.startsWith("night")) intro(Number(a.slice(5)));
  else if (a === "go") { startNight(introNight); lockPointer(); }
  else if (a === "next") intro(night + 1);
  else if (a === "retry") { sfx.stopMusic(); intro(night); }
  else if (a === "menu") { sfx.stopMusic(); unlockPointer(); sim = null; menu(); }
  else if (a === "resume") { pending.pause = true; lockPointer(); }
  else if (a === "settings") settingsCard();
  else if (a === "keys") keysCard();
  else if (a.startsWith("bind:")) { capturing = a.slice(5); keysCard(`Nhấn phím mới cho "${ACTION_NAMES[capturing]}"… (Esc để hủy)`); }
  else if (a === "keysReset") { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); applyCB(); keysCard("Đã khôi phục phím mặc định."); }
  else if (a === "board") boardCard();
  else if (a === "save") saveScore();
  else if (a === "back") { capturing = null; if (sim?.state === "paused") pauseMenu(); else if (mode === "result" || mode === "dawn") menu(); else menu(); }
}

// ---------- input ----------
let capturing = null;
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (capturing) {
    e.preventDefault();
    if (k === "escape") { capturing = null; keysCard(); return; }
    const clash = Object.entries(settings.keys).find(([a, key]) => key === k && a !== capturing);
    if (clash) { keysCard(`Phím "${keyLabel(k)}" đang dùng cho "${ACTION_NAMES[clash[0]]}". Hãy chọn phím khác.`, true); return; }
    settings.keys[capturing] = k;
    capturing = null;
    saveSettings(); applyCB(); keysCard("Đã lưu.");
    return;
  }
  if (e.target?.tagName === "INPUT") return;
  if (k === "enter") {
    sfx.unlock();
    if (mode === "menu") act("new");
    else if (mode === "intro") act("go");
    else if (mode === "result") act(sim.state === "won" ? "next" : "retry");
    return;
  }
  if (mode !== "play") return;
  const K = settings.keys;
  if (k === "escape" || k === K.pause) pending.pause = true;
  if (sim?.state === "paused") return;
  if (k === K.jump) { pending.jump = true; e.preventDefault(); }
  if (k === K.interact) pending.interact = true;
  if (k === K.pulse) pending.pulse = true;
  if (k === K.dash) pending.dash = true;
  keys.add(k);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
// Mouse look: click the game once -> pointer lock, then plain mouse movement turns the camera.
// Fallback (no pointer lock support): hold the left button and drag.
let dragging = false;
const locked = () => document.pointerLockElement === canvas;
const lockPointer = () => { if (mode === "play" && sim?.state === "playing" && !locked()) canvas.requestPointerLock?.()?.catch?.(() => {}); };
const unlockPointer = () => { if (locked()) document.exitPointerLock(); };
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 2) pending.pulse = true;
  else { dragging = true; lockPointer(); }
});
addEventListener("pointerup", () => (dragging = false));
// Esc while locked is eaten by the browser to release the lock -> treat losing the lock as "pause"
document.addEventListener("pointerlockchange", () => {
  if (!locked() && mode === "play" && sim?.state === "playing") pending.pause = true;
});
addEventListener("pointermove", (e) => {
  if (mode !== "play" || sim?.state !== "playing" || (!locked() && !dragging)) return;
  camYaw -= e.movementX * 0.005 * settings.sens;
  camPitch = Math.min(1.2, Math.max(0.12, camPitch + e.movementY * 0.004 * settings.sens));
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
// scroll wheel: zoom camera in/out (visual only, not part of the sim)
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  camDist = Math.min(CAM_MAX, Math.max(CAM_MIN, camDist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

// Screen-right maps to move.x = -1 (contract C rotation with forward = (sin yaw, cos yaw)).
function buildFrame() {
  const K = settings.keys;
  const z = (keys.has(K.up) ? 1 : 0) - (keys.has(K.down) ? 1 : 0);
  const x = (keys.has(K.left) ? 1 : 0) - (keys.has(K.right) ? 1 : 0);
  const f = { move: [x, z], cam_yaw_deg: (camYaw * 180) / Math.PI };
  for (const b of Object.keys(pending)) { f[b] = pending[b]; pending[b] = false; }
  return f;
}

// ---------- events -> effects ----------
let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1600);
}
function onEvent(ev) {
  const d = ev.data;
  switch (ev.name) {
    case "mote_picked": sfx.pickup(d.carried); break;
    case "deposit": case "refuel": sfx.deposit(); break;
    case "lantern_out": sfx.lose(); caption(`Đèn ${d.lantern_id} đã cạn dầu và tắt!`, true); break;
    case "lantern_lit": { sfx.lit(); const L = sim.lanterns.find((x) => x.id === d.lantern_id); releaseSkyLanterns(L.x, L.y, L.z); toast(d.relight ? "Đèn đã được thắp lại!" : "Một chiếc đèn đã sáng!"); break; }
    case "pulse": sfx.pulse(); pulseT = 0; pulseRing.position.set(sim.player.x, sim.player.y + 0.15, sim.player.z); break;
    case "player_hit": sfx.hit(); hitFx(); toast(d.by === "fall" ? `Rơi khỏi đảo! Mất ${d.lost} đom đóm` : d.dropped ? `Bị Bóng Mực chạm! Rơi ${d.dropped} đom đóm` : "Bị Bóng Mực chạm!"); break;
    case "shade_spawned": { sfx.shade(); caption("Bóng Mực xuất hiện!", true); const sh = sim.shades.find((x) => x.id === d.id); if (sh) shadeMark = { x: sh.x, y: sh.y, z: sh.z, until: performance.now() + 3000 }; break; }
    case "dash": sfx.dash(); break;
    case "charm_picked": sfx.charm(); toast("Bùa Gió! Chạy nhanh, lướt liên tục"); break;
    case "drifter_steal": sfx.steal(); toast(`Gió Lạc cướp ${d.amount} đom đóm!`); break;
    case "drifter_drop": toast("Gió Lạc thả lại đom đóm!"); break;
    case "paused": unlockPointer(); pauseMenu(); break;
    case "resumed": hideOverlay(); lockPointer(); break;
    case "game_over": unlockPointer(); result(); break;
  }
}
// ---------- captions (visual cues), hit feedback ----------
let shadeMark = null, shakeT = 0;
const lowFuelWarned = new Set();
function caption(text, warn = false) {
  const box = $("captions");
  const el = document.createElement("div");
  el.textContent = (warn ? "⚠ " : "") + text;
  if (warn) el.className = "warn";
  box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => el.remove(), 3500);
}
function hitFx() {
  if (settings.reduce) return; // reduced motion: no camera shake, no screen flash
  shakeT = 0.35;
  const f = $("flash");
  f.style.transition = "none"; f.style.opacity = "0.35";
  requestAnimationFrame(() => { f.style.transition = "opacity 0.3s"; f.style.opacity = "0"; });
}
// jump sound: edge seen by the UI (sim has no jump event)
function jumpSfx(f) { if (f.jump && sim.player.grounded) sfx.jump(); }

// ---------- per-frame view sync ----------
const v3 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
function syncViews(time) {
  const p = sim.player;
  player.position.set(p.x, p.y, p.z);
  player.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  player.visible = p.dead === 0 && !(p.invuln > 0 && Math.floor(time * 12) % 2 === 0);
  hatLight.intensity = 4 + Math.sin(time * 6) * 0.5;
  while (carryGroup.children.length < p.carried) carryGroup.add(moteMesh(0.5));
  while (carryGroup.children.length > p.carried) carryGroup.remove(carryGroup.children.at(-1));
  carryGroup.children.forEach((m, i) => { const a = time * 2 + (i * 2 * Math.PI) / Math.max(1, p.carried); m.position.set(Math.cos(a) * 0.9, 1.95 + Math.sin(time * 3 + i) * 0.1, Math.sin(a) * 0.9); });

  const alive = new Set();
  for (const m of sim.motes) {
    alive.add(m.id);
    let v = views.motes.get(m.id);
    if (!v) { v = moteMesh(); scene.add(v); views.motes.set(m.id, v); }
    const h = (m.x * 13.7 + m.z * 7.1) % 6.28;
    v.position.set(m.x + Math.sin(time * 1.3 + h) * 0.12, m.y + 0.9 + Math.sin(time * 2.1 + h) * 0.2, m.z);
    v.visible = m.kind !== "dropped" || m.ttl > 120 || Math.floor(time * 8) % 2 === 0;
  }
  for (const [id, v] of views.motes) if (!alive.has(id)) { scene.remove(v); views.motes.delete(id); }

  for (const s of sim.shades) {
    let v = views.shades.get(s.id);
    if (!v) { v = buildShade(); views.shades.set(s.id, v); }
    const st = s.state;
    v.g.position.set(s.x, s.y + Math.sin(time * 2 + s.x) * 0.1 + (st === "spawning" ? -1 + (1 - s.left / W.shade_spawning_ticks) : 0), s.z);
    v.g.lookAt(p.x, v.g.position.y, p.z);
    v.mat.color.setHex(st === "stunned" ? C.stunned : C.shade);
    v.rimM.color.setHex(settings.cb ? C.rimCB : C.rim);
    v.rimM.opacity = st === "stunned" ? 0.2 : 0.7;
    v.eyeM.color.setHex(st === "stunned" ? 0x777777 : settings.cb ? C.rimCB : st === "chase" || st === "drain" ? 0xff9ad5 : 0xd9c4ff);
    v.g.rotation.z = st === "stunned" ? Math.sin(time * 14) * 0.15 : 0;
  }

  for (const d of sim.drifters) {
    let v = views.drifters.get(d.id);
    if (!v) { v = buildDrifter(); views.drifters.set(d.id, v); }
    v.g.visible = d.state !== "removed";
    v.g.position.set(d.x, d.y, d.z);
    v.g.rotation.y = time * (d.state === "idle" ? 0.6 : 2);
    const pos = v.ribbon.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 1] = v.base[i * 3 + 1] + Math.sin(time * 6 + v.base[i * 3] * 2) * 0.25;
    pos.needsUpdate = true;
    while (v.loot.children.length < d.stolen) v.loot.add(moteMesh(0.4));
    while (v.loot.children.length > d.stolen) v.loot.remove(v.loot.children.at(-1));
    v.loot.children.forEach((m, i) => m.position.set(Math.cos(i * 2) * 0.5, 0.4, Math.sin(i * 2) * 0.5));
  }

  for (const c of sim.charms) {
    let v = views.charms.get(c.id);
    if (!v) { v = buildCharm(); views.charms.set(c.id, v); }
    v.visible = c.available;
    v.position.set(c.x, c.y + 1 + Math.sin(time * 2) * 0.15, c.z);
    v.rotation.y = time;
  }

  let litCount = 0;
  for (const L of sim.lanterns) {
    const v = views.lanterns.get(L.id);
    if (L.lit) litCount++;
    const cost = sim.costOf(L), shownKey = L.lit ? -2 : L.deposited * 100 + cost;
    if (v.shown !== shownKey) {
      v.shown = shownKey;
      v.ring.geometry.dispose();
      v.ring.geometry = new THREE.RingGeometry(1.6, 1.9, 40, 1, Math.PI / 2, Math.max(0.001, (L.lit ? 0 : L.deposited / cost) * Math.PI * 2));
    }
    const fuel = sim.fuelOf(L), low = L.lit && fuel < T.low_fuel_threshold;
    const blinkOff = low && Math.floor(time * 2) % 2 === 1; // slow 1 Hz blink when fuel < 30
    const fl = 1 + Math.sin(time * 7 + L.x) * 0.06;
    v.paper.color.setHex(L.lit && !blinkOff ? C.lit : C.off);
    v.coreM.opacity = L.lit && !blinkOff ? 0.9 : 0;
    v.light.intensity = L.lit ? (blinkOff ? 8 : 40 * fl) : 0;
    v.safe.material.opacity = L.lit && !low ? 0.35 : 0;
    v.lamp.scale.set(1, L.lit ? 1.25 : 1.25 * 0.8, 1); // unlit: squashed 20% + torn paper (readable without colour)
    v.tear.visible = !L.lit;
    v.fuelBar.visible = L.lit && !blinkOff;
    v.fuelFg.scale.x = Math.max(0.001, fuel / T.fuel_max);
    v.fuelFg.position.x = -0.8 * (1 - fuel / T.fuel_max);
    v.fuelFg.material.color.setHex(low ? (settings.cb ? 0xffffff : 0xff5a5f) : C.lit);
    v.fuelBar.lookAt(camera.position.x, v.fuelBar.getWorldPosition(v3).y, camera.position.z);
  }
  const k = litCount / sim.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k; // Ticket-02 formula
  scene.fog.far = 140 + 80 * k;

  // ---- HUD ----
  $("flames").innerHTML = Array.from({ length: T.flames }, (_, i) => `<div class="flame ${i < p.flames ? "" : "off"}"></div>`).join("");
  const tl = Math.ceil(sim.timeLeft);
  const clock = $("clock");
  clock.textContent = `${sim.timeLeft <= 30 && settings.cb ? "⚠ " : ""}${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
  clock.classList.toggle("danger", sim.timeLeft <= 30);
  if (tl <= 10 && tl !== lastCountdown && sim.state === "playing") { if (lastCountdown === -1 || lastCountdown > 10) caption("10 giây cuối tới bình minh!", true); lastCountdown = tl; sfx.tickBeep(); }
  for (const L of sim.lanterns) {
    const low = L.lit && sim.fuelOf(L) < T.low_fuel_threshold;
    if (low && !lowFuelWarned.has(L.id)) { lowFuelWarned.add(L.id); caption(`Đèn ${L.id} sắp cạn dầu (dưới ${T.low_fuel_threshold})`, true); }
    if (!low) lowFuelWarned.delete(L.id);
  }
  $("lamps").textContent = `Đèn sáng ${litCount}/${sim.lanterns.length} · cần ${sim.litNeeded} lúc bình minh`;
  $("lamps").classList.toggle("short", litCount < sim.litNeeded);
  $("score").textContent = totalScore + sim.score;
  $("motebar").innerHTML = Array.from({ length: sim.capacity }, (_, i) => `<div class="cell ${i < p.carried ? "on" : ""}"></div>`).join("") + `<span class="cap">${p.carried}/${sim.capacity}</span>`;
  const cdUi = (id, left, full, ok) => { const el = $(id); el.querySelector("i").style.height = `${(left / full) * 100}%`; el.classList.toggle("ready", left === 0 && ok); };
  cdUi("cd-dash", p.charm > 0 ? 0 : p.dashCd, T.dash_cooldown_s * W.tick_rate, true);
  cdUi("cd-pulse", p.pulseCd, T.pulse_cooldown_s * W.tick_rate, p.carried >= T.pulse_cost);
  $("charm").classList.toggle("hidden", p.charm === 0);
  $("charm").querySelector("span").textContent = `${Math.ceil(p.charm / W.tick_rate)}s`;
  const unlit = sim.lanterns.filter((L) => !L.lit).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const near = sim.lanterns.filter((L) => (!L.lit || sim.fuelOf(L) < T.fuel_max) && Math.hypot(L.x - p.x, L.z - p.z) <= T.interact_radius)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  $("hint").textContent = !near ? "" : near.lit ? `E — Châm dầu (${Math.floor(sim.fuelOf(near))}/${T.fuel_max})` : `E — Nạp ánh sáng (${near.deposited}/${sim.costOf(near)})`;
  $("hint").classList.toggle("on", !!near);
  const arrow = $("arrow");
  if (unlit[0]) {
    v3.set(unlit[0].x, unlit[0].y + 3.8, unlit[0].z).project(camera);
    const behind = v3.z > 1;
    const off = behind || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1;
    arrow.style.display = off ? "block" : "none";
    if (off) {
      let ax = behind ? -v3.x : v3.x, ay = behind ? -v3.y : v3.y;
      const mm = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
      ax /= mm; ay /= mm;
      const W2 = innerWidth / 2, H2 = innerHeight / 2;
      arrow.style.transform = `translate(${W2 + ax * (W2 - 40) - 12}px, ${H2 - ay * (H2 - 40) - 18}px) rotate(${Math.atan2(ax, ay)}rad)`;
    }
  } else arrow.style.display = "none";
  edgeArrow($("shadeArrow"), shadeMark && performance.now() < shadeMark.until ? shadeMark : null);
  const toGust = W.wind_every - (sim.simTick % W.wind_every);
  const warn = sim.windEnabled && toGust <= W.wind_warn_ticks && sim.simTick > 0;
  if (warn && !windWarned) { windWarned = true; sfx.windWarn(); caption("Gió sắp thổi mạnh!", true); }
  if (!warn) windWarned = false;
  leaves.visible = warn || sim.wind.active;
  if (leaves.visible) {
    const a = (sim.wind.dir * Math.PI) / 180;
    for (let i = 0; i < leaves.count; i++) {
      const s = (i * 7.31 + time * (sim.wind.active ? 9 : 3)) % 30;
      m4.makeRotationY(i + time * 3).setPosition(p.x + Math.cos(a) * (s - 15) + Math.sin(i) * 8, p.y + 1 + ((i * 3.7) % 4), p.z + Math.sin(a) * (s - 15) + Math.cos(i) * 8);
      leaves.setMatrixAt(i, m4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
}

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
const fpsOn = q.has("fps");
if (fpsOn) $("fps").classList.remove("hidden");
let fpsN = 0, fpsT = 0;
window.__fps = { frames: 0, time: 0 };

let benchLastDt = 0;
function frame(now) {
  benchLastDt = now - last;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  if (keys.has("z")) camYaw += 2 * dt;
  if (keys.has("c")) camYaw -= 2 * dt;
  if (mode === "bench") benchFrame(now, dt);
  else if (sim && mode === "play") {
    acc += dt;
    while (acc >= 1 / W.tick_rate && mode === "play") {
      acc -= 1 / W.tick_rate;
      const f = buildFrame();
      jumpSfx(f);
      for (const ev of sim.step(f)) onEvent(ev);
    }
  }
  if (sim && mode === "bench") {
    syncViews(time);
    const th = (2 * Math.PI * benchT) / 15; // 15 s per lap, counter-clockwise seen from above (+X towards +Z)
    camera.position.set(30 * Math.cos(th), 15, 30 * Math.sin(th));
    camera.lookAt(0, 0, 0);
  } else if (sim) {
    syncViews(time);
    const p = sim.player, dist = camDist;
    camera.position.set(p.x - Math.sin(camYaw) * dist * Math.cos(camPitch), p.y + 1.5 + dist * Math.sin(camPitch), p.z - Math.cos(camYaw) * dist * Math.cos(camPitch));
    camera.lookAt(p.x, p.y + 1.5, p.z);
    if (shakeT > 0 && !settings.reduce) { shakeT -= dt; camera.position.x += (Math.random() - 0.5) * 0.3; camera.position.y += (Math.random() - 0.5) * 0.3; }
  } else {
    if (!world) buildWorld(1, new Sim({ seed: 1, night: 1, scenario: { random_motes: false, random_shades: false } }));
    camera.position.set(Math.sin(time * 0.1) * 60, 30, Math.cos(time * 0.1) * 60);
    camera.lookAt(0, 0, 0);
  }
  if (pulseT >= 0) {
    pulseT += dt;
    pulseRing.scale.setScalar(1 + (pulseT / 0.45) * T.pulse_radius);
    pulseRing.material.opacity = Math.max(0, 1 - pulseT / 0.45);
    if (pulseT > 0.45) pulseT = -1;
  }
  for (let i = skyLanterns.length - 1; i >= 0; i--) {
    const m = skyLanterns[i];
    m.userData.life -= dt;
    m.position.y += m.userData.vy * dt;
    m.position.x += Math.sin(time + m.userData.sway) * 0.01;
    if (m.userData.life <= 0) { scene.remove(m); skyLanterns.splice(i, 1); }
  }
  renderer.render(scene, camera);
  fpsN++; fpsT += dt;
  window.__fps.frames++; window.__fps.time += dt;
  if (fpsOn && fpsT >= 1) { $("fps").textContent = `${(fpsN / fpsT).toFixed(1)} FPS`; document.title = `FPS ${(fpsN / fpsT).toFixed(1)}`; fpsN = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


// ---------- edge arrow helper ----------
function edgeArrow(el, target) {
  if (!target) { el.style.display = "none"; return; }
  v3.set(target.x, target.y + 1, target.z).project(camera);
  const behind = v3.z > 1, off = behind || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1;
  el.style.display = off ? "block" : "none";
  if (!off) return;
  let ax = behind ? -v3.x : v3.x, ay = behind ? -v3.y : v3.y;
  const mm = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
  ax /= mm; ay /= mm;
  const W2 = innerWidth / 2, H2 = innerHeight / 2;
  el.style.transform = `translate(${W2 + ax * (W2 - 40) - 12}px, ${H2 - ay * (H2 - 40) - 18}px) rotate(${Math.atan2(ax, ay)}rad)`;
}

// ---------- key rebinding ----------
function keysCard(msg = "", err = false) {
  const rows = Object.keys(DEFAULT_KEYS).map((a) => `<tr><td>${ACTION_NAMES[a]}</td><td><button class="btn ghost key" data-a="bind:${a}">${capturing === a ? "…" : keyLabel(settings.keys[a])}</button></td></tr>`).join("");
  showCard(`<h2>Đổi phím</h2><table class="keys">${rows}</table><p class="${err ? "err" : "sub"}">${msg || "Bấm vào một phím để đổi. Esc luôn mở menu tạm dừng."}</p>
  <div class="btns"><button class="btn ghost" data-a="keysReset">Khôi phục mặc định</button><button class="btn" data-a="settings">Xong</button></div>`);
}

// ---------- leaderboard (server file via /api/leaderboard; localStorage fallback for static hosting) ----------
let sessionSeed = 0, savedThisRun = false;
async function getBoard() {
  try { const r = await fetch("/api/leaderboard"); if (r.ok) return (await r.json()).entries; } catch {}
  try { return JSON.parse(localStorage.getItem("ddl-leaderboard") || "[]"); } catch { return []; }
}
async function postBoard(entry) {
  try {
    const r = await fetch("/api/leaderboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry) });
    if (r.ok) return (await r.json()).entries;
  } catch {}
  const entries = insertEntry(await getBoard(), entry);
  try { localStorage.setItem("ddl-leaderboard", JSON.stringify(entries)); } catch {}
  return entries;
}
function saveForm() {
  if (savedThisRun) return "";
  return `<p><label>Tên (3–12 ký tự: chữ, số, _ — có dấu được) <input id="lbname" type="text" maxlength="12" autocomplete="off"></label>
  <button class="btn" data-a="save">Lưu điểm</button></p><p class="err" id="lberr"></p>`;
}
async function saveScore() {
  const name = ($("lbname")?.value || "").trim().normalize("NFC");
  if (!NAME_RE.test(name)) { $("lberr").textContent = "Tên phải dài 3–12 ký tự, chỉ gồm chữ, số hoặc _."; return; }
  const entry = { name, score: totalScore, nights_won: Object.keys(nightScores).length, achieved_at: isoWithZone(), seed: sessionSeed };
  try { await postBoard(entry); savedThisRun = true; boardCard(name); } catch (e) { $("lberr").textContent = "Không lưu được: " + e.message; }
}
async function boardCard(highlight = "") {
  const entries = await getBoard();
  const rows = entries.map((e, i) => `<tr${e.name === highlight ? ' style="color:#f2c14e"' : ""}><td>${i + 1}</td><td>${e.name.replace(/[<>&]/g, "")}</td><td>${e.score}</td><td>${e.nights_won}/3</td><td>${new Date(e.achieved_at).toLocaleString("vi-VN")}</td></tr>`).join("");
  showCard(`<h2>Bảng xếp hạng</h2><table class="lb"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Thời điểm</th></tr>${rows || '<tr><td colspan="5">Chưa có ai — hãy là người đầu tiên!</td></tr>'}</table>
  <div class="btns"><button class="btn" data-a="menu">Về menu</button></div>`);
}

// ---------- benchmark scene (Ticket-04 §1): ?bench=1&seed=42&duration=30 ----------
let benchT = 0, benchDts = [], benchStart = 0, benchDone = false, benchAcc = 0, heapPeak = 0;
function startBench() {
  const seed = Number(q.get("seed")) || 42;
  sim = benchSim(seed);
  buildWorld(1, sim);
  for (const L of sim.lanterns) views.lanterns.set(L.id, buildLantern(L));
  mode = "bench";
  hideOverlay();
  $("hud").classList.remove("hidden");
  benchStart = performance.now();
  fetch("/bench/first-frame").catch(() => {});
}
function benchFrame(now, dt) {
  const duration = Number(q.get("duration")) || 30;
  benchT = (now - benchStart) / 1000;
  benchAcc += dt;
  while (benchAcc >= 1 / W.tick_rate) { benchAcc -= 1 / W.tick_rate; sim.step(null); }
  if (benchDone || benchT < 3) return; // 3 s warm-up, not measured
  benchDts.push(benchLastDt);
  if (performance.memory) heapPeak = Math.max(heapPeak, performance.memory.usedJSHeapSize);
  if (benchT >= 3 + duration) {
    benchDone = true;
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    const res = { ...frameStats(benchDts), measured_s: Math.round((benchT - 3) * 100) / 100, js_heap_peak_mb: heapPeak ? Math.round(heapPeak / 2 ** 20) : null,
      three: REVISION, ua: navigator.userAgent.match(/(Chrome|Edg)\/[\d.]+/)?.[0] ?? navigator.userAgent, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown" };
    window.__bench = res;
    document.title = "BENCH DONE";
    fetch("/bench/result", { method: "POST", body: JSON.stringify(res) }).catch(() => {});
  }
}

// ---------- start (last, after every declaration above) ----------
if (q.has("bench")) startBench();
else if (q.has("autostart")) startNight(Math.min(3, Math.max(1, Number(q.get("night")) || 1)));
else menu();
