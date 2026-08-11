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
  getSpellCatalog,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

test("il catalogo unificato coincide con l'unione deduplicata delle due fonti legacy", () => {
  const spellsPanelIds = new Set(getTrackableSpellOptions().map((entry) => entry.id));
  const areaConsoleIds = new Set(getAreaSaveSpellOptions().map((entry) => entry.id));
  const expectedIds = new Set([...spellsPanelIds, ...areaConsoleIds]);
  const entries = buildSpellUnifiedCatalogEntries();
  const actualIds = entries.map((entry) => entry.key);

  assert.equal(new Set(actualIds).size, actualIds.length);
  assert.deepEqual(new Set(actualIds), expectedIds);
  assert.deepEqual(buildSpellUnifiedCatalogSourceStats(), {
    spellsPanel: spellsPanelIds.size,
    areaConsole: areaConsoleIds.size,
    intersection: [...spellsPanelIds].filter((id) => areaConsoleIds.has(id)).length,
    union: expectedIds.size,
  });
  assert.equal(entries.length, 391);
  assert.equal(entries.filter((entry) => entry.sources.length > 1).length, 110);
});

test("i record recuperati dalla Console area mantengono lane e contratto", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  const recovered = entries.filter((entry) => (
    entry.sources.length === 1
      && entry.sources[0] === SPELL_UNIFIED_CATALOG_SOURCES.AREA_CONSOLE
  ));
  assert.equal(recovered.length, 33);
  for (const id of ["fireball", "chain-lightning", "mass-cure-wounds"]) {
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

test("gli 86 record del catalogo generale non esposti restano esclusioni esplicite", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  const exclusions = buildSpellUnifiedCatalogExclusions({ currentEntries: entries });
  const audit = buildSpellUnifiedCatalogAudit({ currentEntries: entries });
  assert.equal(exclusions.length, getSpellCatalog().length - entries.length);
  assert.equal(exclusions.length, 86);
  assert.ok(exclusions.includes("acid-splash"));
  assert.equal(entries.some((entry) => entry.key === "acid-splash"), false);
  const excludedRow = audit.find((row) => row.spellId === "acid-splash");
  assert.equal(excludedRow.status, "escluso intenzionalmente");
  assert.equal(excludedRow.presentPreviously, false);
  assert.equal(excludedRow.presentCurrent, false);
  assert.match(excludedRow.exclusionReason, /Non esposto/);
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
