// Rimebound Link through the production effects coordinator: damage to the Titan (a linked token) leaves the link,
// damage to Auril (the Projection, the boss token) breaks it in the same command, Undo restores it, and the GM
// alone gets the notices.
import test from "node:test";
import assert from "node:assert/strict";
import { reset, cleanup, apply, damage, group, items, meta, history, effects, sdk, setRole } from "../test-support/sharedHpHarness.js";

const record = { enabled: true, name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata" };
const notices = [];
sdk.notification = { show: async (message, variant) => { notices.push([variant, message]); } };
const linked = () => group().map((item) => item.id !== "auril" ? item : { ...item, metadata: { ...item.metadata,
  "com.thebigpicture.initiative/meta": { ...item.metadata["com.thebigpicture.initiative/meta"], bossLinkResistance: record } } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test.beforeEach(async () => { await reset(linked()); notices.length = 0; });
test.after(cleanup);

test("damage to the Titan leaves the link and reminds the GM; damage to Auril breaks it for the round", async () => {
  const titan = await apply([damage("hand", 20, "titan-hit")], { history: true });
  assert.equal(titan.status, "applied");
  assert.deepEqual(meta("auril").bossLinkResistance, record, "the Titan's damage does not break the link");
  await settle();
  assert.deepEqual(notices, [["INFO", "Rimebound Link attivo: il Titano ha Resistenza a tutti i danni (hand). Dimezza tu il danno se non l'hai già fatto."]]);
  notices.length = 0;

  const projection = await apply([damage("auril", 30, "projection-hit")], { history: true });
  assert.equal(projection.status, "applied");
  assert.deepEqual(meta("auril").bossLinkResistance, { ...record, brokenRound: 1 });
  assert.equal(meta("auril").hp, 250, "the damage itself is applied as given (the shared pool: 300 - 20 - 30)");
  assert.ok(items.every((item) => item.metadata.foreign === "keep"), "the rest of the metadata is kept");
  await settle();
  assert.deepEqual(notices.map(([variant]) => variant), ["WARNING"]);
  assert.match(notices[0][1], /^Rimebound Link interrotto/);
  notices.length = 0;

  // Broken for this round: more damage to either manifestation changes nothing and says nothing.
  await apply([damage("auril", 5, "again"), damage("hand", 5, "again-titan")]);
  await settle();
  assert.deepEqual(notices, []);
  assert.equal(meta("auril").bossLinkResistance.brokenRound, 1);
});

test("an area on both manifestations: one event, the link breaks after it; a player's write never shows a notice", async () => {
  const both = await apply([{ type: "hp:set", updates: [
    { itemId: "auril", hp: 280, hpMax: 400, hpIntent: { mode: "damage", amount: 20, eventId: "cone" } },
    { itemId: "hand", hp: 290, hpMax: 400, hpIntent: { mode: "damage", amount: 10, eventId: "cone" } },
  ] }], { sharedHp: { policy: "once", chosenTargetIds: { auril: "hand" } }, bossLinkResisted: ["hand"] });
  assert.equal(both.status, "applied");
  assert.equal(meta("auril").hp, 290, "the GM chose the Titan's halved amount for the group");
  assert.equal(meta("auril").bossLinkResistance.brokenRound, 1);
  await settle();
  assert.deepEqual(notices.map(([variant, message]) => [variant, message.split(":")[0]]), [["INFO", "Rimebound Link attivo"], ["WARNING", "Rimebound Link interrotto"]]);
  assert.match(notices[0][1], /Danno già dimezzato\.$/);

  await reset(linked()); notices.length = 0;
  setRole("PLAYER");
  await apply([damage("auril", 10, "player")]);
  await settle();
  assert.deepEqual(notices, [], "only the GM sees Rimebound Link");
});

test("Undo of the breaking damage restores the link", async () => {
  const projection = await apply([damage("auril", 30, "projection-hit")], { history: true });
  assert.equal(projection.status, "applied");
  assert.equal(meta("auril").bossLinkResistance.brokenRound, 1);
  const [entry] = await history.getHistoryEntries();
  assert.equal((await effects.undoEffectsMutation(entry, { transport: "background" })).status, "applied");
  assert.deepEqual(meta("auril").bossLinkResistance, record);
  assert.equal(meta("auril").hp, 300);
});

test("without a link record the shared hit point path reads nothing more and is unchanged", async () => {
  await reset(group()); notices.length = 0;
  const result = await apply([damage("auril", 30)]);
  assert.equal(result.status, "applied");
  assert.equal(meta("auril").bossLinkResistance, undefined);
  await settle();
  assert.deepEqual(notices, []);
});
