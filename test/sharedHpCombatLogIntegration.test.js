import test from "node:test";
import assert from "node:assert/strict";
import { reset, cleanup, apply, damage, group, token, meta, history, effects } from "../test-support/sharedHpHarness.js";
import { combatEventFromHistoryEntry } from "../src/combatLogCore.js";
import { buildCombatLogPresentation, serializeCombatLogPresentationText } from "../src/combatLogPresentationCore.js";

test.beforeEach(() => reset(group().map(item => ({ ...item, name: item.id === "auril" ? "Auril" : `Titano ${item.id}` }))));
test.after(cleanup);

test("secondary damage records the actual target separately from shared HP mirrors and retains full Undo", async () => {
  const result = await apply([damage("hand", 25)], { kind: "hp", history: { payload: { origin: "manual" } } });
  assert.equal(result.status, "applied");
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.changes.length, 4);
  assert.equal(entry.payload.origin, "manual");
  assert.deepEqual(entry.payload.sharedHp.groups[0].hitIds, ["hand"]);
  const event = combatEventFromHistoryEntry(entry);
  const presentation = buildCombatLogPresentation(null, [event]);
  const displayed = presentation.events[0];
  assert.match(displayed.summary, /Bersaglio: Titano hand/);
  assert.match(displayed.summary, /Riserva Auril: 300\/400 → 275\/400 \(-25 HP\)/);
  assert.doesNotMatch(displayed.summary, /Bersaglio:.*Titano (body|head)/);
  assert.match(serializeCombatLogPresentationText(null, presentation), /Bersaglio: Titano hand/);
  assert.equal((await effects.undoEffectsMutation(entry, { transport: "background" })).status, "applied");
  assert.equal(meta("auril").hp, 300);
  assert.equal(meta("hand").hp, 300);
});

test("shared area log names both actual targets and only one pool variation", async () => {
  await apply([damage("hand", 25), damage("head", 25)], { kind: "save-resolution", history: true });
  const [entry] = await history.getHistoryEntries();
  const displayed = buildCombatLogPresentation(null, [combatEventFromHistoryEntry(entry)]).events[0];
  assert.match(displayed.summary, /Bersagli: Titano hand, Titano head/);
  assert.equal((displayed.summary.match(/Riserva Auril/g) || []).length, 1);
  assert.match(displayed.summary, /275\/400/);
});

test("independent HP entries retain their existing presentation and payload", async () => {
  await reset([token("single", { hp: 300 })]);
  await apply([damage("single", 25)], { kind: "hp", history: true });
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.payload?.sharedHp, undefined);
  const displayed = buildCombatLogPresentation(null, [combatEventFromHistoryEntry(entry)]).events[0];
  assert.equal(displayed.summary, "single: 300/— → 275/— (-25 HP)");
});

test("composite history also retains the actual shared target and the outer payload", async () => {
  const { decorateCompositeEffectsHistoryEntry } = await import("../src/effectsMutationCompositeHistoryCore.js");
  let mutation;
  await history.withItemMetaHistory({ kind: "hp", label: "HP", itemIds: ["auril", "body", "hand", "head"],
    fields: ["hp", "hpMax"],
    decorateEntry: entry => decorateCompositeEffectsHistoryEntry({ entry: { ...entry, payload: { outer: true } }, mutation }) },
  async () => { mutation = await apply([damage("head", 15)], { history: false }); });
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.payload.outer, true);
  const displayed = buildCombatLogPresentation(null, [combatEventFromHistoryEntry(entry)]).events[0];
  assert.match(displayed.summary, /Bersaglio: Titano head/);
  assert.match(displayed.summary, /Riserva Auril: 300\/400 → 285\/400/);
});
