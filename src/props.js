/* Stump, firewood and the growing pile beside the chopping block. */
import { TAU, roundRect } from './utils.js';

export function logSlot(L, index) {
  const S = L.S;
  const row = Math.floor(index / 4);
  const col = index % 4;
  const w = 50 * S;
  const h = 14.5 * S;
  const x = L.pileX - 29 * S + col * 18.5 * S + (row % 2) * 7 * S;
  const y = L.groundY - 8.5 * S - row * 13.5 * S - (col % 2) * 1.7 * S;
  const rot = (col % 2 ? -0.035 : 0.038) + (row % 2 ? -0.018 : 0.015);
  return { x, y, w, h, rot };
}

export function drawLog(ctx, x, y, w, h, rot = 0, alpha = 1) {
  const radius = h * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;

  const body = ctx.createLinearGradient(0, -h * 0.55, 0, h * 0.55);
  body.addColorStop(0, '#8e5d32');
  body.addColorStop(0.28, '#724a28');
  body.addColorStop(0.72, '#5c3a1f');
  body.addColorStop(1, '#3f2715');
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#c18a52';
  roundRect(ctx, -w / 2 + h * 0.25, -h / 2 + h * 0.16, w * 0.6, h * 0.22, h * 0.12);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.42;
  ctx.strokeStyle = '#351f10';
  ctx.lineWidth = Math.max(0.7, h * 0.055);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const yy = (i - 1) * h * 0.22;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32 + i * 2, yy);
    ctx.quadraticCurveTo(0, yy + h * 0.03, w * 0.28, yy);
    ctx.stroke();
  }

  /* Visible cut face at the right end */
  const ex = w / 2 - h * 0.16;
  ctx.globalAlpha = alpha;
  const face = ctx.createRadialGradient(ex - h * 0.12, -h * 0.12, 0, ex, 0, h * 0.62);
  face.addColorStop(0, '#f0c88e');
  face.addColorStop(0.55, '#d2a067');
  face.addColorStop(1, '#9d6a3b');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(ex, 0, h * 0.48, h * 0.48, 0, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = '#8d5a30';
  ctx.lineWidth = Math.max(0.6, h * 0.04);
  for (let r = 0.15; r < 0.44; r += 0.105) {
    ctx.beginPath();
    ctx.ellipse(ex, 0, h * r, h * r * 0.92, 0.2, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha * 0.6;
  ctx.strokeStyle = '#6d4525';
  ctx.beginPath();
  ctx.moveTo(ex - h * 0.1, -h * 0.15);
  ctx.lineTo(ex + h * 0.08, h * 0.02);
  ctx.stroke();
  ctx.restore();
}

export function drawLogPile(ctx, L, count) {
  const visible = Math.min(count, 28);
  if (visible <= 0) return;

  ctx.save();
  const shadow = ctx.createRadialGradient(L.pileX, L.groundY - 2 * L.S, 2, L.pileX, L.groundY - 2 * L.S, 68 * L.S);
  shadow.addColorStop(0, 'rgba(8,14,10,.36)');
  shadow.addColorStop(1, 'rgba(8,14,10,0)');
  ctx.fillStyle = shadow;
  ctx.save();
  ctx.translate(L.pileX, L.groundY);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, 68 * L.S, 0, TAU);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < visible; i++) {
    const slot = logSlot(L, i);
    drawLog(ctx, slot.x, slot.y, slot.w, slot.h, slot.rot, 1);
  }
  ctx.restore();
}

export function drawFlyLog(ctx, from, to, progress, L, index) {
  const t = Math.min(1, Math.max(0, progress));
  const ease = 1 - Math.pow(1 - t, 3);
  const x = from.x + (to.x - from.x) * ease;
  const arc = Math.sin(Math.PI * t) * 62 * L.S;
  const y = from.y + (to.y - from.y) * ease - arc;
  const rot = from.rot + (to.rot - from.rot) * ease + Math.sin(Math.PI * t) * 0.9;
  drawLog(ctx, x, y, to.w, to.h, rot, 1);
}

export function drawStump(ctx, L, score, time) {
  const S = L.S;
  const cx = L.stumpX;
  const topY = L.stumpTopY;
  const ground = L.groundY;
  const rx = 47 * S;
  const ry = 12.5 * S;
  const h = ground - topY;

  /* Contact shadow */
  ctx.save();
  ctx.translate(cx, ground + 1 * S);
  ctx.scale(1, 0.26);
  const shadow = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * 1.55);
  shadow.addColorStop(0, 'rgba(6,12,8,.48)');
  shadow.addColorStop(0.65, 'rgba(6,12,8,.20)');
  shadow.addColorStop(1, 'rgba(6,12,8,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 1.55, 0, TAU);
  ctx.fill();
  ctx.restore();

  /* Bark body */
  const bark = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  bark.addColorStop(0, '#3b2919');
  bark.addColorStop(0.24, '#684929');
  bark.addColorStop(0.55, '#7d5732');
  bark.addColorStop(0.82, '#563b22');
  bark.addColorStop(1, '#332216');
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(cx - rx, topY + ry * 0.1);
  ctx.bezierCurveTo(cx - rx - 3 * S, topY + h * 0.35, cx - rx + 2 * S, topY + h * 0.7, cx - rx + 3 * S, ground + 2 * S);
  ctx.quadraticCurveTo(cx - rx * 0.4, ground + 9 * S, cx + rx * 0.32, ground + 4 * S);
  ctx.bezierCurveTo(cx + rx * 0.85, ground + 1 * S, cx + rx - 1 * S, topY + h * 0.68, cx + rx + 2 * S, topY + h * 0.3);
  ctx.lineTo(cx + rx, topY + ry * 0.1);
  ctx.closePath();
  ctx.fill();

  /* Bark grooves */
  ctx.globalAlpha = 0.36;
  ctx.strokeStyle = '#2e1d11';
  ctx.lineWidth = 1.35 * S;
  ctx.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    const bx = cx - rx * 0.85 + (i / 12) * rx * 1.7;
    const sway = Math.sin(i * 2.1) * 2.4 * S;
    ctx.beginPath();
    ctx.moveTo(bx, topY + ry + (i % 3) * 3 * S);
    ctx.bezierCurveTo(bx + sway, topY + h * 0.35, bx - sway, topY + h * 0.68, bx + sway * 0.5, ground - 4 * S);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#c08d53';
  for (let i = 0; i < 5; i++) {
    const bx = cx - rx * 0.65 + i * rx * 0.3;
    ctx.beginPath();
    ctx.moveTo(bx, topY + ry + 4 * S);
    ctx.quadraticCurveTo(bx + 2 * S, topY + h * 0.45, bx, ground - 6 * S);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Moss at the foot */
  const moss = ctx.createRadialGradient(cx - rx * 0.5, ground - 7 * S, 1, cx - rx * 0.35, ground - 5 * S, 32 * S);
  moss.addColorStop(0, 'rgba(94,116,53,.5)');
  moss.addColorStop(1, 'rgba(58,82,38,0)');
  ctx.fillStyle = moss;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, ground - 5 * S, 31 * S, 11 * S, -0.08, 0, TAU);
  ctx.fill();

  /* Cut surface */
  const top = ctx.createRadialGradient(cx - rx * 0.22, topY - ry * 0.25, 1, cx, topY, rx * 1.04);
  top.addColorStop(0, '#e2b77b');
  top.addColorStop(0.42, '#cfa169');
  top.addColorStop(0.8, '#a87845');
  top.addColorStop(1, '#7e5731');
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, TAU);
  ctx.fill();

  /* Growth rings */
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#8f6338';
  ctx.lineWidth = 1.1 * S;
  for (let i = 0; i < 5; i++) {
    const r = 0.2 + i * 0.145;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.03, topY, rx * r, ry * r, 0.02, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.07, topY - ry * 0.2);
  ctx.quadraticCurveTo(cx + rx * 0.03, topY + ry * 0.1, cx - rx * 0.01, topY + ry * 0.34);
  ctx.stroke();
  ctx.restore();

  /* Chopped notch on the near-left edge */
  ctx.fillStyle = '#3b2716';
  ctx.beginPath();
  ctx.moveTo(cx - rx + 1 * S, topY - ry * 0.1);
  ctx.lineTo(cx - rx * 0.34, topY + ry * 0.25);
  ctx.lineTo(cx - rx + 2 * S, topY + ry * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(238,199,139,.35)';
  ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  ctx.moveTo(cx - rx + 1 * S, topY - ry * 0.1);
  ctx.lineTo(cx - rx * 0.34, topY + ry * 0.25);
  ctx.stroke();

  /* Fresh cut marks grow with the score */
  const marks = Math.min(score, 7);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#f1d19a';
  ctx.lineWidth = 1.4 * S;
  for (let i = 0; i < marks; i++) {
    const mx = cx + rx * (0.05 + i * 0.095);
    const my = topY - ry * 0.5 + (i % 2) * ry * 0.22;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + 6 * S, my + 2.4 * S);
    ctx.stroke();
  }
  ctx.restore();

  /* A tiny fern beside the stump */
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#536c38';
  ctx.lineWidth = 1.3 * S;
  for (let i = 0; i < 4; i++) {
    const a = -0.85 - i * 0.18;
    const len = (14 + i * 4) * S;
    const fx = cx + rx * 0.72;
    const fy = ground - 2 * S;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + Math.cos(a) * len * 0.5, fy + Math.sin(a) * len * 0.6, fx + Math.cos(a) * len, fy + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}
