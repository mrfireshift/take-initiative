import test from "node:test";
import assert from "node:assert/strict";
import { sharedHpTrackerChildren, refreshSharedHpTrackerChildren } from "../src/sharedHpTrackerCore.js";
import { projectTrackerEntry } from "../src/options/optionsProjection.js";
import { buildSpellBoardTokenCompanionCard, appendSpellBoardTokenCompanions } from "../src/spellBoardTokenTrackerCore.js";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";
const KEY = "com.thebigpicture.initiative/meta";
const items = ["auril", "hand", "head"].map((id, index) => ({ id, name: id, layer: "CHARACTER", image: { url: `/${id}.png` },
  metadata: { [KEY]: { hp: index ? 12 : 300, hpMax: 400, attitude: index ? "pc" : "enemy", ...(index ? { sharedHpSourceId: "auril" } : {}) } } }));
const source = { id: "auril", attitude: "enemy", hp: 300, hpMax: 400 };
test("incremental principal reconstruction keeps child identities and refreshes their canonical pool", () => {
  const previous = { ...source, sharedHpMemberCount: 2, sharedHpTrackerVisibility: "all", sharedHpChildren: sharedHpTrackerChildren(items, "auril") };
  const next = refreshSharedHpTrackerChildren({ ...source, hp: 275, hpMax: 450 }, previous);
  assert.equal(next.sharedHpMemberCount, 2);
  assert.equal(next.sharedHpTrackerVisibility, "all");
  assert.deepEqual(next.sharedHpChildren.map(child => [child.id, child.hp, child.hpMax]), [["hand", 275, 450], ["head", 275, 450]]);
});
test("shared HP child rows use principal HP and faction without becoming initiative entries", () => {
  const children = sharedHpTrackerChildren(items, "auril");
  assert.deepEqual(children.map(child => child.id), ["hand", "head"]);
  assert.ok(children.every(child => child.hp === 300 && child.hpMax === 400 && child.attitude === "enemy"));
  assert.ok(children.every(child => child.sharedHp === true && child.casterId === "auril" && !child.initiative));
});
test("child visibility defaults to GM and all-table mode still projects HP through the existing policy", () => {
  const entry = { ...source, sharedHpMemberCount: 2, sharedHpChildren: sharedHpTrackerChildren(items, "auril") };
  assert.equal(projectTrackerEntry(entry, { role: "GM" }).sharedHpChildren.length, 2);
  assert.deepEqual(projectTrackerEntry(entry, { role: "PLAYER" }).sharedHpChildren, []);
  const visible = { ...entry, sharedHpTrackerVisibility: "all" };
  const hiddenHP = projectTrackerEntry(visible, { role: "PLAYER" });
  assert.equal(hiddenHP.sharedHpChildren.length, 2);
  assert.ok(hiddenHP.sharedHpChildren.every(child => child.hp === null && child.hpMax === null));
  const exact = projectTrackerEntry(visible, { role: "PLAYER", hpPolicy: { trackerClassic: { enemy: "exact" } } });
  assert.ok(exact.sharedHpChildren.every(child => child.hp === 300 && child.hpMax === 400));
});
test("shared child cards bind the regular HP editor to the actual token and have their own markers", () => {
  const doc = { createElement: tag => { const node = new FakeNode(doc, tag); node.style = {}; return node; } };
  const bound = [];
  const child = sharedHpTrackerChildren(items, "auril")[0];
  const row = buildSpellBoardTokenCompanionCard(child, { documentRef: doc, onBindHP: (pill, target) => bound.push({ pill, target }) });
  assert.equal(row.dataset.sharedHpCompanion, "1");
  assert.equal(row.dataset.spellBoardTokenCompanion, undefined);
  assert.equal(bound[0].target.itemId, "hand");
  assert.equal(bound[0].pill.dataset.sharedHpBadge, "1");
  assert.match(row.title, /HP condivisi/);
});
test("collapsed shared groups have a generic label and no first-token HP or selection action", () => {
  const doc = { createElement: tag => { const node = new FakeNode(doc, tag); node.style = {}; return node; } };
  const card = new FakeNode(doc, "article"); card.style = {};
  const selection = []; const heights = [];
  appendSpellBoardTokenCompanions(card, sharedHpTrackerChildren(items, "auril"), {
    documentRef: doc, onSelect: target => selection.push(target.itemId), onStackChange: height => heights.push(height),
  });
  const first = card.children[0];
  assert.equal(first.children[1].children[0].textContent, "Token collegati · 2");
  assert.equal(first.children[1].children[1].style.display, "none");
  first.listeners.click[0]({ stopPropagation() {}, target: { closest: () => null } });
  assert.deepEqual(selection, []);
  const toggle = first.children[2];
  toggle.listeners.click[0]({ stopPropagation() {} });
  assert.equal(first.children[1].children[0].textContent, "hand");
  assert.equal(first.children[1].children[1].style.display, "");
  assert.deepEqual(heights, [52]);
});
