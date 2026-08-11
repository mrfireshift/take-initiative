import { ID } from "./constants.js";
import { buildArea } from "./aoeGeometryCore.js";
import { AOE_AREA_META_KEY } from "./aoeStyle.js";
import { clipChildZoneAreaToParent } from "./spellChildZoneCore.js";

export const SPELL_STATIC_ZONE_META_KEY = `${ID}/spellStaticZone`;
export const SPELL_ZONE_MOVEMENT_CONTROL_FIELD = "movementControl";

const normalizedId = (value) => String(value || "").trim();
const normalizedIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map(normalizedId)
    .filter(Boolean),
));

const point = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

export function translatedZoneArea(item, positionOverride = null) {
  const metadata = item?.metadata?.[AOE_AREA_META_KEY];
  if (!metadata?.type || !metadata?.start || !metadata?.end) return null;
  const position = point(positionOverride || item.position) || { x: 0, y: 0 };
  const base = point(metadata.basePosition) || { x: 0, y: 0 };
  const delta = { x: position.x - base.x, y: position.y - base.y };
  const translate = (entry) => ({
    x: Number(entry.x) + delta.x,
    y: Number(entry.y) + delta.y,
  });
  let area = buildArea(
    metadata.type,
    translate(metadata.start),
    translate(metadata.end),
    metadata.dpi,
    translate(metadata.gridOrigin || metadata.start),
    { widthSquares: metadata.widthSquares },
  );
  if (metadata.parentClip && typeof metadata.parentClip === "object") {
    area = clipChildZoneAreaToParent({
      parentArea: metadata.parentClip,
      childArea: area,
    });
  }
  if (metadata.centerlineStart && metadata.centerlineEnd) {
    area.centerlineStart = point(metadata.centerlineStart);
    area.centerlineEnd = point(metadata.centerlineEnd);
  }
  return area;
}

export function staticSpellZoneMetadata({
  instanceId = "",
  ruleId = "",
  spellId = "",
  casterId = "",
  role = "root",
  parentId = "",
  ruleChoice = "",
  targetIds = [],
} = {}) {
  const metadata = {
    version: 1,
    instanceId: normalizedId(instanceId),
    ruleId: normalizedId(ruleId),
    spellId: normalizedId(spellId),
    casterId: normalizedId(casterId),
    role: ["geometry", "subzone"].includes(role) ? role : "root",
  };
  const normalizedParentId = normalizedId(parentId);
  if (normalizedParentId) metadata.parentId = normalizedParentId;
  const normalizedRuleChoice = normalizedId(ruleChoice);
  if (normalizedRuleChoice) metadata.ruleChoice = normalizedRuleChoice;
  const scopedTargetIds = normalizedIds(targetIds);
  if (scopedTargetIds.length) metadata.targetIds = scopedTargetIds;
  return metadata;
}

export function scopedStaticSpellZoneTargetIds({
  rule = null,
  zoneMetadata = null,
  targetIds = [],
} = {}) {
  const candidates = normalizedIds(targetIds);
  if (rule?.zonePolicy?.targetScope !== "spell-targets") return candidates;
  const spellTargets = new Set(normalizedIds(zoneMetadata?.targetIds));
  return candidates.filter((targetId) => spellTargets.has(targetId));
}

export function isStaticSpellZoneRule(rule) {
  return rule?.kind === "zone"
    && rule?.lifecycle?.persistence === "spell"
    && rule?.lifecycle?.endsWithSpell === true;
}

export function staticSpellZoneOwnerOperation({
  rule = null,
  spell = null,
  instanceId = "",
  casterId = "",
  appliedAt = null,
  trackConcentration = false,
  ruleChoice = "",
  slotLevel = null,
} = {}) {
  const normalizedInstanceId = normalizedId(instanceId);
  const normalizedCasterId = normalizedId(casterId);
  const concentration = spell?.concentration === true;
  if (
    !isStaticSpellZoneRule(rule)
    || (concentration && trackConcentration !== true)
    || !normalizedInstanceId
    || !normalizedCasterId
  ) {
    return null;
  }
  const name = String(spell?.displayName || spell?.name || "").trim();
  const spellId = normalizedId(spell?.id || rule.spellId);
  if (!name || !spellId) return null;
  const defaultTurns = Math.floor(Number(spell?.defaultTurns));
  const hasFiniteDuration = Number.isFinite(defaultTurns) && defaultTurns > 0;
  return {
    type: "spell:upsert",
    targetIds: [normalizedCasterId],
    name,
    turns: hasFiniteDuration ? defaultTurns : 1,
    conc: concentration,
    source: normalizedCasterId,
    instanceId: normalizedInstanceId,
    spellId,
    ...(concentration
      ? { expiry: { mode: "concentration" } }
      : spell?.expiry && typeof spell.expiry === "object"
        ? { expiry: { ...spell.expiry } }
        : hasFiniteDuration
          ? {}
          : { expiry: { mode: "manual" } }),
    ...(appliedAt ? { appliedAt: { ...appliedAt } } : {}),
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: rule.id,
      ...(slotLevel !== null && slotLevel !== "" && Number.isInteger(Number(slotLevel))
        ? { slotLevel: Number(slotLevel) }
        : {}),
      ...(normalizedId(ruleChoice)
        ? { choice: normalizedId(ruleChoice) }
        : {}),
    },
    replaceNames: [name],
  };
}

export function staticSpellZoneItems(items = [], {
  instanceId = "",
  casterId = "",
} = {}) {
  const wantedInstanceId = normalizedId(instanceId);
  const wantedCasterId = normalizedId(casterId);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    if (!metadata?.instanceId) return false;
    if (wantedInstanceId && normalizedId(metadata.instanceId) !== wantedInstanceId) return false;
    if (wantedCasterId && normalizedId(metadata.casterId) !== wantedCasterId) return false;
    return true;
  });
}

export function staticSpellZoneItemsEndedByPlan(zoneItems = [], plan = null) {
  const beforeActive = new Set();
  const afterActive = new Set();
  for (const change of Array.isArray(plan?.changes) ? plan.changes : []) {
    for (const spell of Array.isArray(change?.before?.spells)
      ? change.before.spells
      : []) {
      const instanceId = normalizedId(spell?.instanceId);
      if (instanceId) beforeActive.add(instanceId);
    }
    for (const concentration of Object.values(
      change?.before?.concentrations || {}
    )) {
      const instanceId = normalizedId(concentration?.instanceId);
      if (instanceId) beforeActive.add(instanceId);
    }
    for (const spell of Array.isArray(change?.after?.spells)
      ? change.after.spells
      : []) {
      const instanceId = normalizedId(spell?.instanceId);
      if (instanceId) afterActive.add(instanceId);
    }
    for (const concentration of Object.values(
      change?.after?.concentrations || {}
    )) {
      const instanceId = normalizedId(concentration?.instanceId);
      if (instanceId) afterActive.add(instanceId);
    }
  }
  return staticSpellZoneItems(zoneItems).filter((item) => {
    const instanceId = normalizedId(
      item.metadata[SPELL_STATIC_ZONE_META_KEY]?.instanceId
    );
    return beforeActive.has(instanceId) && !afterActive.has(instanceId);
  });
}

export function activeSpellInstanceIds(items = [], {
  metaKey = `${ID}/meta`,
  spellsKey = `${ID}/spells`,
  concentrationKey = `${ID}/concentration`,
} = {}) {
  const active = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const meta = item?.metadata?.[metaKey] || {};
    for (const spell of Array.isArray(meta?.[spellsKey]) ? meta[spellsKey] : []) {
      const instanceId = normalizedId(spell?.instanceId);
      if (instanceId) active.add(instanceId);
    }
    const concentration = meta?.[concentrationKey];
    if (!concentration || typeof concentration !== "object") continue;
    for (const entry of Object.values(concentration)) {
      const instanceId = normalizedId(entry?.instanceId);
      if (instanceId) active.add(instanceId);
    }
  }
  return active;
}

export function staleStaticSpellZoneItemIds(items = [], options = {}) {
  const active = activeSpellInstanceIds(items, options);
  return staticSpellZoneItems(items)
    .filter((item) => !active.has(normalizedId(
      item.metadata[SPELL_STATIC_ZONE_META_KEY].instanceId
    )))
    .map((item) => item.id)
    .filter(Boolean);
}
