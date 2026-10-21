import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { bossProfileAuras } from "../src/bossAuraCore.js";
import { collectActiveCustomAuras, CUSTOM_AURA_META_KEY } from "../src/customAuraCore.js";
import { planCustomAuraReminder } from "../src/customAuraReminderCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { mergeSaveReminderNoticeBatch } from "../src/saveReminderNoticeCore.js";

const META = "com.thebigpicture.initiative/meta";
const profile = await importBossActionHTML(readFileSync(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const gleam = profile.abilities.find((entry) => entry.id === "blinding-gleam");
const boss = { id: "auril", name: "Auril", metadata: { [META]: { customAuras: bossProfileAuras(profile) } } };
const hero = { id: "hero", name: "Hero", metadata: { [META]: { attitude: "pc", conditions: { instances: [
  { id: "gleam-blind", condition: "Accecato", active: true, sourceId: boss.id, manualRemoval: true,
    saveReminder: gleam.execution.onFailed.conditions[0].saveReminder },
] } } } };
const ally = { ...hero, id: "other", name: "Other" };
const items = [boss, hero, ally];
const order = ["auril", "hero", "__EPIC__::auril::after::hero", "other", "__EPIC__::auril::after::other"];
const state = (current, round = 1) => ({ order, current, round });
const blindNotice = planEffectSaveReminderNotices({ items, previousInitiativeState: state(1), initiativeState: state(2) })[0];
const wind = collectActiveCustomAuras([boss], { metaKey: META }).find((aura) => aura.id.endsWith(":primal-blizzard-wind"));
const windBaseline = planCustomAuraReminder({ aura: wind, desiredTargetIds: [hero.id], initiativeState: state(0, 2), itemsById: new Map(items.map((item) => [item.id, item])) });
const windNotice = planCustomAuraReminder({ aura: wind, auraItem: { id: "wind-visual", metadata: { [CUSTOM_AURA_META_KEY]: { triggerRuntime: windBaseline.runtime } } },
  desiredTargetIds: [hero.id], initiativeState: state(1, 2), itemsById: new Map(items.map((item) => [item.id, item])) }).notices[0];
const blindRow = { ...blindNotice, spellName: "Blinding Gleam", targets: [blindNotice.target] };

test("Gleam repeats only at the blinded target's own turn end, including adjacent Epic slots", () => {
  assert.equal(blindNotice.target.id, hero.id);
  assert.equal(blindNotice.timing, "turn-end");
  assert.equal(blindNotice.dc, 19);
  assert.ok(blindNotice.resolution);
  for (let index = 0; index < order.length; index++) {
    const next = (index + 1) % order.length;
    const notices = planEffectSaveReminderNotices({ items, previousInitiativeState: state(index),
      initiativeState: state(next, next === 0 ? 2 : 1) });
    assert.deepEqual(notices.map((notice) => notice.target.id), index === 1 ? [hero.id] : index === 3 ? [ally.id] : []);
    assert.ok(notices.every((notice) => notice.timing === "turn-end"));
  }
  assert.equal(windNotice.timing, "turn-start");
  assert.equal(windNotice.targets[0].id, hero.id);
});

// Execute the production queue/turn-change functions, rather than duplicating their logic.
const source = readFileSync(new URL("../src/turn-notice.ts", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const { code } = transformSync([
  section("function showNotice(raw: any)", "function resolutionDraftFor("),
  section("function reminderRowRequiresResponse(", "function zoneResponseIdentityKey("),
  section("function flushSaveReminderNotices()", "function effectSaveNotice("),
].join("\n"), { loader: "ts" });
function ui() {
  const context = {
    noticeRole: "GM", lastNoticeId: 0, pendingSaveReminderNotices: [], currentSaveReminderBatch: null,
    currentZonePanel: null, currentPanel: null, currentZoneTurnKey: "", saveReminderAggregationTimer: 0, hideTimer: 0,
    document: { getElementById: () => ({ appendChild() {} }) },
    normalizeNotice: (notice) => notice, shouldClearZoneNoticeAtTurn: () => true,
    window: { clearTimeout() {}, setTimeout: () => 1 }, requestAnimationFrame: (callback) => callback(),
    buildPanel: () => ({ classList: { add() {}, remove() {} }, remove() {} }),
    AUTO_CLOSE_MS: 1000, FADE_MS: 100, SAVE_REMINDER_AGGREGATION_MS: 16,
    zoneTriggerNoticeDetail: (notice) => notice.instruction || notice.label,
    hideCurrent() {}, announceNoticeLayout() {}, clearZoneNotice() {},
    mergeSaveReminderNoticeBatch,
    renderSaveReminderBatch: () => { context.currentZonePanel = {}; return true; },
  };
  return runInNewContext(`${code}\n({ queue: queueSaveReminderNotices, turn: showNotice, flush: flushSaveReminderNotices,
    ids: () => currentSaveReminderBatch?.activationIds || [] })`, context);
}

for (const reverse of [false, true]) {
  test(`queued Gleam and Blizzard saves both survive aggregation (reverse=${reverse})`, () => {
    const panel = ui();
    const rows = reverse ? [windNotice, blindRow] : [blindRow, windNotice];
    rows.forEach((row) => panel.queue([row]));
    panel.flush();
    assert.deepEqual([...panel.ids()].sort(), [blindRow.activationId, windNotice.activationId].sort());
  });
}

test("a turn notice cannot discard an unresolved save still waiting for the aggregation timer", () => {
  const panel = ui();
  panel.queue([blindRow]);
  panel.turn({ currentName: "Hero", nextName: "Auril", turnKey: windNotice.turnKey, noticeId: 1 });
  panel.queue([windNotice]);
  panel.flush();
  assert.deepEqual([...panel.ids()].sort(), [blindRow.activationId, windNotice.activationId].sort());
});
