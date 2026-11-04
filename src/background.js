/* Procedural golden-hour forest backdrop, rendered once per resize. */
import { TAU, mulberry32, ellipse, line, clamp } from './utils.js';

function drawCloud(b, x, y, size, color, alpha) {
  b.save();
  b.globalAlpha = alpha;
  b.fillStyle = color;
  b.filter = 'blur(11px)';
  b.beginPath();
  b.ellipse(x, y, size * 1.75, size * 0.30, -0.03, 0, TAU);
  b.ellipse(x - size * 0.7, y + size * 0.07, size * 0.85, size * 0.20, 0.05, 0, TAU);
  b.ellipse(x + size * 0.8, y - size * 0.04, size * 0.95, size * 0.18, -0.04, 0, TAU);
  b.fill();
  b.restore();
}

function drawRidge(b, W, baseY, height, color, seed, alpha) {
  const rand = mulberry32(seed);
  b.save();
  b.globalAlpha = alpha;
  b.fillStyle = color;
  b.beginPath();
  b.moveTo(-40, baseY + 80);
  let x = -40;
  while (x < W + 80) {
    const segment = W * (0.085 + rand() * 0.10);
    const peak = baseY - height * (0.25 + rand() * 0.75);
    const nx = x + segment;
    b.quadraticCurveTo(x + segment * 0.32, baseY - height * (0.1 + rand() * 0.22), (x + nx) / 2, peak);
    b.quadraticCurveTo(x + segment * 0.72, peak + height * (0.2 + rand() * 0.25), nx, baseY - height * (0.12 + rand() * 0.3));
    x = nx;
  }
  b.lineTo(W + 60, baseY + 90);
  b.lineTo(-40, baseY + 90);
  b.closePath();
  b.fill();
  b.restore();
}

function drawPine(b, x, baseY, h, w, color, alpha, seed) {
  const rand = mulberry32(seed);
  b.save();
  b.globalAlpha = alpha;
  b.fillStyle = color;

  b.fillRect(x - w * 0.025, baseY - h * 0.24, w * 0.05, h * 0.24);

  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const tipY = baseY - h + h * 0.125 * i;
    const half = w * (0.14 + t * 0.195);
    const foot = tipY + h * (0.30 - i * 0.015) + rand() * h * 0.012;
    b.beginPath();
    b.moveTo(x, tipY);
    b.lineTo(x - half * 0.34, tipY + h * 0.105);
    b.lineTo(x - half * 0.71, tipY + h * 0.138);
    b.lineTo(x - half * 0.52, tipY + h * 0.178);
    b.lineTo(x - half, foot);
    b.lineTo(x, foot - h * 0.018);
    b.lineTo(x + half, foot);
    b.lineTo(x + half * 0.52, tipY + h * 0.178);
    b.lineTo(x + half * 0.71, tipY + h * 0.138);
    b.lineTo(x + half * 0.34, tipY + h * 0.105);
    b.closePath();
    b.fill();
  }

  b.globalAlpha = alpha * 0.24;
  b.fillStyle = '#b8a46e';
  b.beginPath();
  b.moveTo(x, baseY - h + h * 0.02);
  b.lineTo(x + w * 0.15, baseY - h * 0.45);
  b.lineTo(x + w * 0.09, baseY - h * 0.44);
  b.closePath();
  b.fill();
  b.restore();
}

function drawForestBand(b, W, baseY, count, minH, maxH, color, alpha, seed, skipCenter) {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.2 + rand() * 0.65) / count) * W;
    if (skipCenter && x > W * 0.25 && x < W * 0.82) continue;
    const h = (minH + rand() * (maxH - minH));
    const w = h * (0.26 + rand() * 0.10);
    drawPine(b, x, baseY + rand() * 14, h, w, color, alpha * (0.82 + rand() * 0.18), (rand() * 1e9) | 0);
  }
}

function drawCanopy(b, cx, cy, rx, ry, seed, litSide) {
  const rand = mulberry32(seed);
  const colors = ['#0b211d', '#102a24', '#14332b', '#183c30'];
  const count = 58;
  for (let i = 0; i < count; i++) {
    const angle = rand() * TAU;
    const radius = Math.sqrt(rand());
    const x = cx + Math.cos(angle) * rx * radius * 0.92;
    const y = cy + Math.sin(angle) * ry * radius * 0.78;
    const size = (13 + rand() * 27) * Math.min(1.3, Math.max(0.65, rx / 210));
    b.globalAlpha = 0.90;
    b.fillStyle = colors[(rand() * colors.length) | 0];
    b.beginPath();
    b.ellipse(x, y, size * (0.8 + rand() * 0.5), size * (0.6 + rand() * 0.4), rand() * TAU, 0, TAU);
    b.fill();
  }

  b.globalAlpha = 0.34;
  b.fillStyle = '#54704b';
  for (let i = 0; i < 18; i++) {
    const angle = rand() * TAU;
    const radius = Math.sqrt(rand()) * 0.82;
    const x = cx + Math.cos(angle) * rx * radius + litSide * rx * 0.18;
    const y = cy + Math.sin(angle) * ry * radius * 0.75 - ry * 0.08;
    const size = (8 + rand() * 16) * Math.min(1.25, Math.max(0.7, rx / 220));
    b.beginPath();
    b.ellipse(x, y, size, size * 0.66, rand() * TAU, 0, TAU);
    b.fill();
  }

  b.globalAlpha = 0.18;
  b.fillStyle = '#e4bd79';
  for (let i = 0; i < 22; i++) {
    const x = cx + (rand() - 0.5) * rx * 1.5 + litSide * rx * 0.25;
    const y = cy + (rand() - 0.5) * ry * 1.05;
    b.beginPath();
    b.arc(x, y, (1 + rand() * 2.2), 0, TAU);
    b.fill();
  }
  b.globalAlpha = 1;
}

function drawFramingTree(b, W, H, S, side, seed) {
  const rand = mulberry32(seed);
  const x = side < 0 ? W * 0.035 : W * 0.965;
  const base = H * 1.04;
  const height = H * (0.66 + rand() * 0.05);
  const width = clamp(40 * S, 30, 78);

  b.save();
  b.translate(x, base);
  b.rotate(side * 0.025);

  const trunk = b.createLinearGradient(-width * 0.65, 0, width * 0.65, 0);
  trunk.addColorStop(0, '#0a1915');
  trunk.addColorStop(0.52, '#152b23');
  trunk.addColorStop(1, '#081410');
  b.fillStyle = trunk;
  b.beginPath();
  b.moveTo(-width * 0.62, 0);
  b.bezierCurveTo(-width * 0.5, -height * 0.3, -width * 0.32, -height * 0.62, -width * 0.24, -height);
  b.lineTo(width * 0.24, -height);
  b.bezierCurveTo(width * 0.34, -height * 0.6, width * 0.52, -height * 0.28, width * 0.64, 0);
  b.closePath();
  b.fill();

  b.globalAlpha = 0.26;
  b.strokeStyle = '#4c5a42';
  b.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const bx = (rand() - 0.5) * width * 0.8;
    b.beginPath();
    b.moveTo(bx, -height * (0.05 + rand() * 0.18));
    b.bezierCurveTo(bx + (rand() - 0.5) * 9, -height * 0.35, bx + (rand() - 0.5) * 12, -height * 0.58, bx + (rand() - 0.5) * 9, -height * (0.72 + rand() * 0.22));
    b.stroke();
  }

  b.globalAlpha = 0.38;
  b.strokeStyle = '#0a1713';
  b.lineWidth = clamp(9 * S, 5, 16);
  const branchY = -height * (0.53 + rand() * 0.07);
  b.beginPath();
  b.moveTo(0, branchY);
  b.quadraticCurveTo(side * -W * 0.07, branchY - H * 0.02, side * -W * 0.16, branchY - H * 0.075);
  b.stroke();
  b.restore();

  drawCanopy(
    b,
    side < 0 ? W * 0.075 : W * 0.925,
    H * 0.075,
    clamp(W * 0.20, 120, 300),
    clamp(H * 0.15, 105, 210),
    seed + 77,
    side < 0 ? 1 : -1
  );
}

export function renderBackground({ W, H, S, groundY, DPR }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * DPR);
  canvas.height = Math.ceil(H * DPR);
  const b = canvas.getContext('2d');
  b.setTransform(DPR, 0, 0, DPR, 0, 0);

  const rand = mulberry32(0x51f15e);
  const horizon = groundY - 26 * S;
  const sunX = W * 0.715;
  const sunY = horizon * 0.42;

  /* Sky */
  const sky = b.createLinearGradient(0, -H * 0.15, 0, horizon + 48 * S);
  sky.addColorStop(0, '#071b22');
  sky.addColorStop(0.20, '#103337');
  sky.addColorStop(0.43, '#28504c');
  sky.addColorStop(0.63, '#6c674e');
  sky.addColorStop(0.82, '#c78a55');
  sky.addColorStop(1, '#f2bc7a');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, horizon + 70 * S);

  /* A few earliest stars */
  b.save();
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.26;
    const a = (1 - y / (H * 0.3)) * (0.16 + rand() * 0.34);
    b.globalAlpha = Math.max(0, a);
    b.fillStyle = '#d8eadf';
    b.beginPath();
    b.arc(x, y, 0.55 + rand() * 0.9, 0, TAU);
    b.fill();
  }
  b.restore();

  /* Sun bloom and disc */
  b.save();
  b.globalCompositeOperation = 'screen';
  const bloom = b.createRadialGradient(sunX, sunY, 2, sunX, sunY, Math.max(W, H) * 0.54);
  bloom.addColorStop(0, 'rgba(255,239,190,.86)');
  bloom.addColorStop(0.07, 'rgba(255,214,133,.55)');
  bloom.addColorStop(0.24, 'rgba(244,166,88,.20)');
  bloom.addColorStop(0.55, 'rgba(224,134,68,.055)');
  bloom.addColorStop(1, 'rgba(224,134,68,0)');
  b.fillStyle = bloom;
  b.fillRect(0, 0, W, horizon + 90 * S);
  const disc = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, 36 * S);
  disc.addColorStop(0, 'rgba(255,252,225,1)');
  disc.addColorStop(0.45, 'rgba(255,232,172,.98)');
  disc.addColorStop(0.78, 'rgba(255,207,126,.45)');
  disc.addColorStop(1, 'rgba(255,200,110,0)');
  b.fillStyle = disc;
  b.beginPath();
  b.arc(sunX, sunY, 36 * S, 0, TAU);
  b.fill();
  b.restore();

  /* Soft horizontal clouds */
  drawCloud(b, W * 0.22, horizon * 0.30, W * 0.12, '#40554d', 0.25);
  drawCloud(b, W * 0.62, horizon * 0.18, W * 0.16, '#344d47', 0.22);
  drawCloud(b, W * 0.85, horizon * 0.38, W * 0.13, '#7b6b4b', 0.22);
  drawCloud(b, W * 0.42, horizon * 0.52, W * 0.19, '#876d4b', 0.15);

  /* Birds */
  b.save();
  b.strokeStyle = 'rgba(16,36,32,.55)';
  b.lineWidth = 1.2;
  b.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const bx = W * (0.16 + rand() * 0.26);
    const by = H * (0.12 + rand() * 0.10);
    const s = (4 + rand() * 5) * S;
    b.beginPath();
    b.moveTo(bx - s, by);
    b.quadraticCurveTo(bx - s * 0.4, by - s * 0.55, bx, by);
    b.quadraticCurveTo(bx + s * 0.4, by - s * 0.55, bx + s, by);
    b.stroke();
  }
  b.restore();

  /* Layered mountains */
  drawRidge(b, W, horizon + 12 * S, 128 * S, '#45605a', 0x8123, 0.38);
  drawRidge(b, W, horizon + 22 * S, 88 * S, '#2f4b46', 0x9284, 0.65);
  drawRidge(b, W, horizon + 30 * S, 56 * S, '#213e39', 0x1377, 0.8);

  /* Haze at the base of the mountains */
  const haze = b.createLinearGradient(0, horizon - 44 * S, 0, horizon + 52 * S);
  haze.addColorStop(0, 'rgba(249,197,128,0)');
  haze.addColorStop(0.55, 'rgba(240,185,120,.16)');
  haze.addColorStop(1, 'rgba(233,175,112,.03)');
  b.fillStyle = haze;
  b.fillRect(0, horizon - 50 * S, W, 105 * S);

  /* Ground plane */
  const earth = b.createLinearGradient(0, horizon, 0, H);
  earth.addColorStop(0, '#586238');
  earth.addColorStop(0.18, '#48522f');
  earth.addColorStop(0.46, '#343f27');
  earth.addColorStop(0.75, '#263322');
  earth.addColorStop(1, '#16231b');
  b.fillStyle = earth;
  b.fillRect(0, horizon, W, H - horizon);

  const hillLight = b.createRadialGradient(W * 0.62, groundY + 20 * S, 10, W * 0.62, groundY + 20 * S, W * 0.72);
  hillLight.addColorStop(0, 'rgba(214,169,100,.16)');
  hillLight.addColorStop(0.55, 'rgba(172,138,78,.06)');
  hillLight.addColorStop(1, 'rgba(86,94,52,0)');
  b.fillStyle = hillLight;
  b.fillRect(0, horizon, W, H - horizon);

  /* Distant tree lines */
  drawForestBand(b, W, horizon + 14 * S, 62, 22 * S, 68 * S, '#27453d', 0.50, 0x1021, false);
  drawForestBand(b, W, horizon + 24 * S, 34, 42 * S, 112 * S, '#1d3933', 0.68, 0x2202, false);
  drawForestBand(b, W, horizon + 40 * S, 19, 85 * S, 176 * S, '#162f2a', 0.86, 0x3313, true);
  drawForestBand(b, W, horizon + 66 * S, 9, 150 * S, 270 * S, '#102821', 0.94, 0x4414, true);

  /* Dirt clearing at the chopping spot */
  b.save();
  b.translate(W * 0.54, groundY + 9 * S);
  b.scale(1, 0.27);
  const dirt = b.createRadialGradient(0, 0, 12, 0, 0, Math.max(W * 0.36, 165 * S));
  dirt.addColorStop(0, 'rgba(151,113,67,.52)');
  dirt.addColorStop(0.5, 'rgba(130,96,57,.32)');
  dirt.addColorStop(0.82, 'rgba(101,79,48,.12)');
  dirt.addColorStop(1, 'rgba(84,70,44,0)');
  b.fillStyle = dirt;
  b.beginPath();
  b.arc(0, 0, Math.max(W * 0.36, 165 * S), 0, TAU);
  b.fill();
  b.restore();

  /* Grass blades */
  const grassPalette = [
    ['#7c8348', 0.34],
    ['#67763d', 0.42],
    ['#586b34', 0.50],
    ['#455c2d', 0.6],
    ['#334b27', 0.7],
  ];
  for (let i = 0; i < 390; i++) {
    const depth = Math.pow(rand(), 0.72);
    const y = horizon + 6 * S + depth * (H - horizon + 8 * S);
    const x = rand() * W;
    const size = (0.32 + depth * 1.35);
    const length = (5 + rand() * 14) * size * S;
    const lean = (rand() - 0.5) * length * 0.46;
    const palette = grassPalette[Math.min(grassPalette.length - 1, Math.floor(depth * 4.2))];
    b.globalAlpha = palette[1] * (0.55 + rand() * 0.45);
    b.strokeStyle = palette[0];
    b.lineWidth = Math.max(0.7, size * 1.2);
    b.lineCap = 'round';
    b.beginPath();
    b.moveTo(x, y);
    b.quadraticCurveTo(x + lean * 0.3, y - length * 0.58, x + lean, y - length);
    b.stroke();
    if (rand() > 0.62) {
      b.beginPath();
      b.moveTo(x + size * 1.8, y);
      b.quadraticCurveTo(x + lean * 0.16 + size * 1.4, y - length * 0.45, x + lean * 0.4 + size * 2.4, y - length * 0.82);
      b.stroke();
    }
  }
  b.globalAlpha = 1;

  /* Fallen leaves and small stones */
  const leafColors = ['#b86932', '#c98039', '#9e5029', '#d1964e', '#7b4a2b'];
  for (let i = 0; i < 95; i++) {
    const depth = Math.pow(rand(), 0.45);
    const x = rand() * W;
    const y = horizon + 28 * S + depth * (H - horizon - 5 * S);
    const size = (1.8 + rand() * 3.4) * (0.7 + depth * 0.8) * S;
    b.save();
    b.translate(x, y);
    b.rotate(rand() * TAU);
    b.globalAlpha = 0.22 + rand() * 0.34;
    b.fillStyle = leafColors[(rand() * leafColors.length) | 0];
    b.beginPath();
    b.ellipse(0, 0, size, size * 0.42, 0, 0, TAU);
    b.fill();
    b.restore();
  }

  for (let i = 0; i < 13; i++) {
    const depth = rand();
    const x = rand() * W;
    const y = horizon + 40 * S + depth * (H - horizon - 30 * S);
    const size = (2 + rand() * 7) * (0.5 + depth) * S;
    b.globalAlpha = 0.24 + depth * 0.3;
    b.fillStyle = '#5b5c4b';
    b.beginPath();
    b.ellipse(x, y, size, size * 0.62, rand() * 0.5, 0, TAU);
    b.fill();
    b.globalAlpha = 0.10 + depth * 0.16;
    b.fillStyle = '#d8c08b';
    b.beginPath();
    b.ellipse(x - size * 0.25, y - size * 0.2, size * 0.55, size * 0.27, rand() * 0.5, 0, TAU);
    b.fill();
  }
  b.globalAlpha = 1;

  /* Tiny meadow flowers */
  for (let i = 0; i < 23; i++) {
    const x = rand() * W;
    const y = horizon + 45 * S + Math.pow(rand(), 0.65) * (H - horizon - 40 * S);
    const depth = (y - horizon) / (H - horizon);
    b.globalAlpha = 0.24 + depth * 0.4;
    b.fillStyle = rand() > 0.45 ? '#ddc47f' : '#d8e0c2';
    b.beginPath();
    b.arc(x, y, (0.9 + rand() * 1.3) * (0.6 + depth) * S, 0, TAU);
    b.fill();
  }
  b.globalAlpha = 1;

  /* Warm god rays */
  b.save();
  b.globalCompositeOperation = 'screen';
  b.translate(sunX, sunY);
  const rayAngles = [1.83, 1.98, 2.12, 2.28, 2.45, 2.61];
  for (let i = 0; i < rayAngles.length; i++) {
    b.save();
    b.rotate(rayAngles[i]);
    const length = Math.max(W, H) * 1.18;
    const ray = b.createLinearGradient(0, 0, length, 0);
    ray.addColorStop(0, `rgba(255,232,173,${0.15 + (i % 2) * 0.035})`);
    ray.addColorStop(0.35, 'rgba(255,216,144,.055)');
    ray.addColorStop(0.8, 'rgba(255,205,130,.012)');
    ray.addColorStop(1, 'rgba(255,205,130,0)');
    b.fillStyle = ray;
    b.beginPath();
    b.moveTo(0, -4 - i);
    b.lineTo(length, -105 + i * 18);
    b.lineTo(length, 105 - i * 9);
    b.lineTo(0, 4 + i);
    b.closePath();
    b.fill();
    b.restore();
  }
  b.restore();

  /* Foreground framing trees and canopy */
  drawFramingTree(b, W, H, S, -1, 0x9911);
  drawFramingTree(b, W, H, S, 1, 0xab22);

  /* Soft foreground vignette flakes of out-of-focus foliage */
  b.save();
  const fg = b.createLinearGradient(0, H * 0.72, 0, H);
  fg.addColorStop(0, 'rgba(8,21,16,0)');
  fg.addColorStop(1, 'rgba(7,17,14,.45)');
  b.fillStyle = fg;
  b.fillRect(0, H * 0.72, W, H * 0.28);
  b.restore();

  return canvas;
}

/* Small reusable line helper kept local to avoid importing it unused elsewhere. */
export { line };
