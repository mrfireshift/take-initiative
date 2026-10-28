// Lot P4b: the first turn notice of a closed popup rides in its URL, so the page draws it without the ready
// handshake; every later notice still goes through the handshake, and the latest one wins.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ID = "com.thebigpicture.initiative";
const TURN = `${ID}/turn-notice`;
const READY = `${TURN}/ready`;
const UI = `${TURN}/ui`;
const ZONE = `${ID}/spell-zone-trigger-notice`;
let handlers = new Map();
let opened = [];
let sent = [];
let openGate = null;
let openFailures = 0;
const sdk = {
  viewport: { getWidth: async () => 1200, getHeight: async () => 800 },
  modal: { close: async () => {} },
  popover: {
    open: async (options) => {
      if (openGate) await openGate;
      if (openFailures > 0) { openFailures -= 1; throw new Error("open-failed"); }
      opened.push(options);
    },
    close: async () => {},
    setHeight: async () => {},
  },
  broadcast: {
    onMessage: (channel, handler) => { handlers.set(channel, handler); return () => {}; },
    sendMessage: async (channel, data) => { sent.push({ channel, data: structuredClone(data) }); },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk } });
const { TURN_NOTICE_URL_PAYLOAD_MAX_CHARS, turnNoticeUrlPayload } = await import("../src/turnNoticeHostCore.js");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
let instance = 0;
async function freshHost() {
  handlers = new Map();
  opened = [];
  sent = [];
  openGate = null;
  openFailures = 0;
  const { mountTurnNoticeHost } = await import(`../src/turnNoticeHost.js?instance=${++instance}`);
  mountTurnNoticeHost();
  await settle();
}
const deliver = (channel, data) => handlers.get(channel)?.({ data });
const turn = (noticeId, extra = {}) => ({ type: "show-turn-notice", sceneEpoch: 1, noticeId, activeName: `Turno ${noticeId}`, ...extra });
const urlPayload = (options) => {
  const value = new URL(options.url, "https://plugin.test").searchParams.get("payload");
  return value ? JSON.parse(value) : null;
};
const uiNoticeIds = () => sent.filter((entry) => entry.channel === UI).map((entry) => entry.data.noticeId ?? entry.data.type);

test("the URL payload is the turn notice only, and only while it fits", () => {
  assert.equal(JSON.parse(decodeURIComponent(turnNoticeUrlPayload(turn(1)))).noticeId, 1);
  assert.equal(turnNoticeUrlPayload({ type: "show-effect-save-notices", notices: [] }), "");
  assert.equal(turnNoticeUrlPayload(turn(2, { activeName: "x".repeat(TURN_NOTICE_URL_PAYLOAD_MAX_CHARS) })), "");
});

test("a closed popup opens with the turn notice in its URL, which is not sent again after the handshake", async () => {
  await freshHost();
  deliver(TURN, turn(1));
  await settle();
  assert.equal(opened.length, 1);
  assert.equal(urlPayload(opened[0])?.noticeId, 1);
  assert.ok(sent.some((entry) => entry.channel === READY && entry.data.type === "turn-notice-ready-request"));
  deliver(READY, { type: "turn-notice-ready", sceneEpoch: 1 });
  await settle();
  assert.deepEqual(uiNoticeIds(), [], "nothing left to flush");
  // The next turn, with the popup open: through the UI channel as before.
  deliver(TURN, turn(2));
  await settle();
  assert.deepEqual(uiNoticeIds(), [2]);
  assert.equal(opened.length, 1);
});

test("a newer turn arriving while the popup opens follows after the handshake", async () => {
  await freshHost();
  let release;
  openGate = new Promise((resolve) => { release = resolve; });
  deliver(TURN, turn(1));
  await settle();
  deliver(TURN, turn(2));
  release();
  await settle();
  assert.equal(urlPayload(opened[0])?.noticeId, 1, "the URL carries the notice the open started with");
  deliver(READY, { type: "turn-notice-ready", sceneEpoch: 1 });
  await settle();
  assert.deepEqual(uiNoticeIds(), [2], "the newer one is delivered after, and wins by its noticeId");
});

test("other payloads and a turn notice too long for a URL keep the handshake", async () => {
  await freshHost();
  deliver(TURN, turn(1, { activeName: "x".repeat(TURN_NOTICE_URL_PAYLOAD_MAX_CHARS) }));
  await settle();
  assert.equal(urlPayload(opened[0]), null);
  deliver(READY, { type: "turn-notice-ready", sceneEpoch: 1 });
  await settle();
  assert.deepEqual(uiNoticeIds(), [1]);

  await freshHost();
  deliver(ZONE, { type: "show-zone-trigger-notices", sceneEpoch: 1, notices: [] });
  await settle();
  assert.equal(urlPayload(opened[0]), null);
  deliver(READY, { type: "turn-notice-ready", sceneEpoch: 1 });
  await settle();
  assert.deepEqual(uiNoticeIds(), ["show-zone-trigger-notices"]);
});

test("a failed open keeps the turn notice queued for the next attempt", async () => {
  await freshHost();
  openFailures = 1;
  deliver(TURN, turn(1));
  await settle();
  assert.equal(opened.length, 0);
  deliver(ZONE, { type: "show-zone-trigger-notices", sceneEpoch: 1, notices: [] });
  await settle();
  assert.equal(urlPayload(opened[0])?.noticeId, 1, "the queued turn notice is the first payload again");
  deliver(READY, { type: "turn-notice-ready", sceneEpoch: 1 });
  await settle();
  assert.deepEqual(uiNoticeIds(), ["show-zone-trigger-notices"]);
});

test("the page draws the URL notice through the UI handler before it announces that it is ready", () => {
  const source = readFileSync(new URL("../src/turn-notice.ts", import.meta.url), "utf8");
  const subscribe = source.indexOf("OBR.broadcast.onMessage(UI_CHANNEL, (event) => receiveUiPayload(event?.data));");
  const urlNotice = source.indexOf("receiveUiPayload(urlTurnNotice);");
  const ready = source.indexOf("void announceReady();");
  assert.ok(subscribe > 0 && subscribe < urlNotice && urlNotice < ready);
  assert.match(source, /return payload\?\.type === "show-turn-notice" \? payload : null;/);
});
