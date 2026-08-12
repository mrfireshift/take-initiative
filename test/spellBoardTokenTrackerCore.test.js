import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SPELL_BOARD_TOKEN_META_KEY,
  spellBoardTokenDisplayName,
  spellBoardTokenMetadata,
} from "../src/spellBoardTokenCore.js";
import {
  hasSpellBoardTokenChange,
  appendSpellBoardTokenCompanions,
  buildSpellBoardTokenCompanionCard,
  spellBoardTokenForSpell,
  spellBoardTokenCompanionRenderPlan,
  spellBoardTokenCompanionsByCasterId,
  spellBoardTokenCompanionsForEntry,
  updateSpellBoardTokenSnapshot,
} from "../src/spellBoardTokenTrackerCore.js";

const spellBoardTokenSource = readFileSync(
  new URL("../src/spellBoardToken.js", import.meta.url),
  "utf8",
);
const aoeTargetToolSource = readFileSync(
  new URL("../src/aoeTargetTool.js", import.meta.url),
  "utf8",
);
const spellsSource = readFileSync(
  new URL("../src/spells.js", import.meta.url),
  "utf8",
);

function testDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        children: [],
        listeners: {},
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
        addEventListener(name, callback) {
          this.listeners[name] = callback;
        },
        setAttribute(name, value) {
          this.attributes ||= {};
          this.attributes[name] = value;
        },
      };
    },
  };
}

function boardToken({
  id,
  spellId = "spiritual-weapon",
  instanceId,
  casterId,
  casterHpMax = 84,
} = {}) {
  return {
    id,
    layer: "PROP",
    image: { url: `/token-${id}.svg` },
    metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: spellBoardTokenMetadata({
        spellId,
      instanceId,
      casterId,
      casterHpMax,
      }),
    },
  };
}

test("le card figlie seguono il caster e non diventano entry dell'ordine", () => {
  const items = [
    boardToken({ id: "weapon-a", instanceId: "cast-a-1", casterId: "caster-a" }),
    boardToken({
      id: "sword-a",
      spellId: "arcane-sword",
      instanceId: "cast-a-2",
      casterId: "caster-a",
    }),
    boardToken({ id: "weapon-b", instanceId: "cast-b-1", casterId: "caster-b" }),
  ];
  const companions = spellBoardTokenCompanionsByCasterId(items);
  assert.deepEqual(
    companions.get("caster-a").map(({ itemId, label }) => [itemId, label]),
    [["weapon-a", "Arma spirituale"], ["sword-a", "Spada arcana"]],
  );
  assert.equal(companions.get("caster-a")[0].actionLabel, "(Azione Bonus)");
  assert.deepEqual(
    spellBoardTokenCompanionRenderPlan([
      { id: "caster-a" },
      { id: "caster-b" },
    ], items),
    [
      { entryId: "caster-a", companionIds: ["weapon-a", "sword-a"] },
      { entryId: "caster-b", companionIds: ["weapon-b"] },
    ],
  );
  const state = { order: ["caster-b", "caster-a"] };
  assert.deepEqual(state.order, ["caster-b", "caster-a"]);
  assert.equal(companions.get("caster-a")[0].initiative, undefined);
  assert.deepEqual(
    spellBoardTokenCompanionsForEntry({ id: "caster-a", __groupCollapsed: true }, companions),
    [],
  );
  assert.deepEqual(
    spellBoardTokenCompanionsForEntry({
      id: "caster-a::p1",
      __paragonIndex: 1,
      __paragonBaseId: "caster-a",
    }, companions),
    [],
  );
});

test("la proiezione si aggiorna quando la PROP viene creata o rimossa", () => {
  const token = boardToken({ id: "weapon-a", instanceId: "cast-a", casterId: "caster-a" });
  const added = {
    items: [token],
    removedItems: [],
    changedRecords: [{ before: null, after: { item: token } }],
  };
  assert.equal(hasSpellBoardTokenChange(added), true);
  const snapshot = updateSpellBoardTokenSnapshot([], added);
  assert.deepEqual(snapshot.map((item) => item.id), ["weapon-a"]);

  const removed = {
    items: [],
    removedItems: [token],
    changedRecords: [{ before: { item: token }, after: null }],
  };
  assert.equal(hasSpellBoardTokenChange(removed), true);
  assert.deepEqual(updateSpellBoardTokenSnapshot(snapshot, removed), []);
});

test("la ricerca della pedina usa caster e istanza, senza associazioni incrociate", () => {
  const first = boardToken({ id: "hand-a", spellId: "arcane-hand", instanceId: "cast-a", casterId: "caster-a" });
  const second = boardToken({ id: "hand-b", spellId: "arcane-hand", instanceId: "cast-a", casterId: "caster-b" });
  const found = spellBoardTokenForSpell(
    [first, second],
    "caster-b",
    { id: "cast-a", spellId: "arcane-hand" },
  );
  assert.equal(found.itemId, "hand-b");
  assert.equal(found.state.hp, 84);
});

test("la pill della Mano espone gli HP della PROP come badge canonico", () => {
  assert.match(spellsSource, /dataset\.spellBoardTokenHp = "1"/);
  assert.match(spellsSource, /HP \$\{Math\.max\(0, Math\.floor\(Number\(boardTokenHP\.hp\)\)\)\}/);
  assert.match(spellsSource, /dataset\.badge = "hp"/);
});

test("la mini-card della Mano espone gli HP canonici e usa la fazione", () => {
  const token = boardToken({
    id: "hand-a",
    spellId: "arcane-hand",
    instanceId: "cast-a",
    casterId: "caster-a",
  });
  const [companion] = spellBoardTokenCompanionsByCasterId([token]).get("caster-a");
  const card = buildSpellBoardTokenCompanionCard(companion, {
    faction: { base: "#3aa7ff", border: "#3aa7ff" },
    documentRef: testDocument(),
  });
  const content = card.children[1];
  assert.equal(content.children[1].dataset.spellBoardTokenHp, "1");
  assert.equal(content.children[1].textContent, "HP 84 / 84");
  assert.match(card.style.background, /rgba\(58,167,255,0\.76\)/);
  assert.equal(card.style.background.includes("#3aa7ff"), false);
});

test("la card figlia è sottile, visiva e non trascinabile come una card tracker", () => {
  const token = boardToken({ id: "weapon-a", instanceId: "cast-a", casterId: "caster-a" });
  const [companion] = spellBoardTokenCompanionsByCasterId([token]).get("caster-a");
  const card = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
  const stackHeight = appendSpellBoardTokenCompanions(
    card,
    [companion],
    { compact: true, documentRef: testDocument() },
  );
  assert.equal(stackHeight, 22);
  assert.equal(card.children.length, 1);
  assert.equal(card.children[0].dataset.spellBoardTokenCompanion, "1");
  assert.equal(card.children[0].dataset.trackerCard, undefined);
  assert.equal(card.children[0].dataset.itemId, undefined);
  assert.equal(card.children[0].style.height, "20px");
  assert.equal(card.children[0].style.left, "0");
  assert.equal(card.children[0].style.right, "0");
  assert.equal(card.children[0].children[0].dataset.spellBoardTokenCompanionPortrait, "1");
  assert.equal(card.children[0].children[0].style.width, "26px");
  assert.equal(card.children[0].children[0].style.left, "-4px");
  assert.equal(card.children[0].children[1].children[1].textContent, "(Azione Bonus)");
  assert.equal(card.children[0].children[1].style.flexDirection, "row");
  assert.equal(card.children[0].style.pointerEvents, "none");

  const classic = buildSpellBoardTokenCompanionCard(companion, {
    documentRef: testDocument(),
  });
  assert.equal(classic.style.height, "24px");
  assert.equal(classic.children[0].dataset.spellBoardTokenCompanionPortrait, "1");
  assert.equal(classic.children[0].style.width, "34px");
  assert.equal(classic.children[0].style.left, "-8px");
  assert.equal(classic.children[1].style.flexDirection, "row");
});

test("le mini-card dello stesso caster si comprimono dal primo elemento", () => {
  const items = [
    boardToken({ id: "weapon-a", instanceId: "cast-a-1", casterId: "caster-a" }),
    boardToken({
      id: "sword-a",
      spellId: "arcane-sword",
      instanceId: "cast-a-2",
      casterId: "caster-a",
    }),
  ];
  const companions = spellBoardTokenCompanionsByCasterId(items).get("caster-a");
  const card = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
  appendSpellBoardTokenCompanions(card, companions, {
    compact: true,
    documentRef: testDocument(),
  });
  assert.equal(card.children.length, 2);
  assert.equal(card.style.marginBottom, "44px");
  const toggle = card.children[0].children[2];
  assert.equal(toggle.dataset.spellBoardTokenCompanionToggle, "1");
  assert.equal(toggle.textContent, "▾");
  toggle.listeners.click({ stopPropagation() {} });
  assert.equal(card.style.marginBottom, "22px");
  assert.equal(card.children[1].style.display, "none");
  assert.equal(toggle.textContent, "▸");
  toggle.listeners.click({ stopPropagation() {} });
  assert.equal(card.children[1].style.display, "");
  assert.equal(toggle.textContent, "▾");
});

test("il nome della PROP di Arma spirituale usa il caster corrente con fallback", () => {
  assert.equal(
    spellBoardTokenDisplayName("spiritual-weapon", "Omar"),
    "Arma spirituale (Omar)",
  );
  assert.equal(
    spellBoardTokenDisplayName("spiritual-weapon", ""),
    "Arma spirituale (Caster)",
  );
  assert.equal(
    spellBoardTokenDisplayName("arcane-sword", "Omar"),
    "Spada arcana (Omar)",
  );
  assert.equal(
    spellBoardTokenDisplayName("arcane-hand", "Omar"),
    "Mano arcana (Omar)",
  );
  assert.equal(
    spellBoardTokenDisplayName("animate-objects", "Omar"),
    "Animare oggetti-Omar",
  );
});

test("la PROP porta la label testuale OBR sotto l'immagine", () => {
  assert.match(spellBoardTokenSource, /\.plainText\(itemName\)/);
  assert.match(spellBoardTokenSource, /\.textItemType\("LABEL"\)/);
});

test("la PROP di Mano arcana usa la scala Large e gli HP canonici", () => {
  assert.match(spellBoardTokenSource, /\.scale\(spellBoardTokenScale\(spellId(?:, objectSize)?\)\)/);
  assert.match(spellBoardTokenSource, /\[META_KEY\]: canonicalMetadata/);
});

test("le pedine vengono agganciate ai vertici della griglia", () => {
  assert.match(aoeTargetToolSource, /function boardTokenGridVertex\(pointer, gridOrigin, dpi\)/);
  assert.match(aoeTargetToolSource, /function boardTokenPlacementSnap\(pointer, gridOrigin, dpi, rule\)/);
  assert.match(aoeTargetToolSource, /const snapToVertex = spaceCells === 0\.5 \|\| spaceCells > 1;/);
  assert.match(aoeTargetToolSource, /return snapToVertex\s*\n\s*\? boardTokenGridVertex/);
  assert.match(aoeTargetToolSource, /: nearestGridCellCenter\(pointer, gridOrigin, dpi\)/);
  assert.doesNotMatch(aoeTargetToolSource, /conferma posizione/);
});
