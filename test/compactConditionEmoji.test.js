// Lot L3 of the tracker UI study (docs/STUDIO_UI_TRACKER_BG3.md), with the emoji (18/11): in the compact card's row a
// condition of the catalog shows its emoji alone, in a square of its pill's colour with its rounds; the first other
// effect keeps its label in the room left, "+N" counts the rest, and the drawer lists every effect with its name. The
// classic card's pills keep the emoji and the name.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";

const unexpectedMutation = () => { throw new Error("drawing the compact row must not mutate the scene"); };
mock.module("@owlbear-rodeo/sdk", { exports: { default: {}, buildLabel: () => ({}) } });
mock.module("../src/effectsMutations.js", { exports: { requireAppliedEffectsMutation: unexpectedMutation, runEffectsMutation: unexpectedMutation, tickRoundEffects: unexpectedMutation } });
const doc = {
  createElement: (tag) => { const node = new FakeNode(doc, tag); node.style = {}; return node; },
  createDocumentFragment: () => doc.createElement("fragment"),
};
globalThis.document = doc;

const {
  __compactEffectItems,
  buildCompactCardStatus,
  buildCompactConditionIconChip,
  compactConditionIconCount,
  compactStatusLayout,
  syncCompactEffectsToggleState,
} = await import("../src/initiativeCardCompact.js");
const { CONDITION_EMOJI, conditionAccentColor, conditionIconEmoji, formatConditionName } = await import("../src/conditions.js");

const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const conditionsSource = readFileSync(new URL("../src/conditions.js", import.meta.url), "utf8");

const icon = (label, extra = {}) => ({ kind: "condition", label: `${CONDITION_EMOJI[label] || ""} ${label}`.trim(), title: label, icon: CONDITION_EMOJI[label] || "❔", ...extra });
const plain = (label) => ({ kind: "spell", label, title: label });

test("the emoji of a condition of the catalog, the theme's first; none for a custom one; the pill's colour", () => {
  assert.equal(conditionIconEmoji({ condition: "Prono" }), "⬇️");
  assert.equal(conditionIconEmoji({ condition: " Avvelenato " }), "☠️");
  assert.equal(conditionIconEmoji({ condition: "Ira" }), "🔥");
  assert.equal(conditionIconEmoji({ condition: "Santuario del Crepuscolo" }), "🌙");
  assert.equal(conditionIconEmoji({ condition: "Prono", theme: { emoji: "🧎" } }), "🧎");
  assert.equal(conditionIconEmoji({ condition: "Unto", theme: { emoji: "🛢️" } }), "", "outside the catalog the label stays");
  assert.equal(conditionIconEmoji(null), "");
  assert.equal(conditionAccentColor("Prono"), "#f39c12");
  assert.equal(conditionAccentColor("Unto"), null);
});

test("the number on a square: the rounds the label shows, the level of Indebolimento", () => {
  assert.equal(compactConditionIconCount({ condition: "Avvelenato", expiry: { mode: "rounds", remaining: 3 } }), 3);
  assert.equal(compactConditionIconCount({ condition: "Prono" }), 0);
  assert.equal(compactConditionIconCount({ condition: "Spaventato", expiry: { mode: "turn-end", remaining: 1 } }), 0);
  assert.equal(compactConditionIconCount({ condition: "Indebolimento", level: 2 }), 2);
  assert.equal(compactConditionIconCount({ condition: "Indebolimento" }), 1);
});

test("the compact row: conditions first, a label in the room left, '+N' for the rest, the drawer with every name", () => {
  const four = [icon("Prono"), icon("Avvelenato"), icon("Spaventato"), icon("Afferrato")];
  assert.equal(compactStatusLayout(four).icons.length, 4);
  assert.equal(compactStatusLayout(four).hiddenCount, 0);
  assert.equal(compactStatusLayout(four).drawer.length, 4);
  assert.equal(compactStatusLayout([...four, icon("Accecato")]).hiddenCount, 1, "four fit in 80px, the fifth is in +1");

  const mixed = compactStatusLayout([icon("Prono"), plain("Benedizione"), plain("Scudo della fede")]);
  assert.equal(mixed.icons.length, 1);
  assert.equal(mixed.preview.label, "Benedizione");
  assert.equal(mixed.hiddenCount, 1);
  assert.equal(compactStatusLayout([icon("Prono"), icon("Avvelenato"), icon("Spaventato"), plain("Benedizione")]).preview, null,
    "beside three squares the label would keep less than four letters");

  // Beside both legendary rows there is room for one square.
  const legendary = compactStatusLayout([icon("Prono"), icon("Avvelenato")], { legendaryMax: 3, resistanceMax: 3, pipSize: 7 });
  assert.equal(legendary.icons.length, 1);
  assert.equal(legendary.hiddenCount, 1);

  // Without conditions, the row of lot L2.
  const spells = compactStatusLayout([plain("Benedizione"), plain("Velocità")]);
  assert.deepEqual(spells.icons, []);
  assert.equal(spells.preview.label, "Benedizione");
  assert.deepEqual(spells.drawer.map((effect) => effect.label), ["Velocità"]);
  assert.equal(compactStatusLayout([plain("Scudo della fede")], { legendaryMax: 3, resistanceMax: 3, pipSize: 7 }).preview, null);
});

test("a square: the emoji alone, the condition's colour, its rounds in a disc, nothing without a number", () => {
  const chip = buildCompactConditionIconChip(icon("Avvelenato", { iconColor: "#2ecc71", iconCount: 3, instanceId: "p" }), { documentRef: doc });
  assert.equal(chip.dataset.compactConditionIcon, "1");
  assert.equal(chip.dataset.conditionInstanceId, "p");
  assert.equal(chip.title, "Avvelenato");
  assert.equal(chip.style.border, "1px solid #2ecc71");
  assert.equal(chip.style.width, "16px");
  assert.equal(chip.children[0].textContent, "☠️");
  assert.equal(chip.children[0].attributes["aria-hidden"], "true");
  assert.equal(chip.children[1].textContent, "3");
  const bare = buildCompactConditionIconChip(icon("Prono"), { documentRef: doc });
  assert.equal(bare.children.length, 1);
  assert.equal(bare.style.border, "1px solid #e5e7eb");
});

test("the row with conditions opens the drawer from the squares, and '+N' hides while it is open", () => {
  const effects = [icon("Prono"), icon("Avvelenato"), icon("Spaventato"), icon("Afferrato"), icon("Accecato")];
  const layout = compactStatusLayout(effects);
  const row = buildCompactCardStatus(effects, { layout, hasExpandableEffects: true, documentRef: doc });
  assert.ok(row.iconStrip);
  assert.equal(row.iconStrip.children.length, 4);
  assert.deepEqual(row.iconStrip.children.map((chip) => chip.children[0].textContent), ["⬇️", "☠️", "😨", "✊"]);
  assert.equal(row.iconStrip.attributes.role, "button");
  assert.equal(row.previewPill, null);
  assert.equal(row.moreEffectsButton.textContent, "+1");
  assert.equal(row.moreEffectsButton.style.position, "absolute");
  assert.equal(row.iconStrip.attributes["aria-label"], "Mostra gli effetti");
  syncCompactEffectsToggleState({ previewPill: null, moreEffectsButton: row.moreEffectsButton, iconStrip: row.iconStrip, effectsCount: 5, opened: true, hiddenCount: 1 });
  assert.equal(row.moreEffectsButton.style.display, "none");
  assert.equal(row.iconStrip.attributes["aria-expanded"], "true");
  assert.equal(row.iconStrip.attributes["aria-label"], "Nascondi gli effetti");

  const allShown = buildCompactCardStatus(effects.slice(0, 2), { layout: compactStatusLayout(effects.slice(0, 2)), hasExpandableEffects: true, documentRef: doc });
  assert.equal(allShown.moreEffectsButton, null, "nothing left out: no +N, the squares open the drawer");

  // A condition and a label: the square, then the label in the room left.
  const withLabel = [icon("Prono"), plain("Benedizione")];
  const mixed = buildCompactCardStatus(withLabel, { layout: compactStatusLayout(withLabel), hasExpandableEffects: true, documentRef: doc });
  assert.equal(mixed.iconStrip.children.length, 1);
  assert.equal(mixed.previewPill.textContent, "Benedizione");
  assert.equal(mixed.moreEffectsButton, null);
});

test("the effects carry the emoji, the rounds and the colour; the label keeps the emoji for the drawer", () => {
  const items = __compactEffectItems(
    [
      { id: "p", condition: "Avvelenato", expiry: { mode: "rounds", remaining: 3 } },
      { id: "c", condition: "Condizione inventata" },
      { id: "h", condition: "Pozione di Eroismo", effectId: "buff:pozione-di-eroismo", effectKind: "buff" },
    ],
    [{ name: "Benedizione" }],
    false,
    { formatConditionName, conditionEmoji: conditionIconEmoji, conditionAccent: conditionAccentColor },
  );
  const poisoned = items.find((item) => item.instanceId === "p");
  assert.equal(poisoned.label, "☠️ Avvelenato (3)");
  assert.equal(poisoned.icon, "☠️");
  assert.equal(poisoned.iconCount, 3);
  assert.equal(poisoned.iconColor, "#2ecc71");
  assert.equal(items.find((item) => item.instanceId === "c").icon, undefined);
  assert.equal(items.find((item) => item.instanceId === "h").icon, undefined, "a potion keeps its label");
  assert.equal(items.find((item) => item.kind === "spell").icon, undefined);

  // Without the tracker's functions nothing changes: the row of lot L2.
  const bare = __compactEffectItems([{ id: "p", condition: "Prono" }], [], false, { formatConditionName });
  assert.equal(bare[0].icon, undefined);
});

test("the tracker passes the emoji and the colours to the compact row; the classic pills keep their labels", () => {
  assert.ok(tracker.includes("conditionEmoji: conditionIconEmoji,"));
  assert.ok(tracker.includes("conditionAccent: conditionAccentColor,"));
  const compact = tracker.slice(tracker.indexOf("function renderCompactTrack("));
  assert.ok(compact.includes("const hasExpandableEffects = statusLayout.hiddenCount > 0 || statusLayout.icons.length > 0;"));
  assert.ok(compact.includes("previewPill || iconStrip || moreEffectsButton,"));
  assert.ok(compact.includes("previewPill: referencePreview ? null : previewPill,"));
  // The classic card's chips: emoji and name, as before.
  assert.ok(conditionsSource.includes("    chipLabel.textContent = group.label;\n"));
});
