/**
 * Updates the cooldown overlay on hotbar items.
 * Extracted from WeaponModels — DOM manipulation doesn't belong in 3D effects.
 */
export function updateCooldownHUD(gameState) {
  const cd = gameState.combat.cooldown;
  const skill = gameState.getSelectedSkill();
  const maxCd = skill.cooldownMs || 300;
  const ratio = cd > 0 ? cd / maxCd : 0;

  const items = document.querySelectorAll('.hotbar-item');
  items.forEach((item, i) => {
    let overlay = item.querySelector('.cooldown-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'cooldown-overlay';
      item.appendChild(overlay);
    }
    if (ratio > 0 && i === gameState.selectedIndex) {
      overlay.style.height = `${ratio * 100}%`;
      overlay.style.opacity = '1';
    } else {
      overlay.style.height = '0%';
      overlay.style.opacity = '0';
    }
  });
}
