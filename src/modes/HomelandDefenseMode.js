import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { SPAWN_TABLE } from '../config/enemyTypes.js';
import { events } from '../core/EventBus.js';

const WAVE_DURATION = 60;
const ENEMY_MULTIPLIER = 1.18;

function randomSpawnType() {
  return SPAWN_TABLE[Math.floor(Math.random() * SPAWN_TABLE.length)];
}

function computeToughness(enemy) {
  const def = enemy.typeDef;
  return def.maxHealth + (def.baseAttack * 1.5) + (def.baseDefense * 2) + (def.sizeMultiplier * 1.2);
}

export class HomelandDefenseMode {
  constructor(gameState, world, enemyManager, scene) {
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
    this.turrets = [];
    this._turretTick = 0;
  }

  activate() {
    this.state.defense.enabled = true;
    this.state.defense.totalKills = 0;
    this.state.defense.totalGold = 0;
    this.state.defense.wave = 0;
    this.state.defense.timeLeft = WAVE_DURATION;
    this._buildFortress();
    this._buildTowerVisual();
    this.startNextWave();

    events.on('enemy:killed', ({ enemy }) => this._onEnemyKilled(enemy));
    events.on('shop:purchase', ({ item }) => this.purchase(item));
  }

  update(dt) {
    if (!this.state.defense.enabled || this.state.mode !== 'playing' || this.state.defense.towerHp <= 0) return;

    this.state.defense.timeLeft = Math.max(0, this.state.defense.timeLeft - dt);

    const alive = this.enemies.getAlive().length;
    if (alive === 0 || this.state.defense.timeLeft <= 0) {
      this.startNextWave();
    }

    this._updateTurrets(dt);
    events.emit('hud:update');
  }

  startNextWave() {
    this.state.defense.wave += 1;
    this.state.defense.timeLeft = WAVE_DURATION;
    this.state.defense.towerHp = this.state.defense.towerMaxHp;
    this.enemies.clearAll();

    const wave = this.state.defense.wave;
    const count = 4 + Math.floor(wave * 1.8);
    const scale = Math.pow(ENEMY_MULTIPLIER, wave - 1);

    for (let i = 0; i < count; i += 1) {
      this.enemies.spawn(i * 7, randomSpawnType(), {
        spawnAround: this.center,
        statMultiplier: scale,
      });
    }
    events.emit('hud:update');
  }

  damageTower(amount) {
    if (!this.state.defense.enabled) return;
    this.state.defense.towerHp = Math.max(0, this.state.defense.towerHp - amount);
    if (this.state.defense.towerHp <= 0) {
      this.state.mode = 'paused';
      events.emit('status:message', '守護塔已被摧毀，本局結束。');
    }
  }

  getDefenseTarget() {
    return this.center;
  }

  _buildTowerVisual() {
    if (this.towerMesh) return;
    const geom = new THREE.CylinderGeometry(1.2, 1.6, 5.5, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbca77f, roughness: 0.85 });
    this.towerMesh = new THREE.Mesh(geom, mat);
    const y = this.world.getTerrainSurfaceY(this.center.x, this.center.z);
    this.center.y = y;
    this.towerMesh.position.set(this.center.x, y + 2.75, this.center.z);
    this.scene.enemyGroup.add(this.towerMesh);
  }

  _buildFortress() {
    const cx = Math.floor(this.center.x);
    const cz = Math.floor(this.center.z);
    const ground = Math.floor(this.world.getTerrainSurfaceY(cx, cz) - 1);
    for (let x = -6; x <= 6; x += 1) {
      for (let z = -6; z <= 6; z += 1) {
        const ax = cx + x;
        const az = cz + z;
        for (let y = ground + 1; y <= ground + 3; y += 1) {
          const onOuterWall = Math.abs(x) === 6 || Math.abs(z) === 6;
          const isGate = (
            (z === -6 && Math.abs(x) <= 1) ||
            (z === 6 && Math.abs(x) <= 1) ||
            (x === -6 && Math.abs(z) <= 1) ||
            (x === 6 && Math.abs(z) <= 1)
          );
          if (onOuterWall && !isGate) {
            this.world.setBlock(ax, y, az, 'brick');
          }
        }
      }
    }
  }

  _onEnemyKilled(enemy) {
    if (!this.state.defense.enabled) return;
    this.state.defense.totalKills += 1;
    const gold = Math.max(1, Math.ceil(computeToughness(enemy) * 0.8));
    this.state.defense.totalGold += gold;
  }

  purchase(item) {
    if (!this.state.defense.enabled) return;
    const costs = { heal: 15, tower: 25, turret: 40 };
    const cost = costs[item];
    if (!cost || this.state.defense.totalGold < cost) return;
    this.state.defense.totalGold -= cost;

    if (item === 'heal') this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 45);
    if (item === 'tower') this.state.defense.towerHp = Math.min(this.state.defense.towerMaxHp, this.state.defense.towerHp + 80);
    if (item === 'turret') this._placeTurret();
  }

  _placeTurret() {
    const baseY = this.world.getTerrainSurfaceY(this.center.x + 3, this.center.z);
    const geom = new THREE.CylinderGeometry(0.3, 0.45, 1.2, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6ec6ff, emissive: 0x224466 });
    const mesh = new THREE.Mesh(geom, mat);
    const angle = this.turrets.length * 1.3;
    mesh.position.set(this.center.x + Math.cos(angle) * 3.4, baseY + 0.6, this.center.z + Math.sin(angle) * 3.4);
    this.scene.enemyGroup.add(mesh);
    this.turrets.push({ mesh, cooldown: 0 });
  }

  _updateTurrets(dt) {
    this._turretTick += dt;
    if (this._turretTick < 0.12) return;
    this._turretTick = 0;

    const alive = this.enemies.getAlive();
    this.turrets.forEach((turret) => {
      turret.cooldown = Math.max(0, turret.cooldown - 120);
      if (turret.cooldown > 0) return;
      const target = alive.find((enemy) => enemy.root.position.distanceTo(turret.mesh.position) < 8);
      if (!target) return;
      target.health -= 1.2;
      target.hitFlash = 1;
      turret.cooldown = 650;
      if (target.health <= 0) this.enemies.defeat(target, { source: 'turret' });
    });
  }
}
