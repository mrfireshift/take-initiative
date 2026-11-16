// Lot F5-3 of docs/STUDIO_TALENTI.md (decision H6): Durable's minimum per Hit Die and the Chef's food, as notes in the
// party's rest; the hit points recovered stay the GM's to write.
import assert from "node:assert/strict";
import test from "node:test";
import { groupRestFeatNotes } from "../src/groupRestCore.js";
import { FEATS } from "../src/featCatalog.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, name, card = {}, attitude = "pc") => ({ id, name, layer: "CHARACTER",
  metadata: { [META_KEY]: { attitude, hp: 10, hpMax: 20, initiativeCard: card } } });

test("Durable: at least twice the Constitution modifier per Hit Die, at least 2, under its character", () => {
  const notes = groupRestFeatNotes([
    token("aldo", "Aldo", { feats: [{ id: "tenace" }], abilityModifiers: { con: 3 } }),
    token("bea", "Bea", { feats: [{ id: "tenace" }], abilityModifiers: { con: 0 } }),
    token("cora", "Cora", { feats: [{ id: "tenace" }], abilityModifiers: { con: -1 } }),
    token("ciro", "Ciro", { feats: [{ id: "tenace" }] }),
    token("dino", "Dino", { feats: [{ id: "robusto" }], abilityModifiers: { con: 3 } }),
  ]);
  assert.deepEqual(notes.byId, {
    aldo: "Tenace: almeno 6 PF per Dado Vita.",
    bea: "Tenace: almeno 2 PF per Dado Vita.",
    cora: "Tenace: almeno 2 PF per Dado Vita.",
    ciro: "Tenace: almeno 2 × Costituzione PF per Dado Vita (minimo 2).",
  });
  assert.deepEqual(notes.party, []);
});

test("the Chef: 1d8 more to who eats the food and spends Hit Dice, up to 4 + proficiency creatures; only the party's", () => {
  const notes = groupRestFeatNotes([
    token("dina", "Dina", { feats: [{ id: "cuoco", ability: "con" }], characterBuild: [{ classId: "ladro", level: 5 }] }),
    token("ezio", "Ezio", { feats: [{ id: "cuoco" }] }),
    token("orc", "Orco cuoco", { feats: [{ id: "cuoco" }, { id: "tenace" }] }, "enemy"),
  ]);
  assert.deepEqual(notes.party, [
    { id: "dina", note: "Cuoco (Dina): chi ha mangiato il suo cibo e spende Dadi Vita recupera 1d8 PF in più, fino a 7 creature." },
    { id: "ezio", note: "Cuoco (Ezio): chi ha mangiato il suo cibo e spende Dadi Vita recupera 1d8 PF in più." },
  ]);
  assert.deepEqual(notes.byId, {}, "a creature that is no character of the party gets no note");
  assert.deepEqual(groupRestFeatNotes([]), { byId: {}, party: [] });
});

test("the two feats' lines say where the notes are", () => {
  const line = (id) => FEATS.find((entry) => entry.id === id).plugin;
  assert.match(line("tenace"), /^Nel riposo di gruppo, sotto il personaggio, il minimo di PF per Dado Vita/u);
  assert.match(line("cuoco"), /Il \+1d8 del cibo del riposo breve è una nota del riposo di gruppo\.$/u);
});
