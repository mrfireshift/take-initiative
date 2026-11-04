// Lotto P3 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the 2014 texts next to the engine has found, lot by lot.
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellSweep, sweepCatalog } = await import("../test-support/spellSweepHarness.js");
const {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  withAssumedSaveOutcomes,
} = await import("../src/spellUnifiedPanelCore.js");
const {
  buildSpellUnifiedPanelRouteQuery,
  routeSpellUnifiedPanelOpenRequest,
} = await import("../src/spellUnifiedPanelRoutingCore.js");
const {
  buildQuickActionSpellLaunchPlan,
  getQuickActionDirectSaveEligibility,
} = await import("../src/quickActionSpellExecutionCore.js");
const { QUICK_ACTION_VERSION, sanitizeQuickAction } = await import("../src/quickActionsCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { spellCastHealingFormula, spellCastHpPoolFormula } = await import("../src/spellCastResolutionRules.js");
const {
  spellCastTemporaryHpAmount,
  spellCastTemporaryHpHint,
  spellCastTemporaryHpRollRange,
  spellCastTemporaryHpRule,
} = await import("../src/spellTemporaryHpRules.js");
const {
  getSpellAreaPlacementChoices,
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
  getSpellAreaRules,
} = await import("../src/spellAreaRules.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { broadcastEffectSaveDamageNotices } = await import("../src/concentrationSaveReminder.js");
const { getAreaSaveAutomation, getSpellAttackResolution } = await import("../src/spells-srd.js");
const { readFileSync } = await import("node:fs");
const { buildZoneTriggerReminderResolution } = await import("../src/reminderResolutionCore.js");
const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");

// Decision D6: the panel asks the outcome of the save; a passed save leaves nothing on the scene, as for Hold Person.
const D6_SPELLS = [
  ["animal-friendship", "wis"],
  ["bestow-curse", "wis"],
  ["charm-person", "wis"],
  ["dominate-beast", "wis"],
  ["dominate-monster", "wis"],
  ["dominate-person", "wis"],
  ["enthrall", "wis"],
  ["geas", "wis"],
  ["hideous-laughter", "wis"],
  ["imprisonment", "wis"],
  ["mass-suggestion", "wis"],
  ["modify-memory", "wis"],
  ["phantasmal-killer", "wis"],
  ["planar-binding", "cha"],
  ["suggestion", "wis"],
  ["xanathar-charme-sui-mostri", "wis"],
  ["xanathar-incuti-paura", "wis"],
  ["xanathar-nemici-in-abbondanza", "int"],
  ["xanathar-vincolo-della-terra", "str"],
  ["phb2014-corona-di-follia", "wis"],
  ["phb2014-duello-obbligato", "wis"],
];
const d6Records = await runSpellSweep({ spellIds: D6_SPELLS.map(([spellId]) => spellId) });

const castContract = (spellId, slotLevel) => buildSpellUnifiedPanelContract({
  spellId,
  phase: "cast",
  castContext: { slotLevel },
});

const triggersOf = (spellId) => getSpellAreaRules(spellId)
  .flatMap((rule) => [...(rule.zonePolicy?.triggers || []), ...(rule.triggerPolicy?.triggers || [])]);

// Lot 1: these spells keep a workflow for their targets, with a placeholder ability: they ask for no save.
for (const spellId of [
  "dispel-magic",
  "heal",
  "lesser-restoration",
  "magic-missile",
  "power-word-kill",
  "raise-dead",
  "reincarnate",
  "resurrection",
  "revivify",
  "spare-the-dying",
  "true-resurrection",
  "phb2014-parola-del-potere-guarire",
]) {
  test(`${spellId}: the panel names no saving throw, its text has none`, () => {
    const level = getSpellDefinition(spellId).level;
    assert.equal(castContract(spellId, level || null).presentation.outcomes.save, undefined);
  });
}

test("Telekinesi resolves a contest: it keeps its outcomes, and no saving throw is named", () => {
  const { presentation } = castContract("telekinesis", 5);
  assert.equal(presentation.outcomes.save, undefined);
  assert.deepEqual(presentation.outcomes.options.map((option) => option.label), ["Contesa vinta", "Contesa persa"]);
});

test("the saves the workflows really ask for are still named", () => {
  for (const [spellId, slot, ability] of [
    ["hold-person", 2, "wis"],
    ["eyebite", 6, "wis"],
    ["banishment", 4, "cha"],
    ["disintegrate", 6, "dex"],
  ]) {
    assert.equal(castContract(spellId, slot).presentation.outcomes.save?.ability, ability, spellId);
  }
});

test("no zone reminder asks for a save without naming it", () => {
  const silent = [...new Set(sweepCatalog()
    .flatMap((spell) => triggersOf(spell.id))
    .filter((trigger) => trigger.resolution === "manual-save" && !trigger.ability)
    .map((trigger) => trigger.id))];
  assert.deepEqual(silent, []);
});

test("Nube maleodorante: the reminder asks for Constitution, and who fails loses the action on the card", () => {
  const [trigger] = triggersOf("stinking-cloud");
  assert.equal(trigger.ability, "con");
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      ...trigger,
      id: "cloud-failure",
      instanceId: "cloud-a",
      ruleId: "stinking-cloud:cast",
      spellId: "stinking-cloud",
      casterId: "caster",
      triggerId: trigger.id,
      zoneItemId: "zone-a",
      targetIds: ["target"],
      turnKey: "1:1:target",
      noticeTurnKey: "1:1:target",
    },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  const applied = resolution.outcomes.failed.actions
    .filter((action) => action.kind === "condition" && action.action === "apply");
  assert.deepEqual(applied.map((action) => action.name), ["Conati: azione persa"]);
});

test("Folata di Vento: the reminder asks for Strength", () => {
  const [trigger] = triggersOf("gust-of-wind");
  assert.equal(trigger.ability, "str");
});

test("Silenzio: who is inside is deafened and immune to thunder, on the card and for the damage", async () => {
  const [record] = await runSpellSweep({ spellIds: ["silence"] });
  assert.ok(record.conditions.some((condition) => condition.item === "target-1" && condition.name === "Assordato"));
  const [effect] = getSpellAreaRules("silence")[0].zonePolicy.membershipEffects;
  assert.deepEqual(effect.mechanics.damageDefenses.immunities, ["thunder"]);
  assert.match(effect.detail, /componente verbale/u);
  assert.deepEqual(
    effectSummaryPartsFor({ condition: effect.condition, mechanics: effect.mechanics }).map((part) => part.label),
    ["Imm. tuono"],
  );
});

test("Tocco gelido says what it does to an undead, which stays at the table", () => {
  assert.match(getSpellDefinition("chill-touch").effects[0].detail, /non morto/u);
});

test("the heals propose their dice with the slot, and the modifier stays the caster's", () => {
  for (const [spellId, slot, formula] of [
    ["cure-wounds", 1, "1d8 + mod"],
    ["cure-wounds", 3, "3d8 + mod"],
    ["healing-word", 2, "2d4 + mod"],
    ["mass-healing-word", 3, "1d4 + mod"],
    ["mass-healing-word", 5, "3d4 + mod"],
    ["mass-cure-wounds", 6, "4d8 + mod"],
    ["prayer-of-healing", 3, "3d8 + mod"],
  ]) {
    assert.equal(spellCastHealingFormula(spellId, slot), formula, `${spellId} al ${slot}°`);
    const contract = castContract(spellId, slot);
    const session = createSpellPanelSession({ contract, casterId: "caster", slotLevel: slot, targetIds: ["one"] });
    const field = buildUnifiedPanelViewModel({
      contract,
      session,
      casterOptions: [{ value: "caster", label: "Maga" }],
      targetCandidates: [{ key: "one", label: "Uno" }],
    }).effects.fields.find((candidate) => candidate.id === "healing");
    assert.equal(field.label, `Cura · ${formula}`);
  }
  assert.equal(spellCastHealingFormula("fireball", 3), "");
});

const quickAction = (spellId, launchMode = "auto") => sanitizeQuickAction({
  version: QUICK_ACTION_VERSION,
  id: `quick-${spellId}`,
  label: spellId,
  kind: "spell",
  spellId,
  targetMode: "selection",
  slotLevel: null,
  turns: null,
  applyAutomations: true,
  launchMode,
  cost: "free",
});

// Decision D6: the panel asks the outcome of the save, and a passed save leaves nothing.
for (const [spellId, ability] of D6_SPELLS) {
  test(`${spellId}: the panel asks the outcome of its save, and a passed save leaves nothing`, () => {
    const level = getSpellDefinition(spellId).level;
    const { presentation, execution } = castContract(spellId, level);
    assert.equal(execution.lane, "area-transaction");
    assert.equal(presentation.inputs.outcomes.required, true);
    assert.equal(presentation.outcomes.save.ability, ability);
    const failed = d6Records.filter((record) => record.id === spellId && record.outcome === "failed");
    const passed = d6Records.filter((record) => record.id === spellId && record.outcome === "passed");
    assert.ok(failed.length > 0 && failed.length === passed.length);
    for (const record of failed) {
      assert.equal(record.status, "applied", record.variant);
      assert.ok(record.pills.some((pill) => pill.item === "target-1"), `${record.variant}: the pill of who failed`);
      assert.equal(record.undoRestores, true, record.variant);
      assert.deepEqual(record.terminated.left, [], record.variant);
    }
    for (const record of passed) {
      assert.deepEqual(record.pills, [], record.variant);
      assert.deepEqual(record.conditions, [], record.variant);
      assert.deepEqual(record.concentrating, [], record.variant);
    }
  });
}

test("the quick launch applies them at once, the save taken as failed: only a choice of variant opens the panel", () => {
  for (const [spellId] of D6_SPELLS) {
    const plan = buildQuickActionSpellLaunchPlan({ action: quickAction(spellId), sourceId: "caster", selectedTargetIds: ["target"] });
    if (spellId === "bestow-curse") {
      assert.equal(plan.mode, "review", spellId);
      continue;
    }
    assert.equal(plan.mode, "direct", spellId);
    assert.equal(plan.initialSaveOutcome, "failed", spellId);
    assert.deepEqual(plan.session.outcomes, { target: "failed" }, spellId);
  }
});

test("Allucinazione mortale stays immediate: its damage comes from the reminder, the cast asks none", () => {
  const contract = castContract("phantasmal-killer", 4);
  assert.equal(contract.execution.castHasHP, false);
  assert.equal(getQuickActionDirectSaveEligibility({ contract, targetIds: ["target"] }).eligible, true);
  // A spell whose cast takes damage still opens the panel.
  assert.equal(getQuickActionDirectSaveEligibility({ contract: castContract("blight", 4), targetIds: ["target"] }).eligible, false);
});

test("the duration by slot reaches the pill on the save workflow", async () => {
  const pillOf = async (spellId, slot) => {
    const records = await runSpellSweep({ spellIds: [spellId], slotFor: () => slot });
    return records.find((record) => record.outcome === "failed");
  };
  assert.equal((await pillOf("dominate-person", 7)).pills[0].turns, 600);
  assert.equal((await pillOf("dominate-beast", 6)).pills[0].turns, 600);
  assert.equal((await pillOf("dominate-monster", 9)).pills[0].turns, 4800);
  const curseFive = await pillOf("bestow-curse", 5);
  assert.equal(curseFive.pills[0].turns, 4800);
  assert.deepEqual(curseFive.concentrating, [], "from the 5th level, no concentration");
  const curseNine = await pillOf("bestow-curse", 9);
  assert.equal(curseNine.pills[0].expiry, "manual", "at the 9th level, until dispelled");
});

test("Imprigionare lasts until it is dispelled", () => {
  const failed = d6Records.find((record) => record.id === "imprisonment" && record.outcome === "failed");
  assert.equal(failed.pills[0].expiry, "manual");
});

test("a save only for the unwilling asks no outcome, and says it", () => {
  for (const spellId of ["enlarge-reduce", "levitate", "polymorph", "true-polymorph", "xanathar-metamorfosi-di-massa", "resilient-sphere", "seeming"]) {
    const { presentation } = castContract(spellId, getSpellDefinition(spellId).level);
    assert.equal(presentation.outcomes.save.onlyIfUnwilling, true, spellId);
    assert.notEqual(presentation.inputs.outcomes?.required, true, spellId);
  }
  assert.equal(castContract("charm-person", 1).presentation.outcomes.save.onlyIfUnwilling, undefined);
});

// The quick launch that must open the panel: every target starts as failed.
test("withAssumedSaveOutcomes fills the targets without an outcome, and never overwrites a choice", () => {
  const contract = castContract("fireball", 3);
  const session = { targetIds: ["a", "b", "c"], outcomes: { b: "passed" } };
  assert.deepEqual(withAssumedSaveOutcomes(session, contract, "failed").outcomes, { a: "failed", b: "passed", c: "failed" });
  assert.equal(withAssumedSaveOutcomes(session, contract, ""), session, "not from a quick launch: the panel asks each one");
  const full = { targetIds: ["a"], outcomes: { a: "passed" } };
  assert.equal(withAssumedSaveOutcomes(full, contract, "failed"), full);
  const healing = { targetIds: ["a"], outcomes: {} };
  assert.equal(withAssumedSaveOutcomes(healing, castContract("cure-wounds", 1), "failed"), healing, "no save to assume");
});

test("only the quick launch asks for it: the panel opened by hand or with the gear asks each outcome", () => {
  const auto = buildQuickActionSpellLaunchPlan({ action: quickAction("fireball"), sourceId: "caster", selectedTargetIds: ["target"] });
  assert.equal(auto.mode, "review");
  assert.equal(auto.route.request.assumedSaveOutcome, "failed");
  const review = buildQuickActionSpellLaunchPlan({ action: quickAction("fireball", "review"), sourceId: "caster", selectedTargetIds: ["target"] });
  assert.equal(review.route.request.assumedSaveOutcome, undefined);
  const byHand = routeSpellUnifiedPanelOpenRequest({ spellId: "fireball", casterId: "caster" });
  assert.equal(byHand.assumedSaveOutcome, "");
});

test("the outcome goes through the panel's address", () => {
  const query = buildSpellUnifiedPanelRouteQuery({ spellId: "fireball", casterId: "caster", assumedSaveOutcome: "failed" });
  assert.equal(query.get("assumedSaveOutcome"), "failed");
  assert.equal(routeSpellUnifiedPanelOpenRequest(Object.fromEntries(query.entries())).assumedSaveOutcome, "failed");
  // Nothing but "failed": a wrong address cannot make every target pass.
  assert.equal(routeSpellUnifiedPanelOpenRequest({ spellId: "fireball", assumedSaveOutcome: "passed" }).assumedSaveOutcome, "");
});

test("the panel says the targets start as failed, only when they do", () => {
  const contract = castContract("fireball", 3);
  const session = createSpellPanelSession({ contract, casterId: "caster", slotLevel: 3, targetIds: ["one"] });
  const view = (assumedSaveOutcome) => buildUnifiedPanelViewModel({
    contract,
    session,
    casterOptions: [{ value: "caster", label: "Maga" }],
    targetCandidates: [{ key: "one", label: "Uno" }],
    assumedSaveOutcome,
  }).targets.outcomes.assumedFailed;
  assert.equal(view("failed"), true);
  assert.equal(view(""), false);
});


// Lot 2: reading the text next to what happens at the bench, with the real background service.
const triggerById = (spellId, id) => triggersOf(spellId).find((trigger) => trigger.id === id);

test("Lot 2: Acid Splash takes one creature or two", () => {
  assert.equal(getSpellDefinition("acid-splash").targeting.maximum, 2);
});

test("Lot 2: Fog Cloud grows 6 m per slot above the 1st, and only by its slot", () => {
  const radius = (slotLevel) => getSpellAreaRuleForPlacement("fog-cloud:cast", "", { slotLevel }).geometry.size.value;
  assert.deepEqual([radius(1), radius(2), radius(3)], [6, 12, 18]);
});

test("Lot 2: the shapes of the text: Guardian of Faith, Flaming Sphere and who counts as inside", () => {
  assert.equal(getSpellAreaRuleById("guardian-of-faith:cast").geometry.size.value, 4.5);
  const sphere = getSpellAreaRuleById("flaming-sphere:cast");
  assert.deepEqual([sphere.geometry.shape, sphere.geometry.size.value, sphere.zonePolicy.membershipPaddingSquares], ["square", 1.5, 1]);
  for (const spellId of ["silence", "stinking-cloud"]) {
    assert.equal(getSpellAreaRuleById(`${spellId}:cast`).zonePolicy.membershipTargeting.containment, "fully-inside", spellId);
  }
  assert.equal(getSpellAreaRuleById("moonbeam:cast").zonePolicy.membershipTargeting.containment, undefined);
});

test("Lot 2: Blade Barrier and Wall of Thorns also have the ring of their text", () => {
  for (const [spellId, radius, inner] of [["blade-barrier", 9, 7.5], ["wall-of-thorns", 3, 1.5]]) {
    assert.deepEqual(getSpellAreaPlacementChoices(spellId).map((choice) => choice.value), ["line", "ring"], spellId);
    const ring = getSpellAreaRuleForPlacement(`${spellId}:cast`, "ring").geometry;
    assert.deepEqual([ring.shape, ring.ring, ring.size.value, ring.innerSize.value], ["circle", true, radius, inner], spellId);
    assert.equal(getSpellAreaRuleForPlacement(`${spellId}:cast`, "line").geometry.shape, "line", spellId);
  }
});

test("Lot 2: Blade Barrier has no higher levels in its text", () => {
  assert.equal(triggersOf("blade-barrier").some((trigger) => /per slot/.test(trigger.failureEffect || "")), false);
});

test("Lot 2: Moonbeam asks its save the first time on any turn, Web only during the creature's own", () => {
  assert.equal(triggerById("moonbeam", "moonbeam-save-on-entry").requiresOwnTurn, false);
  assert.equal(triggerById("web", "web-save-on-entry").requiresOwnTurn, true);
});

test("Lot 2: Zone of Truth asks a Charisma save on entry and at the start of the turn; who failed keeps the label while inside", () => {
  for (const [id, event] of [["zone-of-truth-save-on-entry", "enter"], ["zone-of-truth-save-on-turn-start", "turn-start"]]) {
    const trigger = triggerById("zone-of-truth", id);
    assert.equal(trigger.event, event);
    assert.equal(trigger.resolution, "manual-save");
    assert.equal(trigger.resolutionData.ability, "cha");
    assert.equal(trigger.resolutionData.failureCondition.condition, "Zona di Verità: non può mentire");
    assert.deepEqual(trigger.skipLinkedConditions, ["Zona di Verità: non può mentire"]);
    assert.equal(trigger.removeLinkedConditionOnLeave, true);
  }
});

test("Lot 2: Cloudkill reminds the 3 m it drifts, to its caster and at the start of its turn", () => {
  const drift = triggerById("cloudkill", "cloudkill-drift-on-source-turn-start");
  assert.deepEqual([drift.event, drift.resolution, drift.targetMode, drift.requiresSourceTurn], ["turn-start", "informational", "caster", true]);
});

test("Lot 2: the Prone of Grease and Earthquake outlives the spell, as Sleet Storm's", () => {
  for (const [spellId, id] of [
    ["grease", "grease-save-on-entry"],
    ["grease", "grease-save-on-turn-end"],
    ["earthquake", "earthquake-ground-save-on-source-turn-end"],
    ["sleet-storm", "sleet-storm-save-on-entry"],
  ]) {
    const failure = triggerById(spellId, id).resolutionData.failureCondition;
    assert.deepEqual([failure.condition, failure.options.parentEffectId], ["Prono", ""], id);
  }
});

test("Lot 2: the delayed acid does not run out on the turn end that asks for it, and it is applied from its reminder", () => {
  const acid = getSpellAttackResolution(getSpellDefinition("acid-arrow"), "hit", { slotLevel: 3 });
  assert.deepEqual(acid.effect.expiry, { mode: "manual" });
  assert.deepEqual(acid.effect.deferredEffect.resolution, { mode: "manual-damage", damage: { dice: "3d4", type: "acido" } });
  const delayed = getAreaSaveAutomation(getSpellDefinition("xanathar-sfera-al-vetriolo")).failed
    .find((entry) => entry.condition === "Acido ritardato: 5d4 a fine turno");
  assert.deepEqual(delayed.expiry, { mode: "manual" });
  assert.equal(delayed.deferredEffect.resolution.mode, "manual-damage");
});

test("Lot 2: a miss follows the attack's outcome: the effects of a hit stay out of it", () => {
  const source = readFileSync(new URL("../src/spellAreaResolutionExecutor.js", import.meta.url), "utf8");
  assert.match(source, /getSpellAttackResolution\(\s*spell,\s*text\(command\?\.outcomes\?\.attack\) \|\| text\(command\?\.spell\?\.choiceValue\)/);
  assert.equal(getSpellAttackResolution(getSpellDefinition("acid-arrow"), "miss", { slotLevel: 3 }).effect, undefined);
  assert.equal(getSpellAttackResolution(getSpellDefinition("guiding-bolt"), "miss", { slotLevel: 1 }).effect, undefined);
});

test("Lot 2: the pill of a zone lasts what its slot says", () => {
  const source = readFileSync(new URL("../src/spellAreaResolutionExecutor.js", import.meta.url), "utf8");
  assert.match(source, /turns: getSpellDurationTurns\(spell, command\?\.spell\?\.castContext\),/);
  const spell = getSpellDefinition("magic-circle");
  assert.equal(spell.durationBySlot.turnsBySlot[4], 1200);
});

test("Lot 2: a zone's concentration has no targets: only breaking it ends the spell, which is what the x on its pill now does", () => {
  const instanceId = "zone-1";
  const states = () => [{
    id: "caster",
    name: "Caster",
    conditions: [],
    spells: [{ id: "pill", name: "Nube", spellId: "stinking-cloud", instanceId, casterId: "caster", turns: 10, conc: true, castContext: { staticZoneOwner: true } }],
    concentrations: { nube: { name: "Nube", spellId: "stinking-cloud", instanceId, targets: [] } },
  }];
  const byTargets = buildEffectsMutationPlan(states(), [{
    type: "concentration:break-targets", casterIds: ["caster"], reference: instanceId, targetIds: ["caster"],
  }]);
  assert.deepEqual(Object.keys(byTargets.states[0].concentrations), ["nube"], "the old road left the concentration in place");
  const broken = buildEffectsMutationPlan(states(), [{ type: "concentration:break", casterIds: ["caster"], reference: instanceId }]);
  assert.deepEqual(broken.states[0].concentrations, {});
  assert.deepEqual(broken.states[0].spells, []);
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("async function __terminateSpellOnTrackerCard("), source.indexOf("async function __terminateClassFeatureOnTrackerCard("));
  assert.match(block, /staticZoneOwner === true\s*\? \{\s*type: "concentration:break"/);
  assert.match(readFileSync(new URL("../src/spells.js", import.meta.url), "utf8"), /staticZoneOwner === true \|\| spell\?\.castContext\?\.mobileAura === true/);
});

test("Lot 2: damage from the spell panel and from a zone's reminder asks the saves of Dominate and Hideous Laughter", async () => {
  const META = "com.thebigpicture.initiative/meta";
  const item = {
    id: "target",
    name: "Bersaglio",
    metadata: { [META]: { conditions: [{
      id: "charm",
      condition: "Affascinato",
      active: true,
      sourceId: "caster",
      spellName: "Dominare Persone",
      saveReminder: { ability: "wis", timing: "damage", actor: "target", success: "remove-effect", dcSource: "source-spell", label: "Se supera il TS, termina Dominare Persone." },
    }] } },
  };
  const caster = { id: "caster", name: "Caster", metadata: { [META]: {} } };
  const sent = [];
  const notices = await broadcastEffectSaveDamageNotices([{ itemId: "target", damage: 6 }], {
    eventId: "event-1",
    getItems: async (ids) => [item, caster].filter((entry) => ids.includes(entry.id)),
    send: async (channel, payload) => sent.push({ channel, payload }),
  });
  assert.equal(notices.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.type, "show-effect-save-notices");
  assert.equal(sent[0].payload.notices[0].timing, "damage");
  // No damage, no notice.
  assert.deepEqual(await broadcastEffectSaveDamageNotices([{ itemId: "target", damage: 0 }], {
    getItems: async () => { throw new Error("never read"); },
    send: async () => { throw new Error("never sent"); },
  }), []);
  for (const [path, call] of [
    ["../src/spellAreaResolutionExecutor.js", /broadcastEffectSaveDamageNotices\(changes,/],
    ["../src/reminderResolution.js", /broadcastEffectSaveDamageNotices\(\[\{\s*itemId: plan\.targetId,/],
  ]) {
    assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), call, path);
  }
});

test("Lot 2: a zone's trigger answered from its notice spends the counter of its spell, and at zero the zone goes", async () => {
  const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
  const META = "com.thebigpicture.initiative/meta";
  const ZONE = "com.thebigpicture.initiative/spellStaticZone";
  const SPELLS = "com.thebigpicture.initiative/spells";
  const plan = (remaining, damageRoll, outcome = "failed") => buildReminderResolutionPlan({
    notice: {
      activationId: "activation-1",
      spellId: "guardian-of-faith",
      spellName: "Guardiano della fede",
      targets: [{ id: "goblin", name: "Goblin" }],
      resolution: {
        save: { ability: "dex", dc: 15 },
        damage: { dice: "20", type: "radiosi", onSave: "half" },
        target: { id: "goblin" },
        source: { id: "caster" },
        activation: { kind: "zone", activationId: "activation-1", instanceId: "guardian-1", zoneItemId: "zone", metadataKey: ZONE, spellId: "guardian-of-faith" },
      },
    },
    items: [
      { id: "goblin", name: "Goblin", metadata: { [META]: { hp: 70, hpMax: 70 } } },
      { id: "caster", name: "Dars", metadata: { [META]: { [SPELLS]: [{
        id: "pill", name: "Guardiano della fede", spellId: "guardian-of-faith", instanceId: "guardian-1", casterId: "caster", turns: 4800,
        castContext: { staticZoneOwner: true, uses: { key: "damage", label: "danni", total: 60, remaining } },
      }] } } },
      { id: "zone", name: "Zona", metadata: { [ZONE]: { instanceId: "guardian-1", triggerRuntime: { pending: [{ id: "activation-1", targetIds: ["goblin"] }] } } } },
    ],
    outcome,
    damageRoll,
  });
  const hit = plan(60, 20);
  assert.equal(hit.status, "ready", hit.message);
  assert.match(hit.zoneResourceNote, /40\/60/);
  assert.equal(hit.sideEffects.some((effect) => effect.type === "static-zone:remove-ended"), false);
  const halved = plan(60, 20, "passed");
  assert.match(halved.zoneResourceNote, /50\/60/);
  const last = plan(20, 20);
  assert.match(last.zoneResourceNote, /svanisce/);
  assert.deepEqual(last.sideEffects.find((effect) => effect.type === "static-zone:remove-ended"), { type: "static-zone:remove-ended", selectors: [{ instanceId: "guardian-1" }] });
});

// The owner's decisions of 4/11 on the doubts of lot 2.
test("Decisions of lot 2: Heat Metal stays as it is, Hideous Laughter's Prone outlives the spell", () => {
  const laughter = getAreaSaveAutomation(getSpellDefinition("hideous-laughter")).failed;
  const prone = laughter.find((rule) => rule.condition === "Prono");
  assert.deepEqual([prone.options.parentEffectId, prone.expiry], ["", { mode: "manual" }]);
  assert.equal(laughter.find((rule) => rule.condition === "Incapacitato").expiry.mode, "concentration");
  const heat = getSpellDefinition("heat-metal").activeActions[0].postDamageEffects[0];
  assert.deepEqual(heat.deferredEffects[0].resolution.choiceLabels, { passed: "Lascia cadere", failed: "Non può / non lascia" });
});

test("Decisions of lot 2: Bear's Endurance asks its 2d6, the other variants of Enhance Ability ask nothing", () => {
  const contract = (choiceValue) => buildSpellUnifiedPanelContract({ spellId: "enhance-ability", phase: "cast", choiceValue, castContext: { slotLevel: 2 } });
  assert.deepEqual(contract("bears-endurance").presentation.inputs.temporaryHp, { required: true, visible: true, die: "2d6" });
  for (const choiceValue of ["", "fox-cunning", "bull-strength", "cats-grace", "owls-wisdom", "eagles-splendor"]) {
    assert.equal(contract(choiceValue).presentation.inputs.temporaryHp.required, false, choiceValue);
  }
  const rule = spellCastTemporaryHpRule("enhance-ability", "bears-endurance");
  assert.equal(rule.effectId, "constitution-check-advantage", "the pill whose end takes them away");
  assert.deepEqual(spellCastTemporaryHpRollRange("2d6"), { min: 2, max: 12 });
  assert.deepEqual([1, 2, 12, 13].map((roll) => spellCastTemporaryHpAmount(rule, { roll })), [null, 2, 12, null]);
  assert.equal(spellCastTemporaryHpHint(rule), "Tira 2d6: lo stesso tiro vale per ogni bersaglio.");
  // The other spells stay as they were.
  assert.equal(spellCastTemporaryHpRule("enhance-ability"), null);
  assert.deepEqual(spellCastTemporaryHpRollRange("1d4"), { min: 1, max: 4 });
  assert.equal(spellCastTemporaryHpAmount(spellCastTemporaryHpRule("false-life"), { slotLevel: 1, roll: 3 }), 7);
});

test("Decisions of lot 2: the panel proposes the pool of Sleep and Color Spray, which grows by slot", () => {
  assert.deepEqual([1, 2, 3].map((slot) => spellCastHpPoolFormula("sleep", slot)), ["5d8", "7d8", "9d8"]);
  assert.deepEqual([1, 2, 3].map((slot) => spellCastHpPoolFormula("color-spray", slot)), ["6d10", "8d10", "10d10"]);
  assert.equal(spellCastHpPoolFormula("fireball", 3), "");
  const view = buildUnifiedPanelViewModel({
    contract: castContract("sleep", 2),
    session: createSpellPanelSession({ contract: castContract("sleep", 2), casterId: "wizard", slotLevel: 2 }),
    targetCandidates: [],
  });
  assert.equal(view.targets.hpPool, "7d8");
});
