import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.resolve("data", "class-features");
const OUTPUT_PATH = path.resolve("src", "class-features-runtime.json");
const RUNTIME_VERSION = 4;
const RUNTIME_OVERRIDES_FILE = "runtime-feature-overrides.json";

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

const DEFAULT_FEATURE_THEME = Object.freeze({
  emoji: "✨",
  accent: "#38bdf8",
  background: "#0c4a6e",
  text: "#ecfeff",
});

function runtimeOverrideFor(id) {
  return runtimeOverrides[id] && typeof runtimeOverrides[id] === "object"
    ? runtimeOverrides[id]
    : {};
}

function normalizeFeatureTheme(id, override = {}) {
  return {
    ...(FEATURE_THEMES[id] || DEFAULT_FEATURE_THEME),
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
  const timing = String(raw.timing || raw.mode || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  const normalizedTiming = timing === "next-turn" || timing === "until-next-turn"
    ? "next-turn"
    : timing === "next-turn-end" || timing === "until-next-turn-end"
      ? "next-turn-end"
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
  return {
    type: String(raw.type || "non_specificata"),
    rounds: Number.isFinite(rounds) && rounds > 0 ? Math.round(rounds) : null,
    timing: normalizedTiming,
    untilFeatureId: untilFeatureId || null,
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

function normalizeEffectPlan(id, name, effects, targeting, override = {}) {
  if (override.effectPlan && typeof override.effectPlan === "object") {
    return JSON.parse(JSON.stringify(override.effectPlan));
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

function classLevelValues(capacity, classesById) {
  if (!capacity || typeof capacity !== "object") return null;
  if (capacity.type === "fixed") {
    return Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [String(index + 1), capacity.value])
    );
  }
  if (capacity.type !== "class_progression") return null;
  const classEntry = classesById.get(String(capacity.class_id || ""));
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

function bandLevelValues(bands) {
  if (!Array.isArray(bands) || !bands.length) return null;
  const values = {};
  for (const band of bands) {
    const minimum = Math.max(1, Math.min(20, Math.floor(Number(band.min_level) || 1)));
    const maximum = Math.max(
      minimum,
      Math.min(20, Math.floor(Number(band.max_level) || 20))
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
  const ownerIdentity = recordIdentityById.get(ownerId) || {};
  return {
    id,
    name: shortText(pool.nome || id, 120),
    capacity: capacity
      ? {
        type: capacity.type,
        value: capacity.value,
        class_id: capacity.class_id || ownerIdentity.classId || "",
      }
      : null,
    maximumByClassLevel:
      classLevelValues(capacity, classesById)
      || bandLevelValues(pool.capacity_by_class_level),
    refresh: Array.isArray(pool.refresh) ? pool.refresh : [],
    refreshByClassLevel: Array.isArray(pool.refresh_by_class_level)
      ? pool.refresh_by_class_level
      : [],
  };
}

const loaded = SOURCE_CONFIGS.map((config) => ({
  ...config,
  catalogData: readJson(config.catalog),
  mechanicData: readJson(config.mechanics),
}));

const phb = loaded.find((entry) => entry.id === "phb2014");
const classes = (Array.isArray(phb?.catalogData?.classi) ? phb.catalogData.classi : [])
  .map((entry) => ({
    id: String(entry.id || ""),
    name: shortText(entry.nome, 100),
  }))
  .filter((entry) => entry.id && entry.name);
const classesById = new Map(
  (Array.isArray(phb?.catalogData?.classi) ? phb.catalogData.classi : [])
    .map((entry) => [String(entry.id || ""), entry])
);

const subclassById = new Map();
const recordsById = new Map();
const recordSourceById = new Map();
for (const source of loaded) {
  for (const subclass of Array.isArray(source.catalogData?.sottoclassi)
    ? source.catalogData.sottoclassi
    : []) {
    const id = String(subclass?.id || "").trim();
    if (!id) continue;
    subclassById.set(id, {
      id,
      name: shortText(subclass.nome, 120),
      classId: String(subclass.classe_id || "").trim(),
      source: source.id,
    });
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
  if (!identity.classId) continue;
  const catalogEntry = recordSourceById.get(id);
  const completeness = normalizeCompleteness(mechanic?.completeness?.status);
  const effects = Array.isArray(mechanic?.effects) ? mechanic.effects : [];
  const duration = normalizeDuration(mechanic?.duration, effects, override);
  const targeting = normalizeTargeting(override.targeting || mechanic?.targets, effects);
  const runtimeSupport = normalizeRuntimeSupport(id, override);
  const choiceOptions = normalizeChoiceOptions(override.choiceOptions);
  const autoActivateFeatureIds = uniqueStrings(override.autoActivateFeatureIds);
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
    activation: { primary: activation || "non_specificata" },
    ...(autoActivateFeatureIds.length ? { autoActivateFeatureIds } : {}),
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
    resourceCosts: (Array.isArray(override.resourceCosts)
      ? override.resourceCosts
      : Array.isArray(mechanic?.resource_costs)
        ? mechanic.resource_costs
        : [])
      .map((entry) => ({
        poolId: String(entry?.poolId || entry?.pool_id || "").trim(),
        amount: Math.max(0, Number(entry?.amount) || 0),
        ...(String(
          entry?.sharedWithFeatureId
            || entry?.shared_with_feature_id
            || ""
        ).trim()
          ? {
            sharedWithFeatureId: String(
              entry?.sharedWithFeatureId
                || entry?.shared_with_feature_id
                || ""
            ).trim(),
          }
          : {}),
      }))
      .filter((entry) => entry.poolId && entry.amount > 0),
  });
}

const poolById = new Map();
for (const source of loaded) {
  for (const rawPool of Array.isArray(source.mechanicData?.resource_pools)
    ? source.mechanicData.resource_pools
    : []) {
    const normalized = normalizePool(rawPool, classesById, recordIdentityById);
    if (!normalized) continue;
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
