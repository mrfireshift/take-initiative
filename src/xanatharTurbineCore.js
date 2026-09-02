import { gridFootprintSize } from "./distance3dCore.js";

export const XANATHAR_TURBINE_SPELL_ID = "xanathar-turbine";
export const XANATHAR_TURBINE_RESTRAINED_EFFECT_ID = "xanathar-turbine-restrained";
export const XANATHAR_TURBINE_FALL_REMINDER_EFFECT_ID = "xanathar-turbine-fall-reminder";
export const XANATHAR_TURBINE_MAX_ELEVATION_METERS = 9;
export const XANATHAR_TURBINE_TURN_RAISE_METERS = 1.5;

const SAVE_OUTCOMES = new Set(["passed", "failed"]);

function text(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeTurbineSaveOutcome(value) {
  const normalized = text(value);
  if (["passed", "pass", "success", "superato", "riuscito"].includes(normalized)) {
    return "passed";
  }
  if (["failed", "fail", "failure", "fallito", "fallita"].includes(normalized)) {
    return "failed";
  }
  return "";
}

export function normalizeTurbineSize(value) {
  const normalized = text(value);
  if ([
    "large-or-smaller",
    "large",
    "medium",
    "small",
    "tiny",
    "grande o inferiore",
    "grande",
  ].includes(normalized)) return "large-or-smaller";
  if ([
    "huge-or-gargantuan",
    "huge",
    "gargantuan",
    "enorme/gargantua",
    "enorme",
    "gargantua",
  ].includes(normalized)) return "huge-or-gargantuan";
  return "";
}

export function turbineSizeAllowsCapture(value) {
  return normalizeTurbineSize(value) === "large-or-smaller";
}

export function turbineSizeFromToken({ item = null, dpi = 150 } = {}) {
  if (!item || typeof item !== "object") return "";
  const sourceWidth = Number(item?.image?.width ?? item?.width);
  const sourceHeight = Number(item?.image?.height ?? item?.height);
  const hasDimensions = Number.isFinite(sourceWidth) && sourceWidth > 0
    && Number.isFinite(sourceHeight) && sourceHeight > 0;
  if (!hasDimensions && item?.layer !== "CHARACTER") return "";
  const safeDpi = Math.max(1, Number.isFinite(Number(dpi)) ? Number(dpi) : 150);
  const footprint = gridFootprintSize(item, safeDpi);
  const widthCells = Math.max(1, Math.round(Number(footprint.width) / safeDpi));
  const heightCells = Math.max(1, Math.round(Number(footprint.height) / safeDpi));
  return widthCells >= 3 && heightCells >= 3
    ? "huge-or-gargantuan"
    : "large-or-smaller";
}

export function resolveTurbineSaveChain({
  dexOutcome = "",
  size = "",
  strengthOutcome = "",
} = {}) {
  const dex = normalizeTurbineSaveOutcome(dexOutcome);
  if (!SAVE_OUTCOMES.has(dex)) {
    return {
      valid: false,
      status: "invalid",
      errors: ["dex-outcome-required"],
      dexOutcome: dex,
      damageFactor: null,
      capture: false,
    };
  }
  if (dex === "passed") {
    return {
      valid: true,
      status: "stopped-on-dex-save",
      dexOutcome: dex,
      damageFactor: "half",
      capture: false,
      strengthOutcome: "",
      size: "",
    };
  }

  const normalizedSize = normalizeTurbineSize(size);
  if (!normalizedSize) {
    return {
      valid: false,
      status: "needs-size",
      errors: ["size-required-after-dex-failure"],
      dexOutcome: dex,
      damageFactor: "full",
      capture: false,
    };
  }
  if (normalizedSize === "huge-or-gargantuan") {
    return {
      valid: true,
      status: "stopped-on-size",
      dexOutcome: dex,
      damageFactor: "full",
      capture: false,
      size: normalizedSize,
      strengthOutcome: "",
    };
  }

  const strength = normalizeTurbineSaveOutcome(strengthOutcome);
  if (!SAVE_OUTCOMES.has(strength)) {
    return {
      valid: false,
      status: "needs-strength-save",
      errors: ["strength-outcome-required-after-dex-failure"],
      dexOutcome: dex,
      damageFactor: "full",
      capture: false,
      size: normalizedSize,
    };
  }
  return {
    valid: true,
    status: strength === "failed" ? "captured" : "stopped-on-strength-save",
    dexOutcome: dex,
    damageFactor: "full",
    capture: strength === "failed",
    size: normalizedSize,
    strengthOutcome: strength,
  };
}

export function resolveTurbineTargetChains({
  targetIds = [],
  outcomes = {},
  targetContexts = {},
  targetItems = [],
  gridDpi = 150,
} = {}) {
  const ids = Array.from(new Set(
    (Array.isArray(targetIds) ? targetIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  ));
  const captureTargetIds = [];
  const chains = {};
  const errors = [];
  const itemsById = new Map(
    (Array.isArray(targetItems) ? targetItems : [])
      .map((item) => [String(item?.id || item?.key || "").trim(), item])
      .filter(([id]) => id),
  );
  for (const targetId of ids) {
    const dexOutcome = typeof outcomes?.get === "function"
      ? outcomes.get(targetId)
      : outcomes?.[targetId];
    const context = targetContexts?.[targetId]
      && typeof targetContexts[targetId] === "object"
      ? targetContexts[targetId]
      : {};
    const inferredSize = turbineSizeFromToken({
      item: itemsById.get(targetId),
      dpi: gridDpi,
    });
    const chain = resolveTurbineSaveChain({
      dexOutcome,
      size: inferredSize || context.turbineSize,
      strengthOutcome: context.turbineStrengthOutcome,
    });
    chains[targetId] = chain;
    if (!chain.valid) {
      errors.push({
        targetId,
        code: chain.errors?.[0] || "turbine-chain-incomplete",
        message: chain.status === "needs-strength-save"
          ? "Dopo il TS Destrezza fallito indica il risultato del TS Forza."
          : "La footprint del bersaglio non è disponibile.",
      });
    } else if (chain.capture) {
      captureTargetIds.push(targetId);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    targetIds: ids,
    captureTargetIds,
    chains,
  };
}

export function turbineRestrainedConditionOptions({
  parentEffectId = "",
  sourceId = "",
  sourceName = "",
  spellName = "Turbine",
  spellId = XANATHAR_TURBINE_SPELL_ID,
  appliedAt = null,
} = {}) {
  const parent = String(parentEffectId || "").trim();
  return {
    ...(sourceId ? { sourceId: String(sourceId).trim() } : {}),
    ...(sourceName ? { sourceName: String(sourceName).trim() } : {}),
    ...(parent ? { parentEffectId: parent } : {}),
    type: "spell",
    effectId: XANATHAR_TURBINE_RESTRAINED_EFFECT_ID,
    spellName: String(spellName || "Turbine").trim(),
    spellId: String(spellId || XANATHAR_TURBINE_SPELL_ID).trim(),
    effectDetail: "Trattenuto nel Turbine. Si muove con il Turbine; all'inizio del proprio turno sale di 1,5 m fino a 9 m. Può usare un'azione per effettuare una prova di Forza o Destrezza contro la CD del tiro salvezza dell'incantesimo.",
    summaryParts: [
      { id: "xanathar-turbine-carry", label: "Segue il Turbine" },
      { id: "xanathar-turbine-rise", label: "Sale di 1,5 m/turno · max 9 m" },
      { id: "xanathar-turbine-escape", label: "Azione: prova di fuga" },
    ],
    saveReminder: {
      timing: "turn-start",
      actor: "target",
      mode: "choice",
      label: "Azione: prova di Forza o Destrezza contro la CD del Turbine. Se supera, viene scagliata e non è più Trattenuta.",
      resolution: {
        mode: "choice",
        choiceLabels: {
          passed: "Superato",
          failed: "Fallito",
        },
        outcomes: {
          passed: {
            actions: [{
              kind: "condition",
              action: "remove-instance",
              instanceId: "$reminder",
            }],
          },
          failed: { actions: [] },
        },
      },
    },
    expiry: { mode: "concentration" },
    manualRemoval: true,
    ...(appliedAt ? { appliedAt } : {}),
  };
}

export function turbineRestrainedOperations({
  targetIds = [],
  parentEffectId = "",
  sourceId = "",
  sourceName = "",
  spellName = "Turbine",
  spellId = XANATHAR_TURBINE_SPELL_ID,
  appliedAt = null,
} = {}) {
  const ids = Array.from(new Set(
    (Array.isArray(targetIds) ? targetIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  ));
  if (!ids.length || !String(parentEffectId || "").trim()) return [];
  return [
    ...ids.map((targetId) => {
      const options = turbineRestrainedConditionOptions({
        parentEffectId,
        sourceId,
        sourceName,
        spellName,
        spellId,
        appliedAt,
      });
      return {
        type: "condition:add",
        targetIds: [targetId],
        conditionName: "Trattenuto",
        options,
      };
    }),
    {
      type: "condition:automate",
      subjectIds: ids,
    },
  ];
}
