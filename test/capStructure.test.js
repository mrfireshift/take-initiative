// CAP-STRUCTURE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, decisions D1–D8 of 6/11/2026). The expectations are read from the
// 2014 texts and the Dungeon Master's Guide's objects: Wall of Stone has ten panels, AC 15 and 30 hit points per inch
// (6 inches, or 3 inches as 10-by-20-foot panels); Wall of Ice ten panels of 30 hit points, AC 12, vulnerable to fire,
// a destroyed one leaving frigid air; objects are immune to poison and psychic damage. Bones of the Earth (Xanathar) raises
// up to six pillars of 5 feet, two more for each slot above the 6th, AC 5 and 30 hit points, crumbling into rubble that
// is difficult terrain 10 feet around; a creature under one saves on Dexterity or is lifted, and a ceiling deals 6d6
// bludgeoning and restrains it.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
const items = new Map();
const mutationCalls = [];
const clone = (value) => (value === undefined ? undefined : structuredClone(value));
let builtItems = 0;

// buildPath().commands(…)….build(): every call records its value, build() gives the item.
function chainable() {
  const data = {};
  const proxy = new Proxy({}, {
    get: (_, key) => (key === "build"
      ? () => ({ id: `built-${++builtItems}`, type: "PATH", ...clone(data) })
      : (value) => { data[key] = value; return proxy; }),
  });
  return proxy;
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "cap-structure-room", getMetadata: async () => ({}) },
      player: { getRole: async () => "GM", onChange: () => () => {} },
      scene: {
        isReady: async () => true,
        getMetadata: async () => ({}),
        onMetadataChange: () => () => {},
        items: {
          getItems: async (ids) => (Array.isArray(ids)
            ? ids.map((id) => items.get(id)).filter(Boolean)
            : [...items.values()]).map(clone),
          getItemBounds: async () => ({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 }, center: { x: 50, y: 50 } }),
          onChange: () => () => {},
        },
        grid: {
          getDpi: async () => 100,
          getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
          snapPosition: async (position) => position,
        },
        local: { getItems: async () => [], addItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} },
      },
      broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
      popover: { open: async () => {}, close: async () => {} },
    },
    buildPath: chainable,
    buildLabel: chainable,
    buildImage: chainable,
    buildText: chainable,
    buildShape: chainable,
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations, options });
      return { status: "applied", committed: true, changedIds: ["caster"], historyEntryId: "history-1", undoAvailable: true };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
    getEffectsMutationSceneContext: async () => ({ sceneIdentity: "scene-1" }),
  },
});

const {
  getSpellStructureRule,
  planSpellStructureSegmentChange,
  spellStructureInitialState,
  spellStructureResiduePreview,
  spellStructureSegments,
  spellStructureSummaryParts,
  spellStructureWallSegments,
} = await import("../src/spellStructureCore.js");
const { buildArea } = await import("../src/aoeGeometryCore.js");
const { getSpellAreaRuleById, getSpellAreaRuleForPlacement, validateSpellAreaRule } = await import("../src/spellAreaRules.js");
const { buildStaticSpellZoneItems } = await import("../src/spellStaticZone.js");
const { getAreaSaveAutomation, getSpellDefinition, getSpellSummaryParts } = await import("../src/spells-srd.js");
const { createSpellMultiAreaRuntime, spellMultiAreaConfirmProblem, spellMultiAreaMessage, spellMultiAreaSpec } = await import("../src/spellMultiAreaCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellActiveResolutionPayload, validateSpellActiveResolutionAction } = await import("../src/spellActiveResolutionCore.js");
const { getSpellActiveResolutionActions } = await import("../src/spellActiveResolutionRules.js");
const { executeSpellActiveResolution } = await import("../src/spellApplicationExecutor.js");
const { validateChildZoneContainment } = await import("../src/spellChildZoneCore.js");

// A line of `cells` squares from (0, 0), at 100 pixels a square.
const line = (cells) => ({ type: "line", start: { x: 0, y: 50 }, end: { x: cells * 100, y: 50 }, dpi: 100, gridOrigin: { x: 0, y: 0 } });
// Bones of the Earth's shapes: one cell for each pillar, drawn from a grid corner (column, row) towards (dx, dy).
const pillarAt = (column, row, dx = 1, dy = 1) => {
  const start = { x: column * 100, y: row * 100 };
  return { start, end: { x: start.x + dx * 100, y: start.y + dy * 100 } };
};
const pillarsPreview = (shapes) => ({ type: "square", ...shapes[0], dpi: 100, gridOrigin: { x: 0, y: 0 }, areas: shapes,
  targetIds: [] });
// The built items of one child kind: the segments, or the track and the fill of their bars.
const ofKind = (built, childKind) => built.filter((item) => item.metadata?.[STATIC_ZONE_KEY]?.childKind === childKind);
const barOf = (built, childKind, index) => built.find((item) => item.metadata?.[STATIC_ZONE_KEY]?.childKind === childKind
  && item.metadata[STATIC_ZONE_KEY].childIndex === index);

test("A wall's panels along its line: 3 m tracts, or 6 m for the thin stone panels, never more than ten", () => {
  assert.equal(spellStructureWallSegments(line(20), { panelMeters: 3 }).length, 10, "30 m: ten panels");
  assert.equal(spellStructureWallSegments(line(10), { panelMeters: 3 }).length, 5, "a shorter line holds fewer panels");
  assert.equal(spellStructureWallSegments(line(40), { panelMeters: 3 }).length, 10, "never more than the spell's ten");
  const [first, second] = spellStructureWallSegments(line(20), { panelMeters: 3 });
  assert.deepEqual([first.preview.start, first.preview.end, second.preview.start], [{ x: 0, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 50 }]);
  const stone = getSpellStructureRule("wall-of-stone");
  assert.equal(spellStructureSegments(stone, line(40), "thin").length, 10, "60 m of 6 m panels");
  assert.equal(spellStructureSegments(stone, line(20), "thin").length, 5);
  assert.deepEqual(spellStructureInitialState(stone, spellStructureSegments(stone, line(20), "thick"), "thick").segments[0],
    { index: 1, hp: 180, hpMax: 180 }, "6 inches of stone: 180 hit points");
  assert.equal(spellStructureInitialState(stone, spellStructureSegments(stone, line(40), "thin"), "thin").segments[0].hp, 90);
});

// Found in the room on 7/11/2026: with the corner of the whole wall, an area looks for its cells only a few squares
// around it, and the panels beyond the third were drawn with no cell at all. Each piece has its own corner, on the same
// grid, and the panels cover the wall's cells once each, in any direction.
test("Every panel, every pillar and every rubble has its cells, however far from the start of the cast", () => {
  const cellsOf = (g) => buildArea(g.type, g.start, g.end, g.dpi, g.gridOrigin, { widthSquares: g.widthSquares, widthAnchor: g.widthAnchor }).cells
    .map((cell) => `${Math.round(cell.x)},${Math.round(cell.y)}`);
  const stone = getSpellStructureRule("wall-of-stone");
  for (const [direction, cells, choice] of [[{ x: 1, y: 0 }, 20, "thick"], [{ x: 0, y: -1 }, 20, "thick"], [{ x: -1, y: 5 }, 20, "thick"], [{ x: 1, y: 1 }, 20, "thick"], [{ x: -1, y: 5 }, 40, "thin"]]) {
    const length = Math.hypot(direction.x, direction.y);
    // From a grid corner, as the area tool starts a thin wall; its cells on one side of it (D1 of 7/11/2026).
    const start = { x: 1050, y: 300 };
    const wall = { type: "line", start, end: { x: start.x + (direction.x / length) * cells * 150, y: start.y + (direction.y / length) * cells * 150 },
      dpi: 150, gridOrigin: { x: 1050, y: 300 }, widthAnchor: "edge" };
    const panels = spellStructureSegments(stone, wall, choice).map((segment) => cellsOf(segment.preview));
    assert.equal(panels.length, 10);
    assert.ok(panels.every((panel) => panel.length > 0), JSON.stringify(direction));
    const flat = panels.flat();
    assert.equal(new Set(flat).size, flat.length, "no cell in two panels");
    assert.deepEqual([...new Set(flat)].sort(), [...new Set(cellsOf(wall))].sort(), "the panels are the wall");
  }
  const ossa = getSpellStructureRule("xanathar-ossa-della-terra");
  const far = [[0, 0], [9, 0], [0, 9], [11, 7]].map(([column, row]) => pillarAt(column, row));
  const pillars = spellStructureSegments(ossa, pillarsPreview(far));
  assert.deepEqual(pillars.map((segment) => cellsOf(segment.preview).length), [1, 1, 1, 1]);
  assert.equal(cellsOf(spellStructureResiduePreview(ossa, pillars[3].preview)).length, 13, "the rubble of the farthest one");
});

test("Damage to a panel: objects are immune to poison and psychic, ice is vulnerable to fire; a collapse is the GM's", () => {
  const stone = getSpellStructureRule("wall-of-stone");
  const ice = getSpellStructureRule("wall-of-ice");
  const state = spellStructureInitialState(stone, spellStructureSegments(stone, line(20), "thick"), "thick");
  const hit = planSpellStructureSegmentChange({ rule: stone, state, index: 3, amount: 60, type: "bludgeoning" });
  assert.deepEqual([hit.before, hit.after, hit.destroyed], [180, 120, false]);
  assert.equal(hit.state.segments[2].hp, 120);
  assert.equal(hit.state.segments[1].hp, 180, "the other panels untouched");
  assert.equal(planSpellStructureSegmentChange({ rule: stone, state, index: 3, amount: 60, type: "poison" }).after, 180);
  const collapse = planSpellStructureSegmentChange({ rule: stone, state, index: 4, operation: "collapse" });
  assert.deepEqual([collapse.after, collapse.destroyed], [0, true]);
  assert.deepEqual(planSpellStructureSegmentChange({ rule: stone, state: collapse.state, index: 4, amount: 5, type: "fire" }).errors,
    ["structure-segment-destroyed"]);
  const iceState = spellStructureInitialState(ice, spellStructureSegments(ice, line(20)));
  const fire = planSpellStructureSegmentChange({ rule: ice, state: iceState, index: 2, amount: 15, type: "fire" });
  assert.deepEqual([fire.dealt, fire.after, fire.destroyed, fire.defense], [30, 0, true, "vulnerability"]);
  assert.deepEqual(planSpellStructureSegmentChange({ rule: ice, state: iceState, index: 2, operation: "collapse" }).errors,
    ["structure-collapse-not-allowed"], "only Wall of Stone's panels collapse at the GM's discretion");
  assert.deepEqual(spellStructureSummaryParts(stone, collapse.state), [{ id: "wall-of-stone-structure", label: "9/10 pannelli" }]);
  assert.deepEqual(getSpellSummaryParts(getSpellDefinition("wall-of-stone"), "", { structure: collapse.state }),
    [{ id: "wall-of-stone-structure", label: "9/10 pannelli" }], "the pill says how many stand");
});

test("The cast draws the panels under an invisible root; the intact wall asks no save, a destroyed ice panel does", () => {
  const stone = getSpellAreaRuleById("wall-of-stone:cast");
  assert.equal(stone.kind, "zone");
  assert.equal(stone.geometry.lengthUpTo, undefined, "the whole line: the ten panels the spell always has");
  assert.equal(getSpellAreaRuleById("wall-of-ice:cast").geometry.lengthUpTo, undefined);
  assert.deepEqual(stone.placementChoices.map((choice) => [choice.id, choice.geometry.size.value, choice.geometry.width.value]),
    [["thick", 30, 0.15], ["thin", 60, 0.075], ["thick-panels", 3, 0.15], ["thin-panels", 6, 0.075]]);
  assert.deepEqual([stone.geometry.widthAnchor, stone.placement.snapOrigin], ["edge", "vertex"], "on the grid lines, from a corner");
  const built = buildStaticSpellZoneItems({ ruleId: "wall-of-stone:cast", instanceId: "wall-1", casterId: "caster",
    spellName: "Muro di pietra", preview: line(20), ruleChoice: "thick" });
  const [root, geometry] = built;
  const panels = ofKind(built, "panel");
  assert.equal(root.fillOpacity, 0, "the root holds the panels and is not drawn");
  assert.equal(root.strokeOpacity, 0);
  assert.equal(root.disableHit, true);
  assert.equal(geometry.strokeOpacity, 0);
  assert.equal(panels.length, 10);
  const panelMeta = panels[2].metadata[STATIC_ZONE_KEY];
  assert.deepEqual([panelMeta.role, panelMeta.childKind, panelMeta.childIndex, panelMeta.parentZoneId, panelMeta.ruleId],
    ["subzone", "panel", 3, root.id, "wall-of-stone:panel"]);
  assert.ok(panels.every((panel) => panel.fillOpacity > 0), "the panels are what the map shows");
  // A thin slab on the wall's line (D1 of 7/11/2026): 15 cm is less than an eighth of a cell, so an eighth, 12.5 pixels.
  const slab = panels[2].commands;
  assert.equal(slab.length, 5, "four corners, closed");
  assert.deepEqual([slab[0][1], slab[0][2], slab[2][1], slab[2][2]], [400, 56.25, 600, 43.75]);
  assert.deepEqual(panels[2].metadata[STATIC_ZONE_KEY].geometry.widthAnchor, "edge");
  // Each panel has its bar: a track and a full green fill, attached to the panel and drawn above it.
  assert.equal(ofKind(built, "bar").length, 10);
  assert.equal(ofKind(built, "bar-fill").length, 10);
  const track = barOf(built, "bar", 3);
  const fill = barOf(built, "bar-fill", 3);
  assert.deepEqual([track.attachedTo, fill.attachedTo], [panels[2].id, panels[2].id]);
  assert.equal(fill.fillColor, "#22c55e");
  assert.ok(fill.zIndex > track.zIndex, "the fill over its track");
  assert.notEqual(track.visible, false, "seen by everyone");
  assert.equal(track.layer, "DRAWING", "under the tokens, their bars and their names");
  const trackMeta = track.metadata[STATIC_ZONE_KEY];
  assert.deepEqual([trackMeta.role, trackMeta.parentZoneId, trackMeta.ruleId], ["subzone", root.id, undefined],
    "a child of the root with no rule: the zone engine leaves it alone");
  // Under the panel's middle: the third tract runs from 400 to 600, its cells end at 100.
  const [, [, left], [, right]] = [null, track.commands[0], track.commands[1]];
  assert.equal((left + right) / 2, 500);
  assert.ok(track.commands[0][2] < 56.25 && track.commands[2][2] > 56.25, "across the lower edge of the slab");
  assert.deepEqual(getSpellAreaRuleById("wall-of-ice:cast").zonePolicy.triggers, []);
  assert.equal(getSpellAreaRuleById("wall-of-ice:frigid-air").zonePolicy.triggers.length, 1, "the save of whoever moves through it");
  const far = { type: "line", origin: { x: 5000, y: 0 }, cells: [{ x: 50, y: 0 }], radius: 0 };
  assert.equal(validateChildZoneContainment({ parentArea: { type: "line", cells: [] }, childArea: far, childKind: "frigid-air" }), true,
    "a residue drawn from the panel's own geometry");
});

// The bars ride the paths that already carry the segments: Termina takes every item of the cast, the engine takes them as
// stale once the pill is gone (the end of concentration), and no rule or area of the zone engine reads them.
test("The bars go with Termina and with the end of concentration, and the zone engine leaves them alone", async () => {
  const { staleStaticSpellZoneItemIds, staticSpellZoneItems, translatedZoneArea } = await import("../src/spellStaticZoneCore.js");
  const built = buildStaticSpellZoneItems({ ruleId: "wall-of-ice:cast", instanceId: "wall-1", casterId: "caster",
    spellName: "Muro di ghiaccio", preview: line(20) });
  const ids = (list) => list.map((item) => item.id).sort();
  assert.equal(built.length, 32, "root, geometry, ten panels, ten tracks and ten fills");
  assert.deepEqual(ids(staticSpellZoneItems(built, { instanceId: "wall-1" })), ids(built), "Termina takes them all");
  const casterWithPill = { id: "caster", metadata: { [META_KEY]: { [SPELLS_KEY]: [{ instanceId: "wall-1", spellId: "wall-of-ice" }] } } };
  const casterWithout = { id: "caster", metadata: { [META_KEY]: { [SPELLS_KEY]: [] } } };
  assert.deepEqual(staleStaticSpellZoneItemIds([casterWithPill, ...built]), [], "the pill holds them");
  assert.deepEqual(staleStaticSpellZoneItemIds([casterWithout, ...built]).sort(), ids(built), "without it, all of them go");
  for (const bar of [...ofKind(built, "bar"), ...ofKind(built, "bar-fill")]) {
    const metadata = bar.metadata[STATIC_ZONE_KEY];
    assert.equal(getSpellAreaRuleById(metadata.ruleId), null, "no rule: no membership and no trigger");
    assert.equal(translatedZoneArea(bar), null, "no area on the grid");
    assert.equal(validateChildZoneContainment({ parentArea: null, childArea: null, childKind: metadata.childKind }), true);
  }
});

function wallScene({ spellId, choice = "", panels = 10, hpOf = () => null }) {
  mutationCalls.length = 0;
  items.clear();
  const rule = getSpellStructureRule(spellId);
  const segments = spellStructureSegments(rule, line(panels * 2), choice);
  const state = spellStructureInitialState(rule, segments, choice);
  state.segments = state.segments.map((segment) => ({ ...segment, hp: hpOf(segment.index) ?? segment.hp }));
  const entry = { spellId, instanceId: "wall-1", casterId: "caster", casterName: "Maga", name: getSpellDefinition(spellId).displayName,
    conc: true, turns: 100, appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" }, castContext: { slotLevel: 6, structure: state } };
  items.set("caster", { id: "caster", name: "Maga", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { [SPELLS_KEY]: [entry] } } });
  const built = buildStaticSpellZoneItems({ ruleId: `${spellId}:cast`, instanceId: "wall-1", casterId: "caster",
    spellName: entry.name, preview: line(panels * 2), ruleChoice: choice });
  for (const item of built) items.set(item.id, item);
  return { entry, root: built[0], panels: ofKind(built, "panel"), built };
}

function payloadFor(spellId, actionId, entry, root) {
  return buildSpellActiveResolutionPayload({
    spell: getSpellDefinition(spellId),
    action: getSpellActiveResolutionActions(spellId).find((action) => action.id === actionId),
    group: { ...entry, zoneItemId: root.id },
    zoneItemId: root.id,
    sceneEpoch: 3,
    turnKey: "1:0:caster",
  });
}

test("Danneggia pannello: the hit points in the pill, one History entry, the panel still on the map", async () => {
  const actions = getSpellActiveResolutionActions("wall-of-stone");
  assert.deepEqual(actions.map((action) => [action.id, action.structure.operation]),
    [["wall-of-stone-damage", "damage"], ["wall-of-stone-collapse", "collapse"]]);
  for (const action of [...actions, ...getSpellActiveResolutionActions("wall-of-ice")]) {
    assert.deepEqual(validateSpellActiveResolutionAction(action), { valid: true, errors: [] }, action.id);
  }
  const stoneScene = wallScene({ spellId: "wall-of-stone", choice: "thick" });
  const { entry, root } = stoneScene;
  await executeSpellActiveResolution({ payload: payloadFor("wall-of-stone", "wall-of-stone-damage", entry, root),
    segmentIndex: 3, damageRoll: 60, damageType: "bludgeoning", sceneEpoch: 3, commandId: "cmd-1", isCurrent: () => true });
  assert.equal(mutationCalls.length, 1);
  const [{ operations, options }] = mutationCalls;
  const upsert = operations.find((operation) => operation.type === "spell:upsert");
  assert.equal(upsert.castContext.structure.segments[2].hp, 120);
  assert.equal(upsert.castContext.slotLevel, 6, "the rest of the pill kept");
  assert.deepEqual(upsert.summaryParts, [{ id: "wall-of-stone-structure", label: "10/10 pannelli" }]);
  // A panel still standing stays on the map; its bar gets a new fill, two thirds long, its track stays.
  const [bar] = options.sideEffects;
  const panelThree = ofKind(stoneScene.built, "panel")[2];
  assert.deepEqual(bar.removeChildItemIds, [barOf(stoneScene.built, "bar-fill", 3).id]);
  const [newFill] = bar.items;
  assert.equal(newFill.metadata[STATIC_ZONE_KEY].childKind, "bar-fill");
  assert.equal(newFill.attachedTo, panelThree.id);
  const fullWidth = barOf(stoneScene.built, "bar-fill", 3).commands[1][1] - barOf(stoneScene.built, "bar-fill", 3).commands[0][1];
  assert.ok(Math.abs((newFill.commands[1][1] - newFill.commands[0][1]) / fullWidth - 120 / 180) < 1e-9);
  assert.equal(newFill.fillColor, "#22c55e", "above two thirds: still green");
  assert.equal(options.history.label, "Muro di pietra · pannello 3: 180 → 120 PF");
  assert.deepEqual(options.history.payload.structure, { index: 3, before: 180, after: 120, dealt: 60, damageType: "bludgeoning", destroyed: false });
});

test("Fai crollare: the panel leaves the map, the others stay; a destroyed ice panel leaves its frigid air", async () => {
  const stone = wallScene({ spellId: "wall-of-stone", choice: "thick" });
  await executeSpellActiveResolution({ payload: payloadFor("wall-of-stone", "wall-of-stone-collapse", stone.entry, stone.root),
    segmentIndex: 4, damageRoll: 0, sceneEpoch: 3, commandId: "cmd-2", isCurrent: () => true });
  const collapse = mutationCalls[0].options;
  assert.deepEqual(collapse.sideEffects, [{ type: "static-zone:child-zones", parentZoneId: stone.root.id,
    parentInstanceId: "wall-1", casterId: "caster", items: [],
    removeChildItemIds: [stone.panels[3].id, barOf(stone.built, "bar", 4).id, barOf(stone.built, "bar-fill", 4).id] }],
    "the panel goes with its whole bar");
  assert.equal(collapse.history.label, "Muro di pietra · pannello 4 crollato");

  const ice = wallScene({ spellId: "wall-of-ice" });
  await executeSpellActiveResolution({ payload: payloadFor("wall-of-ice", "wall-of-ice-damage", ice.entry, ice.root),
    segmentIndex: 2, damageRoll: 15, damageType: "fire", sceneEpoch: 3, commandId: "cmd-3", isCurrent: () => true });
  const { operations, options } = mutationCalls[0];
  assert.equal(operations[0].castContext.structure.segments[1].hp, 0, "15 fire doubled: 30, the whole panel");
  const [childZones] = options.sideEffects;
  assert.deepEqual(childZones.removeChildItemIds, [ice.panels[1].id, barOf(ice.built, "bar", 2).id, barOf(ice.built, "bar-fill", 2).id]);
  const [frigid] = childZones.items;
  const frigidMeta = frigid.metadata[STATIC_ZONE_KEY];
  assert.deepEqual([frigidMeta.childKind, frigidMeta.ruleId, frigidMeta.childIndex], ["frigid-air", "wall-of-ice:frigid-air", 2]);
  assert.deepEqual(frigidMeta.geometry.start, ice.panels[1].metadata[STATIC_ZONE_KEY].geometry.start, "where the panel stood");
  assert.deepEqual(frigidMeta.triggers.map((trigger) => [trigger.event, trigger.requiresCrossing]), [["enter", true]],
    "its Constitution save for whoever moves through it");
  assert.equal(frigid.fillOpacity, 0.3, "a pale sheet where the panel stood");
  assert.equal(frigidMeta.geometry.widthAnchor, "edge");
  assert.equal(options.history.label, "Muro di ghiaccio · pannello 2 distrutto");
});

// D3 and D4 of 7/11/2026: a wall drawn panel by panel, each touching another (CAP-MULTIAREA with lines), and Wall of Ice's
// dome or sphere, with no panels: its sections stay at the table.
test("Panels one by one, each touching another; a dome with no panels", () => {
  const byPanels = getSpellAreaRuleForPlacement("wall-of-ice:cast", "panels");
  assert.deepEqual(validateSpellAreaRule(byPanels), { valid: true, errors: [] });
  assert.deepEqual(spellMultiAreaSpec(byPanels), { count: 10, minCount: 1, adjacency: "touch", noun: "pannello" });
  assert.equal(byPanels.geometry.size.value, 3, "each line one panel");
  for (const [ruleId, choice] of [["wall-of-stone:cast", "thick-panels"], ["wall-of-stone:cast", "thin-panels"]]) {
    assert.deepEqual(validateSpellAreaRule(getSpellAreaRuleForPlacement(ruleId, choice)), { valid: true, errors: [] }, choice);
  }
  // Three panels on the grid lines: an L of two, and one apart.
  const panel = (ordinal, start, end) => ({ ordinal, start, end, dpi: 100 });
  const runtime = { ...createSpellMultiAreaRuntime(byPanels), shapes: [
    panel(1, { x: 0, y: 0 }, { x: 200, y: 0 }),
    panel(2, { x: 200, y: 0 }, { x: 200, y: 200 }),
    panel(3, { x: 600, y: 600 }, { x: 800, y: 600 }),
  ] };
  assert.equal(spellMultiAreaConfirmProblem(runtime), "Il pannello 3 non tocca un altro pannello: toglilo e ridisegnalo accanto a un altro.");
  runtime.shapes[2] = panel(3, { x: 100, y: 200 }, { x: 100, y: 0 });
  assert.equal(spellMultiAreaConfirmProblem(runtime), "", "touching anywhere along another one is enough");
  assert.equal(spellMultiAreaMessage({ ...createSpellMultiAreaRuntime(byPanels), shapes: [] }), "Disegna il primo pannello: fino a 10.");

  // The cast: one panel on each line drawn, thin, its bar under it.
  const areas = runtime.shapes.map((shape) => ({ start: shape.start, end: shape.end }));
  const preview = { type: "line", ...areas[0], dpi: 100, gridOrigin: { x: 0, y: 0 }, areas, targetIds: [] };
  const ice = getSpellStructureRule("wall-of-ice");
  const segments = spellStructureSegments(ice, preview, "panels");
  assert.deepEqual(segments.map((segment) => [segment.preview.start, segment.preview.end, segment.preview.widthAnchor, segment.preview.thicknessMeters]),
    areas.map((area) => [area.start, area.end, "edge", 0.3]));
  const built = buildStaticSpellZoneItems({ ruleId: "wall-of-ice:cast", instanceId: "wall-2", casterId: "caster",
    spellName: "Muro di ghiaccio", preview, ruleChoice: "panels" });
  assert.equal(built[0].fillOpacity, 0, "the root holds them and is not drawn");
  assert.deepEqual([ofKind(built, "panel").length, ofKind(built, "bar").length, ofKind(built, "bar-fill").length], [3, 3, 3]);

  // The dome: a visible ring, no panels and no bars.
  const dome = getSpellAreaRuleForPlacement("wall-of-ice:cast", "dome");
  assert.deepEqual([dome.geometry.shape, dome.geometry.size.value, dome.geometry.ring, dome.zonePolicy.structure], ["circle", 3, true, false]);
  const circle = { type: "circle", start: { x: 500, y: 500 }, end: { x: 700, y: 500 }, dpi: 100, gridOrigin: { x: 500, y: 500 }, targetIds: [] };
  assert.deepEqual(spellStructureSegments(ice, circle, "dome"), []);
  const domeItems = buildStaticSpellZoneItems({ ruleId: "wall-of-ice:cast", instanceId: "wall-3", casterId: "caster",
    spellName: "Muro di ghiaccio", preview: circle, ruleChoice: "dome" });
  assert.equal(domeItems.length, 2, "its root and its geometry");
  assert.ok(domeItems[0].fillOpacity > 0, "the dome is drawn");
  // A ring a foot thick is one cell wide, on its inner side, as the area tool draws it from the rule's width (at least a
  // cell): the cells a dome of 3 m cuts around a grid corner. Its innerSize is never read; Wall of Water's ring the same.
  for (const [ruleId, choice] of [["wall-of-ice:cast", "dome"], ["xanathar-muro-dacqua:cast", "ring"]]) {
    const ring = getSpellAreaRuleForPlacement(ruleId, choice);
    const widthCells = Math.max(1, Math.round(ring.geometry.width.value / 1.5));
    const cells = buildArea("circle", circle.start, circle.end, 100, circle.gridOrigin, { ring: true, ringInnerSquares: 2 - widthCells }).cells;
    assert.equal(cells.length, 8, choice);
  }
  const rootArea = domeItems[0].metadata["com.thebigpicture.initiative/aoeArea"];
  assert.deepEqual([rootArea.ring, rootArea.ringInnerSquares], [true, 1], "the zone the same, with no preview of the ring");
});

const OSSA = "xanathar-ossa-della-terra";

test("Bones of the Earth: up to six pillars, two more for each slot above the 6th, one cell each", () => {
  const cast = getSpellAreaRuleById(`${OSSA}:cast`);
  assert.deepEqual(validateSpellAreaRule(cast), { valid: true, errors: [] });
  assert.deepEqual([cast.kind, cast.geometry.shape, cast.geometry.size.value, cast.placement.range.value], ["zone", "square", 1.5, 36]);
  for (const [slotLevel, count] of [[0, 6], [6, 6], [7, 8], [8, 10], [9, 12]]) {
    assert.deepEqual(spellMultiAreaSpec(cast, { slotLevel }), { count, minCount: 1, adjacency: "none", noun: "colonna" }, `slot ${slotLevel}`);
  }
  assert.equal(spellMultiAreaMessage(createSpellMultiAreaRuntime(cast, { slotLevel: 7 })), "Disegna la prima colonna: fino a 8.");
  const loose = validateSpellAreaRule({ ...cast, zonePolicy: { ...cast.zonePolicy, structure: false } });
  assert.ok(loose.errors.includes("multi-area-placement-invalid"), "a zone draws several shapes only as the segments of a structure");
  for (const [slotLevel, maximum] of [[6, 6], [8, 10]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId: OSSA, phase: "cast", castContext: { slotLevel } });
    assert.equal(contract.presentation.placement.ruleId, `${OSSA}:cast`);
    assert.equal(contract.execution.castHasHP, false, "the save under a pillar lifts, it does not hurt");
    assert.equal(contract.presentation.inputs.outcomes.required, true);
    assert.equal(contract.presentation.inputs.targets.maximum, maximum, "a creature under each pillar at most");
  }
  const [lifted] = getAreaSaveAutomation(OSSA, "", { slotLevel: 6 }).failed;
  assert.deepEqual([lifted.condition, lifted.effectId, lifted.expiry], ["Sulla colonna", "bones-of-the-earth-lifted", { mode: "manual" }]);
  assert.notEqual(lifted.options?.parentEffectId, "", "linked to the pill of the pillars, where the ⚡ Soffitto looks for it");
  assert.deepEqual(getSpellDefinition(OSSA).expiry, { mode: "manual" }, "the pillars stand until destroyed: a pill with no end");
});

test("The cast raises a pillar on each shape under an invisible root, each with 30 hit points in the pill", () => {
  const shapes = [pillarAt(0, 0), pillarAt(3, 0), pillarAt(5, 5, -1, -1)];
  const built = buildStaticSpellZoneItems({ ruleId: `${OSSA}:cast`, instanceId: "ossa-1", casterId: "caster",
    spellName: "Ossa della Terra", preview: pillarsPreview(shapes) });
  const [root] = built;
  const pillars = ofKind(built, "pillar");
  assert.deepEqual([root.fillOpacity, root.strokeOpacity, root.disableHit], [0, 0, true]);
  assert.equal(pillars.length, 3);
  assert.deepEqual(pillars.map((pillar) => {
    const meta = pillar.metadata[STATIC_ZONE_KEY];
    return [meta.childKind, meta.childIndex, meta.ruleId, meta.parentZoneId];
  }), [1, 2, 3].map((index) => ["pillar", index, `${OSSA}:pillar`, root.id]));
  const rule = getSpellStructureRule(OSSA);
  const segments = spellStructureSegments(rule, pillarsPreview(shapes));
  assert.deepEqual(segments[2].preview.start, { x: 500, y: 500 }, "the third drawn up and to the left of its corner");
  assert.deepEqual(spellStructureInitialState(rule, segments).segments,
    [1, 2, 3].map((index) => ({ index, hp: 30, hpMax: 30 })));
  assert.deepEqual(spellStructureSummaryParts(rule, spellStructureInitialState(rule, segments)),
    [{ id: `${OSSA}-structure`, label: "3/3 colonne" }]);
});

function pillarScene(shapes, { liftedIds = [] } = {}) {
  mutationCalls.length = 0;
  items.clear();
  const rule = getSpellStructureRule(OSSA);
  const state = spellStructureInitialState(rule, spellStructureSegments(rule, pillarsPreview(shapes)));
  const entry = { spellId: OSSA, instanceId: "ossa-1", casterId: "caster", casterName: "Druida", name: "Ossa della Terra",
    conc: false, turns: 14400, appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    castContext: { slotLevel: 6, structure: state },
    effectInstances: liftedIds.map((itemId) => ({ effectId: "bones-of-the-earth-lifted", itemId, active: true })) };
  items.set("caster", { id: "caster", name: "Druida", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { [SPELLS_KEY]: [entry] } } });
  const built = buildStaticSpellZoneItems({ ruleId: `${OSSA}:cast`, instanceId: "ossa-1", casterId: "caster",
    spellName: entry.name, preview: pillarsPreview(shapes) });
  for (const item of built) items.set(item.id, item);
  return { entry, root: built[0], pillars: ofKind(built, "pillar"), built };
}

test("Danneggia colonna: AC 5 and 30 hit points; at 0 it crumbles into rubble 3 m around it", async () => {
  const actions = getSpellActiveResolutionActions(OSSA);
  assert.deepEqual(actions.map((action) => action.id), ["bones-of-the-earth-damage", "bones-of-the-earth-ceiling"]);
  for (const action of actions) assert.deepEqual(validateSpellActiveResolutionAction(action), { valid: true, errors: [] }, action.id);
  const rule = getSpellStructureRule(OSSA);
  const state = spellStructureInitialState(rule, spellStructureSegments(rule, pillarsPreview([pillarAt(0, 0)])));
  assert.equal(planSpellStructureSegmentChange({ rule, state, index: 1, amount: 12, type: "psychic" }).after, 30, "an object");
  assert.equal(rule.armorClass, 5);

  const scene = pillarScene([pillarAt(0, 0), pillarAt(3, 0)]);
  await executeSpellActiveResolution({ payload: payloadFor(OSSA, "bones-of-the-earth-damage", scene.entry, scene.root),
    segmentIndex: 2, damageRoll: 30, damageType: "bludgeoning", sceneEpoch: 3, commandId: "cmd-4", isCurrent: () => true });
  const { operations, options } = mutationCalls[0];
  assert.equal(operations[0].castContext.structure.segments[1].hp, 0);
  assert.deepEqual(operations[0].summaryParts, [{ id: `${OSSA}-structure`, label: "1/2 colonne" }]);
  assert.equal(operations[0].turns, 14400, "the pill keeps its own duration");
  const [childZones] = options.sideEffects;
  assert.deepEqual(childZones.removeChildItemIds, [scene.pillars[1].id, barOf(scene.built, "bar", 2).id, barOf(scene.built, "bar-fill", 2).id]);
  const [rubble] = childZones.items;
  const rubbleMeta = rubble.metadata[STATIC_ZONE_KEY];
  assert.deepEqual([rubbleMeta.childKind, rubbleMeta.ruleId, rubbleMeta.childIndex], ["rubble", `${OSSA}:rubble`, 2]);
  assert.deepEqual([rubbleMeta.geometry.type, rubbleMeta.geometry.start, rubbleMeta.geometry.end],
    ["circle", { x: 350, y: 50 }, { x: 550, y: 50 }], "10 feet around the middle of the pillar's cell");
  assert.deepEqual(rubbleMeta.triggers, [], "difficult terrain, counted at the table: no save");
  assert.equal(options.history.label, "Ossa della Terra · colonna 2 distrutta");
});

test("Soffitto: 6d6 bludgeoning and restrained for whoever a pillar lifted, with no save", () => {
  const ceiling = getSpellActiveResolutionActions(OSSA).find((action) => action.id === "bones-of-the-earth-ceiling");
  assert.deepEqual([ceiling.resolutionKind, ceiling.manualSaveAtTable, ceiling.assumedOutcome, ceiling.checkLabel],
    ["single-save", true, "failed", ""]);
  assert.deepEqual([ceiling.damage.formula, ceiling.damage.type], ["6d6", "contundenti"]);
  assert.equal(ceiling.availableAfterCast, undefined, "part of the cast: available at once");
  assert.equal(ceiling.requiredTargetEffectId, "bones-of-the-earth-lifted");
  assert.equal(ceiling.excludedTargetEffectId, "bones-of-the-earth-pinned", "once per creature");
  const [pinned] = ceiling.failureEffects;
  assert.deepEqual([pinned.id, pinned.label, pinned.expiry], ["bones-of-the-earth-pinned", "Trattenuto", { mode: "manual" }]);
  assert.match(pinned.detail, /Forza o di Destrezza/u);
  const scene = pillarScene([pillarAt(0, 0)], { liftedIds: ["goblin"] });
  assert.equal(payloadFor(OSSA, "bones-of-the-earth-ceiling", scene.entry, scene.root).linkedTargetId, "goblin",
    "the creature on the pillar, found from the pill");
});
