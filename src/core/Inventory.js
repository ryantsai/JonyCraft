import { events } from './EventBus.js';
import { ITEMS, LOOT_TABLES } from '../config/items.js';
import { MOVE_SPEED, PLAYER_MAX_HP, WORLD_SIZE_X, WORLD_SIZE_Z } from '../config/constants.js';

const MAX_HOTBAR_SLOTS = 9;

/**
 * Inventory system. Manages the player's bag of collected items,
 * hotbar equipping, consumable use, and buff timers.
 */
export class Inventory {
  constructor(gameState, world) {
    this.state = gameState;
    this.world = world;
    this.enemyManager = null;
    this._lastSyncVersion = 0;
    this._syncVersion = 0;

    // Bag: array of { itemId, uses } — all collected items
    this.bag = [];

    // Active buffs: { effectKey: { remaining, value, originalValue } }
    this.buffs = {};
  }

  setEnemyManager(em) {
    this.enemyManager = em;
  }

  init() {
    events.on('enemy:killed', ({ enemy }) => this._rollLoot(enemy));
    events.on('player:died', () => this._onPlayerDied());
  }

  /** Add an item to the bag. quantity = number of separate stacks. */
  addItem(itemId, quantity = 1) {
    const def = ITEMS[itemId];
    if (!def) return;
    for (let i = 0; i < quantity; i++) {
      this.bag.push({ itemId, uses: def.maxUses ?? Infinity });
    }
    this._syncVersion++;
    events.emit('inventory:changed');
    events.emit('status:message', `獲得 ${def.name}${quantity > 1 ? ` ×${quantity}` : ''}`);
  }

  /** Remove a bag entry by index. */
  removeFromBag(index) {
    if (index < 0 || index >= this.bag.length) return;
    this.bag.splice(index, 1);
    this._syncVersion++;
    events.emit('inventory:changed');
  }

  /**
   * Equip a bag item to the hotbar. Adds it as an entry in activeSkills.
   * Returns true if equipped.
   */
  equipToHotbar(bagIndex) {
    if (bagIndex < 0 || bagIndex >= this.bag.length) return false;
    if (this.state.activeSkills.length >= MAX_HOTBAR_SLOTS) return false;

    const entry = this.bag[bagIndex];
    const def = ITEMS[entry.itemId];
    if (!def) return false;

    // Passive items stay in bag, don't go to hotbar
    if (def.kind === 'passive') return false;

    // Build a hotbar-compatible skill object from the item
    const hotbarEntry = this._makeHotbarEntry(entry, def);
    this.state.activeSkills.push(hotbarEntry);
    this.bag.splice(bagIndex, 1);
    this._syncVersion++;
    events.emit('inventory:changed');
    events.emit('hotbar:rebuild');
    return true;
  }

  /**
   * Unequip a hotbar item back to the bag.
   * Only works for items (not fruit skills).
   */
  unequipFromHotbar(hotbarIndex) {
    const skill = this.state.activeSkills[hotbarIndex];
    if (!skill || !skill._itemId) return false;

    // Put back into bag
    this.bag.push({ itemId: skill._itemId, uses: skill._uses ?? Infinity });
    this.state.activeSkills.splice(hotbarIndex, 1);

    // Fix selectedIndex if needed
    if (this.state.selectedIndex >= this.state.activeSkills.length) {
      this.state.selectedIndex = Math.max(0, this.state.activeSkills.length - 1);
    }

    this._syncVersion++;
    events.emit('inventory:changed');
    events.emit('hotbar:rebuild');
    return true;
  }

  /** Use the currently selected hotbar item if it's a consumable. */
  useSelected() {
    const skill = this.state.activeSkills[this.state.selectedIndex];
    if (!skill || !skill._itemId) return false;

    const def = ITEMS[skill._itemId];
    if (!def || def.kind !== 'consumable') return false;

    // Check uses
    if (skill._uses !== undefined && skill._uses <= 0) return false;

    const success = this._applyEffect(def);
    if (!success) return false;

    // Decrement uses
    if (skill._uses !== undefined) {
      skill._uses -= 1;
      if (skill._uses <= 0) {
        // Remove from hotbar
        this.state.activeSkills.splice(this.state.selectedIndex, 1);
        if (this.state.selectedIndex >= this.state.activeSkills.length) {
          this.state.selectedIndex = Math.max(0, this.state.activeSkills.length - 1);
        }
      }
    }

    events.emit('inventory:changed');
    events.emit('hotbar:rebuild');
    events.emit('hud:update');
    events.emit('sound:click');
    return true;
  }

  /** Update buff timers each frame. */
  update(dt) {
    for (const key of Object.keys(this.buffs)) {
      const buff = this.buffs[key];
      buff.remaining -= dt;
      if (buff.remaining <= 0) {
        this._removeBuff(key, buff);
        delete this.buffs[key];
      }
    }
  }

  // ── Multiplayer sync ──

  /**
   * Serialize inventory state for the multiplayer snapshot.
   * Returns null if nothing changed since last call.
   */
  snapshotForSync() {
    const bagData = this.bag.map((e) => ({ id: e.itemId, u: e.uses }));
    const hotbarItems = this.state.activeSkills
      .filter((s) => s._itemId)
      .map((s) => ({ id: s._itemId, u: s._uses ?? -1 }));
    return {
      bag: bagData,
      hotbar: hotbarItems,
      ver: this._syncVersion,
    };
  }

  /**
   * Restore inventory from server-synced state.
   * Called on reconnect or first sync to restore persisted inventory.
   * Only restores when local inventory is empty (first load / reconnect).
   */
  restoreFromSync(data) {
    if (!data || typeof data !== 'object') return;
    const serverVer = data.ver ?? 0;
    // Skip if we already have local state that's been modified
    if (this._syncVersion > 0 && serverVer <= this._syncVersion) return;
    // Skip if we already applied this version
    if (serverVer <= this._lastSyncVersion) return;
    this._lastSyncVersion = serverVer;

    // Restore bag
    if (Array.isArray(data.bag)) {
      this.bag = data.bag
        .filter((e) => e && ITEMS[e.id])
        .map((e) => ({ itemId: e.id, uses: e.u ?? ITEMS[e.id].maxUses ?? Infinity }));
    }

    // Restore hotbar items (append to activeSkills after fruit skills)
    if (Array.isArray(data.hotbar)) {
      // Remove existing item entries from hotbar
      this.state.activeSkills = this.state.activeSkills.filter((s) => !s._itemId);
      data.hotbar.forEach((e) => {
        if (!e || !ITEMS[e.id]) return;
        if (this.state.activeSkills.length >= MAX_HOTBAR_SLOTS) return;
        const def = ITEMS[e.id];
        const entry = { itemId: e.id, uses: e.u === -1 ? Infinity : (e.u ?? def.maxUses ?? Infinity) };
        this.state.activeSkills.push(this._makeHotbarEntry(entry, def));
      });
    }

    // Sync our version to match
    this._syncVersion = serverVer;
    events.emit('inventory:changed');
    events.emit('hotbar:rebuild');
  }

  // ── Internal ──

  _makeHotbarEntry(entry, def) {
    if (def.kind === 'weapon') {
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        kind: 'attack',
        weaponType: def.weaponType,
        range: def.range,
        swingMs: def.swingMs,
        cooldownMs: def.cooldownMs,
        knockback: def.knockback,
        damage: def.damage,
        particleColor: def.particleColor,
        particleCount: def.particleCount,
        _itemId: def.id,
        _uses: Infinity,
      };
    }

    // Consumable
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      kind: 'consumable',
      _itemId: def.id,
      _uses: entry.uses,
      _maxUses: def.maxUses,
    };
  }

  _applyEffect(def) {
    const player = this.state.player;
    switch (def.effect) {
      case 'heal': {
        if (player.hp >= player.maxHp) return false;
        player.hp = Math.min(player.maxHp, player.hp + def.effectValue);
        events.emit('status:message', `恢復了 ${def.effectValue} 生命值`);
        return true;
      }
      case 'buff_attack': {
        if (this.buffs.attack) this._removeBuff('attack', this.buffs.attack);
        const orig = player.baseAttack;
        player.baseAttack = Math.round(player.baseAttack * def.effectValue);
        this.buffs.attack = { remaining: def.effectDuration, value: player.baseAttack, originalValue: orig };
        events.emit('status:message', `攻擊力提升 ${def.effectDuration} 秒`);
        return true;
      }
      case 'buff_speed': {
        if (this.buffs.speed) this._removeBuff('speed', this.buffs.speed);
        const orig = player.speed;
        player.speed = MOVE_SPEED * def.effectValue;
        this.buffs.speed = { remaining: def.effectDuration, value: player.speed, originalValue: orig };
        events.emit('status:message', `速度提升 ${def.effectDuration} 秒`);
        return true;
      }
      case 'buff_defense': {
        if (this.buffs.defense) this._removeBuff('defense', this.buffs.defense);
        const orig = player.baseDefense;
        player.baseDefense += def.effectValue;
        this.buffs.defense = { remaining: def.effectDuration, addedValue: def.effectValue, originalValue: orig };
        events.emit('status:message', `防禦力 +${def.effectValue}，持續 ${def.effectDuration} 秒`);
        return true;
      }
      case 'aoe_damage': {
        if (!this.enemyManager) return false;
        const pos = player.position;
        let hitCount = 0;
        this.enemyManager.getAlive().forEach((enemy) => {
          const dx = enemy.root.position.x - pos.x;
          const dz = enemy.root.position.z - pos.z;
          if (dx * dx + dz * dz < def.effectRadius * def.effectRadius) {
            enemy.health -= def.effectValue;
            enemy.hitFlash = 1;
            hitCount++;
            if (enemy.health <= 0) {
              this.enemyManager.defeat(enemy, { source: 'player' });
            }
          }
        });
        events.emit('status:message', `爆裂彈命中 ${hitCount} 個敵人`);
        events.emit('sound:hit');
        return true;
      }
      case 'teleport': {
        for (let attempt = 0; attempt < 20; attempt++) {
          const x = 2 + Math.random() * (WORLD_SIZE_X - 4);
          const z = 2 + Math.random() * (WORLD_SIZE_Z - 4);
          const y = this.world.getTerrainSurfaceY(x, z);
          const block = this.world.getBlock(Math.floor(x), Math.floor(y - 1), Math.floor(z));
          if (block === 'water') continue;
          player.position.set(x, y + 0.01, z);
          player.velocity.set(0, 0, 0);
          events.emit('status:message', '傳送完成');
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  _removeBuff(key, buff) {
    const player = this.state.player;
    if (key === 'attack') player.baseAttack = buff.originalValue;
    if (key === 'speed') player.speed = buff.originalValue;
    if (key === 'defense') player.baseDefense = buff.originalValue;
    events.emit('status:message', `效果結束`);
  }

  _rollLoot(enemy) {
    // No drops in homeland mode (items come from shop instead)
    if (this.state.defense.enabled || this.state.gameMode === 'homeland') return;

    const typeKey = enemy.type;
    const table = LOOT_TABLES[typeKey];
    if (!table) return;

    table.forEach(({ itemId, chance, quantity }) => {
      if (Math.random() >= chance) return;
      const q = Array.isArray(quantity)
        ? Math.floor(Math.random() * (quantity[1] - quantity[0] + 1)) + quantity[0]
        : quantity;
      this.addItem(itemId, q);
    });
  }

  _onPlayerDied() {
    // Check for revival cross in bag (passive auto-revive)
    const reviveIdx = this.bag.findIndex(
      (e) => ITEMS[e.itemId]?.effect === 'auto_revive' && e.uses > 0,
    );
    if (reviveIdx >= 0) {
      const entry = this.bag[reviveIdx];
      entry.uses -= 1;
      if (entry.uses <= 0) this.bag.splice(reviveIdx, 1);
      this.state.player.hp = Math.floor(this.state.player.maxHp * 0.5);
      events.emit('status:message', '復活十字發動！');
      events.emit('inventory:changed');
      events.emit('hud:update');
    }
  }
}
