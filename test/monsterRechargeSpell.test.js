// Gli incantesimi a ricarica dei mostri e il testo dello statblock nella console (21/11/2026): «Entangling Plants
// (Recharge 5–6)» del Vine Blight del 2024 diventa un innato con la sua ricarica, nella scheda Incantesimi della console;
// il lancio spende la ricarica come quella di un attacco. Il testo di un attacco si legge dallo statblock salvato.
// Mostri inventati.
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsMonsterToStatblock, fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport, sheetImportSectionSummary } from "../src/characterSheetImportCore.js";
import { quickActionRechargePool, sanitizeQuickAction } from "../src/quickActionsCore.js";
import { planSpellCastCost } from "../src/spellSlotSpendCore.js";
import { pcAttackPickerEntries } from "../src/pcAttackPickerCore.js";
import { pcAttackMonsterActionText } from "../src/pcAttackMonsterTraitsCore.js";

const husk = {
  name: "Bramble Husk", source: "X", ac: [11], hp: { average: 16, formula: "3d8 + 3" }, str: 14, dex: 9, con: 12,
  spellcasting: [{
    name: "Grasping Thorns {@recharge 5}", type: "spellcasting", ability: "con", displayAs: "action", hidden: ["recharge"],
    headerEntries: ["The husk casts the {@spell Entangle|XPHB} spell, using Constitution as the spellcasting ability (spell save {@dc 11})."],
    recharge: { 5: ["{@spell Entangle|XPHB}"] },
  }],
  action: [{ name: "Thorn Lash", entries: ["{@atkr m} {@hit 4}, reach 10 ft. {@h}5 ({@damage 1d6 + 2}) Piercing damage. Until the start of the husk's next turn, the target can't take reactions."] }],
};

test("un incantesimo a ricarica di 5eTools è un innato con la sua ricarica, non una riga del rapporto", () => {
  const { block, report } = fiveToolsMonsterToStatblock(husk, { allow2024: true });
  assert.deepEqual(block.innateSpells, [{ name: "Entangle", recharge: 5 }]);
  assert.equal(block.spellSaveDC, 11);
  assert.ok(!report.some((line) => /a ricarica da gestire al tavolo/.test(line)), report.join(" · "));
  const sheet = parseCharacterSheetImport(JSON.stringify(block));
  assert.equal(sheet.error, "");
  const [entangle] = sheet.sections.innate;
  assert.equal(entangle.spellId, "entangle");
  assert.equal(entangle.cost, "free");
  assert.equal(entangle.recharge, 5);
  assert.match(sheetImportSectionSummary("innate", sheet.sections.innate), /ricarica 5–6/);
});

test("un'azione che lancia un incantesimo con «(Recharge 5–6)» nel nome porta la ricarica all'innato", () => {
  const caster = { name: "Moss Crone", source: "X", ac: [12], hp: { average: 30 },
    action: [{ name: "Choking Spores {@recharge 5}", entries: ["The crone casts {@spell stinking cloud} (DC 13)."] }] };
  const { block, report } = fiveToolsMonsterToStatblock(caster);
  assert.deepEqual(block.innateSpells, [{ name: "stinking cloud", recharge: 5 }]);
  assert.ok(report.some((line) => /incantesimo innato stinking cloud/.test(line) && !/ricarica resta/.test(line)), report.join(" · "));
});

test("la ricarica di un incantesimo: lo stesso contatore di un attacco, speso dal lancio mentre è pronta", () => {
  const action = sanitizeQuickAction({ id: "thorns", kind: "spell", label: "Intralciare", spellId: "entangle", cost: "free", recharge: 5 });
  assert.equal(action.recharge, 5);
  // A slot spell or one with uses keeps no recharge.
  assert.equal(sanitizeQuickAction({ id: "s", kind: "spell", label: "S", spellId: "entangle", recharge: 5 }).recharge, undefined);
  const pool = quickActionRechargePool(action);
  assert.equal(pool.id, "quick-action-recharge:thorns");
  const ready = planSpellCastCost({ action, sourceId: "husk", resources: {}, spellLevel: 1 });
  assert.equal(ready.operation.pool.id, pool.id);
  assert.deepEqual(ready.operation.adjustment, { delta: -1 });
  assert.equal(ready.spent, "ricarica di Intralciare (5–6)");
  // Spent: the GM rolled the d6 at the table and it came back; nothing to spend, nothing blocks the cast.
  const spent = planSpellCastCost({ action, sourceId: "husk", resources: { [pool.id]: { current: 0 } }, spellLevel: 1 });
  assert.equal(spent.operation, null);
  assert.equal(spent.exhausted, false);
});

test("nella console l'incantesimo a ricarica è nella scheda Incantesimi, da lanciare; gli altri innati restano sul ⚡", () => {
  const quickActions = [
    { id: "thorns", kind: "spell", label: "Intralciare", spellId: "entangle", cost: "free", recharge: 5 },
    { id: "mist", kind: "spell", label: "Nube di nebbia", spellId: "fog-cloud", cost: "free" },
    { id: "lash", kind: "attack", label: "Thorn Lash", components: [{ type: "piercing", formula: "1d6+2" }], attackBonus: 4 },
  ];
  const entries = pcAttackPickerEntries({ quickActions });
  const spell = entries.find((entry) => entry.spellId === "entangle");
  assert.equal(spell.tab, "spells");
  assert.equal(spell.mode, "launch");
  assert.equal(spell.actionId, "thorns");
  assert.equal(spell.level, 1);
  assert.equal(spell.recharge, 5);
  assert.equal(spell.concentration, true);
  assert.equal(entries.some((entry) => entry.spellId === "fog-cloud"), false);
});

test("il testo dello statblock di un attacco: per nome, senza parentesi, dalle azioni e dalle azioni bonus", () => {
  const view = fiveToolsStatblockSections({ ...husk, bonus: [{ name: "Root Grip", entries: ["The husk pulls one creature it grapples 5 feet toward it."] }] });
  assert.match(pcAttackMonsterActionText(view, "Thorn Lash"), /^Melee Attack Roll: \+4, reach 10 ft\..*can't take reactions\.$/);
  assert.equal(pcAttackMonsterActionText(view, "Root Grip (bonus action)"), "The husk pulls one creature it grapples 5 feet toward it.");
  assert.equal(pcAttackMonsterActionText(view, "Nothing"), "");
  assert.equal(pcAttackMonsterActionText(null, "Thorn Lash"), "");
});
