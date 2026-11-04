import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function canvasTexture(width, height, draw, { repeat = null, anisotropy = 4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  _glow = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return _glow;
}

let _spark = null;
export function sparkTexture() {
  if (_spark) return _spark;
  _spark = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return _spark;
}

export function glowSprite(color, scale, opacity = 0.6) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export function textSprite(text, color = '#ffffff', bg = 'rgba(4,14,24,0.55)') {
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = '700 58px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.min(470, ctx.measureText(text).width + 54);
    ctx.fillStyle = bg;
    ctx.beginPath();
    const x = (w - width) / 2;
    const r = 18;
    ctx.roundRect(x, 18, width, 92, r);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(6.4, 1.6, 1);
  return sprite;
}

export function hexColor(hex) {
  return new THREE.Color(hex);
}

export function shade(color, amount) {
  const c = new THREE.Color(color);
  c.multiplyScalar(amount);
  return c;
}

export function dampVec3(current, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
  return current;
}

export function dampNumber(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

export function makeRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
