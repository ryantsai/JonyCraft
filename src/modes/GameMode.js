/**
 * Base class for game modes. Provides a documented interface and no-op defaults
 * so callers don't need optional chaining everywhere.
 *
 * Subclasses override the methods they need:
 *   activate(context)   - Called when mode starts. context = { world, worldRenderer, playerController, enemyManager }
 *   deactivate()        - Called when switching away from this mode
 *   update(dt)          - Called each frame
 *   getDefenseTarget()  - Returns THREE.Vector3 or null
 *   damageTower(amount) - Called by enemy behaviors when attacking the tower
 *   getDamageTarget()   - Returns 'tower' | 'player' — who enemies should damage
 */
export class GameMode {
  activate() { }
  deactivate() { }
  update() { }
  getDefenseTarget() { return null; }
  damageTower() { }
  getDamageTarget() { return 'player'; }
}
