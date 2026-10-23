import { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } from "./classFeatureCatalog.js";
import {
  activeClassFeatureInstances,
  classFeatureAutoActivateParentFeatureId,
  classFeatureChoiceOptions,
  classFeatureDurationParentFeatureId,
  classFeatureIsReferenceOnly,
  classFeatureRemainingRounds,
  classFeatureRequiredActiveFeatureId,
  classFeatureResourceEntries,
  classFeatureRuntimeSupport,
  classFeatureSpellSlotCreationCost,
  classFeatureTargeting,
  classFeatureTwinnedSpellCost,
  resolveClassFeatureResourceDie,
} from "./classFeatureCore.js";
import { getSpellDefinition } from "./spells-srd.js";
import { isReactionClassFeature } from "./reactionTrackerCore.js";

// A class feature or species trait in the attack console's Capacità tab: what the GM fills in and which runtime call it
// makes, the same inputs the character sheet asks (initiative-card-modal.js, renderClassFeatures). The console runs the
// call itself (classFeatureRuntime.js), as the sheet does.
// kind: "activate" (Attiva / Usa), "toggle" (an aura: Attiva / Disattiva), "end" (active: Termina), "spend" (a cost the
// console does not automate: Spendi, the effect resolved at the table), "sheet" (its own controls live only in the
// sheet: Apri nella scheda), "reaction" (used with a reaction and nothing to spend: Usa reazione marks only the
// reaction), "reference" (to read), "manual" (not automated yet, nothing to spend).
// Field types: "select", "number", "checkbox", "spell-text" (a catalog spell), "target-spell" (the target's active
// spell); showWhen: { field, value } shows a field only for that value of another one.

// The sheet's ids (initiative-card-modal.js).
const BARDIC_INSPIRATION_ADAPTER = "bardic-inspiration";
const BARDIC_INSPIRATION_POOL_ID = "bardo-ispirazione-bardica-usi";
const TWINNED_SPELL_FEATURE_ID = "stregone-metamagia-incantesimo-raddoppiato";
const SORCERY_POINTS_POOL_ID = "stregone-punti-stregoneria";

// The adapters whose controls the console does not repeat: the character sheet hosts them (Wild Magic Surge's d100
// table, the Channel Divinity turns, Night Eyes).
export const PC_ATTACK_SHEET_ADAPTERS = Object.freeze(new Set([
  "turn-undead", "turn-creatures", "night-eyes", "wild-magic-surge",
]));

// The cost the console spends by hand: the first of a feature's costs whose pool the catalog knows.
const spendCost = (feature) => (Array.isArray(feature?.resourceCosts) ? feature.resourceCosts : [])
  .find((cost) => cost?.poolId && CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(cost.poolId)) || null;

// A feature the console cannot automate but whose resource it can spend (reference only, or not automated yet).
export function pcAttackFeatureSpendable(feature) {
  return !!feature && !pcAttackFeatureUsable(feature) && !!spendCost(feature);
}

// Spendi: the pool's uses or points, by hand (adjustClassFeatureResource, as the sheet's − button): a fixed cost, or
// the amount for a variable one. The effect is the table's.
function spendForm(feature, state) {
  const cost = spendCost(feature);
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(cost.poolId);
  const row = (state.resources?.[feature.id] || []).find((entry) => entry.poolId === cost.poolId) || null;
  const remaining = row && !row.unlimited && Number.isFinite(row.current) ? row.current : null;
  const variable = cost.variable === true;
  const amount = variable ? 1 : Math.max(1, Math.floor(Number(cost.amount) || 1));
  const name = String(pool?.name || cost.poolId);
  return {
    kind: "spend", label: variable ? "Spendi" : `Spendi ${amount}`, call: "spend", poolId: cost.poolId, amount, variable, remaining, poolName: name,
    fields: variable ? [{ id: "amount", type: "number", label: `${name} da spendere`, min: 1, ...(remaining !== null ? { max: remaining } : {}), value: "1" }] : [],
    note: "Effetto da risolvere al tavolo: la console scala solo la risorsa.",
    disabledReason: remaining !== null && remaining < amount ? `Non basta: ${name} ${remaining}.` : "",
  };
}

// A feature used with a reaction that the console neither runs nor spends for (Uncanny Dodge, Deflect Missiles, a
// Fighting Style's Protection): Usa reazione marks the actor's reaction, the effect is the table's.
export function pcAttackFeatureReactable(feature) {
  return !!feature && isReactionClassFeature(feature) && !pcAttackFeatureUsable(feature) && !pcAttackFeatureSpendable(feature);
}

// reaction: { inCombat, used } of the actor (the console reads them from the turn and the actor's conditions).
function reactionForm(reaction = {}) {
  return {
    kind: "reaction", label: "Usa reazione", call: "reaction", fields: [],
    note: "Effetto da risolvere al tavolo: la console segna solo la reazione.",
    disabledReason: reaction.inCombat !== true ? "Fuori dal combattimento: nessuna reazione da segnare."
      : reaction.used === true ? "Reazione già usata in questo round." : "",
  };
}

const adapterOf = (feature) => String(feature?.runtimeSupport?.adapter || "").trim();

// Whether the console's Capacità tab lists it among the usable ones: the sheet's rule (not reference only, automated).
export function pcAttackFeatureUsable(feature) {
  return !classFeatureIsReferenceOnly(feature) && classFeatureRuntimeSupport(feature).ready;
}

// The state of the actor's features the console needs, as the sheet reads it: each feature's active instances, its
// resource pools (current and maximum) and the enabled ids (for the choices and the requirements).
export function pcAttackFeatureState(profile, stateValue, features, currentRound = null) {
  const active = activeClassFeatureInstances(stateValue, currentRound);
  const list = Array.isArray(features) ? features : [];
  return {
    enabledIds: list.map((feature) => feature.id),
    active: Object.fromEntries(list.map((feature) => [feature.id, active
      .filter((instance) => instance.featureId === feature.id)
      .map((instance) => ({ instanceId: instance.instanceId, remainingRounds: classFeatureRemainingRounds(instance, currentRound) }))])
      .filter(([, instances]) => instances.length)),
    activeFeatureIds: [...new Set(active.map((instance) => instance.featureId))],
    resources: Object.fromEntries(list.map((feature) => [feature.id, classFeatureResourceEntries(stateValue, [feature],
      CLASS_FEATURE_RESOURCE_POOL_BY_ID, profile?.characterBuild, profile?.abilityModifiers)
      .map((entry) => ({ poolId: entry.pool.id, name: entry.pool.name || entry.pool.id, current: entry.current ?? null,
        maximum: entry.maximum ?? null, unlimited: entry.unlimited === true }))])),
  };
}

// classFeatureRequiresActivationChoice's rule, with the catalog's features: classFeatureCore.js has no feature map
// there (CLASS_FEATURE_BY_ID is not defined in it) and throws for a variant feature that ends with a parent.
function requiresChoice(feature, enabledIds) {
  const choices = classFeatureChoiceOptions(feature);
  if (!choices.length || feature?.choiceMode === "configuration") return false;
  const parent = CLASS_FEATURE_BY_ID.get(classFeatureDurationParentFeatureId(feature));
  if (parent && classFeatureChoiceOptions(parent).length) return false;
  return !enabledIds.some((id) => choices.some((choice) => id === `${feature.id}-${choice.id}` || id.endsWith(`-${choice.id}`)));
}

const choiceField = (feature, enabledIds, { id = "choice", label = "" } = {}) => {
  if (!requiresChoice(feature, enabledIds)) return null;
  const options = classFeatureChoiceOptions(feature);
  return options.length ? { id, type: "select", label: label || "Variante", options: options.map(({ id: value, label: text }) => ({ value, label: text })) } : null;
};

// The form of one feature. state: pcAttackFeatureState's. characterBuild: for the targeting (the aura's radius).
export function pcAttackFeatureForm(feature, state = {}, { characterBuild = [], reaction = {} } = {}) {
  if (!feature) return { kind: "reference", fields: [], label: "" };
  const runtime = classFeatureRuntimeSupport(feature);
  if (pcAttackFeatureSpendable(feature)) return spendForm(feature, state);
  if (pcAttackFeatureReactable(feature)) return reactionForm(reaction);
  if (classFeatureIsReferenceOnly(feature)) return { kind: "reference", fields: [], label: "" };
  if (!runtime.ready) return { kind: "manual", fields: [], label: "", note: "Non automatizzata: risolvila al tavolo." };
  const adapter = adapterOf(feature);
  const enabledIds = Array.isArray(state.enabledIds) ? state.enabledIds : [];
  const active = Array.isArray(state.active?.[feature.id]) ? state.active[feature.id] : [];
  const resources = Array.isArray(state.resources?.[feature.id]) ? state.resources[feature.id] : [];
  const firstPool = resources[0] || null;
  const remaining = firstPool && !firstPool.unlimited && Number.isFinite(firstPool.current) ? firstPool.current : null;
  const targeting = classFeatureTargeting(feature, characterBuild);
  const selectionTargets = targeting.mode === "single-target";

  // Controls of their own, in the sheet only.
  if (PC_ATTACK_SHEET_ADAPTERS.has(adapter) || feature.innateSpell || feature.hpTrait) {
    return { kind: "sheet", fields: [], label: "Apri nella scheda", note: "Si usa dalla scheda personaggio, con i suoi controlli." };
  }
  if (adapter === "lay-on-hands") {
    return {
      kind: "activate", label: "Usa", call: "applyLayOnHands", selectionTargets: true,
      fields: [
        { id: "mode", type: "select", label: "Modo", options: [{ value: "heal", label: "Cura (punti)" }, { value: "disease-poison", label: "Malattie o veleni (5 punti l'uno)" }] },
        { id: "value", type: "number", label: "Punti o malattie", min: 1, ...(remaining !== null ? { max: remaining } : {}), value: remaining === 0 ? "" : "1" },
      ],
      disabledReason: remaining === 0 ? "Nessun punto rimasto." : "",
    };
  }
  if (adapter === "purifying-touch") {
    return { kind: "activate", label: "Usa", call: "purifyClassFeatureSpell", selectionTargets: true,
      fields: [{ id: "spell", type: "target-spell", label: "Incantesimo da terminare" }],
      disabledReason: remaining === 0 ? "Nessun uso rimasto." : "" };
  }
  // Font of Magic: create a spell slot with points, or turn a slot into points.
  if (adapter === "sorcery-source") {
    const options = [
      ...[1, 2, 3, 4, 5].map((level) => ({ level, cost: classFeatureSpellSlotCreationCost(feature, level) }))
        .filter((entry) => entry.cost !== null)
        .map(({ level, cost }) => ({ value: `create:${level}`, label: `Crea uno slot di ${level}° · ${cost} punti` })),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({ value: `convert:${level}`, label: `Converti uno slot di ${level}° → +${level} punti` })),
    ];
    return { kind: "activate", label: "Conferma", call: "sorcerySource", fields: [{ id: "operation", type: "select", label: "Operazione", options }],
      note: "Gli slot creati restano finché li spendi o fino al riposo lungo." };
  }
  // Sorcerous Restoration: 4 points back, never above the maximum.
  if (adapter === "sorcerous-restoration") {
    return { kind: "activate", label: "Recupera 4", call: "applySorcerousRestoration", fields: [] };
  }
  // Unsettling Words: the Bardic Inspiration die rolled at the table, on the creature selected.
  if (adapter === "unsettling-words") {
    const die = resolveClassFeatureResourceDie(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(BARDIC_INSPIRATION_POOL_ID), characterBuild);
    const faces = Number(String(die || "").match(/d(\d+)/iu)?.[1]);
    const known = Number.isInteger(faces) && faces > 0;
    return { kind: "activate", label: "Usa", call: "activateClassFeature", selectionTargets: true,
      fields: [{ id: "value", type: "number", label: `Risultato del dado${die ? ` (${die})` : ""}`, min: 1, ...(known ? { max: faces } : {}), value: "" }],
      note: "Tira il dado al tavolo e inserisci il risultato; seleziona una creatura entro 18 m.",
      disabledReason: remaining === 0 ? "Nessuna Ispirazione Bardica rimasta." : !known ? "Dado di Ispirazione Bardica non disponibile." : "" };
  }
  // Universal Speech: its free use, or a slot already spent; the creatures selected, the bard included if wanted.
  if (adapter === "universal-speech") {
    return { kind: "activate", label: "Usa", call: "activateClassFeature", selectionTargets: true, includeSource: true,
      fields: [
        { id: "mode", type: "select", label: "Pagamento", options: [{ value: "daily", label: "Uso gratuito (recupera con riposo lungo)" }, { value: "slot", label: "Slot già speso" }] },
        { id: "slotConfirmed", type: "checkbox", label: "Confermo che lo slot è già stato speso", showWhen: { field: "mode", value: "slot" } },
      ] };
  }
  // Spell Thief: the spell, denied or stolen, on the caster selected; trigger, DC and save confirmed at the table.
  if (adapter === "spell-thief") {
    return { kind: "activate", label: "Usa", call: "activateClassFeature", selectionTargets: true,
      fields: [
        { id: "spell", type: "spell-text", label: "Incantesimo" },
        { id: "spellMode", type: "select", label: "Risoluzione", options: [{ value: "deny", label: "Solo effetto negato" }, { value: "steal", label: "Incantesimo rubato per 8 ore" }] },
        { id: "spellLevelConfirmed", type: "checkbox", label: "Confermo che il Ladro può lanciare questo livello", showWhen: { field: "spellMode", value: "steal" } },
      ],
      note: "Seleziona sulla mappa la creatura che lancia; trigger, CD e TS restano conferme del tavolo.",
      disabledReason: remaining === 0 ? "Nessun uso rimasto." : "" };
  }
  if (adapter === "resource-only" && feature.id === TWINNED_SPELL_FEATURE_ID) {
    return { kind: "activate", label: "Usa", call: "activateClassFeature", twinned: true,
      fields: [{ id: "spellLevel", type: "number", label: "Livello dell'incantesimo (0–9)", min: 0, max: 9, value: "0" }] };
  }
  // The generic path: the variant to choose, the automatic outcomes of the features it activates, an aura that toggles.
  const aura = targeting.mode === "aura" && feature.trackingMode !== "instant";
  const repeatable = adapter === BARDIC_INSPIRATION_ADAPTER;
  if (active.length && aura) {
    return { kind: "toggle", label: "Disattiva", fields: [], instanceId: active[0].instanceId, auraMeters: targeting.rangeMeters ?? null };
  }
  if (active.length && !repeatable) {
    return { kind: "end", label: "Termina", fields: [], instanceId: active[0].instanceId };
  }
  const required = [...new Set([
    ...(classFeatureAutoActivateParentFeatureId(feature) ? [] : [classFeatureDurationParentFeatureId(feature)]),
    classFeatureRequiredActiveFeatureId(feature),
  ].filter(Boolean))];
  const missing = required.find((id) => !(state.activeFeatureIds || []).includes(id)) || "";
  const fields = [choiceField(feature, enabledIds)].filter(Boolean);
  for (const childId of Array.isArray(feature.autoActivateFeatureIds) ? feature.autoActivateFeatureIds : []) {
    if (!enabledIds.includes(childId)) continue;
    const child = CLASS_FEATURE_BY_ID.get(childId);
    const field = child ? choiceField(child, enabledIds, { id: `auto:${childId}`, label: `Esito automatico: ${child.name}` }) : null;
    if (field) fields.push(field);
  }
  return {
    kind: aura ? "toggle" : "activate",
    label: aura ? "Attiva" : feature.trackingMode === "instant" ? "Usa" : "Attiva",
    call: "activateClassFeature", fields, selectionTargets,
    ...(aura ? { auraMeters: targeting.rangeMeters ?? null } : {}),
    disabledReason: missing ? `Richiede prima ${CLASS_FEATURE_BY_ID.get(missing)?.name || "la capacità collegata"}.` : "",
  };
}

// The runtime call for a form and the values the GM entered: { fn, params } for classFeatureRuntime.js, or an error
// message. targetIds: the map selection (when the feature takes one); spell: the target's spell chosen.
export function pcAttackFeatureRequest(feature, form, values = {}, { sourceId = "", targetIds } = {}) {
  if (!feature || !form) return { error: "Capacità non disponibile." };
  if (form.call === "reaction") {
    return { fn: "useClassFeatureReaction", params: { sourceId, featureId: feature.id }, done: `Reazione segnata: ${feature.name}.` };
  }
  if (form.call === "spend") {
    const amount = form.variable ? Number(values.amount) : form.amount;
    if (!Number.isInteger(amount) || amount < 1) return { error: `Inserisci quanti ${form.poolName} spendere.` };
    if (form.remaining !== null && form.remaining !== undefined && amount > form.remaining) return { error: `Non basta: ${form.poolName} ${form.remaining}.` };
    return { fn: "adjustClassFeatureResource", args: [sourceId, form.poolId, { delta: -amount }, { featureId: feature.id }], done: `Risorsa spesa: ${form.poolName} −${amount} (${feature.name}).` };
  }
  if (form.call === "sorcerySource") {
    const [operation, rawLevel] = String(values.operation || "").split(":");
    const slotLevel = Number(rawLevel);
    if (!["create", "convert"].includes(operation) || !Number.isInteger(slotLevel)) return { error: "Scegli l'operazione." };
    return { fn: operation === "create" ? "createClassFeatureSpellSlot" : "convertClassFeatureSpellSlot",
      params: { sourceId, featureId: feature.id, slotLevel },
      done: operation === "create" ? `Slot di ${slotLevel}° creato.` : `Slot di ${slotLevel}° convertito in punti.` };
  }
  if (form.call === "applySorcerousRestoration") {
    return { fn: "applySorcerousRestoration", params: { sourceId, featureId: feature.id }, done: "Ripristino Stregonesco applicato." };
  }
  if ((form.kind === "toggle" && form.instanceId) || form.kind === "end") {
    return { fn: "deactivateClassFeature", args: [sourceId, form.instanceId] };
  }
  const targets = form.selectionTargets && Array.isArray(targetIds) && targetIds.length ? { targetIds } : {};
  if (form.call === "applyLayOnHands") {
    const mode = values.mode === "disease-poison" ? "disease-poison" : "heal";
    return { fn: "applyLayOnHands", params: { sourceId, featureId: feature.id, ...targets, mode,
      ...(mode === "heal" ? { value: values.value } : { conditionCount: values.value }) } };
  }
  if (form.call === "purifyClassFeatureSpell") {
    if (!values.spell?.instanceId && !values.spell?.name) return { error: "Il bersaglio non ha incantesimi attivi da terminare." };
    return { fn: "purifyClassFeatureSpell", params: { sourceId, featureId: feature.id, ...targets,
      spellInstanceId: values.spell.instanceId || "", spellName: values.spell.name || "" } };
  }
  if (form.twinned) {
    const cost = classFeatureTwinnedSpellCost(values.spellLevel);
    if (cost === null) return { error: "Inserisci un livello di incantesimo tra 0 e 9." };
    return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, resourceValues: { [SORCERY_POINTS_POOL_ID]: cost } } };
  }
  const adapter = adapterOf(feature);
  if (adapter === "unsettling-words") {
    if (!String(values.value ?? "").trim()) return { error: "Inserisci il risultato del dado." };
    return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, ...targets, value: values.value } };
  }
  if (adapter === "universal-speech") {
    const mode = values.mode === "slot" ? "slot" : "daily";
    return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, ...targets, mode, slotConfirmed: mode === "slot" && values.slotConfirmed === true } };
  }
  if (adapter === "spell-thief") {
    const spell = getSpellDefinition(String(values.spell || "").trim());
    if (!spell) return { error: "Scegli un incantesimo dal catalogo." };
    const spellMode = values.spellMode === "steal" ? "steal" : "deny";
    return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, ...targets, spellId: spell.id, spellMode,
      spellLevelConfirmed: spellMode === "steal" && values.spellLevelConfirmed === true } };
  }
  const autoChoiceIds = Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => key.startsWith("auto:") && value).map(([key, value]) => [key.slice(5), value]));
  return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, ...targets,
    ...(values.choice ? { choiceId: values.choice } : {}), ...(Object.keys(autoChoiceIds).length ? { autoChoiceIds } : {}) } };
}
