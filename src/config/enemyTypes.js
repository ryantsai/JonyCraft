/**
 * Enemy type definitions. Each type defines appearance, stats, and behavior.
 *
 * Behavior types:
 *   'chase'      - Walk straight toward player (zombie default)
 *   'charge'     - Slow approach, then burst-sprint when close
 *   'circle'     - Strafe around player, dash in to attack
 *   'leap'       - Hop toward player in big jumps
 *   'teleport'   - Blink to random positions near player
 *   'ranged'     - Keep distance, shoot projectiles
 *   'explode'    - Rush player, explode on contact (dies)
 *   'shield'     - High defense, drops guard periodically
 *   'swarm'      - Tiny, fast, jittery movement
 *   'regen'      - Slow, regenerates HP over time
 *   'flee'       - Runs away when player faces it, attacks from behind
 */

export const ENEMY_TYPES = {
  zombie: {
    name: '殭屍',
    behavior: 'chase',
    maxHealth: 3,
    baseAttack: 1,
    baseDefense: 0,
    speed: 1.12,
    sizeMultiplier: 1,
    attackRange: 1.8,
    attackCooldownMs: 1000,
    knockbackResist: 0,
    colors: {
      body: 0x8f6734, head: 0x49ab67,
      arms: 0x58be75, legs: 0x726454,
    },
    particleColor: 'red',
    spawnWeight: 3,
  },

  skeleton: {
    name: '骷髏射手',
    behavior: 'ranged',
    maxHealth: 2,
    baseAttack: 2,
    baseDefense: 0,
    speed: 0.9,
    sizeMultiplier: 1.05,
    attackRange: 14,
    attackCooldownMs: 2200,
    knockbackResist: 0,
    projectileSpeed: 10,
    preferredDistance: 8,
    colors: {
      body: 0xd4cfc4, head: 0xe8e4d8,
      arms: 0xccc7b8, legs: 0xb0a898,
    },
    particleColor: 'white',
    spawnWeight: 2,
  },

  slime: {
    name: '史萊姆',
    behavior: 'leap',
    maxHealth: 4,
    baseAttack: 1,
    baseDefense: 1,
    speed: 1.6,
    sizeMultiplier: 0.7,
    attackRange: 1.5,
    attackCooldownMs: 800,
    knockbackResist: 0.3,
    leapInterval: 1.2,
    leapStrength: 5,
    colors: {
      body: 0x44dd55, head: 0x55ee66,
      arms: 0x44dd55, legs: 0x33cc44,
    },
    particleColor: 'white',
    spawnWeight: 2,
  },

  giant: {
    name: '巨人',
    behavior: 'charge',
    maxHealth: 12,
    baseAttack: 4,
    baseDefense: 2,
    speed: 0.55,
    sizeMultiplier: 2.0,
    attackRange: 3.0,
    attackCooldownMs: 1800,
    knockbackResist: 0.7,
    chargeDistance: 6,
    chargeSpeed: 4.5,
    colors: {
      body: 0x7a5533, head: 0x8a6543,
      arms: 0x6a4523, legs: 0x5a3513,
    },
    particleColor: 'red',
    spawnWeight: 1,
  },

  spider: {
    name: '蜘蛛',
    behavior: 'circle',
    maxHealth: 2,
    baseAttack: 2,
    baseDefense: 0,
    speed: 2.8,
    sizeMultiplier: 0.55,
    attackRange: 1.6,
    attackCooldownMs: 600,
    knockbackResist: 0,
    circleRadius: 3.5,
    dashSpeed: 6,
    dashInterval: 2.5,
    colors: {
      body: 0x333333, head: 0x551111,
      arms: 0x444444, legs: 0x222222,
    },
    particleColor: 'red',
    spawnWeight: 2,
  },

  ghost: {
    name: '幽靈',
    behavior: 'teleport',
    maxHealth: 3,
    baseAttack: 2,
    baseDefense: 0,
    speed: 1.0,
    sizeMultiplier: 0.9,
    attackRange: 2.0,
    attackCooldownMs: 1400,
    knockbackResist: 0.5,
    teleportInterval: 3.0,
    teleportRadius: 6,
    transparent: true,
    floatAmplitude: 0.5,
    colors: {
      body: 0xaabbdd, head: 0xccddff,
      arms: 0x99aacc, legs: 0x8899bb,
    },
    particleColor: 'white',
    spawnWeight: 1,
  },

  creeper: {
    name: '爆破者',
    behavior: 'explode',
    maxHealth: 4,
    baseAttack: 8,
    baseDefense: 0,
    speed: 1.5,
    sizeMultiplier: 0.95,
    attackRange: 2.2,
    attackCooldownMs: 0,
    knockbackResist: 0,
    fuseTime: 1.5,
    explosionRadius: 3,
    colors: {
      body: 0x33aa33, head: 0x44bb44,
      arms: 0x33aa33, legs: 0x228822,
    },
    particleColor: 'red',
    spawnWeight: 1,
  },

  wizard: {
    name: '巫師',
    behavior: 'ranged',
    maxHealth: 3,
    baseAttack: 3,
    baseDefense: 0,
    speed: 1.2,
    sizeMultiplier: 1.0,
    attackRange: 12,
    attackCooldownMs: 2800,
    knockbackResist: 0,
    projectileSpeed: 7,
    preferredDistance: 9,
    teleportWhenClose: true,
    teleportThreshold: 4,
    colors: {
      body: 0x4422aa, head: 0x6644cc,
      arms: 0x5533bb, legs: 0x332288,
    },
    particleColor: 'white',
    spawnWeight: 1,
  },

  golem: {
    name: '石像',
    behavior: 'regen',
    maxHealth: 16,
    baseAttack: 3,
    baseDefense: 3,
    speed: 0.45,
    sizeMultiplier: 1.7,
    attackRange: 2.5,
    attackCooldownMs: 2000,
    knockbackResist: 0.85,
    regenPerSecond: 0.5,
    colors: {
      body: 0x888888, head: 0x999999,
      arms: 0x777777, legs: 0x666666,
    },
    particleColor: 'white',
    spawnWeight: 1,
  },

  ninja: {
    name: '忍者',
    behavior: 'flee',
    maxHealth: 2,
    baseAttack: 4,
    baseDefense: 0,
    speed: 3.2,
    sizeMultiplier: 0.85,
    attackRange: 1.8,
    attackCooldownMs: 700,
    knockbackResist: 0,
    fleeAngle: 2.5,
    colors: {
      body: 0x1a1a2e, head: 0x222244,
      arms: 0x16162a, legs: 0x101020,
    },
    particleColor: 'red',
    spawnWeight: 2,
  },

  blaze: {
    name: '烈焰人',
    behavior: 'ranged',
    maxHealth: 5,
    baseAttack: 2,
    baseDefense: 1,
    speed: 0.8,
    sizeMultiplier: 1.1,
    attackRange: 11,
    attackCooldownMs: 1200,
    knockbackResist: 0.3,
    projectileSpeed: 12,
    preferredDistance: 7,
    burstCount: 3,
    burstDelay: 150,
    floatAmplitude: 0.4,
    colors: {
      body: 0xff6600, head: 0xff8833,
      arms: 0xff5500, legs: 0xcc4400,
    },
    particleColor: 'red',
    spawnWeight: 1,
  },
};

// Build weighted spawn table (excludes zombie which is handled separately)
export const SPAWN_TABLE = [];
for (const [key, def] of Object.entries(ENEMY_TYPES)) {
  for (let i = 0; i < def.spawnWeight; i += 1) {
    SPAWN_TABLE.push(key);
  }
}
