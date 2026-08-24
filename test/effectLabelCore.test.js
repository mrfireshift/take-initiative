import test from "node:test";
import assert from "node:assert/strict";
import {
  compactLinkedSpellEffectLabel,
  compactSpellEffectLabel,
  effectSummaryPartsFor,
} from "../src/effectLabelCore.js";
import { getSpellCatalog, getSpellEffects } from "../src/spells-srd.js";

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

test("il fallback legacy riusa i cluster del batch difensivo e ricorrente", () => {
  const expected = {
    "freedom-of-movement-immunities": [
      { id: "freedom-of-movement-difficult-terrain", label: "No terreno diff." },
      { id: "freedom-of-movement-speed-reduction", label: "No riduz. velocità mag." },
      { id: "freedom-of-movement-condition-immunity", label: "Imm. Par./Tratt. mag." },
      { id: "freedom-of-movement-escape", label: "Libera con 1,5 m" },
    ],
    "holy-aura-protection": [
      { id: "holy-aura-saving-throw-advantage", label: "Vant. TS" },
      { id: "holy-aura-incoming-attack-disadvantage", label: "Attacchi contro svant." },
    ],
    "tensers-transformation": [
      { id: "tensers-temporary-hit-points", label: "50 PF temp." },
      { id: "tensers-weapon-attack-advantage", label: "Vant. att. armi" },
      { id: "tensers-force-damage", label: "+2d12 forza" },
      { id: "tensers-martial-proficiency", label: "Comp. marziali" },
    ],
    "aura-of-purity-zone": [
      { id: "aura-of-purity-poison-resistance", label: "Res. veleno" },
      { id: "aura-of-purity-disease-immunity", label: "Imm. malattie" },
      { id: "aura-of-purity-condition-save-advantage", label: "Vant. TS condizioni" },
    ],
    "aura-of-life-zone": [
      { id: "aura-of-life-necrotic-resistance", label: "Res. necrotici" },
      { id: "aura-of-life-hit-point-maximum", label: "Max PF protetto" },
      { id: "aura-of-life-heal-at-zero", label: "+1 PF a 0" },
    ],
    "circle-of-power-zone": [
      { id: "circle-of-power-magic-save-advantage", label: "Vant. TS magia" },
      { id: "circle-of-power-zero-save-damage", label: "TS riuscito: 0 danni" },
    ],
    "enervation-link": [
      { id: "enervation-repeat-damage", label: "Azione: ripeti danni" },
      { id: "enervation-heal-half", label: "Cura metà danni" },
    ],
    "immolation-burning": [
      { id: "immolation-end-turn-save", label: "TS Des fine turno" },
      { id: "immolation-fire-damage", label: "4d6 fuoco" },
    ],
  };

  for (const [effectId, summaryParts] of Object.entries(expected)) {
    assert.deepEqual(effectSummaryPartsFor({ effectId }), summaryParts, effectId);
  }
});

test("il fallback legacy copre anche le varianti difensive persistenti", () => {
  const expected = {
    "holy-weapon": [
      { id: "holy-weapon-magical", label: "Arma magica" },
      { id: "holy-weapon-radiant-damage", label: "+2d8 radiosi" },
    ],
    "elemental-resistances": [
      { id: "elemental-resistances-five-types", label: "Res. 5 elementi" },
      { id: "elemental-resistances-reaction-immunity", label: "Reaz.: Imm. tipo" },
    ],
    "intellect-fortress": [
      { id: "intellect-fortress-psychic-resistance", label: "Res. psichici" },
      { id: "intellect-fortress-mental-save-advantage", label: "Vant. TS Int/Sag/Car" },
    ],
    "feign-death-protections": [
      { id: "feign-death-damage-resistance", label: "Res. danni (no psichici)" },
      { id: "feign-death-speed-zero", label: "Vel 0" },
      { id: "feign-death-disease-poison-suspended", label: "Malattie/veleno sospesi" },
    ],
    "primal-beast-benefits": [
      { id: "primal-beast-speed", label: "Vel +3 m" },
      { id: "primal-beast-darkvision", label: "Scurovisione" },
      { id: "primal-beast-strength-advantage", label: "Vant. att. Forza" },
      { id: "primal-beast-force-damage", label: "+1d6 forza" },
    ],
    "great-tree-benefits": [
      { id: "great-tree-temporary-hit-points", label: "10 PF temp." },
      { id: "great-tree-constitution-save-advantage", label: "Vant. TS Cos" },
      { id: "great-tree-dex-wis-attack-advantage", label: "Vant. att. Des/Sag" },
      { id: "great-tree-difficult-terrain-aura", label: "Terreno diff. aura" },
    ],
    "lower-planes-benefits": [
      { id: "lower-planes-armor-class", label: "+2 CA" },
      { id: "lower-planes-flight", label: "Volo 12 m" },
      { id: "lower-planes-elemental-immunity", label: "Imm. fuoco/veleno" },
      { id: "lower-planes-poisoned-immunity", label: "Imm. avvelenato" },
      { id: "lower-planes-magical-attacks", label: "Attacchi magici" },
      { id: "lower-planes-extra-attack", label: "Attacco extra" },
    ],
    "upper-planes-benefits": [
      { id: "upper-planes-armor-class", label: "+2 CA" },
      { id: "upper-planes-flight", label: "Volo 12 m" },
      { id: "upper-planes-elemental-immunity", label: "Imm. radiosi/necrotici" },
      { id: "upper-planes-charmed-immunity", label: "Imm. affascinato" },
      { id: "upper-planes-magical-attacks", label: "Attacchi magici" },
      { id: "upper-planes-extra-attack", label: "Attacco extra" },
    ],
  };

  for (const [effectId, summaryParts] of Object.entries(expected)) {
    assert.deepEqual(effectSummaryPartsFor({ effectId }), summaryParts, effectId);
  }
});

test("il fallback legacy separa i modificatori persistenti e i comportamenti ricorrenti", () => {
  const expected = {
    "attack-save-penalty": [
      { id: "bane-attack-penalty", label: "Att −1d4" },
      { id: "bane-save-penalty", label: "TS −1d4" },
    ],
    "attack-save-bonus": [
      { id: "bless-attack-bonus", label: "Att +1d4" },
      { id: "bless-save-bonus", label: "TS +1d4" },
    ],
    "hex-forza": [
      { id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" },
      { id: "hex-ability-check-disadvantage", label: "Svant. prove Forza" },
    ],
    "agathys-armor": [
      { id: "agathys-temporary-hit-points", label: "5 PF temp." },
      { id: "agathys-cold-retaliation", label: "5 danni freddo in mischia" },
    ],
    "witch-bolt-link": [
      { id: "witch-bolt-damage", label: "1d12 fulmine" },
      { id: "witch-bolt-repeat-action", label: "Azione: ripeti" },
    ],
    "searing-smite-burning": [
      { id: "searing-smite-save", label: "TS Cos inizio turno" },
      { id: "searing-smite-fire-damage", label: "1d6 fuoco" },
    ],
    "grasping-vine-command": [
      { id: "grasping-vine-bonus-action", label: "Azione bonus" },
      { id: "grasping-vine-pull", label: "Trascina 6 m" },
    ],
    "swift-quiver-attacks": [
      { id: "swift-quiver-bonus-action", label: "Azione bonus" },
      { id: "swift-quiver-two-attacks", label: "2 attacchi distanza" },
    ],
    "no-reaction-and-limited-turn-options": [
      { id: "mind-whip-no-reactions", label: "No reaz." },
      { id: "mind-whip-limited-turn", label: "Solo mov./az./bonus" },
    ],
  };

  for (const [effectId, summaryParts] of Object.entries(expected)) {
    assert.deepEqual(effectSummaryPartsFor({ effectId }), summaryParts, effectId);
  }
  assert.deepEqual(effectSummaryPartsFor({ effectId: "armor-class-bonus" }), []);
});

test("i descriptor SRD mantengono il contesto dei modificatori distinti", () => {
  const cases = [
    ["bane", "attack-save-penalty", [
      { id: "bane-attack-penalty", label: "Att −1d4" },
      { id: "bane-save-penalty", label: "TS −1d4" },
    ]],
    ["bless", "attack-save-bonus", [
      { id: "bless-attack-bonus", label: "Att +1d4" },
      { id: "bless-save-bonus", label: "TS +1d4" },
    ]],
    ["shield", "armor-class-bonus", [
      { id: "shield-armor-class", label: "+5 CA" },
      { id: "shield-magic-missile-immunity", label: "Imm. Dardo Incantato" },
    ]],
    ["legacy-tashas-mind-whip", "no-reaction-and-limited-turn-options", [
      { id: "mind-whip-no-reactions", label: "No reaz." },
      { id: "mind-whip-limited-turn", label: "Solo mov./az./bonus" },
    ]],
  ];

  for (const [spellId, effectId, summaryParts] of cases) {
    const [effect] = getSpellEffects(spellId);
    assert.equal(effect.id, effectId, spellId);
    assert.deepEqual(effect.summaryParts, summaryParts, spellId);
    assert.ok(effect.detail, spellId);
  }
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
