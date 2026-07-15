export const VALID_FACTIONS = new Set(["ally", "neutral", "enemy", "pc"]);

export function imageUrlOf(value) {
  return String(
    value?.image?.url ||
    value?.image?.src ||
    value?.image?.href ||
    value?.data?.src ||
    ""
  ).trim();
}

export function canonicalImageUrl(value) {
  const raw = typeof value === "string" ? value.trim() : imageUrlOf(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return raw.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  }
}

export function normalizedItemName(value) {
  return String(value?.name || value || "")
    .replace(/^\(\d+\)\s*/, "")
    .trim()
    .toLocaleLowerCase("it");
}
export function normalizeFactionRegistry(value) {
  const source = value && typeof value === "object" ? value : {};
  const registry = {};
  for (const [url, entry] of Object.entries(source)) {
    const attitude = String(entry?.attitude || "").trim().toLowerCase();
    if (!url || !VALID_FACTIONS.has(attitude)) continue;
    registry[url] = {
      attitude,
      name: String(entry?.name || "").trim(),
      updatedAt: Math.max(0, Number(entry?.updatedAt) || 0),
    };
  }
  return registry;
}

export function mergeFactionAssets(value, attitude, assets, updatedAt = Date.now()) {
  const normalizedAttitude = String(attitude || "").trim().toLowerCase();
  if (!VALID_FACTIONS.has(normalizedAttitude)) return normalizeFactionRegistry(value);

  const registry = normalizeFactionRegistry(value);
  for (const asset of Array.isArray(assets) ? assets : []) {
    const url = imageUrlOf(asset);
    const name = normalizedItemName(asset);
    const key = url || (name ? `name:${name}` : "");
    if (!key) continue;
    registry[key] = {
      attitude: normalizedAttitude,
      name: String(asset?.name || "").trim(),
      updatedAt: Math.max(0, Number(updatedAt) || Date.now()),
    };
  }
  return registry;
}

export function registeredAttitudeForItem(item, value) {
  const url = imageUrlOf(item);
  const registry = normalizeFactionRegistry(value);
  if (url && registry[url]?.attitude) return registry[url].attitude;

  const canonicalUrl = canonicalImageUrl(url);
  if (canonicalUrl) {
    for (const [storedUrl, entry] of Object.entries(registry)) {
      if (canonicalImageUrl(storedUrl) === canonicalUrl) return entry.attitude;
    }
  }

  const name = normalizedItemName(item);
  if (!name) return "";
  const attitudes = new Set();
  for (const entry of Object.values(registry)) {
    if (normalizedItemName(entry.name) === name) attitudes.add(entry.attitude);
  }
  return attitudes.size === 1 ? Array.from(attitudes)[0] : "";
}

export function removeFactionFromRegistry(value, attitude) {
  const registry = normalizeFactionRegistry(value);
  for (const [url, entry] of Object.entries(registry)) {
    if (entry.attitude === attitude) delete registry[url];
  }
  return registry;
}

export function factionRegistryCounts(value) {
  const counts = { ally: 0, neutral: 0, enemy: 0, pc: 0 };
  for (const entry of Object.values(normalizeFactionRegistry(value))) {
    counts[entry.attitude] += 1;
  }
  return counts;
}
