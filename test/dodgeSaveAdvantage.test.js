// Dodge in the save panels (lot T5 of docs/STUDIO_AZIONI_DI_TURNO.md, decision D5): a creature in Dodge has advantage on
// Dexterity saves, and every panel that asks for a save says so on its row: the attack console's areas and monster actions,
// the Boss Console, the spell panel and the reminders of active spells. A reminder: the dice stay the table's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}), Command: class {} } });

const { DODGE_CONDITION, DODGE_SAVE_NOTE, dodgeSaveAdvantage, isDodging } = await import("../src/attackAdvantagePillsCore.js");
const turnActions = await import("../src/pcAttackTurnActionCore.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { renderTargetMatrix } = await import("../src/spellUnifiedPanelTargetView.js");
const { createSpellUnifiedPanelSceneProvider } = await import("../src/spellUnifiedPanelSceneProvider.js");
const { FakeNode } = await import("../test-support/fakeBossActionsDom.js");

const META = "com.thebigpicture.initiative/meta";
const STATE = "com.thebigpicture.initiative/state";
const dodge = (extra = {}) => ({ id: "dodge-1", condition: "Schivata", sourceId: "monk", active: true, ...extra });
const creature = (id, conditions = []) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, conditions: { version: 2, instances: conditions } } } });

test("in Dodge: advantage on a Dexterity save only, from the Dodge pill or Patient Defense's, while it is active", () => {
  assert.equal(DODGE_CONDITION, "Schivata");
  assert.equal(turnActions.DODGE_CONDITION, DODGE_CONDITION, "the Azioni tab puts the pill the panels read");
  assert.equal(DODGE_SAVE_NOTE, "vant. (Schivata)");
  const monk = creature("monk", [dodge()]);
  assert.equal(isDodging(monk), true);
  assert.deepEqual(["dex", "DEX", " dex ", "con", "wis", ""].map((ability) => dodgeSaveAdvantage(monk, ability)), [true, true, true, false, false, false]);
  assert.equal(dodgeSaveAdvantage(creature("monk", [dodge({ displayLabel: "Schivata · Difesa Paziente" })]), "dex"), true, "Patient Defense");
  assert.equal(dodgeSaveAdvantage(creature("monk", [dodge({ active: false })]), "dex"), false, "an ended pill");
  assert.equal(dodgeSaveAdvantage(creature("orc"), "dex"), false);
  assert.equal(dodgeSaveAdvantage(null, "dex"), false);
});

test("the spell panel: under the name of a creature in Dodge for a Dexterity save, never for another save", () => {
  const view = (spellId, targetIds) => buildUnifiedPanelViewModel({
    contract: buildSpellUnifiedPanelContract({ spellId }),
    session: createSpellPanelSession({ contract: buildSpellUnifiedPanelContract({ spellId }), casterId: "caster", targetIds }),
    selectedCatalogKey: spellId, casterOptions: [{ value: "caster", label: "Caster" }],
    targetCandidates: [{ key: "monk", label: "Monaco", hp: 30, hpMax: 30, dodging: true }, { key: "orc", label: "Orco", hp: 30, hpMax: 30 }],
  });
  const fireball = view("fireball", ["monk", "orc"]);
  assert.equal(fireball.targets.outcomes.save.ability, "dex");
  assert.deepEqual(fireball.targets.candidates.map((candidate) => [candidate.key, candidate.saveNote || ""]), [["monk", DODGE_SAVE_NOTE], ["orc", ""]]);
  const thunderwave = view("thunderwave", ["monk", "orc"]);
  assert.equal(thunderwave.targets.outcomes.save.ability, "con");
  assert.deepEqual(thunderwave.targets.candidates.map((candidate) => candidate.saveNote || ""), ["", ""], "a Constitution save");
  // The row: the note under the name, with the rule in its tooltip.
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: () => new FakeNode(doc, "#text") };
  const section = renderTargetMatrix(doc, fireball, {});
  const notes = section.querySelectorAll(".unified-target-row__note");
  assert.deepEqual(notes.map((note) => [note.textContent, note.getAttribute("title")]), [[DODGE_SAVE_NOTE, "Schivata: vantaggio al TS su Destrezza."]]);
  assert.equal(renderTargetMatrix(doc, thunderwave, {}).querySelectorAll(".unified-target-row__note").length, 0);
});

test("the spell panel's creatures carry their Dodge from the scene, as they carry their Evasion", async () => {
  const items = [creature("monk", [dodge()]), creature("orc")];
  const obr = { scene: { getMetadata: async () => ({ [STATE]: { order: ["monk", "orc"], current: 0, round: 1 } }),
    items: { getItems: async (query) => (typeof query === "function" ? items.filter(query) : items), onChange: () => () => {} },
    grid: { getDpi: async () => 150 } } };
  const candidates = await createSpellUnifiedPanelSceneProvider(obr).getTargetCandidates("fireball");
  assert.deepEqual(candidates.map((candidate) => [candidate.key, candidate.dodging]), [["monk", true], ["orc", false]]);
});

test("the reminders of active spells: «· vantaggio (Schivata)» beside the name, for their Dexterity save", () => {
  const popup = readFileSync(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8");
  const rows = popup.slice(popup.indexOf("function renderSave()"));
  assert.ok(rows.includes("const dodging = !advantage && dodgeSaveAdvantage(item, saveAbility || child?.save?.ability || payload?.action?.save?.ability);"));
  assert.ok(rows.includes("`${displayName(item)} · vantaggio (Schivata)`"));
  assert.ok(rows.includes("vantaggio al TS su Destrezza, è in Schivata"));
});
