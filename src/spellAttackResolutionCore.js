const ATTACK_RESOLUTIONS = Object.freeze({
  "acid-arrow": Object.freeze({
    baseSlot: 2,
    initialDice: 4,
    delayedDice: 2,
    sides: 4,
    damageType: "acido",
  }),
  "chill-touch": Object.freeze({
    baseSlot: 0,
    initialDice: 1,
    sides: 8,
    damageType: "necrotico",
    missFactor: "zero",
  }),
  "guiding-bolt": Object.freeze({
    baseSlot: 1,
    initialDice: 4,
    sides: 6,
    damageType: "radiante",
    missFactor: "zero",
  }),
  "ray-of-frost": Object.freeze({
    baseSlot: 0,
    initialDice: 1,
    sides: 8,
    damageType: "freddo",
    missFactor: "zero",
  }),
});

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function dice(count, sides) {
  return `${Math.max(1, Math.floor(Number(count) || 1))}d${Math.max(1, Math.floor(Number(sides) || 1))}`;
}

function hitEffects(spell) {
  const effects = Array.isArray(spell?.effects) ? spell.effects : [];
  return effects.map(clone).filter(Boolean);
}

export function getSpellAttackResolution(spell, choiceValue = "", castContext = {}) {
  const definition = ATTACK_RESOLUTIONS[spell?.id];
  if (!definition) return null;
  const requestedChoice = String(choiceValue || "").trim().toLocaleLowerCase("it");
  const outcome = requestedChoice === "miss" || requestedChoice === "mancato"
    ? "miss"
    : "hit";
  const slotLevel = Math.max(
    definition.baseSlot,
    Math.min(9, Math.floor(Number(castContext?.slotLevel) || definition.baseSlot)),
  );
  const increments = slotLevel - definition.baseSlot;
  const initialDamage = dice(definition.initialDice + increments, definition.sides);
  const delayedDamage = dice(definition.delayedDice + increments, definition.sides);
  const resolution = {
    id: spell.id,
    outcome,
    outcomeLabel: outcome === "hit" ? "Colpito" : "Mancato",
    initialDamage: {
      dice: initialDamage,
      type: definition.damageType,
      factor: outcome === "hit" ? "full" : definition.missFactor || "half",
    },
    ...(outcome === "hit" && hitEffects(spell).length
      ? {
        effects: hitEffects(spell),
        effect: hitEffects(spell)[0],
      }
      : {}),
    ...(outcome === "hit"
      ? {
        deferredEffect: {
          id: "acid-arrow-delayed-acid",
          timing: "turn-end",
          actor: "target",
          anchor: "next-turn",
          reminder: `${delayedDamage} danni da acido`,
          damage: { dice: delayedDamage, type: definition.damageType },
          provenance: {
            spellId: spell.id,
            spellName: spell.displayName || spell.name,
          },
        },
        effect: {
          id: "acid-arrow-delayed-acid",
          kind: "debuff",
          label: `Freccia acida: ${delayedDamage} a fine turno`,
          detail: `Subisce ${delayedDamage} danni da acido alla fine del prossimo turno.`,
          expiry: { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" },
          deferredEffect: {
            id: "acid-arrow-delayed-acid",
            timing: "turn-end",
            actor: "target",
            anchor: "next-turn",
            reminder: `${delayedDamage} danni da acido`,
            damage: { dice: delayedDamage, type: definition.damageType },
            provenance: {
              spellId: spell.id,
              spellName: spell.displayName || spell.name,
            },
          },
        },
      }
      : {}),
  };
  return clone(resolution);
}

export function spellAttackResolutionChoiceOptions(spell) {
  return ATTACK_RESOLUTIONS[spell?.id]
    ? [
      { value: "hit", label: "Colpito" },
      { value: "miss", label: "Mancato" },
    ]
    : [];
}
