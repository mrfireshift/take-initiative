import { PHB2014_AREA_SAVE_SPELL_IDS } from "./phb2014SpellRules.js";

// Catalogo esplicito per la Console HP: include soltanto incantesimi che
// producono davvero un tiro salvezza su più creature o in un'area.
// Non usare areaCandidate come fonte di verità: può descrivere anche luce,
// portata o effetti secondari di spell a bersaglio singolo.
export const AREA_SAVE_SPELL_IDS = Object.freeze([
  "antipathy-sympathy",
  "black-tentacles",
  "blade-barrier",
  "burning-hands",
  "call-lightning",
  "calm-emotions",
  "circle-of-death",
  "cloudkill",
  "cone-of-cold",
  "confusion",
  "control-water",
  "delayed-blast-fireball",
  "divine-word",
  "earthquake",
  "entangle",
  "faerie-fire",
  "fear",
  "fire-storm",
  "fireball",
  "flame-strike",
  "freezing-sphere",
  "grease",
  "guardian-of-faith",
  "gust-of-wind",
  "glyph-of-warding",
  "hypnotic-pattern",
  "ice-storm",
  "incendiary-cloud",
  "insect-plague",
  "lightning-bolt",
  "meteor-swarm",
  "moonbeam",
  "prismatic-spray",
  "prismatic-wall",
  "reverse-gravity",
  "shatter",
  "sleet-storm",
  "slow",
  "spirit-guardians",
  "stinking-cloud",
  "storm-of-vengeance",
  "sunbeam",
  "sunburst",
  "symbol",
  "thunderwave",
  "wall-of-fire",
  "wall-of-ice",
  "wall-of-thorns",
  "web",
  "weird",
  "wind-wall",
  "zone-of-truth",
  "xanathar-alba",
  "xanathar-collera-della-natura",
  "xanathar-coltello-di-ghiaccio",
  "xanathar-controllare-venti",
  "xanathar-creare-falo",
  "xanathar-diavoletto-di-polvere",
  "xanathar-drago-illusorio",
  "xanathar-eruzione-terrestre",
  "xanathar-fulgore-nauseante",
  "xanathar-investitura-del-ghiaccio",
  "xanathar-investitura-della-fiamma",
  "xanathar-maelstrom",
  "xanathar-minuscole-meteore-di-melf",
  "xanathar-muro-di-luce",
  "xanathar-onda-di-marea",
  "xanathar-orrido-avvizzimento-di-abi-dalzim",
  "xanathar-oscurita-della-follia",
  "xanathar-parola-radiosa",
  "xanathar-passo-del-tuono",
  "xanathar-pirotecnica",
  "xanathar-rombo-di-tuono",
  "xanathar-sciame-di-palle-di-neve-di-snilloc",
  "xanathar-scossa-sinaptica",
  "xanathar-scossa-tellurica",
  "xanathar-sfera-acquea",
  "xanathar-sfera-al-vetriolo",
  "xanathar-sfera-della-tempesta",
  "xanathar-soffio-del-drago",
  "xanathar-trabocchetto",
  "xanathar-trasmutare-roccia",
  "xanathar-turbine",
  "xanathar-vampa-di-aganazzar",
  "tasha-miscela-caustica-di-tasha",
  "tasha-turbine-di-spade",
  "phb2014-cordone-di-frecce",
  ...PHB2014_AREA_SAVE_SPELL_IDS,
]);

export const AREA_SAVE_SPELL_ID_SET = new Set(AREA_SAVE_SPELL_IDS);

// Workflow con piu bersagli e TS distinti, ma senza una sagoma di lancio.
// Sono esposti da Effetti ad Area per riusare la risoluzione batch senza
// inventare una geometria persistente o un'origine sulla mappa.
export const MULTI_TARGET_SAVE_SPELL_IDS = Object.freeze([
  "bane",
  "legacy-tashas-mind-whip",
  "chain-lightning",
  "command",
  "compulsion",
  "tasha-scheggia-della-mente",
  "xanathar-anatema-elementale",
  "banishment",
  "xanathar-aculeo-mentale",
  "xanathar-urlo-psichico",
  "hold-person",
  "hold-monster",
]);

export const MULTI_TARGET_SAVE_SPELL_ID_SET = new Set(
  MULTI_TARGET_SAVE_SPELL_IDS,
);

// Incantesimi a bersaglio singolo il cui effetto persistente richiede anche
// una sagoma indipendente sulla mappa.
export const SINGLE_TARGET_PLACED_SAVE_SPELL_IDS = Object.freeze([
  "phb2014-allucinazione-di-forza",
]);

export const AREA_POPOVER_SAVE_SPELL_ID_SET = new Set([
  ...AREA_SAVE_SPELL_IDS,
  ...MULTI_TARGET_SAVE_SPELL_IDS,
  ...SINGLE_TARGET_PLACED_SAVE_SPELL_IDS,
]);

// Zone e aure reali che non richiedono un TS al momento del lancio, ma che
// devono comunque poter essere posizionate e mantenute sulla mappa. Restano
// separate da AREA_SAVE_SPELL_IDS per non inventare esiti o condizioni.
export const AREA_PLACEMENT_ONLY_SPELL_IDS = Object.freeze([
  "alarm",
  "antilife-shell",
  "antimagic-field",
  "color-spray",
  "darkness",
  "daylight",
  "flaming-sphere",
  "fog-cloud",
  "forcecage",
  "globe-of-invulnerability",
  "hallow",
  "hallucinatory-terrain",
  "holy-aura",
  "magic-circle",
  "mass-cure-wounds",
  "mirage-arcane",
  "misty-step",
  "move-earth",
  "private-sanctum",
  "silence",
  "sleep",
  "speak-with-plants",
  "spike-growth",
  "teleportation-circle",
  "tiny-hut",
  "xanathar-boschetto-druidico",
  "xanathar-spirito-guaritore",
  "xanathar-tempio-degli-dei",
  "xanathar-vento-di-interdizione",
  "phb2014-fame-di-hadar",
  "phb2014-nube-di-pugnali",
  "phb2014-aura-di-purezza",
  "phb2014-aura-di-vita",
  "phb2014-aura-di-vitalita",
  "phb2014-cerchio-di-potere",
]);

export const AREA_PLACEMENT_ONLY_SPELL_ID_SET = new Set(
  AREA_PLACEMENT_ONLY_SPELL_IDS,
);

export const AREA_HEALING_SPELL_ID_SET = new Set([
  "mass-cure-wounds",
  "phb2014-aura-di-vitalita",
]);

export const AREA_PLACEABLE_SPELL_IDS = Object.freeze(
  Array.from(new Set([
    ...AREA_SAVE_SPELL_IDS,
    ...AREA_PLACEMENT_ONLY_SPELL_IDS,
    ...SINGLE_TARGET_PLACED_SAVE_SPELL_IDS,
  ])),
);

export const AREA_POPOVER_SPELL_IDS = Object.freeze([
  ...AREA_PLACEABLE_SPELL_IDS,
  ...MULTI_TARGET_SAVE_SPELL_IDS,
]);

export const AREA_POPOVER_SPELL_ID_SET = new Set(AREA_POPOVER_SPELL_IDS);

// Audit esplicito dei record che possiedono un campo `area`, ma nei quali la
// misura non rappresenta una sagoma di effetto risolvibile dal popover.
// Mantenerli classificati evita che euristiche future li aggiungano per errore.
export const AREA_FIELD_NON_POPOVER_REASONS = Object.freeze({
  "arcane-eye": "sensory-radius",
  "xanathar-investitura-del-vento": "active-action-only-area",
  "xanathar-investitura-della-pietra": "active-action-only-area",
  "conjure-elemental": "summon-source-volume",
  "create-or-destroy-water": "environment-volume",
  "creation": "created-object-volume",
  "detect-evil-and-good": "sensory-radius",
  "detect-magic": "sensory-radius",
  "detect-poison-and-disease": "sensory-radius",
  "disintegrate": "single-object-size",
  "fire-shield": "light-radius",
  "forbiddance": "complex-footprint",
  "guards-and-wards": "complex-footprint",
  "xanathar-arma-sacra": "active-dismissal-area",
  "magnificent-mansion": "created-portal-volume",
  "programmed-illusion": "illusion-volume",
  "silent-image": "illusion-volume",
  "telekinesis": "single-target-reach",
  "teleport": "caster-proximity-selection",
  "word-of-recall": "caster-proximity-selection",
  "xanathar-controllare-fiamme": "manipulated-object-volume",
  "xanathar-immolazione": "single-target-light-radius",
  "xanathar-modellare-acqua": "manipulated-object-volume",
  "xanathar-modellare-terra": "manipulated-object-volume",
  "tasha-lama-del-disastro": "created-object-reach",
  "tasha-lama-roboante": "single-target-reach",
  "tasha-lama-verdefiamma": "single-target-reach",
  "tasha-lenza-elettrizzante": "single-target-reach",
  "tasha-sudario-spirituale": "attack-bonus-radius",
});

// Sono gli effetti già presenti nel catalogo generale che appartengono ai
// bersagli del TS. Gli altri effetti dello stesso spell possono appartenere
// al caster o all'oggetto sorgente e non vanno copiati sui bersagli dell'area.
export const AREA_SAVE_EFFECT_RULES = Object.freeze({
  "bane": Object.freeze({
    failedEffectIds: Object.freeze(["attack-save-penalty"]),
  }),
  "legacy-tashas-mind-whip": Object.freeze({
    failedEffectIds: Object.freeze(["no-reaction-and-limited-turn-options"]),
  }),
  "xanathar-aculeo-mentale": Object.freeze({
    failedEffectIds: Object.freeze(["location-known"]),
  }),
  "xanathar-debilitazione": Object.freeze({
    failedEffectIds: Object.freeze(["enervation-link"]),
  }),
  "tasha-scheggia-della-mente": Object.freeze({
    failedEffectIds: Object.freeze(["next-saving-throw-penalty"]),
  }),
  "holy-aura": Object.freeze({
    failedEffectIds: Object.freeze(["holy-aura-protection"]),
  }),
  "xanathar-anatema-elementale": Object.freeze({
    failedEffectIds: Object.freeze([
      "elemental-bane-acido",
      "elemental-bane-freddo",
      "elemental-bane-fulmine",
      "elemental-bane-fuoco",
      "elemental-bane-tuono",
    ]),
  }),
  "faerie-fire": Object.freeze({
    failedEffectIds: Object.freeze(["incoming-attack-advantage"]),
  }),
  "xanathar-pirotecnica": Object.freeze({
    choiceId: "fireworks",
    failedEffectIds: Object.freeze(["fireworks-blinded"]),
  }),
  "xanathar-scossa-sinaptica": Object.freeze({
    failedEffectIds: Object.freeze(["synaptic-static-penalty"]),
  }),
  "tasha-miscela-caustica-di-tasha": Object.freeze({
    failedEffectIds: Object.freeze(["caustic-acid"]),
  }),
});

const concentration = Object.freeze({ mode: "concentration" });
const manual = Object.freeze({ mode: "manual" });
const rounds = (remaining) => Object.freeze({ mode: "rounds", remaining });
const nextTurn = (mode, actor = "source") => Object.freeze({
  mode,
  actor,
  remaining: 1,
  anchor: "next-turn",
});

function conditionRule(condition, {
  expiry = null,
  independent = false,
  manualRemoval = false,
  endsParentOnRemoval = false,
  context = null,
  effectId = "",
  effectKind = "",
  effectDetail = "",
  exhaustionContribution = false,
  summaryParts = null,
  saveReminder = null,
  deferredEffect = null,
} = {}) {
  const ruleOptions = {
    ...(independent ? { parentEffectId: "" } : {}),
    ...(exhaustionContribution ? { exhaustionContribution: true } : {}),
  };
  return Object.freeze({
    condition,
    ...(expiry ? { expiry } : {}),
    ...(Object.keys(ruleOptions).length ? { options: Object.freeze(ruleOptions) } : {}),
    ...(manualRemoval ? { manualRemoval: true } : {}),
    ...(endsParentOnRemoval ? { endsParentOnRemoval: true } : {}),
    ...(context && typeof context === "object" ? { context: Object.freeze(context) } : {}),
    ...(effectId ? { effectId } : {}),
    ...(effectKind ? { effectKind } : {}),
    ...(effectDetail ? { effectDetail } : {}),
    ...(Array.isArray(summaryParts) ? { summaryParts } : {}),
    ...(saveReminder ? { saveReminder } : {}),
    ...(deferredEffect ? { deferredEffect } : {}),
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

function failedAutomation(rules, { track = true, concentrationAction = "" } = {}) {
  return Object.freeze({
    trackOutcomes: Object.freeze(track ? ["failed"] : []),
    failed: Object.freeze(rules),
    ...(concentrationAction ? { concentrationAction } : {}),
  });
}

const noPersistentEffect = Object.freeze({
  trackOutcomes: Object.freeze([]),
});

// Regole che non sono già rappresentate dagli effetti generali dello spell.
// track=false mantiene condizioni istantanee (es. Prono) indipendenti da una
// pill spell di un round, che altrimenti le rimuoverebbe troppo presto.
export const AREA_SAVE_AUTOMATION_RULES = Object.freeze({
  "banishment": failedAutomation([
    conditionRule("Incapacitato", {
      expiry: concentration,
      manualRemoval: true,
      context: { field: "planeOrigin", equals: "current-plane" },
    }),
  ]),
  "chain-lightning": noPersistentEffect,
  "color-spray": failedAutomation([
    conditionRule("Accecato", {
      expiry: nextTurn("turn-end", "source"),
      independent: true,
      manualRemoval: true,
    }),
  ], { track: false }),
  "mass-cure-wounds": noPersistentEffect,
  "sleep": failedAutomation([
    conditionRule("Privo di sensi", {
      expiry: rounds(10),
      manualRemoval: true,
      endsParentOnRemoval: true,
    }),
  ]),
  "compulsion": failedAutomation([
    debuffRule(
      "Compulsione: Movimento imposto",
      "compulsion-forced-movement",
      "Nel proprio turno deve usare il movimento nella direzione indicata dal caster.",
      {
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
        parentRemoval: "target",
      },
    ),
  ]),
  "divine-word": noPersistentEffect,
  "glyph-of-warding": noPersistentEffect,
  "guardian-of-faith": noPersistentEffect,
  "gust-of-wind": noPersistentEffect,
  "black-tentacles": noPersistentEffect,
  "earthquake": failedAutomation([
    conditionRule("Prono", { expiry: manual, independent: true }),
  ], { track: false }),
  "confusion": failedAutomation([
    debuffRule(
      "Confusione: azioni e movimento casuali",
      "confusion-random-turn",
      "Niente reazioni. All'inizio del turno tira fisicamente un d10: 1 usa tutto il movimento in una direzione casuale (il caster assegna una direzione a ogni faccia di un d8) e non effettua un'azione; 2-6 non si muove né effettua un'azione; 7-8 usa l'azione per un attacco in mischia contro un'altra creatura a portata determinata casualmente, oppure non fa nulla se non c'è una creatura a portata; 9-10 può agire e muoversi normalmente. I risultati restano manuali al tavolo. A fine turno può effettuare il TS Saggezza; se lo supera, Confusione termina su di sé.",
      {
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "confusion-no-reactions", label: "No reaz." }),
          Object.freeze({ id: "confusion-random-table", label: "Tira d10 inizio turno" }),
        ]),
        saveReminder: Object.freeze([
          Object.freeze({
            timing: "turn-start",
            mode: "consume",
            label: "Tira il d10 fisico: 1 movimento casuale + d8 direzione, no azione; 2-6 niente; 7-8 attacco mischia casuale se disponibile; 9-10 normale.",
          }),
          Object.freeze({
            ability: "wis",
            timing: "turn-end",
            dcSource: "source-spell",
            label: "Se supera il TS, termina Confusione su di sé.",
          }),
        ]),
      },
    ),
  ]),
  "fear": failedAutomation([
    debuffRule(
      "Paura: deve fuggire",
      "fear-forced-flight",
      "Al fallimento iniziale: lascia cadere ciò che impugna e diventa Spaventato. Durante il proprio turno deve usare Scatto e allontanarsi dal caster lungo il percorso disponibile più sicuro, salvo che non abbia un luogo verso cui muoversi. Drop, movimento e percorso sono manuali al tavolo; il drop avviene una sola volta. A fine turno può effettuare il TS Saggezza solo se il caster non è in vista; il GM verifica manualmente la linea di vista.",
      {
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "fear-flight", label: "Scatto: allontanati dal caster" }),
        ]),
        saveReminder: Object.freeze({
          timing: "turn-start",
          mode: "consume",
          label: "Nel tuo turno usa Scatto e allontanati dal caster lungo il percorso più sicuro, se hai un luogo verso cui muoverti.",
        }),
      },
    ),
  ]),
  "grease": failedAutomation([
    conditionRule("Prono", { expiry: manual, independent: true }),
  ], { track: false }),
  "reverse-gravity": failedAutomation([
    debuffRule(
      "Gravità invertita: sospeso",
      "reverse-gravity-suspended",
      "Cade verso l'alto e rimane sospeso finché resta nell'area.",
      { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
    ),
  ]),
  "sleet-storm": noPersistentEffect,
  "hold-person": failedAutomation([
    conditionRule("Paralizzato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "target",
      saveReminder: Object.freeze({
        ability: "wis",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Blocca Persone.",
      }),
    }),
  ]),
  "hold-monster": failedAutomation([
    conditionRule("Paralizzato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
      parentRemoval: "target",
      saveReminder: Object.freeze({
        ability: "wis",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Blocca Mostri.",
      }),
    }),
  ]),
  "slow": failedAutomation([
    debuffRule(
      "Lentezza: -2 CA/TS Des · no reazioni",
      "slow-penalty",
      "Velocità dimezzata; CA -2; TS Des -2; niente reazioni; nel turno può usare una sola tra azione e azione bonus. Non può effettuare più di un attacco in mischia o a distanza, indipendentemente dalle capacità. Se tenta un incantesimo con tempo di lancio di 1 azione, tira d20: con 11+ l'incantesimo è ritardato al turno successivo e deve completarlo con un'azione; se non può, è sprecato. Tiro e gestione restano manuali al tavolo.",
      {
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "speed-half", label: "Vel ½" }),
          Object.freeze({ id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" }),
          Object.freeze({ id: "no-reactions", label: "No reaz." }),
          Object.freeze({ id: "action-or-bonus", label: "Azione o Bonus" }),
          Object.freeze({ id: "attack-limit", label: "Max 1 att." }),
        ]),
        saveReminder: Object.freeze({
          ability: "wis",
          timing: "turn-end",
          dcSource: "source-spell",
          label: "Se supera il TS, termina Lentezza su di sé.",
        }),
      },
    ),
  ]),
  "spirit-guardians": noPersistentEffect,
  "stinking-cloud": failedAutomation([
    debuffRule(
      "Conati: azione persa",
      "stinking-cloud-lost-action",
      "Spende l'azione del turno a vomitare; rimuovere la pill a fine turno.",
      {
        expiry: Object.freeze({ mode: "turn-end", actor: "target", remaining: 1 }),
        manualRemoval: true,
      },
    ),
  ], { track: false }),
  "sunbeam": failedAutomation([
    conditionRule("Accecato", {
      expiry: nextTurn("turn-start", "source"),
      independent: true,
      manualRemoval: true,
    }),
  ], { track: false }),
  "sunburst": failedAutomation([
    conditionRule("Accecato", {
      expiry: rounds(10),
      independent: true,
      manualRemoval: true,
      saveReminder: Object.freeze({
        ability: "con",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Accecato su di sé.",
      }),
    }),
  ], { track: false }),
  "weird": failedAutomation([
    conditionRule("Spaventato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
      summaryParts: Object.freeze([
        Object.freeze({ id: "weird-psychic-damage", label: "4d10 psichici se fallisce" }),
      ]),
      saveReminder: Object.freeze({
        ability: "wis",
        timing: "turn-end",
        dcSource: "source-spell",
        damage: Object.freeze({
          dice: "4d10",
          type: "psichici",
          onSave: "none",
        }),
        label: "4d10 psichici se fallisce; se supera, termina la spell.",
      }),
    }),
  ]),
  "zone-of-truth": failedAutomation([
    debuffRule(
      "Zona di Verità: non può mentire",
      "zone-of-truth-no-lies",
      "Non può pronunciare deliberatamente una menzogna mentre rimane nella zona.",
      { expiry: rounds(100), manualRemoval: true, endsParentOnRemoval: true },
    ),
  ]),
  "xanathar-fulgore-nauseante": failedAutomation([
    conditionRule("Indebolimento", {
      expiry: concentration,
      exhaustionContribution: true,
    }),
    debuffRule(
      "Fulgore: invisibilità inefficace",
      "sickening-radiance-no-invisibility",
      "Emette luce verdastra e non può beneficiare dell'invisibilità.",
      { expiry: concentration },
    ),
  ]),
  "xanathar-investitura-del-ghiaccio": failedAutomation([
    debuffRule(
      "Velocità dimezzata",
      "ice-investiture-slow",
      "Velocità dimezzata fino all'inizio del turno successivo del caster.",
      { expiry: nextTurn("turn-start", "source"), independent: true },
    ),
  ], { track: false }),
  "xanathar-investitura-della-fiamma": noPersistentEffect,
  "xanathar-collera-della-natura": noPersistentEffect,
  "xanathar-onda-di-marea": failedAutomation([
    conditionRule("Prono", { expiry: manual, independent: true }),
  ], { track: false }),
  "xanathar-scossa-tellurica": failedAutomation([
    conditionRule("Prono", { expiry: manual, independent: true }),
  ], { track: false }),
  "xanathar-sfera-al-vetriolo": failedAutomation([
    debuffRule(
      "Acido ritardato: 5d4 a fine turno",
      "vitriolic-sphere-delayed-acid",
      "Subisce 5d4 danni da acido alla fine del prossimo turno.",
      {
        expiry: nextTurn("turn-end", "target"),
        independent: true,
        manualRemoval: true,
        deferredEffect: Object.freeze({
          id: "vitriolic-sphere-delayed-acid",
          timing: "turn-end",
          actor: "target",
          anchor: "next-turn",
          reminder: "5d4 danni da acido",
          damage: Object.freeze({ dice: "5d4", type: "acido" }),
          provenance: Object.freeze({
            spellId: "xanathar-sfera-al-vetriolo",
            spellName: "Sfera al Vetriolo",
          }),
        }),
      },
    ),
  ], { track: false }),
  "xanathar-trasmutare-roccia": failedAutomation([
    conditionRule("Trattenuto", {
      expiry: manual,
      independent: true,
      manualRemoval: true,
    }),
  ], { track: false }),
  "xanathar-trabocchetto": failedAutomation([
    conditionRule("Trattenuto", {
      expiry: manual,
      manualRemoval: true,
      endsParentOnRemoval: true,
      saveReminder: Object.freeze({
        ability: "dex",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Trattenuto su di sé.",
      }),
    }),
  ]),
  "phb2014-cordone-di-frecce": noPersistentEffect,
});

// Varianti in cui lo stesso incantesimo usa TS diversi o produce risultati
// incompatibili. La Console HP deve chiedere quale sotto-effetto si sta
// risolvendo, invece di applicare una condizione arbitraria.
export const AREA_SAVE_RULE_CHOICES = Object.freeze({
  "antipathy-sympathy": Object.freeze([
    Object.freeze({
      id: "antipathy",
      label: "Antipatia",
      automation: failedAutomation([
        conditionRule("Spaventato", {
          expiry: rounds(144000),
          manualRemoval: true,
          endsParentOnRemoval: true,
        }),
      ]),
    }),
    Object.freeze({
      id: "sympathy",
      label: "Simpatia",
      automation: failedAutomation([
        debuffRule(
          "Simpatia: attratto dalla destinazione",
          "sympathy-attraction",
          "Deve usare il movimento per raggiungere la destinazione e non può allontanarsene volontariamente.",
          { expiry: rounds(144000), manualRemoval: true, endsParentOnRemoval: true },
        ),
      ]),
    }),
  ]),
  "calm-emotions": Object.freeze([
    Object.freeze({
      id: "suppress",
      label: "Sopprimi Affascinato/Spaventato",
      automation: failedAutomation([
        debuffRule(
          "Emozioni soppresse",
          "calm-emotions-suppression",
          "Gli effetti Affascinato e Spaventato sono soppressi per la durata.",
          {
            expiry: concentration,
            manualRemoval: true,
            endsParentOnRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "calm-emotions-suppressed", label: "Aff./Spav. soppressi" }),
            ]),
          },
        ),
      ]),
    }),
    Object.freeze({
      id: "indifference",
      label: "Indifferenza",
      automation: failedAutomation([
        debuffRule(
          "Calma: indifferente agli ostili",
          "calm-emotions-indifference",
          "Diventa indifferente alle creature ostili scelte dal caster.",
          { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
        ),
      ]),
    }),
  ]),
  "control-water": Object.freeze([
    Object.freeze({
      id: "whirlpool",
      label: "Vortice: intrappolato",
      automation: failedAutomation([
        debuffRule(
          "Intrappolato nel vortice",
          "control-water-whirlpool",
          "Rimane intrappolato nel vortice; può usare un'azione per tentare di liberarsi.",
          { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
        ),
      ]),
    }),
    Object.freeze({
      id: "flood",
      label: "Inondazione",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "redirect",
      label: "Deviare corrente",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "part",
      label: "Separare le acque",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "moonbeam": Object.freeze([
    Object.freeze({
      id: "damage",
      label: "Creatura normale: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "shapechanger",
      label: "Mutaforma: forma originale",
      automation: failedAutomation([
        debuffRule(
          "Mutaforma: bloccato nella forma originale",
          "moonbeam-shapechanger-reversion",
          "Ritorna alla forma originale e non può assumerne un'altra finché non lascia la luce lunare.",
          { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
        ),
      ]),
      replaceBase: true,
    }),
  ]),
  "prismatic-spray": Object.freeze([
    Object.freeze({
      id: "damage",
      label: "Raggio 1-5: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "indigo",
      label: "Raggio indaco: Trattenuto",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: manual,
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "violet",
      label: "Raggio viola: Accecato",
      automation: failedAutomation([
        conditionRule("Accecato", {
          expiry: nextTurn("turn-start", "source"),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
  ]),
  "prismatic-wall": Object.freeze([
    Object.freeze({
      id: "proximity",
      label: "Vista ravvicinata: Accecato 1 min",
      automation: failedAutomation([
        conditionRule("Accecato", {
          expiry: rounds(10),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "indigo",
      label: "Strato indaco: Trattenuto",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: manual,
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "violet",
      label: "Strato viola: Accecato",
      automation: failedAutomation([
        conditionRule("Accecato", {
          expiry: nextTurn("turn-start", "source"),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
  ]),
  "storm-of-vengeance": Object.freeze([
    Object.freeze({
      id: "round-1",
      label: "Round 1: Assordato",
      automation: failedAutomation([
        conditionRule("Assordato", {
          expiry: rounds(50),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
    }),
    Object.freeze({
      id: "later-rounds",
      label: "Round successivo: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "symbol": Object.freeze([
    Object.freeze({
      id: "death",
      label: "Morte: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "discord",
      label: "Discordia",
      automation: failedAutomation([
        debuffRule(
          "Discordia: svantaggio ad attacchi e prove",
          "symbol-discord",
          "Svantaggio ai tiri per colpire e alle prove di caratteristica.",
          {
            expiry: rounds(10),
            independent: true,
            manualRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "symbol-discord-attacks", label: "Svant. attacchi" }),
              Object.freeze({ id: "symbol-discord-checks", label: "Svant. prove" }),
            ]),
          },
        ),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "despair",
      label: "Disperazione",
      automation: failedAutomation([
        debuffRule(
          "Disperazione: non può attaccare",
          "symbol-despair",
          "Non può attaccare né bersagliare creature con capacità, incantesimi o altri effetti dannosi.",
          {
            expiry: rounds(10),
            independent: true,
            manualRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "symbol-despair-no-attacks", label: "No attacchi" }),
              Object.freeze({ id: "symbol-despair-no-harmful-targets", label: "No bersagli dannosi" }),
            ]),
          },
        ),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "fear",
      label: "Paura",
      automation: failedAutomation([
        conditionRule("Spaventato", {
          expiry: rounds(10),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "insanity",
      label: "Follia",
      automation: failedAutomation([
        debuffRule(
          "Follia: azioni incontrollate",
          "symbol-insanity",
          "Non può effettuare azioni, comprendere parole o comunicare; il GM ne controlla il movimento.",
          {
            expiry: rounds(10),
            independent: true,
            manualRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "symbol-insanity-no-actions", label: "No azioni" }),
              Object.freeze({ id: "symbol-insanity-no-communication", label: "No parole/compr." }),
              Object.freeze({ id: "symbol-insanity-gm-movement", label: "Mov. controllato GM" }),
            ]),
          },
        ),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "pain",
      label: "Dolore: Incapacitato",
      automation: failedAutomation([
        conditionRule("Incapacitato", {
          expiry: rounds(10),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "sleep",
      label: "Sonno: Privo di sensi",
      automation: failedAutomation([
        conditionRule("Privo di sensi", {
          expiry: rounds(100),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "stunning",
      label: "Stordimento",
      automation: failedAutomation([
        conditionRule("Stordito", {
          expiry: rounds(10),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
  ]),
  "xanathar-controllare-venti": Object.freeze([
    Object.freeze({
      id: "downdraft",
      label: "Corrente discendente",
      automation: noPersistentEffect,
    }),
    Object.freeze({
      id: "gusts",
      label: "Folate",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "updraft",
      label: "Corrente ascendente",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "paused",
      label: "Effetto sospeso",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "xanathar-drago-illusorio": Object.freeze([
    Object.freeze({
      id: "frightful",
      label: "Manifestazione: Spaventato",
      automation: failedAutomation([
        conditionRule("Spaventato", {
          expiry: rounds(10),
          independent: true,
          manualRemoval: true,
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "breath",
      label: "Soffio: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "xanathar-turbine": Object.freeze([
    Object.freeze({
      id: "damage",
      label: "Ingresso: TS Des, solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "capture",
      label: "Presa: TS For, Trattenuto",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: concentration,
          manualRemoval: true,
          endsParentOnRemoval: true,
        }),
      ]),
      replaceBase: true,
    }),
  ]),
});
