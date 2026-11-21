// A monster's traits, reactions and legendary actions in the console's Capacità tab (attacchi dei mostri, fase 4, lotto
// 5): entries to read, with their text, from the full stat block kept in the GM's browser (monsterStatblockTextLoader.js).
// Nothing here is spent or written (decision D9): the legendary actions' pips stay on the tracker. Pure.

// Bonus Actions (lot TD of docs/STUDIO_AZIONI_DI_TURNO.md): the 2024 stat blocks' own section (the goblin's Nimble
// Escape), between the traits and the reactions.
const GROUPS = Object.freeze({ "": "monster-trait", "Bonus Actions": "monster-bonus", Reactions: "monster-reaction",
  "Legendary Actions": "monster-legendary", "Mythic Actions": "monster-legendary" });
export const PC_ATTACK_MONSTER_GROUP_TITLES = Object.freeze({ "monster-trait": "Tratti", "monster-bonus": "Azioni bonus",
  "monster-reaction": "Reazioni", "monster-legendary": "Azioni leggendarie" });

// The cost of a legendary action: "Wing Attack (Costs 2 Actions)" → 2, else 1.
export function legendaryActionCost(name) {
  return Number(String(name || "").match(/\(Costs (\d+) Actions?\)/i)?.[1]) || 1;
}

// The stat block's text of a monster's attack in the console (Testo dello statblock): the entry of its actions, bonus
// actions, reactions or legendary actions whose name is the attack's, without what is in parentheses ("Crushing Grip
// (bonus action)", "Fire Breath (Recharge 5–6)"); for an action split in several attacks ("Spear (melee)"), the one whose
// name opens the label. "" when the view has none.
const actionNameKey = (name) => String(name || "").replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
export function pcAttackMonsterActionText(view, label) {
  const wanted = actionNameKey(label);
  if (!wanted) return "";
  const entries = (Array.isArray(view?.sections) ? view.sections : []).filter((section) => section.title)
    .flatMap((section) => (Array.isArray(section.entries) ? section.entries : []).filter((entry) => entry?.name && entry.text));
  const exact = entries.find((entry) => actionNameKey(entry.name) === wanted);
  const opening = exact || entries.find((entry) => wanted.startsWith(`${actionNameKey(entry.name)} `));
  return opening ? String(opening.text) : "";
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
        activation: group === "monster-reaction" ? "reazione" : group === "monster-bonus" ? "azione bonus"
          : group === "monster-legendary" ? (cost > 1 ? `leggendaria (${cost})` : "leggendaria") : "",
        species: false, level: null, concentration: false, ritual: false, recordOnly: false, pinned: false });
    });
  }
  return entries;
}
