export const SPELL_TELEPORT_RULES = Object.freeze({
  "misty-step": Object.freeze({
    spellId: "misty-step",
    rangeMeters: 9,
    allowPassenger: false,
  }),
  "dimension-door": Object.freeze({
    spellId: "dimension-door",
    rangeMeters: 150,
    allowPassenger: true,
    passengerMaxDistanceMeters: 1.5,
    passenger: Object.freeze({
      optional: true,
      maximum: 1,
      requireCreature: true,
      maxSizeRelation: "caster-or-smaller",
      adjacency: "grid-adjacent",
      destinationPlacement: "preserve-relative-offset",
    }),
    failure: Object.freeze({
      condition: "destination-occupied",
      damage: Object.freeze({
        dice: "4d6",
        type: "force",
        requiresManualAmount: true,
      }),
    }),
  }),
  // Far Step (CAP-TELEPORT, lotto T1): the cast teleports like Misty Step; on the next turns the spell's pill repeats it
  // (active action "far-step-teleport", resolution kind "teleport").
  "xanathar-passo-remoto": Object.freeze({
    spellId: "xanathar-passo-remoto",
    rangeMeters: 18,
    allowPassenger: false,
  }),
});

// CAP-TELEPORT, lotto T2: a teleport that is a step of an area cast, never a teleport spell of its own (isTeleportSpell
// stays false). Thunder Step: the thunder is the area save around the space the caster leaves (its own cast rule); the
// destination is a second point on the map, and a willing creature next to the caster may travel along, out of the
// thunder (decision D1). Danger and HP follow the area's own path; the move joins its History entry (D2).
export const SPELL_TELEPORT_STEP_RULES = Object.freeze({
  "xanathar-passo-del-tuono": Object.freeze({
    spellId: "xanathar-passo-del-tuono",
    rangeMeters: 27,
    destinationRuleId: "xanathar-passo-del-tuono:destination",
    allowPassenger: true,
    passengerMaxDistanceMeters: 1.5,
    passenger: Object.freeze({
      optional: true,
      maximum: 1,
      requireCreature: true,
      maxSizeRelation: "caster-or-smaller",
      adjacency: "grid-adjacent",
      destinationPlacement: "preserve-relative-offset",
    }),
    excludePassengerFromArea: true,
  }),
});

export function getSpellTeleportStepRule(value) {
  const id = typeof value === "object" ? value?.id : value;
  return SPELL_TELEPORT_STEP_RULES[String(id || "").trim()] || null;
}

// The active actions that teleport a creature from a spell already active (resolution kind "teleport"): the caster
// (Far Step) or the one creature selected (Arcane Gate's traversal). The space chosen stays the GM's to judge.
export const SPELL_TELEPORT_ACTION_SUBJECTS = Object.freeze(["caster", "target"]);

export function spellTeleportActionSubject(action) {
  const subject = String(action?.teleport?.subject || "").trim();
  return SPELL_TELEPORT_ACTION_SUBJECTS.includes(subject) ? subject : "";
}

export function isTeleportSpell(value) {
  const id = typeof value === "object" ? value?.id : value;
  return Object.prototype.hasOwnProperty.call(SPELL_TELEPORT_RULES, String(id || "").trim());
}

export function getSpellTeleportRule(value) {
  const id = typeof value === "object" ? value?.id : value;
  return SPELL_TELEPORT_RULES[String(id || "").trim()] || null;
}

export function validateSpellTeleportPassenger({
  rule = null,
  caster = null,
  passenger = null,
} = {}) {
  if (!passenger) return { valid: true, errors: [], passengerId: null };
  const errors = [];
  if (rule?.allowPassenger !== true) errors.push("passenger-not-allowed");
  if (caster?.id && passenger?.id && String(caster.id) === String(passenger.id)) {
    errors.push("passenger-is-caster");
  }
  // CHARACTER è l'unica identity di creatura che il runtime espone in modo
  // autorevole al pannello. Oggetti/PROP restano fuori dalla selezione del
  // passeggero; peso, consenso e capacità di trasporto restano GM-assisted.
  if (rule?.passenger?.requireCreature === true
    && passenger?.layer !== undefined
    && passenger?.layer !== "CHARACTER") {
    errors.push("passenger-not-creature");
  }
  return {
    valid: errors.length === 0,
    errors,
    passengerId: passenger?.id || null,
  };
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function footprintGridGeometry(geometry, dpi) {
  const safeDpi = Number(dpi);
  const position = finitePoint(geometry?.position);
  const width = Number(geometry?.size?.width);
  const height = Number(geometry?.size?.height);
  if (!position || !(safeDpi > 0)
    || !(Number.isFinite(width) && width > 0)
    || !(Number.isFinite(height) && height > 0)) return null;
  return {
    centerX: position.x / safeDpi,
    centerY: position.y / safeDpi,
    halfSpanX: Math.max(0, (width / safeDpi - 1) / 2),
    halfSpanY: Math.max(0, (height / safeDpi - 1) / 2),
  };
}

/**
 * Returns null when the scene cannot provide authoritative footprints. A
 * boolean result is deliberately limited to grid adjacency: it rejects an
 * overlapping footprint and accepts side-by-side or diagonal neighboring
 * footprints, including creatures larger than one square.
 */
export function spellTeleportGeometriesAdjacent(casterGeometry, passengerGeometry, dpi) {
  const caster = footprintGridGeometry(casterGeometry, dpi);
  const passenger = footprintGridGeometry(passengerGeometry, dpi);
  if (!caster || !passenger) return null;
  const distanceX = Math.max(
    0,
    Math.abs(passenger.centerX - caster.centerX)
      - caster.halfSpanX
      - passenger.halfSpanX,
  );
  const distanceY = Math.max(
    0,
    Math.abs(passenger.centerY - caster.centerY)
      - caster.halfSpanY
      - passenger.halfSpanY,
  );
  const gridDistance = Math.max(Math.round(distanceX), Math.round(distanceY));
  return gridDistance === 1;
}

export function spellTeleportRelativeOffset(casterPosition, subjectPosition) {
  const caster = finitePoint(casterPosition);
  const subject = finitePoint(subjectPosition);
  if (!caster || !subject) return null;
  return {
    x: subject.x - caster.x,
    y: subject.y - caster.y,
  };
}

export function spellTeleportDestinationForSubject(
  destination,
  casterPosition,
  subjectPosition,
) {
  const target = finitePoint(destination);
  const offset = spellTeleportRelativeOffset(casterPosition, subjectPosition);
  if (!target || !offset) return null;
  return {
    x: target.x + offset.x,
    y: target.y + offset.y,
  };
}

export function spellTeleportDestinationPosition(preview) {
  if (!preview || typeof preview !== "object") return null;
  if (preview.position && Number.isFinite(Number(preview.position.x)) && Number.isFinite(Number(preview.position.y))) {
    return { x: Number(preview.position.x), y: Number(preview.position.y) };
  }
  if (
    preview.start && preview.end
    && Number.isFinite(Number(preview.start.x)) && Number.isFinite(Number(preview.start.y))
    && Number.isFinite(Number(preview.end.x)) && Number.isFinite(Number(preview.end.y))
    && ["square", "rectangle"].includes(preview.type)
  ) {
    return {
      x: (Number(preview.start.x) + Number(preview.end.x)) / 2,
      y: (Number(preview.start.y) + Number(preview.end.y)) / 2,
    };
  }
  const pos = preview.position || preview.destination || preview.start || preview.origin || preview.end;
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
