// The room check of the fluidity lots (src/fluidityRoomCheck.js): its pure checks, and a whole GM run against a fake
// room whose tracker, turn notice and map bars answer through the same BroadcastChannel as in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFluidityCheckClient,
  evaluateHpWidgets,
  evaluateNoticeOrder,
  evaluateWatchLog,
  installFluidityCheckRemote,
  noticeNamesActor,
  runFluidityCheck,
} from "../src/fluidityRoomCheck.js";

const ID = "com.thebigpicture.initiative";
const META = `${ID}/meta`;
const BAR = `${ID}/hpbar`;
const TEXT = `${ID}/hptext`;

const widgets = (tokenId, hp, hpMax, { bgWidth = 104, extraText = false } = {}) => [
  { id: `${tokenId}-bg`, width: bgWidth, metadata: { [BAR]: { kind: "bg", targetId: tokenId } } },
  { id: `${tokenId}-fg`, width: Math.floor((bgWidth - 4) * (hp / hpMax)), metadata: { [BAR]: { kind: "fg", targetId: tokenId } } },
  { id: `${tokenId}-text`, text: { plainText: `${hp}/${hpMax}` }, metadata: { [TEXT]: { targetId: tokenId } } },
  ...(extraText ? [{ id: `${tokenId}-text-2`, text: { plainText: `${hp}/${hpMax}` }, metadata: { [TEXT]: { targetId: tokenId } } }] : []),
];

test("the map widgets check counts, text and fill width", () => {
  assert.deepEqual(evaluateHpWidgets(widgets("gob", 5, 10), "gob", 5, 10).problems, []);
  assert.match(evaluateHpWidgets(widgets("gob", 5, 10), "gob", 4, 10).problems.join(), /testo «5\/10» invece di «4\/10»/);
  assert.match(evaluateHpWidgets(widgets("gob", 5, 10, { extraText: true }), "gob", 5, 10).problems.join(), /2 testi invece di 1/);
  assert.match(evaluateHpWidgets([], "gob", 5, 10).problems.join(), /0 sfondi/);
});

test("notice names, order and the table screen's log", () => {
  assert.equal(noticeNamesActor("Turno di Goblin A", "Goblin A"), true);
  assert.equal(noticeNamesActor("Turno di Mira", "Goblin A"), false);
  assert.deepEqual(evaluateNoticeOrder([{ noticeId: 3 }, { noticeId: 5 }, { noticeId: 4 }]).outOfOrder, 1);
  assert.equal(evaluateNoticeOrder([{ noticeId: 3 }, { noticeId: 5 }], 5).ok, true);
  const samples = [0, 1000, 2000, 3000].map((at) => ({ at, activeName: "Mira", noticeTitle: "Turno di Goblin" }));
  assert.equal(evaluateWatchLog(samples).length, 1, "a notice naming someone else for more than the settle time");
  assert.equal(evaluateWatchLog(samples.slice(0, 2)).length, 0, "a short overlap while the turn changes is not one");
});

function fakeElement({ dataset = {}, title = "", textContent = "", onClick = null, children = {} } = {}) {
  return {
    dataset, title, textContent, style: {}, disabled: false, classList: { contains: (name) => name === "is-visible" },
    getAttribute: () => null,
    click: () => onClick?.(),
    querySelector: (selector) => children[selector] || null,
  };
}

function fakeRoom() {
  const order = ["mira", "goblin-a", "auril"];
  const names = { mira: "Mira", "goblin-a": "Goblin A", auril: "Auril" };
  const state = { order, current: 0, round: 1 };
  let items = [
    { id: "mira", name: "Mira", metadata: { [META]: { inInitiative: true, hp: 20, hpMax: 20, attitude: "pc" } } },
    { id: "goblin-a", name: "Goblin A", metadata: { [META]: { inInitiative: true, hp: 7, hpMax: 7, attitude: "enemy" } } },
    { id: "auril", name: "Auril", metadata: { [META]: { inInitiative: true, hp: 580, hpMax: 580, attitude: "enemy" } } },
    ...widgets("goblin-a", 7, 7),
  ];
  const uiListeners = [];
  let noticeId = 0;
  const noticeTitle = fakeElement();
  const noticeDocument = { querySelectorAll: (selector) => (selector === ".notice" && noticeTitle.textContent ? [fakeElement({ children: { ".title": noticeTitle } })] : []) };
  const showNotice = () => {
    noticeTitle.textContent = `Turno di ${names[order[state.current]]}`;
    for (const listener of uiListeners) listener({ data: { type: "show-turn-notice", noticeId: ++noticeId, currentName: names[order[state.current]] } });
  };
  const room = { onTurn: () => {} };
  const move = (direction) => {
    room.onTurn();
    const next = state.current + direction;
    if (next >= order.length) { state.current = 0; state.round += 1; }
    else if (next < 0) { state.current = order.length - 1; state.round = Math.max(1, state.round - 1); }
    else state.current = next;
    showNotice();
  };
  const buttons = [
    fakeElement({ title: "Turno successivo", onClick: () => move(1) }),
    fakeElement({ title: "Turno precedente", onClick: () => move(-1) }),
  ];
  const card = (id) => fakeElement({
    dataset: { itemId: id, get active() { return order[state.current] === id ? "1" : ""; } },
    children: { "[data-badge='hp']": { get textContent() { const meta = items.find((item) => item.id === id).metadata[META]; return `${meta.hp}/${meta.hpMax}`; } } },
  });
  const cards = order.map(card);
  for (const entry of cards) entry.__hpMode = "exact";
  const trackerDocument = {
    querySelectorAll: (selector) => (selector === "button" ? buttons : selector === "[data-tracker-card='1']" ? cards : []),
  };
  const opened = [];
  const obr = {
    player: { getRole: async () => "GM" },
    popover: {
      getWidth: async () => 420, getHeight: async () => 600, close: async () => {},
      open: async (options) => { opened.push(options); if (room.reloadOnOpen) delete room.trackerWindow.__fluidityCheckMark; },
    },
    broadcast: { onMessage: (channel, listener) => { if (channel.endsWith("/turn-notice/ui")) uiListeners.push(listener); return () => {}; } },
    scene: {
      getMetadata: async () => ({ [`${ID}/state`]: structuredClone(state) }),
      items: {
        getItems: async (ids) => structuredClone(ids ? items.filter((item) => ids.includes(item.id)) : items),
        updateItems: async (ids, update) => {
          const drafts = structuredClone(items.filter((item) => ids.includes(item.id)));
          update(drafts);
          items = items.map((item) => drafts.find((draft) => draft.id === item.id) || item);
          // The background's bar sync, as the real one leaves the widgets.
          for (const draft of room.brokenBars ? [] : drafts) {
            const meta = draft.metadata[META];
            items = items.filter((item) => item.metadata?.[BAR]?.targetId !== draft.id && item.metadata?.[TEXT]?.targetId !== draft.id)
              .concat(widgets(draft.id, meta.hp, meta.hpMax));
          }
        },
      },
    },
  };
  room.trackerWindow = { location: { search: "?surface=tracker" } };
  return Object.assign(room, { obr, state, opened, trackerDocument, noticeDocument, items: () => items });
}

test("a whole GM run against a fake room: each step checked, the turn and the HP put back", async (t) => {
  const room = fakeRoom();
  const remotes = [
    installFluidityCheckRemote({ realm: "index", documentRef: room.trackerDocument, windowRef: room.trackerWindow }),
    installFluidityCheckRemote({ realm: "turn-notice", obr: room.obr, documentRef: room.noticeDocument, windowRef: { location: { search: "" } } }),
  ];
  t.after(() => remotes.forEach((stop) => stop()));
  const events = [];
  const probe = {
    enabled: true, events, reset: () => { events.length = 0; },
    export: () => JSON.stringify({ summary: { transport: [{ key: "apply:effects:tick-boundaries", requests: 10, roundTripMs: { p50: 900, p95: 1500 } }] } }),
  };
  // Every turn the tracker presses produces its tick, as the background's coordinator would.
  room.onTurn = () => events.push({ type: "effects-command", at: Date.now(), commandKind: "effects:tick-boundaries" });
  const saved = [];
  const rows = await runFluidityCheck({
    probe, obr: room.obr, turns: 3, measureTurns: 2, settleMs: 0,
    client: createFluidityCheckClient({ timeoutMs: 500 }),
    save: async (entry) => { saved.push(entry.name); return { saved: true, file: `perf-runs/${entry.name}.json` }; },
    wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    log: () => {},
    importTrackerPopover: async () => ({ openTrackerPopover: async () => {} }),
    importBossLauncher: async () => ({ openBossActionsPopover: async () => {} }),
  });
  const outcome = Object.fromEntries(rows.map((row) => [row.verifica, row.esito]));
  assert.deepEqual(outcome, {
    "D6 · tracker riaperto senza chiuderlo": "ok",
    "Turno e avviso (P4b, T1, T7)": "ok",
    "Tre turni di fila: vince l'ultimo (P4b)": "ok",
    "Altezza delle chip (T5)": "saltata",
    "PF e barre sulla mappa (S6, S7)": "ok",
    "Console Boss riaperta ridotta (V3)": "saltata",
    "Misura del cambio turno": "ok",
  }, JSON.stringify(rows, null, 2));
  assert.equal(room.opened[0].id, `${ID}/tracker-popover`, "D6 reopens the tracker with its own id");
  assert.equal(room.state.current, 0, "the turns are put back");
  assert.equal(room.state.round, 1);
  assert.equal(room.items().find((item) => item.id === "goblin-a").metadata[META].hp, 7, "the HP is put back");
  assert.deepEqual(saved, ["gm-turni-fluidita", "verifica-fluidita"]);
});

test("a reloaded tracker and bars that do not follow the HP are reported, and the HP still goes back", async (t) => {
  const room = fakeRoom();
  room.reloadOnOpen = true;
  room.brokenBars = true;
  const remotes = [
    installFluidityCheckRemote({ realm: "index", documentRef: room.trackerDocument, windowRef: room.trackerWindow }),
    installFluidityCheckRemote({ realm: "turn-notice", obr: room.obr, documentRef: room.noticeDocument, windowRef: { location: { search: "" } } }),
  ];
  t.after(() => remotes.forEach((stop) => stop()));
  const rows = await runFluidityCheck({
    probe: { enabled: true, events: [], reset() {}, export: () => "{}" }, obr: room.obr, turns: 1, measureTurns: 0, settleMs: 0,
    client: createFluidityCheckClient({ timeoutMs: 300 }),
    save: async () => ({ saved: true, file: "" }),
    wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    now: (() => { let clock = Date.now(); return () => (clock += 50); })(),
    log: () => {},
    importTrackerPopover: async () => ({ openTrackerPopover: async () => {} }),
    importBossLauncher: async () => ({ openBossActionsPopover: async () => {} }),
  });
  const byName = Object.fromEntries(rows.map((row) => [row.verifica, row]));
  assert.equal(byName["D6 · tracker riaperto senza chiuderlo"].esito, "ATTENZIONE");
  assert.match(byName["D6 · tracker riaperto senza chiuderlo"].dettaglio, /ricaricata/);
  assert.equal(byName["PF e barre sulla mappa (S6, S7)"].esito, "ATTENZIONE");
  assert.match(byName["PF e barre sulla mappa (S6, S7)"].dettaglio, /testo «7\/7» invece di «4\/7»/);
  assert.equal(room.items().find((item) => item.id === "goblin-a").metadata[META].hp, 7, "the HP is put back");
  assert.equal(room.state.current, 0, "the turn is put back");
});
