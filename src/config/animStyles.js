/**
 * Per-fruit animation modifiers — data-driven configuration.
 * Used by WeaponModels for weapon animation and ScreenEffects for shake/flash.
 *
 * stretchMul  – how far the punch arm extends (1 = full rubber stretch)
 * fistScale   – fist grows on impact (1 = no change)
 * shake       – camera shake intensity on attack
 * flashAlpha  – screen flash opacity on attack
 * swordGlow   – emissive intensity for sword attacks
 * arcTilt     – extra swing arc intensity
 * swirl       – extra rotational swirl during attacks
 * trail       – after-image trail opacity
 */
export const ANIM_MODS = {
  stretch:   { stretchMul: 1.0,  fistScale: 1.0, shake: 0,    flashAlpha: 0,    swordGlow: 0,   arcTilt: 1.0, swirl: 0.08, trail: 0.10 },
  fire:      { stretchMul: 0.7,  fistScale: 1.4, shake: 0.02, flashAlpha: 0.15, swordGlow: 0.4, arcTilt: 1.2, swirl: 0.18, trail: 0.24 },
  ice:       { stretchMul: 0.5,  fistScale: 1.2, shake: 0,    flashAlpha: 0.1,  swordGlow: 0.5, arcTilt: 0.9, swirl: 0.10, trail: 0.16 },
  dark:      { stretchMul: 0.6,  fistScale: 1.3, shake: 0,    flashAlpha: 0.12, swordGlow: 0.3, arcTilt: 0.8, swirl: 0.22, trail: 0.28 },
  light:     { stretchMul: 0.4,  fistScale: 1.0, shake: 0.01, flashAlpha: 0.25, swordGlow: 0.7, arcTilt: 1.5, swirl: 0.20, trail: 0.35 },
  magma:     { stretchMul: 0.6,  fistScale: 1.6, shake: 0.03, flashAlpha: 0.15, swordGlow: 0.4, arcTilt: 1.0, swirl: 0.12, trail: 0.22 },
  sand:      { stretchMul: 0.8,  fistScale: 1.1, shake: 0,    flashAlpha: 0.08, swordGlow: 0.2, arcTilt: 0.95,swirl: 0.14, trail: 0.18 },
};

export const DEFAULT_ANIM_MOD = {
  stretchMul: 1.0, fistScale: 1.0, shake: 0, flashAlpha: 0,
  swordGlow: 0, arcTilt: 1.0, swirl: 0.08, trail: 0.12,
};

export function getAnimMod(animStyle) {
  return ANIM_MODS[animStyle] || DEFAULT_ANIM_MOD;
}
