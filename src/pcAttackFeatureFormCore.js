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
  classFeatureTargeting,
  classFeatureTwinnedSpellCost,
} from "./classFeatureCore.js";

// A class feature or species trait in the attack console's Capacità tab: what the GM fills in and which runtime call it
// makes, the same inputs the character sheet asks (initiative-card-modal.js, renderClassFeatures). The console runs the
// call itself (classFeatureRuntime.js), as the sheet does.
// kind: "activate" (Attiva / Usa), "toggle" (an aura: Attiva / Disattiva), "end" (active: Termina), "sheet" (its own
// controls live only in the sheet: Apri nella scheda), "reference" (to read), "manual" (not automated yet).

// The sheet's ids (initiative-card-modal.js).
const BARDIC_INSPIRATION_ADAPTER = "bardic-inspiration";
const CONTAGIOUS_INSPIRATION_FEATURE_ID = "bardo-collegio-dell-eloquenza-ispirazione-contagiosa";
const TWINNED_SPELL_FEATURE_ID = "stregone-metamagia-incantesimo-raddoppiato";
const SORCERY_POINTS_POOL_ID = "stregone-punti-stregoneria";

// The adapters whose controls the console does not repeat: the character sheet hosts them.
export const PC_ATTACK_SHEET_ADAPTERS = Object.freeze(new Set([
  "unsettling-words", "turn-undead", "turn-creatures", "universal-speech", "night-eyes", "sorcery-source",
  "sorcerous-restoration", "wild-magic-surge", "wild-magic-tides", "spell-thief",
]));

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
export function pcAttackFeatureForm(feature, state = {}, { characterBuild = [] } = {}) {
  if (!feature) return { kind: "reference", fields: [], label: "" };
  const runtime = classFeatureRuntimeSupport(feature);
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
  if (PC_ATTACK_SHEET_ADAPTERS.has(adapter) || feature.id === CONTAGIOUS_INSPIRATION_FEATURE_ID || feature.innateSpell || feature.hpTrait) {
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
  const autoChoiceIds = Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => key.startsWith("auto:") && value).map(([key, value]) => [key.slice(5), value]));
  return { fn: "activateClassFeature", params: { sourceId, featureId: feature.id, ...targets,
    ...(values.choice ? { choiceId: values.choice } : {}), ...(Object.keys(autoChoiceIds).length ? { autoChoiceIds } : {}) } };
}
