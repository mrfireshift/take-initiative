const freezeEffect = (effect) => Object.freeze({
  kind: "buff",
  manualRemoval: true,
  endsParentOnRemoval: true,
  parentRemoval: "spell",
  ...effect,
});

const PHASED_SPELLS = Object.freeze({
  "phb2014-colpo-intrappolante": Object.freeze({
    resolveAction: "extend",
    prepared: (slot) => freezeEffect({
      id: "ensnaring-strike-ready",
      label: `Prossimo colpo / TS For o Trattenuto / ${slot}d6 per turno`,
      detail: `Il prossimo colpo con arma innesca il TS; se fallisce, il bersaglio è Trattenuto e subisce ${slot}d6 perforanti a inizio turno.`,
      mechanics: {
        savingThrow: { ability: "Forza", failureCondition: "Trattenuto" },
        ongoingDamage: { dice: `${slot}d6`, type: "perforanti", timing: "turn-start" },
      },
    }),
  }),
  "phb2014-punizione-collerica": Object.freeze({
    resolveAction: "extend",
    prepared: () => freezeEffect({
      id: "wrathful-smite-ready",
      label: "Prossimo colpo / +1d6 psichici / TS o Spaventato",
      detail: "Il prossimo colpo in mischia infligge 1d6 psichici extra e può rendere Spaventato il bersaglio.",
      mechanics: {
        damageBonus: { dice: "1d6", type: "psichici" },
        savingThrow: { ability: "Saggezza", failureCondition: "Spaventato" },
      },
    }),
  }),
  "phb2014-punizione-incandescente": Object.freeze({
    resolveAction: "extend",
    prepared: (slot) => freezeEffect({
      id: "searing-smite-ready",
      label: `Prossimo colpo / +${slot}d6 fuoco / incendio`,
      detail: `Il prossimo colpo in mischia infligge ${slot}d6 fuoco extra e incendia il bersaglio.`,
      mechanics: {
        damageBonus: { dice: `${slot}d6`, type: "fuoco" },
        ongoingDamage: { dice: "1d6", type: "fuoco", timing: "turn-start" },
      },
    }),
  }),
  "phb2014-punizione-tonante": Object.freeze({
    resolveAction: "dismiss",
    prepared: () => freezeEffect({
      id: "thunderous-smite-ready",
      label: "Prossimo colpo / +2d6 tuono / spinta 3 m / TS o Prono",
      detail: "Il prossimo colpo in mischia infligge 2d6 tuono extra; il bersaglio può essere spinto di 3 metri e reso Prono.",
      mechanics: {
        damageBonus: { dice: "2d6", type: "tuono" },
        forcedMovement: { distanceMeters: 3, direction: "away" },
        savingThrow: { ability: "Forza", failureCondition: "Prono" },
      },
    }),
  }),
  "phb2014-raffica-di-spine": Object.freeze({
    resolveAction: "dismiss",
    excludeResolvedEffects: true,
    prepared: (slot) => freezeEffect({
      id: "hail-of-thorns-trigger",
      label: `Prossimo attacco a distanza / area ${Math.min(6, slot)}d10 perforanti`,
      detail: `Il prossimo attacco a distanza innesca un'area da ${Math.min(6, slot)}d10 danni perforanti.`,
      mechanics: {
        areaDamage: { dice: `${Math.min(6, slot)}d10`, type: "perforanti" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
    resolution: (slot) => freezeEffect({
      id: "hail-of-thorns-resolution",
      label: `Raffica di Spine / area ${Math.min(6, slot)}d10 perforanti`,
      detail: `Risolvi il TS Destrezza dell'area da ${Math.min(6, slot)}d10.`,
      mechanics: {
        areaDamage: { dice: `${Math.min(6, slot)}d10`, type: "perforanti" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
  }),
  "phb2014-freccia-folgorante": Object.freeze({
    resolveAction: "dismiss",
    excludeResolvedEffects: true,
    prepared: (slot) => freezeEffect({
      id: "lightning-arrow-trigger",
      label: `Prossimo attacco a distanza / ${slot + 1}d8 / area ${slot - 1}d8 fulmine`,
      detail: `Il prossimo attacco a distanza infligge ${slot + 1}d8 fulmine al bersaglio e ${slot - 1}d8 alle creature vicine.`,
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
      mechanics: {
        damageReplacement: { dice: `${slot + 1}d8`, type: "fulmine" },
        areaDamage: { dice: `${slot - 1}d8`, type: "fulmine" },
        savingThrow: { ability: "Destrezza", successDamage: "half" },
      },
    }),
  }),
  "phb2014-punizione-accecante": Object.freeze({
    resolveAction: "extend",
    prepared: () => freezeEffect({
      id: "blinding-smite-ready",
      label: "Prossimo colpo / +3d8 radiosi / TS o Accecato",
      detail: "Il prossimo colpo in mischia infligge 3d8 radiosi extra e può Accecare il bersaglio.",
      mechanics: {
        damageBonus: { dice: "3d8", type: "radiosi" },
        savingThrow: { ability: "Costituzione", failureCondition: "Accecato" },
      },
    }),
  }),
  "phb2014-punizione-demoralizzante": Object.freeze({
    resolveAction: "dismiss",
    prepared: () => freezeEffect({
      id: "staggering-smite-ready",
      label: "Prossimo colpo / +4d6 psichici / penalità",
      detail: "Il prossimo colpo in mischia infligge 4d6 psichici extra e può imporre svantaggi e bloccare le reazioni.",
      mechanics: {
        damageBonus: { dice: "4d6", type: "psichici" },
        savingThrow: { ability: "Saggezza", failureEffect: "staggered" },
      },
    }),
  }),
  "phb2014-punizione-esiliante": Object.freeze({
    resolveAction: "extend",
    prepared: () => freezeEffect({
      id: "banishing-smite-ready",
      label: "Prossimo colpo / +5d10 forza / esilio a 50 PF",
      detail: "Il prossimo colpo infligge 5d10 forza extra e può esiliare il bersaglio se lo porta a 50 PF o meno.",
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

export function getSpellCastPhaseOptions(value) {
  if (!PHASED_SPELLS[spellId(value)]) return [];
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

  const phase = requestedPhase === "resolve" ? "resolve" : "prepare";
  if (phase === "prepare") {
    return {
      phase,
      subjectMode: "caster",
      useCatalogAutomation: false,
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
      : null,
    concentrationAction: rule.resolveAction,
  };
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
