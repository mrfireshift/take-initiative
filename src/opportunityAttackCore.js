// Avvisi di reazione, lot R5 (docs/STUDIO_AVVISI_REAZIONE.md §6.16, decisions J1-J5): who a movement lets react.
// Pure: the caller gives the creatures, the positions the mover went through and a distance function in squares.
// - Leaving a reach (Opportunity Attack): a creature had the mover within its reach at a point of the movement and not
//   at a later one (J2: with the Movimento tool every square counts, so leaving and coming back in one drag provokes).
// - Entering (Halo of Spores, 3 m): the mover is within 3 m at the end and was not at the start.
// The mover with "Movimento: no AdO" (Zephyr Strike) or "Disimpegno" (the Disengage action of the attack console's Azioni
// tab, docs/STUDIO_AZIONI_DI_TURNO.md, D4) provokes nothing; a Disengage taken at the table the plugin cannot know (J3).
// A reactor with Sentinel (lot F6-2 of docs/STUDIO_TALENTI.md) still reacts to a Disengage; Zephyr Strike, which is not
// one, keeps it out too.
// - Entering a reach (Polearm Master, lot F6-3): the mover is outside the reach of a reactor with the feat at a point of
//   the movement and inside at a later one; an opportunity attack too, so the Disengage and Zephyr Strike keep it out
//   (Sentinel's exception speaks of leaving the reach).
import { ID } from "./constants.js";
import { FEAT_LONG_REACH_METERS, featFeaturesForProfile, sanitizeFeats } from "./featCatalog.js";

const META_KEY = `${ID}/meta`;
export const DEFAULT_REACH_METERS = 1.5;
export const HALO_RANGE_METERS = 3;
export const NO_OPPORTUNITY_PILL = "Movimento: no AdO";
// pcAttackTurnActionCore.js: DISENGAGE_CONDITION.
export const DISENGAGE_PILL = "Disimpegno";
const FEET_TO_METERS = 0.3;

const text = (value, limit = 220) => String(value ?? "").trim().slice(0, limit);
const metaOf = (item) => item?.metadata?.[META_KEY] || {};

// Polearm Master's record and feat (featCatalog.js).
export const POLEARM_MASTER_FEATURE_ID = "talento-maestro-delle-armi-su-asta";
const POLEARM_MASTER_FEAT_ID = "maestro-delle-armi-su-asta";

// A creature's reach: 1.5 m, or the longest reach of the melee attacks on its sheet (a monster's 10 ft.), or the 3 m
// chosen with Polearm Master (lot F6-3, decision K3: a glaive, a halberd or a pike).
export function reactorReachMeters(item) {
  const actions = Array.isArray(metaOf(item).initiativeCard?.quickActions) ? metaOf(item).initiativeCard.quickActions : [];
  const longest = actions
    .filter((action) => action && action.kind === "attack" && action.range !== "ranged")
    .map((action) => Math.floor(Number(action.reachFeet)))
    .filter((feet) => Number.isFinite(feet) && feet > 5 && feet <= 300)
    .reduce((max, feet) => Math.max(max, feet), 5);
  const meters = Math.round(longest * FEET_TO_METERS * 10) / 10;
  const polearm = sanitizeFeats(metaOf(item).initiativeCard?.feats).find((entry) => entry.id === POLEARM_MASTER_FEAT_ID);
  return Number(polearm?.choice?.reachMeters) === FEAT_LONG_REACH_METERS ? Math.max(meters, FEAT_LONG_REACH_METERS) : meters;
}

// Zephyr Strike's "Movimento: no AdO" on the mover: its spell pill (supplementSpellRules.js), or a pill with that label.
export const ZEPHYR_STRIKE_SPELL_ID = "xanathar-colpo-dello-zefiro";
const activeConditions = (item) => (Array.isArray(metaOf(item).conditions?.instances) ? metaOf(item).conditions.instances : [])
  .filter((entry) => entry?.active !== false);
function hasNoOpportunityPill(item) {
  const meta = metaOf(item);
  const spells = Array.isArray(meta[`${ID}/spells`]) ? meta[`${ID}/spells`] : [];
  return spells.some((pill) => text(pill?.spellId) === ZEPHYR_STRIKE_SPELL_ID || JSON.stringify(pill || {}).includes(NO_OPPORTUNITY_PILL))
    || activeConditions(item).some((entry) => text(entry?.condition, 80) === NO_OPPORTUNITY_PILL);
}
// Drunken Technique's pill (Way of the Drunken Master, put with Flurry of Blows): the benefit of the Disengage action
// (lot T4a of docs/STUDIO_AZIONI_DI_TURNO.md), so Sentinel's exception holds against it too.
export const DRUNKEN_TECHNIQUE_PILL = "Tecnica dell'Ubriaco";
// The Disengage action's pill: no opportunity attack, except from a reactor with Sentinel.
const hasDisengagePill = (item) => activeConditions(item)
  .some((entry) => [DISENGAGE_PILL, DRUNKEN_TECHNIQUE_PILL].includes(text(entry?.condition, 80)));
// Sentinel's record (featCatalog.js), on the reactor's sheet.
export const SENTINEL_FEATURE_ID = "talento-sentinella";
const hasFeatRecord = (reactor, featureId) => featFeaturesForProfile(metaOf(reactor).initiativeCard || {})
  .some((feature) => feature.id === featureId);
const ignoresDisengage = (reactor) => hasFeatRecord(reactor, SENTINEL_FEATURE_ID);

const validPoint = (point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));

/**
 * mover: the item that moved (its metadata as now); path: the positions it went through, the start first and the
 * end last; others: the creatures that may react (the caller keeps those in the initiative order); distance(a, b):
 * meters in squares, or null when unknown. Returns the reaction events: { trigger: "move-leave" | "move-enter-reach"
 * | "move-enter", moverId, reactorIds }, only those with reactors.
 */
export function movementReactionEvents({ mover = null, path = [], others = [], distance = null } = {}) {
  const points = (Array.isArray(path) ? path : []).filter(validPoint);
  if (!mover?.id || points.length < 2 || typeof distance !== "function") return [];
  const at = (point) => ({ ...mover, position: { x: Number(point.x), y: Number(point.y) } });
  const steps = points.map(at);
  const measure = (reactor, step) => {
    const value = distance(reactor, step);
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const leaving = [];
  const enteringReach = [];
  const entering = [];
  const noOpportunity = hasNoOpportunityPill(mover);
  const disengaged = hasDisengagePill(mover);
  for (const reactor of Array.isArray(others) ? others : []) {
    if (!reactor?.id || reactor.id === mover.id) continue;
    if (!noOpportunity && (!disengaged || ignoresDisengage(reactor))) {
      const reach = reactorReachMeters(reactor) + 1e-6;
      let inside = false;
      for (const step of steps) {
        const meters = measure(reactor, step);
        if (meters === null) { inside = false; break; }
        if (meters <= reach) inside = true;
        else if (inside) { leaving.push(reactor.id); break; }
      }
    }
    // Polearm Master (lot F6-3): entering the reach, every square counting as for leaving it.
    if (!noOpportunity && !disengaged && hasFeatRecord(reactor, POLEARM_MASTER_FEATURE_ID)) {
      const reach = reactorReachMeters(reactor) + 1e-6;
      let outside = false;
      for (const step of steps) {
        const meters = measure(reactor, step);
        if (meters === null) break;
        if (meters > reach) outside = true;
        else if (outside) { enteringReach.push(reactor.id); break; }
      }
    }
    const first = measure(reactor, steps[0]);
    const last = measure(reactor, steps[steps.length - 1]);
    if (first !== null && last !== null && first > HALO_RANGE_METERS + 1e-6 && last <= HALO_RANGE_METERS + 1e-6) entering.push(reactor.id);
  }
  return [
    ...(leaving.length ? [{ trigger: "move-leave", moverId: mover.id, reactorIds: leaving }] : []),
    ...(enteringReach.length ? [{ trigger: "move-enter-reach", moverId: mover.id, reactorIds: enteringReach }] : []),
    ...(entering.length ? [{ trigger: "move-enter", moverId: mover.id, reactorIds: entering }] : []),
  ];
}

// The creature whose turn it is (J1), from the initiative state: its token id, without the Paragon part ("::p2").
export function activeTurnCreatureId(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const index = Math.floor(Number(state?.current));
  if (!order.length || !Number.isInteger(index) || index < 0 || index >= order.length) return "";
  return text(order[index]).replace(/::p\d+$/u, "");
}

// The turn's key: a new round or a new creature closes the movement prompt (J5).
export function reactionTurnKey(state) {
  return `${Math.floor(Number(state?.round)) || 0}:${Math.floor(Number(state?.current)) || 0}`;
}
