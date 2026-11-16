// The pills an attack roll reads or spends (lot T2 of docs/STUDIO_AZIONI_DI_TURNO.md, decisions D6, D7, A4):
// - the pills that give advantage to the next attack roll against their bearer, and go with that attack, whoever they
//   come from: the Help action's on an enemy (the first attack of the helper's allies), Distracting Strike's (an attacker
//   other than the fighter), Guiding Bolt's (any attacker). Their text said "remove the label after the attack": the
//   attack console now removes them in the attack's own command;
// - Hidden («Nascosto», the Hide action): advantage to the hidden creature's attack roll, disadvantage to an attack roll
//   against it from whoever cannot see it; it ends when the hidden creature attacks.
// - Dodge («Schivata», the Dodge action and Patient Defense): advantage on Dexterity saves, said on the creature's row
//   of every panel that asks for a save (lot T5).
// Not Versatile Trickster: its advantage lasts the whole turn. Pure: no SDK, DOM or runtime state.
import { ID } from "./constants.js";
import { sanitizeFeats } from "./featCatalog.js";

const META_KEY = `${ID}/meta`;
const SPELLS_FIELD = `${ID}/spells`;

export const HELP_TARGET_CONDITION = "Bersaglio dell'aiuto";
export const HELPED_CONDITION = "Aiutato";
export const HIDDEN_CONDITION = "Nascosto";
// The name Patient Defense's pill has too: a Dodge from either is the same pill.
export const DODGE_CONDITION = "Schivata";
// What a save panel says on the row of a creature in Dodge, for a Dexterity save.
export const DODGE_SAVE_NOTE = "vant. (Schivata)";
// Who spends the pill with an attack roll against its bearer: "ally" (a creature on the side of the pill's source, the
// source excluded), "other" (anyone but the source), "any".
// name: what the console calls it in its reminder.
const RULE_BY_CONDITION = Object.freeze({
  [HELP_TARGET_CONDITION]: Object.freeze({ rule: "ally", name: "Aiuto" }),
  "Colpo Distraente": Object.freeze({ rule: "other", name: "Colpo Distraente" }),
});
const RULE_BY_SPELL = Object.freeze({ "guiding-bolt": Object.freeze({ rule: "any", name: "Dardo tracciante" }) });

function metaOf(item) {
  return item?.metadata?.[META_KEY] || {};
}
function activeInstances(item) {
  const value = metaOf(item).conditions;
  const list = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return list.filter((instance) => instance && instance.active !== false && instance.id);
}
function sideOf(item) {
  const attitude = String(metaOf(item).attitude || "neutral").toLocaleLowerCase("it");
  return attitude === "enemy" ? "enemy" : attitude === "pc" || attitude === "ally" ? "friendly" : "neutral";
}

// The advantage pills on a creature: [{ instance, rule, name, label }].
export function nextAttackAdvantagePills(item) {
  const spells = Array.isArray(metaOf(item)[SPELLS_FIELD]) ? metaOf(item)[SPELLS_FIELD] : [];
  const spellOfInstance = new Map(spells.map((spell) => [String(spell?.instanceId || ""), String(spell?.spellId || "")]));
  return activeInstances(item).flatMap((instance) => {
    const entry = RULE_BY_CONDITION[instance.condition] || RULE_BY_SPELL[spellOfInstance.get(String(instance.parentEffectId || ""))];
    return entry ? [{ instance, rule: entry.rule, name: entry.name, label: String(instance.displayLabel || instance.condition || entry.name) }] : [];
  });
}

// Whether this attacker's attack roll spends the pill (and so has its advantage).
export function advantagePillAppliesTo({ pill, attackerItem, items = [] } = {}) {
  if (!pill || !attackerItem?.id) return false;
  const sourceId = String(pill.instance.sourceId || "");
  if (pill.rule === "any") return true;
  if (attackerItem.id === sourceId) return false;
  if (pill.rule === "other") return true;
  // "ally": the source's side; without the source in the scene, any other attacker.
  const source = (Array.isArray(items) ? items : []).find((item) => item?.id === sourceId);
  if (!source) return true;
  const side = sideOf(source);
  return side !== "neutral" && sideOf(attackerItem) === side;
}

// The pills this attack roll spends on its target.
export function consumedAdvantagePills({ attackerItem, targetItem, items = [] } = {}) {
  if (!targetItem?.id) return [];
  return nextAttackAdvantagePills(targetItem).filter((pill) => advantagePillAppliesTo({ pill, attackerItem, items }));
}

// A creature's Hidden pills.
export function hiddenPills(item) {
  return activeInstances(item).filter((instance) => instance.condition === HIDDEN_CONDITION);
}

// Shield Master (lot F8-1 of docs/STUDIO_TALENTI.md, decision P2): on a Dexterity save against an effect that halves its
// damage, with its reaction it takes none if it succeeds. A reminder beside Dodge's, in the same places; the GM takes the damage.
export const SHIELD_MASTER_SAVE_NOTE = "0 se supera (Maestro degli Scudi)";
export const SHIELD_MASTER_SAVE_TITLE = "Maestro degli Scudi: se supera un TS su Destrezza che dimezza i danni, con la reazione non ne subisce. Il danno lo togli tu.";
export function shieldMasterDexSave(item, ability) {
  return String(ability || "").trim().toLowerCase() === "dex"
    && sanitizeFeats(item?.metadata?.[`${ID}/meta`]?.initiativeCard?.feats).some((entry) => entry.id === "maestro-degli-scudi");
}

// A creature in Dodge, and whether that gives it advantage on this save (an ability: "dex", "con"…).
export function isDodging(item) {
  return activeInstances(item).some((instance) => instance.condition === DODGE_CONDITION);
}
export function dodgeSaveAdvantage(item, ability) {
  return String(ability || "").trim().toLowerCase() === "dex" && isDodging(item);
}
