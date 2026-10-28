// CAP-REACTION, lotto 1: the buttons of the attack consoles' reactions (attackReactionsCore.js). The retaliation's
// damage on the attacker is a command of its own, with its History entry and the usual post-damage projections;
// Shield is cast as the spellbook casts it (slot and reaction in its command); the other reactions open the spell
// panel ready for them.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { componentDamageAfterDefense, damageDefenseFor, damageDefensesForItem, damageTypeLabel } from "./damageDefensesCore.js";
import { calculateQuickHPChange, QUICK_HP_FACTORS, QUICK_HP_MODES } from "./quickHpCore.js";
import { takesDeathSaveDamage } from "./deathSaveCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const META_KEY = `${ID}/meta`;
const SPELLS_POPOVER_ID = `${ID}/spells-modal`;
const snapshot = (meta, field) => (Object.hasOwn(meta || {}, field) ? { present: true, value: meta[field] } : { present: false });
const newId = () => `attack-reaction:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`}`;

// The damage the attacker takes, after its own defense against the type: { ok, damage, message }.
export async function applyRetaliationDamage({ attackerId = "", amount = 0, type = "", label = "Ritorsione", obr = OBR } = {}) {
  const rolled = Math.max(0, Math.floor(Number(amount) || 0));
  if (!rolled) return { ok: false, message: "Inserisci il danno tirato." };
  const sceneEpoch = currentSceneEpoch();
  const [item] = await obr.scene.items.getItems([attackerId]);
  const meta = item?.metadata?.[META_KEY] || {};
  if (!item || !Object.hasOwn(meta, "hp") || !Object.hasOwn(meta, "hpMax")) return { ok: false, message: "L'attaccante non ha punti ferita nel tracker." };
  const defense = damageDefenseFor(damageDefensesForItem(item, META_KEY), type);
  const damage = componentDamageAfterDefense(rolled, "full", defense);
  const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: damage, factor: QUICK_HP_FACTORS.FULL,
    hp: meta.hp, hpMax: meta.hpMax, deathSaveDamage: takesDeathSaveDamage(meta) });
  const name = item.name || item.id;
  const message = `${label}: ${damage} danni da ${damageTypeLabel(type)} a ${name}${defense === "resistance" ? " (resistenza)" : defense === "immunity" ? " (immune)" : ""}.`;
  if (!change.changed) return { ok: true, damage, message };
  const commandId = newId();
  const [{ getEffectsMutationSceneContext, requireAppliedEffectsMutation, runEffectsMutation }, { postBossDamage }] = await Promise.all([
    import("./effectsMutations.js"), import("./bossActionExecution.js"),
  ]);
  const scene = await getEffectsMutationSceneContext({ commandId });
  if (!isCurrentSceneEpoch(sceneEpoch)) return { ok: false, message: "Scena cambiata: riprova." };
  const historyLabel = `${label} · ${name}`;
  const result = await runEffectsMutation([{ type: "hp:set", updates: [{
    itemId: item.id, hp: change.afterHP, hpMax: change.hpMax,
    hpIntent: { mode: "damage", amount: change.requested, eventId: commandId },
    expectedHP: snapshot(meta, "hp"), expectedHPMax: snapshot(meta, "hpMax"),
  }] }], {
    commandId, correlationId: commandId, kind: "spell-retaliation", label: historyLabel, targetIds: [item.id],
    sceneIdentity: scene?.sceneIdentity, sceneEpoch,
    history: { kind: "spell-retaliation", label: historyLabel, payload: { retaliation: { label, damage, type } } },
  });
  requireAppliedEffectsMutation(result);
  await postBossDamage({ item, change, result, sceneEpoch, sceneIdentity: scene?.sceneIdentity, isCurrent: () => isCurrentSceneEpoch(sceneEpoch) });
  return { ok: true, damage, message };
}

// The spell panel ready for a reaction: its caster, the targets and the variant (Absorb Elements' type).
export async function openReactionSpellPanel({ spellId = "", casterId = "", targetIds = [], variant = "", obr = OBR } = {}) {
  const { buildSpellUnifiedPanelRouteQuery } = await import("./spellUnifiedPanelRoutingCore.js");
  const query = buildSpellUnifiedPanelRouteQuery({ spellId, casterId, targetIds, ...(variant ? { variant } : {}) });
  try { await obr.popover.close(SPELLS_POPOVER_ID); } catch {}
  await obr.popover.open({
    id: SPELLS_POPOVER_ID,
    url: `/spell-unified-panel.html?${query}`,
    width: 640,
    height: 640,
    anchorReference: "POSITION",
    anchorPosition: { left: 60, top: 60 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
  });
}

// Shield cast as the spellbook casts it: its slot and the reaction in its command. Without a slot left, or a choice to
// make, the panel opens instead. { ok, message }.
export async function castReactionSpell({ spellId = "", casterId = "", obr = OBR } = {}) {
  const [{ executeDirectQuickAction }, { spellbookQuickAction }] = await Promise.all([
    import("./quickActionExecution.js"), import("./spellbookCatalog.js"),
  ]);
  const [caster] = await obr.scene.items.getItems([casterId]);
  const action = spellbookQuickAction(spellId);
  if (!caster || !action) return { ok: false, message: "Incantesimo non disponibile." };
  const result = await executeDirectQuickAction({
    action, sourceItem: caster, selectedTargetIds: [],
    confirmConcentration: async () => false,
    confirmSpellSlot: async () => false,
  });
  if (result?.mode === "executed") return { ok: true, message: "" };
  if (result?.mode === "cancelled") {
    await openReactionSpellPanel({ spellId, casterId, obr });
    return { ok: false, message: "Nessuno slot o reazione disponibile: completa il lancio nel pannello." };
  }
  await openReactionSpellPanel({ spellId, casterId, obr });
  return { ok: false, message: "Completa il lancio nel pannello incantesimi." };
}
