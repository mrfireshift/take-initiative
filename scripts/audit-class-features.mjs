import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(".");
const SOURCE_DIR = path.join(ROOT_DIR, "data", "class-features");
const RUNTIME_CATALOG_PATH = path.join(ROOT_DIR, "src", "class-features-runtime.json");
const REPORT_PATH = path.join(SOURCE_DIR, "class-feature-automation-audit.json");
const MARKDOWN_PATH = path.join(ROOT_DIR, "docs", "AUDIT_CAPACITA_CLASSE.md");

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
  "passiva_o_non_specificata",
  "contenitore_opzioni",
  "sistema_incantesimi",
]);

const ACTIONABLE_ACTIVATIONS = new Set([
  "azione",
  "azione_bonus",
  "azione_bonus_o_ingresso_in_ira",
  "azione_attacco",
  "fine_riposo_breve",
  "fine_turno",
  "ingresso_in_ira",
  "innesco",
  "inizio_primo_turno_combattimento",
  "nessuna_azione",
  "prima_del_tiro",
  "reazione",
  "varia_per_opzione",
]);

const COMBAT_ACTIVATIONS = new Set([
  "azione",
  "azione_bonus",
  "azione_bonus_o_ingresso_in_ira",
  "azione_attacco",
  "ingresso_in_ira",
  "innesco",
  "inizio_primo_turno_combattimento",
  "reazione",
]);

const TOKEN_MARKER_EFFECTS = new Set([
  "advantage",
  "advantage_on_weapon_attacks",
  "apply_state",
  "aura",
  "aura_bonus_iniziativa",
  "create_aura",
  "create_temporary_weapons",
  "curse",
  "damage_buffer",
  "damage_resistance",
  "debuff_next_save",
  "extra_attack_on_attack_action",
  "grant_consumable_die",
  "link_targets",
  "mark_target",
  "miss_chance",
  "spellcasting_lock",
  "speed_bonus",
  "status_bundle",
  "telepathic_link",
  "temporary_hp",
  "temporary_hp_and_reaction_move",
  "transform",
]);

const RESOURCE_ONLY_EFFECTS = new Set([
  "convert_spell_slot_to_points",
  "create_spell_slot",
  "restore_spell_slots",
  "shared_dice_resource_provider",
  "shared_resource_provider",
  "spell_slot_pool",
]);

const PERSISTENT_DURATION_TYPES = new Set([
  "fixed",
  "formula",
  "fino_al_riposo_lungo",
  "until_end_of_next_turn",
  "until_end_of_turn",
  "until_start_of_next_turn",
]);

const TEXT_MARKER_SIGNALS = Object.freeze([
  "finché",
  "fino a",
  "fino al",
  "fino all",
  "per 1 minuto",
  "per un minuto",
  "round",
  "aura",
  "marchio",
  "bersaglio",
  "alleat",
]);

const STRONG_TEXT_MARKER_SIGNALS = new Set([
  "finché",
  "per 1 minuto",
  "per un minuto",
  "round",
  "aura",
  "marchio",
]);

const MODE_LABELS = Object.freeze({
  token_marker: "Tracciamento su token",
  token_marker_review: "Candidato token da curare",
  instant_effect: "Effetto istantaneo",
  tavolo: "Gestione al tavolo",
});

const MODE_PRIORITY = Object.freeze({
  token_marker: "alta",
  token_marker_review: "media",
  instant_effect: "nessuna",
  tavolo: "nessuna",
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asString(value) {
  return String(value ?? "").trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(asString)
      .filter(Boolean)
  ));
}

function normalizeCompleteness(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "curated" || raw === "curata") return "curata";
  if (raw === "reference" || raw === "riferimento") return "riferimento";
  return "parziale";
}

function resolveIdentity(record, mechanic, recordsById) {
  const seen = new Set();
  let current = record;
  let classId = asString(record?.classe_id || mechanic?.source?.class_id);
  let subclassId = asString(record?.sottoclasse_id || mechanic?.source?.subclass_id);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (!classId) classId = asString(current.classe_id);
    if (!subclassId) subclassId = asString(current.sottoclasse_id);
    const parentId = asString(current.parent_id);
    current = parentId ? recordsById.get(parentId) : null;
  }
  return { classId, subclassId };
}

function levelOf(record, mechanic) {
  const levels = [
    ...(Array.isArray(record?.livelli) ? record.livelli : []),
    ...(Array.isArray(mechanic?.source?.levels) ? mechanic.source.levels : []),
    record?.livello_minimo,
  ]
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 20);
  return levels.length ? Math.min(...levels) : null;
}

function effectTypes(mechanic) {
  return uniqueStrings((Array.isArray(mechanic?.effects) ? mechanic.effects : [])
    .map((effect) => effect?.type));
}

function sourceCompleteness(mechanic) {
  return normalizeCompleteness(mechanic?.completeness?.status);
}

function sourceAutomationLevel(mechanic) {
  const raw = asString(mechanic?.automation_level).toLowerCase();
  return raw || "riferimento";
}

function hasResourceCosts(mechanic) {
  return Array.isArray(mechanic?.resource_costs) && mechanic.resource_costs.length > 0;
}

function hasStructuredEffects(mechanic) {
  return sourceCompleteness(mechanic) === "curata"
    && Array.isArray(mechanic?.effects)
    && mechanic.effects.length > 0
    && uniqueStrings(mechanic?.completeness?.missing_for_execution).length === 0;
}

function hasManualChoice(mechanic) {
  return Boolean(mechanic?.manual_choice_required)
    || asString(mechanic?.activation?.primary) === "varia_per_opzione"
    || (Array.isArray(mechanic?.effects) && mechanic.effects.some(
      (effect) => effect?.type === "choose_option" || effect?.type === "choice"
    ));
}

function classifyLegacyFeature({ mechanic, record, identity, runtimeEntry }) {
  const level = sourceAutomationLevel(mechanic);
  const completeness = sourceCompleteness(mechanic);
  const activation = asString(mechanic?.activation?.primary) || "non_specificata";
  const effects = Array.isArray(mechanic?.effects) ? mechanic.effects : [];
  const effectTypeList = effectTypes(mechanic);
  const missingForExecution = uniqueStrings(mechanic?.completeness?.missing_for_execution);
  const resourceCosts = Array.isArray(mechanic?.resource_costs) ? mechanic.resource_costs : [];
  const structured = hasStructuredEffects(mechanic);
  const manualChoice = hasManualChoice(mechanic);
  const activeActivation = ACTIONABLE_ACTIVATIONS.has(activation);
  const runtimeExposed = Boolean(runtimeEntry);
  const blockers = [];

  if (completeness !== "curata") blockers.push("completezza_non_curata");
  if (!effects.length) blockers.push("effetti_non_strutturati");
  if (missingForExecution.length) blockers.push(...missingForExecution);
  if (manualChoice) blockers.push("scelta_giocatore_o_opzione");
  if (!activeActivation) blockers.push("attivazione_passiva_o_contenitore");
  if (!asString(mechanic?.targets?.type) || mechanic.targets.type === "non_specificato") {
    if (effects.length) blockers.push("bersaglio_da_specificare");
  }
  if (
    mechanic?.duration?.type === "testuale_o_non_specificata"
    || mechanic?.duration?.type === "non_specificata"
  ) {
    if (effects.length) blockers.push("durata_da_specificare");
  }
  if (!identity.classId) blockers.push("classe_non_risolta");
  if (!runtimeExposed && activeActivation && level !== "riferimento") {
    blockers.push("non_esposta_nel_catalogo_runtime");
  }

  let mode = "tavolo";
  let rationale = "La capacità resta descrittiva o richiede interpretazione al tavolo.";

  if (level === "automatica" && structured && activeActivation && !manualChoice) {
    mode = "automazione_deterministica";
    rationale = "Il JSON la dichiara automatica e contiene un effetto eseguibile senza scelta discrezionale.";
  } else if (level === "assistita" && structured && activeActivation) {
    mode = "automazione_assistita";
    rationale = "L'effetto è strutturato, ma l'attivazione richiede una conferma o una scelta esplicita.";
  } else if (
    level === "tracciamento"
    || (level === "assistita" && (hasResourceCosts(mechanic) || activeActivation))
  ) {
    mode = "tracciamento";
    rationale = "È utile conservare usi, risorsa, stato o disponibilità; l'effetto resta manuale finché non è strutturato.";
  }

  const uniqueBlockers = uniqueStrings(blockers);
  const requiresDataWork = mode !== "tavolo" && (
    completeness !== "curata"
    || !effects.length
    || missingForExecution.length > 0
    || !runtimeExposed
  );

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    priority: MODE_PRIORITY[mode],
    rationale,
    requiresDataWork,
    blockers: uniqueBlockers,
    sourceAutomationLevel: level,
    completeness,
    activation,
    activeActivation,
    manualChoice,
    effectTypes: effectTypeList,
    effectCount: effects.length,
    resourcePoolIds: uniqueStrings(resourceCosts.map((entry) => entry?.pool_id)),
    targetType: asString(mechanic?.targets?.type) || "non_specificato",
    durationType: asString(mechanic?.duration?.type) || "non_specificata",
  };
}

function classifyCombatFeature({ mechanic, record, identity, runtimeEntry }) {
  const level = sourceAutomationLevel(mechanic);
  const completeness = sourceCompleteness(mechanic);
  const activation = asString(mechanic?.activation?.primary) || "non_specificata";
  const effects = Array.isArray(mechanic?.effects) ? mechanic.effects : [];
  const effectTypeList = effectTypes(mechanic);
  const missingForExecution = uniqueStrings(mechanic?.completeness?.missing_for_execution);
  const resourceCosts = Array.isArray(mechanic?.resource_costs) ? mechanic.resource_costs : [];
  const structured = hasStructuredEffects(mechanic);
  const manualChoice = hasManualChoice(mechanic);
  const activeActivation = ACTIONABLE_ACTIVATIONS.has(activation);
  const combatActivation = COMBAT_ACTIVATIONS.has(activation);
  const runtimeImplemented = runtimeEntry?.runtimeSupport?.status === "implemented";
  const targetType = asString(mechanic?.targets?.type) || "non_specificato";
  const knownTarget = targetType !== "non_specificato";
  const durationType = asString(mechanic?.duration?.type) || "non_specificata";
  const knownRoundDuration = PERSISTENT_DURATION_TYPES.has(durationType)
    || (Array.isArray(mechanic?.duration?.end_conditions) && mechanic.duration.end_conditions.length > 0);
  const effectTypeSet = new Set(effectTypeList);
  const hasMarkerEffect = effectTypeList.some((type) => TOKEN_MARKER_EFFECTS.has(type));
  const resourceOnly = effects.length > 0
    && effectTypeList.every((type) => RESOURCE_ONLY_EFFECTS.has(type));
  const description = asString(record?.descrizione).toLowerCase();
  const textMarkerSignals = TEXT_MARKER_SIGNALS.filter((signal) => description.includes(signal));
  const textualMarkerCandidate = !effects.length
    && level !== "automatica"
    && combatActivation
    && (
      textMarkerSignals.length >= 2
      || textMarkerSignals.some((signal) => STRONG_TEXT_MARKER_SIGNALS.has(signal))
    );
  const blockers = [];
  const dataBlockers = [];
  let scopeExclusion = null;

  if (level === "automatica") {
    scopeExclusion = "automazione_deterministica_scartata";
  } else if (level === "riferimento") {
    scopeExclusion = "solo_riferimento";
  } else if (!activeActivation) {
    scopeExclusion = "passiva_o_contenitore";
  }

  if (completeness !== "curata") dataBlockers.push("completezza_non_curata");
  if (!effects.length) dataBlockers.push("effetti_non_strutturati");
  if (missingForExecution.length) dataBlockers.push(...missingForExecution);
  if (!knownTarget && effects.length) dataBlockers.push("bersaglio_da_specificare");
  if (!knownRoundDuration && effects.length) dataBlockers.push("durata_da_specificare");
  if (!identity.classId) dataBlockers.push("classe_non_risolta");
  if (textualMarkerCandidate) dataBlockers.push("effetti_da_estrarre_dal_testo");
  if (manualChoice) blockers.push("scelta_giocatore_o_opzione");
  if (runtimeEntry && runtimeEntry.runtimeSupport?.status !== "implemented") {
    blockers.push("adapter_runtime_mancante");
  }
  if (!runtimeEntry && (hasMarkerEffect || textualMarkerCandidate)) {
    blockers.push("non_esposta_nel_catalogo_runtime");
  }

  let mode = "tavolo";
  let rationale = "La capacit\u00e0 non richiede un promemoria persistente su un token durante il combattimento.";
  if (level === "automatica") {
    rationale = "Esclusa dal perimetro: le capacit\u00e0 dichiarate deterministiche non sono prioritarie per il tracciamento manuale su token.";
  } else if (level === "riferimento" || !activeActivation) {
    rationale = "Capacit\u00e0 passiva, contenitore di opzioni o voce di riferimento: resta nella gestione ordinaria al tavolo.";
  } else if (resourceOnly) {
    rationale = "\u00c8 un contenitore o una trasformazione di risorse; il consumo non \u00e8 un obiettivo di questo audit.";
  } else if (structured && hasMarkerEffect && (runtimeImplemented || (knownTarget && knownRoundDuration))) {
    mode = "token_marker";
    rationale = "L'attivazione applica uno stato, un'aura o un promemoria a un token e la durata/bersaglio sono sufficientemente identificabili.";
  } else if ((structured && hasMarkerEffect) || textualMarkerCandidate) {
    mode = "token_marker_review";
    rationale = "Il testo suggerisce uno stato persistente da ricordare su un token, ma bersaglio, durata o effetto devono essere curati prima di esporlo.";
  } else if (structured && effects.length) {
    mode = "instant_effect";
    rationale = "L'effetto si risolve nell'evento (danno, guarigione, tiro o consumo) e non lascia un promemoria persistente da mostrare sul token.";
  }

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    priority: MODE_PRIORITY[mode],
    rationale,
    scopeExclusion,
    requiresDataWork: mode === "token_marker_review" || dataBlockers.length > 0,
    blockers: uniqueStrings(blockers),
    dataBlockers: uniqueStrings(dataBlockers),
    sourceAutomationLevel: level,
    completeness,
    activation,
    activeActivation,
    combatActivation,
    manualChoice,
    effectTypes: effectTypeList,
    effectCount: effects.length,
    hasMarkerEffect,
    resourceOnly,
    resourcePoolIds: uniqueStrings(resourceCosts.map((entry) => entry?.pool_id)),
    targetType,
    knownTarget,
    durationType,
    knownRoundDuration,
    textMarkerSignals,
    runtimeImplemented,
    markerEffectTypes: effectTypeList.filter((type) => TOKEN_MARKER_EFFECTS.has(type)),
    nonMarkerEffectTypes: effectTypeList.filter((type) => !TOKEN_MARKER_EFFECTS.has(type)),
    sourceEffectTypeSet: [...effectTypeSet],
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) increment(counts, selector(item));
  return counts;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0], "it")
  ));
}

function featureLabel(feature) {
  return `${feature.name} (${feature.id})`;
}

function markdownTable(rows) {
  return [
    "| Categoria | Record |",
    "|---|---:|",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}

const loaded = SOURCE_CONFIGS.map((source) => ({
  ...source,
  catalogData: readJson(path.join(SOURCE_DIR, source.catalog)),
  mechanicData: readJson(path.join(SOURCE_DIR, source.mechanics)),
}));
const runtime = readJson(RUNTIME_CATALOG_PATH);
const runtimeById = new Map((Array.isArray(runtime.features) ? runtime.features : [])
  .map((feature) => [feature.id, feature]));

const recordsById = new Map();
const recordSourceById = new Map();
const mechanicById = new Map();
for (const source of loaded) {
  for (const collection of ["privilegi", "opzioni"]) {
    for (const record of Array.isArray(source.catalogData?.[collection])
      ? source.catalogData[collection]
      : []) {
      const id = asString(record?.id);
      if (!id) continue;
      if (recordsById.has(id)) throw new Error(`ID catalogo duplicato: ${id}`);
      recordsById.set(id, record);
      recordSourceById.set(id, { source: source.id, collection });
    }
  }
  for (const mechanic of Array.isArray(source.mechanicData?.mechanics)
    ? source.mechanicData.mechanics
    : []) {
    const id = asString(mechanic?.id);
    if (!id) continue;
    if (mechanicById.has(id)) throw new Error(`ID meccanico duplicato: ${id}`);
    mechanicById.set(id, { mechanic, source });
  }
}

const features = [];
for (const [id, record] of recordsById) {
  const mechanicEntry = mechanicById.get(id);
  if (!mechanicEntry) throw new Error(`Record meccanico mancante: ${id}`);
  const { mechanic, source } = mechanicEntry;
  const identity = resolveIdentity(record, mechanic, recordsById);
  const runtimeEntry = runtimeById.get(id) || null;
  const recommendation = classifyCombatFeature({ mechanic, record, identity, runtimeEntry });
  const catalogSource = recordSourceById.get(id) || {};

  features.push({
    id,
    name: asString(record?.nome || mechanic?.source?.name || id),
    source: source.id,
    sourceLabel: source.label,
    collection: catalogSource.collection || "privilegi",
    classId: identity.classId || null,
    subclassId: identity.subclassId || null,
    minimumLevel: levelOf(record, mechanic),
    page: Number(record?.pagina || mechanic?.source?.page || mechanic?.source?.pagina) || null,
    recommendation,
    runtime: {
      exposed: Boolean(runtimeEntry),
      status: runtimeEntry?.runtimeSupport?.status || null,
      adapter: runtimeEntry?.runtimeSupport?.adapter || null,
    },
    sourceData: {
      completenessMissing: uniqueStrings(mechanic?.completeness?.missing_for_execution),
      runtimeRequirements: uniqueStrings(mechanic?.runtime_requirements),
      manualChoiceRequired: Boolean(mechanic?.manual_choice_required),
      activationAlternatives: uniqueStrings(mechanic?.activation?.alternatives),
      targetRequirements: uniqueStrings(mechanic?.targets?.requirements),
      effectTags: uniqueStrings(mechanic?.effect_tags || mechanic?.mechanical_tags),
    },
  });
}

features.sort((left, right) =>
  left.source.localeCompare(right.source)
  || (left.classId || "").localeCompare(right.classId || "")
  || (left.minimumLevel || 99) - (right.minimumLevel || 99)
  || left.name.localeCompare(right.name, "it")
);

const modeCounts = countBy(features, (feature) => feature.recommendation.mode);
const sourceCounts = countBy(features, (feature) => feature.source);
const runtimeStatusCounts = countBy(features, (feature) => feature.runtime.status || "non_esposta");
const sourceLevelCounts = countBy(features, (feature) => feature.recommendation.sourceAutomationLevel);
const completenessCounts = countBy(features, (feature) => feature.recommendation.completeness);
const blockerCounts = {};
const dataBlockerCounts = {};
const markerEffectCounts = {};
for (const feature of features) {
  for (const blocker of feature.recommendation.blockers) increment(blockerCounts, blocker);
  for (const blocker of feature.recommendation.dataBlockers) increment(dataBlockerCounts, blocker);
  for (const effectType of feature.recommendation.markerEffectTypes) increment(markerEffectCounts, effectType);
}

const tokenMarkerCandidates = features.filter((feature) =>
  feature.recommendation.mode === "token_marker"
);
const tokenMarkerReview = features.filter((feature) =>
  feature.recommendation.mode === "token_marker_review"
);
const textualMarkerReview = tokenMarkerReview.filter((feature) =>
  feature.recommendation.effectCount === 0
);
const structuredMarkerReview = tokenMarkerReview.filter((feature) =>
  feature.recommendation.effectCount > 0
);
const instantEffects = features.filter((feature) =>
  feature.recommendation.mode === "instant_effect"
);
const runtimeGaps = tokenMarkerCandidates.filter((feature) => !feature.runtime.exposed);

const report = {
  version: 2,
  generatedAt: new Date().toISOString().slice(0, 10),
  scope: {
    sources: SOURCE_CONFIGS.map(({ id, label, catalog, mechanics }) => ({
      id,
      label,
      catalog,
      mechanics,
      records: sourceCounts[id] || 0,
    })),
    totalMechanics: features.length,
    runtimeCatalogRecords: runtime.features?.length || 0,
    runtimeImplemented: (runtime.features || [])
      .filter((feature) => feature?.runtimeSupport?.status === "implemented").length,
  },
  criteria: {
    token_marker: "La capacit\u00e0 viene usata su un token e lascia uno stato/promemoria visibile per la durata dello scontro o finch\u00e9 non viene consumata.",
    token_marker_review: "Il testo suggerisce un marker su uno o pi\u00f9 token, ma il catalogo non specifica ancora in modo affidabile bersaglio, durata o effetto.",
    instant_effect: "L'effetto si risolve nell'evento; non serve una pill persistente sul token.",
    tavolo: "Capacit\u00e0 passive, riferimenti, contenitori di risorse o comportamenti che non producono uno stato combattivo da ricordare.",
    resourceRule: "Le risorse non sono un criterio di priorit\u00e0: vengono conservate nei metadati solo per documentazione futura.",
    deterministicRule: "Le tre candidate deterministiche individuate nell'audit precedente sono escluse da questa roadmap.",
    safetyRule: "Nessun marker viene promosso a runtime finch\u00e9 bersaglio e durata non sono espliciti o coperti da un adapter gi\u00e0 verificato.",
  },
  summary: {
    byCombatTracking: sortedCounts(modeCounts),
    bySource: sortedCounts(sourceCounts),
    bySourceAutomationLevel: sortedCounts(sourceLevelCounts),
    byCompleteness: sortedCounts(completenessCounts),
    byRuntimeStatus: sortedCounts(runtimeStatusCounts),
    blockerCounts: sortedCounts(blockerCounts),
    dataBlockerCounts: sortedCounts(dataBlockerCounts),
    markerEffectCounts: sortedCounts(markerEffectCounts),
    tokenMarkerCandidateCount: tokenMarkerCandidates.length,
    tokenMarkerReviewCount: tokenMarkerReview.length,
    structuredMarkerReviewCount: structuredMarkerReview.length,
    textualMarkerReviewCount: textualMarkerReview.length,
    instantEffectCount: instantEffects.length,
    tokenMarkerRuntimeGapCount: runtimeGaps.length,
    deterministicExcludedCount: features.filter((feature) =>
      feature.recommendation.sourceAutomationLevel === "automatica"
      && feature.recommendation.activeActivation
    ).length,
    resourceCriterionIgnored: true,
  },
  roadmap: [
    {
      phase: 1,
      label: "Marker token ad alta confidenza",
      count: tokenMarkerCandidates.length,
      candidates: tokenMarkerCandidates.map(featureLabel),
    },
    {
      phase: 2,
      label: "Curare i marker suggeriti dal testo o da effetti incompleti",
      count: tokenMarkerReview.length,
      candidates: tokenMarkerReview.map(featureLabel),
    },
    {
      phase: 3,
      label: "Lasciare gli effetti istantanei alla risoluzione manuale",
      count: instantEffects.length,
      candidates: instantEffects.map(featureLabel),
    },
    {
      phase: 4,
      label: "Escludere passive, riferimenti e soli contenitori di risorse",
      count: features.filter((feature) => feature.recommendation.mode === "tavolo").length,
      candidates: [],
    },
  ],
  features,
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const modeRows = Object.entries(MODE_LABELS)
  .map(([mode, label]) => [label, modeCounts[mode] || 0]);
const sourceRows = SOURCE_CONFIGS.map((source) => [source.label, sourceCounts[source.id] || 0]);
const runtimeRows = Object.entries(runtimeStatusCounts)
  .map(([status, count]) => [status, count]);
const legacyMarkdown = `# Audit capacità di classe\n\n` +
  `Report generato il ${report.generatedAt} dai tre overlay meccanici locali.\n\n` +
  `## Perimetro\n\n` +
  `Il catalogo contiene **${features.length} record**. Il catalogo runtime attuale ne espone ` +
  `**${report.scope.runtimeCatalogRecords}**; l'audit conserva anche i record esclusi, per evitare di confondere ` +
  `una capacità non esposta con una capacità da automatizzare parzialmente.\n\n` +
  markdownTable(sourceRows) + `\n\n` +
  `## Esito consigliato\n\n` +
  markdownTable(modeRows) + `\n\n` +
  `- Candidati ad alta priorità: **${report.summary.highPriorityCandidateCount}**.\n` +
  `- Capacità utili per il solo tracciamento di risorse/usi: **${report.summary.resourceTrackingCandidateCount}**.\n` +
  `- Record non di riferimento non ancora esposti dal runtime: **${report.summary.runtimeGapCount}** ` +
  `(di cui **${report.summary.runtimeActiveGapCount}** con attivazione attiva).\n\n` +
  `## Regole dell'audit\n\n` +
  `- **Automazione deterministica**: effetto completo e strutturato, attivazione eseguibile, nessuna scelta discrezionale.\n` +
  `- **Automazione assistita**: effetto completo, ma con conferma, selezione dei bersagli/opzioni o risoluzione guidata.\n` +
  `- **Tracciamento UI**: si memorizzano usi, risorse, disponibilità o stato senza applicare conseguenze non modellate.\n` +
  `- **Gestione al tavolo**: capacità passive, contenitori di opzioni, sistemi esterni o dati ancora ambigui/incompleti.\n\n` +
  `La regola di sicurezza è: **nessuna automatizzazione per un record con blocker**.\n\n` +
  `## Prima roadmap\n\n` +
  report.roadmap.map((phase) => `### ${phase.phase}. ${phase.label} (${phase.count})\n`).join("\n") +
  `\nIl dettaglio per ogni record, inclusi blocker, risorse, bersaglio, durata, stato runtime e motivazione, ` +
  `è disponibile in [class-feature-automation-audit.json](../data/class-features/class-feature-automation-audit.json).\n\n` +
  `## Stato runtime\n\n` +
  markdownTable(runtimeRows) + `\n`;

const markerCandidateRows = tokenMarkerCandidates.map((feature) => [feature.name, feature.id]);
const markdown = `# Audit capacit\u00e0 di classe\n\n` +
  `Report generato il ${report.generatedAt} dai tre overlay meccanici locali.\n\n` +
  `## Perimetro\n\n` +
  `Il catalogo contiene **${features.length} record**. Il catalogo runtime attuale ne espone ` +
  `**${report.scope.runtimeCatalogRecords}**. Le risorse non sono un obiettivo di questo audit.\n\n` +
  markdownTable(sourceRows) + `\n\n` +
  `## Esito per il combattimento\n\n` +
  markdownTable(modeRows) + `\n\n` +
  `- Marker ad alta confidenza: **${report.summary.tokenMarkerCandidateCount}**.\n` +
  `- Marker da curare prima dell'esposizione: **${report.summary.tokenMarkerReviewCount}** ` +
  `(strutturati: ${report.summary.structuredMarkerReviewCount}, testuali: ${report.summary.textualMarkerReviewCount}).\n` +
  `- Effetti istantanei senza pill persistente: **${report.summary.instantEffectCount}**.\n` +
  `- Risorse escluse come criterio: **s\u00ec**.\n\n` +
  `## Marker ad alta confidenza\n\n` +
  markdownTable(markerCandidateRows) + `\n\n` +
  `## Regole dell'audit\n\n` +
  `- **Marker token**: la capacit\u00e0 viene applicata a un token e resta da ricordare per round, durata o consumo.\n` +
  `- **Marker da curare**: il testo indica un possibile stato persistente, ma bersaglio/durata/effetto non sono ancora abbastanza espliciti.\n` +
  `- **Effetto istantaneo**: danno, guarigione, tiro o consumo che non richiede una pill persistente.\n` +
  `- Le tre candidate deterministiche dell'audit precedente sono escluse da questa roadmap.\n` +
  `- Nessun marker viene promosso senza bersaglio e durata espliciti, salvo adapter già verificato.\n\n` +
  `## Roadmap\n\n` +
  report.roadmap.map((phase) => `### ${phase.phase}. ${phase.label} (${phase.count})\n`).join("\n") +
  `\nIl dettaglio per ogni record, inclusi segnali testuali, effetti marker, bersaglio, durata e stato runtime, ` +
  `\u00e8 disponibile in [class-feature-automation-audit.json](../data/class-features/class-feature-automation-audit.json).\n\n` +
  `## Stato runtime\n\n` +
  markdownTable(runtimeRows) + `\n`;

fs.writeFileSync(MARKDOWN_PATH, markdown, "utf8");
console.log(JSON.stringify({
  report: path.relative(ROOT_DIR, REPORT_PATH),
  markdown: path.relative(ROOT_DIR, MARKDOWN_PATH),
  totalMechanics: features.length,
  runtimeCatalogRecords: report.scope.runtimeCatalogRecords,
  byCombatTracking: report.summary.byCombatTracking,
  tokenMarkerCandidates: report.summary.tokenMarkerCandidateCount,
  tokenMarkerReview: report.summary.tokenMarkerReviewCount,
  tokenMarkerRuntimeGaps: report.summary.tokenMarkerRuntimeGapCount,
}));
