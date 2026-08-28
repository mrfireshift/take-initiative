const nextTurn = (mode, actor = "source") => Object.freeze({
  mode,
  actor,
  remaining: 1,
  anchor: "next-turn",
});

const rounds = (remaining) => Object.freeze({ mode: "rounds", remaining });
const manual = Object.freeze({ mode: "manual" });
const concentration = Object.freeze({ mode: "concentration" });

export const SUPPLEMENT_TRACKING = Object.freeze({
  "xanathar-cerimonia": Object.freeze({ trackable: true, defaultTurns: 14400 }),
  "xanathar-fortezza-possente": Object.freeze({ trackable: true, defaultTurns: 100800 }),
  "xanathar-gabbia-dellanima": Object.freeze({ trackable: true, defaultTurns: 4800 }),
  "xanathar-morsa-del-gelo": Object.freeze({ trackable: true, defaultTurns: 1 }),
  "xanathar-parola-del-potere-dolore": Object.freeze({ trackable: true, defaultTurns: 1 }),
  "xanathar-pirotecnica": Object.freeze({ trackable: true, defaultTurns: 1 }),
  "xanathar-scossa-sinaptica": Object.freeze({ trackable: true, defaultTurns: 10 }),
  "xanathar-urlo-psichico": Object.freeze({ trackable: true, defaultTurns: 1 }),
});

export const SUPPLEMENT_AUTOMATION = Object.freeze({
  "xanathar-charme-sui-mostri": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Affascinato"]),
  }),
  "xanathar-drago-illusorio": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Spaventato"]),
    targetMode: "area",
    conditionOptions: Object.freeze({
      Spaventato: Object.freeze({
        expiry: rounds(10),
        parentEffectId: "",
        saveReminder: Object.freeze({
          ability: "wis",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "TS solo senza linea di vista sull'illusione; se supera, termina l'effetto.",
        }),
      }),
    }),
  }),
  "xanathar-incuti-paura": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Spaventato"]),
    conditionOptions: Object.freeze({
      Spaventato: Object.freeze({
        saveReminder: Object.freeze({
          ability: "wis",
          timing: "turn-end",
          dcSource: "source-spell",
          success: "remove-effect",
          label: "Se supera il TS, termina Spaventato su di sé.",
        }),
      }),
    }),
  }),
  "xanathar-muro-di-luce": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Accecato"]),
    targetMode: "area",
    conditionOptions: Object.freeze({
      Accecato: Object.freeze({
        expiry: rounds(10),
        parentEffectId: "",
        manualRemoval: true,
        saveReminder: Object.freeze({
          ability: "con",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "Se supera il TS, termina Accecato su di sé.",
        }),
      }),
    }),
  }),
  "xanathar-prigione-mentale": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Trattenuto"]),
  }),
  "xanathar-sfera-acquea": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Trattenuto"]),
    targetMode: "area",
    conditionOptions: Object.freeze({
      Trattenuto: Object.freeze({
        effectId: "watery-sphere-restrained",
        effectDetail: "La sfera trattiene il bersaglio. Può usare un'azione per effettuare una prova di Forza contro la CD della spell e liberarsi.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "watery-sphere-escape-action", label: "Azione: prova For" }),
        ]),
        saveReminder: Object.freeze({
          ability: "str",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "Se supera il TS, esce dalla sfera e termina Trattenuto.",
        }),
      }),
    }),
  }),
  "xanathar-sonnellino": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze(["Privo di sensi"]),
  }),
  "xanathar-urlo-psichico": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Stordito"]),
    conditionOptions: Object.freeze({
      Stordito: Object.freeze({
        expiry: manual,
        manualRemoval: true,
        endsParentOnRemoval: true,
        parentRemoval: "target",
        saveReminder: Object.freeze({
          ability: "int",
          timing: "turn-end",
          dcSource: "source-spell",
          success: "remove-effect",
          label: "Se supera il TS, termina Urlo Psichico su di sé.",
        }),
      }),
    }),
  }),
  "tasha-sogno-del-velo-celeste": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze(["Privo di sensi"]),
  }),
});

export const SUPPLEMENT_SAVE_AUTOMATION = Object.freeze({
  "xanathar-drago-illusorio": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Spaventato",
      expiry: rounds(10),
      options: Object.freeze({ parentEffectId: "" }),
      saveReminder: Object.freeze({
        ability: "wis",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "TS solo senza linea di vista sull'illusione; se supera, termina l'effetto.",
      }),
    })]),
  }),
  "xanathar-muro-di-luce": Object.freeze({
    // La spell persistente appartiene alla zona/caster. I bersagli mantengono
    // solo Accecato; la pill "Muro di Luce" viene gestita dalla membership
    // geometrica della zona e segue ingressi/uscite in tempo reale.
    trackOutcomes: Object.freeze([]),
    failed: Object.freeze([Object.freeze({
      condition: "Accecato",
      expiry: rounds(10),
      options: Object.freeze({ parentEffectId: "" }),
      manualRemoval: true,
      saveReminder: Object.freeze({
        ability: "con",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Accecato su di sé.",
      }),
    })]),
  }),
  "xanathar-sfera-acquea": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Trattenuto",
      effectId: "watery-sphere-restrained",
      effectDetail: "La sfera trattiene il bersaglio. Può usare un'azione per effettuare una prova di Forza contro la CD della spell e liberarsi.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "watery-sphere-escape-action", label: "Azione: prova For" }),
      ]),
      expiry: concentration,
      saveReminder: Object.freeze({
        ability: "str",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, esce dalla sfera e termina Trattenuto.",
      }),
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "target",
      parentEndCondition: Object.freeze({
        condition: "Prono",
        expiry: manual,
      }),
    })]),
  }),
  "xanathar-urlo-psichico": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Stordito",
      expiry: manual,
      saveReminder: Object.freeze({
        ability: "int",
        timing: "turn-end",
        dcSource: "source-spell",
        success: "remove-effect",
        label: "Se supera il TS, termina Urlo Psichico su di sé.",
      }),
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "target",
    })]),
  }),
  "xanathar-stretta-della-terra-di-maximilian": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Trattenuto",
      effectId: "maximilian-earth-grasp-restrained",
      effectDetail: "La mano di terra trattiene il bersaglio. Può usare un'azione per effettuare una prova di Forza contro la CD della spell e liberarsi.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "maximilian-escape-action", label: "Azione: prova For" }),
      ]),
      expiry: concentration,
      manualRemoval: true,
    })]),
  }),
  "tasha-scheggia-della-mente": Object.freeze({
    trackOutcomes: Object.freeze(["passed", "failed"]),
  }),
  "xanathar-immolazione": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "In fiamme · 4d6 a fine turno",
      effectId: "immolation-burning",
      effectKind: "debuff",
      effectDetail: "A fine turno ripete il TS Destrezza: 4d6 fuoco se fallisce, fine della spell se supera.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "immolation-fire-damage", label: "4d6 fuoco/fine turno" }),
      ]),
      expiry: concentration,
      saveReminder: Object.freeze({
        ability: "dex",
        timing: "turn-end",
        dcSource: "source-spell",
        success: "remove-effect",
        damage: Object.freeze({
          dice: "4d6",
          type: "fuoco",
          onSave: "none",
        }),
        label: "4d6 fuoco se fallisce; se supera, termina la spell.",
      }),
      manualRemoval: true,
      endsParentOnRemoval: true,
    })]),
  }),
});

export const SUPPLEMENT_ACTIVE_ACTIONS = Object.freeze({
  "xanathar-frecce-infuocate": Object.freeze([Object.freeze({
    id: "flame-arrows-consume",
    label: "Consuma munizione",
    buttonLabel: "Consuma munizione",
    detail: "Dopo aver effettuato l'attacco, consuma una munizione infuocata. Il tiro per colpire e il danno restano risolti manualmente al tavolo.",
    subjectMode: "none",
    availableAfterCast: true,
    repeatableThisTurn: true,
    showInOverview: true,
    resource: Object.freeze({
      key: "ammunition",
      consume: 1,
      endSpellAtZero: true,
      endConcentrationAtZero: true,
    }),
  })]),
  "xanathar-collera-della-natura": Object.freeze([
    Object.freeze({
      id: "wrath-of-nature-vines-failed",
      label: "Liane: TS fallito",
      buttonLabel: "Liane: Trattenuto",
      detail: "Dopo il TS Forza fallito, applica Trattenuto alla creatura a terra scelta nella zona.",
      emptySelectionTitle: "Seleziona la creatura che ha fallito il TS delle liane.",
      tooManySelectionTitle: "Le liane possono trattenere una sola creatura per attivazione.",
      subjectMode: "selected",
      maxTargets: 1,
      rememberTargets: true,
      effects: Object.freeze([Object.freeze({
        id: "wrath-of-nature-vines-restrained",
        kind: "debuff",
        label: "Trattenuto",
        detail: "Può usare un'azione per effettuare una prova di Forza (Atletica) contro la CD della spell e liberarsi.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "wrath-of-nature-escape-action", label: "Azione: prova For" }),
        ]),
        manualRemoval: true,
        endsParentOnRemoval: true,
        parentRemoval: "target",
      })]),
    }),
    Object.freeze({
      id: "wrath-of-nature-rocks-failed",
      label: "Rocce: colpito e TS fallito",
      buttonLabel: "Rocce: Prono",
      detail: "Dopo l'attacco con incantesimo a distanza colpito, infliggi 3d8 contundenti non magici; se fallisce anche il TS Forza, applica Prono.",
      emptySelectionTitle: "Seleziona la creatura colpita che ha fallito il TS delle rocce.",
      tooManySelectionTitle: "Le rocce possono rendere Prona una sola creatura per attivazione.",
      subjectMode: "selected",
      maxTargets: 1,
      effects: Object.freeze([Object.freeze({
        id: "wrath-of-nature-rocks-prone",
        kind: "debuff",
        label: "Prono",
        detail: "Caduto Prono dopo l'attacco delle rocce.",
        parentEffectId: "",
        manualRemoval: true,
      })]),
    }),
  ]),
  "xanathar-controllare-venti": Object.freeze([
    Object.freeze({
      id: "control-winds-gusts",
      label: "Passa a Folate",
      buttonLabel: "Folate",
      detail: "Usa l'azione per attivare Folate / Vento moderato o forte: svantaggio agli attacchi con armi a distanza / Vento forte: movimento controvento a costo raddoppiato.",
      subjectMode: "caster",
      economy: "action",
      availableAfterCast: true,
      turnStartPrompt: true,
      showInOverview: true,
      zoneRuleChoice: "gusts",
      effects: Object.freeze([]),
    }),
    Object.freeze({
      id: "control-winds-downdraft",
      label: "Passa a Corrente Discendente",
      buttonLabel: "Discendente",
      detail: "Usa l'azione per attivare Corrente Discendente / Svantaggio agli attacchi con armi a distanza / TS Forza alle creature in volo entrando o a inizio turno.",
      subjectMode: "caster",
      economy: "action",
      availableAfterCast: true,
      turnStartPrompt: true,
      showInOverview: true,
      zoneRuleChoice: "downdraft",
      effects: Object.freeze([]),
    }),
    Object.freeze({
      id: "control-winds-updraft",
      label: "Passa a Corrente Ascendente",
      buttonLabel: "Ascendente",
      detail: "Usa l'azione per attivare Corrente Ascendente / Danni da caduta dimezzati / Salti in alto fino a 3 m aggiuntivi.",
      subjectMode: "caster",
      economy: "action",
      availableAfterCast: true,
      turnStartPrompt: true,
      showInOverview: true,
      zoneRuleChoice: "updraft",
      effects: Object.freeze([]),
    }),
    Object.freeze({
      id: "control-winds-pause",
      label: "Interrompi temporaneamente",
      buttonLabel: "Sospendi venti",
      detail: "Usa l'azione per interrompere temporaneamente l'effetto dei venti / Mantieni la concentrazione / Riavvia l'effetto in un turno successivo.",
      subjectMode: "caster",
      economy: "action",
      availableAfterCast: true,
      turnStartPrompt: true,
      showInOverview: true,
      zoneRuleChoice: "paused",
      effects: Object.freeze([]),
    }),
  ]),
  "xanathar-colpo-dello-zefiro": Object.freeze([Object.freeze({
    id: "zephyr-strike-attack",
    label: "Colpo dello Zefiro",
    buttonLabel: "Usa colpo",
    detail: "Consuma il vantaggio e il +1d8 forza; applica +9 m alla velocità base sul terreno fino alla fine del turno.",
    subjectMode: "caster",
    consumesEffectIds: Object.freeze(["zephyr-strike"]),
    effects: Object.freeze([Object.freeze({
      id: "zephyr-strike-speed",
      kind: "buff",
      label: "Velocità base +9 m",
      detail: "La velocità base sul terreno aumenta di 9 metri fino alla fine del turno.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "zephyr-strike-speed", label: "Vel +9 m" }),
      ]),
      expiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1 }),
      mechanics: Object.freeze({
        movement: Object.freeze({
          addMeters: 9,
          appliesTo: Object.freeze(["walk"]),
          label: "Colpo dello Zefiro (+9 m)",
        }),
      }),
    })]),
  })]),
  "xanathar-investitura-del-ghiaccio": Object.freeze([Object.freeze({
    id: "ice-investiture-cone",
    label: "Cono gelido",
    buttonLabel: "Cono gelido",
    detail: "Applica velocità dimezzata ai bersagli selezionati che hanno fallito il TS; i danni restano manuali.",
    emptySelectionTitle: "Seleziona i bersagli che hanno fallito il TS su Costituzione.",
    subjectMode: "selected",
    countLabelSingular: "fallito",
    countLabelPlural: "falliti",
    effects: Object.freeze([Object.freeze({
      id: "ice-investiture-slow",
      kind: "debuff",
      label: "Velocità dimezzata",
      detail: "Velocità dimezzata fino all'inizio del turno successivo del caster.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "ice-investiture-slow", label: "Vel ½" }),
      ]),
      expiry: nextTurn("turn-start", "source"),
      mechanics: Object.freeze({
        movement: Object.freeze({
          multiplier: 0.5,
          label: "Investitura del Ghiaccio: velocità dimezzata",
        }),
      }),
    })]),
  })]),
});

export const SUPPLEMENT_EXPIRY = Object.freeze({
  "xanathar-morsa-del-gelo": nextTurn("turn-end", "target"),
  "xanathar-parola-del-potere-dolore": manual,
  "xanathar-urlo-psichico": manual,
});

const SKILL_EMPOWERMENT_OPTIONS = Object.freeze([
  Object.freeze({ id: "acrobazia", label: "Acrobazia" }),
  Object.freeze({ id: "addestrare-animali", label: "Addestrare Animali" }),
  Object.freeze({ id: "arcano", label: "Arcano" }),
  Object.freeze({ id: "atletica", label: "Atletica" }),
  Object.freeze({ id: "furtivita", label: "Furtività" }),
  Object.freeze({ id: "indagare", label: "Indagare" }),
  Object.freeze({ id: "inganno", label: "Inganno" }),
  Object.freeze({ id: "intimidire", label: "Intimidire" }),
  Object.freeze({ id: "intrattenere", label: "Intrattenere" }),
  Object.freeze({ id: "intuizione", label: "Intuizione" }),
  Object.freeze({ id: "medicina", label: "Medicina" }),
  Object.freeze({ id: "natura", label: "Natura" }),
  Object.freeze({ id: "percezione", label: "Percezione" }),
  Object.freeze({ id: "persuasione", label: "Persuasione" }),
  Object.freeze({ id: "rapidita-di-mano", label: "Rapidità di Mano" }),
  Object.freeze({ id: "religione", label: "Religione" }),
  Object.freeze({ id: "sopravvivenza", label: "Sopravvivenza" }),
  Object.freeze({ id: "storia", label: "Storia" }),
]);

export const SUPPLEMENT_EFFECTS = Object.freeze({
  "xanathar-aculeo-mentale": Object.freeze([Object.freeze({
    id: "location-known",
    kind: "debuff",
    label: "Localizzato · invis. inefficace",
    detail: "Il caster conosce la posizione del bersaglio, che non può nascondersi e non beneficia dell'invisibilità contro di lui.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "mind-spike-location", label: "Localizzato" }),
      Object.freeze({ id: "mind-spike-no-hiding", label: "No nascondersi" }),
      Object.freeze({ id: "mind-spike-no-invisibility", label: "No invis." }),
    ]),
  })]),
  "xanathar-arma-sacra": Object.freeze([Object.freeze({
    id: "holy-weapon",
    kind: "buff",
    label: "Arma magica · +2d8 radiosi",
    detail: "L'arma diventa magica e infligge 2d8 danni radiosi extra.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "holy-weapon-magical", label: "Arma magica" }),
      Object.freeze({ id: "holy-weapon-radiant-damage", label: "+2d8 radiosi" }),
    ]),
  })]),
  "xanathar-colpo-dello-zefiro": Object.freeze([
    Object.freeze({
      id: "no-opportunity-attacks",
      kind: "buff",
      label: "Movimento: no AdO",
      detail: "Il movimento del caster non provoca attacchi di opportunità.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "zephyr-no-opportunity-attacks", label: "Movimento: no AdO" }),
      ]),
    }),
    Object.freeze({
      id: "zephyr-strike",
      kind: "buff",
      label: "1 attacco: vant. · +1d8 forza",
      detail: "Una volta dispone di vantaggio a un attacco con arma e infligge 1d8 danni da forza extra se colpisce.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "zephyr-strike-attack-advantage", label: "1 attacco: vant." }),
        Object.freeze({ id: "zephyr-strike-force-damage", label: "+1d8 forza" }),
      ]),
      manualRemoval: true,
    }),
  ]),
  "xanathar-debilitazione": Object.freeze([Object.freeze({
    id: "enervation-link",
    kind: "debuff",
    label: "Debilitazione: danni e cura",
    detail: "Il caster può ripetere i danni necrotici e recupera metà dei danni inflitti.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "enervation-repeat-damage", label: "Azione: ripeti danni" }),
      Object.freeze({ id: "enervation-heal-half", label: "Cura metà danni" }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
    parentRemoval: "spell",
  })]),
  "xanathar-immolazione": Object.freeze([Object.freeze({
    id: "immolation-burning",
    kind: "debuff",
    label: "In fiamme · 4d6 a fine turno",
    detail: "A fine turno ripete il TS Destrezza: 4d6 fuoco se fallisce, fine della spell se supera.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "immolation-end-turn-save", label: "TS Des fine turno" }),
      Object.freeze({ id: "immolation-fire-damage", label: "4d6 fuoco" }),
    ]),
    saveReminder: Object.freeze({
      ability: "dex",
      timing: "turn-end",
      dcSource: "source-spell",
      success: "remove-effect",
      damage: Object.freeze({
        dice: "4d6",
        type: "fuoco",
        onSave: "none",
      }),
      label: "4d6 fuoco se fallisce; se supera, termina la spell.",
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
  })]),
  "xanathar-interdizione-primordiale": Object.freeze([Object.freeze({
    id: "elemental-resistances",
    kind: "buff",
    label: "Res. acido/freddo/fulmine/fuoco/tuono",
    detail: "Resistenza ai cinque tipi di danno elementale finché non viene attivata l'immunità con una reazione.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "elemental-resistances-five-types", label: "Res. 5 elementi" }),
      Object.freeze({ id: "elemental-resistances-reaction-immunity", label: "Reaz.: Imm. tipo" }),
    ]),
  })]),
  "xanathar-investitura-del-ghiaccio": Object.freeze([Object.freeze({
    id: "ice-investiture",
    kind: "buff",
    label: "Imm. freddo · Res. fuoco · aura ghiaccio",
    detail: "Immunità al freddo, resistenza al fuoco e terreno difficile ghiacciato attorno al caster.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "ice-investiture-cold-immunity", label: "Imm. freddo" }),
      Object.freeze({ id: "ice-investiture-fire-resistance", label: "Res. fuoco" }),
      Object.freeze({ id: "ice-investiture-difficult-terrain-aura", label: "Terreno diff. aura" }),
    ]),
  })]),
  "xanathar-investitura-del-vento": Object.freeze([Object.freeze({
    id: "wind-investiture",
    kind: "buff",
    label: "Volo · attacchi distanza svant.",
    detail: "Velocità di volare e svantaggio agli attacchi con arma a distanza contro il caster.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "wind-investiture-flight", label: "Volo 18 m" }),
      Object.freeze({ id: "wind-investiture-ranged-disadvantage", label: "Svant. att. distanza" }),
    ]),
    mechanics: Object.freeze({
      movement: Object.freeze({
        modes: Object.freeze({
          fly: Object.freeze({ grantMeters: 18 }),
        }),
        label: "Investitura del Vento: volo 18 m",
      }),
    }),
  })]),
  "xanathar-investitura-della-fiamma": Object.freeze([Object.freeze({
    id: "flame-investiture",
    kind: "buff",
    label: "Imm. fuoco · Res. freddo",
    detail: "L'incantatore è immune ai danni da fuoco e possiede resistenza ai danni da freddo.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "flame-investiture-fire-immunity", label: "Imm. fuoco" }),
      Object.freeze({ id: "flame-investiture-cold-resistance", label: "Res. freddo" }),
    ]),
  })]),
  "xanathar-investitura-della-pietra": Object.freeze([Object.freeze({
    id: "stone-investiture",
    kind: "buff",
    label: "Res. armi non magiche · passo nella roccia",
    detail: "Resistenza ai danni fisici da attacchi non magici e movimento attraverso terra e pietra.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "stone-investiture-weapon-resistance", label: "Res. armi non magiche" }),
      Object.freeze({ id: "stone-investiture-rock-walk", label: "Passo nella roccia" }),
    ]),
  })]),
  "xanathar-legame-con-le-bestie": Object.freeze([Object.freeze({
    id: "beast-attack-advantage",
    kind: "buff",
    label: "Bestia: vant. attacchi vicino al caster",
    detail: "La bestia dispone di vantaggio contro creature entro 1,5 metri dal caster.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "beast-attack-advantage-near-caster", label: "Bestia: vant. att. entro 1,5 m" }),
    ]),
  })]),
  "xanathar-morsa-del-gelo": Object.freeze([Object.freeze({
    id: "next-weapon-attack-disadvantage",
    kind: "debuff",
    label: "Prossimo attacco con arma: svant.",
    detail: "Svantaggio al prossimo attacco con arma prima della fine del turno successivo del bersaglio.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "frost-morsel-next-weapon-attack", label: "Pross. attacco arma: svant." }),
    ]),
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: nextTurn("turn-end", "target"),
  })]),
  "xanathar-nemici-in-abbondanza": Object.freeze([Object.freeze({
    id: "cannot-distinguish-allies",
    kind: "debuff",
    label: "Tutti considerati nemici",
    detail: "Il bersaglio non distingue alleati e nemici; può ripetere il TS ogni volta che subisce danni.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "enemies-abound-hostile-targets", label: "Tutti nemici" }),
    ]),
    saveReminder: Object.freeze({
      ability: "int",
      timing: "damage",
      dcSource: "source-spell",
      success: "remove-effect",
      label: "Se supera il TS, termina l'effetto su di sé.",
    }),
    endsParentOnRemoval: true,
    parentRemoval: "spell",
  })]),
  "xanathar-ombra-di-moil": Object.freeze([Object.freeze({
    id: "shadow-of-moil",
    kind: "buff",
    label: "Oscurato · Res. radiosi · ritorsione",
    detail: "Il caster è pesantemente oscurato, resiste ai radiosi e danneggia chi lo colpisce in mischia.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "shadow-of-moil-obscured", label: "Oscurato" }),
      Object.freeze({ id: "shadow-of-moil-radiant-resistance", label: "Res. radiosi" }),
      Object.freeze({ id: "shadow-of-moil-melee-retaliation", label: "Ritorsione mischia" }),
    ]),
  })]),
  "xanathar-parola-del-potere-dolore": Object.freeze([Object.freeze({
    id: "power-word-pain",
    kind: "debuff",
    label: "Vel. max 3m · svantaggi · rischio spell",
    detail: "Velocità massima 3 metri, svantaggio ad attacchi, prove e TS non-Cos; TS Cos per lanciare incantesimi. TS Cos a fine turno per terminare.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "power-word-pain-speed-limit", label: "Vel max 3m" }),
      Object.freeze({ id: "power-word-pain-penalties", label: "Att/prove/TS −" }),
    ]),
    mechanics: Object.freeze({
      movement: Object.freeze({
        maximumMeters: 3,
        label: "Parola del Potere Dolore (max 3m)",
      }),
    }),
    saveReminder: Object.freeze({
      ability: "con",
      timing: "turn-end",
      dcSource: "source-spell",
      success: "remove-effect",
      label: "Se supera il TS, termina Parola del Potere Dolore.",
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: manual,
  })]),
  "xanathar-scossa-sinaptica": Object.freeze([Object.freeze({
    id: "synaptic-static-penalty",
    kind: "debuff",
    label: "-1d6 Att/prove/TS concentrazione",
    detail: "Sottrae 1d6 ad attacchi, prove e TS Costituzione per mantenere concentrazione; TS Int a fine turno per terminare.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "synaptic-attack-penalty", label: "Att −1d6" }),
      Object.freeze({ id: "synaptic-check-penalty", label: "Prove −1d6" }),
      Object.freeze({ id: "synaptic-concentration-save-penalty", label: "TS concentrazione −1d6" }),
    ]),
    saveReminder: Object.freeze({
      ability: "int",
      timing: "turn-end",
      dcSource: "source-spell",
      success: "remove-effect",
      label: "Se supera il TS, termina la penalità.",
    }),
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: rounds(10),
  })]),
  "xanathar-soffio-del-drago": Object.freeze([Object.freeze({
    id: "dragon-breath-action",
    kind: "buff",
    label: "Azione: soffio del drago",
    detail: "Il bersaglio può usare un'azione per esalare il tipo di energia scelto.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "dragon-breath-available-action", label: "Azione: soffio" }),
    ]),
  })]),
  "xanathar-trasformazione-di-tenser": Object.freeze([Object.freeze({
    id: "tensers-transformation",
    kind: "buff",
    label: "Tenser: 50 PFt · vant. · +2d12 forza",
    detail: "Conferisce 50 PF temporanei, vantaggio agli attacchi con armi, danni da forza extra e competenze marziali.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "tensers-temporary-hit-points", label: "50 PF temp." }),
      Object.freeze({ id: "tensers-weapon-attack-advantage", label: "Vant. att. armi" }),
      Object.freeze({ id: "tensers-force-damage", label: "+2d12 forza" }),
      Object.freeze({ id: "tensers-martial-proficiency", label: "Comp. marziali" }),
    ]),
  })]),
  "xanathar-vincolo-della-terra": Object.freeze([Object.freeze({
    id: "flying-speed-zero",
    kind: "debuff",
    label: "Velocità di volare: 0",
    detail: "La velocità di volare del bersaglio è ridotta a 0.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "earthbind-flying-speed-zero", label: "Vel volo 0" }),
    ]),
    mechanics: Object.freeze({
      movement: Object.freeze({
        modes: Object.freeze({
          fly: Object.freeze({ maximumMeters: 0 }),
        }),
        label: "Vincolo della Terra: volo 0",
      }),
    }),
  })]),
  "tasha-fortezza-della-mente": Object.freeze([Object.freeze({
    id: "intellect-fortress",
    kind: "buff",
    label: "Res. psichici · vant. TS Int/Sag/Car",
    detail: "Resistenza ai danni psichici e vantaggio ai tiri salvezza su Intelligenza, Saggezza e Carisma.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "intellect-fortress-psychic-resistance", label: "Res. psichici" }),
      Object.freeze({ id: "intellect-fortress-mental-save-advantage", label: "Vant. TS Int/Sag/Car" }),
    ]),
  })]),
  "tasha-miscela-caustica-di-tasha": Object.freeze([Object.freeze({
    id: "caustic-acid",
    kind: "debuff",
    label: "Acido: 2d4 a inizio turno",
    detail: "Subisce danni da acido all'inizio del turno; il bersaglio o una creatura adiacente può usare un'azione per rimuoverlo.",
    summaryParts: Object.freeze([
      Object.freeze({ id: "caustic-acid-remove-action", label: "Azione: rimuovi" }),
    ]),
    manualRemoval: true,
  })]),
});

export const SUPPLEMENT_SUMMARY_DEFINITIONS = Object.freeze({
  "xanathar-lama-dombra": Object.freeze({
    id: "xanathar-lama-dombra-damage",
    summaryParts: Object.freeze([
      Object.freeze({
        id: "xanathar-lama-dombra-psychic-damage",
        label: "2d8 psichici",
      }),
    ]),
    mechanics: Object.freeze({
      deriveLabel: true,
      damageBonus: Object.freeze({
        total: true,
        dice: Object.freeze({
          count: Object.freeze({
            base: 2,
            baseSlot: 2,
            firstIncrementAt: 3,
            perSlotAbove: 1,
            step: 2,
            max: 5,
          }),
          sides: 8,
        }),
        type: "psichici",
      }),
    }),
  }),
});

export const SUPPLEMENT_EFFECT_CHOICES = Object.freeze({
  "xanathar-abilita-potenziata": Object.freeze(
    SKILL_EMPOWERMENT_OPTIONS.map(({ id, label }) => Object.freeze({
      id,
      label,
      effects: Object.freeze([Object.freeze({
        id: `chosen-skill-expertise-${id}`,
        kind: "buff",
        label: `Maestria: ${label}`,
        detail: `Raddoppia il bonus di competenza nelle prove di ${label}.`,
        summaryParts: Object.freeze([
          Object.freeze({ id: `chosen-skill-expertise-summary-${id}`, label: `Maestria: ${label}` }),
        ]),
      })]),
    })),
  ),
  "xanathar-anatema-elementale": Object.freeze(
    ["acido", "freddo", "fulmine", "fuoco", "tuono"].map((type) => Object.freeze({
      id: type,
      label: `Anatema: ${type}`,
      effects: Object.freeze([Object.freeze({
        id: `elemental-bane-${type}`,
        kind: "debuff",
        label: `Niente res. ${type} · +2d6/turno`,
        detail: `Perde la resistenza ai danni da ${type}; la prima volta in ogni turno in cui li subisce, riceve 2d6 danni extra.`,
        summaryParts: Object.freeze([
          Object.freeze({ id: `elemental-bane-resistance-${type}`, label: `No res. ${type}` }),
          Object.freeze({ id: "elemental-bane-damage", label: "+2d6/turno" }),
        ]),
      })]),
    }))
  ),
  "xanathar-cerimonia": Object.freeze([
    Object.freeze({
      id: "dedication",
      label: "Dedizione · 24 ore",
      defaultTurns: 14400,
      effects: Object.freeze([Object.freeze({
        id: "saving-throw-bonus",
        kind: "buff",
        label: "+1d4 TS",
        detail: "Aggiunge 1d4 ai tiri salvezza per 24 ore.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "ceremony-saving-throw-bonus", label: "TS +1d4" }),
        ]),
      })]),
    }),
    Object.freeze({
      id: "coming-of-age",
      label: "Età adulta · 24 ore",
      defaultTurns: 14400,
      effects: Object.freeze([Object.freeze({
        id: "ability-check-bonus",
        kind: "buff",
        label: "+1d4 prove",
        detail: "Aggiunge 1d4 alle prove di caratteristica per 24 ore.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "ceremony-ability-check-bonus", label: "Prove +1d4" }),
        ]),
      })]),
    }),
    Object.freeze({
      id: "wedding",
      label: "Matrimonio · 7 giorni",
      defaultTurns: 100800,
      effects: Object.freeze([Object.freeze({
        id: "wedding-armor-class",
        kind: "buff",
        label: "+2 CA entro 9m dal coniuge",
        detail: "Bonus di 2 alla CA mentre si trova entro 9 metri dall'altro bersaglio.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "ceremony-wedding-armor-class", label: "+2 CA entro 9 m" }),
        ]),
      })]),
    }),
    Object.freeze({
      id: "funeral-rite",
      label: "Rito funebre · 7 giorni",
      defaultTurns: 100800,
      effects: Object.freeze([Object.freeze({
        id: "cannot-become-undead",
        kind: "buff",
        label: "Non può diventare non morto",
        detail: "Il cadavere non può diventare non morto per 7 giorni, salvo Desiderio.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "ceremony-no-undead-transformation", label: "No trasform. non morto" }),
        ]),
      })]),
    }),
  ]),
  "xanathar-guardiano-della-natura": Object.freeze([
    Object.freeze({
      id: "primal-beast",
      label: "Bestia Primordiale",
      effects: Object.freeze([Object.freeze({
        id: "primal-beast-benefits",
        kind: "buff",
        label: "Bestia: +3m · scurovisione · vant. For · +1d6",
        detail: "Velocità aumentata, scurovisione, vantaggio agli attacchi basati su Forza e danni da forza extra.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "primal-beast-speed", label: "Vel +3 m" }),
          Object.freeze({ id: "primal-beast-darkvision", label: "Scurovisione" }),
          Object.freeze({ id: "primal-beast-strength-advantage", label: "Vant. att. Forza" }),
          Object.freeze({ id: "primal-beast-force-damage", label: "+1d6 forza" }),
        ]),
        mechanics: Object.freeze({
          movement: Object.freeze({
            addMeters: 3,
            appliesTo: Object.freeze(["walk"]),
            label: "Guardiano della Natura (+3m)",
          }),
        }),
      })]),
    }),
    Object.freeze({
      id: "great-tree",
      label: "Grande Albero",
      effects: Object.freeze([Object.freeze({
        id: "great-tree-benefits",
        kind: "buff",
        label: "Albero: 10 PFt · vant. Cos · Des/Sag · terreno diff.",
        detail: "Punti ferita temporanei, vantaggio ai TS Costituzione, vantaggio ad attacchi Des/Sag e terreno difficile attorno al caster.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "great-tree-temporary-hit-points", label: "10 PF temp." }),
          Object.freeze({ id: "great-tree-constitution-save-advantage", label: "Vant. TS Cos" }),
          Object.freeze({ id: "great-tree-dex-wis-attack-advantage", label: "Vant. att. Des/Sag" }),
          Object.freeze({ id: "great-tree-difficult-terrain-aura", label: "Terreno diff. aura" }),
        ]),
      })]),
    }),
  ]),
  "xanathar-pirotecnica": Object.freeze([
    Object.freeze({
      id: "fireworks",
      label: "Fuochi d'Artificio",
      defaultTurns: 1,
      spellExpiry: nextTurn("turn-end", "source"),
      effects: Object.freeze([Object.freeze({
        id: "fireworks-blinded",
        kind: "debuff",
        label: "Accecato",
        detail: "Accecato fino alla fine del turno successivo del caster.",
        expiry: nextTurn("turn-end", "source"),
      })]),
    }),
    Object.freeze({
      id: "smoke",
      label: "Fumo · 1 minuto",
      defaultTurns: 10,
      spellExpiry: null,
      effects: Object.freeze([Object.freeze({
        id: "heavy-smoke",
        kind: "debuff",
        label: "Fumo: area oscurata",
        detail: "L'area è pesantemente oscurata per 1 minuto o finché un vento forte non disperde il fumo.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "pyrotechnics-heavy-smoke", label: "Area oscurata" }),
        ]),
        manualRemoval: true,
        endsParentOnRemoval: true,
      })]),
    }),
  ]),
  "tasha-abito-ultraterreno-di-tasha": Object.freeze([
    Object.freeze({
      id: "lower-planes",
      label: "Piani Inferiori",
      effects: Object.freeze([Object.freeze({
        id: "lower-planes-benefits",
        kind: "buff",
        label: "+2 CA · volo · Imm. fuoco/veleno",
        detail: "Bonus di 2 alla CA, volo, immunità al fuoco o veleno e alla condizione avvelenato, attacchi magici e attacco extra.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "lower-planes-armor-class", label: "+2 CA" }),
          Object.freeze({ id: "lower-planes-flight", label: "Volo 12 m" }),
          Object.freeze({ id: "lower-planes-elemental-immunity", label: "Imm. fuoco/veleno" }),
          Object.freeze({ id: "lower-planes-poisoned-immunity", label: "Imm. avvelenato" }),
          Object.freeze({ id: "lower-planes-magical-attacks", label: "Attacchi magici" }),
          Object.freeze({ id: "lower-planes-extra-attack", label: "Attacco extra" }),
        ]),
        mechanics: Object.freeze({
          movement: Object.freeze({
            modes: Object.freeze({
              fly: Object.freeze({ grantMeters: 12 }),
            }),
            label: "Abito Ultraterreno: volo 12 m",
          }),
        }),
      })]),
    }),
    Object.freeze({
      id: "upper-planes",
      label: "Piani Superiori",
      effects: Object.freeze([Object.freeze({
        id: "upper-planes-benefits",
        kind: "buff",
        label: "+2 CA · volo · Imm. radiosi/necrotici",
        detail: "Bonus di 2 alla CA, volo, immunità ai radiosi o necrotici e alla condizione affascinato, attacchi magici e attacco extra.",
        summaryParts: Object.freeze([
          Object.freeze({ id: "upper-planes-armor-class", label: "+2 CA" }),
          Object.freeze({ id: "upper-planes-flight", label: "Volo 12 m" }),
          Object.freeze({ id: "upper-planes-elemental-immunity", label: "Imm. radiosi/necrotici" }),
          Object.freeze({ id: "upper-planes-charmed-immunity", label: "Imm. affascinato" }),
          Object.freeze({ id: "upper-planes-magical-attacks", label: "Attacchi magici" }),
          Object.freeze({ id: "upper-planes-extra-attack", label: "Attacco extra" }),
        ]),
        mechanics: Object.freeze({
          movement: Object.freeze({
            modes: Object.freeze({
              fly: Object.freeze({ grantMeters: 12 }),
            }),
            label: "Abito Ultraterreno: volo 12 m",
          }),
        }),
      })]),
    }),
  ]),
  "tasha-sudario-spirituale": Object.freeze(
    ["radiosi", "necrotici", "freddo"].map((type) => Object.freeze({
      id: type,
      label: `Sudario: ${type}`,
      effects: Object.freeze([Object.freeze({
        id: `spirit-shroud-${type}`,
        kind: "buff",
        label: `+1d8 ${type} entro 3m`,
        detail: `Gli attacchi infliggono 1d8 danni ${type} extra contro creature entro 3 metri.`,
        summaryParts: Object.freeze([
          Object.freeze({
            id: `spirit-shroud-${type}-damage`,
            label: `+1d8 ${type} entro 3m`,
          }),
        ]),
        mechanics: Object.freeze({
          deriveLabel: true,
          damageBonus: Object.freeze({
            dice: Object.freeze({
              count: Object.freeze({ base: 1, baseSlot: 3, perSlotAbove: 1, step: 2 }),
              sides: 8,
            }),
            type,
          }),
        }),
      })]),
    }))
  ),
});
