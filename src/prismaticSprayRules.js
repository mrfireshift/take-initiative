import {
  advanceRepeatedSaveProgress,
  normalizeRepeatedSaveProgress,
} from "./repeatedSaveProgressCore.js";

export const PRISMATIC_SPRAY_SPELL_ID = "prismatic-spray";
export const PRISMATIC_SPRAY_INDIGO_EFFECT_PREFIX = "prismatic-spray-indigo:";

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

export const PRISMATIC_SPRAY_RAYS = freeze([
  { value: "1", color: "Rosso", damage: { dice: "10d6", type: "fuoco" } },
  { value: "2", color: "Arancione", damage: { dice: "10d6", type: "acido" } },
  { value: "3", color: "Giallo", damage: { dice: "10d6", type: "fulmine" } },
  { value: "4", color: "Verde", damage: { dice: "10d6", type: "veleno" } },
  { value: "5", color: "Blu", damage: { dice: "10d6", type: "freddo" } },
  { value: "6", color: "Indaco", condition: "Trattenuto" },
  { value: "7", color: "Viola", condition: "Accecato" },
]);

const RAY_BY_VALUE = new Map(PRISMATIC_SPRAY_RAYS.map((ray) => [ray.value, ray]));
const DAMAGING_RAY_VALUES = Object.freeze(PRISMATIC_SPRAY_RAYS
  .filter((ray) => ray.damage)
  .map((ray) => ray.value));
const SECONDARY_RAY_OPTIONS = PRISMATIC_SPRAY_RAYS.map((ray) => ({
  value: ray.value,
  label: `${ray.value} · ${ray.color}`,
}));
const PRIMARY_RAY_OPTIONS = [
  ...SECONDARY_RAY_OPTIONS,
  { value: "8", label: "8 · Speciale — due raggi" },
];
const SPECIAL_RESULT = freeze({ field: "ray", equals: "8" });
const damagingResult = (field) => freeze({ field, values: DAMAGING_RAY_VALUES });

export const PRISMATIC_SPRAY_TARGET_CONTEXT = freeze({
  scope: "target",
  fields: [
    {
      id: "ray",
      label: "Risultato d8",
      type: "select",
      required: true,
      options: PRIMARY_RAY_OPTIONS,
      placeholder: "Seleziona 1–8",
    },
    {
      id: "rayA",
      label: "Primo raggio aggiuntivo",
      type: "select",
      requiredWhen: SPECIAL_RESULT,
      options: SECONDARY_RAY_OPTIONS,
      placeholder: "Seleziona 1–7",
    },
    {
      id: "rayB",
      label: "Secondo raggio aggiuntivo",
      type: "select",
      requiredWhen: SPECIAL_RESULT,
      options: SECONDARY_RAY_OPTIONS,
      placeholder: "Seleziona 1–7",
    },
    {
      id: "damage",
      label: "Danno · 10d6",
      type: "number",
      requiredWhen: damagingResult("ray"),
    },
    {
      id: "damageA",
      label: "Danno · 10d6",
      type: "number",
      requiredWhen: freeze({ all: [SPECIAL_RESULT, damagingResult("rayA")] }),
    },
    {
      id: "damageB",
      label: "Danno · 10d6",
      type: "number",
      requiredWhen: freeze({ all: [SPECIAL_RESULT, damagingResult("rayB")] }),
    },
  ],
});

function normalizedOutcome(value) {
  const outcome = String(value || "").trim().toLocaleLowerCase("it");
  return ["passed", "failed", "immune"].includes(outcome) ? outcome : "";
}

function damageTotal(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function progressLabel(progress) {
  return `TS Cos · ${progress.successes}S/${progress.failures}F`;
}

function indigoReminder() {
  return {
    ability: "con",
    timing: "turn-end",
    actor: "target",
    dcSource: "source-spell",
    success: "keep-effect",
    label: "Spruzzo prismatico: ripeti il TS Costituzione.",
  };
}

function indigoCondition(slot) {
  const progress = normalizeRepeatedSaveProgress({}, {
    successThreshold: 3,
    failureThreshold: 3,
  });
  return {
    conditionName: "Trattenuto",
    options: {
      effectId: `${PRISMATIC_SPRAY_INDIGO_EFFECT_PREFIX}${slot}`,
      effectDetail: "TS Costituzione alla fine di ogni proprio turno; 3 successi terminano l'effetto, 3 fallimenti pietrificano.",
      expiry: { mode: "manual" },
      mechanics: {
        prismaticSprayRaySlot: slot,
        prismaticSprayIndigoProgress: progress,
      },
      summaryParts: [{
        id: `prismatic-spray-indigo-progress:${slot}`,
        label: progressLabel(progress),
      }],
      manualRemoval: true,
      saveReminder: indigoReminder(),
    },
  };
}

function violetCondition(slot) {
  return {
    conditionName: "Accecato",
    options: {
      effectId: `prismatic-spray-violet:${slot}`,
      effectDetail: "TS Saggezza all'inizio del turno successivo del caster.",
      expiry: { mode: "manual" },
      mechanics: { prismaticSprayRaySlot: slot },
      summaryParts: [{
        id: `prismatic-spray-violet-save:${slot}`,
        label: "TS Sag · prossimo turno caster",
      }],
      manualRemoval: true,
      saveReminder: {
        ability: "wis",
        timing: "turn-start",
        actor: "source",
        dcSource: "source-spell",
        success: "remove-effect",
        failure: "Trasferimento su un altro piano a scelta del GM.",
        label: "Spruzzo prismatico: TS Saggezza per il raggio viola.",
        resolution: {
          success: "remove-effect",
          failure: {
            mode: "remove-effect",
            actions: [{
              kind: "condition",
              action: "apply",
              targetId: "$target",
              parentEffectId: "$parent",
              name: "Spruzzo prismatico",
              options: {
                sourceId: "$source",
                type: "spell",
                effectId: `prismatic-spray-planar-transfer:${slot}`,
                effectDetail: "Trasferito su un altro piano a scelta del GM; il movimento planare resta manuale al tavolo.",
                expiry: { mode: "manual" },
                manualRemoval: true,
                summaryParts: [{
                  id: `prismatic-spray-planar-transfer:${slot}`,
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

function targetBranches(context = {}) {
  const primary = String(context.ray || "").trim();
  if (primary === "8") {
    return [
      { slot: "ray-a", ray: String(context.rayA || "").trim(), damageField: "damageA" },
      { slot: "ray-b", ray: String(context.rayB || "").trim(), damageField: "damageB" },
    ];
  }
  return [{ slot: "ray", ray: primary, damageField: "damage" }];
}

function targetPlan(targetId, outcome, context = {}) {
  const errors = [];
  const branches = [];
  const damageContributions = [];
  const conditionApplications = [];
  const normalizedSaveOutcome = normalizedOutcome(outcome);
  if (!normalizedSaveOutcome) {
    errors.push({ code: "prismatic-save-outcome-required", targetId });
  }

  const primary = String(context.ray || "").trim();
  if (!RAY_BY_VALUE.has(primary) && primary !== "8") {
    errors.push({ code: "prismatic-ray-invalid", targetId, field: "ray" });
  }

  for (const branch of targetBranches(context)) {
    const ray = RAY_BY_VALUE.get(branch.ray);
    if (!ray) {
      errors.push({
        code: primary === "8" ? "prismatic-secondary-ray-invalid" : "prismatic-ray-invalid",
        targetId,
        field: branch.slot === "ray-a" ? "rayA" : branch.slot === "ray-b" ? "rayB" : "ray",
      });
      continue;
    }
    const plannedBranch = {
      slot: branch.slot,
      ray: ray.value,
      color: ray.color,
    };
    if (ray.damage) {
      const roll = damageTotal(context[branch.damageField]);
      if (roll === null) {
        errors.push({
          code: "prismatic-damage-invalid",
          targetId,
          field: branch.damageField,
        });
      } else {
        const factor = normalizedSaveOutcome === "failed"
          ? 1
          : normalizedSaveOutcome === "passed"
            ? 0.5
            : 0;
        const amount = Math.floor(roll * factor);
        const contribution = {
          targetId,
          slot: branch.slot,
          ray: ray.value,
          color: ray.color,
          dice: ray.damage.dice,
          type: ray.damage.type,
          roll,
          factor,
          amount,
        };
        damageContributions.push(contribution);
        plannedBranch.damage = contribution;
      }
    } else if (normalizedSaveOutcome === "failed") {
      const condition = ray.value === "6"
        ? indigoCondition(branch.slot)
        : violetCondition(branch.slot);
      conditionApplications.push({
        targetIds: [targetId],
        ...condition,
      });
      plannedBranch.condition = condition.conditionName;
    }
    branches.push(plannedBranch);
  }

  return {
    targetId,
    outcome: normalizedSaveOutcome,
    special: primary === "8",
    branches,
    damageContributions,
    conditionApplications,
    errors,
  };
}

export function prismaticSprayResolutionPlan({
  targetIds = [],
  outcomes = {},
  targetContexts = {},
} = {}) {
  const outcomeFor = (targetId) => outcomes instanceof Map
    ? outcomes.get(targetId)
    : outcomes?.[targetId];
  const targets = [...new Set((Array.isArray(targetIds) ? targetIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
  const targetPlans = targets.map((targetId) => targetPlan(
    targetId,
    outcomeFor(targetId),
    targetContexts?.[targetId] || {},
  ));
  const errors = targetPlans.flatMap((plan) => plan.errors);
  return freeze({
    spellId: PRISMATIC_SPRAY_SPELL_ID,
    valid: errors.length === 0,
    errors,
    targetPlans,
    damageContributions: targetPlans.flatMap((plan) => plan.damageContributions),
    conditionApplications: targetPlans.flatMap((plan) => plan.conditionApplications),
  });
}

function indigoProgress(instance) {
  return normalizeRepeatedSaveProgress(
    instance?.mechanics?.prismaticSprayIndigoProgress || {},
    { successThreshold: 3, failureThreshold: 3 },
  );
}

function indigoProgressAction(instance, progress) {
  const slot = String(instance?.mechanics?.prismaticSprayRaySlot || "ray").trim() || "ray";
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
      effectId: `${PRISMATIC_SPRAY_INDIGO_EFFECT_PREFIX}${slot}`,
      effectDetail: "TS Costituzione alla fine di ogni proprio turno; 3 successi terminano l'effetto, 3 fallimenti pietrificano.",
      expiry: { mode: "manual" },
      mechanics: {
        prismaticSprayRaySlot: slot,
        prismaticSprayIndigoProgress: progress,
      },
      summaryParts: [{
        id: `prismatic-spray-indigo-progress:${slot}`,
        label: progressLabel(progress),
      }],
      manualRemoval: true,
      saveReminder: indigoReminder(),
    },
  };
}

function petrifiedAction(instance) {
  const slot = String(instance?.mechanics?.prismaticSprayRaySlot || "ray").trim() || "ray";
  return {
    kind: "condition",
    action: "apply",
    targetId: "$target",
    parentEffectId: "$parent",
    name: "Pietrificato",
    options: {
      sourceId: String(instance?.sourceId || "").trim(),
      sourceName: String(instance?.sourceName || "").trim(),
      type: "spell",
      effectId: `prismatic-spray-petrified:${slot}`,
      effectDetail: "Pietrificato permanentemente da Spruzzo prismatico.",
      expiry: { mode: "manual" },
      manualRemoval: true,
    },
  };
}

export function prismaticSprayIndigoReminderForInstance({
  instance = null,
  reminder = null,
} = {}) {
  if (
    !String(instance?.effectId || "").startsWith(PRISMATIC_SPRAY_INDIGO_EFFECT_PREFIX)
    || !reminder
  ) return reminder;

  const current = indigoProgress(instance);
  const successAdvance = advanceRepeatedSaveProgress(current, "success");
  const failureAdvance = advanceRepeatedSaveProgress(current, "failure");
  return freeze({
    ...reminder,
    success: "keep-effect",
    label: `Spruzzo prismatico · ${progressLabel(current)}.`,
    resolution: {
      success: successAdvance.terminal === "success"
        ? "remove-effect"
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
