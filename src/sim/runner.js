// Pure headless loop (no I/O) — used by src/headless.js and by tests.
import { Sim } from "./sim.js";

export function run({ seed, night = 1, scenario = {}, frames = [], ticks, snapshotEvery = 10 }) {
  const sim = new Sim({ seed, night, scenario });
  const lines = [JSON.stringify(sim.snapshot())];
  lines.push(JSON.stringify({ type: "event", tick: 0, name: "night_start", data: { night } }));
  let fi = 0;
  let steps = 0;
  for (let k = 0; k < ticks && (sim.state === "playing" || sim.state === "paused"); k++) {
    while (fi < frames.length && frames[fi].tick < k) fi++;
    const frame = fi < frames.length && frames[fi].tick === k ? frames[fi] : null;
    for (const ev of sim.step(frame)) lines.push(JSON.stringify(ev));
    steps++;
    if (sim.tick % snapshotEvery === 0) lines.push(JSON.stringify(sim.snapshot()));
  }
  lines.push(JSON.stringify({ type: "end", ticks: steps, state: sim.state, score: sim.score }));
  return lines.join("\n") + "\n";
}
