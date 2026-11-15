import spellReferenceRuntime from "./spell-reference-it-runtime.json" with { type: "json" };
import { READIED_ACTION_CONDITION } from "./reactionTrackerCore.js";

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
  // CAP-ORIGIN, lotto O4. Freezing Sphere (PHB 2014): the caster may keep the globe instead of firing it. "Scaglia subito"
  // is the cast as before (phase "cast", the default: immediateCast); "Trattieni il globo" puts the globe's pill on the
  // caster (phase "prepare"), with no expiry of its own and the round it explodes at (preparedRoundLimit). Its ⚡ throws
  // it, or makes it explode where it lies: the same sphere, saves and damage, resolved in the panel as Symbol's glyph
  // (SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS), the pill dismissed in the same command.
  "freezing-sphere": Object.freeze({
    prepareOnly: false,
    immediateCast: Object.freeze({ label: "Scaglia subito" }),
    prepareLabel: "Trattieni il globo",
    resolveAction: "dismiss",
    resolveLabel: "Lancia il globo",
    resolvePhaseLabel: "Esplosione del globo",
    preparedExpiry: Object.freeze({ mode: "manual" }),
    preparedRoundLimit: Object.freeze({ rounds: 10 }),
    prepared: (slot) => freezeEffect({
      id: "freezing-sphere-globe",
      label: `Globo di Otiluke / ${10 + Math.max(0, slot - 6)}d6 freddo`,
      detail: `Il globo è in mano al caster o a chi lo riceve: si lancia entro 12 m (o con una fionda) ed esplode come l'incantesimo, una sfera di 18 m di raggio, TS Costituzione, ${10 + Math.max(0, slot - 6)}d6 freddo, metà se superato. Si può posare senza romperlo; dopo 1 minuto esplode da solo, dove si trova.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "freezing-sphere-globe", label: "Globo trattenuto" }),
        Object.freeze({ id: "freezing-sphere-globe-damage", label: `${10 + Math.max(0, slot - 6)}d6 freddo` }),
      ]),
    }),
    resolution: () => null,
  }),
  // Symbol (2014): the cast only traces the glyph, with its effect; the zone and the saves come when it is triggered.
  "symbol": Object.freeze({
    prepareOnly: true,
    resolveAction: "dismiss",
    resolveLabel: "Attiva",
    resolvePhaseLabel: "Attivazione del glifo",
    preparedExpiry: Object.freeze({ mode: "manual" }),
    prepared: () => null,
    resolution: () => null,
  }),
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
      detail: `Il prossimo colpo con arma infligge ${slot}d6 radiosi extra e rende il bersaglio visibile, impedendogli di diventare invisibile finché dura l'incantesimo.`,
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
      // Il colpo e l'esplosione si risolvono nel popup della sua azione
      // (lightning-arrow-area, con directHit): qui nessun esito d'attacco.
      outcomes: Object.freeze([]),
      outcomeRequired: false,
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

// The readied spell (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6a, decisions P1–P12): the Ready action holds a spell cast
// with 1 action (PHB 2014, chapter 9). It is cast on the caster's turn (phase "prepare": the slot spent, the other
// concentrations ended), its energy held with concentration whatever the spell (spellCastContextCore.js), until the
// start of the caster's next turn; it is released with the reaction (lot T6c: the spell's own cast, no slot, the targets
// then, the hold ended in the same command, a concentration of its own if the spell needs one). castContext.readied
// marks the hold.
// Its pill on the caster is the creature's «Azione preparata» (P5: the card's menu reads it), with the spell in its label.
export const READIED_SPELL_CONDITION = READIED_ACTION_CONDITION;
// Until the start of the caster's next turn, as Shield's: its spell record and its pill end there (and the hold's
// concentration with the record).
export const READIED_SPELL_EXPIRY = Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
const SRD_ONE_ACTION_IDS = new Set(spellReferenceRuntime.oneActionIds || []);
const ONE_ACTION = /^1 azione(?! bonus)/u;
// Two-phase spells that stay out: Symbol is traced, not held; Flame Arrows and the smites keep their own phases.
// Freezing Sphere is readied in its «Scaglia subito» form, the globe stays its own phase.
const READIED_SPELL_EXCLUDED = new Set(Object.keys(PHASED_SPELLS).filter((id) => id !== "freezing-sphere"));

// Cast with 1 action: the SRD's from the runtime excerpt, the others' from their Italian reference.
export function spellCastWithOneAction(spell) {
  const id = spellId(spell);
  if (!id) return false;
  if (SRD_ONE_ACTION_IDS.has(id)) return true;
  return ONE_ACTION.test(String(spell?.italianReference?.castingTime || spell?.castingTime || "").trim());
}

export function spellCanBeReadied(spell) {
  return spellCastWithOneAction(spell) && !READIED_SPELL_EXCLUDED.has(spellId(spell));
}

// The hold as its own phase «prepare»: a spell without phases of its own (Freezing Sphere's «prepare» is its globe).
export function spellReadiedPhaseAvailable(spell) {
  return spellCanBeReadied(spell) && !PHASED_SPELLS[spellId(spell)];
}

export function isReadiedSpellCastContext(castContext = null) {
  return castContext?.readied === true;
}

// "Azione preparata · Palla di fuoco (3°)": the spell and, for a leveled one, the slot spent.
export function readiedSpellLabel(spell, castContext = {}) {
  const name = String(spell?.displayName || spell?.name || spellId(spell) || "Incantesimo").trim();
  const level = Math.max(0, Math.floor(Number(spell?.level) || 0));
  return `${READIED_SPELL_CONDITION} · ${name}${level > 0 ? ` (${slotLevel(spell, castContext)}°)` : ""}`;
}

function readiedSpellEffect(spell, castContext = {}) {
  const name = String(spell?.displayName || spell?.name || spellId(spell) || "Incantesimo").trim();
  return freezeEffect({
    id: "readied-spell",
    label: READIED_SPELL_CONDITION,
    displayLabel: readiedSpellLabel(spell, castContext),
    detail: `${name} preparato: si rilascia con la reazione, quando avviene ciò che si è scelto al tavolo, prima dell'inizio del prossimo turno del caster. La concentrazione lo trattiene: se si rompe, l'incantesimo svanisce e lo slot resta speso.`,
    summaryParts: Object.freeze([Object.freeze({ id: "readied-spell", label: `Preparato: ${name}` })]),
    // A creature not on the players' side keeps its readied spell to the GM (decision P10, as Hidden).
    ...(castContext?.readiedGmOnly === true ? { mechanics: Object.freeze({ gmOnly: true }) } : {}),
  });
}

// The hold of a readied spell: on the caster, the pill only, no automation of the spell, its concentration replacing
// the others. Its release is no phase of its own (lot T6c): it is the spell's own cast, its targets, outcomes and
// duration those of a cast, with the hold named apart (readiedSpellHoldOf).
function readiedSpellPhasePlan(spell, castContext = {}) {
  return {
    phase: "prepare",
    readied: true,
    subjectMode: "caster",
    useCatalogAutomation: false,
    attack: null,
    effects: [readiedSpellEffect(spell, castContext)],
    resolution: null,
    concentrationAction: "replace",
    preparedExpiry: { ...READIED_SPELL_EXPIRY },
  };
}

// The record of a hold (lot T6c, decisions P5–P7): a readied spell kept on its caster, released with the reaction.
// Its spell has no phases of its own (Freezing Sphere's «prepare» is its globe).
export function isReadiedSpellHold({ spell = null, castContext = null } = {}) {
  return isReadiedSpellCastContext(castContext)
    && String(castContext?.phase || "").trim() === "prepare"
    && spellReadiedPhaseAvailable(spell);
}

// The release in words: «Rilascia» on its button, «Rilascio: Palla di fuoco» in the History and in the log.
export const READIED_SPELL_RELEASE_LABEL = "Rilascia";
export function readiedSpellReleaseHistoryLabel(spell) {
  return `Rilascio: ${String(spell?.displayName || spell?.name || spellId(spell) || "Incantesimo").trim()}`;
}

function slotLevel(spell, castContext = {}) {
  const base = Math.max(1, Math.floor(Number(spell?.level) || 1));
  const requested = Math.floor(Number(castContext?.slotLevel));
  return Number.isFinite(requested) ? Math.max(base, Math.min(9, requested)) : base;
}

export function getSpellCastPhaseOptions(value, requestedPhase = "") {
  const rule = PHASED_SPELLS[spellId(value)];
  // A spell the Ready action can hold (lot T6b, decision P1), asked for its hold: cast at once, or prepared on the caster.
  // The panel shows the second as its «Prepara» button beside the primary one, not as a tab (readied); a cast has no
  // phases, as before (the quick actions cast it at once).
  if (!rule) {
    return String(requestedPhase || "").trim() === "prepare" && spellCanBeReadied(value)
      ? [{ value: "cast", label: "Lancio" }, { value: "prepare", label: "Prepara incantesimo", readied: true }]
      : [];
  }
  const phase = String(requestedPhase || "").trim().toLocaleLowerCase("it");
  // A spell cast as before by default, or prepared (Freezing Sphere's globe); its resolution comes from the pill.
  if (rule.immediateCast) {
    return phase === "resolve"
      ? [{ value: "resolve", label: rule.resolvePhaseLabel || "Risoluzione" }]
      : [
        { value: "cast", label: rule.immediateCast.label || "Lancio" },
        { value: "prepare", label: rule.prepareLabel || "Preparazione sul caster" },
      ];
  }
  if (rule.prepareOnly) {
    if (rule.preparedResolution === false) {
      return [{ value: "prepare", label: "Preparazione sul caster" }];
    }
    return [phase === "resolve"
      ? { value: "resolve", label: rule.resolvePhaseLabel || "Risoluzione del colpo" }
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
  // Cast as before unless prepared: a Freezing Sphere without its phase is never a kept globe.
  if (PHASED_SPELLS[spellId(spell)].immediateCast) return false;
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

// Resolved in the panel, with its own area (Symbol): no creatures to select first, and the pill gets its ⚡.
export function spellPreparedResolutionInPanel(spell) {
  return !!PHASED_SPELLS[spellId(spell)]?.resolveLabel;
}

export function spellPreparedResolutionLabel(spell) {
  return PHASED_SPELLS[spellId(spell)]?.resolveLabel || "Risolvi";
}

export function getSpellCastPhasePlan(spell, requestedPhase = "", castContext = {}) {
  // A readied spell's hold, whatever its table (lot T6a); its release is the spell's own cast (lot T6c).
  if (isReadiedSpellCastContext(castContext) && spellCanBeReadied(spell)
    && String(requestedPhase || castContext?.phase || "prepare").trim() === "prepare") return readiedSpellPhasePlan(spell, castContext);
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

  // Cast as before (Freezing Sphere fired at once): the plan of a spell without phases. Its phase can come with the cast
  // context alone (a cast outside the panel, "prepare" for the kept globe).
  if (rule.immediateCast) {
    const requested = String(requestedPhase || castContext?.phase || "").trim();
    if (!["prepare", "resolve"].includes(requested)) {
      return {
        phase: "cast",
        subjectMode: spell?.targetMode || "selected",
        useCatalogAutomation: true,
        effects: null,
        concentrationAction: "replace",
      };
    }
    requestedPhase = requested;
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
      effects: [rule.prepared(slotLevel(spell, castContext))].filter(Boolean),
      resolution: null,
      concentrationAction: "replace",
      ...(rule.preparedExpiry ? { preparedExpiry: rule.preparedExpiry } : {}),
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

// The round a prepared pill gives way at (Freezing Sphere's globe explodes 1 minute after the cast), in its summary:
// "Esplode al round N", from the round of the cast. Nothing out of initiative, nor for another spell (decision D8).
export function spellPreparedRoundSummaryParts(spell, castContext = {}, appliedAt = null) {
  const limit = PHASED_SPELLS[spellId(spell)]?.preparedRoundLimit;
  const round = Math.floor(Number(appliedAt?.round));
  if (!limit || String(castContext?.phase || "").trim() !== "prepare" || !Number.isInteger(round) || round < 1) return [];
  return [{ id: `${spellId(spell)}-prepared-round`, label: `Esplode al round ${round + limit.rounds}` }];
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
