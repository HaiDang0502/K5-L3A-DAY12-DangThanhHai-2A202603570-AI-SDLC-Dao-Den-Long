// Ticket-02 "Bản đồ chuẩn". Angles are measured from +X towards +Z (point = (r·cosθ, r·sinθ) on XZ),
// which matches the spec's lantern coordinates and "tier 1 = half with z > 0".
const deg = (d) => (d * Math.PI) / 180;
const ring = (r, startDeg, stepDeg, n, y = 0, cx = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = deg(startDeg + i * stepDeg);
    return [cx + r * Math.cos(a), y, r * Math.sin(a)];
  });

// ---------- ground functions: height at (x,z) or null (void / sea of clouds) ----------
const ground1 = (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null);

const ground2 = (x, z) => {
  if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
  if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge, no railing
  return null;
};

const RAMPS3 = [30, 150].map((a) => [Math.cos(deg(a)), Math.sin(deg(a))]);
const ground3 = (x, z) => {
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  let h = 0;
  if (r <= 8) h = 6; // tier 2 disc
  else if (r >= 12 && r <= 24 && z > 0) h = 3; // tier 1 half-annulus
  for (const [ux, uz] of RAMPS3) {
    const along = x * ux + z * uz, lateral = Math.abs(-x * uz + z * ux);
    // ramp: foot at r=30 (Y=0), top at r=24 (Y=3); extended to 23 m so it meets tier 1 without a gap
    if (lateral <= 1.5 && along >= 23 && along <= 30) h = Math.max(h, Math.min(3, (3 * (30 - along)) / 6));
  }
  return h;
};

export const NIGHTS = {
  1: {
    name: "Đảo Bến",
    duration_s: 240,
    ground: ground1,
    start: [0, 0, 0],
    lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
    motePoints: [...ring(12, 0, 45, 8), ...ring(33, 0, 22.5, 16)],
    shadePoints: ring(37, 15, 30, 12),
    shadeEvery: 480,
    shadeMax: 6,
    shadeSpeed: 4.0,
    pads: [],
    charms: [],
    drifters: false,
    wind: false,
    tower: null,
  },
  2: {
    name: "Đảo Cau",
    duration_s: 270,
    ground: ground2,
    start: [0, 0, 0],
    lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
    motePoints: [...ring(10, 0, 90, 4), ...ring(22, 0, 45, 8), ...ring(10, 0, 90, 4, 0, 70), ...ring(22, 0, 45, 8, 0, 70)],
    shadePoints: [...ring(26, 22.5, 45, 8), ...ring(26, 22.5, 45, 8, 0, 70)],
    shadeEvery: 420,
    shadeMax: 8,
    shadeSpeed: 4.0,
    pads: [
      { x: 20, y: 0, z: 18, vy: 14, h: 24, to: [70, 0] },
      { x: 50, y: 0, z: -18, vy: 14, h: 24, to: [0, 0] },
    ],
    charms: [[35, 0, 0]],
    drifters: true,
    wind: false,
    tower: null,
  },
  3: {
    name: "Đảo Chuông",
    duration_s: 300,
    ground: ground3,
    start: [0, 0, -30], // spec start (0,0,0) is inside the bell tower on night 3 -> assumption A2-03
    lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
    motePoints: [...ring(34, 0, 20, 18, 0), ...ring(18, 20, 20, 8, 3), ...ring(5, 45, 90, 4, 6)],
    shadePoints: ring(43, 0, 22.5, 16),
    shadeEvery: 360,
    shadeMax: 10,
    shadeSpeed: 4.5,
    pads: [{ x: 0, y: 3, z: 13, vy: 12, h: 8, dir: [0, -1] }],
    charms: [[30, 0, 25], [-30, 0, 25]],
    drifters: true,
    wind: true,
    tower: { x: 0, z: 0, r: 2, top: 14 }, // 8 m tall on tier 2 (Y=6)
  },
};
