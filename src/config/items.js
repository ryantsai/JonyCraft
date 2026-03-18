import { assetUrl } from './assets.js';

/**
 * Item definitions for the inventory system.
 *
 * kind:
 *   'consumable' – finite uses, triggers an effect when used
 *   'weapon'     – equippable to hotbar, acts like an attack skill
 *   'passive'    – sits in inventory, auto-triggers its effect
 *
 * For consumables:
 *   maxUses   – total uses when first obtained
 *   effect    – effect key handled by the inventory system
 *
 * For weapons:
 *   Shares the same shape as skill objects (range, damage, cooldownMs, etc.)
 */

export const ITEMS = {
  // ── Consumables ──
  potion_hp: {
    id: 'potion_hp',
    name: '生命藥水',
    desc: '恢復 30 生命值',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 3,
    effect: 'heal',
    effectValue: 30,
    rarity: 'common',
    color: '#ff6b6b',
  },
  potion_hp_large: {
    id: 'potion_hp_large',
    name: '大生命藥水',
    desc: '恢復 60 生命值',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 2,
    effect: 'heal',
    effectValue: 60,
    rarity: 'rare',
    color: '#ff3333',
  },
  crystal_power: {
    id: 'crystal_power',
    name: '力量結晶',
    desc: '攻擊力 ×2，持續 10 秒',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 2,
    effect: 'buff_attack',
    effectValue: 2,
    effectDuration: 10,
    rarity: 'rare',
    color: '#ff4444',
  },
  feather_swift: {
    id: 'feather_swift',
    name: '疾風羽毛',
    desc: '移動速度 +80%，持續 10 秒',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 3,
    effect: 'buff_speed',
    effectValue: 1.8,
    effectDuration: 10,
    rarity: 'common',
    color: '#6ec6ff',
  },
  blast_orb: {
    id: 'blast_orb',
    name: '爆裂彈',
    desc: '對周圍敵人造成 8 點傷害',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 3,
    effect: 'aoe_damage',
    effectValue: 8,
    effectRadius: 5,
    rarity: 'rare',
    color: '#ff6b35',
  },
  shield_scroll: {
    id: 'shield_scroll',
    name: '護盾卷軸',
    desc: '防禦力 +5，持續 20 秒',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 1,
    effect: 'buff_defense',
    effectValue: 5,
    effectDuration: 20,
    rarity: 'epic',
    color: '#6ec6ff',
  },
  teleport_stone: {
    id: 'teleport_stone',
    name: '傳送石',
    desc: '隨機傳送到安全位置',
    icon: assetUrl('assets/kenney/items/star.png'),
    kind: 'consumable',
    maxUses: 5,
    effect: 'teleport',
    rarity: 'common',
    color: '#b080ff',
  },
  revival_cross: {
    id: 'revival_cross',
    name: '復活十字',
    desc: '死亡時自動復活（被動）',
    icon: assetUrl('assets/kenney/items/trophy.png'),
    kind: 'passive',
    maxUses: 1,
    effect: 'auto_revive',
    rarity: 'legendary',
    color: '#ffd966',
  },

  // ── Weapons (equippable, infinite uses) ──
  hammer_diamond: {
    id: 'hammer_diamond',
    name: '鑽石戰錘',
    desc: '緩慢但傷害極高的重武器',
    icon: assetUrl('assets/kenney/items/hammer_diamond.png'),
    kind: 'weapon',
    weaponType: 'slam',
    range: 2.5,
    swingMs: 500,
    cooldownMs: 800,
    knockback: 12.0,
    damage: 5,
    particleColor: 'white',
    particleCount: 20,
    rarity: 'epic',
    color: '#6ec6ff',
  },
  spear_diamond: {
    id: 'spear_diamond',
    name: '鑽石長矛',
    desc: '超長攻擊距離的刺擊武器',
    icon: assetUrl('assets/kenney/items/spear.png'),
    kind: 'weapon',
    weaponType: 'sword',
    range: 7.0,
    swingMs: 320,
    cooldownMs: 500,
    knockback: 6.0,
    damage: 2,
    particleColor: 'cyan',
    particleCount: 12,
    rarity: 'rare',
    color: '#6ec6ff',
  },
  flail_diamond: {
    id: 'flail_diamond',
    name: '鑽石連枷',
    desc: '中距離揮擊，擊退效果極佳',
    icon: assetUrl('assets/kenney/items/flail_diamond.png'),
    kind: 'weapon',
    weaponType: 'punch',
    range: 4.5,
    swingMs: 340,
    cooldownMs: 550,
    knockback: 10.0,
    damage: 3,
    particleColor: 'yellow',
    particleCount: 16,
    rarity: 'rare',
    color: '#ffd966',
  },
  bow_hunter: {
    id: 'bow_hunter',
    name: '獵人之弓',
    desc: '遠距離精準射擊',
    icon: assetUrl('assets/kenney/items/bow.png'),
    kind: 'weapon',
    weaponType: 'cast',
    range: 10.0,
    swingMs: 400,
    cooldownMs: 700,
    knockback: 4.0,
    damage: 3,
    particleColor: 'white',
    particleCount: 10,
    rarity: 'epic',
    color: '#c0a030',
  },
};

/**
 * Loot tables per enemy type.
 * Each entry: { itemId, chance (0-1), quantity: number | [min, max] }
 */
export const LOOT_TABLES = {
  zombie:    [
    { itemId: 'potion_hp', chance: 0.25, quantity: 1 },
    { itemId: 'feather_swift', chance: 0.08, quantity: 1 },
  ],
  skeleton:  [
    { itemId: 'potion_hp', chance: 0.20, quantity: 1 },
    { itemId: 'bow_hunter', chance: 0.03, quantity: 1 },
  ],
  slime:     [
    { itemId: 'potion_hp', chance: 0.30, quantity: 1 },
    { itemId: 'shield_scroll', chance: 0.05, quantity: 1 },
  ],
  giant:     [
    { itemId: 'potion_hp_large', chance: 0.30, quantity: 1 },
    { itemId: 'hammer_diamond', chance: 0.06, quantity: 1 },
    { itemId: 'crystal_power', chance: 0.12, quantity: 1 },
  ],
  spider:    [
    { itemId: 'feather_swift', chance: 0.15, quantity: 1 },
    { itemId: 'teleport_stone', chance: 0.08, quantity: 1 },
  ],
  ghost:     [
    { itemId: 'teleport_stone', chance: 0.15, quantity: 1 },
    { itemId: 'shield_scroll', chance: 0.06, quantity: 1 },
  ],
  creeper:   [
    { itemId: 'blast_orb', chance: 0.25, quantity: 1 },
    { itemId: 'potion_hp', chance: 0.15, quantity: 1 },
  ],
  wizard:    [
    { itemId: 'crystal_power', chance: 0.15, quantity: 1 },
    { itemId: 'revival_cross', chance: 0.02, quantity: 1 },
  ],
  golem:     [
    { itemId: 'potion_hp_large', chance: 0.25, quantity: 1 },
    { itemId: 'shield_scroll', chance: 0.10, quantity: 1 },
    { itemId: 'flail_diamond', chance: 0.05, quantity: 1 },
  ],
  ninja:     [
    { itemId: 'feather_swift', chance: 0.20, quantity: 1 },
    { itemId: 'spear_diamond', chance: 0.04, quantity: 1 },
  ],
  blaze:     [
    { itemId: 'blast_orb', chance: 0.18, quantity: 1 },
    { itemId: 'crystal_power', chance: 0.10, quantity: 1 },
  ],
};

/** All item IDs for debug menu */
export const ALL_ITEM_IDS = Object.keys(ITEMS);

/** Rarity display info */
export const RARITY_COLORS = {
  common: '#b0b0b0',
  rare: '#6ec6ff',
  epic: '#b080ff',
  legendary: '#ffd966',
};
