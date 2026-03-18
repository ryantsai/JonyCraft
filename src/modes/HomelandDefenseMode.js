import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { SPAWN_TABLE } from '../config/enemyTypes.js';
import { events } from '../core/EventBus.js';
import { GameMode } from './GameMode.js';
import { updateTowerHealthBar, buildFortress, buildTowerCollision, buildTowerVisual, buildMerchantNPC } from './DefenseUtils.js';
import { SHOP_ITEMS, MERCHANT_INTERACT_RANGE } from '../config/shopItems.js';
import { CannonTowerSystem } from './CannonTowerSystem.js';

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
  constructor(gameState, world, enemyManager, scene, projectileSystem) {
    super();
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
    this.towerHealthBar = null;
    this._unsubs = [];
    this.merchantNPC = null;
    this.merchantPos = null;
    this.inventory = null;
    this.cannonTowers = new CannonTowerSystem(gameState, world, scene, enemyManager, projectileSystem);
  }

  setInventory(inventory) {
    this.inventory = inventory;
    this.cannonTowers.setInventory(inventory);
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
    this.state.defense.turrets = [];
    this.cannonTowers.clear();
    buildFortress(this.world, this.center.x, this.center.z);
    buildTowerCollision(this.world, this.center.x, this.center.z);
    this._buildTowerVisual();
    this._buildMerchant();
    this.startNextWave();

    this._unsubs.push(
      events.on('enemy:killed', ({ enemy }) => this._onEnemyKilled(enemy)),
      events.on('merchant:interact', () => this._onMerchantInteract()),
      events.on('merchant:purchase', ({ shopItem }) => this._purchaseShopItem(shopItem)),
    );
  }

  deactivate() {
    this._unsubs.forEach(unsub => unsub());
    this._unsubs = [];
    this.cannonTowers.clear();
  }

  update(dt) {
    if (!this.state.defense.enabled || this.state.mode !== 'playing' || this.state.defense.towerHp <= 0) return;

    this.state.defense.timeLeft = Math.max(0, this.state.defense.timeLeft - dt);

    const alive = this.enemies.getAlive().length;
    if (alive === 0 || this.state.defense.timeLeft <= 0) {
      this.startNextWave();
    }

    this.cannonTowers.update(dt);
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
    const result = buildTowerVisual({
      world: this.world,
      scene: this.scene,
      center: this.center,
      defense: this.state.defense,
    });
    this.towerMesh = result.towerMesh;
    this.towerHealthBar = result.towerHealthBar;
    this.cannonTowers.setHomeTowerMesh(this.towerMesh);
  }

  _onEnemyKilled(enemy) {
    if (!this.state.defense.enabled) return;
    this.state.defense.totalKills += 1;
    const gold = Math.max(1, Math.ceil(computeToughness(enemy) * 0.8));
    this.state.defense.totalGold += gold;
  }

  _buildMerchant() {
    if (this.merchantNPC) return;
    const result = buildMerchantNPC(this.scene, this.world, this.center.x, this.center.z);
    this.merchantNPC = result.group;
    this.merchantPos = result.position;
    this.cannonTowers.setMerchantPosition(this.merchantPos);
  }

  _isNearMerchant() {
    if (!this.merchantPos) return false;
    const p = this.state.player.position;
    const dx = p.x - this.merchantPos.x;
    const dz = p.z - this.merchantPos.z;
    return dx * dx + dz * dz < MERCHANT_INTERACT_RANGE * MERCHANT_INTERACT_RANGE;
  }

  _onMerchantInteract() {
    if (!this.state.defense.enabled) return;
    if (!this._isNearMerchant()) {
      events.emit('status:message', '離商人太遠了');
      return;
    }
    events.emit('merchant:open');
  }

  _purchaseShopItem(shopItem) {
    if (!this.state.defense.enabled) return;
    const item = SHOP_ITEMS.find(candidate => candidate.id === shopItem?.id);
    if (!item) {
      events.emit('status:message', '商店道具資料錯誤');
      return;
    }
    if (this.state.defense.totalGold < item.cost) {
      events.emit('status:message', '金幣不足');
      return;
    }
    this.state.defense.totalGold -= item.cost;

    // Service effects
    if (item.effect === 'heal') {
      this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + item.effectValue);
      events.emit('status:message', `恢復了 ${item.effectValue} 生命值`);
    } else if (item.effect === 'repair_tower') {
      this.state.defense.towerHp = Math.min(this.state.defense.towerMaxHp, this.state.defense.towerHp + item.effectValue);
      events.emit('status:message', `修復守護塔 ${item.effectValue} HP`);
    } else if (item.giveItemId) {
      // Give item to inventory
      if (this.inventory) {
        this.inventory.addItem(item.giveItemId, 1);
      }
    }
    events.emit('sound:click');
    events.emit('hud:update');
    events.emit('merchant:refreshShop');
  }

  tryPlaceDeployable(skill) {
    if (skill?.deployableType !== 'cannon_tower') return false;
    return this.cannonTowers.tryPlaceSelectedTower();
  }
}
