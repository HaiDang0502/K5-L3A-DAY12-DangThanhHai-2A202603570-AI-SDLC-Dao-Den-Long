// Ticket-04 standard benchmark scene (identical for every run): night 1, 200 wandering shades spread
// evenly over the island (seed 42), 100 motes, L1-L3 lit with fuel 100, Mây idle at (0,0,0).
import { Sim, makeRng, parseScenario } from "./sim.js";

export function benchScenario(seed = 42) {
  const rng = makeRng(seed);
  // even spread: one point per cell of a sunflower (Fibonacci) disc + small seeded jitter
  const spread = (n, rMax, y) =>
    Array.from({ length: n }, (_, i) => {
      const r = rMax * Math.sqrt((i + 0.5) / n), a = i * 2.399963229728653 + rng() * 0.3;
      return [Math.round(r * Math.cos(a) * 1000) / 1000, y, Math.round(r * Math.sin(a) * 1000) / 1000];
    });
  return parseScenario({
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    shades: spread(200, 38, 1).map((pos, i) => ({ id: "S" + (i + 1), pos, state: "wander" })),
    motes: spread(100, 37, 0),
    lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true, fuel: 100 })),
    player: { pos: [0, 0, 0] },
  });
}

export const benchSim = (seed = 42) => new Sim({ seed, night: 1, scenario: benchScenario(seed), bench: true });

// Ticket-04 metric definitions, shared by the page and tests.
export function frameStats(dts) {
  const n = dts.length;
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  const worst = sorted.slice(n - k);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const r1 = (v) => Math.round(v * 10) / 10;
  return { frames: n, avg_fps: r1((1000 * n) / sum), p1_low_fps: r1(1000 / (worst.reduce((a, b) => a + b, 0) / k)), frame_ms_p95: r1(p95) };
}
