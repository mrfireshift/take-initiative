import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(".");
const SOURCE_DIR = path.join(ROOT_DIR, "data", "class-features");
const SOURCE_AUDIT_PATH = path.join(SOURCE_DIR, "class-feature-automation-audit.json");
const RUNTIME_CATALOG_PATH = path.join(ROOT_DIR, "src", "class-features-runtime.json");
const DECISIONS_PATH = path.join(SOURCE_DIR, "barbaro-combat-decisions.json");
const OUTPUT_PATH = path.join(SOURCE_DIR, "barbaro-combat-audit.json");
const MARKDOWN_PATH = path.join(ROOT_DIR, "docs", "AUDIT_BARBARO.md");

const MODE_LABELS = Object.freeze({
  token_marker: "Marker token prioritario",
  token_marker_review: "Marker da curare",
  instant_effect: "Effetto istantaneo",
  tavolo: "Gestione al tavolo",
  covered_by_parent: "Coperta da capacità contenitore",
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function escapeMarkdown(value) {
  return text(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const sourceAudit = readJson(SOURCE_AUDIT_PATH);
const runtimeCatalog = readJson(RUNTIME_CATALOG_PATH);
const decisions = readJson(DECISIONS_PATH);
const allFeatures = Array.isArray(sourceAudit.features) ? sourceAudit.features : [];
const barbarianFeatures = allFeatures.filter((feature) => feature.classId === decisions.classId);
const runtimeNameById = new Map(
  (Array.isArray(runtimeCatalog.features) ? runtimeCatalog.features : [])
    .map((feature) => [feature.id, feature.name])
);
const decisionEntries = Array.isArray(decisions.decisions) ? decisions.decisions : [];
const decisionById = new Map(decisionEntries.map((entry) => [entry.id, entry]));
const featureById = new Map(barbarianFeatures.map((feature) => [feature.id, feature]));
const runtimeFeatureById = new Map(
  (Array.isArray(runtimeCatalog.features) ? runtimeCatalog.features : [])
    .map((feature) => [feature.id, feature])
);

const missingDecisions = barbarianFeatures
  .filter((feature) => !decisionById.has(feature.id))
  .map((feature) => feature.id);
const unknownDecisions = decisionEntries
  .filter((entry) => !featureById.has(entry.id))
  .map((entry) => entry.id);
if (missingDecisions.length || unknownDecisions.length) {
  throw new Error([
    missingDecisions.length ? `Decisioni mancanti: ${missingDecisions.join(", ")}` : "",
    unknownDecisions.length ? `Decisioni senza record Barbaro: ${unknownDecisions.join(", ")}` : "",
  ].filter(Boolean).join("\n"));
}

function runtimeDurationSignature(feature) {
  const duration = feature?.duration && typeof feature.duration === "object"
    ? feature.duration
    : {};
  const untilFeatureId = text(
    duration.untilFeatureId
      || duration.parentFeatureId
      || duration.endsWithFeatureId
  );
  if (untilFeatureId) return { kind: "until-feature", featureId: untilFeatureId };
  const timing = text(duration.timing).toLowerCase().replaceAll("_", "-");
  if (timing === "next-turn" || timing === "until-next-turn") {
    return { kind: "next-turn" };
  }
  if (timing === "next-turn-end" || timing === "until-next-turn-end") {
    return { kind: "next-turn-end" };
  }
  const rounds = Number(duration.rounds);
  if (Number.isFinite(rounds) && rounds > 0) {
    return {
      kind: Array.isArray(duration.endConditions) && duration.endConditions.length
        ? "rounds-with-end-conditions"
        : "rounds",
      rounds: Math.round(rounds),
    };
  }
  return { kind: "manual" };
}

const runtimeDurationRules = decisions.runtimeDurationRules
  && typeof decisions.runtimeDurationRules === "object"
  ? decisions.runtimeDurationRules
  : {};
const durationAudit = Object.entries(runtimeDurationRules).map(([id, expected]) => {
  const runtimeFeature = runtimeFeatureById.get(id);
  const actual = runtimeDurationSignature(runtimeFeature);
  const wanted = expected && typeof expected === "object" ? expected : {};
  const matches = !!runtimeFeature
    && actual.kind === text(wanted.kind)
    && (!wanted.featureId || actual.featureId === text(wanted.featureId));
  return {
    id,
    expected: wanted,
    actual,
    matches,
  };
});
const unknownDurationRules = Object.keys(runtimeDurationRules)
  .filter((id) => !featureById.has(id));
const automatedBarbarianIds = barbarianFeatures
  .filter((feature) => runtimeFeatureById.get(feature.id)?.runtimeSupport?.status === "implemented")
  .map((feature) => feature.id);
const missingDurationRules = automatedBarbarianIds
  .filter((id) => !Object.prototype.hasOwnProperty.call(runtimeDurationRules, id));
const nonMarkerDurationRules = Object.keys(runtimeDurationRules)
  .filter((id) => decisionById.get(id)?.mode !== "token_marker");
const durationMismatches = durationAudit.filter((entry) => !entry.matches);
if (
  unknownDurationRules.length
  || missingDurationRules.length
  || nonMarkerDurationRules.length
  || durationMismatches.length
) {
  throw new Error([
    unknownDurationRules.length
      ? `Regole durata senza record Barbaro: ${unknownDurationRules.join(", ")}`
      : "",
    missingDurationRules.length
      ? `Marker automatizzati senza regola durata: ${missingDurationRules.join(", ")}`
      : "",
    nonMarkerDurationRules.length
      ? `Regole durata assegnate a record non prioritari: ${nonMarkerDurationRules.join(", ")}`
      : "",
    durationMismatches.length
      ? `Durate runtime incoerenti: ${durationMismatches.map((entry) => `${entry.id} (${JSON.stringify(entry.actual)} != ${JSON.stringify(entry.expected)})`).join("; ")}`
      : "",
  ].filter(Boolean).join("\n"));
}

const runtimeConcentrationRules = decisions.runtimeConcentrationRules
  && typeof decisions.runtimeConcentrationRules === "object"
  ? decisions.runtimeConcentrationRules
  : {};
const concentrationAudit = Object.entries(runtimeConcentrationRules).map(([id, expected]) => ({
  id,
  expected: text(expected),
  actual: runtimeFeatureById.get(id)?.breaksConcentration === true ? "break" : "none",
  matches: text(expected) === "break" && runtimeFeatureById.get(id)?.breaksConcentration === true,
}));
const concentrationMismatches = concentrationAudit.filter((entry) => !entry.matches);
const automatedConcentrationIds = barbarianFeatures
  .filter((feature) => runtimeFeatureById.get(feature.id)?.breaksConcentration === true)
  .map((feature) => feature.id);
const missingConcentrationRules = automatedConcentrationIds
  .filter((id) => !Object.prototype.hasOwnProperty.call(runtimeConcentrationRules, id));
if (concentrationMismatches.length || missingConcentrationRules.length) {
  throw new Error([
    concentrationMismatches.length
      ? `Regole concentrazione incoerenti: ${concentrationMismatches.map((entry) => entry.id).join(", ")}`
      : "",
    missingConcentrationRules.length
      ? `Feature che interrompono concentrazione senza regola audit: ${missingConcentrationRules.join(", ")}`
      : "",
  ].filter(Boolean).join("\n"));
}

const features = barbarianFeatures
  .map((feature) => ({
    ...feature,
    sourceName: feature.name,
    name: runtimeNameById.get(feature.id) || feature.name,
    combatAudit: { ...decisionById.get(feature.id) },
  }))
  .sort((left, right) =>
    (left.subclassId || "").localeCompare(right.subclassId || "")
    || (left.minimumLevel || 99) - (right.minimumLevel || 99)
    || left.name.localeCompare(right.name, "it")
  );

const modeCounts = countBy(features, (feature) => feature.combatAudit.mode);
const subclassIds = unique(features.map((feature) => feature.subclassId));
const sourceIds = unique(features.map((feature) => feature.source));
const generatedOn = new Date().toISOString().slice(0, 10);

const output = {
  version: decisions.version,
  generatedOn,
  sourceAudit: {
    path: "data/class-features/class-feature-automation-audit.json",
    version: sourceAudit.version,
  },
  scope: {
    classId: decisions.classId,
    label: decisions.label,
    totalFeatures: features.length,
    subclassIds,
    sourceIds,
  },
  criteria: decisions.criteria,
  summary: {
    byMode: modeCounts,
    tokenMarkerCount: modeCounts.token_marker || 0,
    tokenMarkerReviewCount: modeCounts.token_marker_review || 0,
    instantEffectCount: modeCounts.instant_effect || 0,
    tableCount: modeCounts.tavolo || 0,
    coveredByParentCount: modeCounts.covered_by_parent || 0,
    actionableMarkerCount: (modeCounts.token_marker || 0) + (modeCounts.token_marker_review || 0),
  },
  durationAudit,
  concentrationAudit,
  features,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

const featureNameById = new Map(features.map((feature) => [feature.id, feature.name]));
const subclassLabel = (id) => decisions.subclasses[id] || id || "Capacità base del Barbaro";
const formatParent = (id) => id
  ? `${featureNameById.get(id) || id} (${id})`
  : "—";
const markerFeatures = features.filter((feature) => feature.combatAudit.mode === "token_marker");
const reviewFeatures = features.filter((feature) => feature.combatAudit.mode === "token_marker_review");

const summaryRows = [
  [MODE_LABELS.token_marker, modeCounts.token_marker || 0],
  [MODE_LABELS.token_marker_review, modeCounts.token_marker_review || 0],
  [MODE_LABELS.instant_effect, modeCounts.instant_effect || 0],
  [MODE_LABELS.tavolo, modeCounts.tavolo || 0],
  [MODE_LABELS.covered_by_parent, modeCounts.covered_by_parent || 0],
].map(([label, count]) => `| ${label} | ${count} |`);

function featureTable(rows) {
  return [
    "| Capacità | Livello | Esito | Bersaglio | Durata | Nota |",
    "|---|---:|---|---|---|---|",
    ...rows.map((feature) => {
      const audit = feature.combatAudit;
      return `| ${escapeMarkdown(feature.name)} | ${feature.minimumLevel || "—"} | ${MODE_LABELS[audit.mode]} | ${escapeMarkdown(audit.targetScope)} | ${escapeMarkdown(audit.duration)} | ${escapeMarkdown(audit.reason)} |`;
    }),
  ].join("\n");
}

const detailSections = subclassIds.map((subclassId) => {
  const rows = features.filter((feature) => (feature.subclassId || "") === subclassId);
  return [
    `### ${subclassLabel(subclassId)}`,
    "",
    featureTable(rows),
  ].join("\n");
});

const markdown = [
  "# Audit capacità del Barbaro",
  "",
  `Report generato il ${generatedOn} a partire dal catalogo meccanico generale (versione ${sourceAudit.version}).`,
  "",
  "## Obiettivo",
  "",
  "Questo audit guarda una capacità alla volta e chiede se, durante un combattimento, convenga applicare un promemoria su uno o più token. Non decide quali risorse consumare e non automatizza danni o guarigioni; gli HP temporanei fissi senza tiro possono invece essere applicati dal runtime.",
  "",
  "## Perimetro",
  "",
  `Sono stati esaminati **${features.length} record** del Barbaro base e dei ${subclassIds.length} Cammini presenti nei JSON: ${sourceIds.join(", ")}.`,
  "",
  "| Categoria | Record |",
  "|---|---:|",
  ...summaryRows,
  "",
  `Marker prioritari: **${markerFeatures.length}**. Marker da curare: **${reviewFeatures.length}**.`,
  "",
  "## Verifica durate runtime",
  "",
  "Le durate delle capacità automatizzate sono confrontate con regole dichiarative per evitare marker troppo lunghi o troppo brevi.",
  "",
  "| Capacità | Regola attesa | Runtime | Esito |",
  "|---|---|---|---|",
  ...durationAudit.map((entry) => `| ${escapeMarkdown(featureNameById.get(entry.id) || entry.id)} | ${escapeMarkdown(JSON.stringify(entry.expected))} | ${escapeMarkdown(JSON.stringify(entry.actual))} | ${entry.matches ? "OK" : "ERRORE"} |`),
  "",
  "## Verifica concentrazione",
  "",
  "Ira e le varianti legate a Ira devono chiudere la concentrazione del caster prima di lasciare attivo il marker.",
  "",
  "| Capacità | Regola | Runtime | Esito |",
  "|---|---|---|---|",
  ...concentrationAudit.map((entry) => `| ${escapeMarkdown(featureNameById.get(entry.id) || entry.id)} | ${escapeMarkdown(entry.expected)} | ${escapeMarkdown(entry.actual)} | ${entry.matches ? "OK" : "ERRORE"} |`),
  "",
  "## Candidati prioritari",
  "",
  markerFeatures.length
    ? featureTable(markerFeatures)
    : "Nessun candidato prioritario.",
  "",
  "## Criteri applicati",
  "",
  `- **Marker prioritario**: ${decisions.criteria.modeDefinitions.token_marker}`,
  `- **Marker da curare**: ${decisions.criteria.modeDefinitions.token_marker_review}`,
  `- **Effetto istantaneo**: ${decisions.criteria.modeDefinitions.instant_effect}`,
  `- **Gestione al tavolo**: ${decisions.criteria.modeDefinitions.tavolo}`,
  `- **Coperta da parent**: ${decisions.criteria.modeDefinitions.covered_by_parent}`,
  `- ${decisions.criteria.resourcePolicy}`,
  `- ${decisions.criteria.temporaryHpPolicy}`,
  "",
  "## Coda di revisione",
  "",
  reviewFeatures.length
    ? featureTable(reviewFeatures)
    : "Nessun marker da curare.",
  "",
  "## Dettaglio completo",
  "",
  ...detailSections.flatMap((section) => [section, ""]),
  "## Output e prossima decisione",
  "",
  "Il report non abilita automaticamente nuove capacità nel runtime. Il primo lotto implementabile è costituito dai marker prioritari; per quelli da curare occorre prima definire il comportamento UI per bersagli multipli, aure e scelte del Cammino.",
  "",
  "Il dettaglio macchina è disponibile in [barbaro-combat-audit.json](../data/class-features/barbaro-combat-audit.json).",
  "",
].join("\n");

fs.writeFileSync(MARKDOWN_PATH, markdown, "utf8");
console.log(JSON.stringify({
  totalFeatures: features.length,
  byMode: modeCounts,
  output: OUTPUT_PATH,
  markdown: MARKDOWN_PATH,
}));
