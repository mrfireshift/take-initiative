// CAP-TELEPORT (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, decisions D1–D7 of 6/11/2026). The expectations are read from the
// 2014 texts. Far Step: a teleport of up to 18 m at the cast and, on each of the caster's next turns, again as a bonus
// action, while the concentration lasts.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const STATE_KEY = "com.thebigpicture.initiative/state";

const items = new Map();
const mutationCalls = [];
const visualCalls = [];
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "cap-teleport-room", getMetadata: async () => ({}) },
      player: { getRole: async () => "GM" },
      scene: {
        getMetadata: async () => ({ [STATE_KEY]: { round: 2, current: 0, order: ["caster", "goblin"] } }),
        items: {
          getItems: async (ids) => (Array.isArray(ids)
            ? ids.map((id) => items.get(id)).filter(Boolean)
            : [...items.values()]).map(clone),
          getItemBounds: async () => ({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 }, center: { x: 50, y: 50 } }),
        },
        grid: {
          getDpi: async () => 100,
          getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
          snapPosition: async (position) => position,
        },
      },
      broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
    },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations, options });
      return { status: "applied", committed: true, changedIds: ["caster"], historyEntryId: "history-1", undoAvailable: true };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
    getEffectsMutationSceneContext: async () => ({ sceneIdentity: "scene-1" }),
  },
});

mock.module("../src/embersMatchedVisualRenderer.js", {
  exports: {
    emitMatchedSpellVisual: async (context) => { visualCalls.push(context); },
    emitMatchedClassFeatureVisual: async () => {},
    emitMatchedVisualEndsFromMutation: async () => {},
    mountEmbersMatchedVisualRenderer: () => {},
    unmountEmbersMatchedVisualRenderer: () => {},
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { getSpellTeleportRule, isTeleportSpell, spellTeleportActionSubject } = await import("../src/spellTeleportCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const {
  buildSpellActiveResolutionPayload,
  validateSpellActiveResolutionAction,
} = await import("../src/spellActiveResolutionCore.js");
const { getSpellActiveResolutionActions } = await import("../src/spellActiveResolutionRules.js");
const { validateSpellActiveResolutionCommit } = await import("../src/spellActiveResolutionValidation.js");
const { executeSpellActiveResolution } = await import("../src/spellApplicationExecutor.js");
const { FAR_STEP_TURN_PROMPT_ACTION_ID, spellTurnPromptRequests } = await import("../src/callLightningTurnPromptCore.js");

const FAR_STEP = "xanathar-passo-remoto";

function token(id, name, meta = {}, position = { x: 100, y: 100 }) {
  return { id, name, layer: "CHARACTER", position, metadata: { [META_KEY]: meta } };
}

function farStepEntry(turnKey = "1:0:caster") {
  return {
    spellId: FAR_STEP, instanceId: "far-1", casterId: "caster", casterName: "Maga", name: "Passo Remoto",
    conc: true, turns: 10, appliedAt: { round: 1, actorId: "caster", turnKey }, castContext: { slotLevel: 5 },
  };
}

function farStepScene(turnKey) {
  mutationCalls.length = 0;
  visualCalls.length = 0;
  items.clear();
  const entry = farStepEntry(turnKey);
  items.set("caster", token("caster", "Maga", {
    [SPELLS_KEY]: [entry],
    [CONCENTRATION_KEY]: { "far-1": { ...entry, targets: ["caster"] } },
  }));
  items.set("goblin", token("goblin", "Goblin", {}, { x: 300, y: 100 }));
  return entry;
}

function farStepPayload() {
  const entry = farStepScene();
  const spell = getSpellDefinition(FAR_STEP);
  return buildSpellActiveResolutionPayload({
    spell,
    action: getSpellActiveResolutionActions(FAR_STEP)[0],
    group: { ...entry },
    sceneEpoch: 3,
    turnKey: "2:0:caster",
  });
}

test("Far Step: a teleport like Misty Step within 18 m, without a passenger, and its pill repeats it", () => {
  assert.equal(isTeleportSpell(FAR_STEP), true);
  assert.deepEqual(getSpellTeleportRule(FAR_STEP), { spellId: FAR_STEP, rangeMeters: 18, allowPassenger: false });
  const cast = getSpellAreaRuleById(`${FAR_STEP}:cast`);
  assert.equal(cast.placement.mode, "point");
  assert.equal(cast.placement.range.value, 18);
  const again = getSpellAreaRuleById(`${FAR_STEP}:teleport`);
  assert.deepEqual(again.trigger, { type: "active-action", actionId: "far-step-teleport" });
  assert.equal(again.placement.mode, "point");
  assert.equal(again.placement.range.value, 18, "the same 18 m as the cast, from the caster");
  const [action] = getSpellActiveResolutionActions(FAR_STEP);
  assert.equal(action.id, FAR_STEP_TURN_PROMPT_ACTION_ID);
  assert.equal(action.resolutionKind, "teleport");
  assert.equal(action.economy, "bonus-action");
  assert.equal(spellTeleportActionSubject(action), "caster");
  assert.equal(action.teleport.animated, true, "in the mist, like the cast");
  assert.deepEqual(validateSpellActiveResolutionAction(action), { valid: true, errors: [] });
  assert.equal(validateSpellActiveResolutionAction({ ...action, teleport: { subject: "someone" } }).valid, false);
  assert.equal(validateSpellActiveResolutionAction({ ...action, placementRuleId: "" }).valid, false);
});

test("The caster's later turns offer the teleport; the cast's turn does not, its bonus action cast the spell", () => {
  farStepScene("1:0:caster");
  const scene = [...items.values()];
  assert.deepEqual(spellTurnPromptRequests({ items: scene, actorId: "caster", sceneEpoch: 3, turnKey: "1:0:caster" }), []);
  const later = spellTurnPromptRequests({ items: scene, actorId: "caster", sceneEpoch: 3, turnKey: "2:0:caster" });
  assert.equal(later.length, 1);
  assert.equal(later[0].payload.spellId, FAR_STEP);
  assert.equal(later[0].payload.actionId, "far-step-teleport");
  assert.deepEqual(spellTurnPromptRequests({ items: scene, actorId: "goblin", sceneEpoch: 3, turnKey: "2:0:goblin" }), [],
    "only the caster's turn");
});

test("Teletrasportati moves the caster alone, to the cell chosen", async () => {
  const payload = farStepPayload();
  const placement = { position: { x: 900, y: 300 } };
  const ok = await validateSpellActiveResolutionCommit({ payload, placement, targetIds: ["caster"] });
  assert.deepEqual(ok.errors, []);
  const other = await validateSpellActiveResolutionCommit({ payload, placement, targetIds: ["goblin"] });
  assert.ok(other.errors.includes("teleport-target-invalid"), "Far Step moves its caster, never a creature selected");
  const nowhere = await validateSpellActiveResolutionCommit({ payload, placement: null, targetIds: ["caster"] });
  assert.ok(nowhere.errors.includes("teleport-position-required"));
});

test("One History entry with the move only: the token vanishes in the mist and appears on the cell", async () => {
  const payload = farStepPayload();
  const result = await executeSpellActiveResolution({
    payload,
    placement: { position: { x: 900, y: 300 } },
    targetIds: ["caster"],
    sceneEpoch: 3,
    commandId: "far-step-cmd",
    isCurrent: () => true,
  });
  assert.equal(result.undoAvailable, true);
  assert.equal(mutationCalls.length, 1);
  const [{ operations, options }] = mutationCalls;
  assert.deepEqual(operations, [], "no HP, no pill, no counter: the spell stays as it is");
  assert.deepEqual(options.sideEffects, [{
    type: "token:teleport",
    spellId: FAR_STEP,
    targetId: "caster",
    position: { x: 900, y: 300 },
    operationId: "far-step-cmd",
  }], "animated on the command's clock, like the cast");
  assert.equal(options.history.label, "Passo Remoto · teletrasporto");
  assert.equal(options.history.payload.causality.cause.spellId, FAR_STEP);
  assert.deepEqual(options.history.payload.causality.action, { id: "far-step-teleport", label: "Teletrasportati di nuovo" });
  assert.equal(visualCalls.length, 1);
  assert.equal(visualCalls[0].spellId, FAR_STEP);
  assert.deepEqual(visualCalls[0].preview.origin, { x: 100, y: 100 }, "the mist leaves from where the caster stands");
  assert.deepEqual(visualCalls[0].preview.destination, { x: 900, y: 300 });
});

// Thunder Step (lotto T2): the thunder is the area save around the space the caster leaves, as before; the caster
// teleports up to 27 m, with a willing creature next to it that the thunder leaves alone (D1), in one History entry (D2).
const THUNDER = "xanathar-passo-del-tuono";
const { getSpellTeleportStepRule } = await import("../src/spellTeleportCore.js");
const {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  updateSpellPanelSession,
} = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellUnifiedAreaCommand } = await import("../src/spellUnifiedAreaAdapter.js");
const { buildSpellAreaResolutionExecutionPlan, spellAreaCausality } = await import("../src/spellAreaResolutionExecutor.js");

const creature = (id, hp, position) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position,
  metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true } } });
const thunderScene = () => [
  creature("caster", 30, { x: 100, y: 100 }),
  creature("ally", 25, { x: 200, y: 100 }),
  creature("goblin", 20, { x: 100, y: 200 }),
];

function thunderSession(contract, patch = {}) {
  const ruleId = contract.presentation.placement.ruleId;
  return createSpellPanelSession({
    contract, casterId: "caster", slotLevel: 3, targetIds: ["goblin", "ally"],
    outcomes: { goblin: "failed", ally: "failed" },
    placement: { status: "confirmed", confirmed: true, state: "confirmed", ruleId, spellId: THUNDER, casterId: "caster",
      targetLocked: true, targetIds: ["goblin", "ally"],
      preview: { type: "circle", start: { x: 100, y: 100 }, end: { x: 300, y: 100 }, radius: 200,
        gridOrigin: { x: 0, y: 0 }, dpi: 100, targetIds: ["goblin", "ally"], targetLocked: true } },
    hpValues: { damage: 14 },
    ...patch,
  });
}

test("Thunder Step: its thunder stays the area around the caster, the teleport is a step of the cast within 27 m", () => {
  assert.equal(isTeleportSpell(THUNDER), false, "not a teleport spell: the targets stay the thunder's");
  const step = getSpellTeleportStepRule(THUNDER);
  assert.equal(step.rangeMeters, 27);
  assert.equal(step.passenger.adjacency, "grid-adjacent");
  assert.equal(step.excludePassengerFromArea, true);
  const thunder = getSpellAreaRuleById(`${THUNDER}:cast`);
  assert.equal(thunder.geometry.shape, "circle");
  assert.equal(thunder.placement.origin, "caster");
  const destination = getSpellAreaRuleById(step.destinationRuleId);
  assert.deepEqual(destination.trigger, { type: "teleport-step" });
  assert.equal(destination.placement.mode, "point");
  assert.equal(destination.placement.range.value, 27);
  const contract = buildSpellUnifiedPanelContract({ spellId: THUNDER, phase: "cast", castContext: { slotLevel: 3 } });
  assert.equal(contract.presentation.teleport, undefined);
  assert.equal(contract.presentation.teleportStep.destinationRuleId, step.destinationRuleId);
  assert.equal(contract.presentation.inputs.teleportDestination.required, true);
  assert.equal(buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast" }).presentation.teleportStep, undefined);
});

test("The passenger leaves the thunder's targets, and the panel asks for the destination after the area", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: THUNDER, phase: "cast", castContext: { slotLevel: 3 } });
  const before = thunderSession(contract);
  assert.deepEqual(before.targetIds, ["goblin", "ally"]);
  const withPassenger = updateSpellPanelSession(before, { stepPassengerId: "ally" });
  assert.deepEqual(withPassenger.targetIds, ["goblin"], "the passenger is gone with the caster (D1)");
  assert.deepEqual(Object.keys(withPassenger.outcomes), ["goblin"]);
  const again = updateSpellPanelSession(withPassenger, { targetIds: ["goblin", "ally"] });
  assert.deepEqual(again.targetIds, ["goblin"], "the area drawn again does not bring it back");
  const view = buildSpellPanelViewModel(contract, withPassenger);
  assert.equal(view.validation.firstInvalidField, "teleportDestination");
  assert.deepEqual(view.primaryAction, { id: "teleport-destination", label: "Scegli destinazione", disabled: false });
  const ready = buildSpellPanelViewModel(contract, updateSpellPanelSession(withPassenger, { teleportDestination: { x: 1000, y: 500 } }));
  assert.equal(ready.validation.valid, true, JSON.stringify(ready.validation));
});

test("The command carries the destination and the passenger; without a destination it is refused", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: THUNDER, phase: "cast", castContext: { slotLevel: 3 } });
  const session = thunderSession(contract, { stepPassengerId: "ally", teleportDestination: { x: 1000, y: 500 } });
  const command = buildSpellUnifiedAreaCommand({ contract, session, source: { sceneEpoch: 3 },
    candidateTargetIds: ["caster", "ally", "goblin"] });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.deepEqual(command.teleportStep, { spellId: THUNDER, destination: { x: 1000, y: 500 }, passengerId: "ally" });
  assert.deepEqual(command.targeting.targetIds, ["goblin"]);
  assert.equal(command.teleport, undefined, "never the teleport spells' block: its targets are the thunder's");
  const missing = buildSpellUnifiedAreaCommand({ contract, session: thunderSession(contract), source: { sceneEpoch: 3 },
    candidateTargetIds: ["caster", "ally", "goblin"] });
  assert.equal(missing.valid, false);
  assert.ok((missing.errors || []).some((error) => (error.code || error) === "teleport-destination-required"));
});

test("One plan: the thunder's damage where it stays, caster and passenger moved together, the mist from the space left", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: THUNDER, phase: "cast", castContext: { slotLevel: 3 } });
  const session = thunderSession(contract, { stepPassengerId: "ally", teleportDestination: { x: 1000, y: 500 } });
  const command = buildSpellUnifiedAreaCommand({ contract, session, source: { sceneEpoch: 3, commandId: "thunder-cmd" },
    candidateTargetIds: ["caster", "ally", "goblin"] });
  const scene = thunderScene();
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3, isCurrent: () => true,
    readItems: async (ids) => scene.filter((item) => ids.includes(item.id)),
    readAllItems: async () => scene, readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null, createSpellInstanceId: async () => "thunder-step",
    getStaticZoneItems: async () => [], buildStaticZoneItems: () => [], getZeroHPConditionHistoryIds: async () => [],
  });
  assert.equal(plan.valid !== false, true, JSON.stringify(plan.errors));
  assert.deepEqual(plan.entries.map((entry) => [entry.item.id, entry.change.afterHP]), [["goblin", 6]],
    "14 thunder on the goblin's failed save; the ally travels, out of the thunder");
  const moves = plan.spellBoardTokenSideEffects.filter((effect) => effect.type === "token:teleport");
  assert.deepEqual(moves.map((effect) => [effect.targetId, effect.position]), [
    ["caster", { x: 1000, y: 500 }],
    ["ally", { x: 1100, y: 500 }],
  ], "the passenger keeps its place beside the caster");
  assert.ok(moves.every((effect) => effect.operationId), "animated, on the mist's clock");
  assert.ok(plan.teleportStepRule, "the commit sends the mist before the HP");
  assert.deepEqual(plan.matchedVisualContext.preview.origin, { x: 100, y: 100 }, "the thunder bursts where the caster was");
  assert.deepEqual(plan.matchedVisualContext.preview.destination, { x: 1000, y: 500 });
  const causality = spellAreaCausality(plan);
  assert.equal(causality.teleport, true);
  assert.deepEqual(causality.destination, { x: 1000, y: 500 });
  assert.equal(causality.passengerId, "ally");
});

// Steel Wind Strike (lotto T3): five melee spell attacks in the attack console, each on a different creature (D5), then
// an optional teleport within 5 feet of one of them, hit or missed; a cell elsewhere is warned about, never refused (D3).
const STEEL_WIND = "xanathar-colpo-del-vento-dacciaio";
const { getPcAttackSpell, pcAttackSpellCount, pcAttackSpellDice } = await import("../src/pcAttackSpellCatalog.js");
const {
  PC_ATTACK_STATE_FIELD,
  pcAttackOpenSpellCast,
  pcAttackSpellCastPlan,
  pcAttackSpellTeleportPlan,
} = await import("../src/pcAttackCore.js");
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { currentInitiativeTurnKey } = await import("../src/turnBoundaryCore.js");

const TURN = { round: 2, current: 0, order: ["caster", "goblin"] };
const steelWindAttack = () => ({ spell: { spellId: STEEL_WIND } });
const attacker = (spellCast = null) => ({ id: "caster", name: "Maga", type: "IMAGE", layer: "CHARACTER", position: { x: 100, y: 100 },
  metadata: { [META_KEY]: { hp: 30, hpMax: 30, ...(spellCast ? { [PC_ATTACK_STATE_FIELD]: { version: 1, spellCast } } : {}) } } });
const victim = (id) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 300, y: 100 }, metadata: { [META_KEY]: { hp: 20, hpMax: 20 } } });

test("Steel Wind Strike in the attack console: five attacks of 6d10 force at any slot, one per creature", () => {
  const spell = getPcAttackSpell(STEEL_WIND);
  assert.equal(spell.level, 5);
  assert.equal(spell.range, "melee");
  assert.equal(pcAttackSpellCount(spell, 5), 5);
  assert.equal(pcAttackSpellCount(spell, 9), 5, "no more attacks at higher levels");
  assert.equal(pcAttackSpellDice(spell, 7), "6d10");
  let live = null;
  for (const [index, target] of ["a", "b", "c", "d", "e"].entries()) {
    const plan = pcAttackSpellCastPlan({ attack: steelWindAttack(), sourceItem: attacker(live), targetItem: victim(target),
      spellCast: { castId: "wind-1", slotLevel: 5 }, turnState: TURN, outcome: "hit" });
    assert.equal(plan.ok, true, plan.reason);
    assert.equal(plan.index, index + 1);
    assert.equal(plan.firstOfCast, index === 0, "the slot is spent by the first attack only");
    assert.equal(plan.next.teleportPending, true, "the teleport stays open after each attack");
    live = plan.next;
    if (index === 0) {
      const again = pcAttackSpellCastPlan({ attack: steelWindAttack(), sourceItem: attacker(live), targetItem: victim("a"),
        spellCast: { castId: "wind-1", slotLevel: 5 }, turnState: TURN, outcome: "miss" });
      assert.equal(again.ok, false);
      assert.match(again.reason, /ogni creatura una volta sola/u);
    }
  }
  assert.deepEqual(live.targetIds, ["a", "b", "c", "d", "e"]);
  assert.ok(pcAttackOpenSpellCast({ sourceItem: attacker(live), spellId: STEEL_WIND, turnState: TURN }),
    "after the fifth attack the cast is still open, for the teleport");
  const sixth = pcAttackSpellCastPlan({ attack: steelWindAttack(), sourceItem: attacker(live), targetItem: victim("f"),
    spellCast: { castId: "wind-1", slotLevel: 5 }, turnState: TURN, outcome: "hit" });
  assert.equal(sixth.ok, false, "no sixth attack in the same cast");
  assert.match(sixth.reason, /Teletrasportati o inizia un nuovo lancio/u);
});

test("The teleport closes the cast; it needs an attack of this cast and a cell", () => {
  const turnKey = currentInitiativeTurnKey(TURN);
  const live = { castId: "wind-1", spellId: STEEL_WIND, slotLevel: 5, index: 2, total: 5, targetIds: ["a", "b"], turnKey,
    leapPending: false, teleportPending: true };
  const plan = pcAttackSpellTeleportPlan({ sourceItem: attacker(live), castId: "wind-1", position: { x: 500, y: 100 }, turnState: TURN });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.attackedIds, ["a", "b"]);
  assert.deepEqual(plan.statePatch.value, { version: 1 }, "the cast is closed: no other teleport, no sixth attack");
  assert.equal(pcAttackSpellTeleportPlan({ sourceItem: attacker(live), castId: "other", position: { x: 500, y: 100 }, turnState: TURN }).ok, false);
  assert.equal(pcAttackSpellTeleportPlan({ sourceItem: attacker(live), castId: "wind-1", position: null, turnState: TURN }).ok, false);
  assert.equal(pcAttackSpellTeleportPlan({ sourceItem: attacker({ ...live, targetIds: [] }), castId: "wind-1",
    position: { x: 500, y: 100 }, turnState: TURN }).ok, false, "never before an attack");
});

test("One History entry with the move only; the cell beside a creature attacked passes, one far away is warned", async () => {
  const turnKey = currentInitiativeTurnKey(TURN);
  const live = { castId: "wind-1", spellId: STEEL_WIND, slotLevel: 5, index: 1, total: 5, targetIds: ["goblin"], turnKey,
    leapPending: false, teleportPending: true };
  const scene = new Map([["caster", attacker(live)], ["goblin", victim("goblin")]]);
  const calls = [];
  const box = (item) => ({ min: { x: item.position.x - 50, y: item.position.y - 50 }, max: { x: item.position.x + 50, y: item.position.y + 50 } });
  const api = {
    player: { getRole: async () => "GM" },
    scene: {
      getMetadata: async () => ({ [STATE_KEY]: TURN }),
      items: { getItems: async (ids) => ids.map((id) => scene.get(id)).filter(Boolean).map(clone),
        getItemBounds: async ([id]) => box(scene.get(id)) },
      grid: { getDpi: async () => 100 },
    },
  };
  const runtime = createPcAttackRuntime({
    api,
    getSceneContext: async () => ({ sceneIdentity: "scene-1" }),
    runMutation: async (operations, options) => {
      calls.push({ operations, options });
      return { status: "applied", committed: true, historyEntry: { id: "entry-1" } };
    },
    requireApplied: (result) => result,
    getEpoch: () => 4,
    isCurrentEpoch: () => true,
  });
  const beside = await runtime.executePcAttackSpellTeleport({ sourceId: "caster", castId: "wind-1", position: { x: 400, y: 100 } });
  assert.equal(beside.teleport.nextToTarget, true, "next to the goblin attacked");
  assert.equal(beside.undoAvailable, true);
  const [{ operations, options }] = calls;
  assert.deepEqual(operations, []);
  assert.deepEqual(options.sideEffects, [{ type: "token:teleport", spellId: STEEL_WIND, targetId: "caster",
    position: { x: 400, y: 100 }, skipAnimation: true }]);
  assert.deepEqual(options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value, { version: 1 });
  assert.equal(options.history.label, "Colpo del Vento d'Acciaio · teletrasporto");
  assert.equal(options.history.payload.causality.cause.spellId, STEEL_WIND);
  const far = await runtime.executePcAttackSpellTeleport({ sourceId: "caster", castId: "wind-1", position: { x: 900, y: 600 } });
  assert.equal(far.teleport.nextToTarget, false, "a warning, never a refusal (D3)");
  assert.equal(calls.length, 2);
});

// Arcane Gate (lotto T4): the first portal within 3 m at the cast, the second within 150 m from the pill right after
// (D7), and the crossing the GM records for the creature selected on the map (D6). Active side and rotation: the GM's.
const GATE = "phb2014-portale-arcano";
const { validateChildZoneContainment } = await import("../src/spellChildZoneCore.js");

test("Arcane Gate: two portals 3 m across, the first within 3 m, the second anywhere within 150 m of the caster", () => {
  const first = getSpellAreaRuleById(`${GATE}:cast`);
  assert.equal(first.kind, "zone");
  assert.equal(first.geometry.shape, "circle");
  assert.equal(first.geometry.size.value, 1.5, "a ring 10 feet across");
  assert.equal(first.placement.range.value, 3);
  const second = getSpellAreaRuleById(`${GATE}:far`);
  assert.equal(second.kind, "zone");
  assert.deepEqual(second.trigger, { type: "active-action", actionId: "arcane-gate-far-portal" });
  const [farPortal, traverse] = getSpellActiveResolutionActions(GATE);
  assert.equal(farPortal.resolutionKind, "child-zone");
  assert.equal(farPortal.rangeOrigin, "caster");
  assert.deepEqual(farPortal.range, { value: 150, unit: "m" });
  assert.equal(farPortal.availableAfterCast, undefined, "part of the cast: available on its turn");
  assert.deepEqual(validateSpellActiveResolutionAction(farPortal), { valid: true, errors: [] });
  const ring = (x) => ({ type: "circle", origin: { x, y: 0 }, radius: 100, cells: [] });
  assert.equal(validateChildZoneContainment({ parentArea: ring(0), childArea: ring(5000), childKind: "portal" }), true,
    "the second portal stands away from the first");
  assert.equal(validateChildZoneContainment({ parentArea: ring(0), childArea: ring(5000), childKind: "whirlpool" }), false,
    "Control Water's whirlpool still inside its zone");
  assert.equal(traverse.resolutionKind, "teleport");
  assert.equal(spellTeleportActionSubject(traverse), "target");
  assert.deepEqual(validateSpellActiveResolutionAction(traverse), { valid: true, errors: [] });
});

test("Attraversa moves the one creature selected, at once, in its own History entry", async () => {
  mutationCalls.length = 0;
  items.clear();
  const entry = { spellId: GATE, instanceId: "gate-1", casterId: "caster", casterName: "Maga", name: "Portale Arcano",
    conc: true, turns: 100, appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" }, castContext: { slotLevel: 6 } };
  items.set("caster", token("caster", "Maga", { [SPELLS_KEY]: [entry], [CONCENTRATION_KEY]: { "gate-1": { ...entry, targets: ["caster"] } } }));
  items.set("goblin", token("goblin", "Goblin", {}, { x: 300, y: 100 }));
  const payload = buildSpellActiveResolutionPayload({
    spell: getSpellDefinition(GATE), action: getSpellActiveResolutionActions(GATE)[1], group: { ...entry }, sceneEpoch: 3, turnKey: "1:0:caster",
  });
  const placement = { position: { x: 1500, y: 300 } };
  const none = await validateSpellActiveResolutionCommit({ payload, placement, targetIds: [] });
  assert.ok(none.errors.includes("teleport-target-required"), "the GM selects who crosses");
  const two = await validateSpellActiveResolutionCommit({ payload, placement, targetIds: ["goblin", "caster"] });
  assert.ok(two.errors.includes("teleport-target-required"), "one creature at a time");
  const one = await validateSpellActiveResolutionCommit({ payload, placement, targetIds: ["goblin"] });
  assert.deepEqual(one.errors, []);
  await executeSpellActiveResolution({ payload, placement, targetIds: ["goblin"], sceneEpoch: 3, commandId: "gate-cmd", isCurrent: () => true });
  const [{ operations, options }] = mutationCalls;
  assert.deepEqual(operations, []);
  assert.deepEqual(options.sideEffects, [{ type: "token:teleport", spellId: GATE, targetId: "goblin",
    position: { x: 1500, y: 300 }, skipAnimation: true }]);
  assert.equal(options.history.label, "Portale Arcano · Goblin attraversa");
});
