// Đảo Đèn Lồng — browser front-end. All rules live in ../sim/sim.js; this file only renders
// the sim state and turns keyboard/mouse into contract-style input frames (60 fixed ticks/s).
import * as THREE from "three";
import { Sim, makeRng } from "../sim/sim.js";
import { TUNING as T, WORLD as W } from "../sim/tuning.js";
import { Sfx } from "./sfx.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
const DARK_FOG = new THREE.Color(0x150a24), WARM_FOG = new THREE.Color(0x2b2448);
scene.fog = new THREE.FogExp2(DARK_FOG.clone(), 0.022);
scene.background = DARK_FOG.clone();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight(0x8a7ac0, 0x2a1838, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9fa8ff, 0.8);
moon.position.set(-30, 60, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50 });
scene.add(moon);

// ---------- static world (purely visual, deterministic decoration) ----------
const deco = makeRng(2026);
{
  const R = W.island_radius + 1.5;
  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshStandardMaterial({ color: 0x2f4a36, roughness: 1 }));
  top.rotation.x = -Math.PI / 2;
  top.receiveShadow = true;
  scene.add(top);
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 9, 10, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x3b2e3a, roughness: 1 }));
  cliff.position.y = -5;
  scene.add(cliff);
  const sand = new THREE.Mesh(new THREE.RingGeometry(R - 2.2, R, 72), new THREE.MeshStandardMaterial({ color: 0x6e6152, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.01;
  scene.add(sand);
  // sea of clouds
  const sea = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: 0x241638, emissive: 0x0d0618, roughness: 1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -8;
  scene.add(sea);
  // trees & rocks away from lanterns / centre
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3426 });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x1f4a35, roughness: 0.9 });
  const rockM = new THREE.MeshStandardMaterial({ color: 0x4d4a5c, roughness: 1, flatShading: true });
  const lanternSpots = Array.from({ length: T.lantern_count_night1 }, (_, i) => {
    const a = (i * 2 * Math.PI) / T.lantern_count_night1;
    return [W.lantern_ring_radius * Math.sin(a), W.lantern_ring_radius * Math.cos(a)];
  });
  for (let i = 0; i < 70; i++) {
    const a = deco() * Math.PI * 2, r = 8 + deco() * 31;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    if (lanternSpots.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 8)) continue;
    const g = new THREE.Group();
    if (deco() < 0.75) {
      const h = 1.6 + deco() * 1.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, h, 6), trunkM);
      trunk.position.y = h / 2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1 + deco() * 0.6, 2.6 + deco() * 1.5, 7), leafM);
      crown.position.y = h + 1.1;
      trunk.castShadow = crown.castShadow = true;
      g.add(trunk, crown);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + deco() * 0.7), rockM);
      rock.position.y = 0.2;
      rock.rotation.set(deco(), deco(), deco());
      g.add(rock);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
}

// ---------- lanterns ----------
const lanternViews = new Map();
function buildLantern(L) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x55536a }));
  base.position.y = 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 4.6, 8), wood);
  post.position.y = 2.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.16), wood);
  arm.position.set(0.7, 4.7, 0);
  post.castShadow = arm.castShadow = true;
  const paper = new THREE.MeshStandardMaterial({ color: 0x8a5a4a, emissive: 0xff9a3c, emissiveIntensity: 0.05, roughness: 0.7 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), paper);
  lamp.scale.set(1, 1.25, 1);
  lamp.position.set(1.4, 3.85, 0);
  const light = new THREE.PointLight(0xffa64a, 0, 26, 1.6);
  light.position.copy(lamp.position);
  // progress ring + safe circle on the ground
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 48, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const safe = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 64), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18 }));
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.02;
  g.add(base, post, arm, lamp, light, ring, safe);
  g.position.set(L.x, 0, L.z);
  scene.add(g);
  return { g, paper, light, ring, safe, shown: -1, lit: false };
}

// ---------- Mây (player) ----------
const player = new THREE.Group();
const carryGroup = new THREE.Group();
let hatLight;
{
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.0, 12), cloth);
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), skin);
  head.position.y = 1.38;
  const legM = new THREE.MeshStandardMaterial({ color: 0x2b2b3a });
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 6), legM);
  const legR = legL.clone();
  legL.position.set(-0.14, 0.17, 0);
  legR.position.set(0.14, 0.17, 0);
  // nón lá (conical hat)
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0xe3c77e, emissive: 0x4a3a18, roughness: 0.9 }));
  hat.position.y = 1.72;
  // small lantern hanging from the hat brim
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  string.position.set(0.55, 1.35, 0.25);
  const mini = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8c2a, emissiveIntensity: 2 }));
  mini.scale.y = 1.3;
  mini.position.set(0.55, 1.12, 0.25);
  hatLight = new THREE.PointLight(0xffa64a, 6, 9, 1.8);
  hatLight.position.copy(mini.position);
  for (const m of [body, head, hat, legL, legR]) m.castShadow = true;
  player.add(body, head, legL, legR, hat, string, mini, hatLight, carryGroup);
  scene.add(player);
}
const moteGeo = new THREE.SphereGeometry(0.13, 10, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,240,170,1)");
  g.addColorStop(0.3, "rgba(255,200,90,0.55)");
  g.addColorStop(1, "rgba(255,180,60,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
function makeMoteMesh(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat));
  const s = new THREE.Sprite(glowMat);
  s.scale.setScalar(1.3 * scale);
  g.add(s);
  return g;
}

// ---------- dynamic entities ----------
const moteViews = new Map();
const shadeViews = new Map();
const shadeBodyGeo = new THREE.SphereGeometry(0.75, 16, 12);
const shadeTailGeo = new THREE.ConeGeometry(0.6, 1.2, 12);
function buildShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a0b2e, emissive: 0x3a1066, emissiveIntensity: 0.6, roughness: 0.4, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(shadeBodyGeo, mat);
  body.scale.set(1, 1.15, 1);
  const tail = new THREE.Mesh(shadeTailGeo, mat);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.85;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xd9b3ff });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeM);
  const e2 = e1.clone();
  e1.position.set(-0.22, 0.2, 0.62);
  e2.position.set(0.22, 0.2, 0.62);
  g.add(body, tail, e1, e2);
  scene.add(g);
  return { g, mat, eyeM };
}

// pulse ring effect
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseT = -1;

// creative: sky lanterns (đèn trời) rising when a lantern is lit — visual only
const skyLanterns = [];
const skyMat = new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff8a2a, emissiveIntensity: 1.6 });
function releaseSkyLanterns(x, z) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 8), skyMat);
    m.position.set(x + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, z + (Math.random() - 0.5) * 3);
    m.userData = { vy: 1 + Math.random() * 0.8, sway: Math.random() * 6, life: 14 };
    scene.add(m);
    skyLanterns.push(m);
  }
}

// ---------- game state ----------
const sfx = new Sfx();
let sim = null;
let camYaw = 0, camPitch = 0.42;
let acc = 0, last = performance.now();
let running = false;
const keys = new Set();
const pending = { jump: false, interact: false, pulse: false };

function newGame() {
  for (const v of lanternViews.values()) scene.remove(v.g);
  for (const v of moteViews.values()) scene.remove(v);
  for (const v of shadeViews.values()) scene.remove(v.g);
  lanternViews.clear();
  moteViews.clear();
  shadeViews.clear();
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get("seed")) || (Date.now() & 0x7fffffff);
  // ?lit=N pre-lights N lanterns (debug / screenshots only)
  const lit = Math.min(4, Number(q.get("lit")) || 0);
  sim = new Sim({ seed, scenario: lit ? { lanterns: Array.from({ length: lit }, (_, i) => ({ id: "L" + (i + 1), lit: true })) } : {} });
  for (const L of sim.lanterns) lanternViews.set(L.id, buildLantern(L));
  camYaw = 0;
  running = true;
  $("overlay").classList.add("hidden");
  $("hud").classList.remove("hidden");
  window.__game = { sim, seed };
}

function endGame() {
  running = false;
  const won = sim.state === "won";
  const reason = { all_lit: "Mọi Đèn Lồng Lớn đã sáng!", dawn: "Trời đã sáng mà đảo vẫn chưa được thắp hết đèn.", no_flames: "Mây đã hết lửa." }[sim.result.reason];
  $("ovsub").textContent = won ? "Chiến thắng" : "Thua cuộc";
  $("ovtext").textContent = `${reason} Điểm: ${sim.score}.`;
  $("play").textContent = "Chơi lại (Enter / R)";
  setTimeout(() => $("overlay").classList.remove("hidden"), 900);
}

// ---------- input ----------
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!running && (k === "enter" || k === "r")) { sfx.unlock(); newGame(); return; }
  if (k === "m") sfx.toggle();
  if (k === " ") { pending.jump = true; e.preventDefault(); }
  if (k === "e") pending.interact = true;
  if (k === "f") pending.pulse = true;
  keys.add(k);
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
$("play").addEventListener("click", () => { sfx.unlock(); newGame(); });
let dragging = false;
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 2) pending.pulse = true;
  else dragging = true;
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.005;
  camPitch = Math.min(1.2, Math.max(0.12, camPitch + e.movementY * 0.004));
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Build one contract-style input frame. Screen-right maps to move.x = -1 (see README "Điều khiển").
function buildFrame() {
  const z = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const x = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  const f = { move: [x, z], cam_yaw_deg: (camYaw * 180) / Math.PI, jump: pending.jump, interact: pending.interact, pulse: pending.pulse };
  pending.jump = pending.interact = pending.pulse = false;
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
  switch (ev.name) {
    case "mote_picked": sfx.pickup(ev.data.carried); break;
    case "deposit": sfx.deposit(); break;
    case "lantern_lit": {
      sfx.lit();
      const L = sim.lanterns.find((q) => q.id === ev.data.lantern_id);
      releaseSkyLanterns(L.x, L.z);
      toast("Một chiếc đèn đã sáng lại!");
      break;
    }
    case "pulse": sfx.pulse(); pulseT = 0; pulseRing.position.set(sim.player.x, 0.15, sim.player.z); break;
    case "player_hit": sfx.hit(); toast(ev.data.dropped ? `Bị Bóng Mực chạm! Rơi ${ev.data.dropped} đom đóm` : "Bị Bóng Mực chạm!"); break;
    case "shade_spawned": toast("Một Bóng Mực mới trồi lên từ sương…"); break;
    case "game_over": endGame(); break;
  }
}

// ---------- sync views from sim ----------
function syncViews(time) {
  const p = sim.player;
  player.position.set(p.x, p.y, p.z);
  player.rotation.y = p.facing;
  const blink = sim.tick < p.invulnUntil && Math.floor(time * 12) % 2 === 0;
  player.visible = !blink;
  hatLight.intensity = 5 + Math.sin(time * 6) * 0.6;

  // carried fireflies orbit the hat (creative, visual only)
  while (carryGroup.children.length < p.carried) carryGroup.add(makeMoteMesh(0.6));
  while (carryGroup.children.length > p.carried) carryGroup.remove(carryGroup.children[carryGroup.children.length - 1]);
  carryGroup.children.forEach((m, i) => {
    const a = time * 2 + (i * 2 * Math.PI) / Math.max(1, p.carried);
    m.position.set(Math.cos(a) * 0.9, 1.9 + Math.sin(time * 3 + i) * 0.12, Math.sin(a) * 0.9);
  });

  const alive = new Set();
  for (const m of sim.motes) {
    alive.add(m.id);
    let v = moteViews.get(m.id);
    if (!v) { v = makeMoteMesh(); scene.add(v); moteViews.set(m.id, v); }
    const h = (m.x * 13.7 + m.z * 7.1) % 6.28;
    v.position.set(m.x + Math.sin(time * 1.3 + h) * 0.15, 0.9 + Math.sin(time * 2.1 + h) * 0.25, m.z + Math.cos(time * 1.1 + h) * 0.15);
  }
  for (const [id, v] of moteViews) if (!alive.has(id)) { scene.remove(v); moteViews.delete(id); }

  for (const s of sim.shades) {
    let v = shadeViews.get(s.id);
    if (!v) { v = buildShade(); shadeViews.set(s.id, v); }
    const stunned = sim.isStunned(s);
    v.g.position.set(s.x, W.shade_height + 0.2 + Math.sin(time * 2 + s.x) * 0.12, s.z);
    v.g.lookAt(p.x, v.g.position.y, p.z);
    v.mat.emissive.setHex(stunned ? 0x7a6aa0 : 0x3a1066);
    v.mat.opacity = stunned ? 0.55 : 0.92;
    v.eyeM.color.setHex(stunned ? 0x777777 : 0xd9b3ff);
    if (stunned) v.g.rotation.z = Math.sin(time * 14) * 0.15;
  }

  let litCount = 0;
  for (const L of sim.lanterns) {
    const v = lanternViews.get(L.id);
    if (L.lit) litCount++;
    if (v.shown !== L.deposited) {
      v.shown = L.deposited;
      v.ring.geometry.dispose();
      v.ring.geometry = new THREE.RingGeometry(2.2, 2.6, 48, 1, Math.PI / 2, Math.max(0.001, (L.deposited / T.lantern_cost) * Math.PI * 2));
    }
    const flicker = 1 + Math.sin(time * 7 + L.x) * 0.06;
    v.paper.emissiveIntensity = L.lit ? 2.4 * flicker : 0.05 + (L.deposited / T.lantern_cost) * 0.5;
    v.light.intensity = L.lit ? 60 * flicker : (L.deposited / T.lantern_cost) * 8;
    v.safe.material.opacity = L.lit ? 0.35 : 0.15;
  }
  // the island brightens as lanterns are lit
  const k = litCount / T.lantern_count_night1;
  scene.fog.color.copy(DARK_FOG).lerp(WARM_FOG, k);
  scene.background.copy(scene.fog.color);
  scene.fog.density = 0.022 - 0.012 * k;
  hemi.intensity = 0.9 + 0.9 * k;

  // HUD
  $("flames").innerHTML = Array.from({ length: Math.max(T.flames, p.flames) }, (_, i) => `<span class="${i < p.flames ? "" : "off"}"></span>`).join("");
  $("carried").textContent = `${p.carried} / ${T.carry_capacity}`;
  $("lit").textContent = `${litCount} / ${sim.lanterns.length}`;
  $("score").textContent = sim.score;
  const tl = Math.ceil(sim.timeLeft);
  $("time").textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
  const cd = Math.max(0, p.pulseReadyAt - sim.tick) / (T.pulse_cooldown_s * W.tick_rate);
  $("pulsebar").style.width = `${(1 - cd) * 100}%`;
  $("pulsebar").style.background = p.carried >= T.pulse_cost ? "" : "#6b5a7a";
  const near = sim.lanterns.find((L) => !L.lit && Math.hypot(L.x - p.x, L.z - p.z) <= T.interact_radius);
  const hint = $("hint");
  if (near) {
    hint.textContent = p.carried > 0 ? `E: nạp ánh sáng (${near.deposited}/${T.lantern_cost})` : `Đèn cần ${T.lantern_cost - near.deposited} đom đóm nữa`;
    hint.classList.add("on");
  } else hint.classList.remove("on");
}

// ---------- main loop ----------
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  if (keys.has("z")) camYaw += 2 * dt;
  if (keys.has("c")) camYaw -= 2 * dt;
  if (sim) {
    if (running) {
      acc += dt;
      while (acc >= 1 / W.tick_rate && running) {
        acc -= 1 / W.tick_rate;
        for (const ev of sim.step(buildFrame())) onEvent(ev);
      }
    }
    syncViews(time);
    // third-person camera behind Mây (forward = (sin yaw, cos yaw))
    const p = sim.player, dist = 9;
    camera.position.set(p.x - Math.sin(camYaw) * dist * Math.cos(camPitch), p.y + 1.5 + dist * Math.sin(camPitch), p.z - Math.cos(camYaw) * dist * Math.cos(camPitch));
    camera.lookAt(p.x, p.y + 1.5, p.z);
  } else {
    // title screen: slow orbit
    camera.position.set(Math.sin(time * 0.1) * 60, 30, Math.cos(time * 0.1) * 60);
    camera.lookAt(0, 0, 0);
  }
  if (pulseT >= 0) {
    pulseT += dt;
    const s = 1 + (pulseT / 0.45) * T.pulse_radius;
    pulseRing.scale.setScalar(s);
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has("autostart")) newGame();
