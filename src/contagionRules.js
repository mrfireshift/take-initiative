import {
  advanceRepeatedSaveProgress,
  normalizeRepeatedSaveProgress,
  repeatedSaveProgressLabel,
} from "./repeatedSaveProgressCore.js";

export const CONTAGION_SPELL_ID = "contagion";
const PROGRESS_THRESHOLDS = Object.freeze({
  successThreshold: 3,
  failureThreshold: 3,
});

const BASE_REPEATED_SAVE_REMINDER = Object.freeze({
  ability: "con",
  timing: "turn-end",
  actor: "target",
  dcSource: "source-spell",
  success: "keep-effect",
  label: "Contagio: ripeti il TS Costituzione.",
});

const MIND_FIRE_TURN_START_REMINDER = Object.freeze({
  timing: "turn-start",
  actor: "target",
  mode: "consume",
  label: "Fuoco mentale: usa la tabella di Confusione e tira fisicamente il d10 all'inizio del turno. Nessun TS SAG; il TS COS di Contagio resta quello di fine turno.",
});

const VISCOUS_DAMAGE_REMINDER = Object.freeze({
  timing: "damage",
  actor: "target",
  mode: "choice",
  label: "Devastazione vischiosa: quando subisce danni, applica Stordito fino alla fine del prossimo turno del bersaglio.",
  resolution: Object.freeze({
    mode: "choice",
    choiceLabels: Object.freeze({
      passed: "Applica Stordito",
      failed: "Ignora",
    }),
    success: Object.freeze({
      actions: Object.freeze([Object.freeze({
        kind: "condition",
        action: "apply",
        targetId: "$target",
        name: "Stordito",
        options: Object.freeze({
          type: "spell",
          effectId: "contagion-viscous-stunned",
          expiry: Object.freeze({
            mode: "turn-end",
            actor: "target",
            remaining: 1,
            anchor: "next-turn",
          }),
        }),
      })]),
    }),
    failure: Object.freeze({ actions: Object.freeze([]) }),
    immune: Object.freeze({ actions: Object.freeze([]) }),
  }),
});

const DISEASES = Object.freeze([
  Object.freeze({
    id: "rotting-flesh",
    label: "Carne putrefatta",
    terminalSummary: "Car − / Vuln. tutti i danni",
    detail: "Svantaggio alle prove di Carisma; vulnerabilità a tutti i danni.",
    mechanics: Object.freeze({
      abilityCheck: Object.freeze({ ability: "cha", disadvantage: true }),
      damageVulnerability: Object.freeze({ all: true, informational: true }),
    }),
  }),
  Object.freeze({
    id: "viscous-devastation",
    label: "Devastazione vischiosa",
    terminalSummary: "Cos − / TS Cos − / Danni → Stordito",
    detail: "Svantaggio alle prove e ai TS di Costituzione; ogni volta che subisce danni, Stordito fino alla fine del proprio turno successivo.",
    mechanics: Object.freeze({
      abilityCheck: Object.freeze({ ability: "con", disadvantage: true }),
      savingThrow: Object.freeze({ ability: "con", disadvantage: true }),
      damageTriggeredCondition: "Stordito",
    }),
    damageReminder: VISCOUS_DAMAGE_REMINDER,
  }),
  Object.freeze({
    id: "filth-fever",
    label: "Febbre lurida",
    terminalSummary: "For − / TS For − / Att. For −",
    detail: "Svantaggio alle prove e ai TS di Forza e agli attacchi che usano Forza.",
    mechanics: Object.freeze({
      abilityCheck: Object.freeze({ ability: "str", disadvantage: true }),
      savingThrow: Object.freeze({ ability: "str", disadvantage: true }),
      attackRoll: Object.freeze({ ability: "str", disadvantage: true }),
    }),
  }),
  Object.freeze({
    id: "mind-fire",
    label: "Fuoco mentale",
    terminalSummary: "Int − / TS Int − / Confusione d10",
    detail: "Svantaggio alle prove e ai TS di Intelligenza; in combattimento si comporta come sotto Confusione: niente reazioni e tabella d10 fisica a inizio turno. Non effettua il normale TS SAG di Confusione.",
    mechanics: Object.freeze({
      abilityCheck: Object.freeze({ ability: "int", disadvantage: true }),
      savingThrow: Object.freeze({ ability: "int", disadvantage: true }),
      confusionSemantics: Object.freeze({
        noReactions: true,
        randomTurnTable: true,
        physicalDice: true,
        wisdomSave: false,
      }),
    }),
    turnStartReminder: MIND_FIRE_TURN_START_REMINDER,
  }),
  Object.freeze({
    id: "blinding-sickness",
    label: "Infermità accecante",
    terminalSummary: "Accecato / Sag − / TS Sag −",
    conditionName: "Accecato",
    displayLabel: "Contagio · Infermità accecante",
    detail: "Accecato; svantaggio alle prove e ai TS di Saggezza.",
    mechanics: Object.freeze({
      canonicalCondition: "Accecato",
      abilityCheck: Object.freeze({ ability: "wis", disadvantage: true }),
      savingThrow: Object.freeze({ ability: "wis", disadvantage: true }),
    }),
  }),
  Object.freeze({
    id: "tremors",
    label: "Tremori",
    terminalSummary: "Des − / TS Des − / Att. Des −",
    detail: "Svantaggio alle prove e ai TS di Destrezza e agli attacchi che usano Destrezza.",
    mechanics: Object.freeze({
      abilityCheck: Object.freeze({ ability: "dex", disadvantage: true }),
      savingThrow: Object.freeze({ ability: "dex", disadvantage: true }),
      attackRoll: Object.freeze({ ability: "dex", disadvantage: true }),
    }),
  }),
]);

const DISEASE_BY_ID = new Map(DISEASES.map((disease) => [disease.id, disease]));

function diseaseForInstance(instance) {
  return DISEASE_BY_ID.get(String(instance?.mechanics?.contagionDiseaseId || "").trim()) || null;
}

function progressFor(value) {
  return normalizeRepeatedSaveProgress(value, PROGRESS_THRESHOLDS);
}

function progressMechanics(disease, progress) {
  return {
    ...(disease.mechanics || {}),
    contagionDiseaseId: disease.id,
    repeatedSaveProgress: {
      successes: progress.successes,
      failures: progress.failures,
      successThreshold: progress.successThreshold,
      failureThreshold: progress.failureThreshold,
    },
  };
}

function summaryParts(disease, progress) {
  return [
    { id: `contagion-disease:${disease.id}`, label: disease.label },
    { id: "contagion-progress", label: repeatedSaveProgressLabel(progress) },
  ];
}

function terminalSummaryParts(disease) {
  return [
    {
      id: `contagion-terminal-name:${disease.id}`,
      label: disease.label,
      stack: true,
    },
    {
      id: `contagion-terminal-debuff:${disease.id}`,
      label: disease.terminalSummary || "Debuff applicati",
      stack: true,
    },
  ];
}

function effectDetail(disease, progress) {
  return `${disease.detail} Progressione: ${repeatedSaveProgressLabel(progress)}. Alla fine di ogni turno del bersaglio: TS Costituzione; a 3 successi la malattia termina, a 3 fallimenti si stabilizza e non genera più TS fino alla fine dei 7 giorni.`;
}

function saveRemindersFor(disease) {
  return [
    BASE_REPEATED_SAVE_REMINDER,
    ...(disease.turnStartReminder ? [disease.turnStartReminder] : []),
    ...(disease.damageReminder ? [disease.damageReminder] : []),
  ];
}

function effectFor(disease) {
  const progress = progressFor({ successes: 0, failures: 0 });
  const conditionName = disease.conditionName || `Contagio · ${disease.label}`;
  return Object.freeze({
    id: `contagion-${disease.id}`,
    kind: "debuff",
    label: conditionName,
    ...(disease.displayLabel ? { displayLabel: disease.displayLabel } : {}),
    detail: effectDetail(disease, progress),
    mechanics: progressMechanics(disease, progress),
    summaryParts: summaryParts(disease, progress),
    saveReminder: saveRemindersFor(disease),
    manualRemoval: true,
    endsParentOnRemoval: true,
    parentRemoval: "target",
  });
}

export const CONTAGION_DISEASES = DISEASES;

export const CONTAGION_EFFECT_CHOICES = Object.freeze(
  DISEASES.map((disease) => Object.freeze({
    id: disease.id,
    label: disease.label,
    effects: Object.freeze([effectFor(disease)]),
  })),
);

export function contagionDiseaseForInstance(instance) {
  return diseaseForInstance(instance);
}

export function isContagionInstance(instance) {
  return !!diseaseForInstance(instance);
}

function progressUpdateAction(instance, disease, progress, { terminalFailure = false } = {}) {
  const currentMechanics = instance?.mechanics && typeof instance.mechanics === "object"
    ? instance.mechanics
    : {};
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    parentEffectId: "$parent",
    name: String(instance?.condition || `Contagio · ${disease.label}`).trim(),
    options: {
      sourceId: "$source",
      sourceName: String(instance?.sourceName || "").trim(),
      type: "spell",
      effectId: String(instance?.effectId || `contagion-${disease.id}`).trim(),
      effectKind: instance?.effectKind === "buff" ? "buff" : "debuff",
      ...(instance?.displayLabel ? { displayLabel: instance.displayLabel } : {}),
      effectDetail: effectDetail(disease, progress),
      mechanics: {
        ...currentMechanics,
        ...progressMechanics(disease, progress),
      },
      summaryParts: terminalFailure
        ? terminalSummaryParts(disease)
        : summaryParts(disease, progress),
      ...(instance?.expiry ? { expiry: instance.expiry } : {}),
      ...(instance?.saveReminder ? { saveReminder: instance.saveReminder } : {}),
      manualRemoval: instance?.manualRemoval === true,
      ...(instance?.endsParentOnRemoval === true ? { endsParentOnRemoval: true } : {}),
      ...(instance?.parentRemoval ? { parentRemoval: instance.parentRemoval } : {}),
    },
  };
}

function progressOutcome(instance, disease, outcome) {
  const current = progressFor(instance?.mechanics?.repeatedSaveProgress);
  const next = advanceRepeatedSaveProgress(current, outcome, PROGRESS_THRESHOLDS);
  if (next.terminal === "success") return "remove-effect";
  return {
    mode: "keep-effect",
    actions: [progressUpdateAction(instance, disease, next.progress, {
      terminalFailure: next.terminal === "failure",
    })],
  };
}

export function contagionReminderForInstance({ instance = null, reminder = null } = {}) {
  const disease = diseaseForInstance(instance);
  if (!disease || !reminder) return reminder;
  if (reminder.ability !== "con" || reminder.timing !== "turn-end") return reminder;

  const progress = progressFor(instance?.mechanics?.repeatedSaveProgress);
  if (progress.terminal) return null;
  return {
    ...reminder,
    success: "keep-effect",
    label: `Contagio · ${disease.label} · ${repeatedSaveProgressLabel(progress)}. Ripeti il TS Costituzione; i risultati non devono essere consecutivi.`,
    resolution: {
      success: progressOutcome(instance, disease, "success"),
      failure: progressOutcome(instance, disease, "failure"),
      immune: { mode: "keep-effect", actions: [] },
    },
  };
}
