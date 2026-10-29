import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { attachmentBehaviorsWith, hasAttachmentBehaviors, unrotatedTokenBounds } from "../src/tokenFootprintCore.js";
import { classifySceneItemSnapshots, createSceneItemsSnapshot } from "../src/sceneItemChangeDispatcherCore.js";

// Lot L20 of the bugfix pass, polish R3 "Etichetta del turno e barra dei PF": the map HP bar follows the token's scale
// but never its rotation; the effect pills never turn with their token; the turn label goes on the boss during an Epic
// Action.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const META_KEY = "com.thebigpicture.initiative/meta";

test("L20: la barra dei PF si misura sul token non ruotato, alla sua scala", () => {
  const token = (rotation, scale = 1) => ({ rotation, scale: { x: scale, y: scale }, image: { width: 300, height: 300 }, grid: { dpi: 300 } });
  const turned = { min: { x: 79, y: 79 }, max: { x: 221, y: 221 }, width: 142, height: 142 };
  const upright = unrotatedTokenBounds(turned, token(45), 100);
  assert.deepEqual([upright.min, upright.max, upright.width, upright.height],
    [{ x: 100, y: 100 }, { x: 200, y: 200 }, 100, 100], "the box of the token, not of its turned square");
  const scaled = unrotatedTokenBounds(turned, token(45, 2), 100);
  assert.equal(scaled.width, 200, "its scale counts");
  assert.equal(unrotatedTokenBounds(turned, token(0), 100), turned, "unrotated: the bounds as they are");
  assert.equal(unrotatedTokenBounds(turned, { rotation: 30 }, 100), turned, "no image: the bounds as they are");

  const bars = read("../src/hpbar-items.js");
  assert.match(bars, /b = unrotatedTokenBounds\(b, tokenItem, sceneDpi\);/);
  assert.match(bars, /\{ filter: \(event\) => event\.flags\.hpBars \|\| event\.flags\.tokenScale \}/);
});

test("L20: scalare un token ridisegna la sua barra; ruotarlo o muoverlo no", () => {
  const token = (patch = {}) => ({ id: "orc", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, rotation: 0,
    scale: { x: 1, y: 1 }, image: { width: 300, height: 300 }, grid: { dpi: 300 },
    metadata: { [META_KEY]: { hp: 7, hpMax: 15, inInitiative: true } }, ...patch });
  const change = (after) => classifySceneItemSnapshots(createSceneItemsSnapshot([token()]), createSceneItemsSnapshot([token(after)])).flags;
  assert.equal(change({ scale: { x: 2, y: 2 } }).tokenScale, true);
  assert.equal(change({ rotation: 90 }).tokenScale, false, "the bar never turns with the token");
  assert.equal(change({ position: { x: 150, y: 0 } }).tokenScale, false, "a move: the bar goes with it, nothing to measure");
});

test("L20: le pill degli effetti restano dritte quando il token ruota", () => {
  assert.deepEqual(attachmentBehaviorsWith(["COPY"], "ROTATION"), ["COPY", "ROTATION"]);
  assert.deepEqual(attachmentBehaviorsWith(undefined, "ROTATION"), ["ROTATION"]);
  assert.equal(hasAttachmentBehaviors({ disableAttachmentBehavior: ["ROTATION"] }, "ROTATION"), true);
  assert.equal(hasAttachmentBehaviors({}, "ROTATION"), false);
  const layout = read("../src/effectsLayout.js");
  assert.match(layout, /\.attachedTo\(spec\.targetId\)\n(\s+\/\/.*\n)+\s+\.disableAttachmentBehavior\(\["ROTATION"\]\)/, "a new pill");
  assert.match(layout, /item\.disableAttachmentBehavior = attachmentBehaviorsWith\(item\.disableAttachmentBehavior, "ROTATION"\);\n\s+item\.rotation = 0;/, "a pill on the map is put right");
  assert.equal(layout.split(`!hasAttachmentBehaviors(item, "ROTATION") ||`).length - 1, 2, "both kinds of pill are updated when they still turn");
  assert.doesNotMatch(layout, /disableAttachmentBehavior\(\[[^\]]*"SCALE"/, "their size stays as it is");
});

test("L20: durante un'Azione epica l'etichetta del turno va sul boss; selezione e vista non cambiano", () => {
  const tracker = read("../src/initiativeList.js");
  const body = tracker.slice(tracker.indexOf("function __resolveAnchorForActive("), tracker.indexOf("// Trova la label attiva esistente"));
  const entries = new Map([["__EPIC__::auril::after::pc", { epicBossId: "auril" }]]);
  const { label, shared } = new Function("isEpicActionId", "isLairId", "splitParagonId", "__activeLabelEntriesById",
    `${body} return { label: __resolveLabelAnchorForActive, shared: __resolveAnchorForActive };`)(
    (id) => String(id).startsWith("__EPIC__"), (id) => id === "__LAIR__",
    (id) => ({ baseId: String(id).split("::p")[0] }), entries);
  assert.equal(label("__EPIC__::auril::after::pc"), "auril");
  assert.equal(label("__EPIC__::boss-2::after::pc"), "boss-2", "from its id when the entry is not known");
  assert.equal(label("orc::p1"), "orc");
  assert.equal(label("__LAIR__"), null, "the lair has no token");
  assert.equal(shared("__EPIC__::auril::after::pc"), null, "the selection and the view are left as they were");
  assert.match(tracker, /function syncActiveTurnLabel\(activeId\) \{\n\s+if \(!IS_GM \|\| !__activeTurnLabelRuntimeEnabled\) return;\n\s+const anchorId = __resolveLabelAnchorForActive\(activeId\);/);
});
