const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

// These declarations describe when HP is part of the current cast. A
// damageType in the catalog is not sufficient: several spells deal damage
// only on a later attack, as a reaction, or through an active action.
const SPELL_CAST_RESOLUTION_RULES = Object.freeze({
  "chain-lightning": Object.freeze({
    initialHP: true,
    resolution: "chain-lightning",
  }),
  "legacy-tashas-mind-whip": Object.freeze({
    initialHP: true,
  }),
  "xanathar-aculeo-mentale": Object.freeze({
    initialHP: true,
  }),
  "branding-smite": { initialHP: false, deferredHP: "next-weapon-hit" },
  "call-lightning": { initialHP: false, deferredHP: "active-action" },
  "chill-touch": { initialHP: true, resolution: "single-attack" },
  "divine-favor": { initialHP: false, deferredHP: "weapon-hit" },
  "dream": { initialHP: false, deferredHP: "variant" },
  "faithful-hound": { initialHP: false, deferredHP: "hound-attack" },
  "fire-shield": { initialHP: false, deferredHP: "reaction" },
  "flame-blade": { initialHP: false, deferredHP: "active-attack" },
  "guiding-bolt": { initialHP: true, resolution: "single-attack" },
  "heat-metal": { initialHP: true, resolution: "manual-damage", repeatAction: true },
  "phantasmal-killer": { initialHP: false, deferredHP: "turn-end-save" },
  "produce-flame": { initialHP: false, deferredHP: "optional-attack" },
  "ray-of-frost": { initialHP: true, resolution: "single-attack" },
  "vampiric-touch": { initialHP: false, deferredHP: "active-attack" },
  "eyebite": { initialHP: false, deferredHP: "active-action" },
  "xanathar-colpo-dello-zefiro": { initialHP: false, deferredHP: "active-attack" },
});

function spellId(value) {
  return String(typeof value === "object" ? value?.id : value || "").trim();
}

export function getSpellCastResolutionRule(spellOrId) {
  const rule = SPELL_CAST_RESOLUTION_RULES[spellId(spellOrId)];
  return rule ? clone(rule) : null;
}

export function spellHasExplicitInitialHP(spellOrId) {
  const rule = getSpellCastResolutionRule(spellOrId);
  return rule?.initialHP === true;
}

export function spellHasExplicitInitialHPPolicy(spellOrId) {
  const rule = getSpellCastResolutionRule(spellOrId);
  return rule && typeof rule.initialHP === "boolean" ? rule.initialHP : null;
}
