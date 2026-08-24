import test from "node:test";
import assert from "node:assert/strict";
import {
  compactLinkedSpellEffectLabel,
  compactSpellEffectLabel,
  effectSummaryPartsFor,
} from "../src/effectLabelCore.js";
import { getSpellCatalog } from "../src/spells-srd.js";

test("le pill note usano un'etichetta semantica più corta", () => {
  assert.equal(
    compactSpellEffectLabel("Lentezza: -2 CA/TS Des · no reazioni"),
    "Vel. ½ / CA -2 / TS Des -2 / No reazioni / Azione O Bonus",
  );
  assert.equal(
    compactSpellEffectLabel("Res. acido/freddo/fulmine/fuoco/tuono"),
    "Resistenze elementali",
  );
  assert.equal(
    compactSpellEffectLabel("Tenser: 50 PFt · vant. · +2d12 forza"),
    "50 PFt / vant. / +2d12 forza",
  );
});

test("le etichette non catalogate restano invariate", () => {
  assert.equal(compactSpellEffectLabel("Effetto personalizzato"), "Effetto personalizzato");
  assert.equal(compactSpellEffectLabel(""), "");
});

test("Lentezza espone summaryParts condivise senza persisterle nel testo legacy", () => {
  const parts = effectSummaryPartsFor({ effectId: "slow-penalty" });

  assert.deepEqual(parts, [
    { id: "speed-half", label: "Vel ½" },
    { id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" },
    { id: "no-reactions", label: "No reaz." },
    { id: "action-or-bonus", label: "Azione o Bonus" },
    { id: "attack-limit", label: "Max 1 att." },
    { id: "spell-delay", label: "Spell 1 az.: d20" },
  ]);
  assert.deepEqual(
    effectSummaryPartsFor({ condition: "Lentezza: -2 CA/TS Des · no reazioni" }),
    parts,
  );
  assert.deepEqual(effectSummaryPartsFor({ effectId: "legacy-effect" }), []);
});

test("Paura riusa summaryParts condivise sul solo effetto forced-flight", () => {
  assert.deepEqual(effectSummaryPartsFor({ effectId: "fear-forced-flight" }), [
    { id: "fear-flight", label: "Scatto: allontanati dal caster" },
  ]);
  assert.deepEqual(effectSummaryPartsFor({ effectId: "fear-drop" }), []);
});

test("Confusione espone solo le regole non già coperte dal reminder", () => {
  assert.equal(
    compactSpellEffectLabel("Confusione: azioni e movimento casuali"),
    "No reaz. / Tira d10 inizio turno",
  );
  assert.deepEqual(effectSummaryPartsFor({ effectId: "confusion-random-turn" }), [
    { id: "confusion-no-reactions", label: "No reaz." },
    { id: "confusion-random-table", label: "Tira d10 inizio turno" },
  ]);
});

test("un effetto collegato non ripete il nome della spell", () => {
  assert.equal(
    compactLinkedSpellEffectLabel(
      "Terreno difficile / Crescita di Spine",
      "Crescita di Spine",
    ),
    "Terreno difficile",
  );
  assert.equal(
    compactLinkedSpellEffectLabel("Silenzio: Assordato", "Silenzio"),
    "Assordato",
  );
});

test("ogni separatore a punto viene normalizzato con lo slash", () => {
  assert.equal(
    compactSpellEffectLabel("Effetto A · Effetto B · Effetto C"),
    "Effetto A / Effetto B / Effetto C",
  );

  for (const spell of getSpellCatalog()) {
    const labels = [
      ...(spell.effects || []).map((effect) => effect.label),
      ...(spell.effectChoices || []).flatMap((choice) =>
        (choice.effects || []).map((effect) => effect.label)
      ),
      ...["passed", "failed", "immune"].flatMap((outcome) =>
        (spell.saveAutomation?.[outcome] || [])
          .filter((rule) => rule.effectKind)
          .map((rule) => rule.condition)
      ),
    ];
    for (const label of labels) {
      assert.equal(
        compactSpellEffectLabel(label).includes("·"),
        false,
        `${spell.id}: ${label}`,
      );
    }
  }
});
