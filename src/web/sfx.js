// Synthesized audio (WebAudio, no files): night music loop + effects. Master volume 0..1.
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.volume = 0.7; this.musicOn = false; }
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch { this.ctx = null; }
    }
    this.ctx?.resume?.();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  tone(freq, dur, { type = "sine", vol = 0.15, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  noise(dur, vol = 0.08, delay = 0) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / n) * Math.PI);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 700; g.gain.value = vol;
    s.buffer = buf;
    s.connect(f).connect(g).connect(this.master);
    s.start(this.ctx.currentTime + delay);
  }
  // gentle pentatonic night loop
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const notes = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    let i = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const f = notes[(i * 3 + (i >> 2)) % notes.length];
      this.tone(f, 1.6, { type: "sine", vol: 0.035 });
      if (i % 4 === 0) this.tone(f / 2, 3.2, { type: "triangle", vol: 0.03 });
      i++;
      this.musicTimer = setTimeout(tick, 800);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
  pickup(n) { this.tone(660 + n * 40, 0.18, { type: "triangle", vol: 0.1 }); }
  deposit() { this.tone(440, 0.25, { vol: 0.1 }); this.tone(660, 0.3, { vol: 0.07, delay: 0.06 }); }
  lit() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, { type: "triangle", vol: 0.09, delay: i * 0.09 })); }
  pulse() { this.tone(300, 0.45, { vol: 0.16, slide: 3 }); }
  hit() { this.tone(160, 0.35, { type: "square", vol: 0.07, slide: 0.5 }); }
  jump() { this.tone(380, 0.15, { type: "triangle", vol: 0.07, slide: 1.6 }); }
  dash() { this.noise(0.18, 0.12); }
  shade() { this.tone(110, 0.8, { type: "sawtooth", vol: 0.04, slide: 0.7 }); }
  steal() { this.tone(900, 0.3, { type: "triangle", vol: 0.07, slide: 0.4 }); }
  charm() { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.08, delay: i * 0.05 })); }
  windWarn() { this.noise(1.6, 0.06); }
  tickBeep() { this.tone(880, 0.08, { type: "square", vol: 0.05 }); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.9, { type: "triangle", vol: 0.09, delay: i * 0.12 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.8, { vol: 0.08, delay: i * 0.18 })); }
}
