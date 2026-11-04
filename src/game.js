/* 장작꾼 — one button, one swing, one more piece of firewood. */
import {
  TAU, clamp, lerp, easeOutCubic, easeInCubic, mulberry32,
} from './utils.js';
import { renderBackground } from './background.js';
import { drawStump, drawLogPile, drawFlyLog, logSlot } from './props.js';
import {
  drawCharacterBody, drawAxeAndArms, axeHeadWorld, idlePose, POSES,
} from './character.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreValue = document.getElementById('scoreValue');
const scoreCard = document.getElementById('scoreCard');
const chopButton = document.getElementById('chopButton');
const hint = document.getElementById('hint');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');
const ripple = document.getElementById('ripple');

const FONT = '-apple-system, BlinkMacSystemFont, "Samsung One UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "WenQuanYi Zen Hei", sans-serif';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SWING_TIME = 0.66;
const WIND_END = 0.22;
const IMPACT_PHASE = 0.44;
const HOLD_END = 0.53;
const TRAIL_START = 0.28;
const TRAIL_END = 0.56;
const TRAIL_LIFE = 0.11;

const state = {
  score: 0,
  logsShown: 0,
  firstTap: true,
  time: 0,
};

const L = {};
let bgCanvas = null;
let swing = null;
let pending = 0;
let shake = 0;
let flash = 0;
let flashPoint = { x: 0, y: 0 };

let trail = [];
let chips = [];
let dust = [];
let rings = [];
let floaters = [];
let flyingLogs = [];
let leaves = [];
let motes = [];
let fireflies = [];

/* ── Layout ─────────────────────────────────────────────── */
function layout() {
  const W = Math.max(1, window.innerWidth);
  const H = Math.max(1, window.innerHeight);
  const DPR = clamp(window.devicePixelRatio || 1, 1, 2);
  const aspect = H / W;
  let S = clamp(H / 844, 0.72, 1.5);
  if (aspect < 1.15) S = clamp(H / 700, 0.8, 1.55);
  if (W > H * 1.35) S *= 1.04;

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const groundY = H * (aspect > 2.1 ? 0.72 : aspect < 1.0 ? 0.79 : 0.735);
  const charX = W * 0.5 - 53 * S;
  const stumpX = charX + 108 * S;
  const stumpTopY = groundY - 58 * S;
  const pileX = stumpX + 78 * S;

  Object.assign(L, { W, H, S, DPR, groundY, charX, stumpX, stumpTopY, pileX });
  bgCanvas = renderBackground(L);
  initAmbient();
}

/* ── Ambient life ───────────────────────────────────────── */
function initAmbient() {
  const rand = mulberry32(((Date.now() & 0xffffff) ^ 0xa53f) >>> 0);
  const count = Math.round(16 * clamp(L.S, 0.8, 1.35));
  leaves = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: rand() * L.W,
      y: rand() * L.H * 0.82,
      vy: (10 + rand() * 26) * L.S,
      vx: (rand() - 0.5) * 18 * L.S,
      sway: (8 + rand() * 18) * L.S,
      freq: 0.5 + rand() * 1.4,
      phase: rand() * TAU,
      rot: rand() * TAU,
      vr: (rand() - 0.5) * 2.5,
      size: (2.8 + rand() * 4.2) * L.S,
      z: rand(),
      color: ['#d07a34', '#bb5f2c', '#dfa14b', '#9d4c27', '#c99245'][Math.floor(rand() * 5)],
    });
  }

  motes = [];
  for (let i = 0; i < 42; i++) {
    motes.push({
      x: rand() * L.W,
      y: L.groundY - rand() * L.H * 0.62,
      vy: (1.5 + rand() * 6) * L.S,
      sway: (2 + rand() * 8) * L.S,
      freq: 0.25 + rand() * 0.9,
      phase: rand() * TAU,
      size: (0.6 + rand() * 1.8) * L.S,
      alpha: 0.12 + rand() * 0.4,
    });
  }

  fireflies = [];
  for (let i = 0; i < 15; i++) {
    fireflies.push({
      x: rand() * L.W,
      y: L.groundY - rand() * 85 * L.S,
      phase: rand() * TAU,
      freq: 0.55 + rand() * 1.2,
      drift: (2 + rand() * 5) * L.S,
      size: (0.9 + rand() * 1.4) * L.S,
    });
  }
}

function updateAmbient(dt) {
  const time = state.time;
  for (const l of leaves) {
    l.x += (l.vx + Math.sin(time * l.freq + l.phase) * l.sway) * dt;
    l.y += l.vy * dt;
    l.rot += l.vr * dt;
    if (l.y > L.H + 30) {
      l.y = -20 - Math.random() * 40;
      l.x = Math.random() * L.W;
    }
    if (l.x < -30) l.x = L.W + 20;
    if (l.x > L.W + 30) l.x = -20;
  }
  for (const m of motes) {
    m.y -= m.vy * dt;
    m.x += Math.sin(time * m.freq + m.phase) * m.sway * dt;
    if (m.y < L.H * 0.08) {
      m.y = L.groundY + Math.random() * 40 * L.S;
      m.x = Math.random() * L.W;
    }
  }
}

function drawLeaf(g, leaf) {
  const s = leaf.size;
  g.save();
  g.translate(leaf.x, leaf.y);
  g.rotate(leaf.rot);
  g.globalAlpha = 0.42 + leaf.z * 0.38;
  g.fillStyle = leaf.color;
  g.beginPath();
  g.moveTo(0, -s);
  g.bezierCurveTo(s * 0.72, -s * 0.25, s * 0.5, s * 0.55, 0, s);
  g.bezierCurveTo(-s * 0.5, s * 0.55, -s * 0.72, -s * 0.25, 0, -s);
  g.fill();
  g.globalAlpha *= 0.45;
  g.strokeStyle = '#fff0c8';
  g.lineWidth = Math.max(0.4, s * 0.1);
  g.beginPath();
  g.moveTo(0, -s * 0.7);
  g.lineTo(0, s * 0.7);
  g.stroke();
  g.restore();
}

function drawAmbient(g, front) {
  if (!front) {
    g.save();
    g.globalCompositeOperation = 'screen';
    for (const m of motes) {
      const twinkle = 0.45 + 0.55 * Math.sin(state.time * m.freq + m.phase);
      g.globalAlpha = m.alpha * (0.3 + twinkle * 0.7);
      g.fillStyle = '#f7d79e';
      g.beginPath();
      g.arc(m.x, m.y, m.size * (0.75 + twinkle * 0.4), 0, TAU);
      g.fill();
      g.globalAlpha *= 0.17;
      g.beginPath();
      g.arc(m.x, m.y, m.size * 4, 0, TAU);
      g.fill();
    }
    for (const f of fireflies) {
      const pulse = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(state.time * f.freq + f.phase)), 2);
      const x = f.x + Math.sin(state.time * 0.33 + f.phase) * f.drift;
      const y = f.y + Math.cos(state.time * 0.27 + f.phase) * f.drift * 0.4;
      g.globalAlpha = 0.15 + pulse * 0.55;
      g.fillStyle = '#e8ec9a';
      g.beginPath();
      g.arc(x, y, f.size * (0.8 + pulse * 0.5), 0, TAU);
      g.fill();
      g.globalAlpha *= 0.2;
      g.beginPath();
      g.arc(x, y, f.size * 5, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  for (const leaf of leaves) {
    if ((leaf.z >= 0.56) === front) drawLeaf(g, leaf);
  }
}

/* ── Pose / swing ───────────────────────────────────────── */
function currentPose() {
  if (!swing) return idlePose(state.time);
  const p = clamp((state.time - swing.start) / SWING_TIME, 0, 1);
  let a;
  let b;
  let k;
  if (p < WIND_END) {
    a = POSES.idle;
    b = POSES.wind;
    k = easeOutCubic(p / WIND_END);
  } else if (p < IMPACT_PHASE) {
    a = POSES.wind;
    b = POSES.strike;
    k = easeInCubic((p - WIND_END) / (IMPACT_PHASE - WIND_END));
  } else if (p < HOLD_END) {
    a = POSES.strike;
    b = POSES.strike;
    k = 0;
  } else {
    a = POSES.strike;
    b = POSES.idle;
    k = easeOutCubic(clamp((p - HOLD_END) / (1 - HOLD_END), 0, 1));
  }

  const pose = {
    lean: lerp(a.lean, b.lean, k),
    gripX: lerp(a.gripX, b.gripX, k),
    gripY: lerp(a.gripY, b.gripY, k),
    angle: lerp(a.angle, b.angle, k),
    bob: lerp(a.bob, b.bob, k),
    crouch: lerp(a.crouch, b.crouch, k),
  };

  if (p > HOLD_END) {
    const settle = clamp((p - HOLD_END) / (1 - HOLD_END), 0, 1);
    pose.lean += Math.sin(settle * Math.PI * 3) * 0.018 * (1 - settle);
  }
  return pose;
}

function startSwing() {
  swing = { start: state.time, impacted: false };
  playWhoosh();
}

function requestChop() {
  interact();
  if (!swing) {
    startSwing();
    return;
  }
  const p = (state.time - swing.start) / SWING_TIME;
  if (p > 0.76) {
    startSwing();
  } else {
    pending = Math.min(pending + 1, 2);
  }
}

/* ── Impact juice ───────────────────────────────────────── */
function bumpScore() {
  scoreValue.textContent = String(state.score);
  scoreCard.classList.remove('is-bumping');
  void scoreCard.offsetWidth;
  scoreCard.classList.add('is-bumping');
}

function showToast(text) {
  toastText.textContent = text;
  toast.classList.remove('is-showing');
  void toast.offsetWidth;
  toast.classList.add('is-showing');
}

function spawnImpact() {
  const contact = axeHeadWorld(L, POSES.strike);
  state.score += 1;
  bumpScore();

  const S = L.S;
  const colors = ['#f6d39b', '#e4b273', '#cb8e50', '#a86b3b', '#8a5630'];
  const chipCount = reduceMotion ? 8 : 17;
  for (let i = 0; i < chipCount; i++) {
    const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.5;
    const speed = (110 + Math.random() * 330) * S;
    chips.push({
      x: contact.x + (Math.random() - 0.5) * 12 * S,
      y: contact.y + (Math.random() - 0.5) * 7 * S,
      vx: Math.cos(angle) * speed + (60 + Math.random() * 90) * S,
      vy: Math.sin(angle) * speed - 50 * S,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 20,
      size: (1.8 + Math.random() * 3.5) * S,
      color: colors[(Math.random() * colors.length) | 0],
      age: 0,
      life: 0.62 + Math.random() * 0.55,
    });
  }

  const puffCount = reduceMotion ? 4 : 9;
  for (let i = 0; i < puffCount; i++) {
    dust.push({
      x: contact.x + (Math.random() - 0.5) * 24 * S,
      y: contact.y + (Math.random() - 0.5) * 11 * S,
      vx: (Math.random() - 0.5) * 70 * S,
      vy: (-18 - Math.random() * 52) * S,
      size: (6 + Math.random() * 14) * S,
      age: 0,
      life: 0.45 + Math.random() * 0.45,
    });
  }

  rings.push({ x: contact.x, y: contact.y + 4 * S, age: 0, life: 0.4 });
  floaters.push({ text: '장작 +1', x: contact.x + 5 * S, y: contact.y - 30 * S, age: 0, life: 1.05 });

  const targetIndex = state.logsShown + flyingLogs.length;
  const slot = logSlot(L, targetIndex % 28);
  flyingLogs.push({
    age: 0,
    life: 0.46,
    from: { x: contact.x, y: contact.y - 5 * S, rot: -0.6 },
    to: { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rot: slot.rot },
  });

  shake = reduceMotion ? 0.18 : 1;
  flash = reduceMotion ? 0.25 : 1;
  flashPoint = { x: contact.x, y: contact.y };
  playChop();
  if (navigator.vibrate) {
    try { navigator.vibrate(16); } catch { /* ignore */ }
  }

  if (state.score > 0 && state.score % 10 === 0) {
    showToast(`${state.score}개 달성!`);
  }
}

function updateEffects(dt) {
  for (const c of chips) {
    c.age += dt;
    c.vy += 1550 * L.S * dt;
    c.vx *= Math.exp(-1.2 * dt);
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.vr * dt;
  }
  chips = chips.filter((c) => c.age < c.life);

  for (const d of dust) {
    d.age += dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= Math.exp(-2 * dt);
    d.vy *= Math.exp(-2 * dt);
  }
  dust = dust.filter((d) => d.age < d.life);

  for (const r of rings) r.age += dt;
  rings = rings.filter((r) => r.age < r.life);

  for (const f of floaters) {
    f.age += dt;
    f.y -= (32 + 24 * (f.age / f.life)) * L.S * dt;
  }
  floaters = floaters.filter((f) => f.age < f.life);

  for (const log of flyingLogs) log.age += dt;
  const landed = flyingLogs.filter((log) => log.age >= log.life);
  if (landed.length) {
    state.logsShown += landed.length;
    flyingLogs = flyingLogs.filter((log) => log.age < log.life);
  }

  for (const p of trail) p.age += dt;
  trail = trail.filter((p) => p.age < TRAIL_LIFE);
  if (trail.length > 12) trail.splice(0, trail.length - 12);

  shake *= Math.exp(-10 * dt);
  flash *= Math.exp(-7.5 * dt);
}

/* ── Drawing ────────────────────────────────────────────── */
function drawTrail(g) {
  if (trail.length < 2) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i];
    const prev = trail[i - 1];
    const t = i / (trail.length - 1);
    const fade = Math.max(0, 1 - p.age / TRAIL_LIFE);
    g.globalAlpha = fade * (0.018 + t * 0.115);
    g.strokeStyle = '#ffd58c';
    g.lineWidth = (0.6 + t * 7.5) * L.S;
    g.beginPath();
    g.moveTo(prev.x, prev.y);
    g.lineTo(p.x, p.y);
    g.stroke();
  }
  g.restore();
}

function drawChips(g) {
  for (const c of chips) {
    const alpha = clamp(1 - c.age / c.life, 0, 1);
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.rot);
    g.globalAlpha = alpha;
    g.fillStyle = c.color;
    g.beginPath();
    g.moveTo(-c.size, -c.size * 0.32);
    g.lineTo(c.size * 0.58, -c.size * 0.62);
    g.lineTo(c.size, c.size * 0.22);
    g.lineTo(-c.size * 0.44, c.size * 0.55);
    g.closePath();
    g.fill();
    g.globalAlpha = alpha * 0.4;
    g.fillStyle = '#fff1c9';
    g.beginPath();
    g.moveTo(-c.size * 0.5, -c.size * 0.18);
    g.lineTo(c.size * 0.35, -c.size * 0.35);
    g.lineTo(c.size * 0.45, 0);
    g.lineTo(-c.size * 0.2, c.size * 0.12);
    g.fill();
    g.restore();
  }
}

function drawDust(g) {
  g.save();
  for (const d of dust) {
    const t = d.age / d.life;
    g.globalAlpha = (1 - t) * 0.17;
    g.fillStyle = '#e2bd83';
    g.beginPath();
    g.arc(d.x, d.y, d.size * (1 + t * 1.6), 0, TAU);
    g.fill();
  }
  g.restore();
}

function drawRings(g) {
  g.save();
  g.globalCompositeOperation = 'screen';
  for (const r of rings) {
    const t = r.age / r.life;
    g.globalAlpha = (1 - t) * 0.32;
    g.strokeStyle = '#ffe0a1';
    g.lineWidth = 2.2 * L.S * (1 - t * 0.4);
    g.beginPath();
    g.ellipse(r.x, r.y, (10 + t * 70) * L.S, (3 + t * 18) * L.S, 0, 0, TAU);
    g.stroke();
  }
  g.restore();
}

function drawFloaters(g) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const f of floaters) {
    const t = f.age / f.life;
    const alpha = clamp(1 - Math.pow(t, 1.6), 0, 1);
    g.globalAlpha = alpha;
    g.font = `900 ${22 * L.S}px ${FONT}`;
    g.lineWidth = 3.4 * L.S;
    g.strokeStyle = 'rgba(43,22,5,.55)';
    g.strokeText(f.text, f.x, f.y);
    const grad = g.createLinearGradient(0, f.y - 14 * L.S, 0, f.y + 14 * L.S);
    grad.addColorStop(0, '#fff4cf');
    grad.addColorStop(1, '#ffc35f');
    g.fillStyle = grad;
    g.fillText(f.text, f.x, f.y);
  }
  g.restore();
}

function drawFlash(g) {
  if (flash < 0.01) return;
  g.save();
  g.globalCompositeOperation = 'screen';
  const radius = 145 * L.S;
  const glow = g.createRadialGradient(flashPoint.x, flashPoint.y, 0, flashPoint.x, flashPoint.y, radius);
  glow.addColorStop(0, `rgba(255,242,195,${0.28 * flash})`);
  glow.addColorStop(0.28, `rgba(255,196,104,${0.16 * flash})`);
  glow.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(flashPoint.x, flashPoint.y, radius, 0, TAU);
  g.fill();
  g.restore();
}

function render() {
  const g = ctx;
  g.setTransform(L.DPR, 0, 0, L.DPR, 0, 0);
  g.clearRect(0, 0, L.W, L.H);

  const amp = shake * 8 * L.S;
  const sx = Math.sin(state.time * 83) * amp + Math.sin(state.time * 47) * amp * 0.32;
  const sy = Math.cos(state.time * 97) * amp * 0.7;
  g.save();
  g.translate(sx, sy);

  if (bgCanvas) g.drawImage(bgCanvas, -10, -10, L.W + 20, L.H + 20);

  drawAmbient(g, false);

  const pose = currentPose();
  if (swing) {
    const p = (state.time - swing.start) / SWING_TIME;
    if (p > TRAIL_START && p < TRAIL_END) {
      const head = axeHeadWorld(L, pose);
      trail.push({ x: head.x, y: head.y, age: 0 });
    }
  }

  drawLogPile(g, L, state.logsShown);
  drawStump(g, L, state.score, state.time);
  drawTrail(g);
  drawCharacterBody(g, L, pose, state.time);
  drawAxeAndArms(g, L, pose);
  drawAmbient(g, true);

  for (const log of flyingLogs) {
    drawFlyLog(g, log.from, log.to, log.age / log.life, L, 0);
  }

  drawChips(g);
  drawDust(g);
  drawRings(g);
  drawFloaters(g);
  drawFlash(g);
  g.restore();
}

/* ── Sound ──────────────────────────────────────────────── */
let audio = null;
let master = null;
let noiseBuffer = null;
let ambienceOn = false;

function makeNoiseBuffer(seconds) {
  const rate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

function ensureAudio() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    audio = new AudioCtx();
    master = audio.createDynamicsCompressor();
    master.threshold.value = -20;
    master.knee.value = 18;
    master.ratio.value = 5;
    master.attack.value = 0.002;
    master.release.value = 0.18;
    master.connect(audio.destination);
    noiseBuffer = makeNoiseBuffer(1.2);
    startAmbience();
  } catch {
    audio = null;
  }
}

function startAmbience() {
  if (!audio || ambienceOn) return;
  ambienceOn = true;
  const t = audio.currentTime;
  const wind = audio.createBufferSource();
  wind.buffer = makeNoiseBuffer(4);
  wind.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 340;
  filter.Q.value = 0.5;
  const gain = audio.createGain();
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.030, t + 1.4);
  wind.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  wind.start(t);

  const lfo = audio.createOscillator();
  lfo.frequency.value = 0.075;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 0.009;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  lfo.start(t);
}

function playWhoosh() {
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(380, t);
  band.frequency.exponentialRampToValueAtTime(1200, t + 0.19);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.035, t + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(band);
  band.connect(gain);
  gain.connect(master);
  src.start(t, Math.random() * 0.4);
  src.stop(t + 0.24);
}

function playChop() {
  if (!audio) return;
  const t = audio.currentTime;

  const thump = audio.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, t);
  thump.frequency.exponentialRampToValueAtTime(48, t + 0.19);
  const thumpGain = audio.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.52, t + 0.007);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(t);
  thump.stop(t + 0.26);

  const crack = audio.createBufferSource();
  crack.buffer = noiseBuffer;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(1700, t);
  band.frequency.exponentialRampToValueAtTime(520, t + 0.09);
  const crackGain = audio.createGain();
  crackGain.gain.setValueAtTime(0.30, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  crack.connect(band);
  band.connect(crackGain);
  crackGain.connect(master);
  crack.start(t, Math.random() * 0.5);
  crack.stop(t + 0.14);

  const tick = audio.createOscillator();
  tick.type = 'triangle';
  tick.frequency.setValueAtTime(690, t);
  tick.frequency.exponentialRampToValueAtTime(230, t + 0.055);
  const tickGain = audio.createGain();
  tickGain.gain.setValueAtTime(0.08, t);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  tick.connect(tickGain);
  tickGain.connect(master);
  tick.start(t);
  tick.stop(t + 0.07);
}

/* ── Input ──────────────────────────────────────────────── */
function interact() {
  ensureAudio();
  if (!state.firstTap) return;
  state.firstTap = false;
  chopButton.classList.remove('is-idle');
  hint.classList.add('is-gone');
  hint.setAttribute('aria-hidden', 'true');
}

function setRipple(x, y) {
  const rect = chopButton.getBoundingClientRect();
  ripple.style.left = `${x - rect.left}px`;
  ripple.style.top = `${y - rect.top}px`;
  ripple.classList.remove('is-on');
  void ripple.offsetWidth;
  ripple.classList.add('is-on');
}

let lastPointerChop = 0;

chopButton.addEventListener('pointerdown', (event) => {
  interact();
  if (event.pointerType !== 'mouse') {
    lastPointerChop = performance.now();
    requestChop();
    setRipple(event.clientX, event.clientY);
  }
});

chopButton.addEventListener('click', (event) => {
  if (performance.now() - lastPointerChop < 420) return;
  interact();
  requestChop();
  const rect = chopButton.getBoundingClientRect();
  setRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
});

chopButton.addEventListener('contextmenu', (event) => event.preventDefault());
chopButton.addEventListener('dblclick', (event) => event.preventDefault());
toast.addEventListener('animationend', () => toast.classList.remove('is-showing'));

/* ── Main loop ──────────────────────────────────────────── */
let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  state.time = now / 1000;

  if (swing) {
    const p = (state.time - swing.start) / SWING_TIME;
    if (!swing.impacted && p >= IMPACT_PHASE) {
      swing.impacted = true;
      spawnImpact();
    }
    if (p >= 1) {
      swing = null;
      if (pending > 0) {
        pending -= 1;
        startSwing();
      }
    }
  }

  updateAmbient(dt);
  updateEffects(dt);
  render();
  requestAnimationFrame(frame);
}

/* ── Boot ───────────────────────────────────────────────── */
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(layout, 110);
});
window.addEventListener('orientationchange', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(layout, 160);
});
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
});

/* A tiny test surface keeps automated checks honest without exposing internals. */
window.__lumberjack = {
  get score() { return state.score; },
  get swinging() { return Boolean(swing); },
  get visibleLogs() { return state.logsShown; },
  tap: requestChop,
};

layout();
chopButton.classList.add('is-idle');
requestAnimationFrame((now) => {
  lastFrame = now;
  requestAnimationFrame(frame);
});
