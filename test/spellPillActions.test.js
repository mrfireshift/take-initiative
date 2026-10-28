// Lotto A of the active actions' UX: a spell's actions from its pill on the tracker card, one click for an action
// that asks nothing (spell-pill-actions.js), without the spell panel.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";

// Chip rendering has no SDK or mutation side effects; fail if it crosses that boundary.
const unexpectedMutation = () => { throw new Error("rendering a spell chip must not mutate the scene"); };
mock.module("@owlbear-rodeo/sdk", { exports: { default: {} } });
mock.module("../src/effectsMutations.js", { exports: { requireAppliedEffectsMutation: unexpectedMutation, runEffectsMutation: unexpectedMutation, tickRoundEffects: unexpectedMutation } });
const { buildSpellChips } = await import("../src/spells.js");
const { __buildCompactEffectPill } = await import("../src/initiativeCardCompact.js");
const {
  buildSpellPillActionsView,
  spellActionRunsDirectly,
  spellPillActionErrorText,
  spellPillCounterLabel,
  spellPillHasActions,
} = await import("../src/spellPillActionsCore.js");
const doc = { createElement: tag => { const node = new FakeNode(doc, tag); node.style = {}; return node; },
  createDocumentFragment: () => doc.createElement("fragment") };
globalThis.document = doc;

test("the ⚡ appears on the pills of spells with active actions only", () => {
  for (const spellId of ["mirror-image", "goodberry", "hunters-mark", "call-lightning"]) {
    assert.equal(spellPillHasActions({ spellId }), true, spellId);
  }
  for (const spellId of ["bless", "shield-of-faith"]) {
    assert.equal(spellPillHasActions({ spellId }), false, spellId);
  }
  assert.equal(spellPillHasActions({ name: "Immagine speculare" }), true, "by the stored name too");
});

test("the classic pill: ⚡ opens the actions with the spell, the pill itself still opens the encyclopedia", async () => {
  const spell = { name: "Immagine speculare", spellId: "mirror-image", instanceId: "mi-1", turns: 10 };
  const opened = [];
  const chip = buildSpellChips([spell], { onActions: (value, event) => opened.push([value, event?.type]) }).children[0];
  const button = chip.querySelector('[data-spell-pill-actions="1"]');
  assert.ok(button);
  assert.equal(button.textContent, "⚡");
  assert.equal(button.dataset.cardSelectionIgnore, "1", "it never selects the token");
  let propagation = true;
  await button.emit("click", { stopPropagation() { propagation = false; } });
  assert.deepEqual(opened, [[spell, "click"]]);
  assert.equal(propagation, false, "the encyclopedia of the pill does not open");
  assert.equal(chip.dataset.referenceEntry, "Immagine speculare");
  assert.equal(buildSpellChips([spell]).children[0].querySelector('[data-spell-pill-actions="1"]'), null);
});

test("the compact pill: the same ⚡ pinned to its right edge", async () => {
  const actionsSpell = { instanceId: "mi-1", spellId: "mirror-image", name: "Immagine speculare" };
  const opened = [];
  const pill = __buildCompactEffectPill({ kind: "spell", key: "immagine speculare", label: "Immagine speculare (3)",
    spellInstanceId: "mi-1", actionsSpell }, false, { documentRef: doc, onSpellActions: (value) => opened.push(value) });
  const button = pill.querySelector('[data-spell-pill-actions="1"]');
  assert.ok(button);
  assert.equal(button.style.position, "absolute");
  await button.click();
  assert.deepEqual(opened, [actionsSpell]);
  const withoutHandler = __buildCompactEffectPill({ kind: "spell", label: "Immagine speculare", actionsSpell }, false,
    { documentRef: doc });
  assert.equal(withoutHandler.querySelector('[data-spell-pill-actions="1"]'), null, "players get no ⚡");
});

test("the menu shows the counter and the actions as the panel's overview has them", () => {
  assert.equal(spellPillCounterLabel({ uses: { remaining: 2, total: 3, label: "duplicati" } }), "2/3 duplicati");
  assert.equal(spellPillCounterLabel({}), "");
  const view = buildSpellPillActionsView({
    name: "Marchio del cacciatore",
    context: { casterName: "Ranger", castContext: {} },
    actions: [
      { id: "hunters-mark-move", buttonLabel: "Sposta il marchio", subjectMode: "selected", requiresTargets: true,
        disabled: true, disabledReason: "Disponibile dal turno successivo al lancio." },
    ],
  });
  assert.equal(view.title, "Marchio del cacciatore");
  assert.equal(view.casterName, "Ranger");
  assert.deepEqual(view.actions, [{ id: "hunters-mark-move", label: "Sposta il marchio", detail: "", disabled: true,
    reason: "Disponibile dal turno successivo al lancio.", needsTargets: true, direct: false }]);
  assert.equal(buildSpellPillActionsView(null), null);
  assert.equal(spellPillActionErrorText({ errors: [{ code: "x", message: "Seleziona un bersaglio." }] }), "Seleziona un bersaglio.");
  assert.equal(spellPillActionErrorText({}), "Azione non eseguita: riapri il menu.");
});

test("one click runs an action with nothing to fill in the panel (lotto B), its popup asks the rest", async () => {
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const { getSpellActiveAction } = await import("../src/spellActiveActionCore.js");
  const action = (spellId, actionId) => getSpellActiveAction(getSpellDefinition(spellId), actionId);
  assert.equal(spellActionRunsDirectly(action("mirror-image", "mirror-image-duplicate-destroyed")), true);
  assert.equal(spellActionRunsDirectly(action("goodberry", "goodberry-eat")), true, "the heal popup asks the creature");
  assert.equal(spellActionRunsDirectly(action("hunters-mark", "hunters-mark-move")), false, "a creature to select");
  assert.equal(spellActionRunsDirectly({ id: "gust", resolutionKind: "zone-direction" }), false, "a zone to turn");
  assert.equal(spellActionRunsDirectly({ id: "x", choice: { required: true, options: [{ value: "a" }] } }), false);
  assert.equal(spellActionRunsDirectly(null), false);
});

test("Mirror Image on the attacked creature (lotto C): the d20 for three, two and one duplicate, the duplicate's AC", async () => {
  const { mirrorImageNotice, mirrorImageState, mirrorImageThreshold } = await import("../src/mirrorImageCore.js");
  assert.deepEqual([3, 2, 1, 0].map(mirrorImageThreshold), [6, 8, 11, null]);
  const META = "com.thebigpicture.initiative/meta";
  const SPELLS = "com.thebigpicture.initiative/spells";
  const mage = (remaining, dex = 3) => ({ id: "mira", metadata: { [META]: {
    initiativeCard: { abilityModifiers: { dex } },
    [SPELLS]: [{ name: "Immagine speculare", spellId: "mirror-image", instanceId: "mi-1", casterId: "mira",
      castContext: { uses: { key: "duplicates", remaining, total: 3 } } }],
  } } });
  assert.deepEqual(mirrorImageState(mage(2)), { instanceId: "mi-1", remaining: 2, threshold: 8, armorClass: 13 });
  assert.equal(mirrorImageState(mage(0)), null, "no duplicate left");
  assert.equal(mirrorImageState({ id: "orc", metadata: { [META]: {} } }), null);
  assert.equal(mirrorImageState(mage(3, null)).armorClass, null, "no Dexterity on the card");
  assert.match(mirrorImageNotice(mirrorImageState(mage(3))), /3 duplicati\. Tira un d20: con 6 o più[\s\S]*CA 13/u);
  assert.match(mirrorImageNotice(mirrorImageState(mage(1, null))), /1 duplicato\.[\s\S]*11 o più[\s\S]*CA 10 \+ Des/u);
});
