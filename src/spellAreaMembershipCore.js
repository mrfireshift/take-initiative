import { areaContainsBounds, areaHitsBounds } from "./aoeGeometryCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

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

export function areaMembershipEffects(rule) {
  if (Array.isArray(rule?.zonePolicy?.membershipEffects)) {
    return rule.zonePolicy.membershipEffects;
  }
  if (Array.isArray(rule?.effectPolicy?.effects)) {
    return rule.effectPolicy.effects;
  }
  const auraEffect = rule?.effectPolicy?.mode === "while-inside"
    ? rule.effectPolicy.effect
    : null;
  return auraEffect ? [auraEffect] : [];
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
  rule = null,
  desiredTargetIds = [],
  items = [],
  metaKey = "",
  sourceName = "",
  defaultExpiry = { mode: "manual" },
  effectType = "spell",
  manualRemoval = false,
} = {}) {
  const parentEffectId = String(instanceId || "").trim();
  const effects = areaMembershipEffects(rule);
  if (!parentEffectId || !effects.length) {
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
          ...(effect.mechanics && typeof effect.mechanics === "object"
            ? { mechanics: effect.mechanics }
            : {}),
          expiry: effect.expiry && typeof effect.expiry === "object"
            ? { ...effect.expiry }
            : { ...(defaultExpiry || { mode: "manual" }) },
        },
      });
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
