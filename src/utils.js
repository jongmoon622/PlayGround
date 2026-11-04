/* Shared helpers for the 장작꾼 canvas scene. */
export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function ellipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, TAU);
}

export function solveElbow(sx, sy, hx, hy, upper, lower) {
  let dx = hx - sx;
  let dy = hy - sy;
  let distance = Math.hypot(dx, dy);
  const max = upper + lower - 0.001;
  const min = Math.abs(upper - lower) + 0.001;

  if (distance > max) {
    dx = (dx / distance) * max;
    dy = (dy / distance) * max;
    hx = sx + dx;
    hy = sy + dy;
    distance = max;
  } else if (distance < min) {
    distance = min;
    dx = dx || min;
    dy = dy || 0;
    const length = Math.hypot(dx, dy) || 1;
    dx = (dx / length) * min;
    dy = (dy / length) * min;
    hx = sx + dx;
    hy = sy + dy;
    distance = min;
  }

  const a = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  const mx = sx + (dx * a) / distance;
  const my = sy + (dy * a) / distance;
  const p1 = { x: mx - (dy / distance) * h, y: my + (dx / distance) * h };
  const p2 = { x: mx + (dy / distance) * h, y: my - (dx / distance) * h };
  return p1.y > p2.y ? p1 : p2;
}

export function line(ctx, x1, y1, x2, y2, width, color) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
