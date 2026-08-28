const nextTurn = (mode, actor = "source") => Object.freeze({
  mode,
  actor,
  remaining: 1,
  anchor: "next-turn",
});

const rounds = (remaining) => Object.freeze({ mode: "rounds", remaining });
const manual = Object.freeze({ mode: "manual" });
const concentration = Object.freeze({ mode: "concentration" });

function conditionRule(condition, {
  expiry = null,
  independent = false,
  manualRemoval = false,
  endsParentOnRemoval = false,
  effectId = "",
  effectKind = "",
  effectDetail = "",
  summaryParts = null,
  saveReminder = null,
} = {}) {
  const options = independent ? Object.freeze({ parentEffectId: "" }) : null;
  return Object.freeze({
    condition,
    ...(expiry ? { expiry } : {}),
    ...(options ? { options } : {}),
    ...(manualRemoval ? { manualRemoval: true } : {}),
    ...(endsParentOnRemoval ? { endsParentOnRemoval: true } : {}),
    ...(effectId ? { effectId } : {}),
    ...(effectKind ? { effectKind } : {}),
    ...(effectDetail ? { effectDetail } : {}),
    ...(Array.isArray(summaryParts) ? { summaryParts } : {}),
    ...(saveReminder ? { saveReminder } : {}),
  });
}

function debuffRule(condition, effectId, effectDetail, options = {}) {
  return conditionRule(condition, {
    ...options,
    effectId,
    effectKind: "debuff",
    effectDetail,
  });
}

function saveAutomation(rules, {
  passed = [],
  trackOutcomes = ["failed"],
  concentrationAction = "",
  applyOnSpellCast = false,
} = {}) {
  return Object.freeze({
    trackOutcomes: Object.freeze(trackOutcomes),
    ...(passed.length ? { passed: Object.freeze(passed) } : {}),
    failed: Object.freeze(rules),
    ...(concentrationAction ? { concentrationAction } : {}),
    ...(applyOnSpellCast ? { applyOnSpellCast: true } : {}),
  });
}

const concentrationCondition = (condition, saveReminder = null, options = {}) => conditionRule(condition, {
  expiry: concentration,
  manualRemoval: true,
  endsParentOnRemoval: true,
  ...options,
  saveReminder,
});

const concentrationDebuff = (condition, effectId, effectDetail, options = {}) => debuffRule(
  condition,
  effectId,
  effectDetail,
  {
    expiry: concentration,
    manualRemoval: true,
    endsParentOnRemoval: true,
    ...options,
  },
);

export const PHB2014_AREA_SAVE_SPELL_IDS = Object.freeze([
  "phb2014-braccia-di-hadar",
  "phb2014-raffica-di-spine",
  "phb2014-evoca-raffica",
  "phb2014-freccia-folgorante",
  "phb2014-evoca-pioggia-di-armi",
  "phb2014-onda-distruttiva",
  "phb2014-tsunami",
]);

export const PHB2014_TRACKING = Object.freeze({
  "phb2014-raggio-di-infermita": Object.freeze({
    trackable: true,
    defaultTurns: 1,
  }),
});

export const PHB2014_AUTOMATION = Object.freeze({
  "phb2014-cordone-di-frecce": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
  "phb2014-raffica-di-spine": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
  "phb2014-percezione-delle-bestie": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze(["Accecato", "Assordato"]),
    targetMode: "self",
    conditionOptions: Object.freeze({
      Accecato: Object.freeze({
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
      Assordato: Object.freeze({
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
    }),
  }),
  "phb2014-morte-apparente": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze(["Accecato", "Incapacitato"]),
    conditionOptions: Object.freeze({
      Accecato: Object.freeze({
        expiry: rounds(600),
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
      Incapacitato: Object.freeze({
        expiry: rounds(600),
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
    }),
  }),
  "phb2014-rampicante-afferrante": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
  "phb2014-freccia-folgorante": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
  "phb2014-faretra-rapida": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
  "phb2014-portale-arcano": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze([]),
    targetMode: "self",
  }),
});

export const PHB2014_SAVE_AUTOMATION = Object.freeze({
  "phb2014-braccia-di-hadar": saveAutomation([
    debuffRule(
      "No reazioni",
      "arms-of-hadar-no-reactions",
      "Non può effettuare reazioni fino alla fine del proprio turno successivo.",
      {
        expiry: nextTurn("turn-end", "target"),
        independent: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "arms-of-hadar-no-reactions", label: "No reaz." }),
        ]),
      },
    ),
  ], { trackOutcomes: [] }),
  "phb2014-colpo-intrappolante": saveAutomation([
    concentrationCondition("Trattenuto"),
    concentrationDebuff(
      "Danni a inizio turno",
      "ensnaring-strike-damage",
      "Subisce danni perforanti all'inizio di ogni proprio turno; il danno aumenta con lo slot.",
      {
        summaryParts: Object.freeze([
          Object.freeze({ id: "ensnaring-strike-recurring-damage", label: "Danni perforanti/turno" }),
        ]),
        saveReminder: Object.freeze({
          timing: "turn-start",
          mode: "manual-damage",
          damage: Object.freeze({
            dice: "1d6",
            type: "perforanti",
            baseSlot: 1,
            additionalPerSlotAbove: 1,
          }),
          label: "Subisce danni perforanti all'inizio di ogni proprio turno.",
        }),
      },
    ),
  ]),
  "phb2014-duello-obbligato": saveAutomation([
    concentrationDebuff(
      "Svant. attacchi vs altri / limite 9 m",
      "compelled-duel-restrictions",
      "Svantaggio agli attacchi contro creature diverse dal caster; TS Saggezza per muoversi oltre 9 metri.",
      {
        summaryParts: Object.freeze([
          Object.freeze({ id: "compelled-duel-attack-restriction", label: "Svant. attacchi vs altri" }),
        ]),
      },
    ),
  ]),
  "phb2014-punizione-collerica": saveAutomation([
    concentrationCondition("Spaventato"),
  ]),
  "phb2014-punizione-tonante": saveAutomation([
    conditionRule("Prono", {
      expiry: manual,
      independent: true,
      manualRemoval: true,
    }),
  ], {
    trackOutcomes: [],
    concentrationAction: "dismiss",
    applyOnSpellCast: true,
  }),
  "phb2014-raffica-di-spine": saveAutomation([], {
    trackOutcomes: [],
    concentrationAction: "dismiss",
  }),
  "phb2014-raggio-di-infermita": saveAutomation([
    conditionRule("Avvelenato", {
      expiry: nextTurn("turn-end", "source"),
    }),
  ]),
  "phb2014-allucinazione-di-forza": saveAutomation([
    concentrationDebuff(
      "Illusione / 1d6 psichici per round",
      "phantasmal-force",
      "Considera reale l'allucinazione; può subire 1d6 danni psichici per round e può esaminarla con Indagare.",
      {
        summaryParts: Object.freeze([
          Object.freeze({ id: "phantasmal-force-real-illusion", label: "Illusione reale" }),
          Object.freeze({ id: "phantasmal-force-psychic-damage", label: "1d6 psichici/round" }),
        ]),
      },
    ),
  ]),
  "phb2014-corona-di-follia": saveAutomation([
    concentrationCondition(
      "Affascinato",
      Object.freeze({
        ability: "wis",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Corona di Follia.",
      }),
    ),
    concentrationDebuff(
      "Azione: attacco imposto",
      "crown-of-madness-commanded-attack",
      "Il caster può imporre un attacco in mischia nel turno del bersaglio e deve usare l'azione per mantenere il controllo.",
      {
        summaryParts: Object.freeze([
          Object.freeze({ id: "crown-of-madness-commanded-attack", label: "Azione: attacco imposto" }),
        ]),
      },
    ),
  ]),
  "phb2014-fame-di-hadar": saveAutomation([], {
    trackOutcomes: [],
  }),
  "phb2014-freccia-folgorante": saveAutomation([], {
    trackOutcomes: [],
    concentrationAction: "dismiss",
  }),
  "phb2014-punizione-accecante": saveAutomation([
    concentrationCondition(
      "Accecato",
      Object.freeze({
        ability: "con",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Accecato su di sé.",
      }),
    ),
  ]),
  "phb2014-punizione-demoralizzante": saveAutomation([
    debuffRule(
      "Svant. attacchi/prove / no reazioni",
      "staggering-smite-penalty",
      "Svantaggio ai tiri per colpire e alle prove di caratteristica; non può effettuare reazioni.",
      {
        expiry: nextTurn("turn-end", "target"),
        independent: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "staggering-smite-attack-check-penalty", label: "Svant. attacchi/prove" }),
          Object.freeze({ id: "staggering-smite-no-reactions", label: "No reaz." }),
        ]),
      },
    ),
  ], {
    trackOutcomes: [],
    concentrationAction: "dismiss",
    applyOnSpellCast: true,
  }),
  "phb2014-onda-distruttiva": saveAutomation([
    conditionRule("Prono", {
      expiry: manual,
      independent: true,
      manualRemoval: true,
    }),
  ], { trackOutcomes: [] }),
  "phb2014-tsunami": saveAutomation([
    debuffRule(
      "Nel muro / Atletica per muoversi",
      "tsunami-wall",
      "È immerso nel muro d'acqua e deve superare una prova di Forza (Atletica) contro la CD dello spell per muoversi.",
      {
        expiry: concentration,
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "tsunami-wall-state", label: "Nel muro" }),
          Object.freeze({ id: "tsunami-wall-athletics-check", label: "Atletica per muoversi" }),
        ]),
      },
    ),
  ], {
    passed: [debuffRule(
      "Nel muro / Atletica per muoversi",
      "tsunami-wall",
      "È immerso nel muro d'acqua e deve superare una prova di Forza (Atletica) contro la CD dello spell per muoversi.",
      {
        expiry: concentration,
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "tsunami-wall-state", label: "Nel muro" }),
          Object.freeze({ id: "tsunami-wall-athletics-check", label: "Atletica per muoversi" }),
        ]),
      },
    )],
    trackOutcomes: ["passed", "failed"],
  }),
});

export const PHB2014_EXPIRY = Object.freeze({
  "phb2014-interdizione-alle-lame": nextTurn("turn-end", "source"),
  "phb2014-raggio-di-infermita": nextTurn("turn-end", "source"),
});

export const PHB2014_EFFECTS = Object.freeze({
  "phb2014-amicizia": Object.freeze([Object.freeze({
    id: "charisma-check-advantage",
    kind: "buff",
    label: "Vant. prove Carisma vs bersaglio",
    detail: "Vantaggio a tutte le prove di Carisma rivolte alla creatura non ostile scelta.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "friendship-charisma-check-advantage", label: "Vant. prove Car vs bersaglio" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-interdizione-alle-lame": Object.freeze([Object.freeze({
    id: "weapon-physical-resistance",
    kind: "buff",
    label: "Res. contundenti/perforanti/taglienti da armi",
    detail: "Resistenza ai danni contundenti, perforanti e taglienti inferti dagli attacchi con armi.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "weapon-resistance-bludgeoning", label: "Res. contundenti da armi" }),
      Object.freeze({ id: "weapon-resistance-piercing", label: "Res. perforanti da armi" }),
      Object.freeze({ id: "weapon-resistance-slashing", label: "Res. taglienti da armi" }),
    ]),
    expiry: nextTurn("turn-end", "source"),
  })]),
  "phb2014-armatura-di-agathys": Object.freeze([Object.freeze({
    id: "agathys-armor",
    kind: "buff",
    label: "5 PF temp. / 5 freddo a chi colpisce in mischia",
    detail: "Conferisce 5 PF temporanei e infligge 5 danni da freddo a chi colpisce in mischia finché restano quei PF; entrambi aumentano di 5 per livello di slot.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "agathys-temporary-hit-points", label: "5 PF temp." }),
      Object.freeze({ id: "agathys-cold-retaliation", label: "5 danni freddo in mischia" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
    mechanics: Object.freeze({
      deriveLabel: true,
      tempHp: Object.freeze({
        amount: Object.freeze({ base: 5, baseSlot: 1, perSlotAbove: 5 }),
      }),
      retaliationDamage: Object.freeze({
        amount: Object.freeze({ base: 5, baseSlot: 1, perSlotAbove: 5 }),
        type: "freddo",
        trigger: "melee-hit",
      }),
    }),
  })]),
  "phb2014-dardo-stregato": Object.freeze([Object.freeze({
    id: "witch-bolt-link",
    kind: "debuff",
    label: "1d12 fulmine / azione per ripetere",
    detail: "Il caster può usare l'azione nei turni successivi per infliggere automaticamente 1d12 danni da fulmine.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "witch-bolt-damage", label: "1d12 fulmine" }),
      Object.freeze({ id: "witch-bolt-repeat-action", label: "Azione: ripeti" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-punizione-incandescente": Object.freeze([Object.freeze({
    id: "searing-smite-burning",
    kind: "debuff",
    label: "1d6 fuoco a inizio turno",
    detail: "All'inizio del turno effettua un TS Costituzione: 1d6 fuoco se fallisce, fine dello spell se supera. Un'azione può estinguere le fiamme.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "searing-smite-save", label: "TS Cos inizio turno" }),
      Object.freeze({ id: "searing-smite-fire-damage", label: "1d6 fuoco" }),
    ]),
    saveReminder: Object.freeze({
      ability: "con",
      timing: "turn-start",
      dcSource: "source-spell",
      success: "remove-effect",
      damage: Object.freeze({
        dice: "1d6",
        type: "fuoco",
        onSave: "none",
      }),
      label: "1d6 fuoco se fallisce; se supera, termina la spell.",
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "branding-smite": Object.freeze([Object.freeze({
    id: "branding-smite-radiance",
    kind: "debuff",
    label: "Bagliore astrale / no invisibilità",
    detail: "Il bersaglio diventa visibile, proietta luce fioca entro 1,5 metri e non può diventare invisibile finché dura la spell.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "branding-smite-visible", label: "Visibile" }),
      Object.freeze({ id: "branding-smite-no-invisibility", label: "No invis." }),
      Object.freeze({ id: "branding-smite-dim-light", label: "Luce fioca 1,5 m" }),
    ]),
    mechanics: Object.freeze({
      visibility: "visible",
      invisibilityBlocked: true,
      dimLightRadiusMeters: 1.5,
    }),
    expiry: concentration,
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-raffica-di-spine": Object.freeze([Object.freeze({
    id: "hail-of-thorns-trigger",
    kind: "buff",
    label: "Prossimo attacco a distanza / area 1d10 perforanti",
    detail: "Al prossimo attacco a distanza che colpisce, bersaglio e creature entro 1,5 metri effettuano un TS Destrezza; il danno aumenta con lo slot.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "hail-of-thorns-trigger-attack", label: "Pross. att. distanza" }),
      Object.freeze({ id: "hail-of-thorns-trigger-area", label: "Area 1,5 m" }),
      Object.freeze({ id: "hail-of-thorns-trigger-damage", label: "1d10 perforanti" }),
    ]),
    mechanics: Object.freeze({
      deriveLabel: true,
      areaDamage: Object.freeze({
        dice: Object.freeze({
          count: Object.freeze({ base: 1, baseSlot: 1, perSlotAbove: 1, max: 6 }),
          sides: 10,
        }),
        type: "perforanti",
      }),
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-percezione-delle-bestie": Object.freeze([Object.freeze({
    id: "beast-senses",
    kind: "buff",
    label: "Sensi della bestia",
    detail: "Percepisce tramite i sensi della bestia e beneficia dei suoi sensi speciali.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "beast-senses-benefit", label: "Sensi bestia" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-freccia-folgorante": Object.freeze([Object.freeze({
    id: "lightning-arrow-trigger",
    kind: "buff",
    label: "Prossimo attacco a distanza / 4d8 + area 2d8 fulmine",
    detail: "Il prossimo attacco a distanza infligge danni da fulmine e le creature entro 3 metri effettuano un TS Destrezza; i danni aumentano con lo slot.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "lightning-arrow-trigger-attack", label: "Pross. att. distanza" }),
      Object.freeze({ id: "lightning-arrow-trigger-primary-damage", label: "4d8 fulmine" }),
      Object.freeze({ id: "lightning-arrow-trigger-area-damage", label: "Area 3 m: 2d8 fulmine" }),
    ]),
    mechanics: Object.freeze({
      deriveLabel: true,
      damageReplacement: Object.freeze({
        dice: Object.freeze({
          count: Object.freeze({ base: 4, baseSlot: 3, perSlotAbove: 1, max: 10 }),
          sides: 8,
        }),
        type: "fulmine",
      }),
      areaDamage: Object.freeze({
        dice: Object.freeze({
          count: Object.freeze({ base: 2, baseSlot: 3, perSlotAbove: 1, max: 8 }),
          sides: 8,
        }),
        type: "fulmine",
      }),
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "phb2014-morte-apparente": Object.freeze([Object.freeze({
    id: "feign-death-protections",
    kind: "buff",
    label: "Res. danni tranne psichici / velocità 0",
    detail: "Resistenza a tutti i danni tranne gli psichici, velocità 0; malattie e veleno restano sospesi.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "feign-death-damage-resistance", label: "Res. danni (no psichici)" }),
      Object.freeze({ id: "feign-death-speed-zero", label: "Vel 0" }),
      Object.freeze({ id: "feign-death-disease-poison-suspended", label: "Malattie/veleno sospesi" }),
    ]),
    mechanics: Object.freeze({
      movement: Object.freeze({
        setMeters: 0,
        label: "Morte Apparente",
      }),
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: rounds(600),
  })]),
  "phb2014-aura-di-purezza": Object.freeze([Object.freeze({
    id: "aura-of-purity",
    kind: "buff",
    label: "Res. veleno / vant. TS / no malattie",
    detail: "Resistenza al veleno, immunità alle malattie e vantaggio ai TS contro accecato, affascinato, assordato, avvelenato, paralizzato, spaventato e stordito.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "aura-of-purity-poison-resistance", label: "Res. veleno" }),
      Object.freeze({ id: "aura-of-purity-disease-immunity", label: "Imm. malattie" }),
      Object.freeze({ id: "aura-of-purity-condition-save-advantage", label: "Vant. TS condizioni" }),
    ]),
    mechanics: Object.freeze({
      damageResistances: Object.freeze(["poison"]),
      diseaseImmunity: true,
      savingThrow: Object.freeze({
        advantageAgainst: Object.freeze([
          "Accecato",
          "Affascinato",
          "Assordato",
          "Avvelenato",
          "Paralizzato",
          "Spaventato",
          "Stordito",
        ]),
      }),
    }),
  })]),
  "phb2014-aura-di-vita": Object.freeze([Object.freeze({
    id: "aura-of-life",
    kind: "buff",
    label: "Res. necrotici / max PF / +1 PF a 0",
    detail: "Resistenza ai danni necrotici, massimo PF non riducibile e recupero di 1 PF a inizio turno quando si è a 0 PF.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "aura-of-life-necrotic-resistance", label: "Res. necrotici" }),
      Object.freeze({ id: "aura-of-life-hit-point-maximum", label: "Max PF protetto" }),
      Object.freeze({ id: "aura-of-life-heal-at-zero", label: "+1 PF a 0" }),
    ]),
    mechanics: Object.freeze({
      damageResistances: Object.freeze(["necrotic"]),
      hitPointMaximumProtected: true,
      healingAtTurnStart: Object.freeze({ amount: 1, whenAtHp: 0 }),
    }),
  })]),
  "phb2014-rampicante-afferrante": Object.freeze([Object.freeze({
    id: "grasping-vine-command",
    kind: "buff",
    label: "Azione bonus / trascina 6 m",
    detail: "A ogni turno il caster può usare un'azione bonus per tentare di trascinare una creatura di 6 metri verso il rampicante.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "grasping-vine-bonus-action", label: "Azione bonus" }),
      Object.freeze({ id: "grasping-vine-pull", label: "Trascina 6 m" }),
    ]),
  })]),
  "phb2014-cerchio-di-potere": Object.freeze([Object.freeze({
    id: "circle-of-power",
    kind: "buff",
    label: "Vant. TS magia / 0 danni su TS riuscito",
    detail: "Vantaggio ai TS contro spell ed effetti magici; un TS riuscito che dimezzerebbe i danni li annulla.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "circle-of-power-magic-save-advantage", label: "Vant. TS magia" }),
      Object.freeze({ id: "circle-of-power-zero-save-damage", label: "TS riuscito: 0 danni" }),
    ]),
    mechanics: Object.freeze({
      savingThrow: Object.freeze({ advantageAgainstMagic: true }),
      damageOnSuccessfulSave: "none",
    }),
  })]),
  "phb2014-faretra-rapida": Object.freeze([Object.freeze({
    id: "swift-quiver-attacks",
    kind: "buff",
    label: "Azione bonus / 2 attacchi a distanza",
    detail: "A ogni turno può usare un'azione bonus per effettuare due attacchi con un'arma che usa le munizioni della faretra.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "swift-quiver-bonus-action", label: "Azione bonus" }),
      Object.freeze({ id: "swift-quiver-two-attacks", label: "2 attacchi distanza" }),
    ]),
  })]),
  "phb2014-telepatia": Object.freeze([Object.freeze({
    id: "telepathic-link",
    kind: "buff",
    label: "Legame telepatico",
    detail: "Caster e bersaglio condividono parole, immagini, suoni e altri messaggi sensoriali sullo stesso piano.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "telepathy-link", label: "Legame telepatico" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: rounds(14400),
  })]),
});

const hexAbilities = Object.freeze([
  ["forza", "Forza"],
  ["destrezza", "Destrezza"],
  ["costituzione", "Costituzione"],
  ["intelligenza", "Intelligenza"],
  ["saggezza", "Saggezza"],
  ["carisma", "Carisma"],
]);

const elementalTypes = Object.freeze([
  "acido",
  "freddo",
  "fulmine",
  "fuoco",
  "tuono",
]);

export const PHB2014_EFFECT_CHOICES = Object.freeze({
  "phb2014-sortilegio": Object.freeze(hexAbilities.map(([id, ability]) => Object.freeze({
    id,
    label: ability,
    effects: Object.freeze([Object.freeze({
      id: `hex-${id}`,
      kind: "debuff",
      label: `+1d6 necrotici dal caster / svant. prove ${ability}`,
      detail: `Il caster infligge 1d6 danni necrotici extra quando colpisce; svantaggio alle prove di ${ability}.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
        Object.freeze({ id: "hex-ability-check-disadvantage", label: `Svant. prove ${ability}` }),
      ]),
      mechanics: Object.freeze({
        damageBonus: Object.freeze({ dice: "1d6", type: "necrotici", sourceOnly: true }),
        abilityCheck: Object.freeze({ disadvantage: true, ability }),
      }),
    })]),
  }))),
  "phb2014-arma-elementale": Object.freeze(elementalTypes.map((type) => Object.freeze({
    id: type,
    label: type[0].toLocaleUpperCase("it") + type.slice(1),
    effects: Object.freeze([Object.freeze({
      id: `elemental-weapon-${type}`,
      kind: "buff",
      label: `+1 al colpire / +1d4 ${type}`,
      detail: `L'arma è magica, conferisce +1 ai tiri per colpire e infligge 1d4 danni da ${type} extra; i bonus aumentano con lo slot.`,
      summaryParts: Object.freeze([
        Object.freeze({ id: `elemental-weapon-${type}-magical`, label: "Arma magica" }),
        Object.freeze({ id: `elemental-weapon-${type}-attack-bonus`, label: "+1 Att" }),
        Object.freeze({ id: `elemental-weapon-${type}-damage`, label: `+1d4 ${type}` }),
      ]),
      mechanics: Object.freeze({
        deriveLabel: true,
        attackRoll: Object.freeze({
          bonus: Object.freeze({ base: 1, baseSlot: 3, perSlotAbove: 1, step: 2, max: 3 }),
        }),
        damageBonus: Object.freeze({
          dice: Object.freeze({
            count: Object.freeze({ base: 1, baseSlot: 3, perSlotAbove: 1, step: 2, max: 3 }),
            sides: 4,
          }),
          type,
        }),
        weaponBecomesMagical: true,
      }),
    })]),
  }))),
  "phb2014-punizione-esiliante": Object.freeze([
    Object.freeze({
      id: "native",
      label: "Bersaglio nativo del piano",
      effects: Object.freeze([Object.freeze({
        id: "banishing-smite-demiplane",
        kind: "debuff",
        label: "Esiliato / Incapacitato (≤50 PF)",
        detail: "Esiliato in un semipiano innocuo e incapacitato finché dura la concentrazione; si applica solo se l'attacco lo porta a 50 PF o meno.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "banishing-smite-exiled", label: "Esiliato" }),
        ]),
        manualRemoval: true,
        endsParentOnRemoval: true,
      })]),
    }),
    Object.freeze({
      id: "extraplanar",
      label: "Bersaglio extraplanare",
      concentrationAction: "dismiss",
      effects: Object.freeze([Object.freeze({
        id: "banishing-smite-home-plane",
        kind: "debuff",
        label: "Esiliato sul piano natio (≤50 PF)",
        detail: "Ritorna sul proprio piano natio se l'attacco lo porta a 50 PF o meno; l'esilio non dipende più dalla concentrazione.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "banishing-smite-exiled", label: "Esiliato" }),
        ]),
        parentEffectId: "",
        expiry: manual,
        manualRemoval: true,
      })]),
    }),
  ]),
});
