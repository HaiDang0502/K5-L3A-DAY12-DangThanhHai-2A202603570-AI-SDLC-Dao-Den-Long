// Creative extra: tiny synthesized sound effects (WebAudio, no audio files). Browser only.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = true;
  }
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { this.ctx = null; }
    }
    this.ctx?.resume?.();
  }
  toggle() { this.on = !this.on; }
  tone(freq, dur, { type = "sine", vol = 0.15, delay = 0, slide = 0 } = {}) {
    if (!this.on || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  pickup(n) { this.tone(660 + n * 90, 0.18, { type: "triangle", vol: 0.12 }); }
  deposit() { this.tone(440, 0.25, { vol: 0.12 }); this.tone(660, 0.3, { vol: 0.08, delay: 0.06 }); }
  lit() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, { type: "triangle", vol: 0.1, delay: i * 0.09 })); }
  pulse() { this.tone(300, 0.45, { type: "sine", vol: 0.18, slide: 3 }); }
  hit() { this.tone(160, 0.35, { type: "square", vol: 0.08, slide: 0.5 }); }
}
