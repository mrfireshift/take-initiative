import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpellUnifiedCatalogAudit,
  buildSpellUnifiedCatalogEntries,
  buildSpellUnifiedCatalogExclusions,
  buildSpellUnifiedCatalogSourceStats,
  SPELL_UNIFIED_CATALOG_SOURCES,
} from "../src/spellUnifiedPanelCatalogCore.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import {
  getAreaSaveSpellOptions,
  getRecordOnlySpellOptions,
  getSpellCatalog,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

test("il catalogo unificato coincide con l'unione deduplicata delle due fonti legacy e delle spell registrate", () => {
  const spellsPanelIds = new Set(getTrackableSpellOptions().map((entry) => entry.id));
  const areaConsoleIds = new Set(getAreaSaveSpellOptions().map((entry) => entry.id));
  const recordIds = new Set(getRecordOnlySpellOptions().map((entry) => entry.id));
  const expectedIds = new Set([...spellsPanelIds, ...areaConsoleIds, ...recordIds]);
  const entries = buildSpellUnifiedCatalogEntries();
  const actualIds = entries.map((entry) => entry.key);

  assert.equal(new Set(actualIds).size, actualIds.length);
  assert.deepEqual(new Set(actualIds), expectedIds);
  assert.deepEqual(buildSpellUnifiedCatalogSourceStats(), {
    spellsPanel: spellsPanelIds.size,
    areaConsole: areaConsoleIds.size,
    castRecord: recordIds.size,
    intersection: [...spellsPanelIds].filter((id) => areaConsoleIds.has(id)).length,
    union: expectedIds.size,
  });
  // The spells the plugin only records are neither tracked nor placed: a source of their own, never duplicated.
  assert.equal(recordIds.size, 84);
  assert.equal([...recordIds].some((id) => spellsPanelIds.has(id) || areaConsoleIds.has(id)), false);
  assert.equal(entries.length, getSpellCatalog().length);
  assert.equal(entries.length, 477);
  assert.equal(
    entries.filter((entry) => entry.sources.length > 1).length,
    [...spellsPanelIds].filter((id) => areaConsoleIds.has(id)).length,
  );
});

test("i record recuperati dalla Console area mantengono lane e contratto", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  const recovered = entries.filter((entry) => (
    entry.sources.length === 1
      && entry.sources[0] === SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE
  ));
  assert.equal(recovered.length, 35);
  for (const id of ["fireball", "chain-lightning", "mass-cure-wounds", "misty-step"]) {
    const entry = entries.find((candidate) => candidate.key === id);
    assert.ok(entry, id);
    assert.equal(entry.contractAvailable, true, id);
    assert.equal(entry.lane, "area-transaction", id);
  }
});

test("ogni voce esposta ha un ID stabile, contratto e executor dichiarato", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  assert.equal(entries.every((entry) => entry.key && entry.contractAvailable), true);
  assert.equal(entries.every((entry) => entry.executor), true);
  assert.equal(entries.some((entry) => entry.flags.manual), true);
  assert.equal(entries.some((entry) => entry.flags.healing), true);
  for (const entry of entries) {
    const contract = buildSpellUnifiedPanelContract({ spellId: entry.key });
    assert.ok(contract, entry.key);
  }
});

test("gli 84 record non automatizzati sono esposti come registrazione del lancio, nessuno resta escluso", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  const exclusions = buildSpellUnifiedCatalogExclusions({ currentEntries: entries });
  const audit = buildSpellUnifiedCatalogAudit({ currentEntries: entries });
  assert.equal(exclusions.length, getSpellCatalog().length - entries.length);
  assert.deepEqual(exclusions, []);
  const recorded = entries.filter((entry) => entry.status === "registrazione");
  assert.equal(recorded.length, 84);
  for (const id of ["counterspell", "cure-wounds", "wish", "acid-splash"]) {
    const entry = entries.find((candidate) => candidate.key === id);
    assert.ok(entry, id);
    assert.deepEqual(entry.sources, [SPELL_UNIFIED_CATALOG_SOURCES.CAST_RECORD], id);
    assert.equal(entry.lane, "spell-lifecycle", id);
    assert.equal(entry.status, "registrazione", id);
  }
  const recordedRow = audit.find((row) => row.spellId === "acid-splash");
  assert.equal(recordedRow.status, "registrazione");
  assert.equal(recordedRow.presentPreviously, true);
  assert.equal(recordedRow.presentCurrent, true);
  assert.equal(recordedRow.exclusionReason, "");
});

test("la matrice audit distingue duplicati, lane, targeting e correzione", () => {
  const rows = buildSpellUnifiedCatalogAudit({
    currentEntries: buildSpellUnifiedCatalogEntries(),
  });
  const fireball = rows.find((row) => row.spellId === "fireball");
  assert.equal(fireball.status, "operativo");
  assert.equal(fireball.duplicate, false);
  assert.equal(fireball.lane, "area-transaction");
  assert.equal(fireball.targetingMode, "geometric");
  assert.equal(fireball.executor, "spellAreaResolutionExecutor");
  assert.equal(fireball.presentPreviously, true);
  assert.equal(fireball.presentCurrent, true);

  const overlap = rows.find((row) => row.spellId === "bane");
  assert.equal(overlap.duplicate, true);
  assert.deepEqual(new Set(overlap.sources), new Set([
    SPELL_UNIFIED_CATALOG_SOURCES.SPELLS_PANEL,
    SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE,
  ]));
  assert.match(overlap.correction, /Deduplicare/);
});
