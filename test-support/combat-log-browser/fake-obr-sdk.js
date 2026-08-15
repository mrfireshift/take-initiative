import { createPerformanceObr } from "../performanceObr.js";

const ID = "com.thebigpicture.initiative";
const DB_NAME = `${ID}.combat-log`;
const SESSION_ID = "browser-session";
const ROOM_ID = "performance-room";
const ARCHIVED_SESSION_ID = "browser-archived-session";
const IMPORTED_SESSION_ID = "browser-imported-session";

function clone(value) {
  return globalThis.structuredClone(value);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB fixture failed"));
  });
}

function event(sequence, overrides = {}) {
  return {
    version: 2,
    id: `browser-event-${sequence}`,
    sessionId: SESSION_ID,
    sequence,
    at: 1_700_000_000_000 + sequence * 1_000,
    round: 1,
    kind: "note",
    category: "note",
    label: "Nota fixture",
    source: "automatic",
    turn: { id: "arannis", name: "Arannis" },
    targets: [],
    payload: { text: "Evento fixture" },
    ...overrides,
  };
}

const fixtureEvents = [
  event(1, {
    round: 1,
    kind: "spell-cast",
    category: "spell",
    label: "Palla di fuoco",
    turn: { id: "arannis", name: "Arannis" },
    targets: [
      { id: "goblin-1", name: "Goblin" },
      { id: "sciamano", name: "Sciamano" },
      { id: "ogre", name: "Ogre" },
    ],
    payload: {
      spellName: "Palla di fuoco",
      casterName: "Arannis",
      targets: [
        { id: "goblin-1", name: "Goblin", outcome: "failed", damage: 28 },
        { id: "sciamano", name: "Sciamano", outcome: "passed", damage: 14 },
        { id: "ogre", name: "Ogre", outcome: "immune", damage: 0 },
      ],
      outcomes: { "goblin-1": "failed", sciamano: "passed", ogre: "immune" },
      causality: {
        version: 1,
        domain: "spell",
        eventType: "area/save-resolution",
        cause: { kind: "spell", spellId: "fireball", spellName: "Palla di fuoco", instanceId: "spell-fireball-1", slotLevel: 3 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        phase: "resolve",
        action: { label: "Tiro salvezza", damageRoll: 28 },
        targets: [
          { id: "goblin-1", name: "Goblin", outcome: "failed", requestedDamage: 28, appliedHpDelta: -28, damageFactor: 1 },
          { id: "sciamano", name: "Sciamano", outcome: "passed", requestedDamage: 14, appliedHpDelta: 0, damageFactor: 0.5 },
          { id: "ogre", name: "Ogre", outcome: "immune", requestedDamage: 0, appliedHpDelta: 0, damageFactor: 0 },
        ],
      },
    },
  }),
  event(2, {
    round: 1,
    kind: "hp",
    category: "hp",
    label: "Danno Palla di fuoco",
    turn: { id: "arannis", name: "Arannis" },
    targets: [{
      id: "goblin-1",
      name: "Goblin",
      before: { hp: 30, hpMax: 30 },
      after: { hp: 2, hpMax: 30 },
      delta: -28,
      hpMaxDelta: 0,
    }],
    facets: { hp: { action: "damage", targets: [{
      id: "goblin-1",
      name: "Goblin",
      before: { hp: 30, hpMax: 30 },
      after: { hp: 2, hpMax: 30 },
      delta: -28,
      hpMaxDelta: 0,
    }] } },
    payload: {
      spellName: "Palla di fuoco",
      casterName: "Arannis",
      damage: 28,
      causality: {
        version: 1,
        domain: "spell",
        eventType: "resolution",
        cause: { kind: "spell", spellId: "fireball", spellName: "Palla di fuoco", instanceId: "spell-fireball-1", slotLevel: 3 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        targets: [{ id: "goblin-1", name: "Goblin", requestedDamage: 28, appliedHpDelta: -28, damageFactor: 1 }],
        action: { damageRoll: 28 },
      },
    },
  }),
  event(3, {
    round: 1,
    kind: "save-resolution",
    category: "save",
    label: "TS Destrezza",
    turn: { id: "__LAIR__", name: "Azioni di Tana" },
    targets: [{ id: "sciamano", name: "Sciamano" }],
    payload: {
      outcome: "immune",
      targets: [{ id: "sciamano", name: "Sciamano", outcome: "immune" }],
      causality: {
        version: 1,
        domain: "spell",
        eventType: "area/save-resolution",
        cause: { kind: "spell", spellId: "lair-storm", spellName: "Tempesta della tana", instanceId: "lair-1", slotLevel: 4 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        targets: [{ id: "sciamano", name: "Sciamano", outcome: "immune" }],
      },
    },
  }),
  event(4, {
    round: 2,
    kind: "spell-active-resolution",
    category: "spell",
    label: "Raggio rovente",
    turn: { id: "arannis", name: "Arannis" },
    targets: [{ id: "ogre", name: "Ogre" }],
    payload: {
      spellName: "Raggio rovente",
      casterName: "Arannis",
      action: "Raggio 1",
      attackOutcome: "hit",
      damageRoll: 12,
      targets: [{ id: "ogre", name: "Ogre", outcome: "hit", damage: 12 }],
      causality: {
        version: 1,
        domain: "spell",
        eventType: "resolution",
        cause: { kind: "spell", spellId: "scorching-ray", spellName: "Raggio rovente", instanceId: "spell-ray-1", slotLevel: 2 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        action: { id: "ray-1", label: "Raggio 1", attackOutcome: "hit", damageRoll: 12 },
        targets: [{ id: "ogre", name: "Ogre", outcome: "hit", requestedDamage: 12, appliedHpDelta: -12, damageFactor: 1 }],
      },
    },
  }),
  event(5, {
    round: 2,
    kind: "hp",
    category: "hp",
    label: "Danno Raggio rovente",
    turn: { id: "arannis", name: "Arannis" },
    targets: [{
      id: "ogre",
      name: "Ogre",
      before: { hp: 50, hpMax: 50 },
      after: { hp: 38, hpMax: 50 },
      delta: -12,
      hpMaxDelta: 0,
    }],
    facets: { hp: { action: "damage", targets: [{
      id: "ogre",
      name: "Ogre",
      before: { hp: 50, hpMax: 50 },
      after: { hp: 38, hpMax: 50 },
      delta: -12,
      hpMaxDelta: 0,
    }] } },
    payload: {
      spellName: "Raggio rovente",
      casterName: "Arannis",
      damageRoll: 12,
      causality: {
        version: 1,
        domain: "spell",
        eventType: "resolution",
        cause: { kind: "spell", spellId: "scorching-ray", spellName: "Raggio rovente", instanceId: "spell-ray-1", slotLevel: 2 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        targets: [{ id: "ogre", name: "Ogre", appliedHpDelta: -12 }],
        action: { damageRoll: 12 },
      },
    },
  }),
  event(6, {
    round: 2,
    kind: "move",
    category: "movement",
    label: "Movimento zona",
    turn: null,
    targets: [{ id: "zona-1", name: "Nube", cells: 3 }],
    payload: {
      spellName: "Nube di pugnali",
      casterName: "Arannis",
      zoneId: "zona-1",
      causality: {
        version: 1,
        domain: "spell",
        eventType: "zone-move",
        cause: { kind: "spell", spellId: "cloud-of-daggers", spellName: "Nube di pugnali", instanceId: "zone-1" },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        zone: { action: "move", zoneItemId: "zona-1", ruleId: "cloud-of-daggers:cast", movementChoice: "forward" },
      },
    },
  }),
  event(7, {
    round: 3,
    kind: "condition-add",
    category: "condition",
    label: "Condizione applicata",
    turn: { id: "__EPIC__1", name: "Azione Epica" },
    targets: [{ id: "guardia", name: "Guardia" }],
    facets: { conditions: { targets: [{ id: "guardia", name: "Guardia", added: ["Prono"] }] } },
  }),
  event(8, {
    version: 1,
    round: 3,
    kind: "initiative-card",
    category: undefined,
    label: "<img src=x onerror=alert(1)>",
    turn: { id: "guardia", name: "Guardia" },
    payload: { text: "<img src=x onerror=alert(1)>" },
  }),
  event(9, {
    round: 4,
    kind: "spell-concentration-start",
    category: "spell",
    label: "Concentrazione iniziata",
    turn: { id: "arannis", name: "Arannis" },
    payload: {
      spellName: "Nube di pugnali",
      casterName: "Arannis",
      concentration: { action: "start" },
      causality: {
        version: 1,
        domain: "spell",
        eventType: "concentration-start",
        cause: { kind: "spell", spellId: "cloud-of-daggers", spellName: "Nube di pugnali", instanceId: "zone-1" },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        concentration: { action: "start", instanceId: "zone-1" },
      },
    },
  }),
  event(10, {
    round: 4,
    kind: "spell-concentration-end",
    category: "spell",
    label: "Concentrazione terminata",
    turn: null,
    payload: {
      spellName: "Nube di pugnali",
      casterName: "Arannis",
      concentration: { action: "end" },
      causality: {
        version: 1,
        domain: "spell",
        eventType: "concentration-end",
        cause: { kind: "spell", spellId: "cloud-of-daggers", spellName: "Nube di pugnali", instanceId: "zone-1" },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        concentration: { action: "end", instanceId: "zone-1" },
      },
    },
  }),
  event(11, {
    round: 5,
    kind: "note",
    category: "note",
    label: "Nota con accento",
    turn: { id: "arannis", name: "Arannis" },
    payload: { text: "L’azione è stata confermata" },
  }),
  event(12, {
    round: 5,
    kind: "hp",
    category: "hp",
    label: "HP generici",
    turn: null,
    targets: [{
      id: "guardia",
      name: "Guardia",
      before: { hp: 10, hpMax: 10 },
      after: { hp: 7, hpMax: 10 },
      delta: -3,
      hpMaxDelta: 0,
    }],
    facets: { hp: { action: "damage", targets: [{
      id: "guardia",
      name: "Guardia",
      before: { hp: 10, hpMax: 10 },
      after: { hp: 7, hpMax: 10 },
      delta: -3,
      hpMaxDelta: 0,
    }] } },
  }),
  event(13, {
    round: 5,
    kind: "reminder-resolution",
    category: "save",
    label: "Reminder Sfera della tempesta",
    turn: null,
    targets: [{ id: "guardia", name: "Guardia" }],
    payload: {
      activationId: "activation-1",
      targetId: "guardia",
      outcome: "failed",
      damage: 5,
      damageFactor: "half",
      causality: {
        version: 1,
        domain: "spell",
        eventType: "reminder-resolution",
        cause: { kind: "spell", spellId: "storm-sphere", spellName: "Sfera della tempesta", instanceId: "storm-1", slotLevel: 4 },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        targets: [{ id: "guardia", name: "Guardia", outcome: "failed", requestedDamage: 10, appliedHpDelta: -5, damageFactor: 0.5 }],
        action: { label: "Reminder", damageRoll: 10 },
        reminder: { activationId: "activation-1" },
      },
    },
  }),
  event(14, {
    round: 5,
    kind: "spell-zone-direction",
    category: "spell",
    label: "Rotazione zona",
    turn: null,
    payload: {
      instanceId: "zone-1",
      zoneItemId: "zona-1",
      ruleId: "cloud-of-daggers:cast",
      causality: {
        version: 1,
        domain: "spell",
        eventType: "zone-reorient",
        cause: { kind: "spell", spellId: "cloud-of-daggers", spellName: "Nube di pugnali", instanceId: "zone-1" },
        actor: { id: "arannis", name: "Arannis", role: "caster" },
        zone: { action: "reorient", zoneItemId: "zona-1", ruleId: "cloud-of-daggers:cast" },
      },
    },
  }),
];

const browserEvents = Array.from({ length: 5_000 }, (_, index) => event(index + 1, {
  round: Math.floor(index / 20) + 1,
  kind: index % 7 === 0 ? "spell" : "note",
  category: index % 7 === 0 ? "spell" : "note",
  label: index % 7 === 0 ? `Evento spell ${index + 1}` : `Evento fixture ${index + 1}`,
  payload: index % 7 === 0
    ? { spellName: "Palla di fuoco", casterName: "Arannis", text: `Evento spell ${index + 1}` }
    : { text: `Evento fixture ${index + 1}` },
}));
for (const item of fixtureEvents) browserEvents[item.sequence - 1] = item;

const archivedEvents = [1, 2, 3].map((sequence) => event(sequence, {
  id: `archived-event-${sequence}`,
  sessionId: ARCHIVED_SESSION_ID,
  at: 1_600_000_000_000 + sequence,
  label: `Evento archiviato ${sequence}`,
}));
const importedEvents = [1, 2].map((sequence) => event(sequence, {
  id: `imported-event-${sequence}`,
  sessionId: IMPORTED_SESSION_ID,
  at: 1_500_000_000_000 + sequence,
  label: `Evento importato ${sequence}`,
}));

const sessionFixtures = [
  {
    id: SESSION_ID,
    version: 1,
    roomId: ROOM_ID,
    name: "Fixture browser CL-4 · 5000 eventi",
    startedAt: browserEvents[0].at - 1_000,
    updatedAt: browserEvents.at(-1).at,
    nextSequence: browserEvents.length + 1,
    lastRound: 250,
    lastTurnKey: "arannis",
  },
  {
    id: ARCHIVED_SESSION_ID,
    version: 1,
    roomId: ROOM_ID,
    name: "Registro archiviato per retention",
    startedAt: 1_600_000_000_000,
    updatedAt: 1_600_000_000_100,
    nextSequence: 4,
    archived: true,
  },
  {
    id: IMPORTED_SESSION_ID,
    version: 1,
    roomId: ROOM_ID,
    name: "Registro importato protetto",
    startedAt: 1_500_000_000_000,
    updatedAt: 1_500_000_000_100,
    nextSequence: 3,
    archived: true,
    imported: true,
    importFingerprint: "fixture-imported",
  },
];

async function seedCombatLog() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error || new Error("IndexedDB fixture reset failed"));
    request.onblocked = () => reject(new Error("IndexedDB fixture reset blocked"));
  });
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
    if (!db.objectStoreNames.contains("events")) {
      const store = db.createObjectStore("events", { keyPath: "id" });
      store.createIndex("sessionId", "sessionId", { unique: false });
    }
  };
  const db = await requestResult(request);
  const tx = db.transaction(["sessions", "events"], "readwrite");
  for (const item of sessionFixtures) tx.objectStore("sessions").put(item);
  for (const item of [...browserEvents, ...archivedEvents, ...importedEvents]) tx.objectStore("events").put(item);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("IndexedDB fixture write failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB fixture write aborted"));
  });
  db.close();
}

await seedCombatLog();

let failNextDatabaseTransaction = false;
const nativeDatabaseTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) {
  if (failNextDatabaseTransaction) {
    failNextDatabaseTransaction = false;
    throw new Error("Fixture: lettura pagina Combat Log fallita");
  }
  return nativeDatabaseTransaction.apply(this, args);
};

const metadata = {
  [`${ID}/combat-log-state`]: {
    version: 1,
    sessionId: SESSION_ID,
    name: sessionFixtures[0].name,
    startedAt: sessionFixtures[0].startedAt,
  },
  [`${ID}/history`]: { version: 1, entries: [] },
  [`${ID}/state`]: { round: 5, current: 0, order: ["arannis", "__LAIR__"] },
};

const fixture = createPerformanceObr({
  roomMetadata: {},
  scenes: [{ id: "browser-scene", identity: "browser-scene", metadata, items: [], ready: true }],
  initialSceneId: "browser-scene",
});
const OBR = fixture.createRealm({ id: "combat-log-browser", role: "GM", popup: true });
OBR.popover = { close: async () => true };
OBR.onReady = (callback) => {
  queueMicrotask(() => callback());
  return () => {};
};
const historyChangeListeners = new Set();
const originalOnMessage = OBR.broadcast.onMessage;
OBR.broadcast.onMessage = (channel, callback) => {
  if (channel === `${ID}/history-change`) historyChangeListeners.add(callback);
  const unsubscribe = originalOnMessage(channel, callback);
  return () => {
    historyChangeListeners.delete(callback);
    unsubscribe?.();
  };
};
const refreshControl = document.createElement("div");
refreshControl.id = "__combat-log-browser-refresh";
refreshControl.setAttribute("role", "button");
refreshControl.addEventListener("mousedown", (event) => event.preventDefault());
Object.assign(refreshControl.style, {
  position: "fixed",
  left: "0",
  top: "0",
  width: "1px",
  height: "1px",
  padding: "0",
  border: "0",
  opacity: "0.01",
  zIndex: "999",
});
refreshControl.addEventListener("click", () => {
  for (const callback of [...historyChangeListeners]) callback({ data: { type: "changed" } });
});
document.body.appendChild(refreshControl);

globalThis.__combatLogBrowserFixture = Object.freeze({
  fixture,
  obr: OBR,
  events: clone(browserEvents),
  sessionFixtures: clone(sessionFixtures),
  sessionId: SESSION_ID,
  appendEvent(sequence = browserEvents.length + 1) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error || new Error("IndexedDB fixture open failed"));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["sessions", "events"], "readwrite");
        const nextEvent = event(sequence, {
          round: Math.floor((sequence - 1) / 20) + 1,
          label: `Evento aggiunto ${sequence}`,
          payload: { text: `Evento aggiunto ${sequence}` },
        });
        tx.objectStore("events").put(nextEvent);
        tx.objectStore("sessions").put({
          ...sessionFixtures[0],
          updatedAt: nextEvent.at,
          nextSequence: Math.max(sessionFixtures[0].nextSequence, sequence + 1),
          lastRound: nextEvent.round,
        });
        tx.oncomplete = () => { db.close(); refreshControl.click(); resolve(nextEvent); };
        tx.onerror = () => reject(tx.error || new Error("IndexedDB fixture append failed"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB fixture append aborted"));
      };
    });
  },
  triggerRefresh() {
    refreshControl.click();
  },
  failNextPage() {
    failNextDatabaseTransaction = true;
  },
});

const appendControl = document.createElement("button");
appendControl.id = "__combat-log-browser-append";
appendControl.type = "button";
appendControl.textContent = "Append fixture event";
appendControl.addEventListener("click", () => {
  void globalThis.__combatLogBrowserFixture.appendEvent();
});
Object.assign(appendControl.style, {
  position: "fixed",
  left: "2px",
  top: "2px",
  width: "1px",
  height: "1px",
  padding: "0",
  border: "0",
  opacity: "0.01",
  zIndex: "999",
});
document.body.appendChild(appendControl);

const failPageControl = document.createElement("button");
failPageControl.id = "__combat-log-browser-fail-page";
failPageControl.type = "button";
failPageControl.textContent = "Fail next Combat Log page";
failPageControl.addEventListener("click", () => globalThis.__combatLogBrowserFixture.failNextPage());
Object.assign(failPageControl.style, {
  position: "fixed",
  left: "4px",
  top: "4px",
  width: "1px",
  height: "1px",
  padding: "0",
  border: "0",
  opacity: "0.01",
  zIndex: "999",
});
document.body.appendChild(failPageControl);

export default OBR;
