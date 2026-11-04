// Tiny procedural audio engine — no samples, no network.
export class AudioEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.boostNoise = null;
    this.crowd = null;
    this.ready = false;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.75 : 0;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.#makeNoise(2.2);
      this.#buildEngine();
      this.#buildBoost();
      this.#buildCrowd();
      this.ready = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.ready = false;
    }
  }

  #makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 2;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 48;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 63;
    const g1 = ctx.createGain();
    g1.gain.value = 0.32;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    filter.connect(out).connect(this.master);
    osc1.start();
    osc2.start();
    this.engine = { out, filter, osc1, osc2 };
  }

  #buildBoost() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.boostNoise = { gain, filter };
  }

  #buildCrowd() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0.012;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.crowd = { gain };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }

  setEngine(speedNorm, boosting, active = true) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const s = Math.min(1, Math.max(0, speedNorm));
    e.osc1.frequency.setTargetAtTime(46 + s * 105 + (boosting ? 20 : 0), t, 0.08);
    e.osc2.frequency.setTargetAtTime(64 + s * 155 + (boosting ? 28 : 0), t, 0.08);
    e.filter.frequency.setTargetAtTime(260 + s * 900 + (boosting ? 520 : 0), t, 0.1);
    e.out.gain.setTargetAtTime(active ? 0.035 + s * 0.035 : 0, t, 0.12);
    this.boostNoise.gain.gain.setTargetAtTime(active && boosting ? 0.045 : 0, t, 0.08);
    if (this.crowd) this.crowd.gain.gain.setTargetAtTime(active ? 0.012 : 0.004, t, 0.4);
  }

  #tone(freq, dur = 0.15, type = 'sine', vol = 0.18, endFreq = null, delay = 0) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  #noise(dur = 0.2, freq = 900, vol = 0.2, type = 'lowpass', delay = 0) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  pickup() {
    this.#tone(520, 0.09, 'square', 0.11);
    this.#tone(780, 0.1, 'square', 0.09, null, 0.07);
    this.#tone(1040, 0.14, 'triangle', 0.09, null, 0.14);
  }
  rouletteTick() { this.#tone(600 + Math.random() * 300, 0.03, 'square', 0.028); }
  itemReady() {
    this.#tone(660, 0.11, 'triangle', 0.1);
    this.#tone(990, 0.18, 'triangle', 0.09, null, 0.09);
  }
  itemUse() { this.#tone(320, 0.18, 'sawtooth', 0.1, 780); this.#noise(0.16, 2200, 0.08, 'highpass'); }
  jump() { this.#tone(220, 0.12, 'triangle', 0.08, 430); }
  flip() { this.#noise(0.16, 1600, 0.08, 'bandpass'); this.#tone(300, 0.13, 'sawtooth', 0.05, 150); }
  boostStart() { this.#noise(0.24, 2400, 0.1, 'highpass'); }
  shell() {
    this.#tone(760, 0.16, 'square', 0.09, 240);
    this.#noise(0.18, 2500, 0.13, 'highpass');
    this.#tone(140, 0.22, 'sine', 0.12, 60, 0.03);
  }
  explosion() {
    this.#noise(0.65, 900, 0.34, 'lowpass');
    this.#tone(110, 0.65, 'sine', 0.28, 28);
    this.#tone(70, 0.85, 'triangle', 0.15, 24, 0.04);
  }
  hit(power = 1) {
    this.#noise(0.12 + power * 0.1, 600 + power * 600, 0.14 + power * 0.12, 'lowpass');
    this.#tone(120 + power * 60, 0.16, 'sine', 0.14, 50);
  }
  wall() { this.#noise(0.1, 700, 0.09, 'lowpass'); }
  banana() { this.#tone(500, 0.2, 'sawtooth', 0.08, 140); this.#noise(0.15, 900, 0.08, 'bandpass', 0.05); }
  lightning() {
    this.#noise(0.7, 5200, 0.26, 'highpass');
    this.#tone(1500, 0.55, 'sawtooth', 0.1, 60);
    this.#tone(90, 0.8, 'sine', 0.22, 30, 0.1);
  }
  star() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((n, i) => this.#tone(n, 0.16, 'triangle', 0.08, null, i * 0.055));
  }
  countdown(final = false) {
    if (final) {
      this.#tone(880, 0.32, 'square', 0.14);
      this.#tone(1320, 0.36, 'triangle', 0.11, null, 0.03);
    } else {
      this.#tone(440, 0.14, 'square', 0.1);
    }
  }
  goal(team = 'blue') {
    const base = team === 'blue' ? 196 : 174;
    const chord = team === 'blue' ? [1, 1.5, 2, 2.5] : [1, 1.33, 2, 2.66];
    chord.forEach((m, i) => {
      this.#tone(base * m, 0.9, 'sawtooth', 0.075, null, i * 0.06);
      this.#tone(base * m * 2, 0.7, 'triangle', 0.05, null, i * 0.06 + 0.02);
    });
    this.#noise(1.3, 900, 0.1, 'bandpass', 0.05);
    setTimeout(() => this.#noise(1.6, 520, 0.13, 'bandpass'), 300);
  }
  whistle() {
    this.#tone(1800, 0.16, 'sine', 0.1, 2100);
    this.#tone(1900, 0.28, 'sine', 0.09, 2300, 0.18);
  }
  uiClick() { this.#tone(700, 0.05, 'square', 0.06); }
  shrink() {
    this.#tone(600, 0.35, 'sawtooth', 0.08, 130);
    this.#tone(300, 0.4, 'triangle', 0.07, 70, 0.05);
  }
}
