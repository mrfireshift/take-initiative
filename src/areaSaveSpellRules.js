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
  "xanathar-arma-sacra",
  "xanathar-collera-della-natura",
  "xanathar-coltello-di-ghiaccio",
  "xanathar-controllare-venti",
  "xanathar-creare-falo",
  "xanathar-diavoletto-di-polvere",
  "xanathar-drago-illusorio",
  "xanathar-eruzione-terrestre",
  "xanathar-fulgore-nauseante",
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
  "xanathar-trasmutare-roccia",
  "xanathar-turbine",
  "xanathar-vampa-di-aganazzar",
  "tasha-miscela-caustica-di-tasha",
  "tasha-turbine-di-spade",
  ...PHB2014_AREA_SAVE_SPELL_IDS,
]);

export const AREA_SAVE_SPELL_ID_SET = new Set(AREA_SAVE_SPELL_IDS);

// Sono gli effetti già presenti nel catalogo generale che appartengono ai
// bersagli del TS. Gli altri effetti dello stesso spell possono appartenere
// al caster o all'oggetto sorgente e non vanno copiati sui bersagli dell'area.
export const AREA_SAVE_EFFECT_RULES = Object.freeze({
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
  effectId = "",
  effectKind = "",
  effectDetail = "",
  exhaustionContribution = false,
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
    ...(effectId ? { effectId } : {}),
    ...(effectKind ? { effectKind } : {}),
    ...(effectDetail ? { effectDetail } : {}),
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
  "black-tentacles": failedAutomation([
    conditionRule("Trattenuto", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
    }),
  ]),
  "confusion": failedAutomation([
    debuffRule(
      "Confusione: azioni e movimento casuali",
      "confusion-random-turn",
      "All'inizio del turno determina casualmente movimento e azione; TS Saggezza a fine turno per terminare.",
      { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
    ),
  ]),
  "fear": failedAutomation([
    debuffRule(
      "Paura: deve fuggire",
      "fear-forced-flight",
      "Nel proprio turno deve Scattare e allontanarsi dal caster lungo il percorso più sicuro.",
      { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
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
  "sleet-storm": failedAutomation([
    conditionRule("Prono", { expiry: manual, independent: true }),
  ], { track: false }),
  "slow": failedAutomation([
    debuffRule(
      "Lentezza: -2 CA/TS Des · no reazioni",
      "slow-penalty",
      "Velocità dimezzata, -2 a CA e TS Destrezza, niente reazioni e scelta limitata tra azione e azione bonus.",
      { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
    ),
  ]),
  "stinking-cloud": failedAutomation([
    debuffRule(
      "Conati: azione persa",
      "stinking-cloud-lost-action",
      "Spende l'azione del turno a vomitare; rimuovere la pill a fine turno.",
      { expiry: manual, independent: true, manualRemoval: true },
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
    }),
  ], { track: false }),
  "weird": failedAutomation([
    conditionRule("Spaventato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
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
  "xanathar-arma-sacra": failedAutomation([
    conditionRule("Accecato", {
      expiry: rounds(10),
      independent: true,
      manualRemoval: true,
    }),
  ], { track: false, concentrationAction: "dismiss" }),
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
          { expiry: concentration, manualRemoval: true, endsParentOnRemoval: true },
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
      id: "other",
      label: "Inondazione / deviazione",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "earthquake": Object.freeze([
    Object.freeze({
      id: "ground",
      label: "Scossa a terra: Prono",
      automation: failedAutomation([
        conditionRule("Prono", { expiry: manual, independent: true }),
      ], { track: false }),
    }),
    Object.freeze({
      id: "fissure",
      label: "Fessura / concentrazione",
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
          { expiry: rounds(10), independent: true, manualRemoval: true },
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
          { expiry: rounds(10), independent: true, manualRemoval: true },
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
          { expiry: rounds(10), independent: true, manualRemoval: true },
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
  "xanathar-collera-della-natura": Object.freeze([
    Object.freeze({
      id: "vines",
      label: "Liane: Trattenuto",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: concentration,
          manualRemoval: true,
          endsParentOnRemoval: true,
        }),
      ]),
    }),
    Object.freeze({
      id: "rocks",
      label: "Rocce: Prono",
      automation: failedAutomation([
        conditionRule("Prono", { expiry: manual, independent: true }),
      ], { track: false }),
    }),
    Object.freeze({
      id: "trees",
      label: "Alberi: solo danno",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  "xanathar-controllare-venti": Object.freeze([
    Object.freeze({
      id: "downdraft",
      label: "Corrente discendente: Prono",
      automation: failedAutomation([
        conditionRule("Prono", { expiry: manual, independent: true }),
      ], { track: false }),
    }),
    Object.freeze({
      id: "other",
      label: "Altra configurazione",
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
