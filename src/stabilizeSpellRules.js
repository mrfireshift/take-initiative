import { ID } from "./constants.js";
import { cleanseHealingUnaffected, isDiseaseInstance } from "./cleanseSpellRules.js";
import { conditionKey } from "./conditionRulesCore.js";
import {
  DEATH_SAVE_DEAD_CONDITION,
  DEATH_SAVES_FIELD,
  deathSaveConditionIds,
  isDeadByDeathSaves,
  isStableByDeathSaves,
} from "./deathSaveCore.js";
import { quickHPStateOf } from "./quickHpCore.js";

// CAP-STABILIZE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, PHB 2014 texts): spells that read whether a creature is dying
// or dead. The area command reads the live item at the confirmation: a target the spell cannot affect refuses the cast
// before anything is written, so the slot is not spent by mistake. The time limits stay at the table.
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const STABILIZE_SPELL_IDS = Object.freeze([
  "spare-the-dying",
  "revivify",
  "raise-dead",
  "reincarnate",
  "resurrection",
  "true-resurrection",
]);

// The return from death of Raise Dead and Resurrection: -4 to attack rolls, saves and checks, 1 less at each long rest.
// A pill to read: the dice are rolled at the table, so the value is in its name. No effectKind: an instantaneous spell
// leaves no spell pill to show a buff or debuff inside, and the card would hide it. The rest is in groupRestCore.js.
export const RETURN_FROM_DEATH_EFFECT_ID = "return-from-death";
const RETURN_FROM_DEATH_PENALTY = 4;

export function returnFromDeathCondition(penalty) {
  return {
    conditionName: `Ritorno dalla morte −${penalty}`,
    options: {
      type: "spell",
      effectId: RETURN_FROM_DEATH_EFFECT_ID,
      effectDetail: `Il ritorno dalla morte è un travaglio: −${penalty} ai tiri per colpire, ai tiri salvezza e alle prove di caratteristica. Ogni riposo lungo la riduce di 1.`,
      summaryParts: [{ id: "return-from-death-penalty", label: `−${penalty} Att/TS/prove` }],
      mechanics: { returnFromDeathPenalty: penalty },
      expiry: { mode: "manual" },
    },
  };
}

// The pill on a creature, with its penalty.
export function returnFromDeathPill(meta = {}) {
  return instancesOf(meta).find((instance) => String(instance?.effectId || "").trim() === RETURN_FROM_DEATH_EFFECT_ID) || null;
}

// Only the undead: Raise Dead and Resurrection say nothing of constructs.
function undeadOnToken(meta) {
  const type = String(meta?.creatureType || meta?.creatureTypeName || meta?.creatureTypeLabel || "").trim().toLocaleLowerCase("it");
  return /non.?mort|undead/u.test(type);
}
export const STABILIZE_SPELL_ID_SET = new Set(STABILIZE_SPELL_IDS);

// The pills of a zombie that was going to rise (hpBranchSpellRules.js): a creature back to life does not.
const ZOMBIE_EFFECT_IDS = new Set(["finger-of-death-zombie", "negative-energy-flood-zombie"]);

function instancesOf(meta) {
  const conditions = meta?.conditions;
  const instances = Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
  return instances.filter((instance) => instance?.active !== false && String(instance?.id || "").trim());
}

function trackedState(meta) {
  const hp = Number(meta?.hp);
  const hpMax = Number(meta?.hpMax);
  return Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0 ? quickHPStateOf(meta) : null;
}

// Dead: Morto (a PC by its death saves, any creature by a spell), or a creature that is no PC at 0 HP: only PCs roll
// death saves, the others die at 0 HP without a pill.
export function creatureIsDead(meta = {}) {
  if (isDeadByDeathSaves(instancesOf(meta))) return true;
  const state = trackedState(meta);
  return !!state && state.hp <= 0 && String(meta?.attitude || "").trim().toLocaleLowerCase("it") !== "pc";
}

// Disintegrate's dust (hpBranchSpellRules.js): only True Resurrection and Wish bring it back.
function disintegrated(meta) {
  return instancesOf(meta).some((instance) => String(instance?.condition || "").trim() === DEATH_SAVE_DEAD_CONDITION
    && /^Disintegrato/u.test(String(instance?.effectDetail || "").trim()));
}

const refused = (error) => ({ error, stabilize: false, clearTally: false, removeInstanceIds: [], healing: 0, note: "" });

// Morto and a zombie that was going to rise, with what else the spell ends.
function revivalRemovals(instances, also = () => false) {
  const dead = deathSaveConditionIds(instances, DEATH_SAVE_DEAD_CONDITION);
  return [...dead, ...instances.filter((instance) => !dead.includes(String(instance.id).trim())
    && (ZOMBIE_EFFECT_IDS.has(String(instance?.effectId || "").trim()) || also(instance)))
    .map((instance) => String(instance.id).trim())];
}

// What True Resurrection ends besides death: poison, diseases, curses (Bestow Curse, Hex).
const CURSE_SPELL_IDS = new Set(["bestow-curse", "phb2014-sortilegio"]);
function poisonDiseaseOrCurse(instance) {
  return conditionKey(instance) === "avvelenato"
    || isDiseaseInstance(instance)
    || CURSE_SPELL_IDS.has(String(instance?.spellId || "").trim())
    || /^(?:curse-|hex-)/u.test(String(instance?.effectId || "").trim());
}

// A humanoid, as far as the token says: with no creature type on it the GM has already chosen.
function notHumanoid(meta) {
  const type = String(meta?.creatureType || meta?.creatureTypeName || meta?.creatureTypeLabel || "").trim().toLocaleLowerCase("it");
  return !!type && !/umanoid|humanoid/u.test(type);
}

// What the spell does to one creature: error refuses the cast, stabilize adds Stabile, clearTally empties the death
// saves (a stable creature starts again from none), healing is the HP write, note what stays to the GM.
export function planStabilizeTarget({ spellId = "", item = null } = {}) {
  const meta = item?.metadata?.[META_KEY] || {};
  const name = String(item?.name || "La creatura").trim() || "La creatura";
  const state = trackedState(meta);
  if (spellId === "spare-the-dying") {
    if (cleanseHealingUnaffected(meta)) return refused(`${name}: Salvare i morenti non ha effetto su costrutti e non morti.`);
    if (!state) return refused(`${name}: la creatura non ha PF configurati.`);
    if (creatureIsDead(meta)) return refused(`${name}: la creatura è morta, Salvare i morenti non ha effetto.`);
    if (state.hp > 0) return refused(`${name}: la creatura non è a 0 PF.`);
    if (isStableByDeathSaves(instancesOf(meta))) return refused(`${name}: la creatura è già stabile.`);
    return { error: "", stabilize: true, clearTally: Object.prototype.hasOwnProperty.call(meta, DEATH_SAVES_FIELD),
      removeInstanceIds: [], healing: 0, note: "" };
  }
  if (!STABILIZE_SPELL_ID_SET.has(spellId)) return refused(`${name}: incantesimo non previsto.`);
  if (!creatureIsDead(meta)) return refused(`${name}: la creatura non è morta.`);
  const instances = instancesOf(meta);
  const back = { error: "", stabilize: false, clearTally: false, note: "" };
  if (spellId === "true-resurrection") {
    // The curse is a spell too, with its caster's concentration: it ends as with Dispel Magic (spell:remove-requested).
    const spells = Array.isArray(meta[SPELLS_KEY]) ? meta[SPELLS_KEY] : [];
    return { ...back, removeInstanceIds: revivalRemovals(instances, poisonDiseaseOrCurse),
      endSpells: spells.filter((spell) => CURSE_SPELL_IDS.has(String(spell?.spellId || "").trim()) && String(spell?.instanceId || "").trim())
        .map((spell) => ({ instanceId: String(spell.instanceId).trim(), casterId: String(spell.casterId || spell.source || "").trim() })),
      healing: state ? Math.max(0, state.hpMax - state.hp) : 0 };
  }
  if (disintegrated(meta)) return refused(`${name}: disintegrata, torna in vita solo con Resurrezione pura o Desiderio.`);
  if (spellId === "reincarnate" && notHumanoid(meta)) return refused(`${name}: Reincarnazione funziona solo su un umanoide.`);
  if (spellId === "raise-dead" || spellId === "resurrection") {
    if (undeadOnToken(meta)) return refused(`${name}: questo incantesimo non riporta in vita un non morto.`);
    // Poison ends; the only diseases the plugin knows are Contagion's, magical, which these two leave. A second return
    // from death starts the penalty over.
    const existing = returnFromDeathPill(meta);
    const poison = (instance) => conditionKey(instance) === "avvelenato"
      || (!!existing && String(instance.id).trim() === String(existing.id).trim());
    return {
      ...back,
      removeInstanceIds: revivalRemovals(instances, poison),
      returnPenalty: RETURN_FROM_DEATH_PENALTY,
      healing: !state ? 0 : spellId === "resurrection" ? Math.max(0, state.hpMax - state.hp) : state.hp <= 0 ? 1 : 0,
      ...(spellId === "resurrection"
        ? { note: "Se era morta da un anno o più, chi lancia non può lanciare incantesimi e ha svantaggio a tiri per colpire, prove e TS fino a un riposo lungo: segnalo a mano." }
        : {}),
    };
  }
  return {
    ...back,
    removeInstanceIds: revivalRemovals(instances),
    healing: state && state.hp <= 0 ? 1 : 0,
    ...(spellId === "reincarnate"
      ? { note: `${name} torna a 1 PF, ma il testo non indica i PF: regolali tu. Il GM tira il d100 per la nuova razza, da cambiare sulla scheda.` }
      : {}),
  };
}
