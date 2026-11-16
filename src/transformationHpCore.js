// Trasformazioni, lotto W5a (docs/PIANO_TRASFORMAZIONI.md §5.1): the hit points of a form, in three pure plans.
// - Start: the creature takes the form's HP; its own wait in the pill (the stash), which the coordinator writes in the
//   command that puts the pill there (W5b).
// - Back at 0 HP of the form: the creature returns with its own HP less the excess, the damage past the form's HP.
// - The end any other way (its action, its duration, the ✕, a rest): its own HP come back whole.
// The temporary hit points stay in their field all along and take the damage first (G18). The effects on the maximum
// (Aid, Harm, Heroes' Feast) move the stash, never the form's HP (G33). Nothing here reads or writes the scene: the
// coordinator, the area panel, the rest and the memory put these values in their own writes. Light on purpose (no
// 5eTools, no catalogs): the background and the memory load it.
import { quickHPStateOf } from "./quickHpCore.js";
import { planMaxHpChange } from "./maxHpModifierCore.js";

// The mark on a removal whose HP were already written by the return at 0 (or by a rest): the coordinator does not write
// the stash over them when the pill ends (§5.1, «Il segno sulla rimozione»).
export const TRANSFORMATION_REVERTED_FLAG = "transformationReverted";
export const TRANSFORMATION_RECORD_KIND = "transformation";

const integerAtLeast = (value, min) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= min ? number : null;
};

function conditionInstances(conditions) {
  return Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
}

// The form's hit points (G18): the ones chosen with the form, else its stat block's average. They are its maximum too.
export function transformationFormHpOf(instance) {
  const template = instance?.mechanics?.transformation;
  if (!template || typeof template !== "object" || !template.form) return null;
  // Lotto W7e: a form that brings temporary hit points (Mass Polymorph) swaps none.
  if (template.hitPoints === "temporary") return null;
  return integerAtLeast(template.formHp, 1) ?? integerAtLeast(template.form?.hitPoints?.average, 1);
}

// Lotto W7e: the temporary hit points a form brings instead of its own (Mass Polymorph), or null.
export function transformationTemporaryHpOf(instance) {
  const template = instance?.mechanics?.transformation;
  if (!template || typeof template !== "object" || !template.form || template.hitPoints !== "temporary") return null;
  return integerAtLeast(template.formHp, 1) ?? integerAtLeast(template.form?.hitPoints?.average, 1);
}

// Lotto W7e: the pill whose temporary hit points no other source replaces (mechanics.tempHpLocked), when it is the
// creature's source (meta.tempHpSource) and is active.
export function lockedTemporaryHpPill(meta = {}) {
  const source = String(meta?.tempHpSource || "").trim();
  if (!source) return null;
  return conditionInstances(meta?.conditions).find((instance) => instance && instance.active !== false
    && String(instance.id || "") === source && instance.mechanics?.tempHpLocked === true) || null;
}

// Decision G25: why a creature does not take a form's hit points, said in its pill's detail.
export const TRANSFORMATION_LABEL_NOTES = Object.freeze({
  boss: "Qui la forma resta un'etichetta (modalità boss): PF, attacchi e CA restano quelli del boss.",
  token: "Qui la forma resta un'etichetta (token di un incantesimo): PF e statistiche restano quelli del token.",
  shared: "Qui la forma resta un'etichetta (PF condivisi): PF e statistiche restano quelli della creatura.",
  untracked: "Qui la forma resta un'etichetta (PF non tracciati): PF e statistiche si gestiscono a mano.",
});

// Decision G25: the options of a form's pill for a creature whose HP the coordinator does not swap: a label that names
// the form, with the reason in its detail; the form, its speeds and its defenses leave the pill, so nothing else reads it.
export function transformationConditionOptionsAsLabel(options = {}, reason = "untracked") {
  const { transformation: _form, movement: _movement, damageDefenses: _defenses, ...mechanics } = options?.mechanics || {};
  const note = TRANSFORMATION_LABEL_NOTES[reason] || TRANSFORMATION_LABEL_NOTES.untracked;
  const detail = String(options?.effectDetail || "").trim();
  const next = { ...options, effectDetail: detail ? `${detail} ${note}` : note };
  if (Object.keys(mechanics).length) next.mechanics = mechanics;
  else delete next.mechanics;
  return next;
}

// An active pill with a form and its hit points: one whose HP the coordinator may swap.
export function isTransformationFormPill(instance) {
  return !!instance && instance.active !== false && transformationFormHpOf(instance) !== null;
}

// The creature's own HP a pill keeps ({ hp, hpMax }), when the plugin swapped them; else null. A pill of a form put
// before W5, or from the character sheet without a form, has none: its HP were never swapped.
export function transformationStashOf(instance) {
  const stash = instance?.mechanics?.transformation?.stash;
  const hp = integerAtLeast(stash?.hp, 0);
  const hpMax = integerAtLeast(stash?.hpMax, 1);
  return hp === null || hpMax === null ? null : { hp, hpMax };
}

// The active form whose HP the plugin swapped, from a list of conditions or a meta's conditions.
export function transformationHpPill(conditions) {
  return conditionInstances(conditions).find((instance) => isTransformationFormPill(instance) && transformationStashOf(instance))
    || null;
}

// The creature's own HP while in a form (the memory keeps these, §5.8), or null outside a form.
export function transformationStashForMeta(meta) {
  const pill = transformationHpPill(meta?.conditions);
  return pill ? transformationStashOf(pill) : null;
}

// The creature's own HP: the stash in a form, the token's otherwise (raw, as stored).
export function transformationNormalHp(meta) {
  return transformationStashForMeta(meta) || { hp: meta?.hp, hpMax: meta?.hpMax };
}

// The pill with its stash.
export function withTransformationStash(instance, stash) {
  return {
    ...instance,
    mechanics: {
      ...instance.mechanics,
      transformation: { ...instance.mechanics.transformation, stash: { hp: stash.hp, hpMax: stash.hpMax } },
    },
  };
}

export function transformationPillLabel(instance) {
  return String(instance?.displayLabel || instance?.condition || "Forma").trim();
}

const record = (itemId, text) => ({ id: String(itemId || ""), kind: TRANSFORMATION_RECORD_KIND, text });

/**
 * Start (§5.1). state: the creature's HP as the command leaves them ({ hp, hpMax }, without temporary hit points).
 * previous: the stash of a form it is already in (G28: a new form keeps the normal one's). currentHp: the HP of that
 * form; Shapechange's new form does not raise them. Returns { stash, hp, hpMax, record } or null without the form's HP.
 */
export function planTransformationStart({ itemId = "", pill = null, state = {}, previous = null, currentHp = null } = {}) {
  const formHp = transformationFormHpOf(pill);
  if (formHp === null) return null;
  const stash = previous
    ? { hp: previous.hp, hpMax: previous.hpMax }
    : { hp: Math.max(0, Math.floor(Number(state.hp) || 0)), hpMax: Math.max(1, Math.floor(Number(state.hpMax) || 0)) };
  const capped = previous && pill.mechanics.transformation.kind === "shapechange" && integerAtLeast(currentHp, 0) !== null;
  const hp = capped ? Math.min(formHp, integerAtLeast(currentHp, 0)) : formHp;
  return {
    stash,
    hp,
    hpMax: formHp,
    record: record(itemId, `${transformationPillLabel(pill)}: ${hp} PF della forma, i suoi (${stash.hp}/${stash.hpMax}) messi da parte`),
  };
}

/**
 * Back at 0 HP of the form (§5.1, G34, G40). meta: the creature in its form; hpAfter: the HP the write leaves the form;
 * damageToHp: the damage that reached the form's HP, past the temporary hit points. A death without damage (instantDeath)
 * kills the creature itself. Returns { instanceId, stash, excess, hp, hpMax, record }, or null when the form stays above 0
 * or its HP were never swapped.
 */
export function planTransformationRevert({ itemId = "", meta = {}, hpAfter, damageToHp = 0, instantDeath = false } = {}) {
  if (!(Number(hpAfter) <= 0)) return null;
  const pill = transformationHpPill(meta?.conditions);
  const stash = pill ? transformationStashOf(pill) : null;
  if (!stash) return null;
  const formHp = quickHPStateOf(meta).hp;
  const excess = instantDeath ? stash.hp : Math.max(0, Math.floor(Number(damageToHp) || 0) - formHp);
  const hp = Math.max(0, stash.hp - excess);
  const label = transformationPillLabel(pill);
  const text = instantDeath
    ? `${label}: ucciso nella forma, torna alla sua a 0 PF`
    : excess > 0
      ? `${label}: a 0 PF torna alla sua forma, ${excess} di danno in eccesso sui suoi PF (${stash.hp} → ${hp})`
      : `${label}: a 0 PF torna alla sua forma, con i suoi PF (${stash.hp})`;
  return { instanceId: String(pill.id || ""), stash, excess, hp, hpMax: stash.hpMax, record: record(itemId, text) };
}

/** The end any other way (§5.1): the stash, whole. Returns { hp, hpMax, record } or null without a stash. */
export function planTransformationEnd({ itemId = "", pill = null, stash = transformationStashOf(pill) } = {}) {
  if (!stash) return null;
  return {
    hp: stash.hp,
    hpMax: stash.hpMax,
    record: record(itemId, `${transformationPillLabel(pill)}: torna alla sua forma, con i suoi PF (${stash.hp}/${stash.hpMax})`),
  };
}

// G33: a pill of the maximum that arrives or ends during the form moves the stash, as it would move the creature.
export function transformationStashWithMaxHp(stash, beforeInstances = [], afterInstances = []) {
  const write = planMaxHpChange({ beforeInstances, afterInstances, state: stash });
  return write ? { hp: write.hp, hpMax: write.hpMax } : stash;
}

/**
 * The area panel's change (calculateQuickHPChange, §5.5) on a form it brings to 0 HP: the same change seen on the
 * creature, its own HP before and after (hp, hpMax, afterHP), the damage that reaches them (damageInstance, for the death
 * saves) and a mark. requested stays the whole damage: the concentration save counts it all (§5.7). null otherwise.
 */
export function transformationRevertedChange({ itemId = "", meta = {}, change = null } = {}) {
  if (!change || change.mode !== "damage") return null;
  const absorbed = Math.max(0, Math.floor(Number(change.absorbedByTempHp) || 0));
  const revert = planTransformationRevert({
    itemId,
    meta,
    hpAfter: change.afterHP,
    damageToHp: Math.max(0, Math.floor(Number(change.requested) || 0) - absorbed),
    instantDeath: change.instantDeath === true,
  });
  if (!revert) return null;
  const tempBefore = Math.max(0, Math.floor(Number(change.tempHp) || 0));
  const tempAfter = Math.max(0, Math.floor(Number(change.afterTempHp ?? tempBefore) || 0));
  return {
    revert,
    change: {
      ...change,
      hp: revert.stash.hp,
      hpMax: revert.hpMax,
      afterHP: revert.hp,
      damageInstance: revert.excess,
      delta: revert.hp + tempAfter - revert.stash.hp - tempBefore,
      changed: true,
      transformationReverted: true,
    },
  };
}

/**
 * G35: a preview whose damage brings a form to 0 HP says where the creature lands: back with its own HP less the excess.
 * stash: the creature's own HP (transformationStashForMeta); change: the preview's calculateQuickHPChange on the form.
 * Returns { before, after, hpMax, text } or null.
 */
export function transformationPreviewReturn({ stash = null, change = null } = {}) {
  if (!stash || change?.mode !== "damage" || !(Number(change.afterHP) <= 0)) return null;
  const reached = Math.max(0, Math.floor(Number(change.requested) || 0) - Math.max(0, Math.floor(Number(change.absorbedByTempHp) || 0)));
  const excess = Math.max(0, reached - Math.max(0, Math.floor(Number(change.hp) || 0)));
  const after = Math.max(0, stash.hp - excess);
  return { before: stash.hp, after, hpMax: stash.hpMax, text: `torna alla sua forma: PF ${stash.hp} → ${after} (max ${stash.hpMax})` };
}
