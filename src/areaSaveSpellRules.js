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
  "xanathar-prigione-mentale",
  "xanathar-urlo-psichico",
  "hold-person",
  "hold-monster",
  // A save with damage on one creature (lotto L2, 2014 texts).
  "xanathar-catapulta",
  "hellish-rebuke",
  "phb2014-sussurri-dissonanti",
  "blight",
  // CAP-HP-BRANCH (2014 texts): one creature, the effect read from its hit points (hpBranchSpellRules.js).
  "disintegrate",
  "finger-of-death",
  "xanathar-flusso-di-energia-negativa",
  "power-word-kill",
  "feeblemind",
  // CAP-STABILIZE (2014 texts): one creature, dying or dead (stabilizeSpellRules.js).
  "spare-the-dying",
  "revivify",
  "raise-dead",
  "resurrection",
  "reincarnate",
  "true-resurrection",
  // CAP-CLEANSE (2014 texts): one creature, the pills and spells that end on it (cleanseSpellRules.js).
  "heal",
  "phb2014-parola-del-potere-guarire",
  "lesser-restoration",
  "dispel-magic",
  "remove-curse",
  // Decision D6 of docs/PIANO_POLISH_INCANTESIMI.md: a save at the cast, on creatures chosen in the panel. The quick launch
  // applies them at once, the save taken as failed (quickActionSpellExecutionCore.js); the panel asks each outcome.
  "animal-friendship",
  "bestow-curse",
  "charm-person",
  "dominate-beast",
  "dominate-monster",
  "dominate-person",
  "enthrall",
  "geas",
  "hideous-laughter",
  "imprisonment",
  "mass-suggestion",
  "modify-memory",
  "phantasmal-killer",
  "planar-binding",
  "suggestion",
  "xanathar-charme-sui-mostri",
  "xanathar-incuti-paura",
  "xanathar-nemici-in-abbondanza",
  "xanathar-vincolo-della-terra",
  "phb2014-corona-di-follia",
  "phb2014-duello-obbligato",
  // No save: darts that always hit, split among the targets (magicMissileCore.js).
  "magic-missile",
  // Lot 3 of docs/PIANO_POLISH_INCANTESIMI.md. A save at the cast: the cantrip's damage and its label (Frostbite), the hand's
  // grip (Earthen Grasp). An attack that leaves an effect: the same outcomes under other names, "Colpito" and "Mancato".
  "xanathar-morsa-del-gelo",
  "xanathar-stretta-della-terra-di-maximilian",
  "phb2014-dardo-stregato",
  "ray-of-enfeeblement",
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
  "dimension-door",
  "misty-step",
  "xanathar-passo-remoto",
  "move-earth",
  "pass-without-trace",
  "private-sanctum",
  "silence",
  "sleep",
  "speak-with-plants",
  "spike-growth",
  "teleportation-circle",
  "phb2014-portale-arcano",
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
  // Zones of lotto L3 (2014 texts).
  "xanathar-muro-di-sabbia",
  "wall-of-force",
  "forbiddance",
  // CAP-TERRAIN, lotto G1 (2014 texts): the terrain and its movement cost, nothing else.
  "plant-growth",
  "xanathar-muro-dacqua",
]);

export const AREA_PLACEMENT_ONLY_SPELL_ID_SET = new Set(
  AREA_PLACEMENT_ONLY_SPELL_IDS,
);

export const AREA_HEALING_SPELL_ID_SET = new Set([
  "mass-cure-wounds",
  "phb2014-aura-di-vitalita",
  // Discrete heals of lotto L2 (2014 texts): no shape, the creatures chosen in the panel, the same area command.
  "cure-wounds",
  "healing-word",
  "prayer-of-healing",
  "mass-healing-word",
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
  // Only tracked, by the owner's decision: not a spell for a fight, and a mile's square would be 1.1 million cells.
  "mirage-arcane": "tracked-only",
  "xanathar-investitura-del-vento": "active-action-only-area",
  "xanathar-investitura-della-pietra": "active-action-only-area",
  // The creature touched breathes the cone later, with its action (CAP-ORIGIN).
  "xanathar-soffio-del-drago": "active-action-only-area",
  "conjure-elemental": "summon-source-volume",
  "create-or-destroy-water": "environment-volume",
  "creation": "created-object-volume",
  "detect-evil-and-good": "sensory-radius",
  "detect-magic": "sensory-radius",
  "detect-poison-and-disease": "sensory-radius",
  "fire-shield": "light-radius",
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
  // D6: the effects these spells declare go to who fails the save.
  "enthrall": Object.freeze({ failedEffectIds: Object.freeze(["enthrall-perception-disadvantage"]) }),
  "mass-suggestion": Object.freeze({ failedEffectIds: Object.freeze(["mass-suggestion-compelled"]) }),
  "suggestion": Object.freeze({ failedEffectIds: Object.freeze(["suggestion-compelled"]) }),
  "xanathar-nemici-in-abbondanza": Object.freeze({ failedEffectIds: Object.freeze(["cannot-distinguish-allies"]) }),
  "xanathar-vincolo-della-terra": Object.freeze({ failedEffectIds: Object.freeze(["flying-speed-zero"]) }),
  "bestow-curse": Object.freeze({
    failedEffectIds: Object.freeze([
      "curse-ability-strength",
      "curse-ability-dexterity",
      "curse-ability-constitution",
      "curse-ability-intelligence",
      "curse-ability-wisdom",
      "curse-ability-charisma",
      "curse-attacks-against-caster",
      "curse-wasted-action",
      "curse-extra-necrotic-damage",
    ]),
  }),
  "bane": Object.freeze({
    failedEffectIds: Object.freeze(["attack-save-penalty"]),
  }),
  "legacy-tashas-mind-whip": Object.freeze({
    failedEffectIds: Object.freeze(["no-reaction-and-limited-turn-options"]),
  }),
  "xanathar-aculeo-mentale": Object.freeze({
    failedEffectIds: Object.freeze(["location-known"]),
  }),
  "xanathar-prigione-mentale": Object.freeze({
    failedEffectIds: Object.freeze(["mental-prison-link"]),
  }),
  "xanathar-debilitazione": Object.freeze({
    failedEffectIds: Object.freeze(["enervation-link"]),
  }),
  "tasha-scheggia-della-mente": Object.freeze({
    failedEffectIds: Object.freeze(["next-saving-throw-penalty"]),
  }),
  "xanathar-morsa-del-gelo": Object.freeze({
    failedEffectIds: Object.freeze(["next-weapon-attack-disadvantage"]),
  }),
  "phb2014-dardo-stregato": Object.freeze({
    failedEffectIds: Object.freeze(["witch-bolt-link"]),
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
  // The blindness of the fireworks only: with the smoke variant a failed save blinds nothing (lotto L3). choiceId is
  // the variant when none is chosen.
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
  mechanics = null,
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
    ...(mechanics && typeof mechanics === "object" ? { mechanics: Object.freeze({ ...mechanics }) } : {}),
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

// Symbol's effects stay on a creature with no pill of the spell: without an effect kind the card shows them on their own.
function symbolEffectRule(condition, effectId, effectDetail, options = {}) {
  return conditionRule(condition, {
    ...options,
    effectId,
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
  "geas": failedAutomation([
    conditionRule("Affascinato", {
      expiry: rounds(432000),
      manualRemoval: true,
      endsParentOnRemoval: true,
      effectDetail: "Affascinato dal caster per la durata. Subisce 5d10 danni psichici quando agisce contro il comando, al massimo una volta al giorno. Finisce anche con rimuovi maledizione, ristorare superiore o desiderio.",
    }),
  ]),
  // D6: nothing but the pill of the spell, on who fails the save; the rest stays at the table.
  "imprisonment": failedAutomation([]),
  // 2014: charmed and incapacitated for the duration. Damage ends the spell; so does another spell on the target, at the
  // table. The memories stay at the table too.
  "modify-memory": failedAutomation([
    conditionRule("Affascinato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
      mechanics: { endsOnDamage: true },
      effectDetail: "Ignaro di ciò che accade, ma sente il caster. Se subisce danni o è bersagliato da un altro incantesimo, l'incantesimo termina e nessun ricordo cambia. Chi combatte contro il caster ha vantaggio al TS.",
    }),
    conditionRule("Incapacitato", {
      expiry: concentration,
      manualRemoval: true,
      endsParentOnRemoval: true,
      mechanics: { endsOnDamage: true },
    }),
  ]),
  "planar-binding": failedAutomation([]),
  // CAP-HP-BRANCH: the 4d6 come with the cast whatever the save; a failure leaves the mind shattered until a
  // save at the end of every 30 days (at the table), Greater Restoration, Heal or Wish.
  "feeblemind": failedAutomation([
    debuffRule(
      "Regressione mentale",
      "feeblemind-shattered",
      "Intelligenza e Carisma a 1: non può lanciare incantesimi, attivare oggetti magici, comprendere linguaggi né comunicare in modo intelligibile; riconosce, segue e protegge gli amici. TS Intelligenza ogni 30 giorni; terminano anche ristorare superiore, guarigione e desiderio: rimuovere la pill.",
      {
        expiry: manual,
        independent: true,
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "feeblemind-int-cha-1", label: "Int e Car 1" }),
          Object.freeze({ id: "feeblemind-no-spells", label: "Niente incantesimi né linguaggi" }),
        ]),
      },
    ),
  ], { track: false }),
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
  "wind-wall": noPersistentEffect,
  // 2014: the sleeper wakes if it takes damage or someone shakes it awake (removed by hand). Sleep has no
  // concentration, so the removal ends the spell on that creature only.
  "sleep": failedAutomation([
    conditionRule("Privo di sensi", {
      expiry: rounds(10),
      manualRemoval: true,
      endsParentOnRemoval: true,
      mechanics: { endsOnDamage: true },
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
        summaryParts: Object.freeze([
          Object.freeze({ id: "compulsion-forced-movement", label: "Movimento imposto" }),
        ]),
      },
    ),
  ]),
  "divine-word": noPersistentEffect,
  // The cast: who fails is deafened for 5 minutes, even if the storm ends first. The later rounds stay at the table.
  "storm-of-vengeance": failedAutomation([
    conditionRule("Assordato", {
      expiry: rounds(50),
      independent: true,
      manualRemoval: true,
    }),
  ], { track: false }),
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
      {
        expiry: concentration,
        manualRemoval: true,
        endsParentOnRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "reverse-gravity-suspended", label: "Sospeso" }),
        ]),
      },
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
      "Spende l'azione del turno a vomitare; rimuovere l'etichetta a fine turno.",
      {
        expiry: Object.freeze({ mode: "turn-end", actor: "target", remaining: 1 }),
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "stinking-cloud-lost-action", label: "Azione persa" }),
        ]),
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
        label: "4d10 psichici se fallisce; se supera, termina l'incantesimo.",
      }),
    }),
  ]),
  "zone-of-truth": failedAutomation([
    debuffRule(
      "Zona di Verità: non può mentire",
      "zone-of-truth-no-lies",
      "Non può pronunciare deliberatamente una menzogna mentre rimane nella zona.",
      {
        expiry: rounds(100),
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "zone-of-truth-no-lies", label: "No menzogne" }),
        ]),
      },
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
      {
        expiry: concentration,
        summaryParts: Object.freeze([
          Object.freeze({ id: "sickening-radiance-no-invisibility", label: "No invis." }),
        ]),
      },
    ),
  ]),
  "xanathar-investitura-del-ghiaccio": failedAutomation([
    debuffRule(
      "Velocità dimezzata",
      "ice-investiture-slow",
      "Velocità dimezzata fino all'inizio del turno successivo del caster.",
      {
        expiry: nextTurn("turn-start", "source"),
        independent: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "ice-investiture-slow", label: "Vel ½" }),
        ]),
      },
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
        // Its reminder removes it when resolved: an expiry on the same turn end could take it first, and the damage with it.
        expiry: manual,
        independent: true,
        manualRemoval: true,
        summaryParts: Object.freeze([
          Object.freeze({ id: "vitriolic-sphere-delayed-acid", label: "5d4 acido/fine turno" }),
        ]),
        deferredEffect: Object.freeze({
          id: "vitriolic-sphere-delayed-acid",
          timing: "turn-end",
          actor: "target",
          anchor: "next-turn",
          reminder: "5d4 danni da acido",
          damage: Object.freeze({ dice: "5d4", type: "acido" }),
          resolution: Object.freeze({
            mode: "manual-damage",
            damage: Object.freeze({ dice: "5d4", type: "acido" }),
          }),
          provenance: Object.freeze({
            spellId: "xanathar-sfera-al-vetriolo",
            spellName: "Sfera al Vetriolo",
          }),
        }),
      },
    ),
  ], { track: false }),
  "xanathar-trabocchetto": failedAutomation([
    conditionRule("Trattenuto", {
      expiry: manual,
      manualRemoval: true,
      endsParentOnRemoval: true,
      effectId: "snare-trapped",
      effectDetail: "Appesa a testa in giù. La creatura, o chi può raggiungerla, può usare un'azione per una prova di Intelligenza (Arcano) contro la CD dell'incantesimo: se riesce, non è più trattenuta. Quando nessuno resta trattenuto, l'incantesimo termina: va chiuso a mano.",
      summaryParts: Object.freeze([
        Object.freeze({ id: "snare-escape-action", label: "Azione: prova Arcano" }),
      ]),
      saveReminder: Object.freeze({
        ability: "dex",
        timing: "turn-end",
        dcSource: "source-spell",
        label: "Se supera il TS, termina Trattenuto su di sé. Se nessuno resta trattenuto, termina l'incantesimo a mano.",
      }),
    }),
  ]),
  "prismatic-spray": noPersistentEffect,
  "prismatic-wall": noPersistentEffect,
  "phb2014-cordone-di-frecce": noPersistentEffect,
});

// Varianti in cui lo stesso incantesimo usa TS diversi o produce risultati
// incompatibili. La Console HP deve chiedere quale sotto-effetto si sta
// risolvendo, invece di applicare una condizione arbitraria.
// Antipathy/Sympathy: the save of whoever ends the turn far from the target, or unable to see it.
const ANTIPATHY_SYMPATHY_END_SAVE = Object.freeze({
  ability: "wis",
  timing: "turn-end",
  dcSource: "source-spell",
  label: "Effettua questo TS solo se è a più di 18 m dal bersaglio o non lo vede. Se lo supera, l'effetto termina e ne è immune per 1 minuto.",
});

export const AREA_SAVE_RULE_CHOICES = Object.freeze({
  // Destructive Wave (PHB 2014): its second 5d6 are radiant or necrotic, the caster's choice; the box of that part takes its
  // name (spellCastDamageParts). The prone of a failed save is the base automation, kept by both.
  "phb2014-onda-distruttiva": Object.freeze([
    Object.freeze({ id: "radiant", label: "Radiosi" }),
    Object.freeze({ id: "necrotic", label: "Necrotici" }),
  ]),
  // Transmute Rock (XGtE): only the mud leaves terrain behind (spellAreaRules.js); the other two are resolved at the cast.
  "xanathar-trasmutare-roccia": Object.freeze([
    Object.freeze({
      id: "rock-to-mud",
      label: "Roccia in fango (TS Forza)",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: manual,
          independent: true,
          manualRemoval: true,
          effectDetail: "Trattenuto dal fango: con un'azione può terminare l'effetto su sé stesso.",
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "mud-to-rock",
      label: "Fango in roccia (TS Destrezza)",
      automation: failedAutomation([
        conditionRule("Trattenuto", {
          expiry: manual,
          independent: true,
          manualRemoval: true,
          effectDetail: "Trattenuto dalla roccia: con un'azione prova di Forza CD 20, oppure danni alla roccia (CA 15, 25 PF, immune a psichici e veleno).",
        }),
      ], { track: false }),
      replaceBase: true,
    }),
    Object.freeze({
      id: "falling-mud",
      label: "Fango dal soffitto (TS Destrezza)",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
  ]),
  // Zone variants of lotto L3 (2014 texts): the membership and triggers of the variant (spellAreaRules.js).
  "magic-circle": Object.freeze([
    Object.freeze({ id: "ward", label: "Protegge chi è dentro", automation: noPersistentEffect }),
    Object.freeze({ id: "prison", label: "Invertito: trattiene i tipi scelti", automation: noPersistentEffect, replaceBase: true }),
  ]),
  "hallow": Object.freeze([
    Object.freeze({ id: "courage", label: "Coraggio", automation: noPersistentEffect }),
    Object.freeze({ id: "darkness", label: "Oscurità", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "daylight", label: "Luce diurna", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "energy-protection", label: "Protezione dall'energia", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "energy-vulnerability", label: "Vulnerabilità all'energia", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "everlasting-rest", label: "Riposo eterno", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "extradimensional-interference", label: "Interferenza extradimensionale", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "fear", label: "Paura", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "silence", label: "Silenzio", automation: noPersistentEffect, replaceBase: true }),
    Object.freeze({ id: "tongues", label: "Linguaggi", automation: noPersistentEffect, replaceBase: true }),
  ]),
  "forbiddance": Object.freeze([
    Object.freeze({ id: "radiant", label: "Danni radiosi", automation: noPersistentEffect }),
    Object.freeze({ id: "necrotic", label: "Danni necrotici", automation: noPersistentEffect, replaceBase: true }),
  ]),
  "antipathy-sympathy": Object.freeze([
    Object.freeze({
      id: "antipathy",
      label: "Antipatia",
      automation: failedAutomation([
        conditionRule("Spaventato", {
          expiry: rounds(144000),
          manualRemoval: true,
          endsParentOnRemoval: true,
          saveReminder: ANTIPATHY_SYMPATHY_END_SAVE,
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
          {
            expiry: rounds(144000),
            manualRemoval: true,
            endsParentOnRemoval: true,
            saveReminder: ANTIPATHY_SYMPATHY_END_SAVE,
            summaryParts: Object.freeze([
              Object.freeze({ id: "sympathy-attraction", label: "Verso destinazione" }),
            ]),
          },
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
          {
            expiry: concentration,
            manualRemoval: true,
            endsParentOnRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "calm-emotions-indifference", label: "Indifferente ostili" }),
            ]),
          },
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
          {
            expiry: concentration,
            manualRemoval: true,
            endsParentOnRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "control-water-whirlpool-escape-action", label: "Azione: liberati" }),
            ]),
          },
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
          {
            expiry: concentration,
            manualRemoval: true,
            endsParentOnRemoval: true,
            summaryParts: Object.freeze([
              Object.freeze({ id: "moonbeam-shapechanger-form", label: "Forma originale" }),
              Object.freeze({ id: "moonbeam-shapechanger-no-change", label: "No nuova forma" }),
            ]),
          },
        ),
      ]),
      replaceBase: true,
    }),
  ]),
  "symbol": Object.freeze([
    Object.freeze({
      id: "death",
      label: "Morte (TS Costituzione)",
      automation: noPersistentEffect,
      replaceBase: true,
    }),
    Object.freeze({
      id: "discord",
      label: "Discordia (TS Costituzione)",
      automation: failedAutomation([
        symbolEffectRule(
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
      label: "Disperazione (TS Carisma)",
      automation: failedAutomation([
        symbolEffectRule(
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
      label: "Paura (TS Saggezza)",
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
      label: "Follia (TS Intelligenza)",
      automation: failedAutomation([
        symbolEffectRule(
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
      label: "Dolore (TS Costituzione)",
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
      label: "Sonno (TS Saggezza)",
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
      label: "Stordimento (TS Saggezza)",
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
});
