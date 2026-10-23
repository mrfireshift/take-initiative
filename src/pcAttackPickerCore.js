import { sanitizeQuickActions } from "./quickActionsCore.js";
import { pcAttackAction, pcAttackCantripIds, pcAttackSpellIds } from "./pcAttackCore.js";
import { getPcAttackCantrip } from "./pcAttackCantripCatalog.js";
import { getPcAttackSpell } from "./pcAttackSpellCatalog.js";

// The attack console's picker: the actor's weapon attacks, its cantrips and its leveled attack spells, one entry each.
// A cantrip or spell entry points at the quick action that records it (the first one offering it, as the spellbook does).
export const PC_ATTACK_PICKER_TABS = Object.freeze([
  Object.freeze({ id: "attacks", label: "Attacchi" }),
  Object.freeze({ id: "cantrips", label: "Trucchetti" }),
  Object.freeze({ id: "spells", label: "Incantesimi" }),
]);

export function pcAttackPickerKey(actionId, spellId = "") {
  return spellId ? `${actionId}::${spellId}` : String(actionId || "");
}

// [{ key, tab, actionId, spellId, label }] in the order of the card, grouped by tab.
export function pcAttackPickerEntries(quickActions) {
  const entries = { attacks: [], cantrips: [], spells: [] };
  const seen = new Set();
  const add = (tab, actionId, spellId, label) => {
    const key = pcAttackPickerKey(actionId, spellId);
    const unique = spellId ? `${tab}::${spellId}` : key;
    if (seen.has(unique)) return;
    seen.add(unique);
    entries[tab].push({ key, tab, actionId, spellId, label });
  };
  for (const value of sanitizeQuickActions(quickActions, { limit: 64, attackLimit: 64 })) {
    const action = pcAttackAction(value);
    if (!action) continue;
    if (action.source?.kind === "cantrip") {
      for (const spellId of pcAttackCantripIds(action)) add("cantrips", action.id, spellId, getPcAttackCantrip(spellId)?.name || spellId);
    } else if (action.source?.kind === "spell") {
      for (const spellId of pcAttackSpellIds(action)) {
        const spell = getPcAttackSpell(spellId);
        add("spells", action.id, spellId, spell ? `${spell.name} · ${spell.level}°` : spellId);
      }
    } else {
      add("attacks", action.id, "", action.label || action.id);
    }
  }
  return PC_ATTACK_PICKER_TABS.flatMap((tab) => entries[tab.id]);
}

// The entry the console shows for this action and spell: the exact one, else the action's first entry.
export function pcAttackPickerEntryFor(entries, actionId, spellId = "") {
  const list = Array.isArray(entries) ? entries : [];
  return list.find((entry) => entry.actionId === actionId && entry.spellId === (spellId || ""))
    || list.find((entry) => entry.actionId === actionId)
    || null;
}

// The entry the console opens with: the one asked for (the ⚔ or 🪄 menu), else the attacker's last attack, else the
// first weapon attack, else the first entry. tab: only within that tab (the GM switched tab).
export function pcAttackPickerDefault(entries, { actionId = "", spellId = "", lastAttack = null, tab = "" } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => !tab || entry.tab === tab);
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
