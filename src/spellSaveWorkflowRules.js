const freezeValue = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeValue(child);
  return Object.freeze(value);
};

const choiceOption = ({ value, label, spellName = "", automation = null }) => {
  const option = {
    value: String(value || "").trim(),
    label: String(label || value || "").trim(),
  };
  const semanticSpellName = String(spellName || "").trim();
  if (semanticSpellName) option.spellName = semanticSpellName;
  if (automation && typeof automation === "object") option.automation = automation;
  return freezeValue(option);
};

const castChoice = (options, required = true) => freezeValue({
  scope: "cast",
  required: required === true,
  options: options.map(choiceOption),
});

const targetContextField = ({
  id,
  label,
  type = "select",
  required = false,
  requiredWhen = null,
  options = [],
  placeholder = "",
}) => freezeValue({
  id: String(id || "").trim(),
  label: String(label || id || "").trim(),
  type: String(type || "select").trim(),
  required: required === true,
  ...(requiredWhen && typeof requiredWhen === "object"
    ? { requiredWhen: freezeValue(requiredWhen) }
    : {}),
  ...(Array.isArray(options) ? { options: options.map(choiceOption) } : {}),
  ...(placeholder ? { placeholder: String(placeholder) } : {}),
});

const targetContext = ({
  fields = [],
  saveWhen = null,
  automatic = [],
  involvedOnOutcomes = [],
  effects = [],
  modifiers = [],
  trackInvolved = false,
  manualAction = null,
}) => freezeValue({
  scope: "target",
  fields: fields.map(targetContextField),
  ...(saveWhen && typeof saveWhen === "object"
    ? { saveWhen: freezeValue(saveWhen) }
    : {}),
  ...(Array.isArray(automatic) && automatic.length
    ? { automatic: automatic.map(freezeValue) }
    : {}),
  ...(Array.isArray(involvedOnOutcomes) && involvedOnOutcomes.length
    ? { involvedOnOutcomes: Object.freeze([...involvedOnOutcomes]) }
    : {}),
  ...(Array.isArray(effects) && effects.length
    ? { effects: effects.map(freezeValue) }
    : {}),
  ...(Array.isArray(modifiers) && modifiers.length
    ? { modifiers: modifiers.map(freezeValue) }
    : {}),
  ...(trackInvolved === true ? { trackInvolved: true } : {}),
  ...(manualAction && typeof manualAction === "object"
    ? { manualAction: freezeValue(manualAction) }
    : {}),
});

const planeOriginOptions = Object.freeze([
  choiceOption({ value: "current-plane", label: "Nativo del piano corrente" }),
  choiceOption({ value: "other-plane", label: "Originario di un altro piano" }),
]);

const commandChoice = castChoice([
  {
    value: "avvicinati",
    label: "Avvicinati",
    spellName: "Comando · Avvicinati",
    automation: { trackOutcomes: ["failed"] },
  },
  {
    value: "fermo",
    label: "Fermo",
    spellName: "Comando · Fermo",
    automation: { trackOutcomes: ["failed"] },
  },
  {
    value: "fuggi",
    label: "Fuggi",
    spellName: "Comando · Fuggi",
    automation: { trackOutcomes: ["failed"] },
  },
  {
    value: "lascia",
    label: "Lascia",
    spellName: "Comando · Lascia",
    automation: { trackOutcomes: ["failed"] },
  },
  {
    value: "supplica",
    label: "Supplica",
    spellName: "Comando · Supplica",
    automation: {
      trackOutcomes: ["failed"],
      failed: [{
        condition: "Prono",
        options: {
          parentEffectId: "",
          manualRemoval: true,
          activation: {
            mode: "turn-start",
            actor: "target",
            remaining: 1,
            anchor: "next-turn",
          },
        },
      }],
    },
  },
]);

const elementalBaneChoice = castChoice([
  { value: "acido", label: "Acido" },
  { value: "freddo", label: "Freddo" },
  { value: "fulmine", label: "Fulmine" },
  { value: "fuoco", label: "Fuoco" },
  { value: "tuono", label: "Tuono" },
]);

const blindnessDeafnessChoice = castChoice([
  {
    value: "accecato",
    label: "Accecato",
    automation: {
      trackOutcomes: ["failed"],
      failed: [{
        condition: "Accecato",
        manualRemoval: true,
        endsParentOnRemoval: true,
        parentRemoval: "target",
        saveReminder: {
          ability: "con",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "Se supera il TS, termina Cecità/Sordità su di sé.",
        },
      }],
    },
  },
  {
    value: "assordato",
    label: "Assordato",
    automation: {
      trackOutcomes: ["failed"],
      failed: [{
        condition: "Assordato",
        manualRemoval: true,
        endsParentOnRemoval: true,
        parentRemoval: "target",
        saveReminder: {
          ability: "con",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "Se supera il TS, termina Cecità/Sordità su di sé.",
        },
      }],
    },
  },
]);

const eyebiteNauseaReminder = Object.freeze({
  ability: "wis",
  timing: "turn-end",
  dcSource: "source-spell",
  label: "Se supera il TS Saggezza, termina Nauseato e non può più essere bersagliato da questo lancio.",
  resolution: Object.freeze({
    success: Object.freeze({
      mode: "remove-effect",
      actions: Object.freeze([Object.freeze({
        kind: "condition",
        action: "apply",
        targetId: "$target",
        parentEffectId: "$parent",
        name: "Immune a Sguardo penetrante",
        options: Object.freeze({
          effectId: "eyebite-resisted",
          type: "spell",
          expiry: Object.freeze({ mode: "concentration" }),
        }),
      })]),
    }),
    failure: "keep-effect",
  }),
});

const eyebiteResistedRule = Object.freeze({
  condition: "Immune a Sguardo penetrante",
  effectId: "eyebite-resisted",
  effectDetail: "Ha superato un TS contro questo lancio e non può più essere bersagliato da Sguardo penetrante finché la spell resta attiva.",
  expiry: Object.freeze({ mode: "concentration" }),
});

const eyebiteChoice = castChoice([
  {
    value: "eyebite-asleep",
    label: "Addormentato",
    automation: {
      trackOutcomes: ["passed", "failed"],
      passed: [eyebiteResistedRule],
      failed: [{
        condition: "Privo di sensi",
        effectId: "eyebite-asleep",
        mechanics: { endsOnDamage: true },
        manualRemoval: true,
      }],
    },
  },
  {
    value: "eyebite-panicked",
    label: "In preda al panico",
    automation: {
      trackOutcomes: ["passed", "failed"],
      passed: [eyebiteResistedRule],
      failed: [{
        condition: "Spaventato",
        effectId: "eyebite-panicked",
        manualRemoval: true,
        saveReminder: {
          timing: "turn-start",
          mode: "consume",
          label: "Deve usare Scatto e allontanarsi dal caster lungo il percorso più breve e sicuro possibile.",
        },
      }],
    },
  },
  {
    value: "eyebite-sickened",
    label: "Nauseato",
    automation: {
      trackOutcomes: ["passed", "failed"],
      passed: [eyebiteResistedRule],
      failed: [{
        condition: "Nauseato",
        effectId: "eyebite-sickened",
        effectDetail: "Svantaggio ai tiri per colpire e alle prove di caratteristica.",
        manualRemoval: true,
        saveReminder: eyebiteNauseaReminder,
      }],
    },
  },
]);

const workflowRule = ({
  spellId,
  ability,
  maximum = null,
  baseMaximum,
  additionalPerSlotAbove,
  baseSlot,
  choice = null,
  spatial = null,
  context = null,
  persistence = null,
  manualSaveAtTable = false,
  assumedOutcome = "failed",
  outcomeOptions = null,
  preserveTargetsOnChoiceChange = false,
  unlimitedTargets = false,
}) => Object.freeze({
  spellId,
  timing: "cast",
  ability,
  targeting: Object.freeze({
    mode: "selected",
    ...(maximum !== null && maximum !== undefined ? { maximum } : {}),
    ...(baseMaximum !== null && baseMaximum !== undefined ? { baseMaximum } : {}),
    ...(additionalPerSlotAbove !== null && additionalPerSlotAbove !== undefined
      ? { additionalPerSlotAbove }
      : {}),
    ...(baseSlot !== null && baseSlot !== undefined ? { baseSlot } : {}),
    consent: "all-save",
    ...(unlimitedTargets === true ? { unlimitedTargets: true } : {}),
    ...(spatial && typeof spatial === "object"
      ? { spatial: freezeValue(spatial) }
      : {}),
    ...(context && typeof context === "object"
      ? { context: freezeValue(context) }
      : {}),
  }),
  choice,
  ...(persistence && typeof persistence === "object"
    ? { persistence: freezeValue(persistence) }
    : {}),
  ...(manualSaveAtTable === true
    ? { manualSaveAtTable: true, assumedOutcome: String(assumedOutcome || "failed").trim() || "failed" }
    : {}),
  ...(Array.isArray(outcomeOptions) && outcomeOptions.length
    ? { outcomeOptions: Object.freeze(outcomeOptions.map((value) => String(value || "").trim()).filter(Boolean)) }
    : {}),
  ...(preserveTargetsOnChoiceChange === true ? { preserveTargetsOnChoiceChange: true } : {}),
});

export const SPELL_SAVE_WORKFLOW_RULES = Object.freeze({
  "flesh-to-stone": workflowRule({
    spellId: "flesh-to-stone",
    ability: "con",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 6,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
  }),
  "bane": workflowRule({
    spellId: "bane",
    ability: "cha",
    baseMaximum: 3,
    additionalPerSlotAbove: 1,
    baseSlot: 1,
  }),
  "blindness-deafness": workflowRule({
    spellId: "blindness-deafness",
    ability: "con",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 2,
    choice: blindnessDeafnessChoice,
    spatial: {
      mode: "caster-range",
      maxMeters: 9,
    },
  }),
  "slow": workflowRule({
    spellId: "slow",
    ability: "wis",
    baseMaximum: 6,
    additionalPerSlotAbove: 0,
    baseSlot: 3,
  }),
  "legacy-tashas-mind-whip": workflowRule({
    spellId: "legacy-tashas-mind-whip",
    ability: "int",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 2,
  }),
  "xanathar-aculeo-mentale": workflowRule({
    spellId: "xanathar-aculeo-mentale",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 2,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
  }),
  "xanathar-debilitazione": workflowRule({
    spellId: "xanathar-debilitazione",
    ability: "dex",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 5,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
    outcomeOptions: ["passed", "failed"],
  }),
  "xanathar-immolazione": workflowRule({
    spellId: "xanathar-immolazione",
    ability: "dex",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 5,
    spatial: {
      mode: "caster-range",
      maxMeters: 27,
    },
  }),
  "xanathar-urlo-psichico": workflowRule({
    spellId: "xanathar-urlo-psichico",
    ability: "int",
    baseMaximum: 10,
    additionalPerSlotAbove: 0,
    baseSlot: 9,
    spatial: {
      mode: "caster-range",
      maxMeters: 27,
    },
  }),
  "tasha-scheggia-della-mente": workflowRule({
    spellId: "tasha-scheggia-della-mente",
    ability: "int",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 0,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
  }),
  "phb2014-allucinazione-di-forza": workflowRule({
    spellId: "phb2014-allucinazione-di-forza",
    ability: "int",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 2,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
  }),
  "phb2014-raggio-di-infermita": workflowRule({
    spellId: "phb2014-raggio-di-infermita",
    ability: "con",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 1,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
  }),
  "eyebite": workflowRule({
    spellId: "eyebite",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 0,
    baseSlot: 6,
    choice: eyebiteChoice,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
    persistence: { owner: "caster" },
    manualSaveAtTable: true,
    assumedOutcome: "failed",
    outcomeOptions: ["passed", "failed"],
    preserveTargetsOnChoiceChange: true,
  }),
  "command": workflowRule({
    spellId: "command",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 1,
    choice: commandChoice,
  }),
  "compulsion": workflowRule({
    spellId: "compulsion",
    ability: "wis",
    baseSlot: 4,
    unlimitedTargets: true,
    spatial: {
      mode: "caster-range",
      maxMeters: 9,
    },
  }),
  "xanathar-anatema-elementale": workflowRule({
    spellId: "xanathar-anatema-elementale",
    ability: "con",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 4,
    choice: elementalBaneChoice,
    spatial: {
      mode: "pairwise-distance",
      maxMeters: 9,
    },
  }),
  "hold-person": workflowRule({
    spellId: "hold-person",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 2,
    spatial: {
      mode: "pairwise-distance",
      maxMeters: 9,
    },
  }),
  "hold-monster": workflowRule({
    spellId: "hold-monster",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 5,
    spatial: {
      mode: "pairwise-distance",
      maxMeters: 9,
    },
  }),
  "banishment": workflowRule({
    spellId: "banishment",
    ability: "cha",
    maximum: 1,
    baseSlot: 4,
    spatial: {
      mode: "caster-range",
      maxMeters: 18,
    },
    context: targetContext({
      fields: [targetContextField({
        id: "planeOrigin",
        label: "Origine del bersaglio",
        required: true,
        options: planeOriginOptions,
        placeholder: "Seleziona l'origine",
      })],
      modifiers: [
        {
          outcome: "failed",
          condition: "Incapacitato",
          field: "planeOrigin",
          values: {
            "current-plane": {
              parentEndCondition: {
                condition: "Esilio terminato · ritorno",
                naturalOnly: true,
                expiry: { mode: "manual" },
              },
            },
            "other-plane": {
              parentEndCondition: {
                condition: "Esiliato · non ritorna",
                naturalOnly: true,
                expiry: { mode: "manual" },
              },
            },
          },
        },
      ],
    }),
  }),
});

export const SPELL_SAVE_WORKFLOW_SPELL_IDS = Object.freeze(
  Object.keys(SPELL_SAVE_WORKFLOW_RULES),
);

export function getSpellSaveWorkflowRule(spellId) {
  const normalizedSpellId = String(spellId || "").trim();
  return SPELL_SAVE_WORKFLOW_RULES[normalizedSpellId] || null;
}

function resolveRule(ruleOrSpellId) {
  return ruleOrSpellId && typeof ruleOrSpellId === "object"
    ? ruleOrSpellId
    : getSpellSaveWorkflowRule(ruleOrSpellId);
}

export function getSpellSaveWorkflowChoiceOptions(ruleOrSpellId) {
  const options = resolveRule(ruleOrSpellId)?.choice?.options;
  return Array.isArray(options) ? options : [];
}

export function getSpellSaveWorkflowTargetContext(ruleOrSpellId) {
  const context = resolveRule(ruleOrSpellId)?.targeting?.context;
  return context && typeof context === "object" ? context : null;
}

export function validateSpellSaveWorkflowChoice(ruleOrSpellId, choiceValue = "") {
  const rule = resolveRule(ruleOrSpellId);
  const choice = rule?.choice && typeof rule.choice === "object"
    ? rule.choice
    : null;
  const value = String(choiceValue || "").trim();
  const options = getSpellSaveWorkflowChoiceOptions(rule);
  const option = options.find((entry) => entry.value === value) || null;
  const errors = [];

  if (choice?.required === true && !value) errors.push("choice-required");
  if (value && choice && !option) errors.push("choice-invalid");

  return {
    valid: errors.length === 0,
    errors,
    required: choice?.required === true,
    value,
    option,
    contract: choice,
  };
}

export function getSpellSaveWorkflowChoice(ruleOrSpellId, choiceValue = "") {
  const result = validateSpellSaveWorkflowChoice(ruleOrSpellId, choiceValue);
  return result.valid ? result.option : null;
}

export function getSpellSaveWorkflowChoiceAutomation(ruleOrSpellId, choiceValue = "") {
  return getSpellSaveWorkflowChoice(ruleOrSpellId, choiceValue)?.automation || null;
}
