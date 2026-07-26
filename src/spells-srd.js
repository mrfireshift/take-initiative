import catalogData from "./spells-srd-5.1.json" with { type: "json" };
import italianData from "./spells-it-2014.json" with { type: "json" };
import supplementData from "./spells-supplements-runtime.json" with { type: "json" };
import {
  AREA_SAVE_AUTOMATION_RULES,
  AREA_SAVE_EFFECT_RULES,
  AREA_SAVE_RULE_CHOICES,
  AREA_SAVE_SPELL_ID_SET,
} from "./areaSaveSpellRules.js";
import {
  SUPPLEMENT_AUTOMATION,
  SUPPLEMENT_EFFECT_CHOICES,
  SUPPLEMENT_EFFECTS,
  SUPPLEMENT_EXPIRY,
  SUPPLEMENT_SAVE_AUTOMATION,
  SUPPLEMENT_TRACKING,
} from "./supplementSpellRules.js";

export const SPELL_CATALOG_VERSION = 1;

const ITALIAN_ALIASES = Object.freeze({
  "animal-friendship": ["Amicizia con gli Animali"],
  "animate-objects": ["Animare Oggetti"],
  "aura-of-vitality": ["Aura di Vitalità"],
  "bane": ["Anatema"],
  "bless": ["Benedizione"],
  "blindness-deafness": ["Cecità/Sordità"],
  "charm-person": ["Charme su Persone"],
  "crusaders-mantle": ["Manto del Crociato"],
  "dominate-beast": ["Dominare Bestie"],
  "dominate-monster": ["Dominare Mostri"],
  "dominate-person": ["Dominare Persone"],
  "entangle": ["Intralciare"],
  "faerie-fire": ["Luminescenza"],
  "fear": ["Paura"],
  "fly": ["Volare"],
  "greater-invisibility": ["Invisibilità Superiore"],
  "haste": ["Velocità"],
  "hideous-laughter": ["Risata Incontenibile"],
  "hold-monster": ["Blocca Mostri"],
  "hold-person": ["Blocca Persone"],
  "hunters-mark": ["Marchio del Cacciatore"],
  "hypnotic-pattern": ["Trama Ipnotica"],
  "invisibility": ["Invisibilità"],
  "mage-armor": ["Armatura Magica"],
  "polymorph": ["Metamorfosi"],
  "protection-from-evil-and-good": ["Protezione dal Bene e dal Male"],
  "shield": ["Scudo"],
  "shield-of-faith": ["Scudo della Fede"],
  "silence": ["Silenzio"],
  "sleep": ["Sonno"],
  "slow": ["Lentezza"],
  "spirit-guardians": ["Spiriti Guardiani"],
  "stoneskin": ["Pelle di Pietra"],
  "web": ["Ragnatela"],
});

const AUTOMATION = Object.freeze({
  "animal-friendship": { mode: "confirm", conditions: ["Affascinato"] },
  "blindness-deafness": { mode: "choice", choices: ["Accecato", "Assordato"] },
  "charm-person": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-beast": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-monster": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-person": { mode: "confirm", conditions: ["Affascinato"] },
  "entangle": { mode: "confirm", conditions: ["Trattenuto"], targetMode: "area" },
  "fear": { mode: "confirm", conditions: ["Spaventato"], targetMode: "area" },
  "greater-invisibility": { mode: "automatic", conditions: ["Invisibile"] },
  "hideous-laughter": { mode: "confirm", conditions: ["Prono", "Incapacitato"] },
  "hold-monster": { mode: "confirm", conditions: ["Paralizzato"] },
  "hold-person": { mode: "confirm", conditions: ["Paralizzato"] },
  "hypnotic-pattern": {
    mode: "confirm",
    conditions: ["Affascinato", "Incapacitato"],
    targetMode: "area",
  },
  "invisibility": { mode: "automatic", conditions: ["Invisibile"] },
  "sleep": { mode: "confirm", conditions: ["Privo di sensi"], targetMode: "area" },
  "web": { mode: "confirm", conditions: ["Trattenuto"], targetMode: "area" },
  ...SUPPLEMENT_AUTOMATION,
});

const CONCENTRATION_EXPIRY = Object.freeze({ mode: "concentration" });
const SAVE_AUTOMATION = Object.freeze({
  "entangle": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Trattenuto",
      expiry: CONCENTRATION_EXPIRY,
      manualRemoval: true,
      endsParentOnRemoval: true,
    })]),
  }),
  "fear": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Spaventato",
      expiry: CONCENTRATION_EXPIRY,
      manualRemoval: true,
      endsParentOnRemoval: true,
    })]),
  }),
  "hypnotic-pattern": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([
      Object.freeze({
        condition: "Affascinato",
        expiry: CONCENTRATION_EXPIRY,
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
      Object.freeze({
        condition: "Incapacitato",
        expiry: CONCENTRATION_EXPIRY,
        manualRemoval: true,
        endsParentOnRemoval: true,
      }),
    ]),
  }),
  "slow": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
  }),
  "web": Object.freeze({
    trackOutcomes: Object.freeze(["failed"]),
    failed: Object.freeze([Object.freeze({
      condition: "Trattenuto",
      expiry: CONCENTRATION_EXPIRY,
      manualRemoval: true,
      endsParentOnRemoval: true,
    })]),
  }),
  ...SUPPLEMENT_SAVE_AUTOMATION,
});

const SPELL_EXPIRY = Object.freeze({
  "xanathar-assorbire-elementi": Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
  "chill-touch": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "color-spray": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "command": Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }),
  "guiding-bolt": Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
  "message": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "sending": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "shield": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "teleportation-circle": Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
  "transport-via-plants": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "true-strike": Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
  "tasha-lama-roboante": Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
  "tasha-scheggia-della-mente": Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
  "legacy-tashas-mind-whip": Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }),
  ...SUPPLEMENT_EXPIRY,
});

const SPELL_EFFECTS = Object.freeze({
  "bane": Object.freeze([
    Object.freeze({
      id: "attack-save-penalty",
      kind: "debuff",
      label: "-1d4 Att/TS",
      detail: "Sottrae 1d4 ai tiri per colpire e ai tiri salvezza.",
    }),
  ]),
  "bless": Object.freeze([
    Object.freeze({
      id: "attack-save-bonus",
      kind: "buff",
      label: "+1d4 Att/TS",
      detail: "Aggiunge 1d4 ai tiri per colpire e ai tiri salvezza.",
    }),
  ]),
  "blur": Object.freeze([
    Object.freeze({
      id: "incoming-attack-disadvantage",
      kind: "buff",
      label: "Attacchi contro: svant.",
      detail: "Gli attacchi contro il bersaglio subiscono svantaggio quando dipendono dalla vista.",
    }),
  ]),
  "chill-touch": Object.freeze([
    Object.freeze({
      id: "healing-blocked",
      kind: "debuff",
      label: "Niente recupero PF",
      detail: "Il bersaglio non può recuperare punti ferita.",
    }),
  ]),
  "divine-favor": Object.freeze([
    Object.freeze({
      id: "radiant-damage-bonus",
      kind: "buff",
      label: "+1d4 danni radiosi",
      detail: "Gli attacchi con arma infliggono 1d4 danni radiosi extra.",
    }),
  ]),
  "faerie-fire": Object.freeze([
    Object.freeze({
      id: "incoming-attack-advantage",
      kind: "debuff",
      label: "Attacchi contro: vant.",
      detail: "Gli attacchi contro il bersaglio dispongono di vantaggio se l'attaccante può vederlo; il bersaglio non beneficia dell'invisibilità.",
    }),
  ]),
  "guidance": Object.freeze([
    Object.freeze({
      id: "ability-check-bonus",
      kind: "buff",
      label: "+1d4 prova",
      detail: "Aggiunge 1d4 a una prova di caratteristica; rimuovere la pill dopo l'uso.",
      manualRemoval: true,
    }),
  ]),
  "guiding-bolt": Object.freeze([
    Object.freeze({
      id: "next-attack-advantage",
      kind: "debuff",
      label: "Prossimo attacco: vant.",
      detail: "Il prossimo attacco contro il bersaglio dispone di vantaggio; rimuovere la pill dopo l'attacco.",
      manualRemoval: true,
      endsParentOnRemoval: true,
    }),
  ]),
  "hunters-mark": Object.freeze([
    Object.freeze({
      id: "weapon-damage-bonus",
      kind: "debuff",
      label: "+1d6 danni dal caster",
      detail: "Il caster infligge 1d6 danni extra al bersaglio quando lo colpisce con un attacco con arma.",
    }),
  ]),
  "pass-without-trace": Object.freeze([
    Object.freeze({
      id: "stealth-bonus",
      kind: "buff",
      label: "+10 Furtività",
      detail: "Aggiunge 10 alle prove di Destrezza (Furtività).",
    }),
  ]),
  "resistance": Object.freeze([
    Object.freeze({
      id: "saving-throw-bonus",
      kind: "buff",
      label: "+1d4 TS",
      detail: "Aggiunge 1d4 a un tiro salvezza; rimuovere la pill dopo l'uso.",
      manualRemoval: true,
    }),
  ]),
  "shield": Object.freeze([
    Object.freeze({
      id: "armor-class-bonus",
      kind: "buff",
      label: "+5 CA",
      detail: "Aggiunge 5 alla Classe Armatura e protegge da Dardo Incantato.",
    }),
  ]),
  "shield-of-faith": Object.freeze([
    Object.freeze({
      id: "armor-class-bonus",
      kind: "buff",
      label: "+2 CA",
      detail: "Aggiunge 2 alla Classe Armatura.",
    }),
  ]),
  "true-strike": Object.freeze([
    Object.freeze({
      id: "first-attack-advantage",
      kind: "debuff",
      label: "Primo attacco: vant.",
      detail: "Il primo attacco del caster contro il bersaglio dispone di vantaggio; rimuovere la pill dopo l'attacco.",
      manualRemoval: true,
      endsParentOnRemoval: true,
    }),
  ]),
  "tasha-lama-roboante": Object.freeze([
    Object.freeze({
      id: "movement-triggered-thunder-damage",
      kind: "debuff",
      label: "Movimento: danni tuono",
      detail: "Se il bersaglio si muove di almeno 1,5 metri, subisce i danni da tuono; rimuovere la pill dopo l'attivazione.",
      manualRemoval: true,
      endsParentOnRemoval: true,
      expiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
    }),
  ]),
  "tasha-scheggia-della-mente": Object.freeze([
    Object.freeze({
      id: "next-saving-throw-penalty",
      kind: "debuff",
      label: "-1d4 prossimo TS",
      detail: "Sottrae 1d4 al prossimo tiro salvezza; rimuovere la pill dopo il tiro.",
      manualRemoval: true,
      endsParentOnRemoval: true,
      expiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
    }),
  ]),
  "legacy-tashas-mind-whip": Object.freeze([
    Object.freeze({
      id: "no-reaction-and-limited-turn-options",
      kind: "debuff",
      label: "No reazioni · turno limitato",
      detail: "Niente reazioni; nel turno successivo può scegliere soltanto movimento, azione o azione bonus.",
      expiry: Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }),
    }),
  ]),
  ...SUPPLEMENT_EFFECTS,
});

const SPELL_EFFECT_CHOICES = Object.freeze({
  "xanathar-assorbire-elementi": Object.freeze([
    ...["acido", "freddo", "fulmine", "fuoco", "tuono"].map((type) => Object.freeze({
      id: type,
      label: `Assorbi: ${type}`,
      effects: Object.freeze([
        Object.freeze({
          id: `resistance-${type}`,
          kind: "buff",
          label: `Res. ${type}`,
          detail: `Resistenza ai danni da ${type} fino all'inizio del prossimo turno del caster.`,
          expiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
        }),
        Object.freeze({
          id: `next-melee-hit-${type}`,
          kind: "buff",
          label: `+1d6 ${type} in mischia`,
          detail: `Il prossimo colpo in mischia nel turno successivo infligge 1d6 danni da ${type}; rimuovere la pill dopo il colpo.`,
          manualRemoval: true,
          endsParentOnRemoval: true,
          expiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
        }),
      ]),
    })),
  ]),
  "bestow-curse": Object.freeze([
    Object.freeze({
      id: "ability-strength",
      label: "Svantaggio Forza",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-strength",
        kind: "debuff",
        label: "Svant. prove/TS For",
        detail: "Svantaggio alle prove e ai tiri salvezza su Forza.",
      })]),
    }),
    Object.freeze({
      id: "ability-dexterity",
      label: "Svantaggio Destrezza",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-dexterity",
        kind: "debuff",
        label: "Svant. prove/TS Des",
        detail: "Svantaggio alle prove e ai tiri salvezza su Destrezza.",
      })]),
    }),
    Object.freeze({
      id: "ability-constitution",
      label: "Svantaggio Costituzione",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-constitution",
        kind: "debuff",
        label: "Svant. prove/TS Cos",
        detail: "Svantaggio alle prove e ai tiri salvezza su Costituzione.",
      })]),
    }),
    Object.freeze({
      id: "ability-intelligence",
      label: "Svantaggio Intelligenza",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-intelligence",
        kind: "debuff",
        label: "Svant. prove/TS Int",
        detail: "Svantaggio alle prove e ai tiri salvezza su Intelligenza.",
      })]),
    }),
    Object.freeze({
      id: "ability-wisdom",
      label: "Svantaggio Saggezza",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-wisdom",
        kind: "debuff",
        label: "Svant. prove/TS Sag",
        detail: "Svantaggio alle prove e ai tiri salvezza su Saggezza.",
      })]),
    }),
    Object.freeze({
      id: "ability-charisma",
      label: "Svantaggio Carisma",
      effects: Object.freeze([Object.freeze({
        id: "curse-ability-charisma",
        kind: "debuff",
        label: "Svant. prove/TS Car",
        detail: "Svantaggio alle prove e ai tiri salvezza su Carisma.",
      })]),
    }),
    Object.freeze({
      id: "attacks-against-caster",
      label: "Svantaggio contro il caster",
      effects: Object.freeze([Object.freeze({
        id: "curse-attacks-against-caster",
        kind: "debuff",
        label: "Svant. attacchi vs caster",
        detail: "Svantaggio ai tiri per colpire contro il caster.",
      })]),
    }),
    Object.freeze({
      id: "wasted-action",
      label: "Possibile azione sprecata",
      effects: Object.freeze([Object.freeze({
        id: "curse-wasted-action",
        kind: "debuff",
        label: "TS Sag o perde azione",
        detail: "All'inizio del turno effettua un TS Saggezza; se fallisce, spreca l'azione.",
        manualRemoval: true,
      })]),
    }),
    Object.freeze({
      id: "extra-necrotic-damage",
      label: "Danni necrotici extra",
      effects: Object.freeze([Object.freeze({
        id: "curse-extra-necrotic-damage",
        kind: "debuff",
        label: "+1d8 necrotici dal caster",
        detail: "Gli attacchi e gli incantesimi del caster infliggono 1d8 danni necrotici extra.",
      })]),
    }),
  ]),
  "enhance-ability": Object.freeze([
    Object.freeze({
      id: "fox-cunning",
      label: "Astuzia della volpe",
      effects: Object.freeze([Object.freeze({
        id: "intelligence-check-advantage",
        kind: "buff",
        label: "Vant. prove Int",
        detail: "Vantaggio alle prove di Intelligenza.",
      })]),
    }),
    Object.freeze({
      id: "bull-strength",
      label: "Forza del toro",
      effects: Object.freeze([Object.freeze({
        id: "strength-check-advantage",
        kind: "buff",
        label: "Vant. prove For · Trasporto x2",
        detail: "Vantaggio alle prove di Forza e capacità di trasporto raddoppiata.",
      })]),
    }),
    Object.freeze({
      id: "cats-grace",
      label: "Grazia del gatto",
      effects: Object.freeze([Object.freeze({
        id: "dexterity-check-advantage",
        kind: "buff",
        label: "Vant. prove Des · Cadute 6m",
        detail: "Vantaggio alle prove di Destrezza e nessun danno dalle cadute fino a 6 metri.",
      })]),
    }),
    Object.freeze({
      id: "bears-endurance",
      label: "Resistenza dell'orso",
      effects: Object.freeze([Object.freeze({
        id: "constitution-check-advantage",
        kind: "buff",
        label: "Vant. prove Cos · 2d6 PF temp",
        detail: "Vantaggio alle prove di Costituzione e 2d6 punti ferita temporanei.",
      })]),
    }),
    Object.freeze({
      id: "owls-wisdom",
      label: "Saggezza del gufo",
      effects: Object.freeze([Object.freeze({
        id: "wisdom-check-advantage",
        kind: "buff",
        label: "Vant. prove Sag",
        detail: "Vantaggio alle prove di Saggezza.",
      })]),
    }),
    Object.freeze({
      id: "eagles-splendor",
      label: "Splendore dell'aquila",
      effects: Object.freeze([Object.freeze({
        id: "charisma-check-advantage",
        kind: "buff",
        label: "Vant. prove Car",
        detail: "Vantaggio alle prove di Carisma.",
      })]),
    }),
  ]),
  "enlarge-reduce": Object.freeze([
    Object.freeze({
      id: "enlarge",
      label: "Ingrandire",
      effects: Object.freeze([Object.freeze({
        id: "enlarged",
        kind: "buff",
        label: "Taglia +1 · Vant. For/TS · +1d4",
        detail: "Taglia aumentata, vantaggio a prove e TS Forza, 1d4 danni extra con le armi.",
      })]),
    }),
    Object.freeze({
      id: "reduce",
      label: "Ridurre",
      effects: Object.freeze([Object.freeze({
        id: "reduced",
        kind: "debuff",
        label: "Taglia -1 · Svant. For/TS · -1d4",
        detail: "Taglia ridotta, svantaggio a prove e TS Forza, 1d4 danni in meno con le armi.",
      })]),
    }),
  ]),
  "protection-from-energy": Object.freeze([
    ...["acido", "freddo", "fulmine", "fuoco", "tuono"].map((type) => Object.freeze({
      id: type,
      label: `Resistenza: ${type}`,
      effects: Object.freeze([Object.freeze({
        id: `resistance-${type}`,
        kind: "buff",
        label: `Res. ${type}`,
        detail: `Resistenza ai danni da ${type}.`,
      })]),
    })),
  ]),
  ...SUPPLEMENT_EFFECT_CHOICES,
});

const SUPPLEMENT_BY_ID = new Map(
  (Array.isArray(supplementData?.spells) ? supplementData.spells : [])
    .map((spell) => [spell.id, spell])
);

function supplementRuntimeSpell(id) {
  const spell = SUPPLEMENT_BY_ID.get(id);
  if (!spell) throw new Error(`Missing normalized supplement spell: ${id}`);
  const tracking = SUPPLEMENT_TRACKING[id] || null;
  const catalogLabel = spell.review?.nameCollisionWith
    ? `${spell.name} (${spell.sourceTitle.replace(/^Calderone Omnicomprensivo di\s+/u, "")})`
    : spell.name;
  return Object.freeze({
    id: spell.id,
    name: spell.name,
    level: spell.level,
    duration: spell.duration,
    defaultTurns: tracking?.defaultTurns ?? spell.defaultTurns,
    concentration: spell.concentration,
    trackable: tracking?.trackable === true,
    catalogLabel,
    range: spell.range,
    area: spell.areaCandidate,
    targetModeCandidate: spell.targetModeCandidate,
    source: spell.source,
    sourceTitle: spell.sourceTitle,
    italianReference: Object.freeze({
      id: spell.id,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      ritual: spell.ritual,
      castingTime: spell.castingTime,
      range: spell.range,
      components: spell.components,
      duration: spell.duration,
      concentration: spell.concentration,
      description: spell.description,
      higherLevels: spell.higherLevels,
      sourceTitle: spell.sourceTitle,
      sourcePageRange: spell.sourcePageRange,
    }),
  });
}

const SUPPLEMENT_RUNTIME = Object.freeze([
  ...Array.from(SUPPLEMENT_BY_ID.keys())
    .filter((id) => id !== "tasha-scudiscio-mentale-di-tasha")
    .map(supplementRuntimeSpell),
]);

const TASHAS_MIND_WHIP = supplementRuntimeSpell("tasha-scudiscio-mentale-di-tasha");

const LEGACY_MANUAL = Object.freeze([
  {
    id: "legacy-aura-of-vitality",
    name: "Aura di Vitalità",
    level: 3,
    duration: "Up to 1 minute",
    concentration: true,
    range: "Self",
    area: null,
    source: "legacy",
  },
  {
    id: "legacy-crusaders-mantle",
    name: "Manto del Crociato",
    level: 3,
    duration: "Up to 1 minute",
    concentration: true,
    range: "Self",
    area: null,
    source: "legacy",
  },
  {
    id: "legacy-tashas-mind-whip",
    name: "Scudiscio Mentale di Tasha",
    level: 2,
    duration: "1 round",
    defaultTurns: 1,
    concentration: false,
    range: TASHAS_MIND_WHIP.range,
    area: null,
    source: "legacy",
    sourceTitle: TASHAS_MIND_WHIP.sourceTitle,
    italianReference: Object.freeze({
      ...TASHAS_MIND_WHIP.italianReference,
      id: "legacy-tashas-mind-whip",
    }),
  },
]);

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function durationToRounds(duration) {
  const clean = String(duration || "").trim().toLocaleLowerCase();
  const match = clean.match(/^(?:up to\s+)?(\d+)\s+(round|minute|hour|day)s?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = {
    round: 1,
    minute: 10,
    hour: 600,
    day: 14400,
  }[match[2]];
  return Number.isFinite(amount) && multiplier ? amount * multiplier : null;
}

const RAW_SPELLS = Array.isArray(catalogData?.spells) ? catalogData.spells : [];
const ITALIAN_NAMES = italianData?.names && typeof italianData.names === "object"
  ? italianData.names
  : {};
const MISSING_ITALIAN_NAMES = RAW_SPELLS.filter((spell) => !ITALIAN_NAMES[spell.id]);
if (MISSING_ITALIAN_NAMES.length) {
  throw new Error(
    "Missing Italian spell names: "
    + MISSING_ITALIAN_NAMES.map((spell) => spell.id).join(", ")
  );
}

function effectSaveRule(effect, spell) {
  const expiry = effect?.expiry
    || (spell?.concentration ? CONCENTRATION_EXPIRY : spell?.expiry)
    || null;
  return Object.freeze({
    condition: String(effect?.label || "").trim(),
    effectId: String(effect?.id || "").trim(),
    effectKind: effect?.kind,
    effectDetail: String(effect?.detail || "").trim(),
    ...(effect?.manualRemoval === true ? { manualRemoval: true } : {}),
    ...(effect?.endsParentOnRemoval === true ? { endsParentOnRemoval: true } : {}),
    ...(expiry ? { expiry } : {}),
  });
}

function areaSaveAutomationForSpell(spell, choiceValue = "") {
  if (!spell) return null;
  const areaChoices = AREA_SAVE_RULE_CHOICES[spell.id] || [];
  const selectedAreaChoice = areaChoices.find((choice) => choice.id === choiceValue)
    || areaChoices[0]
    || null;
  const base = selectedAreaChoice?.replaceBase === true
    ? null
    : SAVE_AUTOMATION[spell.id] || null;
  const declared = selectedAreaChoice
    ? selectedAreaChoice.automation || null
    : AREA_SAVE_AUTOMATION_RULES[spell.id] || null;
  const effectRule = AREA_SAVE_EFFECT_RULES[spell.id] || null;
  const failedEffectIds = new Set(effectRule?.failedEffectIds || []);
  const selectedChoiceId = effectRule?.choiceId || choiceValue;
  const fixedEffects = SPELL_EFFECTS[spell.id] || [];
  const choices = SPELL_EFFECT_CHOICES[spell.id] || [];
  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId) || null;
  const failedEffects = [...fixedEffects, ...(selectedChoice?.effects || [])]
    .filter((effect) => failedEffectIds.has(effect.id))
    .map((effect) => effectSaveRule(effect, spell))
    .filter((rule) => rule.condition && rule.effectKind);

  if (!base && !declared && !failedEffects.length) return null;
  const automationSources = [base, declared].filter(Boolean);
  const hasExplicitTrackOutcomes = automationSources.some((source) =>
    Object.prototype.hasOwnProperty.call(source, "trackOutcomes")
  );
  const trackOutcomes = Array.from(new Set([
    ...automationSources.flatMap((source) => source.trackOutcomes || []),
    ...(failedEffects.length ? ["failed"] : []),
  ]));
  const merged = {};
  const concentrationAction = [...automationSources].reverse()
    .map((source) => String(source.concentrationAction || "").trim())
    .find((value) => ["replace", "dismiss"].includes(value));
  if (concentrationAction) merged.concentrationAction = concentrationAction;
  for (const outcome of ["passed", "failed", "immune"]) {
    const rules = [
      ...automationSources.flatMap((source) => source[outcome] || []),
      ...(outcome === "failed" ? failedEffects : []),
    ];
    if (rules.length) merged[outcome] = Object.freeze(rules);
  }
  if (hasExplicitTrackOutcomes || failedEffects.length) {
    merged.trackOutcomes = Object.freeze(trackOutcomes);
  }
  return Object.freeze(merged);
}

const ALL_SPELLS = [...RAW_SPELLS, ...LEGACY_MANUAL, ...SUPPLEMENT_RUNTIME].map((spell) => {
  const italianName = String(ITALIAN_NAMES[spell.id] || "").trim();
  const aliases = Array.from(new Set([
    italianName,
    ...(ITALIAN_ALIASES[spell.id] || []),
  ].filter(Boolean)));
  const automation = AUTOMATION[spell.id] || null;
  const exactSelf = String(spell.range || "").trim().toLocaleLowerCase() === "self";
  const normalizedSpell = {
    ...spell,
    aliases: Object.freeze([...aliases]),
    displayName: italianName || aliases[0] || spell.name,
    defaultTurns: spell.defaultTurns ?? durationToRounds(spell.duration),
    targetMode: automation?.targetMode || spell.targetModeCandidate || (exactSelf ? "self" : "selected"),
    automation,
    effects: SPELL_EFFECTS[spell.id] || Object.freeze([]),
    effectChoices: SPELL_EFFECT_CHOICES[spell.id] || Object.freeze([]),
    expiry: SPELL_EXPIRY[spell.id] || null,
  };
  return Object.freeze({
    ...normalizedSpell,
    saveAutomation: areaSaveAutomationForSpell(normalizedSpell),
  });
});

const TRACKABLE_SPELLS = ALL_SPELLS.filter((spell) =>
  spell.trackable === true ||
  spell.source === "legacy" ||
  !["instantaneous", "istantanea"].includes(String(spell.duration).toLocaleLowerCase())
);

const BY_LOOKUP = new Map();
for (const spell of ALL_SPELLS) {
  for (const value of [spell.id, spell.name, spell.displayName, spell.catalogLabel, ...spell.aliases]) {
    const key = normalizeLookup(value);
    if (key && !BY_LOOKUP.has(key)) BY_LOOKUP.set(key, spell);
  }
}

export const SPELLS_5E_SRD = Object.freeze(TRACKABLE_SPELLS.map((spell) => spell.displayName));

export function getTrackableSpellOptions() {
  return TRACKABLE_SPELLS.map((spell) => ({
    id: spell.id,
    value: spell.catalogLabel || spell.displayName,
    label: spell.catalogLabel || spell.displayName,
    level: spell.level,
  }));
}

export function getAreaSaveSpellOptions() {
  return ALL_SPELLS
    .filter((spell) => AREA_SAVE_SPELL_ID_SET.has(spell.id))
    .map((spell) => ({
      id: spell.id,
      value: spell.catalogLabel || spell.displayName,
      label: spell.catalogLabel || spell.displayName,
      level: spell.level,
      concentration: spell.concentration === true,
      automated: !!spell.saveAutomation,
    }));
}

export function getSpellCatalog() {
  return ALL_SPELLS.map((spell) => ({ ...spell }));
}

export function getSpellDefinition(value) {
  return BY_LOOKUP.get(normalizeLookup(value)) || null;
}

export function getAreaSaveAutomation(value, choiceValue = "") {
  const spell = value && typeof value === "object" ? value : getSpellDefinition(value);
  return areaSaveAutomationForSpell(spell, choiceValue);
}

export function getAreaSaveRuleChoices(value) {
  const spell = value && typeof value === "object" ? value : getSpellDefinition(value);
  const choices = AREA_SAVE_RULE_CHOICES[spell?.id] || [];
  return choices.map((choice) => ({ value: choice.id, label: choice.label }));
}

export function getSpellEffectChoices(value) {
  const spell = value && typeof value === "object" ? value : getSpellDefinition(value);
  return Array.isArray(spell?.effectChoices)
    ? spell.effectChoices.map((choice) => ({ value: choice.id, label: choice.label }))
    : [];
}

export function getSpellChoiceTiming(value, choiceValue = "") {
  const spell = value && typeof value === "object" ? value : getSpellDefinition(value);
  const choices = Array.isArray(spell?.effectChoices) ? spell.effectChoices : [];
  const selected = choices.find((choice) => choice.id === choiceValue) || choices[0] || null;
  if (!selected) return null;
  const timing = {};
  if (Number.isFinite(Number(selected.defaultTurns)) && Number(selected.defaultTurns) > 0) {
    timing.defaultTurns = Math.floor(Number(selected.defaultTurns));
  }
  if (Object.prototype.hasOwnProperty.call(selected, "spellExpiry")) {
    timing.spellExpiry = selected.spellExpiry ? { ...selected.spellExpiry } : null;
  }
  return Object.keys(timing).length ? timing : null;
}

export function getSpellEffects(value, choiceValue = "") {
  const spell = value && typeof value === "object" ? value : getSpellDefinition(value);
  const fixed = Array.isArray(spell?.effects) ? spell.effects : [];
  const choices = Array.isArray(spell?.effectChoices) ? spell.effectChoices : [];
  const selected = choices.find((choice) => choice.id === choiceValue) || choices[0] || null;
  return [...fixed, ...(selected?.effects || [])].map((effect) => ({ ...effect }));
}

export function getProposedConditions(spell, choice = "") {
  const automation = spell?.automation;
  if (!automation) return [];
  const withOptions = (conditionNames) => conditionNames.map((conditionName) => {
    const options = automation.conditionOptions?.[conditionName];
    return options ? { name: conditionName, options: { ...options } } : conditionName;
  });
  if (automation.mode === "choice") {
    const selected = String(choice || "").trim();
    return automation.choices?.includes(selected) ? withOptions([selected]) : [];
  }
  return Array.isArray(automation.conditions) ? withOptions(automation.conditions) : [];
}

export { durationToRounds };
