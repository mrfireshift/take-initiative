// Lot L23: the bugfix plan's room check (runBugfixCheck in src/fluidityRoomCheck.js), its pure checks and a whole GM
// run against a fake room whose tracker answers through the same BroadcastChannel as in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFluidityCheckClient,
  evaluateHiddenLeakLog,
  expectedTurnAfterRemoval,
  hiddenTokenLeaks,
  installFluidityCheckRemote,
  runBugfixCheck,
} from "../src/fluidityRoomCheck.js";

const ID = "com.thebigpicture.initiative";
const META = `${ID}/meta`;
const STATE = `${ID}/state`;
const BAR = `${ID}/hpbar`;
const TEXT = `${ID}/hptext`;
const AURA = `${ID}/customAura`;

test("L23: dopo la rimozione il turno va alla successiva ancora presente, carte Paragon comprese", () => {
  const order = ["mira", "goblin", "boss", "boss::p1", "orc"];
  assert.deepEqual(expectedTurnAfterRemoval({ order, current: 1, round: 2 }, "goblin"), { id: "boss", round: 2 });
  assert.deepEqual(expectedTurnAfterRemoval({ order, current: 2, round: 2 }, "boss"), { id: "orc", round: 2 }, "the Paragon's second card leaves too");
  assert.deepEqual(expectedTurnAfterRemoval({ order, current: 3, round: 2 }, "boss"), { id: "orc", round: 2 });
  assert.deepEqual(expectedTurnAfterRemoval({ order, current: 4, round: 2 }, "orc"), { id: "mira", round: 3 }, "the last one: the first, the round after");
});

test("L23: barre, numero, aure e card di un token nascosto contano come visibili ai giocatori", () => {
  const items = [
    { id: "gob", visible: false, metadata: {} },
    { id: "gob-bar", visible: true, metadata: { [BAR]: { kind: "fg", targetId: "gob" } } },
    { id: "gob-text", visible: false, metadata: { [TEXT]: { targetId: "gob" } } },
    { id: "gob-aura", visible: true, attachedTo: "gob", metadata: { [AURA]: { sourceId: "gob" } } },
    { id: "mira", visible: true, metadata: {} },
    { id: "mira-bar", visible: true, metadata: { [BAR]: { kind: "bg", targetId: "mira" } } },
    // A token the players' scene does not list: its bar must not be on screen either.
    { id: "ghost-bar", visible: true, metadata: { [BAR]: { kind: "bg", targetId: "ghost" } } },
  ];
  const leaks = hiddenTokenLeaks(items, ["mira", "gob", "__lair__", "boss::p1"]).map((leak) => `${leak.tokenId}:${leak.kind}`);
  assert.deepEqual(leaks, ["gob:barra-pf", "gob:aura", "ghost:barra-pf", "gob:card", "boss:card"]);
  assert.deepEqual(hiddenTokenLeaks(items.filter((item) => item.visible === false || !item.metadata[BAR] && !item.metadata[AURA]), ["mira"]), []);
});

test("L23: sul tavolo un token nascosto visibile per più del tempo di assestamento è un'anomalia, una volta", () => {
  const leak = [{ tokenId: "gob", kind: "card", itemId: "gob" }];
  const short = [0, 1000, 2000].map((at) => ({ at, hiddenLeaks: leak })).concat([{ at: 2400 }]);
  assert.deepEqual(evaluateHiddenLeakLog(short), []);
  const long = [0, 1000, 2000, 3000, 4000].map((at) => ({ at, hiddenLeaks: leak }));
  assert.deepEqual(evaluateHiddenLeakLog(long).map((anomaly) => `${anomaly.tokenId}:${anomaly.what}`), ["gob:card"]);
});

function fakeElement({ dataset = {}, title = "", onClick = null } = {}) {
  return {
    dataset, title, textContent: "", style: {}, disabled: false,
    getAttribute: () => null, click: () => onClick?.(), querySelector: () => null,
  };
}

// Mira, a goblin, the Paragon boss Auril (two cards) and an orc. The fake background and tracker do what the real ones
// do for this check: the turn end of the outgoing creature ends its turn-end conditions, a token out of the initiative
// leaves the order (the turn goes to the next) and writes its History entry, a hidden token's widgets are hidden.
function bugfixRoom({ breakExpiry = false, breakUndo = false } = {}) {
  const master = ["mira", "goblin", "auril", "auril::p1", "orc"];
  const state = { order: [...master], current: 0, round: 1 };
  const base = (id) => id.replace(/::p\d+$/u, "");
  let items = [
    { id: "mira", name: "Mira", visible: true, metadata: { [META]: { inInitiative: true, hp: 20, hpMax: 20, attitude: "pc" } } },
    { id: "goblin", name: "Goblin", visible: true, metadata: { [META]: { inInitiative: true, hp: 7, hpMax: 7, attitude: "enemy" } } },
    { id: "auril", name: "Auril", visible: true, metadata: { [META]: { inInitiative: true, hp: 580, hpMax: 580, attitude: "enemy" } } },
    { id: "orc", name: "Orc", visible: true, metadata: { [META]: { inInitiative: true, hp: 15, hpMax: 15, attitude: "enemy" } } },
    { id: "goblin-bg", visible: true, metadata: { [BAR]: { kind: "bg", targetId: "goblin" } } },
    { id: "goblin-text", visible: true, metadata: { [TEXT]: { targetId: "goblin" } } },
    { id: "goblin-aura", visible: true, attachedTo: "goblin", metadata: { [AURA]: { sourceId: "goblin" } } },
  ];
  const history = [];
  let historyId = 0;
  const item = (id) => items.find((entry) => entry.id === id);
  const meta = (id) => item(id).metadata[META];
  const move = (direction) => {
    if (direction > 0) {
      const outgoing = base(state.order[state.current]);
      if (!breakExpiry && item(outgoing)) {
        meta(outgoing).conditions = (meta(outgoing).conditions || []).filter((entry) => !(entry.expiry?.mode === "turn-end" && entry.expiry.actorId === outgoing));
      }
    }
    const next = state.current + direction;
    if (next >= state.order.length) { state.current = 0; state.round += 1; }
    else if (next < 0) { state.current = state.order.length - 1; state.round = Math.max(1, state.round - 1); }
    else state.current = next;
  };
  const reconcile = () => {
    const activeId = state.order[state.current];
    const present = master.filter((id) => meta(base(id))?.inInitiative === true);
    const index = present.indexOf(activeId);
    if (index >= 0) { state.order = present; state.current = index; return; }
    // The active one left: the turn goes to the one now at its place.
    const at = state.order.indexOf(activeId);
    const after = state.order.slice(at + 1).find((id) => present.includes(id));
    state.order = present;
    if (after) state.current = present.indexOf(after);
    else { state.current = 0; state.round += 1; }
  };
  const record = (entry) => history.push({ id: `h${++historyId}`, ...entry });
  const updateItems = async (ids, update) => {
    const before = structuredClone(items.filter((entry) => ids.includes(entry.id)));
    const drafts = structuredClone(before);
    update(drafts);
    items = items.map((entry) => drafts.find((draft) => draft.id === entry.id) || entry);
    for (const draft of drafts) {
      const old = before.find((entry) => entry.id === draft.id);
      if (old.metadata[META]?.inInitiative === true && draft.metadata[META]?.inInitiative !== true) {
        record({ kind: "initiative-remove", label: `Rimosso dall'iniziativa: ${draft.name}`, changes: [{ id: draft.id, before: { inInitiative: true }, after: {} }] });
      }
      if (old.visible !== draft.visible) {
        items = items.map((entry) => (entry.metadata?.[BAR]?.targetId === draft.id || entry.metadata?.[TEXT]?.targetId === draft.id || entry.attachedTo === draft.id
          ? { ...entry, visible: draft.visible } : entry));
      }
    }
    reconcile();
  };
  const pill = {
    dataset: { badge: "hp", itemId: "auril::p1" },
    getBoundingClientRect: () => ({ left: 10, width: 60 }),
    dispatchEvent(event) {
      if (event.type !== "pointerdown") return;
      this.__iHP = { value: String(meta("auril").hp) };
      this.__commitFn = async () => {
        const previous = meta("auril").hp;
        meta("auril").hp = Number(this.__iHP.value);
        record({ kind: "hp", label: "Modifica HP", changes: [{ id: "auril", before: { hp: previous }, after: { hp: meta("auril").hp } }] });
        return true;
      };
    },
  };
  const buttons = [
    fakeElement({ title: "Turno successivo", onClick: () => move(1) }),
    fakeElement({ title: "Turno precedente", onClick: () => move(-1) }),
  ];
  const trackerDocument = {
    querySelectorAll: (selector) => {
      if (selector === "button") return buttons;
      if (selector === "[data-badge='hp']") return [pill];
      if (selector === "[data-tracker-card='1']") {
        return state.order.map((id, index) => fakeElement({ dataset: { itemId: id, active: index === state.current ? "1" : "" } }));
      }
      return [];
    },
    dispatchEvent: () => {},
  };
  const trackerWindow = {
    location: { search: "?surface=tracker" }, innerWidth: 420, innerHeight: 600,
    PointerEvent: class { constructor(type, init) { Object.assign(this, init, { type }); } },
  };
  const obr = {
    player: { getRole: async () => "GM" },
    scene: {
      getMetadata: async () => ({ [STATE]: structuredClone(state) }),
      items: {
        getItems: async (ids) => structuredClone(ids ? items.filter((entry) => ids.includes(entry.id)) : items),
        updateItems,
      },
    },
  };
  const effects = {
    requireAppliedEffectsMutation: (result) => result,
    runEffectsMutation: async (operations) => {
      for (const operation of operations) {
        const [targetId] = operation.targetIds;
        if (operation.type === "condition:add") {
          meta(targetId).conditions = [...(meta(targetId).conditions || []),
            { id: operation.instanceIds[targetId], condition: operation.conditionName, expiry: operation.options.expiry }];
        }
        if (operation.type === "condition:remove-instances") {
          const ids = operation.removals.map((removal) => removal.instanceId);
          meta(targetId).conditions = (meta(targetId).conditions || []).filter((entry) => !ids.includes(entry.id));
        }
      }
      return { status: "applied" };
    },
  };
  const historyModule = {
    getHistoryEntries: async () => structuredClone(history),
    undoHistoryThrough: async (entryId) => {
      if (breakUndo) return Object.assign([], { status: "rejected", result: { reason: "history-pending" } });
      const undone = history.splice(history.findIndex((entry) => entry.id === entryId)).reverse();
      for (const entry of undone) {
        for (const change of entry.changes) Object.assign(meta(change.id), change.before);
      }
      reconcile();
      return Object.assign(undone, { status: "applied" });
    },
  };
  return {
    obr, state, trackerDocument, trackerWindow, history, items: () => items, meta,
    imports: {
      importTrackerPopover: async () => ({ openTrackerPopover: async () => { delete trackerWindow.__fluidityCheckMark; } }),
      importEffectsMutations: async () => effects,
      importHistory: async () => historyModule,
    },
  };
}

async function run(room, t, options = {}) {
  const stop = installFluidityCheckRemote({ realm: "index", documentRef: room.trackerDocument, windowRef: room.trackerWindow });
  t.after(stop);
  const saved = [];
  const rows = await runBugfixCheck({
    probe: { enabled: true }, obr: room.obr, hideMs: 0, tickTimeoutMs: 2000,
    client: createFluidityCheckClient({ timeoutMs: 2000 }),
    save: async (entry) => { saved.push(entry.name); return { saved: true, file: "" }; },
    wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    log: () => {},
    ...room.imports,
    ...options,
  });
  return { rows, saved, byName: Object.fromEntries(rows.map((row) => [row.verifica, row])) };
}

test("L23: un giro completo nella room finta, ogni passo verificato e tutto rimesso com'era", async (t) => {
  const room = bugfixRoom();
  const { rows, saved } = await run(room, t);
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.verifica, row.esito])), {
    "L2 · scadenze dopo la riapertura del tracker": "ok",
    "L27 · PF dalla seconda card di un boss Paragon": "ok",
    "L6 · tolta la creatura di turno": "ok",
    "L3 · Annulla di due voci dalla Cronologia": "ok",
    "L16 · token nascosto: barre e aure solo al GM": "ok",
  }, JSON.stringify(rows, null, 2));
  assert.match(rows[2].dettaglio, /Goblin tolta: di turno Auril al round 1 \(atteso Auril al round 1\)/);
  assert.match(rows[3].dettaglio, /«Modifica HP» e «Rimosso dall'iniziativa: Goblin»/);
  assert.deepEqual(room.meta("mira").conditions, [], "the test condition expired");
  assert.equal(room.meta("goblin").inInitiative, true, "the goblin is back in the initiative");
  assert.equal(room.meta("auril").hp, 580, "Auril's HP is back");
  assert.equal(room.items().every((entry) => entry.visible !== false), true, "nothing stays hidden");
  assert.deepEqual([room.state.order[room.state.current], room.state.round], ["mira", 1], "the turn is back");
  assert.equal(room.history.length, 0, "the two entries were undone");
  assert.deepEqual(saved, ["verifica-bugfix"]);
});

test("L23: scadenza e Annulla che non funzionano sono segnalati, e la room torna com'era lo stesso", async (t) => {
  const room = bugfixRoom({ breakExpiry: true, breakUndo: true });
  const { byName } = await run(room, t, { now: (() => { let clock = Date.now(); return () => (clock += 50); })() });
  assert.equal(byName["L2 · scadenze dopo la riapertura del tracker"].esito, "ATTENZIONE");
  assert.match(byName["L2 · scadenze dopo la riapertura del tracker"].dettaglio, /«Prova verifica» ancora su Mira/);
  assert.equal(byName["L3 · Annulla di due voci dalla Cronologia"].esito, "ATTENZIONE");
  assert.match(byName["L3 · Annulla di due voci dalla Cronologia"].dettaglio, /annullamento rejected \(history-pending\)/);
  assert.deepEqual(room.meta("mira").conditions, [], "the test condition is taken off at the end");
  assert.equal(room.meta("goblin").inInitiative, true, "the goblin is put back in the initiative");
  assert.equal(room.meta("auril").hp, 580, "Auril's HP is put back");
  assert.deepEqual([room.state.order[room.state.current], room.state.round], ["mira", 1], "the turn is back");
});
