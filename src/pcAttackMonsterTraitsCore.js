// A monster's traits, reactions and legendary actions in the console's Capacità tab (attacchi dei mostri, fase 4, lotto
// 5): entries to read, with their text, from the full stat block kept in the GM's browser (monsterStatblockTextLoader.js).
// Nothing here is spent or written (decision D9): the legendary actions' pips stay on the tracker. Pure.

const GROUPS = Object.freeze({ "": "monster-trait", Reactions: "monster-reaction", "Legendary Actions": "monster-legendary",
  "Mythic Actions": "monster-legendary" });
export const PC_ATTACK_MONSTER_GROUP_TITLES = Object.freeze({ "monster-trait": "Tratti", "monster-reaction": "Reazioni",
  "monster-legendary": "Azioni leggendarie" });

// The cost of a legendary action: "Wing Attack (Costs 2 Actions)" → 2, else 1.
export function legendaryActionCost(name) {
  return Number(String(name || "").match(/\(Costs (\d+) Actions?\)/i)?.[1]) || 1;
}

// view: { header, sections } of monsterStatblockTextView. The entries join the Capacità tab after the class features:
// mode "monster" (a card of its own, never a button), group: traits, reactions, legendary actions.
export function pcAttackMonsterTraitEntries(view) {
  const entries = [];
  for (const section of Array.isArray(view?.sections) ? view.sections : []) {
    const group = GROUPS[section.title];
    if (!group) continue;
    section.entries.forEach((entry) => {
      // The legendary actions' opening paragraph, and a pasted text, have no name.
      if (!entry.name && group !== "monster-trait") return;
      const label = entry.name || "Statblock";
      const cost = group === "monster-legendary" ? legendaryActionCost(label) : 0;
      entries.push({ key: `monster::${entries.length}`, tab: "features", actionId: "", spellId: "", featureId: "", label,
        mode: "monster", group, text: entry.text,
        activation: group === "monster-reaction" ? "reazione" : group === "monster-legendary" ? (cost > 1 ? `leggendaria (${cost})` : "leggendaria") : "",
        species: false, level: null, concentration: false, ritual: false, recordOnly: false, pinned: false });
    });
  }
  return entries;
}
