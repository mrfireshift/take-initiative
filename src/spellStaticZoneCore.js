import { ID } from "./constants.js";

export const SPELL_STATIC_ZONE_META_KEY = `${ID}/spellStaticZone`;

const normalizedId = (value) => String(value || "").trim();

export function staticSpellZoneMetadata({
  instanceId = "",
  ruleId = "",
  spellId = "",
  casterId = "",
  role = "root",
  parentId = "",
} = {}) {
  const metadata = {
    version: 1,
    instanceId: normalizedId(instanceId),
    ruleId: normalizedId(ruleId),
    spellId: normalizedId(spellId),
    casterId: normalizedId(casterId),
    role: role === "geometry" ? "geometry" : "root",
  };
  const normalizedParentId = normalizedId(parentId);
  if (normalizedParentId) metadata.parentId = normalizedParentId;
  return metadata;
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
} = {}) {
  const normalizedInstanceId = normalizedId(instanceId);
  const normalizedCasterId = normalizedId(casterId);
  if (
    !isStaticSpellZoneRule(rule)
    || spell?.concentration === true
    || !normalizedInstanceId
    || !normalizedCasterId
  ) {
    return null;
  }
  const name = String(spell?.displayName || spell?.name || "").trim();
  const spellId = normalizedId(spell?.id || rule.spellId);
  if (!name || !spellId) return null;
  return {
    type: "spell:upsert",
    targetIds: [normalizedCasterId],
    name,
    turns: Math.max(1, Math.floor(Number(spell?.defaultTurns) || 1)),
    conc: false,
    source: normalizedCasterId,
    instanceId: normalizedInstanceId,
    spellId,
    expiry: spell?.expiry && typeof spell.expiry === "object"
      ? { ...spell.expiry }
      : { mode: "manual" },
    ...(appliedAt ? { appliedAt: { ...appliedAt } } : {}),
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: rule.id,
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
