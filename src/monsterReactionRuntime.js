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

/**
 * Gift of the Gulthias: casterId casts spellId on itself. slotLevel: the slot the text asks (0: none); noConcentration:
 * the cast keeps no concentration. Returns { ok, message }, the message in Italian.
 */
export async function castMonsterReactionSpell({ casterId = "", spellId = "", slotLevel = 0, noConcentration = false, label = "" } = {}, {
  api = OBR,
} = {}) {
  const [{ getSpellDefinition }, { executeSpellApplication, getCurrentSpellAppliedAt }, { planSpellCastCost }] = await Promise.all([
    import("./spells-srd.js"), import("./spellApplicationExecutor.js"), import("./spellSlotSpendCore.js"),
  ]);
  const spell = getSpellDefinition(spellId);
  const { item, initiativeState } = await sourceAndState(api, casterId);
  if (!item || !spell) return { ok: false, message: "Creatura o incantesimo non più disponibili." };
  const meta = item.metadata?.[META_KEY] || {};
  const card = meta.initiativeCard || {};
  const level = Math.max(Number(spell.level) || 0, Number(slotLevel) || 0);
  const cost = level > 0 ? planSpellCastCost({ sourceId: item.id, characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers || null,
    resources: meta.classFeatureState?.resources, spellLevel: level, slotLevel: level, phase: "cast" }) : { operation: null, spent: "", exhausted: false };
  const name = text(item.name) || "La creatura";
  const spellName = spell.displayName || spell.name;
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
