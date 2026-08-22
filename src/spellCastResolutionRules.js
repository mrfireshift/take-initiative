const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

// These declarations describe when HP is part of the current cast. A
// damageType in the catalog is not sufficient: several spells deal damage
// only on a later attack, as a reaction, or through an active action.
const SPELL_CAST_RESOLUTION_RULES = Object.freeze({
  "grease": Object.freeze({ initialHP: false }),
  "wall-of-fire": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({
        formula: "5d8",
        baseSlot: 4,
        additionalPerSlotAbove: 1,
        type: "fuoco",
      }),
      failed: Object.freeze({
        formula: "5d8",
        baseSlot: 4,
        additionalPerSlotAbove: 1,
        type: "fuoco",
      }),
    }),
  }),
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
  "xanathar-debilitazione": Object.freeze({
    initialHP: true,
    // Ogni volta che Debilitazione infligge danni, il caster recupera metà
    // del danno finale inserito, già dopo eventuali resistenze (arrotondando per difetto).
    casterHealingFromAppliedDamage: 0.5,
    // Debilitazione non usa il classico "metà se supera": il GM inserisce
    // direttamente il risultato del tiro corretto (2d8/4d8, scalato con lo slot).
    successfulSaveDamage: "full",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({
        formula: "2d8",
        baseSlot: 5,
        additionalPerSlotAbove: 1,
        type: "necrotici",
      }),
      failed: Object.freeze({
        formula: "4d8",
        baseSlot: 5,
        additionalPerSlotAbove: 1,
        type: "necrotici",
      }),
    }),
  }),
  "xanathar-immolazione": Object.freeze({
    initialHP: true,
  }),
  "xanathar-scossa-sinaptica": Object.freeze({
    initialHP: true,
  }),
  "xanathar-urlo-psichico": Object.freeze({
    initialHP: true,
  }),
  "tasha-scheggia-della-mente": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
  }),
  "xanathar-sfera-della-tempesta": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
  }),
  "xanathar-coltello-di-ghiaccio": Object.freeze({
    initialHP: true,
  }),
  "phb2014-braccia-di-hadar": Object.freeze({
    initialHP: true,
  }),
  "phb2014-onda-distruttiva": Object.freeze({
    initialHP: true,
  }),
  "phb2014-raggio-di-infermita": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "full",
  }),
  "xanathar-stretta-della-terra-di-maximilian": Object.freeze({
    initialHP: true,
  }),
  "xanathar-sciame-di-palle-di-neve-di-snilloc": Object.freeze({
    initialHP: true,
  }),
  "xanathar-vampa-di-aganazzar": Object.freeze({
    initialHP: true,
  }),
  "xanathar-parola-radiosa": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
  }),
  "xanathar-rombo-di-tuono": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
  }),
  "xanathar-onda-di-marea": Object.freeze({
    initialHP: true,
  }),
  "branding-smite": { initialHP: false, deferredHP: "next-weapon-hit" },
  "call-lightning": { initialHP: true, deferredHP: "active-action" },
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
  "eyebite": { initialHP: false },
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

export function spellSaveDamageFactor(spellOrId, outcome) {
  const normalizedOutcome = String(outcome || "").trim().toLocaleLowerCase("it");
  const rule = getSpellCastResolutionRule(spellOrId);
  if (normalizedOutcome !== "passed") return null;
  if (rule?.successfulSaveDamage === "none") return "zero";
  if (rule?.successfulSaveDamage === "full") return "full";
  return null;
}

export function spellSaveDamageFormula(spellOrId, outcome, slotLevel = null) {
  const rule = getSpellCastResolutionRule(spellOrId);
  const definition = rule?.damageByOutcome?.[String(outcome || "").trim().toLocaleLowerCase("it")];
  const formula = String(definition?.formula || "").trim();
  if (!formula) return "";
  const match = formula.match(/^(\d+)d(\d+)$/iu);
  if (!match) return formula;
  const baseSlot = Math.max(0, Math.floor(Number(definition?.baseSlot) || 0));
  const additionalPerSlotAbove = Math.max(0, Math.floor(Number(definition?.additionalPerSlotAbove) || 0));
  const resolvedSlot = Number.isFinite(Number(slotLevel))
    ? Math.max(baseSlot, Math.floor(Number(slotLevel)))
    : baseSlot;
  const additionalDice = Math.max(0, resolvedSlot - baseSlot) * additionalPerSlotAbove;
  return `${Number(match[1]) + additionalDice}d${match[2]}`;
}
