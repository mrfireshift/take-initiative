// A buff that gives a spell's effect (Potion of Speed → Haste): each drinker casts the spell on
// themself, without concentration, for the buff's duration, through the regular spell engine.
// The spell catalog and executor are large, so they load only when a spell buff is applied.
import OBR from "@owlbear-rodeo/sdk";
import { buffSpellDefinition } from "./buffPresetCore.js";

export async function loadBuffSpellOptions() {
  const { getTrackableSpellOptions } = await import("./spells-srd.js");
  return getTrackableSpellOptions();
}

export async function loadBuffSpellChoices(spellRef) {
  const { getSpellDefinition } = await import("./spells-srd.js");
  const spell = getSpellDefinition(spellRef);
  return spell ? { spell, choices: Array.isArray(spell.effectChoices) ? spell.effectChoices : [] } : null;
}

export async function applyBuffSpell({
  targetIds = [],
  spellRef = "",
  choice = "",
  rounds = 1,
  buffName = "",
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  const { getSpellDefinition } = await import("./spells-srd.js");
  const { executeSpellApplication } = await import("./spellApplicationExecutor.js");
  const spell = getSpellDefinition(spellRef);
  if (!spell) throw new Error("buff-spell-not-found");
  const items = await OBR.scene.items.getItems(targetIds);
  const changedIds = new Set();
  for (const item of items) {
    if (typeof isCurrent === "function" && !isCurrent()) break;
    const spellName = spell.displayName || spell.name;
    const changed = await executeSpellApplication({
      spell: buffSpellDefinition(spell),
      turns: rounds,
      casterId: item.id,
      targetIds: [item.id],
      casterName: item.name || "",
      castContext: { slotLevel: Number(spell.level) || 0 },
      selectedChoice: choice,
      historyLabel: buffName && buffName !== spellName ? `${buffName}: ${spellName}` : spellName,
      ignoreTargetLimit: true,
      ...(sceneIdentity ? { sceneIdentity } : {}),
      ...(commandId ? { commandId: `${commandId}:spell:${item.id}` } : {}),
      ...(typeof isCurrent === "function" ? { isCurrent: () => isCurrent() } : {}),
    });
    for (const id of Array.isArray(changed) ? changed : []) changedIds.add(id);
  }
  return [...changedIds];
}
