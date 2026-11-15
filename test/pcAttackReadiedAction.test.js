// Ready in the attack console's Azioni tab, and the readied action going off with an attack (lot T3 of
// docs/STUDIO_AZIONI_DI_TURNO.md, decision D8): the pill of the card's menu, «Innesca con un attacco» that opens the
// console off turn with the reaction, «Innesca senza attacco» as before.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { PC_TURN_ACTION_NOTES, buildPcTurnActionMutation, pcAttackTurnActionEntries, pcTurnActionBlocker } = await import("../src/pcAttackTurnActionCore.js");
const { NEXT_OWN_TURN_START_EXPIRY, READIED_ACTION_CONDITION } = await import("../src/reactionTrackerCore.js");
const { buildInitiativeCardContextMenuPayload, routeInitiativeCardContextMenuAction } = await import("../src/initiativeMenuActionsCore.js");
const { isAllowedInitiativeCardMenuAction } = await import("../src/menuPopoverProtocolCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const META = "com.thebigpicture.initiative/meta";
const creature = (id, meta = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "IMAGE", layer: "CHARACTER",
  position: { x: 0, y: 0 }, metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, attitude: "pc", ...meta } } });
const turnState = { round: 2, order: ["aria", "ghoul"], current: 0 };
const readied = (name = READIED_ACTION_CONDITION) => ({ conditions: { instances: [{ id: "r1", condition: name, sourceId: "aria", active: true }] } });

test("Preparare: in the Azioni tab after Nascondersi, on the creature's own turn, once", () => {
  assert.deepEqual(pcAttackTurnActionEntries().map((entry) => entry.key).slice(-1), ["turn-action::ready"]);
  assert.equal(pcAttackTurnActionEntries().at(-1).label, "Preparare");
  assert.match(PC_TURN_ACTION_NOTES.ready, /Innesca con un attacco/);
  assert.equal(pcTurnActionBlocker({ kind: "ready", sourceItem: creature("aria"), turnState }), "");
  assert.match(pcTurnActionBlocker({ kind: "ready", sourceItem: creature("aria"), turnState: { ...turnState, current: 1 } }), /Solo nel turno della creatura/);
  assert.match(pcTurnActionBlocker({ kind: "ready", sourceItem: creature("aria", readied()), turnState }), /Ha già un'azione preparata/);
  assert.match(pcTurnActionBlocker({ kind: "ready", sourceItem: creature("aria", readied("azione preparata")), turnState }), /Ha già un'azione preparata/,
    "the name as the card's menu reads it, whatever its case");
});

test("Preparare puts the card menu's pill: «Azione preparata» on the creature until the start of its next turn", () => {
  const ready = buildPcTurnActionMutation({ kind: "ready", sourceItem: creature("aria"), attackInstanceId: "ready-1", turnState });
  const [add, automate] = ready.operations;
  assert.deepEqual([add.type, add.conditionName, add.targetIds, add.options.sourceId], ["condition:add", READIED_ACTION_CONDITION, ["aria"], "aria"]);
  assert.deepEqual(add.options.expiry, NEXT_OWN_TURN_START_EXPIRY);
  assert.deepEqual([add.options.appliedAt.round, add.options.appliedAt.actorId], [2, "aria"]);
  assert.deepEqual(automate, { type: "condition:automate", subjectIds: ["aria"] });
  assert.deepEqual([ready.options.label, ready.causality.turnAction], ["Aria: Preparare", { kind: "ready", condition: READIED_ACTION_CONDITION }]);
  const event = { id: "e", sessionId: "s", sequence: 1, version: 3, at: 1, source: "automatic", kind: "pc-attack", category: "attack",
    action: "change", label: ready.options.label, payload: ready.options.history.payload, targets: ready.causality.targets };
  const lines = buildCombatLogPresentation({ id: "s" }, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  assert.match(lines, /Azione: Preparare · fino all'inizio del suo prossimo turno, si innesca con la reazione/);
});

test("the card menu: «Innesca con un attacco» for a creature the console shows, routed to its own handler", async () => {
  const entry = (extra = {}) => ({ id: "aria", name: "Aria", attitude: "pc", ...readied(), ...extra });
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: entry({ pcAttackConsole: true }), scopeIds: ["aria"] }).readiedAttack, true);
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: entry(), scopeIds: ["aria"] }).readiedAttack, undefined,
    "nothing to attack with in the console");
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: entry({ pcAttackConsole: true, conditions: { instances: [] } }), scopeIds: ["aria"] })
    .readiedAttack, undefined, "no readied action");
  assert.equal(isAllowedInitiativeCardMenuAction("readied-action-attack"), true);
  const calls = [];
  const handlers = { triggerReadiedActionWithAttack: async (sourceEntry) => calls.push(sourceEntry.id) };
  assert.equal(await routeInitiativeCardContextMenuAction({ sourceEntry: entry(), scopeIds: ["aria"] }, { action: "readied-action-attack" }, handlers), true);
  assert.deepEqual(calls, ["aria"]);
  // The menu's words: with an attack, then without; a creature without attacks keeps the one entry as before.
  const menu = readFileSync(new URL("../src/initiative-card-context-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('makeAction(root, "Innesca con un attacco", "mark.svg", "readied-action-attack"'));
  assert.ok(menu.includes('payload.readiedAttack ? "Innesca senza attacco" : "Innesca azione preparata"'));
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const handler = tracker.slice(tracker.indexOf("async function __triggerReadiedActionWithAttackFromContext"));
  assert.ok(handler.slice(0, handler.indexOf("\n}")).includes("await openPcAttackConsoleForActor(itemId);"), "the console, as the card's 🗡️ opens it");
  assert.ok(tracker.includes("triggerReadiedActionWithAttack: __triggerReadiedActionWithAttackFromContext,"));
});
