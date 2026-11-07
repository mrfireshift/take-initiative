// CAP-MULTIAREA, the general rule of several areas in one cast (src/spellMultiAreaCore.js): what a rule declares, what
// the GM reads while drawing, when the confirmation is refused, and every creature once.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  createSpellMultiAreaRuntime,
  spellMultiAreaConfirmProblem,
  spellMultiAreaFreeOrdinal,
  spellMultiAreaIsolatedOrdinal,
  spellMultiAreaMessage,
  spellMultiAreaPreview,
  spellMultiAreaProgress,
  spellMultiAreaShapeAt,
  spellMultiAreaShapeLabel,
  spellMultiAreaShapeMiddle,
  spellMultiAreaSpec,
} = await import("../src/spellMultiAreaCore.js");
const { getSpellAreaRuleById, validateSpellAreaRule } = await import("../src/spellAreaRules.js");
const { buildArea } = await import("../src/aoeGeometryCore.js");

const DPI = 70;
const ORIGIN = { x: 0, y: 0 };
// A 3 m cube is a square of two cells, drawn from a grid corner (column, row) towards the lower right.
const cube = (ordinal, column, row) => {
  const start = { x: column * DPI, y: row * DPI };
  const area = buildArea("square", start, { x: start.x + 2 * DPI, y: start.y + 2 * DPI }, DPI, ORIGIN);
  return { ordinal, type: "square", start, end: { x: start.x + 2 * DPI, y: start.y + 2 * DPI }, dpi: DPI, area, middle: spellMultiAreaShapeMiddle(area) };
};
const explosion = (ordinal, x, y) => {
  const start = { x, y };
  const area = buildArea("circle", start, { x: x + 8 * DPI, y }, DPI, ORIGIN);
  return { ordinal, type: "circle", start, end: { x: x + 8 * DPI, y }, dpi: DPI, area, middle: spellMultiAreaShapeMiddle(area) };
};
const runtimeOf = (ruleId, shapes = []) => ({ ...createSpellMultiAreaRuntime(getSpellAreaRuleById(ruleId)), shapes });

test("Meteor Swarm and Fire Storm declare their areas in their own rule; the other spells declare none", () => {
  assert.deepEqual(spellMultiAreaSpec(getSpellAreaRuleById("meteor-swarm:cast")), { count: 4, minCount: 4, adjacency: "none", noun: "esplosione" });
  assert.deepEqual(spellMultiAreaSpec(getSpellAreaRuleById("fire-storm:cast")), { count: 10, minCount: 1, adjacency: "side", noun: "cubo" });
  const storm = getSpellAreaRuleById("fire-storm:cast");
  assert.equal(storm.geometry.shape, "square");
  assert.deepEqual(storm.geometry.size, { value: 3, unit: "m", measure: "side" }, "the cube, no longer the square around the ten");
  assert.deepEqual(storm.placement.range, { value: 45, unit: "m", measure: "range" });
  assert.equal(getSpellAreaRuleById("meteor-swarm:cast").geometry.size.value, 12);
  for (const ruleId of ["fireball:cast", "xanathar-minuscole-meteore-di-melf:cast", "call-lightning:cast"]) {
    assert.equal(spellMultiAreaSpec(getSpellAreaRuleById(ruleId)), null, ruleId);
    assert.equal(createSpellMultiAreaRuntime(getSpellAreaRuleById(ruleId)), null, ruleId);
  }
  assert.doesNotMatch(getSpellAreaRuleById("meteor-swarm:cast").placementNote, /Modifica bersagli/u, "nothing left to add by hand");
  assert.doesNotMatch(getSpellAreaRuleById("fire-storm:cast").placementNote, /Modifica bersagli/u);
});

test("A rule's declaration is checked: circles or squares on free points of an instant spell", () => {
  const base = getSpellAreaRuleById("meteor-swarm:cast");
  const withMulti = (multiArea, extra = {}) => validateSpellAreaRule({
    ...base,
    ...extra,
    placement: { ...base.placement, ...(extra.placement || {}), multiArea },
  });
  assert.equal(withMulti({ count: 4 }).valid, true);
  for (const multiArea of [{ count: 1 }, { count: 13 }, { count: 4, minCount: 0 }, { count: 4, minCount: 5 }, { count: 4, adjacency: "corner" }, { count: 4, noun: "meteora" }, null]) {
    assert.deepEqual(withMulti(multiArea).errors, ["multi-area-invalid"], JSON.stringify(multiArea));
  }
  assert.ok(withMulti({ count: 4, adjacency: "side" }).errors.includes("multi-area-adjacency-invalid"), "side adjacency is between squares");
  assert.ok(withMulti({ count: 4 }, { kind: "zone" }).errors.includes("multi-area-placement-invalid"));
  assert.ok(withMulti({ count: 4 }, { placement: { origin: "caster", anchor: "caster" } }).errors.includes("multi-area-placement-invalid"));
  const cone = getSpellAreaRuleById("burning-hands:cast");
  assert.ok(validateSpellAreaRule({ ...cone, placement: { ...cone.placement, multiArea: { count: 2 } } }).errors.includes("multi-area-shape-invalid"));
});

test("Meteor Swarm, what the GM reads: four explosions, numbered 1/4 to 4/4", () => {
  const swarm = runtimeOf("meteor-swarm:cast");
  assert.equal(spellMultiAreaMessage(swarm), "Disegna la prima esplosione: 4 in tutto.");
  swarm.shapes.push(explosion(1, 700, 700), explosion(2, 1400, 700));
  assert.equal(spellMultiAreaMessage(swarm), "Esplosioni sulla mappa: 2 di 4. Disegna la prossima.");
  assert.equal(spellMultiAreaShapeLabel(swarm, 2), "2/4");
  swarm.shapes.push(explosion(3, 700, 1400), explosion(4, 1400, 1400));
  assert.equal(spellMultiAreaMessage(swarm), "Tutte le 4 esplosioni sono sulla mappa: conferma. Premi sul numero di una per toglierla.");
  assert.equal(spellMultiAreaMessage(swarm, "full"), spellMultiAreaMessage(swarm));
  swarm.shapes.splice(2, 1);
  assert.equal(spellMultiAreaMessage(swarm, "removed", { ordinal: 3 }), "Esplosione 3 tolta: ridisegnala dove vuoi.");
  assert.equal(spellMultiAreaFreeOrdinal(swarm), 3, "the next one drawn takes its number back");
  assert.equal(spellMultiAreaConfirmProblem(swarm), "Disegna tutte le 4 esplosioni prima di confermare (3/4).");
  assert.deepEqual(spellMultiAreaProgress(swarm), { placed: 3, count: 4, minCount: 4, noun: "esplosione" });
});

test("Fire Storm, what the GM reads: up to ten cubes, the number alone on each", () => {
  const storm = runtimeOf("fire-storm:cast");
  assert.equal(spellMultiAreaMessage(storm), "Disegna il primo cubo: fino a 10.");
  assert.equal(spellMultiAreaConfirmProblem(storm), "Disegna almeno un cubo prima di confermare.");
  storm.shapes.push(cube(1, 0, 0), cube(2, 2, 0), cube(3, 4, 0));
  assert.equal(spellMultiAreaMessage(storm), "Cubi sulla mappa: 3, fino a 10. Disegna il prossimo, oppure conferma.");
  assert.equal(spellMultiAreaShapeLabel(storm, 3), "3");
  assert.equal(spellMultiAreaMessage(storm, "removed", { ordinal: 2 }), "Cubo 2 tolto: ridisegnalo dove vuoi, oppure conferma senza.");
  assert.equal(spellMultiAreaConfirmProblem(storm), "", "three cubes in a row");
  storm.shapes = Array.from({ length: 10 }, (_, index) => cube(index + 1, index * 2, 0));
  assert.equal(spellMultiAreaMessage(storm), "Tutti i 10 cubi sono sulla mappa: conferma. Premi sul numero di uno per toglierlo.");
  assert.equal(spellMultiAreaFreeOrdinal(storm), 0);
});

test("Fire Storm: every cube touches another along a side; overlapping counts, a corner alone does not", () => {
  const storm = (shapes) => runtimeOf("fire-storm:cast", shapes);
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0)])), 0, "a single cube asks nothing");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 2, 0)])), 0, "side by side");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 0, 2)])), 0, "one above the other");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 2, 1)])), 0, "half a side is a side");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 1, 1)])), 0, "overlapping");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 2, 2)])), 1, "a corner alone");
  assert.equal(spellMultiAreaIsolatedOrdinal(storm([cube(1, 0, 0), cube(2, 2, 0), cube(3, 7, 0)])), 3, "one cell apart");
  assert.equal(
    spellMultiAreaConfirmProblem(storm([cube(1, 0, 0), cube(2, 2, 0), cube(3, 7, 0)])),
    "Il cubo 3 non tocca un altro cubo con un lato: toglilo e ridisegnalo accanto a un altro.",
  );
  assert.equal(spellMultiAreaIsolatedOrdinal(runtimeOf("meteor-swarm:cast", [explosion(1, 0, 0), explosion(2, 5000, 0)])), 0, "Meteor Swarm asks nothing of where its points are");
});

test("Pressing on a shape's number takes it; its corners stay free for the neighbour", () => {
  const storm = runtimeOf("fire-storm:cast", [cube(1, 0, 0), cube(2, 2, 0)]);
  assert.equal(spellMultiAreaShapeAt(storm, { x: DPI, y: DPI }), 0, "the middle of cube 1");
  assert.equal(spellMultiAreaShapeAt(storm, { x: DPI * 1.5, y: DPI * 1.4 }), 0);
  assert.equal(spellMultiAreaShapeAt(storm, { x: DPI * 2, y: DPI }), -1, "the middle of the side between them");
  assert.equal(spellMultiAreaShapeAt(storm, { x: DPI * 2, y: 0 }), -1, "a corner, where the next cube starts");
  assert.equal(spellMultiAreaShapeAt(storm, { x: DPI * 3, y: DPI }), 1);
  const swarm = runtimeOf("meteor-swarm:cast", [explosion(1, 700, 700), explosion(2, 1050, 700)]);
  assert.equal(spellMultiAreaShapeAt(swarm, { x: 720, y: 690 }), 0, "near its centre");
  assert.equal(spellMultiAreaShapeAt(swarm, { x: 875, y: 700 }), -1, "inside both circles, away from both numbers: a new explosion starts there");
});

test("The confirmed placement: each shape with its targets, every creature once, in the order of the numbers", () => {
  const swarm = runtimeOf("meteor-swarm:cast", [explosion(1, 700, 700), explosion(2, 1050, 700), explosion(3, 0, 0), explosion(4, 2800, 0)]);
  const preview = spellMultiAreaPreview(swarm, [["goblin", "caster", "orc"], ["orc", "ogre"], [], ["goblin"]], { includeCaster: true, casterId: "caster" });
  assert.deepEqual(preview.targetIds, ["goblin", "caster", "orc", "ogre"], "the orc in two explosions, once");
  assert.deepEqual(preview.areas.map((entry) => entry.targetIds), [["goblin", "caster", "orc"], ["orc", "ogre"], [], ["goblin"]]);
  assert.equal(preview.areas[0].radius, 8 * DPI);
  assert.deepEqual(preview.areas[1].start, { x: 1050, y: 700 });
  const withoutCaster = spellMultiAreaPreview(swarm, [["caster", "goblin"], [], [], []], { includeCaster: false, casterId: "caster" });
  assert.deepEqual(withoutCaster.targetIds, ["goblin"]);
});

// The tool's own path for the general rule: from the rule, never from a placement's context, apart from areaBatch.
test("The area tool draws several shapes from the rule, on a path of its own", () => {
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(tool, /multiArea: createSpellMultiAreaRuntime\(rule\),/);
  const general = tool.slice(tool.indexOf("async function sendMultiAreaProgress(runtime)"), tool.indexOf("async function sendSpellPlacementProgress(runtime)"));
  assert.ok(general.length > 0);
  assert.doesNotMatch(general, /areaBatch/u, "the general path reads nothing of the Boss Actions' batch");
  for (const name of ["fixMultiAreaShape", "removeMultiAreaShapeAt", "confirmMultiAreaPlacement"]) {
    assert.match(general, new RegExp(`function ${name}\\(`), name);
  }
  assert.match(general, /const problem = spellMultiAreaConfirmProblem\(multiArea\);/);
  assert.match(general, /hitTargetIds\.push\(await findHitTargetIds\(shape\.area, runtime\.rule\)\);/);
  assert.match(general, /targetIds: preview\.targetIds,\n    areas: preview\.areas,\n  \}\);\n  await closeSpellPlacement\("confirmed"\);/);

  const finish = tool.slice(tool.indexOf("async function finishDrag(state)"), tool.indexOf("function finishMovementDrag(state)"));
  const fix = finish.indexOf("if (spellPlacementSession.multiArea) {");
  assert.ok(fix > finish.indexOf("if (spellPlacementSession.areaBatch) {"));
  assert.ok(fix < finish.lastIndexOf("spellPlacementSession.session = reviewSpellAreaPlacement("), "the general branch returns before the single-shape review");

  const start = tool.slice(tool.indexOf("function startDrag(type, event)"), tool.indexOf("function moveDrag(event)"));
  assert.match(start, /if \(multiPointer && removeMultiAreaShapeAt\(multiPointer\)\) return;/);
  assert.match(start, /if \(multiArea\.shapes\.length >= multiArea\.count\) \{\n      void OBR\.notification\.show\(spellMultiAreaMessage\(multiArea, "full"\), "INFO"\);\n      return;\n    \}/);
  assert.ok(start.indexOf("removeMultiAreaShapeAt") < start.indexOf("cancelDrag();"));
  assert.match(tool, /return removeMultiAreaShapeAt\(point\(event\?\.pointerPosition\)\) \? false : undefined;/, "a plain click on a number takes it too");

  const confirm = tool.slice(tool.indexOf("async function confirmSpellPlacement()"), tool.indexOf("function modeDefinition("));
  assert.ok(confirm.indexOf("if (runtime?.multiArea) {") > 0);
  assert.ok(confirm.indexOf("if (runtime?.multiArea) {") < confirm.indexOf("Posiziona prima la sagoma dell'incantesimo."));
  assert.match(tool, /if \(runtime\.multiArea\) await sendMultiAreaProgress\(runtime\);/, "the first line for the GM as the tool opens");
});

test("The spell panel shows the tool's count while the shapes are drawn, and nothing for any other placement", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(panel, /if \(!progress\?\.multiArea \|\| !String\(progress\.message \|\| ""\)\.trim\(\)\) return;/);
  assert.match(panel, /feedback: \{ state: "loading", message: String\(progress\.message\)\.trim\(\) \},/);
});
