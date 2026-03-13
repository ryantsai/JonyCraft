import { assetUrl } from './assets.js';

/**
 * Default skills (used before a fruit is selected).
 * Once a fruit is chosen, GameState.activeSkills replaces these.
 */
export const DEFAULT_SKILLS = [
  {
    id: 'sword',
    name: '鑽石劍',
    icon: assetUrl('assets/kenney/items/sword_diamond.png'),
    kind: 'attack',
    weaponType: 'sword',
  },
  {
    id: 'punch',
    name: '橡膠拳',
    icon: assetUrl('assets/kenney/skills/rubber_punch.png'),
    kind: 'attack',
    weaponType: 'punch',
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
