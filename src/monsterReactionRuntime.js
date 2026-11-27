// The reactions of a monster that do something on the map (27/11, Strahd Reloaded, the Wizard of Wines), read from its
// stat block (monsterReactionParseCore.js), used from the reaction prompt of the attack consoles or from the monster's
// own Capacità tab:
// - "cast-when-attacked" (Gift of the Gulthias): the spell on the monster itself, as the spell engine casts it, without
//   concentration when the text says so; its slot and its reaction spent in the same command, so one Annulla gives all
//   of it back;
// - "form-when-targeted" (Guardian of the Gulthias): the form, a pill of the monster-form kind that keeps the creature's
//   own hit points (MONSTER_FORM_TEMPLATE), for the minutes the text says; its reaction spent with it.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { MONSTER_FORM_TEMPLATE, sanitizeTransformationForm, transformationFormNamed, transformationPillParts } from "./transformationFormsCore.js";
import { planReactionSpend } from "./reactionTrackerCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_POPOVER_ID = `${ID}/spells-modal`;
const text = (value) => String(value ?? "").trim();
const newId = (prefix) => `${prefix}:${typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`}`;

async function sourceAndState(api, sourceId) {
  const [[item], scene] = await Promise.all([
    sourceId ? api.scene.items.getItems([sourceId]) : Promise.resolve([]),
    Promise.resolve().then(() => api.scene.getMetadata()).catch(() => ({})),
  ]);
  return { item: item || null, initiativeState: scene?.[STATE_KEY] || null };
}

// The reaction the monster spends, or a refusal in Italian when it has already used it this round.
function reactionSpend(item, initiativeState) {
  const meta = item.metadata?.[META_KEY] || {};
  return planReactionSpend({ applies: true, casterId: item.id, casterName: item.name, conditions: meta.conditions, initiativeState });
}

// The spell panel ready for a monster's reaction (a spell placed on the map: Misty Step): its caster, no slot when the
// reaction itself gives the spell, no concentration when the text says so; origin monster-reaction makes the panel spend
// the reaction with the cast (spell-unified-panel.js).
async function openMonsterReactionPanel(api, { casterId, spellId, slotLevel, free, noConcentration }) {
  const { buildSpellUnifiedPanelRouteQuery } = await import("./spellUnifiedPanelRoutingCore.js");
  const query = buildSpellUnifiedPanelRouteQuery({ spellId, casterId, origin: "monster-reaction", ...(free ? { slotSource: "none" } : {}),
    ...(slotLevel ? { slotLevel } : {}), ...(noConcentration ? { withoutConcentration: true } : {}) });
  try { await api.popover.close(SPELLS_POPOVER_ID); } catch {}
  await api.popover.open({ id: SPELLS_POPOVER_ID, url: `/spell-unified-panel.html?${query}`, width: 640, height: 640,
    anchorReference: "POSITION", anchorPosition: { left: 60, top: 60 }, anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" }, disableClickAway: true });
}

/**
 * Gift of the Gulthias: casterId casts spellId on itself. slotLevel: the slot the text asks (0: none); free: the reaction
 * itself gives the spell, no slot ("In response to taking damage, Ludmilla casts misty step"); noConcentration: the cast
 * keeps no concentration. A spell placed on the map (an area, a teleport) opens the spell panel instead. Returns
 * { ok, message, panel }, the message in Italian.
 */
export async function castMonsterReactionSpell({ casterId = "", spellId = "", slotLevel = 0, free = false, noConcentration = false, label = "" } = {}, {
  api = OBR,
} = {}) {
  const [{ getSpellDefinition }, { executeSpellApplication, getCurrentSpellAppliedAt }, { planSpellCastCost }, { SPELL_AREA_GEOMETRY_BY_ID }] = await Promise.all([
    import("./spells-srd.js"), import("./spellApplicationExecutor.js"), import("./spellSlotSpendCore.js"), import("./spellAreaIndex.js"),
  ]);
  const spell = getSpellDefinition(spellId);
  const { item, initiativeState } = await sourceAndState(api, casterId);
  if (!item || !spell) return { ok: false, message: "Creatura o incantesimo non più disponibili." };
  const name = text(item.name) || "La creatura";
  const spellName = spell.displayName || spell.name;
  if (Object.hasOwn(SPELL_AREA_GEOMETRY_BY_ID, spell.id)) {
    await openMonsterReactionPanel(api, { casterId: item.id, spellId: spell.id, slotLevel, free, noConcentration });
    return { ok: true, panel: true, message: `${name} · ${label || "Reazione"}: completa ${spellName} nel pannello incantesimi${free ? ", senza slot" : ""}; il lancio spende la reazione.` };
  }
  const meta = item.metadata?.[META_KEY] || {};
  const card = meta.initiativeCard || {};
  const level = Math.max(Number(spell.level) || 0, Number(slotLevel) || 0);
  const cost = level > 0 && !free ? planSpellCastCost({ sourceId: item.id, characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers || null,
    resources: meta.classFeatureState?.resources, spellLevel: level, slotLevel: level, phase: "cast" }) : { operation: null, spent: "", exhausted: false };
  if (cost.exhausted) return { ok: false, message: `${name}: nessuno slot di ${level}° livello per ${spellName}.` };
  const reaction = reactionSpend(item, initiativeState);
  if (reaction.alreadyUsed) return { ok: false, message: reaction.message };
  const appliedAt = await getCurrentSpellAppliedAt().catch(() => undefined);
  await executeSpellApplication({
    spell: noConcentration ? { ...spell, concentration: false } : spell,
    turns: Math.max(1, Number(spell.defaultTurns) || 1),
    casterId: item.id,
    targetIds: [item.id],
    casterName: item.name || "",
    castContext: { slotLevel: level },
    historyLabel: `${label ? `${label}: ` : ""}${spellName}`,
    ignoreTargetLimit: true,
    ...(appliedAt ? { appliedAt } : {}),
    extraOperations: [...(cost.operation ? [cost.operation] : []), ...reaction.operations],
    castCost: [cost.spent, ...(reaction.operations.length ? ["reazione"] : [])].filter(Boolean).join(", "),
  });
  return { ok: true, message: `${name} · ${label || "Reazione"}: ${spellName}${noConcentration ? " senza concentrazione" : ""}`
    + `${cost.spent ? `, speso: ${cost.spent}` : ""}.` };
}

/**
 * Guardian of the Gulthias: sourceId takes the form (form: a snapshot; else the card's quick form named formName) for
 * minutes, keeping its own hit points; its reaction spent with it unless reaction is false (used from its own Capacità
 * tab outside combat it costs nothing to say). Returns { ok, message }.
 */
export async function assumeMonsterForm({ sourceId = "", form = null, formName = "", minutes = 1, label = "", portrait = null, reaction = true } = {}, {
  api = OBR, newInstanceId = () => newId("monster-form"),
} = {}) {
  const { item, initiativeState } = await sourceAndState(api, sourceId);
  if (!item) return { ok: false, message: "La creatura non è più nella scena." };
  const card = item.metadata?.[META_KEY]?.initiativeCard || {};
  const chosen = sanitizeTransformationForm(form) || transformationFormNamed(card, formName);
  const name = text(item.name) || "La creatura";
  if (!chosen) {
    return { ok: false, message: `${name}: scegli una volta la forma (${formName || "la forma"}) nella sua console, Capacità → ${label || "la reazione"}, con «Usa e salva».` };
  }
  const parts = transformationPillParts({ template: MONSTER_FORM_TEMPLATE, form: chosen, label: label || "Forma",
    detail: "Tiene i suoi PF, i suoi incantesimi e la sua mente; CA, Forza, Destrezza, velocità, difese, sensi e attacchi sono della forma.",
    portrait });
  const spend = reaction ? reactionSpend(item, initiativeState) : { operations: [], alreadyUsed: false };
  if (spend.alreadyUsed) return { ok: false, message: spend.message };
  const instanceId = newInstanceId();
  const { runEffectsMutation, requireAppliedEffectsMutation } = await import("./effectsMutations.js");
  const history = `${name}: ${parts.displayLabel}`;
  const result = await runEffectsMutation([
    { type: "condition:add", targetIds: [item.id], conditionName: label || "Forma", instanceIds: { [item.id]: instanceId },
      options: { sourceId: item.id, displayLabel: parts.displayLabel, effectDetail: parts.detail, mechanics: parts.mechanics,
        turns: Math.max(1, Math.round(Number(minutes) || 1) * 10) } },
    { type: "condition:automate", subjectIds: [item.id] },
    ...spend.operations,
  ], { kind: "condition", label: history, targetIds: [item.id], history: { kind: "condition", label: history } });
  requireAppliedEffectsMutation(result);
  return { ok: true, message: `${history}: CA ${chosen.armorClass ?? "della forma"}, i suoi PF restano.` };
}

/**
 * Indomitable (Lorghoth): the save against one effect on sourceId repeated (instanceId, one of repeatableSaveEffects),
 * outcome "passed" or "failed", resolved as the effect's own reminder resolves it (a success ends it); then its reaction,
 * in combat, as its own History entry. Returns { ok, message }.
 */
export async function repeatMonsterSave({ sourceId = "", instanceId = "", outcome = "", label = "" } = {}, { api = OBR } = {}) {
  const [{ repeatableSaveEffects }, { buildEffectSaveReminderResolution }, { resolveReminder }] = await Promise.all([
    import("./monsterRepeatSaveCore.js"), import("./reminderResolutionCore.js"), import("./reminderResolution.js"),
  ]);
  const items = await api.scene.items.getItems();
  const item = items.find((entry) => entry.id === sourceId) || null;
  if (!item) return { ok: false, message: "La creatura non è più nella scena." };
  const name = text(item.name) || "La creatura";
  const effect = repeatableSaveEffects(item, items).find((entry) => entry.instanceId === instanceId);
  const conditions = item.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
  const instance = effect ? instances.find((entry) => String(entry?.id || "") === instanceId) || null : null;
  if (!effect || !instance) return { ok: false, message: `${name}: l'effetto non c'è più.` };
  const { initiativeState } = await sourceAndState(api, sourceId);
  const spend = reactionSpend(item, initiativeState);
  if (spend.alreadyUsed) return { ok: false, message: spend.message };
  const activationId = newId("monster-repeat-save");
  const resolution = buildEffectSaveReminderResolution({ item, instance, reminder: effect.reminder, dc: effect.dc, activationId });
  if (!resolution) return { ok: false, message: `${name}: ${effect.label} non si risolve con un tiro salvezza.` };
  const result = await resolveReminder({
    notice: { activationId, spellName: effect.label, kind: "effect-reminder", targets: [{ id: item.id, name }], resolution },
    outcome,
  });
  if (result?.status !== "applied" && result?.status !== "already-resolved") return { ok: false, message: result?.message || "Tiro salvezza non registrato." };
  if (spend.operations.length) {
    const { runEffectsMutation } = await import("./effectsMutations.js");
    await runEffectsMutation(spend.operations, { kind: "condition", label: `${name}: ${label || "Reazione"}`, targetIds: [item.id],
      history: { kind: "condition", label: `${name}: ${label || "Reazione"}` } }).catch(() => null);
  }
  return { ok: true, message: `${name} · ${label || "Reazione"}: TS ${effect.abilityLabel} contro ${effect.label} ${outcome === "passed" ? "superato, l'effetto finisce" : "fallito, l'effetto resta"}.` };
}
