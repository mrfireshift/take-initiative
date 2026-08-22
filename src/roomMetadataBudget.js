import { ID } from "./constants.js";

// Owlbear documenta un limite di circa 16 kB per la Room. Il margine evita di
// arrivare al limite trasporto con differenze di serializzazione non osservate
// dai test locali.
export const ROOM_METADATA_HARD_LIMIT_BYTES = 16_000;
export const ROOM_METADATA_SAFE_LIMIT_BYTES = 14_500;
export const ROOM_METADATA_SAFETY_MARGIN_BYTES =
  ROOM_METADATA_HARD_LIMIT_BYTES - ROOM_METADATA_SAFE_LIMIT_BYTES;

// Sono byte del singolo valore JSON, non byte dell'intero documento. La somma
// lascia spazio alla sintassi JSON delle chiavi e delle chiavi piccole.
export const ROOM_METADATA_DOMAIN_MAX_BYTES = Object.freeze({
  "actor-vitals": 2_500,
  "room-memory": 2_700,
  "initiative-cards": 4_450,
  registry: 2_550,
  "options-room": 1_200,
  "shared-ui": 350,
  "speed-check-control": 350,
});

export const ROOM_METADATA_DOMAIN_MAX_BY_KEY = Object.freeze({
  [`${ID}/actorVitals`]: ROOM_METADATA_DOMAIN_MAX_BYTES["actor-vitals"],
  [`${ID}/hpMemory`]: ROOM_METADATA_DOMAIN_MAX_BYTES["room-memory"],
  [`${ID}/initiativeCards`]: ROOM_METADATA_DOMAIN_MAX_BYTES["initiative-cards"],
  [`${ID}/factionRegistry`]: ROOM_METADATA_DOMAIN_MAX_BYTES.registry,
  [`${ID}/options-room`]: ROOM_METADATA_DOMAIN_MAX_BYTES["options-room"],
  [`${ID}/ui`]: ROOM_METADATA_DOMAIN_MAX_BYTES["shared-ui"],
  [`${ID}/speed-check-control`]: ROOM_METADATA_DOMAIN_MAX_BYTES["speed-check-control"],
});

export const TAKE_INITIATIVE_ROOM_METADATA_KEYS = Object.freeze([
  `${ID}/actorVitals`,
  `${ID}/hpMemory`,
  `${ID}/initiativeCards`,
  `${ID}/factionRegistry`,
  `${ID}/options-room`,
  `${ID}/ui`,
  `${ID}/speed-check-control`,
]);

const textEncoder = new TextEncoder();

export function jsonBytes(value) {
  try {
    return textEncoder.encode(JSON.stringify(value ?? null)).byteLength;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function roomMetadataBytes(metadata) {
  return jsonBytes(objectOrEmpty(metadata));
}

export function roomMetadataKeyBytes(metadata, key) {
  const source = objectOrEmpty(metadata);
  return jsonBytes({ [key]: source[key] });
}

export function roomMetadataWithoutKey(metadata, key) {
  const source = { ...objectOrEmpty(metadata) };
  delete source[key];
  return source;
}

export function roomMetadataCandidate(metadata, key, value) {
  return {
    ...objectOrEmpty(metadata),
    [key]: value,
  };
}

// Calcola il budget del valore usando l'overhead reale di chiave e virgola.
// Non usa una somma approssimata dei valori per la verifica finale.
export function roomMetadataValueBudget(
  metadata,
  key,
  limitBytes = ROOM_METADATA_SAFE_LIMIT_BYTES,
) {
  const withoutKey = roomMetadataWithoutKey(metadata, key);
  const baseBytes = roomMetadataBytes(withoutKey);
  const nullBytes = jsonBytes(null);
  const keyOverhead = roomMetadataBytes(roomMetadataCandidate(withoutKey, key, null))
    - baseBytes
    - nullBytes;
  return Math.max(0, Math.floor(
    Number(limitBytes) - baseBytes - Math.max(0, keyOverhead),
  ));
}

function sameJson(left, right) {
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

function boundedDomainMax(value) {
  if (value === undefined || value === null) return Number.MAX_SAFE_INTEGER;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function entryDomainMax(entry) {
  return entry?.domainMaxBytes === undefined
    ? ROOM_METADATA_DOMAIN_MAX_BY_KEY[entry?.key] ?? Number.MAX_SAFE_INTEGER
    : entry.domainMaxBytes;
}

export function planRoomMetadataWrite(
  metadata,
  key,
  requestedValue,
  {
    domainMaxBytes = undefined,
    retain = null,
    safeLimitBytes = ROOM_METADATA_SAFE_LIMIT_BYTES,
    hardLimitBytes = ROOM_METADATA_HARD_LIMIT_BYTES,
  } = {},
) {
  const source = objectOrEmpty(metadata);
  const domainMax = boundedDomainMax(
    domainMaxBytes ?? ROOM_METADATA_DOMAIN_MAX_BY_KEY[key] ?? Number.MAX_SAFE_INTEGER,
  );
  const totalBeforeBytes = roomMetadataBytes(source);
  const requestedValueBytes = jsonBytes(requestedValue);
  const safeValueBudget = Math.min(
    domainMax,
    roomMetadataValueBudget(source, key, safeLimitBytes),
  );
  const hardValueBudget = Math.min(
    domainMax,
    roomMetadataValueBudget(source, key, hardLimitBytes),
  );

  let persistedValue = requestedValue;
  if (typeof retain === "function") {
    persistedValue = retain(requestedValue, safeValueBudget);
  }

  let candidate = roomMetadataCandidate(source, key, persistedValue);
  let candidateTotalBytes = roomMetadataBytes(candidate);
  let recoveryWrite = false;

  // Una Room già oltre il ceiling può richiedere più passaggi: consentiamo
  // temporaneamente un candidato sotto il limite hard affinché gli altri
  // owner possano compattare a loro volta la propria chiave.
  if (candidateTotalBytes > safeLimitBytes && typeof retain === "function") {
    const recoveredValue = retain(requestedValue, hardValueBudget);
    const recoveredCandidate = roomMetadataCandidate(source, key, recoveredValue);
    const recoveredTotal = roomMetadataBytes(recoveredCandidate);
    if (recoveredTotal < candidateTotalBytes && recoveredTotal <= hardLimitBytes) {
      persistedValue = recoveredValue;
      candidate = recoveredCandidate;
      candidateTotalBytes = recoveredTotal;
      recoveryWrite = true;
    }
  }

  const persistedValueBytes = jsonBytes(persistedValue);
  return {
    key,
    totalBeforeBytes,
    requestedValueBytes,
    persistedValue,
    persistedValueBytes,
    candidateTotalBytes,
    safeLimitBytes,
    hardLimitBytes,
    domainMaxBytes: domainMax,
    safeValueBudget,
    hardValueBudget,
    pruned: !sameJson(persistedValue, requestedValue),
    recoveryWrite,
    fitsSafe: candidateTotalBytes <= safeLimitBytes
      && persistedValueBytes <= domainMax,
    fitsHard: candidateTotalBytes <= hardLimitBytes
      && persistedValueBytes <= domainMax,
  };
}

function valueForEntry(source, entry) {
  return Object.prototype.hasOwnProperty.call(entry, "value")
    ? entry.value
    : source[entry.key];
}

function candidateForEntries(source, entries, factor) {
  const candidate = { ...source };
  for (const entry of entries) {
    if (!Object.prototype.hasOwnProperty.call(source, entry.key)) continue;
    const value = valueForEntry(source, entry);
    if (typeof entry.retain === "function") {
      const maxBytes = Math.max(
        0,
        Math.floor(boundedDomainMax(entryDomainMax(entry)) * factor),
      );
      candidate[entry.key] = entry.retain(value, maxBytes);
    } else {
      candidate[entry.key] = value;
    }
  }
  return candidate;
}

/**
 * Compatta contemporaneamente soltanto le chiavi Take Initiative elencate
 * dal caller. Le altre chiavi restano identiche nel candidato.
 */
export function compactOwnedRoomMetadata(
  metadata,
  entries = [],
  {
    safeLimitBytes = ROOM_METADATA_SAFE_LIMIT_BYTES,
    hardLimitBytes = ROOM_METADATA_HARD_LIMIT_BYTES,
  } = {},
) {
  const source = objectOrEmpty(metadata);
  const ownedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => (
      entry?.key
      && TAKE_INITIATIVE_ROOM_METADATA_KEYS.includes(entry.key)
      && Object.prototype.hasOwnProperty.call(source, entry.key)
    ));
  const shrinkable = ownedEntries.filter((entry) => typeof entry.retain === "function");
  const fixed = ownedEntries.filter((entry) => typeof entry.retain !== "function");
  const sourceWithoutShrinkable = { ...source };
  for (const entry of shrinkable) delete sourceWithoutShrinkable[entry.key];

  const fixedBytes = roomMetadataBytes(sourceWithoutShrinkable);
  const targetLimit = fixedBytes <= safeLimitBytes ? safeLimitBytes : hardLimitBytes;
  if (fixedBytes > hardLimitBytes) {
    return {
      metadata: source,
      updates: {},
      totalBeforeBytes: roomMetadataBytes(source),
      candidateTotalBytes: fixedBytes,
      limitBytes: targetLimit,
      fitsHard: false,
      pruned: false,
      shrinkableKeys: shrinkable.map((entry) => entry.key),
    };
  }

  let best = candidateForEntries(source, ownedEntries, 1);
  if (roomMetadataBytes(best) > targetLimit) {
    let low = 0;
    let high = 1;
    best = candidateForEntries(source, ownedEntries, 0);
    if (roomMetadataBytes(best) <= targetLimit) {
      for (let iteration = 0; iteration < 32; iteration += 1) {
        const middle = (low + high) / 2;
        const candidate = candidateForEntries(source, ownedEntries, middle);
        if (roomMetadataBytes(candidate) <= targetLimit) {
          low = middle;
          best = candidate;
        } else {
          high = middle;
        }
      }
    }
  }

  const updates = {};
  for (const entry of ownedEntries) {
    if (!sameJson(source[entry.key], best[entry.key])) {
      updates[entry.key] = best[entry.key];
    }
  }
  const candidateTotalBytes = roomMetadataBytes({ ...source, ...updates });
  return {
    metadata: { ...source, ...updates },
    updates,
    totalBeforeBytes: roomMetadataBytes(source),
    candidateTotalBytes,
    limitBytes: targetLimit,
    fitsSafe: candidateTotalBytes <= safeLimitBytes,
    fitsHard: candidateTotalBytes <= hardLimitBytes,
    pruned: Object.keys(updates).length > 0,
    shrinkableKeys: shrinkable.map((entry) => entry.key),
    fixedKeys: fixed.map((entry) => entry.key),
  };
}

export function topOwnedRoomMetadataKeys(metadata, limit = 5) {
  const source = objectOrEmpty(metadata);
  return TAKE_INITIATIVE_ROOM_METADATA_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
    .map((key) => ({ key, bytes: roomMetadataKeyBytes(source, key) }))
    .sort((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key))
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}
