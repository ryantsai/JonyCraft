/**
 * Player skin definitions.
 * All skins share a single GLB model (character-a) with different textures.
 */
export const CHARACTER_MODEL = 'assets/kenney/characters/character-a.glb';

export const SKINS = [
  { id: 'a', name: '冒險者',   texture: 'assets/kenney/characters/textures/texture-a.png', color: '#8d6e4a' },
  { id: 'b', name: '球員',     texture: 'assets/kenney/characters/textures/texture-b.png', color: '#ef5350' },
  { id: 'c', name: '玩家',     texture: 'assets/kenney/characters/textures/texture-c.png', color: '#66bb6a' },
  { id: 'd', name: '機器人',   texture: 'assets/kenney/characters/textures/texture-d.png', color: '#ffc107' },
  { id: 'e', name: '女巫',     texture: 'assets/kenney/characters/textures/texture-e.png', color: '#ab47bc' },
  { id: 'f', name: '精靈',     texture: 'assets/kenney/characters/textures/texture-f.png', color: '#26a69a' },
  { id: 'g', name: '機甲',     texture: 'assets/kenney/characters/textures/texture-g.png', color: '#78909c' },
  { id: 'h', name: '紫兔',     texture: 'assets/kenney/characters/textures/texture-h.png', color: '#7e57c2' },
  { id: 'i', name: '科學家',   texture: 'assets/kenney/characters/textures/texture-i.png', color: '#90caf9' },
  { id: 'j', name: '警察',     texture: 'assets/kenney/characters/textures/texture-j.png', color: '#3949ab' },
  { id: 'k', name: '牛仔',     texture: 'assets/kenney/characters/textures/texture-k.png', color: '#d84315' },
  { id: 'l', name: '殭屍',     texture: 'assets/kenney/characters/textures/texture-l.png', color: '#4caf50' },
  { id: 'm', name: '獵人',     texture: 'assets/kenney/characters/textures/texture-m.png', color: '#558b2f' },
  { id: 'n', name: '花魁',     texture: 'assets/kenney/characters/textures/texture-n.png', color: '#26c6da' },
  { id: 'o', name: '半獸人',   texture: 'assets/kenney/characters/textures/texture-o.png', color: '#00897b' },
  { id: 'p', name: '海盜',     texture: 'assets/kenney/characters/textures/texture-p.png', color: '#5c6bc0' },
  { id: 'q', name: '特務',     texture: 'assets/kenney/characters/textures/texture-q.png', color: '#455a64' },
  { id: 'r', name: '忍者',     texture: 'assets/kenney/characters/textures/texture-r.png', color: '#546e7a' },
];

export const DEFAULT_SKIN = SKINS[0];
