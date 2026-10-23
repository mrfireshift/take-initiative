import { sanitizeQuickActions } from "./quickActionsCore.js";
import { pcAttackAction, pcAttackBreathActionsForCard, pcAttackCantripIds, pcAttackSpellIds } from "./pcAttackCore.js";
import { getPcAttackCantrip } from "./pcAttackCantripCatalog.js";
import { getPcAttackSpell } from "./pcAttackSpellCatalog.js";
import { spellbookCantripAttackAction, spellbookGroupsForProfile, spellbookSpellAttackAction } from "./spellbookCatalog.js";
import { classFeatureDisplayNameWithParent, classFeatureIsReferenceOnly, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { spellbookQuickActionId } from "./spellbookCore.js";

// The attack console's picker: everything the actor can do with an attack or a spell on its turn, one entry each.
// Attacchi: the weapon attacks and the breath weapons. Trucchetti and Incantesimi: the spells of the book the actor
// can cast now (as the 🪄 menu lists them), or, without a book, the ones its attack actions offer. Capacità: the actor's
// class and subclass features at its level and its species traits (the breath weapons stay in Attacchi). The ⚡ quick
// actions stay on the ⚡ button and the character sheet, never in the console.
// mode: "attack" resolves in the console (actionId: the attack action that records it, the first one offering it);
// "launch" goes to the spell panel through the tracker, as the 🪄 menu does (actionId: the book's spell action);
// "weapon" is woven into a melee weapon attack (Booming Blade); "manual" is not automated, the table resolves it;
// "activate" is a feature the tracker activates as the card's context menu does (featureId); "reference" is a feature
// to read (passive, triggered, reference only).
export const PC_ATTACK_PICKER_TABS = Object.freeze([
  Object.freeze({ id: "attacks", label: "Attacchi" }),
  Object.freeze({ id: "cantrips", label: "Trucchetti" }),
  Object.freeze({ id: "spells", label: "Incantesimi" }),
  Object.freeze({ id: "features", label: "Capacità" }),
]);

export function pcAttackPickerKey(actionId, spellId = "") {
  return spellId ? `${actionId}::${spellId}` : String(actionId || "");
}

const attackLabel = (spellId) => getPcAttackCantrip(spellId)?.name || getPcAttackSpell(spellId)?.name || spellId;

// [{ key, tab, actionId, spellId, label, mode, level, concentration, ritual, recordOnly, pinned }], grouped by tab.
// card: the actor's card (its quick actions, book, build and traits); a plain list of quick actions is read as one.
export function pcAttackPickerEntries(card) {
  const profile = Array.isArray(card) ? { quickActions: card } : (card && typeof card === "object" ? card : {});
  const quickActions = sanitizeQuickActions(profile.quickActions, { limit: 64, attackLimit: 64 });
  const entries = { attacks: [], cantrips: [], spells: [], features: [] };
  const seen = new Set();
  const add = (tab, actionId, spellId, label, extra = {}) => {
    const unique = spellId ? `${tab}::${spellId}` : pcAttackPickerKey(actionId);
    if (seen.has(unique)) return;
    seen.add(unique);
    entries[tab].push({ key: pcAttackPickerKey(actionId || "book", spellId), tab, actionId, spellId, label, mode: "attack", level: null,
      concentration: false, ritual: false, recordOnly: false, pinned: false, ...extra });
  };
  const attackActions = quickActions.map(pcAttackAction).filter(Boolean);
  const addOffered = (action, explicitOnly) => {
    if (explicitOnly && !action.source?.spellIds?.length) return;
    const cantrip = action.source?.kind === "cantrip";
    for (const spellId of cantrip ? pcAttackCantripIds(action) : pcAttackSpellIds(action)) {
      add(cantrip ? "cantrips" : "spells", action.id, spellId, attackLabel(spellId), { level: cantrip ? 0 : getPcAttackSpell(spellId)?.level ?? null });
    }
  };
  for (const action of attackActions) {
    if (!["cantrip", "spell"].includes(action.source?.kind)) add("attacks", action.id, "", action.label || action.id);
  }
  for (const action of pcAttackBreathActionsForCard(profile)) add("attacks", action.id, "", action.label || action.id);
  entries.features = pcAttackFeatureEntries(profile);
  const book = spellbookGroupsForProfile(profile)
    .filter((group) => group.level !== null)
    .flatMap((group) => group.spells.filter((spell) => spell.prepared).sort((left, right) => Number(right.pinned) - Number(left.pinned)));
  if (!book.length) {
    for (const action of attackActions) if (["cantrip", "spell"].includes(action.source?.kind)) addOffered(action, false);
    return PC_ATTACK_PICKER_TABS.flatMap((tab) => entries[tab.id]);
  }
  for (const spell of book) {
    const tab = spell.level === 0 ? "cantrips" : "spells";
    const details = { level: spell.level, concentration: spell.concentration, ritual: spell.ritual, recordOnly: spell.recordOnly, pinned: spell.pinned };
    const attack = spell.level === 0 ? spellbookCantripAttackAction(quickActions, spell.id) : spellbookSpellAttackAction(quickActions, spell.id);
    const offered = attack && (spell.level === 0 ? pcAttackCantripIds(attack) : pcAttackSpellIds(attack)).includes(spell.id);
    if (offered) add(tab, attack.id, spell.id, attackLabel(spell.id), details);
    else if (getPcAttackCantrip(spell.id)?.delivery === "weapon") add(tab, "", spell.id, spell.label, { ...details, mode: "weapon" });
    else if (spell.launchable) add(tab, spellbookQuickActionId(spell.id), spell.id, spell.label, { ...details, mode: "launch" });
    else add(tab, "", spell.id, spell.label, { ...details, mode: "manual" });
  }
  // A list the attack action names itself (a species or feat cantrip) stays, even when the book does not hold it.
  for (const action of attackActions) if (["cantrip", "spell"].includes(action.source?.kind)) addOffered(action, true);
  return PC_ATTACK_PICKER_TABS.flatMap((tab) => entries[tab.id]);
}

// Capacità: the features the card's context menu activates first ("Utilizzabili", the same rule as
// buildClassFeatureContextEntries), then the others ("Altre capacità"), each in catalog order. group: "usable" or
// "other"; activation: the catalog's (azione, azione bonus, reazione, passiva, innesco…); species: a species trait.
const ACTIVATION_LABELS = Object.freeze({
  azione: "azione", azione_bonus: "azione bonus", reazione: "reazione", passiva: "passiva", innesco: "innesco",
  azione_attacco: "con l'attacco", contenitore_opzioni: "",
});
const activationLabel = (value) => {
  const raw = String(value || "").trim();
  return Object.hasOwn(ACTIVATION_LABELS, raw) ? ACTIVATION_LABELS[raw] : raw.replaceAll("_", " ");
};

export function pcAttackFeatureEntries(profile) {
  const entries = getEnabledClassFeatures(profile).filter((feature) => !feature.breath).map((feature) => {
    const usable = !classFeatureIsReferenceOnly(feature) && feature.quickActionEligible !== false;
    return { key: `feature::${feature.id}`, tab: "features", actionId: "", spellId: "", featureId: feature.id,
      label: classFeatureDisplayNameWithParent(feature), mode: usable ? "activate" : "reference", group: usable ? "usable" : "other",
      activation: activationLabel(feature.activation?.primary), species: !!(feature.speciesId || feature.giftId),
      level: null, concentration: false, ritual: false, recordOnly: false, pinned: false };
  });
  return [...entries.filter((entry) => entry.group === "usable"), ...entries.filter((entry) => entry.group === "other")];
}

// The entry the console shows for this action and spell: the exact one, else the action's first entry.
export function pcAttackPickerEntryFor(entries, actionId, spellId = "") {
  const list = Array.isArray(entries) ? entries : [];
  return list.find((entry) => entry.actionId === actionId && entry.spellId === (spellId || ""))
    || list.find((entry) => entry.actionId === actionId)
    || null;
}

// The entry the console opens with: the one asked for (the ⚔ or 🪄 menu), else the attacker's last attack, else the
// first weapon attack, else the first entry. tab: only within that tab (the GM switched tab). attackOnly: only the
// entries the console resolves (the runtime loads an attack action).
export function pcAttackPickerDefault(entries, { actionId = "", spellId = "", lastAttack = null, tab = "", attackOnly = false } = {}) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((entry) => (!tab || entry.tab === tab) && (!attackOnly || entry.mode === "attack"));
  if (actionId) {
    const requested = pcAttackPickerEntryFor(list, actionId, spellId);
    if (requested) return requested;
  }
  const last = lastAttack?.quickActionId ? pcAttackPickerEntryFor(list, lastAttack.quickActionId, lastAttack.spellId || "") : null;
  return last || list[0] || null;
}

// The tabs that have at least one entry.
export function pcAttackPickerTabs(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return PC_ATTACK_PICKER_TABS.filter((tab) => list.some((entry) => entry.tab === tab.id));
}
