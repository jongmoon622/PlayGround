/*
 * 장작 패기 — a one-button woodchopping toy.
 * Everything is drawn procedurally on a single canvas so the scene stays
 * crisp on high-density phone screens and downloads instantly.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const scoreValueEl = document.getElementById("scoreValue");
const scoreCardEl = document.getElementById("scoreCard");
const chopBtn = document.getElementById("chopBtn");
const chopAxe = chopBtn.querySelector(".chop-axe");
const muteBtn = document.getElementById("muteBtn");
const hintEl = document.getElementById("hint");
const toastEl = document.getElementById("toast");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* state                                                              */
/* ------------------------------------------------------------------ */

const STORAGE_COUNT = "woodcutter.firewood.v1";
const STORAGE_MUTED = "woodcutter.muted.v1";

function loadCount() {
  try {
    const raw = parseInt(localStorage.getItem(STORAGE_COUNT) || "0", 10);
    return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 9999999) : 0;
  } catch {
    return 0;
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_MUTED) === "1";
  } catch {
    return false;
  }
}

let count = loadCount();
let muted = loadMuted();
let hasChopped = count > 0;
let saveTimer = 0;

const CHOP = {
  windup: 0.13,
  strike: 0.09,
  hold: 0.055,
  recover: 0.19,
};
CHOP.impactAt = CHOP.windup + CHOP.strike;
CHOP.cycle = CHOP.windup + CHOP.strike + CHOP.hold + CHOP.recover;

const swing = {
  t: -1,
  queued: false,
  hit: false,
};

const view = { w: 1, h: 1, dpr: 1 };
const OV = 40;
let bgCanvas = null;

const layout = {
  landscape: false,
  charH: 240,
  s: 0.8,
  charX: 220,
  groundY: 700,
  horizonY: 460,
  stumpX: 100,
  stumpTopY: 660,
  pileX: 340,
  sunX: 80,
  sunY: 460,
};

/* ------------------------------------------------------------------ */
/* audio                                                              */
/* ------------------------------------------------------------------ */

const AudioKit = (() => {
  let audio = null;

  function init() {
    if (audio) {
      if (audio.ac.state === "suspended") audio.ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ac;
    try {
      ac = new AC();
    } catch {
      return;
    }
    const master = ac.createGain();
    master.gain.value = muted ? 0.0001 : 0.55;
    master.connect(ac.destination);

    const length = Math.floor(ac.sampleRate * 2);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }

    audio = { ac, master, buffer };
    startWind();

    if (ac.state === "suspended") ac.resume();
  }

  function startWind() {
    const { ac, master, buffer } = audio;
    const wind = ac.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 430;
    lp.Q.value = 0.5;
    const gain = ac.createGain();
    gain.gain.value = 0.03;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    wind.connect(lp);
    lp.connect(gain);
    gain.connect(master);
    wind.start();
    lfo.start();
  }

  function noiseBurst(duration, filterType, startFreq, endFreq, volume, q = 0.8) {
    if (!audio || muted) return;
    const { ac, master, buffer } = audio;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(startFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + duration);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t, Math.random() * 1.2, duration + 0.05);
  }

  function whoosh() {
    if (!audio || muted) return;
    noiseBurst(0.2, "bandpass", 320, 1500, 0.1, 0.9);
  }

  function chop() {
    if (!audio || muted) return;
    const { ac, master } = audio;
    const t = ac.currentTime;
    noiseBurst(0.16, "bandpass", 900 + Math.random() * 400, 260, 0.42, 0.75);

    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.16);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.001, t);
    og.gain.exponentialRampToValueAtTime(0.36, t + 0.007);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.18);

    noiseBurst(0.045, "highpass", 2600, 4200, 0.16, 0.7);
  }

  function chime() {
    if (!audio || muted) return;
    const { ac, master } = audio;
    const t = ac.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ac.createGain();
      const start = t + i * 0.08;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }

  function setMuted(value) {
    if (!audio) return;
    audio.master.gain.setTargetAtTime(value ? 0.0001 : 0.55, audio.ac.currentTime, 0.04);
  }

  function close() {
    if (!audio) return;
    try {
      audio.ac.close();
    } catch {
      /* noop */
    }
    audio = null;
  }

  return { init, whoosh, chop, chime, setMuted, close };
})();

function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* layout                                                             */
/* ------------------------------------------------------------------ */

function computeLayout() {
  const w = view.w;
  const h = view.h;
  const landscape = w > h * 1.15;

  const charH = landscape
    ? clamp(Math.min(h * 0.56, w * 0.3), 150, 360)
    : clamp(Math.min(w * 0.7, h * 0.335), 190, 380);

  const groundY = landscape
    ? h * 0.82
    : Math.min(h * 0.79, h - 155);

  const charX = landscape ? w * 0.4 : w * 0.57;
  const s = charH / 300;

  layout.landscape = landscape;
  layout.charH = charH;
  layout.s = s;
  layout.charX = charX;
  layout.groundY = groundY;
  layout.horizonY = groundY - charH * 1.04;
  layout.stumpX = charX - 150 * s;
  layout.stumpTopY = groundY - 63 * s;
  layout.pileX = charX + 0.38 * charH;
  layout.sunX = Math.max(34, w * 0.17);
  layout.sunY = layout.horizonY - 2;
}

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  computeLayout();
  buildBackground();
  anchorPile();
}

/* ------------------------------------------------------------------ */
/* background painting                                                */
/* ------------------------------------------------------------------ */

function buildBackground() {
  const { w, h, dpr } = view;
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.ceil((w + OV * 2) * dpr);
  bgCanvas.height = Math.ceil((h + OV * 2) * dpr);
  const g = bgCanvas.getContext("2d");
  g.scale(dpr, dpr);
  g.translate(OV, OV);
  drawBackground(g);
}

function drawBackground(g) {
  const { w, h } = view;
  const { horizonY, groundY, charH, sunX, sunY } = layout;
  const minX = -OV;
  const maxX = w + OV;
  const top = -OV;
  const bottom = h + OV;

  /* ---- sky: deep teal dusk grading into amber horizon ---- */
  const sky = g.createLinearGradient(0, top, 0, horizonY + 28);
  sky.addColorStop(0, "#07121c");
  sky.addColorStop(0.16, "#122b3a");
  sky.addColorStop(0.34, "#294d5a");
  sky.addColorStop(0.5, "#52737a");
  sky.addColorStop(0.64, "#948a75");
  sky.addColorStop(0.76, "#c99b70");
  sky.addColorStop(0.88, "#edb87e");
  sky.addColorStop(1, "#ffdda0");
  g.fillStyle = sky;
  g.fillRect(minX, top, maxX - minX, horizonY + 34 - top);

  /* ---- sparse early stars ---- */
  const starRnd = mulberry32(44112);
  g.save();
  for (let i = 0; i < 54; i++) {
    const sx = minX + starRnd() * (maxX - minX);
    const sy = top + 4 + starRnd() * (horizonY - top) * 0.42;
    const fade = clamp(1 - (sy - top) / (horizonY * 0.62), 0, 1);
    const a = (0.08 + starRnd() * 0.46) * fade;
    if (a < 0.03) continue;
    g.fillStyle = `rgba(214,230,255,${a})`;
    g.beginPath();
    g.arc(sx, sy, 0.3 + starRnd() * 0.9, 0, TAU);
    g.fill();
  }
  g.restore();

  /* ---- sun bloom, anamorphic streak and lens ghosts ---- */
  drawSunHalo(g, sunX, sunY, w, h);

  /* ---- layered clouds ---- */
  const cloudRnd = mulberry32(9021);
  g.save();
  g.filter = "blur(9px)";
  for (let i = 0; i < 11; i++) {
    const cx = minX + cloudRnd() * (maxX - minX) * 1.12 - w * 0.06;
    const cy = horizonY - h * (0.1 + cloudRnd() * 0.4);
    const cw = w * (0.13 + cloudRnd() * 0.28);
    const ch = cw * (0.07 + cloudRnd() * 0.06);
    const warm = cx < sunX + w * 0.42;
    cloud(
      g,
      cx,
      cy,
      cw,
      ch,
      warm ? "rgba(255,214,168,0.22)" : "rgba(174,196,198,0.12)"
    );
  }
  g.restore();

  /* ---- distant ridges, each softer than the last ---- */
  ridge(g, horizonY + 4, h * 0.13, "#647f82", 3, 0.56);
  ridge(g, horizonY + 9, h * 0.094, "#496a6d", 7, 0.72);
  ridge(g, horizonY + 14, h * 0.062, "#325458", 11, 0.88);

  /* horizon haze */
  const haze = g.createLinearGradient(0, horizonY - h * 0.1, 0, horizonY + h * 0.1);
  haze.addColorStop(0, "rgba(255,205,145,0)");
  haze.addColorStop(0.46, "rgba(255,210,156,0.22)");
  haze.addColorStop(0.62, "rgba(255,198,134,0.16)");
  haze.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = haze;
  g.fillRect(minX, horizonY - h * 0.1, maxX - minX, h * 0.2);

  /* ---- forest rows receding into fog ---- */
  drawTreeRow(g, horizonY + 4, charH * 0.24, "#33534f", 26, 211, 0.82);
  fogBand(g, horizonY + 3, h * 0.055, 0.24);
  drawTreeRow(g, horizonY + 14, charH * 0.36, "#244540", 36, 517, 0.94);
  fogBand(g, horizonY + 17, h * 0.04, 0.14);
  drawTreeRow(g, horizonY + 22, charH * 0.5, "#173430", 52, 733, 1);

  /* ---- meadow ---- */
  const ground = g.createLinearGradient(0, horizonY + 6, 0, bottom);
  ground.addColorStop(0, "#8b8a55");
  ground.addColorStop(0.07, "#737a47");
  ground.addColorStop(0.2, "#5d6c3d");
  ground.addColorStop(0.42, "#4a5b33");
  ground.addColorStop(0.66, "#374829");
  ground.addColorStop(0.85, "#293922");
  ground.addColorStop(1, "#1a281c");
  g.fillStyle = ground;
  g.fillRect(minX, horizonY + 6, maxX - minX, bottom - horizonY);

  /* warm light pooling from the low sun */
  g.save();
  const lightPool = g.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, w * 1.18);
  lightPool.addColorStop(0, "rgba(255,214,142,0.32)");
  lightPool.addColorStop(0.3, "rgba(255,190,108,0.16)");
  lightPool.addColorStop(0.7, "rgba(255,172,82,0.04)");
  lightPool.addColorStop(1, "rgba(255,160,70,0)");
  g.fillStyle = lightPool;
  g.fillRect(minX, horizonY, maxX - minX, bottom - horizonY);
  g.restore();

  /* raking shafts across the grass */
  drawGroundLight(g, minX, maxX, horizonY, groundY, sunX, charH);

  /* horizon lip */
  g.save();
  g.strokeStyle = "rgba(226,205,138,0.3)";
  g.lineWidth = 1.4;
  g.beginPath();
  for (let x = minX; x <= maxX; x += 10) {
    const y = horizonY + 8 + Math.sin(x * 0.05) * 1.2;
    if (x === minX) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.restore();

  drawGroundDetail(g, minX, maxX, horizonY, bottom);

  /* ---- cabin tucked into the treeline ---- */
  const cabinX = w * (layout.landscape ? 0.855 : 0.842);
  const cabinBase = horizonY + (groundY - horizonY) * 0.16;
  const cabinSize = charH * 0.33;
  layout.cabinX = cabinX;
  layout.cabinBase = cabinBase;
  layout.cabinSize = cabinSize;
  drawCabin(g, cabinX, cabinBase, cabinSize);

  /* ---- soft dirt clearing under the work area ---- */
  g.save();
  const dirt = g.createRadialGradient(
    layout.stumpX + charH * 0.26,
    groundY + charH * 0.02,
    0,
    layout.stumpX + charH * 0.26,
    groundY + charH * 0.02,
    charH * 0.66
  );
  dirt.addColorStop(0, "rgba(96,70,40,0.34)");
  dirt.addColorStop(0.5, "rgba(80,59,34,0.18)");
  dirt.addColorStop(1, "rgba(70,52,32,0)");
  g.fillStyle = dirt;
  g.fillRect(minX, groundY - charH * 0.2, maxX - minX, charH * 0.64);
  g.restore();

  /* ---- framing trees at the edges ---- */
  drawFramingTree(g, -w * 0.015, groundY + h * 0.02, h * 0.74, 1, 9);
  drawFramingTree(g, w * 1.015, groundY + h * 0.01, h * 0.64, -1, 15);
  drawCanopyFrame(g, w, h, horizonY);

  /* ---- out-of-focus foreground bracken ---- */
  g.save();
  g.filter = "blur(1.8px)";
  foregroundClump(g, -10, h + 20, charH * 0.26, 0.5, 1);
  foregroundClump(g, w + 8, h + 16, charH * 0.25, -0.4, 2);
  g.restore();

  drawGrassTufts(g, minX, maxX, horizonY, bottom, 30050 + 7);
}

function drawSunHalo(g, sunX, sunY, w, h) {
  g.save();
  const R = Math.max(w, h) * 0.74;
  const bloom = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, R);
  bloom.addColorStop(0, "rgba(255,251,231,0.98)");
  bloom.addColorStop(0.035, "rgba(255,238,192,0.92)");
  bloom.addColorStop(0.09, "rgba(255,212,146,0.52)");
  bloom.addColorStop(0.2, "rgba(255,184,106,0.24)");
  bloom.addColorStop(0.48, "rgba(255,163,82,0.07)");
  bloom.addColorStop(1, "rgba(255,150,70,0)");
  g.fillStyle = bloom;
  g.fillRect(sunX - R, sunY - R, R * 2, R * 2);

  const coreR = Math.max(w, h) * 0.055;
  const core = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, coreR);
  core.addColorStop(0, "#fffdf4");
  core.addColorStop(0.5, "#ffedb8");
  core.addColorStop(1, "rgba(255,214,140,0)");
  g.fillStyle = core;
  g.beginPath();
  g.arc(sunX, sunY, coreR, 0, TAU);
  g.fill();

  g.globalCompositeOperation = "screen";
  const streak = g.createLinearGradient(sunX - w * 0.55, sunY, sunX + w * 0.55, sunY);
  streak.addColorStop(0, "rgba(255,216,160,0)");
  streak.addColorStop(0.38, "rgba(255,226,184,0.12)");
  streak.addColorStop(0.5, "rgba(255,245,216,0.26)");
  streak.addColorStop(0.62, "rgba(255,226,184,0.12)");
  streak.addColorStop(1, "rgba(255,216,160,0)");
  g.fillStyle = streak;
  g.fillRect(sunX - w * 0.55, sunY - 1.5, w * 1.1, 3);

  for (let i = 1; i <= 3; i++) {
    const dx = w * 0.2 * i;
    const dy = h * 0.045 * i;
    const r = w * (0.012 + i * 0.008);
    const ghost = g.createRadialGradient(sunX + dx, sunY + dy, 0, sunX + dx, sunY + dy, r);
    ghost.addColorStop(0, `rgba(255,206,140,${0.09 - i * 0.016})`);
    ghost.addColorStop(1, "rgba(255,206,140,0)");
    g.fillStyle = ghost;
    g.beginPath();
    g.arc(sunX + dx, sunY + dy, r, 0, TAU);
    g.fill();
  }
  g.restore();
}

function fogBand(g, y, height, alpha) {
  const { w } = view;
  const grd = g.createLinearGradient(0, y - height, 0, y + height);
  grd.addColorStop(0, "rgba(236,222,194,0)");
  grd.addColorStop(0.5, `rgba(238,224,194,${alpha})`);
  grd.addColorStop(1, "rgba(236,222,194,0)");
  g.fillStyle = grd;
  g.fillRect(-OV, y - height, w + OV * 2, height * 2);
}

function drawGroundLight(g, minX, maxX, horizonY, groundY, sunX, charH) {
  const rnd = mulberry32(2244);
  const { w } = view;
  g.save();
  g.filter = "blur(13px)";
  for (let i = 0; i < 11; i++) {
    const depth = 0.08 + rnd() * 0.92;
    const y = horizonY + (groundY - horizonY) * depth;
    const x = sunX + (rnd() - 0.3) * w * 1.15;
    const rx = charH * (0.18 + rnd() * 0.52);
    const ry = charH * (0.018 + depth * 0.032);
    const grd = g.createLinearGradient(x - rx, y, x + rx, y);
    grd.addColorStop(0, "rgba(255,214,146,0)");
    grd.addColorStop(0.44, `rgba(255,212,140,${0.05 + rnd() * 0.08})`);
    grd.addColorStop(1, "rgba(255,204,128,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, rx, ry, -0.06, 0, TAU);
    g.fill();
  }
  g.restore();
}

function drawFramingTree(g, x, baseY, height, dir, seed) {
  const rnd = mulberry32(seed * 977 + 31);
  g.save();
  g.translate(x, baseY);

  const trunkW = height * 0.082;
  const trunkTop = -height * 0.52;

  /* trunk with a warm sun-side rim */
  const bark = g.createLinearGradient(-trunkW, 0, trunkW, 0);
  bark.addColorStop(0, "rgba(18,17,13,0.94)");
  bark.addColorStop(0.5, "rgba(9,12,10,0.96)");
  bark.addColorStop(1, "rgba(27,29,21,0.9)");
  g.fillStyle = bark;
  g.beginPath();
  g.moveTo(-trunkW * 0.92, 0);
  g.bezierCurveTo(
    -trunkW * 0.76, -height * 0.2,
    -trunkW * 0.52, -height * 0.36,
    -trunkW * 0.34, trunkTop
  );
  g.lineTo(trunkW * 0.4, trunkTop);
  g.bezierCurveTo(
    trunkW * 0.63, -height * 0.34,
    trunkW * 0.86, -height * 0.16,
    trunkW, 0
  );
  g.closePath();
  g.fill();

  g.strokeStyle = "rgba(255,188,112,0.28)";
  g.lineWidth = Math.max(1.2, trunkW * 0.05);
  g.beginPath();
  g.moveTo(trunkW * 0.98, 0);
  g.bezierCurveTo(
    trunkW * 0.84, -height * 0.16,
    trunkW * 0.62, -height * 0.34,
    trunkW * 0.4, trunkTop
  );
  g.stroke();

  /* bare branches */
  for (let i = 0; i < 6; i++) {
    const by = trunkTop * (0.52 + i * 0.085);
    const len = height * (0.16 + rnd() * 0.26);
    const side = rnd() > 0.5 ? 1 : -1;
    const ex = side * len * (0.5 + rnd() * 0.7);
    const ey = by - height * (0.08 + rnd() * 0.16);
    g.strokeStyle = "rgba(11,14,10,0.9)";
    g.lineWidth = height * (0.01 + rnd() * 0.014);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(side * trunkW * 0.16, by);
    g.quadraticCurveTo(ex * 0.45, by - height * 0.1, ex, ey);
    g.stroke();
  }

  /* canopy mass */
  const canR = height * 0.33;
  const cx = dir * height * 0.15;
  const cy = trunkTop - height * 0.17;
  for (let i = 0; i < 34; i++) {
    const a = rnd() * TAU;
    const rr = Math.pow(rnd(), 0.68) * canR;
    const lx = cx + Math.cos(a) * rr * 0.82 + dir * canR * 0.12;
    const ly = cy + Math.sin(a) * rr * 0.56;
    const size = height * (0.03 + rnd() * 0.085);
    const lit = clamp((-lx * dir + canR) / (canR * 2), 0, 1);
    const warm = lit > 0.62;
    g.fillStyle = warm
      ? `rgba(${62 + Math.floor(rnd() * 18)},${62 + Math.floor(rnd() * 16)},${34 + Math.floor(rnd() * 12)},${0.5 + rnd() * 0.28})`
      : `rgba(${12 + Math.floor(rnd() * 10)},${22 + Math.floor(rnd() * 12)},${16 + Math.floor(rnd() * 8)},${0.62 + rnd() * 0.3})`;
    g.beginPath();
    g.ellipse(lx, ly, size * 1.25, size * 0.68, rnd() * 1.2, 0, TAU);
    g.fill();
  }

  /* sunlit leaf flicks along the inner edge */
  g.strokeStyle = "rgba(255,196,120,0.24)";
  g.lineWidth = 1.1;
  for (let i = 0; i < 18; i++) {
    const lx = cx + dir * canR * (0.35 + rnd() * 0.6);
    const ly = cy + (rnd() - 0.5) * canR * 1.15;
    const len = height * (0.012 + rnd() * 0.03);
    g.beginPath();
    g.moveTo(lx, ly);
    g.quadraticCurveTo(
      lx + dir * len * 0.5, ly - len * 0.4,
      lx + dir * len, ly - len * 0.15
    );
    g.stroke();
  }
  g.restore();
}

function drawCanopyFrame(g, w, h, horizonY) {
  const rnd = mulberry32(88213);
  g.save();
  g.filter = "blur(2.2px)";
  for (let i = 0; i < 24; i++) {
    const side = i % 2 === 0 ? 0 : 1;
    const x = side ? w - rnd() * w * 0.16 : rnd() * w * 0.16;
    const y = -OV + rnd() * h * 0.16;
    const size = 5 + rnd() * 16;
    g.fillStyle = `rgba(${12 + Math.floor(rnd() * 10)},${24 + Math.floor(rnd() * 12)},${17 + Math.floor(rnd() * 8)},${0.35 + rnd() * 0.35})`;
    g.beginPath();
    g.ellipse(x, y, size * 1.5, size * 0.75, rnd() * 1.4, 0, TAU);
    g.fill();
  }
  g.restore();
}

function cloud(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, w * 0.5, h, 0, 0, TAU);
  g.ellipse(x - w * 0.26, y + h * 0.25, w * 0.3, h * 0.72, 0, 0, TAU);
  g.ellipse(x + w * 0.24, y + h * 0.18, w * 0.34, h * 0.8, 0, 0, TAU);
  g.ellipse(x + w * 0.02, y - h * 0.5, w * 0.26, h * 0.7, 0, 0, TAU);
  g.fill();
}

function ridge(g, baseY, amp, color, seed, alpha) {
  const { w } = view;
  const minX = -OV;
  const maxX = w + OV;
  g.save();
  g.globalAlpha = alpha;
  g.beginPath();
  g.moveTo(minX, baseY + amp * 1.8);
  for (let x = minX; x <= maxX; x += 7) {
    const t = x * 0.006 + seed * 1.7;
    const n =
      Math.sin(t) * 0.46 +
      Math.sin(t * 2.17 + 1.9) * 0.28 +
      Math.sin(t * 0.53 + seed) * 0.26;
    const y = baseY - (0.5 + n * 0.5) * amp * 1.25;
    g.lineTo(x, y);
  }
  g.lineTo(maxX, baseY + amp * 1.8);
  g.closePath();
  const grd = g.createLinearGradient(0, baseY - amp * 1.3, 0, baseY + amp);
  grd.addColorStop(0, color);
  grd.addColorStop(1, "rgba(24,44,45,0.9)");
  g.fillStyle = grd;
  g.fill();
  g.restore();
}

function drawPine(g, x, baseY, height, color) {
  const w = height * 0.44;
  g.fillStyle = color;
  g.fillRect(x - height * 0.017, baseY - height * 0.2, height * 0.034, height * 0.2);
  for (let i = 0; i < 4; i++) {
    const y = baseY - height * (0.13 + i * 0.195);
    const tw = w * (1 - i * 0.17);
    const th = height * (0.36 - i * 0.035);
    g.beginPath();
    g.moveTo(x - tw / 2, y);
    g.quadraticCurveTo(x - tw * 0.18, y - th * 0.58, x, y - th);
    g.quadraticCurveTo(x + tw * 0.18, y - th * 0.58, x + tw / 2, y);
    g.closePath();
    g.fill();
  }
}

function drawTreeRow(g, baseY, treeH, color, spacing, seed, alpha) {
  const { w } = view;
  const rnd = mulberry32(seed);
  g.save();
  g.globalAlpha = alpha;
  for (let x = -OV - 20 + rnd() * spacing; x < w + OV + 30; x += spacing * (0.52 + rnd() * 0.95)) {
    const hh = treeH * (0.6 + rnd() * 0.75);
    const y = baseY + (rnd() - 0.5) * treeH * 0.16;
    drawPine(g, x, y, hh, color);
  }
  g.restore();
}

function drawGroundDetail(g, minX, maxX, horizonY, bottom) {
  const { charH, groundY } = layout;
  const rnd = mulberry32(8801);
  const height = bottom - horizonY;

  g.save();
  for (let i = 0; i < 1100; i++) {
    const depth = Math.pow(rnd(), 1.45);
    const y = horizonY + 10 + depth * height;
    const x = minX + rnd() * (maxX - minX);
    const len = (1.2 + depth * 9) * (0.6 + rnd() * 0.9);
    const dark = rnd() > 0.45;
    g.strokeStyle = dark
      ? `rgba(24,44,24,${0.15 + depth * 0.25})`
      : `rgba(214,205,126,${0.05 + depth * 0.14})`;
    g.lineWidth = 0.55 + depth * 1.15;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + (rnd() - 0.5) * len * 0.4,
      y - len * 0.55,
      x + (rnd() - 0.5) * len,
      y - len
    );
    g.stroke();
  }
  g.restore();

  /* slightly larger clumps */
  drawGrassTufts(g, minX, maxX, horizonY, bottom, 55119, 90);

  /* tiny wildflowers */
  const flowerColors = ["#f4e7b4", "#f8d889", "#e6b3a0", "#f2f0cf"];
  for (let i = 0; i < 55; i++) {
    const depth = 0.22 + rnd() * 0.78;
    const y = horizonY + 30 + depth * (height - 40);
    const x = minX + rnd() * (maxX - minX);
    const size = 0.8 + depth * 2;
    const col = flowerColors[Math.floor(rnd() * flowerColors.length)];
    g.fillStyle = `rgba(${col === "#f4e7b4" ? "244,231,180" : col === "#f8d889" ? "248,216,137" : col === "#e6b3a0" ? "230,179,160" : "242,240,207"},${0.5 + depth * 0.4})`;
    g.beginPath();
    g.arc(x, y, size, 0, TAU);
    g.arc(x - size, y, size * 0.7, 0, TAU);
    g.arc(x + size, y, size * 0.7, 0, TAU);
    g.arc(x, y - size, size * 0.7, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(96,74,30,${0.3 + depth * 0.3})`;
    g.beginPath();
    g.arc(x, y, size * 0.45, 0, TAU);
    g.fill();
  }

  /* rocks */
  const rockRnd = mulberry32(777);
  for (let i = 0; i < 9; i++) {
    const depth = 0.15 + rockRnd() * 0.8;
    const y = horizonY + 25 + depth * (height - 45);
    const x = minX + rockRnd() * (maxX - minX);
    const size = (2 + depth * 8) * (0.7 + rockRnd() * 0.8);
    g.save();
    g.translate(x, y);
    g.scale(1, 0.6);
    const rg = g.createLinearGradient(-size, -size, size, size);
    rg.addColorStop(0, "rgba(150,150,126,0.6)");
    rg.addColorStop(1, "rgba(48,58,42,0.7)");
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(0, 0, size, size * 0.75, rockRnd(), 0, TAU);
    g.fill();
    g.restore();
  }

  /* mushrooms near the stump */
  const mrnd = mulberry32(1904);
  for (let i = 0; i < 3; i++) {
    const x = layout.stumpX - charH * (0.26 + mrnd() * 0.13) + i * 6;
    const y = groundY + charH * (0.01 + mrnd() * 0.04);
    const size = charH * (0.012 + mrnd() * 0.008);
    g.fillStyle = "rgba(232,212,178,0.85)";
    g.fillRect(x - size * 0.24, y - size * 0.95, size * 0.48, size * 0.95);
    const cap = g.createLinearGradient(x, y - size * 1.8, x, y - size * 0.8);
    cap.addColorStop(0, "#c77f4f");
    cap.addColorStop(1, "#8d4f2e");
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(x, y - size, size * 1.05, size * 0.72, 0, Math.PI, TAU);
    g.fill();
  }
}

function drawGrassTufts(g, minX, maxX, horizonY, bottom, seed, amount = 55) {
  const rnd = mulberry32(seed);
  const height = bottom - horizonY;
  g.save();
  for (let i = 0; i < amount; i++) {
    const depth = 0.18 + Math.pow(rnd(), 0.8) * 0.82;
    const x = minX + rnd() * (maxX - minX);
    const y = horizonY + 25 + depth * (height - 30);
    const s = 2 + depth * 13;
    g.strokeStyle = `rgba(${rnd() > 0.35 ? "42,64,34" : "92,102,50"},${0.2 + depth * 0.35})`;
    g.lineWidth = 0.7 + depth * 1.5;
    const blades = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < blades; j++) {
      const lean = (rnd() - 0.5) * s * 0.8;
      g.beginPath();
      g.moveTo(x + (rnd() - 0.5) * s * 0.25, y);
      g.quadraticCurveTo(x + lean * 0.4, y - s * 0.55, x + lean, y - s * (0.65 + rnd() * 0.5));
      g.stroke();
    }
  }
  g.restore();
}

function drawCabin(g, x, baseY, size) {
  const w = size * 1.45;
  const bodyH = size * 0.82;
  const y = baseY;
  g.save();

  /* fence */
  g.strokeStyle = "rgba(36,28,20,0.5)";
  g.lineWidth = Math.max(1, size * 0.025);
  for (let i = -4; i <= -1; i++) {
    const fx = x + i * size * 0.24;
    g.beginPath();
    g.moveTo(fx, y);
    g.lineTo(fx, y - size * 0.3);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x - size * 1.0, y - size * 0.22);
  g.lineTo(x - size * 0.2, y - size * 0.22);
  g.stroke();

  /* body */
  const wall = g.createLinearGradient(x - w / 2, y, x + w / 2, y);
  wall.addColorStop(0, "#4e3828");
  wall.addColorStop(0.55, "#3c2a1e");
  wall.addColorStop(1, "#2c1e16");
  g.fillStyle = wall;
  g.fillRect(x - w / 2, y - bodyH, w, bodyH);

  /* log seams */
  g.strokeStyle = "rgba(18,12,9,0.28)";
  g.lineWidth = 0.8;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(x - w / 2, y - (bodyH / 5) * i);
    g.lineTo(x + w / 2, y - (bodyH / 5) * i);
    g.stroke();
  }

  /* roof */
  g.fillStyle = "#2a211a";
  g.beginPath();
  g.moveTo(x - w * 0.62, y - bodyH);
  g.lineTo(x, y - bodyH - size * 0.62);
  g.lineTo(x + w * 0.62, y - bodyH);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,190,120,0.16)";
  g.lineWidth = 1;
  g.stroke();

  /* chimney */
  g.fillStyle = "#33251c";
  g.fillRect(x + w * 0.26, y - bodyH - size * 0.46, size * 0.13, size * 0.34);

  /* window glow */
  const winX = x - w * 0.14;
  const winY = y - bodyH * 0.55;
  const winW = size * 0.26;
  const winH = size * 0.3;
  const halo = g.createRadialGradient(winX, winY, 0, winX, winY, size * 0.8);
  halo.addColorStop(0, "rgba(255,206,120,0.38)");
  halo.addColorStop(0.4, "rgba(255,180,88,0.12)");
  halo.addColorStop(1, "rgba(255,160,70,0)");
  g.fillStyle = halo;
  g.beginPath();
  g.arc(winX, winY, size * 0.8, 0, TAU);
  g.fill();

  g.fillStyle = "#f6c879";
  g.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);
  g.strokeStyle = "rgba(52,32,18,0.8)";
  g.lineWidth = Math.max(1, size * 0.018);
  g.strokeRect(winX - winW / 2, winY - winH / 2, winW, winH);
  g.beginPath();
  g.moveTo(winX, winY - winH / 2);
  g.lineTo(winX, winY + winH / 2);
  g.moveTo(winX - winW / 2, winY);
  g.lineTo(winX + winW / 2, winY);
  g.stroke();

  /* door */
  g.fillStyle = "#2f2117";
  g.fillRect(x + w * 0.18, y - bodyH * 0.66, size * 0.24, bodyH * 0.66);

  g.restore();
}

/* ------------------------------------------------------------------ */
/* particles & camera                                                 */
/* ------------------------------------------------------------------ */

const chips = [];
const dust = [];
const sparks = [];
const rings = [];
const texts = [];

const cam = { x: 0, y: 0, amp: 0, phase: 0 };

let stumpFlash = 0;
let crackT = 0;
const cutMarks = [];

function addShake(amount) {
  if (reducedMotion) return;
  cam.amp = Math.max(cam.amp, amount);
}

function updateCamera(dt) {
  cam.amp *= Math.exp(-dt * 11);
  cam.phase += dt;
  if (cam.amp > 0.15) {
    cam.x = Math.sin(cam.phase * 71) * cam.amp + Math.sin(cam.phase * 39) * cam.amp * 0.35;
    cam.y = Math.cos(cam.phase * 57) * cam.amp * 0.7;
  } else {
    cam.amp = 0;
    cam.x = 0;
    cam.y = 0;
  }
}

function spawnChips(x, y, amount) {
  const count = reducedMotion ? Math.ceil(amount * 0.45) : amount;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * (0.12 + Math.random() * 0.76);
    const speed = (110 + Math.random() * 330) * clamp(layout.s, 0.7, 1.35);
    chips.push({
      x: x + (Math.random() - 0.34) * 26,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 22,
      size: (1.7 + Math.random() * 3.4) * clamp(layout.s, 0.7, 1.3),
      life: 0.7 + Math.random() * 0.65,
      max: 1.35,
      tone: 0.5 + Math.random() * 0.5,
      wedge: Math.random() > 0.45,
    });
  }
}

function spawnDust(x, y, amount) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.PI + (Math.random() - 0.5) * 1.7;
    const speed = 20 + Math.random() * 60;
    dust.push({
      x: x + (Math.random() - 0.5) * 30,
      y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: -20 - Math.random() * 40,
      r: 3 + Math.random() * 7,
      grow: 18 + Math.random() * 36,
      life: 0.5 + Math.random() * 0.45,
      max: 0.95,
      tone: 0.4 + Math.random() * 0.6,
    });
  }
}

function spawnSparks(x, y, amount) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * TAU;
    const speed = (50 + Math.random() * 180) * clamp(layout.s, 0.75, 1.3);
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      size: 1.2 + Math.random() * 2.2,
      life: 0.45 + Math.random() * 0.6,
      max: 1.05,
    });
  }
}

function spawnRing(x, y, maxRadius) {
  rings.push({ x, y, r: 8, max: maxRadius, life: 0.45, maxLife: 0.45 });
}

function addText(text, x, y, size) {
  texts.push({
    text,
    x,
    y,
    vy: -52,
    life: 0.95,
    max: 0.95,
    size: size || clamp(Math.round(view.h * 0.033), 20, 36),
  });
}

function updateEffects(dt) {
  updateCamera(dt);
  stumpFlash = Math.max(0, stumpFlash - dt * 5.2);
  crackT = Math.max(0, crackT - dt * 1.05);

  for (let i = chips.length - 1; i >= 0; i--) {
    const p = chips[i];
    p.vy += 1500 * dt;
    p.vx *= 1 - dt * 1.2;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
    const floor = layout.groundY + 2;
    if (p.y > floor && p.vy > 0) {
      p.y = floor;
      p.vy *= -0.32;
      p.vx *= 0.62;
      p.vr *= 0.55;
      if (Math.abs(p.vy) < 34) p.vy = 0;
    }
    if (p.life <= 0) chips.splice(i, 1);
  }

  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 6 * dt;
    p.r += p.grow * dt;
    p.life -= dt;
    if (p.life <= 0) dust.splice(i, 1);
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 2.2;
    p.vy *= 1 - dt * 2.2;
    p.vy -= 12 * dt;
    p.life -= dt;
    if (p.life <= 0) sparks.splice(i, 1);
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const p = rings[i];
    p.life -= dt;
    const k = 1 - p.life / p.maxLife;
    p.r = 8 + (p.max - 8) * easeOutCubic(k);
    if (p.life <= 0) rings.splice(i, 1);
  }

  for (let i = texts.length - 1; i >= 0; i--) {
    const p = texts[i];
    p.life -= dt;
    p.y += p.vy * dt;
    p.vy *= 1 - dt * 1.3;
    if (p.life <= 0) texts.splice(i, 1);
  }

  updatePile(dt);
  updateLeaves(dt);
}

/* ------------------------------------------------------------------ */
/* ambience                                                           */
/* ------------------------------------------------------------------ */

const MOTE_SEEDS = [];
const FIREFLY_SEEDS = [];
const BIRD_SEEDS = [];

(function seedAmbience() {
  const r = mulberry32(31337);
  for (let i = 0; i < 34; i++) {
    MOTE_SEEDS.push({
      x: r(),
      y: r(),
      size: 0.6 + r() * 1.6,
      speed: 0.1 + r() * 0.24,
      phase: r() * TAU,
      drift: 12 + r() * 34,
    });
  }
  for (let i = 0; i < 9; i++) {
    FIREFLY_SEEDS.push({
      x: 0.08 + r() * 0.84,
      y: 0.2 + r() * 0.65,
      phase: r() * TAU,
      speed: 0.25 + r() * 0.35,
      range: 10 + r() * 26,
    });
  }
  for (let i = 0; i < 3; i++) {
    BIRD_SEEDS.push({
      y: 0.12 + r() * 0.2,
      speed: 0.008 + r() * 0.014,
      offset: r(),
      phase: r() * TAU,
      size: 0.7 + r() * 0.7,
    });
  }
})();

const leaves = [];
function initLeaves() {
  leaves.length = 0;
  const amount = reducedMotion ? 2 : 5;
  for (let i = 0; i < amount; i++) {
    leaves.push(makeLeaf(true));
  }
}

function makeLeaf(anywhere) {
  return {
    x: Math.random() * view.w,
    y: anywhere ? layout.horizonY + Math.random() * (view.h - layout.horizonY) : -20,
    vx: -16 - Math.random() * 22,
    vy: 10 + Math.random() * 20,
    rot: Math.random() * TAU,
    vr: (Math.random() - 0.5) * 2.4,
    size: 2.6 + Math.random() * 3.4,
    sway: Math.random() * TAU,
    tone: Math.random(),
  };
}

function updateLeaves(dt) {
  for (const leaf of leaves) {
    leaf.sway += dt * 1.6;
    leaf.x += (leaf.vx + Math.sin(leaf.sway) * 12) * dt;
    leaf.y += leaf.vy * dt;
    leaf.rot += leaf.vr * dt;
    if (leaf.y > view.h + 30 || leaf.x < -30) {
      Object.assign(leaf, makeLeaf(false));
      leaf.x = view.w + 20 + Math.random() * 80;
    }
  }
}

function drawRays(t) {
  const { sunX, sunY } = layout;
  const w = view.w;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(sunX, sunY);
  for (let i = 0; i < 7; i++) {
    const a = 0.13 + i * 0.105 + Math.sin(t * 0.11 + i * 1.7) * 0.012;
    const len = w * 1.35;
    const width = w * (0.018 + (i % 3) * 0.014);
    const alpha = 0.014 + 0.012 * (0.5 + 0.5 * Math.sin(t * 0.3 + i * 1.4));
    const grd = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    grd.addColorStop(0, `rgba(255,213,148,${alpha * 2.4})`);
    grd.addColorStop(0.35, `rgba(255,194,118,${alpha})`);
    grd.addColorStop(1, "rgba(255,178,96,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len - Math.sin(a) * width, Math.sin(a) * len + Math.cos(a) * width);
    ctx.lineTo(Math.cos(a) * len + Math.sin(a) * width, Math.sin(a) * len - Math.cos(a) * width);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMist(t) {
  const { horizonY } = layout;
  const w = view.w;
  const h = view.h;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const drift = Math.sin(t * 0.028 + i * 2.1) * w * 0.13;
    const cx = w * (0.2 + i * 0.32) + drift;
    const cy = horizonY + h * (0.012 + i * 0.013);
    const rx = w * (0.34 + i * 0.09);
    const ry = h * 0.03;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grd.addColorStop(0, "rgba(255,214,162,0.075)");
    grd.addColorStop(0.55, "rgba(226,207,176,0.035)");
    grd.addColorStop(1, "rgba(220,206,180,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBirds(t) {
  const { horizonY } = layout;
  const w = view.w;
  ctx.save();
  ctx.strokeStyle = "rgba(26,38,39,0.42)";
  ctx.lineCap = "round";
  for (const b of BIRD_SEEDS) {
    const x = ((b.offset * (w + 180) + t * b.speed * (w + 180)) % (w + 180)) - 90;
    const y = horizonY - view.h * (0.2 + b.y) + Math.sin(t * 0.6 + b.phase) * 5;
    const flap = Math.sin(t * 5.2 + b.phase);
    const size = view.h * 0.008 * b.size;
    ctx.lineWidth = Math.max(1, size * 0.3);
    ctx.beginPath();
    ctx.moveTo(x - size, y + flap * size * 0.3);
    ctx.quadraticCurveTo(x - size * 0.4, y - size * 0.4, x, y);
    ctx.quadraticCurveTo(x + size * 0.4, y - size * 0.4, x + size, y + flap * size * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMotes(t) {
  const { horizonY } = layout;
  const w = view.w;
  const h = view.h;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of MOTE_SEEDS) {
    const x = ((m.x * w + Math.sin(t * m.speed + m.phase) * m.drift + w * 1.2) % (w + 40)) - 20;
    const y =
      horizonY +
      (h - horizonY) * (0.08 + m.y * 0.78) +
      Math.sin(t * m.speed * 1.4 + m.phase * 2) * 8;
    const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.phase * 3));
    ctx.fillStyle = `rgba(255,224,165,${0.075 * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, m.size * 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,239,201,${0.32 * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, m.size * 0.75, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFireflies(t) {
  const { horizonY, groundY, charH } = layout;
  const w = view.w;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const f of FIREFLY_SEEDS) {
    const x = f.x * w + Math.sin(t * f.speed + f.phase) * f.range;
    const baseY = horizonY + (groundY - horizonY) * (0.18 + f.y * 0.85);
    const y = baseY + Math.cos(t * f.speed * 1.3 + f.phase * 2) * f.range * 0.45;
    const blink = Math.pow(0.5 + 0.5 * Math.sin(t * 1.8 + f.phase * 4), 3);
    if (blink < 0.02) continue;
    const r = charH * 0.006 + 1.1;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 9);
    grd.addColorStop(0, `rgba(255,238,168,${0.75 * blink})`);
    grd.addColorStop(0.25, `rgba(255,212,110,${0.34 * blink})`);
    grd.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,248,206,${0.9 * blink})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawLeaves(t) {
  ctx.save();
  for (const leaf of leaves) {
    const alpha = 0.3 + leaf.tone * 0.28;
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.rot);
    ctx.fillStyle =
      leaf.tone > 0.55
        ? `rgba(201,124,58,${alpha})`
        : `rgba(176,142,64,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, -leaf.size);
    ctx.quadraticCurveTo(leaf.size * 0.9, 0, 0, leaf.size);
    ctx.quadraticCurveTo(-leaf.size * 0.9, 0, 0, -leaf.size);
    ctx.fill();
    ctx.strokeStyle = `rgba(90,52,20,${alpha * 0.7})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -leaf.size * 0.8);
    ctx.lineTo(0, leaf.size * 0.8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* foreground & shadows                                               */
/* ------------------------------------------------------------------ */

function foregroundClump(g, x, y, height, dir, seed) {
  const rnd = mulberry32(seed * 991 + 17);
  g.save();
  g.translate(x, y);
  for (let i = 0; i < 13; i++) {
    const bx = (rnd() - 0.5) * height * 0.95;
    const hgt = height * (0.4 + rnd() * 0.85);
    const lean = dir * height * (0.1 + rnd() * 0.6);
    const dark = 8 + Math.floor(rnd() * 12);
    g.strokeStyle = `rgba(${dark},${24 + Math.floor(rnd() * 12)},${16 + Math.floor(rnd() * 8)},${0.45 + rnd() * 0.4})`;
    g.lineWidth = height * (0.008 + rnd() * 0.02);
    g.beginPath();
    g.moveTo(bx, 0);
    g.quadraticCurveTo(bx + lean * 0.15, -hgt * 0.62, bx + lean, -hgt);
    g.stroke();
  }
  g.restore();
}

function drawForeground(t) {
  const { w, h } = view;
  const base = h + 12;
  ctx.save();
  ctx.lineCap = "round";
  const clusters = [
    { x: -14, dir: 1, height: h * 0.2, seed: 3, alpha: 0.9 },
    { x: w + 14, dir: -1, height: h * 0.18, seed: 8, alpha: 0.85 },
  ];
  if (w > h * 1.3) {
    clusters.push({ x: w * 0.5, dir: 1, height: h * 0.14, seed: 14, alpha: 0.55 });
  }
  for (const c of clusters) {
    const rnd = mulberry32(c.seed * 701 + 5);
    ctx.save();
    ctx.translate(c.x, base);
    for (let i = 0; i < 9; i++) {
      const bx = (rnd() - 0.5) * c.height * 0.8;
      const hgt = c.height * (0.5 + rnd() * 0.75);
      const lean = c.dir * c.height * (0.25 + rnd() * 0.7);
      const sway = Math.sin(t * 0.85 + rnd() * TAU + i) * c.height * 0.035;
      const dark = 10 + Math.floor(rnd() * 10);
      ctx.strokeStyle = `rgba(${dark},${25 + Math.floor(rnd() * 10)},${17 + Math.floor(rnd() * 8)},${c.alpha * (0.45 + rnd() * 0.4)})`;
      ctx.lineWidth = c.height * (0.012 + rnd() * 0.024);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.quadraticCurveTo(bx + lean * 0.2 + sway, -hgt * 0.6, bx + lean + sway, -hgt);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function softShadow(cx, cy, rx, ry, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  grd.addColorStop(0, `rgba(10,18,10,${alpha})`);
  grd.addColorStop(0.55, `rgba(10,18,10,${alpha * 0.55})`);
  grd.addColorStop(1, "rgba(10,18,10,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawShadows() {
  const { stumpX, charX, groundY, s, pileX } = layout;
  softShadow(stumpX + 24 * s, groundY + 3, 82 * s, 19 * s, 0.38);
  softShadow(charX + 30 * s, groundY + 4, 112 * s, 25 * s, 0.4);
  softShadow(pileX + 16 * s, groundY + 3, 74 * s, 16 * s, 0.28);
}

/* ------------------------------------------------------------------ */
/* wood pile                                                          */
/* ------------------------------------------------------------------ */

let pileLogs = [];

function pileTarget() {
  return clamp(2 + Math.floor(count / 2), 2, 12);
}

function anchorPile() {
  const target = pileTarget();
  pileLogs = [];
  for (let i = 0; i < target; i++) pileLogs.push({ drop: 0 });
}

function syncPile() {
  const target = pileTarget();
  while (pileLogs.length < target) pileLogs.push({ drop: 1 });
  while (pileLogs.length > target) pileLogs.pop();
}

function updatePile(dt) {
  for (const log of pileLogs) {
    if (log.drop > 0) log.drop = Math.max(0, log.drop - dt * 2.6);
  }
}

function drawWoodpile() {
  const { pileX, groundY, s } = layout;
  const rows = [4, 3, 3, 2];
  ctx.save();
  ctx.translate(pileX, groundY + 2);
  ctx.scale(s, s);
  let index = 0;
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r];
    for (let c = 0; c < n; c++) {
      if (index >= pileLogs.length) break;
      const drop = pileLogs[index].drop;
      const x = (c - (n - 1) / 2) * 25 + (r % 2 ? 3 : 0);
      const y = -10 - r * 18 - Math.pow(drop, 1.35) * 74;
      drawLog(x, y, index, drop);
      index++;
    }
  }
  ctx.restore();
}

function drawLog(x, y, index, drop) {
  const jitter = ((index * 37) % 11) / 11 - 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(jitter * 0.05);
  const body = ctx.createLinearGradient(0, -10, 0, 10);
  body.addColorStop(0, "#a8733f");
  body.addColorStop(0.35, "#8b5a31");
  body.addColorStop(0.72, "#6d4426");
  body.addColorStop(1, "#4e2f1b");
  ctx.fillStyle = body;
  roundRectPath(ctx, -27, -9.5, 54, 19, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(42,24,12,0.4)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  /* bark grain */
  ctx.strokeStyle = "rgba(45,26,13,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-20, -4 + i * 4 + jitter);
    ctx.bezierCurveTo(-8, -6 + i * 4, 8, -3 + i * 4, 23, -5 + i * 4 + jitter);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,213,158,0.2)";
  ctx.beginPath();
  ctx.moveTo(-22, -7.6);
  ctx.lineTo(20, -7.6);
  ctx.stroke();

  /* cut end */
  const end = ctx.createRadialGradient(-25, 0, 0, -25, 0, 8);
  end.addColorStop(0, "#f1c98d");
  end.addColorStop(0.7, "#d4a165");
  end.addColorStop(1, "#a8763f");
  ctx.fillStyle = end;
  ctx.beginPath();
  ctx.ellipse(-26, 0, 4.3, 9.2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(122,80,38,0.6)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(-26, 0, 2.2, 4.8, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/* ------------------------------------------------------------------ */
/* stump                                                              */
/* ------------------------------------------------------------------ */

function drawStump(t) {
  const { stumpX, groundY, s } = layout;
  ctx.save();
  ctx.translate(stumpX, groundY);
  ctx.scale(s, s);

  /* roots */
  ctx.fillStyle = "#4c3220";
  ctx.beginPath();
  ctx.ellipse(-53, -1, 21, 7, 0.16, 0, TAU);
  ctx.ellipse(52, -1, 20, 7, -0.16, 0, TAU);
  ctx.ellipse(0, 1, 58, 8, 0, 0, TAU);
  ctx.fill();

  /* body */
  const body = ctx.createLinearGradient(-52, 0, 54, 0);
  body.addColorStop(0, "#7d5433");
  body.addColorStop(0.28, "#6b462b");
  body.addColorStop(0.62, "#52341f");
  body.addColorStop(1, "#3e2717");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-52, -63);
  ctx.bezierCurveTo(-58, -48, -60, -24, -64, -3);
  ctx.quadraticCurveTo(-30, 9, 0, 9);
  ctx.quadraticCurveTo(30, 9, 64, -3);
  ctx.bezierCurveTo(60, -24, 58, -48, 52, -63);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(32,18,9,0.5)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  /* bark grain clipped to body */
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(34,19,9,0.34)";
  ctx.lineWidth = 1.3;
  const rnd = mulberry32(6001);
  for (let i = 0; i < 16; i++) {
    const x = -60 + i * 8 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(x, -60);
    ctx.bezierCurveTo(x + 3, -40, x - 4, -22, x + 2, 6);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,205,150,0.13)";
  for (let i = 0; i < 5; i++) {
    const x = -48 + i * 24;
    ctx.beginPath();
    ctx.moveTo(x, -58);
    ctx.quadraticCurveTo(x + 6, -30, x + 2, 2);
    ctx.stroke();
  }

  /* knots */
  for (const k of [{ x: -30, y: -30 }, { x: 26, y: -42 }]) {
    ctx.fillStyle = "rgba(40,23,11,0.55)";
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, 6, 9, 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(126,84,45,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, 10, 14, 0.2, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  /* top cut face */
  const top = ctx.createLinearGradient(-50, -80, 50, -45);
  top.addColorStop(0, "#e5b97c");
  top.addColorStop(0.45, "#cf9b5d");
  top.addColorStop(1, "#a97440");
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(0, -64, 54, 18, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,58,28,0.6)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  /* dark lip under the cut face */
  ctx.strokeStyle = "rgba(50,29,13,0.55)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(0, -63.4, 53, 17.6, 0, 0.08, Math.PI - 0.08);
  ctx.stroke();

  /* rings */
  ctx.strokeStyle = "rgba(126,78,36,0.42)";
  for (let i = 1; i <= 4; i++) {
    ctx.lineWidth = i === 1 ? 1.4 : 1;
    ctx.beginPath();
    ctx.ellipse(2, -64, 10 + i * 9.4, 3.4 + i * 3.1, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,233,192,0.32)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(2, -64, 11 + i * 9.4, 3.7 + i * 3.1, 0, 0, TAU);
    ctx.stroke();
  }

  /* radial checking cracks */
  ctx.strokeStyle = "rgba(107,63,28,0.5)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.31 + 0.4;
    ctx.beginPath();
    ctx.moveTo(2 + Math.cos(a) * 5, -64 + Math.sin(a) * 1.8);
    ctx.lineTo(2 + Math.cos(a) * 49, -64 + Math.sin(a) * 16);
    ctx.stroke();
  }

  /* fresh chop marks */
  for (let i = 0; i < cutMarks.length; i++) {
    const m = cutMarks[i];
    const age = clamp(1 - i / (cutMarks.length + 1), 0.25, 1);
    ctx.strokeStyle = `rgba(76,41,16,${0.24 + age * 0.3})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(m.x - 8, -67);
    ctx.quadraticCurveTo(m.x, -61, m.x + 9, -66);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,229,177,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(m.x - 7, -68);
    ctx.quadraticCurveTo(m.x, -63.6, m.x + 8, -67);
    ctx.stroke();
  }

  /* axe bite / bright edge when freshly hit */
  if (crackT > 0) {
    const a = crackT / 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(255,244,211,${0.55 * a})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-26, -70);
    ctx.quadraticCurveTo(0, -60, 28, -69);
    ctx.stroke();
    ctx.restore();
  }

  /* moss */
  const moss = ctx.createLinearGradient(-54, -68, -10, -50);
  moss.addColorStop(0, "rgba(83,112,45,0.95)");
  moss.addColorStop(1, "rgba(52,78,34,0.7)");
  ctx.fillStyle = moss;
  ctx.beginPath();
  ctx.ellipse(-41, -65, 13, 5.5, -0.2, 0, TAU);
  ctx.ellipse(-30, -58, 8, 3.5, 0.35, 0, TAU);
  ctx.fill();

  /* tiny leaf on the stump */
  ctx.save();
  ctx.translate(31, -76);
  ctx.rotate(-0.5 + Math.sin(t * 0.7) * 0.08);
  ctx.fillStyle = "rgba(173,116,49,0.9)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 2.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* character                                                          */
/* ------------------------------------------------------------------ */

const POSE_WINDUP = {
  hipX: 2,
  hipDrop: 3,
  lean: 0.075,
  gripX: 31,
  gripY: -229,
  axeAngle: -62 * DEG,
  headTilt: -0.035,
  squint: 0.12,
  mouth: 0,
};

const POSE_HIT = {
  hipX: -5,
  hipDrop: 9,
  lean: -0.155,
  gripX: -88,
  gripY: -150,
  axeAngle: -225 * DEG,
  headTilt: 0.085,
  squint: 0.86,
  mouth: 0.55,
};

function idlePose(t) {
  const b = Math.sin(t * 1.55);
  return {
    hipX: 0,
    hipDrop: 0.5 + b * 0.45,
    lean: 0.008 + b * 0.006,
    gripX: 16,
    gripY: -184 + b * 1.4,
    axeAngle: -56 * DEG + b * 0.016,
    headTilt: 0.015 + Math.sin(t * 0.8) * 0.012,
    squint: 0,
    mouth: 0,
  };
}

function mixPose(a, b, k) {
  return {
    hipX: lerp(a.hipX, b.hipX, k),
    hipDrop: lerp(a.hipDrop, b.hipDrop, k),
    lean: lerp(a.lean, b.lean, k),
    gripX: lerp(a.gripX, b.gripX, k),
    gripY: lerp(a.gripY, b.gripY, k),
    axeAngle: lerp(a.axeAngle, b.axeAngle, k),
    headTilt: lerp(a.headTilt, b.headTilt, k),
    squint: lerp(a.squint, b.squint, k),
    mouth: lerp(a.mouth, b.mouth, k),
  };
}

function strikePose(k) {
  const p = {
    hipX: lerp(POSE_WINDUP.hipX, POSE_HIT.hipX, k),
    hipDrop: lerp(POSE_WINDUP.hipDrop, POSE_HIT.hipDrop, k),
    lean: lerp(POSE_WINDUP.lean, POSE_HIT.lean, k),
    gripX: lerp(lerp(POSE_WINDUP.gripX, 30, k), lerp(30, POSE_HIT.gripX, k), k),
    gripY: lerp(lerp(POSE_WINDUP.gripY, -430, k), lerp(-430, POSE_HIT.gripY, k), k),
    axeAngle: lerp(POSE_WINDUP.axeAngle, POSE_HIT.axeAngle, k),
    headTilt: lerp(POSE_WINDUP.headTilt, POSE_HIT.headTilt, k),
    squint: lerp(POSE_WINDUP.squint, POSE_HIT.squint, k),
    mouth: lerp(POSE_WINDUP.mouth, POSE_HIT.mouth, k),
  };
  return p;
}

function recoveryPose(k, idle) {
  const gripX = lerp(lerp(POSE_HIT.gripX, -20, k), lerp(-20, idle.gripX, k), k);
  const gripY = lerp(lerp(POSE_HIT.gripY, -245, k), lerp(-245, idle.gripY, k), k);
  return {
    hipX: lerp(POSE_HIT.hipX, idle.hipX, k),
    hipDrop: lerp(POSE_HIT.hipDrop, idle.hipDrop, k),
    lean: lerp(POSE_HIT.lean, idle.lean, k),
    gripX,
    gripY,
    axeAngle: lerp(POSE_HIT.axeAngle, idle.axeAngle, k),
    headTilt: lerp(POSE_HIT.headTilt, idle.headTilt, k),
    squint: lerp(POSE_HIT.squint, idle.squint, k),
    mouth: lerp(POSE_HIT.mouth, idle.mouth, k),
  };
}

function currentPose(t) {
  const idle = idlePose(t);
  if (swing.t < 0) return idle;

  const wt = swing.t;
  if (wt < CHOP.windup) {
    return mixPose(swing.from || idle, POSE_WINDUP, easeOutCubic(wt / CHOP.windup));
  }
  if (wt < CHOP.impactAt) {
    const q = (wt - CHOP.windup) / CHOP.strike;
    return strikePose(Math.pow(q, 1.55));
  }
  if (wt < CHOP.impactAt + CHOP.hold) {
    const h = (wt - CHOP.impactAt) / CHOP.hold;
    const decay = Math.exp(-h * 7);
    return {
      ...POSE_HIT,
      lean: POSE_HIT.lean + Math.sin(h * 44) * 0.014 * decay,
      hipDrop: POSE_HIT.hipDrop + Math.sin(h * 39) * 1.1 * decay,
      axeAngle: POSE_HIT.axeAngle + Math.sin(h * 36) * 0.02 * decay,
      squint: 0.86,
      mouth: 0.55,
    };
  }
  const r = clamp(
    (wt - CHOP.impactAt - CHOP.hold) / CHOP.recover,
    0,
    1
  );
  return recoveryPose(easeInOutCubic(r), idle);
}

function solveIK(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax;
  const dy = by - ay;
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.acos(cosA);
  const ang = base + bend * a;
  return { x: ax + Math.cos(ang) * l1, y: ay + Math.sin(ang) * l1 };
}

function drawCharacter(t) {
  const { charX, groundY, s } = layout;
  const pose = currentPose(t);
  const hip = { x: pose.hipX, y: -128 + pose.hipDrop };
  const cos = Math.cos(pose.lean);
  const sin = Math.sin(pose.lean);
  const rotate = (x, y) => ({
    x: hip.x + x * cos - y * sin,
    y: hip.y + x * sin + y * cos,
  });

  ctx.save();
  ctx.translate(charX, groundY);
  ctx.scale(s, s);

  drawLegs(hip);

  const shoulderFront = rotate(-3, -94);
  const shoulderBack = rotate(13, -91);

  const dirX = Math.cos(pose.axeAngle);
  const dirY = Math.sin(pose.axeAngle);
  const grip = { x: pose.gripX, y: pose.gripY };
  const backHand = { x: grip.x - dirX * 13, y: grip.y - dirY * 13 };

  drawArm(shoulderBack, backHand, true);

  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(pose.lean);
  drawTorso(t, pose);
  ctx.restore();

  /* the near arm sits behind the head so the face stays readable */
  drawArm(shoulderFront, grip, false);

  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(pose.lean);
  drawHead(t, pose);
  ctx.restore();

  drawAxe(grip, pose.axeAngle);
  drawHand(backHand, true);
  drawHand(grip, false);

  ctx.restore();
}

function drawLegs(hip) {
  drawLeg(hip, 31, -4, true);
  drawLeg(hip, -30, -4, false);
}

function drawLeg(hip, footX, footY, back) {
  const foot = { x: footX, y: footY };
  const knee = solveIK(hip.x, hip.y, foot.x, foot.y, 68, 64, 1);
  const pants = back ? "#38424f" : "#485568";
  const pantsDark = back ? "#2c3440" : "#394556";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokeLine(hip, knee, 27, "rgba(30,24,18,0.35)");
  strokeLine(knee, foot, 22, "rgba(30,24,18,0.3)");

  const thigh = ctx.createLinearGradient(hip.x - 14, 0, hip.x + 14, 0);
  thigh.addColorStop(0, pants);
  thigh.addColorStop(1, pantsDark);
  strokeLine(hip, knee, 23, thigh);

  const shin = ctx.createLinearGradient(knee.x - 12, 0, knee.x + 12, 0);
  shin.addColorStop(0, pants);
  shin.addColorStop(1, pantsDark);
  strokeLine(knee, { x: foot.x, y: foot.y - 6 }, 18, shin);

  /* rolled cuff */
  ctx.strokeStyle = back ? "#4b5564" : "#5d6a7c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(foot.x - 9, foot.y - 18);
  ctx.lineTo(foot.x + 9, foot.y - 18);
  ctx.stroke();

  /* boot */
  ctx.save();
  ctx.translate(foot.x, foot.y);
  const boot = ctx.createLinearGradient(0, -26, 0, 2);
  boot.addColorStop(0, back ? "#4a3525" : "#5b412c");
  boot.addColorStop(0.65, back ? "#3a291c" : "#483322");
  boot.addColorStop(1, "#2b1d13");
  ctx.fillStyle = boot;
  roundRectPath(ctx, -9, -24, 18, 22, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-7, -4, 21, 9.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(28,18,10,0.5)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,211,153,0.18)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.quadraticCurveTo(-7, -13, 5, -9);
  ctx.stroke();
  /* sole */
  ctx.strokeStyle = "rgba(22,14,8,0.65)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(-7, -3, 20, 9, 0, 0.15, Math.PI - 0.05);
  ctx.stroke();
  /* laces */
  ctx.strokeStyle = "rgba(227,188,130,0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-5, -18 + i * 5);
    ctx.lineTo(5, -16 + i * 5);
    ctx.stroke();
  }
  ctx.restore();
}

function strokeLine(a, b, width, style) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawTorso(t, pose) {
  const path = new Path2D();
  path.moveTo(-27, 3);
  path.bezierCurveTo(-33, -25, -33, -63, -30, -82);
  path.bezierCurveTo(-29, -96, -16, -102, 0, -102);
  path.bezierCurveTo(16, -102, 29, -96, 30, -82);
  path.bezierCurveTo(33, -63, 33, -25, 27, 3);
  path.closePath();

  const shirt = ctx.createLinearGradient(-34, 0, 34, 0);
  shirt.addColorStop(0, "#c65743");
  shirt.addColorStop(0.42, "#b04435");
  shirt.addColorStop(0.82, "#8e332a");
  shirt.addColorStop(1, "#71251f");
  ctx.fillStyle = shirt;
  ctx.fill(path);
  ctx.strokeStyle = "rgba(48,20,14,0.4)";
  ctx.lineWidth = 1.6;
  ctx.stroke(path);

  /* plaid */
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = "rgba(74,24,20,0.32)";
  ctx.lineWidth = 3.5;
  for (let x = -42; x <= 42; x += 13) {
    ctx.beginPath();
    ctx.moveTo(x, -108);
    ctx.lineTo(x, 8);
    ctx.stroke();
  }
  for (let y = -108; y <= 8; y += 13) {
    ctx.beginPath();
    ctx.moveTo(-42, y);
    ctx.lineTo(42, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,225,190,0.11)";
  ctx.lineWidth = 1.2;
  for (let x = -38; x <= 42; x += 13) {
    ctx.beginPath();
    ctx.moveTo(x + 4, -108);
    ctx.lineTo(x + 4, 8);
    ctx.stroke();
  }
  for (let y = -104; y <= 8; y += 13) {
    ctx.beginPath();
    ctx.moveTo(-42, y + 4);
    ctx.lineTo(42, y + 4);
    ctx.stroke();
  }

  /* side shading */
  const shade = ctx.createLinearGradient(-35, 0, 35, 0);
  shade.addColorStop(0, "rgba(255,214,160,0.16)");
  shade.addColorStop(0.28, "rgba(255,214,160,0)");
  shade.addColorStop(0.72, "rgba(30,8,4,0)");
  shade.addColorStop(1, "rgba(30,8,4,0.28)");
  ctx.fillStyle = shade;
  ctx.fillRect(-44, -110, 88, 120);
  ctx.restore();

  /* collar */
  ctx.fillStyle = "#e7b287";
  ctx.beginPath();
  ctx.moveTo(-10, -101);
  ctx.lineTo(0, -87);
  ctx.lineTo(10, -101);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7e2a22";
  ctx.beginPath();
  ctx.moveTo(-13, -102);
  ctx.lineTo(-3, -84);
  ctx.lineTo(-9, -82);
  ctx.lineTo(-17, -99);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, -102);
  ctx.lineTo(3, -84);
  ctx.lineTo(9, -82);
  ctx.lineTo(17, -99);
  ctx.closePath();
  ctx.fill();

  /* apron straps */
  ctx.strokeStyle = "#5b3a25";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-20, -91);
  ctx.lineTo(-17, -58);
  ctx.moveTo(20, -91);
  ctx.lineTo(17, -58);
  ctx.stroke();

  /* apron */
  const apron = new Path2D();
  apron.moveTo(-19, -58);
  apron.lineTo(19, -58);
  apron.lineTo(23, -8);
  apron.quadraticCurveTo(0, 3, -23, -8);
  apron.closePath();
  const leather = ctx.createLinearGradient(-23, -58, 23, 0);
  leather.addColorStop(0, "#7b5335");
  leather.addColorStop(0.55, "#674329");
  leather.addColorStop(1, "#4b2f1c");
  ctx.fillStyle = leather;
  ctx.fill(apron);
  ctx.strokeStyle = "rgba(42,24,12,0.45)";
  ctx.lineWidth = 1.3;
  ctx.stroke(apron);

  ctx.save();
  ctx.clip(apron);
  ctx.strokeStyle = "rgba(34,19,10,0.25)";
  ctx.lineWidth = 1;
  for (let y = -48; y < 0; y += 8) {
    ctx.beginPath();
    ctx.moveTo(-26, y);
    ctx.bezierCurveTo(-8, y - 2, 9, y + 2, 26, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,218,170,0.15)";
  ctx.beginPath();
  ctx.moveTo(-17, -52);
  ctx.lineTo(-21, -6);
  ctx.stroke();
  ctx.restore();

  /* stitching */
  ctx.save();
  ctx.strokeStyle = "rgba(255,214,158,0.32)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3.5]);
  ctx.beginPath();
  ctx.moveTo(-16, -54);
  ctx.lineTo(-19, -9);
  ctx.quadraticCurveTo(0, 0, 19, -9);
  ctx.lineTo(16, -54);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  /* pocket */
  ctx.fillStyle = "rgba(48,29,15,0.35)";
  roundRectPath(ctx, 1, -39, 13, 15, 2.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,210,150,0.2)";
  ctx.stroke();

  /* belt */
  ctx.fillStyle = "#3c2a1b";
  roundRectPath(ctx, -30, -31, 60, 10, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(18,10,5,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#d8a759";
  roundRectPath(ctx, -5, -33, 10, 14, 2.5);
  ctx.fill();
  ctx.fillStyle = "#3c2a1b";
  roundRectPath(ctx, -2, -30, 4, 8, 1.2);
  ctx.fill();

  /* shoulder rim light */
  ctx.strokeStyle = "rgba(255,201,136,0.38)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-30, -82);
  ctx.bezierCurveTo(-29, -96, -16, -102, 0, -102);
  ctx.stroke();
}

function drawHead(t, pose) {
  const blinkPhase = (t + 1.9) % 4.4;
  let blink = 0;
  if (blinkPhase > 4.19) blink = Math.sin(((blinkPhase - 4.19) / 0.21) * Math.PI);
  const eyeOpen = clamp(1 - Math.max(blink, pose.squint * 0.92), 0.06, 1);

  ctx.save();
  ctx.translate(0, -132);
  ctx.rotate(pose.headTilt);

  /* neck */
  ctx.fillStyle = "#cd8f66";
  roundRectPath(ctx, -9, 22, 18, 17, 5);
  ctx.fill();

  /* ear */
  const ear = ctx.createLinearGradient(18, -6, 30, 10);
  ear.addColorStop(0, "#e9b78c");
  ear.addColorStop(1, "#c4835c");
  ctx.fillStyle = ear;
  ctx.beginPath();
  ctx.ellipse(25, 2, 6.4, 9, -0.08, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(99,55,30,0.45)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,68,40,0.45)";
  ctx.beginPath();
  ctx.arc(25.5, 2, 3.2, -1.2, 1.7);
  ctx.stroke();

  /* face */
  const face = ctx.createRadialGradient(-10, -9, 2, 0, 4, 42);
  face.addColorStop(0, "#f4cba3");
  face.addColorStop(0.55, "#e9b287");
  face.addColorStop(1, "#cf9167");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(0, 0, 27.5, 29.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(92,51,28,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  /* warm rim light on the sun-facing side */
  ctx.strokeStyle = "rgba(255,214,158,0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 27.2, 29.2, 0, 2.05, 4.15);
  ctx.stroke();

  /* sideburn tucked under the beanie, flowing into the beard */
  ctx.fillStyle = "#6b4128";
  ctx.beginPath();
  ctx.moveTo(19, -15);
  ctx.bezierCurveTo(28, -11, 31, 1, 27, 10);
  ctx.bezierCurveTo(24, 4, 22, -5, 19, -15);
  ctx.closePath();
  ctx.fill();

  /* beard */
  const beard = ctx.createLinearGradient(-26, -2, 26, 30);
  beard.addColorStop(0, "#7d4d2d");
  beard.addColorStop(0.55, "#633a22");
  beard.addColorStop(1, "#4c2b19");
  ctx.fillStyle = beard;
  ctx.beginPath();
  ctx.moveTo(-27, -2);
  ctx.bezierCurveTo(-28, 14, -18, 30, -2, 33);
  ctx.bezierCurveTo(13, 35, 27, 23, 28, 3);
  ctx.bezierCurveTo(19, 8, 9, 6, 0, 6);
  ctx.bezierCurveTo(-11, 6, -21, 6, -27, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(58,30,15,0.45)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  /* beard strands */
  ctx.strokeStyle = "rgba(156,103,61,0.4)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-14 + i * 7, 12 + (i % 2) * 4);
    ctx.quadraticCurveTo(-11 + i * 7, 22, -8 + i * 7, 28);
    ctx.stroke();
  }

  /* moustache */
  ctx.fillStyle = "#57321d";
  ctx.beginPath();
  ctx.moveTo(-23, 11);
  ctx.quadraticCurveTo(-13, 5, -3, 10);
  ctx.quadraticCurveTo(-8, 17, -18, 17);
  ctx.quadraticCurveTo(-23, 16, -23, 11);
  ctx.closePath();
  ctx.fill();

  /* mouth */
  if (pose.mouth > 0.2) {
    ctx.fillStyle = "rgba(60,24,16,0.8)";
    ctx.beginPath();
    ctx.ellipse(-8, 18, 4.2, 2.6 * pose.mouth, 0.08, 0, TAU);
    ctx.fill();
  }

  /* nose */
  const nose = ctx.createLinearGradient(-36, 0, -24, 8);
  nose.addColorStop(0, "#f3c49a");
  nose.addColorStop(1, "#d39369");
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(-25, -5);
  ctx.quadraticCurveTo(-36, 1, -29, 8);
  ctx.quadraticCurveTo(-24, 9, -22, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,66,38,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  /* cheek */
  ctx.fillStyle = "rgba(208,105,80,0.16)";
  ctx.beginPath();
  ctx.ellipse(-17, 8, 6.5, 4, -0.2, 0, TAU);
  ctx.fill();

  /* eye */
  ctx.save();
  ctx.translate(-10.5, -6);
  if (eyeOpen < 0.22) {
    ctx.strokeStyle = "#4c2d1a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.quadraticCurveTo(0, 1.6, 5.5, 0);
    ctx.stroke();
  } else {
    ctx.save();
    ctx.scale(1, eyeOpen);
    ctx.fillStyle = "#2f2118";
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.1, 4.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#6b4a2c";
    ctx.beginPath();
    ctx.arc(-1.2, -0.4, 2.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,250,235,0.95)";
    ctx.beginPath();
    ctx.arc(-2.1, -1.8, 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(74,42,22,0.6)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5.4, -4.8);
    ctx.quadraticCurveTo(0, -7.6, 5.6, -4.4);
    ctx.stroke();
  }
  ctx.restore();

  /* eyebrow */
  ctx.strokeStyle = "#4f2e1a";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  const browDrop = pose.squint * 2.4;
  ctx.beginPath();
  ctx.moveTo(-18, -11 + browDrop * 0.3);
  ctx.quadraticCurveTo(-10, -14.5 + browDrop, -2, -11.5 + browDrop * 0.6);
  ctx.stroke();

  /* beanie */
  const beanie = ctx.createLinearGradient(-20, -38, 24, -8);
  beanie.addColorStop(0, "#557a63");
  beanie.addColorStop(0.5, "#3f5d4b");
  beanie.addColorStop(1, "#2c4437");
  ctx.fillStyle = beanie;
  ctx.beginPath();
  ctx.moveTo(-30, -12);
  ctx.bezierCurveTo(-30, -32, -17, -44, -1, -44);
  ctx.bezierCurveTo(15, -44, 30, -32, 30, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(26,42,32,0.45)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,215,162,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-30, -12);
  ctx.bezierCurveTo(-30, -32, -17, -44, -1, -44);
  ctx.stroke();

  /* knit ribs */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-30, -12);
  ctx.bezierCurveTo(-30, -32, -17, -44, -1, -44);
  ctx.bezierCurveTo(15, -44, 30, -32, 30, -12);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(24,40,30,0.25)";
  ctx.lineWidth = 1.2;
  for (let x = -28; x <= 28; x += 5.2) {
    ctx.beginPath();
    ctx.moveTo(x, -46);
    ctx.quadraticCurveTo(x + 1, -28, x + 0.5, -8);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,230,186,0.12)";
  ctx.beginPath();
  ctx.ellipse(-13, -31, 8, 4, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();

  /* folded band */
  const band = ctx.createLinearGradient(0, -23, 0, -11);
  band.addColorStop(0, "#4d6e58");
  band.addColorStop(1, "#344d3d");
  ctx.fillStyle = band;
  roundRectPath(ctx, -31, -22, 62, 10.5, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(26,42,32,0.4)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(223,240,218,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-28, -19.6);
  ctx.lineTo(28, -19.6);
  ctx.stroke();

  /* pom */
  const pom = ctx.createRadialGradient(1, -50, 1, 2, -47, 9);
  pom.addColorStop(0, "#f4dfb0");
  pom.addColorStop(1, "#c9a367");
  ctx.fillStyle = pom;
  ctx.beginPath();
  ctx.arc(2, -47, 7.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(94,66,32,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawArm(shoulder, hand, back) {
  const elbow = solveIK(shoulder.x, shoulder.y, hand.x, hand.y, 52, 52, 1);
  const sleeve = back ? "#8f3329" : "#b8483a";
  const sleeveDark = back ? "#71251f" : "#94352b";
  const skin = back ? "#ce9169" : "#e8b489";
  const skinDark = back ? "#b87a53" : "#d1956b";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokeLine(shoulder, elbow, 23, "rgba(42,20,12,0.38)");
  strokeLine(elbow, hand, 18, "rgba(42,20,12,0.34)");

  const upper = ctx.createLinearGradient(shoulder.x - 12, shoulder.y, shoulder.x + 12, shoulder.y);
  upper.addColorStop(0, sleeve);
  upper.addColorStop(1, sleeveDark);
  strokeLine(shoulder, elbow, 19, upper);

  const fore = ctx.createLinearGradient(elbow.x - 10, elbow.y, elbow.x + 10, elbow.y);
  fore.addColorStop(0, skin);
  fore.addColorStop(1, skinDark);
  strokeLine(elbow, { x: hand.x - (hand.x - elbow.x) * 0.08, y: hand.y - (hand.y - elbow.y) * 0.08 }, 14.5, fore);

  /* rolled sleeve cuff */
  ctx.strokeStyle = back ? "#5f211b" : "#72261f";
  ctx.lineWidth = 3.4;
  const dx = hand.x - elbow.x;
  const dy = hand.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(elbow.x + nx * 7, elbow.y + ny * 7);
  ctx.lineTo(elbow.x - nx * 7, elbow.y - ny * 7);
  ctx.stroke();
}

function drawHand(p, back) {
  const glove = ctx.createRadialGradient(p.x - 2, p.y - 3, 1, p.x, p.y, 9);
  glove.addColorStop(0, back ? "#7a5137" : "#8b5c3d");
  glove.addColorStop(1, back ? "#4f3321" : "#5c3b26");
  ctx.fillStyle = glove;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 7.4, 7.9, 0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(41,23,12,0.5)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,213,162,0.22)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(p.x - 1, p.y - 1, 4.4, 2.3, 4.2);
  ctx.stroke();

  /* thumb */
  ctx.fillStyle = back ? "#5b3b26" : "#6d4630";
  ctx.beginPath();
  ctx.ellipse(p.x + 4.6, p.y - 4, 2.8, 3.6, -0.5, 0, TAU);
  ctx.fill();
}

function drawAxe(grip, angle) {
  ctx.save();
  ctx.translate(grip.x, grip.y);
  ctx.rotate(angle);

  /* handle */
  const handle = ctx.createLinearGradient(0, -5.5, 0, 5.5);
  handle.addColorStop(0, "#d0a166");
  handle.addColorStop(0.45, "#a9743e");
  handle.addColorStop(1, "#6f4525");
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(44,24,10,0.4)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(97, 0);
  ctx.stroke();

  ctx.strokeStyle = handle;
  ctx.lineWidth = 7.2;
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(97, 0);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,220,170,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-12, -2.1);
  ctx.lineTo(94, -2.1);
  ctx.stroke();

  /* butt cap */
  ctx.fillStyle = "#4d2f1a";
  ctx.beginPath();
  ctx.ellipse(-15, 0, 2.6, 5.4, 0, 0, TAU);
  ctx.fill();

  /* grip wrap */
  ctx.strokeStyle = "rgba(62,38,18,0.75)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-8 + i * 4.5, -4.2);
    ctx.lineTo(-8 + i * 4.5, 4.2);
    ctx.stroke();
  }

  /* steel head */
  const steel = ctx.createLinearGradient(96, -50, 126, 8);
  steel.addColorStop(0, "#cfdde1");
  steel.addColorStop(0.34, "#a4b6bd");
  steel.addColorStop(0.7, "#788c94");
  steel.addColorStop(1, "#50636b");
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(89, -8);
  ctx.quadraticCurveTo(96, -33, 114, -50);
  ctx.lineTo(123, -46);
  ctx.quadraticCurveTo(128, -28, 125, -9);
  ctx.lineTo(111, -6);
  ctx.quadraticCurveTo(97, 3, 89, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(32,46,52,0.75)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  /* sharpened bit */
  ctx.fillStyle = "#e8f2f5";
  ctx.beginPath();
  ctx.moveTo(118, -48);
  ctx.lineTo(123, -46);
  ctx.quadraticCurveTo(128, -28, 125, -9);
  ctx.lineTo(120, -9);
  ctx.quadraticCurveTo(123, -28, 115, -44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(251,254,255,0.95)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(118, -48);
  ctx.lineTo(123, -46);
  ctx.quadraticCurveTo(127.7, -28, 124.7, -9);
  ctx.stroke();
  ctx.strokeStyle = "rgba(58,76,84,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(115, -44);
  ctx.quadraticCurveTo(123, -28, 120, -9);
  ctx.stroke();

  /* socket / eye */
  ctx.fillStyle = "#6d7f87";
  roundRectPath(ctx, 86, -10, 19, 20, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(30,42,48,0.65)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = "rgba(22,30,34,0.62)";
  ctx.beginPath();
  ctx.ellipse(95.5, 0, 4.3, 6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(218,235,240,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(95.5, 0, 6.4, 8.4, 0, 0, TAU);
  ctx.stroke();

  /* poll */
  ctx.fillStyle = "#5d7078";
  roundRectPath(ctx, 87, 7, 18, 9, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(28,40,46,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  /* wooden wedge in the eye */
  ctx.fillStyle = "#c79a5f";
  ctx.beginPath();
  ctx.moveTo(91, -9);
  ctx.lineTo(99, -9);
  ctx.lineTo(96.5, -13);
  ctx.closePath();
  ctx.fill();

  /* blade bevel shading */
  ctx.strokeStyle = "rgba(58,74,82,0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(96, -1);
  ctx.quadraticCurveTo(105, -16, 112, -38);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(104, -30, 9, 3.2, -1.2, 0, TAU);
  ctx.fill();

  /* impact glint */
  if (stumpFlash > 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(255,250,225,${stumpFlash * 0.9})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120.5, -42.6);
    ctx.quadraticCurveTo(132, -41.6, 135.6, -28);
    ctx.lineTo(135.6, -9);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* swing & impact                                                     */
/* ------------------------------------------------------------------ */

let elapsed = 0;
let hintTimer = 0;

function startSwing() {
  const from = currentPose(elapsed);
  swing.t = 0;
  swing.queued = false;
  swing.hit = false;
  swing.from = from;
  AudioKit.whoosh();
}

function requestChop() {
  if (swing.t < 0 || swing.t >= CHOP.impactAt + 0.045) {
    startSwing();
  } else {
    swing.queued = true;
  }
}

function updateSwing(dt) {
  if (swing.t < 0) return;
  swing.t += dt;
  if (!swing.hit && swing.t >= CHOP.impactAt) {
    swing.hit = true;
    impact();
  }
  if (swing.queued && swing.hit && swing.t >= CHOP.impactAt + CHOP.hold) {
    startSwing();
    return;
  }
  if (swing.t >= CHOP.cycle) {
    swing.t = -1;
    swing.from = null;
  }
}

function impact() {
  const x = layout.stumpX;
  const y = layout.stumpTopY;
  const scale = clamp(layout.s, 0.7, 1.3);

  count += 1;
  stumpFlash = 1;
  crackT = 0.5;
  cutMarks.push({ x: (Math.random() - 0.5) * 34 });
  if (cutMarks.length > 6) cutMarks.shift();

  spawnChips(x, y + 3, 13);
  spawnDust(x, y + 5, 5);
  spawnRing(x, y, 74 * scale);
  addText("+1", x + 6 * scale, y - 26 * layout.s);
  addShake(7.2);

  updateScoreUI(true);
  syncPile();
  AudioKit.chop();
  vibrate(14);

  if (!hasChopped) {
    hasChopped = true;
    hideHintSoon();
  }

  if (count === 10 || count === 25 || count % 50 === 0) {
    showToast(`${formatCount(count)} 장작!`);
    AudioKit.chime();
    spawnSparks(x, y - 8, 26);
    spawnRing(x, y, 128 * scale);
    addShake(5.5);
  }

  saveCountSoon();
}

/* ------------------------------------------------------------------ */
/* effect painting                                                    */
/* ------------------------------------------------------------------ */

function drawUnderFx() {
  const scale = clamp(layout.s, 0.7, 1.3);

  /* shock rings */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const ring of rings) {
    const k = 1 - ring.life / ring.maxLife;
    const alpha = (1 - k) * 0.5;
    ctx.strokeStyle = `rgba(255,225,160,${alpha})`;
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,244,214,${alpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ring.x, ring.y, ring.r * 0.72, ring.r * 0.24, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  /* impact flash */
  if (stumpFlash > 0.01) {
    const fx = layout.stumpX;
    const fy = layout.stumpTopY;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 78 * scale);
    glow.addColorStop(0, `rgba(255,250,224,${0.55 * stumpFlash})`);
    glow.addColorStop(0.3, `rgba(255,220,154,${0.24 * stumpFlash})`);
    glow.addColorStop(1, "rgba(255,190,100,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fx, fy, 78 * scale, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `rgba(255,250,226,${0.62 * stumpFlash})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.08 + i * 0.15);
      const r0 = 10 * scale;
      const r1 = (25 + (i % 3) * 13) * scale;
      ctx.beginPath();
      ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0 * 0.5);
      ctx.lineTo(fx + Math.cos(a) * r1, fy + Math.sin(a) * r1 * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* dust */
  for (const p of dust) {
    const alpha = Math.max(0, p.life / p.max) * 0.22;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grd.addColorStop(0, `rgba(214,190,146,${alpha})`);
    grd.addColorStop(1, "rgba(190,170,130,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
  }
}

function drawEffects() {
  const scale = clamp(layout.s, 0.7, 1.3);

  /* wood chips */
  for (const p of chips) {
    const alpha = clamp(p.life / 0.35, 0, 1);
    const r = Math.round(120 + 80 * p.tone);
    const g = Math.round(72 + 62 * p.tone);
    const b = Math.round(34 + 30 * p.tone);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    if (p.wedge) {
      ctx.beginPath();
      ctx.moveTo(-p.size, -p.size * 0.55);
      ctx.lineTo(p.size, 0);
      ctx.lineTo(-p.size * 0.6, p.size * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
    }
    ctx.restore();
  }

  /* golden sparks */
  if (sparks.length) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of sparks) {
      const alpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = `rgba(255,226,152,${alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,247,214,${alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* floating score */
  for (const p of texts) {
    const k = 1 - p.life / p.max;
    const alpha = clamp(p.life / 0.38, 0, 1);
    const pop = 1 + Math.sin(Math.min(1, k / 0.55) * Math.PI) * 0.18;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `850 ${p.size}px "Pretendard Variable", Pretendard, "Noto Sans KR", system-ui, sans-serif`;
    ctx.fillStyle = `rgba(255,230,164,${alpha})`;
    ctx.shadowColor = `rgba(255,148,44,${alpha * 0.9})`;
    ctx.shadowBlur = 14;
    ctx.fillText(p.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(96,49,12,${alpha * 0.55})`;
    ctx.lineWidth = 1.2;
    ctx.strokeText(p.text, 0, 0.8);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* HUD helpers                                                        */
/* ------------------------------------------------------------------ */

function formatCount(value) {
  try {
    return value.toLocaleString("ko-KR");
  } catch {
    return String(value);
  }
}

function updateScoreUI(animate) {
  scoreValueEl.textContent = formatCount(count);
  if (!animate) return;

  if (scoreValueEl.animate) {
    scoreValueEl.animate(
      [
        { transform: "translateY(0) scale(1)", color: "#ffefd2" },
        { transform: "translateY(-3px) scale(1.28)", color: "#ffd88f", offset: 0.34 },
        { transform: "translateY(0) scale(1)", color: "#ffefd2" },
      ],
      { duration: 280, easing: "cubic-bezier(.2,.9,.3,1.1)" }
    );
  }
  if (scoreCardEl.animate) {
    scoreCardEl.animate(
      [
        { transform: "rotate(-0.7deg) scale(1)" },
        { transform: "rotate(0.5deg) scale(1.035)", offset: 0.4 },
        { transform: "rotate(0deg) scale(1)" },
      ],
      { duration: 300, easing: "ease-out" }
    );
  }
}

let toastTimer = 0;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1650);
}

function hideHintSoon() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add("hide"), 850);
}

function saveCountSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCount, 240);
}

function saveCount() {
  try {
    localStorage.setItem(STORAGE_COUNT, String(count));
  } catch {
    /* noop */
  }
}

function applyMuteUI() {
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.setAttribute("aria-label", muted ? "소리 켜기" : "소리 끄기");
}

/* ------------------------------------------------------------------ */
/* render loop                                                        */
/* ------------------------------------------------------------------ */

function render() {
  const t = elapsed;
  const { w, h, dpr } = view;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#101a16";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(cam.x, cam.y);

  if (bgCanvas) {
    ctx.drawImage(bgCanvas, -OV, -OV, w + OV * 2, h + OV * 2);
  }

  drawRays(t);
  drawMist(t);
  drawBirds(t);
  drawMotes(t);

  drawShadows();
  drawWoodpile();
  drawStump(t);
  drawUnderFx();
  drawCharacter(t);
  drawEffects();

  drawFireflies(t);
  drawLeaves(t);
  drawForeground(t);

  ctx.restore();
}

let lastFrame = 0;
function frame(now) {
  if (!lastFrame) lastFrame = now;
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  elapsed += dt;

  updateSwing(dt);
  updateEffects(dt);
  render();

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* input                                                              */
/* ------------------------------------------------------------------ */

function spawnRipple(x, y) {
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  chopBtn.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 700);
}

function animateAxeIcon() {
  if (reducedMotion || !chopAxe.animate) return;
  chopAxe.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-42deg)", offset: 0.3 },
      { transform: "rotate(28deg)", offset: 0.64 },
      { transform: "rotate(0deg)" },
    ],
    { duration: 460, delay: 40, easing: "cubic-bezier(.3,.7,.2,1)" }
  );
}

function performChop(event) {
  AudioKit.init();
  const rect = chopBtn.getBoundingClientRect();
  const x = event ? clamp(event.clientX - rect.left, 0, rect.width) : rect.width / 2;
  const y = event ? clamp(event.clientY - rect.top, 0, rect.height) : rect.height / 2;
  spawnRipple(x, y);
  animateAxeIcon();
  requestChop();
  vibrate(7);
  if (!hasChopped) {
    hasChopped = true;
    hideHintSoon();
  }
}

function bindEvents() {
  chopBtn.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      performChop(event);
    },
    { passive: false }
  );

  chopBtn.addEventListener("click", (event) => event.preventDefault());

  chopBtn.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) performChop(null);
    }
  });

  muteBtn.addEventListener("click", (event) => {
    event.preventDefault();
    muted = !muted;
    applyMuteUI();
    if (!muted) {
      AudioKit.init();
      AudioKit.setMuted(false);
      AudioKit.chime();
    } else {
      AudioKit.setMuted(true);
    }
    try {
      localStorage.setItem(STORAGE_MUTED, muted ? "1" : "0");
    } catch {
      /* noop */
    }
  });

  window.addEventListener("keydown", (event) => {
    if ((event.code === "Space" || event.code === "Enter") && document.activeElement !== chopBtn) {
      event.preventDefault();
      performChop(null);
    }
  });

  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("gesturestart", (event) => event.preventDefault());

  let resizeTimer = 0;
  const scheduleResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      initLeaves();
      saveCountSoon();
    }, 140);
  };
  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", () => setTimeout(scheduleResize, 220));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveCount();
    } else {
      lastFrame = 0;
    }
  });

  window.addEventListener("pagehide", saveCount);
}

/* ------------------------------------------------------------------ */
/* boot                                                               */
/* ------------------------------------------------------------------ */

function init() {
  applyMuteUI();
  scoreValueEl.textContent = formatCount(count);
  resize();
  initLeaves();
  bindEvents();

  if (count > 0) {
    hintTimer = setTimeout(() => hintEl.classList.add("hide"), 2800);
  }

  requestAnimationFrame((now) => {
    lastFrame = now;
    requestAnimationFrame(frame);
  });
}

init();
