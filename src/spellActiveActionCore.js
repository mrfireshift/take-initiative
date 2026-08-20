import { spellEffectConditionOptions } from "./spellEffectCore.js";
import { isPreparedSpellCast } from "./spellCastPhaseCore.js";

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

function maximumTargets(action) {
  const value = Math.floor(Number(action?.maxTargets) || 0);
  return value > 0 ? value : 0;
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
  })) {
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
  const maxTargets = maximumTargets(action);
  const tooManyTargets = needsTargets && maxTargets > 0 && count > maxTargets;
  const unavailableTargets = new Set(uniqueIds(action?.unavailableTargetIds));
  const hasUnavailableTarget = selectedTargetIds.some((targetId) =>
    unavailableTargets.has(targetId)
  );
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
      || needsTargets && (count < 1 || tooManyTargets || hasUnavailableTarget)
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
} = {}) {
  const actionCandidates = manualActions(spell)
    .filter((candidate) => String(candidate?.id || "") === String(actionId || ""));
  const action = actionCandidates.length
    ? actionCandidates.reduce((merged, candidate) => ({ ...merged, ...candidate }), {})
    : null;
  const casterId = String(group?.casterId || "").trim();
  const parentInstanceId = String(group?.instanceId || "").trim();
  const subjectIds = action?.id === "heat-metal-repeat"
    ? uniqueIds(selectedTargetIds)
    : action?.subjectMode === "caster"
    ? uniqueIds([casterId])
    : action?.subjectMode === "none"
      ? uniqueIds([casterId])
      : uniqueIds(selectedTargetIds);
  const errors = [];
  if (!action) errors.push("action-required");
  if (!casterId) errors.push("caster-required");
  if (!parentInstanceId) errors.push("instance-required");
  if (!subjectIds.length) errors.push("targets-required");
  const maxTargets = maximumTargets(action);
  if (maxTargets > 0 && subjectIds.length > maxTargets) {
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

  if (errors.length) {
    return {
      valid: false,
      errors,
      action,
      operations: [],
      historyLabel: "",
    };
  }

  const operations = [];
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
    const label = String(effect?.label || "").trim();
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
  if (action.rememberTargets === true) {
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
  const delegatedResolution = ["save-area", "single-attack", "single-save", "child-zone"]
    .includes(String(action?.resolutionKind || "").trim())
    && action?.id !== "heat-metal-repeat";
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
