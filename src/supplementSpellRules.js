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
      }),
    }),
  }),
  "xanathar-incuti-paura": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Spaventato"]),
  }),
  "xanathar-muro-di-luce": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Accecato"]),
    targetMode: "area",
    conditionOptions: Object.freeze({
      Accecato: Object.freeze({
        expiry: rounds(10),
        parentEffectId: "",
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
  }),
  "xanathar-sonnellino": Object.freeze({
    mode: "automatic",
    conditions: Object.freeze(["Privo di sensi"]),
  }),
  "xanathar-stretta-della-terra-di-maximilian": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Trattenuto"]),
  }),
  "xanathar-urlo-psichico": Object.freeze({
    mode: "confirm",
    conditions: Object.freeze(["Stordito"]),
    conditionOptions: Object.freeze({
      Stordito: Object.freeze({ expiry: manual }),
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
    })]),
  }),
  "xanathar-muro-di-luce": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Accecato",
      expiry: rounds(10),
      options: Object.freeze({ parentEffectId: "" }),
    })]),
  }),
  "xanathar-sfera-acquea": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Trattenuto",
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
    })]),
  }),
});

export const SUPPLEMENT_EXPIRY = Object.freeze({
  "xanathar-morsa-del-gelo": nextTurn("turn-end", "target"),
  "xanathar-parola-del-potere-dolore": manual,
  "xanathar-urlo-psichico": manual,
});

export const SUPPLEMENT_EFFECTS = Object.freeze({
  "xanathar-abilita-potenziata": Object.freeze([Object.freeze({
    id: "chosen-skill-expertise",
    kind: "buff",
    label: "Maestria: abilità scelta",
    detail: "Raddoppia il bonus di competenza nelle prove dell'abilità scelta.",
  })]),
  "xanathar-aculeo-mentale": Object.freeze([Object.freeze({
    id: "location-known",
    kind: "debuff",
    label: "Localizzato · invis. inefficace",
    detail: "Il caster conosce la posizione del bersaglio, che non può nascondersi e non beneficia dell'invisibilità contro di lui.",
  })]),
  "xanathar-arma-sacra": Object.freeze([Object.freeze({
    id: "holy-weapon",
    kind: "buff",
    label: "Arma magica · +2d8 radiosi",
    detail: "L'arma diventa magica e infligge 2d8 danni radiosi extra.",
  })]),
  "xanathar-colpo-dello-zefiro": Object.freeze([
    Object.freeze({
      id: "no-opportunity-attacks",
      kind: "buff",
      label: "Movimento: no AdO",
      detail: "Il movimento del caster non provoca attacchi di opportunità.",
    }),
    Object.freeze({
      id: "zephyr-strike",
      kind: "buff",
      label: "1 attacco: vant. · +1d8 forza",
      detail: "Una volta dispone di vantaggio a un attacco con arma e infligge 1d8 danni da forza extra se colpisce.",
      manualRemoval: true,
    }),
  ]),
  "xanathar-debilitazione": Object.freeze([Object.freeze({
    id: "enervation-link",
    kind: "debuff",
    label: "Debilitazione: danni e cura",
    detail: "Il caster può ripetere i danni necrotici e recupera metà dei danni inflitti.",
  })]),
  "xanathar-interdizione-primordiale": Object.freeze([Object.freeze({
    id: "elemental-resistances",
    kind: "buff",
    label: "Res. acido/freddo/fulmine/fuoco/tuono",
    detail: "Resistenza ai cinque tipi di danno elementale finché non viene attivata l'immunità con una reazione.",
  })]),
  "xanathar-investitura-del-ghiaccio": Object.freeze([Object.freeze({
    id: "ice-investiture",
    kind: "buff",
    label: "Imm. freddo · Res. fuoco · aura ghiaccio",
    detail: "Immunità al freddo, resistenza al fuoco e terreno difficile ghiacciato attorno al caster.",
  })]),
  "xanathar-investitura-del-vento": Object.freeze([Object.freeze({
    id: "wind-investiture",
    kind: "buff",
    label: "Volo · attacchi distanza svant.",
    detail: "Velocità di volare e svantaggio agli attacchi con arma a distanza contro il caster.",
  })]),
  "xanathar-investitura-della-fiamma": Object.freeze([Object.freeze({
    id: "flame-investiture",
    kind: "buff",
    label: "Imm. fuoco · Res. freddo · aura fuoco",
    detail: "Immunità al fuoco, resistenza al freddo e danni da fuoco alle creature vicine.",
  })]),
  "xanathar-investitura-della-pietra": Object.freeze([Object.freeze({
    id: "stone-investiture",
    kind: "buff",
    label: "Res. armi non magiche · passo nella roccia",
    detail: "Resistenza ai danni fisici da attacchi non magici e movimento attraverso terra e pietra.",
  })]),
  "xanathar-legame-con-le-bestie": Object.freeze([Object.freeze({
    id: "beast-attack-advantage",
    kind: "buff",
    label: "Bestia: vant. attacchi vicino al caster",
    detail: "La bestia dispone di vantaggio contro creature entro 1,5 metri dal caster.",
  })]),
  "xanathar-morsa-del-gelo": Object.freeze([Object.freeze({
    id: "next-weapon-attack-disadvantage",
    kind: "debuff",
    label: "Prossimo attacco con arma: svant.",
    detail: "Svantaggio al prossimo attacco con arma prima della fine del turno successivo del bersaglio.",
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: nextTurn("turn-end", "target"),
  })]),
  "xanathar-nemici-in-abbondanza": Object.freeze([Object.freeze({
    id: "cannot-distinguish-allies",
    kind: "debuff",
    label: "Tutti considerati nemici",
    detail: "Il bersaglio non distingue alleati e nemici; può ripetere il TS ogni volta che subisce danni.",
  })]),
  "xanathar-ombra-di-moil": Object.freeze([Object.freeze({
    id: "shadow-of-moil",
    kind: "buff",
    label: "Oscurato · Res. radiosi · ritorsione",
    detail: "Il caster è pesantemente oscurato, resiste ai radiosi e danneggia chi lo colpisce in mischia.",
  })]),
  "xanathar-parola-del-potere-dolore": Object.freeze([Object.freeze({
    id: "power-word-pain",
    kind: "debuff",
    label: "Vel. max 3m · svantaggi · rischio spell",
    detail: "Velocità massima 3 metri, svantaggio ad attacchi, prove e TS non-Cos; TS Cos per lanciare incantesimi. TS Cos a fine turno per terminare.",
    mechanics: Object.freeze({
      movement: Object.freeze({
        maximumMeters: 3,
        label: "Parola del Potere Dolore (max 3m)",
      }),
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
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: rounds(10),
  })]),
  "xanathar-soffio-del-drago": Object.freeze([Object.freeze({
    id: "dragon-breath-action",
    kind: "buff",
    label: "Azione: soffio del drago",
    detail: "Il bersaglio può usare un'azione per esalare il tipo di energia scelto.",
  })]),
  "xanathar-trasformazione-di-tenser": Object.freeze([Object.freeze({
    id: "tensers-transformation",
    kind: "buff",
    label: "Tenser: 50 PFt · vant. · +2d12 forza",
    detail: "Conferisce 50 PF temporanei, vantaggio agli attacchi con armi, danni da forza extra e competenze marziali.",
  })]),
  "xanathar-vincolo-della-terra": Object.freeze([Object.freeze({
    id: "flying-speed-zero",
    kind: "debuff",
    label: "Velocità di volare: 0",
    detail: "La velocità di volare del bersaglio è ridotta a 0.",
  })]),
  "tasha-fortezza-della-mente": Object.freeze([Object.freeze({
    id: "intellect-fortress",
    kind: "buff",
    label: "Res. psichici · vant. TS Int/Sag/Car",
    detail: "Resistenza ai danni psichici e vantaggio ai tiri salvezza su Intelligenza, Saggezza e Carisma.",
  })]),
  "tasha-miscela-caustica-di-tasha": Object.freeze([Object.freeze({
    id: "caustic-acid",
    kind: "debuff",
    label: "Acido: 2d4 a inizio turno",
    detail: "Subisce danni da acido all'inizio del turno; il bersaglio o una creatura adiacente può usare un'azione per rimuoverlo.",
    manualRemoval: true,
  })]),
});

export const SUPPLEMENT_EFFECT_CHOICES = Object.freeze({
  "xanathar-anatema-elementale": Object.freeze(
    ["acido", "freddo", "fulmine", "fuoco", "tuono"].map((type) => Object.freeze({
      id: type,
      label: `Anatema: ${type}`,
      effects: Object.freeze([Object.freeze({
        id: `elemental-bane-${type}`,
        kind: "debuff",
        label: `Niente res. ${type} · +2d6/turno`,
        detail: `Perde la resistenza ai danni da ${type}; la prima volta in ogni turno in cui li subisce, riceve 2d6 danni extra.`,
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
        mechanics: Object.freeze({
          movement: Object.freeze({
            addMeters: 3,
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
      })]),
    }))
  ),
});
