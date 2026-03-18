import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../config/assets.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../config/constants.js';
import { events } from '../core/EventBus.js';

const SUPPORT_BLOCKS = new Set(['grass', 'dirt', 'stone', 'sand', 'brick']);
const CLEARANCE_RADIUS = 1.2;
const CLEARANCE_HEIGHT = 4;
const HOME_TOWER_BLOCK_RADIUS = 3.1;
const MERCHANT_BLOCK_RADIUS = 1.6;
const TOWER_SPACING = 2.4;
const TOWER_ATTACK_RANGE = 9.5;
const TOWER_ATTACK_CONE_COS = Math.cos(THREE.MathUtils.degToRad(38));
const TOWER_FIRE_INTERVAL = 0.82;
const TOWER_PROJECTILE_SPEED = 13.5;
const TOWER_PROJECTILE_DAMAGE = 2.5;
const TOWER_PROJECTILE_KNOCKBACK = 8.0;
const TOWER_PROJECTILE_AOE_RADIUS = 2.6;
const TOWER_PROJECTILE_HEIGHT = 1.45;
const MODEL_TARGET_HEIGHT = 2.6;

let cannonTowerTemplate = null;
let cannonTowerLoadPromise = null;

function ensureCannonTowerTemplate() {
  if (cannonTowerTemplate) return Promise.resolve(cannonTowerTemplate);
  if (!cannonTowerLoadPromise) {
    cannonTowerLoadPromise = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        assetUrl('assets/buildings/canontower/canontower.glb'),
        (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxHeight = Math.max(size.y, 0.001);
          const scale = MODEL_TARGET_HEIGHT / maxHeight;
          model.scale.setScalar(scale);

          const scaledBox = new THREE.Box3().setFromObject(model);
          const center = scaledBox.getCenter(new THREE.Vector3());
          model.position.x -= center.x;
          model.position.y -= scaledBox.min.y;
          model.position.z -= center.z;

          cannonTowerTemplate = model;
          resolve(cannonTowerTemplate);
        },
        undefined,
        reject,
      );
    });
  }
  return cannonTowerLoadPromise;
}

function createFallbackTower() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.64, 0.42, 10),
    new THREE.MeshStandardMaterial({ color: 0x7b8796, roughness: 0.72, metalness: 0.14 }),
  );
  base.position.y = 0.21;
  group.add(base);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.5, 1.25, 10),
    new THREE.MeshStandardMaterial({ color: 0x525e6d, roughness: 0.62, metalness: 0.22 }),
  );
  body.position.y = 0.82;
  group.add(body);

  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.24, 1.15),
    new THREE.MeshStandardMaterial({ color: 0x28313d, roughness: 0.4, metalness: 0.36 }),
  );
  barrel.position.set(0, 1.08, -0.58);
  group.add(barrel);

  return group;
}

function setGhostTint(root, color, opacity) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material.color) material.color.set(color);
      if ('emissive' in material && material.emissive) material.emissive.set(color).multiplyScalar(0.2);
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    });
  });
}

function horizontalDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function makeForwardFromYaw(yaw, target = new THREE.Vector3()) {
  return target.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export class CannonTowerSystem {
  constructor(gameState, world, sceneSetup, enemyManager, projectileSystem, remotePlayers = null) {
    this.state = gameState;
    this.world = world;
    this.scene = sceneSetup;
    this.enemies = enemyManager;
    this.projectileSystem = projectileSystem;
    this.remotePlayers = remotePlayers;
    this.inventory = null;
    this.homeTowerMesh = null;
    this.merchantPos = null;
    this.visuals = new Map();

    this._tmpForward = new THREE.Vector3();
    this._tmpEnemyDir = new THREE.Vector3();
    this._tmpTargetPos = new THREE.Vector3();
    this._tmpAimDir = new THREE.Vector3();

    this.preview = {
      group: new THREE.Group(),
      fallback: createFallbackTower(),
      valid: false,
      visible: false,
      cell: null,
    };
    setGhostTint(this.preview.fallback, '#7efc8a', 0.38);
    this.preview.group.add(this.preview.fallback);
    this.preview.group.visible = false;
    this.preview.group.renderOrder = 40;
    this.scene.enemyGroup.add(this.preview.group);
  }

  setInventory(inventory) {
    this.inventory = inventory;
  }

  setHomeTowerMesh(towerMesh) {
    this.homeTowerMesh = towerMesh;
  }

  setMerchantPosition(position) {
    this.merchantPos = position;
  }

  clear() {
    this.preview.group.visible = false;
    this.preview.visible = false;
    Array.from(this.visuals.values()).forEach((visual) => {
      this.scene.enemyGroup.remove(visual.group);
    });
    this.visuals.clear();
  }

  getPlacementState() {
    const selected = this.state.getSelectedSkill?.();
    return {
      selectedDeployable: selected?.deployableType ?? null,
      previewVisible: this.preview.visible,
      previewValid: this.preview.valid,
      previewCell: this.preview.cell,
    };
  }

  update(dt, { remoteAuthoritative = false } = {}) {
    this._updatePreview();
    this._syncVisuals();
    if (remoteAuthoritative) {
      this._updateRemoteShotVisuals();
      return;
    }
    this._updateLocalTurrets(dt);
  }

  tryPlaceSelectedTower({ queuePlacement } = {}) {
    const placement = this._getPlacementCandidate();
    if (!placement?.valid) {
      events.emit('status:message', placement?.reason || '砲塔只能放在沒有阻擋的地面或牆面上');
      return false;
    }

    if (this.inventory && !this.inventory.consumeSelectedDeployable('cannon_tower')) {
      events.emit('status:message', '砲塔道具已不存在');
      return false;
    }

    const tower = {
      id: `turret-${Math.random().toString(36).slice(2, 10)}`,
      x: placement.position.x,
      y: placement.position.y,
      z: placement.position.z,
      yaw: placement.yaw,
      cooldown: 0,
      ownerName: this.state.playerName,
    };

    if (queuePlacement) queuePlacement(tower);
    else this.state.defense.turrets.push(tower);

    events.emit('sound:place');
    events.emit('status:message', '已放置加農砲塔');
    events.emit('hud:update');
    return true;
  }

  _updatePreview() {
    const selected = this.state.getSelectedSkill?.();
    const shouldShow = Boolean(
      this.state.mode === 'playing' &&
      this.state.defense.enabled &&
      !this.state.shopOpen &&
      !this.state.inventoryOpen &&
      selected?.kind === 'deployable' &&
      selected?.deployableType === 'cannon_tower',
    );

    if (!shouldShow) {
      this.preview.group.visible = false;
      this.preview.visible = false;
      this.preview.cell = null;
      return;
    }

    const placement = this._getPlacementCandidate();
    if (!placement) {
      this.preview.group.visible = false;
      this.preview.visible = false;
      this.preview.cell = null;
      return;
    }

    this.preview.group.visible = true;
    this.preview.visible = true;
    this.preview.valid = placement.valid;
    this.preview.cell = {
      x: placement.cell.x,
      y: placement.cell.y,
      z: placement.cell.z,
      reason: placement.reason || '',
    };
    this.preview.group.position.copy(placement.position);
    this.preview.group.rotation.set(0, placement.yaw, 0);

    const tint = placement.valid ? '#7efc8a' : '#ff6b6b';
    setGhostTint(this.preview.fallback, tint, placement.valid ? 0.38 : 0.3);
  }

  _getPlacementCandidate() {
    const target = this.state.target;
    if (!target?.placeAt) return null;

    const { x, y, z } = target.placeAt;
    const yaw = this.state.player.yaw;
    const position = new THREE.Vector3(x + 0.5, y, z + 0.5);
    const cell = { x, y, z };

    if (!this.world.isInsideWorld(x, y, z) || !this.world.isInsideWorld(x, y + 2, z)) {
      return { valid: false, reason: '這裡超出可放置範圍', position, yaw, cell };
    }

    const support = this.world.getBlock(x, y - 1, z);
    if (!SUPPORT_BLOCKS.has(support)) {
      return { valid: false, reason: '砲塔只能放在地面方塊或牆面方塊上', position, yaw, cell };
    }

    if (this.world.getBlock(x, y, z) || this.world.getBlock(x, y + 1, z)) {
      return { valid: false, reason: '這個位置被方塊擋住了', position, yaw, cell };
    }

    if (this._hasWorldObstacle(position, y)) {
      return { valid: false, reason: '附近有障礙物，無法展開砲塔', position, yaw, cell };
    }

    const overlapReason = this._getOverlapReason(position);
    if (overlapReason) {
      return { valid: false, reason: overlapReason, position, yaw, cell };
    }

    return { valid: true, position, yaw, cell, reason: '' };
  }

  _hasWorldObstacle(position, baseY) {
    const minX = Math.floor(position.x - CLEARANCE_RADIUS);
    const maxX = Math.floor(position.x + CLEARANCE_RADIUS);
    const minZ = Math.floor(position.z - CLEARANCE_RADIUS);
    const maxZ = Math.floor(position.z + CLEARANCE_RADIUS);

    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        for (let iy = baseY; iy < baseY + CLEARANCE_HEIGHT; iy += 1) {
          const block = this.world.getBlock(ix, iy, iz);
          if (!block) continue;
          return true;
        }
      }
    }

    return false;
  }

  _getOverlapReason(position) {
    const playerTop = this.state.player.position.y + PLAYER_HEIGHT;
    if (
      horizontalDistance(position, this.state.player.position) < CLEARANCE_RADIUS + PLAYER_RADIUS &&
      this.state.player.position.y < position.y + CLEARANCE_HEIGHT &&
      playerTop > position.y
    ) {
      return '不能直接放在玩家身上';
    }

    const enemyHit = this.enemies.getAlive().find((enemy) => {
      const radius = 0.55 * (enemy.sizeMultiplier || 1);
      return horizontalDistance(position, enemy.root.position) < CLEARANCE_RADIUS + radius;
    });
    if (enemyHit) return '有敵人擋住了砲塔位置';

    if (this.remotePlayers) {
      const overlapsRemote = Array.from(this.remotePlayers.avatars.values()).some((avatar) => {
        if (!avatar.root.visible || avatar.isDead) return false;
        return horizontalDistance(position, avatar.root.position) < CLEARANCE_RADIUS + 0.6;
      });
      if (overlapsRemote) return '不能放在其他玩家身上';
    }

    if (this.homeTowerMesh && horizontalDistance(position, this.homeTowerMesh.position) < HOME_TOWER_BLOCK_RADIUS) {
      return '太靠近守護塔了';
    }

    if (this.merchantPos && horizontalDistance(position, this.merchantPos) < MERCHANT_BLOCK_RADIUS) {
      return '商人站在這裡，無法放置';
    }

    const overlappingTower = this.state.defense.turrets.some((tower) => (
      horizontalDistance(position, tower) < TOWER_SPACING
    ));
    if (overlappingTower) return '這裡已經有砲塔了';

    return '';
  }

  _syncVisuals() {
    const keep = new Set();
    this.state.defense.turrets.forEach((tower) => {
      keep.add(tower.id);
      let visual = this.visuals.get(tower.id);
      if (!visual) {
        visual = this._createTowerVisual(tower.id);
        this.visuals.set(tower.id, visual);
      }
      visual.group.position.set(tower.x, tower.y, tower.z);
      visual.group.rotation.set(0, tower.yaw ?? 0, 0);
    });

    Array.from(this.visuals.entries()).forEach(([id, visual]) => {
      if (keep.has(id)) return;
      this.scene.enemyGroup.remove(visual.group);
      this.visuals.delete(id);
    });
  }

  _createTowerVisual(id) {
    const group = new THREE.Group();
    group.name = `cannon-tower-${id}`;
    group.add(createFallbackTower());
    this.scene.enemyGroup.add(group);

    ensureCannonTowerTemplate()
      .then((template) => {
        if (!this.visuals.has(id)) return;
        group.clear();
        const model = template.clone(true);
        group.add(model);
      })
      .catch(() => {
        // Leave fallback tower in place if the GLB cannot be loaded.
      });

    return {
      group,
      lastServerCooldown: 0,
    };
  }

  _updateLocalTurrets(dt) {
    this.state.defense.turrets.forEach((tower) => {
      tower.cooldown = Math.max(0, (tower.cooldown ?? 0) - dt);
      if (tower.cooldown > 0) return;
      const target = this._findTargetInCone(tower);
      if (!target) return;
      tower.cooldown = TOWER_FIRE_INTERVAL;
      this._applyExplosionDamage(target);
      this._spawnProjectile(tower, target, { visualOnly: true });
    });
  }

  _updateRemoteShotVisuals() {
    this.state.defense.turrets.forEach((tower) => {
      const visual = this.visuals.get(tower.id);
      if (!visual) return;
      const currentCooldown = Number(tower.cooldown ?? 0);
      const fired = currentCooldown > visual.lastServerCooldown + 0.25;
      visual.lastServerCooldown = currentCooldown;
      if (!fired) return;
      const target = this._findTargetInCone(tower);
      if (!target) return;
      this._spawnProjectile(tower, target, { visualOnly: true });
    });
  }

  _findTargetInCone(tower) {
    const forward = makeForwardFromYaw(tower.yaw ?? 0, this._tmpForward);
    let bestTarget = null;
    let bestScore = -Infinity;

    this.enemies.getAlive().forEach((enemy) => {
      this._tmpEnemyDir.subVectors(enemy.root.position, tower);
      const distance = this._tmpEnemyDir.length();
      if (distance > TOWER_ATTACK_RANGE) return;
      this._tmpEnemyDir.y = 0;
      if (this._tmpEnemyDir.lengthSq() < 0.0001) return;
      this._tmpEnemyDir.normalize();
      const facing = forward.dot(this._tmpEnemyDir);
      if (facing < TOWER_ATTACK_CONE_COS) return;
      const score = facing * 4 - distance * 0.22;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    });

    return bestTarget;
  }

  _spawnProjectile(tower, enemy, { visualOnly }) {
    const origin = this._tmpTargetPos.set(tower.x, tower.y + TOWER_PROJECTILE_HEIGHT, tower.z);
    const impactTarget = enemy.root.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    const direction = this._tmpAimDir.subVectors(impactTarget, origin).normalize();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.98 }),
    );
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffd966,
        transparent: true,
        opacity: 0.42,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.08, 0.5, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    streak.rotation.x = Math.PI / 2;
    streak.position.z = 0.2;

    const group = new THREE.Group();
    group.position.copy(origin);
    group.lookAt(origin.clone().add(direction));
    group.add(aura);
    group.add(core);
    group.add(streak);
    this.scene.particleGroup.add(group);

    this.projectileSystem.spawn({
      group,
      velocity: direction.clone().multiplyScalar(TOWER_PROJECTILE_SPEED),
      origin: origin.clone(),
      maxRange: TOWER_ATTACK_RANGE + 1.5,
      damage: TOWER_PROJECTILE_DAMAGE,
      knockback: TOWER_PROJECTILE_KNOCKBACK,
      aoe: true,
      aoeRadius: TOWER_PROJECTILE_AOE_RADIUS,
      explodeOnImpact: true,
      explosionScale: 1.7,
      explosionColors: [0xffffff, 0xfff3b0, 0xffd966, 0xffb347],
      trailConfig: {
        count: 22,
        size: 0.12,
        colors: [0xffffff, 0xfff3b0, 0xffd966],
        riseSpeed: 0.65,
      },
      visualOnly,
    });
  }

  _applyExplosionDamage(target) {
    const impactPos = target.root.position.clone();
    const alive = this.enemies.getAlive();

    alive.forEach((enemy) => {
      const distance = enemy.root.position.distanceTo(impactPos);
      if (distance > TOWER_PROJECTILE_AOE_RADIUS) return;

      const falloff = 1 - (distance / TOWER_PROJECTILE_AOE_RADIUS) * 0.45;
      const damage = Math.max(1, Math.round(TOWER_PROJECTILE_DAMAGE * falloff) - (enemy.baseDefense || 0));
      enemy.health -= damage;
      enemy.hitFlash = 1;

      const away = new THREE.Vector3().subVectors(enemy.root.position, impactPos);
      away.y = 0;
      if (away.lengthSq() < 0.001) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      enemy.knockback.copy(away.multiplyScalar(TOWER_PROJECTILE_KNOCKBACK * Math.max(0.35, falloff)));
      enemy.knockbackTimer = 220;

      if (enemy.health <= 0) {
        this.enemies.defeat(enemy, { source: 'turret' });
      }
    });

    events.emit('hud:update');
  }
}
