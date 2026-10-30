import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ACTIVE_TURN_LABEL_META, ID } from "../src/constants.js";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";
import { planIncrementalTrackerItemRender } from "../src/initiativeIncrementalRenderCore.js";

// A player assigned from the card menu stayed off the card until a reload (30/10, during a game): the tracker
// dropped every token change landing while it wrote the turn label. The label never reaches that handler on its own.
const META = `${ID}/meta`;
const token = (meta = {}) => ({
  id: "omar", name: "Omar", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { inInitiative: true, attitude: "pc", hp: 20, hpMax: 20, initiative: 12, ...meta } },
});
const label = (extra = {}) => ({
  id: "label", name: "Turno attuale", type: "TEXT", layer: "TEXT", attachedTo: "omar", position: { x: 0, y: -40 },
  visible: true, metadata: { [ACTIVE_TURN_LABEL_META]: { enabled: true } }, ...extra,
});
const reachesTracker = (event) => event.flags.tracker || event.flags.visibility;

test("l'etichetta del turno, creata, spostata o nascosta, non arriva al gestore del tracker", () => {
  assert.equal(reachesTracker(classifySceneItemChanges([token()], [token(), label()])), false, "created");
  assert.equal(reachesTracker(classifySceneItemChanges([token(), label()], [token(), label({ position: { x: 9, y: 9 } })])), false, "moved");
  assert.equal(reachesTracker(classifySceneItemChanges([token(), label()], [token(), label({ visible: false })])), false, "hidden");
  assert.equal(reachesTracker(classifySceneItemChanges([token(), label()], [token()])), false, "removed");
});

test("il giocatore assegnato a un token del tracker lo ridisegna, anche insieme all'etichetta", () => {
  const assigned = token({ assignedPlayer: { id: "user-mario", name: "Mario", color: "" } });
  const event = classifySceneItemChanges([token(), label()], [assigned, label({ position: { x: 9, y: 9 } })]);
  assert.equal(reachesTracker(event), true);
  assert.equal(planIncrementalTrackerItemRender(event).mode, "full");
});

test("il tracker non sospende i cambi dei token mentre scrive l'etichetta; la memoria precede il token", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /if \(__mutatingActiveLabel > 0\) return;/);
  const setter = source.slice(source.indexOf("async function __setCardPlayer("), source.indexOf("function __syncPlayerScreenButton("));
  assert.ok(setter.indexOf("rememberPlayerAssignment(item, player)") < setter.indexOf("writePlayerAssignment([entry.id], player"),
    "«Nessuno»: the memory forgets the player before the token loses them");
});
