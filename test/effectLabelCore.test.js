import test from "node:test";
import assert from "node:assert/strict";
import { compactSpellEffectLabel } from "../src/effectLabelCore.js";
import { getSpellCatalog } from "../src/spells-srd.js";

test("le pill note usano un'etichetta semantica più corta", () => {
  assert.equal(
    compactSpellEffectLabel("Lentezza: -2 CA/TS Des · no reazioni"),
    "Vel. 1/2 / -2 CA/TS Des / no reaz.",
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
