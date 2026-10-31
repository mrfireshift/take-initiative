// CAP-TEMP, lotto T3b (texts 2014: PHB, Xanathar): the temporary hit points a spell gives at its cast. The amounts below
// are read from the texts, not from the rules under test.
import test from "node:test";
import assert from "node:assert/strict";
import {
  spellCastTemporaryHpAmount,
  spellCastTemporaryHpHint,
  spellCastTemporaryHpRule,
} from "../src/spellTemporaryHpRules.js";
import {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const amount = (spellId, slotLevel, roll) => spellCastTemporaryHpAmount(spellCastTemporaryHpRule(spellId), { slotLevel, roll });

test("False Life: 1d4 + 4, 5 more per slot above the 1st; the roll is required and within the die", () => {
  assert.equal(amount("false-life", 1, 2), 6);
  assert.equal(amount("false-life", 3, 4), 18);
  assert.equal(amount("false-life", 1, 5), null);
  assert.equal(amount("false-life", 1, undefined), null);
  assert.equal(spellCastTemporaryHpHint(spellCastTemporaryHpRule("false-life"), 2), "Tira 1d4: il plugin aggiunge 9 (PF temporanei = tiro + 9).");
});

test("Armor of Agathys: 5 per slot level; Tenser's Transformation: 50, with no pill as their source", () => {
  assert.deepEqual([1, 2, 5].map((slot) => amount("phb2014-armatura-di-agathys", slot)), [5, 10, 25]);
  assert.equal(spellCastTemporaryHpRule("phb2014-armatura-di-agathys").effectId, "agathys-armor");
  assert.equal(amount("xanathar-trasformazione-di-tenser", 6), 50);
  assert.equal(spellCastTemporaryHpRule("xanathar-trasformazione-di-tenser").effectId, "", "they outlast the spell (D3)");
  assert.equal(spellCastTemporaryHpRule("cure-wounds"), null);
});

test("the panel asks False Life's 1d4, with what the plugin adds, before the cast", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "false-life", phase: "cast", castContext: { slotLevel: 1 } });
  assert.deepEqual(contract.presentation.inputs.temporaryHp, { required: true, visible: true, die: "1d4" });
  const session = (temporaryHp) => createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 1,
    hpValues: temporaryHp === undefined ? {} : { temporaryHp } });
  const validation = (temporaryHp) => buildSpellPanelViewModel(contract, { ...session(temporaryHp), executionGate: { allowed: true } }).validation;
  assert.equal(validation().firstInvalidField, "temporaryHp");
  assert.equal(validation(5).firstInvalidField, "temporaryHp", "beyond the d4");
  assert.equal(validation(3).valid, true);
  const field = buildUnifiedPanelViewModel({ contract, session: session(3), targetCandidates: [] }).effects.fields
    .find((entry) => entry.id === "temporaryHp");
  assert.deepEqual([field?.label, field?.value, field?.hint], ["PF temporanei · tiro del 1d4", 3,
    "Tira 1d4: il plugin aggiunge 4 (PF temporanei = tiro + 4)."]);
  const agathys = buildSpellUnifiedPanelContract({ spellId: "phb2014-armatura-di-agathys", phase: "cast", castContext: { slotLevel: 1 } });
  assert.equal(agathys.presentation.inputs.temporaryHp.required, false, "a fixed amount asks nothing");
});
