import {
  buildSpellPanelViewModel,
  spellPanelValidationMessage,
} from "./spellUnifiedPanelCore.js";
import { isTeleportSpell } from "./spellTeleportCore.js";
import { animatedObjectsMaximumCost } from "./animatedObjectsCore.js";
import { spellCastTemporaryHpHint, spellCastTemporaryHpRollRange, spellCastTemporaryHpRule, spellUndeadTemporaryHpAmount } from "./spellTemporaryHpRules.js";
import { ID } from "./constants.js";
import { buildSharedHpPreview } from "./sharedHpViewCore.js";
import { PRISMATIC_SPRAY_SPELL_ID, prismaticSprayDamageRays } from "./prismaticSprayRules.js";
import { damageReactionAppliesTo, spellDamageWithReactions } from "./damageReactionCore.js";
import {
  spellActionDamageTypes,
  spellDamageAfterDefense,
  spellDamageBeforeDefense,
  spellDamageDefenseApplied,
  spellDamageDefenseRows,
  spellDamageDefenseText,
  spellDamageDefenseTitle,
  spellDamagePartsAfterDefense,
  spellPanelDamageTypes,
} from "./spellDamageDefenseCore.js";
import { evasionFactor, RESISTANCE_VULNERABILITY } from "./damageDefensesCore.js";
import { spellTargetMatchesFilters } from "./spellsPanelTargetPicker.js";
import {
  spellTargetContextConditionMatches,
  spellTargetContextFieldRequired,
} from "./spellSaveTargetingCore.js";
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
  renderTeleportStep,
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
import {
  spellSaveDamageFactor,
  spellCantripDamageHint,
  spellCastDamageParts,
  spellCastDamagePartsHint,
  spellCastHealingFormula,
  spellCastHpPoolFormula,
  spellCastPrimaryHit,
  spellCastPrimaryHitAmount,
  spellCastPrimaryHitDice,
  spellCastPrimaryHitTypes,
  spellSaveDamageFormula,
} from "./spellCastResolutionRules.js";
import {
  applyTargetingLimitState,
  resolveTargetingCapacity,
} from "./spellTargetingCapacityCore.js";
import {
  MAGIC_MISSILE_DART_DICE,
  MAGIC_MISSILE_SPELL_ID,
  magicMissileDartAllocation,
  magicMissileTargetDamage,
  magicMissileTargetText,
} from "./magicMissileCore.js";

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
  "spell-lifecycle": "Incantesimo",
  "area-transaction": "Area",
  "active-resolution": "Azione attiva",
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

function placementLabels(placement, contract = null) {
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
  const isTeleport = isTeleportSpell(contract?.spell?.id || placement?.spellId);
  const teleportRange = placement?.rules?.[0]?.range?.value;
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
      : isTeleport
        ? `Seleziona il punto di arrivo sulla mappa entro ${teleportRange || "la portata"} metri.`
      : "Disegna l'area sulla mappa e confermala per acquisire i bersagli.",
    rules: clone(placement?.rules || []),
    rulesLabel: ruleNames.join(" / "),
    note: (placement?.rules || []).map((rule) => asText(rule?.note)).find(Boolean) || "",
    choice: asText(placement?.choice),
    choices: clone(placement?.choices || []),
    choiceRequired: placement?.choiceRequired === true,
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
    // With the targets edited by hand (Modifica bersagli) the area can be drawn again.
    visibleAction: policy !== "automatic"
      && (!placement?.confirmed || placement?.targetsEdited === true)
      && !pendingStates.has(state),
    actionLabel: placement?.confirmed && placement?.targetsEdited === true
      ? "Riposiziona area"
      : ["error", "failed"].includes(state)
      ? (isTeleport ? "Riprova destinazione" : "Riprova area")
      : policy === "optional"
        ? "Aggiungi area"
        // Animate Objects: its objects, placed one at a time, before the batch starts too.
        : isBatch || contract?.presentation?.composition?.required
          ? "Posiziona oggetti"
        : isTeleport
          ? "Posiziona destinazione"
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
  allowedCandidateIds = null,
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
    const outsideSubset = allowedCandidateIds instanceof Set && !allowedCandidateIds.has(key);
    const isSelected = selected.has(key) && !outsideSubset;
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
      tempHp: Math.max(0, Math.floor(Number(candidate?.tempHp) || 0)),
      sharedHpSourceId: asText(candidate?.sharedHpSourceId),
      ...(candidate?.magicMissileGuard ? { magicMissileGuard: clone(candidate.magicMissileGuard) } : {}),
      ...(candidate?.damageDefenses ? { damageDefenses: clone(candidate.damageDefenses) } : {}),
      ...(candidate?.evasion === true ? { evasion: true } : {}),
      turbineSize: asText(candidate?.turbineSize) || null,
      layer: asText(candidate?.layer) || null,
      isCreature: candidate?.isCreature === true || asText(candidate?.layer) === "CHARACTER",
      eligible: candidate?.eligible !== false && !outsideSubset,
      selected: isSelected,
      disabled: outsideSubset || targetLocked || (!isSelected
        && Number.isInteger(maximum)
        && maximum >= 0
        && selectedCount >= maximum),
      outcome: isSelected ? outcome : null,
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

function metersText(value) {
  return String(value).replace(".", ",");
}

// The rule of the spell, with the range of its text: both for Hold Person, which also measures its targets from each other.
// It also keeps saying when the GM has ignored the range for a target: the message that says so does not last.
function targetingSpatialLabel(targeting = {}, session = null) {
  const range = targeting.casterRange?.maxMeters;
  const selected = new Set(Array.isArray(session?.targetIds) ? session.targetIds : []);
  const excepted = (Array.isArray(session?.rangeOverrideIds) ? session.rangeOverrideIds : [])
    .filter((id) => selected.has(id)).length;
  return [
    range ? `Bersagli entro ${metersText(range)} m` : "",
    spatialRuleLabel(targeting.spatialRules),
    excepted ? `Gittata ignorata per ${excepted === 1 ? "1 bersaglio" : `${excepted} bersagli`}` : "",
  ].filter(Boolean).join(" · ");
}

function spatialRuleLabel(spatial = null) {
  if (!spatial || typeof spatial !== "object") return "";
  if (asText(spatial.label)) return asText(spatial.label);
  const mode = asText(spatial.mode);
  const primary = spatial.primaryRangeMeters ?? spatial.range?.value;
  const secondary = spatial.secondaryRangeMeters;
  if (mode === "primary-and-secondary-range") {
    return [
      primary ? `Primario entro ${primary} m` : "",
      secondary ? `Secondari entro ${secondary} m` : "",
    ].filter(Boolean).join(" · ");
  }
  const maximum = primary ?? spatial.maxMeters;
  if (mode === "caster-range") return maximum ? `Bersagli entro ${metersText(maximum)} m` : "";
  if (mode === "pairwise-distance") {
    return maximum ? `Distanza massima tra bersagli: ${metersText(maximum)} m` : "Distanze tra bersagli";
  }
  if (mode === "action-range") return primary ? `Portata: ${primary} m` : "";
  if (mode === "teleport") {
    const passenger = asText(spatial.passengerAdjacency) === "grid-adjacent"
      ? "Passeggero adiacente al caster"
      : secondary
        ? `Passeggero entro ${secondary} m`
        : "";
    return primary
      ? `Destinazione entro ${primary} m${passenger ? ` · ${passenger}` : ""}`
      : "Destinazione entro la portata dell'incantesimo";
  }
  return "";
}

function hpPreviewFor(
  presentation,
  session,
  candidates,
  outcomeMode = "save",
  spellId = "",
  damageInputVisible = true,
) {
  const inputs = presentation?.inputs || {};
  const isHealing = inputs.healing?.visible === true;
  // Magic Missile: no damage input, the damage of each dart is written on its target.
  const magicMissileCast = !isHealing && spellId === MAGIC_MISSILE_SPELL_ID
    && inputs.targetContext?.visible === true;
  const isDamage = (inputs.damage?.visible === true && damageInputVisible) || magicMissileCast;
  if (!isHealing && !isDamage) return { visible: false, targets: [] };

  const mode = isHealing ? QUICK_HP_MODES.HEAL : QUICK_HP_MODES.DAMAGE;
  // Two types in one damage: one box for each part, each with its own defense, as the commit counts them (hpEntries).
  const damageParts = !isHealing && isDamage && inputs.secondDamage?.visible === true
    ? spellCastDamageParts(spellId, { slotLevel: session?.slotLevel, choiceValue: session?.variant })
      .map((part) => ({ type: part.type, amount: numberOrNull(session?.hpValues?.[part.field]) }))
    : [];
  const partsWritten = damageParts.length > 1 && damageParts.every((part) => part.amount !== null && part.amount >= 0);
  const value = damageParts.length > 1
    ? partsWritten ? damageParts.reduce((sum, part) => sum + part.amount, 0) : null
    : numberOrNull(session?.hpValues?.[isHealing ? "healing" : "damage"]);
  const preview = {
    visible: true,
    mode,
    amount: value,
    valid: magicMissileCast || (value !== null && value >= 0),
    label: isHealing ? "Anteprima cura" : "Anteprima danno",
    targets: [],
  };
  if (!preview.valid) return preview;
  const magicMissile = magicMissileCast
    ? magicMissileDartAllocation({
      targetIds: session?.targetIds || [],
      targetContexts: session?.targetContext || {},
      slotLevel: session?.slotLevel,
    })
    : null;
  // Evasion: a Dexterity save that halves the damage takes nothing on a success and half on a failure, for a creature that
  // has it (candidate.evasion), as the commit counts it (spellAreaResolutionExecutor.js).
  const evasionSave = !isHealing && String(presentation?.outcomes?.save?.ability || "").trim().toLowerCase() === "dex"
    && (spellSaveDamageFactor(spellId, "passed") || QUICK_HP_FACTORS.HALF) === QUICK_HP_FACTORS.HALF;

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
      if (magicMissile) {
        // The sum of its darts, each one after the force defense and Shield (the same as the commit).
        const darts = magicMissileTargetDamage({
          rolls: magicMissile.damagesByTarget[candidate.key] || [],
          guard: candidate.magicMissileGuard,
        });
        const change = calculateQuickHPChange({ mode, value: darts.damage, factor: QUICK_HP_FACTORS.FULL, hp: beforeHP, hpMax,
          tempHp: candidate.tempHp });
        return {
          ...base,
          factor: QUICK_HP_FACTORS.FULL,
          factorLabel: magicMissileTargetText(darts),
          afterHP: change.afterHP,
          delta: change.delta,
          change,
        };
      }
      const outcome = asText(candidate.outcome?.value).toLocaleLowerCase("it");
      if (!isHealing && !outcome) {
        return { ...base, pendingOutcome: true };
      }
      // CAP-TEMP, lotto T3e: Negative Energy Flood on an undead, as the commit does it (spellAreaResolutionExecutor.js).
      const undeadTempHp = isHealing ? null : spellUndeadTemporaryHpAmount(spellId, outcome, value);
      if (undeadTempHp !== null) {
        const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: undeadTempHp, hp: beforeHP, hpMax,
          tempHp: candidate.tempHp });
        return { ...base, factor: QUICK_HP_FACTORS.FULL, factorLabel: `metà come PF temporanei (${change.tempHp} → ${change.afterTempHp})`,
          afterHP: change.afterHP, delta: change.delta, change };
      }
      const immune = !isHealing && outcome === "immune";
      const attackMiss = !isHealing && outcomeMode === "attack" && outcome === "miss";
      const outcomeFactor = isHealing
        ? QUICK_HP_FACTORS.FULL
        : attackMiss
          ? "zero"
        : immune
          ? QUICK_HP_FACTORS.FULL
          : outcome === "passed"
            ? spellSaveDamageFactor(spellId, outcome) || QUICK_HP_FACTORS.HALF
            : QUICK_HP_FACTORS.FULL;
      const evasion = evasionSave && candidate.evasion === true && (outcome === "passed" || outcome === "failed");
      const factor = evasion ? evasionFactor(outcomeFactor) : outcomeFactor;
      const noDamage = !isHealing && factor === "zero";
      // Two types in one damage: each part after the save and its own defense, then the sum (spellDamagePartsAfterDefense).
      const parts = partsWritten && !immune && !attackMiss && !noDamage
        ? spellDamagePartsAfterDefense({
          parts: damageParts,
          factor,
          defenses: candidate.damageDefenses,
          ignoredTypes: session?.ignoredDefenses?.[candidate.key],
        })
        : null;
      // The creature's defense, as the commit reads it (hpEntries in spellAreaResolutionExecutor.js).
      const defense = parts || isHealing || immune || attackMiss || noDamage
        ? null
        : spellDamageDefenseApplied(spellDamageDefenseRows({
          types: spellPanelDamageTypes(spellId, session?.triggerRuntime),
          defenses: candidate.damageDefenses,
          ignoredTypes: session?.ignoredDefenses?.[candidate.key],
        }));
      // Avvisi di reazione, lot R3b-5: this creature's reactions to the damage, as the commit counts them (hpEntries).
      const reactionTypes = spellPanelDamageTypes(spellId, session?.triggerRuntime);
      const reacted = isHealing || immune || attackMiss || noDamage ? null : spellDamageWithReactions({
        parts: partsWritten ? damageParts : [{ type: reactionTypes[0], amount: value }],
        factor,
        defenseFor: (type) => (!partsWritten && reactionTypes.length > 1 ? null : spellDamageDefenseApplied(spellDamageDefenseRows({
          types: [type], defenses: candidate.damageDefenses, ignoredTypes: session?.ignoredDefenses?.[candidate.key] }))),
        reactions: (Array.isArray(session?.damageReactions) ? session.damageReactions : []).filter((row) => damageReactionAppliesTo(row, candidate.key)),
      });
      let change = calculateQuickHPChange({
        mode,
        value: immune || attackMiss || noDamage ? 0 : reacted ? reacted.value : parts ? parts.after : defense ? spellDamageAfterDefense(value, factor, defense) : value,
        factor: attackMiss || defense || parts || reacted ? QUICK_HP_FACTORS.FULL : factor,
        hp: beforeHP,
        hpMax,
        tempHp: candidate.tempHp,
      });
      const defenseCount = isHealing || immune || attackMiss || noDamage
        ? null
        : parts
          ? { before: parts.before, after: change.requested, rows: parts.rows }
          : { before: spellDamageBeforeDefense(value, factor), after: change.requested };
      // Ice Knife's target: the shard's hit before the burst, after its outcome and its defense, as the commit does it.
      const primaryHit = isDamage && inputs.primaryDamage?.visible ? spellCastPrimaryHit(spellId) : null;
      const primaryValue = primaryHit && asText(session?.primaryTargetId) === candidate.key
        ? spellCastPrimaryHitAmount({
          primaryHit,
          outcome: session?.attackOutcome,
          roll: session?.hpValues?.primaryDamage,
          defense: spellDamageDefenseApplied(primaryHitDefenseRows(candidate, session, primaryHit)),
        })
        : 0;
      if (primaryValue > 0) {
        const primary = calculateQuickHPChange({ mode, value: primaryValue,
          factor: QUICK_HP_FACTORS.FULL, hp: beforeHP, hpMax, tempHp: candidate.tempHp });
        const area = calculateQuickHPChange({ mode, value: change.requested,
          factor: QUICK_HP_FACTORS.FULL, hp: primary.afterHP, hpMax, tempHp: primary.afterTempHp });
        const delta = area.afterHP + area.afterTempHp - primary.hp - primary.tempHp;
        change = { ...area, factor: change.factor, hp: primary.hp, tempHp: primary.tempHp,
          requested: primary.requested + area.requested, delta, changed: delta !== 0,
          primaryRequested: primary.requested, areaRequested: area.requested };
      }
      return {
        ...base,
        factor: immune ? "immune" : factor,
        ...(evasion ? { evasion: true } : {}),
        factorLabel: isHealing
          ? "Cura"
          : attackMiss
            ? "Mancato"
          : immune
            ? "Immune"
            : evasion
              ? noDamage ? "Elusione: nessun danno" : "Elusione: metà"
            : noDamage
              ? "No danno"
            : factor === QUICK_HP_FACTORS.HALF
              ? "Metà"
              : "Pieno",
        afterHP: change.afterHP,
        delta: change.delta,
        change,
        ...(defenseCount ? { defenseCount } : {}),
      };
    });
  return preview;
}

// The defense of Ice Knife's target against the shard's hit, with what the GM ignored in this cast.
function primaryHitDefenseRows(candidate, session, primaryHit) {
  return spellDamageDefenseRows({
    types: spellCastPrimaryHitTypes(primaryHit),
    defenses: candidate.damageDefenses,
    ignoredTypes: session?.ignoredDefenses?.[candidate.key],
  });
}

// Its chips on the target's row, beside the burst's: what the defense does to the hit, unless the attack missed.
function primaryHitDefenseChips(candidate, session, spellId) {
  const primaryHit = spellCastPrimaryHit(spellId);
  const outcome = asText(session?.attackOutcome);
  if (!primaryHit || asText(session?.primaryTargetId) !== candidate.key || outcome === "miss") return [];
  const written = asText(session?.hpValues?.primaryDamage);
  const roll = written !== "" && Number.isFinite(Number(written)) ? Math.max(0, Number(written)) : null;
  return primaryHitDefenseRows(candidate, session, primaryHit).map((row) => {
    const numbers = roll === null
      ? { before: 0, after: 0 }
      : {
        before: Math.floor(roll),
        after: spellCastPrimaryHitAmount({ primaryHit, outcome: outcome || "hit", roll, defense: row.ignored ? null : row.defense }),
      };
    return {
      ...row,
      text: spellDamageDefenseText(row, numbers),
      title: spellDamageDefenseTitle(row, { name: candidate.label, ...numbers }),
    };
  });
}

// Prismatic Spray writes its damage ray by ray: a chip for each ray the creature resists, as soon as the ray is chosen.
function prismaticSprayDefenseChips(candidate, session) {
  const outcome = asText(candidate.outcome?.value).toLocaleLowerCase("it");
  if (outcome === "immune") return [];
  const factor = outcome === "passed" ? QUICK_HP_FACTORS.HALF : QUICK_HP_FACTORS.FULL;
  return prismaticSprayDamageRays(session?.targetContext?.[candidate.key]).flatMap((ray) => spellDamageDefenseRows({
    types: spellActionDamageTypes({ damage: { type: ray.type } }),
    defenses: candidate.damageDefenses,
    ignoredTypes: session?.ignoredDefenses?.[candidate.key],
  }).map((row) => {
    const numbers = ray.roll === null
      ? { before: 0, after: 0 }
      : { before: spellDamageBeforeDefense(ray.roll, factor), after: spellDamageAfterDefense(ray.roll, factor, row.ignored ? null : row.defense) };
    return {
      ...row,
      text: spellDamageDefenseText(row, numbers),
      title: spellDamageDefenseTitle(row, { name: candidate.label, ...numbers }),
    };
  }));
}

// The chips under a selected target: each defense against this damage, what it did to the number, and in the tooltip whose it
// is. They are there as soon as the target is selected: who writes the damage already halved must see them before writing.
function candidateDefenseChips({ candidate, presentation, session, spellId, damageInputVisible, count }) {
  if (!candidate?.selected) return [];
  if (spellId === PRISMATIC_SPRAY_SPELL_ID) return prismaticSprayDefenseChips(candidate, session);
  if (presentation?.inputs?.damage?.visible !== true || !damageInputVisible) return [];
  // Two types in one damage: a chip for each part a defense meets, with what it did to that part.
  if (presentation?.inputs?.secondDamage?.visible === true) {
    const parts = spellCastDamageParts(spellId, { slotLevel: session?.slotLevel, choiceValue: session?.variant });
    const counted = new Map((Array.isArray(count?.rows) ? count.rows : []).map((row) => [row.type, row]));
    return parts
      .map((part) => {
        const [row] = spellDamageDefenseRows({
          types: [part.type],
          defenses: candidate.damageDefenses,
          ignoredTypes: session?.ignoredDefenses?.[candidate.key],
        });
        return row || null;
      })
      .filter(Boolean)
      .map((row) => {
        const numbers = { before: counted.get(row.type)?.before || 0, after: counted.get(row.type)?.after || 0 };
        return {
          ...row,
          text: spellDamageDefenseText(row, numbers),
          title: spellDamageDefenseTitle(row, { name: candidate.label, ...numbers }),
        };
      });
  }
  const areaChips = spellDamageDefenseRows({
    types: spellPanelDamageTypes(spellId, session?.triggerRuntime),
    defenses: candidate.damageDefenses,
    ignoredTypes: session?.ignoredDefenses?.[candidate.key],
  }).map((row) => {
    const numbers = { before: count?.before || 0, after: count?.after || 0 };
    return {
      ...row,
      text: spellDamageDefenseText(row, numbers),
      title: spellDamageDefenseTitle(row, { name: candidate.label, ...numbers }),
    };
  });
  const hitChips = primaryHitDefenseChips(candidate, session, spellId)
    .filter((chip) => !areaChips.some((areaChip) => areaChip.type === chip.type));
  return [...areaChips, ...hitChips];
}

// Magic Missile's darts (magicMissileCore.js): a column per target, a box per dart with its roll, the darts to add
// or take away, and the HP each target is left with (its force defense and Shield, as the commit).
function magicMissileDartsView(allocation, selectedTargets = []) {
  const full = allocation.assigned >= allocation.total;
  return {
    total: allocation.total,
    assigned: allocation.assigned,
    missing: allocation.missing,
    dice: MAGIC_MISSILE_DART_DICE,
    countLabel: `${allocation.assigned}/${allocation.total} dardi`,
    // Red only for too many darts or an unreadable box: missing darts are the normal state while typing.
    invalid: allocation.error === "over" || allocation.error === "invalid",
    status: allocation.error === "over"
      ? "Troppi dardi: togline qualcuno."
      : allocation.error === "under"
        ? `${allocation.total - allocation.assigned} da assegnare.`
        : allocation.missing
          ? `${allocation.missing} ${allocation.missing === 1 ? "danno" : "danni"} da inserire.`
          : "Pronto.",
    targets: (Array.isArray(selectedTargets) ? selectedTargets : []).map((target) => {
      const key = asText(target?.key);
      const values = clone(allocation.damagesByTarget[key] || []);
      const darts = magicMissileTargetDamage({ rolls: values, guard: target?.magicMissileGuard });
      const hp = numberOrNull(target?.hp);
      const hpMax = numberOrNull(target?.hpMax);
      const change = hp === null || hpMax === null ? null : calculateQuickHPChange({
        mode: QUICK_HP_MODES.DAMAGE, value: darts.damage, factor: QUICK_HP_FACTORS.FULL, hp, hpMax,
        tempHp: target?.tempHp,
      });
      return {
        key,
        label: asText(target?.label) || key,
        count: values.length,
        values,
        auto: (allocation.autoIds || []).includes(key),
        canAdd: !full,
        canRemove: values.length > 0,
        total: darts.damage,
        note: darts.shielded ? "Scudo: nessun danno"
          : darts.defense === "resistance" ? "Resistenza: metà per dardo"
            : darts.defense === "immunity" ? "Immune" : darts.defense === "vulnerability" ? "Vulnerabile: doppio"
              : darts.defense === RESISTANCE_VULNERABILITY ? "Resistenza e vulnerabilità: metà, poi doppio, per dardo" : "",
        hpLabel: change ? `${hp} → ${change.afterHP} PF` : "",
      };
    }),
  };
}

function targetContextFields(presentation, session, selectedTargets = [], spellId = "") {
  const workflow = presentation?.targeting?.workflow;
  const fields = Array.isArray(workflow?.context?.fields)
    ? workflow.context.fields
    : Array.isArray(presentation?.targeting?.context?.fields)
      ? presentation.targeting.context.fields
      : [];
  const visibleFields = fields.filter((field) => (
    field?.automatic !== true && !field?.dependentOutcome
  ));
  const dependentOutcomeFields = fields.filter((field) => field?.dependentOutcome);
  // Magic Missile: the darts still to assign.
  const darts = spellId === MAGIC_MISSILE_SPELL_ID
    ? magicMissileDartAllocation({
      targetIds: (Array.isArray(selectedTargets) ? selectedTargets : []).map((target) => asText(target?.key)),
      targetContexts: session?.targetContext || {},
      slotLevel: session?.slotLevel,
    })
    : null;
  return {
    visible: presentation?.inputs?.targetContext?.visible === true && visibleFields.length > 0,
    label: darts ? "Dardi" : "Contesto bersaglio",
    ...(darts ? { magicMissile: magicMissileDartsView(darts, selectedTargets) } : {}),
    fields: clone(visibleFields),
    values: clone(session?.targetContext || {}),
    targets: (Array.isArray(selectedTargets) ? selectedTargets : []).map((target) => {
      const automaticValues = Object.fromEntries(
        fields
          .filter((field) => field?.automatic === true && field?.candidateValue)
          .map((field) => [field.id, target?.[field.candidateValue]])
          .filter(([, value]) => value !== undefined && value !== null && value !== ""),
      );
      const values = {
        ...automaticValues,
        ...clone(session?.targetContext?.[target?.key] || {}),
      };
      const dependentOutcomes = dependentOutcomeFields
        .filter((field) => spellTargetContextFieldRequired(
          field,
          values,
          target?.outcome?.value,
        ))
        .map((field) => ({
          id: field.id,
          label: field.label || field.id,
          options: clone(field.options || []),
          value: values[field.id] ?? "",
        }));
      return {
        key: asText(target?.key),
        label: asText(target?.label) || asText(target?.key),
        values,
        dependentOutcomes,
        fields: clone(visibleFields.filter((field) => (
          !field?.requiredWhen
            || spellTargetContextConditionMatches(values, field.requiredWhen)
        ))),
      };
    }).filter((target) => target.key),
  };
}

function normalizeEffectFields(
  presentation,
  session,
  validation,
  spellId = "",
  damageInputVisible = true,
) {
  const inputs = presentation?.inputs || {};
  const hpValues = session?.hpValues || {};
  const mechanics = presentation?.phase?.plan?.resolution?.mechanics || {};
  const areaDamage = mechanics.areaDamage && typeof mechanics.areaDamage === "object"
    ? mechanics.areaDamage
    : null;
  const damageFormula = areaDamage?.dice
    ? `Danno area · ${areaDamage.dice}${areaDamage.type ? ` ${areaDamage.type}` : ""}`
    : "Danno";
  const fields = [];
  if (inputs.damage?.visible && damageInputVisible) {
    const selectedOutcomes = Array.from(new Set(
      Object.values(session?.outcomes || {})
        .map((value) => asText(value).toLocaleLowerCase("it"))
        .filter(Boolean),
    ));
    const selectedOutcome = selectedOutcomes.length === 1 ? selectedOutcomes[0] : "";
    const selectedFormula = spellSaveDamageFormula(
      spellId,
      selectedOutcome,
      session?.slotLevel,
      session?.variant,
    );
    const passedFormula = spellSaveDamageFormula(spellId, "passed", session?.slotLevel, session?.variant);
    const failedFormula = spellSaveDamageFormula(spellId, "failed", session?.slotLevel, session?.variant);
    // Mixed outcomes roll the same dice when the save only halves or spares them.
    const shownFormula = selectedFormula || (!passedFormula || passedFormula === failedFormula ? failedFormula : "");
    // Two types in one damage: a box for each part, named by its type, with its dice ("Fuoco · 4d6", "Radiosi · 4d6").
    const damageParts = inputs.secondDamage?.visible
      ? spellCastDamageParts(spellId, { slotLevel: session?.slotLevel, choiceValue: session?.variant })
      : [];
    const partsHint = damageParts.length > 1 ? spellCastDamagePartsHint(spellId, session?.slotLevel) : "";
    for (const [index, part] of (damageParts.length > 1 ? damageParts : []).entries()) {
      fields.push({
        id: part.field,
        type: "number",
        label: `${part.label.charAt(0).toLocaleUpperCase("it")}${part.label.slice(1)} · ${part.dice}`,
        hint: index === damageParts.length - 1 ? partsHint : "",
        min: 0,
        value: hpValues[part.field] ?? "",
        invalid: validation.firstInvalidField === part.field,
      });
    }
    if (damageParts.length < 2) fields.push({
      id: "damage",
      type: "number",
      label: shownFormula ? `Danno · ${shownFormula}` : damageFormula,
      hint: shownFormula
        ? spellCantripDamageHint(spellId)
        : areaDamage
          ? "Tiro unico dell'esplosione; il fattore dipende dall'esito del TS."
          : passedFormula && failedFormula
          ? `TS superato: ${passedFormula}. TS fallito: ${failedFormula}.`
          : "",
      min: 0,
      value: hpValues.damage ?? "",
      invalid: validation.firstInvalidField === "damage",
    });
    // A cast's own hit on its primary target (Ice Knife's shard): its field once the attack hits, with the doubled dice of
    // a critical as the console says them. A miss deals nothing and asks nothing.
    const primaryHit = spellCastPrimaryHit(spellId);
    const hitOutcome = asText(session?.attackOutcome);
    const hitShown = inputs.primaryDamage?.onHitOnly !== true || ["hit", "critical"].includes(hitOutcome);
    if (inputs.primaryDamage?.visible && primaryHit && hitShown) {
      const { dice, critical } = spellCastPrimaryHitDice(primaryHit);
      const type = asText(primaryHit.damage?.type);
      fields.push({
        id: "primaryDamage",
        type: "number",
        label: `Colpo · ${dice}${type ? ` ${type}` : ""}${hitOutcome === "critical" ? ` · critico ${critical}` : ""}`,
        hint: hitOutcome === "critical" ? "Con un critico scrivi i dadi raddoppiati." : "",
        min: 0,
        value: hpValues.primaryDamage ?? "",
        invalid: validation.firstInvalidField === "primaryDamage",
      });
    }
  }
  if (inputs.healing?.visible) {
    fields.push({
      id: "healing",
      type: "number",
      label: asText(inputs.healing.dice) || spellCastHealingFormula(spellId, session?.slotLevel)
        ? `Cura · ${asText(inputs.healing.dice) || spellCastHealingFormula(spellId, session?.slotLevel)}`
        : "Cura",
      hint: "",
      min: 0,
      value: hpValues.healing ?? "",
      invalid: validation.firstInvalidField === "healing",
    });
  }
  // CAP-TEMP, lotto T3b: the die of the temporary hit points (False Life's 1d4); the plugin adds the rest.
  if (inputs.temporaryHp?.visible) {
    const die = asText(inputs.temporaryHp.die);
    fields.push({
      id: "temporaryHp",
      type: "number",
      label: `PF temporanei · tiro del ${die}`,
      hint: spellCastTemporaryHpHint(spellCastTemporaryHpRule(spellId, session?.variant), session?.slotLevel),
      min: spellCastTemporaryHpRollRange(die)?.min ?? 1,
      max: spellCastTemporaryHpRollRange(die)?.max,
      value: hpValues.temporaryHp ?? "",
      invalid: validation.firstInvalidField === "temporaryHp",
    });
  }
  return fields;
}

// An action's cost in the panel's words. A GM command costs the caster nothing (Mirror Image's duplicate, Lightning Arrow
// resolved with its attack), and an action that declares no cost says none: Risolvi of a smite is part of the attack.
const ACTION_ECONOMY_LABELS = Object.freeze({ action: "Azione", "bonus-action": "Azione bonus", reaction: "Reazione" });

export function actionEconomyLabel(economy) {
  const value = asText(economy);
  if (!value || value === "gm" || value.toLocaleLowerCase("it") === "comando gm") return "";
  return ACTION_ECONOMY_LABELS[value] || value;
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
    economyLabel: actionEconomyLabel(action?.economy),
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
      summaryParts: (Array.isArray(group?.summaryParts)
        ? group.summaryParts
        : Array.isArray(context?.summaryParts) ? context.summaryParts : [])
        .map((part) => ({ id: asText(part?.id), label: asText(part?.label) }))
        .filter((part) => part.id && part.label),
      semanticDetail: asText(group?.semanticDetail) || asText(context?.semanticDetail),
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
  castSaveDC = null,
  targetCandidates = [],
  teleportPassengerCandidateIds = [],
  targetFilters = {},
  concentrationSummary = [],
  activeOverview = [],
  assumedSaveOutcome = "",
} = {}) {
  const workflow = buildSpellPanelViewModel(contract, session);
  const presentation = contract?.presentation || {};
  const executionContract = contract?.execution || {};
  const targeting = presentation.targeting || {};
  const teleport = presentation.teleport || null;
  const targetingMode = asText(targeting.mode) || "none";
  const inputs = presentation.inputs || {};
  const selectedTargetIds = Array.isArray(session?.targetIds) ? session.targetIds : [];
  const ignoreTargetLimit = session?.ignoreTargetLimit === true;
  const workflowCapacity = applyTargetingLimitState(
    targeting.limit || { maximum: inputs.targets?.maximum },
    { ignoreTargetLimit, targetIds: selectedTargetIds },
  );
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
      || ["save-area", "single-attack", "single-save", "single-heal", "child-zone", "zone-movement", "telekinesis-contest"]
        .includes(selectedActiveAction.resolutionKind)
    );
  const activeActionHasExplicitCapacity = activeActionNeedsPanelTargets
    && (
      (Number.isInteger(Number(selectedActiveAction?.maxTargets))
        && Number(selectedActiveAction.maxTargets) > 0)
      || (selectedActiveAction?.targeting && typeof selectedActiveAction.targeting === "object")
      || selectedActiveAction?.requiresTargets === true
    );
  const activeActionCapacity = activeActionHasExplicitCapacity
    ? resolveTargetingCapacity({
      mode: "discrete",
      declaration: selectedActiveAction.targeting
        || (Number.isInteger(Number(selectedActiveAction.maxTargets))
          && Number(selectedActiveAction.maxTargets) > 0
          ? { maximum: Number(selectedActiveAction.maxTargets) }
          : null),
      targetIds: selectedTargetIds,
      ignoreTargetLimit,
      minimum: selectedActiveAction.requiresTargets ? 1 : null,
      initialTargeting: false,
      defaultDiscreteTargeting: false,
      source: "active-action",
    })
    : null;
  const targetCapacity = activeActionCapacity || workflowCapacity;
  const maxTargets = targetCapacity.effectiveMaximum;
  const outcomeMode = asText(presentation.outcomes?.mode) || "save";
  const saveDescriptor = presentation.outcomes?.save
    && typeof presentation.outcomes.save === "object"
    ? clone(presentation.outcomes.save)
    : null;
  const outcomeOptions = Array.isArray(presentation.outcomes?.options)
    ? clone(presentation.outcomes.options)
    : [];
  const attackOutcomeOptions = Array.isArray(presentation.outcomes?.attackOptions)
    ? clone(presentation.outcomes.attackOptions)
    : [];
  const isAreaSubset = targeting.selectionMode === "area-subset";
  const isPostPlacement = targeting.selectionMode === "post-placement";
  const selectionPolarity = targeting.selectionPolarity === "exclude"
    ? "exclude"
    : "include";
  // Modifica bersagli opens the list to any creature, the ones outside the area too.
  const placementCandidateIds = isAreaSubset
    && workflow.placement.confirmed === true
    && workflow.placement.targetsEdited !== true
    ? new Set(Array.isArray(session?.placement?.targetIds)
      ? session.placement.targetIds
      : (Array.isArray(session?.placement?.preview?.targetIds)
        ? session.placement.preview.targetIds
        : []))
    : null;
  const effectiveTargetLocked = isAreaSubset || isPostPlacement
    ? false
    : workflow.placement.targetLocked;
  const allCandidates = normalizeTargetCandidates(
    targetCandidates,
    selectedTargetIds,
    session?.outcomes,
    maxTargets,
    effectiveTargetLocked,
      outcomeMode,
      session?.attackOutcome,
      outcomeOptions,
    placementCandidateIds,
  );
  const normalizedTargetFilters = targetFilterModel(allCandidates, targetFilters);
  const filteredCandidates = allCandidates.filter((candidate) => spellTargetMatchesFilters(
    candidate,
    new Set(normalizedTargetFilters.factions),
    normalizedTargetFilters.name,
  ));
  const placement = placementLabels(workflow.placement, contract);
  const phase = presentation.phase || {};
  const variant = presentation.variant || {};
  const selectedVariantOption = (Array.isArray(variant.options) ? variant.options : [])
    .find((option) => asText(option?.value) === asText(session?.variant));
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
    && !workflow.activeAction
    && inputs.targets?.visible !== true;
  const initialAutomaticAura = executionContract.hasZones === true
    && workflow.placement.kind === "aura"
    && workflow.placement.policy === "automatic"
    && !workflow.activeAction;

  const targetVisible = isPostPlacement
    ? workflow.placement.confirmed === true
    : activeActionNeedsPanelTargets
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
  const damageInputVisible = workflow.controls.includes("damage");
  const effectFields = normalizeEffectFields(
    presentation,
    session,
    workflow.validation,
    contract?.spell?.id,
    damageInputVisible,
  );
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
    damageInputVisible,
  );
  if (allCandidates.some(candidate => candidate.sharedHpSourceId) && hpPreview.valid) {
    const items = allCandidates.map(candidate => ({ id: candidate.key, name: candidate.label,
      layer: candidate.layer || "CHARACTER", metadata: { [`${ID}/meta`]: {
        hp: candidate.hp, hpMax: candidate.hpMax, tempHp: candidate.tempHp, sharedHpSourceId: candidate.sharedHpSourceId,
      } } }));
    hpPreview.sharedHp = buildSharedHpPreview(items, hpPreview.targets.filter(target => target.change)
      .map(target => ({ item: items.find(item => item.id === target.key), change: target.change })), session.sharedHp || {});
    hpPreview.sharedHpSelection = session.sharedHp || {};
    const updates = new Map(hpPreview.sharedHp.updates.map(update => [update.tokenId, update]));
    for (const target of hpPreview.targets) {
      const update = updates.get(target.key);
      if (update) { target.afterHP = update.hp; target.delta = update.hp - target.beforeHP; }
    }
  }
  const hpPreviewByKey = new Map(
    (hpPreview.targets || []).map((target) => [target.key, target]),
  );
  const candidates = filteredCandidates.map((candidate) => {
    const preview = hpPreviewByKey.get(candidate.key) || null;
    return {
      ...candidate,
      hpPreview: preview,
      defenseChips: candidateDefenseChips({ candidate, presentation, session, spellId: contract?.spell?.id, damageInputVisible,
        count: preview?.defenseCount }),
    };
  });
  const eligiblePassengerIds = new Set(
    (Array.isArray(teleportPassengerCandidateIds) ? teleportPassengerCandidateIds : [])
      .map(asText)
      .filter(Boolean),
  );
  const passengerCandidates = allCandidates
    .filter((candidate) => (
      candidate.isCreature === true
      && candidate.key !== asText(session?.casterId)
      && eligiblePassengerIds.has(candidate.key)
    ))
    .map((candidate) => ({ value: candidate.key, label: candidate.label }));
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
  // Thunder Step (CAP-TELEPORT, lotto T2): who travels with the caster and where the caster goes, after the thunder's
  // area. The passenger is out of the thunder (D1); range, sight and free space stay the GM's beyond the tool's range.
  const teleportStep = presentation.teleportStep || null;
  const teleportDestinationChosen = !!session?.teleportDestination;
  const teleportStepView = teleportStep?.available === true && inputs.teleportDestination?.visible === true
    ? {
      visible: true,
      rangeMeters: teleportStep.rangeMeters,
      passenger: {
        visible: teleportStep.passenger?.available === true,
        label: "Passeggero (opzionale)",
        hint: `Una creatura consenziente adiacente al caster, di taglia pari o inferiore: arriva accanto a lui e non subisce il tuono. Consenso e carico restano al GM.`,
        value: asText(session?.stepPassengerId),
        options: optionList(passengerCandidates, "Nessun passeggero"),
      },
      destination: {
        chosen: teleportDestinationChosen,
        label: teleportDestinationChosen
          ? "Destinazione scelta: il caster si teletrasporta quando applichi."
          : `Scegli sulla mappa la casella d'arrivo entro ${teleportStep.rangeMeters} m.`,
        buttonLabel: teleportDestinationChosen ? "Cambia destinazione" : "Scegli destinazione",
        invalid: workflow.validation?.firstInvalidField === "teleportDestination",
      },
    }
    : null;
  const model = {
    spell: {
      label: workflow.spell?.label || "Seleziona un incantesimo",
      level: workflow.spell?.level ?? null,
      concentration: workflow.spell?.concentration === true,
    },
    workflow,
    teleportStep: teleportStepView,
    catalog: {
      ...buildCatalogViewModel({
        entries: catalogEntries,
        selectedKey: selectedCatalogKey || session?.spellId || "",
        ...catalogState,
      }),
      // The spell as this cast has it: a slot can lift the concentration (Bestow Curse from the 5th level).
      ...(workflow.spell ? { selectedConcentration: workflow.spell.concentration === true } : {}),
    },
    execution: {
      lane: asText(executionContract.lane),
      laneLabel: LANES[executionContract.lane] || "Catalogo pronto",
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
          : "",
        value: asText(session?.casterId),
        options: normalizeCasterOptions(casterOptions),
      },
      slot: {
        visible: inputs.slot?.visible === true,
        required: inputs.slot?.required === true,
        label: "Slot",
        hint: presentation.slot?.min
          ? `Dal ${presentation.slot.min}° livello in su.`
          : "",
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
        visible: inputs.variant?.visible === true
          && variant.control !== "attack-outcome",
        required: inputs.variant?.required === true,
        label: asText(variant.label) || "Scelta",
        hint: asText(selectedVariantOption?.detail),
        value: asText(session?.variant),
        options: optionList(variant.options, asText(variant.placeholder) || "Scegli"),
      },
      composition: {
        visible: inputs.composition?.visible === true,
        required: inputs.composition?.required === true,
        key: asText(composition.key) || "composition",
        label: asText(composition.label) || "Combinazione",
        hint: `Il costo totale non può superare ${animatedObjectsMaximumCost(session?.slotLevel)} oggetti.`,
        maximumCost: animatedObjectsMaximumCost(session?.slotLevel),
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
      selectionPolarity,
      candidates,
      filters: normalizedTargetFilters,
      selectedIds: [...selectedTargetIds],
      countLabel: selectionPolarity === "exclude"
        ? `${selectedTargetIds.length} escluse`
        : teleport?.available === true
          // Misty Step and Far Step take nobody along: no passenger to offer.
          ? teleport.passenger?.available !== true
            ? "Solo caster"
            : (asText(session?.passengerId) ? "1 passeggero selezionato" : "Solo caster · passeggero opzionale")
        : `${selectedTargetIds.length}${targetCapacity.maximum === null
          ? ""
          : `/${targetCapacity.maximum}`} bersagli`,
      limit: {
        maximum: targetCapacity.maximum,
        effectiveMaximum: targetCapacity.effectiveMaximum,
        bypassable: targetCapacity.bypassable === true,
        ignoreTargetLimit,
        exceeded: targetCapacity.exceeded,
        rawExceeded: targetCapacity.rawExceeded,
        classification: targetCapacity.classification || null,
      },
      limitWarning: targetCapacity.exceeded && !ignoreTargetLimit
        ? "Riduci manualmente i bersagli per rientrare nel limite."
        : "",
      ruleLabel: selectionPolarity === "exclude"
        ? "Creature escluse dall'effetto"
        : teleport?.available === true
          // The teleport's own name: Misty Step and Far Step said "Porta Dimensionale" too.
          ? asText(contract?.spell?.label) || "Teletrasporto"
        : targeting.filter ? `Filtro: ${targeting.filter}` : "Bersagli compatibili",
      spatialRules: clone(targeting.spatialRules),
      spatialLabel: targetingSpatialLabel(targeting, session),
      teleport: teleport?.available === true
        ? {
          available: true,
          passenger: {
            visible: inputs.passenger?.visible === true,
            required: inputs.passenger?.required === true,
            label: "Passeggero (opzionale)",
            hint: teleport.passenger?.adjacency === "grid-adjacent"
              ? `Una creatura consenziente adiacente al caster${teleport.passenger?.maxDistanceMeters
                ? ` (entro ${teleport.passenger.maxDistanceMeters} m)`
                : ""}; taglia pari o inferiore. Consenso, peso e capacità di trasporto restano al GM.`
              : teleport.passenger?.maxDistanceMeters
                ? `Una creatura consenziente entro ${teleport.passenger.maxDistanceMeters} m; taglia pari o inferiore. Consenso, peso e capacità di trasporto restano al GM.`
              : "Seleziona una creatura, se prevista dal testo.",
            value: asText(session?.passengerId),
            options: optionList(passengerCandidates, "Nessun passeggero"),
          },
        }
        : null,
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
      emptyLabel: selectionPolarity === "exclude"
        ? "Nessuna creatura esclusa."
        : (activeActionNeedsPanelTargets ? "discrete" : targetingMode) === "geometric"
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
      hpPool: spellCastHpPoolFormula(contract?.spell?.id, session?.slotLevel),
      outcomes: {
        visible: inputs.outcomes?.visible === true,
        required: inputs.outcomes?.required === true,
        label: outcomeMode === "save"
          ? saveDescriptor?.label ? `Esiti TS ${saveDescriptor.label}` : "Esiti TS"
          : "Esiti TS / attacco",
        mode: outcomeMode,
        options: outcomeOptions,
        save: saveDescriptor && castSaveDC ? { ...saveDescriptor, dc: castSaveDC } : saveDescriptor,
        assumedFailed: asText(assumedSaveOutcome) === "failed"
          && inputs.outcomes?.required === true
          && ["save", "attack-and-save"].includes(outcomeMode),
        attack: {
          visible: outcomeMode === "attack-and-save",
          required: outcomeMode === "attack-and-save",
          label: "Esito dell'attacco",
          value: asText(session?.attackOutcome),
          options: attackOutcomeOptions,
        },
      },
      context: targetContextFields(
        presentation,
        session,
        allCandidates.filter((candidate) => candidate.selected),
        contract?.spell?.id,
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
          // The button says what it waits for: the panel lists no targets here, the map's selection is the target.
          label: selectedActiveAction.type === "resolve"
            ? (selectedActiveAction.requiresTargets === true && !selectedTargetIds.length
              ? "Seleziona il bersaglio sulla mappa"
              : "Apri risoluzione")
            : selectedActiveAction.buttonLabel || selectedActiveAction.label || "Risolvi azione",
          disabled: selectedActiveAction.disabled
            || selectedActiveAction.presentation?.disabled === true
            || ["loading", "opened"].includes(asText(session?.activeActionState?.state)),
        }
        : null,
      actions: activeActions.map((action) => ({
        ...action,
        economyLabel: actionEconomyLabel(action.economy),
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
      description: "",
      fields: effectFields,
    },
    effects: {
      visible: !activeActionDelegatesResolution
        && manualCapability.available !== true
        && effectFields.length > 0,
      label: "Valori effetto",
      description: "",
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
    renderTeleportStep(documentRef, model, callbacks),
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
