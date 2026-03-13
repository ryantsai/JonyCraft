import { WORLD_HEIGHT } from '../config/constants.js';

/**
 * Exposes automation hooks for Playwright testing.
 * window.render_game_to_text() and window.advanceTime(ms).
 */
export class TestingHooks {
  constructor(gameState, world, enemyManager, particles, remotePlayers, stepFn, renderFn) {
    this.state = gameState;
    this.world = world;
    this.enemies = enemyManager;
    this.particles = particles;
    this.remotePlayers = remotePlayers;
    this.stepFn = stepFn;
    this.renderFn = renderFn;
  }

  init() {
    window.render_game_to_text = () => this._createSnapshot();
    window.advanceTime = (ms) => {
      this.state.useManualClock = true;
      this.stepFn(ms);
      this.renderFn();
    };
  }

  _createSnapshot() {
    const player = this.state.player;
    const blockBelow = this.world.getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y - 0.1),
      Math.floor(player.position.z),
    );

    const surface = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const sx = Math.floor(player.position.x) + dx;
        const sz = Math.floor(player.position.z) + dz;
        let top = null;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
          const type = this.world.getBlock(sx, y, sz);
          if (type && type !== 'water') {
            top = { x: sx, y, z: sz, type };
            break;
          }
        }
        if (top) surface.push(top);
      }
    }

    return JSON.stringify({
      mode: this.state.mode,
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
      selectedSkill: this.state.getSelectedSkill().id,
      sword: {
        swinging: this.state.combat.swordSwingTime > 0,
        punchActive: this.state.combat.punchTime > 0,
        cooldownMs: Math.round(this.state.combat.cooldown),
      },
      combat: {
        kills: this.state.combat.kills,
        zombiesAlive: this.enemies.getAlive().length,
        zombies: this.enemies.getAlive().slice(0, 8).map((z) => ({
          hp: z.health,
          x: Number(z.root.position.x.toFixed(2)),
          y: Number(z.root.position.y.toFixed(2)),
          z: Number(z.root.position.z.toFixed(2)),
          knockbackX: Number(z.knockback.x.toFixed(2)),
          knockbackZ: Number(z.knockback.z.toFixed(2)),
        })),
        zombieTargeted: Boolean(this.state.enemyTarget),
        hitParticles: this.particles.count,
      },
      multiplayer: {
        enabled: this.state.multiplayer.enabled,
        playerName: this.state.playerName,
        sessionId: this.state.multiplayer.sessionId,
        sessionName: this.state.multiplayer.sessionName,
        sessionMode: this.state.multiplayer.sessionMode,
        playersInSession: this.state.multiplayer.sessionPlayerCount,
        remotePlayersVisible: this.remotePlayers.avatars.size,
        connectionStatus: this.state.multiplayer.connectionStatus,
      },
      target: this.state.target,
      nearbySurface: surface,
    });
  }
}
