// CAP-RELATION (Xanathar): Life Transference's two rows, the caster's damage and the healing it gives, and the panel
// that writes them. The owner's decisions R-D1–R-D3 of 11/11/2026.
import test from "node:test";
import assert from "node:assert/strict";

import {
  LIFE_TRANSFERENCE_SPELL_ID,
  spellHpRelationChanges,
  spellHpRelationRule,
} from "../src/spellHpRelationCore.js";
import { spellSaveDamageFormula } from "../src/spellCastResolutionRules.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { SPELL_DAMAGE_TYPE_LEFT_TO_GM, spellDamageTypes } from "../src/spellDamageDefenseCore.js";
import { MULTI_TARGET_SAVE_SPELL_IDS } from "../src/areaSaveSpellRules.js";
import { buildSpellUnifiedPanelContract, createSpellPanelSession } from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const SPELL_ID = LIFE_TRANSFERENCE_SPELL_ID;
const changes = (amount, caster, target) => spellHpRelationChanges({ spellId: SPELL_ID, amount, caster, target });

test("il caster subisce tutto il tiro e il bersaglio recupera il doppio, fino al massimo", () => {
  const plain = changes(18, { hp: 40, hpMax: 40 }, { hp: 10, hpMax: 60 });
  assert.equal(plain.casterChange.mode, "damage");
  assert.equal(plain.casterChange.afterHP, 22);
  assert.equal(plain.healing, 36);
  assert.equal(plain.targetChange.mode, "heal");
  assert.equal(plain.targetChange.afterHP, 46);
  assert.equal(changes(18, { hp: 40, hpMax: 40 }, { hp: 50, hpMax: 60 }).targetChange.afterHP, 60, "la cura si ferma al massimo");
  assert.equal(spellHpRelationRule("xanathar-debilitazione"), null);
  assert.equal(spellHpRelationChanges({ spellId: "xanathar-debilitazione", amount: 10 }), null);
});

test("R-D2: i PF temporanei assorbono come sempre e la cura conta tutto il danno, anche oltre lo 0", () => {
  const temp = changes(18, { hp: 30, hpMax: 30, tempHp: 10 }, { hp: 10, hpMax: 60 });
  assert.equal(temp.casterChange.afterTempHp, 0);
  assert.equal(temp.casterChange.afterHP, 22);
  assert.equal(temp.healing, 36);
  const beyond = changes(18, { hp: 10, hpMax: 30 }, { hp: 10, hpMax: 60 });
  assert.equal(beyond.casterChange.afterHP, 0);
  assert.equal(beyond.healing, 36, "la parte oltre lo 0 è danno subito");
});

test("nel pannello: un bersaglio entro 9 m, 4d8 al 3° e 1d8 in più per slot, nessuna difesa da leggere", () => {
  assert.ok(MULTI_TARGET_SAVE_SPELL_IDS.includes(SPELL_ID));
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.equal(rule.targeting.maximum, 1);
  assert.deepEqual({ ...rule.targeting.spatial }, { mode: "caster-range", maxMeters: 9 });
  assert.equal(rule.manualSaveAtTable, true);
  assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", 3), "4d8");
  assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", 5), "6d8");
  assert.deepEqual([...spellDamageTypes(SPELL_ID)], []);
  assert.equal(SPELL_DAMAGE_TYPE_LEFT_TO_GM[SPELL_ID], "non riducibile");
});

function view(targetIds, damage = 18) {
  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, phase: "cast", castContext: { slotLevel: 3 } });
  const session = createSpellPanelSession({
    contract,
    casterId: "sera",
    targetIds,
    slotLevel: 3,
    hpValues: { damage },
  });
  return { contract, view: buildUnifiedPanelViewModel({
    contract,
    session,
    casterOptions: [{ value: "sera", label: "Sera" }],
    targetCandidates: [
      { key: "sera", label: "Sera", subtitle: "Creatura", hp: 40, hpMax: 40 },
      { key: "dars", label: "Dars", subtitle: "Creatura", hp: 10, hpMax: 60 },
    ],
  }) };
}

test("l'anteprima: «Danno al caster · 4d8 necrotici», la cura doppia sul bersaglio e la riga del caster", () => {
  const { contract, view: model } = view(["dars"]);
  assert.equal(contract.presentation.inputs.damage.visible, true);
  const field = model.effects.fields.find((entry) => entry.id === "damage");
  assert.equal(field.label, "Danno al caster · 4d8 necrotici");
  assert.match(field.hint, /doppio/u);
  const rows = new Map(model.effects.preview.targets.map((row) => [row.key, row]));
  assert.equal(rows.get("dars").afterHP, 46);
  assert.equal(rows.get("dars").factorLabel, "Recupera il doppio: 36 PF");
  assert.equal(rows.get("sera").afterHP, 22);
  assert.equal(rows.get("sera").factorLabel, "Danno al caster, non ridotto");
  assert.equal(view(["dars"], 45).view.effects.preview.targets.find((row) => row.key === "sera").factorLabel,
    "Danno al caster, non ridotto: scende a 0 PF");
});

test("R-D3: il caster scelto come bersaglio non ha cura in anteprima", () => {
  const row = view(["sera"]).view.effects.preview.targets.find((entry) => entry.key === "sera");
  assert.equal(row.factorLabel, "Il caster non può scegliere sé stesso");
  assert.equal(row.afterHP, null);
});
