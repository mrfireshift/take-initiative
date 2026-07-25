function vector(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function subtract(left, right) {
  const a = vector(left);
  const b = vector(right);
  return a && b ? { x: a.x - b.x, y: a.y - b.y } : null;
}

function distance(value) {
  const point = vector(value);
  return point ? Math.hypot(point.x, point.y) : Number.POSITIVE_INFINITY;
}

export function evaluateLocalAttachmentProbe(before, after, {
  movementThreshold = 4,
  tolerance = 2,
} = {}) {
  const localOnly = after?.localExists === true && after?.globalExists === false;
  const attachmentReferencePreserved = !!after?.markerAttachedTo &&
    after.markerAttachedTo === after.tokenId;
  const tokenDelta = subtract(after?.tokenPosition, before?.tokenPosition);
  const markerDelta = subtract(after?.markerPosition, before?.markerPosition);
  const boundsDelta = subtract(after?.markerBoundsCenter, before?.markerBoundsCenter);
  const tokenMovement = distance(tokenDelta);
  const movementMeasured = Number.isFinite(tokenMovement) && tokenMovement >= movementThreshold;
  const positionDeltaError = tokenDelta && markerDelta
    ? distance(subtract(markerDelta, tokenDelta))
    : Number.POSITIVE_INFINITY;
  const boundsDeltaError = tokenDelta && boundsDelta
    ? distance(subtract(boundsDelta, tokenDelta))
    : Number.POSITIVE_INFINITY;
  const positionFollowsParent = movementMeasured && Number.isFinite(positionDeltaError) &&
    positionDeltaError <= tolerance;
  const boundsFollowParent = movementMeasured && Number.isFinite(boundsDeltaError) &&
    boundsDeltaError <= tolerance;
  const followsParent = positionFollowsParent || boundsFollowParent;

  let verdict = "pass";
  let reason = "L'item locale segue il token globale senza comparire nello store condiviso.";
  if (!after?.localExists) {
    verdict = "fail";
    reason = "Il marker non esiste nello store locale.";
  } else if (after?.globalExists) {
    verdict = "fail";
    reason = "Il marker locale compare anche nello store globale.";
  } else if (!attachmentReferencePreserved) {
    verdict = "fail";
    reason = "Il riferimento attachedTo al token globale non è stato conservato.";
  } else if (!movementMeasured) {
    verdict = "awaiting-move";
    reason = "Muovi il token di almeno 4 px e ripeti report().";
  } else if (!followsParent) {
    verdict = "fail";
    reason = "I bounds del marker locale non seguono lo spostamento del token globale.";
  }

  return {
    verdict,
    reason,
    localOnly,
    attachmentReferencePreserved,
    movementMeasured,
    followsParent,
    positionFollowsParent,
    boundsFollowParent,
    tokenDelta,
    markerDelta,
    boundsDelta,
    positionDeltaError: Number.isFinite(positionDeltaError)
      ? Math.round(positionDeltaError * 100) / 100
      : null,
    boundsDeltaError: Number.isFinite(boundsDeltaError)
      ? Math.round(boundsDeltaError * 100) / 100
      : null,
    deltaError: Number.isFinite(Math.min(positionDeltaError, boundsDeltaError))
      ? Math.round(Math.min(positionDeltaError, boundsDeltaError) * 100) / 100
      : null,
    tolerance,
  };
}
