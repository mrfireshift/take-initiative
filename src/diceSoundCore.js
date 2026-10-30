// The dice's impact sounds (docs/PIANO_DADI_ONLINE.md, lot D-5), as Owlbear Rodeo Dice plays them
// (src/dice/PhysicsDice.tsx): a sound for each die that hits something, chosen by the die's weight and by what it
// hits, as loud as the die is fast, then a pause for that die. Pure: no Web Audio, no three.js.

export const DICE_SOUND_SURFACES = Object.freeze(["dice", "leather", "wood"]);
// Seconds before the same die makes another sound (the Dice's AUDIO_COOLDOWN, 200 ms).
export const DICE_SOUND_COOLDOWN = 0.2;
// The die's speed at which a sound plays at full volume.
const FULL_VOLUME_SPEED = 5;

// The Dice's getDieWeightClass: iron dice are heavier, the d4 is lighter.
export function dieWeightClass(key, style) {
  const d4 = key === "d4";
  if (style === "iron") return d4 ? "medium" : "heavy";
  return d4 ? "light" : "medium";
}

export function impactVolume(speed) {
  const value = Number(speed);
  return Number.isFinite(value) && value > 0 ? Math.min(value / FULL_VOLUME_SPEED, 1) : 0;
}

// The impacts that make a sound: per die, none until its pause is over, and none too faint to hear.
export function audibleImpacts(impacts, { cooldown = DICE_SOUND_COOLDOWN, minVolume = 0.02 } = {}) {
  const lastByDie = new Map();
  const kept = [];
  for (const impact of [...(Array.isArray(impacts) ? impacts : [])].sort((left, right) => left.time - right.time)) {
    if (!DICE_SOUND_SURFACES.includes(impact?.surface)) continue;
    const volume = impactVolume(impact.speed);
    if (volume < minVolume) continue;
    const last = lastByDie.get(impact.die);
    if (last !== undefined && impact.time - last < cooldown) continue;
    lastByDie.set(impact.die, impact.time);
    kept.push({ ...impact, volume });
  }
  return kept;
}

// Left to right in the tray (x from −halfWidth to +halfWidth), softened: a stereo hint, never one ear only.
export function impactPan(x, halfWidth) {
  const value = Number(x) / (Number(halfWidth) || 1);
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) * 0.6 : 0;
}
