import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuickActionSpellLaunchPlan,
  quickActionConcentrationNames,
} from "../src/quickActionSpellExecutionCore.js";
import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";

function spellAction(spellId, overrides = {}) {
  const spell = getSpellDefinition(spellId);
  assert.ok(spell, `spell non presente nel catalogo: ${spellId}`);
  return {
    id: `quick-${spell.id}`,
    label: spell.displayName || spell.name || spell.id,
    kind: "spell",
    spellId: spell.id,
    targetMode: "self",
    applyAutomations: true,
    launchMode: "auto",
    ...overrides,
  };
}

test("prepara l'esecuzione diretta di un incantesimo sicuro su di sé", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("shield-of-faith", { slotLevel: 2, turns: 7, applyAutomations: false }),
    sourceId: "paladin",
  });

  assert.equal(decision.mode, "direct");
  assert.equal(decision.reason, "direct-safe");
  assert.equal(decision.replacesConcentration, true);
  assert.equal(decision.lifecycleRequest.spell.id, "shield-of-faith");
  assert.equal(decision.lifecycleRequest.casterId, "paladin");
  assert.deepEqual(decision.lifecycleRequest.targetIds, ["paladin"]);
  assert.equal(decision.lifecycleRequest.castContext.slotLevel, 2);
  assert.equal(decision.session.durationTurns, 7);
  assert.equal(decision.lifecycleRequest.applyAutomatedConditions, false);
  assert.equal("workflow" in decision, false);
});

test("esegue direttamente una selezione composta da un solo bersaglio", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("shield-of-faith", { targetMode: "selection" }),
    sourceId: "paladin",
    selectedTargetIds: ["ally"],
  });

  assert.equal(decision.mode, "direct");
  assert.deepEqual(decision.session.targetIds, ["ally"]);
  assert.deepEqual(decision.lifecycleRequest.targetIds, ["ally"]);
});

test("mantiene in revisione una selezione vuota o multipla", () => {
  const action = spellAction("shield-of-faith", { targetMode: "selection" });

  const missing = buildQuickActionSpellLaunchPlan({ action, sourceId: "paladin" });
  assert.equal(missing.mode, "review");
  assert.equal(missing.reason, "single-target-required");

  const multiple = buildQuickActionSpellLaunchPlan({
    action,
    sourceId: "paladin",
    selectedTargetIds: ["ally", "enemy"],
  });
  assert.equal(multiple.mode, "review");
  assert.equal(multiple.reason, "single-target-required");
});

test("le spell ad area e le spell con regole di area aprono sempre il pannello", () => {
  for (const spellId of [
    "fireball",
    "bane",
    "chain-lightning",
    "xanathar-sfera-della-tempesta",
  ]) {
    const decision = buildQuickActionSpellLaunchPlan({
      action: spellAction(spellId),
      sourceId: "wizard",
    });
    assert.equal(decision.mode, "review", spellId);
    assert.equal(decision.route.destination, "spell-unified-panel", spellId);
    assert.equal(decision.route.request.intent, "spell-cast", spellId);
  }
});

test("un attacco single-target e un trucchetto area restano in review nel pannello canonico", () => {
  const attack = buildQuickActionSpellLaunchPlan({
    action: spellAction("chill-touch", {
      targetMode: "selection",
    }),
    sourceId: "wizard",
    selectedTargetIds: ["enemy"],
  });
  assert.equal(attack.mode, "review");
  assert.equal(attack.route.destination, "spell-unified-panel");
  assert.deepEqual(attack.route.request.targetIds, ["enemy"]);
  assert.notEqual(attack.reason, "lane-not-supported");

  const cantripArea = buildQuickActionSpellLaunchPlan({
    action: spellAction("xanathar-rombo-di-tuono"),
    sourceId: "wizard",
  });
  assert.equal(cantripArea.mode, "review");
  assert.equal(cantripArea.route.destination, "spell-unified-panel");
  assert.equal(cantripArea.route.request.intent, "spell-cast");
});

test("Esilio in quick action apre la revisione con il bersaglio iniziale", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("banishment", {
      targetMode: "selection",
      slotLevel: 4,
    }),
    sourceId: "wizard",
    selectedTargetIds: ["enemy"],
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.reason, "area-review-required");
  assert.deepEqual(decision.route.request.targetIds, ["enemy"]);
  assert.equal(decision.route.request.origin, "quick-action");
});

test("Sguardo Penetrante apre la revisione perché il cast iniziale richiede bersaglio e variante", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("eyebite"),
    sourceId: "wizard",
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.route.request.spellId, "eyebite");
});

test("le quick action spell non producono route con lane o pannelli legacy", () => {
  for (const spellId of [
    "chill-touch",
    "xanathar-rombo-di-tuono",
    "banishment",
    "eyebite",
  ]) {
    const decision = buildQuickActionSpellLaunchPlan({
      action: spellAction(spellId, {
        targetMode: spellId === "banishment" || spellId === "chill-touch"
          ? "selection"
          : "self",
      }),
      sourceId: "wizard",
      selectedTargetIds: ["enemy"],
    });
    if (decision.mode === "review") {
      assert.equal(decision.route.destination, "spell-unified-panel", spellId);
      assert.equal(decision.route.request.intent, "spell-cast", spellId);
      assert.notEqual(decision.reason, "hp-input-not-supported", spellId);
      assert.notEqual(decision.reason, "active-resolution-not-supported", spellId);
      assert.notEqual(decision.reason, "slot-level-invalid", spellId);
    }
  }
});

test("la mano arcana apre il pannello perché richiede una pedina", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("arcane-hand"),
    sourceId: "wizard",
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.reason, "tokens-not-supported");
});

test("mantiene in revisione gli incantesimi che richiedono una variante", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("alter-self"),
    sourceId: "caster",
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.reason, "variant-review-required");
});

test("usa la fase di preparazione per gli incantesimi a due fasi", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("phb2014-punizione-collerica"),
    sourceId: "paladin",
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.reason, "prepared-resolution-required");
  assert.equal(decision.session.phase, "prepare");
  assert.equal(decision.route.request.phase, "prepare");
});

test("launchMode review apre sempre il pannello e conserva la sessione", () => {
  const decision = buildQuickActionSpellLaunchPlan({
    action: spellAction("shield-of-faith", {
      launchMode: "review",
      targetMode: "selection",
      slotLevel: 3,
      turns: 12,
      applyAutomations: false,
    }),
    sourceId: "paladin",
    selectedTargetIds: ["ally"],
  });

  assert.equal(decision.mode, "review");
  assert.equal(decision.reason, "launch-mode-review");
  assert.deepEqual(decision.route.request, {
    intent: "spell-cast",
    sourceId: "paladin",
    casterId: "paladin",
    spellId: "shield-of-faith",
    phase: "cast",
    slotLevel: 3,
    durationTurns: 12,
    applyAutomatedConditions: false,
    targetIds: ["ally"],
    origin: "quick-action",
    quickActionId: "quick-shield-of-faith",
  });
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
