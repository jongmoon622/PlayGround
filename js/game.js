import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { buildArena } from './arena.js';
import { AIController } from './ai.js';
import { Ball, BoostPad, Car, ItemBox, Particles, Projectile } from './entities.js';
import { BOOST_PADS, CAR, DIFFICULTY, FIELD, ITEM_BOX_SPOTS, ITEM_DEFS, ITEM_POOL, TEAM } from './constants.js';
import { clamp, damp, formatTime, pickWeighted, rand, wrapAngle } from './utils.js';

const KICKOFF = [
  { x: -10, z: -28, yaw: 0 },
  { x: 10, z: -33, yaw: 0 },
  { x: -10, z: 28, yaw: Math.PI },
  { x: 10, z: 33, yaw: Math.PI },
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02050b);
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 420);
    this.camera.position.set(0, 25, 62);
    this.camLook = new THREE.Vector3(0, 3, 0);
    this.cameraShake = 0;
    this.fov = 68;

    this.sound = new AudioEngine();
    this.audio = this.sound;
    this.time = 0;
    this.lastFrame = performance.now();

    this.state = 'menu';
    this.pausedFrom = null;
    this.difficulty = 'pro';
    this.scores = { blue: 0, orange: 0 };
    this.matchTime = 180;
    this.overtime = false;
    this.countdown = 0;
    this.lastCount = 0;
    this.goalTimer = 0;
    this.pendingEnd = false;
    this.cameraMode = 'ball';
    this.stats = { goals: 0, items: 0, hits: 0, saves: 0 };
    this.msgTimer = 0;
    this.minimapAccum = 0;
    this.keys = new Set();
    this.jumpQueued = false;
    this.itemQueued = false;
    this.touch = { throttle: 0, steer: 0, boost: false };
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.gamepadPrev = [];
    this.projectiles = [];
    this.itemBoxes = [];
    this.boostPads = [];

    this.ui = this.#cacheUI();

    this.arena = buildArena(this.scene);
    this.particles = new Particles(this);
    this.ball = new Ball(this);
    this.ai = new AIController();

    this.cars = [
      new Car(this, { team: 'blue', name: 'YOU', isPlayer: true }),
      new Car(this, { team: 'blue', name: 'KAI', isAI: true }),
      new Car(this, { team: 'orange', name: 'NOVA', isAI: true }),
      new Car(this, { team: 'orange', name: 'REX', isAI: true }),
    ];
    this.cars[1].role = 'support';
    this.cars[2].role = 'attack';
    this.cars[3].role = 'support';
    this.player = this.cars[0];

    for (const car of this.cars) {
      car.goals = 0;
      car.aiState.itemCd = 0;
      car.aiState.jumpCd = 0;
      this.scene.add(car.group);
    }

    for (const spot of ITEM_BOX_SPOTS) {
      const box = new ItemBox(this, spot.x, spot.z);
      this.itemBoxes.push(box);
      this.scene.add(box.group);
    }
    for (const pad of BOOST_PADS) {
      this.boostPads.push(new BoostPad(this, pad.x, pad.z, pad.big));
    }

    this.resetKickoff(true);
    this.#bindUI();
    this.#bindInput();
    this.#bindTouch();

    window.addEventListener('resize', () => this.#resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.togglePause(true);
    });

    this.updateHUD();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    // Exposed for debugging / automated verification.
    window.__turbo = this;
  }

  #cacheUI() {
    const $ = (id) => document.getElementById(id);
    return {
      hud: $('hud'),
      menu: $('menu'),
      loading: $('loading'),
      scoreBlue: $('score-blue'),
      scoreOrange: $('score-orange'),
      timer: $('timer'),
      clockSub: $('clock-sub'),
      overtime: $('overtime'),
      boostDial: $('boost-dial'),
      boostValue: $('boost-value'),
      speedValue: $('speed-value'),
      itemSlot: $('item-slot'),
      itemIcon: $('item-icon'),
      itemName: $('item-name'),
      center: $('center-msg'),
      sub: $('sub-msg'),
      feed: $('event-feed'),
      minimap: $('minimap'),
      pauseBtn: $('pause-btn'),
      camBtn: $('cam-btn'),
      touch: $('touch-controls'),
      joystickZone: $('joystick-zone'),
      joystickKnob: $('joystick-knob'),
      touchBoost: $('touch-boost'),
      touchJump: $('touch-jump'),
      touchItem: $('touch-item'),
      touchCam: $('touch-cam'),
      flash: $('goal-flash'),
      pauseScreen: $('pause-screen'),
      pauseBlue: $('pause-blue'),
      pauseOrange: $('pause-orange'),
      resultScreen: $('result-screen'),
      resultKicker: $('result-kicker'),
      resultTitle: $('result-title'),
      resultBlue: $('result-blue'),
      resultOrange: $('result-orange'),
      resultStats: $('result-stats'),
      playBtn: $('play-btn'),
      soundBtn: $('sound-btn'),
      difficulty: $('difficulty'),
      resumeBtn: $('resume-btn'),
      restartBtn: $('restart-btn'),
      quitBtn: $('quit-btn'),
      againBtn: $('again-btn'),
      menuBtn: $('menu-btn'),
    };
  }

  /* ═════════════════════ UI WIRING ═════════════════════ */
  #bindUI() {
    const ui = this.ui;
    ui.playBtn.addEventListener('click', () => this.startMatch());
    ui.soundBtn.addEventListener('click', () => {
      this.sound.init();
      this.sound.setEnabled(!this.sound.enabled);
      ui.soundBtn.classList.toggle('off', !this.sound.enabled);
      ui.soundBtn.innerHTML = `<span class="toggle-led"></span>SOUND ${this.sound.enabled ? 'ON' : 'OFF'}`;
      if (this.sound.enabled) this.sound.uiClick();
    });
    ui.difficulty.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.difficulty;
        ui.difficulty.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        this.sound.init();
        this.sound.uiClick();
      });
    });
    ui.pauseBtn.addEventListener('click', () => this.togglePause());
    ui.camBtn.addEventListener('click', () => this.toggleCamera());
    ui.resumeBtn.addEventListener('click', () => this.togglePause(true));
    ui.restartBtn.addEventListener('click', () => this.restartMatch());
    ui.quitBtn.addEventListener('click', () => this.quitToMenu());
    ui.againBtn.addEventListener('click', () => this.restartMatch());
    ui.menuBtn.addEventListener('click', () => this.quitToMenu());
    ui.touchCam.addEventListener('click', () => this.toggleCamera());

    document.addEventListener('pointerdown', () => this.sound.init(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.state === 'menu' && !e.repeat) {
        this.startMatch();
      }
    });
  }

  #bindInput() {
    const drivingKeys = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyC', 'KeyR',
    ]);
    window.addEventListener('keydown', (e) => {
      if (drivingKeys.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.state !== 'play' && this.state !== 'countdown') {
        if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
        return;
      }
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyE') this.itemQueued = true;
      if (e.code === 'KeyC') this.toggleCamera();
      if (e.code === 'KeyR') this.resetPlayer();
      if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  #bindTouch() {
    const zone = this.ui.joystickZone;
    const knob = this.ui.joystickKnob;
    let pointerId = null;

    const moveStick = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const max = rect.width * 0.32;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      const px = dx * k;
      const py = dy * k;
      knob.style.transform = `translate(${px}px, ${py}px)`;
      this.touch.steer = clamp(px / max, -1, 1);
      this.touch.throttle = clamp(-py / max, -1, 1);
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      zone.setPointerCapture(pointerId);
      moveStick(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) moveStick(e.clientX, e.clientY);
    });
    const release = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.touch.steer = 0;
      this.touch.throttle = 0;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    const hold = (el, onDown, onUp) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        el.setPointerCapture(e.pointerId);
        onDown?.();
      });
      const up = (e) => {
        el.classList.remove('pressed');
        onUp?.();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };

    hold(this.ui.touchBoost, () => { this.touch.boost = true; }, () => { this.touch.boost = false; });
    this.ui.touchJump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.jumpQueued = true;
      this.ui.touchJump.classList.add('pressed');
      setTimeout(() => this.ui.touchJump.classList.remove('pressed'), 110);
    });
    this.ui.touchItem.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.itemQueued = true;
      this.ui.touchItem.classList.add('pressed');
      setTimeout(() => this.ui.touchItem.classList.remove('pressed'), 110);
    });
  }

  /* ═════════════════════ MATCH FLOW ═════════════════════ */
  startMatch(difficulty = this.difficulty) {
    this.difficulty = difficulty;
    this.sound.init();
    this.sound.uiClick();
    this.ui.menu.classList.add('closing');
    setTimeout(() => { this.ui.menu.style.display = 'none'; }, 430);
    this.ui.hud.classList.remove('hidden');
    if (this.isTouch) this.ui.touch.classList.remove('hidden');
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.resultScreen.classList.add('hidden');
    this.ui.flash.classList.remove('on');
    if (this.ui.feed) this.ui.feed.innerHTML = '';

    this.scores.blue = 0;
    this.scores.orange = 0;
    this.matchTime = 180;
    this.overtime = false;
    this.pendingEnd = false;
    this.stats = { goals: 0, items: 0, hits: 0, saves: 0 };
    for (const car of this.cars) { car.goals = 0; }
    this.clearProjectiles();
    this.resetKickoff(true);
    this.state = 'countdown';
    this.startCountdown(3.0);
    this.#snapCamera();
    this.updateHUD();
  }

  restartMatch() {
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.resultScreen.classList.add('hidden');
    if (this.ui.menu) this.ui.menu.style.display = 'none';
    this.ui.hud.classList.remove('hidden');
    this.state = 'menu';
    this.startMatch(this.difficulty);
  }

  quitToMenu() {
    this.state = 'menu';
    this.scores.blue = 0;
    this.scores.orange = 0;
    this.matchTime = 180;
    this.overtime = false;
    this.pendingEnd = false;
    this.clearProjectiles();
    this.resetKickoff(true);
    this.ui.hud.classList.add('hidden');
    this.ui.touch.classList.add('hidden');
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.resultScreen.classList.add('hidden');
    this.ui.flash.classList.remove('on');
    this.ui.menu.style.display = 'flex';
    this.ui.menu.classList.remove('closing');
    this.ui.feed.innerHTML = '';
    this.clearMessages();
    this.cameraMode = 'ball';
    this.ui.camBtn.textContent = 'CAM · BALL';
    this.sound.setEngine(0, false, false);
    this.updateHUD();
  }

  togglePause(forceResume = false) {
    if (forceResume && this.state === 'paused') {
      this.state = this.pausedFrom || 'play';
      this.pausedFrom = null;
      this.ui.pauseScreen.classList.add('hidden');
      if (this.isTouch) this.ui.touch.classList.remove('hidden');
      this.sound.uiClick();
      return;
    }
    if (this.state === 'paused') {
      this.state = this.pausedFrom || 'play';
      this.pausedFrom = null;
      this.ui.pauseScreen.classList.add('hidden');
      if (this.isTouch) this.ui.touch.classList.remove('hidden');
      this.sound.uiClick();
      return;
    }
    if (this.state === 'play' || this.state === 'countdown' || this.state === 'goal') {
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.ui.pauseBlue.textContent = this.scores.blue;
      this.ui.pauseOrange.textContent = this.scores.orange;
      this.ui.pauseScreen.classList.remove('hidden');
      this.ui.touch.classList.add('hidden');
      this.sound.setEngine(0, false, false);
      this.sound.uiClick();
    }
  }

  startCountdown(seconds = 2.6) {
    this.state = 'countdown';
    this.countdown = seconds;
    this.lastCount = Math.ceil(seconds);
    this.announce(String(Math.min(3, this.lastCount)), 'GET READY', '', 0.9);
    this.sound.countdown(false);
  }

  resetPlayer() {
    if (this.state !== 'play') return;
    const car = this.player;
    if (car.stun > 0) return;
    const z = TEAM.blue.goalZ + 12;
    car.reset(0, z, 0, false);
    car.boost = Math.max(car.boost, 20);
    this.particles.spawnRing(new THREE.Vector3(0, 0.1, z), TEAM.blue.color, 4);
    this.addFeed('YOU — RESET', 'blue');
    this.dropCameraSoon = true;
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'ball' ? 'car' : 'ball';
    this.ui.camBtn.textContent = this.cameraMode === 'ball' ? 'CAM · BALL' : 'CAM · CAR';
    this.sound.uiClick();
  }

  /* ═════════════════════ MAIN LOOP ═════════════════════ */
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0.0001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;

    this.arena.update(this.time);
    this.particles.update(dt);
    for (const box of this.itemBoxes) box.update(dt, this.time);
    for (const pad of this.boostPads) pad.update(dt);

    if (this.state === 'menu') {
      this.#updateMenuCamera(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'play') {
      this.#updatePlay(dt);
    } else if (this.state === 'countdown') {
      this.#updateCountdown(dt);
    } else if (this.state === 'goal') {
      this.#updateGoalState(dt);
    } else if (this.state === 'ended') {
      this.#updateEnded(dt);
    }

    this.#updateMessages(dt);
    this.#updateCamera(dt);
    this.updateHUD(dt);
    this.renderer.render(this.scene, this.camera);
  }

  #updateMenuCamera(dt) {
    const a = this.time * 0.075;
    const r = 72;
    const desired = new THREE.Vector3(Math.sin(a) * r, 31 + Math.sin(this.time * 0.22) * 1.8, Math.cos(a) * r);
    const t = 1 - Math.exp(-1.6 * dt);
    this.camera.position.lerp(desired, t);
    this.camLook.lerp(new THREE.Vector3(0, 3.4, 0), t);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.sound.setEngine(0, false, false);
    this.ball.ring.material.opacity = 0.25;
  }

  #updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this.lastCount && n > 0) {
      this.lastCount = n;
      this.announce(String(n), 'GET READY', '', 0.9);
      this.sound.countdown(false);
    }
    if (this.countdown <= 0) {
      this.state = 'play';
      this.announce('GO!', this.overtime ? 'GOLDEN GOAL' : 'KICK OFF', 'gold', 0.85);
      this.sound.countdown(true);
      this.sound.setEngine(0, false, true);
    }
    this.#updateTouchCamera(dt, true);
    this.sound.setEngine(0, false, false);
  }

  #updatePlay(dt) {
    // player actions
    if (this.itemQueued) {
      this.itemQueued = false;
      this.useItem(this.player);
    }
    const playerCtrl = this.#playerControls();
    this.#pollGamepad();

    for (const car of this.cars) {
      let ctrl = { throttle: 0, steer: 0, boost: false, jump: false };
      if (car.isPlayer) ctrl = playerCtrl;
      else if (car.isAI) ctrl = this.ai.update(car, this, dt);
      car.update(ctrl, dt, this);
    }
    this.jumpQueued = false;
    this.itemQueued = false;

    // roulette completion sounds
    for (const car of this.cars) {
      if (car.itemRolling > 0) {
        car._wasRolling = true;
      } else if (car._wasRolling) {
        car._wasRolling = false;
        if (car.item) {
          this.sound.itemReady();
          if (car.isPlayer) this.addFeed(`${ITEM_DEFS[car.item].icon} ${ITEM_DEFS[car.item].name} READY`, car.team);
        }
      }
    }

    this.#carCarCollisions(dt);

    this.ball.update(dt);
    for (const car of this.cars) {
      if (this.state !== 'play') break;
      this.ball.collideCar(car);
    }

    if (this.state === 'play') this.#checkGoal();

    // pickups
    for (const car of this.cars) {
      if (!car.item) {
        for (const box of this.itemBoxes) {
          if (!box.active) continue;
          const dx = car.pos.x - box.group.position.x;
          const dz = car.pos.z - box.group.position.z;
          if (dx * dx + dz * dz < 7.6) {
            if (box.collect()) {
              const item = this.#rollItem(car);
              car.giveItem(item);
              car.aiState.itemCd = rand(0.8, 2.2);
              if (car.isPlayer) {
                this.ui.itemSlot.classList.add('rolling');
                this.addFeed(`${ITEM_DEFS[item].icon} ITEM ACQUIRED`, car.team);
              }
            }
            break;
          }
        }
      }
      for (const pad of this.boostPads) pad.tryCollect(car);
    }

    this.#updateProjectiles(dt);

    // timer
    if (this.state === 'play' && !this.overtime) {
      this.matchTime -= dt;
      if (this.matchTime <= 0) {
        this.matchTime = 0;
        if (this.scores.blue === this.scores.orange) {
          this.overtime = true;
          this.announce('OVERTIME', 'NEXT GOAL WINS', 'gold', 2.8);
          this.sound.whistle();
          this.addFeed('OVERTIME — GOLDEN GOAL', 'gold');
        } else {
          this.endMatch();
          return;
        }
      }
    }

    // engine sound
    this.sound.setEngine(this.player.speedNorm, this.player.boosting, true);
  }

  #updateGoalState(dt) {
    this.ball.update(dt);
    const idle = { throttle: 0, steer: 0, boost: false, jump: false };
    for (const car of this.cars) car.update(idle, dt, this);
    this.#updateProjectiles(dt);
    this.goalTimer -= dt;
    this.sound.setEngine(0, false, false);
    this.#updateTouchCamera(dt, true);
    if (this.goalTimer <= 0) {
      if (this.pendingEnd) {
        this.endMatch();
      } else {
        this.resetKickoff(false);
        this.startCountdown(2.6);
      }
    }
  }

  #updateEnded(dt) {
    const idle = { throttle: 0, steer: 0, boost: false, jump: false };
    for (const car of this.cars) car.update(idle, dt, this);
    this.ball.update(dt);
    this.sound.setEngine(0, false, false);
    this.#updateTouchCamera(dt, true);
  }

  #updateTouchCamera(dt, freeze) {
    if (freeze) {
      this.player.speed = 0;
      this.player.vel.set(0, 0, 0);
    }
  }

  /* ═════════════════════ INPUT ═════════════════════ */
  #playerControls() {
    const k = this.keys;
    let throttle = 0;
    let steer = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) throttle += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) throttle -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    throttle += this.touch.throttle;
    steer += this.touch.steer;
    const boost = !!(k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.boost);
    return {
      throttle: clamp(throttle, -1, 1),
      steer: clamp(steer, -1, 1),
      boost,
      jump: this.jumpQueued,
    };
  }

  #pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const gp = pads && pads[0];
    if (!gp) return;
    const dead = 0.18;
    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    if (Math.abs(ax) > dead) this.touch.steer = clamp(this.touch.steer + ax * 0.9, -1, 1);
    if (Math.abs(ay) > dead) this.touch.throttle = clamp(this.touch.throttle - ay * 0.9, -1, 1);
    const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    if (btn(6) || btn(7)) this.touch.boost = true;
    else if (!this.isTouch) this.touch.boost = false;
    if (btn(0) && !this.gamepadPrev[0]) this.jumpQueued = true;
    if (btn(2) && !this.gamepadPrev[2]) this.itemQueued = true;
    if (btn(3) && !this.gamepadPrev[3]) this.toggleCamera();
    for (let i = 0; i < 8; i++) this.gamepadPrev[i] = btn(i);
    // throttle decays back to keys-only when the stick is centered
    if (Math.abs(ay) <= dead && !this.isTouch) this.touch.throttle = 0;
    if (Math.abs(ax) <= dead && !this.isTouch) this.touch.steer = 0;
  }

  /* ═════════════════════ PHYSICS HELPERS ═════════════════════ */
  #carCarCollisions(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        if (Math.abs(a.pos.y - b.pos.y) > 2.4) continue;
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        let dist = Math.hypot(dx, dz);
        const minDist = 2.45;
        if (dist >= minDist) continue;
        if (dist < 0.001) { dx = 1; dz = 0; dist = 1; }
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;
        a.pos.x -= nx * overlap * 0.5;
        a.pos.z -= nz * overlap * 0.5;
        b.pos.x += nx * overlap * 0.5;
        b.pos.z += nz * overlap * 0.5;

        const avx = a.vel.x;
        const avz = a.vel.z;
        const bvx = b.vel.x;
        const bvz = b.vel.z;
        const rel = (avx - bvx) * nx + (avz - bvz) * nz;
        if (rel > 0) {
          const impulse = rel * 0.5;
          a.vel.x -= nx * impulse;
          a.vel.z -= nz * impulse;
          b.vel.x += nx * impulse;
          b.vel.z += nz * impulse;
        }
        const impact = Math.abs(rel);
        if (impact > 7) {
          this.sound.hit(clamp(impact / 40, 0.15, 0.8));
          this.cameraShake = Math.max(this.cameraShake, 0.1);
          this.particles.spawnBurst(new THREE.Vector3((a.pos.x + b.pos.x) / 2, 1, (a.pos.z + b.pos.z) / 2), 0xcfe8f8, 6, 3, 0.3, 6, 0.35);
        }
        // star power smacks opponents
        if (a.invincible > 0 && b.invincible <= 0 && a.team !== b.team) {
          if (b.stunCar(1.3, 1)) {
            this.sound.hit(1);
            this.addFeed(`${a.name} STAR SMASH`, a.team);
          }
        }
        if (b.invincible > 0 && a.invincible <= 0 && a.team !== b.team) {
          if (a.stunCar(1.3, -1)) {
            this.sound.hit(1);
            this.addFeed(`${b.name} STAR SMASH`, b.team);
          }
        }
      }
    }
  }

  #checkGoal() {
    if (this.state !== 'play') return;
    const b = this.ball;
    if (b.pos.z > FIELD.halfL + 0.75 && Math.abs(b.pos.x) < FIELD.goalHalfW + 1 && b.pos.y < FIELD.goalH + 1) {
      this.scoreGoal('blue');
    } else if (b.pos.z < -FIELD.halfL - 0.75 && Math.abs(b.pos.x) < FIELD.goalHalfW + 1 && b.pos.y < FIELD.goalH + 1) {
      this.scoreGoal('orange');
    }
  }

  scoreGoal(team) {
    if (this.state !== 'play') return;
    this.scores[team]++;
    this.state = 'goal';
    this.goalTimer = 3.0;
    this.pendingEnd = this.scores[team] >= 5 || this.overtime;

    const scorer = this.ball.lastTouchCar && this.ball.lastTouchCar.team === team ? this.ball.lastTouchCar : null;
    if (scorer) {
      scorer.goals++;
      if (scorer.isPlayer) this.stats.goals++;
    }
    const label = team === 'blue' ? 'BLUE GOAL!' : 'ORANGE GOAL!';
    const sub = scorer ? `${scorer.name}${scorer.isPlayer ? ' SCORES' : ' FINISHES'}` : 'OWN GOAL';
    this.announce(label, sub, team === 'blue' ? 'goal-blue' : 'goal-orange', 2.7);
    this.addFeed(`${label} ${this.scores.blue} — ${this.scores.orange}`, team);
    this.sound.goal(team);
    this.cameraShake = 1.15;

    const goalPos = new THREE.Vector3(this.ball.pos.x, Math.max(2, this.ball.pos.y), team === 'blue' ? FIELD.halfL + 1 : -FIELD.halfL - 1);
    this.particles.spawnBurst(goalPos, TEAM[team].color, 60, 16, 0.7, 7, 1.3);
    this.particles.spawnBurst(goalPos, 0xffffff, 25, 9, 0.5, 9, 0.9);
    this.particles.spawnRing(new THREE.Vector3(goalPos.x, 0.1, goalPos.z), TEAM[team].color, 22);

    this.ui.flash.style.background = `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55), ${team === 'blue' ? 'rgba(49,184,255,0.28)' : 'rgba(255,122,36,0.28)'} 45%, transparent 72%)`;
    this.ui.flash.classList.add('on');
    setTimeout(() => this.ui.flash.classList.remove('on'), 480);
    this.updateHUD();
  }

  endMatch() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.ui.touch.classList.add('hidden');
    this.sound.whistle();
    this.sound.setEngine(0, false, false);
    const blue = this.scores.blue;
    const orange = this.scores.orange;
    const winner = blue === orange ? null : blue > orange ? 'blue' : 'orange';
    this.ui.resultKicker.textContent = this.overtime ? 'GOLDEN GOAL · MATCH COMPLETE' : 'MATCH COMPLETE';
    this.ui.resultTitle.textContent = winner ? `${TEAM[winner].name} WINS` : 'DRAW';
    this.ui.resultTitle.style.color = winner === 'orange' ? '#ffb167' : winner === 'blue' ? '#8bdcff' : '#eaf7ff';
    this.ui.resultBlue.textContent = blue;
    this.ui.resultOrange.textContent = orange;
    const top = [...this.cars].sort((a, b) => b.goals - a.goals)[0];
    const parts = [];
    if (top && top.goals > 0) parts.push(`${top.name} LED THE SCOREBOARD WITH ${top.goals}`);
    parts.push(`YOU · ${this.stats.goals} GOALS · ${this.stats.items} ITEMS · ${this.stats.hits} SHELL HITS`);
    this.ui.resultStats.textContent = parts.join(' // ');
    this.ui.resultScreen.classList.remove('hidden');
    this.ui.hud.classList.add('hidden');
  }

  resetKickoff(first) {
    this.cars.forEach((car, i) => {
      const spawn = KICKOFF[i];
      car.reset(spawn.x, spawn.z, spawn.yaw, true);
      car.goals = car.goals || 0;
      car.group.visible = true;
    });
    this.ball.reset(0, FIELD.ballRadius, 0);
    this.clearProjectiles();
    for (const box of this.itemBoxes) {
      box.active = true;
      box.group.visible = true;
      box.respawn = 0;
    }
    for (const pad of this.boostPads) {
      pad.active = true;
      pad.group.visible = true;
      pad.respawn = 0;
    }
    this.ui.flash.classList.remove('on');
    if (first) {
      this.player.boost = 50;
    }
  }

  clearProjectiles() {
    for (const p of this.projectiles) {
      this.scene.remove(p.group);
    }
    this.projectiles = [];
  }

  /* ═════════════════════ ITEMS ═════════════════════ */
  #rollItem(car) {
    const opp = car.team === 'blue' ? this.scores.orange : this.scores.blue;
    const own = this.scores[car.team];
    const behind = opp - own;
    const entries = ITEM_POOL.map((e) => ({ ...e }));
    if (behind > 0) {
      for (const e of entries) {
        if (e.id === 'mushroom') e.w += 7;
        if (e.id === 'star') e.w += 5;
        if (e.id === 'red') e.w += 4;
        if (e.id === 'lightning') e.w += 4;
        if (e.id === 'banana') e.w -= 3;
      }
    } else if (behind < 0) {
      for (const e of entries) {
        if (e.id === 'banana') e.w += 5;
        if (e.id === 'green') e.w += 4;
        if (e.id === 'star') e.w -= 2;
      }
    }
    return pickWeighted(entries);
  }

  useItem(car) {
    if (!car.hasItem()) return;
    if (this.state !== 'play' && this.state !== 'countdown') return;
    const item = car.item;
    car.item = null;
    car.itemRolling = 0;
    car._wasRolling = false;
    const def = ITEM_DEFS[item];
    const team = TEAM[car.team];
    this.ui.itemSlot.classList.remove('rolling');

    if (car.isPlayer) {
      this.stats.items++;
      this.addFeed(`${def.icon} ${def.name}`, car.team);
    }
    this.sound.itemUse();

    const fwd = car.forward.clone();
    const origin = car.pos.clone();

    if (item === 'mushroom') {
      car.speedTimer = Math.max(car.speedTimer, 2.7);
      car.boost = Math.min(100, car.boost + 40);
      if (car.grounded) car.speed = Math.min(52, car.speed + 9);
      this.particles.spawnRing(origin.clone(), 0xffd36a, 5);
      this.particles.spawnBurst(origin.clone().setY(1), 0xffd36a, 18, 8, 0.4, 3, 0.8);
      this.sound.boostStart();
      if (car.isPlayer) this.cameraShake = Math.max(this.cameraShake, 0.2);
    } else if (item === 'star') {
      car.invincible = 6.5;
      car.speedTimer = Math.max(car.speedTimer, 6.5);
      this.particles.spawnBurst(origin.clone().setY(1.5), 0xffe37a, 26, 9, 0.45, 3, 1);
      this.particles.spawnRing(origin.clone(), 0xffe37a, 7);
      this.sound.star();
    } else if (item === 'green' || item === 'red') {
      const pos = origin.clone().addScaledVector(fwd, 2.8);
      pos.y = 1.15;
      let vel = fwd.clone().multiplyScalar(56);
      let target = null;
      if (item === 'red') {
        target = this.nearestOpponent(car);
        if (target) {
          const dir = target.pos.clone().sub(pos);
          dir.y = 0;
          if (dir.lengthSq() > 0.01) vel = dir.normalize().multiplyScalar(47);
        }
      }
      vel.x += car.vel.x * 0.45;
      vel.z += car.vel.z * 0.45;
      const proj = new Projectile(this, item, pos, vel, car);
      proj.target = target;
      proj.spawnTime = this.time;
      this.projectiles.push(proj);
      this.sound.shell();
      this.particles.spawnBurst(pos.clone(), item === 'green' ? 0x45e06b : 0xff4444, 10, 4, 0.3, 2, 0.4);
    } else if (item === 'banana') {
      const pos = origin.clone().addScaledVector(fwd, -3.6);
      pos.y = 0.5;
      const proj = new Projectile(this, 'banana', pos, new THREE.Vector3(), car);
      proj.spawnTime = this.time;
      this.projectiles.push(proj);
      this.sound.banana();
    } else if (item === 'bobomb') {
      const pos = origin.clone().addScaledVector(fwd, 3.0);
      pos.y = 1.4;
      const vel = fwd.clone().multiplyScalar(30);
      vel.y = 13;
      vel.add(car.vel.clone().multiplyScalar(0.4));
      const proj = new Projectile(this, 'bobomb', pos, vel, car);
      proj.spawnTime = this.time;
      this.projectiles.push(proj);
      this.sound.shell();
    } else if (item === 'lightning') {
      const opponents = this.cars.filter((c) => c.team !== car.team);
      for (const opp of opponents) {
        if (opp.invincible > 0) continue;
        opp.shrinkTimer = 5.8;
        opp.speed *= 0.4;
        opp.stunCar(0.45, 1);
      }
      this.ui.flash.style.background = 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.95), rgba(139,124,255,0.45) 40%, transparent 75%)';
      this.ui.flash.classList.add('on');
      setTimeout(() => this.ui.flash.classList.remove('on'), 260);
      this.cameraShake = 0.8;
      this.sound.lightning();
      this.addFeed('⚡ LIGHTNING — RIVALS SHRUNK', car.team);
    }

    this.updateHUD();
  }

  nearestOpponent(car) {
    let best = null;
    let bestDist = Infinity;
    for (const other of this.cars) {
      if (other.team === car.team) continue;
      const d = other.pos.distanceToSquared(car.pos);
      if (d < bestDist) {
        best = other;
        bestDist = d;
      }
    }
    return best;
  }

  #updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.update(dt, this);
      if (p.dead) continue;

      if (p.type === 'banana') {
        const grace = this.time - (p.spawnTime || 0) < 0.9;
        for (const car of this.cars) {
          if (grace && car === p.owner) continue;
          const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
          if (d < 2.2 && Math.abs(car.pos.y - p.pos.y) < 2.2) {
            if (car.invincible <= 0) {
              car.stunCar(1.15, Math.random() < 0.5 ? 1 : -1);
              this.sound.banana();
              this.particles.spawnBurst(p.pos.clone(), 0xffd23f, 12, 5, 0.35, 6, 0.55);
              this.addFeed(`${car.name} SLIPPED ON A BANANA`, car.team === 'blue' ? 'orange' : 'blue');
            }
            p.die();
            break;
          }
        }
        continue;
      }

      if (p.type === 'green' || p.type === 'red') {
        // shell vs ball
        const dBall = p.pos.distanceTo(this.ball.pos);
        if (dBall < this.ball.radius + p.radius + 0.15) {
          const dir = this.ball.pos.clone().sub(p.pos).normalize();
          this.ball.kick(dir.multiplyScalar(40).add(new THREE.Vector3(0, 12, 0)));
          this.ball.vel.addScaledVector(p.vel, 0.3);
          this.particles.spawnBurst(p.pos.clone(), p.type === 'green' ? 0x45e06b : 0xff4444, 20, 9, 0.4, 4, 0.65);
          this.sound.hit(0.9);
          this.cameraShake = Math.max(this.cameraShake, 0.25);
          p.die(true);
          continue;
        }
        for (const car of this.cars) {
          if (car === p.owner) continue;
          if (car.team === p.owner?.team) continue;
          const d = p.pos.distanceTo(car.pos);
          if (d < 2.35) {
            if (car.invincible <= 0) {
              car.stunCar(1.25, Math.random() < 0.5 ? 1 : -1);
              this.particles.spawnBurst(car.pos.clone().setY(1.2), p.type === 'green' ? 0x45e06b : 0xff4444, 16, 6, 0.4, 5, 0.6);
              this.sound.hit(1);
              this.cameraShake = Math.max(this.cameraShake, 0.3);
              if (p.owner?.isPlayer) this.stats.hits++;
              this.addFeed(`${p.owner?.name || 'SHELL'} HIT ${car.name}`, car.team === 'blue' ? 'orange' : 'blue');
            }
            p.die(true);
            break;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  explodeBobomb(pos, owner) {
    this.sound.explosion();
    this.cameraShake = Math.max(this.cameraShake, 1);
    this.particles.spawnBurst(pos.clone(), 0xff8a3d, 55, 16, 0.7, 9, 1.1);
    this.particles.spawnBurst(pos.clone(), 0xffe09a, 24, 9, 0.5, 7, 0.8);
    this.particles.spawnRing(new THREE.Vector3(pos.x, 0.1, pos.z), 0xff8a3d, 18);
    this.ui.flash.style.background = 'radial-gradient(circle at 50% 50%, rgba(255,220,160,0.65), rgba(255,110,30,0.28) 45%, transparent 72%)';
    this.ui.flash.classList.add('on');
    setTimeout(() => this.ui.flash.classList.remove('on'), 240);

    const ballDist = pos.distanceTo(this.ball.pos);
    if (ballDist < 14) {
      const dir = this.ball.pos.clone().sub(pos).normalize();
      const power = (1 - ballDist / 14) * 44 + 14;
      this.ball.kick(dir.multiplyScalar(power).add(new THREE.Vector3(0, 16, 0)));
    }
    for (const car of this.cars) {
      if (car === owner) continue;
      const d = car.pos.distanceTo(pos);
      if (d < 11) {
        const dir = car.pos.clone().sub(pos).normalize();
        if (car.invincible <= 0) car.stunCar(1.4, Math.random() < 0.5 ? 1 : -1);
        car.vel.x += dir.x * 18;
        car.vel.z += dir.z * 18;
        car.vy = Math.max(car.vy, 8.5);
        car.grounded = false;
        car.boost = Math.max(0, car.boost - 20);
      }
    }
  }

  /* ═════════════════════ CAMERA ═════════════════════ */
  #snapCamera() {
    const p = this.player;
    const fwd = p.forward.clone();
    this.camera.position.copy(p.pos).addScaledVector(fwd, -11.5).add(new THREE.Vector3(0, 5.1, 0));
    this.camLook.copy(this.ball.pos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
  }

  #updateCamera(dt) {
    const p = this.player;
    const fwd = p.forward.clone();
    const speedNorm = p.speedNorm;
    const boosting = p.boosting;
    const dist = 11.0 + speedNorm * 1.7;
    const height = 4.9 + speedNorm * 0.5;

    const desired = p.pos.clone().addScaledVector(fwd, -dist);
    desired.y += height;

    // small lateral offset for steering feel
    const right = p.right.clone();
    desired.addScaledVector(right, -this.#steerOffset(p) * 0.8);

    const look = new THREE.Vector3();
    if (this.cameraMode === 'ball') {
      look.copy(this.ball.pos).addScaledVector(this.ball.vel, 0.055);
      if (this.ball.pos.y < 2.4) look.y = 2.4;
    } else {
      look.copy(p.pos).addScaledVector(fwd, 10);
      look.y = p.pos.y + 1.4;
    }

    const posLerp = this.dropCameraSoon ? 1 : 1 - Math.exp(-7.5 * dt);
    this.dropCameraSoon = false;
    this.camera.position.lerp(desired, posLerp);
    this.camLook.lerp(look, 1 - Math.exp(-10 * dt));

    // keep the camera inside the arena walls a little
    this.camera.position.x = clamp(this.camera.position.x, -FIELD.halfW + 1.2, FIELD.halfW - 1.2);
    this.camera.position.z = clamp(this.camera.position.z, -FIELD.halfL + 1.2, FIELD.halfL - 1.2);
    this.camera.position.y = clamp(this.camera.position.y, 2.2, FIELD.wallH + 10);

    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    if (this.cameraShake > 0.002) {
      const s = this.cameraShake * 0.55;
      this.camera.position.x += rand(-s, s);
      this.camera.position.y += rand(-s, s);
      this.camera.position.z += rand(-s, s);
    }

    const targetFov = 68 + speedNorm * 8 + (boosting ? 3 : 0);
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.camLook);
  }

  #steerOffset(car) {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    steer += this.touch.steer;
    return clamp(steer, -1, 1);
  }

  /* ═════════════════════ MESSAGES + HUD ═════════════════════ */
  announce(text, sub = '', cls = '', duration = 1.4) {
    const el = this.ui.center;
    el.className = 'center-msg ' + cls;
    void el.offsetWidth;
    el.textContent = text;
    el.classList.add('show');
    const subEl = this.ui.sub;
    subEl.className = 'sub-msg';
    void subEl.offsetWidth;
    subEl.textContent = sub;
    if (sub) subEl.classList.add('show');
    this.msgTimer = duration;
  }

  clearMessages() {
    this.ui.center.className = 'center-msg';
    this.ui.sub.className = 'sub-msg';
    this.msgTimer = 0;
  }

  #updateMessages(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) {
        this.ui.center.classList.remove('show');
        this.ui.sub.classList.remove('show');
      }
    }
  }

  addFeed(text, team = '') {
    if (!this.ui.feed) return;
    const item = document.createElement('div');
    item.className = 'feed-item ' + team;
    item.textContent = text;
    this.ui.feed.prepend(item);
    while (this.ui.feed.children.length > 3) this.ui.feed.lastChild.remove();
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.4s';
      setTimeout(() => item.remove(), 420);
    }, 3200);
  }

  updateHUD(dt = 0) {
    const p = this.player;
    const ui = this.ui;

    ui.scoreBlue.textContent = this.scores.blue;
    ui.scoreOrange.textContent = this.scores.orange;
    const timeText = formatTime(this.matchTime);
    ui.timer.textContent = timeText;
    ui.timer.classList.toggle('warn', this.matchTime <= 30 && !this.overtime && this.state !== 'menu');
    ui.overtime.classList.toggle('hidden', !this.overtime);
    ui.clockSub.textContent = this.overtime ? 'GOLDEN GOAL' : 'FIRST TO 5';

    const boost = Math.round(p.boost);
    ui.boostDial.style.setProperty('--boost', boost);
    ui.boostValue.textContent = boost;
    ui.boostDial.classList.toggle('low', boost < 20);
    ui.speedValue.textContent = Math.round(Math.abs(p.speed) * 6.2);

    if (this.state === 'menu') {
      ui.itemIcon.textContent = '?';
      ui.itemName.textContent = 'NO ITEM';
      ui.itemName.classList.remove('ready');
      ui.itemSlot.classList.remove('ready', 'rolling');
      return;
    }

    if (p.itemRolling > 0) {
      const ids = Object.keys(ITEM_DEFS);
      const idx = Math.floor(this.time * 16) % ids.length;
      ui.itemIcon.textContent = ITEM_DEFS[ids[idx]].icon;
      ui.itemName.textContent = 'ROLLING...';
      ui.itemName.classList.remove('ready');
      ui.itemSlot.classList.add('rolling');
      ui.itemSlot.classList.remove('ready');
    } else if (p.item) {
      const def = ITEM_DEFS[p.item];
      ui.itemIcon.textContent = def.icon;
      ui.itemName.textContent = def.name;
      ui.itemName.classList.add('ready');
      ui.itemSlot.classList.remove('rolling');
      ui.itemSlot.classList.add('ready');
    } else {
      ui.itemIcon.textContent = '?';
      ui.itemName.textContent = 'NO ITEM';
      ui.itemName.classList.remove('ready');
      ui.itemSlot.classList.remove('rolling', 'ready');
    }

    this.minimapAccum += dt;
    if (this.minimapAccum > 0.06) {
      this.minimapAccum = 0;
      this.#drawMinimap();
    }
  }

  #drawMinimap() {
    const canvas = this.ui.minimap;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = 12;
    const fw = w - pad * 2;
    const fh = h - pad * 2;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(3,10,17,0.85)';
    ctx.fillRect(0, 0, w, h);

    const toX = (x) => pad + ((x + FIELD.halfW) / (FIELD.halfW * 2)) * fw;
    const toY = (z) => pad + ((z + FIELD.halfL) / (FIELD.halfL * 2)) * fh;

    ctx.fillStyle = 'rgba(15,38,48,0.8)';
    ctx.fillRect(pad, pad, fw, fh);
    ctx.strokeStyle = 'rgba(140,210,240,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, fw, fh);

    ctx.strokeStyle = 'rgba(140,210,240,0.18)';
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, fw * 0.19, 0, Math.PI * 2);
    ctx.stroke();

    // goal mouths
    ctx.fillStyle = 'rgba(49,184,255,0.9)';
    ctx.fillRect(toX(-FIELD.goalHalfW), h - pad - 4, ((FIELD.goalHalfW * 2) / (FIELD.halfW * 2)) * fw, 4);
    ctx.fillStyle = 'rgba(255,122,36,0.9)';
    ctx.fillRect(toX(-FIELD.goalHalfW), pad, ((FIELD.goalHalfW * 2) / (FIELD.halfW * 2)) * fw, 4);

    // item boxes
    for (const box of this.itemBoxes) {
      if (!box.active) continue;
      ctx.fillStyle = 'rgba(255,208,94,0.85)';
      ctx.fillRect(toX(box.group.position.x) - 1.5, toY(box.group.position.z) - 1.5, 3, 3);
    }
    // boost pads
    for (const pad of this.boostPads) {
      if (!pad.active) continue;
      ctx.fillStyle = pad.big ? 'rgba(255,170,40,0.9)' : 'rgba(255,208,94,0.45)';
      ctx.beginPath();
      ctx.arc(toX(pad.x), toY(pad.z), pad.big ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // cars
    for (const car of this.cars) {
      const x = toX(car.pos.x);
      const y = toY(car.pos.z);
      if (car.isPlayer) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 5.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = car.team === 'blue' ? '#4fcaff' : '#ff9147';
      ctx.beginPath();
      ctx.arc(x, y, car.isPlayer ? 3.8 : 3.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // ball
    const bx = toX(this.ball.pos.x);
    const by = toY(this.ball.pos.z);
    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 8);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.4, 'rgba(220,248,255,0.8)');
    glow.addColorStop(1, 'rgba(180,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  #resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
