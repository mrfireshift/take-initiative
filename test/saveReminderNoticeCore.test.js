import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSaveReminderNoticeBatch,
  saveReminderNoticeBatchPresentation,
} from "../src/saveReminderNoticeCore.js";

function notice({
  activationId,
  turnKey = "2:1:target",
  targetId = "target",
  targetName = "Nothic",
  spellName = "Ragnatela",
  instruction = "TS Destrezza CD 19 (Lavera)",
  kind = "zone",
  timing = "turn-start",
} = {}) {
  return {
    activationId,
    turnKey,
    spellName,
    label: instruction,
    instruction,
    kind,
    timing,
    targets: [{
      id: targetId,
      name: targetName,
      portrait: `${targetId}.png`,
    }],
  };
}

test("aggrega reminder concorrenti dello stesso turno conservando l'ordine", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
    notice({
      activationId: "hold",
      spellName: "Blocca Mostri",
      instruction: "TS Saggezza CD 18 (Mordenkainen)",
      kind: "effect-save",
    }),
  ]);

  assert.equal(batch.turnKey, "2:1:target");
  assert.deepEqual(batch.activationIds, ["web", "hold"]);
  assert.equal(batch.targets.length, 1);
  assert.equal(batch.targets[0].name, "Nothic");
});

test("un arrivo asincrono dello stesso turno amplia il batch visibile", () => {
  const initial = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
  ]);
  const merged = mergeSaveReminderNoticeBatch(initial, [
    notice({
      activationId: "radiance",
      spellName: "Fulgore Nauseante",
      instruction: "TS Costituzione CD 17 (Lavera)",
    }),
  ]);

  assert.deepEqual(merged.activationIds, ["web", "radiance"]);
});

test("deduplica lo stesso activationId anche tra broadcast separati", () => {
  const initial = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
  ]);
  const merged = mergeSaveReminderNoticeBatch(initial, [
    notice({
      activationId: "web",
      spellName: "Duplicato da sync",
    }),
  ]);

  assert.deepEqual(merged.activationIds, ["web"]);
  assert.equal(merged.entries[0].spellName, "Ragnatela");
});

test("un reminder di un nuovo turno sostituisce il batch precedente", () => {
  const initial = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "old", turnKey: "2:1:target" }),
  ]);
  const next = mergeSaveReminderNoticeBatch(initial, [
    notice({
      activationId: "new",
      turnKey: "2:2:next",
      targetId: "next",
      targetName: "Goblin",
    }),
  ]);

  assert.deepEqual(next.activationIds, ["new"]);
  assert.equal(next.turnKey, "2:2:next");
  assert.equal(next.targets[0].name, "Goblin");
});

test("Fame di Hadar conserva fine e inizio turno della stessa transizione", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({
      activationId: "hunger-cold-second",
      turnKey: "1:1:second",
      targetId: "second",
      targetName: "Secondo Nothic",
      spellName: "Fame di Hadar",
      instruction: "2d6 danni da freddo automatici.",
      kind: "zone-effect",
      timing: "turn-start",
    }),
    notice({
      activationId: "hunger-acid-first",
      turnKey: "1:1:second",
      targetId: "first",
      targetName: "Primo Nothic",
      spellName: "Fame di Hadar",
      instruction: "TS Destrezza; 2d6 danni da acido se fallito.",
      timing: "turn-end",
    }),
  ]);

  assert.deepEqual(
    batch.activationIds,
    ["hunger-cold-second", "hunger-acid-first"],
  );
  assert.deepEqual(
    batch.targets.map((target) => target.name),
    ["Secondo Nothic", "Primo Nothic"],
  );
});

test("la presentazione singola identifica token ed effetto senza una riga aggiuntiva", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.kind, "zone");
  assert.equal(presentation.eyebrow, "Effetto di zona · Inizio turno");
  assert.equal(presentation.title, "Nothic (Ragnatela)");
  assert.equal(presentation.rows.length, 1);
  assert.equal(presentation.rows[0].title, "");
  assert.equal(
    presentation.rows[0].detail,
    "TS Destrezza CD 19 (Lavera)",
  );
});

test("la presentazione singola da condizione mostra Nome token (Condizione)", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({
      activationId: "stunned",
      spellName: "Stordito",
      instruction: "TS Costituzione CD 19 (Lavera)",
      kind: "effect-save",
      timing: "turn-end",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.kind, "effect-save");
  assert.equal(presentation.eyebrow, "Tiro salvezza · Fine turno");
  assert.equal(presentation.title, "Nothic (Stordito)");
  assert.equal(
    presentation.rows[0].detail,
    "TS Costituzione CD 19 (Lavera)",
  );
});

test("un reminder di concentrazione resta informativo e identifica il caster", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({
      activationId: "heat-metal",
      targetId: "caster",
      targetName: "Lavera",
      spellName: "Riscaldare il Metallo",
      instruction: "Può usare un'azione bonus per infliggere di nuovo 2d8 danni da fuoco.",
      kind: "effect-reminder",
      timing: "turn-start",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.kind, "effect-reminder");
  assert.equal(presentation.eyebrow, "Promemoria · Inizio turno");
  assert.equal(presentation.title, "Lavera (Riscaldare il Metallo)");
  assert.match(presentation.rows[0].detail, /azione bonus/);
});

test("la presentazione distingue un danno automatico da un tiro salvezza", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({
      activationId: "wall-light",
      spellName: "Muro di Luce",
      instruction: "4d8 danni radiosi automatici.",
      kind: "zone-effect",
      timing: "turn-end",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.kind, "zone-effect");
  assert.equal(presentation.eyebrow, "Danno di zona · Fine turno");
  assert.equal(presentation.title, "Nothic (Muro di Luce)");
  assert.equal(
    presentation.rows[0].detail,
    "4d8 danni radiosi automatici.",
  );
});

test("la presentazione aggregata mostra il token e una riga per reminder", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
    notice({
      activationId: "hold",
      spellName: "Blocca Mostri",
      instruction: "TS Saggezza CD 18 (Mordenkainen)",
      kind: "effect-save",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.kind, "aggregate");
  assert.equal(presentation.eyebrow, "Tiri salvezza · Inizio turno");
  assert.equal(presentation.title, "Nothic");
  assert.deepEqual(
    presentation.rows.map((row) => row.title),
    ["Ragnatela", "Blocca Mostri"],
  );
});

test("un batch misto usa un'etichetta neutra", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web" }),
    notice({
      activationId: "hunger-cold",
      spellName: "Fame di Hadar",
      instruction: "2d6 danni da freddo automatici.",
      kind: "zone-effect",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.eyebrow, "Reminder · Inizio turno");
});

test("un'aggregazione con timing diversi etichetta le singole righe", () => {
  const batch = mergeSaveReminderNoticeBatch(null, [
    notice({ activationId: "web", timing: "turn-start" }),
    notice({
      activationId: "stunned",
      spellName: "Stordito",
      kind: "effect-save",
      timing: "turn-end",
    }),
  ]);
  const presentation = saveReminderNoticeBatchPresentation(batch);

  assert.equal(presentation.eyebrow, "Tiri salvezza");
  assert.deepEqual(
    presentation.rows.map((row) => row.title),
    ["Ragnatela · Inizio turno", "Stordito · Fine turno"],
  );
});
