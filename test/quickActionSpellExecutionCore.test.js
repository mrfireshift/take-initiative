import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectQuickActionSpellRequest,
  quickActionConcentrationNames,
} from "../src/quickActionSpellExecutionCore.js";
import { ID } from "../src/constants.js";
import {
  getSpellDefinition,
  getSpellEffectChoices,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

function spellAction(spell, overrides = {}) {
  return {
    id: `quick-${spell.id}`,
    label: spell.displayName || spell.name,
    kind: "spell",
    spellId: spell.id,
    workflow: "spell",
    targetMode: "self",
    applyAutomations: true,
    ...overrides,
  };
}

test("prepara l'esecuzione diretta di un incantesimo sicuro su di sé", () => {
  const spell = getSpellDefinition("Scudo della Fede");
  assert.ok(spell);

  const decision = buildDirectQuickActionSpellRequest({
    action: spellAction(spell, { slotLevel: 2, turns: 7 }),
    sourceId: "paladin",
  });

  assert.equal(decision.mode, "direct");
  assert.equal(decision.replacesConcentration, true);
  assert.equal(decision.request.spell.id, spell.id);
  assert.equal(decision.request.casterId, "paladin");
  assert.deepEqual(decision.request.targetIds, ["paladin"]);
  assert.equal(decision.request.castContext.slotLevel, 2);
  assert.equal(decision.request.turns, 7);
  assert.equal(decision.request.requestedConcentration, true);
});

test("esegue direttamente una selezione composta da un solo bersaglio", () => {
  const spell = getSpellDefinition("Scudo della Fede");
  assert.ok(spell);

  const decision = buildDirectQuickActionSpellRequest({
    action: spellAction(spell, { targetMode: "selection" }),
    sourceId: "paladin",
    selectedTargetIds: ["ally"],
  });

  assert.equal(decision.mode, "direct");
  assert.deepEqual(decision.request.targetIds, ["ally"]);
});

test("mantiene in revisione una selezione vuota o multipla", () => {
  const spell = getSpellDefinition("Scudo della Fede");
  assert.ok(spell);
  const action = spellAction(spell, { targetMode: "selection" });

  assert.deepEqual(buildDirectQuickActionSpellRequest({
    action,
    sourceId: "paladin",
  }), {
    mode: "review",
    reason: "single-target-required",
  });
  assert.deepEqual(buildDirectQuickActionSpellRequest({
    action,
    sourceId: "paladin",
    selectedTargetIds: ["ally", "enemy"],
  }), {
    mode: "review",
    reason: "single-target-required",
  });
});

test("mantiene in revisione gli incantesimi ad area", () => {
  const spell = getSpellDefinition("Palla di Fuoco");
  assert.ok(spell);

  assert.deepEqual(buildDirectQuickActionSpellRequest({
    action: spellAction(spell),
    sourceId: "wizard",
  }), {
    mode: "review",
    reason: "area-review-required",
  });
});

test("mantiene in revisione gli incantesimi che richiedono una variante", () => {
  const option = getTrackableSpellOptions().find((entry) => {
    const spell = getSpellDefinition(entry.id);
    return getSpellEffectChoices(spell).length > 0;
  });
  const spell = getSpellDefinition(option?.id);
  assert.ok(spell, "il catalogo deve contenere almeno un incantesimo con varianti");

  assert.deepEqual(buildDirectQuickActionSpellRequest({
    action: spellAction(spell),
    sourceId: "caster",
  }), {
    mode: "review",
    reason: "choice-review-required",
  });
});

test("usa la fase di preparazione del catalogo per gli incantesimi a due fasi", () => {
  const spell = getSpellDefinition("Punizione Collerica");
  assert.ok(spell);

  const decision = buildDirectQuickActionSpellRequest({
    action: spellAction(spell),
    sourceId: "paladin",
  });

  assert.equal(decision.mode, "direct");
  assert.equal(decision.request.phasePlan.phase, "prepare");
  assert.deepEqual(decision.request.targetIds, ["paladin"]);
});

test("riconosce la concentrazione attiva dal metadato canonico del personaggio", () => {
  assert.deepEqual(quickActionConcentrationNames({
    metadata: {
      [`${ID}/meta`]: {
        [`${ID}/concentration`]: {
          legacy: { name: "Benedizione" },
          duplicate: { spellName: "Benedizione" },
          "shield-of-faith": {},
        },
      },
    },
  }), [
    "Benedizione",
    "shield-of-faith",
  ]);
  assert.deepEqual(quickActionConcentrationNames({ metadata: {} }), []);
});
