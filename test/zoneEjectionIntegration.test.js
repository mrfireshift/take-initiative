// CAP-CARRIAGE (Xanathar), decisions SA-D1 and SA-D2 of 12/11/2026, through the real coordinator and History: who leaves
// the Watery Sphere goes to the nearest free space outside it, one that falls out because the sphere is full lands within
// 1.5 m of it, in the same command and the same Undo; a token the GM keeps hidden stays hidden; with no room the GM is told.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);
const DPI = 150;
const SPHERE = "sphere-instance";
const EFFECT = "watery-sphere-restrained";
const CARRIAGE = { capacity: 4, largeUnits: 4, exitOnSave: true, fallWithinSquares: 1 };
const MECHANICS = { carriage: CARRIAGE, landing: { fall: "on-exit" } };

let sceneItems = [];
let sceneMetadata = {};
let testSequence = 0;
const notifications = [];
const broadcastListeners = new Map();

function bounds(item) {
  const size = DPI * (Math.abs(Number(item?.scale?.x)) || 1);
  const x = Number(item?.position?.x);
  const y = Number(item?.position?.y);
  return { min: { x: x - size / 2, y: y - size / 2 }, max: { x: x + size / 2, y: y + size / 2 }, center: { x, y } };
}

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "zone-ejection-room", getMetadata: async () => ({}), setMetadata: async () => {}, onMetadataChange: () => () => {} },
  notification: { show: async (message, variant) => { notifications.push({ message, variant }); } },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => { sceneMetadata = { ...sceneMetadata, ...clone(update) }; },
    grid: { getDpi: async () => DPI, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      getItemBounds: async (ids) => bounds(sceneItems.find((item) => item.id === ids[0])),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (typeof ids === "function" ? ids(item) : ids.includes(item.id))));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => { sceneItems = sceneItems.filter((item) => !ids.includes(item.id)); },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel() {},
    buildImage() {},
    buildText() {},
    buildPath() {},
    buildShape() {},
    Command: class {},
  },
});

// The static zone controller acknowledges the movement suppression of an Undo (spellStaticZone.js).
sdk.broadcast.onMessage("com.thebigpicture.initiative/history-control", async (event) => {
  if (event.data?.type !== "suppress-history-undo" || !event.data.requestId) return;
  await sdk.broadcast.sendMessage("com.thebigpicture.initiative/history-control-ack", {
    type: "suppress-history-undo-ack",
    requestId: event.data.requestId,
  });
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { AOE_AREA_META_KEY } = await import("../src/aoeStyle.js");
const { SPELL_STATIC_ZONE_META_KEY, SPELL_ZONE_HOVER_META_KEY, translatedZoneArea } = await import("../src/spellStaticZoneCore.js");

// A token on squares (column, row), one square wide by default.
const token = (id, column, row, extra = {}) => ({
  id,
  name: id,
  type: "IMAGE",
  layer: "CHARACTER",
  visible: true,
  position: { x: (column + 0.5) * DPI, y: (row + 0.5) * DPI },
  image: { width: DPI, height: DPI },
  grid: { dpi: DPI },
  scale: { x: 1, y: 1 },
  metadata: { [META_KEY]: { hp: 7, hpMax: 7, conditions: { version: 2, instances: [] }, ...extra } },
});
const held = (id) => ({
  id: `${id}-held`,
  condition: "Trattenuto",
  active: true,
  targetId: id,
  type: "spell",
  sourceId: "caster",
  parentEffectId: SPHERE,
  effectId: EFFECT,
  expiry: { mode: "manual" },
  mechanics: MECHANICS,
});
const heldToken = (id, column, row) => token(id, column, row, { conditions: { version: 2, instances: [held(id)] } });
// The sphere: a 1.5 m radius on the vertex (300, 300), the squares (1,1)-(2,2).
const sphereRoot = () => ({
  id: "sphere-root",
  name: "Zona: Sfera Acquea",
  type: "SHAPE",
  layer: "DRAWING",
  position: { x: 300, y: 300 },
  metadata: {
    [SPELL_STATIC_ZONE_META_KEY]: {
      role: "root", instanceId: SPHERE, ruleId: "xanathar-sfera-acquea:cast", spellId: "xanathar-sfera-acquea", casterId: "caster",
    },
    [AOE_AREA_META_KEY]: {
      type: "circle",
      start: { x: 300, y: 300 },
      end: { x: 450, y: 300 },
      dpi: DPI,
      gridOrigin: { x: 300, y: 300 },
      basePosition: { x: 300, y: 300 },
    },
  },
});
const item = (id) => sceneItems.find((entry) => entry.id === id);
const pills = (id) => (item(id).metadata[META_KEY].conditions?.instances || [])
  .filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();
const square = (id) => {
  const { x, y } = item(id).position;
  return [Math.floor(x / DPI), Math.floor(y / DPI)];
};
const inSphere = ([column, row]) => column >= 1 && column <= 2 && row >= 1 && row <= 2;

async function undoLast() {
  const entries = await history.getHistoryEntries();
  return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
}

const eject = (targetIds, extra = {}) => effects.runEffectsMutation([], {
  kind: "save-resolution",
  label: "Effetti ad area · Sfera Acquea",
  targetIds,
  sideEffects: [{ type: "token:eject-from-zone", instanceId: SPHERE, targetIds, spellName: "Sfera Acquea", ...extra }],
  history: { kind: "save-resolution", label: "Effetti ad area · Sfera Acquea" },
});

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  sdk.room.id = `zone-ejection-room-${++testSequence}`;
  sceneMetadata = { [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  notifications.length = 0;
  markSceneEpochReady("zone-ejection-test");
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
});

test("la sfera di prova ha le sue quattro caselle", () => {
  const area = translatedZoneArea(sphereRoot());
  assert.deepEqual(area.cells.map((cell) => [cell.x / DPI, cell.y / DPI]).sort(), [[1, 1], [1, 2], [2, 1], [2, 2]]);
});

test("SA-D1: chi supera esce nello spazio libero più vicino, nello stesso comando; Annulla lo rimette", async () => {
  sceneItems = [token("caster", 6, 6), sphereRoot(), token("goblin", 1, 1), token("orc", 0, 0)];
  const result = await eject(["goblin"]);
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.deepEqual(square("goblin"), [1, 0], "a nord-ovest c'è l'orco: la casella a nord, dalla sua parte");
  assert.equal(item("goblin").visible, true);
  assert.equal(notifications.length, 0);
  const undo = await undoLast();
  assert.equal(undo?.ok ?? true, true, JSON.stringify(undo));
  assert.deepEqual(square("goblin"), [1, 1]);
});

test("l'area portata dal comando vale anche prima che la zona sia sulla mappa (il lancio)", async () => {
  sceneItems = [token("caster", 6, 6), token("goblin", 2, 2)];
  const area = translatedZoneArea(sphereRoot());
  const result = await eject(["goblin"], {
    area: { cells: area.cells.map((cell) => ({ x: cell.x, y: cell.y, width: cell.width, height: cell.height })) },
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.deepEqual(square("goblin"), [3, 3], "a sud-est, l'angolo a sud-est");
});

test("un token che il GM tiene nascosto esce senza diventare visibile", async () => {
  sceneItems = [token("caster", 6, 6), sphereRoot(), { ...token("assassin", 2, 1), visible: false }];
  await eject(["assassin"]);
  assert.deepEqual(square("assassin"), [3, 0]);
  assert.equal(item("assassin").visible, false);
});

test("SA-D2: la quinta creatura fa cadere fuori una già trattenuta: Prona, entro 1,5 m dalla sfera, un solo Annulla", async () => {
  sceneItems = [
    token("caster", 6, 6),
    sphereRoot(),
    heldToken("a", 1, 1), heldToken("b", 2, 1), heldToken("c", 1, 2), heldToken("d", 2, 2),
    token("e", 2, 2),
  ];
  const before = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, square(id)]));
  const result = await effects.runEffectsMutation([{
    type: "condition:add",
    targetIds: ["e"],
    conditionName: "Trattenuto",
    options: {
      type: "spell",
      sourceId: "caster",
      sourceName: "Sera",
      parentEffectId: SPHERE,
      effectId: EFFECT,
      expiry: { mode: "manual" },
      mechanics: MECHANICS,
    },
  }], {
    kind: "reminder-resolution",
    label: "Sfera Acquea · urto",
    targetIds: ["a", "b", "c", "d", "e"],
    history: { kind: "reminder-resolution", label: "Sfera Acquea · urto" },
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  const fallen = ["a", "b", "c", "d"].filter((id) => !pills(id).includes("Trattenuto"));
  assert.equal(fallen.length, 1, JSON.stringify(["a", "b", "c", "d", "e"].map((entry) => [entry, pills(entry)])));
  const [id] = fallen;
  assert.deepEqual(pills(id), ["Prono"]);
  const [column, row] = square(id);
  assert.equal(inSphere([column, row]), false, "fuori dalla sfera");
  assert.ok(column >= 0 && column <= 3 && row >= 0 && row <= 3, `entro una casella dalla sfera: ${column},${row}`);
  assert.deepEqual(pills("e"), ["Trattenuto"]);
  await undoLast();
  assert.deepEqual(square(id), before[id]);
  assert.deepEqual(pills(id), ["Trattenuto"]);
  assert.deepEqual(pills("e"), []);
});

test("senza spazio libero vicino il token resta dov'è e il GM lo sa", async () => {
  const ring = [];
  for (let column = -8; column <= 11; column += 1) {
    for (let row = -8; row <= 11; row += 1) {
      if (!inSphere([column, row])) ring.push(token(`wall-${column}-${row}`, column, row, { hp: 1, hpMax: 1 }));
    }
  }
  sceneItems = [sphereRoot(), token("goblin", 1, 1), ...ring];
  await eject(["goblin"]);
  assert.deepEqual(square("goblin"), [1, 1]);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /^Sfera Acquea: per goblin nessuno spazio libero vicino, sposta il token a mano\.$/u);
});

// H-1, H-3, H-4 (12/11/2026): the height of the creatures a zone holds up, through the real coordinator and History.
const elevation = (id) => item(id).metadata[META_KEY].elevation ?? 0;
const hoverOf = (id) => item(id).metadata[SPELL_ZONE_HOVER_META_KEY]?.elevation ?? 0;
const at = (entry, meters) => ({ ...entry, metadata: { ...entry.metadata, [META_KEY]: { ...entry.metadata[META_KEY], elevation: meters } } });
const hovering = (root, meters) => ({ ...root, metadata: { ...root.metadata, [SPELL_ZONE_HOVER_META_KEY]: { elevation: meters } } });
const pillOf = (id, name) => (item(id).metadata[META_KEY].conditions?.instances || []).find((entry) => entry.condition === name);
const setHover = (value) => effects.runEffectsMutation([], {
  kind: "zone-hover",
  label: "Sfera Acquea · quota",
  targetIds: ["sphere-root"],
  sideEffects: [{ type: "static-zone:set-hover", zoneItemId: "sphere-root", value }],
  history: { kind: "zone-hover", label: "Sfera Acquea · quota" },
});

test("H-1: Imposta quota sulla sfera porta lei e le trattenute alla stessa quota, fino a 3 m; un solo Annulla", async () => {
  sceneItems = [token("caster", 6, 6), sphereRoot(), heldToken("a", 1, 1), heldToken("b", 2, 2), token("free", 0, 0)];
  const result = await setHover(5);
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(hoverOf("sphere-root"), 3, "oltre i 3 m si ferma a 3");
  assert.deepEqual(["a", "b", "free"].map(elevation), [3, 3, 0]);
  await undoLast();
  assert.equal(item("sphere-root").metadata[SPELL_ZONE_HOVER_META_KEY], undefined);
  assert.deepEqual(["a", "b"].map(elevation), [0, 0]);
});

test("H-1: chi viene catturato entra alla quota della sfera", async () => {
  sceneItems = [token("caster", 6, 6), hovering(sphereRoot(), 3), at(heldToken("a", 1, 1), 3), token("e", 2, 2)];
  const result = await effects.runEffectsMutation([{
    type: "condition:add",
    targetIds: ["e"],
    conditionName: "Trattenuto",
    options: { type: "spell", sourceId: "caster", parentEffectId: SPHERE, effectId: EFFECT, expiry: { mode: "manual" }, mechanics: MECHANICS },
  }], { kind: "reminder-resolution", label: "Sfera Acquea · urto", targetIds: ["e"], history: { kind: "reminder-resolution", label: "Sfera Acquea · urto" } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(elevation("e"), 3);
});

test("H-3 e H-4: chi esce col TS superato da 3 m torna a terra con la pill della caduta (1d6); Annulla rimette tutto", async () => {
  sceneItems = [token("caster", 6, 6), hovering(sphereRoot(), 3), at(heldToken("a", 1, 1), 3)];
  const result = await effects.runEffectsMutation([{
    type: "condition:remove-instances",
    removals: [{ itemId: "a", instanceId: "a-held" }],
  }], {
    kind: "reminder-resolution",
    label: "Incantesimo: Trattenuto · TS superato",
    targetIds: ["a"],
    sideEffects: [{ type: "token:eject-from-zone", instanceId: SPHERE, targetIds: ["a"] }],
    history: { kind: "reminder-resolution", label: "Incantesimo: Trattenuto · TS superato" },
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(elevation("a"), 0);
  assert.deepEqual(square("a"), [0, 0]);
  const fall = pillOf("a", "Caduta da 3 m");
  assert.ok(fall, JSON.stringify(item("a").metadata[META_KEY].conditions));
  assert.equal(fall.deferredEffects?.[0]?.resolution?.damage?.dice, "1d6");
  assert.equal(pillOf("a", "Trattenuto"), undefined);
  await undoLast();
  assert.equal(elevation("a"), 3);
  assert.deepEqual(square("a"), [1, 1]);
  assert.ok(pillOf("a", "Trattenuto"));
  assert.equal(pillOf("a", "Caduta da 3 m"), undefined);
});

test("H-3: la × sulla pill della sfera riporta a terra senza caduta", async () => {
  sceneItems = [token("caster", 6, 6), hovering(sphereRoot(), 3), at(heldToken("a", 1, 1), 3)];
  const result = await effects.runEffectsMutation([{
    type: "condition:remove-instances",
    removals: [{ itemId: "a", instanceId: "a-held" }],
  }], { kind: "condition", label: "Rimossa: Trattenuto", targetIds: ["a"], history: { kind: "condition", label: "Rimossa: Trattenuto" } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(elevation("a"), 0);
  assert.equal((item("a").metadata[META_KEY].conditions?.instances || []).length, 0, "né caduta né Prona");
});

test("H-4: liberato dal Turbine a 6 m, torna a terra con la caduta da 2d6", async () => {
  const turbineHeld = {
    id: "w-held", condition: "Trattenuto", active: true, targetId: "w", type: "spell", sourceId: "caster",
    parentEffectId: "turbine-instance", effectId: "xanathar-turbine-restrained", expiry: { mode: "manual" },
    mechanics: { landing: { fall: "always" } },
  };
  sceneItems = [token("caster", 6, 6), at(token("w", 4, 4, { conditions: { version: 2, instances: [turbineHeld] } }), 6)];
  const result = await effects.runEffectsMutation([{
    type: "condition:remove-instances",
    removals: [{ itemId: "w", instanceId: "w-held" }],
  }], { kind: "condition", label: "Turbine · fuga", targetIds: ["w"], history: { kind: "condition", label: "Turbine · fuga" } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(elevation("w"), 0);
  assert.equal(pillOf("w", "Caduta da 6 m")?.deferredEffects?.[0]?.resolution?.damage?.dice, "2d6");
});

test("H-3 e H-4: quando il Turbine finisce, chi era catturato a 9 m torna a terra con la caduta da 3d6", async () => {
  const SPELLS_KEY = "com.thebigpicture.initiative/spells";
  const caster = token("caster", 6, 6);
  caster.metadata[META_KEY][SPELLS_KEY] = [{
    spellId: "xanathar-turbine", instanceId: "turbine-instance", casterId: "caster", name: "Turbine", turns: 10, conc: false,
  }];
  const turbineHeld = {
    id: "w-held", condition: "Trattenuto", active: true, targetId: "w", type: "spell", sourceId: "caster",
    parentEffectId: "turbine-instance", effectId: "xanathar-turbine-restrained", expiry: { mode: "manual" },
    mechanics: { landing: { fall: "always" } },
  };
  sceneItems = [caster, at(token("w", 4, 4, { conditions: { version: 2, instances: [turbineHeld] } }), 9)];
  const result = await effects.runEffectsMutation([{
    type: "spell:remove-instance",
    targetIds: ["caster"],
    instanceId: "turbine-instance",
  }], { kind: "spell", label: "Fine: Turbine", targetIds: ["caster", "w"], history: { kind: "spell", label: "Fine: Turbine" } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.equal(pillOf("w", "Trattenuto"), undefined);
  assert.equal(elevation("w"), 0);
  assert.equal(pillOf("w", "Caduta da 9 m")?.deferredEffects?.[0]?.resolution?.damage?.dice, "3d6");
});
