import { assetUrl } from './assets.js';

export const SKILLS = [
  {
    id: 'sword',
    name: '鑽石劍',
    icon: assetUrl('assets/kenney/items/sword_diamond.png'),
    kind: 'attack',
  },
  {
    id: 'punch',
    name: '橡膠拳',
    icon: assetUrl('assets/kenney/skills/rubber_punch.png'),
    kind: 'attack',
  },
  {
    id: 'dirt',
    name: '泥土方塊',
    icon: assetUrl('assets/kenney/tiles/dirt.png'),
    kind: 'block',
    blockType: 'dirt',
  },
];
