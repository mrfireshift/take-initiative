// CAP-CARRIAGE (Xanathar): Watery Sphere carries the creatures it holds, with its capacity, and its ram gives the cast's
// own Trattenuto. The owner's decisions C-D1–C-D5 of 11/11/2026.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ID } from "../src/constants.js";
import {
  carriageEjectionRequests,
  carriageExitOf,
  carriageUnits,
  CARRIAGE_FOLLOW_COMMAND_ID,
  expandCarriageConditionAdd,
  planCarriageFollow,
  spellCarriageExit,
} from "../src/zoneCarriageCore.js";
import { normalizeSaveSpellAutomation } from "../src/saveSpellCore.js";
import { getAreaSaveAutomation } from "../src/spells-srd.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { getSpellActiveResolutionActions } from "../src/spellActiveResolutionRules.js";
import {
  buildEffectSaveReminderResolution,
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
} from "../src/reminderResolutionCore.js";

const META = `${ID}/meta`;
const SPHERE = "sphere-instance";
const EFFECT = "watery-sphere-restrained";
const CARRIAGE = { capacity: 4, largeUnits: 4 };
// The sphere's own: those that make the save leave it, one that falls out lands within a square (SA-D1, SA-D2).
const SPHERE_CARRIAGE = { ...CARRIAGE, exitOnSave: true, fallWithinSquares: 1 };
// Let go, it comes down; only the one that leaves with its save falls (H-3, H-4).
const SPHERE_MECHANICS = { carriage: SPHERE_CARRIAGE, landing: { fall: "on-exit" } };

// A token cells wide on the grid (tokenCells): the image one square at scale 1.
const token = (id, cells = 1, held = false) => ({
  id,
  name: id,
  type: "IMAGE",
  layer: "CHARACTER",
  image: { width: 140, height: 140 },
  grid: { dpi: 140 },
  scale: { x: cells, y: cells },
  metadata: { [META]: { conditions: { version: 2, instances: held
    ? [{ id: `${id}-held`, condition: "Trattenuto", active: true, parentEffectId: SPHERE, effectId: EFFECT, expiry: { mode: "concentration" } }]
    : [] } } },
});
const add = (targetIds) => ({
  type: "condition:add",
  targetIds,
  conditionName: "Trattenuto",
  options: { parentEffectId: SPHERE, effectId: EFFECT, sourceId: "caster", sourceName: "Sera", mechanics: { carriage: CARRIAGE } },
});
const first = () => 0;

test("la taglia dal token: fino a Media 1, Grande tutta la capienza, Enorme o più grande non entra", () => {
  assert.equal(carriageUnits(token("m", 1), CARRIAGE), 1);
  assert.equal(carriageUnits(token("l", 2), CARRIAGE), 4);
  assert.equal(carriageUnits(token("h", 3), CARRIAGE), null);
  assert.equal(carriageUnits(token("g", 4), CARRIAGE), null);
});

test("C-D4: una quinta creatura Media fa cadere fuori, Prona, una creatura a caso già trattenuta", () => {
  const items = [token("a", 1, true), token("b", 1, true), token("c", 1, true), token("d", 1, true), token("e")];
  const result = expandCarriageConditionAdd(add(["e"]), items, { random: first });
  assert.deepEqual(result.keptIds, ["e"]);
  assert.deepEqual(result.fallenIds, ["a"]);
  assert.deepEqual(result.operations.map((operation) => operation.type),
    ["condition:add", "condition:remove-instances", "condition:add", "condition:automate"]);
  assert.deepEqual(result.operations[1].removals, [{ itemId: "a", instanceId: "a-held" }]);
  assert.equal(result.operations[2].conditionName, "Prono");
  assert.deepEqual(result.operations[2].targetIds, ["a"]);
  assert.equal(result.operations[2].options.parentEffectId, undefined, "il Prono resta quando la sfera finisce");
});

test("C-D3: una Grande riempie la sfera; con una Media già dentro, la Media cade fuori", () => {
  const empty = expandCarriageConditionAdd(add(["ogre"]), [token("ogre", 2)], { random: first });
  assert.deepEqual(empty.keptIds, ["ogre"]);
  assert.deepEqual(empty.fallenIds, []);
  const crowded = expandCarriageConditionAdd(add(["ogre"]), [token("goblin", 1, true), token("ogre", 2)], { random: first });
  assert.deepEqual(crowded.keptIds, ["ogre"]);
  assert.deepEqual(crowded.fallenIds, ["goblin"]);
});

test("C-D3: un'Enorme supera da sola, e due Grandi al lancio ne lasciano dentro una sola", () => {
  const huge = expandCarriageConditionAdd(add(["giant"]), [token("giant", 3)], { random: first });
  assert.deepEqual(huge.tooLargeIds, ["giant"]);
  assert.deepEqual(huge.operations, []);
  const cast = expandCarriageConditionAdd(add(["ogre", "troll"]), [token("ogre", 2), token("troll", 2)], { random: () => 0.9 });
  assert.deepEqual(cast.keptIds, ["ogre"]);
  assert.deepEqual(cast.fallenIds, ["troll"]);
  assert.equal(cast.operations.some((operation) => operation.type === "condition:remove-instances"), false);
});

test("entro la capienza non cambia nulla, e un'operazione senza la capienza resta com'è nel coordinatore", () => {
  const items = [token("a", 1, true), token("b")];
  const result = expandCarriageConditionAdd(add(["b"]), items, { random: first });
  assert.deepEqual(result.operations, [add(["b"])]);
  const coordinator = fs.readFileSync(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  assert.match(coordinator, /operation\?\.options\?\.mechanics\?\.carriage\) \{\s*const expansion = expandCarriageConditionAdd\(operation, sceneItems\);\s*derived\?\.carriageEjections\?\.push\(\.\.\.carriageEjectionRequests\(operation, expansion\)\);/u);
  assert.match(coordinator, /derived\?\.carriageLifts\?\.push\(\.\.\.expansion\.keptIds\.map\(\(targetId\) => \(\{ targetId, instanceId \}\)\)\);\s*\}\s*return expansion\.operations;/u);
  assert.match(coordinator, /for \(const carried of carriedItems\) \{\s*suppressMovementHistory\(carried\.id, carried\.afterPosition/u);
});

test("C-D5: la pill dice il TS a fine turno, non una prova con un'azione; la capienza è dichiarata", () => {
  const [rule] = getAreaSaveAutomation("xanathar-sfera-acquea").failed;
  assert.equal(rule.effectId, EFFECT);
  assert.deepEqual(rule.mechanics, SPHERE_MECHANICS);
  assert.deepEqual(rule.summaryParts.map((part) => part.label), ["TS For a fine turno"]);
  assert.doesNotMatch(rule.effectDetail, /azione/u);
});

test("C-D1: il ⚡ Sposta la sfera, un'azione fino a 9 m che porta con sé i trattenuti", () => {
  const sphere = getSpellAreaRuleById("xanathar-sfera-acquea:cast");
  assert.equal(sphere.zonePolicy.movement.mode, "action");
  assert.equal(sphere.zonePolicy.movement.maximumMeters, 9);
  assert.deepEqual([...sphere.zonePolicy.movement.carriedEffectIds], [EFFECT]);
  const [move] = getSpellActiveResolutionActions("xanathar-sfera-acquea");
  assert.equal(move.id, "watery-sphere-move");
  assert.equal(move.resolutionKind, "zone-movement");
  assert.equal(move.economy, "action");
  assert.equal(move.placementRuleId, "xanathar-sfera-acquea:cast");
  assert.deepEqual([...move.carriedEffectIds], [EFFECT]);
});

test("C-D2: chi viene investito e fallisce ha lo stesso Trattenuto del lancio, con la capienza", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "ram-1",
      resolution: "manual-save",
      triggerId: "watery-sphere-save-on-ram",
      spellId: "xanathar-sfera-acquea",
      instanceId: SPHERE,
      zoneItemId: "sphere-root",
      resolutionData: { ability: "str", failureAutomation: "spell-save", spellId: "xanathar-sfera-acquea" },
    },
    targetId: "goblin",
    sourceId: "caster",
    sourceName: "Sera",
  });
  const applied = resolution.outcomes.failed.actions.filter((action) => action.kind === "condition");
  assert.equal(applied.length, 1, JSON.stringify(applied));
  assert.equal(applied[0].name, "Trattenuto");
  assert.equal(applied[0].options.effectId, EFFECT);
  assert.equal(applied[0].options.parentEffectId, SPHERE);
  assert.equal(applied[0].options.expiry.mode, "concentration");
  assert.deepEqual(applied[0].options.mechanics, SPHERE_MECHANICS);
  assert.equal(applied[0].options.saveReminder.timing, "turn-end");
});

test("SA-D1 e SA-D2: la capienza della sfera dice chi esce e dove atterra chi cade fuori", () => {
  assert.deepEqual(carriageExitOf({ carriage: SPHERE_CARRIAGE }), { fallWithinSquares: 1 });
  assert.equal(carriageExitOf({ carriage: CARRIAGE }), null, "una capienza senza uscita resta com'era");
  assert.deepEqual(
    spellCarriageExit(normalizeSaveSpellAutomation(getAreaSaveAutomation("xanathar-sfera-acquea"))),
    { fallWithinSquares: 1 },
  );
  assert.equal(spellCarriageExit(normalizeSaveSpellAutomation(getAreaSaveAutomation("xanathar-turbine") || {})), null);
  const sphereAdd = { ...add(["e"]), options: { ...add(["e"]).options, mechanics: { carriage: SPHERE_CARRIAGE } } };
  assert.deepEqual(carriageEjectionRequests(sphereAdd, { fallenIds: ["a"], tooLargeIds: ["giant"] }), [
    { targetId: "a", instanceId: SPHERE, withinSquares: 1, reason: "fall-out" },
    { targetId: "giant", instanceId: SPHERE, withinSquares: null, reason: "too-large" },
  ]);
  assert.deepEqual(carriageEjectionRequests(add(["e"]), { fallenIds: ["a"] }), [], "senza uscita nessuno si sposta");
});

test("SA-D1: chi viene investito e supera esce dalla sfera, nello stesso comando dell'urto", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "ram-2",
      resolution: "manual-save",
      triggerId: "watery-sphere-save-on-ram",
      spellId: "xanathar-sfera-acquea",
      spellName: "Sfera Acquea",
      instanceId: SPHERE,
      zoneItemId: "sphere-root",
      resolutionData: { ability: "str", failureAutomation: "spell-save", spellId: "xanathar-sfera-acquea" },
    },
    targetId: "goblin",
    sourceId: "caster",
    sourceName: "Sera",
  });
  assert.deepEqual(resolution.outcomes.passed.actions, [{
    kind: "zone",
    action: "eject",
    targetId: "goblin",
    parentEffectId: SPHERE,
    options: { spellName: "Sfera Acquea" },
  }]);
  assert.equal(resolution.outcomes.failed.actions.some((action) => action.kind === "zone"), false);
});

test("SA-D1: chi supera il TS a fine turno perde Trattenuto ed esce dalla sfera", () => {
  const saveReminder = { ability: "str", timing: "turn-end", dcSource: "source-spell", label: "Se supera il TS, esce dalla sfera." };
  const instance = {
    id: "goblin-held",
    condition: "Trattenuto",
    active: true,
    targetId: "goblin",
    type: "spell",
    sourceId: "caster",
    parentEffectId: SPHERE,
    effectId: EFFECT,
    spellName: "Sfera Acquea",
    expiry: { mode: "concentration" },
    mechanics: { carriage: SPHERE_CARRIAGE },
    saveReminder,
  };
  const goblin = { ...token("goblin"), metadata: { [META]: { conditions: { version: 2, instances: [instance] } } } };
  const resolution = buildEffectSaveReminderResolution({
    item: goblin,
    instance,
    reminder: saveReminder,
    dc: 15,
    activationId: "goblin-save-1",
    turnKey: "turn-1",
  });
  const plan = buildReminderResolutionPlan({
    notice: { activationId: "goblin-save-1", resolution, targets: [{ id: "goblin" }] },
    items: [goblin, token("caster")],
    outcome: "passed",
  });
  assert.equal(plan.status, "ready", JSON.stringify(plan));
  assert.deepEqual(plan.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "goblin", instanceId: "goblin-held" }],
  }]);
  assert.deepEqual(plan.sideEffects.filter((effect) => effect.type === "token:eject-from-zone"), [{
    type: "token:eject-from-zone",
    instanceId: SPHERE,
    targetIds: ["goblin"],
    spellName: "Sfera Acquea",
  }]);
  const failed = buildReminderResolutionPlan({
    notice: { activationId: "goblin-save-2", resolution, targets: [{ id: "goblin" }] },
    items: [goblin, token("caster")],
    outcome: "failed",
  });
  assert.equal(failed.sideEffects.some((effect) => effect.type === "token:eject-from-zone"), false, "chi fallisce resta");
  const oldPill = { ...instance, mechanics: { carriage: CARRIAGE } };
  const old = buildEffectSaveReminderResolution({ item: goblin, instance: oldPill, reminder: saveReminder, dc: 15,
    activationId: "goblin-save-3", turnKey: "turn-1" });
  assert.equal(old.outcomes.passed.actions.some((action) => action.kind === "zone"), false,
    "una pill di una sfera lanciata prima resta com'era");
});

test("SA-D5: la sfera trascinata a mano si porta dietro i trattenuti, dello stesso spostamento", () => {
  const at = (item, x, y) => ({ ...item, position: { x, y } });
  const root = (position, control) => ({
    id: "sphere-root", instanceId: SPHERE, position, control, carriedEffectIds: [EFFECT],
  });
  const items = [at(token("a", 1, true), 100, 100), at(token("b", 1, true), 200, 100), at(token("free"), 150, 150)];
  const [entry] = planCarriageFollow({
    roots: [root({ x: 400, y: 250 }, { commandId: "move-1", position: { x: 250, y: 100 } })],
    items,
  });
  assert.equal(entry.rootId, "sphere-root");
  assert.deepEqual(entry.control, { commandId: CARRIAGE_FOLLOW_COMMAND_ID, position: { x: 400, y: 250 } });
  assert.deepEqual(entry.moves, [{ id: "a", position: { x: 250, y: 250 } }, { id: "b", position: { x: 350, y: 250 } }],
    "solo i trattenuti, chi è libero resta");
  const [together] = planCarriageFollow({
    roots: [root({ x: 400, y: 250 }, { commandId: "move-1", position: { x: 250, y: 100 } })],
    items,
    movedIds: ["sphere-root", "b"],
  });
  assert.deepEqual(together.moves.map((move) => move.id), ["a"], "chi è stato trascinato con la sfera non si sposta due volte");
});

test("SA-D5: dove il plugin l'ha lasciata non succede nulla; una sfera senza riferimento lo riceve soltanto", () => {
  const items = [{ ...token("a", 1, true), position: { x: 100, y: 100 } }];
  assert.deepEqual(planCarriageFollow({
    roots: [{ id: "sphere-root", instanceId: SPHERE, position: { x: 250, y: 100 },
      control: { commandId: "undo", position: { x: 250, y: 100 } }, carriedEffectIds: [EFFECT] }],
    items,
  }), [], "il ⚡ e il suo Annulla scrivono già dove la mettono");
  assert.deepEqual(planCarriageFollow({
    roots: [{ id: "sphere-root", instanceId: SPHERE, position: { x: 250, y: 100 }, carriedEffectIds: [EFFECT] }],
    items,
  }), [{ rootId: "sphere-root", control: { commandId: CARRIAGE_FOLLOW_COMMAND_ID, position: { x: 250, y: 100 } }, moves: [] }]);
  assert.deepEqual(planCarriageFollow({
    roots: [{ id: "moonbeam-root", instanceId: SPHERE, position: { x: 500, y: 100 },
      control: { commandId: "move-1", position: { x: 250, y: 100 } }, carriedEffectIds: [] }],
    items,
  }), [], "una zona che non trasporta nessuno resta fuori");
  const reconcile = fs.readFileSync(new URL("../src/spellStaticZone.js", import.meta.url), "utf8");
  const follow = reconcile.indexOf("const carriageFollow = planCarriageFollow({");
  assert.ok(follow > reconcile.indexOf("const followCasterUpdates = zoneRoots"), "dopo le zone che seguono il caster");
  assert.ok(follow < reconcile.indexOf("const desiredTargetIds = scopedStaticSpellZoneTargetIds({"),
    "prima di chi è dentro le zone");
});

test("SA-D4: quando la sfera finisce, il caster ha il promemoria delle fiamme spente fino alla fine del suo turno", async () => {
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const { staticSpellZoneOwnerOperation } = await import("../src/spellStaticZoneCore.js");
  const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
  const spell = getSpellDefinition("xanathar-sfera-acquea");
  const owner = staticSpellZoneOwnerOperation({
    rule: getSpellAreaRuleById("xanathar-sfera-acquea:cast"),
    spell,
    instanceId: SPHERE,
    casterId: "caster",
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    trackConcentration: true,
  });
  assert.equal(owner.onSpellEnd[0].id, "watery-sphere-flames-out");
  const state = (id) => ({ id, name: id, spells: [], concentrations: {}, conditions: [] });
  const applied = buildEffectsMutationPlan([state("caster")], [owner, {
    type: "concentration:register",
    casterIds: ["caster"],
    reference: SPHERE,
    name: spell.displayName,
  }]);
  const ended = buildEffectsMutationPlan(applied.states, [{
    type: "spell:remove-instance",
    targetIds: ["caster"],
    instanceId: SPHERE,
  }]);
  const caster = ended.states.find((entry) => entry.id === "caster");
  assert.deepEqual(caster.spells, []);
  const [flames] = caster.conditions;
  assert.equal(flames.condition, "Fiamme spente (9 m)");
  assert.equal(flames.expiry.mode, "turn-end");
  assert.equal(flames.expiry.actorId, "caster");
  assert.equal(flames.manualRemoval, true);
  assert.equal(flames.parentEffectId, undefined, "resta dopo la fine della sfera");
});

test("H-1 e SA-D6: la quota si imposta sulla sfera e la pill lo dice; la sfera ha il colore della sua scuola", async () => {
  const [rule] = getAreaSaveAutomation("xanathar-sfera-acquea").failed;
  assert.match(rule.effectDetail, /Sta alla quota della sfera, fino a 3 m da terra \(«Imposta quota…» sulla sfera\)\./u);
  assert.equal(getSpellAreaRuleById("xanathar-sfera-acquea:cast").placementNote,
    "Galleggia fino a 3 m da terra: «Imposta quota…» sulla sfera, e chi trattiene la segue. Quando finisce cade e spegne le fiamme normali entro 9 m.");
  const { spellColorFor } = await import("../src/spellColorCore.js");
  for (const [key, theme] of [
    ["xanathar-sfera-acquea", "conjuration"], ["Sfera Acquea", "conjuration"],
    ["xanathar-onda-di-marea", "conjuration"], ["Onda di Marea", "conjuration"],
    ["xanathar-vento-di-interdizione", "evocation"], ["Vento di Interdizione", "evocation"],
    ["xanathar-immolazione", "fire"],
  ]) assert.equal(spellColorFor(key).theme, theme, key);
});

test("la taglia è quella di tokenSizeCore.js: la copia locale conta le stesse caselle", async () => {
  const { tokenCells } = await import("../src/tokenSizeCore.js");
  for (const cells of [1, 2, 3, 4]) {
    const item = token(`t${cells}`, cells);
    const units = carriageUnits(item, CARRIAGE);
    assert.equal(tokenCells(item), cells);
    assert.equal(units, cells >= 3 ? null : cells === 2 ? 4 : 1);
  }
  assert.equal(carriageUnits({ id: "shape", type: "SHAPE" }, CARRIAGE), 1, "senza immagine conta come una casella");
});

test("nella stanza: la sfera va posata, il caster tiene il suo record e lo strumento conferma lo spostamento", () => {
  // The panel asks for the sphere before the cast: without it only the caster's concentration was left, with no ⚡.
  assert.equal(getSpellAreaRuleById("xanathar-sfera-acquea:cast").zonePolicy.placementOptional, false);
  const read = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  // A zone that carries creatures keeps its record on the caster even when the creatures it holds carry theirs.
  const executor = read("spellAreaResolutionExecutor.js");
  assert.ok(executor.includes("const carriesCreatures = (placementRule?.zonePolicy?.movement?.carriedEffectIds?.length || 0) > 0;"));
  assert.ok(executor.includes("trackConcentration: spell.concentration === true && (!hasTrackedSpellInstance || carriesCreatures),"));
  // The tool's ✓ and ✕ show during a zone's movement too, and confirm or cancel it.
  const tool = read("aoeTargetTool.js");
  assert.ok(tool.includes("label: \"Conferma movimento\""));
  assert.ok(tool.includes("label: \"Annulla movimento\""));
  assert.ok(tool.includes("? confirmSpellZoneMovement()"));
  assert.ok(tool.includes("? closeSpellZoneMovement(\"cancelled\", { reason: \"action\" })"));
});

test("lo spostamento a caselle intere, entro i 9 m, nella stessa direzione del trascinamento", async () => {
  const { snappedSpellZoneMovementDelta: snap } = await import("../src/spellZoneMovementCore.js");
  const grid = { dpi: 70, scale: { multiplier: 1.5, unit: "m" }, maximumMeters: 9 };
  assert.deepEqual(snap({ x: 200, y: 0 }, grid), { x: 210, y: 0 }, "3 caselle");
  assert.deepEqual(snap({ x: -100, y: 30 }, grid), { x: -70, y: 0 });
  assert.deepEqual(snap({ x: 20, y: -20 }, grid), { x: 0, y: 0 }, "un tremolio non la sposta");
  assert.deepEqual(snap({ x: 1000, y: 0 }, grid), { x: 420, y: 0 }, "fino a 9 m, 6 caselle");
  assert.deepEqual(snap({ x: 500, y: 500 }, grid), { x: 280, y: 280 }, "in diagonale 4 + 4, 8,5 m");
  assert.deepEqual(snap({ x: 300, y: 0 }, { ...grid, maximumMeters: null }), { x: 280, y: 0 }, "senza limite");
  const read = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const tool = read("aoeTargetTool.js");
  assert.ok(tool.includes("const delta = snappedSpellZoneMovementDelta("), "lo strumento sposta a caselle intere");
  assert.ok(tool.includes("const anchor = runtime.zoneCenter || state.rawStart;"), "il centro della zona segue il puntatore");
  assert.ok(tool.includes("return area ? point(areaLabelPosition(area)) : null;"), "il centro è quello della sua area");
  assert.ok(tool.includes("runtime.previewInteraction = area && state.proposedPosition ? state.interaction : null;"),
    "l'anteprima resta dopo il rilascio");
  assert.ok(tool.includes("runtime.previewInteraction?.[1]?.();\n  runtime.previewInteraction = null;\n  spellMovementSession = null;"),
    "e sparisce con ✓ o ✕");
});
