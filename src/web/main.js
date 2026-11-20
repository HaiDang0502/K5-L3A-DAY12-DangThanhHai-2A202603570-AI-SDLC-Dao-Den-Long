// Đảo Đèn Lồng — browser front-end. Rules live only in ../sim; this file renders sim state, turns
// keyboard/mouse into contract-style input frames (60 fixed ticks/s) and runs menus / 3-night flow.
import * as THREE from "three";
import { Sim, makeRng } from "../sim/sim.js";
import { NIGHTS } from "../sim/maps.js";
import { TUNING as T, WORLD as W } from "../sim/tuning.js";
import { Sfx } from "./sfx.js";

// ---------- standard palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lit: 0xffb347, core: 0xffe9b0, off: 0x5b5f6e, mote: 0xfff6c2, moteGlow: 0xffe58a,
  shade: 0x120a1a, rim: 0x7a3cff, stunned: 0x3a3450, shirt: 0xe8e2d0, red: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
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
const settings = { volume: 0.7, sens: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem("ddl-settings") || "{}")); } catch {}
const saveSettings = () => { try { localStorage.setItem("ddl-settings", JSON.stringify(settings)); } catch {} };
const sfx = new Sfx();
sfx.setVolume(settings.volume);

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
  g.add(post, arm, lamp, core, light, ring, safe);
  g.position.set(L.x, L.y, L.z);
  world.add(g);
  return { g, paper, coreM, light, ring, safe, shown: -1 };
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
  window.__game = { sim, night: n, seed };
}

// ---------- overlay screens ----------
function showCard(html) { $("card").innerHTML = html; $("overlay").classList.remove("hidden"); }
function hideOverlay() { $("overlay").classList.add("hidden"); }
const CONTROLS = `<table class="keys">
  <tr><td>W A S D / mũi tên</td><td>Di chuyển theo camera</td></tr>
  <tr><td>Kéo chuột / Z C</td><td>Xoay camera</td></tr>
  <tr><td>Cuộn chuột</td><td>Camera xa / gần</td></tr>
  <tr><td>Space</td><td>Nhảy</td></tr><tr><td>Shift</td><td>Lướt</td></tr>
  <tr><td>E</td><td>Nạp ánh sáng vào đèn</td></tr>
  <tr><td>F / chuột phải</td><td>Tỏa Sáng (3 đom đóm)</td></tr>
  <tr><td>Esc / P</td><td>Tạm dừng</td></tr></table>`;
function menu() {
  mode = "menu";
  $("hud").classList.add("hidden");
  showCard(`<h1>Đảo Đèn Lồng</h1><p class="sub">Ba hòn đảo · ba đêm</p>
  <p>Giúp Mây gom đom đóm, thắp lại các Đèn Lồng Lớn và né Bóng Mực trong sương đen.</p>${CONTROLS}
  <div class="btns"><button class="btn" data-a="new">Chơi từ Đêm 1 (Enter)</button><button class="btn ghost" data-a="night2">Đêm 2</button><button class="btn ghost" data-a="night3">Đêm 3</button><button class="btn ghost" data-a="settings">Cài đặt</button></div>`);
}
function intro(n) {
  mode = "intro";
  introNight = n;
  $("hud").classList.add("hidden");
  const N = NIGHTS[n];
  showCard(`<h2>Đêm ${n} – ${N.name}</h2><p class="sub">${N.lanterns.length} Đèn Lồng Lớn · ${N.duration_s} giây</p>
  <p class="quote">${STORY[n]}</p><div class="btns"><button class="btn" data-a="go">Bắt đầu (Enter)</button></div>`);
}
function result() {
  const won = sim.state === "won";
  mode = "result";
  if (won) nightScores[night] = sim.score;
  totalScore = Object.values(nightScores).reduce((a, b) => a + b, 0);
  const why = { all_lit: "Mọi đèn đã sáng!", dawn: "Bình minh đến trước khi kịp thắp hết đèn.", no_flames: "Mây đã hết Ngọn Lửa." }[sim.result.reason];
  if (won) sfx.win(); else sfx.lose();
  sfx.stopMusic();
  if (won && night === 3) {
    mode = "dawn";
    setTimeout(() => showCard(`<h1>Bình Minh</h1><p>Tiếng chuông Đảo Chuông vang lên, ba hòn đảo bừng sáng.</p>
    <p class="sub">Đêm 1: ${nightScores[1] ?? 0} · Đêm 2: ${nightScores[2] ?? 0} · Đêm 3: ${nightScores[3] ?? 0}</p>
    <h2>Tổng điểm: ${totalScore}</h2><div class="btns"><button class="btn" data-a="menu">Về menu</button></div>`), 900);
    return;
  }
  setTimeout(() => showCard(`<h2>${won ? "Thắng" : "Thua"} – Đêm ${night}</h2><p>${why}</p><p>Điểm đêm này: <b>${sim.score}</b>${won ? "" : " (chỉ đêm thắng được cộng)"} · Tổng: <b>${totalScore}</b></p>
  <div class="btns">${won ? `<button class="btn" data-a="next">Đêm ${night + 1} (Enter)</button>` : `<button class="btn" data-a="retry">Chơi lại Đêm ${night} (Enter)</button>`}<button class="btn ghost" data-a="menu">Về menu</button></div>`), 900);
}
function pauseMenu() {
  showCard(`<h2>Tạm dừng</h2><div class="btns"><button class="btn" data-a="resume">Tiếp tục</button><button class="btn ghost" data-a="retry">Chơi lại Đêm</button>
  <button class="btn ghost" data-a="settings">Cài đặt</button><button class="btn ghost" data-a="menu">Về menu</button></div>`);
}
function settingsCard() {
  showCard(`<h2>Cài đặt</h2>
  <label class="set">Âm lượng <input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
  <label class="set">Độ nhạy chuột <input id="sens" type="range" min="0.2" max="3" step="0.1" value="${settings.sens}"></label>
  <div class="btns"><button class="btn" data-a="back">Xong</button></div>`);
  $("vol").oninput = (e) => { settings.volume = Number(e.target.value); sfx.setVolume(settings.volume); saveSettings(); };
  $("sens").oninput = (e) => { settings.sens = Number(e.target.value); saveSettings(); };
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
  else if (a === "go") startNight(introNight);
  else if (a === "next") intro(night + 1);
  else if (a === "retry") { sfx.stopMusic(); intro(night); }
  else if (a === "menu") { sfx.stopMusic(); sim = null; menu(); }
  else if (a === "resume") pending.pause = true;
  else if (a === "settings") settingsCard();
  else if (a === "back") { if (sim?.state === "paused") pauseMenu(); else menu(); }
}

// ---------- input ----------
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "enter") {
    sfx.unlock();
    if (mode === "menu") act("new");
    else if (mode === "intro") act("go");
    else if (mode === "result") act(sim.state === "won" ? "next" : "retry");
    return;
  }
  if (mode !== "play") return;
  if (k === "escape" || k === "p") pending.pause = true;
  if (sim?.state === "paused") return;
  if (k === " ") { pending.jump = true; e.preventDefault(); }
  if (k === "e") pending.interact = true;
  if (k === "f") pending.pulse = true;
  if (k === "shift") pending.dash = true;
  keys.add(k);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
let dragging = false;
canvas.addEventListener("pointerdown", (e) => { if (e.button === 2) pending.pulse = true; else dragging = true; });
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging || mode !== "play") return;
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
  const z = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const x = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
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
    case "deposit": sfx.deposit(); break;
    case "lantern_lit": { sfx.lit(); const L = sim.lanterns.find((x) => x.id === d.lantern_id); releaseSkyLanterns(L.x, L.y, L.z); toast("Một chiếc đèn đã sáng lại!"); break; }
    case "pulse": sfx.pulse(); pulseT = 0; pulseRing.position.set(sim.player.x, sim.player.y + 0.15, sim.player.z); break;
    case "player_hit": sfx.hit(); toast(d.by === "fall" ? `Rơi khỏi đảo! Mất ${d.lost} đom đóm` : d.dropped ? `Bị Bóng Mực chạm! Rơi ${d.dropped} đom đóm` : "Bị Bóng Mực chạm!"); break;
    case "shade_spawned": sfx.shade(); break;
    case "dash": sfx.dash(); break;
    case "charm_picked": sfx.charm(); toast("Bùa Gió! Chạy nhanh, lướt liên tục"); break;
    case "drifter_steal": sfx.steal(); toast(`Gió Lạc cướp ${d.amount} đom đóm!`); break;
    case "drifter_drop": toast("Gió Lạc thả lại đom đóm!"); break;
    case "paused": pauseMenu(); break;
    case "resumed": hideOverlay(); break;
    case "game_over": result(); break;
  }
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
    v.rimM.opacity = st === "stunned" ? 0.2 : 0.7;
    v.eyeM.color.setHex(st === "stunned" ? 0x777777 : st === "chase" ? 0xff9ad5 : 0xd9c4ff);
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
    if (v.shown !== L.deposited) {
      v.shown = L.deposited;
      v.ring.geometry.dispose();
      v.ring.geometry = new THREE.RingGeometry(1.6, 1.9, 40, 1, Math.PI / 2, Math.max(0.001, (L.deposited / T.lantern_cost) * Math.PI * 2));
    }
    const fl = 1 + Math.sin(time * 7 + L.x) * 0.06;
    v.paper.color.setHex(L.lit ? C.lit : C.off);
    v.coreM.opacity = L.lit ? 0.9 : 0;
    v.light.intensity = L.lit ? 40 * fl : 0;
    v.safe.material.opacity = L.lit ? 0.35 : 0;
  }
  const k = litCount / sim.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k; // Ticket-02 formula
  scene.fog.far = 140 + 80 * k;

  // ---- HUD ----
  $("flames").innerHTML = Array.from({ length: T.flames }, (_, i) => `<div class="flame ${i < p.flames ? "" : "off"}"></div>`).join("");
  const tl = Math.ceil(sim.timeLeft);
  const clock = $("clock");
  clock.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
  clock.classList.toggle("danger", sim.timeLeft <= 30);
  if (tl <= 10 && tl !== lastCountdown && sim.state === "playing") { lastCountdown = tl; sfx.tickBeep(); }
  $("lamps").textContent = `Đèn ${litCount}/${sim.lanterns.length}`;
  $("score").textContent = totalScore + sim.score;
  $("motebar").innerHTML = Array.from({ length: T.carry_capacity }, (_, i) => `<div class="cell ${i < p.carried ? "on" : ""}"></div>`).join("");
  const cdUi = (id, left, full, ok) => { const el = $(id); el.querySelector("i").style.height = `${(left / full) * 100}%`; el.classList.toggle("ready", left === 0 && ok); };
  cdUi("cd-dash", p.charm > 0 ? 0 : p.dashCd, T.dash_cooldown_s * W.tick_rate, true);
  cdUi("cd-pulse", p.pulseCd, T.pulse_cooldown_s * W.tick_rate, p.carried >= T.pulse_cost);
  $("charm").classList.toggle("hidden", p.charm === 0);
  $("charm").querySelector("span").textContent = `${Math.ceil(p.charm / W.tick_rate)}s`;
  const unlit = sim.lanterns.filter((L) => !L.lit).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const near = unlit.find((L) => Math.hypot(L.x - p.x, L.z - p.z) <= T.interact_radius);
  $("hint").textContent = near ? `E — Nạp ánh sáng (${near.deposited}/${T.lantern_cost})` : "";
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
  const toGust = W.wind_every - (sim.simTick % W.wind_every);
  const warn = sim.windEnabled && toGust <= W.wind_warn_ticks && sim.simTick > 0;
  $("windwarn").classList.toggle("hidden", !warn);
  if (warn && !windWarned) { windWarned = true; sfx.windWarn(); }
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

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  if (keys.has("z")) camYaw += 2 * dt;
  if (keys.has("c")) camYaw -= 2 * dt;
  if (sim && mode === "play") {
    acc += dt;
    while (acc >= 1 / W.tick_rate && mode === "play") {
      acc -= 1 / W.tick_rate;
      const f = buildFrame();
      jumpSfx(f);
      for (const ev of sim.step(f)) onEvent(ev);
    }
  }
  if (sim) {
    syncViews(time);
    const p = sim.player, dist = camDist;
    camera.position.set(p.x - Math.sin(camYaw) * dist * Math.cos(camPitch), p.y + 1.5 + dist * Math.sin(camPitch), p.z - Math.cos(camYaw) * dist * Math.cos(camPitch));
    camera.lookAt(p.x, p.y + 1.5, p.z);
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
if (q.has("autostart")) startNight(Math.min(3, Math.max(1, Number(q.get("night")) || 1)));
else menu();
