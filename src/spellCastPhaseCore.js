const freezeEffect = (effect) => Object.freeze({
  kind: "buff",
  manualRemoval: true,
  endsParentOnRemoval: true,
  parentRemoval: "spell",
  ...effect,
});

export const PREPARED_ATTACK_OUTCOMES = Object.freeze([
  "hit",
  "miss",
  "critical",
]);

const meleeWeaponAttack = Object.freeze({
  required: true,
  restriction: "weapon-melee",
  outcomes: PREPARED_ATTACK_OUTCOMES,
  consumeOnMiss: false,
});

const rangedWeaponAttack = Object.freeze({
  required: true,
  restriction: "weapon-ranged",
  outcomes: PREPARED_ATTACK_OUTCOMES,
  consumeOnMiss: false,
});

const weaponAttack = Object.freeze({
  required: true,
  restriction: "weapon",
  outcomes: PREPARED_ATTACK_OUTCOMES,
  consumeOnMiss: false,
});

const PHASED_SPELLS = Object.freeze({
  "phb2014-colpo-intrappolante": Object.freeze({
    resolveAction: "extend",
    attack: weaponAttack,
    prepared: (slot) => freezeEffect({
      id: "ensnaring-strike-ready",
      label: `Prossimo colpo / TS For o Trattenuto / ${slot}d6 per turno`,
      detail: `Il prossimo colpo con arma innesca il TS; se fallisce, il bersaglio è Trattenuto e subisce ${slot}d6 perforanti a inizio turno.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "ensnaring-strike-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "ensnaring-strike-recurring-damage", label: `${slot}d6 perforanti/turno` }),
      ]),
      mechanics: {
        savingThrow: { ability: "Forza", failureCondition: "Trattenuto" },
        ongoingDamage: { dice: `${slot}d6`, type: "perforanti", timing: "turn-start" },
      },
    }),
  }),
  "phb2014-punizione-collerica": Object.freeze({
    prepareOnly: true,
    resolveAction: "extend",
    attack: meleeWeaponAttack,
    prepared: () => freezeEffect({
      id: "wrathful-smite-ready",
      label: "Prossimo colpo / +1d6 psichici / TS o Spaventato",
      detail: "Il prossimo colpo in mischia infligge 1d6 psichici extra e può rendere Spaventato il bersaglio.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "wrathful-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "wrathful-smite-damage", label: "+1d6 psichici" }),
      ]),
      mechanics: {
        damageBonus: { dice: "1d6", type: "psichici" },
        savingThrow: { ability: "Saggezza", failureCondition: "Spaventato" },
      },
    }),
  }),
  "phb2014-punizione-incandescente": Object.freeze({
    prepareOnly: true,
    resolveAction: "extend",
    attack: meleeWeaponAttack,
    prepared: (slot) => freezeEffect({
      id: "searing-smite-ready",
      label: `Prossimo colpo / +${slot}d6 fuoco / incendio`,
      detail: `Il prossimo colpo in mischia infligge ${slot}d6 fuoco extra e incendia il bersaglio.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "searing-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "searing-smite-trigger-damage", label: `+${slot}d6 fuoco` }),
        Object.freeze({ id: "searing-smite-trigger-recurring-damage", label: "1d6 fuoco/inizio turno" }),
      ]),
      mechanics: {
        damageBonus: { dice: `${slot}d6`, type: "fuoco" },
        ongoingDamage: { dice: "1d6", type: "fuoco", timing: "turn-start" },
      },
    }),
  }),
  "branding-smite": Object.freeze({
    prepareOnly: true,
    resolveAction: "extend",
    attack: weaponAttack,
    prepared: (slot) => freezeEffect({
      id: "branding-smite-ready",
      label: `Prossimo colpo / +${slot}d6 radiosi / bagliore astrale`,
      detail: `Il prossimo colpo con arma infligge ${slot}d6 radiosi extra e rende il bersaglio visibile, impedendogli di diventare invisibile finché dura la spell.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "branding-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "branding-smite-trigger-damage", label: `+${slot}d6 radiosi` }),
      ]),
      mechanics: {
        damageBonus: { dice: `${slot}d6`, type: "radiosi" },
      },
    }),
  }),
  "phb2014-punizione-tonante": Object.freeze({
    prepareOnly: true,
    resolveAction: "dismiss",
    attack: meleeWeaponAttack,
    prepared: () => freezeEffect({
      id: "thunderous-smite-ready",
      label: "Prossimo colpo / +2d6 tuono / spinta 3 m / TS o Prono",
      detail: "Il prossimo colpo in mischia infligge 2d6 tuono extra; il bersaglio può essere spinto di 3 metri e reso Prono.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "thunderous-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "thunderous-smite-damage", label: "+2d6 tuono" }),
        Object.freeze({ id: "thunderous-smite-push", label: "Spinta 3 m" }),
      ]),
      mechanics: {
        damageBonus: { dice: "2d6", type: "tuono" },
        forcedMovement: { distanceMeters: 3, direction: "away" },
        savingThrow: { ability: "Forza", failureCondition: "Prono" },
      },
    }),
  }),
  "phb2014-raffica-di-spine": Object.freeze({
    resolveAction: "dismiss",
    attack: Object.freeze({
      ...rangedWeaponAttack,
      outcomeRequired: false,
      areaAnchor: "primary-target",
    }),
    excludeResolvedEffects: true,
    prepared: (slot) => freezeEffect({
      id: "hail-of-thorns-trigger",
      label: `Prossimo attacco a distanza / area ${Math.min(6, slot)}d10 perforanti`,
      detail: `Il prossimo attacco a distanza innesca un'area da ${Math.min(6, slot)}d10 danni perforanti.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "hail-of-thorns-trigger-attack", label: "Pross. att. distanza" }),
        Object.freeze({ id: "hail-of-thorns-trigger-area", label: "Area 1,5 m" }),
        Object.freeze({ id: "hail-of-thorns-trigger-damage", label: `${Math.min(6, slot)}d10 perforanti` }),
      ]),
      mechanics: {
        areaDamage: { dice: `${Math.min(6, slot)}d10`, type: "perforanti" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
    resolution: (slot) => freezeEffect({
      id: "hail-of-thorns-resolution",
      label: `Raffica di Spine / area ${Math.min(6, slot)}d10 perforanti`,
      detail: `Risolvi il TS Destrezza dell'area da ${Math.min(6, slot)}d10.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "hail-of-thorns-resolution-area", label: "Area 1,5 m" }),
        Object.freeze({ id: "hail-of-thorns-resolution-damage", label: `${Math.min(6, slot)}d10 perforanti` }),
      ]),
      mechanics: {
        areaDamage: { dice: `${Math.min(6, slot)}d10`, type: "perforanti" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
  }),
  "xanathar-frecce-infuocate": Object.freeze({
    prepareOnly: true,
    preparedResolution: false,
    prepared: () => freezeEffect({
      id: "flame-arrows-ready",
      label: "Munizioni infuocate / +1d6 fuoco",
      detail: "Ogni munizione estratta dalla faretra aggiunge 1d6 danni da fuoco quando colpisce. La magia sulla munizione termina quando colpisce o manca.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "flame-arrows-extra-fire", label: "+1d6 fuoco" }),
      ]),
      mechanics: Object.freeze({
        damageBonus: Object.freeze({ dice: "1d6", type: "fuoco", sourceOnly: true }),
      }),
    }),
  }),
  "phb2014-freccia-folgorante": Object.freeze({
    resolveAction: "dismiss",
    attack: Object.freeze({
      ...rangedWeaponAttack,
      // Il tiro per colpire viene risolto al tavolo. La risoluzione preparata
      // riceve soltanto il danno primario finale già determinato dal GM.
      outcomes: Object.freeze([]),
      outcomeRequired: false,
      primaryDamageMode: "final-applied",
      consumeOnMiss: true,
      missResolves: true,
      areaAnchor: "primary-target",
    }),
    excludeResolvedEffects: true,
    prepared: (slot) => freezeEffect({
      id: "lightning-arrow-trigger",
      label: `Prossimo attacco a distanza / ${slot + 1}d8 / area ${slot - 1}d8 fulmine`,
      detail: `Il prossimo attacco a distanza infligge ${slot + 1}d8 fulmine al bersaglio e ${slot - 1}d8 alle creature vicine.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "lightning-arrow-trigger-attack", label: "Pross. att. distanza" }),
        Object.freeze({ id: "lightning-arrow-trigger-primary-damage", label: `${slot + 1}d8 fulmine` }),
        Object.freeze({ id: "lightning-arrow-trigger-area-damage", label: `Area 3 m: ${slot - 1}d8 fulmine` }),
      ]),
      mechanics: {
        damageReplacement: { dice: `${slot + 1}d8`, type: "fulmine" },
        areaDamage: { dice: `${slot - 1}d8`, type: "fulmine" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
    resolution: (slot) => freezeEffect({
      id: "lightning-arrow-resolution",
      label: `Freccia Folgorante / ${slot + 1}d8 + area ${slot - 1}d8 fulmine`,
      detail: `Risolvi il bersaglio colpito e il TS dell'area da ${slot - 1}d8.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "lightning-arrow-resolution-primary-damage", label: `${slot + 1}d8 fulmine` }),
        Object.freeze({ id: "lightning-arrow-resolution-area-damage", label: `Area 3 m: ${slot - 1}d8 fulmine` }),
      ]),
      mechanics: {
        damageReplacement: { dice: `${slot + 1}d8`, type: "fulmine" },
        areaDamage: { dice: `${slot - 1}d8`, type: "fulmine" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
  }),
  "phb2014-punizione-accecante": Object.freeze({
    prepareOnly: true,
    resolveAction: "extend",
    attack: meleeWeaponAttack,
    prepared: () => freezeEffect({
      id: "blinding-smite-ready",
      label: "Prossimo colpo / +3d8 radiosi / TS o Accecato",
      detail: "Il prossimo colpo in mischia infligge 3d8 radiosi extra e può Accecare il bersaglio.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "blinding-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "blinding-smite-damage", label: "+3d8 radiosi" }),
      ]),
      mechanics: {
        damageBonus: { dice: "3d8", type: "radiosi" },
        savingThrow: { ability: "Costituzione", failureCondition: "Accecato" },
      },
    }),
  }),
  "phb2014-punizione-demoralizzante": Object.freeze({
    prepareOnly: true,
    resolveAction: "dismiss",
    attack: meleeWeaponAttack,
    prepared: () => freezeEffect({
      id: "staggering-smite-ready",
      label: "Prossimo colpo / +4d6 psichici / penalità",
      detail: "Il prossimo colpo in mischia infligge 4d6 psichici extra e può imporre svantaggi e bloccare le reazioni.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "staggering-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "staggering-smite-damage", label: "+4d6 psichici" }),
      ]),
      mechanics: {
        damageBonus: { dice: "4d6", type: "psichici" },
        savingThrow: { ability: "Saggezza", failureEffect: "staggered" },
      },
    }),
  }),
  "phb2014-punizione-esiliante": Object.freeze({
    prepareOnly: true,
    resolveAction: "extend",
    attack: weaponAttack,
    prepared: () => freezeEffect({
      id: "banishing-smite-ready",
      label: "Prossimo colpo / +5d10 forza / esilio a 50 PF",
      detail: "Il prossimo colpo infligge 5d10 forza extra e può esiliare il bersaglio se lo porta a 50 PF o meno.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "banishing-smite-trigger", label: "Pross. colpo" }),
        Object.freeze({ id: "banishing-smite-damage", label: "+5d10 forza" }),
        Object.freeze({ id: "banishing-smite-threshold", label: "Esilio ≤50 PF" }),
      ]),
      mechanics: {
        damageBonus: { dice: "5d10", type: "forza" },
        banishmentThresholdHp: 50,
      },
    }),
  }),
});

function spellId(value) {
  return String(value?.id || value || "").trim();
}

function slotLevel(spell, castContext = {}) {
  const base = Math.max(1, Math.floor(Number(spell?.level) || 1));
  const requested = Math.floor(Number(castContext?.slotLevel));
  return Number.isFinite(requested) ? Math.max(base, Math.min(9, requested)) : base;
}

export function getSpellCastPhaseOptions(value, requestedPhase = "") {
  const rule = PHASED_SPELLS[spellId(value)];
  if (!rule) return [];
  const phase = String(requestedPhase || "").trim().toLocaleLowerCase("it");
  if (rule.prepareOnly) {
    if (rule.preparedResolution === false) {
      return [{ value: "prepare", label: "Preparazione sul caster" }];
    }
    return [phase === "resolve"
      ? { value: "resolve", label: "Risoluzione del colpo" }
      : { value: "prepare", label: "Preparazione sul caster" }];
  }
  return [
    { value: "prepare", label: "Preparazione sul caster" },
    { value: "resolve", label: "Risoluzione del colpo" },
  ];
}

export function isPreparedSpellCast({
  spell = null,
  castContext = null,
  casterId = "",
  targetIds = [],
} = {}) {
  if (!PHASED_SPELLS[spellId(spell)]) return false;
  const phase = String(castContext?.phase || "").trim().toLocaleLowerCase("it");
  if (phase) return phase === "prepare";
  const caster = String(casterId || "").trim();
  const targets = Array.from(new Set(
    (Array.isArray(targetIds) ? targetIds : [])
      .map((targetId) => String(targetId || "").trim())
      .filter(Boolean)
  ));
  return !!caster && targets.length === 1 && targets[0] === caster;
}

export function spellPreparedResolutionAvailable(spell) {
  const rule = PHASED_SPELLS[spellId(spell)];
  return !!rule && rule.preparedResolution !== false;
}

export function getSpellCastPhasePlan(spell, requestedPhase = "", castContext = {}) {
  const rule = PHASED_SPELLS[spellId(spell)];
  if (!rule) {
    return {
      phase: "cast",
      subjectMode: spell?.targetMode || "selected",
      useCatalogAutomation: true,
      effects: null,
      concentrationAction: "replace",
    };
  }

  const phase = requestedPhase === "resolve" && rule.preparedResolution !== false
    ? "resolve"
    : "prepare";
  if (phase === "prepare") {
    return {
      phase,
      subjectMode: "caster",
      useCatalogAutomation: false,
      attack: rule.attack || null,
      effects: [rule.prepared(slotLevel(spell, castContext))],
      resolution: null,
      concentrationAction: "replace",
    };
  }
  return {
    phase,
    subjectMode: "selected",
    useCatalogAutomation: true,
    effects: rule.excludeResolvedEffects ? [] : null,
      resolution: typeof rule.resolution === "function"
        ? rule.resolution(slotLevel(spell, castContext))
      : rule.prepared(slotLevel(spell, castContext)),
    attack: rule.attack || null,
    concentrationAction: rule.resolveAction,
  };
}

export function spellPhaseAttackOutcomeRequired(phasePlan = null) {
  return phasePlan?.phase === "resolve"
    && phasePlan?.attack?.required === true
    && phasePlan?.attack?.outcomeRequired !== false;
}

export function spellPhaseUsesPrimaryTargetAnchor(phasePlan = null) {
  return phasePlan?.phase === "resolve"
    && phasePlan?.attack?.areaAnchor === "primary-target";
}

export function findActiveSpellConcentration(concentrations, spell) {
  if (!concentrations || typeof concentrations !== "object" || !spell) return null;
  const candidates = new Set([
    spellId(spell).toLocaleLowerCase("it"),
    String(spell?.name || "").trim().toLocaleLowerCase("it"),
    String(spell?.displayName || "").trim().toLocaleLowerCase("it"),
  ].filter(Boolean));
  for (const [key, entry] of Object.entries(concentrations)) {
    const values = [
      key,
      entry?.spellId,
      entry?.name,
    ].map((value) => String(value || "").trim().toLocaleLowerCase("it"));
    if (values.some((value) => candidates.has(value))) return { key, ...entry };
  }
  return null;
}

export function withSpellPhaseTransitionOperations({
  operations = [],
  phasePlan = null,
  concentrationAction = "replace",
  activeConcentration = null,
  casterId = "",
} = {}) {
  const caster = String(casterId || "").trim();
  const reference = String(activeConcentration?.instanceId || "").trim();
  if (
    phasePlan?.phase !== "resolve"
    || concentrationAction !== "extend"
    || !caster
    || !reference
  ) {
    return [...operations];
  }
  return [{
    type: "concentration:break-targets",
    casterIds: [caster],
    reference,
    targetIds: [caster],
  }, ...operations];
}
