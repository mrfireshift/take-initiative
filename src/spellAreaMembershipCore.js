import { areaContainsBounds, areaHitsBounds } from "./aoeGeometryCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

function effectMechanicsWithMovementContext(
  effect,
  { sourceId = "", instanceId = "", zoneId = "" } = {},
) {
  const mechanics = effect?.mechanics;
  if (!mechanics || typeof mechanics !== "object") return null;
  const movement = mechanics.movement;
  if (!movement || typeof movement !== "object") return { ...mechanics };
  const directionalKey = ["directional", "directionalCosts", "directionalCost"]
    .find((key) => movement[key] !== undefined);
  if (!directionalKey) return { ...mechanics, movement: { ...movement } };
  const rawEntries = Array.isArray(movement[directionalKey])
    ? movement[directionalKey]
    : [movement[directionalKey]];
  const directional = rawEntries.map((entry) => (
    entry && typeof entry === "object"
      ? {
        ...entry,
        ...(entry.sourceId || !sourceId ? {} : { sourceId: String(sourceId) }),
        ...(entry.instanceId || !instanceId
          ? {}
          : { instanceId: String(instanceId) }),
        ...(entry.zoneId || !zoneId ? {} : { zoneId: String(zoneId) }),
      }
      : entry
  ));
  return {
    ...mechanics,
    movement: {
      ...movement,
      [directionalKey]: directional,
    },
  };
}

function sameEffectMechanics(left, right) {
  if (!right || typeof right !== "object") return true;
  try {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
  } catch {
    return false;
  }
}

function conditionInstances(item, metaKey) {
  const conditions = item?.metadata?.[metaKey]?.conditions;
  if (Array.isArray(conditions)) return conditions;
  return Array.isArray(conditions?.instances) ? conditions.instances : [];
}

function effectThemeMatches(currentTheme, expectedTheme) {
  if (!expectedTheme || typeof expectedTheme !== "object") return true;
  if (!currentTheme || typeof currentTheme !== "object") return false;
  return Object.entries(expectedTheme).every(([key, value]) =>
    String(currentTheme[key] ?? "") === String(value ?? "")
  );
}

function attitudeGroup(item, metaKey) {
  const attitude = String(
    item?.metadata?.[metaKey]?.attitude || "neutral"
  ).toLocaleLowerCase("it");
  if (attitude === "enemy") return "enemy";
  if (attitude === "pc" || attitude === "ally") return "friendly";
  return "neutral";
}

function areaWithCellPadding(area, paddingSquares) {
  const padding = Math.max(0, Math.floor(Number(paddingSquares) || 0));
  if (!padding || !Array.isArray(area?.cells) || !area.cells.length) {
    return area;
  }
  const cellsByKey = new Map();
  for (const cell of area.cells) {
    const x = Number(cell?.x);
    const y = Number(cell?.y);
    const width = Number(cell?.width);
    const height = Number(cell?.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      continue;
    }
    for (let columnOffset = -padding; columnOffset <= padding; columnOffset += 1) {
      for (let rowOffset = -padding; rowOffset <= padding; rowOffset += 1) {
        const paddedCell = {
          ...cell,
          x: x + columnOffset * width,
          y: y + rowOffset * height,
          ...(Number.isFinite(Number(cell.column))
            ? { column: Number(cell.column) + columnOffset }
            : {}),
          ...(Number.isFinite(Number(cell.row))
            ? { row: Number(cell.row) + rowOffset }
            : {}),
        };
        const key = [
          paddedCell.x,
          paddedCell.y,
          width,
          height,
        ].join(":");
        cellsByKey.set(key, paddedCell);
      }
    }
  }
  return cellsByKey.size
    ? { ...area, cells: [...cellsByKey.values()] }
    : area;
}

export function areaMembershipEffects(rule, ruleChoice = "") {
  const zonePolicy = rule?.zonePolicy;
  const normalizedChoice = String(ruleChoice || "").trim();
  const choiceEffects = zonePolicy?.membershipEffectsByChoice;
  if (
    normalizedChoice
    && choiceEffects
    && typeof choiceEffects === "object"
    && !Array.isArray(choiceEffects)
    && Object.prototype.hasOwnProperty.call(choiceEffects, normalizedChoice)
  ) {
    return Array.isArray(choiceEffects[normalizedChoice])
      ? choiceEffects[normalizedChoice]
      : [];
  }
  if (Array.isArray(zonePolicy?.membershipEffects)) {
    return zonePolicy.membershipEffects;
  }
  if (Array.isArray(rule?.effectPolicy?.effects)) {
    return rule.effectPolicy.effects;
  }
  const auraEffect = rule?.effectPolicy?.mode === "while-inside"
    ? rule.effectPolicy.effect
    : null;
  return auraEffect ? [auraEffect] : [];
}

export function areaMembershipEffectIds(rule) {
  const zonePolicy = rule?.zonePolicy;
  const variants = zonePolicy?.membershipEffectsByChoice;
  const effects = [
    ...(Array.isArray(zonePolicy?.membershipEffects)
      ? zonePolicy.membershipEffects
      : []),
    ...(
      variants && typeof variants === "object" && !Array.isArray(variants)
        ? Object.values(variants).flatMap((entries) => Array.isArray(entries) ? entries : [])
        : []
    ),
    ...areaMembershipEffects(rule),
  ];
  return uniqueIds(effects.map((effect) => effect?.id));
}

export function areaMembershipTargetIds({
  sourceId = "",
  rule = null,
  area = null,
  candidates = [],
  metaKey = "",
  membershipPaddingSquares = undefined,
} = {}) {
  if (!rule || !area) return [];
  const normalizedSourceId = String(sourceId || "").trim();
  const source = candidates.find(
    (entry) => String(entry?.item?.id || "").trim() === normalizedSourceId
  )?.item;
  const sourceGroup = attitudeGroup(source, metaKey);
  const targeting = rule.zonePolicy?.membershipTargeting || rule.targeting || {};
  const paddingSquares = membershipPaddingSquares === undefined
    ? rule.zonePolicy?.membershipPaddingSquares
    : membershipPaddingSquares;
  const membershipArea = areaWithCellPadding(area, paddingSquares);
  return uniqueIds(candidates
    .filter(({ item, bounds }) => {
      const targetId = String(item?.id || "").trim();
      if (!targetId || !bounds) return false;
      if (!targeting.includeCaster && targetId === normalizedSourceId) {
        return false;
      }
      const filter = targeting.filter || "all";
      const targetGroup = attitudeGroup(item, metaKey);
      if (filter === "hostile" && targetGroup === sourceGroup) return false;
      if (filter === "friendly" && targetGroup !== sourceGroup) return false;
      return targeting.containment === "fully-inside"
        ? areaContainsBounds(membershipArea, bounds)
        : areaHitsBounds(membershipArea, bounds);
    })
    .map(({ item }) => item.id));
}

export function areaMembershipPlan({
  instanceId = "",
  sourceId = "",
  zoneId = "",
  rule = null,
  ruleChoice = "",
  desiredTargetIds = [],
  items = [],
  metaKey = "",
  sourceName = "",
  defaultExpiry = { mode: "manual" },
  effectType = "spell",
  manualRemoval = false,
  removeLinkedTriggerConditions = false,
} = {}) {
  const parentEffectId = String(instanceId || "").trim();
  const effects = areaMembershipEffects(rule, ruleChoice);
  const trackedEffectIds = new Set(areaMembershipEffectIds(rule));
  const expectedEffectIds = new Set(
    effects.map((effect) => String(effect?.id || "").trim()).filter(Boolean),
  );
  const linkedConditionTriggers = removeLinkedTriggerConditions === true
    ? (Array.isArray(rule?.zonePolicy?.triggers) ? rule.zonePolicy.triggers : [])
      .filter((trigger) => trigger?.removeLinkedConditionOnLeave === true)
    : [];
  if (!parentEffectId || (
    !effects.length
    && !linkedConditionTriggers.length
    && !trackedEffectIds.size
  )) {
    return { entering: [], leaving: [], operations: [] };
  }

  const desired = new Set(uniqueIds(desiredTargetIds));
  const currentMembers = new Set();
  const removals = [];
  const additions = [];
  const skipClassFeatureReconcile = effectType === "class-feature-area";

  for (const effect of effects) {
    const effectId = String(effect?.id || "").trim();
    if (!effectId) continue;
    const expectedMechanics = effectMechanicsWithMovementContext(effect, {
      sourceId,
      instanceId: parentEffectId,
      zoneId,
    });
    const expectedConditionName = String(
      effect?.condition || effect?.label || ""
    ).trim();
    const expectedEffectKind = effect?.condition
      ? ""
      : String(effect?.kind || "").trim();
    const currentForEffect = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      for (const instance of conditionInstances(item, metaKey)) {
        if (
          instance?.active === false
          || String(instance?.parentEffectId || "") !== parentEffectId
          || String(instance?.effectId || "") !== effectId
        ) {
          continue;
        }
        const targetId = String(item?.id || "").trim();
        const conditionId = String(instance?.id || "").trim();
        if (!targetId || !conditionId) continue;
        currentMembers.add(targetId);
        const currentConditionName = String(
          instance?.condition || instance?.name || ""
        ).trim();
        const currentEffectKind = String(instance?.effectKind || "").trim();
        if (
          currentConditionName !== expectedConditionName
          || currentEffectKind !== expectedEffectKind
          || !effectThemeMatches(instance?.theme, effect?.theme)
          || !sameEffectMechanics(instance?.mechanics, expectedMechanics)
        ) {
          removals.push({
            itemId: targetId,
            instanceId: conditionId,
            ...(skipClassFeatureReconcile
              ? { skipClassFeatureReconcile: true }
              : {}),
          });
          continue;
        }
        if (currentForEffect.has(targetId)) {
          removals.push({
            itemId: targetId,
            instanceId: conditionId,
            ...(skipClassFeatureReconcile
              ? { skipClassFeatureReconcile: true }
              : {}),
          });
        } else {
          currentForEffect.set(targetId, conditionId);
        }
      }
    }

    for (const [targetId, conditionId] of currentForEffect) {
      if (!desired.has(targetId)) {
        removals.push({
          itemId: targetId,
          instanceId: conditionId,
          ...(skipClassFeatureReconcile
            ? { skipClassFeatureReconcile: true }
            : {}),
        });
      }
    }
    const enteringForEffect = [...desired].filter(
      (targetId) => !currentForEffect.has(targetId)
    );
    if (enteringForEffect.length) {
      if (!expectedConditionName) continue;
      additions.push({
        type: "condition:add",
        targetIds: enteringForEffect,
        conditionName: expectedConditionName,
        options: {
          sourceId: String(sourceId || "").trim(),
          sourceName: String(sourceName || "").trim(),
          parentEffectId,
          type: effectType,
          effectId,
          ...(!effect?.condition && effect?.kind
            ? { effectKind: effect.kind }
            : {}),
          effectDetail: String(effect.detail || ""),
          ...(manualRemoval ? { manualRemoval: true } : {}),
          ...(effect?.theme && typeof effect.theme === "object"
            ? { theme: { ...effect.theme } }
            : {}),
          ...(expectedMechanics ? { mechanics: expectedMechanics } : {}),
          expiry: effect.expiry && typeof effect.expiry === "object"
            ? { ...effect.expiry }
            : { ...(defaultExpiry || { mode: "manual" }) },
        },
      });
    }
  }

  if (trackedEffectIds.size) {
    for (const item of Array.isArray(items) ? items : []) {
      const targetId = String(item?.id || "").trim();
      if (!targetId) continue;
      for (const instance of conditionInstances(item, metaKey)) {
        const instanceId = String(instance?.id || "").trim();
        const effectId = String(instance?.effectId || "").trim();
        if (
          instance?.active === false
          || !instanceId
          || String(instance?.parentEffectId || "") !== parentEffectId
          || !trackedEffectIds.has(effectId)
          || expectedEffectIds.has(effectId)
        ) continue;
        currentMembers.add(targetId);
        removals.push({
          itemId: targetId,
          instanceId,
          ...(skipClassFeatureReconcile
            ? { skipClassFeatureReconcile: true }
            : {}),
        });
      }
    }
  }

  const linkedRemovalKeys = new Set(
    removals.map((removal) => `${removal.itemId}:${removal.instanceId}`),
  );
  for (const trigger of linkedConditionTriggers) {
    const triggerId = String(trigger?.id || "").trim();
    const failureCondition = trigger?.failureCondition
      || trigger?.resolutionData?.failureCondition;
    const conditionName = String(
      failureCondition?.condition || failureCondition?.name || "",
    ).trim().toLocaleLowerCase("it");
    if (!triggerId || !conditionName) continue;
    for (const item of Array.isArray(items) ? items : []) {
      const targetId = String(item?.id || "").trim();
      if (!targetId || desired.has(targetId)) continue;
      for (const instance of conditionInstances(item, metaKey)) {
        const instanceId = String(instance?.id || "").trim();
        const currentConditionName = String(
          instance?.condition || instance?.name || "",
        ).trim().toLocaleLowerCase("it");
        if (
          instance?.active === false
          || !instanceId
          || String(instance?.parentEffectId || "") !== parentEffectId
          || String(instance?.effectId || "") !== triggerId
          || currentConditionName !== conditionName
        ) continue;
        const key = `${targetId}:${instanceId}`;
        if (linkedRemovalKeys.has(key)) continue;
        linkedRemovalKeys.add(key);
        removals.push({ itemId: targetId, instanceId });
      }
    }
  }

  const operations = [];
  if (removals.length) {
    operations.push({
      type: "condition:remove-instances",
      removals,
    });
  }
  operations.push(...additions);
  return {
    entering: [...desired].filter((targetId) => !currentMembers.has(targetId)),
    leaving: [...currentMembers].filter((targetId) => !desired.has(targetId)),
    operations,
  };
}

export function staleAreaMembershipEffectRemovals(items = [], {
  activeInstanceIds = [],
  effectIds = [],
  metaKey = "",
} = {}) {
  const active = new Set(uniqueIds(activeInstanceIds));
  const effects = new Set(uniqueIds(effectIds));
  const removals = [];
  for (const item of Array.isArray(items) ? items : []) {
    for (const instance of conditionInstances(item, metaKey)) {
      if (
        instance?.active !== false
        && effects.has(String(instance?.effectId || ""))
        && !active.has(String(instance?.parentEffectId || ""))
      ) {
        const instanceId = String(instance?.id || "").trim();
        if (item?.id && instanceId) removals.push({ itemId: item.id, instanceId });
      }
    }
  }
  return removals;
}
