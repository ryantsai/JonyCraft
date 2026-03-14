import { assetUrl } from './assets.js';
import {
  SWORD_RANGE, SWORD_SWING_MS, SWORD_COOLDOWN_MS,
  PUNCH_RANGE, PUNCH_SWING_MS, PUNCH_COOLDOWN_MS,
} from './constants.js';

/**
 * Default skills (used before a fruit is selected).
 * Once a fruit is chosen, GameState.activeSkills replaces these.
 * All attack skills have the same shape as fruit skills for unified combat path.
 */
export const DEFAULT_SKILLS = [
  {
    id: 'sword',
    name: '鑽石劍',
    icon: assetUrl('assets/kenney/items/sword_diamond.png'),
    kind: 'attack',
    weaponType: 'sword',
    range: SWORD_RANGE,
    swingMs: SWORD_SWING_MS,
    cooldownMs: SWORD_COOLDOWN_MS,
    knockback: 4.6,
    damage: 1,
    particleColor: 'red',
    particleCount: 12,
  },
  {
    id: 'punch',
    name: '橡膠拳',
    icon: assetUrl('assets/kenney/skills/rubber_punch.png'),
    kind: 'attack',
    weaponType: 'punch',
    range: PUNCH_RANGE,
    swingMs: PUNCH_SWING_MS,
    cooldownMs: PUNCH_COOLDOWN_MS,
    knockback: 7.4,
    damage: 1,
    particleColor: 'white',
    particleCount: 14,
  },
  {
    id: 'dirt',
    name: '泥土方塊',
    icon: assetUrl('assets/kenney/tiles/dirt.png'),
    kind: 'block',
    blockType: 'dirt',
    weaponType: 'dirt',
  },
];

// Kept for backward-compat; old code imports SKILLS
export const SKILLS = DEFAULT_SKILLS;
