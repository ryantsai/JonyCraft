import * as THREE from 'three';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';
import { events } from '../core/EventBus.js';
import { updateTowerHealthBar, buildFortress, buildTowerVisual, buildMerchantNPC } from './DefenseUtils.js';
import { SHOP_ITEMS, MERCHANT_INTERACT_RANGE } from '../config/shopItems.js';
import { CannonTowerSystem } from './CannonTowerSystem.js';

export class MultiplayerHomelandMode {
  constructor(gameState, world, enemyManager, scene, multiplayerClient, projectileSystem, remotePlayers) {
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.scene = scene;
    this.multiplayer = multiplayerClient;

    this.center = new THREE.Vector3(WORLD_SIZE_X / 2, 0, WORLD_SIZE_Z / 2);
    this.towerMesh = null;
    this.towerHealthBar = null;
    this._unsubs = [];
    this.merchantNPC = null;
    this.merchantPos = null;
    this.inventory = null;
    this.cannonTowers = new CannonTowerSystem(gameState, world, scene, enemyManager, projectileSystem, remotePlayers);
  }

  setInventory(inventory) {
    this.inventory = inventory;
    this.cannonTowers.setInventory(inventory);
  }

  activate() {
    this.state.defense.enabled = true;
    this.state.defense.remoteAuthoritative = true;
    this.state.defense.status = 'waiting';
    this.state.defense.turrets = [];
    this.cannonTowers.clear();
    this._buildFortress();
    this._buildTowerVisual();
    this._buildMerchant();
    if (this._unsubs.length === 0) {
      this._unsubs.push(
        events.on('merchant:interact', () => this._onMerchantInteract()),
        events.on('merchant:purchase', ({ shopItem }) => this._purchaseShopItem(shopItem)),
      );
    }
  }

  deactivate() {
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
    this.cannonTowers.clear();
    if (this.towerMesh) {
      this.scene.enemyGroup.remove(this.towerMesh);
      this.towerMesh = null;
    }
    if (this.towerHealthBar) {
      this.scene.enemyGroup.remove(this.towerHealthBar);
      this.towerHealthBar = null;
    }
    if (this.merchantNPC) {
      this.scene.enemyGroup.remove(this.merchantNPC);
      this.merchantNPC = null;
      this.merchantPos = null;
    }
  }

  update(dt) {
    if (!this.state.defense.enabled) return;
    this.cannonTowers.update(dt, { remoteAuthoritative: true });
    updateTowerHealthBar(this.towerHealthBar, this.state.defense.towerHp, this.state.defense.towerMaxHp);
  }

  getDefenseTarget() {
    return this.center;
  }

  applyServerState(defenseState) {
    if (!defenseState) return;
    this.state.defense.enabled = true;
    this.state.defense.remoteAuthoritative = true;
    this.state.defense.wave = defenseState.wave ?? this.state.defense.wave;
    this.state.defense.timeLeft = defenseState.timeLeft ?? this.state.defense.timeLeft;
    this.state.defense.totalKills = defenseState.totalKills ?? this.state.defense.totalKills;
    this.state.defense.totalGold = defenseState.totalGold ?? this.state.defense.totalGold;
    this.state.defense.towerHp = defenseState.towerHp ?? this.state.defense.towerHp;
    this.state.defense.towerMaxHp = defenseState.towerMaxHp ?? this.state.defense.towerMaxHp;
    this.state.defense.status = defenseState.status ?? this.state.defense.status;
    this.state.defense.turrets = defenseState.turrets ?? [];

    if (defenseState.center) {
      this.center.set(defenseState.center.x, defenseState.center.y, defenseState.center.z);
    }

    this._buildTowerVisual();
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
    // Send purchase to server — server deducts gold authoritatively.
    // Optimistic client-side deduction so UI feels responsive; server state
    // will overwrite on next sync via applyServerState().
    this.multiplayer.queueHomelandPurchase(item.id);
    this.state.defense.totalGold -= item.cost;

    // Service effects are applied server-side (heal HP, repair tower, turret).
    // Inventory items are client-authoritative — add immediately, synced via snapshot.
    if (item.effect === 'heal') {
      events.emit('status:message', `恢復了 ${item.effectValue} 生命值`);
    } else if (item.effect === 'repair_tower') {
      events.emit('status:message', `修復守護塔 ${item.effectValue} HP`);
    } else if (item.giveItemId) {
      if (this.inventory) {
        this.inventory.addItem(item.giveItemId, 1);
      }
    }
    events.emit('sound:click');
    events.emit('hud:update');
    events.emit('merchant:refreshShop');
  }

  _buildTowerVisual() {
    if (this.towerMesh) {
      this.towerMesh.position.set(this.center.x, this.center.y, this.center.z);
      if (this.towerHealthBar) {
        this.towerHealthBar.position.set(this.center.x, this.towerHealthBar.position.y, this.center.z);
      }
      return;
    }
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

  _buildFortress() {
    buildFortress(this.world, this.center.x, this.center.z);
  }

  tryPlaceDeployable(skill) {
    if (skill?.deployableType !== 'cannon_tower') return false;
    return this.cannonTowers.tryPlaceSelectedTower({
      queuePlacement: (tower) => this.multiplayer.queueHomelandPlacement(tower),
    });
  }
}
