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
  const toggle = card.children[0].children[2];
  assert.equal(toggle.dataset.spellBoardTokenCompanionToggle, "1");
  assert.equal(toggle.textContent, "▸", "summoned tokens start collapsed");
  assert.equal(card.style.marginBottom, "22px");
  assert.equal(card.children[1].style.display, "none");
  assert.equal(card.children[0].style.display, "flex", "the collapsed label stays vertically centered");
  assert.equal(card.children[0].children[1].children[0].textContent, "Evocazioni · 2");
  assert.equal(card.children[0].children[0].style.display, "none");
  toggle.listeners.click({ stopPropagation() {} });
  assert.equal(card.children[0].children[1].children[0].textContent, companions[0].label);
  assert.equal(card.style.marginBottom, "44px");
  assert.equal(card.children[1].style.display, "flex");
  assert.equal(toggle.textContent, "▾");

  // The same group re-rendered keeps the GM's choice; a new cast starts collapsed again.
  const again = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
  appendSpellBoardTokenCompanions(again, companions, { compact: true, documentRef: testDocument() });
  assert.equal(again.children[0].children[2].textContent, "▾");
  const recast = spellBoardTokenCompanionsByCasterId([
    ...items,
    boardToken({ id: "weapon-b", instanceId: "cast-a-3", casterId: "caster-a" }),
  ]).get("caster-a");
  const fresh = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
  appendSpellBoardTokenCompanions(fresh, recast, { compact: true, documentRef: testDocument() });
  assert.equal(fresh.children[0].children[2].textContent, "▸");

  toggle.listeners.click({ stopPropagation() {} });
  assert.equal(card.children[1].style.display, "none");
  assert.equal(toggle.textContent, "▸");
});

test("collapsed companion groups preview only their first three portraits and hide the preview when expanded", () => {
  for (const sharedHp of [false, true]) {
    const list = ["one", "two", "three", "four"].map(id => ({ itemId: id, label: id,
      iconUrl: `/${id}.webp`, casterId: `portrait-preview-${sharedHp}`, instanceId: "preview", sharedHp }));
    const card = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
    appendSpellBoardTokenCompanions(card, list, { documentRef: testDocument() });
    const first = card.children[0];
    const preview = first.children.find(child => child.dataset.companionGroupPortraits === "1");
    assert.ok(preview, "the collapsed summary previews group members");
    assert.deepEqual(preview.children.map(image => image.src), ["/one.webp", "/two.webp", "/three.webp"]);
    assert.equal(preview.style.display, "flex");
    first.children[2].listeners.click({ stopPropagation() {} });
    assert.equal(preview.style.display, "none");
    assert.equal(first.children[0].style.display, "", "the individual portrait returns on expansion");
    first.children[2].listeners.click({ stopPropagation() {} });
    assert.equal(preview.style.display, "flex");
  }
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
    "(1) Animare Oggetti (Omar)",
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

function animatedObject(id, number, instanceId = "anim-1") {
  return {
    id,
    layer: "PROP",
    image: { url: `/token-${id}.webp` },
    metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: spellBoardTokenMetadata({
        spellId: "animate-objects", instanceId, casterId: "wizard", objectSize: "small", number,
      }),
    },
  };
}

test("animated objects carry the number of their map label into the tracker", () => {
  assert.equal(spellBoardTokenDisplayName("animate-objects", "Kriv", 3), "(3) Animare Oggetti (Kriv)");
  assert.equal(spellBoardTokenDisplayName("animate-objects", "Kriv"), "(1) Animare Oggetti (Kriv)");
  const companions = spellBoardTokenCompanionsByCasterId([
    animatedObject("b", 2), animatedObject("a", 1), animatedObject("c", 3),
  ]).get("wizard");
  assert.deepEqual(companions.map((entry) => [entry.itemId, entry.label]),
    [["a", "Animare oggetti 1"], ["b", "Animare oggetti 2"], ["c", "Animare oggetti 3"]]);
});

test("tokens placed before the numbering get a stable display number; a lone token stays unnumbered", () => {
  const legacy = spellBoardTokenCompanionsByCasterId([animatedObject("y"), animatedObject("x")]).get("wizard");
  assert.deepEqual(legacy.map((entry) => [entry.itemId, entry.label]), [["x", "Animare oggetti 1"], ["y", "Animare oggetti 2"]]);
  const [single] = spellBoardTokenCompanionsByCasterId([animatedObject("z", 1)]).get("wizard");
  assert.equal(single.label, "Animare oggetti");
});

test("a companion card selects its token on click and shows the scene selection", () => {
  const [companion] = spellBoardTokenCompanionsByCasterId([animatedObject("a", 1), animatedObject("b", 2)]).get("wizard");
  const calls = [];
  const card = buildSpellBoardTokenCompanionCard(companion, {
    documentRef: testDocument(),
    onSelect: (value, event) => calls.push([value.itemId, event.ctrlKey]),
    selectedIds: new Set(["a"]),
  });
  assert.equal(card.style.pointerEvents, "auto");
  assert.equal(card.dataset.selectionState, "all");
  let stopped = false;
  card.listeners.click({ ctrlKey: true, stopPropagation() { stopped = true; }, target: { closest: () => null } });
  assert.deepEqual(calls, [["a", true]]);
  assert.equal(stopped, true, "the caster card underneath is not selected");
  card.listeners.click({ stopPropagation() {}, target: { closest: () => ({}) } });
  assert.equal(calls.length, 1, "clicking the HP badge edits HP instead of selecting");
  const passive = buildSpellBoardTokenCompanionCard(companion, { documentRef: testDocument() });
  assert.equal(passive.style.pointerEvents, "none");
});
