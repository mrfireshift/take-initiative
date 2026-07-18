import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCombatLogEvents,
  combatEventFromHistoryEntry,
  combatEventDetail,
  serializeCombatLogText,
} from "../src/combatLogCore.js";

function snapshot(value) {
  return { present: true, value };
}

test("converte una modifica HP in un evento di danno strutturato", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-1",
    at: 1000,
    kind: "hp",
    label: "Danno rapido: 28",
    changes: [{
      id: "target-1",
      name: "Erinni",
      before: { hp: snapshot(68), hpMax: snapshot(168) },
      after: { hp: snapshot(40), hpMax: snapshot(168) },
    }],
  }, { round: 3, turn: { id: "caster", name: "Karmakar" } });

  assert.equal(event.action, "damage");
  assert.equal(event.round, 3);
  assert.equal(event.targets[0].delta, -28);
  assert.match(combatEventDetail(event), /Erinni: 68\/168 → 40\/168 \(-28\)/);
});

test("cumula il movimento dello stesso token nello stesso turno", () => {
  const base = {
    kind: "move",
    round: 2,
    turn: { id: "actor-1", name: "Karmakar" },
  };
  const events = aggregateCombatLogEvents([
    { ...base, id: "m1", sequence: 1, at: 100, targets: [{ id: "actor-1", name: "Karmakar", cells: 1.5, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }] },
    { ...base, id: "m2", sequence: 2, at: 200, targets: [{ id: "actor-1", name: "Karmakar", cells: 2, from: { x: 1, y: 0 }, to: { x: 3, y: 0 } }] },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].targets[0].cells, 3.5);
  assert.equal(events[0].label, "Movimento totale: Karmakar");
  assert.deepEqual(events[0].targets[0].from, { x: 0, y: 0 });
  assert.deepEqual(events[0].targets[0].to, { x: 3, y: 0 });
});

test("una correzione da Undo sottrae il movimento e rimuove i totali azzerati", () => {
  const base = {
    kind: "move",
    round: 2,
    turn: { id: "actor-1", name: "Karmakar" },
  };
  const events = aggregateCombatLogEvents([
    { ...base, sequence: 1, targets: [{ id: "actor-1", name: "Karmakar", cells: 3 }] },
    { ...base, sequence: 2, action: "move-undo", targets: [{ id: "actor-1", name: "Karmakar", cells: -1 }] },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].targets[0].cells, 2);

  const cancelled = aggregateCombatLogEvents([
    { ...base, sequence: 1, targets: [{ id: "actor-1", name: "Karmakar", cells: 3 }] },
    { ...base, sequence: 2, action: "move-undo", targets: [{ id: "actor-1", name: "Karmakar", cells: -3 }] },
  ]);
  assert.deepEqual(cancelled, []);
});

test("esporta il registro testuale raggruppato per round", () => {
  const session = { name: "Assalto a Zariel", startedAt: 1000 };
  const events = [
    { at: 1100, round: 1, kind: "round", label: "Inizio Round 1", targets: [] },
    { at: 2100, round: 2, kind: "note", label: "Nota del DM", payload: { text: "La porta crolla" }, targets: [] },
  ];
  const output = serializeCombatLogText(session, events);
  assert.match(output, /Registro combattimento: Assalto a Zariel/);
  assert.match(output, /ROUND 1/);
  assert.match(output, /ROUND 2/);
  assert.match(output, /La porta crolla/);
});
