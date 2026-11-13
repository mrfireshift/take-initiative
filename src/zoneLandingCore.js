// CAP-CARRIAGE (decisions H-3 and H-4 of 12/11/2026): a creature a zone holds up (the Watery Sphere's height, the
// Whirlwind's rise) comes back to the ground when the zone lets it go, however that happens: the save made, the escape,
// the fall out of a full sphere, its pill taken off, the end of the spell. From 3 m up it falls: 1d6 bludgeoning for each
// 3 m, at most 20d6, prone if it takes damage (Player's Handbook), unless the spell's text says otherwise. The pill that
// holds it says which (mechanics.landing.fall): "always" (the Whirlwind), "on-exit" (the Watery Sphere: only the one that
// leaves it with its save falls; its fall-out and its end only leave it prone, as its text says), "none". Heights are in
// squares of the grid, as the rules count them (1.5 m, 5 ft): 3 m are 10 ft, two squares, in a scene in meters or in
// feet alike. Pure: the command's changes, the creatures' heights.

export const ZONE_FALL_EFFECT_ID = "zone-fall";
export const ZONE_FALL_MAX_DICE = 20;
export const ZONE_FALL_SQUARES_PER_DIE = 2;
const LANDING_FALLS = new Set(["always", "on-exit", "none"]);

function conditionsOf(state) {
  const value = state?.conditions;
  const list = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return list.filter((instance) => instance && instance.active !== false);
}

// The landing a pill declares, or null.
export function zoneLandingOf(instance) {
  const landing = instance?.mechanics?.landing;
  if (!landing || typeof landing !== "object") return null;
  return { fall: LANDING_FALLS.has(landing.fall) ? landing.fall : "none" };
}

// The d6 of a fall from that height, in squares: one for each full 3 m (two squares), at most 20; none below.
export function zoneFallDice(squares) {
  const height = Number(squares);
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.min(ZONE_FALL_MAX_DICE, Math.floor((height + 1e-6) / ZONE_FALL_SQUARES_PER_DIE));
}

// The creatures this command lets go: a pill with a landing on the creature before the command, none after. changes:
// the plan's ({ id, before: { conditions }, after: { conditions } }); exitIds: those leaving a zone with their save in
// this command (its ejections); heightOf(id): the creature's height now, in squares. Each: { id, squares, dice }, dice 0
// when it only comes down.
export function planZoneLandings({ changes = [], exitIds = [], heightOf = () => 0 } = {}) {
  const exits = new Set((Array.isArray(exitIds) ? exitIds : []).map((id) => String(id || "").trim()));
  const landings = [];
  for (const change of Array.isArray(changes) ? changes : []) {
    const id = String(change?.id || "").trim();
    if (!id) continue;
    const before = conditionsOf(change.before).filter((instance) => zoneLandingOf(instance));
    if (!before.length) continue;
    // Still held by a zone that lifts: it stays up.
    if (conditionsOf(change.after).some((instance) => zoneLandingOf(instance))) continue;
    const kept = new Set(conditionsOf(change.after).map((instance) => String(instance?.id || "").trim()));
    const released = before.filter((instance) => !kept.has(String(instance?.id || "").trim()));
    if (!released.length) continue;
    const squares = Math.max(0, Number(heightOf(id)) || 0);
    if (squares <= 0) continue;
    const falls = released.some((instance) => {
      const { fall } = zoneLandingOf(instance);
      return fall === "always" || (fall === "on-exit" && exits.has(id));
    });
    landings.push({ id, squares, dice: falls ? zoneFallDice(squares) : 0 });
  }
  return landings;
}

// The pill of a fall: its notice asks for the dice at once and goes when answered (an immediate deferred effect); the
// damage it applies makes the creature prone (buildReminderResolutionPlan). heightText: the height in the scene's unit
// ("6 m", "20 ft").
export function zoneFallConditionOperation({ targetId = "", heightText = "", dice = 0 } = {}) {
  const id = String(targetId || "").trim();
  const count = Math.max(0, Math.floor(Number(dice) || 0));
  const height = String(heightText || "").trim();
  if (!id || !count || !height) return null;
  return {
    type: "condition:add",
    targetIds: [id],
    conditionName: `Caduta da ${height}`,
    options: {
      type: "automatic",
      effectId: ZONE_FALL_EFFECT_ID,
      effectKind: "debuff",
      effectDetail: `${count}d6 contundenti; Prona se subisce danni.`,
      manualRemoval: true,
      expiry: { mode: "manual" },
      deferredEffect: {
        id: ZONE_FALL_EFFECT_ID,
        timing: "immediate",
        actor: "target",
        reminder: `Caduta da ${height}: ${count}d6 contundenti`,
        resolution: { mode: "manual-damage", damage: { dice: `${count}d6`, type: "contundenti" } },
      },
    },
  };
}
