// La dimensione del token dallo statblock: la taglia da 5eTools e dal JSON, la scala e il posto sulla griglia, gli omonimi.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { classifySceneItemSnapshots, createSceneItemsSnapshot } from "../src/sceneItemChangeDispatcherCore.js";
import { setTokenPortrait } from "../src/tokenPortraitCore.js";
import {
  MONSTER_TOKEN_SIZES, monsterTokenSizeText, normalizeMonsterSize, planMonsterTokenSize, setTokenCells, tokenCells, tokenCentreSnap,
} from "../src/tokenSizeCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, patch = {}, meta = {}) => ({ id, name: "Ogre", type: "IMAGE", layer: "CHARACTER", position: { x: 150, y: 150 }, rotation: 0,
  scale: { x: 1, y: 1 }, image: { width: 300, height: 300, url: "ogre.png" }, grid: { dpi: 300, offset: { x: 150, y: 150 } },
  metadata: { [META_KEY]: { hp: 7, hpMax: 15, inInitiative: true, attitude: "enemy", ...meta }, foreign: { keep: true } }, ...patch });

test("la taglia: inglese, italiano o lettera; ogni taglia ha le sue caselle", () => {
  for (const value of ["large", "Large", " LARGE ", "grande", "Grande", "L"]) assert.equal(normalizeMonsterSize(value), "large", value);
  for (const value of ["mastodontica", "Mastodontico", "gargantuan", "G"]) assert.equal(normalizeMonsterSize(value), "gargantuan", value);
  for (const value of ["", null, undefined, "enormous", 3]) assert.equal(normalizeMonsterSize(value), "", String(value));
  assert.deepEqual(Object.fromEntries(Object.entries(MONSTER_TOKEN_SIZES).map(([size, { cells }]) => [size, cells])),
    { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 });
  assert.equal(monsterTokenSizeText("large"), "Grande, 2×2 caselle");
  assert.equal(monsterTokenSizeText("medium"), "Media, 1 casella");
  assert.equal(monsterTokenSizeText("nope"), "");
});

test("dal bestiario di 5eTools: la taglia va nel blocco, di due la prima, un mostro senza taglia non ne ha", () => {
  const convert = (size) => fiveToolsMonsterToStatblock({ name: "Test", source: "MM", ac: [15], hp: { average: 10 }, speed: { walk: 30 }, ...(size ? { size } : {}),
    action: [{ name: "Claw", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] }).block;
  assert.equal(convert(["L"]).size, "large");
  assert.equal(convert(["S", "M"]).size, "small", "Piccola o Media: una casella in ogni caso");
  assert.equal(convert(["H", "G"]).size, "huge");
  assert.equal(convert(["G"]).size, "gargantuan");
  assert.equal(convert().size, undefined);
  assert.equal(parseCharacterSheetImport(JSON.stringify(convert(["H"]))).tokenSize, "huge", "dal blocco alla scheda, per la stessa strada del JSON");
});

test("dal JSON: size in inglese o italiano; quello che non conosce lo dice e non lo indovina; una scheda di PG non ne ha", () => {
  const read = (fields) => parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], armorClass: 12, ...fields }));
  assert.equal(read({ size: "Large" }).tokenSize, "large");
  assert.equal(read({ taglia: "Enorme" }).tokenSize, "huge");
  assert.equal(read({ dimensione: "piccola" }).tokenSize, "small");
  assert.equal(read({}).tokenSize, null);
  const wrong = read({ size: "colossal" });
  assert.equal(wrong.tokenSize, null);
  assert.ok(wrong.unresolved.includes("taglia «colossal»"));
  assert.equal(parseCharacterSheetImport(JSON.stringify({ name: "Mira", armorClass: 12, size: "large" })).tokenSize, undefined);
});

test("le caselle del token e la sua scala: l'immagine resta com'è, specchiata compresa", () => {
  assert.equal(tokenCells(token("a")), 1);
  assert.equal(tokenCells(token("a", { scale: { x: 2, y: 2 } })), 2);
  assert.equal(tokenCells(token("a", { scale: { x: 0.5, y: 0.5 } })), 1, "almeno una, come la geometria del plugin: una Minuscola ridotta a mano non cambia");
  assert.equal(tokenCells(token("a", { scale: { x: -3, y: 3 } })), 3);
  assert.equal(tokenCells(token("a", { image: { width: 600, height: 600 } })), 2, "un'immagine già larga due caselle");
  assert.equal(tokenCells({ id: "a", type: "SHAPE", width: 100, height: 100 }), 0);

  const resized = (item, cells) => { assert.equal(setTokenCells(item, cells), true); return item; };
  assert.deepEqual(resized(token("a"), 2).scale, { x: 2, y: 2 });
  assert.deepEqual(resized(token("a", { scale: { x: 5, y: 2 } }), 3).scale, { x: 3, y: 3 }, "la scala di prima non conta");
  assert.deepEqual(resized(token("a", { image: { width: 600, height: 600 } }), 3).scale, { x: 1.5, y: 1.5 });
  assert.deepEqual(resized(token("a", { scale: { x: -1, y: 1 } }), 2).scale, { x: -2, y: 2 }, "specchiato resta specchiato");
  const tall = resized(token("a", { image: { width: 300, height: 600 } }), 4);
  assert.deepEqual(tall.scale, { x: 2, y: 2 }, "un'immagine alta: il lato lungo fa le caselle, la forma resta");
  assert.equal(tokenCells(tall), 4);
  const shape = { id: "a", type: "SHAPE" };
  assert.equal(setTokenCells(shape, 2), false);
  assert.equal(shape.scale, undefined);
  assert.equal(setTokenCells(token("a"), 0), false);
  // Dopo il ritratto di 5eTools: il ritratto tiene l'ingombro, la dimensione lo cambia.
  const portrait = token("a");
  setTokenPortrait(portrait, { url: "new.webp", width: 512, height: 512 });
  assert.equal(tokenCells(portrait), 1);
  assert.equal(tokenCells(resized(portrait, 3)), 3);
});

test("il centro: una taglia pari sta su un angolo della griglia, una dispari in una casella", () => {
  assert.deepEqual(tokenCentreSnap(1), { useCorners: false, useCenter: true });
  assert.deepEqual(tokenCentreSnap(2), { useCorners: true, useCenter: false });
  assert.deepEqual(tokenCentreSnap(3), { useCorners: false, useCenter: true });
  assert.deepEqual(tokenCentreSnap(4), { useCorners: true, useCenter: false });
});

test("chi cambia: il token e i suoi omonimi, mai un personaggio, mai chi ha già quella misura", () => {
  const items = [
    token("source"),
    token("second", { name: "(2) Ogre" }),
    token("sized", { scale: { x: 2, y: 2 } }),
    token("pc", {}, { attitude: "pc" }),
    token("other", { name: "Goblin" }),
    token("shape", { type: "SHAPE" }),
    token("bar", { attachedTo: "source" }),
  ];
  assert.deepEqual(planMonsterTokenSize({ items, sourceId: "source", cells: 2 }).targetIds, ["source", "second"]);
  assert.deepEqual(planMonsterTokenSize({ items, sourceId: "source", cells: 1 }).targetIds, ["sized"]);
  assert.deepEqual(planMonsterTokenSize({ items, sourceId: "pc", cells: 2 }).targetIds, ["source", "second"], "il personaggio aperto resta com'è");
  assert.deepEqual(planMonsterTokenSize({ items, sourceId: "gone", cells: 2 }).targetIds, []);
  assert.deepEqual(planMonsterTokenSize({ items: [token("source")], sourceId: "source", cells: 1 }).targetIds, [], "niente da cambiare: la riga non compare");
});

test("scalare un token aggiorna anche aure e zone, non solo la barra; ruotarlo no", () => {
  const change = (after) => classifySceneItemSnapshots(createSceneItemsSnapshot([token("orc")]), createSceneItemsSnapshot([token("orc", after)])).flags;
  const scaled = change({ scale: { x: 2, y: 2 } });
  assert.deepEqual([scaled.tokenScale, scaled.aura, scaled.zone], [true, true, true]);
  const turned = change({ rotation: 90 });
  assert.deepEqual([turned.tokenScale, turned.aura, turned.zone], [false, false, false]);
});

test("la riga dell'import e il suo passo dopo Salva stanno nella scheda", () => {
  const modal = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");
  assert.match(modal, /if \(result\.monster && result\.tokenSize\) void appendSheetImportTokenSize\(result\);/);
  assert.match(modal, /pendingMonsterTokenSize = tokenSizeBox\?\.checked \? tokenSizeBox\.dataset\.sheetImportTokenSize : "";/);
  assert.match(modal, /applyMonsterTokenSize\(\{ sourceId: item\.id, cells: MONSTER_TOKEN_SIZES\[tokenSize\]\.cells/);
});

// The write after Salva, on a square grid of 100 px.
let env;
mock.module("@owlbear-rodeo/sdk", { defaultExport: {
  scene: {
    items: {
      getItems: async () => structuredClone(env.items),
      async updateItems(ids, update) {
        env.updates.push([...ids]);
        const drafts = env.items.filter((item) => ids.includes(item.id));
        update(drafts);
      },
    },
    grid: {
      async snapPosition(position, sensitivity, useCorners, useCenter) {
        env.snaps.push({ sensitivity, useCorners, useCenter });
        if (env.snapFails) throw new Error("no grid");
        const snap = (value) => (useCorners ? Math.round(value / 100) * 100 : Math.floor(value / 100) * 100 + 50);
        return { x: snap(position.x), y: snap(position.y) };
      },
    },
  },
} });
mock.module(new URL("../src/history.js", import.meta.url).href, { namedExports: {
  suppressMovementHistory: (id, position, duration, options) => { env.moves.push({ id, position, relocation: options?.relocation }); },
} });
const { applyMonsterTokenSize } = await import("../src/monsterTokenSize.js");
const start = (items) => { env = { items, updates: [], snaps: [], moves: [] }; };

test("al Salva, Grande: scala e posto insieme, su un angolo; lo spostamento non è un cammino; il resto del token non cambia", async () => {
  start([token("source"), token("second", { name: "(2) Ogre", position: { x: 450, y: 250 } }), token("pc", {}, { attitude: "pc" })]);
  const before = structuredClone(env.items);
  assert.equal(await applyMonsterTokenSize({ sourceId: "source", cells: 2 }), 2);
  assert.deepEqual(env.updates, [["source", "second"]], "una scrittura sola");
  const [source, second, pc] = env.items;
  assert.deepEqual(source.scale, { x: 2, y: 2 });
  assert.deepEqual(second.scale, { x: 2, y: 2 });
  assert.equal(source.position.x % 100, 0, "fra le caselle");
  assert.equal(source.position.y % 100, 0);
  assert.deepEqual(env.snaps[0], { sensitivity: 1, useCorners: true, useCenter: false });
  assert.deepEqual(env.moves.map(({ id, relocation }) => [id, relocation]), [["source", true], ["second", true]]);
  assert.deepEqual(env.moves[0].position, source.position);
  assert.deepEqual(pc, before[2], "il personaggio resta com'è");
  assert.deepEqual(source.metadata, before[0].metadata);
  assert.deepEqual(source.image, before[0].image);
});

test("al Salva, Enorme da una casella: resta al centro della sua, nessuno spostamento", async () => {
  start([token("source")]);
  assert.equal(await applyMonsterTokenSize({ sourceId: "source", cells: 3 }), 1);
  assert.deepEqual([env.items[0].scale, env.items[0].position], [{ x: 3, y: 3 }, { x: 150, y: 150 }]);
  assert.deepEqual(env.moves, []);
  assert.deepEqual(env.snaps[0], { sensitivity: 1, useCorners: false, useCenter: true });
});

test("al Salva: niente da cambiare o scena cambiata, nessuna scrittura; senza griglia cambia solo la scala", async () => {
  start([token("source")]);
  assert.equal(await applyMonsterTokenSize({ sourceId: "source", cells: 1 }), 0);
  assert.deepEqual(env.updates, []);
  start([token("source")]);
  assert.equal(await applyMonsterTokenSize({ sourceId: "source", cells: 2, isCurrent: () => false }), 0);
  assert.deepEqual([env.updates, env.moves], [[], []]);
  start([token("source")]);
  env.snapFails = true;
  assert.equal(await applyMonsterTokenSize({ sourceId: "source", cells: 2 }), 1);
  assert.deepEqual([env.items[0].scale, env.items[0].position, env.moves], [{ x: 2, y: 2 }, { x: 150, y: 150 }, []]);
});
