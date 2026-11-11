// CAP-CARRIAGE (Xanathar): Watery Sphere carries the creatures it holds, with its capacity, and its ram gives the cast's
// own Trattenuto. The owner's decisions C-D1–C-D5 of 11/11/2026.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ID } from "../src/constants.js";
import { carriageUnits, expandCarriageConditionAdd } from "../src/zoneCarriageCore.js";
import { getAreaSaveAutomation } from "../src/spells-srd.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { getSpellActiveResolutionActions } from "../src/spellActiveResolutionRules.js";
import { buildZoneTriggerReminderResolution } from "../src/reminderResolutionCore.js";

const META = `${ID}/meta`;
const SPHERE = "sphere-instance";
const EFFECT = "watery-sphere-restrained";
const CARRIAGE = { capacity: 4, largeUnits: 4 };

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
  assert.match(coordinator, /operation\?\.options\?\.mechanics\?\.carriage\) \{\s*return expandCarriageConditionAdd\(operation, sceneItems\)\.operations;/u);
  assert.match(coordinator, /for \(const carried of carriedItems\) \{\s*suppressMovementHistory\(carried\.id, carried\.afterPosition/u);
});

test("C-D5: la pill dice il TS a fine turno, non una prova con un'azione; la capienza è dichiarata", () => {
  const [rule] = getAreaSaveAutomation("xanathar-sfera-acquea").failed;
  assert.equal(rule.effectId, EFFECT);
  assert.deepEqual(rule.mechanics, { carriage: CARRIAGE });
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
  assert.deepEqual(applied[0].options.mechanics, { carriage: CARRIAGE });
  assert.equal(applied[0].options.saveReminder.timing, "turn-end");
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
