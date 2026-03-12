// Physics & movement
export const FIXED_STEP_MS = 1000 / 60;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_RADIUS = 0.32;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 5.2;
export const JUMP_SPEED = 7.6;
export const GRAVITY = 22;
export const LOOK_SPEED = 0.0026;

// World dimensions
export const WORLD_SIZE_X = 56;
export const WORLD_SIZE_Z = 56;
export const WORLD_HEIGHT = 10;
export const SEA_LEVEL = 2;
export const WORLD_SEED = 17.23;

// Combat - sword
export const SWORD_RANGE = 3;
export const SWORD_SWING_MS = 220;
export const SWORD_COOLDOWN_MS = 300;

// Combat - punch
export const PUNCH_RANGE = 6.2;
export const PUNCH_SWING_MS = 260;
export const PUNCH_COOLDOWN_MS = 360;

// Player stats
export const PLAYER_MAX_HP = 20;
export const PLAYER_BASE_ATTACK = 1;
export const PLAYER_BASE_DEFENSE = 0;

// Enemies
export const ZOMBIE_SPEED = 1.12;
export const ZOMBIE_RESPAWN_MS = 4500;
export const ZOMBIE_MAX_HEALTH = 3;
export const ZOMBIE_BASE_ATTACK = 1;
export const ZOMBIE_BASE_DEFENSE = 0;
export const ZOMBIE_ATTACK_RANGE = 1.8;
export const ZOMBIE_ATTACK_COOLDOWN_MS = 1000;
export const INITIAL_ZOMBIE_COUNT = 5;

// Particles
export const HIT_PARTICLE_LIFETIME = 0.42;

// Input
export const CONTROL_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
];
