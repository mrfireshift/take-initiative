// Animate Objects in the spell panel: the section heading with its count, the weight meter, a card per size with
// − and + (never past 10 of weight), and its placement button named for the objects.
import test from "node:test";
import assert from "node:assert/strict";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";
import { renderCompositionPanel } from "../src/spellUnifiedPanelContextView.js";
import { buildSpellPanelViewModel, buildSpellUnifiedPanelContract, createSpellPanelSession } from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const doc = { createElement: (tag) => { const node = new FakeNode(doc, tag); node.style = {}; return node; },
  createTextNode: () => new FakeNode(doc, "#text") };

function setup(counts) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "animate-objects", phase: "cast", castContext: { slotLevel: 5 } });
  const key = contract.presentation.composition?.key || "composition";
  const session = createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 5, castContext: { [key]: { counts } } });
  return { contract, session, view: buildUnifiedPanelViewModel({ contract, session, targetCandidates: [] }) };
}

test("the heading counts the objects and their weight; + stops at 10 of weight", async () => {
  const { contract, session, view } = setup({ tiny: 2, medium: 1 });
  const changes = [];
  const section = renderCompositionPanel(doc, view, { onCompositionChange: (size, value) => changes.push([size, value]) });
  const total = section.querySelectorAll("span").find((node) => /peso$/u.test(node.textContent) && /oggetti/u.test(node.textContent));
  assert.equal(total.textContent, "3 oggetti · 4/10 peso");
  assert.equal(section.querySelector("h2").textContent, "Oggetti animati");
  const cards = section.querySelectorAll(".unified-composition__size");
  assert.equal(cards.length, 5);
  const addOf = (card) => card.querySelectorAll(".unified-darts__step").find((step) => step.getAttribute("data-composition-step") === "add");
  assert.deepEqual(cards.map((card) => addOf(card).disabled), [false, false, false, false, true], "a huge object would weigh 12");
  await addOf(cards[0]).click();
  assert.deepEqual(changes, [["tiny", "3"]]);
  const panel = buildSpellPanelViewModel(contract, { ...session, executionGate: { allowed: true } });
  assert.equal(panel.primaryAction.label, "Posiziona oggetti", "objects, not an area");
});
