// Shothragoth, the chained seam (profile v22): below half HP Cucitura Spezzata replaces Cucitura del Non-Luogo. Four
// points joined one to the next, each segment up to 120 ft; Strappare le Cuciture tears the segments the GM chooses, one
// save and one damage per creature.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossActionAreaRuleId, bossAreaShapeLabel, bossHpGateBlocker, bossSeamSegmentLabel, bossSeamSegments, bossSequenceBlocker,
  buildBossActionGroupMutation, buildBossActionUse, buildBossSeamMutation, BOSS_SEAM_ITEM_KEY } from "../src/bossActionExecutionCore.js";
import { bossActionResultSummary, bossActionRowMeta, validateBossActionGroupSelection } from "../src/bossActionsViewCore.js";
import { bossSeamChainPortalSpecs } from "../src/bossSeamPortalCore.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8");
const profile = await importBossActionHTML(html);
const ability = (name) => profile.abilities.find((entry) => entry.name === name);
const cucitura = ability("Cucitura del Non-Luogo");
const strappare = ability("Strappare la Cucitura");
const spezzata = ability("Cucitura Spezzata");
const strappareTutte = ability("Strappare le Cuciture");
const corpo = ability("Il Corpo Non Era Qui");
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: 60, inInitiative: true, ...extra } } });
const boss = (hp, state = {}) => ({ id: "shothragoth", name: "Shothragoth", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: 410, inInitiative: true,
  bossActionState: { version: 1, boundTokenId: "shothragoth", bossDefinitionId: "shothragoth", bossInstanceId: "boss-instance:shothragoth:shothragoth", ...state } } } });
const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 800, y: 300 }];
const chain = { round: 2, actionId: spezzata.id, actionInstanceId: "boss-action:spezzata", start: points[0], end: points[3], lengthFeet: 110,
  points, segmentsFeet: [40, 30, 40], itemIds: ["seam-s1", "seam-s1-geometry"] };
const line = (from, to, ids) => ({ ruleId: "boss-action-area:seam:20ft", start: from, end: to, areaTargetIds: ids });

test("v22 data: the hit point gate, the chain of four points (120 ft for each segment), the lines on chosen segments", async () => {
  assert.deepEqual([profile.profileVersion, profile.parserVersion], [24, 24]);
  assert.equal(cucitura.hpGate, "unbloodied");
  assert.equal(spezzata.hpGate, "bloodied");
  assert.deepEqual(spezzata.sequence, { slot: "first" });
  assert.deepEqual(spezzata.execution, { kind: "seam", seam: { width: 5, maxLength: 120, range: 60, blocks: [corpo.id], points: 4 } });
  assert.match(spezzata.manualText, /Lo spazio delle cuciture è Terreno Difficile/);
  assert.deepEqual(strappareTutte.sequence, { slot: "last", after: spezzata.id });
  assert.deepEqual(strappareTutte.usage, { note: "Special Recharge" });
  assert.deepEqual(strappareTutte.execution.target, { mode: "multiple", selection: "area", area: { shape: "seam", size: 20, origin: "Cucitura Spezzata", segments: true } });
  assert.deepEqual(strappareTutte.execution.damage.map((row) => [row.formula, row.type]), [["4d8", "force"], ["4d8", "psychic"]]);
  assert.match(strappareTutte.manualText, /perpendicolarmente alla cucitura più vicina/);
  assert.equal(strappare.execution.target.area.segments, undefined, "the two-point tear keeps its single line");
  assert.equal(bossActionAreaRuleId(strappareTutte.execution.target.area), "boss-action-area:seam:20ft");
  assert.equal(bossAreaShapeLabel(strappareTutte.execution.target.area), "linee sulle cuciture");
  assert.equal(bossActionRowMeta(spezzata, {}).tag, "4 punti · fino a 120 ft per tratto · prima del round");
  assert.equal(bossActionRowMeta(strappareTutte, {}).tag, "TS INT 18 · linee sulle cuciture 20 ft · ultima del round");
  assert.deepEqual(bossActionRowMeta(cucitura, { available: false, hpGated: true }).badge, "Solo sopra ½ PF");
  assert.deepEqual(bossActionRowMeta(spezzata, { available: false, hpGated: true }).badge, "Solo a ½ PF o meno");

  // Closed data: a v21 profile cannot carry the gate, the points or the segments; a tear must match its seam.
  const v21 = structuredClone(profile);
  v21.profileVersion = v21.parserVersion = 21;
  assert.throws(() => validateBossActionProfile(v21), /hpGate|points|segments|unexpected/);
  for (const mutate of [
    (p) => { p.abilities.find((e) => e.name === "Cucitura Spezzata").hpGate = "half"; },
    (p) => { p.abilities.find((e) => e.name === "Cucitura Spezzata").execution.seam.points = 2; },
    (p) => { p.abilities.find((e) => e.name === "Strappare le Cuciture").execution.target.area.segments = false; },
    (p) => { delete p.abilities.find((e) => e.name === "Strappare le Cuciture").execution.target.area.segments; },
    (p) => { p.abilities.find((e) => e.name === "Strappare la Cucitura").execution.target.area.segments = true; },
  ]) {
    const copy = structuredClone(profile);
    mutate(copy);
    assert.throws(() => validateBossActionProfile(copy));
  }
  // A tear that names the wrong kind of seam stays manual reference text.
  const swapped = await importBossActionHTML(html.replace("ha usato Cucitura Spezzata.", "ha usato Cucitura del Non-Luogo."));
  assert.equal(swapped.abilities.find((row) => row.name === "Strappare le Cuciture").automation, "UNSUPPORTED");
});

test("the hit point gate: above half HP the two-point seam, at half or less the chained one", () => {
  assert.equal(bossHpGateBlocker(spezzata, boss(206)), "Cucitura Spezzata richiede che Shothragoth abbia la metà o meno dei suoi PF (206/410).");
  assert.equal(bossHpGateBlocker(spezzata, boss(205)), "", "exactly half opens it");
  assert.equal(bossHpGateBlocker(cucitura, boss(206)), "");
  assert.equal(bossHpGateBlocker(cucitura, boss(205)), "Cucitura del Non-Luogo non è più disponibile: Shothragoth ha la metà o meno dei suoi PF (205/410).");
  assert.equal(bossHpGateBlocker(corpo, boss(10)), "", "no gate, no block");
  assert.match(bossHpGateBlocker(spezzata, { ...boss(0), metadata: { [META]: {} } }), /PF di Shothragoth non leggibili/);
  assert.throws(() => buildBossActionUse({ profile, action: spezzata, sourceItem: boss(300), actionInstanceId: "x", round: 2 }), /metà o meno/);
  assert.throws(() => buildBossActionUse({ profile, action: cucitura, sourceItem: boss(100), actionInstanceId: "x", round: 2 }), /non è più disponibile/);
  assert.ok(buildBossActionUse({ profile, action: spezzata, sourceItem: boss(100), actionInstanceId: "x", round: 2 }));
});

test("Cucitura Spezzata: four points, three segments of up to 120 ft each; it blocks Il Corpo like the seam", () => {
  const plan = buildBossSeamMutation({ profile, action: spezzata, sourceItem: boss(150), actionInstanceId: "boss-action:spezzata", round: 2,
    seam: { points, segmentsFeet: [40, 30, 40], itemIds: Array.from({ length: 14 }, (_, index) => `item-${index}`) } });
  const recorded = plan.options.metadataPatches[0].fields.bossActionState.value.seam;
  assert.deepEqual([recorded.points, recorded.segmentsFeet, recorded.lengthFeet, recorded.start, recorded.end], [points, [40, 30, 40], 110, points[0], points[3]]);
  assert.equal(recorded.itemIds.length, 12, "the drawings of a chain: up to 12 ids");
  assert.equal(bossActionResultSummary({ seam: { lengthFeet: 110, segments: 3 } }), "3 cuciture, 110 ft in tutto, fino alla fine del round");
  const state = plan.options.metadataPatches[0].fields.bossActionState.value;
  assert.match(bossSequenceBlocker(profile, corpo, state, 2, "Shothragoth"), /Finché la cucitura esiste, Shothragoth non può usare Il Corpo Non Era Qui/);
  const attempt = (seam) => () => buildBossSeamMutation({ profile, action: spezzata, sourceItem: boss(150), actionInstanceId: "x", round: 2, seam });
  assert.throws(attempt({ points, segmentsFeet: [40, 125, 40] }), /Ogni cucitura è lunga al massimo 120 ft/);
  const long = buildBossSeamMutation({ profile, action: spezzata, sourceItem: boss(150), actionInstanceId: "y", round: 2, seam: { points, segmentsFeet: [120, 120, 120] } });
  assert.equal(long.options.metadataPatches[0].fields.bossActionState.value.seam.lengthFeet, 360, "120 ft for each of the three segments");
  assert.throws(attempt({ points: points.slice(0, 3), segmentsFeet: [40, 30] }), /tutti i 4 punti/);
  assert.throws(attempt({ points: [points[0], points[0], points[2], points[3]], segmentsFeet: [5, 30, 40] }), /consecutivi coincidono/);
  assert.throws(attempt({ points, segmentsFeet: [40, 30] }), /non leggibile/);
});

test("Strappare le Cuciture: lines on the chosen segments (either direction); one save and one damage per creature", () => {
  assert.deepEqual(bossSeamSegments(chain).map((row) => [row.index, row.start, row.end]), [[0, points[0], points[1]], [1, points[1], points[2]], [2, points[2], points[3]]]);
  assert.deepEqual([0, 1, 2].map(bossSeamSegmentLabel), ["A–B", "B–C", "C–D"]);
  const source = boss(150, { epicLog: { round: 2, actionIds: [spezzata.id] }, seam: chain });
  const tear = (placements, targets = ["dars", "mira"]) => buildBossActionGroupMutation({ profile, action: strappareTutte, sourceItem: source,
    targetItems: targets.map((id) => creature(id, 60)), outcomes: Object.fromEntries(targets.map((id) => [id, "failed"])), componentAmounts: { force: 18, psychic: 18 },
    actionInstanceId: "boss-action:tear", round: 2, areaPlacements: placements });
  // Dars stands in the A–B and the C–D line: still one target, one save, 36 damage.
  const torn = tear([line(points[3], points[2], ["dars"]), line(points[0], points[1], ["dars", "mira"])]);
  assert.deepEqual(torn.causality.targets.map((target) => [target.id, target.requestedDamage]), [["dars", 36], ["mira", 36]]);
  assert.deepEqual(torn.causality.area.segments, [0, 2]);
  assert.deepEqual(torn.causality.area.areaTargetIds, ["dars", "mira"]);
  assert.match(torn.causality.manualVerification.steps[0], /2 linee di 20 ft\. posate dal GM sulle cuciture scelte \(A–B, C–D\)/);
  const after = torn.options.metadataPatches[0].fields.bossActionState.value;
  assert.equal(after.seam, undefined, "every seam is torn");
  assert.deepEqual(after.epicLog.actionIds, [spezzata.id, strappareTutte.id]);
  assert.throws(() => tear([line(points[0], points[2], ["dars"])]), /non segue una cucitura/);
  assert.throws(() => tear([line(points[0], points[1], ["dars"]), line(points[1], points[0], ["dars"])]), /non segue una cucitura del round \(o la ripete\)/);
  assert.throws(() => tear([]), /Scegli almeno una cucitura/);
  assert.throws(() => buildBossActionGroupMutation({ profile, action: strappareTutte, sourceItem: boss(150, { epicLog: { round: 2, actionIds: [spezzata.id] } }),
    targetItems: [creature("dars", 60)], outcomes: { dars: "failed" }, componentAmounts: { force: 18, psychic: 18 }, actionInstanceId: "x", round: 2,
    areaPlacements: [line(points[0], points[1], ["dars"])] }), /non c’è più|non ci sono più/);
  // The console sends the shown lines as areaPlacements once at least one is shown.
  const targets = [creature("dars", 60), creature("mira", 60)];
  const selection = validateBossActionGroupSelection({ sourceId: "shothragoth", action: strappareTutte, targetIds: ["dars", "mira"], targets,
    outcomes: { dars: "failed", mira: "passed" }, componentAmounts: { force: 18, psychic: 18 }, areas: [line(points[0], points[1], ["dars", "mira"])] });
  assert.equal(selection.ok, true);
  assert.equal(selection.value.areaPlacements.length, 1);
  assert.match(validateBossActionGroupSelection({ sourceId: "shothragoth", action: strappareTutte, targetIds: ["dars"], targets,
    outcomes: { dars: "failed" }, componentAmounts: { force: 18, psychic: 18 }, areas: [] }).error, /Scegli le cuciture da strappare/);
});

test("a portal on every point of the chain, attached to its segment and marked as part of the seam", () => {
  const specs = bossSeamChainPortalSpecs({ baseId: "seam", segmentIds: ["seam-s1", "seam-s2", "seam-s3"], sourceId: "shothragoth", actionInstanceId: "a", points });
  assert.deepEqual(specs.map((spec) => [spec.id, spec.attachedTo, spec.position, spec.metadata[BOSS_SEAM_ITEM_KEY].portal]), [
    ["seam-portal-1", "seam-s1", points[0], "A"], ["seam-portal-2", "seam-s1", points[1], "B"],
    ["seam-portal-3", "seam-s2", points[2], "C"], ["seam-portal-4", "seam-s3", points[3], "D"]]);
  assert.deepEqual(bossSeamChainPortalSpecs({ baseId: "seam", segmentIds: ["seam-s1"], sourceId: "shothragoth", points }), [], "one segment id per segment");
});

test("the area tool: a line may start on a given point (lineStart), only when the request asks for it", async () => {
  const tool = await readFile(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");
  assert.match(tool, /return rule\?\.geometry\?\.shape === "line" && start && !context\?\.presetLine \? start : null;/);
  assert.match(tool, /lineStart: normalizedLineStart\(data\?\.context, rule\),/);
  assert.match(tool, /: constrained && placement\.lineStart\n    \? placement\.lineStart/);
  assert.match(tool, /state\.originCellCenter = state\.lineStart \|\| snapped\?\.position \|\| corner;/);
});
