import { normalizeActorProfileId } from "./actorIdentityCore.js";

export const ACTOR_VITALS_SCHEMA_VERSION = 1;
export const ACTOR_VITALS_DEFAULT_ROOM_MAX_BYTES = 10_000;

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.floor(number)
    : null;
}

function validHP(value) {
  const number = nonNegativeInteger(value);
  return number !== null ? number : null;
}

function validHPMax(value) {
  const number = nonNegativeInteger(value);
  return number !== null && number > 0 ? number : null;
}

function validTimestamp(value) {
  const number = nonNegativeInteger(value);
  return number !== null ? number : 0;
}

function validRevision(value) {
  const number = nonNegativeInteger(value);
  return number !== null ? number : 0;
}

function jsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function isValidActorVitalsRecord(value) {
  return plainObject(value)
    && validHP(value.hp) !== null
    && validHPMax(value.hpMax) !== null;
}

export function normalizeActorVitalsRecord(value) {
  const source = plainObject(value) ? value : {};
  const normalized = { ...source };
  const hp = validHP(source.hp);
  const hpMax = validHPMax(source.hpMax);

  if (hp === null) delete normalized.hp;
  else normalized.hp = hp;
  if (hpMax === null) delete normalized.hpMax;
  else normalized.hpMax = hpMax;

  if (Object.prototype.hasOwnProperty.call(source, "updatedAt")) {
    normalized.updatedAt = validTimestamp(source.updatedAt);
  }
  if (Object.prototype.hasOwnProperty.call(source, "revision")) {
    normalized.revision = validRevision(source.revision);
  }
  return normalized;
}

function actorRecordsFromRegistry(value) {
  if (!plainObject(value)) return {};
  if (plainObject(value.actors)) return value.actors;

  // Tolleranza per una bozza della chiave che usava direttamente gli actor ID
  // al top-level. Non viene emessa dal writer attuale, ma può essere letta.
  return Object.fromEntries(
    Object.entries(value).filter(([key, entry]) => (
      key !== "schemaVersion"
      && key !== "version"
      && plainObject(entry)
      && (key.startsWith("actor_")
        || Object.prototype.hasOwnProperty.call(entry, "hp")
        || Object.prototype.hasOwnProperty.call(entry, "hpMax")
        || Object.prototype.hasOwnProperty.call(entry, "updatedAt")
        || Object.prototype.hasOwnProperty.call(entry, "revision"))
    )),
  );
}

export function normalizeActorVitalsRegistry(value) {
  const source = plainObject(value) ? value : {};
  const actors = {};
  for (const [rawId, rawRecord] of Object.entries(actorRecordsFromRegistry(source))) {
    const actorProfileId = normalizeActorProfileId(rawId);
    if (!actorProfileId || !plainObject(rawRecord)) continue;
    const record = normalizeActorVitalsRecord(rawRecord);
    if (Object.keys(record).length) actors[actorProfileId] = record;
  }

  const normalized = {
    ...source,
    schemaVersion: ACTOR_VITALS_SCHEMA_VERSION,
    actors,
  };
  delete normalized.version;
  for (const actorProfileId of Object.keys(normalized)) {
    if (actorProfileId !== "schemaVersion" && actorProfileId !== "actors"
      && actorRecordsFromRegistry(source)[actorProfileId]) {
      delete normalized[actorProfileId];
    }
  }
  return normalized;
}

export function compareActorVitalsRecords(left, right) {
  const leftValid = isValidActorVitalsRecord(left);
  const rightValid = isValidActorVitalsRecord(right);
  if (leftValid !== rightValid) return leftValid ? 1 : -1;

  const leftUpdatedAt = validTimestamp(left?.updatedAt);
  const rightUpdatedAt = validTimestamp(right?.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt > rightUpdatedAt ? 1 : -1;

  const leftRevision = validRevision(left?.revision);
  const rightRevision = validRevision(right?.revision);
  if (leftRevision !== rightRevision) return leftRevision > rightRevision ? 1 : -1;
  return 0;
}

export function mergeActorVitalsRegistries(...sources) {
  const merged = { schemaVersion: ACTOR_VITALS_SCHEMA_VERSION, actors: {} };
  const unknown = {};

  for (const source of sources) {
    const normalized = normalizeActorVitalsRegistry(source);
    for (const [key, value] of Object.entries(normalized)) {
      if (key !== "schemaVersion" && key !== "actors") unknown[key] = value;
    }
    for (const [actorProfileId, candidate] of Object.entries(normalized.actors)) {
      const current = merged.actors[actorProfileId];
      if (!current || compareActorVitalsRecords(candidate, current) > 0) {
        merged.actors[actorProfileId] = { ...candidate };
      }
    }
  }

  return {
    ...unknown,
    schemaVersion: ACTOR_VITALS_SCHEMA_VERSION,
    actors: merged.actors,
  };
}

export function actorVitalsRecordFor(registry, actorProfileId) {
  const id = normalizeActorProfileId(actorProfileId);
  if (!id) return null;
  const normalized = normalizeActorVitalsRegistry(registry);
  const record = normalized.actors[id];
  return record ? { ...record } : null;
}

export function upsertActorVitalsRecord(
  registry,
  actorProfileId,
  hp,
  hpMax,
  { now = Date.now } = {},
) {
  const id = normalizeActorProfileId(actorProfileId);
  const nextHP = validHP(hp);
  const nextHPMax = validHPMax(hpMax);
  if (!id || nextHP === null || nextHPMax === null) {
    return normalizeActorVitalsRegistry(registry);
  }

  const normalized = normalizeActorVitalsRegistry(registry);
  const previous = normalized.actors[id] || {};
  const previousRevision = validRevision(previous.revision);
  const previousTimestamp = validTimestamp(previous.updatedAt);
  const currentTime = validTimestamp(now());
  normalized.actors[id] = {
    ...previous,
    hp: nextHP,
    hpMax: nextHPMax,
    updatedAt: Math.max(currentTime, previousTimestamp + 1),
    revision: previousRevision + 1,
  };
  return normalized;
}

export function retainActorVitalsRegistryWithinByteBudget(
  value,
  maxBytes = ACTOR_VITALS_DEFAULT_ROOM_MAX_BYTES,
) {
  const source = normalizeActorVitalsRegistry(value);
  const budget = Math.max(2, Math.floor(Number(maxBytes) || 0));
  if (jsonBytes(source) <= budget) return {
    ...source,
    actors: { ...source.actors },
  };

  const retained = {
    ...source,
    actors: {},
  };
  const ordered = Object.entries(source.actors).sort(([leftId, left], [rightId, right]) => {
    const validPriority = Number(isValidActorVitalsRecord(right))
      - Number(isValidActorVitalsRecord(left));
    if (validPriority) return validPriority;
    const updatedAt = validTimestamp(right.updatedAt) - validTimestamp(left.updatedAt);
    if (updatedAt) return updatedAt;
    const revision = validRevision(right.revision) - validRevision(left.revision);
    if (revision) return revision;
    return leftId.localeCompare(rightId);
  });

  for (const [actorProfileId, record] of ordered) {
    const candidate = {
      ...retained,
      actors: { ...retained.actors, [actorProfileId]: record },
    };
    if (jsonBytes(candidate) <= budget) retained.actors[actorProfileId] = record;
  }
  return retained;
}

export function actorVitalsByteSize(value) {
  return jsonBytes(normalizeActorVitalsRegistry(value));
}
