import {
  getAreaSaveSpellOptions,
  getSpellCatalog,
  getSpellDefinition,
  getTrackableSpellOptions,
} from "./spells-srd.js";
import { buildSpellUnifiedPanelContract } from "./spellUnifiedPanelCore.js";

export const SPELL_UNIFIED_CATALOG_SOURCES = Object.freeze({
  SPELLS_PANEL: "legacy-spells-panel",
  AREA_CONSOLE: "legacy-area-console",
});

const EXECUTORS_BY_LANE = Object.freeze({
  "spell-lifecycle": "spellApplicationExecutor",
  "area-transaction": "spellAreaResolutionExecutor",
  "active-resolution": "spellActiveResolution",
});

function text(value) {
  return String(value ?? "").trim();
}

function canonicalSpellId(value) {
  const definition = getSpellDefinition(value);
  return text(definition?.id) || text(value);
}

function sourceList(sources = null) {
  if (sources && typeof sources === "object") {
    return [
      [SPELL_UNIFIED_CATALOG_SOURCES.SPELLS_PANEL, sources.spells],
      [SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE, sources.area],
    ];
  }
  return [
    [SPELL_UNIFIED_CATALOG_SOURCES.SPELLS_PANEL, getTrackableSpellOptions()],
    [SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE, getAreaSaveSpellOptions()],
  ];
}

function contractFor(id, contractBuilder) {
  try {
    return typeof contractBuilder === "function"
      ? contractBuilder({ spellId: id })
      : null;
  } catch {
    return null;
  }
}

function flagsFor(entry, contract) {
  const presentation = contract?.presentation || {};
  const execution = contract?.execution || {};
  const inputs = presentation.inputs || {};
  const capabilities = presentation.capabilities || {};
  return {
    concentration: entry.concentration === true
      || contract?.spell?.concentration === true,
    automated: entry.automated === true
      || capabilities.automation?.available === true,
    targeting: presentation.targeting?.mode !== "none",
    placement: presentation.placement?.policy !== "unavailable",
    active: Array.isArray(presentation.activeActions)
      && presentation.activeActions.length > 0,
    manual: capabilities.manualSpellEffect?.available === true,
    healing: inputs.healing?.visible === true,
    outcomes: inputs.outcomes?.visible === true,
    zone: execution.hasZones === true,
    token: execution.hasTokens === true,
  };
}

function normalizedEntry(entry, source, contractBuilder) {
  const id = canonicalSpellId(entry?.id);
  if (!id) return null;
  const spell = getSpellDefinition(id);
  const contract = contractFor(id, contractBuilder);
  const lane = text(contract?.execution?.lane) || null;
  const sources = [source];
  return {
    key: id,
    label: text(spell?.catalogLabel || spell?.displayName)
      || text(entry?.label || entry?.value)
      || id,
    level: Number.isFinite(Number(spell?.level))
      ? Number(spell.level)
      : Number.isFinite(Number(entry?.level))
        ? Number(entry.level)
        : null,
    source: text(spell?.sourceTitle || spell?.source || entry?.source),
    sources,
    flags: flagsFor(entry || {}, contract),
    contractAvailable: !!contract,
    lane,
    targetingMode: text(contract?.presentation?.targeting?.mode) || null,
    executor: EXECUTORS_BY_LANE[lane] || null,
    status: !contract
      ? "mancante"
      : contract.presentation?.capabilities?.manualSpellEffect?.available === true
        ? "manuale"
        : "operativo",
  };
}

function mergeEntry(target, entry) {
  if (!target) return entry;
  const sources = [...new Set([...(target.sources || []), ...(entry.sources || [])])];
  return {
    ...target,
    sources,
    flags: Object.fromEntries(Object.entries(target.flags || {}).map(([key, value]) => [
      key,
      value === true || entry.flags?.[key] === true,
    ])),
    contractAvailable: target.contractAvailable || entry.contractAvailable,
    lane: target.lane || entry.lane,
    targetingMode: target.targetingMode || entry.targetingMode,
    executor: target.executor || entry.executor,
    status: target.status === "mancante" && entry.status !== "mancante"
      ? entry.status
      : target.status,
  };
}

export function buildSpellUnifiedCatalogEntries({
  sources = null,
  contractBuilder = buildSpellUnifiedPanelContract,
} = {}) {
  const entriesById = new Map();
  for (const [source, entries] of sourceList(sources)) {
    for (const rawEntry of Array.isArray(entries) ? entries : []) {
      const entry = normalizedEntry(rawEntry, source, contractBuilder);
      if (!entry) continue;
      entriesById.set(entry.key, mergeEntry(entriesById.get(entry.key), entry));
    }
  }
  return [...entriesById.values()];
}

export function buildSpellUnifiedCatalogSourceStats(sources = null) {
  const sourceEntries = sourceList(sources);
  const bySource = Object.fromEntries(sourceEntries.map(([source, entries]) => [
    source,
    new Set((Array.isArray(entries) ? entries : [])
      .map((entry) => canonicalSpellId(entry?.id))
      .filter(Boolean)),
  ]));
  const spellIds = bySource[SPELL_UNIFIED_CATALOG_SOURCES.SPELLS_PANEL] || new Set();
  const areaIds = bySource[SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE] || new Set();
  const union = new Set([...spellIds, ...areaIds]);
  return {
    spellsPanel: spellIds.size,
    areaConsole: areaIds.size,
    intersection: [...spellIds].filter((id) => areaIds.has(id)).length,
    union: union.size,
  };
}

export function buildSpellUnifiedCatalogAudit({
  sources = null,
  fullCatalog = getSpellCatalog(),
  currentEntries = null,
  contractBuilder = buildSpellUnifiedPanelContract,
} = {}) {
  const legacyEntries = buildSpellUnifiedCatalogEntries({ sources, contractBuilder });
  const legacyById = new Map(legacyEntries.map((entry) => [entry.key, entry]));
  const current = currentEntries || legacyEntries;
  const currentIds = new Set(current.map((entry) => canonicalSpellId(entry?.key || entry?.id)));
  const rows = [];
  const seen = new Set();

  for (const spell of Array.isArray(fullCatalog) ? fullCatalog : []) {
    const id = canonicalSpellId(spell?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const entry = legacyById.get(id);
    const duplicated = (entry?.sources || []).length > 1;
    rows.push({
      spellId: id,
      name: text(spell?.catalogLabel || spell?.displayName) || id,
      sources: [...(entry?.sources || [])],
      presentPreviously: !!entry,
      presentCurrent: currentIds.has(id),
      lane: entry?.lane || null,
      targetingMode: entry?.targetingMode || null,
      executor: entry?.executor || null,
      status: !entry
        ? "escluso intenzionalmente"
        : entry.status,
      duplicate: duplicated,
      exclusionReason: !entry
        ? "Non esposto nei due pannelli legacy analizzati; escluso per non aggiungere il catalogo generale."
        : !currentIds.has(id)
          ? "Record esposto in precedenza ma assente dal catalogo unificato corrente."
          : "",
      correction: !entry
        ? "Nessuna: resta fuori perimetro finché non viene esposto da una fonte UI autorizzata."
        : !currentIds.has(id)
          ? "Reinserire nella composizione per ID canonico."
          : duplicated
            ? "Deduplicare per ID stabile mantenendo entrambe le provenienze."
            : "Nessuna correzione necessaria.",
    });
  }

  for (const entry of legacyEntries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    rows.push({
      spellId: entry.key,
      name: entry.label,
      sources: [...entry.sources],
      presentPreviously: true,
      presentCurrent: currentIds.has(entry.key),
      lane: entry.lane,
      targetingMode: entry.targetingMode,
      executor: entry.executor,
      status: entry.status,
      duplicate: entry.sources.length > 1,
      exclusionReason: currentIds.has(entry.key)
        ? ""
        : "Fonte legacy senza definizione nel catalogo generale.",
      correction: currentIds.has(entry.key)
        ? entry.sources.length > 1
          ? "Deduplicare per ID stabile mantenendo entrambe le provenienze."
          : "Nessuna correzione necessaria."
        : "Aggiungere un adapter sottile o dichiarare il blocco prima di esporre il record.",
    });
  }
  return rows;
}

export function buildSpellUnifiedCatalogExclusions(options = {}) {
  return buildSpellUnifiedCatalogAudit(options)
    .filter((row) => row.status === "escluso intenzionalmente")
    .map((row) => row.spellId);
}
