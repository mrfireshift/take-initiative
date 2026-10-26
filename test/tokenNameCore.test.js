// Attacchi dei mostri, fase 4, lotto 2: il nome del token dallo statblock e i PF sostituiti di default.
import assert from "node:assert/strict";
import test from "node:test";
import { setTokenDisplayName, statblockReplacesHitPoints, statblockTokenName } from "../src/tokenNameCore.js";

test("il nome come lo scrive il tracker: il token e, per un'immagine con testo, l'etichetta", () => {
  const image = { type: "IMAGE", name: "Owlbear", text: { plainText: "Owlbear", richText: [], style: { fontSize: 24 } } };
  setTokenDisplayName(image, "Snowy Owlbear");
  assert.equal(image.name, "Snowy Owlbear");
  assert.deepEqual(image.text, { plainText: "Snowy Owlbear", richText: [{ type: "paragraph", children: [{ text: "Snowy Owlbear" }] }], style: { fontSize: 24 } });
  const shape = { type: "SHAPE", name: "x" };
  setTokenDisplayName(shape, "y");
  assert.deepEqual(shape, { type: "SHAPE", name: "y" });
});

test("il nome dallo statblock: pulito, al massimo 80 caratteri, vuoto se non cambia nulla", () => {
  assert.equal(statblockTokenName("  Snowy   Owlbear ", "Owlbear"), "Snowy Owlbear");
  assert.equal(statblockTokenName("Goblin", "Goblin"), "");
  assert.equal(statblockTokenName("", "Goblin"), "");
  assert.equal(statblockTokenName("x".repeat(100), "").length, 80);
});

test("i PF si sostituiscono di default: senza PF o a PF pieni sì, ferito no", () => {
  assert.equal(statblockReplacesHitPoints({}), true);
  assert.equal(statblockReplacesHitPoints({ hp: 7, hpMax: 7 }), true);
  assert.equal(statblockReplacesHitPoints({ hp: 9, hpMax: 7 }), true, "temporary hit points above the maximum: not wounded");
  assert.equal(statblockReplacesHitPoints({ hp: 3, hpMax: 7 }), false);
  assert.equal(statblockReplacesHitPoints({ hp: 0, hpMax: 7 }), false);
});
