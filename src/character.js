/* Procedural lumberjack rig: legs, torso, head, arms and the axe. */
import { TAU, clamp, solveElbow, roundRect, line } from './utils.js';

const HIP_Y = -104;

function torsoPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-19, -101);
  ctx.bezierCurveTo(-31, -124, -29, -160, -18, -180);
  ctx.bezierCurveTo(-11, -192, 1, -198, 17, -198);
  ctx.bezierCurveTo(32, -198, 43, -191, 45, -175);
  ctx.lineTo(36, -104);
  ctx.bezierCurveTo(18, -95, -2, -95, -19, -101);
  ctx.closePath();
}

function axeFrame(pose) {
  const c = Math.cos(pose.angle);
  const s = Math.sin(pose.angle);
  return {
    cos: c,
    sin: s,
    backHand: { x: pose.gripX - c * 15, y: pose.gripY - s * 15 },
    frontHand: { x: pose.gripX + c * 13, y: pose.gripY + s * 13 },
    head: { x: pose.gripX + c * 99, y: pose.gripY + s * 99 },
    tip: { x: pose.gripX + c * 118, y: pose.gripY + s * 118 },
  };
}

function drawBoot(ctx, x, y, front) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(front ? -0.03 : 0.05);
  if (!front) ctx.scale(0.9, 0.92);
  ctx.beginPath();
  ctx.moveTo(-10, -9);
  ctx.quadraticCurveTo(2, -11, 12, -8);
  ctx.quadraticCurveTo(22, -6, 25, 0);
  ctx.quadraticCurveTo(25, 4, 18, 4.5);
  ctx.lineTo(-9, 4.5);
  ctx.quadraticCurveTo(-13, 3, -13, -2);
  ctx.closePath();
  ctx.fillStyle = front ? '#4d2d19' : '#3a2114';
  ctx.fill();
  ctx.strokeStyle = '#2a160c';
  ctx.lineWidth = 1.7;
  ctx.stroke();

  ctx.strokeStyle = '#7b4a2b';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.quadraticCurveTo(3, -9.4, 12, -7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, -7);
  ctx.lineTo(11, -6);
  ctx.moveTo(1, -3);
  ctx.lineTo(11, -2);
  ctx.stroke();

  ctx.fillStyle = '#21130b';
  roundRect(ctx, -13, 2.2, 38, 3.2, 1.6);
  ctx.fill();
  ctx.restore();
}

function drawLeg(ctx, hip, knee, ankle, front) {
  const outline = '#1e241c';
  const cloth = front ? '#3d4939' : '#313b2f';

  line(ctx, hip.x, hip.y, knee.x, knee.y, front ? 23 : 21, outline);
  line(ctx, hip.x, hip.y, knee.x, knee.y, front ? 18.5 : 16.5, cloth);

  ctx.globalAlpha = 0.28;
  line(ctx, hip.x + 4, hip.y - 3, knee.x + 2, knee.y + 4, 2.2, '#a5a181');
  ctx.globalAlpha = 1;

  line(ctx, knee.x, knee.y, ankle.x, ankle.y, front ? 21 : 19, outline);
  line(ctx, knee.x, knee.y, ankle.x, ankle.y, front ? 16.5 : 14.5, front ? '#35402f' : '#2a3428');

  /* rolled cuff */
  const cx = ankle.x + (knee.x - ankle.x) * 0.16;
  const cy = ankle.y + (knee.y - ankle.y) * 0.16;
  const a = Math.atan2(knee.y - ankle.y, knee.x - ankle.x);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.strokeStyle = '#263026';
  ctx.lineWidth = front ? 17 : 15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.strokeStyle = '#596149';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(-4, 6);
  ctx.stroke();
  ctx.restore();

  drawBoot(ctx, ankle.x + (front ? 3 : 0), -1, front);
}

function drawArm(ctx, shoulder, hand, front) {
  const elbow = solveElbow(shoulder.x, shoulder.y, hand.x, hand.y, 39, 41);
  const outline = front ? '#4a1c13' : '#361711';
  const sleeve = front ? '#a93e29' : '#7f2b1e';

  line(ctx, shoulder.x, shoulder.y, elbow.x, elbow.y, front ? 21 : 18, outline);
  line(ctx, shoulder.x, shoulder.y, elbow.x, elbow.y, front ? 17 : 14.5, sleeve);

  ctx.globalAlpha = front ? 0.28 : 0.15;
  line(ctx, shoulder.x - 2, shoulder.y - 1, elbow.x - 2, elbow.y, 3.2, '#ffb98b');
  ctx.globalAlpha = 1;

  /* Plaid bands on the upper sleeve */
  ctx.save();
  ctx.translate(shoulder.x, shoulder.y);
  ctx.rotate(Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x));
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = '#40130d';
  ctx.lineWidth = 2.2;
  const armLength = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  ctx.beginPath();
  ctx.moveTo(armLength * 0.42, -8);
  ctx.lineTo(armLength * 0.42, 8);
  ctx.moveTo(armLength * 0.67, -8);
  ctx.lineTo(armLength * 0.67, 8);
  ctx.stroke();
  ctx.restore();

  /* Cuff */
  const cuffX = elbow.x + (hand.x - elbow.x) * 0.14;
  const cuffY = elbow.y + (hand.y - elbow.y) * 0.14;
  const angle = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  ctx.save();
  ctx.translate(cuffX, cuffY);
  ctx.rotate(angle);
  ctx.strokeStyle = front ? '#7d2a1d' : '#5b2017';
  ctx.lineWidth = front ? 15 : 12.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(2.5, 0);
  ctx.stroke();
  ctx.strokeStyle = '#d38d63';
  ctx.lineWidth = front ? 5.6 : 4.6;
  ctx.beginPath();
  ctx.moveTo(3.2, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.restore();

  line(ctx, elbow.x, elbow.y, hand.x, hand.y, front ? 12.5 : 10.5, '#2f180d');
  line(ctx, elbow.x, elbow.y, hand.x, hand.y, front ? 9.5 : 7.8, front ? '#ca8b5d' : '#a66c45');
  ctx.globalAlpha = 0.35;
  line(ctx, elbow.x + 1, elbow.y, hand.x, hand.y, 1.6, '#f0bd8d');
  ctx.globalAlpha = 1;

  return elbow;
}

function drawGlove(ctx, x, y, angle, front) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = front ? '#5b3520' : '#482a19';
  ctx.strokeStyle = '#2d180c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.2, 6.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#7b4a2c';
  roundRect(ctx, -9, -5, 3.2, 10, 1.6);
  ctx.fill();

  ctx.fillStyle = front ? '#6a3e25' : '#56311d';
  ctx.beginPath();
  ctx.ellipse(3.6, 2.7, 3.1, 2.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHead(ctx) {
  const cx = 17;
  const cy = -223;

  /* neck */
  ctx.fillStyle = '#b9764c';
  ctx.beginPath();
  ctx.moveTo(4, -204);
  ctx.quadraticCurveTo(8, -194, 20, -194);
  ctx.lineTo(25, -200);
  ctx.lineTo(19, -207);
  ctx.closePath();
  ctx.fill();

  /* ear */
  ctx.fillStyle = '#c58658';
  ctx.strokeStyle = '#93552f';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-2.5, -221, 4.8, 6.2, -0.15, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#9c5c38';
  ctx.beginPath();
  ctx.arc(-2.2, -221, 2.3, -1.1, 1.4);
  ctx.stroke();

  /* face */
  const skin = ctx.createRadialGradient(cx + 8, cy - 8, 3, cx + 2, cy + 2, 30);
  skin.addColorStop(0, '#e9b17d');
  skin.addColorStop(0.58, '#d99a68');
  skin.addColorStop(1, '#b97247');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 21.5, 23.5, -0.05, 0, TAU);
  ctx.fill();

  /* nose */
  ctx.fillStyle = '#d99765';
  ctx.beginPath();
  ctx.moveTo(36.5, -224);
  ctx.quadraticCurveTo(43, -220.5, 41.6, -216.9);
  ctx.quadraticCurveTo(40.5, -214.2, 35.5, -215);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#f4c79b';
  ctx.beginPath();
  ctx.ellipse(38.7, -220.6, 1.8, 3.6, 0.4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* cheek */
  ctx.globalAlpha = 0.17;
  ctx.fillStyle = '#ffd5a2';
  ctx.beginPath();
  ctx.ellipse(29, -213, 7.5, 5.2, 0.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* eye */
  ctx.fillStyle = '#2b1a10';
  ctx.beginPath();
  ctx.ellipse(29, -221.5, 2.2, 2.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,245,220,.85)';
  ctx.beginPath();
  ctx.arc(29.7, -222.4, 0.7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#57371f';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(23.5, -228.2);
  ctx.quadraticCurveTo(29, -230.2, 34.5, -227.5);
  ctx.stroke();

  /* beard */
  const beard = ctx.createLinearGradient(0, -220, 0, -193);
  beard.addColorStop(0, '#8d5a32');
  beard.addColorStop(1, '#653d22');
  ctx.fillStyle = beard;
  ctx.beginPath();
  ctx.moveTo(-2, -221);
  ctx.bezierCurveTo(-2.5, -208, 5.5, -198.5, 16, -196.3);
  ctx.bezierCurveTo(27.5, -194, 37, -201, 40.3, -212.5);
  ctx.bezierCurveTo(36.6, -207.3, 32, -204.4, 26.2, -204.6);
  ctx.bezierCurveTo(19.5, -205, 13.2, -208.2, 9.4, -213.2);
  ctx.bezierCurveTo(6.5, -217, 3.2, -219.4, -2, -221);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#b4804f';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(5 + i * 3.1, -208.8);
    ctx.quadraticCurveTo(7 + i * 3.3, -203.6, 10 + i * 3.1, -200.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* moustache */
  ctx.fillStyle = '#78482a';
  ctx.beginPath();
  ctx.moveTo(31, -216.5);
  ctx.quadraticCurveTo(37.8, -217.6, 40.2, -212.8);
  ctx.quadraticCurveTo(35, -212.4, 30.2, -213.6);
  ctx.closePath();
  ctx.fill();

  /* beanie */
  ctx.save();
  ctx.translate(0, -6);
  const hat = ctx.createLinearGradient(0, -258, 0, -225);
  hat.addColorStop(0, '#eab24b');
  hat.addColorStop(0.6, '#dca03c');
  hat.addColorStop(1, '#b87527');
  ctx.fillStyle = hat;
  ctx.beginPath();
  ctx.moveTo(-7, -229);
  ctx.bezierCurveTo(-9, -247, 3, -259, 18, -259);
  ctx.bezierCurveTo(33, -259, 44, -247, 43, -230);
  ctx.lineTo(42, -225);
  ctx.bezierCurveTo(28, -230.5, 9, -230.5, -6, -223);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f0bd58';
  ctx.beginPath();
  ctx.moveTo(-6.4, -232);
  ctx.bezierCurveTo(6, -237, 31, -237.6, 42.6, -229.5);
  ctx.lineTo(42.2, -224.6);
  ctx.bezierCurveTo(28, -230.3, 8, -230.3, -5.8, -225);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#8f541b';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 5.1;
    ctx.beginPath();
    ctx.moveTo(x, -236);
    ctx.lineTo(x + 0.5, -228);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* hat seam */
  ctx.strokeStyle = 'rgba(123,72,14,.26)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(17, -257);
  ctx.quadraticCurveTo(21, -244, 23, -231);
  ctx.stroke();

  /* pine sprig tucked into the hat band */
  ctx.save();
  ctx.translate(4, -231);
  ctx.rotate(-0.34);
  ctx.strokeStyle = '#486139';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -5);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const bx = -8 + t * 7;
    const by = -5 + t * 4.3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - 3.2, by - 1.7);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - 2.2, by + 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawTorso(ctx) {
  const shirt = ctx.createLinearGradient(-20, -180, 44, -100);
  shirt.addColorStop(0, '#7f2b1f');
  shirt.addColorStop(0.38, '#b6412b');
  shirt.addColorStop(0.72, '#9e3624');
  shirt.addColorStop(1, '#6c241a');
  ctx.fillStyle = shirt;
  torsoPath(ctx);
  ctx.fill();

  ctx.save();
  torsoPath(ctx);
  ctx.clip();

  /* plaid weave */
  ctx.globalAlpha = 0.19;
  ctx.strokeStyle = '#3e0e0b';
  ctx.lineWidth = 4;
  for (let x = -34; x < 50; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -200);
    ctx.lineTo(x, -92);
    ctx.stroke();
  }
  for (let y = -196; y < -92; y += 12) {
    ctx.beginPath();
    ctx.moveTo(-36, y);
    ctx.lineTo(52, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffd0a0';
  ctx.lineWidth = 1.5;
  for (let x = -28; x < 50; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -200);
    ctx.lineTo(x, -92);
    ctx.stroke();
  }
  for (let y = -190; y < -92; y += 12) {
    ctx.beginPath();
    ctx.moveTo(-36, y);
    ctx.lineTo(52, y);
    ctx.stroke();
  }

  /* side shading and wrinkle */
  const shade = ctx.createLinearGradient(-30, 0, 46, 0);
  shade.addColorStop(0, 'rgba(43,8,7,.42)');
  shade.addColorStop(0.5, 'rgba(43,8,7,0)');
  shade.addColorStop(1, 'rgba(255,173,128,.13)');
  ctx.fillStyle = shade;
  ctx.fillRect(-36, -202, 92, 112);

  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = '#4b100c';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(4, -181);
  ctx.quadraticCurveTo(15, -154, 13, -121);
  ctx.moveTo(26, -180);
  ctx.quadraticCurveTo(32, -153, 29, -120);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  /* collar */
  ctx.fillStyle = '#6e2119';
  ctx.beginPath();
  ctx.moveTo(3, -198);
  ctx.lineTo(18, -190);
  ctx.lineTo(30, -198);
  ctx.lineTo(25, -203);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d07855';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, -197);
  ctx.lineTo(18, -191);
  ctx.stroke();

  /* belt */
  ctx.fillStyle = '#3d2a1b';
  roundRect(ctx, -21, -109, 59, 11, 4);
  ctx.fill();
  ctx.fillStyle = '#7f5a31';
  roundRect(ctx, 21, -107.5, 10, 7, 2.5);
  ctx.fill();
  ctx.fillStyle = '#c79a54';
  roundRect(ctx, 23.5, -106, 5, 4, 1.5);
  ctx.fill();

  /* buttons */
  ctx.fillStyle = '#4d1712';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(36.5, -166 + i * 15, 1.8, 0, TAU);
    ctx.fill();
  }

  /* small chest pocket */
  ctx.strokeStyle = 'rgba(67,17,13,.45)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(19, -169);
  ctx.lineTo(31, -170);
  ctx.lineTo(30, -158);
  ctx.lineTo(20, -157);
  ctx.closePath();
  ctx.stroke();
}

function bodyTransform(ctx, L, pose, draw) {
  ctx.save();
  ctx.translate(L.charX, L.groundY);
  ctx.scale(L.S, L.S);
  ctx.translate(0, HIP_Y + pose.bob);
  ctx.rotate(pose.lean);
  ctx.translate(0, -HIP_Y);
  draw();
  ctx.restore();
}

function characterOuter(ctx, L, draw) {
  ctx.save();
  ctx.translate(L.charX, L.groundY);
  ctx.scale(L.S, L.S);
  draw();
  ctx.restore();
}

export function drawCharacterBody(ctx, L, pose, time) {
  characterOuter(ctx, L, () => {
    /* ground shadow */
    const sx = 4;
    const shadow = ctx.createRadialGradient(sx, 2, 2, sx, 2, 88);
    shadow.addColorStop(0, 'rgba(5,11,8,.52)');
    shadow.addColorStop(0.55, 'rgba(5,11,8,.22)');
    shadow.addColorStop(1, 'rgba(5,11,8,0)');
    ctx.save();
    ctx.translate(sx, 2);
    ctx.scale(1, 0.24);
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, 88, 0, TAU);
    ctx.fill();
    ctx.restore();

    const crouch = pose.crouch;
    const hip = { x: 1, y: HIP_Y + crouch * 3.5 };
    drawLeg(ctx, { x: hip.x - 8, y: hip.y + 1 }, { x: -25, y: -55 + crouch * 5 }, { x: -28, y: -10 }, false);
    drawLeg(ctx, { x: hip.x + 9, y: hip.y }, { x: 29, y: -53 + crouch * 7 }, { x: 34, y: -9 }, true);
  });

  bodyTransform(ctx, L, pose, () => {
    const frame = axeFrame(pose);
    drawArm(ctx, { x: -9, y: -181 }, frame.backHand, false);
    drawTorso(ctx);
    drawHead(ctx);

    /* tiny shoulders/highlight on the near side */
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffb98d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, -190);
    ctx.quadraticCurveTo(43, -187, 45, -172);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

export function drawAxeAndArms(ctx, L, pose) {
  const frame = axeFrame(pose);

  bodyTransform(ctx, L, pose, () => {
    /* ── axe ─────────────────────────────────── */
    ctx.save();
    ctx.translate(pose.gripX, pose.gripY);
    ctx.rotate(pose.angle);

    /* handle outline + wood */
    line(ctx, -35, 0, 101, 0, 12.5, '#2a170b');
    const wood = ctx.createLinearGradient(0, -5, 0, 5);
    wood.addColorStop(0, '#a46e3b');
    wood.addColorStop(0.45, '#87562c');
    wood.addColorStop(1, '#5f3a1e');
    ctx.strokeStyle = wood;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-35, 0);
    ctx.lineTo(101, 0);
    ctx.stroke();

    ctx.globalAlpha = 0.4;
    line(ctx, -30, -2.4, 91, -2.4, 1.6, '#e2ab68');
    ctx.globalAlpha = 0.3;
    line(ctx, -20, 2.2, 54, 2.2, 1, '#3a2010');
    ctx.globalAlpha = 1;

    /* leather grip wrap */
    ctx.strokeStyle = '#4f2b15';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 7; i++) {
      const x = -16 + i * 4.6;
      ctx.beginPath();
      ctx.moveTo(x, -4.6);
      ctx.lineTo(x + 1.5, 4.6);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(218,166,102,.45)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 6; i++) {
      const x = -14 + i * 4.6;
      ctx.beginPath();
      ctx.moveTo(x, -3.8);
      ctx.lineTo(x + 1.2, 3.8);
      ctx.stroke();
    }

    /* steel head: eye at the handle, broad blade falling on the +y side */
    ctx.save();
    ctx.translate(93.5, 1.5);
    ctx.scale(0.82, 0.82);
    ctx.translate(-93.5, -1.5);
    const steel = ctx.createLinearGradient(78, -12, 112, 44);
    steel.addColorStop(0, '#f8fbf5');
    steel.addColorStop(0.25, '#dfe7e0');
    steel.addColorStop(0.58, '#aab8b2');
    steel.addColorStop(0.84, '#7e908b');
    steel.addColorStop(1, '#556863');
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(85.5, -11);
    ctx.lineTo(100.5, -11.5);
    ctx.quadraticCurveTo(103.5, -8.5, 103, -2);
    ctx.lineTo(103.5, 5);
    ctx.bezierCurveTo(111, 9, 114.5, 17, 115, 26);
    ctx.bezierCurveTo(115.5, 35, 107.5, 42.5, 92, 43);
    ctx.bezierCurveTo(78, 43.2, 69.5, 37.5, 68.5, 29.5);
    ctx.bezierCurveTo(67.8, 22.5, 72.5, 15.5, 82.5, 9);
    ctx.lineTo(84, 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#41524f';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    /* cutting edge */
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.9;
    ctx.beginPath();
    ctx.moveTo(114.4, 27);
    ctx.bezierCurveTo(114.1, 36, 106.5, 42, 92.4, 42.2);
    ctx.bezierCurveTo(80, 42.3, 71.2, 37, 69.4, 30.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(75,94,89,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(110.7, 30);
    ctx.bezierCurveTo(108.9, 37, 102, 40, 92, 40.2);
    ctx.stroke();

    /* bevel + eye */
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(104, 10);
    ctx.quadraticCurveTo(108.5, 17, 109, 27);
    ctx.stroke();
    ctx.fillStyle = '#3c2a19';
    ctx.beginPath();
    ctx.ellipse(93.5, 1.5, 3.1, 5.2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#b8c5bf';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    /* forged scratches */
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#f4f8f2';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(92, -6);
    ctx.lineTo(98.5, -2);
    ctx.moveTo(88, 14);
    ctx.lineTo(97, 18);
    ctx.moveTo(86, 25);
    ctx.lineTo(94, 28);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.restore();

    /* ── near arm over the axe ─────────────────── */
    drawArm(ctx, { x: 25, y: -180 }, frame.frontHand, true);

    /* both gloves */
    drawGlove(ctx, frame.backHand.x, frame.backHand.y, pose.angle, false);
    drawGlove(ctx, frame.frontHand.x, frame.frontHand.y, pose.angle, true);

    /* cuff of the near sleeve */
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#4d130d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(27, -184);
    ctx.quadraticCurveTo(35, -179, 34, -172);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

export function axeHeadWorld(L, pose) {
  const frame = axeFrame(pose);
  const c = Math.cos(pose.lean);
  const s = Math.sin(pose.lean);
  const dx = frame.head.x;
  const dy = frame.head.y - HIP_Y;
  return {
    x: L.charX + L.S * (dx * c - dy * s),
    y: L.groundY + L.S * (HIP_Y + pose.bob + dx * s + dy * c),
  };
}

export function idlePose(time) {
  const breath = Math.sin(time * 1.75);
  return {
    lean: 0.012 + Math.sin(time * 0.82) * 0.007,
    gripX: 46 + breath * 0.5,
    gripY: -140 + breath * 1.15,
    angle: -1.18 + Math.sin(time * 0.74) * 0.012,
    bob: breath * 1.25,
    crouch: 0,
  };
}

export const POSES = {
  idle: { lean: 0.012, gripX: 46, gripY: -140, angle: -1.18, bob: 0, crouch: 0 },
  wind: { lean: -0.17, gripX: 0, gripY: -203, angle: -2.6, bob: -2.6, crouch: 0.18 },
  strike: { lean: 0.215, gripX: 38, gripY: -146, angle: 0.65, bob: 3.2, crouch: 0.8 },
};
