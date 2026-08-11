import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { areaHitsBounds, buildArea } from "./aoeGeometryCore.js";
import {
  clipChildZoneAreaToParent,
  validateChildZoneContainment,
} from "./spellChildZoneCore.js";
import {
  spellAreaOriginAdjacentToCaster,
  spellAreaOriginWithinRange,
} from "./spellAreaPlacementCore.js";
import { getSpellAreaRuleForPlacement } from "./spellAreaRules.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";
import {
  SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES,
  SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
  SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
  validateSpellActiveResolutionPayload,
} from "./spellActiveResolutionCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function itemCenter(bounds, item) {
  const center = point(bounds?.center);
  if (center) return center;
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  if (min && max) return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
  return point(item?.position);
}

function activeParentInstance(items, payload) {
  const wanted = String(payload?.instanceId || "").trim();
  const spellId = String(payload?.spellId || "").trim();
  const casterId = String(payload?.casterId || "").trim();
  if (!wanted || !spellId || !casterId) return false;
  const caster = items.find((item) => item?.id === casterId);
  const spells = caster?.metadata?.[META_KEY]?.[SPELLS_KEY];
  if ((Array.isArray(spells) ? spells : []).some((spell) => (
    String(spell?.instanceId || "") === wanted
    && String(spell?.spellId || "") === spellId
    && String(spell?.casterId || casterId) === casterId
  ))) return true;
  const concentrations = caster?.metadata?.[META_KEY]?.[CONCENTRATION_KEY];
  return Object.values(concentrations && typeof concentrations === "object" ? concentrations : {})
    .some((entry) => (
      String(entry?.instanceId || "") === wanted
      && (!entry?.spellId || String(entry.spellId) === spellId)
    ));
}

function placementArea(placement, { parentArea = null, childKind = "" } = {}) {
  if (!placement?.start || !placement?.end || !placement?.gridOrigin) return null;
  const dpi = Number(placement.dpi);
  if (!Number.isFinite(dpi) || dpi <= 0) return null;
  let area = buildArea(
    String(placement.type || "circle"),
    placement.start,
    placement.end,
    dpi,
    placement.gridOrigin,
    { widthSquares: placement.widthSquares },
  );
  if (String(childKind || "").trim() === "fissure") {
    area = clipChildZoneAreaToParent({
      parentArea: placement.parentClip || parentArea,
      childArea: {
        ...area,
        centerlineStart: point(placement.start),
        centerlineEnd: point(placement.end),
      },
    });
  }
  return area;
}

function numericRoll(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function outcomeKeys(outcomes) {
  return outcomes && typeof outcomes === "object" ? Object.keys(outcomes) : [];
}

function validateOutcomes({ targetIds, outcomes, allowed }) {
  const keys = outcomeKeys(outcomes);
  if (keys.some((id) => !targetIds.includes(id))) return ["outcome-target-mismatch"];
  if (targetIds.some((id) => !allowed.includes(String(outcomes?.[id] || "")))) {
    return ["outcomes-incomplete"];
  }
  return [];
}

async function validateSaveArea({ payload, placement, targetIds, outcomes, damageRoll }) {
  const rule = getSpellAreaRuleForPlacement(payload.action.placementRuleId);
  const area = placementArea(placement);
  const errors = [];
  if (!rule || !area || area.type !== rule.geometry.shape) errors.push("placement-invalid");
  if (!rule?.targeting?.includeCaster && targetIds.includes(payload.casterId)) {
    errors.push("caster-target-forbidden");
  }
  const maxTargets = Number(payload.action.maxTargets);
  if (Number.isInteger(maxTargets) && maxTargets > 0 && targetIds.length > maxTargets) {
    errors.push("target-limit-exceeded");
  }
  errors.push(...validateOutcomes({
    targetIds,
    outcomes,
    allowed: SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
  }));
  if (numericRoll(damageRoll) === null) errors.push("damage-required");
  const [caster] = await OBR.scene.items.getItems([payload.casterId]);
  const [casterBounds, dpi, scale] = await Promise.all([
    caster ? OBR.scene.items.getItemBounds([payload.casterId]).catch(() => null) : null,
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
  ]);
  if (!caster || !casterBounds) errors.push("caster-missing");
  const origin = point(area?.origin);
  const casterOrigin = itemCenter(casterBounds, caster);
  if (origin && casterOrigin && rule?.placement?.range
    && !spellAreaOriginWithinRange({
      origin,
      casterOrigin,
      range: rule.placement.range,
      dpi,
      scale: scale?.parsed || scale,
    })) {
    errors.push("placement-out-of-range");
  }
  if (origin && casterBounds && rule?.placement?.origin === "caster-adjacent"
    && !spellAreaOriginAdjacentToCaster({ origin, casterBounds, dpi })) {
    errors.push("placement-not-adjacent");
  }
  const ids = uniqueIds(targetIds);
  if (ids.length !== targetIds.length) errors.push("duplicate-targets");
  const items = ids.length ? await OBR.scene.items.getItems(ids) : [];
  if (items.length !== ids.length) errors.push("target-missing");
  const bounds = await Promise.all(items.map((item) =>
    OBR.scene.items.getItemBounds([item.id]).catch(() => null)
  ));
  if (area && items.some((item, index) => !areaHitsBounds(area, bounds[index]))) {
    errors.push("target-outside-placement");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

async function validateStorm({ payload, targetIds, outcomes, damageRoll, attackOutcome }) {
  const errors = [];
  const rootId = String(payload?.zoneItemId || "").trim();
  const requiresZoneRoot = payload?.action?.requiresZoneRoot !== false;
  const [root] = rootId ? await OBR.scene.items.getItems([rootId]) : [];
  const metadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  const boardMetadata = root?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const staticRoot = metadata?.role === "root"
    && String(metadata.instanceId || "") === String(payload.instanceId)
    && String(metadata.casterId || "") === String(payload.casterId);
  const boardRoot = boardMetadata?.kind === "spell-board-token"
    && String(boardMetadata.instanceId || "") === String(payload.instanceId)
    && String(boardMetadata.casterId || "") === String(payload.casterId)
    && String(boardMetadata.spellId || "") === String(payload.spellId);
  if (requiresZoneRoot && (
    !root
    || (!staticRoot && !boardRoot)
  )) errors.push("zone-root-missing");
  const rootArea = staticRoot && root ? translatedZoneArea(root) : null;
  const [caster] = !requiresZoneRoot
    ? await OBR.scene.items.getItems([payload.casterId])
    : [];
  const casterBounds = caster
    ? await OBR.scene.items.getItemBounds([caster.id]).catch(() => null)
    : null;
  const rootOrigin = point(rootArea?.origin)
    || point(root?.position)
    || (!requiresZoneRoot ? itemCenter(casterBounds, caster) : null);
  if (!rootOrigin) errors.push("zone-root-geometry-missing");
  const ids = uniqueIds(targetIds);
  if (ids.length !== 1) errors.push("single-target-required");
  if (ids.includes(payload.casterId)) errors.push("caster-target-forbidden");
  if (!SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES.includes(String(attackOutcome || ""))) {
    errors.push("attack-outcome-invalid");
  }
  if (numericRoll(damageRoll) === null) errors.push("damage-required");
  const [target] = ids.length ? await OBR.scene.items.getItems(ids) : [];
  const [targetBounds, dpi, scale] = await Promise.all([
    target ? OBR.scene.items.getItemBounds([target.id]).catch(() => null) : null,
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
  ]);
  const targetOrigin = itemCenter(targetBounds, target);
  if (!target || !targetBounds) errors.push("target-missing");
  if (rootOrigin && targetOrigin && payload.action.range
    && !spellAreaOriginWithinRange({
    origin: targetOrigin,
    casterOrigin: rootOrigin,
    range: payload.action.range,
    dpi,
    scale: scale?.parsed || scale,
  })) errors.push("target-out-of-range");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    insideRoot: !!(rootArea && targetBounds && areaHitsBounds(rootArea, targetBounds)),
  };
}

function normalizedAttackEntries(attacks = []) {
  return (Array.isArray(attacks) ? attacks : [])
    .map((entry) => ({
      targetId: String(entry?.targetId || entry?.id || "").trim(),
      attackOutcome: String(entry?.attackOutcome || entry?.outcome || "").trim(),
      damageRoll: entry?.damageRoll ?? entry?.damage ?? 0,
    }))
    .filter((entry) => entry.targetId);
}

function childPlacementEntries(placement) {
  if (Array.isArray(placement?.children)) return placement.children.filter(Boolean);
  return placement?.start && placement?.end ? [placement] : [];
}

async function validateChildZone({
  payload,
  placement,
  targetIds,
  outcomes,
  allItems,
}) {
  const errors = [];
  const childZone = payload?.action?.childZone || {};
  const rootId = String(payload?.zoneItemId || "").trim();
  const root = allItems.find((item) => item?.id === rootId);
  const rootMetadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  if (
    !root
    || rootMetadata?.role !== "root"
    || String(rootMetadata.instanceId || "") !== String(payload.instanceId || "")
    || String(rootMetadata.casterId || "") !== String(payload.casterId || "")
  ) {
    errors.push("zone-root-missing");
  }
  const rootArea = root ? translatedZoneArea(root) : null;
  if (!rootArea) errors.push("zone-root-geometry-missing");
  const entries = childPlacementEntries(placement);
  const minimum = Number(childZone.placementCount?.min);
  const maximum = Number(childZone.placementCount?.max);
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)
    || entries.length < minimum || entries.length > maximum) {
    errors.push("child-placement-count-invalid");
  }
  const ruleId = String(childZone.placementRuleId || payload.action.placementRuleId || "").trim();
  const rule = getSpellAreaRuleForPlacement(ruleId);
  const areas = [];
  for (const entry of entries) {
    const area = placementArea(entry, {
      parentArea: rootArea,
      childKind: childZone.childKind,
    });
    if (!area || !rule || area.type !== rule.geometry.shape) {
      errors.push("child-placement-invalid");
      continue;
    }
    if (!validateChildZoneContainment({
      parentArea: rootArea,
      childArea: area,
      childKind: childZone.childKind,
    })) {
      errors.push("child-placement-outside-parent");
    }
    if (entry.depthRoll !== undefined && entry.depthRoll !== "") {
      const depth = numericRoll(entry.depthRoll);
      const minimumDepth = Number(childZone.depth?.min ?? 1);
      const maximumDepth = Number(childZone.depth?.max ?? 10);
      if (depth === null || !Number.isInteger(depth)
        || depth < minimumDepth || depth > maximumDepth) {
        errors.push("child-depth-invalid");
      }
    }
    areas.push(area);
  }
  const ids = uniqueIds(targetIds);
  if (ids.length !== targetIds.length) errors.push("duplicate-targets");
  if (childZone.resolution === "save") {
    errors.push(...validateOutcomes({
      targetIds: ids,
      outcomes,
      allowed: SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
    }));
  }
  if (ids.length && areas.length) {
    const targetItems = await OBR.scene.items.getItems(ids);
    if (targetItems.length !== ids.length) errors.push("target-missing");
    const bounds = await Promise.all(targetItems.map((item) =>
      OBR.scene.items.getItemBounds([item.id]).catch(() => null)
    ));
    if (targetItems.some((item, index) =>
      !areas.some((area) => areaHitsBounds(area, bounds[index]))
    )) {
      errors.push("target-outside-child-placement");
    }
  }
  if (childZone.singleActivation === true) {
    const existing = allItems.filter((item) => {
      const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
      return metadata?.role === "subzone"
        && String(metadata.parentZoneId || metadata.parentId || "") === rootId
        && String(metadata.parentInstanceId || metadata.instanceId || "")
          === String(payload.instanceId || "")
        && String(metadata.childKind || "") === String(childZone.childKind || "");
    });
    if (existing.length) errors.push("child-activation-already-used");
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    areas,
  };
}

export async function validateSpellActiveResolutionCommit({
  payload = null,
  placement = null,
  targetIds = [],
  outcomes = {},
  damageRoll = 0,
  attackOutcome = "",
  attacks = [],
} = {}) {
  const payloadValidation = validateSpellActiveResolutionPayload(payload);
  const errors = [...payloadValidation.errors];
  if (payload?.type !== SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE) {
    return { valid: false, errors };
  }
  // The popup runs in a separate runtime and cannot compare its local epoch
  // with the one captured by the controller. The background mutation
  // coordinator performs the authoritative scene/epoch check before commit.
  const allItems = await OBR.scene.items.getItems();
  if (!activeParentInstance(allItems, payload)) errors.push("spell-instance-missing");
  const caster = allItems.find((item) => item?.id === payload.casterId);
  if (!caster) errors.push("caster-missing");
  const ids = uniqueIds(targetIds);
  const attackEntries = normalizedAttackEntries(attacks);
  const maxAttacks = Math.max(1, Math.floor(Number(payload.action.maxAttacks) || 1));
  const result = payload.action.resolutionKind === "single-attack"
    ? attackEntries.length
      ? {
        valid: attackEntries.length <= maxAttacks,
        errors: attackEntries.length <= maxAttacks ? [] : ["attacks-maximum"],
        insideRoot: false,
      }
      : await validateStorm({ payload, targetIds: ids, outcomes, damageRoll, attackOutcome })
    : payload.action.resolutionKind === "child-zone"
      ? await validateChildZone({ payload, placement, targetIds: ids, outcomes, allItems })
      : await validateSaveArea({ payload, placement, targetIds: ids, outcomes, damageRoll });
  if (payload.action.resolutionKind === "single-attack" && attackEntries.length) {
    for (const entry of attackEntries) {
      const attackResult = await validateStorm({
        payload,
        targetIds: [entry.targetId],
        outcomes,
        damageRoll: entry.damageRoll,
        attackOutcome: entry.attackOutcome,
      });
      result.errors.push(...attackResult.errors);
    }
  }
  errors.push(...result.errors);
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    ...(result.insideRoot !== undefined ? { insideRoot: result.insideRoot } : {}),
  };
}

export { itemCenter, placementArea };
