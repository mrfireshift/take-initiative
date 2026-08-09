import { areaHitsBounds } from "./aoeGeometryCore.js";
import {
  normalizeSpellZoneMovement,
  normalizeSpellZoneMovementChoiceValue,
} from "./spellAreaRules.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";

const UNIT_METERS = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  metro: 1,
  metri: 1,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
});

const EPSILON = 1e-7;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePoint(left, right) {
  return !!left && !!right
    && Math.abs(left.x - right.x) <= EPSILON
    && Math.abs(left.y - right.y) <= EPSILON;
}

function scaleParts(scale = {}) {
  const source = scale?.parsed && typeof scale.parsed === "object"
    ? scale.parsed
    : scale;
  const multiplier = Number(source?.multiplier);
  const unit = String(source?.unit || "m").trim().toLowerCase();
  const unitMeters = UNIT_METERS[unit];
  return {
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5,
    unitMeters: unitMeters || 1,
  };
}

export function spellZoneMovementDistanceMeters(
  from,
  to,
  dpi = 1,
  scale = {},
) {
  const start = point(from);
  const end = point(to);
  const safeDpi = Number(dpi);
  if (!start || !end || !Number.isFinite(safeDpi) || safeDpi <= 0) return NaN;
  const { multiplier, unitMeters } = scaleParts(scale);
  return Math.hypot(end.x - start.x, end.y - start.y) / safeDpi
    * multiplier * unitMeters;
}

function movementRule(rule) {
  return normalizeSpellZoneMovement(rule?.zonePolicy?.movement);
}

function zoneMetadataMatches(zoneItem, {
  rule,
  instanceId,
  casterId,
} = {}) {
  const metadata = zoneItem?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  if (!metadata || metadata.role !== "root") return false;
  if (instanceId && String(metadata.instanceId || "") !== String(instanceId)) return false;
  if (casterId && String(metadata.casterId || "") !== String(casterId)) return false;
  if (rule?.id && String(metadata.ruleId || "") !== String(rule.id)) return false;
  return true;
}

function contactAtPosition(zoneItem, position, candidates = []) {
  const area = translatedZoneArea(zoneItem, position);
  if (!area) return [];
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.id && candidate?.bounds)
    .filter((candidate) => areaHitsBounds(area, candidate.bounds))
    .map((candidate) => String(candidate.id).trim())
    .filter(Boolean);
}

function firstContactOnSegment({
  zoneItem,
  initialPosition,
  proposedPosition,
  dpi,
  candidates,
  contactTargetId = "",
} = {}) {
  const distance = Math.hypot(
    proposedPosition.x - initialPosition.x,
    proposedPosition.y - initialPosition.y,
  );
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, Number(dpi) || 1) * 8));
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const position = {
      x: initialPosition.x + (proposedPosition.x - initialPosition.x) * ratio,
      y: initialPosition.y + (proposedPosition.y - initialPosition.y) * ratio,
    };
    const targetIds = contactAtPosition(zoneItem, position, candidates);
    if (!targetIds.length) continue;
    const selected = String(contactTargetId || "").trim();
    if (selected) {
      if (!targetIds.includes(selected)) {
        return { error: "movement-contact-choice-invalid" };
      }
      return {
        targetId: selected,
        targetIds,
        position,
        ratio,
      };
    }
    if (targetIds.length > 1) {
      return {
        error: "movement-contact-choice-required",
        targetIds,
        position,
        ratio,
      };
    }
    return {
      targetId: targetIds[0],
      targetIds,
      position,
      ratio,
    };
  }
  return null;
}

export function planSpellZoneMovement({
  rule = null,
  zoneItem = null,
  initialPosition = null,
  proposedPosition = null,
  dpi = 1,
  scale = {},
  instanceId = "",
  casterId = "",
  sceneEpoch = null,
  currentSceneEpoch = null,
  contactCandidates = [],
  contactTargetId = "",
  movementChoice = "",
} = {}) {
  const errors = [];
  const movement = movementRule(rule);
  const initial = point(initialPosition || zoneItem?.position);
  const proposed = point(proposedPosition);
  const metadata = zoneItem?.metadata?.[SPELL_STATIC_ZONE_META_KEY];

  if (!zoneItem?.id) errors.push("movement-zone-required");
  if (!movement || typeof movement !== "object") errors.push("movement-rule-required");
  const normalizedMovementChoice = movement
    ? normalizeSpellZoneMovementChoiceValue(movement, movementChoice)
    : null;
  if (movement && normalizedMovementChoice === null) {
    errors.push(
      movement.choice?.required === true && !String(movementChoice || "").trim()
      ? "movement-choice-required"
      : "movement-choice-invalid",
    );
  }
  if (!zoneMetadataMatches(zoneItem, { rule, instanceId, casterId })) {
    errors.push("movement-zone-instance-stale");
  }
  if (!initial) errors.push("movement-initial-position-invalid");
  if (!proposed) errors.push("movement-proposed-position-invalid");
  if (!Number.isFinite(Number(dpi)) || Number(dpi) <= 0) {
    errors.push("movement-dpi-invalid");
  }
  if (
    sceneEpoch !== null
    && sceneEpoch !== undefined
    && currentSceneEpoch !== null
    && currentSceneEpoch !== undefined
    && String(sceneEpoch) !== String(currentSceneEpoch)
  ) {
    errors.push("movement-scene-epoch-stale");
  }
  if (initial && point(zoneItem?.position) && !samePoint(initial, zoneItem.position)) {
    errors.push("movement-initial-position-stale");
  }

  const distanceMeters = initial && proposed
    ? spellZoneMovementDistanceMeters(initial, proposed, dpi, scale)
    : NaN;
  if (!Number.isFinite(distanceMeters)) errors.push("movement-distance-invalid");
  if (movement && Number.isFinite(distanceMeters)
    && distanceMeters > Number(movement.maximumMeters) + EPSILON) {
    errors.push("movement-distance-exceeded");
  }
  if (!translatedZoneArea(zoneItem, initial || undefined)) {
    errors.push("movement-geometry-invalid");
  }

  let contact = null;
  if (!errors.length && movement.stopOnFirstContact === true) {
    const targeting = rule?.zonePolicy?.membershipTargeting
      || rule?.targeting
      || {};
    const candidates = (Array.isArray(contactCandidates) ? contactCandidates : [])
      .filter((candidate) => targeting.includeCaster !== false
        || String(candidate?.id || "").trim() !== String(casterId || "").trim());
    contact = firstContactOnSegment({
      zoneItem,
      initialPosition: initial,
      proposedPosition: proposed,
      dpi,
      candidates,
      contactTargetId,
    });
    if (contact?.error) errors.push(contact.error);
  }

  const finalPosition = contact?.position || proposed;
  return {
    valid: errors.length === 0,
    errors: Object.freeze([...errors]),
    ...(movement ? { movement: clone(movement) } : {}),
    ...(normalizedMovementChoice ? { movementChoice: normalizedMovementChoice } : {}),
    instanceId: String(instanceId || metadata?.instanceId || "").trim(),
    casterId: String(casterId || metadata?.casterId || "").trim(),
    zoneItemId: String(zoneItem?.id || "").trim(),
    initialPosition: initial,
    proposedPosition: proposed,
    finalPosition: errors.length ? null : finalPosition,
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    firstContact: contact && !contact.error
      ? {
        targetId: contact.targetId,
        targetIds: [...contact.targetIds],
        position: { ...contact.position },
        ratio: contact.ratio,
      }
      : null,
    sideEffectRequest: errors.length
      ? null
      : {
        type: "static-zone:move",
        zoneItemId: String(zoneItem?.id || "").trim(),
        instanceId: String(instanceId || metadata?.instanceId || "").trim(),
        ruleId: String(rule?.id || metadata?.ruleId || "").trim(),
        casterId: String(casterId || metadata?.casterId || "").trim(),
        initialPosition: { ...initial },
        proposedPosition: { ...proposed },
        finalPosition: { ...finalPosition },
        ...(contact?.targetId ? { contactTargetId: contact.targetId } : {}),
        ...(contact?.targetIds?.length ? { contactTargetIds: [...contact.targetIds] } : {}),
        ...(normalizedMovementChoice
          ? { movementChoice: normalizedMovementChoice }
          : {}),
      },
    chronology: {
      label: `Sposta zona: ${String(rule?.spellId || "Incantesimo").trim()}`,
      rootItemId: String(zoneItem?.id || "").trim(),
    },
  };
}
