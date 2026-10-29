import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ID } from "../src/constants.js";
import {
  initiativeTurnKeyAtOrdinal,
  initiativeTurnMark,
  initiativeTurnMarkOrdinal,
  nextInitiativeTurnMark,
} from "../src/turnBoundaryCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import {
  mergeStaticSpellZoneReminderMetadata,
  planStaticSpellZoneReminder,
} from "../src/spellStaticZoneReminderCore.js";
import { consumeSpellZoneTrigger } from "../src/spellZoneTriggerCore.js";

// Lot L15 of the bugfix pass: a turn boundary already counted is never counted again (◀ then ▶, a creature removed
// before the active one), and a jump over several turns starts and ends each of them.
const state = (order, current, round = 1) => ({ order, current, round });

test("L15: il segno avanza col turno, resta col ◀ e riparte con un salto indietro (Reset round)", () => {
  const order = ["a", "b", "c"];
  let mark = initiativeTurnMark(state(order, 0));
  mark = nextInitiativeTurnMark(mark, state(order, 0), state(order, 1));
  assert.deepEqual(mark, { round: 1, actorId: "b", index: 1 });
  mark = nextInitiativeTurnMark(mark, state(order, 1), state(order, 0));
  assert.deepEqual(mark, { round: 1, actorId: "b", index: 1 }, "◀: the mark stays");
  mark = nextInitiativeTurnMark(mark, state(order, 1, 3), state(order, 0, 1));
  assert.deepEqual(mark, { round: 1, actorId: "a", index: 0 }, "a jump back of several turns starts again");
  // The same turn with its entry moved (a creature removed before it) is the same turn.
  const shifted = { round: 2, actorId: "c", index: 2 };
  assert.equal(initiativeTurnMarkOrdinal(shifted, ["a", "c"]), 3);
  assert.deepEqual(nextInitiativeTurnMark(shifted, state(order, 2, 2), state(["a", "c"], 1, 2)), shifted);
});

test("L15 (EF-04): ◀ seguito da ▶ non conta due volte la stessa fine turno", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = source.slice(source.indexOf("function __forwardConditionTurnBoundaries("), source.indexOf("function __conditionDirectionHintFor("));
  const forward = new Function("initiativeTurnMarkOrdinal", "initiativeTurnKeyAtOrdinal",
    `const __conditionActorId = (id) => String(id || ""); ${body} return __forwardConditionTurnBoundaries;`)(
    initiativeTurnMarkOrdinal, initiativeTurnKeyAtOrdinal);
  const order = ["a", "b", "c"];
  let mark = initiativeTurnMark(state(order, 0));
  const step = (from, to, hint = 0) => {
    const boundaries = forward(state(order, from), state(order, to), hint, mark);
    mark = nextInitiativeTurnMark(mark, state(order, from), state(order, to), { stepBack: hint < 0 });
    return boundaries.map((boundary) => `${boundary.phase}:${boundary.actorId}`);
  };
  assert.deepEqual(step(0, 1), ["end:a", "start:b"]);
  assert.deepEqual(step(1, 0, -1), [], "◀ counts nothing");
  assert.deepEqual(step(0, 1), [], "▶ back to b: a's end and b's start were already counted");
  assert.deepEqual(step(1, 2), ["end:b", "start:c"], "past the mark: counted");
});

test("L15 (AV-02): il TS di inizio turno non torna con ◀ ▶ né se si toglie una creatura prima di quella attiva", () => {
  const META_KEY = `${ID}/meta`;
  const target = (id) => ({ id, name: id, metadata: { [META_KEY]: { conditions: [{
    id: `effect-${id}`, condition: "Effetto persistente", active: true, sourceId: "caster",
    saveReminder: { ability: "wis", timing: "turn-start", dcSource: "source-spell", success: "remove-effect" },
  }] } } });
  const items = [{ id: "caster", name: "Mago", metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 16 } } } }, target("first"), target("second")];
  const order = ["caster", "dead", "first", "second"];
  const notices = (previous, next, mark) => planEffectSaveReminderNotices({ items, previousInitiativeState: previous, initiativeState: next,
    includeCurrentTurnStart: true, turnMark: mark });
  const plan = (previous, next, mark) => notices(previous, next, mark).map((notice) => notice.target.id);
  // first's turn reached: asked.
  const reached = initiativeTurnMark(state(order, 2));
  const asked = notices(state(order, 1), state(order, 2), initiativeTurnMark(state(order, 1)));
  assert.deepEqual(asked.map((notice) => notice.target.id), ["first"]);
  // An effect that lands a moment after the turn change: the current turn, under its own key, is offered again (the
  // controller drops the activation it already announced).
  assert.deepEqual(plan(state(order, 2), state(order, 2), reached), ["first"]);
  // The dead creature removed: same turn, shifted key, not asked again.
  assert.deepEqual(plan(state(order, 2), state(["caster", "first", "second"], 1), reached), []);
  // ◀ to the dead one: nothing. ▶ back to first: only the activation already announced, never a new one.
  assert.deepEqual(plan(state(order, 2), state(order, 1), reached), []);
  assert.deepEqual(notices(state(order, 1), state(order, 2), reached).map((notice) => notice.activationId), [asked[0].activationId]);
  // Past the mark: second's turn is asked.
  assert.deepEqual(plan(state(order, 2), state(order, 3), reached), ["second"]);
});

test("L15 (AV-01, AV-04): i trigger di zona non ripartono con ◀ ▶ né con l'ordine spostato; un salto di due turni li fa partire entrambi", () => {
  const rule = getSpellAreaRuleById("web:cast");
  const itemsById = new Map(["caster", "dead", "first", "second", "third"].map((id) => [id, { id, name: id }]));
  const item = { id: "web-zone", name: "Zona: Ragnatela", position: { x: 0, y: 0 }, metadata: { [SPELL_STATIC_ZONE_META_KEY]: {
    version: 1, instanceId: "web-instance", ruleId: rule.id, spellId: rule.spellId, casterId: "caster", role: "root" } } };
  let now = 100;
  const reconcile = (initiativeState) => {
    const update = planStaticSpellZoneReminder({ zoneItem: item, rule, desiredTargetIds: ["first", "second", "third"],
      initiativeState, itemsById, now: now += 10 });
    if (update.changed) {
      item.metadata = { ...item.metadata, [SPELL_STATIC_ZONE_META_KEY]: mergeStaticSpellZoneReminderMetadata(item.metadata[SPELL_STATIC_ZONE_META_KEY], update) };
    }
    for (const notice of update.notices) {
      const metadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
      item.metadata = { ...item.metadata, [SPELL_STATIC_ZONE_META_KEY]: {
        ...metadata, triggerRuntime: consumeSpellZoneTrigger(metadata.triggerRuntime, notice.activationId) } };
    }
    return update.notices.flatMap((notice) => notice.targets.map((target) => target.id));
  };
  const order = ["caster", "dead", "first", "second", "third"];
  reconcile(state(order, 0));
  assert.deepEqual(reconcile(state(order, 1)), []);
  assert.deepEqual(reconcile(state(order, 2)), ["first"], "first's turn starts in the web");
  // AV-01: the dead creature removed before first: the same turn, nothing again.
  const alive = ["caster", "first", "second", "third"];
  assert.deepEqual(reconcile(state(alive, 1)), []);
  // ◀ then ▶ back to first: nothing again.
  assert.deepEqual(reconcile(state(alive, 0)), []);
  assert.deepEqual(reconcile(state(alive, 1)), []);
  // AV-04: two turns written at once (first → third): second's turn starts too.
  assert.deepEqual(reconcile(state(alive, 3)).sort(), ["second", "third"]);
});
