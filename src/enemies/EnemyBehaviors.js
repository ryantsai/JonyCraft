import * as THREE from 'three';
import { events } from '../core/EventBus.js';

/**
 * Enemy AI behavior functions. Each returns after updating the enemy's position/state.
 * All behaviors receive (dt, enemy, playerPos, distance, flatToPlayer, context).
 * context = { state, world, particles, enemies }
 */

function dealDamage(enemy, ctx) {
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
  const range = enemy.typeDef.attackRange;
  if (distance <= range && enemy.attackCooldown === 0) {
    enemy.attackCooldown = enemy.typeDef.attackCooldownMs;
    dealDamage(enemy, ctx);
    return true;
  }
  return false;
}

function spawnProjectile(enemy, playerPos, ctx) {
  const origin = enemy.root.position.clone().add(new THREE.Vector3(0, 1.2 * enemy.sizeMultiplier, 0));
  const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
  const speed = enemy.typeDef.projectileSpeed || 8;
  ctx.enemies.addProjectile({
    position: origin,
    velocity: dir.multiplyScalar(speed),
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

// --- Chase: standard zombie behavior ---
function updateChase(dt, enemy, playerPos, distance, flat, ctx) {
  if (distance > 1.7 && enemy.knockbackTimer === 0) {
    const dir = flat.clone().normalize();
    moveToward(enemy, dir, enemy.speed, dt);
  }
  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Charge: slow approach, sprint burst when close ---
function updateCharge(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  const dir = flat.clone().normalize();

  if (distance <= def.chargeDistance && enemy.behaviorPhase !== 'charging') {
    enemy.behaviorPhase = 'charging';
    enemy.behaviorTimer = 0.8;
  }

  if (enemy.behaviorPhase === 'charging') {
    enemy.behaviorTimer -= dt;
    const spd = def.chargeSpeed || enemy.speed * 3;
    moveToward(enemy, dir, spd, dt);
    if (enemy.behaviorTimer <= 0 || distance < 1.5) {
      enemy.behaviorPhase = 'idle';
    }
  } else if (distance > 1.7 && enemy.knockbackTimer === 0) {
    moveToward(enemy, dir, enemy.speed, dt);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Circle: strafe around, dash in to attack ---
function updateCircle(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  enemy.behaviorTimer -= dt;
  enemy.circleAngle += dt * 1.8;

  if (enemy.behaviorTimer <= 0 && distance < 6) {
    enemy.behaviorPhase = enemy.behaviorPhase === 'dash' ? 'circle' : 'dash';
    enemy.behaviorTimer = enemy.behaviorPhase === 'dash' ? 0.5 : (def.dashInterval || 2.5);
  }

  if (enemy.behaviorPhase === 'dash' && enemy.knockbackTimer === 0) {
    const dir = flat.clone().normalize();
    moveToward(enemy, dir, def.dashSpeed || 6, dt);
  } else if (enemy.knockbackTimer === 0) {
    const r = def.circleRadius || 3.5;
    const targetX = playerPos.x + Math.cos(enemy.circleAngle) * r;
    const targetZ = playerPos.z + Math.sin(enemy.circleAngle) * r;
    const toTarget = new THREE.Vector2(
      targetX - enemy.root.position.x,
      targetZ - enemy.root.position.z,
    );
    if (toTarget.length() > 0.3) {
      toTarget.normalize();
      moveToward(enemy, toTarget, enemy.speed, dt);
    }
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Leap: bouncy hopping movement ---
function updateLeap(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  enemy.behaviorTimer -= dt;

  if (enemy.behaviorTimer <= 0) {
    enemy.behaviorTimer = def.leapInterval || 1.2;
    if (distance > 1.5) {
      const dir = flat.clone().normalize();
      const str = def.leapStrength || 5;
      enemy.knockback.set(dir.x * str, 0, dir.y * str);
      enemy.knockbackTimer = 300;
    }
  }

  // Squash/stretch animation
  const t = enemy.behaviorTimer / (def.leapInterval || 1.2);
  const squash = 1 + Math.sin(t * Math.PI) * 0.25;
  enemy.body.scale.set(1 / squash, squash, 1 / squash);
  enemy.head.scale.set(1 / squash, squash, 1 / squash);

  tryMeleeAttack(enemy, distance, ctx);
  facePlayer(enemy, playerPos);
}

// --- Teleport: blink around, attack after appearing ---
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

    // Teleport particles at old position
    ctx.particles.spawn(
      enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)),
      'white', 8,
    );

    enemy.root.position.set(nx, surfaceY, nz);

    // Particles at new position
    ctx.particles.spawn(
      enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)),
      'white', 8,
    );
  }

  if (distance > 1.7 && enemy.knockbackTimer === 0) {
    const dir = flat.clone().normalize();
    moveToward(enemy, dir, enemy.speed, dt);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Ranged: keep distance, shoot projectiles ---
function updateRanged(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;
  const preferred = def.preferredDistance || 8;
  const dir = flat.clone().normalize();
  applyFloat(enemy, dt);

  // Teleport away if player gets too close (wizard)
  if (def.teleportWhenClose && distance < (def.teleportThreshold || 4)) {
    const angle = Math.random() * Math.PI * 2;
    const nx = playerPos.x + Math.cos(angle) * preferred;
    const nz = playerPos.z + Math.sin(angle) * preferred;
    const surfaceY = ctx.world.getTerrainSurfaceY(nx, nz);
    ctx.particles.spawn(enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 'white', 6);
    enemy.root.position.set(nx, surfaceY, nz);
    ctx.particles.spawn(enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 'white', 6);
  } else if (distance < preferred - 2 && enemy.knockbackTimer === 0) {
    // Back away
    moveToward(enemy, dir, -enemy.speed, dt);
  } else if (distance > preferred + 2 && enemy.knockbackTimer === 0) {
    moveToward(enemy, dir, enemy.speed, dt);
  }

  // Burst fire (blaze)
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

// --- Explode: rush player, fuse, then explode ---
function updateExplode(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;

  if (enemy.fusing) {
    enemy.fuseTimer -= dt;
    // Flash faster as fuse burns
    const flashRate = 4 + (1 - enemy.fuseTimer / def.fuseTime) * 12;
    enemy.hitFlash = Math.sin(enemy.fuseTimer * flashRate * Math.PI) > 0 ? 0.8 : 0;

    if (enemy.fuseTimer <= 0) {
      // Explode!
      const pos = enemy.root.position.clone().add(new THREE.Vector3(0, 1, 0));
      ctx.particles.spawn(pos, 'red', 24);
      ctx.particles.spawn(pos, 'white', 16);
      events.emit('sound:break');

      // Damage player if in range
      if (distance <= def.explosionRadius) {
        const damage = Math.max(1, enemy.baseAttack - ctx.state.player.baseDefense);
        ctx.state.player.hp = Math.max(0, ctx.state.player.hp - damage);
        events.emit('player:hit', { damage });
        events.emit('sound:hit');
      }

      // Destroy some blocks nearby
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

      // Die
      enemy.health = 0;
      enemy.alive = false;
      ctx.state.combat.kills += 1;
      events.emit('sound:kill');
      ctx.enemies.remove(enemy);
      ctx.enemies.scheduleRespawn();
      events.emit('hud:update');
      return;
    }
  } else if (distance <= def.attackRange) {
    enemy.fusing = true;
    enemy.fuseTimer = def.fuseTime;
  }

  if (!enemy.fusing && distance > 1.5 && enemy.knockbackTimer === 0) {
    const dir = flat.clone().normalize();
    moveToward(enemy, dir, enemy.speed, dt);
  }

  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Shield/Regen: slow tank that regenerates HP ---
function updateRegen(dt, enemy, playerPos, distance, flat, ctx) {
  const def = enemy.typeDef;

  // Regenerate HP
  if (enemy.health < enemy.maxHealth) {
    enemy.health = Math.min(enemy.maxHealth, enemy.health + (def.regenPerSecond || 0.5) * dt);
  }

  if (distance > 1.7 && enemy.knockbackTimer === 0) {
    const dir = flat.clone().normalize();
    moveToward(enemy, dir, enemy.speed, dt);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Flee: run away when player faces it, attack from behind ---
function updateFlee(dt, enemy, playerPos, distance, flat, ctx) {
  const dir = flat.clone().normalize();

  // Check if player is roughly facing this enemy
  const playerForward = new THREE.Vector2(
    -Math.sin(ctx.state.player.yaw),
    -Math.cos(ctx.state.player.yaw),
  );
  const dot = dir.dot(playerForward);
  const playerFacing = dot > 0.3;

  if (playerFacing && distance < 8 && enemy.knockbackTimer === 0) {
    // Run away
    moveToward(enemy, dir, -enemy.speed, dt);
  } else if (!playerFacing && distance > 1.7 && enemy.knockbackTimer === 0) {
    // Sneak up from behind
    moveToward(enemy, dir, enemy.speed * 1.2, dt);
  } else if (distance > 1.7 && enemy.knockbackTimer === 0) {
    // Circle to get behind player
    const perp = new THREE.Vector2(-dir.y, dir.x);
    moveToward(enemy, perp, enemy.speed, dt);
  }

  tryMeleeAttack(enemy, distance, ctx);
  animateWalk(enemy, distance);
  facePlayer(enemy, playerPos);
}

// --- Behavior dispatcher ---
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
  const fn = BEHAVIORS[enemy.typeDef.behavior] || updateChase;
  fn(dt, enemy, playerPos, distance, flatToPlayer, ctx);
}
