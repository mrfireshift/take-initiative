// Combat snapshot: read-only photograph of tracker state, Combat Log entry and schematic board SVG.
import assert from "node:assert/strict";
import test from "node:test";

import {
  COMBAT_SNAPSHOT_FORMAT,
  buildCombatSnapshot,
  buildCombatSnapshotSvg,
  combatSnapshotBoardView,
  combatSnapshotFileName,
  combatSnapshotLogEvent,
  combatSnapshotSummaryText,
} from "../src/combatSnapshotCore.js";

const ID = "com.thebigpicture.initiative";
const META = `${ID}/meta`;
const DPI = 100;

function token(id, name, meta, extra = {}) {
  return {
    id,
    name,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x: 250, y: 250 },
    scale: { x: 1, y: 1 },
    image: { width: 300, height: 300, url: `https://assets.example/${id}.png`, mime: "image/png" },
    grid: { dpi: 300, offset: { x: 150, y: 150 } },
    metadata: { [META]: meta },
    ...extra,
  };
}

function fixture() {
  const arannis = token("pc-1", "Arannis", {
    hp: 18,
    hpMax: 30,
    initiative: 17,
    attitude: "pc",
    conditions: {
      instances: [
        { id: "c1", condition: "Avvelenato", sourceName: "Ragno", expiry: { mode: "rounds", remaining: 2 } },
        { id: "c2", condition: "Benedizione", displayLabel: "Benedetto", effectKind: "buff", expiry: { mode: "concentration" },
          mechanics: { damageDefenses: { resistances: ["fire"] } } },
        { id: "c3", condition: "Spento", active: false },
      ],
    },
    [`${ID}/concentration`]: { benedizione: { name: "Benedizione", instanceId: "spell-bless", spellId: "bless", targets: ["pc-1", "gob-1"] } },
    classFeatureState: {
      resources: { "ki-pool": { current: 2, maximum: 5 } },
      instances: [{ instanceId: "f1", featureId: "rage", startedRound: 2, expiresRound: 5 }],
    },
  });
  const goblin = token("gob-1", "Goblin", {
    hp: 0,
    hpMax: 7,
    initiative: 12,
    attitude: "enemy",
    initiativeCard: { damageDefenses: { immunities: ["poison"] } },
    [`${ID}/spells`]: [
      { instanceId: "spell-hold", spellId: "hold-person", name: "Blocca persone", casterId: "pc-1", turns: 3, conc: true },
    ],
  }, { position: { x: 450, y: 250 } });
  arannis.metadata[META][`${ID}/spells`] = [
    { instanceId: "spell-bless", spellId: "bless", name: "Benedizione", casterId: "pc-1", turns: 9, conc: true },
  ];
  goblin.metadata[META][`${ID}/spells`].push(
    { instanceId: "spell-bless", spellId: "bless", name: "Benedizione", casterId: "pc-1", turns: 9, conc: true },
  );
  const map = {
    id: "map-1",
    name: "Caverna",
    type: "IMAGE",
    layer: "MAP",
    visible: true,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    image: { width: 2000, height: 1000, url: "https://files.example/cave.webp", mime: "image/webp" },
    grid: { dpi: 200, offset: { x: 0, y: 0 } },
    metadata: {},
  };
  const aura = {
    id: "aura-1",
    type: "SHAPE",
    layer: "ATTACHMENT",
    position: { x: 250, y: 250 },
    metadata: { [`${ID}/customAura`]: { instanceId: "pc-1:a1", auraId: "a1", sourceId: "pc-1", name: "Aura di protezione", radiusMeters: 3, sizeCells: 5, strokeColor: "#38bdf8" } },
  };
  const zone = {
    id: "zone-1",
    type: "CURVE",
    layer: "DRAWING",
    position: { x: 0, y: 0 },
    metadata: {
      [`${ID}/spellStaticZone`]: { version: 1, instanceId: "spell-web", spellId: "web", ruleId: "web-cube", casterId: "pc-1", role: "root", targetIds: ["gob-1"] },
      [`${ID}/aoeArea`]: { type: "square", start: { x: 500, y: 500 }, end: { x: 800, y: 800 }, dpi: DPI, basePosition: { x: 0, y: 0 } },
    },
  };
  const summon = {
    id: "obj-1",
    name: "Oggetto animato",
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x: 650, y: 250 },
    scale: { x: 1, y: 1 },
    image: { width: 100, height: 100, url: "/x.webp", mime: "image/webp" },
    grid: { dpi: 100, offset: { x: 50, y: 50 } },
    metadata: {
      [`${ID}/spellBoardToken`]: { kind: "spell-board-token", instanceId: "spell-animate", spellId: "animate-objects", casterId: "pc-1", objectSize: "medium" },
      [META]: { hp: 10, hpMax: 20 },
    },
  };
  return {
    state: { round: 3, current: 1, order: ["__LAIR__", "pc-1", "gob-1", "missing-1"] },
    items: [map, arannis, goblin, aura, zone, summon],
    grid: { dpi: DPI, scale: { parsed: { multiplier: 1.5, unit: "m" } }, type: "SQUARE" },
  };
}

const features = new Map([["rage", { name: "Ira" }]]);
const pools = new Map([["ki-pool", { name: "Punti ki" }]]);

function snapshot() {
  return buildCombatSnapshot({
    ...fixture(),
    capturedAt: Date.UTC(2026, 9, 17, 18, 30, 5),
    roomId: "room-1",
    featureLookup: (id) => features.get(id) || null,
    poolLookup: (id) => pools.get(id) || null,
  });
}

test("snapshot keeps round, order with virtual ids and the active turn", () => {
  const value = snapshot();
  assert.equal(value.format, COMBAT_SNAPSHOT_FORMAT);
  assert.equal(value.round, 3);
  assert.deepEqual(value.turn, { index: 1, activeId: "pc-1", activeName: "Arannis" });
  assert.deepEqual(value.order.map((entry) => [entry.id, entry.virtual, entry.initiative]), [
    ["__LAIR__", true, null],
    ["pc-1", false, 17],
    ["gob-1", false, 12],
    ["missing-1", false, null],
  ]);
  assert.equal(value.order[0].name, "Azioni di Tana");
  assert.equal(value.order[3].missing, true);
});

test("actors carry HP, faction, effects with remaining duration, effective defenses and concentration", () => {
  const [arannis, goblin, missing] = snapshot().actors;
  assert.equal(arannis.hp, 18);
  assert.equal(arannis.hpMax, 30);
  assert.equal(arannis.faction, "PG");
  assert.equal(arannis.sizeCells, 1);
  assert.deepEqual(arannis.conditions.map((entry) => [entry.label, entry.remainingText]), [
    ["Avvelenato", "2 round"],
    ["Benedetto", "concentrazione"],
  ]);
  assert.equal(arannis.conditions[0].source, "Ragno");
  // The buff's fire resistance is part of the effective defenses; the profile is not rewritten.
  assert.deepEqual(arannis.damageDefenses.resistances, ["fire"]);
  assert.deepEqual(arannis.concentration, [{ spell: "Benedizione", spellId: "bless", instanceId: "spell-bless", targetIds: ["pc-1", "gob-1"] }]);
  assert.deepEqual(arannis.classFeatures.active.map((entry) => [entry.name, entry.remainingRounds]), [["Ira", 3]]);
  assert.deepEqual(arannis.classFeatures.resources, [
    { poolId: "ki-pool", name: "Punti ki", current: 2, maximum: 5, unlimited: false },
  ]);
  assert.equal(goblin.faction, "Nemico");
  assert.deepEqual(goblin.damageDefenses.immunities, ["poison"]);
  assert.equal(goblin.damageDefenses.resistances.length, 0);
  assert.deepEqual(missing, { id: "missing-1", missing: true });
});

test("active spells are merged per instance with caster, bearers and duration", () => {
  const spells = snapshot().spells;
  const bless = spells.find((entry) => entry.instanceId === "spell-bless");
  assert.equal(bless.casterName, "Arannis");
  assert.deepEqual(bless.targetNames, ["Arannis", "Goblin"]);
  assert.equal(bless.remainingText, "9 round rimanenti");
  assert.equal(bless.concentration, true);
  const hold = spells.find((entry) => entry.instanceId === "spell-hold");
  assert.deepEqual(hold.targetIds, ["gob-1"]);
});

test("zones, auras, summons and map backgrounds are collected", () => {
  const value = snapshot();
  assert.equal(value.zones.length, 1);
  assert.equal(value.zones[0].casterName, "Arannis");
  assert.equal(value.zones[0].areaType, "square");
  assert.ok(value.zones[0].cells.length > 0);
  assert.deepEqual(value.auras.map((entry) => [entry.kind, entry.name, entry.sourceName]), [
    ["custom", "Aura di protezione", "Arannis"],
  ]);
  assert.equal(value.summons.length, 1);
  assert.equal(value.summons[0].hp, 10);
  assert.equal(value.summons[0].hpMax, 20);
  assert.equal(value.summons[0].casterName, "Arannis");
  assert.deepEqual(value.board.backgrounds.map((entry) => entry.url), ["https://files.example/cave.webp"]);
  assert.deepEqual(value.board.scale, { multiplier: 1.5, unit: "m" });
});

test("snapshot is JSON-safe and the input metadata is untouched", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const value = buildCombatSnapshot(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test("summary, file name and Combat Log entry", () => {
  const value = snapshot();
  const summary = combatSnapshotSummaryText(value);
  assert.match(summary, /^Round 3 · turno di Arannis/u);
  assert.match(summary, /Arannis 18\/30/u);
  assert.match(summary, /Goblin 0\/7/u);
  assert.match(combatSnapshotFileName(value, "png"), /^snapshot-round3-\d{8}-\d{6}\.png$/u);
  const event = combatSnapshotLogEvent(value);
  assert.equal(event.kind, "combat-snapshot");
  assert.equal(event.category, "roster");
  assert.equal(event.payload.summary, summary);
  assert.equal(event.payload.snapshot, value);
});

test("board view follows the map image, and the SVG links it and escapes text", () => {
  const value = snapshot();
  const view = combatSnapshotBoardView(value);
  // Map: 2000x1000 px at 200 dpi on a 100 dpi scene = 1000x500 scene units, plus a cell of margin.
  assert.equal(view.minX, -100);
  assert.equal(view.width, 1200);
  assert.equal(view.height, 700 + view.header);
  value.actors[1].name = "Goblin <capo> & co";
  const svg = buildCombatSnapshotSvg(value);
  assert.match(svg, /^<svg /u);
  assert.match(svg, /href="https:\/\/files\.example\/cave\.webp"/u);
  assert.match(svg, /Goblin &lt;capo&gt; &amp; co 0\/7/u);
  assert.match(svg, /stroke="#facc15"/u);
  const withoutMap = buildCombatSnapshotSvg(value, { includeBackground: false, baseFill: false });
  assert.doesNotMatch(withoutMap, /cave\.webp/u);
});

test("without a map the view frames tokens, zones and auras", () => {
  const value = snapshot();
  value.board.backgrounds = [];
  const view = combatSnapshotBoardView(value);
  assert.ok(view.minX <= 250 - 250 - DPI);
  assert.ok(view.minX + view.width >= 800 + DPI);
});

test("the Combat Log shows the snapshot summary as an Incontro entry", async () => {
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  const entry = combatSnapshotLogEvent(snapshot());
  const model = buildCombatLogPresentation(
    { id: "session-1", name: "Registro" },
    [{ id: "event-1", sequence: 1, at: 1_700_000_000_000, round: 3, ...entry }],
  );
  assert.equal(model.events[0].category, "roster");
  assert.equal(model.events[0].summary, entry.payload.summary);
});
