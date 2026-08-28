import {
  spellEffectConditionName,
  spellEffectConditionOptions,
} from "./spellEffectCore.js";
import {
  isPreparedSpellCast,
  spellPreparedResolutionAvailable,
} from "./spellCastPhaseCore.js";
import { buildSpellActiveResolutionResourceOperations } from "./spellActiveResolutionCore.js";
import { resolveTargetingCapacity } from "./spellTargetingCapacityCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function manualActions(spell) {
  const byId = new Map();
  for (const action of Array.isArray(spell?.activeActions) ? spell.activeActions : []) {
    const id = String(action?.id || "").trim();
    if (!id) continue;
    byId.set(id, {
      ...(byId.get(id) || {}),
      ...clone(action),
    });
  }
  return [...byId.values()];
}

export function getSpellActiveAction(spell, actionId = "") {
  const requestedId = String(actionId || "").trim();
  if (!requestedId) return null;
  return manualActions(spell)
    .find((action) => String(action?.id || "").trim() === requestedId) || null;
}

function linkedEffectIds(effectInstances = []) {
  return new Set((Array.isArray(effectInstances) ? effectInstances : [])
    .filter((entry) => entry?.active !== false)
    .map((entry) => String(entry?.effectId || "").trim())
    .filter(Boolean));
}

function consumedEffectIds(action) {
  return uniqueIds(action?.consumesEffectIds);
}

function rejectedActiveEffectIds(action) {
  return new Set(uniqueIds(action?.rejectActiveEffectIds));
}

function requiredTargetIds(action, effectInstances = []) {
  const requiredEffectId = String(action?.requiredTargetEffectId || "").trim();
  if (!requiredEffectId) return [];
  return uniqueIds((Array.isArray(effectInstances) ? effectInstances : [])
    .filter((entry) => (
      entry?.active !== false
      && String(entry?.effectId || "").trim() === requiredEffectId
    ))
    .map((entry) => entry?.itemId));
}

function actionTargetingCapacity(
  action,
  {
    targetIds = [],
    targetCount = null,
    castContext = null,
    ignoreTargetLimit = false,
  } = {},
) {
  const normalizedTargetIds = uniqueIds(targetIds);
  const countTargetIds = normalizedTargetIds.length || targetCount === null
    ? normalizedTargetIds
    : Array.from({ length: Math.max(0, Math.floor(Number(targetCount) || 0)) }, (_, index) => (
      `active-target-${index}`
    ));
  return resolveTargetingCapacity({
    mode: "discrete",
    declaration: action,
    slotLevel: castContext?.slotLevel,
    castContext,
    targetIds: countTargetIds,
    initialTargeting: false,
    defaultDiscreteTargeting: false,
    ignoreTargetLimit,
    source: "active-action",
  });
}

function maximumTargets(action, options = {}) {
  const maximum = actionTargetingCapacity(action, options).maximum;
  return Number.isInteger(maximum) && maximum > 0 ? maximum : 0;
}

function groupTargetIds(group) {
  const targets = group?.targets;
  if (targets instanceof Map) return uniqueIds([...targets.keys()]);
  if (Array.isArray(targets)) return uniqueIds(targets);
  if (targets && typeof targets === "object") return uniqueIds(Object.keys(targets));
  return [];
}

export function getSpellOverviewActions({
  spell = null,
  castContext = null,
  casterId = "",
  targetIds = [],
  effectInstances = [],
  zoneItemId = "",
  appliedAt = null,
  currentTurnKey = "",
} = {}) {
  if (!spell) return [];
  const actions = [];
  if (isPreparedSpellCast({
    spell,
    castContext,
    casterId,
    targetIds,
  }) && spellPreparedResolutionAvailable(spell)) {
    actions.push({
      id: "resolve-prepared",
      type: "resolve",
      buttonLabel: "Risolvi",
      subjectMode: "selected",
      requiresTargets: true,
    });
  }

  const availableEffectIds = linkedEffectIds(effectInstances);
  const boardTokenReferences = new Map(
    (Array.isArray(spell?.boardToken?.actions) ? spell.boardToken.actions : [])
      .map((action) => [String(action?.id || "").trim(), action]),
  );
  for (const candidate of manualActions(spell)) {
    const action = candidate?.requiresZoneRoot === true && !String(zoneItemId || "").trim()
      ? boardTokenReferences.get(String(candidate?.id || "").trim()) || candidate
      : candidate;
    if (action.turnStartPrompt === true && action.showInOverview !== true) continue;
    if (candidate.requiresZoneRoot === true
      && !String(zoneItemId || "").trim()
      && action === candidate) {
      continue;
    }
    const consumedIds = consumedEffectIds(action);
    if (consumedIds.length && !consumedIds.every((id) => availableEffectIds.has(id))) {
      continue;
    }
    const castTurnKey = String(appliedAt?.turnKey || "").trim();
    const unavailableReason = action.availableAfterCast === true
      && castTurnKey
      && String(currentTurnKey || "").trim() === castTurnKey
      ? "Disponibile dal turno successivo al lancio."
      : "";
    const unavailableTargetIds = [];
    if (action.rejectRememberedTargets === true) {
      unavailableTargetIds.push(
        ...uniqueIds(targetIds).filter((targetId) => targetId !== casterId),
      );
    }
    const linkedTargetIds = requiredTargetIds(action, effectInstances);
    if (action.requiredTargetEffectId) {
      unavailableTargetIds.push(
        ...uniqueIds(targetIds).filter((targetId) => !linkedTargetIds.includes(targetId)),
      );
    }
    const activeEffectIds = rejectedActiveEffectIds(action);
    if (activeEffectIds.size) {
      unavailableTargetIds.push(...(Array.isArray(effectInstances) ? effectInstances : [])
        .filter((entry) => (
          entry?.active !== false
          && activeEffectIds.has(String(entry?.effectId || "").trim())
        ))
        .map((entry) => entry?.itemId));
    }
    if (action.forbidCasterTarget === true && casterId) {
      unavailableTargetIds.push(casterId);
    }
    const subjectMode = action.subjectMode === "caster" || action.subjectMode === "none"
      ? action.subjectMode
      : "selected";
    actions.push({
      ...action,
      type: "manual",
      subjectMode,
      requiresTargets: subjectMode === "selected",
      unavailableTargetIds: uniqueIds(unavailableTargetIds),
      ...(action.requiredTargetEffectId ? { requiredTargetIds: linkedTargetIds } : {}),
      ...(unavailableReason ? { unavailableReason } : {}),
    });
  }
  return actions;
}

export function spellActiveActionPresentation(
  action,
  selectedTargets = 0,
  choiceValue = action?.choiceValue || "",
) {
  const selectedTargetIds = Array.isArray(selectedTargets)
    ? uniqueIds(selectedTargets)
    : [];
  const count = selectedTargetIds.length || Math.max(
    0,
    Math.floor(Number(selectedTargets) || 0),
  );
  const label = String(action?.buttonLabel || action?.label || "Attiva").trim() || "Attiva";
  const needsTargets = action?.subjectMode !== "caster"
    && action?.subjectMode !== "none";
  const targetCapacity = actionTargetingCapacity(action, {
    targetIds: selectedTargetIds,
    targetCount: selectedTargetIds.length ? null : count,
  });
  const maxTargets = Number.isInteger(targetCapacity.maximum) && targetCapacity.maximum > 0
    ? targetCapacity.maximum
    : 0;
  const tooManyTargets = needsTargets && targetCapacity.exceeded;
  const unavailableTargets = new Set(uniqueIds(action?.unavailableTargetIds));
  const hasUnavailableTarget = selectedTargetIds.some((targetId) =>
    unavailableTargets.has(targetId)
  );
  const requiredTargetIdSet = new Set(uniqueIds(action?.requiredTargetIds));
  const requiredTargetMissing = !!String(action?.requiredTargetEffectId || "").trim()
    && (!requiredTargetIdSet.size
      || selectedTargetIds.some((targetId) => !requiredTargetIdSet.has(targetId)));
  const choice = action?.choice && typeof action.choice === "object"
    ? action.choice
    : null;
  const choiceOptions = Array.isArray(choice?.options) ? choice.options : [];
  const normalizedChoiceValue = String(choiceValue || "").trim();
  const choiceMissing = !!choice
    && choice.required === true
    && !choiceOptions.some((option) => option?.value === normalizedChoiceValue);
  const choiceUnknown = !!choice
    && normalizedChoiceValue !== ""
    && !choiceOptions.some((option) => option?.value === normalizedChoiceValue);
  const unavailableReason = String(action?.unavailableReason || "").trim();
  const singular = String(action?.countLabelSingular || "bersaglio").trim();
  const plural = String(action?.countLabelPlural || "bersagli").trim();
  return {
    disabled: !!unavailableReason
      || needsTargets && (count < 1
        || tooManyTargets
        || hasUnavailableTarget
        || requiredTargetMissing)
      || choiceMissing
      || choiceUnknown,
    text: needsTargets ? `${label} · ${count} ${count === 1 ? singular : plural}` : label,
    title: needsTargets
      ? count < 1
        ? String(action?.emptySelectionTitle || "Seleziona almeno un bersaglio.").trim()
        : tooManyTargets
          ? String(
            action?.tooManySelectionTitle
            || `Seleziona al massimo ${maxTargets} bersagli.`
          ).trim()
          : hasUnavailableTarget
            ? String(
              action?.unavailableSelectionTitle
              || "La selezione contiene un bersaglio non disponibile."
            ).trim()
          : requiredTargetMissing
            ? String(
              action?.unavailableSelectionTitle
              || "Seleziona un bersaglio collegato a questa istanza."
            ).trim()
          : String(action?.detail || label).trim()
      : unavailableReason
        ? unavailableReason
      : choiceMissing
        ? "Scegli una variante prima di confermare."
        : choiceUnknown
          ? "La variante selezionata non è valida."
          : String(action?.detail || label).trim(),
  };
}

export function buildSpellActiveActionPlan({
  spell = null,
  actionId = "",
  group = null,
  selectedTargetIds = [],
  appliedAt = null,
  casterName = "",
  ignoreTargetLimit = false,
} = {}) {
  const actionCandidates = manualActions(spell)
    .filter((candidate) => String(candidate?.id || "") === String(actionId || ""));
  const action = actionCandidates.length
    ? actionCandidates.reduce((merged, candidate) => ({ ...merged, ...candidate }), {})
    : null;
  const casterId = String(group?.casterId || "").trim();
  const parentInstanceId = String(group?.instanceId || "").trim();
  const subjectIds = action?.subjectMode === "caster"
    ? uniqueIds([casterId])
    : action?.subjectMode === "none"
      ? uniqueIds([casterId])
      : uniqueIds(selectedTargetIds);
  const errors = [];
  if (!action) errors.push("action-required");
  if (!casterId) errors.push("caster-required");
  if (!parentInstanceId) errors.push("instance-required");
  if (!subjectIds.length) errors.push("targets-required");
  const targetCapacity = actionTargetingCapacity(action, {
    targetIds: subjectIds,
    castContext: group?.castContext,
    ignoreTargetLimit,
  });
  if (targetCapacity.errors.length) errors.push(...targetCapacity.errors);
  if (targetCapacity.exceeded && !ignoreTargetLimit) {
    const maxTargets = maximumTargets(action, { castContext: group?.castContext });
    errors.push(`targets-maximum:${maxTargets}`);
  }
  const rememberedTargetIds = new Set(
    action?.rejectRememberedTargets === true
      ? groupTargetIds(group).filter((targetId) => targetId !== casterId)
      : [],
  );
  const reusedTargetIds = subjectIds.filter((targetId) =>
    rememberedTargetIds.has(targetId)
  );
  if (reusedTargetIds.length) {
    errors.push(`targets-already-used:${reusedTargetIds.join(",")}`);
  }
  if (action?.forbidCasterTarget === true && subjectIds.includes(casterId)) {
    errors.push("targets-caster-forbidden");
  }

  const effectInstances = Array.isArray(group?.effectInstances)
    ? group.effectInstances
    : [];
  const requiredTargetIdSet = new Set(requiredTargetIds(action, effectInstances));
  if (action?.requiredTargetEffectId
    && (!requiredTargetIdSet.size
      || subjectIds.some((targetId) => !requiredTargetIdSet.has(targetId)))) {
    errors.push(`targets-required-effect:${String(action.requiredTargetEffectId).trim()}`);
  }
  const activeEffectIds = rejectedActiveEffectIds(action);
  const activeEffectTargetIds = new Set(effectInstances
    .filter((entry) => (
      entry?.active !== false
      && activeEffectIds.has(String(entry?.effectId || "").trim())
    ))
    .map((entry) => String(entry?.itemId || "").trim())
    .filter(Boolean));
  const activeTargetIds = subjectIds.filter((targetId) =>
    activeEffectTargetIds.has(targetId)
  );
  if (activeTargetIds.length) {
    errors.push(`targets-active-effect:${activeTargetIds.join(",")}`);
  }
  const removals = [];
  for (const effectId of consumedEffectIds(action)) {
    const matches = effectInstances.filter((entry) =>
      entry?.active !== false
      && String(entry?.effectId || "") === effectId
    );
    if (!matches.length) {
      errors.push(`effect-unavailable:${effectId}`);
      continue;
    }
    for (const entry of matches) {
      const itemId = String(entry?.itemId || "").trim();
      const instanceId = String(entry?.instanceId || "").trim();
      if (itemId && instanceId) removals.push({ itemId, instanceId });
    }
  }

  let resourceOperations = [];
  if (action?.resource && !errors.length) {
    const resourceResult = buildSpellActiveResolutionResourceOperations({
      action,
      payload: {
        instanceId: parentInstanceId,
        casterId,
        spellId: spell?.id || group?.spellId,
        spellName: spell?.displayName || spell?.name || group?.name,
      },
      spellEntry: {
        instanceId: parentInstanceId,
        casterId,
        casterName: group?.casterName || casterName,
        spellId: spell?.id || group?.spellId,
        name: group?.name || spell?.displayName || spell?.name,
        turns: Math.max(
          1,
          ...(Array.isArray(group?.turns)
            ? group.turns.map((value) => Math.floor(Number(value) || 0)).filter((value) => value > 0)
            : []),
          Math.floor(Number(spell?.defaultTurns) || 1),
        ),
        conc: spell?.concentration === true,
        appliedAt: group?.appliedAt,
        castContext: group?.castContext || {},
      },
    });
    if (!resourceResult.valid) {
      errors.push(...(resourceResult.errors || ["active-resolution-resource-missing"]));
    } else {
      resourceOperations = [...resourceResult.operations];
    }
  }

  if (errors.length) {
    return {
      valid: false,
      errors,
      action,
      operations: [],
      historyLabel: "",
    };
  }

  const operations = [...resourceOperations];
  if (action.replaceSpellTargets === true) {
    const previousTargetIds = groupTargetIds(group)
      .filter((targetId) => !subjectIds.includes(targetId));
    const storedName = String(
      group?.storedName || group?.name || spell?.displayName || spell?.name || "Incantesimo"
    ).trim();
    const remainingTurns = (Array.isArray(group?.turns) ? group.turns : [])
      .map((value) => Math.floor(Number(value) || 0))
      .filter((value) => value > 0);
    const currentTurns = remainingTurns.length
      ? Math.max(...remainingTurns)
      : Math.max(1, Math.floor(Number(spell?.defaultTurns) || 1));
    operations.push({
      type: "spell:upsert",
      targetIds: subjectIds,
      name: storedName,
      turns: currentTurns,
      conc: spell?.concentration === true,
      source: casterId,
      ...(casterName ? { casterName: String(casterName).trim() } : {}),
      instanceId: parentInstanceId,
      spellId: String(spell?.id || group?.spellId || "").trim(),
      ...(group?.appliedAt ? { appliedAt: clone(group.appliedAt) } : {}),
      ...(group?.castContext && typeof group.castContext === "object"
        ? { castContext: clone(group.castContext) }
        : {}),
    });
    if (spell?.concentration === true) {
      operations.push({
        type: "concentration:register",
        casterId,
        targetIds: subjectIds,
        name: storedName,
        instanceId: parentInstanceId,
        spellId: String(spell?.id || group?.spellId || "").trim(),
        ...(group?.appliedAt ? { appliedAt: clone(group.appliedAt) } : {}),
        ...(group?.castContext && typeof group.castContext === "object"
          ? { castContext: clone(group.castContext) }
          : {}),
      });
    }
    if (previousTargetIds.length) {
      operations.push({
        type: "concentration:break-targets",
        casterId,
        targetIds: previousTargetIds,
        reference: parentInstanceId,
      });
    }
  }
  if (removals.length) {
    operations.push({
      type: "condition:remove-instances",
      removals,
    });
  }
  for (const effect of action.effects || []) {
    const label = spellEffectConditionName(effect);
    const kind = effect?.kind === "buff" || effect?.kind === "debuff"
      ? effect.kind
      : "";
    if (!label || !kind) continue;
    operations.push({
      type: "condition:add",
      targetIds: subjectIds,
      conditionName: label,
      options: spellEffectConditionOptions(effect, {
        sourceId: casterId,
        sourceName: String(casterName || "").trim(),
        ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
      }, parentInstanceId),
    });
  }
  if (operations.some((operation) => operation.type === "condition:add")) {
    operations.push({
      type: "condition:automate",
      subjectIds,
    });
  }
  if (action.rememberTargets === true && action.subjectMode !== "none") {
    operations.push({
      type: "concentration:register",
      casterId,
      targetIds: subjectIds,
      name: String(group?.name || spell?.displayName || spell?.name || "").trim(),
      instanceId: parentInstanceId,
      spellId: String(spell?.id || "").trim(),
    });
  }

  const spellName = String(spell?.displayName || spell?.name || group?.name || "Incantesimo");
  const actionLabel = String(action.buttonLabel || action.label || "Attivazione");
  const zoneRuleChoice = String(action.zoneRuleChoice || "").trim();
  const entityAction = action.entityAction && typeof action.entityAction === "object"
    ? { ...clone(action.entityAction), actionId: String(action.id || "").trim() }
    : null;
  const delegatedResolution = [
    "save-area",
    "single-attack",
    "single-save",
    "single-heal",
    "child-zone",
    "prismatic-wall-traversal",
    "prismatic-wall-layers",
  ]
    .includes(String(action?.resolutionKind || "").trim());
  const hasAction = operations.length > 0
    || !!zoneRuleChoice
    || !!entityAction
    || delegatedResolution;
  return {
    valid: hasAction,
    errors: hasAction ? [] : ["operations-required"],
    action,
    operations,
    subjectIds,
    ...(zoneRuleChoice ? { zoneRuleChoice } : {}),
    ...(entityAction ? { entityAction } : {}),
    ...(delegatedResolution ? {
      delegatedResolution: true,
      resolutionKind: String(action.resolutionKind).trim(),
    } : {}),
    historyLabel: `Attivazione: ${spellName} · ${actionLabel}`,
  };
}
