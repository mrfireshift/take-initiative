import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.resolve("data", "class-features");
const OUTPUT_PATH = path.resolve("src", "class-features-runtime.json");
const RUNTIME_VERSION = 4;
const RUNTIME_OVERRIDES_FILE = "runtime-feature-overrides.json";
const UNTRACKED_RESOURCE_POOL_IDS = new Set([
  "slot-incantesimo-standard-aggregati",
  "warlock-slot-magia-del-patto",
]);

const SOURCE_CONFIGS = Object.freeze([
  Object.freeze({
    id: "phb2014",
    label: "Manuale del Giocatore 2014",
    catalog: "phb2014_classi_database_finale.json",
    mechanics: "phb2014_livello_meccanico_v1_1.json",
  }),
  Object.freeze({
    id: "xanathar",
    label: "Guida Omnicomprensiva di Xanathar",
    catalog: "xanathar_sottoclassi_database_finale.json",
    mechanics: "xanathar_livello_meccanico_v1_0.json",
  }),
  Object.freeze({
    id: "tasha",
    label: "Calderone Omnicomprensivo di Tasha",
    catalog: "tasha_sottoclassi_database_finale.json",
    mechanics: "tasha_livello_meccanico_v1_0.json",
  }),
  Object.freeze({
    id: "ranger-revised",
    label: "Unearthed Arcana: Ranger, Revised (2016)",
    catalog: "ranger_revised_database_finale.json",
    mechanics: "ranger_revised_livello_meccanico_v1_0.json",
  }),
]);

const NON_ACTION_ACTIVATIONS = new Set([
  "passiva",
  "contenitore_opzioni",
  "sistema_incantesimi",
]);

const FEATURE_THEMES = Object.freeze({
  "barbaro-ira": {
    emoji: "🔥",
    accent: "#f97316",
    background: "#7f1d1d",
    text: "#fff7ed",
  },
  "barbaro-attacco-irruento": {
    emoji: "⚔️",
    accent: "#fb7185",
    background: "#881337",
    text: "#fff1f2",
  },
  "barbaro-cammino-del-berserker-frenesia": {
    emoji: "🩸",
    accent: "#ef4444",
    background: "#7f1d1d",
    text: "#fef2f2",
  },
  "barbaro-cammino-del-berserker-presenza-intimidatoria": {
    emoji: "😨",
    accent: "#c084fc",
    background: "#581c87",
    text: "#faf5ff",
  },
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila": {
    emoji: "🦅",
    accent: "#38bdf8",
    background: "#0c4a6e",
    text: "#ecfeff",
  },
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila": {
    emoji: "\uD83E\uDD85",
    accent: "#38bdf8",
    background: "#0c4a6e",
    text: "#ecfeff",
  },
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso": {
    emoji: "\uD83D\uDC3B",
    accent: "#f59e0b",
    background: "#78350f",
    text: "#fffbeb",
  },
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo": {
    emoji: "\uD83D\uDC3A",
    accent: "#34d399",
    background: "#064e3b",
    text: "#ecfdf5",
  },
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-orso": {
    emoji: "\uD83D\uDC3B",
    accent: "#f59e0b",
    background: "#78350f",
    text: "#fffbeb",
  },
  "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa": {
    emoji: "\u26C8\uFE0F",
    accent: "#38bdf8",
    background: "#0c4a6e",
    text: "#ecfeff",
  },
  "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice": {
    emoji: "\uD83D\uDEE1\uFE0F",
    accent: "#22d3ee",
    background: "#164e63",
    text: "#ecfeff",
  },
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio": {
    emoji: "\u2728",
    accent: "#c084fc",
    background: "#581c87",
    text: "#faf5ff",
  },
  "barbaro-cammino-della-bestia-forma-della-bestia": {
    emoji: "\uD83D\uDC3E",
    accent: "#a3e635",
    background: "#365314",
    text: "#f7fee7",
  },
  "barbaro-cammino-della-bestia-chiamata-alla-caccia": {
    emoji: "\uD83D\uDC3A",
    accent: "#34d399",
    background: "#064e3b",
    text: "#ecfdf5",
  },
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante": {
    emoji: "\u2728",
    accent: "#c084fc",
    background: "#581c87",
    text: "#faf5ff",
  },
  "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali": {
    emoji: "👻",
    accent: "#60a5fa",
    background: "#1e3a8a",
    text: "#eff6ff",
  },
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2": {
    emoji: "✨",
    accent: "#c084fc",
    background: "#581c87",
    text: "#faf5ff",
  },
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5": {
    emoji: "⚡",
    accent: "#a78bfa",
    background: "#312e81",
    text: "#f5f3ff",
  },
  "barbaro-cammino-dello-zelota-presenza-zelante": {
    emoji: "🔆",
    accent: "#f59e0b",
    background: "#78350f",
    text: "#fffbeb",
  },
  "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia": {
    emoji: "⚔️",
    accent: "#f59e0b",
    background: "#78350f",
    text: "#fffbeb",
  },
  "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo": {
    emoji: "🌙",
    accent: "#a78bfa",
    background: "#312e81",
    text: "#f5f3ff",
  },
});

const FEATURE_EMOJIS = Object.freeze({
  "barbaro-ira": "\uD83D\uDD25",
  "barbaro-attacco-irruento": "\u2694\uFE0F",
  "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa": "\u26C8\uFE0F",
  "barbaro-cammino-della-bestia-forma-della-bestia": "\uD83D\uDC3E",
  "barbaro-cammino-del-berserker-frenesia": "\uD83E\uDE78",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio": "\uD83C\uDF00",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5": "\u26A1",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2": "\uD83D\uDD73\uFE0F",
  "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali": "\uD83D\uDC7B",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila": "\uD83E\uDD85",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo": "\uD83D\uDC3A",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso": "\uD83D\uDC3B",
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante": "\uD83D\uDC8E",
  "barbaro-cammino-del-berserker-presenza-intimidatoria": "\uD83D\uDE28",
  "barbaro-cammino-dello-zelota-presenza-zelante": "\uD83D\uDD06",
  "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice": "\uD83D\uDEE1\uFE0F",
  "barbaro-cammino-della-bestia-chiamata-alla-caccia": "\uD83C\uDFAF",
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila": "\uD83E\uDEB6",
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-lupo": "\uD83E\uDDED",
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-orso": "\uD83E\uDEB5",
  "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo": "\uD83C\uDF19",
  "paladino-imposizione-delle-mani": "\uD83E\uDD32",
  "paladino-percezione-del-divino": "\uD83D\uDC41\uFE0F",
  "paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico": "\u26D3\uFE0F",
  "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia": "\u2694\uFE0F",
  "paladino-giuramento-di-devozione-incanalare-divinita-arma-consacrata": "\uD83D\uDDE1\uFE0F",
  "paladino-giuramento-di-devozione-incanalare-divinita-scacciare-i-sacrileghi": "\u271D\uFE0F",
  "paladino-giuramento-di-devozione-aura-di-devozione": "\uD83D\uDD4A\uFE0F",
  "paladino-giuramento-di-devozione-purezza-di-spirito": "\uD83D\uDC8E",
  "paladino-giuramento-di-devozione-nube-sacra": "\u2600\uFE0F",
  "paladino-aura-di-protezione": "\uD83D\uDEE1\uFE0F",
  "paladino-aura-di-coraggio": "\uD83E\uDD81",
  "paladino-tocco-purificatore": "\u2728",
  "paladino-giuramento-di-vendetta-angelo-vendicatore": "\uD83D\uDE07",
  "bardo-ispirazione-bardica": "\uD83C\uDFB5",
  "bardo-controfascino": "\uD83C\uDFAD",
  "stregone-magia-selvaggia-impulso-di-magia-selvaggia": "\uD83C\uDFB2",
  "stregone-magia-selvaggia-onde-di-caos": "\uD83C\uDF0A",
  "stregone-fonte-di-magia": "\uD83D\uDCA7",
  "stregone-metamagia-incantesimo-celato": "\uD83E\uDD2B",
  "stregone-metamagia-incantesimo-distante": "\uD83D\uDD2D",
  "stregone-metamagia-incantesimo-esteso": "\u23F3",
  "stregone-metamagia-incantesimo-intensificato": "\uD83D\uDCC8",
  "stregone-metamagia-incantesimo-potenziato": "\uD83D\uDCA5",
  "stregone-metamagia-incantesimo-preciso": "\uD83C\uDFAF",
  "stregone-metamagia-incantesimo-raddoppiato": "\uD83D\uDD01",
  "stregone-metamagia-incantesimo-rapido": "\u26A1",
  "stregone-magia-selvaggia-piegare-la-fortuna": "\uD83C\uDF40",
  "stregone-ripristino-stregonesco": "\u267B\uFE0F",
});

const DEFAULT_FEATURE_THEME = Object.freeze({
  emoji: "✨",
  accent: "#38bdf8",
  background: "#0c4a6e",
  text: "#ecfeff",
});

const WILD_MAGIC_SURGE_FEATURE_ID = "stregone-magia-selvaggia-impulso-di-magia-selvaggia";
const WILD_MAGIC_SPELL_IDS_BY_RANGE = Object.freeze({
  "07-08": "fireball",
  "09-10": "magic-missile",
  "13-14": "confusion",
  "19-20": "grease",
  "45-46": "levitate",
  "63-64": "fog-cloud",
  "77-78": "polymorph",
  "85-86": "mirror-image",
  "87-88": "fly",
});
const WILD_MAGIC_NO_CONCENTRATION_RANGES = new Set([
  "13-14",
  "45-46",
  "63-64",
  "77-78",
  "87-88",
]);

function runtimeOverrideFor(id) {
  return runtimeOverrides[id] && typeof runtimeOverrides[id] === "object"
    ? runtimeOverrides[id]
    : {};
}

function normalizeFeatureTheme(id, override = {}) {
  return {
    ...(FEATURE_THEMES[id] || DEFAULT_FEATURE_THEME),
    ...(FEATURE_EMOJIS[id] ? { emoji: FEATURE_EMOJIS[id] } : {}),
    ...(override.theme && typeof override.theme === "object" ? override.theme : {}),
  };
}

function readJson(fileName) {
  const filePath = path.join(SOURCE_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const runtimeOverridesData = readJson(RUNTIME_OVERRIDES_FILE);
const runtimeOverrides = runtimeOverridesData?.features
  && typeof runtimeOverridesData.features === "object"
  ? runtimeOverridesData.features
  : {};

function shortText(value, maxLength = 8000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
}

function normalizeAdditionalSpellsByLevel(value) {
  if (!value || typeof value !== "object") return null;
  const normalized = {};
  for (const [rawLevel, rawSpells] of Object.entries(value)) {
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 1 || level > 20) continue;
    const spells = uniqueStrings(Array.isArray(rawSpells) ? rawSpells : [rawSpells]);
    if (spells.length) normalized[String(level)] = spells;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function mergeAdditionalSpellsByLevel(values = []) {
  const merged = {};
  for (const value of values) {
    const normalized = normalizeAdditionalSpellsByLevel(value);
    if (!normalized) continue;
    for (const [level, spells] of Object.entries(normalized)) {
      merged[level] = uniqueStrings([...(merged[level] || []), ...spells]);
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function normalizeCompleteness(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "curated" || raw === "curata") return "curated";
  if (raw === "reference" || raw === "riferimento") return "reference";
  return "partial";
}

function recordLevel(record, mechanic, recordsById) {
  const direct = [
    ...(Array.isArray(record?.livelli) ? record.livelli : []),
    ...(Array.isArray(mechanic?.source?.levels) ? mechanic.source.levels : []),
    record?.livello_minimo,
  ]
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 20);
  if (direct.length) return Math.min(...direct);
  const parentId = String(record?.parent_id || mechanic?.source?.parent_id || "").trim();
  return parentId && parentId !== record?.id
    ? recordLevel(recordsById.get(parentId), null, recordsById)
    : 1;
}

function resolveRecordIdentity(record, mechanic, recordsById) {
  const seen = new Set();
  let current = record;
  let classId = String(record?.classe_id || mechanic?.source?.class_id || "").trim();
  let subclassId = String(
    record?.sottoclasse_id || mechanic?.source?.subclass_id || ""
  ).trim();

  while ((!classId || !subclassId) && current && !seen.has(current.id)) {
    seen.add(current.id);
    if (!classId) classId = String(current.classe_id || "").trim();
    if (!subclassId) subclassId = String(current.sottoclasse_id || "").trim();
    const parentId = String(current.parent_id || "").trim();
    current = parentId ? recordsById.get(parentId) : null;
  }
  return { classId, subclassId };
}

function normalizeDuration(duration, effects = [], override = {}) {
  const raw = override.duration && typeof override.duration === "object"
    ? override.duration
    : duration && typeof duration === "object" ? duration : {};
  let rounds = Number(raw.max_rounds ?? raw.rounds);
  if (!Number.isFinite(rounds) || rounds <= 0) {
    const value = Number(raw.value);
    const unit = String(raw.unit || "").trim().toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      if (unit === "round" || unit === "rounds") rounds = value;
      if (unit === "minuto" || unit === "minuti") rounds = value * 10;
      if (unit === "ora" || unit === "ore" || unit === "hour" || unit === "hours") {
        rounds = value * 600;
      }
    }
  }
  if (!Number.isFinite(rounds) || rounds <= 0) {
    for (const effect of Array.isArray(effects) ? effects : []) {
      const effectDuration = String(effect?.duration || "").trim().toLowerCase();
      const minuteMatch = effectDuration.match(/^(\d+)_minut[oi]$/u);
      const roundMatch = effectDuration.match(/^(\d+)_round$/u);
      if (minuteMatch) rounds = Number(minuteMatch[1]) * 10;
      if (roundMatch) rounds = Number(roundMatch[1]);
      if (Number.isFinite(rounds) && rounds > 0) break;
    }
  }
  const timing = String(raw.timing || raw.mode || raw.type || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  const normalizedTiming = timing === "next-turn" || timing === "until-next-turn"
    ? "next-turn"
    : timing === "next-turn-end" || timing === "until-next-turn-end"
      ? "next-turn-end"
      : timing === "turn-end"
        || timing === "until-end-of-turn"
        || timing === "current-turn-end"
        ? "turn-end"
      : null;
  const untilFeatureId = String(
    raw.untilFeatureId
      || raw.until_feature_id
      || raw.parentFeatureId
      || raw.parent_feature_id
      || raw.endsWithFeatureId
      || raw.ends_with_feature_id
      || ""
  ).trim();
  const indefiniteWithFeatureId = String(
    raw.indefiniteWithFeatureId
      || raw.indefinite_with_feature_id
      || ""
  ).trim();
  return {
    type: String(raw.type || "non_specificata"),
    rounds: Number.isFinite(rounds) && rounds > 0 ? Math.round(rounds) : null,
    timing: normalizedTiming,
    untilFeatureId: untilFeatureId || null,
    indefiniteWithFeatureId: indefiniteWithFeatureId || null,
    endConditions: uniqueStrings(raw.end_conditions),
  };
}

function normalizeTargeting(targets, effects = []) {
  const configuredMode = String(targets?.mode || "").trim().toLowerCase();
  if (["self", "single-target", "aura"].includes(configuredMode)) {
    const rangeMeters = Number(targets?.rangeMeters ?? targets?.range_meters);
    const configuredMaxTargets = targets?.maxTargets === null
      ? null
      : Math.max(1, Math.floor(Number(targets?.maxTargets) || (configuredMode === "aura" ? 1 : 1)));
    return {
      mode: configuredMode,
      rangeMeters: Number.isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : null,
      maxTargets: configuredMode === "aura" ? null : configuredMaxTargets,
      excludeSource: targets?.excludeSource === false
        ? false
        : configuredMode === "single-target" || targets?.excludeSource === true,
    };
  }
  const type = String(targets?.type || "").trim().toLowerCase();
  const auraEffect = (Array.isArray(effects) ? effects : [])
    .find((effect) => effect?.type === "aura");
  const rangeMeters = Number(
    targets?.range_meters
    ?? auraEffect?.radius_meters
  );
  if (
    type === "se_stesso"
  ) {
    return {
      mode: "self",
      rangeMeters: Number.isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : null,
      maxTargets: 1,
      excludeSource: false,
    };
  }
  if (auraEffect || type.includes("aura")) {
    return {
      mode: "aura",
      rangeMeters: Number.isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : null,
      maxTargets: null,
      excludeSource: false,
    };
  }
  if (
    type.includes("creatura")
    || type.includes("bersaglio")
    || type.includes("target")
  ) {
    return {
      mode: "single-target",
      rangeMeters: Number.isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : null,
      maxTargets: 1,
      excludeSource: true,
    };
  }
  return {
    mode: "self",
    rangeMeters: null,
    maxTargets: 1,
    excludeSource: false,
  };
}

function normalizeTargetMode(targeting) {
  return targeting?.mode === "single-target" ? "selection" : "self";
}

function normalizeChoiceOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const id = shortText(option.id || option.value, 120);
      const label = shortText(option.label || option.name || id, 160);
      if (!id || !label) return null;
      return {
        id,
        label,
        ...(option.effectPlan && typeof option.effectPlan === "object"
          ? { effectPlan: JSON.parse(JSON.stringify(option.effectPlan)) }
          : {}),
      };
    })
    .filter(Boolean);
}

function normalizeRadiusByClassLevel(value) {
  if (Array.isArray(value)) return bandLevelValues(value);
  if (!value || typeof value !== "object") return null;
  const normalized = {};
  for (const [rawLevel, rawRadius] of Object.entries(value)) {
    const level = Number(rawLevel);
    const radius = Number(rawRadius);
    if (!Number.isInteger(level) || level < 1 || level > 20) continue;
    if (!Number.isFinite(radius) || radius <= 0) continue;
    normalized[String(level)] = radius;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeEffectPlanOverride(effectPlan) {
  const normalized = JSON.parse(JSON.stringify(effectPlan));
  const radiusByClassLevel = normalizeRadiusByClassLevel(
    normalized.radiusByClassLevel || normalized.radius_by_class_level,
  );
  if (radiusByClassLevel) normalized.radiusByClassLevel = radiusByClassLevel;
  delete normalized.radius_by_class_level;
  return normalized;
}

function normalizeEffectPlan(id, name, effects, targeting, override = {}) {
  if (override.effectPlan && typeof override.effectPlan === "object") {
    return normalizeEffectPlanOverride(override.effectPlan);
  }
  const knownConditions = new Map([
    ["barbaro-ira", "Ira"],
    ["paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia", "Giuramento di Inimicizia"],
    ["chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo", "Santuario del Crepuscolo"],
  ]);
  const conditionName = knownConditions.get(id) || name;
  const auraEffect = (Array.isArray(effects) ? effects : [])
    .find((effect) => effect?.type === "aura");
  if (auraEffect || targeting?.mode === "aura") {
    const radiusMeters = Number(auraEffect?.radius_meters ?? targeting?.rangeMeters);
    const onEndTurn = uniqueStrings(auraEffect?.on_end_turn);
    return {
      kind: "aura",
      conditionName,
      radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : null,
      detail: "Effetto ad area centrato sul personaggio.",
      targetEffect: {
        conditionName,
        effectKind: "buff",
        detail: onEndTurn.length
          ? `Effetto a fine turno: ${onEndTurn.join(", ")}.`
          : "Bersaglio dentro l'area.",
        mechanics: onEndTurn.length ? { onEndTurn } : {},
      },
    };
  }

  return {
    kind: "condition",
    conditionName,
    detail: name,
  };
}

function normalizeResourceCosts(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const poolId = String(entry?.poolId || entry?.pool_id || "").trim();
      const rawAmount = entry?.amount;
      const rawAmountLabel = String(rawAmount ?? "").trim().toLowerCase();
      const variable = entry?.variable === true
        || ["variabile", "variable", "chosen", "scelto"].includes(rawAmountLabel);
      const amount = variable
        ? Math.max(1, Math.floor(Number(entry?.defaultAmount) || 1))
        : Math.max(0, Number(rawAmount) || 0);
      const sharedWithFeatureId = String(
        entry?.sharedWithFeatureId
          || entry?.shared_with_feature_id
          || ""
      ).trim();
      const valueInput = shortText(
        entry?.valueInput
          || entry?.value_input
          || (variable ? "positive-integer" : ""),
        80,
      );
      return {
        poolId,
        amount,
        ...(variable ? { variable: true, valueInput } : {}),
        ...(sharedWithFeatureId ? { sharedWithFeatureId } : {}),
      };
    })
    .filter((entry) => entry.poolId && (entry.variable || entry.amount > 0));
}

function normalizeResourceOperations(effects = []) {
  return (Array.isArray(effects) ? effects : [])
    .map((effect) => {
      if (!effect || typeof effect !== "object") return null;
      if (effect.type === "create_spell_slot") {
        const costTable = effect.cost_table && typeof effect.cost_table === "object"
          ? Object.fromEntries(Object.entries(effect.cost_table)
            .map(([level, cost]) => [String(level), Math.max(0, Math.floor(Number(cost) || 0))])
            .filter(([, cost]) => cost > 0))
          : {};
        return Object.keys(costTable).length
          ? {
            kind: "create-spell-slot",
            costTable,
            ...(String(effect.created_slot_expires || "").trim()
              ? { createdSlotExpires: String(effect.created_slot_expires).trim() }
              : {}),
          }
          : null;
      }
      if (effect.type === "convert_spell_slot_to_points") {
        return {
          kind: "convert-spell-slot-to-points",
          ...(String(effect.points_formula || "").trim()
            ? { pointsFormula: String(effect.points_formula).trim() }
            : {}),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeSpecialRefresh(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const minClassLevel = Number(entry.min_class_level ?? entry.minClassLevel);
      const amount = Number(entry.amount);
      const event = String(entry.event || "").trim();
      if (!Number.isInteger(minClassLevel) || minClassLevel < 1 || minClassLevel > 20) return null;
      if (!Number.isInteger(amount) || amount <= 0 || !event) return null;
      return {
        minClassLevel,
        event,
        amount,
        ...(entry.cap_at_maximum === true || entry.capAtMaximum === true
          ? { capAtMaximum: true }
          : {}),
      };
    })
    .filter(Boolean);
}

function normalizeWildMagicTable(value, featureId) {
  const expectedRanges = Array.from({ length: 50 }, (_, index) => {
    const start = index * 2 + 1;
    const end = start + 1;
    return `${String(start).padStart(2, "0")}-${end === 100 ? "00" : String(end).padStart(2, "0")}`;
  });
  const rows = (Array.isArray(value) ? value : [])
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const d100 = shortText(row.d100 || row.range, 20);
      const effect = shortText(row.effetto || row.effect, 8000);
      return d100 && effect ? { d100, effect } : null;
    })
    .filter(Boolean);
  if (rows.length !== expectedRanges.length) {
    throw new Error(`${featureId}: tabella Impulsi incompleta (${rows.length}/50)`);
  }
  const ranges = rows.map((row) => row.d100);
  if (new Set(ranges).size !== ranges.length
    || ranges.some((range, index) => range !== expectedRanges[index])) {
    throw new Error(`${featureId}: intervalli tabella Impulsi non unici o non ordinati`);
  }
  return rows.map((row) => ({
    ...row,
    ...(WILD_MAGIC_SPELL_IDS_BY_RANGE[row.d100]
      ? { spellId: WILD_MAGIC_SPELL_IDS_BY_RANGE[row.d100] }
      : {}),
    ...(WILD_MAGIC_NO_CONCENTRATION_RANGES.has(row.d100)
      ? { noConcentration: true, fullDuration: true }
      : {}),
  }));
}

function normalizeRuntimeSupport(id, override = runtimeOverrideFor(id)) {
  const status = String(override.status || "not-automated").trim().toLowerCase();
  if (status !== "implemented" && status !== "not-automated") {
    throw new Error(`${id}: stato runtime non valido ${status}`);
  }
  return {
    status,
    adapter: String(override.adapter || "").trim() || null,
    reason: status === "implemented" ? null : "adapter-not-implemented",
  };
}

function normalizeStacking(value) {
  if (!value || typeof value !== "object") return null;
  const rawMaximum = value.same_effect_max_instances_per_target
    ?? value.sameEffectMaxInstancesPerTarget;
  const maximum = Number(rawMaximum);
  return Number.isInteger(maximum) && maximum > 0
    ? { sameEffectMaxInstancesPerTarget: maximum }
    : null;
}

function classLevelValues(capacity, classesById, fallbackClassId = "") {
  if (!capacity || typeof capacity !== "object") return null;
  if (capacity.type === "fixed") {
    return Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [String(index + 1), capacity.value])
    );
  }
  if (capacity.type !== "class_progression") return null;
  const classId = String(capacity.class_id || fallbackClassId || "").trim();
  const classEntry = classesById.get(classId);
  if (!classEntry) return null;
  const rows = Array.isArray(classEntry.progressione_livelli)
    ? classEntry.progressione_livelli
    : [];
  const values = {};
  for (const row of rows) {
    if (row?.[capacity.field] !== undefined) {
      values[String(row.livello)] = row[capacity.field];
    }
  }
  return Object.keys(values).length ? values : null;
}

function normalizeFeatureDiceProgression(effects, classesById, fallbackClassId = "") {
  const effect = (Array.isArray(effects) ? effects : [])
    .find((entry) => entry?.dice_from || entry?.diceFrom);
  const raw = effect?.dice_from || effect?.diceFrom;
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "class_progression").trim();
  const classId = String(raw.class_id || raw.classId || fallbackClassId).trim();
  const field = String(
    raw.field || raw.progression_field || raw.progressionField || ""
  ).trim();
  if (type !== "class_progression" || !classId || !field) return null;
  const reference = {
    type: "class_progression",
    class_id: classId,
    field,
  };
  const values = classLevelValues(
    { type: "class_progression", class_id: classId, field },
    classesById,
    classId,
  );
  return values
    ? { diceFrom: reference, diceByClassLevel: values }
    : null;
}

function bandLevelValues(bands) {
  if (!Array.isArray(bands) || !bands.length) return null;
  const values = {};
  for (const band of bands) {
    const minimum = Math.max(
      1,
      Math.min(20, Math.floor(Number(band.min_level ?? band.minLevel) || 1)),
    );
    const maximum = Math.max(
      minimum,
      Math.min(20, Math.floor(Number(band.max_level ?? band.maxLevel) || 20))
    );
    for (let level = minimum; level <= maximum; level += 1) {
      values[String(level)] = band.value;
    }
  }
  return Object.keys(values).length ? values : null;
}

function normalizePool(pool, classesById, recordIdentityById) {
  const id = String(pool?.id || "").trim();
  if (!id) return null;
  const capacity = pool.capacity && typeof pool.capacity === "object"
    ? { ...pool.capacity }
    : null;
  const ownerId = String(pool?.owner?.id || "").trim();
  const ownerType = String(pool?.owner?.type || "").trim().toLowerCase();
  const ownerIdentity = recordIdentityById.get(ownerId) || {};
  const ownerClassId = ownerType === "classe"
    ? ownerId
    : String(ownerIdentity.classId || "").trim();
  const capacityClassId = String(
    capacity?.class_id || ownerClassId || ""
  ).trim();
  const normalizedCapacity = capacity
    ? {
      type: capacity.type,
      ...(capacity.value !== undefined ? { value: capacity.value } : {}),
      ...(capacity.expression ? { expression: capacity.expression } : {}),
      class_id: capacityClassId,
    }
    : null;
  const rawDie = pool.die && typeof pool.die === "object" ? pool.die : null;
  const die = rawDie
    ? {
      type: rawDie.type,
      class_id: String(
        rawDie.class_id
          || rawDie.classId
          || capacityClassId
          || ownerClassId
          || ""
      ).trim(),
      field: String(rawDie.field || rawDie.progression_field || "").trim(),
    }
    : null;
  const dieByClassLevel = die?.type === "class_progression" && die.field
    ? classLevelValues(die, classesById, die.class_id || ownerClassId)
    : null;
  const specialRefresh = normalizeSpecialRefresh(pool.special_refresh);
  return {
    id,
    name: shortText(pool.nome || id, 120),
    capacity: normalizedCapacity,
    maximumByClassLevel:
      classLevelValues(capacity, classesById, capacityClassId)
      || bandLevelValues(pool.capacity_by_class_level),
    refresh: Array.isArray(pool.refresh) ? pool.refresh : [],
    refreshByClassLevel: Array.isArray(pool.refresh_by_class_level)
      ? pool.refresh_by_class_level
      : [],
    ...(die ? { die } : {}),
    ...(dieByClassLevel ? { dieByClassLevel } : {}),
    ...(specialRefresh.length ? { specialRefresh } : {}),
  };
}

const loaded = SOURCE_CONFIGS.map((config) => ({
  ...config,
  catalogData: readJson(config.catalog),
  mechanicData: readJson(config.mechanics),
}));

const classesById = new Map();
for (const source of loaded) {
  for (const classEntry of Array.isArray(source.catalogData?.classi)
    ? source.catalogData.classi
    : []) {
    const id = String(classEntry?.id || "").trim();
    if (!id) continue;
    if (classesById.has(id)) {
      throw new Error(`Duplicate class id ${id}`);
    }
    classesById.set(id, classEntry);
  }
}
const classes = [...classesById.values()]
  .map((entry) => ({
    id: String(entry.id || ""),
    name: shortText(entry.nome, 100),
  }))
  .filter((entry) => entry.id && entry.name);

const subclassById = new Map();
const subclassTableById = new Map();
const recordsById = new Map();
const recordSourceById = new Map();
for (const source of loaded) {
  for (const subclass of Array.isArray(source.catalogData?.sottoclassi)
    ? source.catalogData.sottoclassi
    : []) {
    const id = String(subclass?.id || "").trim();
    if (!id) continue;
    const relatedFeatureSpellLists = [
      ...(Array.isArray(source.catalogData?.privilegi)
        ? source.catalogData.privilegi
        : []),
      ...(Array.isArray(source.catalogData?.opzioni)
        ? source.catalogData.opzioni
        : []),
    ]
      .filter((record) => String(record?.sottoclasse_id || "").trim() === id)
      .map((record) => record?.incantesimi_aggiuntivi)
      .filter(Boolean);
    const additionalSpellsByLevel = mergeAdditionalSpellsByLevel([
      subclass.incantesimi_aggiuntivi,
      ...relatedFeatureSpellLists,
    ]);
    subclassById.set(id, {
      id,
      name: shortText(subclass.nome, 120),
      classId: String(subclass.classe_id || "").trim(),
      source: source.id,
      ...(additionalSpellsByLevel ? { additionalSpellsByLevel } : {}),
    });
    if (Array.isArray(subclass.tabella_impulsi_magia_selvaggia)) {
      subclassTableById.set(id, subclass.tabella_impulsi_magia_selvaggia);
    }
  }
  for (const collection of ["privilegi", "opzioni"]) {
    for (const record of Array.isArray(source.catalogData?.[collection])
      ? source.catalogData[collection]
      : []) {
      const id = String(record?.id || "").trim();
      if (!id) continue;
      if (recordsById.has(id)) throw new Error(`ID catalogo duplicato: ${id}`);
      recordsById.set(id, record);
      recordSourceById.set(id, { source: source.id, collection });
    }
  }
}

const mechanicById = new Map();
for (const source of loaded) {
  for (const mechanic of Array.isArray(source.mechanicData?.mechanics)
    ? source.mechanicData.mechanics
    : []) {
    const id = String(mechanic?.id || "").trim();
    if (!id) continue;
    if (mechanicById.has(id)) throw new Error(`ID meccanico duplicato: ${id}`);
    mechanicById.set(id, { mechanic, source });
  }
}

const recordIdentityById = new Map();
for (const [id, record] of recordsById) {
  const mechanic = mechanicById.get(id)?.mechanic;
  recordIdentityById.set(
    id,
    resolveRecordIdentity(record, mechanic, recordsById)
  );
}

for (const id of Object.keys(runtimeOverrides)) {
  if (!recordsById.has(id)) throw new Error(`Override runtime senza record catalogo: ${id}`);
}

const features = [];
for (const [id, record] of recordsById) {
  const mechanicEntry = mechanicById.get(id);
  if (!mechanicEntry) throw new Error(`Record meccanico mancante: ${id}`);
  const { mechanic, source } = mechanicEntry;
  const override = runtimeOverrideFor(id);
  const activation = String(
    override.activation?.primary || mechanic?.activation?.primary || ""
  ).trim();
  const automationLevel = String(
    override.automationLevel || mechanic?.automation_level || "riferimento"
  ).trim();
  const forcedIntoRuntime = override.include === true;
  if (!forcedIntoRuntime && (automationLevel === "riferimento" || NON_ACTION_ACTIVATIONS.has(activation))) {
    continue;
  }
  const identity = recordIdentityById.get(id) || {};
  const parentFeatureId = shortText(
    record?.parent_id
      || mechanic?.source?.parent_id
      || (
        identity.classId === "chierico"
        && id !== "chierico-incanalare-divinita"
        && id.includes("-incanalare-divinita-")
          ? "chierico-incanalare-divinita"
          : ""
      ),
    220,
  );
  if (!identity.classId) continue;
  const catalogEntry = recordSourceById.get(id);
  const completeness = normalizeCompleteness(mechanic?.completeness?.status);
  const effects = Array.isArray(mechanic?.effects) ? mechanic.effects : [];
  const duration = normalizeDuration(mechanic?.duration, effects, override);
  const targeting = normalizeTargeting(override.targeting || mechanic?.targets, effects);
  const diceProgression = normalizeFeatureDiceProgression(
    effects,
    classesById,
    identity.classId,
  );
  const runtimeSupport = normalizeRuntimeSupport(id, override);
  const stacking = runtimeSupport.adapter === "bardic-inspiration"
    ? normalizeStacking(
      override.stacking
        || override.constraints?.stacking
        || mechanic?.constraints?.stacking,
    )
    : null;
  const choiceOptions = normalizeChoiceOptions(override.choiceOptions);
  const optionGroup = shortText(
    override.optionGroup || override.option_group || "",
    220,
  );
  const suppressSourceCardPill = override.suppressSourceCardPill === true
    || override.suppress_source_card_pill === true;
  const targetRemovalMode = String(
    override.targetRemovalMode
      || override.target_removal_mode
      || "",
  ).trim().toLowerCase() === "single"
    ? "single"
    : "";
  const autoActivateFeatureIds = uniqueStrings(override.autoActivateFeatureIds);
  const requiresActiveFeatureId = shortText(
    override.requiresActiveFeatureId
      || override.requires_active_feature_id
      || "",
    220,
  );
  const passiveMechanics = override.passiveMechanics
    && typeof override.passiveMechanics === "object"
    ? JSON.parse(JSON.stringify(override.passiveMechanics))
    : null;
  const excludedResourcePoolIds = new Set([
    ...UNTRACKED_RESOURCE_POOL_IDS,
    ...uniqueStrings(override.excludeResourcePoolIds || override.exclude_resource_pool_ids),
  ]);
  const resourceCosts = normalizeResourceCosts(
    Array.isArray(override.resourceCosts)
      ? override.resourceCosts
      : Array.isArray(mechanic?.resource_costs)
        ? mechanic.resource_costs
        : [],
  ).filter((cost) => !excludedResourcePoolIds.has(cost.poolId));
  const trackedResourcePoolIds = uniqueStrings([
    ...resourceCosts.map((cost) => cost.poolId),
    ...(Array.isArray(mechanic?.resource_costs) ? mechanic.resource_costs : [])
      .map((cost) => cost?.poolId || cost?.pool_id),
  ]).filter((poolId) => !excludedResourcePoolIds.has(poolId));
  const resourceOperations = normalizeResourceOperations(mechanic?.effects);
  const wildMagicTable = id === WILD_MAGIC_SURGE_FEATURE_ID
    ? normalizeWildMagicTable(
      subclassTableById.get(identity.subclassId),
      id,
    )
    : null;
  const defaultEnabled = Object.prototype.hasOwnProperty.call(override, "defaultEnabled")
    ? override.defaultEnabled === true
    : catalogEntry?.collection === "privilegi"
      && completeness === "curated"
      && runtimeSupport.status === "implemented";
  const featureName = shortText(
    override.displayName || record.nome || mechanic?.source?.name || id,
    140,
  );
  features.push({
    id,
    name: featureName,
    // Il runtime mostra solo una sintesi operativa; il testo integrale resta
    // nei cataloghi sorgente sotto data/class-features.
    description: shortText(record.descrizione, 8000),
    classId: identity.classId,
    subclassId: identity.subclassId || "",
    ...(parentFeatureId ? { parentFeatureId } : {}),
    minimumLevel: recordLevel(record, mechanic, recordsById),
    source: source.id,
    sourceLabel: source.label,
    page: Number(record.pagina || mechanic?.source?.page || mechanic?.source?.pagina) || null,
    collection: catalogEntry?.collection || "privilegi",
    defaultEnabled,
    automationLevel,
    completenessStatus: completeness,
    runtimeRequirements: mechanic?.runtime_requirements
      && typeof mechanic.runtime_requirements === "object"
      ? mechanic.runtime_requirements
      : {},
    missingForExecution: uniqueStrings(mechanic?.completeness?.missing_for_execution),
    runtimeSupport,
    ...(stacking ? { stacking } : {}),
    activation: { primary: activation || "non_specificata" },
    ...(requiresActiveFeatureId ? { requiresActiveFeatureId } : {}),
    ...(passiveMechanics ? { passiveMechanics } : {}),
    ...(optionGroup ? { optionGroup } : {}),
    ...(suppressSourceCardPill ? { suppressSourceCardPill: true } : {}),
    ...(targetRemovalMode ? { targetRemovalMode } : {}),
    ...(autoActivateFeatureIds.length ? { autoActivateFeatureIds } : {}),
    ...(trackedResourcePoolIds.length ? { trackedResourcePoolIds } : {}),
    ...(resourceOperations.length ? { resourceOperations } : {}),
    ...(diceProgression || {}),
    ...(wildMagicTable ? { wildMagicTable } : {}),
    ...(Object.prototype.hasOwnProperty.call(override, "quickActionEligible")
      ? { quickActionEligible: override.quickActionEligible === true }
      : {}),
    targetMode: normalizeTargetMode(targeting),
    targeting,
    theme: normalizeFeatureTheme(id, override),
    effectPlan: runtimeSupport.status === "implemented"
      ? normalizeEffectPlan(id, featureName, effects, targeting, override)
      : null,
    ...(choiceOptions.length ? { choiceOptions } : {}),
    breaksConcentration: override.breaksConcentration === true
      || duration.untilFeatureId === "barbaro-ira",
    duration: {
      rounds: duration.rounds,
      ...(duration.timing ? { timing: duration.timing } : {}),
      ...(duration.untilFeatureId ? { untilFeatureId: duration.untilFeatureId } : {}),
      ...(duration.indefiniteWithFeatureId
        ? { indefiniteWithFeatureId: duration.indefiniteWithFeatureId }
        : {}),
      ...(duration.endConditions.length ? { endConditions: duration.endConditions } : {}),
    },
    trackingMode: override.trackingMode
      || (
        duration.rounds !== null
        || duration.timing
        || duration.untilFeatureId
        || duration.endConditions.length
          ? "active"
          : "instant"
      ),
    resourceCosts,
  });
}

const poolById = new Map();
for (const source of loaded) {
  for (const rawPool of Array.isArray(source.mechanicData?.resource_pools)
    ? source.mechanicData.resource_pools
    : []) {
    const normalized = normalizePool(rawPool, classesById, recordIdentityById);
    if (!normalized) continue;
    if (UNTRACKED_RESOURCE_POOL_IDS.has(normalized.id)) continue;
    const previous = poolById.get(normalized.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      throw new Error(`Resource pool incompatibile tra sorgenti: ${normalized.id}`);
    }
    poolById.set(normalized.id, normalized);
  }
}

for (const feature of features) {
  for (const cost of feature.resourceCosts) {
    if (!poolById.has(cost.poolId)) {
      throw new Error(`${feature.id}: resource pool mancante ${cost.poolId}`);
    }
  }
}

features.sort((left, right) =>
  left.classId.localeCompare(right.classId)
  || left.minimumLevel - right.minimumLevel
  || left.name.localeCompare(right.name, "it")
);

const output = {
  version: RUNTIME_VERSION,
  sources: loaded.map((source) => ({
    id: source.id,
    label: source.label,
    catalogVersion: String(source.catalogData?.meta?.versione || ""),
    mechanicVersion: String(source.mechanicData?.meta?.versione || ""),
  })),
  classes,
  subclasses: [...subclassById.values()].sort((left, right) =>
    left.classId.localeCompare(right.classId)
    || left.name.localeCompare(right.name, "it")
  ),
  resourcePools: [...poolById.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "it")
  ),
  features,
  validation: {
    catalogRecords: recordsById.size,
    mechanicRecords: mechanicById.size,
    activeFeatures: features.length,
    resourcePools: poolById.size,
    runtimeImplemented: features.filter((feature) => feature.runtimeSupport.status === "implemented").length,
    runtimeNotAutomated: features.filter((feature) => feature.runtimeSupport.status === "not-automated").length,
  },
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output.validation));
