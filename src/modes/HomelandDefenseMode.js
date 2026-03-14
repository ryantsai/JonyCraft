import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { SPAWN_TABLE } from '../config/enemyTypes.js';
import { events } from '../core/EventBus.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GameMode } from './GameMode.js';
import { createTowerHealthBar, updateTowerHealthBar, buildFortress, buildTowerCollision } from './DefenseUtils.js';

const WAVE_DURATION = 100;
const ENEMY_MULTIPLIER = 1.18;

function randomSpawnType() {
  return SPAWN_TABLE[Math.floor(Math.random() * SPAWN_TABLE.length)];
}

function computeToughness(enemy) {
  const def = enemy.typeDef;
  return def.maxHealth + (def.baseAttack * 1.5) + (def.baseDefense * 2) + (def.sizeMultiplier * 1.2);
}

export class HomelandDefenseMode extends GameMode {
  constructor(gameState, world, enemyManager, scene) {
    super();
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
    this.towerHealthBar = null;
    this.turrets = [];
    this._turretTick = 0;
    this._unsubs = [];
  }

  activate(context) {
    // If context provides world/renderer/player, do full mode setup
    if (context) {
      context.world.generate({ flatTerrain: true, treeChanceThreshold: 0.9992 });
      context.worldRenderer.buildAll();
      this.enemies.clearAll();
    }

    this.state.defense.enabled = true;
    this.state.defense.totalKills = 0;
    this.state.defense.totalGold = 0;
    this.state.defense.wave = 0;
    this.state.defense.timeLeft = WAVE_DURATION;
    this.state.defense.towerHp = this.state.defense.towerMaxHp;
    buildFortress(this.world, this.center.x, this.center.z);
    buildTowerCollision(this.world, this.center.x, this.center.z);
    this._buildTowerVisual();
    this.startNextWave();

    this._unsubs.push(
      events.on('enemy:killed', ({ enemy }) => this._onEnemyKilled(enemy)),
      events.on('shop:purchase', ({ item }) => this.purchase(item)),
    );
  }

  deactivate() {
    this._unsubs.forEach(unsub => unsub());
    this._unsubs = [];
  }

  update(dt) {
    if (!this.state.defense.enabled || this.state.mode !== 'playing' || this.state.defense.towerHp <= 0) return;

    this.state.defense.timeLeft = Math.max(0, this.state.defense.timeLeft - dt);

    const alive = this.enemies.getAlive().length;
    if (alive === 0 || this.state.defense.timeLeft <= 0) {
      this.startNextWave();
    }

    this._updateTurrets(dt);
    updateTowerHealthBar(this.towerHealthBar, this.state.defense.towerHp, this.state.defense.towerMaxHp);
    events.emit('hud:update');
  }

  startNextWave() {
    this.state.defense.wave += 1;
    this.state.defense.timeLeft = WAVE_DURATION;
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

  getDamageTarget() {
    return 'tower';
  }

  _buildTowerVisual() {
    if (this.towerMesh) return;
    const y = this.world.getTerrainSurfaceY(this.center.x, this.center.z);
    this.center.y = y;

    const placeholder = new THREE.Group();
    placeholder.position.set(this.center.x, y, this.center.z);
    this.scene.enemyGroup.add(placeholder);
    this.towerMesh = placeholder;

    this.towerHealthBar = createTowerHealthBar();
    this.towerHealthBar.position.set(this.center.x, y + 8, this.center.z);
    this.scene.enemyGroup.add(this.towerHealthBar);
    updateTowerHealthBar(this.towerHealthBar, this.state.defense.towerHp, this.state.defense.towerMaxHp);

    const loader = new GLTFLoader();
    loader.load('assets/buildings/homebase/tower.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = 8 / maxDim;
      model.scale.set(s, s, s);
      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= scaledBox.min.y;
      model.position.z -= center.z;

      placeholder.add(model);
      const finalBox = new THREE.Box3().setFromObject(placeholder);
      this.towerHealthBar.position.y = finalBox.max.y + 1;

      // Load Luffy mascot on top of the tower
      loader.load('assets/npc/luffy.glb', (luffyGltf) => {
        const luffy = luffyGltf.scene;
        const lBox = new THREE.Box3().setFromObject(luffy);
        const lSize = lBox.getSize(new THREE.Vector3());
        const lMax = Math.max(lSize.x, lSize.y, lSize.z);
        const ls = 2.5 / lMax;
        luffy.scale.set(ls, ls, ls);
        const lScaled = new THREE.Box3().setFromObject(luffy);
        const lCenter = lScaled.getCenter(new THREE.Vector3());
        const towerHeight = finalBox.max.y - finalBox.min.y;
        const roofY = finalBox.min.y + towerHeight * 0.67 - placeholder.position.y;
        luffy.position.x -= lCenter.x;
        luffy.position.y = roofY - lScaled.min.y;
        luffy.position.z -= lCenter.z + 1.5;
        placeholder.add(luffy);

        // Raise health bar above mascot
        const topBox = new THREE.Box3().setFromObject(placeholder);
        this.towerHealthBar.position.y = topBox.max.y + 2.5;
      });
    });
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
