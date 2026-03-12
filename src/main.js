import './style.css';
import * as THREE from 'three';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="shell">
    <canvas class="game-canvas" aria-label="JonyCraft voxel sandbox"></canvas>
    <div class="hud">
      <div class="crosshair" aria-hidden="true"></div>
      <div class="status-bar">
        <div id="status-message">Loading Kenney voxel assets...</div>
        <div id="status-coords"></div>
      </div>
      <div id="hotbar" class="hotbar" aria-label="Selected skills"></div>
    </div>
    <div id="start-screen" class="start-screen">
      <div class="start-panel">
        <p class="eyebrow">Three.js sandbox</p>
        <h1>JonyCraft</h1>
        <p class="lead">
          A compact Minecraft-inspired sandbox built with Kenney voxel textures.
        </p>
        <div class="control-list">
          <span><strong>Move:</strong> WASD or Arrow Up/Down</span>
          <span><strong>Jump:</strong> Space</span>
          <span><strong>Look:</strong> Mouse or Arrow Left/Right</span>
          <span><strong>Left Click:</strong> selected skill</span>
          <span><strong>Right Click:</strong> place dirt only in skill 3</span>
          <span><strong>Skills:</strong> 1 Sword, 2 Rubber Punch, 3 Dirt</span>
          <span><strong>Fullscreen:</strong> F</span>
        </div>
        <button id="start-btn" class="start-btn" type="button">Enter World</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector('.game-canvas');
const startScreen = document.querySelector('#start-screen');
const startButton = document.querySelector('#start-btn');
const hotbar = document.querySelector('#hotbar');
const statusMessage = document.querySelector('#status-message');
const statusCoords = document.querySelector('#status-coords');

const FIXED_STEP_MS = 1000 / 60;
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.32;
const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 5.2;
const JUMP_SPEED = 7.6;
const GRAVITY = 22;
const LOOK_SPEED = 0.0026;
const WORLD_SIZE_X = 56;
const WORLD_SIZE_Z = 56;
const WORLD_HEIGHT = 10;
const SEA_LEVEL = 2;
const WORLD_SEED = 17.23;
const SWORD_RANGE = 3;
const SWORD_SWING_MS = 220;
const SWORD_COOLDOWN_MS = 300;
const PUNCH_RANGE = 6.2;
const PUNCH_SWING_MS = 260;
const PUNCH_COOLDOWN_MS = 360;
const ZOMBIE_SPEED = 1.12;
const ZOMBIE_RESPAWN_MS = 4500;
const ZOMBIE_MAX_HEALTH = 3;
const INITIAL_ZOMBIE_COUNT = 5;
const HIT_PARTICLE_LIFETIME = 0.42;

const CONTROL_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const SKILLS = [
  {
    id: 'sword',
    name: 'Diamond Sword',
    icon: '/assets/kenney/items/sword_diamond.png',
    kind: 'attack',
  },
  {
    id: 'punch',
    name: 'Rubber Punch',
    icon: '/assets/kenney/skills/rubber_punch.png',
    kind: 'attack',
  },
  {
    id: 'dirt',
    name: 'Dirt Block',
    icon: '/assets/kenney/tiles/dirt.png',
    kind: 'block',
    blockType: 'dirt',
  },
];

const BLOCK_DEFS = {
  grass: {
    name: 'Grass',
    icon: '/assets/kenney/tiles/grass_top.png',
    faces: {
      side: '/assets/kenney/tiles/dirt_grass.png',
      top: '/assets/kenney/tiles/grass_top.png',
      bottom: '/assets/kenney/tiles/dirt.png',
    },
    collides: true,
  },
  dirt: {
    name: 'Dirt',
    icon: '/assets/kenney/tiles/dirt.png',
    faces: {
      all: '/assets/kenney/tiles/dirt.png',
    },
    collides: true,
  },
  stone: {
    name: 'Stone',
    icon: '/assets/kenney/tiles/stone.png',
    faces: {
      all: '/assets/kenney/tiles/stone.png',
    },
    collides: true,
  },
  sand: {
    name: 'Sand',
    icon: '/assets/kenney/tiles/sand.png',
    faces: {
      all: '/assets/kenney/tiles/sand.png',
    },
    collides: true,
  },
  wood: {
    name: 'Wood',
    icon: '/assets/kenney/tiles/trunk_side.png',
    faces: {
      side: '/assets/kenney/tiles/trunk_side.png',
      top: '/assets/kenney/tiles/trunk_top.png',
      bottom: '/assets/kenney/tiles/trunk_top.png',
    },
    collides: true,
  },
  leaves: {
    name: 'Leaves',
    icon: '/assets/kenney/tiles/leaves_transparent.png',
    faces: {
      all: '/assets/kenney/tiles/leaves_transparent.png',
    },
    collides: true,
    transparent: true,
    alphaTest: 0.25,
  },
  brick: {
    name: 'Brick',
    icon: '/assets/kenney/tiles/brick_red.png',
    faces: {
      all: '/assets/kenney/tiles/brick_red.png',
    },
    collides: true,
  },
  water: {
    name: 'Water',
    icon: '/assets/kenney/tiles/water.png',
    faces: {
      all: '/assets/kenney/tiles/water.png',
    },
    collides: false,
    transparent: true,
    opacity: 0.78,
  },
};

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ed2ff, 20, 54);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 120);
const pitchPivot = new THREE.Object3D();
const yawPivot = new THREE.Object3D();
pitchPivot.add(camera);
yawPivot.add(pitchPivot);
scene.add(yawPivot);
const heldItemPivot = new THREE.Group();
camera.add(heldItemPivot);

const ambientLight = new THREE.HemisphereLight(0xeef7ff, 0x7a684d, 1.45);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff6dd, 1.25);
sunLight.position.set(12, 22, 8);
scene.add(sunLight);

const worldGroup = new THREE.Group();
scene.add(worldGroup);
const enemyGroup = new THREE.Group();
scene.add(enemyGroup);
const particleGroup = new THREE.Group();
scene.add(particleGroup);

const textureLoader = new THREE.TextureLoader();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const waterGeometry = new THREE.BoxGeometry(1, 0.86, 1);
const planeGeometry = new THREE.PlaneGeometry(1, 1);

const keyState = new Set();

const gameState = {
  mode: 'loading',
  started: false,
  useManualClock: false,
  selectedIndex: 0,
  player: {
    position: new THREE.Vector3(WORLD_SIZE_X / 2, 8, WORLD_SIZE_Z / 2),
    velocity: new THREE.Vector3(),
    yaw: Math.PI / 4,
    pitch: -0.38,
    onGround: false,
  },
  target: null,
  enemyTarget: null,
  combat: {
    swordSwingTime: 0,
    punchTime: 0,
    cooldown: 0,
    kills: 0,
  },
};

const world = new Map();
const blockMeshes = new Map();
const raycastMeshes = [];
const blockMaterials = {};
const zombieHitboxes = [];
const enemyState = {
  zombies: [],
  respawnTimers: [],
};
const textureCache = new Map();
const hitParticles = [];
const heldSkillModels = {};

function worldKey(x, y, z) {
  return `${x},${y},${z}`;
}

function hash2D(x, z) {
  const raw = Math.sin((x + WORLD_SEED) * 12.9898 + (z - WORLD_SEED) * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function sampleHeight(x, z) {
  const waveA = Math.sin((x + WORLD_SEED) * 0.08) * 0.22;
  const waveB = Math.cos((z - WORLD_SEED * 0.8) * 0.08) * 0.2;
  const jitter = (hash2D(x, z) - 0.5) * 0.18;
  return THREE.MathUtils.clamp(Math.floor(3 + waveA + waveB + jitter), 2, 3);
}

function getBlock(x, y, z) {
  return world.get(worldKey(x, y, z)) ?? null;
}

function isInsideWorld(x, y, z) {
  return x >= 0 && x < WORLD_SIZE_X && z >= 0 && z < WORLD_SIZE_Z && y >= 0 && y < WORLD_HEIGHT;
}

function shouldRenderBlock(type, x, y, z) {
  if (type === 'water') {
    const above = getBlock(x, y + 1, z);
    return above !== 'water';
  }

  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  return neighbors.some(([dx, dy, dz]) => {
    const neighbor = getBlock(x + dx, y + dy, z + dz);
    if (!neighbor) {
      return true;
    }
    return BLOCK_DEFS[neighbor].transparent;
  });
}

function addRaycastMesh(mesh) {
  raycastMeshes.push(mesh);
}

function removeRaycastMesh(mesh) {
  const index = raycastMeshes.indexOf(mesh);
  if (index >= 0) {
    raycastMeshes.splice(index, 1);
  }
}

function syncBlockMesh(x, y, z) {
  const key = worldKey(x, y, z);
  const type = getBlock(x, y, z);
  const current = blockMeshes.get(key);

  if (!type || !shouldRenderBlock(type, x, y, z)) {
    if (current) {
      worldGroup.remove(current);
      removeRaycastMesh(current);
      current.geometry.dispose?.();
      blockMeshes.delete(key);
    }
    return;
  }

  if (current) {
    worldGroup.remove(current);
    removeRaycastMesh(current);
    current.geometry.dispose?.();
    blockMeshes.delete(key);
  }

  const geometry = type === 'water' ? waterGeometry.clone() : boxGeometry.clone();
  const material = blockMaterials[type];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x + 0.5, y + (type === 'water' ? 0.43 : 0.5), z + 0.5);
  mesh.userData = {
    x,
    y,
    z,
    type,
  };
  worldGroup.add(mesh);
  addRaycastMesh(mesh);
  blockMeshes.set(key, mesh);
}

function syncNeighborhood(x, y, z) {
  const positions = [
    [x, y, z],
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];

  positions.forEach(([px, py, pz]) => {
    if (isInsideWorld(px, py, pz)) {
      syncBlockMesh(px, py, pz);
    }
  });
}

function setBlock(x, y, z, type) {
  if (!isInsideWorld(x, y, z)) {
    return false;
  }
  world.set(worldKey(x, y, z), type);
  syncNeighborhood(x, y, z);
  return true;
}

function removeBlock(x, y, z) {
  if (!isInsideWorld(x, y, z)) {
    return false;
  }
  const key = worldKey(x, y, z);
  if (!world.has(key)) {
    return false;
  }
  world.delete(key);
  syncNeighborhood(x, y, z);
  return true;
}

function generateTree(baseX, baseY, baseZ) {
  const trunkHeight = 3 + Math.floor(hash2D(baseX + 3, baseZ + 5) * 2);
  for (let y = 1; y <= trunkHeight; y += 1) {
    world.set(worldKey(baseX, baseY + y, baseZ), 'wood');
  }

  const topY = baseY + trunkHeight;
  for (let x = -2; x <= 2; x += 1) {
    for (let y = 0; y <= 2; y += 1) {
      for (let z = -2; z <= 2; z += 1) {
        const distance = Math.abs(x) + Math.abs(z) + y;
        if (distance > 4) {
          continue;
        }
        const lx = baseX + x;
        const ly = topY + y;
        const lz = baseZ + z;
        if (!isInsideWorld(lx, ly, lz) || getBlock(lx, ly, lz)) {
          continue;
        }
        world.set(worldKey(lx, ly, lz), 'leaves');
      }
    }
  }
}

function buildWorld() {
  for (let x = 0; x < WORLD_SIZE_X; x += 1) {
    for (let z = 0; z < WORLD_SIZE_Z; z += 1) {
      const height = sampleHeight(x, z);
      const surfaceType = hash2D(x * 5, z * 7) > 0.985 ? 'sand' : 'grass';

      for (let y = 0; y <= height; y += 1) {
        let type = 'stone';
        if (y === height) {
          type = surfaceType;
        } else if (y >= height - 1) {
          type = 'dirt';
        }
        world.set(worldKey(x, y, z), type);
      }

      const treeChance = hash2D(x + 11, z + 19);
      if (
        getBlock(x, height, z) === 'grass' &&
        treeChance > 0.996 &&
        x > 3 &&
        z > 3 &&
        x < WORLD_SIZE_X - 4 &&
        z < WORLD_SIZE_Z - 4
      ) {
        generateTree(x, height, z);
      }
    }
  }

  Array.from(world.keys()).forEach((key) => {
    const [x, y, z] = key.split(',').map(Number);
    syncBlockMesh(x, y, z);
  });
}

function makeTexture(path) {
  if (textureCache.has(path)) {
    return textureCache.get(path);
  }
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapNearestFilter;
  textureCache.set(path, texture);
  return texture;
}

function makeZombiePartMaterials(path, sideColor) {
  const texture = makeTexture(path);
  const frontBackProps = {
    map: texture,
    transparent: false,
    alphaTest: 0.2,
    color: 0xffffff,
  };
  const materials = [
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial({ color: sideColor }),
    new THREE.MeshLambertMaterial(frontBackProps),
    new THREE.MeshLambertMaterial(frontBackProps),
  ];
  materials.forEach((material) => {
    material.userData.baseColor = material.color.getHex();
  });
  return materials;
}

function buildMaterials() {
  Object.entries(BLOCK_DEFS).forEach(([type, def]) => {
    const top = def.faces.top ?? def.faces.all ?? def.faces.side;
    const bottom = def.faces.bottom ?? def.faces.all ?? def.faces.side ?? top;
    const side = def.faces.side ?? def.faces.all ?? top;
    const mapPx = makeTexture(side);
    const mapNx = makeTexture(side);
    const mapPy = makeTexture(top);
    const mapNy = makeTexture(bottom);
    const mapPz = makeTexture(side);
    const mapNz = makeTexture(side);
    const materialProps = {
      transparent: Boolean(def.transparent),
      opacity: def.opacity ?? 1,
      alphaTest: def.alphaTest ?? 0,
    };
    blockMaterials[type] = [
      new THREE.MeshLambertMaterial({ map: mapPx, ...materialProps }),
      new THREE.MeshLambertMaterial({ map: mapNx, ...materialProps }),
      new THREE.MeshLambertMaterial({ map: mapPy, ...materialProps }),
      new THREE.MeshLambertMaterial({ map: mapNy, ...materialProps }),
      new THREE.MeshLambertMaterial({ map: mapPz, ...materialProps }),
      new THREE.MeshLambertMaterial({ map: mapNz, ...materialProps }),
    ];
  });
}

function buildDiamondSword() {
  const group = new THREE.Group();
  const swordMaterial = new THREE.MeshBasicMaterial({
    map: makeTexture('/assets/kenney/items/sword_diamond.png'),
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const sword = new THREE.Mesh(planeGeometry.clone(), swordMaterial);
  sword.scale.set(-1.22, 1.22, 1);
  sword.renderOrder = 50;
  sword.position.set(-0.08, 0.02, 0);
  group.add(sword);
  group.visible = false;
  heldItemPivot.add(group);
  heldSkillModels.sword = { group, sword };
}

function buildRubberPunch() {
  const group = new THREE.Group();
  const armAnchor = new THREE.Group();
  const forearmPivot = new THREE.Group();
  armAnchor.add(forearmPivot);
  group.add(armAnchor);

  const sleeveMaterial = new THREE.MeshLambertMaterial({ color: 0xc6452d });
  const armMaterial = new THREE.MeshLambertMaterial({ color: 0xd59a72 });
  const fistMaterial = new THREE.MeshLambertMaterial({ color: 0xefb48f });

  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.28), sleeveMaterial);
  sleeve.position.set(0, 0, -0.08);

  const armGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.86);
  armGeometry.translate(0, 0, -0.43);
  const arm = new THREE.Mesh(armGeometry, armMaterial);

  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), fistMaterial);
  fist.position.set(0, 0, -0.86);

  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08), sleeveMaterial);
  cuff.position.set(0, 0, -0.18);

  forearmPivot.add(arm, fist, cuff);
  armAnchor.add(sleeve);
  group.visible = false;
  heldItemPivot.add(group);
  heldSkillModels.punch = {
    group,
    armAnchor,
    forearmPivot,
    arm,
    fist,
    cuff,
    baseLength: 0.86,
  };
}

function buildDirtSkill() {
  const group = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), blockMaterials.dirt);
  group.add(cube);
  group.visible = false;
  heldItemPivot.add(group);
  heldSkillModels.dirt = { group, cube };
}

function spawnHitParticles(origin, color = 'white', count = 10) {
  const spritePath = color === 'red'
    ? '/assets/kenney/particles/square_red.png'
    : '/assets/kenney/particles/square_white.png';

  for (let index = 0; index < count; index += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeTexture(spritePath),
        transparent: true,
        alphaTest: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.92,
      }),
    );
    sprite.position.copy(origin).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.55,
      (Math.random() - 0.05) * 0.7,
      (Math.random() - 0.5) * 0.55,
    ));
    const scale = 0.18 + Math.random() * 0.14;
    sprite.scale.set(scale, scale, 1);
    particleGroup.add(sprite);
    hitParticles.push({
      sprite,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        1.5 + Math.random() * 1.8,
        (Math.random() - 0.5) * 2.2,
      ),
      lifetime: HIT_PARTICLE_LIFETIME,
      age: 0,
    });
  }
}

function createZombiePart(path, x, y, z, width, height, depth, sideColor) {
  const part = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    makeZombiePartMaterials(path, sideColor),
  );
  part.position.set(x, y, z);
  return part;
}

function tintZombiePart(part, hex) {
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  materials.forEach((material) => {
    if (hex === 0xffffff) {
      material.color.setHex(material.userData.baseColor ?? 0xffffff);
      return;
    }
    material.color.setHex(hex);
  });
}

function createZombie(spawnPosition) {
  const root = new THREE.Group();
  root.position.copy(spawnPosition);
  enemyGroup.add(root);

  const body = createZombiePart('/assets/kenney/zombie/zombie_body.png', 0, 0.88, 0, 0.88, 0.84, 0.62, 0x8f6734);
  const head = createZombiePart('/assets/kenney/zombie/zombie_head.png', 0, 1.55, 0, 0.64, 0.64, 0.72, 0x49ab67);
  const leftArm = createZombiePart('/assets/kenney/zombie/zombie_arm.png', -0.43, 0.86, 0, 0.22, 0.76, 0.32, 0x58be75);
  const rightArm = createZombiePart('/assets/kenney/zombie/zombie_arm.png', 0.43, 0.86, 0, 0.22, 0.76, 0.32, 0x58be75);
  const leftLeg = createZombiePart('/assets/kenney/zombie/zombie_leg.png', -0.16, 0.3, 0, 0.24, 0.6, 0.34, 0x726454);
  const rightLeg = createZombiePart('/assets/kenney/zombie/zombie_leg.png', 0.16, 0.3, 0, 0.24, 0.6, 0.34, 0x726454);
  root.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.75, 0.85),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  );
  hitbox.position.set(0, 0.88, 0);
  root.add(hitbox);
  const zombie = {
    root,
    hitbox,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    health: ZOMBIE_MAX_HEALTH,
    alive: true,
    hitFlash: 0,
    walkTime: 0,
    knockback: new THREE.Vector3(),
    knockbackTimer: 0,
  };
  hitbox.userData.type = 'zombie';
  hitbox.userData.zombie = zombie;
  zombieHitboxes.push(hitbox);
  return zombie;
}

function getTerrainSurfaceY(x, z) {
  const cellX = THREE.MathUtils.clamp(Math.floor(x), 0, WORLD_SIZE_X - 1);
  const cellZ = THREE.MathUtils.clamp(Math.floor(z), 0, WORLD_SIZE_Z - 1);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
    const block = getBlock(cellX, y, cellZ);
    if (block && BLOCK_DEFS[block].collides && block !== 'leaves') {
      return y + 1;
    }
  }
  return SEA_LEVEL + 1;
}

function getAliveZombies() {
  return enemyState.zombies.filter((zombie) => zombie.alive);
}

function removeZombie(zombie) {
  if (!zombie) {
    return;
  }
  enemyGroup.remove(zombie.root);
  const hitIndex = zombieHitboxes.indexOf(zombie.hitbox);
  if (hitIndex >= 0) {
    zombieHitboxes.splice(hitIndex, 1);
  }
  zombie.hitbox.geometry.dispose();
  zombie.hitbox.material.dispose();
  const zombieIndex = enemyState.zombies.indexOf(zombie);
  if (zombieIndex >= 0) {
    enemyState.zombies.splice(zombieIndex, 1);
  }
  if (gameState.enemyTarget === zombie) {
    gameState.enemyTarget = null;
  }
}

function findZombieSpawnPoint(seedOffset = 0) {
  const player = gameState.player;
  let spawn = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = ((attempt + seedOffset) / 24) * Math.PI * 2;
    const distance = 6 + ((attempt + seedOffset) % 5) * 2.5;
    const attemptX = player.position.x + Math.sin(angle) * distance;
    const attemptZ = player.position.z + Math.cos(angle) * distance;
    if (attemptX < 1 || attemptX > WORLD_SIZE_X - 2 || attemptZ < 1 || attemptZ > WORLD_SIZE_Z - 2) {
      continue;
    }
    const surfaceY = getTerrainSurfaceY(attemptX, attemptZ);
    const block = getBlock(Math.floor(attemptX), Math.floor(surfaceY - 1), Math.floor(attemptZ));
    if (block === 'water') {
      continue;
    }
    const occupied = getAliveZombies().some(
      (zombie) => zombie.root.position.distanceToSquared(new THREE.Vector3(attemptX, surfaceY, attemptZ)) < 9,
    );
    if (occupied) {
      continue;
    }
    spawn = new THREE.Vector3(Math.floor(attemptX) + 0.5, surfaceY, Math.floor(attemptZ) + 0.5);
    break;
  }

  if (!spawn) {
    spawn = new THREE.Vector3(
      Math.min(WORLD_SIZE_X - 2, player.position.x + 8),
      getTerrainSurfaceY(player.position.x + 8, player.position.z),
      Math.min(WORLD_SIZE_Z - 2, player.position.z + 2),
    );
  }
  return spawn;
}

function spawnZombie(seedOffset = enemyState.zombies.length * 3) {
  const spawn = findZombieSpawnPoint(seedOffset);
  const zombie = createZombie(spawn);
  enemyState.zombies.push(zombie);
  return zombie;
}

function spawnZombieWave() {
  while (getAliveZombies().length < INITIAL_ZOMBIE_COUNT) {
    spawnZombie(getAliveZombies().length * 5);
  }
}
function setSkybox() {
  scene.background = new THREE.Color(0x8ed0ff);
}

function getSelectedSkill() {
  return SKILLS[gameState.selectedIndex];
}

function getSelectedBlockType() {
  return getSelectedSkill().blockType ?? 'dirt';
}

function rebuildHotbar() {
  hotbar.innerHTML = '';
  SKILLS.forEach((skill, index) => {
    const item = document.createElement('button');
    item.className = 'hotbar-item';
    item.type = 'button';
    item.dataset.selected = String(index === gameState.selectedIndex);
    item.style.setProperty('--icon', `url("${skill.icon}")`);
    item.innerHTML = `<span class="slot-number">${index + 1}</span><span class="slot-name">${skill.name}</span>`;
    item.addEventListener('click', () => {
      gameState.selectedIndex = index;
      rebuildHotbar();
      updateHud();
    });
    hotbar.appendChild(item);
  });
}

function moveSelection(delta) {
  const total = SKILLS.length;
  gameState.selectedIndex = (gameState.selectedIndex + delta + total) % total;
  rebuildHotbar();
  updateHud();
}

function setPlayerSpawn() {
  let bestScore = -Infinity;
  let bestPos = new THREE.Vector3(WORLD_SIZE_X / 2, 8, WORLD_SIZE_Z / 2);
  const center = new THREE.Vector2(WORLD_SIZE_X / 2, WORLD_SIZE_Z / 2);

  for (let x = 2; x < WORLD_SIZE_X - 2; x += 1) {
    for (let z = 2; z < WORLD_SIZE_Z - 2; z += 1) {
      for (let y = WORLD_HEIGHT - 2; y >= 0; y -= 1) {
        const block = getBlock(x, y, z);
        if (!block || ['leaves', 'wood', 'water'].includes(block)) {
          continue;
        }

        const head = getBlock(x, y + 1, z);
        const aboveHead = getBlock(x, y + 2, z);
        if (head || aboveHead) {
          continue;
        }

        let clutter = 0;
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            for (let dy = 1; dy <= 4; dy += 1) {
              const nearby = getBlock(x + dx, y + dy, z + dz);
              if (nearby && ['leaves', 'wood'].includes(nearby)) {
                clutter += 1;
              }
            }
          }
        }

        if (clutter > 0) {
          continue;
        }

        const distToCenter = center.distanceTo(new THREE.Vector2(x, z));
        const score = 12 - distToCenter + y * 0.15 + (block === 'grass' ? 3 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestPos.set(x + 0.5, y + 1.01, z + 0.5);
        }
        break;
      }
    }
  }

  gameState.player.position.copy(bestPos);
  gameState.player.velocity.set(0, 0, 0);
  const lookDir = new THREE.Vector3(center.x + 2 - bestPos.x, 0, center.y + 2 - bestPos.z);
  gameState.player.yaw = Math.atan2(lookDir.x, lookDir.z);
  gameState.player.pitch = -0.38;
  yawPivot.position.copy(bestPos);
  yawPivot.rotation.y = gameState.player.yaw;
  pitchPivot.rotation.x = gameState.player.pitch;
  camera.position.set(0, EYE_HEIGHT, 0);
}

function playerCollides(x, y, z) {
  const minX = Math.floor(x - PLAYER_RADIUS);
  const maxX = Math.floor(x + PLAYER_RADIUS);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + PLAYER_HEIGHT - 0.001);
  const minZ = Math.floor(z - PLAYER_RADIUS);
  const maxZ = Math.floor(z + PLAYER_RADIUS);

  for (let px = minX; px <= maxX; px += 1) {
    for (let py = minY; py <= maxY; py += 1) {
      for (let pz = minZ; pz <= maxZ; pz += 1) {
        const type = getBlock(px, py, pz);
        if (type && BLOCK_DEFS[type].collides) {
          return true;
        }
      }
    }
  }

  return false;
}

function applyMovement(dt) {
  const player = gameState.player;
  const wish = new THREE.Vector3(
    Number(keyState.has('KeyD')) - Number(keyState.has('KeyA')),
    0,
    Number(keyState.has('KeyS') || keyState.has('ArrowDown')) -
      Number(keyState.has('KeyW') || keyState.has('ArrowUp')),
  );

  if (keyState.has('ArrowLeft')) {
    player.yaw += 1.8 * dt;
  }
  if (keyState.has('ArrowRight')) {
    player.yaw -= 1.8 * dt;
  }

  if (wish.lengthSq() > 0) {
    wish.normalize();
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const desired = new THREE.Vector3()
      .addScaledVector(forward, -wish.z)
      .addScaledVector(right, wish.x)
      .normalize()
      .multiplyScalar(MOVE_SPEED);
    player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, desired.x, 0.16);
    player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, desired.z, 0.16);
  } else {
    player.velocity.x = THREE.MathUtils.damp(player.velocity.x, 0, 10, dt);
    player.velocity.z = THREE.MathUtils.damp(player.velocity.z, 0, 10, dt);
  }

  if (keyState.has('Space') && player.onGround) {
    player.velocity.y = JUMP_SPEED;
    player.onGround = false;
  }

  player.velocity.y -= GRAVITY * dt;
  player.velocity.y = Math.max(player.velocity.y, -24);

  let nextX = player.position.x + player.velocity.x * dt;
  if (!playerCollides(nextX, player.position.y, player.position.z)) {
    player.position.x = nextX;
  } else {
    player.velocity.x = 0;
  }

  let nextZ = player.position.z + player.velocity.z * dt;
  if (!playerCollides(player.position.x, player.position.y, nextZ)) {
    player.position.z = nextZ;
  } else {
    player.velocity.z = 0;
  }

  let nextY = player.position.y + player.velocity.y * dt;
  if (!playerCollides(player.position.x, nextY, player.position.z)) {
    player.position.y = nextY;
    player.onGround = false;
  } else {
    if (player.velocity.y < 0) {
      player.onGround = true;
    }
    player.velocity.y = 0;
  }

  if (player.position.y < -10) {
    setPlayerSpawn();
  }

  yawPivot.position.copy(player.position);
  yawPivot.rotation.y = player.yaw;
  pitchPivot.rotation.x = player.pitch;
  camera.position.set(0, EYE_HEIGHT, 0);
}

const raycaster = new THREE.Raycaster();

function updateWeapon(dt) {
  const combat = gameState.combat;
  if (combat.cooldown > 0) {
    combat.cooldown = Math.max(0, combat.cooldown - dt * 1000);
  }
  combat.swordSwingTime = Math.max(0, combat.swordSwingTime - dt * 1000);
  combat.punchTime = Math.max(0, combat.punchTime - dt * 1000);

  Object.values(heldSkillModels).forEach((entry) => {
    entry.group.visible = false;
  });

  const selectedSkill = getSelectedSkill();
  if (selectedSkill.id === 'sword') {
    const swingPhase = combat.swordSwingTime > 0 ? 1 - combat.swordSwingTime / SWORD_SWING_MS : 0;
    const windup = THREE.MathUtils.smoothstep(swingPhase, 0, 0.28);
    const release = THREE.MathUtils.smoothstep(swingPhase, 0.18, 0.78);
    const recover = THREE.MathUtils.smoothstep(swingPhase, 0.78, 1);
    const slashProgress = release - recover * 0.28;
    const sweepX = THREE.MathUtils.lerp(0.46, 0.04, slashProgress);
    const sweepY = THREE.MathUtils.lerp(-0.54, -0.76, slashProgress) + windup * 0.05;
    const sweepZ = THREE.MathUtils.lerp(-0.56, -0.34, slashProgress);
    const rotX = THREE.MathUtils.lerp(0.34, -0.88, slashProgress) + windup * 0.1;
    const rotY = THREE.MathUtils.lerp(-0.12, -0.28, slashProgress);
    const rotZ = THREE.MathUtils.lerp(-1.18, -0.02, slashProgress) - windup * 0.14;
    heldSkillModels.sword.group.position.set(sweepX, sweepY, sweepZ);
    heldSkillModels.sword.group.rotation.set(rotX, rotY, rotZ);
    heldSkillModels.sword.group.visible = gameState.mode === 'playing';
  } else if (selectedSkill.id === 'punch') {
    const punchPhase = combat.punchTime > 0 ? 1 - combat.punchTime / PUNCH_SWING_MS : 0;
    const windup = THREE.MathUtils.smoothstep(punchPhase, 0, 0.18);
    const release = THREE.MathUtils.smoothstep(punchPhase, 0.12, 0.45);
    const recover = THREE.MathUtils.smoothstep(punchPhase, 0.48, 1);
    const extend = Math.max(0, release - recover * 0.92);
    const armScale = 1 + extend * 3.6;
    const reach = heldSkillModels.punch.baseLength * armScale;

    heldSkillModels.punch.arm.scale.z = armScale;
    heldSkillModels.punch.fist.position.z = -reach;
    heldSkillModels.punch.cuff.position.z = -0.18 - extend * 0.08;

    heldSkillModels.punch.group.position.set(
      0.76 - extend * 0.24 + windup * 0.06,
      -0.74 + extend * 0.18 + windup * 0.05,
      -0.98 - extend * 0.24,
    );
    heldSkillModels.punch.group.rotation.set(
      0.56 - extend * 0.12 - windup * 0.1,
      -0.52 + extend * 0.18,
      -0.46 + extend * 0.08,
    );
    heldSkillModels.punch.armAnchor.rotation.set(-0.08 - extend * 0.05, 0.1 - extend * 0.06, 0.04);
    heldSkillModels.punch.forearmPivot.rotation.set(-0.06 + extend * 0.04, 0.02, 0);
    heldSkillModels.punch.group.visible = gameState.mode === 'playing';
  } else if (selectedSkill.id === 'dirt') {
    heldSkillModels.dirt.group.position.set(0.58, -0.56, -0.72);
    heldSkillModels.dirt.group.rotation.set(0.22, 0.22, -0.3);
    heldSkillModels.dirt.group.visible = gameState.mode === 'playing';
  }
}

function updateHitParticles(dt) {
  for (let index = hitParticles.length - 1; index >= 0; index -= 1) {
    const particle = hitParticles[index];
    particle.age += dt;
    particle.velocity.y -= 4.2 * dt;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    const lifeT = particle.age / particle.lifetime;
    particle.sprite.material.opacity = Math.max(0, 1 - lifeT);
    particle.sprite.scale.multiplyScalar(0.992);
    if (particle.age >= particle.lifetime) {
      particleGroup.remove(particle.sprite);
      particle.sprite.material.dispose();
      hitParticles.splice(index, 1);
    }
  }
}

function updateSingleZombie(dt, zombie) {
  zombie.walkTime += dt * 8;
  zombie.hitFlash = Math.max(0, zombie.hitFlash - dt * 4);
  zombie.knockbackTimer = Math.max(0, zombie.knockbackTimer - dt * 1000);
  const tint = zombie.hitFlash > 0 ? 0xff8a8a : 0xffffff;
  [zombie.body, zombie.head, zombie.leftArm, zombie.rightArm, zombie.leftLeg, zombie.rightLeg].forEach((part) => {
    tintZombiePart(part, tint);
  });

  const toPlayer = new THREE.Vector3().subVectors(gameState.player.position, zombie.root.position);
  const flatToPlayer = new THREE.Vector2(toPlayer.x, toPlayer.z);
  const distance = flatToPlayer.length();

  if (zombie.knockback.lengthSq() > 0.0001) {
    zombie.root.position.x += zombie.knockback.x * dt;
    zombie.root.position.z += zombie.knockback.z * dt;
    zombie.knockback.multiplyScalar(Math.pow(0.08, dt));
  } else {
    zombie.knockback.set(0, 0, 0);
  }

  if (distance > 1.7 && zombie.knockbackTimer === 0) {
    flatToPlayer.normalize();
    zombie.root.position.x += flatToPlayer.x * ZOMBIE_SPEED * dt;
    zombie.root.position.z += flatToPlayer.y * ZOMBIE_SPEED * dt;
  }
  zombie.root.position.y = getTerrainSurfaceY(zombie.root.position.x, zombie.root.position.z);

  const sway = Math.sin(zombie.walkTime) * 0.12 * Math.min(1, distance / 2);
  zombie.leftArm.position.x = -0.43 + sway;
  zombie.rightArm.position.x = 0.43 - sway;
  zombie.leftLeg.position.x = -0.16 - sway * 0.38;
  zombie.rightLeg.position.x = 0.16 + sway * 0.38;

  const dx = gameState.player.position.x - zombie.root.position.x;
  const dz = gameState.player.position.z - zombie.root.position.z;
  zombie.root.rotation.set(0, Math.atan2(dx, dz), 0);
}

function updateZombies(dt) {
  enemyState.respawnTimers = enemyState.respawnTimers
    .map((timer) => Math.max(0, timer - dt * 1000))
    .filter((timer) => {
      if (timer === 0 && gameState.mode === 'playing') {
        spawnZombie(Math.floor(Math.random() * 100));
        return false;
      }
      return true;
    });

  enemyState.zombies.forEach((zombie) => {
    if (zombie.alive) {
      updateSingleZombie(dt, zombie);
    }
  });

  while (gameState.mode === 'playing' && getAliveZombies().length + enemyState.respawnTimers.length < INITIAL_ZOMBIE_COUNT) {
    spawnZombie(Math.floor(Math.random() * 100));
  }
}

function updateEnemyTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(zombieHitboxes, false);
  const selectedSkill = getSelectedSkill();
  const activeRange = selectedSkill.id === 'punch' ? PUNCH_RANGE : SWORD_RANGE;
  const zombieHit = hits.find((entry) => entry.distance <= activeRange + 0.6);
  return zombieHit ? zombieHit.object.userData.zombie : null;
}

function findMeleeZombieCandidate() {
  const forward = new THREE.Vector3(-Math.sin(gameState.player.yaw), 0, -Math.cos(gameState.player.yaw));
  let bestZombie = null;
  let bestScore = -Infinity;

  getAliveZombies().forEach((zombie) => {
    const toZombie = new THREE.Vector3().subVectors(zombie.root.position, gameState.player.position);
    const distance = toZombie.length();
    if (distance > PUNCH_RANGE + 0.45) {
      return;
    }
    toZombie.y = 0;
    if (toZombie.lengthSq() === 0) {
      bestZombie = zombie;
      bestScore = Infinity;
      return;
    }
    toZombie.normalize();
    const facing = forward.dot(toZombie);
    const score = facing * 10 - distance;
    if (facing > 0.35 && score > bestScore) {
      bestScore = score;
      bestZombie = zombie;
    }
  });

  return bestZombie;
}

function updateTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(raycastMeshes, false);
  const hit = hits.find((entry) => entry.distance < 6);
  if (!hit) {
    gameState.target = null;
    return;
  }

  const { x, y, z, type } = hit.object.userData;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const placeAt = {
    x: x + Math.round(normal.x),
    y: y + Math.round(normal.y),
    z: z + Math.round(normal.z),
  };
  gameState.target = {
    block: { x, y, z, type },
    placeAt,
  };
}

function updateHud() {
  const player = gameState.player;
  const selected = getSelectedSkill().name;
  const target = gameState.target
    ? `${gameState.target.block.type} @ ${gameState.target.block.x},${gameState.target.block.y},${gameState.target.block.z}`
    : 'none';
  const aliveZombieCount = getAliveZombies().length;
  const zombieText = gameState.enemyTarget
    ? ` | Target Zombie HP ${gameState.enemyTarget.health} | Zombies ${aliveZombieCount}`
    : aliveZombieCount > 0
    ? ` | Zombies ${aliveZombieCount} alive`
    : ` | Zombies down ${gameState.combat.kills}`;
  const pointerHint = document.pointerLockElement === canvas ? 'Pointer locked' : 'Mouse free';
  statusMessage.textContent = `${selected} selected | Target: ${target}${zombieText} | ${pointerHint}`;
  statusCoords.textContent = `XYZ ${player.position.x.toFixed(1)} / ${player.position.y.toFixed(1)} / ${player.position.z.toFixed(1)}`;
}

function stepSimulation(deltaMs) {
  const capped = Math.min(deltaMs, 100);
  let remaining = capped;
  while (remaining > 0) {
    const stepMs = Math.min(FIXED_STEP_MS, remaining);
    const dt = stepMs / 1000;
    updateWeapon(dt);
    updateHitParticles(dt);
    if (gameState.mode === 'playing') {
      applyMovement(dt);
      updateZombies(dt);
      gameState.enemyTarget = updateEnemyTarget();
      updateTarget();
    }
    remaining -= stepMs;
  }
}

function renderScene() {
  gameState.enemyTarget = updateEnemyTarget();
  updateTarget();
  updateHud();
  renderer.render(scene, camera);
}

function attackZombie({
  range,
  knockbackStrength,
  particleColor = 'red',
  particleCount = 12,
}) {
  const zombie = updateEnemyTarget() ?? findMeleeZombieCandidate();
  if (!zombie || !zombie.alive) {
    return false;
  }
  const distance = zombie.root.position.distanceTo(gameState.player.position);
  if (distance > range + 0.35) {
    return false;
  }

  zombie.health -= 1;
  zombie.hitFlash = 1;
  const away = new THREE.Vector3().subVectors(zombie.root.position, gameState.player.position);
  away.y = 0;
  if (away.lengthSq() < 0.001) {
    away.set(Math.sin(gameState.player.yaw), 0, Math.cos(gameState.player.yaw));
  }
  away.normalize();
  zombie.knockback.copy(away.multiplyScalar(knockbackStrength));
  zombie.knockbackTimer = 240;
  spawnHitParticles(zombie.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)), particleColor, particleCount);
  if (zombie.health <= 0) {
    spawnHitParticles(zombie.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 'white', 16);
    zombie.alive = false;
    gameState.combat.kills += 1;
    removeZombie(zombie);
    enemyState.respawnTimers.push(ZOMBIE_RESPAWN_MS);
  }
  return true;
}

function swingSword() {
  if (gameState.combat.cooldown > 0) {
    return;
  }
  gameState.combat.cooldown = SWORD_COOLDOWN_MS;
  gameState.combat.swordSwingTime = SWORD_SWING_MS;
  if (attackZombie({ range: SWORD_RANGE, knockbackStrength: 4.6, particleColor: 'red', particleCount: 12 })) {
    updateHud();
    return;
  }
}

function punchAttack() {
  if (gameState.combat.cooldown > 0) {
    return;
  }
  gameState.combat.cooldown = PUNCH_COOLDOWN_MS;
  gameState.combat.punchTime = PUNCH_SWING_MS;
  attackZombie({ range: PUNCH_RANGE, knockbackStrength: 7.4, particleColor: 'white', particleCount: 14 });
}

function handleBreak() {
  if (!gameState.target) {
    return;
  }
  const { x, y, z } = gameState.target.block;
  if (y === 0) {
    return;
  }
  removeBlock(x, y, z);
  updateTarget();
  updateHud();
}

function handlePlace() {
  if (!gameState.target) {
    return;
  }
  const { x, y, z } = gameState.target.placeAt;
  if (!isInsideWorld(x, y, z) || getBlock(x, y, z)) {
    return;
  }
  const playerMinX = gameState.player.position.x - PLAYER_RADIUS;
  const playerMaxX = gameState.player.position.x + PLAYER_RADIUS;
  const playerMinY = gameState.player.position.y;
  const playerMaxY = gameState.player.position.y + PLAYER_HEIGHT;
  const playerMinZ = gameState.player.position.z - PLAYER_RADIUS;
  const playerMaxZ = gameState.player.position.z + PLAYER_RADIUS;
  const overlapsPlayer =
    playerMaxX > x &&
    playerMinX < x + 1 &&
    playerMaxY > y &&
    playerMinY < y + 1 &&
    playerMaxZ > z &&
    playerMinZ < z + 1;
  if (overlapsPlayer) {
    return;
  }
  setBlock(x, y, z, getSelectedBlockType());
  updateTarget();
  updateHud();
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

async function enterWorld() {
  gameState.started = true;
  gameState.mode = 'playing';
  startScreen.dataset.hidden = 'true';
  updateHud();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen?.();
  }
}

function initInput() {
  window.addEventListener('keydown', (event) => {
    if (CONTROL_KEYS.includes(event.code)) {
      keyState.add(event.code);
    }

    if (event.code === 'Digit1') gameState.selectedIndex = 0;
    if (event.code === 'Digit2') gameState.selectedIndex = 1;
    if (event.code === 'Digit3') gameState.selectedIndex = 2;
    if (event.code.startsWith('Digit')) {
      rebuildHotbar();
      updateHud();
    }

    if (event.code === 'KeyF') {
      toggleFullscreen();
    }
    if (event.code === 'Enter' && !gameState.started) {
      enterWorld();
    }
  });

  window.addEventListener('keyup', (event) => {
    keyState.delete(event.code);
  });

  window.addEventListener('wheel', (event) => {
    moveSelection(event.deltaY > 0 ? 1 : -1);
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas || gameState.mode !== 'playing') {
      return;
    }
    gameState.player.yaw -= event.movementX * LOOK_SPEED;
    gameState.player.pitch = THREE.MathUtils.clamp(
      gameState.player.pitch - event.movementY * LOOK_SPEED,
      -1.35,
      1.35,
    );
  });

  canvas.addEventListener('click', () => {
    if (!gameState.started) {
      return;
    }
    canvas.requestPointerLock?.();
  });

  canvas.addEventListener('mousedown', (event) => {
    if (gameState.mode !== 'playing') {
      return;
    }
    const selectedSkill = getSelectedSkill();
    if (event.button === 0) {
      if (selectedSkill.id === 'sword') {
        swingSword();
      } else if (selectedSkill.id === 'punch') {
        punchAttack();
      } else if (selectedSkill.id === 'dirt') {
        handleBreak();
      }
    }
    if (event.button === 2 && selectedSkill.id === 'dirt') {
      handlePlace();
    }
  });

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  startButton.addEventListener('click', enterWorld);
}

function createStateSnapshot() {
  const player = gameState.player;
  const blockBelow = getBlock(
    Math.floor(player.position.x),
    Math.floor(player.position.y - 0.1),
    Math.floor(player.position.z),
  );
  const surface = [];
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const sampleX = Math.floor(player.position.x) + dx;
      const sampleZ = Math.floor(player.position.z) + dz;
      let top = null;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
        const type = getBlock(sampleX, y, sampleZ);
        if (type && type !== 'water') {
          top = { x: sampleX, y, z: sampleZ, type };
          break;
        }
      }
      if (top) {
        surface.push(top);
      }
    }
  }

  return JSON.stringify({
    mode: gameState.mode,
    coordinates: 'origin at world corner, x east, y up, z south',
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number(player.position.y.toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      vx: Number(player.velocity.x.toFixed(2)),
      vy: Number(player.velocity.y.toFixed(2)),
      vz: Number(player.velocity.z.toFixed(2)),
      onGround: player.onGround,
      yaw: Number(player.yaw.toFixed(2)),
      pitch: Number(player.pitch.toFixed(2)),
      blockBelow,
    },
    selectedSkill: getSelectedSkill().id,
    sword: {
      swinging: gameState.combat.swordSwingTime > 0,
      punchActive: gameState.combat.punchTime > 0,
      cooldownMs: Math.round(gameState.combat.cooldown),
    },
    combat: {
      kills: gameState.combat.kills,
      zombiesAlive: getAliveZombies().length,
      zombies: getAliveZombies().slice(0, 8).map((zombie) => ({
        hp: zombie.health,
        x: Number(zombie.root.position.x.toFixed(2)),
        y: Number(zombie.root.position.y.toFixed(2)),
        z: Number(zombie.root.position.z.toFixed(2)),
        knockbackX: Number(zombie.knockback.x.toFixed(2)),
        knockbackZ: Number(zombie.knockback.z.toFixed(2)),
      })),
      zombieTargeted: Boolean(gameState.enemyTarget),
      hitParticles: hitParticles.length,
    },
    target: gameState.target,
    nearbySurface: surface,
  });
}

function initTestingHooks() {
  window.render_game_to_text = createStateSnapshot;
  window.advanceTime = (ms) => {
    gameState.useManualClock = true;
    stepSimulation(ms);
    renderScene();
  };
}

async function init() {
  buildMaterials();
  buildDiamondSword();
  buildRubberPunch();
  buildDirtSkill();
  setSkybox();
  buildWorld();
  setPlayerSpawn();
  spawnZombieWave();
  rebuildHotbar();
  initInput();
  initTestingHooks();
  onResize();
  updateTarget();
  updateHud();

  gameState.mode = 'menu';
  statusMessage.textContent = 'Press Enter World to start exploring.';
  statusCoords.textContent = 'Ready';

  let lastTime = performance.now();
  const animate = (now) => {
    if (!gameState.useManualClock) {
      stepSimulation(now - lastTime);
    }
    lastTime = now;
    renderScene();
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
}

window.addEventListener('resize', onResize);

init().catch((error) => {
  console.error(error);
  statusMessage.textContent = 'Failed to load JonyCraft assets.';
});
