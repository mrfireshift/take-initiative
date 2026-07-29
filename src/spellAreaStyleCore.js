import { normalizeAoEStyle } from "./aoeStyle.js";

const THEMES = Object.freeze({
  arcane: Object.freeze({ fillColor: "#6366f1", strokeColor: "#a5b4fc" }),
  cold: Object.freeze({ fillColor: "#22d3ee", strokeColor: "#a5f3fc" }),
  darkness: Object.freeze({ fillColor: "#4c1d95", strokeColor: "#a78bfa" }),
  earth: Object.freeze({ fillColor: "#a16207", strokeColor: "#facc15" }),
  fire: Object.freeze({ fillColor: "#ea580c", strokeColor: "#fdba74" }),
  nature: Object.freeze({ fillColor: "#15803d", strokeColor: "#86efac" }),
  poison: Object.freeze({ fillColor: "#65a30d", strokeColor: "#bef264" }),
  psychic: Object.freeze({ fillColor: "#c026d3", strokeColor: "#f0abfc" }),
  radiant: Object.freeze({ fillColor: "#eab308", strokeColor: "#fef08a" }),
  silence: Object.freeze({ fillColor: "#475569", strokeColor: "#cbd5e1" }),
  storm: Object.freeze({ fillColor: "#2563eb", strokeColor: "#93c5fd" }),
  water: Object.freeze({ fillColor: "#0284c7", strokeColor: "#7dd3fc" }),
});

const EXPLICIT_THEMES = new Map([
  ["antimagic-field", "arcane"],
  ["black-tentacles", "darkness"],
  ["cloudkill", "poison"],
  ["darkness", "darkness"],
  ["entangle", "nature"],
  ["fog-cloud", "storm"],
  ["guardian-of-faith", "radiant"],
  ["insect-plague", "nature"],
  ["moonbeam", "radiant"],
  ["silence", "silence"],
  ["spike-growth", "nature"],
  ["spirit-guardians", "radiant"],
  ["stinking-cloud", "poison"],
  ["web", "nature"],
  ["zone-of-truth", "radiant"],
  ["phb2014-fame-di-hadar", "darkness"],
  ["xanathar-boschetto-druidico", "nature"],
  ["xanathar-collera-della-natura", "nature"],
  ["xanathar-fulgore-nauseante", "radiant"],
  ["xanathar-oscurita-della-follia", "darkness"],
  ["xanathar-spirito-guaritore", "nature"],
]);

const PATTERNS = Object.freeze([
  ["fire", /(fire|flame|burn|incend|fiam|fuoco|fal[oò])/u],
  ["cold", /(cold|ice|sleet|snow|ghiacci|fredd|nevischio)/u],
  ["darkness", /(dark|shadow|hadar|oscur|tenebr|tentacol)/u],
  ["poison", /(poison|stinking|cloudkill|velen|nause)/u],
  ["water", /(water|maelstrom|tsunami|tidal|acque|acqua)/u],
  ["storm", /(storm|wind|lightning|thunder|tempest|vento|fulmine|tuono|turbine)/u],
  ["earth", /(earth|rock|stone|quake|terra|rocc|pietra)/u],
  ["nature", /(plant|thorn|spike|web|entang|insect|druid|veget|spine|ragnatela)/u],
  ["radiant", /(sun|moon|light|holy|sacred|dawn|radiance|luce|alba|fulgore|aura)/u],
  ["psychic", /(psych|mad|weird|fear|symbol|follia|paura)/u],
  ["silence", /(silence|sound|silenz|suono)/u],
]);

export function spellAreaTheme(spellId) {
  const id = String(spellId || "").trim().toLocaleLowerCase("it");
  if (!id) return "arcane";
  const explicit = EXPLICIT_THEMES.get(id);
  if (explicit) return explicit;
  return PATTERNS.find(([, pattern]) => pattern.test(id))?.[0] || "arcane";
}

export function spellAreaStyle(spellId, baseStyle = {}) {
  const normalized = normalizeAoEStyle(baseStyle);
  return {
    ...normalized,
    ...THEMES[spellAreaTheme(spellId)],
  };
}
