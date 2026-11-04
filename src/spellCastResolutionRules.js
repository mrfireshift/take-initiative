import { HEAT_METAL_DROP_CHOICE_EFFECT } from "./spellActiveResolutionRules.js";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

// These declarations describe when HP is part of the current cast. A
// damageType in the catalog is not sufficient: several spells deal damage
// only on a later attack, as a reaction, or through an active action.
const SPELL_CAST_RESOLUTION_RULES = Object.freeze({
  "xanathar-prigione-mentale": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "full",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "5d10", type: "psichici" }),
      failed: Object.freeze({ formula: "5d10", type: "psichici" }),
    }),
  }),
  "grease": Object.freeze({ initialHP: false }),
  // Lotto P1 (docs/PIANO_POLISH_INCANTESIMI.md): their save at the cast deals no damage, and a zone with a save asks for it.
  "entangle": Object.freeze({ initialHP: false }),
  "earthquake": Object.freeze({ initialHP: false }),
  "reverse-gravity": Object.freeze({ initialHP: false }),
  "xanathar-sfera-acquea": Object.freeze({ initialHP: false }),
  "phb2014-allucinazione-di-forza": Object.freeze({ initialHP: false }),
  // Lotto P1: area damage at the cast, in spells with no damage type for the catalog's rule to see.
  "xanathar-eruzione-terrestre": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "3d12", baseSlot: 3, additionalPerSlotAbove: 1, type: "contundenti" }),
      failed: Object.freeze({ formula: "3d12", baseSlot: 3, additionalPerSlotAbove: 1, type: "contundenti" }),
    }),
  }),
  "xanathar-orrido-avvizzimento-di-abi-dalzim": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "12d8", type: "necrotici" }),
      failed: Object.freeze({ formula: "12d8", type: "necrotici" }),
    }),
  }),
  "xanathar-sfera-al-vetriolo": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "10d4", baseSlot: 4, additionalPerSlotAbove: 2, type: "acido" }),
      failed: Object.freeze({ formula: "10d4", baseSlot: 4, additionalPerSlotAbove: 2, type: "acido" }),
    }),
  }),
  "xanathar-creare-falo": Object.freeze({ initialHP: true, successfulSaveDamage: "none" }),
  // Xanathar. The thunder where the caster was; the teleport stays at the table (CAP-TELEPORT).
  "xanathar-passo-del-tuono": Object.freeze({ initialHP: true }),
  // Xanathar. The meteor of the cast, on its 1,5 m; the others stay at the table (CAP-MULTIAREA).
  "xanathar-minuscole-meteore-di-melf": Object.freeze({ initialHP: true }),
  "phb2014-evoca-raffica": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "3d8" }),
      failed: Object.freeze({ formula: "3d8" }),
    }),
  }),
  "phb2014-evoca-pioggia-di-armi": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "8d8" }),
      failed: Object.freeze({ formula: "8d8" }),
    }),
  }),
  // A cantrip: its dice grow with the caster's level, not with a slot.
  "tasha-turbine-di-spade": Object.freeze({ initialHP: true, successfulSaveDamage: "none" }),
  // Only the glyph of Death hurts; half on a success (the default).
  "symbol": Object.freeze({
    initialHP: false,
    initialHPChoices: Object.freeze({ death: true }),
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "10d10", type: "necrotici" }),
      failed: Object.freeze({ formula: "10d10", type: "necrotici" }),
    }),
  }),
  // Only the mud falling from a ceiling hurts; half on a success (the default).
  "xanathar-trasmutare-roccia": Object.freeze({
    initialHP: false,
    initialHPChoices: Object.freeze({ "falling-mud": true }),
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "4d8", type: "contundenti" }),
      failed: Object.freeze({ formula: "4d8", type: "contundenti" }),
    }),
  }),
  // Its initial save blinds; no damage (lotto L3).
  "xanathar-pirotecnica": Object.freeze({ initialHP: false }),
  // Its initial save frightens or attracts; no damage (lotto L3).
  "antipathy-sympathy": Object.freeze({ initialHP: false }),
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
  "wind-wall": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({
        formula: "3d8",
        type: "contundenti",
      }),
      failed: Object.freeze({
        formula: "3d8",
        type: "contundenti",
      }),
    }),
  }),
  "xanathar-turbine": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "10d6", type: "contundenti" }),
      failed: Object.freeze({ formula: "10d6", type: "contundenti" }),
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
  "xanathar-morsa-del-gelo": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
  }),
  // Its first hit; the later ones are the active action, with the plain 1d12.
  "phb2014-dardo-stregato": Object.freeze({
    initialHP: true,
  }),
  "ray-of-enfeeblement": Object.freeze({
    initialHP: false,
  }),
  // Lotto L2 (2014 texts): the dice by slot; the GM enters the final damage.
  "xanathar-catapulta": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "3d8", baseSlot: 1, additionalPerSlotAbove: 1, type: "contundenti" }),
      failed: Object.freeze({ formula: "3d8", baseSlot: 1, additionalPerSlotAbove: 1, type: "contundenti" }),
    }),
  }),
  "hellish-rebuke": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "2d10", baseSlot: 1, additionalPerSlotAbove: 1, type: "fuoco" }),
      failed: Object.freeze({ formula: "2d10", baseSlot: 1, additionalPerSlotAbove: 1, type: "fuoco" }),
    }),
  }),
  "phb2014-sussurri-dissonanti": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "3d6", baseSlot: 1, additionalPerSlotAbove: 1, type: "psichici" }),
      failed: Object.freeze({ formula: "3d6", baseSlot: 1, additionalPerSlotAbove: 1, type: "psichici" }),
    }),
  }),
  // CAP-HP-BRANCH (2014 texts): the damage of the cast; what the hit points decide is in hpBranchSpellRules.js.
  "disintegrate": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "10d6+40", baseSlot: 6, additionalPerSlotAbove: 3, type: "forza" }),
      failed: Object.freeze({ formula: "10d6+40", baseSlot: 6, additionalPerSlotAbove: 3, type: "forza" }),
    }),
  }),
  "finger-of-death": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "7d8+30", type: "necrotici" }),
      failed: Object.freeze({ formula: "7d8+30", type: "necrotici" }),
    }),
  }),
  // CAP-TEMP, lotto T3e (Xanathar): half on a success; an undead takes half the roll as temporary hit points
  // (spellTemporaryHpRules.js), the zombie is in hpBranchSpellRules.js.
  "xanathar-flusso-di-energia-negativa": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "5d12", type: "necrotici" }),
      failed: Object.freeze({ formula: "5d12", type: "necrotici" }),
      immune: Object.freeze({ formula: "5d12", type: "necrotici" }),
    }),
  }),
  // The 4d6 come before the save, whatever its result.
  "feeblemind": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "full",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "4d6", type: "psichici" }),
      failed: Object.freeze({ formula: "4d6", type: "psichici" }),
    }),
  }),
  "power-word-kill": Object.freeze({ initialHP: false }),
  // CAP-STABILIZE: the hit points of a return to life are computed by stabilizeSpellRules.js, never asked.
  "spare-the-dying": Object.freeze({ initialHP: false }),
  "revivify": Object.freeze({ initialHP: false }),
  "raise-dead": Object.freeze({ initialHP: false }),
  "resurrection": Object.freeze({ initialHP: false }),
  "reincarnate": Object.freeze({ initialHP: false }),
  "true-resurrection": Object.freeze({ initialHP: false }),
  // CAP-CLEANSE: the healing of Heal and Power Word Heal is computed by cleanseSpellRules.js, never entered.
  "heal": Object.freeze({ initialHP: false }),
  "phb2014-parola-del-potere-guarire": Object.freeze({ initialHP: false }),
  "lesser-restoration": Object.freeze({ initialHP: false }),
  "dispel-magic": Object.freeze({ initialHP: false }),
  "divine-word": Object.freeze({ initialHP: false }),
  // The roll of each dart is written on its target (magicMissileCore.js): no single damage input.
  "magic-missile": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      failed: Object.freeze({ formula: "1d4+1", type: "forza" }),
    }),
  }),
  // Plant creatures: disadvantage and maximum damage, at the table.
  "blight": Object.freeze({
    initialHP: true,
    damageByOutcome: Object.freeze({
      passed: Object.freeze({ formula: "8d8", baseSlot: 4, additionalPerSlotAbove: 1, type: "necrotici" }),
      failed: Object.freeze({ formula: "8d8", baseSlot: 4, additionalPerSlotAbove: 1, type: "necrotici" }),
    }),
  }),
  "xanathar-sfera-della-tempesta": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
    damageByOutcome: Object.freeze({
      passed: Object.freeze({
        formula: "2d6",
        baseSlot: 4,
        additionalPerSlotAbove: 1,
        type: "contundenti",
      }),
      failed: Object.freeze({
        formula: "2d6",
        baseSlot: 4,
        additionalPerSlotAbove: 1,
        type: "contundenti",
      }),
    }),
  }),
  "xanathar-coltello-di-ghiaccio": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
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
  // Who passes the save is neither hurt nor held: the hand stays, and can reach for someone else.
  "xanathar-stretta-della-terra-di-maximilian": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
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
  "xanathar-scossa-tellurica": Object.freeze({
    initialHP: true,
    successfulSaveDamage: "none",
    damageByOutcome: Object.freeze({
      failed: Object.freeze({
        formula: "1d6",
        baseSlot: 1,
        additionalPerSlotAbove: 1,
        type: "contundenti",
      }),
    }),
  }),
  "xanathar-onda-di-marea": Object.freeze({
    initialHP: true,
  }),
  "branding-smite": { initialHP: false, deferredHP: "next-weapon-hit" },
  "call-lightning": { initialHP: true, deferredHP: "active-action" },
  // Lotto L3: the first line or breath at cast, the next ones as active actions.
  "sunbeam": { initialHP: true, deferredHP: "active-action" },
  "xanathar-drago-illusorio": { deferredHP: "active-action" },
  "chill-touch": { initialHP: true, resolution: "single-attack" },
  "divine-favor": { initialHP: false, deferredHP: "weapon-hit" },
  "dream": { initialHP: false, deferredHP: "variant" },
  "faithful-hound": { initialHP: false, deferredHP: "hound-attack" },
  "fire-shield": { initialHP: false, deferredHP: "reaction" },
  "guiding-bolt": { initialHP: true, resolution: "single-attack" },
  "heat-metal": {
    initialHP: true,
    resolution: "manual-damage",
    postDamageEffects: Object.freeze([HEAT_METAL_DROP_CHOICE_EFFECT]),
  },
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

export function spellHasExplicitInitialHPPolicy(spellOrId, choiceValue = "") {
  const rule = getSpellCastResolutionRule(spellOrId);
  const byChoice = rule?.initialHPChoices?.[String(choiceValue || "").trim()];
  if (typeof byChoice === "boolean") return byChoice;
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

// Nobody takes the damage: a miss, an immune creature, a passed save that spares it. There is nothing to roll.
export function spellCastSparesEveryTarget(spellOrId, targetIds = [], outcomes = {}) {
  const ids = Array.isArray(targetIds) ? targetIds : [];
  return ids.length > 0 && ids.every((targetId) => {
    const outcome = String(outcomes?.[targetId] || "").trim().toLocaleLowerCase("it");
    return outcome === "immune" || (outcome === "passed" && spellSaveDamageFactor(spellOrId, outcome) === "zero");
  });
}

// Decision D4 of docs/PIANO_POLISH_INCANTESIMI.md: the panel proposes the dice of every cast with a damage field. These are
// the spells whose rule has no damageByOutcome, because both outcomes roll the same dice: the save only halves or spares them.
const castDice = (formula, baseSlot = 0, additionalPerSlotAbove = 0, extra = {}) => Object.freeze({
  formula,
  baseSlot,
  additionalPerSlotAbove,
  ...extra,
});
const cantripDice = (formula) => castDice(formula, 0, 0, { cantrip: true });
const SPELL_CAST_DAMAGE_DICE = Object.freeze({
  "acid-arrow": castDice("4d4", 2, 1),
  "burning-hands": castDice("3d6", 1, 1),
  "call-lightning": castDice("3d10", 3, 1),
  "chain-lightning": castDice("10d8"),
  "chill-touch": cantripDice("1d8"),
  "circle-of-death": castDice("8d6", 6, 2),
  "cone-of-cold": castDice("8d8", 5, 1),
  "fire-storm": castDice("7d10"),
  "fireball": castDice("8d6", 3, 1),
  "flame-strike": castDice("4d6+4d6", 5, 1),
  "freezing-sphere": castDice("10d6", 6, 1),
  "guiding-bolt": castDice("4d6", 1, 1),
  "heat-metal": castDice("2d8", 2, 1),
  "ice-storm": castDice("2d8+4d6", 4, 1),
  "incendiary-cloud": castDice("10d8"),
  "insect-plague": castDice("4d10", 5, 1),
  "lightning-bolt": castDice("8d6", 3, 1),
  "meteor-swarm": castDice("20d6+20d6"),
  "ray-of-frost": cantripDice("1d8"),
  "shatter": castDice("3d8", 2, 1),
  // The later rounds of the storm change dice round by round: only the first has one formula.
  "storm-of-vengeance": castDice("2d6", 0, 0, { choices: Object.freeze(["round-1"]) }),
  "sunbeam": castDice("6d8"),
  "sunburst": castDice("12d6"),
  "thunderwave": castDice("2d8", 1, 1),
  "wall-of-ice": castDice("10d6", 6, 2),
  "wall-of-thorns": castDice("7d8", 6, 1),
  "xanathar-aculeo-mentale": castDice("3d8", 2, 1),
  "xanathar-alba": castDice("4d10"),
  "xanathar-coltello-di-ghiaccio": castDice("2d6", 1, 1, {
    hint: "L'esplosione. Prima il tiro per colpire: 1d10 perforanti al bersaglio se colpisce, da applicare a parte.",
  }),
  "xanathar-morsa-del-gelo": cantripDice("1d6"),
  "phb2014-dardo-stregato": castDice("1d12", 1, 1),
  "xanathar-creare-falo": cantripDice("1d8"),
  "xanathar-immolazione": castDice("8d6"),
  "xanathar-minuscole-meteore-di-melf": castDice("2d6"),
  "xanathar-muro-di-luce": castDice("4d8", 5, 1),
  "xanathar-passo-del-tuono": castDice("3d10", 3, 1),
  "xanathar-onda-di-marea": castDice("4d8"),
  "xanathar-parola-radiosa": cantripDice("1d6"),
  "xanathar-rombo-di-tuono": cantripDice("1d6"),
  "xanathar-sciame-di-palle-di-neve-di-snilloc": castDice("3d6", 2, 1),
  "xanathar-scossa-sinaptica": castDice("8d6"),
  "xanathar-stretta-della-terra-di-maximilian": castDice("2d6"),
  "xanathar-urlo-psichico": castDice("14d6"),
  "xanathar-vampa-di-aganazzar": castDice("3d8", 2, 1),
  "tasha-scheggia-della-mente": cantripDice("1d6"),
  "tasha-turbine-di-spade": cantripDice("1d6"),
  "phb2014-braccia-di-hadar": castDice("2d6", 1, 1),
  "phb2014-onda-distruttiva": castDice("5d6"),
  "phb2014-raggio-di-infermita": castDice("2d8", 1, 1),
  "phb2014-tsunami": castDice("6d10"),
});

const spellIdOf = (spellOrId) => String(
  typeof spellOrId === "string" ? spellOrId : spellOrId?.id || "",
).trim();

// A cantrip's dice grow with the character's level, which the panel does not know: the hint says how.
export function spellCantripDamageHint(spellOrId) {
  const definition = SPELL_CAST_DAMAGE_DICE[spellIdOf(spellOrId)];
  if (definition?.hint) return definition.hint;
  const match = definition?.cantrip ? definition.formula.match(/^(\d+)d(\d+)$/iu) : null;
  if (!match) return "";
  const [count, sides] = [Number(match[1]), match[2]];
  return `Al 5° livello ${count * 2}d${sides}, all'11° ${count * 3}d${sides}, al 17° ${count * 4}d${sides}.`;
}

// The dice of the discrete heals, with the slot: the modifier is the caster's, added at the table.
const SPELL_CAST_HEALING_FORMULAS = Object.freeze({
  "cure-wounds": castDice("1d8", 1, 1),
  "healing-word": castDice("1d4", 1, 1),
  "mass-cure-wounds": castDice("3d8", 5, 1),
  "mass-healing-word": castDice("1d4", 3, 1),
  "prayer-of-healing": castDice("2d8", 2, 1),
});

export function spellCastHealingFormula(spellOrId, slotLevel = null) {
  const definition = SPELL_CAST_HEALING_FORMULAS[spellIdOf(spellOrId)];
  if (!definition) return "";
  const match = definition.formula.match(/^(\d+)d(\d+)$/iu);
  const resolvedSlot = Number.isFinite(Number(slotLevel)) && slotLevel !== null
    ? Math.max(definition.baseSlot, Math.floor(Number(slotLevel)))
    : definition.baseSlot;
  const dice = Number(match[1]) + (resolvedSlot - definition.baseSlot) * definition.additionalPerSlotAbove;
  return `${dice}d${match[2]} + mod`;
}

// The hit points a spell can affect, rolled at the table: there is no save, the GM goes from the creature with the fewest.
const SPELL_CAST_HP_POOLS = Object.freeze({
  "color-spray": castDice("6d10", 1, 2),
  "sleep": castDice("5d8", 1, 2),
});

export function spellCastHpPoolFormula(spellOrId, slotLevel = null) {
  const definition = SPELL_CAST_HP_POOLS[spellIdOf(spellOrId)];
  if (!definition) return "";
  const match = definition.formula.match(/^(\d+)d(\d+)$/iu);
  const resolvedSlot = Number.isFinite(Number(slotLevel)) && slotLevel !== null
    ? Math.max(definition.baseSlot, Math.floor(Number(slotLevel)))
    : definition.baseSlot;
  return `${Number(match[1]) + (resolvedSlot - definition.baseSlot) * definition.additionalPerSlotAbove}d${match[2]}`;
}

export function spellSaveDamageFormula(spellOrId, outcome, slotLevel = null, choiceValue = "") {
  const rule = getSpellCastResolutionRule(spellOrId);
  const outcomeKey = String(outcome || "").trim().toLocaleLowerCase("it");
  const definition = rule?.damageByOutcome?.[outcomeKey]
    || (["failed", "passed"].includes(outcomeKey) ? SPELL_CAST_DAMAGE_DICE[spellIdOf(spellOrId)] : null);
  const formula = String(definition?.formula || "").trim();
  if (!formula) return "";
  const choice = String(choiceValue || "").trim();
  if (choice && definition.choices && !definition.choices.includes(choice)) return "";
  // What follows the first dice stays as it is (Disintegrate's 10d6 + 40, Flame Strike's second 4d6); only those dice grow.
  const match = formula.match(/^(\d+)d(\d+)(\s*\+\s*\d+(?:d\d+)?)?$/iu);
  if (!match) return formula;
  const baseSlot = Math.max(0, Math.floor(Number(definition?.baseSlot) || 0));
  const additionalPerSlotAbove = Math.max(0, Math.floor(Number(definition?.additionalPerSlotAbove) || 0));
  const resolvedSlot = Number.isFinite(Number(slotLevel))
    ? Math.max(baseSlot, Math.floor(Number(slotLevel)))
    : baseSlot;
  const additionalDice = Math.max(0, resolvedSlot - baseSlot) * additionalPerSlotAbove;
  return `${Number(match[1]) + additionalDice}d${match[2]}${match[3] ? match[3].replace(/\s/gu, "") : ""}`;
}

// Decision D3 of the same plan: the panel says which save the cast asks for. Here the spells whose zone rule or save
// workflow does not name it. Later saves (zone triggers, repeated saves) have their own reminders and stay out.
const SPELL_CAST_SAVE_ABILITIES = Object.freeze(Object.fromEntries(Object.entries({
  str: [
    "entangle",
    "xanathar-folata",
    "xanathar-sfera-acquea",
    "xanathar-sfera-della-tempesta",
    "xanathar-stretta-della-terra-di-maximilian",
    "tasha-lenza-elettrizzante",
    "phb2014-braccia-di-hadar",
    "phb2014-colpo-intrappolante",
    "phb2014-tsunami",
  ],
  dex: [
    "acid-splash",
    "burning-hands",
    "call-lightning",
    "chain-lightning",
    "earthquake",
    "faerie-fire",
    "fire-storm",
    "fireball",
    "flame-strike",
    "grease",
    "incendiary-cloud",
    "lightning-bolt",
    "meteor-swarm",
    "resilient-sphere",
    "reverse-gravity",
    "sacred-flame",
    "wall-of-fire",
    "wall-of-ice",
    "wall-of-stone",
    "wall-of-thorns",
    "xanathar-coltello-di-ghiaccio",
    "xanathar-creare-falo",
    "xanathar-eruzione-terrestre",
    "xanathar-minuscole-meteore-di-melf",
    "xanathar-onda-di-marea",
    "xanathar-ossa-della-terra",
    "xanathar-sciame-di-palle-di-neve-di-snilloc",
    "xanathar-sfera-al-vetriolo",
    "xanathar-soffio-del-drago",
    "xanathar-vampa-di-aganazzar",
    "tasha-miscela-caustica-di-tasha",
    "tasha-turbine-di-spade",
    "phb2014-raffica-di-spine",
    "phb2014-evoca-raffica",
    "phb2014-freccia-folgorante",
    "phb2014-evoca-pioggia-di-armi",
  ],
  con: [
    "circle-of-death",
    "cone-of-cold",
    "enlarge-reduce",
    "freezing-sphere",
    "harm",
    "insect-plague",
    "levitate",
    "poison-spray",
    "shatter",
    "storm-of-vengeance",
    "sunbeam",
    "sunburst",
    "thunderwave",
    "xanathar-alba",
    "xanathar-infestazione",
    "xanathar-muro-di-luce",
    "xanathar-orrido-avvizzimento-di-abi-dalzim",
    "xanathar-parola-radiosa",
    "xanathar-passo-del-tuono",
    "xanathar-rombo-di-tuono",
    "phb2014-onda-distruttiva",
  ],
  int: [
    "xanathar-scossa-sinaptica",
  ],
  wis: [
    "antipathy-sympathy",
    "confusion",
    "fear",
    "hypnotic-pattern",
    "polymorph",
    "true-polymorph",
    "vicious-mockery",
    "weird",
    "xanathar-drago-illusorio",
    "xanathar-metamorfosi-di-massa",
    "xanathar-rintocco-dei-morti",
  ],
  cha: [
    "calm-emotions",
    "plane-shift",
    "seeming",
  ],
}).flatMap(([ability, spellIds]) => spellIds.map((spellId) => [spellId, ability]))));

// A willing creature does not roll: the panel asks for no outcome, and says so next to the save.
const SPELL_CAST_SAVE_ONLY_IF_UNWILLING = new Set([
  "enlarge-reduce",
  "levitate",
  "plane-shift",
  "polymorph",
  "resilient-sphere",
  "seeming",
  "true-polymorph",
  "xanathar-metamorfosi-di-massa",
]);

export function spellCastSaveOnlyIfUnwilling(spellOrId) {
  return SPELL_CAST_SAVE_ONLY_IF_UNWILLING.has(spellIdOf(spellOrId));
}

export function spellCastSaveAbility(spellOrId) {
  return SPELL_CAST_SAVE_ABILITIES[spellIdOf(spellOrId)] || "";
}
