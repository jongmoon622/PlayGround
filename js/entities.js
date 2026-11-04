import * as THREE from 'three';
import { CAR, FIELD, TEAM } from './constants.js';
import { canvasTexture, clamp, damp, glowSprite, glowTexture, rand, sparkTexture, textSprite } from './utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ═══════════════════════════════════════════════════════════
   CAR
   ═══════════════════════════════════════════════════════════ */
function buildWheel(radius, width, rimColor) {
  const pivot = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.92, metalness: 0.15 }));
  tire.castShadow = true;
  pivot.add(tire);
  const rimGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.9, roughness: 0.25, emissive: rimColor, emissiveIntensity: 0.22 }));
  pivot.add(rim);
  return { pivot, tire };
}

export class Car {
  constructor(game, { team, name, isPlayer = false, isAI = false }) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.isPlayer = isPlayer;
    this.isAI = isAI;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.pos = this.group.position;
    this.yaw = team === 'blue' ? 0 : Math.PI;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.jumps = 0;
    this.boost = 33;
    this.item = null;
    this.itemRolling = 0;
    this.itemCycle = 0;
    this.stun = 0;
    this.spin = 0;
    this.invincible = 0;
    this.speedTimer = 0;
    this.shrinkTimer = 0;
    this.boosting = false;
    this.boostCooldown = 0;
    this.airTime = 0;
    this.wheelSpin = 0;
    this.lastTouch = 0;
    this.aiState = { stuck: 0, reverse: 0, decision: 0, jitter: Math.random() * 10 };
    this.flamePhase = Math.random() * 10;

    this.#buildMesh();
    this.reset(0, 0, this.yaw, false);
  }

  #buildMesh() {
    const team = TEAM[this.team];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: team.color, metalness: 0.62, roughness: 0.3,
      emissive: team.color, emissiveIntensity: 0.13,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a1119, metalness: 0.7, roughness: 0.35 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, metalness: 0.5, roughness: 0.28 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b2335, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.88,
      clearcoat: 1, clearcoatRoughness: 0.1,
    });
    this.bodyMat = bodyMat;

    // chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 3.9), bodyMat);
    chassis.position.y = 0.02;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.body.add(chassis);

    // nose wedge
    const noseGeo = new THREE.BoxGeometry(1.72, 0.28, 1.1);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, -0.03, 1.95);
    nose.castShadow = true;
    this.body.add(nose);
    const noseLip = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.13, 0.22), whiteMat);
    noseLip.position.set(0, -0.09, 2.48);
    this.body.add(noseLip);

    // side skirts
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 2.6), whiteMat);
      skirt.position.set(sx * 1.02, -0.14, 0.05);
      this.body.add(skirt);
    }

    // cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 1.62), glassMat);
    cabin.position.set(0, 0.44, -0.18);
    this.body.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.12, 1.1), bodyMat);
    roof.position.set(0, 0.7, -0.3);
    this.body.add(roof);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 1.5), whiteMat);
    stripe.position.set(0, 0.77, -0.32);
    this.body.add(stripe);

    // rear spoiler
    for (const sx of [-0.62, 0.62]) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.16), darkMat);
      support.position.set(sx, 0.42, -1.8);
      this.body.add(support);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.55), whiteMat);
    wing.position.set(0, 0.64, -1.84);
    wing.castShadow = true;
    this.body.add(wing);
    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.6), bodyMat);
    wingTipL.position.set(-1.0, 0.58, -1.84);
    this.body.add(wingTipL);
    const wingTipR = wingTipL.clone();
    wingTipR.position.x = 1.0;
    this.body.add(wingTipR);

    // lights
    const headMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff });
    for (const sx of [-0.63, 0.63]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.06), headMat);
      head.position.set(sx, 0.06, 2.505);
      this.body.add(head);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b25 });
    for (const sx of [-0.62, 0.62]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), tailMat);
      tail.position.set(sx, 0.14, -1.99);
      this.body.add(tail);
    }

    // wheels
    this.wheels = [];
    const wheelPositions = [
      [-0.98, -0.3, 1.32, true],
      [0.98, -0.3, 1.32, true],
      [-0.98, -0.3, -1.32, false],
      [0.98, -0.3, -1.32, false],
    ];
    for (const [x, y, z, front] of wheelPositions) {
      const { pivot, tire } = buildWheel(0.38, 0.34, 0xbcd8e8);
      pivot.position.set(x, y, z);
      this.body.add(pivot);
      this.wheels.push({ pivot, tire, front, baseY: y });
    }

    // boost flames
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const sx of [-0.5, 0.5]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.0, 8), flameMat.clone());
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(sx, 0.0, -2.2);
      flame.visible = false;
      this.body.add(flame);
      this.flames.push(flame);
    }

    // underglow
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 5.4),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), color: team.color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.72;
    this.body.add(glow);
    this.underglow = glow;

    // shield bubble (star)
    this.bubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.55, 2),
      new THREE.MeshBasicMaterial({
        color: 0xffe37a, transparent: true, opacity: 0.28, wireframe: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.bubble.position.y = 0.1;
    this.bubble.visible = false;
    this.body.add(this.bubble);

    // stun stars
    this.stunGroup = new THREE.Group();
    this.stunGroup.position.set(0, 2.3, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffdf6a });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), starMat);
      this.stunGroup.add(star);
    }
    this.stunGroup.visible = false;
    this.group.add(this.stunGroup);

    // nameplate
    const sprite = textSprite(this.name, team.soft, 'rgba(3,10,18,0.62)');
    sprite.position.set(0, 3.05, 0);
    sprite.scale.set(4.2, 1.05, 1);
    sprite.visible = !this.isPlayer;
    this.group.add(sprite);
    this.nameplate = sprite;

    this.group.traverse((o) => {
      if (o.isMesh && o !== this.bubble && o !== this.underglow) o.castShadow = true;
    });
  }

  reset(x, z, yaw = this.yaw, full = true) {
    this.pos.set(x, CAR.groundY, z);
    this.yaw = yaw;
    this.speed = 0;
    this.vy = 0;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.jumps = 0;
    this.stun = 0;
    this.spin = 0;
    this.invincible = 0;
    this.speedTimer = 0;
    this.shrinkTimer = 0;
    this.itemRolling = 0;
    this.boosting = false;
    this.airTime = 0;
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    if (full) {
      this.boost = 33;
      this.item = null;
      this.itemCycle = 0;
    }
    this.group.rotation.y = yaw;
    this.syncVisual(0);
  }

  get forward() {
    return _v1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right() {
    return _v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  get speedNorm() {
    return clamp(Math.abs(this.speed) / CAR.boostMax, 0, 1);
  }

  hasItem() {
    return this.item && this.itemRolling <= 0;
  }

  giveItem(item) {
    this.item = item;
    this.itemRolling = this.isPlayer ? 0.9 : 0;
    this.itemCycle = 0;
  }

  stunCar(duration = 1.1, spinDir = 1) {
    if (this.invincible > 0) return false;
    if (this.stun <= 0) {
      this.spin = rand(9, 14) * spinDir;
      this.speed *= 0.26;
      this.vy = Math.max(this.vy, 4);
      this.grounded = false;
    }
    this.stun = Math.max(this.stun, duration);
    return true;
  }

  update(ctrl, dt, game) {
    const c = ctrl || {};
    const throttle = this.stun > 0 ? 0 : clamp(c.throttle || 0, -1, 1);
    const steer = this.stun > 0 ? 0 : clamp(c.steer || 0, -1, 1);

    // timers
    this.stun = Math.max(0, this.stun - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.speedTimer = Math.max(0, this.speedTimer - dt);
    this.shrinkTimer = Math.max(0, this.shrinkTimer - dt);
    this.itemRolling = Math.max(0, this.itemRolling - dt);
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    this.lastTouch = Math.max(0, this.lastTouch - dt);

    if (this.itemRolling > 0) {
      this.itemCycle -= dt;
      if (this.itemCycle <= 0) {
        this.itemCycle = 0.075;
        game.sound.rouletteTick();
      }
    }

    const superCharge = this.speedTimer > 0 ? 1 : 0;
    const boosting = !!c.boost && this.boost > 0.5 && this.stun <= 0;
    this.boosting = boosting;

    if (boosting) {
      this.boost = Math.max(0, this.boost - 34 * dt);
      if (this.boostCooldown <= 0) {
        this.boostCooldown = 0.35;
        game.sound.boostStart();
      }
    }

    const fwd = this.forward.clone();
    const right = this.right.clone();
    const maxSpeed = (boosting ? CAR.boostMax : CAR.maxSpeed) * (superCharge ? 1.32 : 1);

    if (this.grounded) {
      if (throttle > 0.05) {
        this.speed += CAR.accel * throttle * dt * (superCharge ? 1.5 : 1);
      } else if (throttle < -0.05) {
        if (this.speed > 0.6) this.speed -= 66 * dt;
        else this.speed += 20 * throttle * dt;
      } else {
        this.speed -= this.speed * 2.4 * dt;
      }
      if (boosting) this.speed += CAR.boostAccel * dt * (superCharge ? 1.35 : 1);
      this.speed = clamp(this.speed, -CAR.reverseMax, maxSpeed);

      const steerAuthority = Math.min(1, Math.abs(this.speed) / 6) * (1 - 0.22 * Math.min(1, Math.abs(this.speed) / maxSpeed));
      this.yaw += steer * CAR.turnRate * dt * steerAuthority * (this.speed < -0.2 ? -1 : 1);

      this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;

      if (c.jump && this.jumps === 0) {
        this.grounded = false;
        this.vy = CAR.jumpSpeed;
        this.jumps = 1;
        this.pos.y += this.vy * dt;
        game.sound.jump();
        game.particles.spawnBurst(_v1.set(this.pos.x, this.pos.y - 0.4, this.pos.z), TEAM[this.team].color, 8, 4, 0.35, 8, 0.5);
      } else {
        this.pos.y = CAR.groundY;
        this.vy = 0;
      }

      // drifting sparks
      if (Math.abs(steer) > 0.7 && Math.abs(this.speed) > 18 && Math.random() < 0.4) {
        game.particles.spawnBurst(
          new THREE.Vector3(this.pos.x - fwd.x * 1.6, 0.25, this.pos.z - fwd.z * 1.6),
          TEAM[this.team].color, 1, 2.5, 0.22, 9, 0.35
        );
      }
    } else {
      this.airTime += dt;
      this.yaw += steer * 1.4 * dt;
      if (throttle !== 0) {
        this.vel.x += fwd.x * throttle * 10 * dt;
        this.vel.z += fwd.z * throttle * 10 * dt;
      }
      if (boosting) {
        this.vel.x += fwd.x * 24 * dt;
        this.vel.z += fwd.z * 24 * dt;
        this.vy += 25 * dt;
        game.particles.spawnBoost(this);
      }
      if (c.jump && this.jumps < 2 && this.stun <= 0) {
        this.jumps = 2;
        this.vy = Math.max(this.vy, 4.5) + 4.4;
        this.vel.x += fwd.x * 6 + right.x * steer * 6;
        this.vel.z += fwd.z * 6 + right.z * steer * 6;
        this.spin += steer * 4;
        game.sound.flip();
        game.particles.spawnBurst(new THREE.Vector3(this.pos.x, this.pos.y - 0.3, this.pos.z), 0xbdeaff, 10, 5, 0.3, 4, 0.45);
      }
      this.vy -= CAR.gravity * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vy * dt;

      if (this.pos.y <= CAR.groundY) {
        this.pos.y = CAR.groundY;
        this.vy = 0;
        this.grounded = true;
        this.jumps = 0;
        this.speed = clamp(this.vel.x * fwd.x + this.vel.z * fwd.z, -CAR.reverseMax, CAR.boostMax);
        this.airTime = 0;
        if (this.vel.length() > 16) {
          game.particles.spawnBurst(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), 0xbfd9e8, 8, 4, 0.32, 10, 0.45);
        }
      }
    }

    // world bounds for cars
    const bx = FIELD.halfW - 1.25;
    const bz = FIELD.halfL - 1.25;
    if (this.pos.x < -bx) { this.pos.x = -bx; this.speed *= 0.5; this.vel.x *= -0.2; }
    if (this.pos.x > bx) { this.pos.x = bx; this.speed *= 0.5; this.vel.x *= -0.2; }
    if (this.pos.z < -bz) { this.pos.z = -bz; this.speed *= 0.5; this.vel.z *= -0.2; }
    if (this.pos.z > bz) { this.pos.z = bz; this.speed *= 0.5; this.vel.z *= -0.2; }

    // stun spin
    if (this.stun > 0) {
      this.spin = damp(this.spin, 0, 2.4, dt);
      this.body.rotation.y += this.spin * dt;
      this.body.rotation.z = damp(this.body.rotation.z, Math.sin(this.stun * 18) * 0.16, 5, dt);
    } else {
      this.body.rotation.y = damp(this.body.rotation.y, 0, 8, dt);
      this.body.rotation.z = damp(this.body.rotation.z, -steer * 0.075 * Math.min(1, Math.abs(this.speed) / 20), 9, dt);
      this.body.rotation.x = damp(this.body.rotation.x, this.grounded ? 0 : clamp(-this.vy * 0.012, -0.12, 0.14), 6, dt);
    }

    // boost flames
    const flameScale = boosting ? rand(0.85, 1.35) : 0;
    this.flamePhase += dt * 24;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        f.scale.set(0.8 + Math.sin(this.flamePhase) * 0.18, flameScale, 0.8 + Math.cos(this.flamePhase * 0.7) * 0.18);
        f.material.color.setHex(this.speedTimer > 0 ? 0xff6a9e : 0xffb347);
      }
    }
    if (boosting) {
      const p = this.pos.clone().addScaledVector(fwd, -2.3);
      game.particles.spawnBoost(this);
    }

    // wheel animation
    this.wheelSpin += this.speed * dt / 0.38;
    for (const w of this.wheels) {
      w.tire.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = damp(w.pivot.rotation.y, steer * 0.42, 12, dt);
    }

    // shield / star visuals
    const star = this.invincible > 0;
    this.bubble.visible = star;
    if (star) {
      this.bubble.rotation.y += dt * 2;
      this.bubble.rotation.x += dt * 0.7;
      const hue = (game.time * 0.55) % 1;
      this.bubble.material.color.setHSL(hue, 0.9, 0.65);
      this.bodyMat.emissive.setHSL(hue, 0.85, 0.3);
      this.bodyMat.emissiveIntensity = 0.75 + Math.sin(game.time * 12) * 0.2;
      if (Math.random() < 0.5) {
        game.particles.spawnBurst(new THREE.Vector3(this.pos.x + rand(-1.4, 1.4), this.pos.y + rand(-0.3, 1.4), this.pos.z + rand(-1.8, 1.8)), new THREE.Color().setHSL(Math.random(), 0.9, 0.65), 1, 1.4, 0.3, -1, 0.55);
      }
    } else {
      this.bodyMat.emissive.setHex(TEAM[this.team].color);
      this.bodyMat.emissiveIntensity = 0.13;
    }

    // speed item aura
    if (this.speedTimer > 0) {
      this.underglow.material.opacity = 0.55 + Math.sin(game.time * 14) * 0.15;
      this.underglow.material.color.setHex(0xffd36a);
    } else {
      this.underglow.material.opacity = 0.32;
      this.underglow.material.color.setHex(TEAM[this.team].color);
    }

    // shrink
    const targetScale = this.shrinkTimer > 0 ? 0.56 : 1;
    const s = damp(this.body.scale.x, targetScale, 8, dt);
    this.body.scale.setScalar(s);

    // stun stars
    this.stunGroup.visible = this.stun > 0;
    if (this.stun > 0) {
      this.stunGroup.rotation.y += dt * 8;
      [...this.stunGroup.children].forEach((starMesh, i) => {
        const a = game.time * 7 + (i / 3) * Math.PI * 2;
        starMesh.position.set(Math.cos(a) * 0.9, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.9);
      });
    }

    this.syncVisual(dt);
  }

  syncVisual(dt) {
    this.group.rotation.y = this.yaw;
  }

  // collider helpers
  getCollider() {
    return { pos: this.pos, yaw: this.yaw, halfW: CAR.halfW, halfH: CAR.halfH, halfL: CAR.halfL };
  }
}

/* ═══════════════════════════════════════════════════════════
   BALL
   ═══════════════════════════════════════════════════════════ */
function ballTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#dcecf4';
    ctx.fillRect(0, 0, w, h);
    const R = 62;
    const dx = R * 1.75;
    const dy = R * 1.5;
    for (let row = -1; row < h / dy + 2; row++) {
      for (let col = -1; col < w / dx + 2; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0);
        const y = row * dy;
        const spots = [
          [x, y, R * 0.92],
          [x + dx / 2, y + dy / 2, R * 0.92],
        ];
        for (const [cx, cy, cr] of spots) {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = cx + Math.cos(a) * cr;
            const py = cy + Math.sin(a) * cr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = (row + col) % 2 === 0 ? '#c9deea' : '#eefaff';
          ctx.fill();
          ctx.strokeStyle = 'rgba(30, 56, 74, 0.55)';
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      }
    }
    // subtle scuffs
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = '#3a5b70';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 20 + 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { anisotropy: 8 });
}

export class Ball {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.radius = FIELD.ballRadius;
    this.lastTouchTeam = null;
    this.lastTouchCar = null;
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinSpeed = 0;
    game.scene.add(this.group);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(FIELD.ballRadius, 36, 26),
      new THREE.MeshPhysicalMaterial({
        map: ballTexture(), roughness: 0.38, metalness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.25,
        emissive: 0x1a3a4a, emissiveIntensity: 0.22,
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    this.group.add(mesh);

    const aura = glowSprite(0x9be8ff, 8.6, 0.16);
    this.group.add(aura);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(FIELD.ballRadius * 1.08, 0.045, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x8fe7ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    this.ring = ring;

    // trail
    this.trailLength = 26;
    this.trailPoints = [];
    for (let i = 0; i < this.trailLength; i++) this.trailPoints.push(new THREE.Vector3());
    const trailGeo = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: 0x9be8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    game.scene.add(this.trail);
    this.trailInited = false;
  }

  reset(x = 0, y = FIELD.ballRadius + 4, z = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.lastTouchTeam = null;
    this.lastTouchCar = null;
    this.spinSpeed = 0;
    this.trailInited = false;
    this.mesh.rotation.set(0, 0, 0);
    this.group.visible = true;
  }

  setPosition(x, y, z) {
    this.pos.set(x, y, z);
  }

  kick(impulse) {
    this.vel.add(impulse);
    if (this.vel.length() > 74) this.vel.setLength(74);
  }

  update(dt) {
    this.vel.y -= 31 * dt;
    this.pos.addScaledVector(this.vel, dt);

    // ground
    if (this.pos.y < this.radius) {
      this.pos.y = this.radius;
      if (this.vel.y < 0) {
        const impact = -this.vel.y;
        this.vel.y = impact * 0.72;
        if (impact > 3) {
          this.game.sound.hit(Math.min(1, impact / 25) * 0.4);
          this.game.particles.spawnBurst(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), 0xcfeaff, 6, 3, 0.35, 6, 0.4);
        }
        if (Math.abs(this.vel.y) < 1.4) this.vel.y = 0;
      }
      this.vel.x *= 0.995;
      this.vel.z *= 0.995;
    }

    // side walls
    if (Math.abs(this.pos.x) > FIELD.halfW - this.radius) {
      this.pos.x = Math.sign(this.pos.x) * (FIELD.halfW - this.radius);
      this.vel.x *= -0.78;
      this.game.sound.wall();
      this.game.particles.spawnBurst(new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z), 0x9be8ff, 5, 3, 0.3, 5, 0.35);
    }

    // ceiling
    if (this.pos.y > FIELD.ceiling) {
      this.pos.y = FIELD.ceiling;
      this.vel.y *= -0.6;
    }

    // end walls / goal mouths
    const goalMouth = Math.abs(this.pos.x) < FIELD.goalHalfW - 0.15 && this.pos.y < FIELD.goalH - 0.15;
    if (this.pos.z > FIELD.halfL - this.radius && !goalMouth) {
      this.pos.z = FIELD.halfL - this.radius;
      this.vel.z *= -0.8;
      this.game.sound.wall();
    } else if (this.pos.z < -FIELD.halfL + this.radius && !goalMouth) {
      this.pos.z = -FIELD.halfL + this.radius;
      this.vel.z *= -0.8;
      this.game.sound.wall();
    }

    // rolling spin
    const speed = this.vel.length();
    if (speed > 0.2) {
      this.spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.spinSpeed = speed / this.radius;
      this.mesh.rotateOnWorldAxis(this.spinAxis, this.spinSpeed * dt * 0.6);
      this.ring.rotation.z += dt * 0.6;
    }
    this.ring.material.opacity = 0.18 + Math.min(0.5, speed / 70) * 0.5;
    this.ring.scale.setScalar(1 + Math.sin(this.game.time * 3) * 0.02);

    // trail
    const t = this.trailPoints;
    if (!this.trailInited) {
      for (const p of t) p.copy(this.pos);
      this.trailInited = true;
    }
    for (let i = t.length - 1; i > 0; i--) t[i].copy(t[i - 1]);
    t[0].copy(this.pos);
    this.trail.geometry.setFromPoints(t);
    this.trail.material.opacity = clamp((speed - 7) / 60, 0, 1) * 0.4;
  }

  // Sphere vs car OBB. Returns hit normal world or null.
  collideCar(car) {
    const dx = this.pos.x - car.pos.x;
    const dy = this.pos.y - car.pos.y;
    const dz = this.pos.z - car.pos.z;
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const lx = cos * dx - sin * dz;
    const lz = sin * dx + cos * dz;
    // Taller invisible hitbox keeps contacts lateral (soccer-style) instead of
    // launching the ball straight up off the roof.
    const hitOffsetY = 0.46;
    const halfH = 1.32;
    const ly = dy - hitOffsetY;
    const cx = clamp(lx, -CAR.halfW, CAR.halfW);
    const cy = clamp(ly, -halfH, halfH);
    const cz = clamp(lz, -CAR.halfL, CAR.halfL);
    const nx = lx - cx;
    const ny = ly - cy;
    const nz = lz - cz;
    const distSq = nx * nx + ny * ny + nz * nz;
    if (distSq > this.radius * this.radius) return null;

    let dist = Math.sqrt(distSq);
    let nlx, nly, nlz;
    if (dist < 0.0001) {
      // ball center inside box: push out along nearest face
      const px = CAR.halfW - Math.abs(lx);
      const py = halfH - Math.abs(ly);
      const pz = CAR.halfL - Math.abs(lz);
      if (px < py && px < pz) { nlx = Math.sign(lx) || 1; nly = 0; nlz = 0; dist = 0; }
      else if (py < pz) { nlx = 0; nly = Math.sign(ly) || 1; nlz = 0; dist = 0; }
      else { nlx = 0; nly = 0; nlz = Math.sign(lz) || 1; dist = 0; }
    } else {
      nlx = nx / dist; nly = ny / dist; nlz = nz / dist;
    }
    // local normal -> world
    const wx = cos * nlx + sin * nlz;
    const wz = -sin * nlx + cos * nlz;
    const wy = nly;

    const penetration = this.radius - dist;
    this.pos.x += wx * penetration;
    this.pos.y += wy * penetration;
    this.pos.z += wz * penetration;

    const normal = new THREE.Vector3(wx, wy, wz);
    const carVel = new THREE.Vector3(car.vel.x, car.vy, car.vel.z);
    const rel = this.vel.clone().sub(carVel);
    const relDot = rel.dot(normal);
    if (relDot < 0) {
      this.vel.sub(normal.clone().multiplyScalar(relDot * 1.35));
    }

    const hitStrength = Math.max(0, -relDot) + Math.abs(car.speed) * 0.32 + (car.boosting ? 6 : 0);
    const impulse = normal.clone().multiplyScalar(4.5 + hitStrength * 0.85);
    impulse.addScaledVector(new THREE.Vector3(car.vel.x, 0, car.vel.z), 0.42);
    impulse.y += 1.1 + Math.min(2.8, hitStrength * 0.12);
    this.kick(impulse);
    this.lastTouchTeam = car.team;
    this.lastTouchCar = car;
    car.lastTouch = 1.2;

    const power = clamp(hitStrength / 34, 0.15, 1);
    this.game.sound.hit(power);
    this.game.cameraShake = Math.max(this.game.cameraShake, power * 0.35);
    this.game.particles.spawnBurst(new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z), 0xcdefff, Math.round(5 + power * 12), 5 + power * 8, 0.4, 3, 0.45);
    return normal;
  }
}

/* ═══════════════════════════════════════════════════════════
   ITEM BOX
   ═══════════════════════════════════════════════════════════ */
function questionTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#24c7ff');
    g.addColorStop(0.45, '#5b7bff');
    g.addColorStop(1, '#ff4fa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '900 170px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,30,60,0.55)';
    ctx.shadowBlur = 22;
    ctx.fillText('?', w / 2, h / 2 + 10);
  });
}

export class ItemBox {
  constructor(game, x, z) {
    this.game = game;
    this.home = new THREE.Vector3(x, 2.35, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.home);
    this.active = true;
    this.respawn = 0;
    this.phase = Math.random() * Math.PI * 2;

    const tex = questionTexture();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.3, 2.3),
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.7,
        metalness: 0.45, roughness: 0.28, transparent: true, opacity: 0.96,
      })
    );
    cube.castShadow = true;
    this.cube = cube;
    this.group.add(cube);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.42, 2.42, 2.42)),
      new THREE.LineBasicMaterial({ color: 0xd7f4ff, transparent: true, opacity: 0.65 })
    );
    this.group.add(edges);

    const glow = glowSprite(0x8fe4ff, 5.2, 0.35);
    this.group.add(glow);
    this.glow = glow;
    this.group.position.y = this.home.y;
  }

  update(dt, time) {
    if (!this.active) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.active = true;
        this.group.visible = true;
      }
      return;
    }
    this.group.rotation.y += dt * 0.85;
    this.group.rotation.x = Math.sin(time * 1.2 + this.phase) * 0.16;
    this.group.position.y = this.home.y + Math.sin(time * 1.8 + this.phase) * 0.25;
    const s = 1 + Math.sin(time * 3 + this.phase) * 0.035;
    this.group.scale.setScalar(s);
    this.glow.material.opacity = 0.25 + Math.sin(time * 4 + this.phase) * 0.1;
  }

  collect() {
    if (!this.active) return false;
    this.active = false;
    this.group.visible = false;
    this.respawn = 4.5;
    this.game.particles.spawnBurst(this.group.position.clone(), 0xaeecff, 18, 6, 0.4, -1, 0.65);
    this.game.sound.pickup();
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOST PAD
   ═══════════════════════════════════════════════════════════ */
export class BoostPad {
  constructor(game, x, z, big) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.big = big;
    this.amount = big ? 100 : 25;
    this.active = true;
    this.respawn = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0.05, z);

    const radius = big ? 2.05 : 1.1;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.1, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffb020, emissive: 0xffa000, emissiveIntensity: big ? 1.2 : 0.8,
        metalness: 0.55, roughness: 0.3, transparent: true, opacity: 0.9,
      })
    );
    base.rotation.y = Math.PI / 6;
    this.group.add(base);
    this.base = base;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.05, big ? 0.09 : 0.06, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe09a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    this.ring = ring;

    const glow = glowSprite(0xffc95e, big ? 7 : 4.4, 0.4);
    glow.position.y = 0.2;
    this.group.add(glow);
    this.glow = glow;
    this.phase = Math.random() * 10;
    game.scene.add(this.group);
  }

  update(dt) {
    if (!this.active) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.active = true;
        this.group.visible = true;
      }
      return;
    }
    this.ring.rotation.z += dt * 1.7;
    this.ring.scale.setScalar(1 + Math.sin(this.game.time * 4 + this.phase) * 0.06);
    this.glow.material.opacity = 0.3 + Math.sin(this.game.time * 5 + this.phase) * 0.14;
  }

  tryCollect(car) {
    if (!this.active || !car.grounded) return false;
    const dx = car.pos.x - this.x;
    const dz = car.pos.z - this.z;
    const r = this.big ? 2.9 : 2.0;
    if (dx * dx + dz * dz > r * r) return false;
    if (car.boost >= 99.5) return false;
    car.boost = Math.min(100, car.boost + this.amount);
    this.active = false;
    this.group.visible = false;
    this.respawn = this.big ? 9 : 5;
    this.game.particles.spawnBurst(new THREE.Vector3(this.x, 0.4, this.z), 0xffcc62, this.big ? 16 : 7, 5, 0.35, 5, 0.55);
    if (car.isPlayer) this.game.sound.pickup();
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════
   PROJECTILES
   ═══════════════════════════════════════════════════════════ */
export class Projectile {
  constructor(game, type, pos, vel, owner) {
    this.game = game;
    this.type = type;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.owner = owner;
    this.life = type === 'red' ? 7.5 : 6.5;
    this.radius = type === 'bobomb' ? 0.9 : 0.78;
    this.fuse = type === 'bobomb' ? 1.9 : 0;
    this.target = null;
    this.dead = false;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.spin = rand(4, 9);

    if (type === 'green' || type === 'red') {
      const mainColor = type === 'green' ? 0x35d45c : 0xff3d3d;
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.78, 18, 14),
        new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.4, roughness: 0.25, emissive: mainColor, emissiveIntensity: 0.5 })
      );
      shell.castShadow = true;
      this.group.add(shell);
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.17, 7, 20),
        new THREE.MeshStandardMaterial({ color: 0xf2f8e8, roughness: 0.5 })
      );
      band.rotation.x = Math.PI / 2;
      this.group.add(band);
      const glow = glowSprite(mainColor, 3.6, 0.5);
      this.group.add(glow);
      this.mesh = shell;
    } else if (type === 'banana') {
      this.life = 24;
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd83a, metalness: 0.05, roughness: 0.55, emissive: 0x8a6a00, emissiveIntensity: 0.25 });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.2, 8, 16, Math.PI * 1.15), mat);
      arc.rotation.z = Math.PI * 0.42;
      arc.rotation.y = Math.PI / 2;
      arc.castShadow = true;
      this.group.add(arc);
      for (const [x, y, z] of [[0.15, 0.64, 0], [0.15, -0.64, 0]]) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a1c, roughness: 0.8 }));
        tip.position.set(0, y, z);
        this.group.add(tip);
      }
      const glow = glowSprite(0xffd23f, 3, 0.3);
      this.group.add(glow);
      this.mesh = arc;
    } else {
      // bob-omb
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0x141821, metalness: 0.45, roughness: 0.35, emissive: 0x11151d, emissiveIntensity: 0.5 })
      );
      body.castShadow = true;
      this.group.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xc8d2dd, metalness: 0.8, roughness: 0.3 }));
      cap.position.y = 0.86;
      this.group.add(cap);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5), new THREE.MeshStandardMaterial({ color: 0x7c6242 }));
      fuse.position.y = 1.2;
      fuse.rotation.z = 0.3;
      this.group.add(fuse);
      this.spark = glowSprite(0xffb347, 1.8, 0.9);
      this.spark.position.set(0.1, 1.5, 0);
      this.group.add(this.spark);
      this.mesh = body;
    }
    game.scene.add(this.group);
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.die(); return; }

    if (this.type === 'banana') {
      this.group.rotation.y += dt * 1.4;
      const bob = Math.sin(game.time * 3 + this.pos.x) * 0.04;
      this.group.position.copy(this.pos);
      this.group.position.y = this.pos.y + bob;
      return;
    }

    if (this.type === 'red' && this.target && !this.target.dead) {
      const toTarget = this.target.pos.clone().sub(this.pos);
      toTarget.y *= 0.25;
      const dist = toTarget.length();
      const desired = toTarget.normalize().multiplyScalar(46);
      this.vel.lerp(desired, clamp(4.2 * dt, 0, 1));
      if (dist < 4) this.die(true);
    }

    if (this.type === 'bobomb') {
      this.vel.y -= 27 * dt;
      this.fuse -= dt;
      if (this.pos.y < 0.9) {
        this.pos.y = 0.9;
        this.vel.y *= -0.45;
        this.vel.x *= 0.8;
        this.vel.z *= 0.8;
      }
      if (this.fuse <= 0) {
        game.explodeBobomb(this.pos.clone(), this.owner);
        this.die();
        return;
      }
      this.spark.scale.setScalar(1.3 + Math.sin(game.time * 30) * 0.4);
    }

    this.pos.addScaledVector(this.vel, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.x += this.spin * dt;
    this.group.rotation.z += this.spin * 0.7 * dt;

    // walls (not banana)
    const r = this.radius;
    if (Math.abs(this.pos.x) > FIELD.halfW - r) {
      this.pos.x = Math.sign(this.pos.x) * (FIELD.halfW - r);
      this.vel.x *= -0.9;
      game.sound.wall();
    }
    if (this.type !== 'bobomb') {
      if (this.pos.z > FIELD.halfL - r) {
        this.pos.z = FIELD.halfL - r;
        this.vel.z *= -0.9;
      } else if (this.pos.z < -FIELD.halfL + r) {
        this.pos.z = -FIELD.halfL + r;
        this.vel.z *= -0.9;
      }
      this.pos.y = Math.max(1.1, this.pos.y);
    }
  }

  die(explode = false) {
    if (this.dead) return;
    this.dead = true;
    this.game.scene.remove(this.group);
    const color = this.type === 'green' ? 0x45e06b : this.type === 'red' ? 0xff4444 : this.type === 'banana' ? 0xffd23f : 0xff8a3d;
    this.game.particles.spawnBurst(this.pos.clone(), color, explode ? 16 : 8, 5, 0.35, 8, 0.45);
    if (explode) this.game.sound.explosion();
  }
}

/* ═══════════════════════════════════════════════════════════
   PARTICLES
   ═══════════════════════════════════════════════════════════ */
export class Particles {
  constructor(game) {
    this.game = game;
    this.bursts = [];
    this.rings = [];
    this.sparkTex = sparkTexture();
  }

  spawnBurst(pos, color, count = 10, speed = 5, size = 0.4, gravity = 4, life = 0.5) {
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x + rand(-0.2, 0.2);
      positions[i * 3 + 1] = pos.y + rand(-0.2, 0.2);
      positions[i * 3 + 2] = pos.z + rand(-0.2, 0.2);
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed);
      velocities.push(dir);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, map: this.sparkTex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.game.scene.add(points);
    this.bursts.push({ points, velocities, gravity, life, maxLife: life, positions });
  }

  spawnBoost(car) {
    if (Math.random() > 0.55) return;
    const fwd = car.forward.clone();
    const right = car.right.clone();
    for (const side of [-1, 1]) {
      const pos = car.pos.clone().addScaledVector(fwd, -2.15).addScaledVector(right, side * 0.5);
      pos.y += 0.02;
      this.spawnBurst(pos, Math.random() < 0.5 ? 0xffb347 : 0xff7a1a, 1, 1.4, 0.45, -2, 0.35);
    }
  }

  spawnRing(pos, color, radius = 8) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y = Math.max(0.12, pos.y - 0.5);
    this.game.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.65, maxLife: 0.65, radius });
  }

  update(dt) {
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      const burst = this.bursts[b];
      burst.life -= dt;
      if (burst.life <= 0) {
        this.game.scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        this.bursts.splice(b, 1);
        continue;
      }
      const posAttr = burst.points.geometry.attributes.position;
      for (let i = 0; i < burst.velocities.length; i++) {
        const v = burst.velocities[i];
        burst.positions[i * 3] += v.x * dt;
        burst.positions[i * 3 + 1] += v.y * dt;
        burst.positions[i * 3 + 2] += v.z * dt;
        v.y -= burst.gravity * dt;
        v.multiplyScalar(1 - 0.6 * dt);
      }
      posAttr.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, burst.life / burst.maxLife);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.game.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      const scale = 0.6 + t * r.radius;
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * 0.75;
    }
  }
}
