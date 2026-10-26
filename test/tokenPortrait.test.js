// Attacchi dei mostri, fase 4, lotto 3: il ritratto di 5eTools come immagine del token, con il suo ingombro sulla mappa.
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsTokenPath, fiveToolsTokenUrl, normalizeFiveToolsImagesBase } from "../src/fiveToolsArchiveCore.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { setTokenPortrait } from "../src/tokenPortraitCore.js";

const IMAGES = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/";

test("l'indirizzo delle immagini: la cartella che contiene bestiary/tokens, in https; altro non è un indirizzo", () => {
  for (const pasted of [IMAGES, IMAGES.slice(0, -1), `${IMAGES}bestiary/`, `${IMAGES}bestiary/tokens/MM/Goblin.webp?x=1#y`]) {
    assert.equal(normalizeFiveToolsImagesBase(pasted), IMAGES, pasted);
  }
  for (const bad of ["", "non un indirizzo", "http://immagini.example/", "https://utente:pw@immagini.example/", "javascript:alert(1)"]) {
    assert.equal(normalizeFiveToolsImagesBase(bad), "", bad);
  }
  assert.equal(normalizeFiveToolsImagesBase("http://localhost:5199/img"), "http://localhost:5199/img/");
});

test("il percorso del ritratto: nome e libro del mostro, o quelli del suo token; accenti e virgolette tolti", () => {
  assert.equal(fiveToolsTokenPath({ name: "Snowy Owlbear", source: "IDRotF", hasToken: true }), "bestiary/tokens/IDRotF/Snowy%20Owlbear.webp");
  assert.equal(fiveToolsTokenPath({ name: "Deep Rothé", source: "MM", hasToken: true }), "bestiary/tokens/MM/Deep%20Rothe.webp");
  assert.equal(fiveToolsTokenPath({ name: "Ætherling", source: "X", hasToken: true }), "bestiary/tokens/X/AEtherling.webp");
  assert.equal(fiveToolsTokenPath({ name: "Copia", source: "MM", token: { name: "Goblin", source: "MM" } }), "bestiary/tokens/MM/Goblin.webp");
  assert.equal(fiveToolsTokenPath({ name: "Senza immagine", source: "MM" }), "");
  assert.equal(fiveToolsTokenPath({ name: "Goblin", source: "../x", hasToken: true }), "", "a book code only");
  assert.equal(fiveToolsTokenUrl(IMAGES, "bestiary/tokens/MM/Goblin.webp"), `${IMAGES}bestiary/tokens/MM/Goblin.webp`);
  assert.equal(fiveToolsTokenUrl("", "bestiary/tokens/MM/Goblin.webp"), "", "no images folder, no portrait");
  assert.equal(fiveToolsTokenUrl(IMAGES, "../../altro.webp"), "");
});

test("lo statblock di 5eTools porta il percorso del ritratto solo se il mostro ne ha uno", () => {
  const goblin = { name: "Goblin", source: "MM", hasToken: true, ac: [15], hp: { average: 7, formula: "2d6" }, str: 8,
    action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] };
  assert.deepEqual(fiveToolsMonsterToStatblock(goblin).block.portrait, { fiveTools: "bestiary/tokens/MM/Goblin.webp" });
  const { hasToken: _none, ...plain } = goblin;
  assert.equal(fiveToolsMonsterToStatblock(plain).block.portrait, undefined);
});

test("il ritratto mantiene l'ingombro del token: stesse caselle in larghezza, l'ancora allo stesso punto dell'immagine", () => {
  const item = { type: "IMAGE", image: { url: "vecchio.png", mime: "image/png", width: 300, height: 300 },
    grid: { dpi: 150, offset: { x: 150, y: 150 } }, name: "Goblin" };
  assert.equal(setTokenPortrait(item, { url: "nuovo.webp", width: 280, height: 280 }), true);
  assert.deepEqual(item.image, { url: "nuovo.webp", mime: "image/webp", width: 280, height: 280 });
  assert.equal(item.image.width / item.grid.dpi, 2, "a Large token stays two cells wide");
  assert.deepEqual(item.grid.offset, { x: 140, y: 140 });
  const offCentre = { type: "IMAGE", image: { url: "a", width: 200, height: 400 }, grid: { dpi: 200, offset: { x: 100, y: 300 } } };
  setTokenPortrait(offCentre, { url: "b", width: 512, height: 512 });
  assert.equal(offCentre.grid.dpi, 512);
  assert.deepEqual(offCentre.grid.offset, { x: 256, y: 384 });
  for (const bad of [{ type: "SHAPE" }, { type: "IMAGE", image: { width: 0, height: 1 }, grid: { dpi: 1 } }]) {
    assert.equal(setTokenPortrait(bad, { url: "x", width: 10, height: 10 }), false);
  }
  assert.equal(setTokenPortrait(structuredClone(item), { url: "", width: 10, height: 10 }), false);
});
