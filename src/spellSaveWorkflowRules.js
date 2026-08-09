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

const workflowRule = ({
  spellId,
  ability,
  baseMaximum,
  additionalPerSlotAbove,
  baseSlot,
  choice = null,
  spatial = null,
  context = null,
}) => Object.freeze({
  spellId,
  timing: "cast",
  ability,
  targeting: Object.freeze({
    mode: "selected",
    baseMaximum,
    additionalPerSlotAbove,
    baseSlot,
    consent: "all-save",
    ...(spatial && typeof spatial === "object"
      ? { spatial: freezeValue(spatial) }
      : {}),
    ...(context && typeof context === "object"
      ? { context: freezeValue(context) }
      : {}),
  }),
  choice,
});

export const SPELL_SAVE_WORKFLOW_RULES = Object.freeze({
  "bane": workflowRule({
    spellId: "bane",
    ability: "cha",
    baseMaximum: 3,
    additionalPerSlotAbove: 1,
    baseSlot: 1,
  }),
  "legacy-tashas-mind-whip": workflowRule({
    spellId: "legacy-tashas-mind-whip",
    ability: "int",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 2,
  }),
  "command": workflowRule({
    spellId: "command",
    ability: "wis",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
    baseSlot: 1,
    choice: commandChoice,
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
  "banishment": workflowRule({
    spellId: "banishment",
    ability: "cha",
    baseMaximum: 1,
    additionalPerSlotAbove: 1,
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
