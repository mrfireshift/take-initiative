const DEFERRED_TIMINGS = new Set([
  "immediate",
  "turn-start",
  "turn-end",
  "damage",
]);
const ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const TARGET_SCOPES = new Set(["target", "source", "self"]);

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Metadata drafts can be Immer proxies; JSON is the persistence fallback.
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const text = (value, maxLength = 240) => String(value || "").trim().slice(0, maxLength);

function normalizedDamage(value) {
  if (!value || typeof value !== "object") return null;
  const dice = text(value.dice, 80);
  const type = text(value.type, 80);
  return dice && type ? { dice, type } : null;
}

function normalizedSave(value) {
  if (!value || typeof value !== "object") return null;
  const ability = text(value.ability, 12).toLocaleLowerCase("it");
  if (!ABILITIES.has(ability)) return null;
  const rawDc = value.dc;
  const dc = rawDc === "" || rawDc === null || rawDc === undefined
    ? null
    : Number(rawDc);
  return {
    ability,
    ...(Number.isFinite(dc) ? { dc: Math.max(0, Math.min(99, Math.round(dc))) } : {}),
  };
}

export function normalizeDeferredEffect(value, { fallbackId = "" } = {}) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id || fallbackId, 160);
  const timing = text(value.timing || value.event, 40).toLocaleLowerCase("it");
  const reminder = text(value.reminder || value.instruction || value.label, 240);
  if (!id || !DEFERRED_TIMINGS.has(timing) || !reminder) return null;
  const actor = value.actor === "source" ? "source" : "target";
  const damage = normalizedDamage(value.damage);
  const save = normalizedSave(value.save);
  const provenance = value.provenance && typeof value.provenance === "object"
    ? {
      ...(text(value.provenance.spellId, 160) ? { spellId: text(value.provenance.spellId, 160) } : {}),
      ...(text(value.provenance.spellName, 160) ? { spellName: text(value.provenance.spellName, 160) } : {}),
      ...(text(value.provenance.instanceId, 160) ? { instanceId: text(value.provenance.instanceId, 160) } : {}),
      ...(text(value.provenance.casterId, 160) ? { casterId: text(value.provenance.casterId, 160) } : {}),
      ...(text(value.provenance.casterName, 160) ? { casterName: text(value.provenance.casterName, 160) } : {}),
    }
    : null;
  return {
    id,
    timing,
    actor,
    ...(value.anchor === "next-turn" ? { anchor: "next-turn" } : {}),
    reminder,
    ...(damage ? { damage } : {}),
    ...(save ? { save } : {}),
    once: value.once !== false,
    ...(provenance && Object.keys(provenance).length ? { provenance } : {}),
    ...(value.resolution && typeof value.resolution === "object"
      ? { resolution: clone(value.resolution) }
      : {}),
  };
}

export function normalizeDeferredEffects(value) {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .map((entry) => normalizeDeferredEffect(entry))
    .filter(Boolean);
  return [...new Map(normalized.map((entry) => [entry.id, entry])).values()];
}

function normalizeEndConsequence(value, index) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id || `consequence-${index + 1}`, 160);
  const condition = text(value.condition || value.conditionName || value.name, 160);
  if (!id || !condition) return null;
  const options = value.options && typeof value.options === "object"
    ? clone(value.options)
    : {};
  for (const key of ["expiry", "mechanics", "deferredEffect", "deferredEffects"]) {
    if (value[key] !== undefined) options[key] = clone(value[key]);
  }
  if (value.effectId) options.effectId = text(value.effectId, 160);
  if (value.effectKind === "buff" || value.effectKind === "debuff") {
    options.effectKind = value.effectKind;
  }
  if (value.effectDetail) options.effectDetail = text(value.effectDetail, 240);
  if (value.manualRemoval === true) options.manualRemoval = true;
  return {
    id,
    target: TARGET_SCOPES.has(value.target) ? value.target : "self",
    condition,
    options,
  };
}

export function normalizeSpellEndConsequences(value) {
  const source = Array.isArray(value) ? { conditions: value } : value;
  if (!source || typeof source !== "object") return [];
  return (Array.isArray(source.conditions) ? source.conditions : [])
    .map(normalizeEndConsequence)
    .filter(Boolean);
}

