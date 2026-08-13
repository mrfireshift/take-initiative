import {
  buildSpellPanelViewModel,
  spellPanelValidationMessage,
} from "./spellUnifiedPanelCore.js";
import { spellTargetMatchesFilters } from "./spellsPanelTargetPicker.js";
import {
  calculateQuickHPChange,
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
} from "./quickHpCore.js";
import {
  buildCatalogViewModel,
  renderSpellCatalogCombobox,
} from "./spellUnifiedPanelCatalogView.js";
import {
  createNode,
  clearNode,
} from "./spellUnifiedPanelDom.js";
import {
  renderAutomationAndVariantPanel,
  renderCompositionPanel,
  renderPhaseSelector,
  renderWorkflowContextBar,
} from "./spellUnifiedPanelContextView.js";
import {
  renderPlacementStage,
  renderTargetMatrix,
} from "./spellUnifiedPanelTargetView.js";
import {
  renderActiveSpellSection,
  renderFeedbackBanner,
  renderManualSpellEffectPanel,
  renderReviewFooter,
  renderZoneTriggerBanner,
} from "./spellUnifiedPanelEffectsView.js";
import {
  spellUnifiedActiveActionPresentation,
} from "./spellUnifiedActiveAdapter.js";
import { spellSaveDamageFactor } from "./spellCastResolutionRules.js";

const SUBJECT_LABELS = Object.freeze({
  none: "Nessun soggetto",
  selected: "Bersagli selezionati",
  self: "Caster",
  caster: "Caster",
  area: "Area sul tabellone",
});

const TARGET_MODE_LABELS = Object.freeze({
  none: "Nessuna selezione",
  discrete: "Selezione discreta",
  geometric: "Selezione geometrica",
});

const PLACEMENT_POLICY_LABELS = Object.freeze({
  unavailable: "Non previsto",
  required: "Richiesto",
  optional: "Opzionale",
  automatic: "Automatico",
});

const CONCENTRATION_ACTION_LABELS = Object.freeze({
  replace: "Sostituisce la concentrazione corrente",
  dismiss: "Può essere congedata dal caster",
});

const FEEDBACK_LABELS = Object.freeze({
  info: "Informazione",
  loading: "Operazione in corso",
  error: "Controlla i dati richiesti",
  success: "Operazione completata",
});

const LANES = Object.freeze({
  "spell-lifecycle": "Lifecycle spell",
  "area-transaction": "Transazione area",
  "active-resolution": "Risoluzione attiva",
});

const FACTION_LABELS = Object.freeze({
  pc: "PG",
  ally: "Alleati",
  neutral: "Neutrali",
  enemy: "Nemici",
});

function asText(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function subjectLabel(value) {
  return SUBJECT_LABELS[value] || (value ? value : SUBJECT_LABELS.none);
}

function targetModeLabel(value) {
  return TARGET_MODE_LABELS[value] || TARGET_MODE_LABELS.none;
}

function optionList(options = [], emptyLabel = "Seleziona") {
  const normalized = Array.isArray(options)
    ? options.map((option) => ({
      value: asText(option?.value),
      label: asText(option?.label) || asText(option?.value),
    })).filter((option) => option.value)
    : [];
  return [
    { value: "", label: emptyLabel },
    ...normalized,
  ];
}

function normalizeCasterOptions(options = []) {
  return optionList(options, "Seleziona caster");
}

function placementLabels(placement) {
  const policy = asText(placement?.policy) || "unavailable";
  const state = asText(placement?.state) || "idle";
  const batchTotal = Math.max(0, Math.floor(Number(placement?.batchTotal) || 0));
  const batchIndex = batchTotal > 0
    ? Math.max(0, Math.min(
      batchTotal,
      Math.floor(Number(placement?.batchIndex) || 0),
    ))
    : 0;
  const isBatch = batchTotal > 0;
  const pendingStates = new Set(["pending", "placing", "review"]);
  const stateLabels = {
    unavailable: "Non prevista",
    automatic: "Gestito automaticamente",
    idle: policy === "optional" ? "Posizione non ancora aggiunta" : "Richiede una posizione",
    pending: "Disegno area in corso",
    review: "Controllo area",
    confirmed: "Area confermata",
    cancelled: "Area annullata",
    stale: "Area da rinnovare",
    failed: "Area da riprovare",
    error: "Area da riprovare",
  };
  const shapeLabels = {
    circle: "cerchio",
    cone: "cono",
    cube: "cubo",
    line: "linea",
    sphere: "sfera",
    square: "quadrato",
  };
  const kindLabels = {
    aura: "Aura",
    zone: "Zona",
    "board-token": "Pedina",
    instant: "Area",
  };
  const ruleNames = (placement?.rules || []).map((rule) => [
    kindLabels[asText(rule.kind)] || "Area",
    rule.shape ? `forma ${shapeLabels[asText(rule.shape)] || rule.shape}` : "",
  ].filter(Boolean).join(" · "));
  const previewLabel = placement?.preview
    ? asText(placement.preview.label) || "Anteprima aggiornata"
    : "";
  return {
    visible: policy !== "unavailable",
    policy,
    policyLabel: PLACEMENT_POLICY_LABELS[policy] || policy,
    state,
    statusLabel: stateLabels[state] || state,
    detail: policy === "automatic"
      ? "La posizione segue il soggetto dell'incantesimo."
      : policy === "optional"
        ? "Puoi confermare il lancio senza aggiungere una posizione geometrica."
      : isBatch
        ? "Posiziona tutti gli oggetti sulla mappa e conferma il gruppo."
      : "Disegna l'area sulla mappa e confermala per acquisire i bersagli.",
    rules: clone(placement?.rules || []),
    rulesLabel: ruleNames.join(" / "),
    pending: placement?.pending === true || pendingStates.has(state),
    confirmed: placement?.confirmed === true,
    targetLocked: placement?.targetLocked === true,
    unlockVisible: placement?.targetLocked === true,
    preview: clone(placement?.preview),
    previewLabel,
    isBatch,
    batchIndex,
    batchTotal,
    batchComplete: !isBatch || batchIndex >= batchTotal,
    progressLabel: isBatch ? `${batchIndex}/${batchTotal} oggetti posizionati` : "",
    error: asText(placement?.error),
    confirmVisible: pendingStates.has(state) && !!asText(placement?.requestId),
    cancelVisible: pendingStates.has(state) && !!asText(placement?.requestId),
    visibleAction: policy !== "automatic"
      && !placement?.confirmed
      && !pendingStates.has(state),
    actionLabel: ["error", "failed"].includes(state)
      ? "Riprova area"
      : policy === "optional"
        ? "Aggiungi area"
        : isBatch
          ? "Posiziona oggetti"
        : "Posiziona area",
  };
}

function normalizeTargetCandidates(
  candidates,
  targetIds,
  outcomes,
  maximum,
  targetLocked = false,
  outcomeMode = "save",
  attackOutcome = "",
  outcomeOptions = [],
) {
  const selected = new Set(targetIds);
  const selectedCount = selected.size;
  const normalized = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const key = asText(candidate?.key || candidate?.value);
    const label = [candidate?.label, candidate?.name, key, "Token"]
      .map(asText)
      .find(Boolean) || "Token";
    const outcomeValue = outcomeMode === "attack" && selected.has(key)
      ? attackOutcome
      : outcomes && typeof outcomes === "object"
        ? outcomes[key]
        : null;
    const outcome = outcomeValue && typeof outcomeValue === "object"
      ? outcomeValue
      : outcomeValue
        ? { value: asText(outcomeValue), label: asText(outcomeValue) }
        : null;
    return {
      key,
      label,
      subtitle: asText(candidate?.subtitle),
      name: label.toLocaleLowerCase("it"),
      faction: asText(candidate?.faction),
      factionLabel: asText(candidate?.factionLabel)
        || FACTION_LABELS[asText(candidate?.faction)]
        || asText(candidate?.faction),
      hp: numberOrNull(candidate?.hp),
      hpMax: numberOrNull(candidate?.hpMax),
      eligible: candidate?.eligible !== false,
      selected: selected.has(key),
      disabled: targetLocked || (!selected.has(key)
        && Number.isInteger(maximum)
        && maximum >= 0
        && selectedCount >= maximum),
      outcome,
      outcomeOptions: clone(outcomeOptions),
    };
  }).filter((candidate) => candidate.key);
  return normalized.sort((left, right) => Number(right.selected) - Number(left.selected));
}

function targetFilterModel(candidates, targetFilters = {}) {
  const name = asText(targetFilters.name);
  const factions = new Set(
    (Array.isArray(targetFilters.factions) ? targetFilters.factions : [])
      .map((value) => asText(value))
      .filter(Boolean),
  );
  const discovered = Array.from(new Set(
    candidates.map((candidate) => candidate.faction).filter(Boolean),
  ));
  const factionOptions = [
    ...Object.entries(FACTION_LABELS)
      .map(([value, label]) => ({ value, label })),
    ...discovered
      .filter((value) => !Object.prototype.hasOwnProperty.call(FACTION_LABELS, value))
      .map((value) => ({
        value,
        label: candidates.find((candidate) => candidate.faction === value)?.factionLabel || value,
      })),
  ];
  return {
    name,
    factions: [...factions],
    factionOptions,
    visibleCount: candidates.filter((candidate) => spellTargetMatchesFilters(
      candidate,
      factions,
      name,
    )).length,
  };
}

function spatialRuleLabel(spatial = null) {
  if (!spatial || typeof spatial !== "object") return "";
  const mode = asText(spatial.mode);
  const primary = spatial.primaryRangeMeters ?? spatial.range?.value;
  const secondary = spatial.secondaryRangeMeters;
  if (mode === "primary-and-secondary-range") {
    return [
      primary ? `Primario entro ${primary} m` : "",
      secondary ? `Secondari entro ${secondary} m` : "",
    ].filter(Boolean).join(" · ");
  }
  if (mode === "caster-range") return primary ? `Bersagli entro ${primary} m` : "";
  if (mode === "pairwise-distance") {
    return primary ? `Distanza massima tra bersagli: ${primary} m` : "Distanze tra bersagli";
  }
  if (mode === "action-range") return primary ? `Portata: ${primary} m` : "";
  return "";
}

function hpPreviewFor(
  presentation,
  session,
  candidates,
  outcomeMode = "save",
  spellId = "",
) {
  const inputs = presentation?.inputs || {};
  const isHealing = inputs.healing?.visible === true;
  const isDamage = inputs.damage?.visible === true;
  if (!isHealing && !isDamage) return { visible: false, targets: [] };

  const mode = isHealing ? QUICK_HP_MODES.HEAL : QUICK_HP_MODES.DAMAGE;
  const value = numberOrNull(session?.hpValues?.[isHealing ? "healing" : "damage"]);
  const preview = {
    visible: true,
    mode,
    amount: value,
    valid: value !== null && value >= 0,
    label: isHealing ? "Anteprima cura" : "Anteprima danno",
    targets: [],
  };
  if (!preview.valid) return preview;

  preview.targets = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate.selected)
    .map((candidate) => {
      const beforeHP = candidate.hp;
      const hpMax = candidate.hpMax;
      const base = {
        key: candidate.key,
        label: candidate.label,
        beforeHP,
        hpMax,
        available: beforeHP !== null && hpMax !== null,
        pendingOutcome: false,
        factor: isHealing ? QUICK_HP_FACTORS.FULL : null,
        factorLabel: isHealing ? "Cura" : "Esito richiesto",
        afterHP: null,
        delta: null,
      };
      if (!base.available) return base;
      const outcome = asText(candidate.outcome?.value).toLocaleLowerCase("it");
      if (!isHealing && !outcome) {
        return { ...base, pendingOutcome: true };
      }
      const immune = !isHealing && outcome === "immune";
      const attackMiss = !isHealing && outcomeMode === "attack" && outcome === "miss";
      const factor = isHealing
        ? QUICK_HP_FACTORS.FULL
        : attackMiss
          ? "zero"
        : immune
          ? QUICK_HP_FACTORS.FULL
          : outcome === "passed"
            ? spellSaveDamageFactor(spellId, outcome) || QUICK_HP_FACTORS.HALF
            : QUICK_HP_FACTORS.FULL;
      const noDamage = !isHealing && factor === "zero";
      const change = calculateQuickHPChange({
        mode,
        value: immune || attackMiss || noDamage ? 0 : value,
        factor: attackMiss ? QUICK_HP_FACTORS.FULL : factor,
        hp: beforeHP,
        hpMax,
      });
      return {
        ...base,
        factor: immune ? "immune" : factor,
        factorLabel: isHealing
          ? "Cura"
          : attackMiss
            ? "Mancato"
          : immune
            ? "Immune"
            : noDamage
              ? "No danno"
            : factor === QUICK_HP_FACTORS.HALF
              ? "Metà"
              : "Pieno",
        afterHP: change.afterHP,
        delta: change.delta,
      };
    });
  return preview;
}

function targetContextFields(presentation, session, selectedTargets = []) {
  const workflow = presentation?.targeting?.workflow;
  const fields = Array.isArray(workflow?.context?.fields)
    ? workflow.context.fields
    : Array.isArray(presentation?.targeting?.context?.fields)
      ? presentation.targeting.context.fields
      : [];
  return {
    visible: presentation?.inputs?.targetContext?.visible === true && fields.length > 0,
    label: "Contesto bersaglio",
    fields: clone(fields),
    values: clone(session?.targetContext || {}),
    targets: (Array.isArray(selectedTargets) ? selectedTargets : []).map((target) => ({
      key: asText(target?.key),
      label: asText(target?.label) || asText(target?.key),
      values: clone(session?.targetContext?.[target?.key] || {}),
    })).filter((target) => target.key),
  };
}

function normalizeEffectFields(presentation, session, validation) {
  const inputs = presentation?.inputs || {};
  const hpValues = session?.hpValues || {};
  const fields = [];
  if (inputs.damage?.visible) {
    fields.push({
      id: "damage",
      type: "number",
      label: "Danno",
      hint: "Valore da applicare ai bersagli.",
      min: 0,
      value: hpValues.damage ?? "",
      invalid: validation.firstInvalidField === "damage",
    });
  }
  if (inputs.healing?.visible) {
    fields.push({
      id: "healing",
      type: "number",
      label: "Cura",
      hint: "Valore da applicare ai bersagli.",
      min: 0,
      value: hpValues.healing ?? "",
      invalid: validation.firstInvalidField === "healing",
    });
  }
  return fields;
}

function normalizeActiveAction(action, overview, session) {
  const selected = asText(session?.activeInstanceId) === asText(overview?.instanceId)
    && asText(session?.activeActionId) === asText(action?.id);
  const presentation = spellUnifiedActiveActionPresentation({
    action,
    selectedTargetIds: session?.targetIds || [],
    choiceValue: session?.activeActionState?.choiceValue || session?.variant || "",
  });
  const unavailable = action?.available === false
    || Boolean(asText(action?.disabledReason || action?.unavailableReason))
    || (action?.disabled === true && action?.available === false);
  return {
    ...clone(action),
    id: asText(action?.id),
    selected,
    available: presentation.available,
    disabled: unavailable || (selected && presentation.disabled),
    disabledReason: presentation.reason || "",
    presentation,
    economyLabel: asText(action?.economy) || "Azione",
  };
}

function normalizeActiveOverview(groups = [], session = {}) {
  return (Array.isArray(groups) ? groups : []).map((group, index) => {
    const context = group?.context && typeof group.context === "object"
      ? clone(group.context)
      : null;
    const targetIds = Array.isArray(group?.targetIds)
      ? group.targetIds.map(asText).filter(Boolean)
      : Array.isArray(group?.context?.targetIds)
        ? group.context.targetIds.map(asText).filter(Boolean)
        : [];
    const persistent = group?.persistent && typeof group.persistent === "object"
      ? clone(group.persistent)
      : null;
    const terminable = group?.terminable === true
      || targetIds.length > 0
      || (context?.concentration === true && !!asText(context?.casterId))
      || ["present", "lifecycle-missing"].includes(asText(persistent?.state));
    return {
      key: asText(group?.key) || `active-${index}`,
      name: asText(group?.name) || "Incantesimo attivo",
      casterName: asText(group?.casterName) || "Non indicato",
      instanceId: asText(group?.instanceId),
      targetNames: (Array.isArray(group?.targetNames) ? group.targetNames : [])
        .map((value) => asText(value))
        .filter(Boolean),
      durationLabel: asText(group?.durationLabel),
      concentrating: group?.concentrating === true,
      prepared: group?.prepared === true,
      actionLabels: (Array.isArray(group?.actionLabels) ? group.actionLabels : [])
        .map((value) => asText(value))
        .filter(Boolean),
      zoneLabel: asText(group?.zoneLabel),
      tokenLabel: asText(group?.tokenLabel),
      context,
      targetIds,
      actions: (Array.isArray(group?.actions) ? group.actions : [])
        .map((action) => normalizeActiveAction(action, group, session))
        .filter((action) => action.id),
      persistent,
      terminable,
    };
  });
}

export function buildUnifiedPanelViewModel({
  contract = null,
  session = {},
  catalogEntries = [],
  catalogState = {},
  selectedCatalogKey = "",
  casterOptions = [],
  targetCandidates = [],
  targetFilters = {},
  concentrationSummary = [],
  activeOverview = [],
} = {}) {
  const workflow = buildSpellPanelViewModel(contract, session);
  const presentation = contract?.presentation || {};
  const executionContract = contract?.execution || {};
  const targeting = presentation.targeting || {};
  const targetingMode = asText(targeting.mode) || "none";
  const inputs = presentation.inputs || {};
  const selectedTargetIds = Array.isArray(session?.targetIds) ? session.targetIds : [];
  const workflowMaxTargets = Number.isInteger(inputs.targets?.maximum)
    ? inputs.targets.maximum
    : Number.isInteger(targeting.limit?.maximum)
      ? targeting.limit.maximum
      : null;
  const activeActions = Array.isArray(presentation.activeActions)
    ? clone(presentation.activeActions)
    : [];
  const normalizedActiveOverview = normalizeActiveOverview(activeOverview, session);
  const selectedActiveOverview = normalizedActiveOverview.find((overview) => (
    asText(overview.instanceId) === asText(session?.activeInstanceId)
  )) || null;
  const selectedActiveAction = selectedActiveOverview?.actions.find((action) => (
    asText(action.id) === asText(session?.activeActionId)
  )) || null;
  const activeActionNeedsPanelTargets = !!selectedActiveAction
    && selectedActiveAction.type === "manual"
    && !selectedActiveAction.resolutionKind
    && selectedActiveAction.subjectMode !== "caster"
    && selectedActiveAction.subjectMode !== "none";
  const activeActionDelegatesResolution = !!selectedActiveAction
    && (
      selectedActiveAction.type === "resolve"
      || ["save-area", "single-attack", "child-zone", "zone-movement"]
        .includes(selectedActiveAction.resolutionKind)
    );
  const maxTargets = activeActionNeedsPanelTargets
    && Number.isInteger(Number(selectedActiveAction.maxTargets))
    && Number(selectedActiveAction.maxTargets) > 0
    ? Number(selectedActiveAction.maxTargets)
    : workflowMaxTargets;
  const outcomeMode = asText(presentation.outcomes?.mode) || "save";
  const outcomeOptions = Array.isArray(presentation.outcomes?.options)
    ? clone(presentation.outcomes.options)
    : [];
  const allCandidates = normalizeTargetCandidates(
    targetCandidates,
    selectedTargetIds,
    session?.outcomes,
    maxTargets,
    workflow.placement.targetLocked,
    outcomeMode,
    session?.attackOutcome,
    outcomeOptions,
  );
  const normalizedTargetFilters = targetFilterModel(allCandidates, targetFilters);
  const filteredCandidates = allCandidates.filter((candidate) => spellTargetMatchesFilters(
    candidate,
    new Set(normalizedTargetFilters.factions),
    normalizedTargetFilters.name,
  ));
  const placement = placementLabels(workflow.placement);
  const phase = presentation.phase || {};
  const variant = presentation.variant || {};
  const composition = presentation.composition || {};
  const compositionSelected = session?.castContext?.[asText(composition.key) || "composition"]
    || (composition.selected && typeof composition.selected === "object"
      ? composition.selected
      : {});
  const compositionCounts = compositionSelected.counts
    && typeof compositionSelected.counts === "object"
    ? compositionSelected.counts
    : compositionSelected;
  const concentration = presentation.concentration || {};
  const manualCapability = presentation.capabilities?.manualSpellEffect || {};
  const triggerRuntime = session?.triggerRuntime || null;
  const initialBoardTokenCast = executionContract.hasTokens === true
    && workflow.placement.mode === "board-token"
    && !workflow.activeAction;
  const initialAutomaticAura = executionContract.hasZones === true
    && workflow.placement.kind === "aura"
    && workflow.placement.policy === "automatic"
    && !workflow.activeAction;

  const targetVisible = activeActionNeedsPanelTargets
    || (
      !initialBoardTokenCast
      && !initialAutomaticAura
      && (
        targetingMode !== "none"
        || inputs.targets?.visible === true
        || inputs.primaryTarget?.visible === true
        || inputs.outcomes?.visible === true
      )
    );
  const primaryVisible = inputs.primaryTarget?.visible === true
    || targeting.primaryTarget?.required === true;
  const selectionMode = asText(targeting.spatialRules?.selectionMode);
  const primarySecondarySelection = selectionMode === "primary-then-secondary";
  const selectionStage = primarySecondarySelection
    ? asText(session?.primaryTargetId) ? "secondary" : "primary"
    : null;
  const effectFields = normalizeEffectFields(presentation, session, workflow.validation);
  const manualControlsVisible = manualCapability.available === true && effectFields.length > 0;
  const automationVisible = Boolean(
    inputs.automation?.visible === true
      || manualControlsVisible,
  );
  const hpPreview = hpPreviewFor(
    presentation,
    session,
    allCandidates,
    outcomeMode,
    contract?.spell?.id,
  );
  const hpPreviewByKey = new Map(
    (hpPreview.targets || []).map((target) => [target.key, target]),
  );
  const candidates = filteredCandidates.map((candidate) => ({
    ...candidate,
    hpPreview: hpPreviewByKey.get(candidate.key) || null,
  }));
  const activeZoneInstances = normalizedActiveOverview.filter((overview) => (
    ["zone", "aura"].includes(asText(overview.persistent?.kind))
      && asText(overview.persistent?.state) !== "orphaned"
      && Array.isArray(overview.persistent?.triggers)
      && overview.persistent.triggers.length > 0
  ));
  const hasRealZone = activeZoneInstances.length > 0;
  const zoneVisible = !!triggerRuntime || hasRealZone;
  const zoneTriggers = triggerRuntime
    ? [{
      label: asText(triggerRuntime.label || triggerRuntime.triggerLabel)
        || "Attivazione della zona",
      detail: triggerRuntime.damage?.dice
        ? `Danno suggerito: ${triggerRuntime.damage.dice}${triggerRuntime.damage.type
          ? ` ${triggerRuntime.damage.type}` : ""}.`
        : "Completa gli esiti dei bersagli.",
    }]
    : activeZoneInstances.flatMap((overview) => (
      overview.persistent.triggers.map((trigger) => ({
        label: asText(trigger.label) || "Attivazione della zona",
        detail: overview.name,
      }))
    ));
  const model = {
    spell: {
      label: workflow.spell?.label || "Seleziona un incantesimo",
      level: workflow.spell?.level ?? null,
      concentration: workflow.spell?.concentration === true,
    },
    workflow,
    catalog: buildCatalogViewModel({
      entries: catalogEntries,
      selectedKey: selectedCatalogKey || session?.spellId || "",
      ...catalogState,
    }),
    execution: {
      lane: asText(executionContract.lane),
      laneLabel: LANES[executionContract.lane] || executionContract.lane,
      lanes: Array.isArray(executionContract.lanes) ? executionContract.lanes : [],
      hasHP: executionContract.hasHP === true,
      hasZones: executionContract.hasZones === true,
      hasTokens: executionContract.hasTokens === true,
      activeResolution: executionContract.activeResolution === true,
      available: workflow.execution?.allowed !== false,
      availabilityMessage: asText(workflow.execution?.message),
    },
    context: {
      subjectMode: {
        value: asText(presentation.subjectMode),
        label: subjectLabel(presentation.subjectMode),
      },
      phase: {
        visible: Array.isArray(phase.options) && phase.options.length > 1,
         label: "Fase",
        selected: asText(phase.selected),
        options: clone(phase.options || []),
      },
      caster: {
        visible: inputs.caster?.visible === true,
        required: inputs.caster?.required === true,
        label: "Caster",
        hint: presentation.caster?.required
          ? "Serve per definire l'origine e la portata dell'incantesimo."
          : "Chi lancia l'incantesimo.",
        value: asText(session?.casterId),
        options: normalizeCasterOptions(casterOptions),
      },
      slot: {
        visible: inputs.slot?.visible === true,
        required: inputs.slot?.required === true,
        label: "Slot",
        hint: presentation.slot?.min
          ? `Dal ${presentation.slot.min}° livello in su.`
          : "Livello dello slot usato.",
        value: session?.slotLevel ?? "",
        options: optionList(presentation.slot?.options, "Seleziona slot"),
      },
      duration: {
        visible: inputs.duration?.visible === true,
        required: inputs.duration?.required === true,
        label: "Durata",
        hint: presentation.duration?.label || "Valore in round.",
        value: session?.durationTurns ?? "",
        min: presentation.duration?.minTurns,
        max: presentation.duration?.maxTurns,
      },
      concentration: {
        visible: concentration.required === true,
        label: "Concentrazione",
        actionLabel: CONCENTRATION_ACTION_LABELS[concentration.action]
          || concentration.action
          || "Sostituisce la concentrazione corrente",
        hint: "La concentrazione termina se l'incantesimo viene interrotto.",
        summary: (Array.isArray(concentrationSummary) ? concentrationSummary : []).map((entry) => ({
          name: asText(entry?.name) || "Concentrazione",
          targetCount: Number.isFinite(Number(entry?.targetCount))
            ? Math.max(0, Math.floor(Number(entry.targetCount)))
            : 0,
        })),
      },
      automation: {
        visible: automationVisible,
        applyVisible: inputs.automation?.visible === true,
        applyAutomatedConditions: session?.applyAutomatedConditions !== false,
        mode: phase.plan?.useCatalogAutomation === false ? "guided" : "automatic",
        modeLabel: phase.plan?.useCatalogAutomation === false
          ? "Inserimento guidato"
          : "Effetti automatici",
        label: phase.plan?.phase === "prepare" ? "Preparazione" : "Effetti dell'incantesimo",
        hint: phase.plan?.useCatalogAutomation === false
          ? "Completa i valori richiesti prima di applicare."
          : "Applica le condizioni previste dall'incantesimo.",
      },
      variant: {
        visible: inputs.variant?.visible === true,
        required: inputs.variant?.required === true,
        label: "Variante",
         hint: "Scegli l'effetto da applicare.",
        value: asText(session?.variant),
        options: optionList(variant.options, "Seleziona variante"),
      },
      composition: {
        visible: inputs.composition?.visible === true,
        required: inputs.composition?.required === true,
        key: asText(composition.key) || "composition",
        label: asText(composition.label) || "Combinazione",
        hint: "Il costo totale non può superare 10 oggetti.",
        maximumCost: Number(composition.maximumCost) || 10,
        placement: asText(composition.placement) || "one-by-one",
        counts: clone(compositionCounts),
        options: Array.isArray(composition.options) ? clone(composition.options) : [],
      },
    },
    targets: {
      visible: activeActionDelegatesResolution ? false : targetVisible,
      mode: activeActionNeedsPanelTargets ? "discrete" : targetingMode,
      modeLabel: activeActionNeedsPanelTargets ? targetModeLabel("discrete") : targetModeLabel(targetingMode),
      subjectMode: activeActionNeedsPanelTargets
        ? asText(selectedActiveAction.subjectMode)
        : asText(targeting.subjectMode),
      candidates,
      filters: normalizedTargetFilters,
      selectedIds: [...selectedTargetIds],
      countLabel: `${selectedTargetIds.length}${maxTargets === null ? "" : `/${maxTargets}`} bersagli`,
       ruleLabel: targeting.filter ? `Filtro: ${targeting.filter}` : "Bersagli compatibili",
      spatialRules: clone(targeting.spatialRules),
      spatialLabel: spatialRuleLabel(targeting.spatialRules),
      selection: primarySecondarySelection
        ? {
          mode: selectionMode,
          stage: selectionStage,
          instruction: selectionStage === "primary"
            ? "Clicca il bersaglio primario sulla mappa."
            : "Seleziona sulla mappa i secondari entro il raggio evidenziato.",
          resetVisible: selectionStage === "secondary",
        }
        : null,
      emptyLabel: (activeActionNeedsPanelTargets ? "discrete" : targetingMode) === "geometric"
        ? "Conferma una posizione per popolare i bersagli geometrici."
        : "Nessun bersaglio disponibile.",
      primary: {
        visible: primaryVisible,
        required: targeting.primaryTarget?.required === true,
        selectionMode,
        label: "Bersaglio primario",
        hint: targeting.primaryTarget?.rangeMeters
          ? `Portata primaria: ${targeting.primaryTarget.rangeMeters} m.`
          : "Seleziona un bersaglio già incluso nella matrice.",
        value: asText(session?.primaryTargetId),
      },
      outcomes: {
        visible: inputs.outcomes?.visible === true,
        required: inputs.outcomes?.required === true,
        label: "Esiti TS / attacco",
        mode: outcomeMode,
        options: outcomeOptions,
      },
      context: targetContextFields(
        presentation,
        session,
        allCandidates.filter((candidate) => candidate.selected),
      ),
    },
    placement: activeActionDelegatesResolution
      ? { ...placement, visible: false }
      : placement,
    active: {
      visible: true,
      selectedActionId: asText(session?.activeActionId || workflow.activeAction?.id),
      selectedInstanceId: asText(session?.activeInstanceId),
      selectedAction: selectedActiveAction,
      primaryAction: selectedActiveAction
        ? {
          id: "resolve-active-action",
          label: selectedActiveAction.type === "resolve"
            ? "Apri risoluzione"
            : selectedActiveAction.buttonLabel || selectedActiveAction.label || "Risolvi azione",
          disabled: selectedActiveAction.disabled
            || selectedActiveAction.presentation?.disabled === true
            || ["loading", "opened"].includes(asText(session?.activeActionState?.state)),
        }
        : null,
      actions: activeActions.map((action) => ({
        ...action,
        economyLabel: action.economy || "Azione",
      })),
      overview: normalizedActiveOverview,
      statusLabel: selectedActiveAction
        ? (asText(session?.activeActionState?.state) === "loading"
          ? "Risoluzione in corso"
          : asText(session?.activeActionState?.state) === "failed"
            ? "Risoluzione non riuscita"
            : "Azione selezionata")
        : workflow.activeAction
          ? "Azione dichiarata"
          : "Azioni disponibili",
    },
    zone: {
      visible: zoneVisible,
      triggers: zoneTriggers,
      statusLabel: triggerRuntime
        ? ["pending", "loading"].includes(asText(triggerRuntime.state))
          ? "Attivazione pendente"
          : "Attivazione da risolvere"
        : "Zona attiva",
      runtime: {
        visible: !!triggerRuntime,
        pending: ["pending", "loading"].includes(asText(triggerRuntime?.state)),
        actionLabel: "Risolvi trigger pendente",
        message: asText(triggerRuntime?.message),
      },
    },
    manual: {
      visible: !activeActionDelegatesResolution && manualControlsVisible,
      sourceLabel: "Inserimento guidato",
      description: "Inserisci i valori richiesti dall'effetto.",
      fields: effectFields,
    },
    effects: {
      visible: !activeActionDelegatesResolution
        && manualCapability.available !== true
        && effectFields.length > 0,
      label: "Valori effetto",
      description: "Inserisci il valore da applicare ai bersagli.",
      fields: effectFields,
      preview: hpPreview,
    },
    feedbackLabels: FEEDBACK_LABELS,
    reviewLabels: {
      valid: "Configurazione pronta",
      invalid: workflow.validation.firstInvalidField
        ? spellPanelValidationMessage(workflow.validation.firstInvalidField)
        : "Configurazione incompleta",
    },
  };
  return model;
}

function renderHero(documentRef, model) {
  return createNode(documentRef, "header", {
    className: "unified-panel-hero",
    children: [
      createNode(documentRef, "div", {
        className: "unified-panel-hero__copy",
        children: [
          createNode(documentRef, "span", {
            className: "unified-panel-hero__eyebrow",
            text: "Workflow normalizzato",
          }),
          createNode(documentRef, "h2", {
            id: "spell-unified-current-heading",
            text: model.spell.label,
          }),
        ],
      }),
      createNode(documentRef, "div", {
        className: "unified-panel-hero__badges",
        children: [
          createNode(documentRef, "span", {
            className: "unified-hero-badge",
            text: model.spell.level === null ? "Effetto" : `Livello ${model.spell.level}`,
          }),
          createNode(documentRef, "span", {
            className: "unified-hero-badge",
            text: model.execution.laneLabel || "Catalogo pronto",
          }),
        ],
      }),
    ],
  });
}

export function renderSpellUnifiedPanel(documentRef, root, model, callbacks = {}) {
  const previousScrollTop = Number(root.scrollTop) || 0;
  const previousScrollLeft = Number(root.scrollLeft) || 0;
  const previousTargetList = root.querySelector?.(".unified-target-list");
  const previousTargetListScrollTop = Number(previousTargetList?.scrollTop) || 0;
  clearNode(root);
  const setup = createNode(documentRef, "div", { className: "unified-cast-setup" });
  setup.append(...[
    renderSpellCatalogCombobox(documentRef, model.catalog, callbacks),
    renderWorkflowContextBar(documentRef, model, callbacks),
    renderPhaseSelector(documentRef, model, callbacks),
    renderAutomationAndVariantPanel(documentRef, model, callbacks),
    renderCompositionPanel(documentRef, model, callbacks),
    renderManualSpellEffectPanel(documentRef, model, callbacks),
    renderPlacementStage(documentRef, model, callbacks),
  ].filter(Boolean));
  const components = [
    setup,
    renderTargetMatrix(documentRef, model, callbacks),
    renderActiveSpellSection(documentRef, model, callbacks),
    renderZoneTriggerBanner(documentRef, model, callbacks),
    renderFeedbackBanner(documentRef, model),
    renderReviewFooter(documentRef, model, callbacks),
  ];
  root.append(...components.filter(Boolean));
  root.dataset.firstInvalidField = model.workflow.validation.firstInvalidField || "";
  root.scrollTop = previousScrollTop;
  root.scrollLeft = previousScrollLeft;
  const nextTargetList = root.querySelector?.(".unified-target-list");
  if (nextTargetList) nextTargetList.scrollTop = previousTargetListScrollTop;
  return root;
}
