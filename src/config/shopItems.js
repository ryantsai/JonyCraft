import { assetUrl } from './assets.js';

/**
 * Merchant shop items available in Homeland Defense mode.
 * Players interact with the merchant NPC (press E) to buy these with gold.
 */
export const SHOP_ITEMS = [
  // ── Services ──
  {
    id: 'heal',
    name: '治療',
    desc: '恢復 45 生命值',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 15,
    category: 'service',
    effect: 'heal',
    effectValue: 45,
  },
  {
    id: 'tower',
    name: '修復塔',
    desc: '修復守護塔 80 HP',
    icon: assetUrl('assets/kenney/items/trophy.png'),
    cost: 25,
    category: 'service',
    effect: 'repair_tower',
    effectValue: 80,
  },
  {
    id: 'buy_cannon_tower',
    name: '加農砲塔',
    desc: '購買後放入背包，可裝備到技能欄後自行放置',
    icon: assetUrl('assets/kenney/items/spear.png'),
    cost: 40,
    category: 'item',
    giveItemId: 'cannon_tower',
  },

  // ── Consumable items (added to inventory) ──
  {
    id: 'buy_potion_hp',
    name: '生命藥水',
    desc: '購買後放入背包，可恢復 30 HP（3次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 20,
    category: 'item',
    giveItemId: 'potion_hp',
  },
  {
    id: 'buy_potion_hp_large',
    name: '大生命藥水',
    desc: '購買後放入背包，可恢復 60 HP（2次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 40,
    category: 'item',
    giveItemId: 'potion_hp_large',
  },
  {
    id: 'buy_crystal_power',
    name: '力量結晶',
    desc: '購買後放入背包，攻擊力 ×2 持續 10 秒（2次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 35,
    category: 'item',
    giveItemId: 'crystal_power',
  },
  {
    id: 'buy_feather_swift',
    name: '疾風羽毛',
    desc: '購買後放入背包，速度 +80% 持續 10 秒（3次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 25,
    category: 'item',
    giveItemId: 'feather_swift',
  },
  {
    id: 'buy_blast_orb',
    name: '爆裂彈',
    desc: '購買後放入背包，對周圍敵人造成 8 傷害（3次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 30,
    category: 'item',
    giveItemId: 'blast_orb',
  },
  {
    id: 'buy_shield_scroll',
    name: '護盾卷軸',
    desc: '購買後放入背包，防禦 +5 持續 20 秒（1次）',
    icon: assetUrl('assets/kenney/items/star.png'),
    cost: 45,
    category: 'item',
    giveItemId: 'shield_scroll',
  },

  // ── Weapons (added to inventory) ──
  {
    id: 'buy_hammer',
    name: '鑽石戰錘',
    desc: '購買後放入背包，緩慢但傷害極高',
    icon: assetUrl('assets/kenney/items/hammer_diamond.png'),
    cost: 80,
    category: 'item',
    giveItemId: 'hammer_diamond',
  },
  {
    id: 'buy_spear',
    name: '鑽石長矛',
    desc: '購買後放入背包，超長攻擊距離',
    icon: assetUrl('assets/kenney/items/spear.png'),
    cost: 60,
    category: 'item',
    giveItemId: 'spear_diamond',
  },
  {
    id: 'buy_bow',
    name: '獵人之弓',
    desc: '購買後放入背包，遠距精準射擊',
    icon: assetUrl('assets/kenney/items/bow.png'),
    cost: 70,
    category: 'item',
    giveItemId: 'bow_hunter',
  },
];

export const MERCHANT_INTERACT_RANGE = 4.0;
