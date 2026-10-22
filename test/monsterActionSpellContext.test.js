import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFile } from "node:fs/promises";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import {
  buildSpellUnifiedPanelRouteQuery,
  normalizeSpellUnifiedPanelOpenRequest,
  routeSpellUnifiedPanelOpenRequest,
} from "../src/spellUnifiedPanelRoutingCore.js";
import { buildSpellUnifiedAreaCommand } from "../src/spellUnifiedAreaAdapter.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellCausality } from "../src/combatLogCausalityCore.js";
import { combatEventFromHistoryEntryV3 } from "../src/combatLogV3Core.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

const core = await import("../src/monsterActionContextCore.js").catch(() => ({}));
const revision = "a".repeat(64);
const parsedProfile = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const action = {
  ...parsedProfile.abilities.find((entry) => entry.execution?.kind === "spell-reference"),
  id: "slow-action", name: "Slow",
  execution: { kind: "spell-reference", spells: [{ spellId: "slow", name: "lentezza", perDay: 3 }, { spellId: "ice-storm", name: "tempesta di ghiaccio", perDay: 3 }, { spellId: "freezing-sphere", name: "sfera congelante di Otiluke", perDay: 1 }], saveDC: 19, attackBonus: 11 },
};
const profile = { ...parsedProfile, profileId: "auril-phase-2", profileRevision: revision,
  bossDefinitionId: "auril", phaseId: "phase-2", abilities: [action] };
const context = {
  actor: { id: "auril-token", tokenId: "auril-token", name: "Auril", bossInstanceId: "auril-boss" },
  cause: {
    kind: "monster-action", profileId: "auril-phase-2", profileRevision: revision,
    phaseId: "phase-2", bossInstanceId: "auril-boss", actionId: "slow-action",
    actionName: "Slow", actionInstanceId: "action-1",
  },
  referencedSpell: { id: "slow", name: "Slow" },
  spellcasting: { saveDC: 19, attackBonus: 11 },
};
const placement = {
  status: "confirmed", confirmed: true, ruleId: "slow:cast", spellId: "slow",
  casterId: "auril-token", targetLocked: true, targetIds: ["target-a", "target-b"],
  preview: {
    type: "square", start: { x: 0, y: 0 }, end: { x: 150, y: 0 },
    gridOrigin: { x: 0, y: 0 }, dpi: 150,
    targetIds: ["target-a", "target-b"], targetLocked: true,
  },
};

function routedSlow(extra = {}) {
  return routeSpellUnifiedPanelOpenRequest({
    sourceId: "auril-token", casterId: "auril-token", spellId: "slow", slotLevel: 3,
    targetIds: ["target-a", "target-b"], placement, sceneEpoch: 7,
    monsterActionContext: context, ...extra,
  });
}

function slowCommand(extra = {}) {
  const route = routedSlow();
  return buildSpellUnifiedAreaCommand({
    contract: route.contract,
    session: { ...route.session, outcomes: { "target-a": "failed", "target-b": "passed" }, ...extra },
    source: { sceneEpoch: 7 },
  });
}

test("monster action context captures parsed profile and source token without current-turn inference", () => {
  assert.equal(typeof core.createMonsterActionContext, "function");
  const result = core.createMonsterActionContext({
    profile, bossInstanceId: "auril-boss", tokenId: "auril-token", actorName: "Auril",
    action, actionInstanceId: "action-1",
  });
  assert.deepEqual(result, context);
});

test("context validation rejects virtual sources, mismatched spell/caster and incomplete cause", () => {
  assert.equal(typeof core.normalizeMonsterActionContext, "function");
  const valid = core.normalizeMonsterActionContext(context, { casterId: "auril-token", spellId: "slow" });
  assert.deepEqual(valid, context);
  valid.cause.actionId = "changed";
  assert.equal(context.cause.actionId, "slow-action");
  for (const tokenId of ["__EPIC__auril:1", "__LAIR__", "auril-token::p1"]) {
    assert.equal(core.normalizeMonsterActionContext({ ...context, actor: { ...context.actor, id: tokenId, tokenId } }), null);
  }
  assert.equal(core.normalizeMonsterActionContext(context, { casterId: "target-a", spellId: "slow" }), null);
  assert.equal(core.normalizeMonsterActionContext(context, { casterId: "auril-token", spellId: "fireball" }), null);
  assert.equal(core.normalizeMonsterActionContext({ ...context, cause: { ...context.cause, actionInstanceId: "" } }), null);
  assert.equal(core.normalizeMonsterActionContext({ ...context, unexpected: true }), null);
});

test("Slow query, routing and area command retain the same validated monster action", () => {
  const request = { sourceId: "auril-token", casterId: "auril-token", spellId: "slow", monsterActionContext: context };
  const query = buildSpellUnifiedPanelRouteQuery(request);
  const normalized = normalizeSpellUnifiedPanelOpenRequest(Object.fromEntries(query));
  assert.deepEqual(normalized.monsterActionContext, context);
  const route = routedSlow();
  assert.equal(route.contract.spell.id, "slow");
  assert.equal(route.executor, "executeSpellUnifiedArea");
  assert.deepEqual(route.session.monsterActionContext, context);
  const command = slowCommand();
  assert.equal(command.valid, true, command.errors.join(", "));
  assert.deepEqual(command.monsterActionContext, context);
  assert.equal(command.resolution.conditionApplications[0].options.effectId, "slow-penalty");
  assert.deepEqual(command.resolution.spellTargetIds, ["target-a"]);
});

test("malformed supplied route and area context cannot silently become an ordinary spell", () => {
  assert.throws(() => routedSlow({ monsterActionContext: "{invalid" }), /monster-action-context-invalid/);
  const command = buildSpellAreaResolutionCommand({
    contract: routedSlow().contract, spellId: "slow", casterId: "auril-token", slotLevel: 3,
    targetIds: ["target-a", "target-b"], outcomes: { "target-a": "failed", "target-b": "passed" },
    placement, targetLocked: true, validateSpatial: false,
    monsterActionContext: { ...context, cause: {} },
  });
  assert.equal(command.valid, false);
  assert.ok(command.errors.includes("monster-action-context-invalid"));
});

test("provenance wrapping preserves ordinary spell evidence and catalog identity", () => {
  assert.equal(typeof core.applyMonsterActionContext, "function");
  const ordinary = buildSpellCausality({
    eventType: "area/save-resolution", spellId: "slow", spellName: "Lentezza",
    casterId: "auril-token", instanceId: "slow-1", slotLevel: 3,
    targets: [{ id: "target-a", outcome: "failed" }, { id: "target-b", outcome: "passed" }],
    concentrationAction: "replace", concentrationInstanceId: "slow-1",
  });
  const wrapped = core.applyMonsterActionContext(ordinary, context);
  assert.deepEqual(wrapped.actor, context.actor);
  assert.deepEqual(wrapped.cause, context.cause);
  assert.deepEqual(wrapped.targets, ordinary.targets);
  assert.deepEqual(wrapped.concentration, ordinary.concentration);
  assert.equal(wrapped.referencedSpell.id, "slow");
  assert.equal(wrapped.referencedSpell.name, "Slow");
  assert.equal(wrapped.referencedSpell.displayName, "Lentezza");
  assert.equal(wrapped.referencedSpell.instanceId, "slow-1");
  assert.equal(wrapped.referencedSpell.slotLevel, 3);
  assert.throws(() => core.applyMonsterActionContext({ ...ordinary, cause: { ...ordinary.cause, spellId: "fireball" } }, context), /monster-action-context-invalid/);
  assert.deepEqual(core.applyMonsterActionContext(ordinary), ordinary);
  assert.deepEqual(ordinary.actor, { id: "auril-token", role: "caster" });
});

test("combat log retains monster token and boss instance while active turn belongs to another creature", () => {
  const event = combatEventFromHistoryEntryV3({
    id: "history-1", kind: "save-resolution", label: "Slow", ts: 100,
    changes: [], payload: { causality: { actor: context.actor, cause: context.cause } },
  }, { turnContext: { activeId: "someone-else", activeName: "Other", turnIndex: 1 } });
  assert.deepEqual(event.provenance.actor, context.actor);
  assert.deepEqual(event.provenance.cause, context.cause);
  assert.equal(event.turnContext.activeId, "someone-else");
});

const sdkStub = {
  onReady() {},
  room: { id: "monster-action-test", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => ({}),
    items: { getItems: async () => [], updateItems: async () => {}, addItems: async () => {}, deleteItems: async () => {} },
    grid: { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) },
  },
  broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
};
// A fluent path builder: since lotto L3 Ice Storm leaves a zone of difficult terrain on the map.
const fluentPath = () => new Proxy({}, { get: (node, key) => (key === "build" ? () => ({ id: "mock-path", type: "PATH" }) : () => fluentPathNode) });
const fluentPathNode = fluentPath();
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildPath: fluentPath, buildLabel: () => ({ build: () => ({}) }),
    buildImage: () => ({ build: () => ({}) }), buildText: () => ({ build: () => ({}) }),
    buildShape: () => ({ build: () => ({}) }), Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});
const {
  buildSpellAreaResolutionExecutionPlan, executeSpellAreaResolution,
} = await import("../src/spellAreaResolutionExecutor.js");

function executionFixture() {
  const items = [
    { id: "auril-token", name: "Auril", type: "IMAGE", layer: "CHARACTER", metadata: { "com.thebigpicture.initiative/meta": { initiativeCard: { bossActionBinding: { profileId: profile.profileId, profileRevision: profile.profileRevision, phaseId: profile.phaseId, bossDefinitionId: "auril" } }, bossActionState: {version:1,boundTokenId:"auril-token",bossDefinitionId:"auril",bossInstanceId:"auril-boss"} } } },
    { id: "target-a", name: "Target A", layer: "CHARACTER", metadata: {} },
    { id: "target-b", name: "Target B", layer: "CHARACTER", metadata: {} },
  ];
  const history = [];
  let round = 4;
  let mutationPlan;
  const runtime = {
    sceneEpoch: 7, isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({ "com.thebigpicture.initiative/state": { order: ["someone-else"], current: 0, round } }),
    readBossActionProfile: async () => structuredClone(profile),
    getInitiativeActorId: async () => "someone-else",
    createSpellInstanceId: async () => "slow-1",
    validateSpatial: async () => ({ valid: true, errors: [] }),
    runEffectsMutation: async (operations, options) => {
      for (const precondition of options.sceneMetadataPreconditions || []) {
        assert.equal(precondition.key, "com.thebigpicture.initiative/state");
        assert.equal(precondition.field, "round");
        if (precondition.value !== round) throw new Error("scene-metadata-precondition-failed");
      }
      const prepared = operations.map((operation, index) => ({
        ...operation, operationId: `effect-${index}`, createdAt: 100,
        entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `spell-${id}`])),
        instanceIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `condition-${id}`])),
      }));
      mutationPlan = buildEffectsMutationPlan(items.map((item) => ({
        id: item.id, name: item.name, spells: [], conditions: [], concentrations: {},
      })), prepared);
      for (const patch of options.metadataPatches || []) {
        const item = items.find((entry) => entry.id === patch.id);
        const meta = item.metadata["com.thebigpicture.initiative/meta"] || {};
        const change = { id: item.id, fields: {}, before: {}, after: {},
          metadataFields: {}, beforeMetadata: {}, afterMetadata: {} };
        for (const [field, descriptor] of Object.entries(patch.fields)) {
          const snapshot = Object.hasOwn(meta, field) ? { present: true, value: structuredClone(meta[field]) } : { present: false };
          assert.deepEqual(snapshot, descriptor.expected);
          if (descriptor.mode === "assert") continue;
          change.metadataFields[field] = true;
          change.beforeMetadata[field] = snapshot;
          meta[field] = structuredClone(descriptor.value);
          change.afterMetadata[field] = { present: true, value: structuredClone(meta[field]) };
        }
        if (Object.keys(change.metadataFields).length) mutationPlan.changes.push(change);
      }
      return { ...mutationPlan, status: "applied", committed: true };
    },
    requireAppliedEffectsMutation: (result) => assert.equal(result.status, "applied"),
    withItemMetaHistory: async (options, run) => {
      await run();
      const entry = options.decorateEntry({ id: "history-slow", kind: options.kind, label: options.label, ts: 100, changes: [] });
      history.push(entry);
      options.onRecorded(entry);
      return { committed: true, historyEntryId: entry.id, changes: mutationPlan?.changes || [] };
    },
    getHistoryEntries: async () => history,
    emitMatchedSpellVisual: async () => {}, syncHPBatchToMemory: async () => {},
  };
  return { runtime, history, items, get mutationPlan() { return mutationPlan; }, setRound(value) { round = value; } };
}

test("Slow executor snapshots inherited DC19 and retains action provenance in shared History and log", async () => {
  const fixture = executionFixture();
  const command = slowCommand();
  const plan = await buildSpellAreaResolutionExecutionPlan(command, fixture.runtime);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.spell, getSpellDefinition("slow"));
  const condition = plan.effectOperations.find((operation) => operation.type === "condition:add");
  assert.equal(condition.options.saveReminder.dc, 19);
  assert.equal(condition.options.effectId, "slow-penalty");
  assert.equal(condition.options.parentRemoval, "target");
  const result = await executeSpellAreaResolution(command, fixture.runtime);
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.equal(result.historyEntryId, "history-slow");
  assert.equal(result.undoAvailable, true);
  const affected = fixture.mutationPlan.states.find((item) => item.id === "target-a");
  assert.equal(affected.conditions[0].saveReminder.dc, 19);
  assert.equal(fixture.mutationPlan.states.find((item) => item.id === "target-b").conditions.length, 0);
  assert.equal(affected.spells[0].castContext.spellSaveDC, 19);
  const causal = fixture.history[0].payload.causality;
  assert.deepEqual(causal.actor, context.actor);
  assert.deepEqual(causal.cause, context.cause);
  assert.equal(causal.referencedSpell.id, "slow");
  assert.deepEqual(causal.targets.map((target) => [target.id, target.outcome]), [["target-a", "failed"], ["target-b", "passed"]]);
  const event = combatEventFromHistoryEntryV3(fixture.history[0], { turnContext: { activeId: "someone-else" } });
  assert.deepEqual(event.provenance.actor, context.actor);
  assert.deepEqual(event.provenance.cause, context.cause);
});

test("executor rejects tampered action context before reading the scene", async () => {
  let reads = 0;
  const command = { ...slowCommand(), monsterActionContext: { ...context, actor: { ...context.actor, id: "__EPIC__auril:1" } } };
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 7, isCurrent: () => true,
    readItems: async () => { reads += 1; return []; },
  });
  assert.equal(plan.valid, false);
  assert.equal(plan.errors[0].code, "monster-action-context-invalid");
  assert.equal(reads, 0);
});

test("ordinary Slow execution preserves its existing spell cause and reminder mechanics", async () => {
  const fixture = executionFixture();
  fixture.runtime.readBossActionProfile = async () => { throw new Error("Ordinary spells must not read a boss profile"); };
  const command = slowCommand({ monsterActionContext: undefined });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, fixture.runtime);
  const condition = plan.effectOperations.find((operation) => operation.type === "condition:add");
  assert.equal(condition.options.saveReminder.dc, undefined);
  const result = await executeSpellAreaResolution(command, fixture.runtime);
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.equal(fixture.history[0].payload.causality.spellId, "slow");
  assert.equal(fixture.history[0].payload.causality.actor, undefined);
  assert.equal(fixture.history[0].payload.causality.referencedSpell, undefined);
});

test("stale boss binding stops a pending Slow command before effects are committed",async()=>{
  const fixture=executionFixture();
  fixture.runtime.readAllItems=async()=>[{id:"auril-token",name:"Auril",layer:"CHARACTER",metadata:{
    "com.thebigpicture.initiative/meta":{initiativeCard:{bossActionBinding:{profileId:"changed",profileRevision:revision,phaseId:"phase-3",bossDefinitionId:"auril"}}}
  }},{id:"target-a",metadata:{}},{id:"target-b",metadata:{}}];
  const plan=await buildSpellAreaResolutionExecutionPlan(slowCommand(),fixture.runtime);
  assert.equal(plan.valid,false);
  assert.equal(plan.errors[0].code,"monster-action-binding-stale");
});

test("pending Slow rejects a replaced boss instance or a non-creature caster",async()=>{
  for(const change of [item=>{item.metadata["com.thebigpicture.initiative/meta"].bossActionState={version:1,boundTokenId:item.id,bossDefinitionId:"auril",bossInstanceId:"replacement"};},item=>{item.type="TEXT";},item=>{item.attachedTo="some-token";}]){
    const fixture=executionFixture();change(fixture.items[0]);
    const plan=await buildSpellAreaResolutionExecutionPlan(slowCommand(),fixture.runtime);
    assert.equal(plan.valid,false);
    assert.equal(plan.errors[0].code,"monster-action-binding-stale");
  }
});

test("all-passed Slow spends one use in the canonical round without target effects", async () => {
  const fixture = executionFixture();
  const command = slowCommand({ outcomes: { "target-a": "passed", "target-b": "passed" } });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, fixture.runtime);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.effectOperations.some((operation) => ["condition:add", "spell:upsert"].includes(operation.type)), false);
  assert.equal(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState.usageState, undefined);
  const result = await executeSpellAreaResolution(command, fixture.runtime);
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.ok(result.changedIds.includes("auril-token"));
  const state = fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState;
  assert.deepEqual(state.usageState, {
    version: 1, rounds: { 4: { '["phase-2","slow-action"]': 1 } }, phases: {},
  });
  assert.equal(fixture.history.length, 1);
  assert.deepEqual(fixture.history[0].payload.causality.resources, [{
    actionId: "slow-action", phaseId: "phase-2", period: "round", limit: 1,
    beforeUsed: 0, afterUsed: 1, round: 4,
  }]);
  assert.ok(fixture.history[0].effectsMutation.changes.some((change) => change.metadataFields?.bossActionState));
});

test("a second Slow action cannot spend the same round's exhausted use", async () => {
  const fixture = executionFixture();
  const allPassed = { outcomes: { "target-a": "passed", "target-b": "passed" } };
  assert.equal((await executeSpellAreaResolution(slowCommand(allPassed), fixture.runtime)).status, "applied");
  const secondContext = { ...context, cause: { ...context.cause, actionInstanceId: "action-2" } };
  const result = await executeSpellAreaResolution(slowCommand({ ...allPassed, monsterActionContext: secondContext }), fixture.runtime);
  assert.equal(result.status, "rejected");
  assert.equal(result.errors[0].code, "monster-action-usage-unavailable");
  assert.match(result.errors[0].message, /esaurit/i);
  assert.equal(fixture.history.length, 1);
  fixture.setRound(5);
  assert.equal((await executeSpellAreaResolution(slowCommand({ ...allPassed, monsterActionContext: secondContext }), fixture.runtime)).status, "applied");
  assert.equal(fixture.history.length, 2);
});

test("Slow requires the stored bound definition and matching action mechanics", async () => {
  const corruptions = [
    () => null,
    (definition) => ({ ...definition, profileId: "other-profile" }),
    (definition) => ({ ...definition, profileRevision: "b".repeat(64) }),
    (definition) => ({ ...definition, phaseId: "other-phase" }),
    (definition) => ({ ...definition, bossDefinitionId: "other-boss" }),
    (definition) => ({ ...definition, abilities: [{ ...definition.abilities[0], id: "other-action" }] }),
    (definition) => ({ ...definition, abilities: [{ ...definition.abilities[0], name: "Other action" }] }),
    (definition) => ({ ...definition, abilities: [{ ...definition.abilities[0], execution: { ...action.execution, spellId: "fireball" } }] }),
    (definition) => ({ ...definition, abilities: [{ ...definition.abilities[0], execution: { ...action.execution, saveDC: 20 } }] }),
    (definition) => ({ ...definition, abilities: [{ ...definition.abilities[0], execution: { ...action.execution, attackBonus: 12 } }] }),
  ];
  for (const corrupt of corruptions) {
    const fixture = executionFixture();
    fixture.runtime.readBossActionProfile = async () => corrupt(structuredClone(profile));
    const result = await executeSpellAreaResolution(slowCommand(), fixture.runtime);
    assert.equal(result.status, "rejected");
    assert.equal(result.errors[0].code, "monster-action-definition-invalid");
    assert.equal(fixture.history.length, 0);
    assert.equal(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState.usageState, undefined);
  }
});

test("forged query DC or action name cannot override the stored Slow descriptor", async () => {
  for (const forged of [
    { ...context, spellcasting: { ...context.spellcasting, saveDC: 20 } },
    { ...context, cause: { ...context.cause, actionName: "Other action" } },
  ]) {
    const fixture = executionFixture();
    const result = await executeSpellAreaResolution(slowCommand({ monsterActionContext: forged }), fixture.runtime);
    assert.equal(result.status, "rejected");
    assert.equal(result.errors[0].code, "monster-action-definition-invalid");
    assert.equal(fixture.history.length, 0);
  }
});

test("Slow History excludes a foreign boss state change when the coordinated commit fails", async () => {
  const fixture = executionFixture();
  let decorated;
  fixture.runtime.runEffectsMutation = async () => {
    fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState.bossInstanceId = "replacement";
    throw new Error("Effects mutation conflict.");
  };
  fixture.runtime.withItemMetaHistory = async (options, run) => {
    const before = structuredClone(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState);
    try {
      await run();
    } catch (error) {
      decorated = options.decorateEntry({ id: "foreign-state", kind: options.kind, changes: [{
        id: "auril-token", before: { bossActionState: { present: true, value: before } },
        after: { bossActionState: { present: true, value: structuredClone(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState) } },
      }] });
      throw error;
    }
  };
  const result = await executeSpellAreaResolution(slowCommand(), fixture.runtime);
  assert.equal(result.status, "failed");
  assert.deepEqual(decorated.changes, []);
  assert.deepEqual(decorated.effectsMutation.changes, []);
  assert.equal(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState.bossInstanceId, "replacement");
});

// ---- tranche 7: Spellcasting lists Slow, Ice Storm and Freezing Sphere ----
const iceContext = { ...context, cause: { ...context.cause, actionInstanceId: "action-ice" }, referencedSpell: { id: "ice-storm", name: "Ice Storm" } };
function iceCommand({ monsterActionContext = iceContext, spellId = "ice-storm", ruleId = "ice-storm:cast", slotLevel = 4 } = {}) {
  const icePlacement = { status: "confirmed", confirmed: true, ruleId, spellId, casterId: "auril-token", targetLocked: true, targetIds: ["target-a", "target-b"],
    preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: ["target-a", "target-b"], targetLocked: true } };
  const route = routeSpellUnifiedPanelOpenRequest({ sourceId: "auril-token", casterId: "auril-token", spellId, slotLevel,
    targetIds: ["target-a", "target-b"], placement: icePlacement, sceneEpoch: 7, monsterActionContext });
  return buildSpellUnifiedAreaCommand({ contract: route.contract,
    session: { ...route.session, outcomes: { "target-a": "failed", "target-b": "passed" }, hpValues: { damage: 28 } }, source: { sceneEpoch: 7 } });
}
function withHp(fixture) {
  for (const id of ["target-a", "target-b"]) fixture.items.find((item) => item.id === id).metadata = { "com.thebigpicture.initiative/meta": { hp: 60, hpMax: 60, inInitiative: true } };
  return fixture;
}

test("Spellcasting context: the chosen spell must be one the action lists", () => {
  const made = core.createMonsterActionContext({ profile, bossInstanceId: "auril-boss", tokenId: "auril-token", actorName: "Auril", action, actionInstanceId: "a1", spellId: "ice-storm" });
  assert.deepEqual(made.referencedSpell, { id: "ice-storm", name: "Ice Storm" });
  assert.equal(core.createMonsterActionContext({ profile, bossInstanceId: "auril-boss", tokenId: "auril-token", actorName: "Auril", action, actionInstanceId: "a1" }).referencedSpell.id, "slow", "the first listed spell by default");
  assert.equal(core.createMonsterActionContext({ profile, bossInstanceId: "auril-boss", tokenId: "auril-token", actorName: "Auril", action, actionInstanceId: "a1", spellId: "fireball" }), null);
});

test("Ice Storm through the shared area executor: DC 19 from Auril, typed-total damage, one Spellcasting use", async () => {
  const fixture = withHp(executionFixture());
  const command = iceCommand();
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const plan = await buildSpellAreaResolutionExecutionPlan(command, fixture.runtime);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.spell, getSpellDefinition("ice-storm"));
  assert.ok(plan.bossActionUse, "the Spellcasting 1/Round use is spent with the resolution");
  // Lotto L3: the storm leaves difficult terrain until the end of Auril's next turn, a zone held by Auril.
  assert.ok(plan.nextStaticZoneItems.length > 0, "the zone of difficult terrain is drawn");
  assert.deepEqual(plan.effectOperations.map((operation) => [operation.type, operation.targetIds]), [
    ["spell:upsert", ["auril-token"]],
    ["condition:add", ["target-a", "target-b"]],
  ]);
  assert.equal(plan.effectOperations[1].conditionName, "Terreno difficile / Tempesta di ghiaccio");
  const result = await executeSpellAreaResolution(command, fixture.runtime);
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  const causal = fixture.history[0].payload.causality;
  assert.deepEqual(causal.actor, context.actor);
  assert.equal(causal.referencedSpell.id, "ice-storm");
  assert.equal(fixture.items[0].metadata["com.thebigpicture.initiative/meta"].bossActionState.usageState.rounds["4"]['["phase-2","slow-action"]'], 1);
});

test("a context naming another spell, or a spell the action does not list, is refused before any effect", async () => {
  const mismatch = await buildSpellAreaResolutionExecutionPlan({ ...iceCommand(), monsterActionContext: context }, withHp(executionFixture()).runtime);
  assert.equal(mismatch.valid, false);
  const unlisted = { ...context, referencedSpell: { id: "fireball", name: "Fireball" } };
  const fireball = await buildSpellAreaResolutionExecutionPlan(iceCommand({ monsterActionContext: unlisted, spellId: "fireball", ruleId: "fireball:cast", slotLevel: 3 }), withHp(executionFixture()).runtime);
  assert.equal(fireball.valid, false);
  assert.match(fireball.errors[0].code, /monster-action/);
});

test("Freezing Sphere resolves through the same executor with Auril's DC and provenance", async () => {
  const fixture = withHp(executionFixture());
  const sphere = { ...context, cause: { ...context.cause, actionInstanceId: "action-sphere" }, referencedSpell: { id: "freezing-sphere", name: "Freezing Sphere" } };
  const command = iceCommand({ monsterActionContext: sphere, spellId: "freezing-sphere", ruleId: "freezing-sphere:cast", slotLevel: 6 });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const plan = await buildSpellAreaResolutionExecutionPlan(command, fixture.runtime);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const result = await executeSpellAreaResolution(command, fixture.runtime);
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.equal(fixture.history[0].payload.causality.referencedSpell.id, "freezing-sphere");
});
