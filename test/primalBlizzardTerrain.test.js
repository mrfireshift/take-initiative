import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { bossProfileAuras } from "../src/bossAuraCore.js";
import { movementCostForSegment } from "../src/speedCheckCore.js";
import * as terrainCore from "../src/bossAuraTerrainCore.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const profile = await importBossActionHTML(html);
const auras = bossProfileAuras(profile);
const boss = { id: "auril", position: { x: 50, y: 50 }, metadata: { [META]: { attitude: "enemy", customAuras: auras } } };
const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
const target = (attitude) => ({ id: attitude, metadata: { [META]: { attitude } } });
const areas = (attitude = "pc", extra = {}) => terrainCore.activePrimalBlizzardTerrainAreas({
  items: [boss], target: target(attitude), boundsById: new Map([[boss.id, bounds]]),
  dpi: 100, scale: { multiplier: 1.5, unit: "m" }, gridOrigins: new Map([[boss.id, { x: 0, y: 0 }]]), ...extra,
});
const cost = (terrain, beforePosition, afterPosition, movedCells, extra = {}) => movementCostForSegment({
  terrainModifiers: terrain, beforePosition, afterPosition, movedCells, ...extra,
}).chargedCells;

test("Primal Blizzard prints and exposes difficult terrain without losing its other automation", async () => {
  const trait = profile.abilities.find((entry) => entry.name === "Primal Blizzard");
  assert.match(trait.rawText, /Terreno Difficile per i personaggi e i loro alleati/);
  assert.equal(trait.automation, "PARTIAL");
  assert.equal(trait.auras.length, 2);
  assert.match(auras.find((aura) => aura.name === "Primal Blizzard").pills[0].detail, /Terreno Difficile/);
  const old = html.replace(" L'area è Terreno Difficile per i personaggi e i loro alleati.", "");
  assert.equal((await importBossActionHTML(old)).abilities.find((entry) => entry.name === "Primal Blizzard").automation, "PARTIAL");
});

test("only PCs and allies pay extra, and only for the part inside the blizzard", () => {
  for (const attitude of ["pc", "ally"]) {
    const terrain = areas(attitude);
    assert.equal(terrain.length, 1, "the wind aura does not add another terrain source");
    assert.equal(cost(terrain, { x: 50, y: 50 }, { x: 350, y: 50 }, 3), 6);
    assert.equal(cost(terrain, { x: 50, y: 850 }, { x: 350, y: 850 }, 3), 3);
    assert.equal(cost(terrain, { x: 550, y: 50 }, { x: 850, y: 50 }, 3), 4.5);
    assert.equal(cost(terrain, { x: 850, y: 50 }, { x: 550, y: 50 }, 3), 4.5);
    assert.equal(cost([...terrain, ...terrain], { x: 50, y: 50 }, { x: 350, y: 50 }, 3), 6);
    assert.equal(cost(terrain, { x: 50, y: 50 }, { x: 350, y: 50 }, 3, { baseMultiplier: 2 }), 6);
  }
  for (const attitude of ["enemy", "neutral", ""]) assert.deepEqual(areas(attitude), []);
  assert.deepEqual(areas("pc", { target: { ...target("pc"), id: boss.id } }), []);
});

test("disabled, removed and unrelated auras create no terrain, even if a pill has the same name", () => {
  const withAuras = (customAuras) => [{ ...boss, metadata: { [META]: { customAuras } } }];
  assert.deepEqual(areas("pc", { items: withAuras(auras.map((aura) => ({ ...aura, enabled: false }))) }), []);
  assert.deepEqual(areas("pc", { items: withAuras([]) }), []);
  assert.deepEqual(areas("pc", { items: withAuras(auras.map((aura) => ({ ...aura, id: "user-aura" }))) }), []);
  assert.deepEqual(areas("pc", { movementImmunities: ["difficult-terrain"] }), []);
  assert.deepEqual(areas("pc", { boundsById: new Map() }), [], "missing source geometry is not guessed");
});

test("terrain uses the live radius, source bounds, footprint and scene scale", () => {
  const smallAura = auras.map((aura) => ({ ...aura, radiusMeters: 1.5 }));
  const items = [{ ...boss, metadata: { [META]: { customAuras: smallAura } } }];
  assert.equal(cost(areas("pc", { items }), { x: 250, y: 50 }, { x: 350, y: 50 }, 1), 1);
  const large = new Map([[boss.id, { min: { x: 0, y: 0 }, max: { x: 300, y: 300 } }]]);
  assert.equal(cost(areas("pc", { items, boundsById: large }), { x: 250, y: 150 }, { x: 350, y: 150 }, 1), 2);
  const moved = new Map([[boss.id, { min: { x: 2000, y: 0 }, max: { x: 2100, y: 100 } }]]);
  const translated = areas("pc", { boundsById: moved, gridOrigins: new Map([[boss.id, { x: 2000, y: 0 }]]) });
  assert.equal(cost(translated, { x: 50, y: 50 }, { x: 350, y: 50 }, 3), 3);
  assert.equal(cost(translated, { x: 2050, y: 50 }, { x: 2350, y: 50 }, 3), 6);
  assert.deepEqual(areas("pc", { items, scale: { multiplier: 5, unit: "ft" } }).map((entry) => entry.area.cells),
    areas("pc", { items }).map((entry) => entry.area.cells));
});
