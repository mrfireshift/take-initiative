import {
  advanceRepeatedSaveProgress,
  normalizeRepeatedSaveProgress,
} from "./repeatedSaveProgressCore.js";

export const PRISMATIC_WALL_SPELL_ID = "prismatic-wall";
export const PRISMATIC_WALL_STATE_VERSION = 1;
export const PRISMATIC_WALL_LAYER_IDS = Object.freeze([
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
]);
export const PRISMATIC_WALL_INDIGO_EFFECT_PREFIX = "prismatic-wall-indigo:";
export const PRISMATIC_WALL_VIOLET_EFFECT_PREFIX = "prismatic-wall-violet:";
export const PRISMATIC_WALL_TRAVERSAL_HISTORY_LIMIT = 32;

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const uniqueIds = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
)];

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function normalizedOutcome(value) {
  const outcome = String(value || "").trim().toLocaleLowerCase("it");
  return ["passed", "failed", "immune"].includes(outcome) ? outcome : "";
}

function recordValue(record, key) {
  if (record instanceof Map) return record.get(key);
  return record && typeof record === "object" ? record[key] : undefined;
}

function damageTotal(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value?.amount ?? value?.total ?? value?.damage ?? value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function layerProgressLabel(progress) {
  return `TS Cos · ${progress.successes}S/${progress.failures}F`;
}

function stateInput(value) {
  if (value?.prismaticWall && typeof value.prismaticWall === "object") {
    return value.prismaticWall;
  }
  return value && typeof value === "object" ? value : {};
}

export const PRISMATIC_WALL_LAYERS = freeze([
  {
    id: "red",
    label: "Rosso",
    saveAbility: "dex",
    damage: { dice: "10d6", type: "fuoco", onSave: "half" },
    destructionRequirement: "Almeno 25 danni da freddo in un singolo effetto distruggono lo strato.",
    passive: "Gli attacchi a distanza non magici non possono attraversare lo strato.",
  },
  {
    id: "orange",
    label: "Arancione",
    saveAbility: "dex",
    damage: { dice: "10d6", type: "acido", onSave: "half" },
    destructionRequirement: "Un vento forte distrugge lo strato.",
    passive: "Gli attacchi a distanza magici non possono attraversare lo strato.",
  },
  {
    id: "yellow",
    label: "Giallo",
    saveAbility: "dex",
    damage: { dice: "10d6", type: "fulmine", onSave: "half" },
    destructionRequirement: "Almeno 60 danni da forza in un singolo effetto distruggono lo strato.",
    passive: "Nessuna proprietà passiva aggiuntiva nel testo RAW locale.",
  },
  {
    id: "green",
    label: "Verde",
    saveAbility: "dex",
    damage: { dice: "10d6", type: "veleno", onSave: "half" },
    destructionRequirement: "Passwall o una spell simile di livello almeno pari al muro, che apra un portale in una superficie solida, distrugge lo strato.",
    passive: "Nessuna proprietà passiva aggiuntiva nel testo RAW locale.",
  },
  {
    id: "blue",
    label: "Blu",
    saveAbility: "dex",
    damage: { dice: "10d6", type: "freddo", onSave: "half" },
    destructionRequirement: "Almeno 25 danni da fuoco in un singolo effetto distruggono lo strato.",
    passive: "Nessuna proprietà passiva aggiuntiva nel testo RAW locale.",
  },
  {
    id: "indigo",
    label: "Indaco",
    saveAbility: "dex",
    destructionRequirement: "Una luce intensa generata da Daylight o da una spell simile di livello almeno pari al muro distrugge lo strato.",
    passive: "Nessuna spell può essere lanciata attraverso lo strato.",
  },
  {
    id: "violet",
    label: "Viola",
    saveAbility: "dex",
    destructionRequirement: "Dispel Magic o una spell simile di livello almeno pari al muro, capace di terminare magie o effetti, distrugge lo strato.",
    passive: "Nessuna proprietà passiva aggiuntiva nel testo RAW locale.",
  },
]);

const LAYERS_BY_ID = new Map(PRISMATIC_WALL_LAYERS.map((layer) => [layer.id, layer]));

export function prismaticWallLayerById(layerId) {
  return LAYERS_BY_ID.get(String(layerId || "").trim()) || null;
}

export function normalizePrismaticWallState(value = {}) {
  const input = stateInput(value);
  const hasRemainingLayers = Object.prototype.hasOwnProperty.call(input, "remainingLayers");
  const remaining = (hasRemainingLayers ? uniqueIds(input.remainingLayers) : [...PRISMATIC_WALL_LAYER_IDS])
    .filter((layerId) => PRISMATIC_WALL_LAYER_IDS.includes(layerId));
  const remainingLayers = PRISMATIC_WALL_LAYER_IDS.filter((layerId) => remaining.includes(layerId));
  const shape = ["wall", "sphere"].includes(String(input.shape || "").trim())
    ? String(input.shape).trim()
    : "wall";
  return {
    version: PRISMATIC_WALL_STATE_VERSION,
    shape,
    remainingLayers,
    exemptCreatureIds: uniqueIds(input.exemptCreatureIds),
    resolvedTraversalIds: uniqueIds(input.resolvedTraversalIds)
      .slice(-PRISMATIC_WALL_TRAVERSAL_HISTORY_LIMIT),
  };
}

export function prismaticWallCastContext({
  castContext = null,
  shape = "",
  ruleChoice = "",
  casterId = "",
  exemptCreatureIds = [],
} = {}) {
  const base = castContext && typeof castContext === "object" ? clone(castContext) : {};
  const existing = normalizePrismaticWallState(base.prismaticWall);
  const requestedShape = String(shape || ruleChoice || existing.shape || "wall").trim();
  const normalizedShape = ["wall", "sphere"].includes(requestedShape)
    ? requestedShape
    : existing.shape;
  const inheritedExemptions = [
    ...(Array.isArray(base.exemptCreatureIds) ? base.exemptCreatureIds : []),
    ...existing.exemptCreatureIds,
  ];
  const requestedExemptions = Array.isArray(exemptCreatureIds) && exemptCreatureIds.length
    ? exemptCreatureIds
    : inheritedExemptions;
  return {
    ...base,
    prismaticWall: {
      ...existing,
      shape: normalizedShape,
      exemptCreatureIds: uniqueIds([casterId, ...requestedExemptions]),
    },
  };
}

export function prismaticWallStateFromCastContext(castContext = null) {
  return normalizePrismaticWallState(castContext?.prismaticWall || castContext || {});
}

export function prismaticWallSummaryParts(value = {}) {
  const state = normalizePrismaticWallState(value);
  return [{
    id: "prismatic-wall-layers",
    label: `${state.remainingLayers.length}/${PRISMATIC_WALL_LAYER_IDS.length} strati`,
  }];
}

export function prismaticWallSpellUpsertOperation({
  parent = null,
  payload = null,
  castContext = null,
} = {}) {
  if (!parent || !payload) return null;
  const sourceName = String(parent.casterName || payload.casterName || "").trim();
  return {
    type: "spell:upsert",
    targetIds: [payload.casterId],
    name: String(parent.name || payload.spellName || PRISMATIC_WALL_SPELL_ID).trim(),
    source: payload.casterId,
    casterName: sourceName,
    spellId: PRISMATIC_WALL_SPELL_ID,
    instanceId: payload.instanceId,
    turns: Math.max(1, Math.floor(Number(parent.turns) || 1)),
    conc: parent.conc === true,
    appliedAt: parent.appliedAt,
    castContext,
    summaryParts: prismaticWallSummaryParts(castContext),
  };
}

export function prismaticWallFirstRemainingLayer(remainingLayers = []) {
  const remaining = new Set(uniqueIds(remainingLayers));
  return PRISMATIC_WALL_LAYER_IDS.find((layerId) => remaining.has(layerId)) || "";
}

export function prismaticWallLayerManagementPlan({
  remainingLayers = [],
  layerId = "",
} = {}) {
  const current = normalizePrismaticWallState({ remainingLayers });
  const requested = String(layerId || "").trim();
  const first = prismaticWallFirstRemainingLayer(current.remainingLayers);
  const layer = prismaticWallLayerById(requested);
  const errors = [];
  if (!first) errors.push("prismatic-wall-no-layers-remaining");
  if (!layer) errors.push("prismatic-wall-layer-invalid");
  if (layer && requested !== first) errors.push("prismatic-wall-layer-order-invalid");
  if (errors.length) return freeze({ valid: false, errors, remainingLayers: current.remainingLayers });
  const nextRemainingLayers = current.remainingLayers.filter((id) => id !== requested);
  return freeze({
    valid: true,
    errors: [],
    layer,
    remainingLayers: nextRemainingLayers,
    summaryParts: prismaticWallSummaryParts({ remainingLayers: nextRemainingLayers }),
  });
}

function indigoReminder() {
  return {
    ability: "con",
    timing: "turn-end",
    actor: "target",
    dcSource: "source-spell",
    success: "keep-effect",
    failure: "keep-effect",
    immune: "remove-effect",
    label: "Muro prismatico: ripeti il TS Costituzione per l'Indaco.",
  };
}

function indigoCondition(parentEffectId, sourceId, sourceName) {
  const progress = normalizeRepeatedSaveProgress({}, {
    successThreshold: 3,
    failureThreshold: 3,
  });
  return {
    conditionName: "Trattenuto",
    options: {
      sourceId,
      sourceName,
      parentEffectId,
      type: "spell",
      spellId: PRISMATIC_WALL_SPELL_ID,
      effectId: `${PRISMATIC_WALL_INDIGO_EFFECT_PREFIX}${parentEffectId}`,
      effectDetail: "TS Costituzione alla fine di ogni proprio turno; 3 successi terminano Muro Prismatico, 3 fallimenti rendono Pietrificato.",
      expiry: { mode: "manual" },
      mechanics: {
        prismaticWallLayer: "indigo",
        prismaticWallIndigoProgress: progress,
      },
      summaryParts: [{
        id: `${PRISMATIC_WALL_INDIGO_EFFECT_PREFIX}${parentEffectId}:progress`,
        label: layerProgressLabel(progress),
      }],
      manualRemoval: true,
      saveReminder: indigoReminder(),
    },
  };
}

function violetCondition(parentEffectId, sourceId, sourceName) {
  return {
    conditionName: "Accecato",
    options: {
      sourceId,
      sourceName,
      type: "spell",
      spellId: PRISMATIC_WALL_SPELL_ID,
      effectId: `${PRISMATIC_WALL_VIOLET_EFFECT_PREFIX}${parentEffectId}`,
      effectDetail: "TS Saggezza all'inizio del turno successivo del caster; al fallimento il GM determina il piano di destinazione.",
      expiry: { mode: "manual" },
      mechanics: { prismaticWallLayer: "violet", prismaticWallInstanceId: parentEffectId },
      summaryParts: [{
        id: `${PRISMATIC_WALL_VIOLET_EFFECT_PREFIX}${parentEffectId}:save`,
        label: "TS Sag · prossimo turno caster",
      }],
      manualRemoval: true,
      saveReminder: {
        ability: "wis",
        timing: "turn-start",
        actor: "source",
        dcSource: "source-spell",
        success: "remove-effect",
        failure: "keep-effect",
        immune: "remove-effect",
        label: "Muro prismatico: TS Saggezza per il Viola.",
        resolution: {
          success: "remove-effect",
          failure: {
            mode: "remove-effect",
            actions: [{
              kind: "condition",
              action: "apply",
              targetId: "$target",
              name: "Trasferimento planare",
              options: {
                sourceId: "$source",
                sourceName,
                type: "spell",
                spellId: PRISMATIC_WALL_SPELL_ID,
                effectId: `${PRISMATIC_WALL_VIOLET_EFFECT_PREFIX}${parentEffectId}:planar-transfer`,
                effectDetail: "Il bersaglio viene trasportato su un altro piano a scelta del GM; il movimento planare resta manuale al tavolo.",
                expiry: { mode: "manual" },
                manualRemoval: true,
                summaryParts: [{
                  id: `${PRISMATIC_WALL_VIOLET_EFFECT_PREFIX}${parentEffectId}:planar-transfer`,
                  label: "Trasferimento planare · GM",
                }],
              },
            }],
          },
          immune: "remove-effect",
        },
      },
    },
  };
}

export function prismaticWallTraversalPlan({
  targetId = "",
  remainingLayers = [],
  outcomes = {},
  damageTotals = {},
  parentEffectId = "",
  sourceId = "",
  sourceName = "",
  exempt = false,
} = {}) {
  const normalizedTargetId = String(targetId || "").trim();
  const current = normalizePrismaticWallState({ remainingLayers });
  const errors = [];
  if (!normalizedTargetId) errors.push({ code: "prismatic-target-required" });
  if (!parentEffectId) errors.push({ code: "prismatic-wall-instance-required" });
  const targetPlan = {
    targetId: normalizedTargetId,
    exempt: exempt === true,
    layers: [],
    damageContributions: [],
    conditionApplications: [],
    errors: [],
  };
  if (!exempt) {
    for (const layerId of current.remainingLayers) {
      const layer = prismaticWallLayerById(layerId);
      const outcome = normalizedOutcome(recordValue(outcomes, layerId));
      if (!outcome) {
        targetPlan.errors.push({ code: "prismatic-save-outcome-required", layerId, targetId: normalizedTargetId });
        continue;
      }
      const entry = { layerId, label: layer.label, outcome };
      if (layer.damage) {
        const roll = outcome === "immune" ? 0 : damageTotal(recordValue(damageTotals, layerId));
        if (roll === null) {
          targetPlan.errors.push({ code: "prismatic-damage-total-required", layerId, targetId: normalizedTargetId });
        } else {
          const factor = outcome === "failed" ? 1 : outcome === "passed" ? 0.5 : 0;
          const contribution = {
            targetId: normalizedTargetId,
            layerId,
            color: layer.label,
            dice: layer.damage.dice,
            type: layer.damage.type,
            roll,
            factor,
            amount: Math.floor(roll * factor),
          };
          entry.damage = contribution;
          targetPlan.damageContributions.push(contribution);
        }
      } else if (outcome === "failed") {
        const condition = layerId === "indigo"
          ? indigoCondition(parentEffectId, sourceId, sourceName)
          : violetCondition(parentEffectId, sourceId, sourceName);
        targetPlan.conditionApplications.push({
          targetIds: [normalizedTargetId],
          ...condition,
        });
        entry.condition = condition.conditionName;
      }
      targetPlan.layers.push(entry);
    }
  }
  errors.push(...targetPlan.errors);
  return freeze({
    spellId: PRISMATIC_WALL_SPELL_ID,
    valid: errors.length === 0,
    errors,
    targetPlans: [targetPlan],
    damageContributions: targetPlan.damageContributions,
    conditionApplications: targetPlan.conditionApplications,
  });
}

function indigoProgress(instance) {
  return normalizeRepeatedSaveProgress(
    instance?.mechanics?.prismaticWallIndigoProgress || {},
    { successThreshold: 3, failureThreshold: 3 },
  );
}

function indigoProgressAction(instance, progress) {
  const parentEffectId = String(instance?.parentEffectId || "").trim();
  const sourceId = String(instance?.sourceId || "").trim();
  const sourceName = String(instance?.sourceName || "").trim();
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    parentEffectId: "$parent",
    name: "Trattenuto",
    options: {
      sourceId,
      sourceName,
      parentEffectId: "$parent",
      type: "spell",
      spellId: PRISMATIC_WALL_SPELL_ID,
      effectId: `${PRISMATIC_WALL_INDIGO_EFFECT_PREFIX}${parentEffectId}`,
      effectDetail: "TS Costituzione alla fine di ogni proprio turno; 3 successi terminano Muro Prismatico, 3 fallimenti rendono Pietrificato.",
      expiry: { mode: "manual" },
      mechanics: {
        prismaticWallLayer: "indigo",
        prismaticWallIndigoProgress: progress,
      },
      summaryParts: [{
        id: `${PRISMATIC_WALL_INDIGO_EFFECT_PREFIX}${parentEffectId}:progress`,
        label: layerProgressLabel(progress),
      }],
      manualRemoval: true,
      saveReminder: indigoReminder(),
    },
  };
}

function petrifiedAction(instance) {
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    name: "Pietrificato",
    options: {
      sourceId: String(instance?.sourceId || "").trim(),
      sourceName: String(instance?.sourceName || "").trim(),
      type: "spell",
      spellId: PRISMATIC_WALL_SPELL_ID,
      effectId: `${PRISMATIC_WALL_INDIGO_EFFECT_PREFIX}${String(instance?.parentEffectId || "").trim()}:petrified`,
      effectDetail: "Pietrificato permanentemente dal fallimento di tre TS contro lo strato Indaco.",
      expiry: { mode: "manual" },
      manualRemoval: true,
    },
  };
}

function removeWallAction(instance) {
  return {
    kind: "spell",
    action: "remove-instance",
    targetId: "$source",
    instanceId: "$parent",
    casterId: "$source",
  };
}

export function prismaticWallIndigoReminderForInstance({
  instance = null,
  reminder = null,
} = {}) {
  if (
    !String(instance?.effectId || "").startsWith(PRISMATIC_WALL_INDIGO_EFFECT_PREFIX)
    || !reminder
  ) return reminder;

  const current = indigoProgress(instance);
  const successAdvance = advanceRepeatedSaveProgress(current, "success");
  const failureAdvance = advanceRepeatedSaveProgress(current, "failure");
  return freeze({
    ...reminder,
    success: "keep-effect",
    label: `Muro prismatico · ${layerProgressLabel(current)}.`,
    resolution: {
      success: successAdvance.terminal === "success"
        ? {
          mode: "remove-effect",
          actions: [removeWallAction(instance)],
        }
        : {
          mode: "keep-effect",
          actions: [indigoProgressAction(instance, successAdvance.progress)],
        },
      failure: failureAdvance.terminal === "failure"
        ? {
          mode: "remove-effect",
          actions: [petrifiedAction(instance)],
        }
        : {
          mode: "keep-effect",
          actions: [indigoProgressAction(instance, failureAdvance.progress)],
        },
      immune: "remove-effect",
    },
  });
}

export function prismaticWallTraversalMarker(castContext, traversalId) {
  const context = castContext && typeof castContext === "object" ? clone(castContext) : {};
  const state = normalizePrismaticWallState(context.prismaticWall);
  const normalizedId = String(traversalId || "").trim();
  if (!normalizedId) return context;
  return {
    ...context,
    prismaticWall: {
      ...state,
      resolvedTraversalIds: uniqueIds([...state.resolvedTraversalIds, normalizedId])
        .slice(-PRISMATIC_WALL_TRAVERSAL_HISTORY_LIMIT),
    },
  };
}

export function prismaticWallStateMatches(left, right) {
  const first = normalizePrismaticWallState(left);
  const second = normalizePrismaticWallState(right);
  return JSON.stringify(first) === JSON.stringify(second);
}
