import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomBudgetPruningNotice } from "../src/roomBudgetNoticeCore.js";
import {
  ROOM_METADATA_SAFE_LIMIT_BYTES,
  compactOwnedRoomMetadata,
  roomMetadataBytes,
} from "../src/roomMetadataBudget.js";
import {
  droppedInitiativeCardRegistryNames,
  packInitiativeCardRegistryForRoom,
  retainInitiativeCardRegistryWithinByteBudget,
} from "../src/initiativeCardRegistryCore.js";
import { retainActorVitalsRegistryWithinByteBudget } from "../src/actorVitalsCore.js";
import { retainHPMapWithinByteBudget } from "../src/hpMemoryRetention.js";
import { retainFactionRegistryWithinByteBudget } from "../src/factionRegistryCore.js";
import { retainPlayerAssignmentMemoryWithinByteBudget } from "../src/playerAssignmentMemoryCore.js";

// Studio archivio attori (docs/STUDIO_ARCHIVIO_ATTORI.md), lotto R0: the sentence the GM reads when the start-up
// compaction takes entries out of the Room.
const ID = "com.thebigpicture.initiative";
const KEYS = {
  cards: `${ID}/initiativeCards`,
  actorVitals: `${ID}/actorVitals`,
  hpMemory: `${ID}/hpMemory`,
  faction: `${ID}/factionRegistry`,
  players: `${ID}/playerAssignments`,
};

function entries() {
  return [
    { key: KEYS.actorVitals, retain: retainActorVitalsRegistryWithinByteBudget },
    { key: KEYS.hpMemory, retain: retainHPMapWithinByteBudget },
    { key: KEYS.cards, retain: retainInitiativeCardRegistryWithinByteBudget },
    { key: KEYS.faction, retain: retainFactionRegistryWithinByteBudget },
    { key: KEYS.players, retain: retainPlayerAssignmentMemoryWithinByteBudget },
  ];
}

// A book of spell ids that does not compress, so a few cards exceed the cards' budget.
function incompressibleBook(seed) {
  let state = seed;
  const next = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state; };
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () => Array.from({ length: 30 }, () => alphabet[next() % alphabet.length]).join(""));
}

function cardRegistry(names) {
  return Object.fromEntries(names.map((name, index) => [name.toLowerCase(), {
    name,
    updatedAt: 100 - index,
    profile: { armorClass: 15, spellbook: { spellIds: incompressibleBook(index + 1), pinnedIds: [] } },
  }]));
}

function actorVitals(count) {
  return {
    schemaVersion: 1,
    actors: Object.fromEntries(Array.from({ length: count }, (_, index) => [
      `actor_${String(index).padStart(32, "0")}`,
      { hp: 10, hpMax: 20, updatedAt: 1000 + index, revision: 1 },
    ])),
  };
}

test("R0: una stanza nel budget non dà nessun avviso, nemmeno se una chiave viene solo riscritta", () => {
  const metadata = {
    [KEYS.cards]: packInitiativeCardRegistryForRoom(cardRegistry(["Aelar"])),
    // Without schemaVersion: the compaction rewrites the key in its normal shape and drops nothing.
    [KEYS.actorVitals]: { actors: actorVitals(2).actors },
    [KEYS.faction]: { "https://img.test/a.png": { attitude: "ally", name: "A", updatedAt: 1 } },
  };
  const plan = compactOwnedRoomMetadata(metadata, entries());
  assert.ok(Object.hasOwn(plan.updates, KEYS.actorVitals), "the key is rewritten");
  assert.deepEqual(plan.previousValues[KEYS.actorVitals], metadata[KEYS.actorVitals]);
  assert.equal(roomBudgetPruningNotice(plan), "");
  assert.equal(roomBudgetPruningNotice(null), "");
  assert.equal(roomBudgetPruningNotice({ updates: {} }), "");
});

test("R0: l'avviso nomina le schede uscite dalla stanza e conta PF, fazioni e giocatori", () => {
  const names = ["Aelar", "Brina", "Corvo", "Dalia", "Elric", "Fenna", "Gorim", "Hilda"];
  const metadata = {
    [KEYS.cards]: packInitiativeCardRegistryForRoom(cardRegistry(names)),
    [KEYS.actorVitals]: actorVitals(60),
    [KEYS.hpMemory]: Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
      `eroe ${index}||https://img.test/${"x".repeat(40)}${index}.png`, { hp: 5, hpMax: 9, attitude: "pc", t: 1000 + index },
    ])),
    [KEYS.faction]: Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
      `https://img.test/${"y".repeat(40)}${index}.png`, { attitude: "enemy", name: `Goblin ${index}`, updatedAt: 1000 + index },
    ])),
    [KEYS.players]: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`a${index.toString(36)}`, `user-${"z".repeat(20)}${index}`])),
    "com.other.extension/room-state": { keep: "x".repeat(600) },
  };
  const plan = compactOwnedRoomMetadata(metadata, entries());
  assert.ok(roomMetadataBytes(plan.metadata) <= ROOM_METADATA_SAFE_LIMIT_BYTES);
  const notice = roomBudgetPruningNotice(plan);

  assert.match(notice, /^Memoria della stanza piena. Tolti dalla stanza all'avvio: le schede di /);
  // The newest cards stay (updatedAt 100, 99, …): the dropped ones are the oldest.
  assert.ok(!notice.includes("Aelar"), "the newest card stays in the Room");
  const dropped = droppedInitiativeCardRegistryNames(metadata[KEYS.cards], plan.updates[KEYS.cards]);
  assert.ok(dropped.length > 4 && dropped.at(-1) === "Hilda", "the oldest cards leave the Room");
  assert.ok(notice.includes(`le schede di ${dropped.slice(0, 4).join(", ")} e `), "the first four are named, the others counted");
  assert.match(notice, /i PF ricordati di \d+ personaggi/);
  assert.match(notice, /\d+ fazioni ricordate/);
  assert.match(notice, /\d+ giocatori assegnati/);
  assert.match(notice, /In questo browser restano le copie già salvate\.$/);

  // The counts are what left the Room, the two hit point memories together.
  const keptActors = Object.keys(plan.updates[KEYS.actorVitals].actors).length;
  const keptLegacy = Object.keys(plan.updates[KEYS.hpMemory]).length;
  assert.ok(notice.includes(`i PF ricordati di ${(60 - keptActors) + (60 - keptLegacy)} personaggi`), notice);
  assert.ok(notice.includes(`${60 - Object.keys(plan.updates[KEYS.faction]).length} fazioni ricordate`), notice);
  assert.ok(notice.includes(`${40 - Object.keys(plan.updates[KEYS.players]).length} giocatori assegnati`), notice);
});

test("R0: una scheda sola al singolare, e oltre quattro nomi il resto è contato", () => {
  const one = { updates: { [KEYS.cards]: {} }, previousValues: { [KEYS.cards]: cardRegistry(["Aelar"]) } };
  assert.equal(roomBudgetPruningNotice(one),
    "Memoria della stanza piena. Tolti dalla stanza all'avvio: la scheda di Aelar. In questo browser restano le copie già salvate.");
  const six = { updates: { [KEYS.cards]: {} }, previousValues: { [KEYS.cards]: cardRegistry(["A", "B", "C", "D", "E", "F"]) } };
  assert.match(roomBudgetPruningNotice(six), /le schede di A, B, C, D e altri 2\./);
  const hitPoints = { updates: { [KEYS.actorVitals]: actorVitals(1) }, previousValues: { [KEYS.actorVitals]: actorVitals(2) } };
  assert.match(roomBudgetPruningNotice(hitPoints), /all'avvio: i PF ricordati di un personaggio\./);
});

test("R0: lo sfondo del GM mostra l'avviso dopo la compattazione dell'avvio", () => {
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  assert.match(background, /const notice = roomBudgetPruningNotice\(plan\);\s+if \(notice\) await OBR\.notification\.show\(notice, "WARNING"\)/);
});
