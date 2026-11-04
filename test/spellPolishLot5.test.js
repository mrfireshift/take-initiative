// Lot 5 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the next 40 spells next to the engine has found.
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellSweep } = await import("../test-support/spellSweepHarness.js");
const { getProposedConditions, getSpellDefinition, getSpellEffects } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession, updateSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { buildSpellUnifiedAreaCommand } = await import("../src/spellUnifiedAreaAdapter.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellAreaRuleById, validateSpellAreaRule } = await import("../src/spellAreaRules.js");
const { scopedStaticSpellZoneTargetIds } = await import("../src/spellStaticZoneCore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");
const { areaMembershipTargetIds } = await import("../src/spellAreaMembershipCore.js");
const { spellCastTemporaryHpAmount, spellCastTemporaryHpRule } = await import("../src/spellTemporaryHpRules.js");
const { resolveDamageEndsConditionRemovals } = await import("../src/hpConditionRulesCore.js");
const {
  ANIMATED_OBJECTS_MAX_COST,
  animatedObjectsMaximumCost,
  expandAnimatedObjectComposition,
  validateAnimatedObjectComposition,
} = await import("../src/animatedObjectsCore.js");

const META = "meta";
const TRACKER_META = "com.thebigpicture.initiative/meta";
const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
const records =await runSpellSweep({ spellIds: ["xanathar-sonnellino"] });
const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });

test("Aura of Purity protects the nonhostile creatures in it, not the enemies", () => {
  const rule = getSpellAreaRuleById("phb2014-aura-di-purezza:cast");
  assert.equal(rule.targeting.filter, "non-hostile");
  assert.equal(rule.targeting.includeCaster, false, "the caster keeps the pill of the cast");
  const area = { cells: [{ x: 0, y: 0, width: 400, height: 400, column: 0, row: 0 }] };
  const creature = (id, attitude) => ({
    item: { id, metadata: { [META]: { attitude } } },
    bounds: { min: { x: 10, y: 10 }, max: { x: 60, y: 60 } },
  });
  const inside = areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [creature("caster", "pc"), creature("ally", "ally"), creature("hero", "pc"), creature("stranger", "neutral"), creature("enemy", "enemy")],
  });
  assert.deepEqual(inside, ["ally", "hero", "stranger"]);
});

test("Catnap: who takes damage wakes up, as with Sleep, and the prone stays", () => {
  const [catnap] = getProposedConditions(getSpellDefinition("xanathar-sonnellino"));
  assert.equal(catnap.name, "Privo di sensi");
  assert.equal(catnap.options.manualRemoval, true);
  assert.equal(catnap.options.endsParentOnRemoval, true);
  const instances = [
    { id: "asleep", condition: "Privo di sensi", ...catnap.options },
    { id: "prone", condition: "Prono" },
  ];
  assert.deepEqual(resolveDamageEndsConditionRemovals(instances), ["asleep"]);
  const cast = records.find((record) => record.id === "xanathar-sonnellino");
  assert.ok(cast.conditions.some((condition) => condition.name === "Privo di sensi" && condition.manualRemoval));
});

test("Guardian of Nature: the Great Tree gives its 10 temporary hit points, the Primal Beast none", () => {
  const rule = spellCastTemporaryHpRule("xanathar-guardiano-della-natura", "great-tree");
  assert.equal(spellCastTemporaryHpAmount(rule, { slotLevel: 4 }), 10);
  assert.equal(spellCastTemporaryHpAmount(rule, { slotLevel: 6 }), 10, "the slot does not change them");
  assert.equal(rule.effectId, "great-tree-benefits", "they end with the form");
  assert.ok(getSpellEffects("xanathar-guardiano-della-natura", "great-tree").some((effect) => effect.id === rule.effectId));
  assert.equal(spellCastTemporaryHpRule("xanathar-guardiano-della-natura", "primal-beast"), null);
});

test("Intellect Fortress says the 9 m between its targets, and keeps the range from the caster", () => {
  const { targeting } = contractOf("tasha-fortezza-della-mente", 4).presentation;
  assert.equal(targeting.limit.maximum, 2);
  assert.deepEqual(targeting.spatialRules, { mode: "pairwise-distance", maxMeters: 9 });
  assert.equal(targeting.casterRange.maxMeters, 9);
});

test("Shadow of Moil answers any attack from within 3 m, not only a melee one", () => {
  const [effect] = getSpellEffects("xanathar-ombra-di-moil");
  assert.equal(effect.mechanics.retaliation.meleeOnly, false);
  assert.equal(effect.mechanics.retaliation.reachMeters, 3);
  assert.doesNotMatch(effect.detail, /mischia/u);
  assert.equal(effect.summaryParts.find((part) => part.id === "shadow-of-moil-melee-retaliation").label, "Ritorsione entro 3 m");
});

test("Animate Objects: two more objects for each slot above the 5th", () => {
  assert.equal(animatedObjectsMaximumCost(), ANIMATED_OBJECTS_MAX_COST);
  assert.equal(animatedObjectsMaximumCost(5), 10);
  assert.equal(animatedObjectsMaximumCost(6), 12);
  assert.equal(animatedObjectsMaximumCost(9), 18);
  const twelve = { huge: 1, medium: 2 };
  assert.equal(validateAnimatedObjectComposition(twelve, { slotLevel: 5 }).valid, false);
  assert.equal(validateAnimatedObjectComposition(twelve, { slotLevel: 6 }).valid, true);
  assert.equal(expandAnimatedObjectComposition(twelve, { slotLevel: 5 }).length, 0);
  assert.equal(expandAnimatedObjectComposition(twelve, { slotLevel: 6 }).length, 3);

  const contract = contractOf("animate-objects", 6);
  const key = contract.presentation.composition.key;
  const session = createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 6, castContext: { [key]: twelve } });
  const view = buildUnifiedPanelViewModel({ contract, session, targetCandidates: [] });
  assert.equal(view.context.composition.maximumCost, 12);
});

// The decisions on the doubts of the lot (4/11): four labels become real defenses, and Hallow's ticks count.
const resistancesOf = (effect) => damageDefensesForItem({
  id: "creature",
  metadata: { [META]: { conditions: { instances: [{ id: "effect", active: true, mechanics: effect.mechanics }] } } },
}, META).resistances;
const zoneEffect = (ruleId, effectId) => getSpellAreaRuleById(ruleId).effectPolicy.effects.find((effect) => effect.id === effectId);
const castEffect = (spellId, effectId) => getSpellEffects(spellId).find((effect) => effect.id === effectId);
const defenseParts = (effect) => effectSummaryPartsFor(effect).filter((part) => part.id.startsWith("damage-defense-"));

test("Four protections are real resistances now, the ones the damage previews read", () => {
  assert.deepEqual(resistancesOf(zoneEffect("phb2014-aura-di-purezza:cast", "aura-of-purity-zone")), ["poison"]);
  assert.deepEqual(resistancesOf(zoneEffect("phb2014-aura-di-vita:cast", "aura-of-life-zone")), ["necrotic"]);
  assert.deepEqual(resistancesOf(castEffect("tasha-fortezza-della-mente", "intellect-fortress")), ["psychic"]);
  const feignDeath = resistancesOf(castEffect("phb2014-morte-apparente", "feign-death-protections"));
  assert.equal(feignDeath.length, 12, "every damage type but one");
  assert.equal(feignDeath.includes("psychic"), false);
});

test("Each of them shows one micropill: no twin from the label, and no twelve for Feign Death", () => {
  assert.deepEqual(defenseParts(zoneEffect("phb2014-aura-di-purezza:cast", "aura-of-purity-zone")).map((part) => part.id), ["damage-defense-resistance-poison"]);
  assert.deepEqual(defenseParts(zoneEffect("phb2014-aura-di-vita:cast", "aura-of-life-zone")).map((part) => part.id), ["damage-defense-resistance-necrotic"]);
  assert.deepEqual(defenseParts(castEffect("tasha-fortezza-della-mente", "intellect-fortress")).map((part) => part.id), ["damage-defense-resistance-psychic"]);
  assert.deepEqual(defenseParts(castEffect("phb2014-morte-apparente", "feign-death-protections")).map((part) => [part.id, part.label]), [
    ["damage-defense-resistance-all-but-psychic", "Res. danni (no psichici)"],
  ]);
});

// The panel's command with a confirmed area and the real plan: "area" is who stands in it, targetIds who stays ticked.
async function hallowPlan(targetIds, area = ["caster", "mira", "sera", "goblin"]) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "hallow", phase: "cast", castContext: { slotLevel: 5 }, choiceValue: "fear" });
  const uniqueCreatures = [...new Set(["caster", ...area])];
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "hallow",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 5,
    choiceValue: "fear",
    targetIds,
    candidateTargetIds: uniqueCreatures,
    placement: {
      status: "confirmed",
      spellId: "hallow",
      ruleId: "hallow:cast",
      casterId: "caster",
      sceneEpoch: 3,
      ruleChoice: "fear",
      preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: area, targetLocked: true },
    },
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  const items = uniqueCreatures.map((id) => ({
    id,
    name: id,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: { [TRACKER_META]: { hp: 30, hpMax: 30, inInitiative: true } },
  }));
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "hallow-instance",
  });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const zone = plan.nextStaticZoneItems.map((item) => item.metadata?.[STATIC_ZONE_KEY]).find(Boolean);
  const frightened = plan.effectOperations
    .filter((operation) => operation.type === "condition:add" && operation.conditionName === "Spaventato")
    .flatMap((operation) => operation.targetIds);
  return { command, zone, frightened };
}

test("Hallow: the creatures of the area first, the caster in the list but not ticked", () => {
  const rule = getSpellAreaRuleById("hallow:cast");
  assert.equal(rule.targeting.selectionMode, "area-subset");
  assert.equal(rule.targeting.preselect, "others", "the sides are not the point: everyone but the caster");
  assert.equal(rule.targeting.includeCaster, true, "so the caster's row can be ticked, and the zone knows who stands in it");
  assert.equal(rule.zonePolicy.unselectedStayOut, true);
  assert.deepEqual(validateSpellAreaRule(rule).errors, []);
  assert.equal(getSpellAreaRuleById("fireball:cast").zonePolicy, undefined);
});

test("Hallow: who stays unticked at the cast is out of the zone, the caster too", async () => {
  const { zone, frightened, command } = await hallowPlan(["sera", "goblin"]);
  assert.deepEqual(command.targeting.targetIds, ["sera", "goblin"]);
  assert.deepEqual([...frightened].sort(), ["goblin", "sera"]);
  assert.deepEqual([...zone.exemptCreatureIds].sort(), ["caster", "mira"]);
  assert.deepEqual([...zone.targetIds].sort(), ["goblin", "sera"]);
});

test("Hallow: the caster ticked is in, already a member at the cast: no false entry on the first reconcile", async () => {
  const { zone, frightened } = await hallowPlan(["caster", "mira", "sera", "goblin"]);
  assert.deepEqual([...frightened].sort(), ["caster", "goblin", "mira", "sera"]);
  assert.equal(zone.exemptCreatureIds, undefined);
  assert.equal(zone.targetIds.includes("caster"), true, "the triggers' baseline is this list");
});

test("Hallow: the caster outside the area and not ticked stays out when walking in later", async () => {
  const { zone, frightened } = await hallowPlan(["mira"], ["mira", "sera"]);
  assert.deepEqual(frightened, ["mira"]);
  assert.deepEqual([...zone.exemptCreatureIds].sort(), ["caster", "sera"]);
});

test("Hallow: with nobody ticked the zone is still there, for who comes in later", async () => {
  const { zone, frightened } = await hallowPlan([]);
  assert.deepEqual(frightened, []);
  assert.deepEqual([...zone.exemptCreatureIds].sort(), ["caster", "goblin", "mira", "sera"]);
  assert.deepEqual(
    scopedStaticSpellZoneTargetIds({ zoneMetadata: zone, targetIds: ["caster", "mira", "newcomer"] }),
    ["newcomer"],
    "who arrives after the cast is in, who was left out stays out",
  );
});

test("Modifica bersagli: a creature unticked leaves the command, on a plain area too", () => {
  const contract = contractOf("fireball", 3);
  const placement = {
    status: "confirmed",
    state: "confirmed",
    confirmed: true,
    targetLocked: true,
    spellId: "fireball",
    ruleId: "fireball:cast",
    casterId: "wizard",
    preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: ["a", "b"], targetLocked: true },
  };
  const targetsOf = (targetIds, runtime) => {
    const session = updateSpellPanelSession(createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 3 }), { targetIds, placement: runtime });
    return buildSpellUnifiedAreaCommand({ contract, session, source: { sceneEpoch: 1 }, candidateTargetIds: ["a", "b", "c"] }).targeting.targetIds;
  };
  assert.deepEqual(targetsOf(["a", "b"], placement), ["a", "b"], "until the GM edits it, the area's own list");
  const edited = { ...placement, targetLocked: false, targetsEdited: true };
  assert.deepEqual(targetsOf(["a"], edited), ["a"], "the unticked one does not come back from the area");
  assert.deepEqual(targetsOf(["a", "c"], edited), ["a", "c"], "and one from outside it comes in");
});
