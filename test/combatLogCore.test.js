import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCombatLogEvents,
  combatEventCategory,
  combatEventFromHistoryEntry,
  combatEventDetail,
  normalizeCombatLogEvent,
  serializeCombatLogText,
} from "../src/combatLogCore.js";

function snapshot(value) {
  return { present: true, value };
}

test("normalizza un evento v1 senza mutare l'oggetto ricevuto", () => {
  const legacy = {
    version: 1,
    kind: "initiative-card",
    action: "sheet",
    payload: { source: "legacy" },
    targets: [{ id: "actor-1", name: "Eroe" }],
  };
  const normalized = normalizeCombatLogEvent(legacy);

  assert.equal(normalized.version, 1);
  assert.equal(normalized.kind, "initiative-card");
  assert.equal(normalized.category, "resource");
  assert.deepEqual(normalized.payload, legacy.payload);
  assert.equal(legacy.category, undefined);
});

test("la tassonomia copre tutti i kind prodotti dai workflow CL-1", () => {
  const expected = {
    hp: "hp",
    move: "movement",
    condition: "condition",
    spell: "spell",
    "spell-active-resolution": "spell",
    "spell-zone-move": "spell",
    "spell-zone-direction": "spell",
    "spell-board-token": "spell",
    "save-resolution": "save",
    "reminder-resolution": "save",
    "class-feature": "resource",
    "initiative-card": "resource",
    "scene-add": "roster",
    "scene-remove": "roster",
    "initiative-add": "roster",
    "initiative-remove": "roster",
    turn: "turn",
    round: "turn",
    undo: "undo",
    note: "note",
  };
  for (const [kind, category] of Object.entries(expected)) {
    assert.equal(combatEventCategory(kind), category, kind);
    assert.equal(combatEventFromHistoryEntry({ kind, changes: [] }).category, category, kind);
    assert.equal(combatEventFromHistoryEntry({ kind, changes: [] }).kind, kind, kind);
  }
});

test("un nuovo evento v2 conserva payload, correlazioni e nome target", () => {
  const payload = { resolution: "critical", details: { damage: 12 } };
  const event = combatEventFromHistoryEntry({
    id: "history-spell-1",
    kind: "spell-active-resolution",
    label: "Risoluzione incantesimo",
    payload,
    effectsMutation: {
      commandId: "command-1",
      correlationId: "correlation-1",
      changes: [{ id: "target-1", name: "Ogre", before: {}, after: {} }],
    },
    changes: [{ id: "target-1", name: "Ogre", before: {}, after: {} }],
  }, { round: 4, turn: { id: "turn-1", name: "Mago" } });

  assert.equal(event.version, 2);
  assert.equal(event.kind, "spell-active-resolution");
  assert.equal(event.category, "spell");
  assert.equal(event.historyEntryId, "history-spell-1");
  assert.equal(event.commandId, "command-1");
  assert.equal(event.correlationId, "correlation-1");
  assert.deepEqual(event.payload, payload);
  assert.deepEqual(event.targets, [{ id: "target-1", name: "Ogre" }]);
});

test("deriva facets HP, hpMax, condizioni, spell e concentrazione in un solo evento", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-multi-domain",
    kind: "spell-active-resolution",
    payload: { original: true },
    changes: [{
      id: "target-1",
      name: "Goblin",
      before: {
        hp: snapshot(10),
        hpMax: snapshot(12),
        conditions: snapshot({ instances: [{ id: "condition-1", condition: "Benedetto" }] }),
        spells: snapshot([{ instanceId: "spell-1", name: "Vecchio incanto" }]),
        concentrations: snapshot({ "spell-1": { instanceId: "spell-1", name: "Vecchio incanto" } }),
      },
      after: {
        hp: snapshot(4),
        hpMax: snapshot(20),
        conditions: snapshot({ instances: [{ id: "condition-1", condition: "Benedetto", level: 2 }] }),
        spells: snapshot([
          { instanceId: "spell-1", name: "Nuovo incanto" },
          { instanceId: "spell-2", name: "Secondo incanto" },
        ]),
        concentrations: snapshot({}),
      },
    }],
  });

  assert.equal(event.facets.hp.targets[0].delta, -6);
  assert.equal(event.facets.hp.targets[0].hpMaxDelta, 8);
  assert.equal(event.facets.conditions.updated[0].id, "condition-1");
  assert.equal(event.facets.spells.updated[0].id, "spell-1");
  assert.equal(event.facets.spells.added[0].instanceId, "spell-2");
  assert.equal(event.facets.concentrations.removed[0].instanceId, "spell-1");
  assert.deepEqual(event.payload, { original: true });
});

test("le facet gestiscono aggiunte e rimozioni da array raw del piano effects", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-effects-raw",
    kind: "condition",
    effectsMutation: {
      changes: [{
        id: "target-1",
        name: "Troll",
        fields: { conditions: true, spells: true, concentrations: true },
        before: {
          conditions: [{ id: "old-condition" }],
          spells: [{ instanceId: "old-spell" }],
          concentrations: { old: { instanceId: "old-concentration" } },
        },
        after: {
          conditions: [{ id: "new-condition" }],
          spells: [{ instanceId: "new-spell" }],
          concentrations: { new: { instanceId: "new-concentration" } },
        },
      }],
    },
  });

  assert.equal(event.facets.conditions.added[0].id, "new-condition");
  assert.equal(event.facets.conditions.removed[0].id, "old-condition");
  assert.equal(event.facets.spells.added[0].instanceId, "new-spell");
  assert.equal(event.facets.spells.removed[0].instanceId, "old-spell");
  assert.equal(event.facets.concentrations.added[0].instanceId, "new-concentration");
  assert.equal(event.facets.concentrations.removed[0].instanceId, "old-concentration");
});

test("le facet riconoscono le chiavi metadata legacy di spell e concentrazione", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-legacy-effect-keys",
    kind: "spell",
    changes: [{
      id: "target-1",
      name: "Manticora",
      before: {
        "com.thebigpicture.initiative/spells": snapshot([{ instanceId: "spell-old" }]),
        "com.thebigpicture.initiative/concentration": snapshot({ old: { instanceId: "spell-old" } }),
      },
      after: {
        "com.thebigpicture.initiative/spells": snapshot([{ instanceId: "spell-new" }]),
        "com.thebigpicture.initiative/concentration": snapshot({ new: { instanceId: "spell-new" } }),
      },
    }],
  });

  assert.equal(event.facets.spells.added[0].instanceId, "spell-new");
  assert.equal(event.facets.spells.removed[0].instanceId, "spell-old");
  assert.equal(event.facets.concentrations.added[0].instanceId, "spell-new");
  assert.equal(event.facets.concentrations.removed[0].instanceId, "spell-old");
});

test("il turno resta contesto e non diventa fonte implicita del danno", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-hp-context",
    kind: "hp",
    changes: [{
      id: "target-1",
      name: "Bersaglio",
      before: { hp: snapshot(10), hpMax: snapshot(10) },
      after: { hp: snapshot(3), hpMax: snapshot(10) },
    }],
  }, { round: 2, turn: { id: "turn-1", name: "Personaggio di turno" } });

  assert.deepEqual(event.turn, { id: "turn-1", name: "Personaggio di turno" });
  assert.equal(event.facets.hp.targets[0].delta, -7);
  assert.equal(event.attackerId, undefined);
  assert.equal(event.sourceId, undefined);
  assert.equal(event.casterId, undefined);
});

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

test("registra una risoluzione reminder con esito e danno nel Combat Log", () => {
  const event = combatEventFromHistoryEntry({
    id: "effects-history:reminder-resolution:1",
    kind: "reminder-resolution",
    label: "Reminder: Ragnatela · Fallito",
    payload: { outcome: "failed", damage: 7 },
    changes: [],
  });

  assert.equal(event.action, "reminder-resolution");
  assert.deepEqual(event.payload, { outcome: "failed", damage: 7 });
  assert.equal(combatEventDetail(event), "Fallito · 7 danni");
});

test("reminder-resolution usa lo snapshot HP History per Bella senza hpMax sintetico", () => {
  const event = combatEventFromHistoryEntry({
    id: "effects-history:reminder-resolution:bella",
    kind: "reminder-resolution",
    payload: {
      targetId: "bella",
      outcome: "failed",
      damage: 13,
      hpChange: { before: 112, after: 99, hpMax: 112 },
    },
    changes: [{
      id: "bella",
      name: "Bella",
      metadataFields: { hp: true },
      beforeMetadata: { hp: { present: true, value: 112 } },
      afterMetadata: { hp: { present: true, value: 99 } },
    }],
  });

  assert.deepEqual(event.facets.hp.targets, [{
    id: "bella",
    name: "Bella",
    before: { hp: 112, hpMax: 112 },
    after: { hp: 99, hpMax: 112 },
    delta: -13,
    hpMaxDelta: 0,
  }]);
});

test("reminder-resolution usa lo snapshot HP History per Morgantha senza hpMax sintetico", () => {
  const event = combatEventFromHistoryEntry({
    id: "effects-history:reminder-resolution:morgantha",
    kind: "reminder-resolution",
    payload: {
      targetId: "morgantha",
      outcome: "failed",
      damage: 11,
      hpChange: { before: 105, after: 94, hpMax: 112 },
    },
    effectsMutation: {
      changes: [{
        id: "morgantha",
        name: "Morgantha",
        metadataFields: { hp: true },
        beforeMetadata: { hp: { present: true, value: 105 } },
        afterMetadata: { hp: { present: true, value: 94 } },
      }],
    },
  });

  assert.deepEqual(event.facets.hp.targets[0], {
    id: "morgantha",
    name: "Morgantha",
    before: { hp: 105, hpMax: 112 },
    after: { hp: 94, hpMax: 112 },
    delta: -11,
    hpMaxDelta: 0,
  });
});

test("un HP max non disponibile resta null e non diventa zero", () => {
  const event = combatEventFromHistoryEntry({
    id: "history-hp-unknown-max",
    kind: "hp",
    changes: [{
      id: "target-unknown-max",
      name: "Target",
      before: { hp: snapshot(10) },
      after: { hp: snapshot(5) },
    }],
  });

  assert.deepEqual(event.facets.hp.targets[0], {
    id: "target-unknown-max",
    name: "Target",
    before: { hp: 10, hpMax: null },
    after: { hp: 5, hpMax: null },
    delta: -5,
    hpMaxDelta: null,
  });
  assert.match(combatEventDetail(event), /Target: 10\/\? → 5\/\?/u);
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

  for (const cells of [0.75, 2.5, 6, 11.25]) {
    const cancelled = aggregateCombatLogEvents([
      { ...base, sequence: 1, targets: [{ id: "actor-1", name: "Karmakar", cells }] },
      {
        ...base,
        sequence: 2,
        action: "move-undo",
        payload: { movementCorrection: true, undoSource: "history", nativeUndo: false },
        targets: [{ id: "actor-1", name: "Karmakar", cells: -cells }],
      },
    ]);
    assert.deepEqual(cancelled, [], `il totale deve azzerarsi per ${cells} caselle`);
  }
});

test("un Undo successivo sottrae dal gruppo del movimento originale", () => {
  const events = aggregateCombatLogEvents([
    {
      id: "move-history-1",
      historyEntryId: "history-move-1",
      kind: "move",
      round: 2,
      turn: { id: "actor-1", name: "Karmakar" },
      sequence: 10,
      targets: [{ id: "actor-1", name: "Karmakar", cells: 3, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } }],
    },
    {
      id: "move-undo-1",
      kind: "move",
      action: "move-undo",
      round: 5,
      turn: { id: "dm", name: "DM" },
      sequence: 20,
      payload: { nativeUndo: true },
      targets: [{
        id: "actor-1",
        name: "Karmakar",
        cells: -2,
        from: { x: 3, y: 0 },
        to: { x: 1, y: 0 },
        undoOfHistoryEntryId: "history-move-1",
      }],
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].targets[0].cells, 1);
  assert.equal(events[0].round, 2);
  assert.deepEqual(events[0].turn, { id: "actor-1", name: "Karmakar" });
  assert.equal(events[0].payload.nativeUndo, true);
});

test("mantiene distinta la correzione History dall'Undo nativo OBR", () => {
  const events = aggregateCombatLogEvents([
    {
      id: "move-history-source",
      historyEntryId: "history-source",
      kind: "move",
      round: 1,
      turn: { id: "actor-1", name: "Karmakar" },
      sequence: 1,
      targets: [{ id: "actor-1", name: "Karmakar", cells: 4.25 }],
    },
    {
      id: "move-history-correction",
      kind: "move",
      action: "move-undo",
      round: 2,
      sequence: 2,
      payload: { movementCorrection: true, undoSource: "history", nativeUndo: false },
      targets: [{
        id: "actor-1",
        name: "Karmakar",
        cells: -1.5,
        undoOfHistoryEntryId: "history-source",
      }],
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].targets[0].cells, 2.75);
  assert.equal(events[0].payload.movementCorrection, true);
  assert.equal(events[0].payload.undoSource, "history");
  assert.equal(events[0].payload.nativeUndo, false);
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
