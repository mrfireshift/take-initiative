// The eight dice styles of the Online dice tray (Owlbear Rodeo Dice's materials, public/dice/materials). Kept apart
// from src/diceAssets.json so that the options can check a stored style without loading the dice data.
export const DICE_STYLE_KEYS = Object.freeze(["galaxy", "gemstone", "glass", "iron", "nebula", "sunrise", "sunset", "walnut"]);
export const DEFAULT_DICE_STYLE = "iron";

export function normalizeDiceStyle(value) {
  return DICE_STYLE_KEYS.includes(value) ? value : DEFAULT_DICE_STYLE;
}
