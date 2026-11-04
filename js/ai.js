import * as THREE from 'three';
import { DIFFICULTY, FIELD, TEAM } from './constants.js';
import { clamp, wrapAngle } from './utils.js';

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class AIController {
  update(car, game, dt) {
    const skill = DIFFICULTY[game.difficulty] || DIFFICULTY.pro;
    const idle = { throttle: 0, steer: 0, boost: false, jump: false };
    if (car.stun > 0) return idle;

    car.aiState.jumpCd = Math.max(0, car.aiState.jumpCd - dt);
    car.aiState.decision -= dt;
    car.aiState.itemCd = Math.max(0, (car.aiState.itemCd || 0) - dt);

    const ball = game.ball;
    const team = car.team;
    const enemyGoalZ = team === 'blue' ? FIELD.halfL : -FIELD.halfL;
    const ownGoalZ = TEAM[team].goalZ;

    const dxBall = ball.pos.x - car.pos.x;
    const dzBall = ball.pos.z - car.pos.z;
    const distBall = Math.hypot(dxBall, dzBall);
    const ownHalf = team === 'blue' ? ball.pos.z < 0 : ball.pos.z > 0;
    const veryCloseToOwnGoal = Math.abs(ball.pos.z - ownGoalZ) < 16;

    const isAttacker = car.role === 'attack';
    const attacking = isAttacker || (ownHalf && distBall < 30) || (car.role === 'support' && distBall < 12) || veryCloseToOwnGoal;

    _dir.set(-ball.pos.x, 0, enemyGoalZ - ball.pos.z).normalize();

    if (attacking) {
      // Stand behind the ball relative to the target goal, then drive through it.
      _target.set(ball.pos.x - _dir.x * 5.6, 0, ball.pos.z - _dir.z * 5.6);
      const behind = (car.pos.x - ball.pos.x) * _dir.x + (car.pos.z - ball.pos.z) * _dir.z;
      if (distBall < 9.5 && behind < 1) {
        _target.set(ball.pos.x + _dir.x * 1.8, 0, ball.pos.z + _dir.z * 1.8);
      }
    } else {
      // Defensive shape: sit between the ball and our own net.
      const guardZ = ownGoalZ + (team === 'blue' ? 14 : -14);
      _target.set(ball.pos.x * 0.52, 0, guardZ + (ball.pos.z - guardZ) * 0.18);
      if (ownHalf && distBall < 38) {
        _target.set(ball.pos.x - _dir.x * 6.5, 0, ball.pos.z - _dir.z * 6.5);
      }
    }

    // Grab a nearby item box when there is time and no item in the tank.
    if (!car.item) {
      let bestBox = null;
      let bestDist = 22;
      for (const box of game.itemBoxes) {
        if (!box.active) continue;
        const d = Math.hypot(box.group.position.x - car.pos.x, box.group.position.z - car.pos.z);
        if (d < bestDist) {
          bestDist = d;
          bestBox = box;
        }
      }
      if (bestBox && (distBall > 22 || !attacking) && Math.random() < 0.9) {
        _target.set(bestBox.group.position.x, 0, bestBox.group.position.z);
      }
    }

    const dx = _target.x - car.pos.x;
    const dz = _target.z - car.pos.z;
    const distTarget = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(dx, dz);
    const jitter = Math.sin(game.time * 2.1 + car.aiState.jitter) * 0.11 * (1 - skill.aim);
    const angle = wrapAngle(desiredYaw - car.yaw) + jitter;

    let steer = clamp(angle * (2.0 + skill.aim * 1.3), -1, 1);
    let throttle = 1;
    const absAngle = Math.abs(angle);

    // Slow down to rotate instead of orbiting the target at full speed.
    if (absAngle > 0.55) throttle = 0.65;
    if (absAngle > 0.95) throttle = 0.2;
    if (absAngle > 1.25 && Math.abs(car.speed) > 3.5) throttle = -1;
    else if (absAngle > 1.7 && Math.abs(car.speed) <= 3.5) {
      throttle = -0.62;
      steer = -steer * 0.9;
    }
    if (distTarget < 3.2 && Math.abs(car.speed) > 20) throttle = 0.15;
    if (attacking && distBall < 7.5 && absAngle < 0.4 && Math.abs(car.speed) > 15) throttle = 1;

    // unstuck
    const spd = Math.abs(car.speed);
    if (spd < 2.2 && distTarget > 5) car.aiState.stuck += dt;
    else car.aiState.stuck = Math.max(0, car.aiState.stuck - dt * 2);
    if (car.aiState.stuck > 0.9) {
      car.aiState.reverse = 0.7;
      car.aiState.stuck = 0;
    }
    if (car.aiState.reverse > 0) {
      car.aiState.reverse -= dt;
      return { throttle: -1, steer: -steer * 0.6, boost: false, jump: false };
    }

    // periodic boost decision
    if (car.aiState.decision <= 0) {
      car.aiState.decision = 0.45;
      car.aiState.wantBoost = Math.random() < skill.boost && car.boost > 12 && distTarget > 14 && Math.abs(angle) < 0.55;
    }

    // jump for high balls
    let jump = false;
    if (ball.pos.y > 3.1 && distBall < 7.5 && car.grounded && car.aiState.jumpCd <= 0 && Math.random() < skill.jump) {
      jump = true;
      car.aiState.jumpCd = 0.7;
    }

    this.#useItem(car, game, dt, { attacking, distBall, angle, skill, ball });

    return {
      throttle,
      steer,
      boost: !!car.aiState.wantBoost && car.boost > 0,
      jump,
    };
  }

  #useItem(car, game, dt, { attacking, distBall, angle, skill, ball }) {
    if (!car.hasItem()) return;
    if (!car.aiState.itemCd || car.aiState.itemCd <= 0) {
      let shouldUse = false;
      const item = car.item;
      if (item === 'mushroom' || item === 'star') {
        shouldUse = distBall < 34 && (attacking || Math.random() < 0.4);
      } else if (item === 'green') {
        shouldUse = Math.abs(angle) < 0.32 && distBall < 44;
      } else if (item === 'red') {
        const target = game.nearestOpponent(car);
        shouldUse = !!target && target.pos.distanceTo(ball.pos) < 60;
      } else if (item === 'banana') {
        shouldUse = !attacking || distBall > 20;
      } else if (item === 'lightning') {
        shouldUse = Math.random() < 0.02 || distBall < 26;
      } else if (item === 'bobomb') {
        shouldUse = distBall < 28 && Math.abs(angle) < 1.2;
      }
      if (shouldUse && Math.random() < 0.4 + skill.item * 0.6) {
        game.useItem(car);
        car.aiState.itemCd = 2.2;
      } else {
        car.aiState.itemCd = 0.6;
      }
    }
  }
}
