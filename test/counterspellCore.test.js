// Counterspell (PHB 2014): the rule that decides the counter, and the words of the History label and the combat log.
import assert from "node:assert/strict";
import test from "node:test";
import {
  counterspellCheck,
  counterspellLabel,
  counterspellLogLines,
  counterspellOutcome,
  counterspellSuggestedSpellIds,
  isCounterspell,
  planCounterspellContext,
} from "../src/counterspellCore.js";
import { buildSpellCastRecordLogEntry } from "../src/spellCastRecordCore.js";

const target = { id: "auril", name: "Auril" };

test("a spell up to the Counterspell's slot level is countered; a higher one asks a check, DC 10 + its level", () => {
  assert.deepEqual(counterspellCheck({ slotLevel: 3, spellLevel: 3 }), { known: true, automatic: true, dc: null, slotLevel: 3 });
  assert.deepEqual(counterspellCheck({ slotLevel: 3, spellLevel: 4 }), { known: true, automatic: false, dc: 14, slotLevel: 3 });
  assert.equal(counterspellCheck({ slotLevel: 5, spellLevel: 5 }).automatic, true, "an upcast Counterspell");
  assert.equal(counterspellCheck({ slotLevel: 3, spellLevel: 0 }).automatic, true, "a cantrip");
  assert.equal(counterspellCheck({ slotLevel: 1, spellLevel: 3 }).slotLevel, 3, "never below the 3rd level");
  assert.equal(counterspellCheck({ slotLevel: 3, spellLevel: null }).known, false);
  const check = counterspellCheck({ slotLevel: 3, spellLevel: 7 });
  assert.equal(counterspellOutcome({ check, checkTotal: "17" }), "countered", "17 meets DC 17");
  assert.equal(counterspellOutcome({ check, checkTotal: "16" }), "failed");
  assert.equal(counterspellOutcome({ check, checkResult: "passed" }), "countered");
  assert.equal(counterspellOutcome({ check }), null, "the GM marks the check");
});

test("the context names who, what and how; it asks what is missing", () => {
  assert.equal(planCounterspellContext({ spellName: "Fulmine", spellLevel: 3 }).ok, false);
  assert.equal(planCounterspellContext({ target, spellLevel: 3 }).ok, false);
  assert.equal(planCounterspellContext({ target, spellName: "Incantesimo ignoto" }).ok, false, "a free name needs its level");
  assert.match(planCounterspellContext({ target, spellName: "Cono di freddo", spellLevel: 5 }).error, /CD 15/u);
  const free = planCounterspellContext({ target, spellName: "Tempesta di Auril", spellLevel: 4, checkResult: "failed", targetSlot: "slot di 4° livello" });
  assert.deepEqual(free.context, {
    targetId: "auril", targetName: "Auril", spellName: "Tempesta di Auril", spellLevel: 4, slotLevel: 3,
    automatic: false, dc: 14, check: { result: "failed" }, outcome: "failed",
  }, "a spell that goes off costs its caster nothing here");
  assert.equal(counterspellLabel(free.context), "Controincantesimo (3°) su Auril: Tempesta di Auril (4°) · non annullato");
  const cantrip = planCounterspellContext({ target, spell: { id: "ray-of-frost", displayName: "Raggio di gelo", level: 0 } }).context;
  assert.equal(counterspellLabel(cantrip), "Controincantesimo (3°) su Auril: Raggio di gelo (trucchetto) · annullato");
  assert.deepEqual(counterspellLogLines(cantrip), [
    "Contrastato: Auril · Raggio di gelo (trucchetto)",
    "Esito: annullato · annullato automaticamente (slot 3° ≥ trucchetto)",
  ]);
  assert.deepEqual(counterspellLogLines(null), []);
  assert.equal(isCounterspell("counterspell"), true);
  assert.equal(isCounterspell({ id: "shield" }), false);
});

test("the countered caster's own spells come first; a cast without History carries the context to the log", () => {
  const META = "com.thebigpicture.initiative/meta";
  const item = { metadata: { [META]: { initiativeCard: { quickActions: [
    { kind: "spell", spellId: "cone-of-cold" }, { kind: "attack", id: "a" }, { kind: "spell", spellId: "cone-of-cold" }, { kind: "spell", spellId: "ice-storm" },
  ] } } } };
  assert.deepEqual(counterspellSuggestedSpellIds(item, META), ["cone-of-cold", "ice-storm"]);
  const entry = buildSpellCastRecordLogEntry({ label: "L", causality: { cause: {} }, extraPayload: { counterspell: { outcome: "countered" } } });
  assert.deepEqual(entry.payload, { counterspell: { outcome: "countered" }, causality: { cause: {} } });
});
