// The turn's actions in the attack console's Azioni tab (lot T1 of docs/STUDIO_AZIONI_DI_TURNO.md, decisions D1, D3, D4,
// D5, D12): Dash, Disengage and Dodge beside Grapple and Shove; one command each, on the creature's own turn.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  DISENGAGE_CONDITION, DODGE_CONDITION, PC_TURN_ACTION_NOTES, buildPcTurnActionMutation, pcAttackTargetNotes, pcAttackTurnActionEntries,
  pcTurnActionBlocker,
} = await import("../src/pcAttackTurnActionCore.js");
const { MAX_TURN_DASHES, consoleDashCount } = await import("../src/pcAttackTurnDashCore.js");
const { PC_ATTACK_PICKER_TABS, pcAttackPickerEntries, pcAttackPickerTabs } = await import("../src/pcAttackPickerCore.js");
const { pcAttackManeuverEntries } = await import("../src/pcAttackManeuverCore.js");
const { DISENGAGE_PILL, movementReactionEvents } = await import("../src/opportunityAttackCore.js");
const { pcAttackResolvedAction } = await import("../src/pcAttackCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const META = "com.thebigpicture.initiative/meta";
const creature = (id, meta = {}, x = 0) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "IMAGE", layer: "CHARACTER",
  position: { x, y: 0 }, metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, attitude: "pc", ...meta } } });
const pill = (condition, extra = {}) => ({ id: `${condition}-1`, condition, sourceId: "aria", active: true, ...extra });
// Aria's turn, round 2: the movement panel keys it "2:0:aria" (speedCheckCore.js, resolveSpeedCheckTurn).
const turnState = { round: 2, order: ["aria", "ghoul"], current: 0 };
const plan = (kind, sourceItem = creature("aria"), extra = {}) => buildPcTurnActionMutation({ kind, sourceItem, attackInstanceId: `${kind}-1`,
  turnState, ...extra });

test("the Azioni tab: Scatto, Disimpegno and Schivata first, then Lotta and Spinta; the tab exists for every creature", () => {
  assert.deepEqual(pcAttackTurnActionEntries().map((entry) => [entry.key, entry.tab, entry.mode, entry.label]), [
    ["turn-action::dash", "actions", "turn-action", "Scatto"],
    ["turn-action::disengage", "actions", "turn-action", "Disimpegno"],
    ["turn-action::dodge", "actions", "turn-action", "Schivata"],
  ]);
  assert.deepEqual(PC_ATTACK_PICKER_TABS.map((tab) => tab.label), ["Attacchi", "Trucchetti", "Incantesimi", "Capacità", "Azioni"]);
  assert.ok(pcAttackManeuverEntries().every((entry) => entry.tab === "actions"), "Lotta and Spinta moved there (D1)");
  // The card's own entries never leave a hole for the tab the console fills itself.
  const own = pcAttackPickerEntries({ quickActions: [{ id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing" }] }] });
  assert.ok(own.every(Boolean));
  assert.deepEqual(pcAttackPickerTabs([...own, ...pcAttackTurnActionEntries(), ...pcAttackManeuverEntries()]).map((tab) => tab.id), ["attacks", "actions"]);
  assert.ok(Object.values(PC_TURN_ACTION_NOTES).every((note) => note.length > 20));
});

test("only in combat and on the creature's own turn; Disimpegno and Schivata once, Scatto up to the panel's limit", () => {
  const aria = creature("aria");
  assert.equal(pcTurnActionBlocker({ kind: "dash", sourceItem: aria, turnState }), "");
  assert.match(pcTurnActionBlocker({ kind: "dash", sourceItem: aria, turnState: null }), /Solo in combattimento/);
  assert.match(pcTurnActionBlocker({ kind: "dodge", sourceItem: creature("ghoul"), turnState }), /Solo nel turno della creatura/);
  assert.equal(pcTurnActionBlocker({ kind: "dodge", sourceItem: aria, turnState: { round: 1, order: ["aria::p1"], current: 0 } }), "",
    "a Paragon's extra turn is its creature's");
  assert.match(pcTurnActionBlocker({ kind: "disengage", sourceItem: creature("aria", { conditions: [pill(DISENGAGE_CONDITION)] }), turnState }),
    /già il Disimpegno/);
  // Patient Defense puts the same pill: a Dodge from either is one.
  assert.match(pcTurnActionBlocker({ kind: "dodge", sourceItem: creature("aria", { conditions: { instances: [pill(DODGE_CONDITION,
    { displayLabel: "Schivata · Difesa Paziente" })] } }), turnState }), /già in Schivata/);
  const nine = creature("aria", { pcAttackState: { version: 1, turnActions: { turnKey: "2:0:aria", dashes: MAX_TURN_DASHES } } });
  assert.match(pcTurnActionBlocker({ kind: "dash", sourceItem: nine, turnState }), /Già 9 scatti/);
  assert.match(pcTurnActionBlocker({ kind: "jump", sourceItem: aria, turnState }), /non valida/);
});

test("Scatto: one more dash of this movement turn in the console state, the rest of the state kept; no pill", () => {
  const aria = creature("aria", { pcAttackState: { version: 1, lastAttack: { quickActionId: "sword" } } });
  const first = plan("dash", aria);
  assert.deepEqual(first.operations, [], "no pill");
  const [patch] = first.options.metadataPatches;
  assert.equal(patch.id, "aria");
  assert.deepEqual(patch.fields.pcAttackState.value, { version: 1, lastAttack: { quickActionId: "sword" }, turnActions: { turnKey: "2:0:aria", dashes: 1 } });
  assert.deepEqual(first.causality.turnAction, { kind: "dash", dashes: 1 });
  assert.deepEqual([first.options.kind, first.options.label, first.options.history.label], ["pc-attack", "Aria: Scatto", "Aria: Scatto"]);
  // The second dash of the turn (Cunning Action after the action) counts on; another turn's count starts afresh.
  const dashed = creature("aria", { pcAttackState: { version: 1, turnActions: { turnKey: "2:0:aria", dashes: 1 } } });
  assert.equal(plan("dash", dashed).options.metadataPatches[0].fields.pcAttackState.value.turnActions.dashes, 2);
  const stale = creature("aria", { pcAttackState: { version: 1, turnActions: { turnKey: "1:0:aria", dashes: 3 } } });
  assert.equal(plan("dash", stale).options.metadataPatches[0].fields.pcAttackState.value.turnActions.dashes, 1);
  assert.throws(() => plan("dash", creature("ghoul")), /Solo nel turno della creatura/);
});

test("Disimpegno until the end of the turn, Schivata until the start of the next: pills on the creature, from the creature", () => {
  const disengage = plan("disengage");
  const [add, automate] = disengage.operations;
  assert.deepEqual([add.type, add.conditionName, add.targetIds, add.options.sourceId], ["condition:add", "Disimpegno", ["aria"], "aria"]);
  assert.deepEqual(add.options.expiry, { mode: "turn-end", actor: "target", remaining: 1 });
  assert.equal(add.options.appliedAt.round, 2);
  assert.deepEqual(automate, { type: "condition:automate", subjectIds: ["aria"] });
  assert.equal(disengage.options.metadataPatches, undefined, "only the pill");
  assert.deepEqual(disengage.labelTargetIds, ["aria"]);
  const dodge = plan("dodge");
  assert.equal(dodge.operations[0].conditionName, "Schivata");
  assert.deepEqual(dodge.operations[0].options.expiry, { mode: "turn-start", actor: "target", remaining: 1 });
  assert.equal(dodge.options.label, "Aria: Schivata");
  assert.equal(DISENGAGE_PILL, DISENGAGE_CONDITION, "the opportunity attack prompts read the pill the console puts");
});

test("the movement panel reads the console's dashes of its own turn only", () => {
  const aria = creature("aria", { pcAttackState: { version: 1, turnActions: { turnKey: "2:0:aria", dashes: 2 } } });
  assert.equal(consoleDashCount(aria, "2:0:aria"), 2);
  assert.equal(consoleDashCount(aria, "3:0:aria"), 0, "another turn");
  assert.equal(consoleDashCount(creature("aria"), "2:0:aria"), 0);
  assert.equal(consoleDashCount(creature("aria", { pcAttackState: { turnActions: { turnKey: "2:0:aria", dashes: 40 } } }), "2:0:aria"), MAX_TURN_DASHES);
});

test("Disimpegno: leaving a reach provokes no opportunity attack prompt; Schivata does not change that", () => {
  const distance = (a, b) => Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y)) * 1.5;
  const goblin = creature("goblin", { attitude: "enemy" }, 0);
  const path = [{ x: 1, y: 0 }, { x: 3, y: 0 }];
  const leave = (mover) => movementReactionEvents({ mover, path, others: [goblin], distance }).filter((event) => event.trigger === "move-leave");
  // The conditions as a token keeps them ({ instances }).
  assert.equal(leave(creature("mira", {}, 1)).length, 1);
  assert.deepEqual(leave(creature("mira", { conditions: { instances: [pill(DISENGAGE_CONDITION, { sourceId: "mira" })] } }, 1)), []);
  assert.equal(leave(creature("mira", { conditions: { instances: [pill(DODGE_CONDITION, { sourceId: "mira" })] } }, 1)).length, 1);
});

test("the console reminds the Dodge: disadvantage to an attack roll against it, advantage on a Dexterity save", () => {
  const dodging = creature("ghoul", { conditions: [pill(DODGE_CONDITION, { sourceId: "ghoul" })] });
  const sword = { id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing" }] };
  const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
  assert.deepEqual(pcAttackTargetNotes({ attack: pcAttackResolvedAction(sword), targetItem: dodging }),
    ["Schivata: svantaggio all'attacco, se il bersaglio vede chi attacca."]);
  // Sacred Flame (a Dexterity save) and Poison Spray (Constitution).
  assert.deepEqual(pcAttackTargetNotes({ attack: pcAttackResolvedAction(cantrips, "sacred-flame"), targetItem: dodging }),
    ["Schivata: vantaggio al TS su Destrezza."]);
  assert.deepEqual(pcAttackTargetNotes({ attack: pcAttackResolvedAction(cantrips, "poison-spray"), targetItem: dodging }), []);
  assert.deepEqual(pcAttackTargetNotes({ attack: pcAttackResolvedAction(sword), targetItem: creature("ghoul") }), []);
});

test("the Combat Log says what the action left", () => {
  const lines = (kind, sourceItem) => {
    const built = plan(kind, sourceItem);
    const event = { id: `e-${kind}`, sessionId: "s", sequence: 1, version: 3, at: 1, source: "automatic", kind: "pc-attack", category: "attack",
      action: "change", label: built.options.label, payload: built.options.history.payload, targets: [{ id: "aria", name: "Aria" }] };
    return buildCombatLogPresentation({ id: "s" }, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  };
  assert.match(lines("dash"), /Azione: Scatto · uno scatto in più nel movimento del turno/);
  assert.match(lines("dash", creature("aria", { pcAttackState: { version: 1, turnActions: { turnKey: "2:0:aria", dashes: 1 } } })), /2 scatti/);
  assert.match(lines("disengage"), /Azione: Disimpegno · niente attacchi di opportunità fino alla fine del turno/);
  assert.match(lines("dodge"), /Azione: Schivata · fino all'inizio del suo prossimo turno/);
});
