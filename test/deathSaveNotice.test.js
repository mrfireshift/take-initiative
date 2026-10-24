// The death saves leave the shared reminder popover for a popup of their own; the table screen can be spared them.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const opened = [];
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      viewport: { getWidth: async () => 1200, getHeight: async () => 800 },
      popover: { open: async (options) => { opened.push(options); }, close: async () => {} },
      broadcast: { onMessage: () => () => {} },
    },
  },
});
const { receiveDeathSaveNotices, splitDeathSaveNotices } = await import("../src/deathSaveNoticeHost.js");
const { projectReminderNotice } = await import("../src/options/optionsProjection.js");

const deathSave = (id = "aria:death-save:2:0:aria") => ({
  activationId: id, effectName: "TS contro la morte", saveLabel: "Successi ○○○ · Fallimenti ○○○",
  kind: "effect-reminder", resolution: { version: 1, mode: "death-save", target: { id: "aria" } },
  target: { id: "aria", name: "Aria" },
});
const concentration = { activationId: "mira:concentration:2:0:aria", effectName: "Concentrazione", saveLabel: "TS COS" };

test("the death saves are taken out of the shared reminder payload", () => {
  const { deathSaves, rest } = splitDeathSaveNotices({ type: "show-effect-save-notices", notices: [concentration, deathSave()] });
  assert.deepEqual(deathSaves.map((notice) => notice.activationId), ["aria:death-save:2:0:aria"]);
  assert.deepEqual(rest.notices, [concentration]);
  const plain = { type: "show-effect-save-notices", notices: [concentration] };
  assert.equal(splitDeathSaveNotices(plain).rest, plain, "a payload without death saves goes on untouched");
});

test("one popup per death save: a reconcile does not reopen it, an Undo re-arm does", async () => {
  opened.length = 0;
  await receiveDeathSaveNotices([deathSave("bran:death-save:3:1:bran")]);
  await receiveDeathSaveNotices([deathSave("bran:death-save:3:1:bran")]);
  assert.equal(opened.length, 1);
  assert.match(opened[0].url, /^\/death-save-notice\.html\?payload=/u);
  await receiveDeathSaveNotices([deathSave("bran:death-save:3:1:bran")], ["bran:death-save:3:1:bran"]);
  assert.equal(opened.length, 2);
});

test("the table screen can be spared the death saves; the GM always gets them", () => {
  const policy = { visibility: "full", showDc: true, showCaster: true, showDeathSaves: false };
  assert.equal(projectReminderNotice(deathSave(), { role: "PLAYER", policy }), null);
  assert.ok(projectReminderNotice(concentration, { role: "PLAYER", policy }), "other reminders still reach players");
  assert.ok(projectReminderNotice(deathSave(), { role: "GM", policy }).resolution, "the GM keeps the buttons");
  const shown = projectReminderNotice(deathSave(), { role: "PLAYER", policy: { ...policy, showDeathSaves: true } });
  assert.equal(shown.resolution, undefined, "players never get the buttons");
});
