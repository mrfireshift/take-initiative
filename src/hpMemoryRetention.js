import {
  ROOM_METADATA_DOMAIN_MAX_BYTES,
  jsonBytes,
} from "./roomMetadataBudget.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function timestamp(entry) {
  return Math.max(
    Math.max(0, Number(entry?.t) || 0),
    Math.max(0, Number(entry?.tAtt) || 0),
  );
}

function hasPersistentHP(entry) {
  return Number.isFinite(Number(entry?.hp))
    && Number.isFinite(Number(entry?.hpMax))
    && Number(entry.hpMax) > 0;
}

/**
 * Riduce soltanto la replica Room della memoria HP. Il chiamante mantiene la
 * mappa completa nel fallback locale prima di usare questo risultato.
 */
export function retainHPMapWithinByteBudget(
  value,
  maxBytes = ROOM_METADATA_DOMAIN_MAX_BYTES["room-memory"],
) {
  const source = isPlainObject(value) ? value : {};
  const budget = Math.max(2, Math.floor(Number(maxBytes) || 0));
  if (jsonBytes(source) <= budget) return { ...source };

  const ordered = Object.entries(source)
    .filter(([key, entry]) => key && isPlainObject(entry))
    .sort(([leftKey, left], [rightKey, right]) => {
      const hpPriority = Number(hasPersistentHP(right)) - Number(hasPersistentHP(left));
      if (hpPriority) return hpPriority;
      const recency = timestamp(right) - timestamp(left);
      return recency || leftKey.localeCompare(rightKey);
    });

  const retained = {};
  for (const [key, entry] of ordered) {
    const candidate = { ...retained, [key]: entry };
    if (jsonBytes(candidate) <= budget) retained[key] = entry;
  }
  return retained;
}
