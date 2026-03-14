import { assetUrl } from './assets.js';

export const BLOCK_DEFS = {
  grass: {
    name: '草地',
    icon: assetUrl('assets/kenney/tiles/grass_top.png'),
    faces: {
      side: assetUrl('assets/kenney/tiles/dirt_grass.png'),
      top: assetUrl('assets/kenney/tiles/grass_top.png'),
      bottom: assetUrl('assets/kenney/tiles/dirt.png'),
    },
    collides: true,
  },
  dirt: {
    name: '泥土',
    icon: assetUrl('assets/kenney/tiles/dirt.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/dirt.png'),
    },
    collides: true,
  },
  stone: {
    name: '石頭',
    icon: assetUrl('assets/kenney/tiles/stone.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/stone.png'),
    },
    collides: true,
  },
  sand: {
    name: '沙子',
    icon: assetUrl('assets/kenney/tiles/sand.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/sand.png'),
    },
    collides: true,
  },
  wood: {
    name: '木頭',
    icon: assetUrl('assets/kenney/tiles/trunk_side.png'),
    faces: {
      side: assetUrl('assets/kenney/tiles/trunk_side.png'),
      top: assetUrl('assets/kenney/tiles/trunk_top.png'),
      bottom: assetUrl('assets/kenney/tiles/trunk_top.png'),
    },
    collides: true,
  },
  leaves: {
    name: '樹葉',
    icon: assetUrl('assets/kenney/tiles/leaves_transparent.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/leaves_transparent.png'),
    },
    collides: true,
    transparent: true,
    alphaTest: 0.25,
  },
  brick: {
    name: '磚塊',
    icon: assetUrl('assets/kenney/tiles/brick_red.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/brick_red.png'),
    },
    collides: true,
  },
  barrier: {
    name: '屏障',
    collides: true,
    invisible: true,
  },
  water: {
    name: '水',
    icon: assetUrl('assets/kenney/tiles/water.png'),
    faces: {
      all: assetUrl('assets/kenney/tiles/water.png'),
    },
    collides: false,
    transparent: true,
    opacity: 0.78,
  },
};
