// ═══════════════════════════════════════════════════════════
// 프롬프트 마스터 — Web Audio API 사운드 엔진
// ═══════════════════════════════════════════════════════════

const SoundFX = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('pm_muted') === '1'; } catch (e) { /* ignore */ }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur = 0.12, type = 'sine', vol = 0.18, delay = 0, slideTo = null) {
    const a = ac(); if (!a || muted) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur = 0.3, vol = 0.15, delay = 0) {
    const a = ac(); if (!a || muted) return;
    const t0 = a.currentTime + delay;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.7;
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t0);
  }

  return {
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('pm_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      return muted;
    },
    unlock() { ac(); },
    click()   { tone(660, 0.06, 'square', 0.05); },
    select()  { tone(880, 0.08, 'sine', 0.12); tone(1320, 0.1, 'sine', 0.08, 0.05); },
    deselect(){ tone(440, 0.07, 'sine', 0.08); },
    send()    { tone(300, 0.25, 'sawtooth', 0.12, 0, 900); noise(0.2, 0.05, 0.05); },
    typeBlip(){ tone(1400 + Math.random() * 600, 0.02, 'square', 0.02); },
    correct() { tone(523, 0.12, 'sine', 0.16); tone(659, 0.12, 'sine', 0.16, 0.09); tone(784, 0.2, 'sine', 0.18, 0.18); },
    wrong()   { tone(220, 0.18, 'sawtooth', 0.1); tone(165, 0.24, 'sawtooth', 0.1, 0.12); },
    star(n)   { const f = [784, 988, 1319][Math.min(n, 2)]; tone(f, 0.35, 'triangle', 0.22); tone(f * 1.5, 0.4, 'sine', 0.12, 0.08); },
    fanfare() {
      const seq = [523, 523, 523, 659, 784, 784, 1047];
      const t = [0, 0.12, 0.24, 0.36, 0.5, 0.62, 0.78];
      seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.5 : 0.11, 'triangle', 0.18, t[i]));
      noise(0.5, 0.07, 0.78);
    },
    levelup() { tone(392, 0.1, 'sine', 0.15); tone(523, 0.1, 'sine', 0.15, 0.08); tone(659, 0.1, 'sine', 0.15, 0.16); tone(880, 0.28, 'sine', 0.18, 0.24); },
    tick()    { tone(1200, 0.04, 'square', 0.06); },
  };
})();
