import {
  advanceRepeatedSaveProgress,
  normalizeRepeatedSaveProgress,
  repeatedSaveProgressLabel,
} from "./repeatedSaveProgressCore.js";

export const FLESH_TO_STONE_SPELL_ID = "flesh-to-stone";
export const FLESH_TO_STONE_RESTRAINED_EFFECT_ID = "flesh-to-stone-restrained";
// Kept for backward compatibility with casts created by the first SP-R06A build.
export const FLESH_TO_STONE_PROGRESS_EFFECT_ID = "flesh-to-stone-progress";
export const FLESH_TO_STONE_PETRIFIED_EFFECT_ID = "flesh-to-stone-petrified";
export const FLESH_TO_STONE_PROGRESS_CONDITION = "Carne in pietra · progresso";

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

function progressPayload(successes, failures) {
  const progress = normalizeRepeatedSaveProgress({ successes, failures }, {
    successThreshold: 3,
    failureThreshold: 3,
  });
  return {
    successes: Math.min(2, progress.successes),
    failures: Math.max(1, Math.min(2, progress.failures)),
  };
}

const BASE_SAVE_REMINDER = freeze({
  ability: "con",
  timing: "turn-end",
  dcSource: "source-spell",
  success: "keep-effect",
  label: "Carne in pietra: ripeti il TS Costituzione.",
});

function progressMechanics(successes, failures) {
  return {
    fleshToStoneProgress: progressPayload(successes, failures),
  };
}

function progressSummaryParts(successes, failures) {
  const progress = progressPayload(successes, failures);
  return [{
    id: "flesh-to-stone-progress",
    label: repeatedSaveProgressLabel(progress),
  }];
}

function restrainedEffectDetail(successes, failures) {
  const progress = progressPayload(successes, failures);
  return `Il corpo si sta pietrificando. Successi ${progress.successes}/3 · Fallimenti ${progress.failures}/3. Ripete il TS Costituzione al termine di ogni proprio turno.`;
}

const restrainedRule = freeze({
  condition: "Trattenuto",
  effectId: FLESH_TO_STONE_RESTRAINED_EFFECT_ID,
  effectDetail: restrainedEffectDetail(0, 1),
  // Trattenuto è una condizione canonica: niente pill spell-effect o tema spell.
  // I campi di provenance spellName/spellId non sono necessari al lifecycle
  // e il normalizzatore runtime non li conserva, quindi li azzeriamo già al cast
  // per mantenere stabile lo snapshot History/Undo.
  options: { theme: null, spellName: "", spellId: "" },
  expiry: { mode: "concentration" },
  mechanics: progressMechanics(0, 1),
  summaryParts: progressSummaryParts(0, 1),
  manualRemoval: true,
  endsParentOnRemoval: true,
  parentRemoval: "spell",
  saveReminder: BASE_SAVE_REMINDER,
});

export const FLESH_TO_STONE_SAVE_AUTOMATION = freeze({
  trackOutcomes: ["failed"],
  failed: [restrainedRule],
});

function legacyProgressMarker(conditions = [], parentEffectId = "") {
  const parent = String(parentEffectId || "").trim();
  return (Array.isArray(conditions) ? conditions : []).find((candidate) =>
    candidate?.active !== false
    && String(candidate?.parentEffectId || "").trim() === parent
    && String(candidate?.effectId || "").trim() === FLESH_TO_STONE_PROGRESS_EFFECT_ID
  ) || null;
}

function progressFromConditions(conditions = [], parentEffectId = "", instance = null) {
  // Canonical SP-R06A state: the counter lives on the same Trattenuto instance
  // that owns the reminder, so it cannot drift from the effect lifecycle.
  const direct = instance?.mechanics?.fleshToStoneProgress;
  if (direct && typeof direct === "object") {
    return progressPayload(direct.successes ?? 0, direct.failures ?? 1);
  }

  // Compatibility with casts created by the first SP-R06A build. The first
  // successful reminder resolution migrates this marker into Trattenuto.
  const marker = legacyProgressMarker(conditions, parentEffectId);
  const raw = marker?.mechanics?.fleshToStoneProgress;
  return progressPayload(raw?.successes ?? 0, raw?.failures ?? 1);
}

function restrainedProgressAction(instance, successes, failures) {
  const progress = progressPayload(successes, failures);
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    parentEffectId: "$parent",
    name: "Trattenuto",
    options: {
      sourceId: String(instance?.sourceId || "").trim(),
      sourceName: String(instance?.sourceName || "").trim(),
      type: "spell",
      effectId: FLESH_TO_STONE_RESTRAINED_EFFECT_ID,
      effectDetail: restrainedEffectDetail(progress.successes, progress.failures),
      expiry: { mode: "concentration" },
      mechanics: progressMechanics(progress.successes, progress.failures),
      summaryParts: progressSummaryParts(progress.successes, progress.failures),
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "spell",
      saveReminder: BASE_SAVE_REMINDER,
    },
  };
}

function legacyProgressCleanupAction(marker) {
  const instanceId = String(marker?.id || "").trim();
  if (!instanceId) return null;
  return {
    kind: "condition",
    action: "remove-instance",
    targetId: "$target",
    instanceId,
  };
}

function petrifiedAction() {
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    parentEffectId: "$parent",
    name: "Pietrificato",
    options: {
      type: "spell",
      effectId: FLESH_TO_STONE_PETRIFIED_EFFECT_ID,
      effectDetail: "Pietrificato da Carne in pietra. Se la concentrazione dura per l'intero minuto, la pietrificazione diventa permanente.",
      expiry: { mode: "concentration" },
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "spell",
      parentEndCondition: {
        condition: "Pietrificato",
        naturalOnly: true,
        expiry: { mode: "manual" },
        options: {
          effectDetail: "Pietrificazione permanente da Carne in pietra.",
          manualRemoval: true,
        },
      },
    },
  };
}

export function fleshToStoneReminderForInstance({
  instance = null,
  conditions = [],
  reminder = null,
} = {}) {
  // effectId is the stable identity here. `spellId` is intentionally not
  // required because the shared condition normalizer does not preserve that
  // optional provenance field across every Effects Mutation round-trip.
  if (
    String(instance?.effectId || "").trim() !== FLESH_TO_STONE_RESTRAINED_EFFECT_ID
    || !reminder
  ) {
    return reminder;
  }

  const parentEffectId = instance?.parentEffectId;
  const { successes, failures } = progressFromConditions(
    conditions,
    parentEffectId,
    instance,
  );
  const legacyMarker = legacyProgressMarker(conditions, parentEffectId);
  const migrateActions = legacyMarker
    ? [legacyProgressCleanupAction(legacyMarker)].filter(Boolean)
    : [];

  const successAdvance = advanceRepeatedSaveProgress(
    { successes, failures },
    "success",
    { successThreshold: 3, failureThreshold: 3 },
  );
  const failureAdvance = advanceRepeatedSaveProgress(
    { successes, failures },
    "failure",
    { successThreshold: 3, failureThreshold: 3 },
  );
  const successOutcome = successAdvance.terminal === "success"
    ? "remove-effect"
    : {
      mode: "keep-effect",
      actions: [
        ...migrateActions,
        restrainedProgressAction(
          instance,
          successAdvance.progress.successes,
          successAdvance.progress.failures,
        ),
      ],
    };
  const failureOutcome = failureAdvance.terminal === "failure"
    ? {
      mode: "keep-effect",
      actions: [
        {
          kind: "condition",
          action: "remove-parent",
          targetId: "$target",
          parentEffectId: "$parent",
        },
        petrifiedAction(),
      ],
    }
    : {
      mode: "keep-effect",
      actions: [
        ...migrateActions,
        restrainedProgressAction(
          instance,
          failureAdvance.progress.successes,
          failureAdvance.progress.failures,
        ),
      ],
    };

  return freeze({
    ...reminder,
    success: "keep-effect",
    label: `Carne in pietra · Successi ${successes}/3 · Fallimenti ${failures}/3.`,
    resolution: {
      success: successOutcome,
      failure: failureOutcome,
      immune: "remove-effect",
    },
  });
}
