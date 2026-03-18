import * as THREE from 'three';
import { events } from '../core/EventBus.js';

/**
 * Enemy AI behavior functions. Each updates the enemy's position/state.
 * All behaviors receive (dt, enemy, playerPos, distance, flatToPlayer, context).
 * context = { state, world, particles, enemies }
 */

// Reusable vectors — never allocate in hot loops
const _dir = new THREE.Vector2();
const _toTarget = new THREE.Vector2();
const _perp = new THREE.Vector2();
const _vec2Origin = new THREE.Vector2();
const _playerFwd = new THREE.Vector2();
const _origin = new THREE.Vector3();
const _projDir = new THREE.Vector3();
const _pos = new THREE.Vector3();

function canMoveDirection(enemy, dir, dt, ctx, speedOverride = null) {
  if (!ctx.enemies?.canAdvance || dir.lengthSq() < 0.0001) return true;
  const speed = speedOverride ?? enemy.speed;
  const stepDistance = Math.max(0.08, speed * dt);
  return ctx.enemies.canAdvance(enemy, dir.x, dir.y, stepDistance);
}

function moveWithSteering(enemy, desiredDir, speed, dt, ctx) {
  if (desiredDir.lengthSq() < 0.0001 || enemy.knockbackTimer > 0) return;

  _dir.copy(desiredDir).normalize();
  if (canMoveDirection(enemy, _dir, dt, ctx, speed)) {
    moveToward(enemy, _dir, speed, dt);
    return;
  }

  const steerAngles = [
    Math.PI / 8,
    -Math.PI / 8,
    Math.PI / 4,
    -Math.PI / 4,
    Math.PI / 2,
    -Math.PI / 2,
  ];

  for (let i = 0; i < steerAngles.length; i += 1) {
    const candidate = _perp.copy(_dir).rotateAround(_vec2Origin, steerAngles[i]);
    if (canMoveDirection(enemy, candidate, dt, ctx, speed)) {
      moveToward(enemy, candidate, speed, dt);
      return;
    }
  }
}

function pickDefenseEntry(enemy, targetPos, dt, ctx) {
  if (!ctx.state.defense.enabled || !ctx.state.modeController) return targetPos;
  const center = ctx.state.modeController.getDefenseTarget?.();
  if (!center) return targetPos;

  if (!enemy.flankAnchor || enemy.flankAnchorTimer <= 0) {
    const gateOffset = 9;
    const gateChoices = [
      [0, -gateOffset],
      [0, gateOffset],
      [-gateOffset, 0],
      [gateOffset, 0],
    ];
    const chosen = gateChoices[Math.floor(Math.random() * gateChoices.length)];
    enemy.flankAnchor = { x: center.x + chosen[0], z: center.z + chosen[1] };
    enemy.flankAnchorTimer = 2 + Math.random() * 3;
  }

  enemy.flankAnchorTimer -= dt;
  return enemy.flankAnchor;
}

function getTacticalTarget(enemy, playerPos, dt, ctx) {
  const defenseTarget = getDefenseTarget(ctx);
  if (!defenseTarget) return playerPos;

  if (!enemy.strategyRole) {
    enemy.strategyRole = Math.random() < 0.35 ? 'flank' : 'direct';
  }

  if (enemy.strategyRole === 'flank') {
    if (enemy.flankAnchor) {
      _toTarget.set(enemy.flankAnchor.x - enemy.root.position.x, enemy.flankAnchor.z - enemy.root.position.z);
      if (_toTarget.lengthSq() < 2.2 * 2.2) enemy.strategyRole = 'direct';
    }
    return pickDefenseEntry(enemy, defenseTarget, dt, ctx);
  }

  return defenseTarget;
}

function getDefenseTarget(ctx) {
  if (!ctx.state.defense.enabled || !ctx.state.modeController) return null;
  return ctx.state.modeController.getDefenseTarget?.() ?? null;
}

function getTargetPosition(playerPos, ctx) {
  return getDefenseTarget(ctx) || playerPos;
}


function dealDamage(enemy, ctx) {
  const defenseTarget = getDefenseTarget(ctx);
  if (defenseTarget && ctx.state.modeController?.damageTower) {
    const damage = Math.max(1, enemy.baseAttack * 0.8);
    ctx.state.modeController.damageTower(damage);
    events.emit('sound:hit');
    events.emit('hud:update');
    return;
  }

  const damage = Math.max(1, enemy.baseAttack - ctx.state.player.baseDefense);
  ctx.state.player.hp = Math.max(0, ctx.state.player.hp - damage);
  events.emit('player:hit', { damage });
  events.emit('sound:hit');
  events.emit('hud:update');
}

function moveToward(enemy, flatDir, speed, dt) {
  enemy.root.position.x += flatDir.x * speed * dt;
  enemy.root.position.z += flatDir.y * speed * dt;
}

function facePlayer(enemy, playerPos) {
  const dx = playerPos.x - enemy.root.position.x;
  const dz = playerPos.z - enemy.root.position.z;
  enemy.root.rotation.set(0, Math.atan2(dx, dz), 0);
}

function animateWalk(enemy, distance) {
  const sway = Math.sin(enemy.walkTime) * 0.12 * Math.min(1, distance / 2);
  enemy.leftArm.position.x = -0.43 + sway;
  enemy.rightArm.position.x = 0.43 - sway;
  enemy.leftLeg.position.x = -0.16 - sway * 0.38;
  enemy.rightLeg.position.x = 0.16 + sway * 0.38;
}

function tryMeleeAttack(enemy, distance, ctx) {
  if (distance <= enemy.typeDef.attackRange && enemy.attackCooldown === 0) {
    enemy.attackCooldown = enemy.typeDef.attackCooldownMs;
    dealDamage(enemy, ctx);
    return true;
  }
  return false;
}

function spawnProjectile(enemy, playerPos, ctx) {
  _origin.set(
    enemy.root.position.x,
    enemy.root.position.y + 1.2 * enemy.sizeMultiplier,
    enemy.root.position.z,
  );
  _projDir.subVectors(playerPos, _origin).normalize();
  const speed = enemy.typeDef.projectileSpeed || 8;
  ctx.enemies.addProjectile({
    position: _origin.clone(), // must clone for projectile storage
    velocity: _projDir.clone().multiplyScalar(speed),
    damage: enemy.baseAttack,
    owner: enemy,
    lifetime: 3,
    age: 0,
    color: enemy.typeDef.particleColor,
  });
  events.emit('sound:punch');
}

function applyFloat(enemy, dt) {
  const amp = enemy.typeDef.floatAmplitude || 0;
  if (amp > 0) {
    enemy.root.position.y += Math.sin(enemy.walkTime * 0.5) * amp * dt;
  }
}

// --- Chase ---
function updateChase(dt, enemy, playerPos, distance, flat, ctx) {
  if (distance > 1.7) {
    moveWithSteering(enemy, flat, enemy.speed, dt, ctx);
  }
  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Charge ---
function updateCharge(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  _dir.copy(flat).normalize();

  if (distance <= def.chargeDistance && enemy.behaviorPhase !== 'charging') {
    enemy.behaviorPhase = 'charging';
    enemy.behaviorTimer = 0.8;
  }

  if (enemy.behaviorPhase === 'charging') {
    enemy.behaviorTimer -= dt;
    moveWithSteering(enemy, _dir, def.chargeSpeed || enemy.speed * 3, dt, ctx);
    if (enemy.behaviorTimer <= 0 || distance < 1.5) enemy.behaviorPhase = 'idle';
  } else if (distance > 1.7) {
    moveWithSteering(enemy, _dir, enemy.speed, dt, ctx);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Circle ---
function updateCircle(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  enemy.behaviorTimer -= dt;
  enemy.circleAngle += dt * 1.8;

  if (enemy.behaviorTimer <= 0 && distance < 6) {
    enemy.behaviorPhase = enemy.behaviorPhase === 'dash' ? 'circle' : 'dash';
    enemy.behaviorTimer = enemy.behaviorPhase === 'dash' ? 0.5 : (def.dashInterval || 2.5);
  }

  if (enemy.behaviorPhase === 'dash' && enemy.knockbackTimer === 0) {
    _dir.copy(flat).normalize();
    moveWithSteering(enemy, _dir, def.dashSpeed || 6, dt, ctx);
  } else if (enemy.knockbackTimer === 0) {
    const r = def.circleRadius || 3.5;
    _toTarget.set(
      playerPos.x + Math.cos(enemy.circleAngle) * r - enemy.root.position.x,
      playerPos.z + Math.sin(enemy.circleAngle) * r - enemy.root.position.z,
    );
    if (_toTarget.length() > 0.3) {
      _toTarget.normalize();
      moveWithSteering(enemy, _toTarget, enemy.speed, dt, ctx);
    }
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Leap ---
function updateLeap(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  enemy.behaviorTimer -= dt;

  if (enemy.behaviorTimer <= 0 && enemy.onGround) {
    enemy.behaviorTimer = def.leapInterval || 1.2;
    if (distance > 1.5) {
      _dir.copy(flat).normalize();
      // Use actual velocity for leap
      enemy.velocityY = (def.leapStrength || 5);
      enemy.onGround = false;
      // Horizontal push via knockback
      enemy.knockback.set(_dir.x * (def.leapStrength || 5) * 0.8, 0, _dir.y * (def.leapStrength || 5) * 0.8);
      enemy.knockbackTimer = 300;
    }
  }

  // Squash/stretch animation for leap type
  if (!enemy.onGround) {
    const jumpT = Math.max(0, enemy.velocityY / (def.leapStrength || 5));
    const stretch = 1 + jumpT * 0.25;
    const squash = 1 / Math.sqrt(stretch);
    enemy.body.scale.set(squash, stretch, squash);
    enemy.head.scale.set(squash, stretch, squash);
  } else {
    const t = enemy.behaviorTimer / (def.leapInterval || 1.2);
    const squash = 1 + Math.sin(t * Math.PI) * 0.15;
    enemy.body.scale.set(1 / squash, squash, 1 / squash);
    enemy.head.scale.set(1 / squash, squash, 1 / squash);
  }

  tryMeleeAttack(enemy, distance, ctx);
  facePlayer(enemy, playerPos);
}

// --- Teleport ---
function updateTeleport(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  enemy.behaviorTimer -= dt;
  applyFloat(enemy, dt);

  if (enemy.behaviorTimer <= 0) {
    enemy.behaviorTimer = def.teleportInterval || 3;
    const r = def.teleportRadius || 6;
    const angle = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * (r - 2);
    const nx = playerPos.x + Math.cos(angle) * dist;
    const nz = playerPos.z + Math.sin(angle) * dist;
    const surfaceY = ctx.world.getTerrainSurfaceY(nx, nz);

    _pos.set(enemy.root.position.x, enemy.root.position.y + 1, enemy.root.position.z);
    ctx.particles.spawn(_pos, 'white', 8);
    enemy.root.position.set(nx, surfaceY, nz);
    enemy.velocityY = 0;
    enemy.onGround = true;
    _pos.set(nx, surfaceY + 1, nz);
    ctx.particles.spawn(_pos, 'white', 8);
  }

  if (distance > 1.7) {
    moveWithSteering(enemy, flat, enemy.speed, dt, ctx);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Ranged ---
function updateRanged(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  const preferred = def.preferredDistance || 8;
  _dir.copy(flat).normalize();
  applyFloat(enemy, dt);

  if (def.teleportWhenClose && distance < (def.teleportThreshold || 4)) {
    const angle = Math.random() * Math.PI * 2;
    const nx = playerPos.x + Math.cos(angle) * preferred;
    const nz = playerPos.z + Math.sin(angle) * preferred;
    const surfaceY = ctx.world.getTerrainSurfaceY(nx, nz);
    _pos.set(enemy.root.position.x, enemy.root.position.y + 1, enemy.root.position.z);
    ctx.particles.spawn(_pos, 'white', 6);
    enemy.root.position.set(nx, surfaceY, nz);
    enemy.velocityY = 0;
    enemy.onGround = true;
    _pos.set(nx, surfaceY + 1, nz);
    ctx.particles.spawn(_pos, 'white', 6);
  } else if (distance < preferred - 2 && enemy.knockbackTimer === 0) {
    moveToward(enemy, _dir, -enemy.speed, dt);
  } else if (distance > preferred + 2) {
    moveWithSteering(enemy, _dir, enemy.speed, dt, ctx);
  }

  if (enemy.burstRemaining > 0) {
    enemy.burstTimer -= dt * 1000;
    if (enemy.burstTimer <= 0) {
      spawnProjectile(enemy, playerPos, ctx);
      enemy.burstRemaining -= 1;
      enemy.burstTimer = def.burstDelay || 150;
    }
  } else if (enemy.attackCooldown === 0 && distance <= def.attackRange) {
    enemy.attackCooldown = def.attackCooldownMs;
    if (def.burstCount && def.burstCount > 1) {
      enemy.burstRemaining = def.burstCount;
      enemy.burstTimer = 0;
    } else {
      spawnProjectile(enemy, playerPos, ctx);
    }
  }

  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Explode ---
function updateExplode(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;

  if (enemy.fusing) {
    enemy.fuseTimer -= dt;
    const flashRate = 4 + (1 - enemy.fuseTimer / def.fuseTime) * 12;
    enemy.hitFlash = Math.sin(enemy.fuseTimer * flashRate * Math.PI) > 0 ? 0.8 : 0;

    if (enemy.fuseTimer <= 0) {
      _pos.set(enemy.root.position.x, enemy.root.position.y + 1, enemy.root.position.z);
      ctx.particles.spawn(_pos, 'red', 24);
      ctx.particles.spawn(_pos, 'white', 16);
      events.emit('sound:break');

      if (distance <= def.explosionRadius) {
        const damage = Math.max(1, enemy.baseAttack - ctx.state.player.baseDefense);
        ctx.state.player.hp = Math.max(0, ctx.state.player.hp - damage);
        events.emit('player:hit', { damage });
        events.emit('sound:hit');
      }

      const cx = Math.floor(enemy.root.position.x);
      const cy = Math.floor(enemy.root.position.y);
      const cz = Math.floor(enemy.root.position.z);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = 0; dy <= 2; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            if (cy + dy > 0 && Math.random() < 0.4) {
              ctx.world.removeBlock(cx + dx, cy + dy, cz + dz);
            }
          }
        }
      }

      enemy.health = 0;
      ctx.enemies.defeat(enemy, { source: 'explode' });
      if (!ctx.state.defense.enabled) ctx.enemies.scheduleRespawn();
      events.emit('hud:update');
      return;
    }
  } else if (distance <= def.attackRange) {
    enemy.fusing = true;
    enemy.fuseTimer = def.fuseTime;
  }

  if (!enemy.fusing && distance > 1.5) {
    moveWithSteering(enemy, flat, enemy.speed, dt, ctx);
  }

  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Regen ---
function updateRegen(dt, enemy, playerPos, distance, flat, ctx) {
  if (enemy.health < enemy.maxHealth) {
    enemy.health = Math.min(enemy.maxHealth, enemy.health + (enemy.typeDef.regenPerSecond || 0.5) * dt);
  }

  if (distance > 1.7) {
    moveWithSteering(enemy, flat, enemy.speed, dt, ctx);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Flee ---
function updateFlee(dt, enemy, playerPos, distance, flat, ctx) {
  _dir.copy(flat).normalize();
  _playerFwd.set(-Math.sin(ctx.state.player.yaw), -Math.cos(ctx.state.player.yaw));
  const playerFacing = _dir.dot(_playerFwd) > 0.3;

  if (playerFacing && distance < 8 && enemy.knockbackTimer === 0) {
    moveToward(enemy, _dir, -enemy.speed, dt);
  } else if (!playerFacing && distance > 1.7 && enemy.knockbackTimer === 0) {
    moveToward(enemy, _dir, enemy.speed * 1.2, dt);
  } else if (distance > 1.7 && enemy.knockbackTimer === 0) {
    _perp.set(-_dir.y, _dir.x);
    moveToward(enemy, _perp, enemy.speed, dt);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

const BEHAVIORS = {
  chase: updateChase,
  charge: updateCharge,
  circle: updateCircle,
  leap: updateLeap,
  teleport: updateTeleport,
  ranged: updateRanged,
  explode: updateExplode,
  regen: updateRegen,
  flee: updateFlee,
};

export function updateEnemyBehavior(dt, enemy, playerPos, distance, flatToPlayer, ctx) {
  const modeTarget = getTargetPosition(playerPos, ctx);
  const targetPos = getTacticalTarget(enemy, modeTarget, dt, ctx);
  _toTarget.set(targetPos.x - enemy.root.position.x, targetPos.z - enemy.root.position.z);
  const adjustedDistance = _toTarget.length();
  const fn = BEHAVIORS[enemy.typeDef.behavior] || updateChase;
  fn(dt, enemy, targetPos, adjustedDistance, _toTarget, ctx);
}
