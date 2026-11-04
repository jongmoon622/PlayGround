import * as THREE from 'three';
import { FIELD, TEAM } from './constants.js';
import { canvasTexture, rand, glowSprite, randInt } from './utils.js';

function fieldTexture() {
  return canvasTexture(960, 1242, (ctx, w, h) => {
    // base
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#0b1c20');
    base.addColorStop(0.5, '#08191b');
    base.addColorStop(1, '#0b1c20');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // mowed stripes
    for (let i = 0; i < 22; i++) {
      if (i % 2) continue;
      ctx.fillStyle = 'rgba(120, 215, 190, 0.022)';
      ctx.fillRect(0, (i / 22) * h, w, h / 22);
    }
    // fine grid
    ctx.strokeStyle = 'rgba(110, 190, 190, 0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // team end glows
    const bg = ctx.createLinearGradient(0, h, 0, h - 260);
    bg.addColorStop(0, 'rgba(34, 146, 255, 0.20)');
    bg.addColorStop(1, 'rgba(34, 146, 255, 0)');
    ctx.fillStyle = bg; ctx.fillRect(0, h - 260, w, 260);
    const og = ctx.createLinearGradient(0, 0, 0, 260);
    og.addColorStop(0, 'rgba(255, 116, 30, 0.20)');
    og.addColorStop(1, 'rgba(255, 116, 30, 0)');
    ctx.fillStyle = og; ctx.fillRect(0, 0, w, 260);

    const line = 'rgba(203, 240, 255, 0.62)';
    ctx.strokeStyle = line;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(120, 220, 255, 0.4)';
    ctx.shadowBlur = 10;

    // boundary
    const m = 26;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    // halfway
    ctx.beginPath(); ctx.moveTo(m, h / 2); ctx.lineTo(w - m, h / 2); ctx.stroke();
    // center circle
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 116, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2); ctx.fillStyle = line; ctx.fill();

    // center faint emblem
    ctx.save();
    ctx.globalAlpha = 0.17;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 2;
    for (let r = 150; r < 330; r += 45) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, -0.35, 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, Math.PI - 0.35, Math.PI + 0.35);
      ctx.stroke();
    }
    ctx.restore();

    // goal boxes
    const boxW = 390, boxD = 152;
    ctx.strokeRect((w - boxW) / 2, m, boxW, boxD);
    ctx.strokeRect((w - boxW) / 2, h - m - boxD, boxW, boxD);
    // arcs
    ctx.beginPath(); ctx.arc(w / 2, m + boxD, 120, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h - m - boxD, 120, Math.PI + 0.2, Math.PI * 2 - 0.2); ctx.stroke();

    // corner chevrons
    const corner = 104;
    ctx.strokeStyle = 'rgba(203, 240, 255, 0.36)';
    ctx.lineWidth = 2;
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * corner, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * corner);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + sx * (corner - 18), y + sy * 18);
      ctx.lineTo(x + sx * 18, y + sy * 18);
      ctx.lineTo(x + sx * 18, y + sy * (corner - 18));
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // mid-field logo lettering
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(0);
    ctx.font = '900 46px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180, 235, 255, 0.09)';
    ctx.fillText('NEO LEAGUE', 0, -186);
    ctx.font = '700 22px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(180, 235, 255, 0.10)';
    ctx.fillText('TURBO STRIKERS ARENA', 0, 212);
    ctx.restore();
  }, { anisotropy: 8 });
}

function skyTexture() {
  return canvasTexture(8, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#01030a');
    g.addColorStop(0.42, '#061226');
    g.addColorStop(0.62, '#0b2140');
    g.addColorStop(0.76, '#123153');
    g.addColorStop(0.84, '#0a1a2e');
    g.addColorStop(1, '#03060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function makeNet(color) {
  const pts = [];
  const gx = 11, gy = FIELD.goalH, depth = FIELD.goalDepth;
  // back plane grid
  for (let x = -gx; x <= gx; x += 2.2) {
    pts.push(x, 0, depth, x, gy, depth);
  }
  for (let y = 0; y <= gy; y += 1.8) {
    pts.push(-gx, y, depth, gx, y, depth);
  }
  // top and sides
  for (let i = 0; i <= 5; i++) {
    const z = (i / 5) * depth;
    pts.push(-gx, gy, z, gx, gy, z);
    pts.push(-gx, 0, z, -gx, gy, z);
    pts.push(gx, 0, z, gx, gy, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 }));
}

export function buildArena(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ── sky dome ──────────────────────────────────────────────
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false })
  );
  group.add(sky);

  // stars
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const r = rand(100, 220);
    const theta = rand(0, Math.PI * 2);
    const phi = rand(0.02, Math.PI * 0.48);
    starPos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
    starPos[i * 3 + 1] = 8 + Math.sin(phi) * r * 0.9;
    starPos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    starSizes[i] = rand(0.5, 1.8);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xbfe8ff, size: 0.9, transparent: true, opacity: 0.65, sizeAttenuation: true, depthWrite: false,
  }));
  group.add(stars);

  // ── lights ────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9cd9ff, 0x0a1620, 1.45));
  scene.add(new THREE.AmbientLight(0x3b6485, 0.78));

  const sun = new THREE.DirectionalLight(0xf2fbff, 2.7);
  sun.position.set(24, 54, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 62;
  sun.shadow.camera.bottom = -62;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const blueLight = new THREE.PointLight(TEAM.blue.color, 95, 62, 2);
  blueLight.position.set(0, 14, -FIELD.halfL - 2);
  scene.add(blueLight);
  const orangeLight = new THREE.PointLight(TEAM.orange.color, 95, 62, 2);
  orangeLight.position.set(0, 14, FIELD.halfL + 2);
  scene.add(orangeLight);

  const fill1 = new THREE.PointLight(0x5ea8ff, 55, 85, 2);
  fill1.position.set(-22, 24, 0);
  scene.add(fill1);
  const fill2 = new THREE.PointLight(0xff8a4a, 40, 85, 2);
  fill2.position.set(24, 22, 8);
  scene.add(fill2);

  // ── pitch ─────────────────────────────────────────────────
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.halfW * 2, FIELD.halfL * 2),
    new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.82, metalness: 0.12 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // outer apron
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.halfW * 2 + 34, FIELD.halfL * 2 + 34),
    new THREE.MeshStandardMaterial({ color: 0x050d16, roughness: 0.9, metalness: 0.25 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.16;
  apron.receiveShadow = true;
  group.add(apron);

  // glowing sidelines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x86e4ff, transparent: true, opacity: 0.85 });
  const sides = [
    { p: [0, 0.03, -FIELD.halfL], s: [FIELD.halfW * 2, 0.03, 0.18] },
    { p: [0, 0.03, FIELD.halfL], s: [FIELD.halfW * 2, 0.03, 0.18] },
    { p: [-FIELD.halfW, 0.03, 0], s: [0.18, 0.03, FIELD.halfL * 2] },
    { p: [FIELD.halfW, 0.03, 0], s: [0.18, 0.03, FIELD.halfL * 2] },
  ];
  sides.forEach(({ p, s }) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s), lineMat);
    m.position.set(...p);
    group.add(m);
  });

  // ── glass boundary walls ─────────────────────────────────
  const wallMatSide = new THREE.MeshPhysicalMaterial({
    color: 0x1f6d8c, transparent: true, opacity: 0.13, roughness: 0.08, metalness: 0.55,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x68d6ff, transparent: true, opacity: 0.36 });
  function addGlass(w, h, d, x, y, z, material = wallMatSide) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    group.add(edges);
    return mesh;
  }

  addGlass(0.32, FIELD.wallH, FIELD.halfL * 2, -FIELD.halfW, FIELD.wallH / 2, 0);
  addGlass(0.32, FIELD.wallH, FIELD.halfL * 2, FIELD.halfW, FIELD.wallH / 2, 0);

  const sideSegment = (FIELD.halfW * 2 - FIELD.goalHalfW * 2) / 2;
  const sideX = FIELD.goalHalfW + sideSegment / 2;
  const wallMatBlue = new THREE.MeshPhysicalMaterial({
    color: 0x1a5f9a, transparent: true, opacity: 0.17, roughness: 0.1, metalness: 0.5,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const wallMatOrange = new THREE.MeshPhysicalMaterial({
    color: 0x9a4a17, transparent: true, opacity: 0.17, roughness: 0.1, metalness: 0.5,
    side: THREE.DoubleSide, depthWrite: false,
  });
  for (const sign of [-1, 1]) {
    const mat = sign < 0 ? wallMatBlue : wallMatOrange;
    const z = sign * FIELD.halfL;
    addGlass(sideSegment, FIELD.wallH, 0.32, -sideX, FIELD.wallH / 2, z, mat);
    addGlass(sideSegment, FIELD.wallH, 0.32, sideX, FIELD.wallH / 2, z, mat);
    addGlass(FIELD.goalHalfW * 2, FIELD.wallH - FIELD.goalH, 0.32, 0, FIELD.goalH + (FIELD.wallH - FIELD.goalH) / 2, z, mat);
  }

  // vertical ribs + top rail
  const ribMat = new THREE.MeshBasicMaterial({ color: 0x59cbff, transparent: true, opacity: 0.35 });
  const ribMatO = new THREE.MeshBasicMaterial({ color: 0xff9347, transparent: true, opacity: 0.35 });
  for (let z = -FIELD.halfL; z <= FIELD.halfL; z += 8) {
    for (const x of [-FIELD.halfW, FIELD.halfW]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, FIELD.wallH, 0.22), x < 0 ? ribMat : ribMat);
      rib.position.set(x, FIELD.wallH / 2, z);
      group.add(rib);
    }
  }
  for (const x of [-FIELD.halfW, FIELD.halfW]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, FIELD.halfL * 2), ribMat);
    rail.position.set(x, FIELD.wallH, 0);
    group.add(rail);
  }
  for (const sign of [-1, 1]) {
    const mat = sign < 0 ? ribMat : ribMatO;
    const z = sign * FIELD.halfL;
    for (let x = -FIELD.halfW; x <= FIELD.halfW; x += 8) {
      if (Math.abs(x) < FIELD.goalHalfW) continue;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, FIELD.wallH, 0.22), mat);
      rib.position.set(x, FIELD.wallH / 2, z);
      group.add(rib);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfW * 2, 0.22, 0.35), mat);
    rail.position.set(0, FIELD.wallH, z);
    group.add(rail);
  }

  // ── goals ─────────────────────────────────────────────────
  const goalGlows = {};
  for (const [teamKey, sign] of [['blue', -1], ['orange', 1]]) {
    const team = TEAM[teamKey];
    const z = sign * FIELD.halfL;
    const goal = new THREE.Group();
    goal.position.set(0, 0, z);
    group.add(goal);

    const frameMat = new THREE.MeshStandardMaterial({
      color: team.color, emissive: team.color, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.3,
    });
    const postGeo = new THREE.CylinderGeometry(0.34, 0.42, FIELD.goalH, 10);
    for (const x of [-FIELD.goalHalfW, FIELD.goalHalfW]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(x, FIELD.goalH / 2, 0);
      goal.add(post);
      const cap = glowSprite(team.color, 4.2, 0.7);
      cap.position.set(x, FIELD.goalH, 0.2);
      goal.add(cap);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalHalfW * 2 + 0.7, 0.55, 0.7), frameMat);
    bar.position.set(0, FIELD.goalH, 0);
    goal.add(bar);

    // goal floor + back
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalHalfW * 2, FIELD.goalDepth),
      new THREE.MeshStandardMaterial({ color: 0x061019, roughness: 0.85, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, sign * FIELD.goalDepth / 2);
    goal.add(floor);

    const net = makeNet(team.color);
    net.position.z = sign * FIELD.goalDepth;
    if (sign > 0) net.scale.z = 1;
    const netGroup = new THREE.Group();
    netGroup.add(net);
    // side/top depth lines
    const pts = [
      -FIELD.goalHalfW, 0, 0, -FIELD.goalHalfW, 0, sign * FIELD.goalDepth,
      FIELD.goalHalfW, 0, 0, FIELD.goalHalfW, 0, sign * FIELD.goalDepth,
      -FIELD.goalHalfW, FIELD.goalH, 0, -FIELD.goalHalfW, FIELD.goalH, sign * FIELD.goalDepth,
      FIELD.goalHalfW, FIELD.goalH, 0, FIELD.goalHalfW, FIELD.goalH, sign * FIELD.goalDepth,
      -FIELD.goalHalfW, FIELD.goalH, sign * FIELD.goalDepth, FIELD.goalHalfW, FIELD.goalH, sign * FIELD.goalDepth,
    ];
    const frameGeo = new THREE.BufferGeometry();
    frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const frameLines = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: team.color, transparent: true, opacity: 0.5 }));
    netGroup.add(frameLines);
    goal.add(netGroup);

    // back wall glow
    const backGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalHalfW * 2, FIELD.goalH),
      new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    backGlow.position.set(0, FIELD.goalH / 2, sign * FIELD.goalDepth);
    goal.add(backGlow);
    goalGlows[teamKey] = backGlow;

    // mouth light plane
    const mouth = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalHalfW * 2 - 0.6, FIELD.goalH - 0.4),
      new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    mouth.position.set(0, FIELD.goalH / 2, -sign * 0.1);
    goal.add(mouth);

    // floor glow strip at the goal line
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.goalHalfW * 2, 0.06, 0.6),
      new THREE.MeshBasicMaterial({ color: team.color, transparent: true, opacity: 0.9 })
    );
    strip.position.set(0, 0.04, -sign * 0.3);
    goal.add(strip);
  }

  // goal-side text screens above the mouth
  for (const [teamKey, sign] of [['blue', -1], ['orange', 1]]) {
    const team = TEAM[teamKey];
    const tex = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(4,10,18,0.9)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = team.soft;
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = team.soft;
      ctx.font = '900 62px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(team.name, w / 2, h / 2 + 2);
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(19, 4.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    screen.position.set(0, FIELD.goalH + 3.3, sign * (FIELD.halfL + 0.2));
    screen.rotation.y = sign > 0 ? Math.PI : 0;
    group.add(screen);

    const halo = glowSprite(team.color, 26, 0.16);
    halo.position.copy(screen.position);
    group.add(halo);
  }

  // ── stands + crowd ─────────────────────────────────────────
  const standMat = new THREE.MeshStandardMaterial({ color: 0x071019, roughness: 0.9, metalness: 0.3 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.4 });

  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier++) {
      const w = 12 + tier * 6;
      const x = side * (FIELD.halfW + 9 + tier * 5);
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2 + tier * 2.4, FIELD.halfL * 2 + 24), standMat);
      step.position.set(x, (2.2 + tier * 2.4) / 2, 0);
      step.receiveShadow = true;
      group.add(step);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, FIELD.halfL * 2 + 24), trimMat);
      trim.position.set(side * (FIELD.halfW + 3.2 + tier * 5), 2.2 + tier * 2.4, 0);
      group.add(trim);
    }
  }
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier++) {
      const z = side * (FIELD.halfL + 8 + tier * 5);
      const step = new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfW * 2 + 42, 2.2 + tier * 2.4, 12 + tier * 5), standMat);
      step.position.set(0, (2.2 + tier * 2.4) / 2, z);
      step.receiveShadow = true;
      group.add(step);
    }
  }

  // crowd dots
  const crowdCount = 620;
  const crowd = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.42, 0.62, 0.42),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    crowdCount
  );
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  const palette = [0x2fb6ff, 0x2fb6ff, 0x8bdcff, 0xff7a24, 0xff7a24, 0xffb167, 0xd8f4ff, 0x53657a];
  for (let i = 0; i < crowdCount; i++) {
    let x, y, z;
    if (i % 2 === 0) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tier = randInt(0, 2);
      x = side * (FIELD.halfW + rand(4, 21) + tier * 2);
      z = rand(-FIELD.halfL - 14, FIELD.halfL + 14);
      y = rand(2.4, 2.4 + tier * 2.4 + 2.2);
    } else {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tier = randInt(0, 2);
      z = side * (FIELD.halfL + rand(5, 20) + tier * 2);
      x = rand(-FIELD.halfW - 15, FIELD.halfW + 15);
      y = rand(2.4, 2.4 + tier * 2.4 + 2.2);
    }
    m4.makeTranslation(x, y, z);
    crowd.setMatrixAt(i, m4);
    c.setHex(palette[randInt(0, palette.length - 1)]);
    c.multiplyScalar(rand(0.55, 1.1));
    crowd.setColorAt(i, c);
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  // ── overhead rig & jumbotron ───────────────────────────────
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x0a1624, metalness: 0.8, roughness: 0.3 });
  for (const z of [-FIELD.halfL + 5, FIELD.halfL - 5]) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfW * 2 + 12, 0.5, 0.5), rigMat);
    truss.position.set(0, 19, z);
    group.add(truss);
    for (let i = -4; i <= 4; i++) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.32, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xdff4ff })
      );
      lamp.position.set(i * 7, 18.7, z);
      group.add(lamp);
      const glow = glowSprite(0xbfeaff, 6, 0.18);
      glow.position.copy(lamp.position);
      group.add(glow);
    }
  }

  const jumbotron = new THREE.Group();
  jumbotron.position.set(0, 33.5, 0);
  jumbotron.scale.setScalar(0.86);
  const core = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 8), rigMat);
  jumbotron.add(core);
  const jumboTex = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#030a12'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#55cfff'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#8ce6ff';
    ctx.font = '900 52px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TURBO', w / 2, 92);
    ctx.fillStyle = '#ffae62';
    ctx.fillText('STRIKERS', w / 2, 152);
    ctx.fillStyle = 'rgba(190,235,255,0.6)';
    ctx.font = '700 24px Rajdhani, sans-serif';
    ctx.fillText('NEO LEAGUE', w / 2, 204);
  });
  for (const [z, rot] of [[4.01, 0], [-4.01, Math.PI], [0, 0]]) {
    if (z === 0) continue;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.4), new THREE.MeshBasicMaterial({ map: jumboTex }));
    screen.position.set(0, 0, z);
    screen.rotation.y = rot;
    jumbotron.add(screen);
  }
  // side screens
  const sideTex = canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#03111b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2fb6ff'; ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#ff7a24'; ctx.fillRect(0, h - 8, w, 8);
    ctx.fillStyle = 'rgba(200,240,255,0.7)';
    ctx.font = '900 56px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VS', w / 2, 100);
  });
  for (const [x, rot] of [[7.01, Math.PI / 2], [-7.01, -Math.PI / 2]]) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 4), new THREE.MeshBasicMaterial({ map: sideTex }));
    screen.position.set(x, 0, 0);
    screen.rotation.y = rot;
    jumbotron.add(screen);
  }
  // hanger cables
  for (const x of [-5, 5]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 18, 6), rigMat);
    cable.position.set(x, 8, 0);
    jumbotron.add(cable);
  }
  const jumboGlow = glowSprite(0x4fc9ff, 34, 0.13);
  jumboGlow.position.set(0, 0, 0);
  jumbotron.add(jumboGlow);
  group.add(jumbotron);

  // corner towers
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tower = new THREE.Group();
      tower.position.set(sx * (FIELD.halfW + 12), 0, sz * (FIELD.halfL + 12));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 21, 8), rigMat);
      mast.position.y = 10.5;
      tower.add(mast);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 1.1), new THREE.MeshBasicMaterial({ color: 0xe6f8ff }));
      lamp.position.y = 20.5;
      lamp.lookAt(new THREE.Vector3(0, 6, 0));
      tower.add(lamp);
      const halo = glowSprite(0xbfeaff, 11, 0.3);
      halo.position.y = 20.5;
      tower.add(halo);
      group.add(tower);
    }
  }

  scene.fog = new THREE.FogExp2(0x061018, 0.0065);

  // animated glow pulses
  const pulseMats = [goalGlows.blue.material, goalGlows.orange.material];

  return {
    group,
    goalGlows,
    stars,
    crowd,
    update(time) {
      const p = 0.5 + 0.5 * Math.sin(time * 1.6);
      goalGlows.blue.material.opacity = 0.09 + 0.06 * p;
      goalGlows.orange.material.opacity = 0.09 + 0.06 * (1 - p);
      jumbotron.rotation.y = Math.sin(time * 0.18) * 0.16;
      stars.rotation.y = time * 0.004;
    },
  };
}
