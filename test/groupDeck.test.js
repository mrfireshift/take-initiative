// A collapsed group as a deck (18/11, the user's choice B): two cards' edges behind it, its name whole with the count
// after it, no "(Gruppo)", no ×N on the portrait, and the arrow in the same place open and closed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupDeckRoom, groupDeckShadow } from "../src/initiativeCardCompact.js";

const classic = readFileSync(new URL("../src/initiativeCardClassicBuilder.js", import.meta.url), "utf8");
const compact = readFileSync(new URL("../src/initiativeCardCompact.js", import.meta.url), "utf8");

test("the deck: two offset edges in the faction's colour, room for them", () => {
  const shadow = groupDeckShadow("#ef4444", { rgba: (color, alpha) => `${color}/${alpha}`, step: 4 });
  assert.equal(shadow, "4px 4px 0 -1.5px rgba(14,19,28,.96), 4px 4px 0 0 #ef4444/0.62, 8px 8px 0 -1.5px rgba(14,19,28,.96), 8px 8px 0 0 #ef4444/0.38");
  assert.equal(groupDeckRoom(4), 8);
  assert.equal(groupDeckRoom(3), 6);
});

test("the classic card: name whole, ×N after it, the deck, the arrow where the open group has it", () => {
  assert.ok(!classic.includes("(Gruppo)"));
  assert.ok(classic.includes("nameLabel.textContent = e.__groupCollapsed ? e.__groupBase : e.name;"));
  assert.ok(classic.includes("groupCount.textContent = `×${e.__groupCount}`;"));
  assert.ok(classic.includes("groupDeckShadow(c.border, { rgba, step: 4 })"));
  const arrows = [...classic.matchAll(/textContent = "(▸|▾)";[\s\S]{0,400}?left: "(\d+)px"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(arrows, [["▸", "24"], ["▾", "24"]]);
  // The group's ± on the portrait's ring (left slot), so the name keeps its row.
  assert.ok(classic.includes("placeCardToolInRadialSlot(groupDeltaButton, 1);"));
  assert.ok(classic.includes("cardToolsDock.appendChild(groupDeltaButton);"));
});

test("the compact card: the group's name without (Gruppo), the deck, the xN badge kept", () => {
  assert.ok(!compact.includes("(Gruppo)"));
  assert.ok(compact.includes("groupDeckShadow(faction.border, { rgba, step: 3 })"));
  assert.ok(compact.includes("`x${entry.__groupCount}`"));
});
