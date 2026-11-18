import { conditionKey } from "./conditionRulesCore.js";
import { isDeadByDeathSaves, isStableByDeathSaves, readDeathSaves } from "./deathSaveCore.js";

// Lot L4 of the tracker UI study (docs/STUDIO_UI_TRACKER_BG3.md, decisions D3a and D3b of 18/11): what a card shows of
// a creature's life, the same for the GM and the players.
// - "dead": the condition Morto (a PC's third failed death save, or the GM's), or a creature that is not a PC at 0 HP,
//   unless it is Privo di sensi (a blow that only knocks out): a skull and a grey card;
// - "down": any other creature at 0 HP, so a PC who rolls its death saves: KO;
// - "alive": every other creature, and one without HP.
// The tracker builds it from the token's metadata before the players' projection strips the HP (optionsProjection.js),
// so a player sees that a creature is down even with its HP hidden (D3a), never how many HP it had.
export const VITAL_STATE = Object.freeze({ ALIVE: "alive", DOWN: "down", DEAD: "dead" });

const UNCONSCIOUS = "privo di sensi";

function conditionInstances(conditions) {
  const instances = Array.isArray(conditions) ? conditions : conditions?.instances;
  return (Array.isArray(instances) ? instances : []).filter((instance) => instance && instance.active !== false);
}

function isPC(attitude) {
  return String(attitude || "").trim().toLocaleLowerCase("it") === "pc";
}

// The state at a given HP, and the one the card would show at 0 HP (vitalStateAtZero): syncTrackerHPNow reads the
// latter when the HP fall to 0 between two renders, before the card is drawn again.
export function trackerVitalState({ attitude, hp, hpMax, conditions } = {}) {
  const instances = conditionInstances(conditions);
  if (isDeadByDeathSaves(instances)) return VITAL_STATE.DEAD;
  const maximum = Number(hpMax);
  const current = Number(hp);
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(current) || current > 0) return VITAL_STATE.ALIVE;
  if (isPC(attitude)) return VITAL_STATE.DOWN;
  return instances.some((instance) => conditionKey(instance) === UNCONSCIOUS) ? VITAL_STATE.DOWN : VITAL_STATE.DEAD;
}

export function trackerVitalStateAtZero({ attitude, conditions } = {}) {
  return trackerVitalState({ attitude, hp: 0, hpMax: 1, conditions });
}

// Dead whatever the HP: the condition Morto. The card keeps its skull when the HP change between renders.
export function isDeadByCondition(conditions) {
  return isDeadByDeathSaves(conditionInstances(conditions));
}

// The death saves a card shows: those of a PC who is down and not stable, from meta.deathSaves (0 to 3 each).
// Null for every other creature.
export function trackerDeathSaves({ attitude, vitalState, conditions, deathSaves } = {}) {
  if (vitalState !== VITAL_STATE.DOWN || !isPC(attitude)) return null;
  if (isStableByDeathSaves(conditionInstances(conditions))) return null;
  return readDeathSaves({ deathSaves });
}
