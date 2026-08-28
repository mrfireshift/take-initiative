import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdkStub = {
  onReady() {},
  room: { id: "test-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({}),
    grid: {
      getDpi: async () => 100,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    local: {
      getItems: async () => [],
      deleteItems: async () => {},
      addItems: async () => {},
    },
    items: {
      getItems: async () => [],
      updateItems: async () => {},
    },
  },
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
};

const fluentPathMock = () => {
  const node = {};
  for (const method of [
    "commands", "fillRule", "fillColor", "fillOpacity", "strokeColor",
    "strokeOpacity", "strokeWidth", "position", "locked", "disableHit",
    "layer", "metadata", "name", "visible", "zIndex",
  ]) node[method] = () => node;
  node.build = () => ({ id: "mock-path", type: "PATH" });
  return node;
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "mock-label" }) }),
    buildImage: (...args) => ({ type: "IMAGE", args, build: () => ({ id: "mock-image" }) }),
    buildPath: fluentPathMock,
    buildText: (...args) => ({ type: "TEXT", args, build: () => ({ id: "mock-text" }) }),
    buildShape: (...args) => ({ type: "SHAPE", args, build: () => ({ id: "mock-shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { ID } = await import("../src/constants.js");
const { buildConeArea } = await import("../src/aoeGeometryCore.js");
const { areaMembershipTargetIds } = await import("../src/spellAreaMembershipCore.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const {
  PRISMATIC_SPRAY_RAYS,
  prismaticSprayResolutionPlan,
} = await import("../src/prismaticSprayRules.js");
const { resolveSaveSpellResolution } = await import("../src/saveSpellCore.js");
const { saveSpellResolutionOperations } = await import("../src/saveSpellOperationsCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { getSpellSaveWorkflowRule } = await import("../src/spellSaveWorkflowRules.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
} = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { renderTargetMatrix } = await import("../src/spellUnifiedPanelTargetView.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const {
  buildSpellAreaResolutionExecutionPlan,
} = await import("../src/spellAreaResolutionExecutor.js");
const {
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
  getSpellDefinition,
} = await import("../src/spells-srd.js");

const SPELL_ID = "prismatic-spray";
const META_KEY = `${ID}/meta`;

function targetContext(ray, damage = undefined) {
  return {
    ray: String(ray),
    ...(damage === undefined ? {} : { damage }),
  };
}

function placement(targetIds = ["target-a"]) {
  return {
    status: "confirmed",
    state: "confirmed",
    confirmed: true,
    policy: "required",
    ruleId: `${SPELL_ID}:cast`,
    spellId: SPELL_ID,
    casterId: "caster",
    targetLocked: true,
    targetIds,
    preview: {
      type: "cone",
      start: { x: 0, y: 0 },
      end: { x: 1200, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 100,
      targetIds,
      targetLocked: true,
    },
  };
}

function commandFor({
  targetIds = ["target-a"],
  outcomes = { "target-a": "failed" },
  targetContexts = { "target-a": targetContext(1, 35) },
} = {}) {
  const contract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel: 7 },
  });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 7,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes,
    targetContexts,
    placement: placement(targetIds),
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
}

function preparedOperations(operations, prefix = "prismatic") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (["condition:add", "condition:add-custom", "condition:toggle"].includes(operation.type)) {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:${id}`])),
      };
    }
    return { ...operation, operationId };
  });
}

function conditionInstance({ ray = "6", slot = "ray", progress = null } = {}) {
  const plan = prismaticSprayResolutionPlan({
    targetIds: ["target"],
    outcomes: { target: "failed" },
    targetContexts: ray === "8"
      ? { target: { ray: "8", rayA: slot === "ray-a" ? "6" : "7", rayB: slot === "ray-b" ? "6" : "7" } }
      : { target: { ray } },
  });
  const application = plan.conditionApplications.find((entry) => (
    !progress || entry.options.effectId.startsWith("prismatic-spray-indigo:")
  ));
  const options = structuredClone(application.options);
  if (progress) {
    options.mechanics.prismaticSprayIndigoProgress = {
      successes: progress.successes,
      failures: progress.failures,
      successThreshold: 3,
      failureThreshold: 3,
      terminal: null,
    };
  }
  return {
    id: `${options.effectId}:instance`,
    condition: application.conditionName,
    active: true,
    sourceId: "caster",
    sourceName: "Mago",
    parentEffectId: "spray-instance",
    spellId: SPELL_ID,
    type: "spell",
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    ...options,
  };
}

function reminderItems(instance) {
  return [
    {
      id: "caster",
      name: "Mago",
      metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 17 } } },
    },
    {
      id: "target",
      name: "Bersaglio",
      metadata: { [META_KEY]: { conditions: { instances: [instance] } } },
    },
  ];
}

function nextRoundNotices(items) {
  return planEffectSaveReminderNotices({
    items,
    previousInitiativeState: { order: ["caster", "target"], current: 1, round: 1 },
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
    includeCurrentTurnStart: false,
  });
}

test("A1–A5 — usa il cono shared da 18 m, TS Des indipendenti e nessuna zona/concentrazione", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  const workflow = getSpellSaveWorkflowRule(SPELL_ID);
  assert.equal(spell.concentration, false);
  assert.equal(rule.kind, "instant");
  assert.deepEqual(rule.geometry, {
    shape: "cone",
    size: { value: 18, unit: "m", measure: "length" },
  });
  assert.equal(rule.lifecycle.persistence, "preview");
  assert.equal(rule.lifecycle.endsWithSpell, false);
  assert.equal(workflow.ability, "dex");
  assert.equal(workflow.targeting.unlimitedTargets, true);
  assert.deepEqual(workflow.outcomeOptions, ["passed", "failed"]);
  assert.deepEqual(getAreaSaveRuleChoices(SPELL_ID), []);

  const area = buildConeArea({ x: 0, y: 0 }, { x: 1200, y: 0 }, 100, { x: 0, y: 0 });
  const ids = areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META_KEY,
    candidates: [
      { item: { id: "inside", metadata: {} }, bounds: { min: { x: 450, y: -50 }, max: { x: 550, y: 50 } } },
      { item: { id: "outside", metadata: {} }, bounds: { min: { x: -550, y: -50 }, max: { x: -450, y: 50 } } },
    ],
  });
  assert.deepEqual(ids, ["inside"]);
});

test("B6–B10 — mapping RAW 1–5, 10d6 e moltiplicatori full/half", () => {
  assert.deepEqual(
    PRISMATIC_SPRAY_RAYS.slice(0, 5).map((ray) => [ray.value, ray.color, ray.damage.dice, ray.damage.type]),
    [
      ["1", "Rosso", "10d6", "fuoco"],
      ["2", "Arancione", "10d6", "acido"],
      ["3", "Giallo", "10d6", "fulmine"],
      ["4", "Verde", "10d6", "veleno"],
      ["5", "Blu", "10d6", "freddo"],
    ],
  );
  for (const outcome of ["failed", "passed"]) {
    const plan = prismaticSprayResolutionPlan({
      targetIds: ["target"],
      outcomes: { target: outcome },
      targetContexts: { target: targetContext(3, 35) },
    });
    assert.equal(plan.valid, true);
    assert.equal(plan.damageContributions[0].factor, outcome === "failed" ? 1 : 0.5);
    assert.equal(plan.damageContributions[0].amount, outcome === "failed" ? 35 : 17);
  }
});

test("UI — chiede solo risultati fisici e mostra i totali 10d6 necessari per branch", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, castContext: { slotLevel: 7 } });
  assert.equal(contract.presentation.inputs.damage.visible, false);
  assert.equal(contract.presentation.inputs.variant.visible, false);
  const workflow = contract.presentation.targeting.workflow;
  assert.equal(workflow.context.scope, "target");
  assert.match(workflow.context.fields[0].label, /Risultato d8/i);
  assert.equal(workflow.context.fields[0].options.length, 8);
  assert.equal(workflow.context.fields.find((field) => field.id === "rayA").options.length, 7);

  const base = { casterId: "caster", slotLevel: 7, targetIds: ["target"], outcomes: { target: "failed" } };
  const damaging = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetContext: { target: { ray: "1" } } },
    targetCandidates: [{ key: "target", label: "Bersaglio" }],
  });
  assert.deepEqual(damaging.targets.context.targets[0].fields.map((field) => field.id), ["ray", "damage"]);
  assert.equal(buildSpellPanelViewModel(contract, damaging.workflow.session || {
    ...base,
    targetContext: { target: { ray: "1" } },
  }).validation.valid, false);

  const special = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetContext: { target: { ray: "8", rayA: "1", rayB: "6" } } },
    targetCandidates: [{ key: "target", label: "Bersaglio" }],
  });
  assert.deepEqual(
    special.targets.context.targets[0].fields.map((field) => field.id),
    ["ray", "rayA", "rayB", "damageA"],
  );
});

test("UI presentation — Spruzzo Prismatico supporta i casi visuali mono e multi-target con griglia 2-colonne", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, castContext: { slotLevel: 7 } });
  const base = { casterId: "caster", slotLevel: 7, outcomes: { t1: "failed", t2: "failed", t3: "failed", t4: "failed" } };

  // 1. Damaging ray
  const modelDamaging = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "2" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(modelDamaging.targets.context.targets[0].fields.map((f) => f.id), ["ray", "damage"]);
  assert.equal(modelDamaging.targets.context.targets[0].fields[0].label, "Risultato d8");
  assert.equal(modelDamaging.targets.context.targets[0].fields[1].label, "Danno · 10d6");

  // 2. Indigo
  const modelIndigo = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "6" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(modelIndigo.targets.context.targets[0].fields.map((f) => f.id), ["ray"]);

  // 3. Violet
  const modelViolet = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "7" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(modelViolet.targets.context.targets[0].fields.map((f) => f.id), ["ray"]);

  // 4. Special 8 + two damaging rays
  const model8BothDamage = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "8", rayA: "2", rayB: "3" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(model8BothDamage.targets.context.targets[0].fields.map((f) => f.id), ["ray", "rayA", "rayB", "damageA", "damageB"]);
  assert.equal(model8BothDamage.targets.context.targets[0].fields[1].label, "Primo raggio aggiuntivo");
  assert.equal(model8BothDamage.targets.context.targets[0].fields[2].label, "Secondo raggio aggiuntivo");
  assert.equal(model8BothDamage.targets.context.targets[0].fields[3].label, "Danno · 10d6");
  assert.equal(model8BothDamage.targets.context.targets[0].fields[4].label, "Danno · 10d6");

  // 5. Special 8 + damage + Indigo
  const model8DamageIndigo = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "8", rayA: "1", rayB: "6" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(model8DamageIndigo.targets.context.targets[0].fields.map((f) => f.id), ["ray", "rayA", "rayB", "damageA"]);

  // 6. Special 8 + Indigo + Violet
  const model8IndigoViolet = buildUnifiedPanelViewModel({
    contract,
    session: { ...base, targetIds: ["t1"], targetContext: { t1: { ray: "8", rayA: "6", rayB: "7" } } },
    targetCandidates: [{ key: "t1", label: "Bersaglio 1" }],
  });
  assert.deepEqual(model8IndigoViolet.targets.context.targets[0].fields.map((f) => f.id), ["ray", "rayA", "rayB"]);

  // 7. Four targets simultaneously
  const model4Targets = buildUnifiedPanelViewModel({
    contract,
    session: {
      ...base,
      targetIds: ["t1", "t2", "t3", "t4"],
      targetContext: {
        t1: { ray: "2", damage: "35" },
        t2: { ray: "6" },
        t3: { ray: "8", rayA: "2", rayB: "3", damageA: "30", damageB: "28" },
        t4: { ray: "7" },
      },
    },
    targetCandidates: [
      { key: "t1", label: "Karmakar" },
      { key: "t2", label: "Goblin 1" },
      { key: "t3", label: "Orco Capo" },
      { key: "t4", label: "Sciamano" },
    ],
  });
  assert.equal(model4Targets.targets.context.targets.length, 4);
  assert.equal(model4Targets.targets.context.targets[0].label, "Karmakar");
  assert.equal(model4Targets.targets.context.targets[1].label, "Goblin 1");
  assert.equal(model4Targets.targets.context.targets[2].label, "Orco Capo");
  assert.equal(model4Targets.targets.context.targets[3].label, "Sciamano");

  // DOM node validation with mock document
  function createMockDoc() {
    return {
      createElement: (tagName) => ({
        tagName: String(tagName).toUpperCase(),
        className: "",
        id: "",
        textContent: "",
        children: [],
        attributes: {},
        dataset: {},
        append(...children) {
          for (const c of children.flat()) {
            if (c) this.children.push(c);
          }
        },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
        addEventListener() {},
      }),
      createTextNode: (text) => ({ nodeType: 3, textContent: String(text ?? "") }),
    };
  }

  const doc = createMockDoc();
  const domDamaging = renderTargetMatrix(doc, modelDamaging);
  const contextBlock = domDamaging.children.find((c) => c.className === "unified-target-context");
  assert.ok(contextBlock, "Should render unified-target-context");
  const targetBlock = contextBlock.children.find((c) => c.className?.includes("unified-target-context__target"));
  assert.ok(targetBlock, "Should render target block");
  const header = targetBlock.children.find((c) => c.className === "unified-target-context__target-header");
  assert.ok(header, "Should render target header");
  const nameNode = header.children.find((c) => c.className === "unified-target-context__target-name");
  assert.equal(nameNode.textContent, "Bersaglio 1");
  const grid = targetBlock.children.find((c) => c.className === "unified-target-context__grid");
  assert.ok(grid, "Should render target grid");
  const fieldIds = grid.children.map((f) => f.attributes["data-context-field"]);
  assert.deepEqual(fieldIds, ["ray", "damage"]);

  // Special 8 DOM
  const dom8 = renderTargetMatrix(doc, model8BothDamage);
  const contextBlock8 = dom8.children.find((c) => c.className === "unified-target-context");
  const targetBlock8 = contextBlock8.children.find((c) => c.className?.includes("unified-target-context__target"));
  assert.ok(targetBlock8.className.includes("is-special-8"));
  const grid8 = targetBlock8.children.find((c) => c.className === "unified-target-context__grid");
  assert.deepEqual(
    grid8.children.map((f) => f.attributes["data-context-field"]),
    ["ray", "rayA", "rayB", "damageA", "damageB"],
  );
});

test("C11–C20 — Indaco parte a 0S/0F, solo sui falliti, con parent identity unica", () => {
  const failed = prismaticSprayResolutionPlan({
    targetIds: ["target"], outcomes: { target: "failed" }, targetContexts: { target: { ray: "6" } },
  });
  const passed = prismaticSprayResolutionPlan({
    targetIds: ["target"], outcomes: { target: "passed" }, targetContexts: { target: { ray: "6" } },
  });
  assert.equal(passed.conditionApplications.length, 0);
  assert.equal(failed.conditionApplications[0].conditionName, "Trattenuto");
  assert.deepEqual(
    failed.conditionApplications[0].options.mechanics.prismaticSprayIndigoProgress,
    { successes: 0, failures: 0, successThreshold: 3, failureThreshold: 3, terminal: null },
  );
  assert.equal(failed.conditionApplications[0].options.summaryParts[0].label, "TS Cos · 0S/0F");
  assert.equal(failed.conditionApplications[0].options.saveReminder.timing, "turn-end");

  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    targetContexts: { target: { ray: "6" } },
    automation: getAreaSaveAutomation(spell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    validateSpatial: false,
  });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "spray-instance",
    casterName: "Mago",
    spellExpiry: { mode: "manual" },
  });
  assert.equal(operations.some((operation) => operation.type === "spell:upsert"), false);
  assert.equal(operations.filter((operation) => operation.type === "condition:add").length, 1);
  assert.equal(operations.find((operation) => operation.type === "condition:add").options.parentEffectId, "spray-instance");
});

test("C14–C20 — i reminder Indaco riusano il progress shared fino a cleanup o Pietrificato", () => {
  const middle = conditionInstance({ progress: { successes: 1, failures: 1 } });
  const notice = nextRoundNotices(reminderItems(middle)).find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  assert.equal(notice.ability, "COS");
  assert.match(notice.instruction, /1S\/1F/i);
  const success = buildReminderResolutionPlan({ notice, items: reminderItems(middle), outcome: "passed", now: 200 });
  assert.equal(success.status, "ready");
  const update = success.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(update.options.mechanics.prismaticSprayIndigoProgress, {
    successes: 2, failures: 1, successThreshold: 3, failureThreshold: 3, terminal: null,
  });
  assert.equal(update.options.summaryParts[0].label, "TS Cos · 2S/1F");

  const thirdSuccess = conditionInstance({ progress: { successes: 2, failures: 0 } });
  const successNotice = nextRoundNotices(reminderItems(thirdSuccess)).find((entry) => entry.target?.id === "target");
  const successEnd = buildReminderResolutionPlan({
    notice: successNotice, items: reminderItems(thirdSuccess), outcome: "passed", now: 201,
  });
  assert.deepEqual(successEnd.operations.map((operation) => operation.type), ["condition:remove-instances"]);

  const thirdFailure = conditionInstance({ progress: { successes: 0, failures: 2 } });
  const failureNotice = nextRoundNotices(reminderItems(thirdFailure)).find((entry) => entry.target?.id === "target");
  const failureEnd = buildReminderResolutionPlan({
    notice: failureNotice, items: reminderItems(thirdFailure), outcome: "failed", now: 202,
  });
  assert.deepEqual(
    failureEnd.operations.map((operation) => operation.type),
    ["condition:add", "condition:automate", "condition:remove-instances"],
  );
  const petrified = failureEnd.operations.find((operation) => operation.conditionName === "Pietrificato");
  assert.ok(petrified);
  assert.equal(petrified.options.parentEffectId, "spray-instance");
});

test("D21–D26 — Viola usa l'inizio del prossimo turno del caster e non automatizza il piano", () => {
  const passed = prismaticSprayResolutionPlan({
    targetIds: ["target"], outcomes: { target: "passed" }, targetContexts: { target: { ray: "7" } },
  });
  assert.equal(passed.conditionApplications.length, 0);
  const violet = conditionInstance({ ray: "7" });
  assert.equal(violet.condition, "Accecato");
  assert.equal(violet.saveReminder.ability, "wis");
  assert.equal(violet.saveReminder.timing, "turn-start");
  assert.equal(violet.saveReminder.actor, "source");
  assert.equal(violet.summaryParts[0].label, "TS Sag · prossimo turno caster");

  const items = reminderItems(violet);
  const notices = nextRoundNotices(items);
  const notice = notices.find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  assert.equal(notice.ability, "SAG");
  const success = buildReminderResolutionPlan({ notice, items, outcome: "passed", now: 300 });
  assert.deepEqual(success.operations.map((operation) => operation.type), ["condition:remove-instances"]);

  const failure = buildReminderResolutionPlan({ notice, items, outcome: "failed", now: 301 });
  assert.deepEqual(
    failure.operations.map((operation) => operation.type),
    ["condition:add", "condition:automate", "condition:remove-instances"],
  );
  const information = failure.operations.find((operation) => operation.conditionName === "Spruzzo prismatico");
  assert.equal(information.options.summaryParts[0].label, "Trasferimento planare · GM");
  assert.equal(failure.operations.some((operation) => (
    operation.type.startsWith("teleport:")
    || operation.type.startsWith("scene:")
    || operation.type.startsWith("movement:")
  )), false);
  assert.deepEqual(failure.sideEffects, []);
});

test("E27–E33 — risultato 8 richiede due valori 1–7 e compone due conseguenze sullo stesso parent", () => {
  for (const context of [
    { ray: "8", rayA: "1", rayB: "2", damageA: 30, damageB: 40 },
    { ray: "8", rayA: "1", rayB: "6", damageA: 30 },
    { ray: "8", rayA: "6", rayB: "7" },
  ]) {
    const plan = prismaticSprayResolutionPlan({
      targetIds: ["target"], outcomes: { target: "failed" }, targetContexts: { target: context },
    });
    assert.equal(plan.valid, true, JSON.stringify(plan.errors));
    assert.equal(plan.targetPlans[0].branches.length, 2);
    assert.ok(plan.damageContributions.every((entry) => entry.targetId === "target"));
    assert.ok(plan.conditionApplications.every((entry) => entry.targetIds[0] === "target"));
    assert.equal(new Set(plan.conditionApplications.map((entry) => entry.options.effectId)).size, plan.conditionApplications.length);
  }
  for (const context of [
    { ray: "8", rayA: "1", damageA: 30 },
    { ray: "8", rayA: "8", rayB: "1", damageB: 30 },
  ]) {
    const plan = prismaticSprayResolutionPlan({
      targetIds: ["target"], outcomes: { target: "failed" }, targetContexts: { target: context },
    });
    assert.equal(plan.valid, false);
    assert.ok(plan.errors.some((error) => error.code === "prismatic-secondary-ray-invalid"));
  }
});

test("F34–F36 — più raggi/target condividono una sola execution plan composita e HP canonici", async () => {
  const command = commandFor({
    targetIds: ["target-a", "target-b", "target-c"],
    outcomes: { "target-a": "failed", "target-b": "passed", "target-c": "failed" },
    targetContexts: {
      "target-a": { ray: "1", damage: 30 },
      "target-b": { ray: "2", damage: 31 },
      "target-c": { ray: "8", rayA: "3", damageA: 20, rayB: "6" },
    },
  });
  assert.equal(command.valid, true, command.errors?.join(", "));
  const items = [
    { id: "caster", name: "Mago", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {} } },
    ...["target-a", "target-b", "target-c"].map((id) => ({
      id, name: id, position: { x: 100, y: 0 }, metadata: { [META_KEY]: { hp: 100, hpMax: 100 } },
    })),
  ];
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => "caster",
    createSpellInstanceId: async () => "spray-instance",
    validateSpatial: async () => ({ valid: true, errors: [] }),
  });
  assert.equal(plan.valid, true, plan.errors?.map((error) => error.message).join(", "));
  assert.deepEqual(plan.entries.map((entry) => [entry.item.id, entry.change.requested]), [
    ["target-a", 30], ["target-b", 15], ["target-c", 20],
  ]);
  assert.equal(plan.effectOperations.filter((operation) => operation.type === "spell:upsert").length, 0);
  assert.equal(plan.effectOperations.filter((operation) => operation.conditionName === "Trattenuto").length, 1);
  assert.equal(plan.effectOperations.find((operation) => operation.conditionName === "Trattenuto").options.parentEffectId, "spray-instance");
  assert.deepEqual(plan.nextStaticZoneItems, []);
  assert.equal(plan.staticZoneSceneItemIds.length, 0);
  assert.ok(plan.historyIds.includes("target-a"));
  assert.ok(plan.historyIds.includes("target-c"));
});

test("F37–F38 — condition rimossa rende il reminder stale e il marker blocca la doppia submission", () => {
  const indigo = conditionInstance({ progress: { successes: 0, failures: 0 } });
  const items = reminderItems(indigo);
  const notice = nextRoundNotices(items).find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  const staleItems = structuredClone(items);
  staleItems[1].metadata[META_KEY].conditions.instances = [];
  assert.equal(buildReminderResolutionPlan({ notice, items: staleItems, outcome: "passed" }).status, "stale");

  const resolvedItems = structuredClone(items);
  resolvedItems[1].metadata[META_KEY].reminderResolutions = {
    [notice.activationId]: { outcome: "passed", resolvedAt: 1 },
  };
  assert.equal(buildReminderResolutionPlan({ notice, items: resolvedItems, outcome: "passed" }).status, "already-resolved");
  assert.equal(nextRoundNotices(resolvedItems).some((entry) => entry.activationId === notice.activationId), false);
});

test("mutation — il doppio raggio mantiene child indipendenti nella stessa mutazione e l'Undo shared può ripristinarli", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    targetContexts: { target: { ray: "8", rayA: "6", rayB: "7" } },
    automation: getAreaSaveAutomation(spell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    validateSpatial: false,
  });
  const operations = saveSpellResolutionOperations({
    resolution, instanceId: "spray-instance", casterName: "Mago", spellExpiry: { mode: "manual" },
  });
  const mutation = buildEffectsMutationPlan([
    { id: "caster", name: "Mago", spells: [], concentrations: {}, conditions: [] },
    { id: "target", name: "Bersaglio", spells: [], concentrations: {}, conditions: [] },
  ], preparedOperations(operations));
  const target = mutation.states.find((state) => state.id === "target");
  assert.deepEqual(target.conditions.map((entry) => entry.condition).sort(), ["Accecato", "Trattenuto"]);
  assert.equal(new Set(target.conditions.map((entry) => entry.parentEffectId)).size, 1);
  assert.equal(target.conditions.every((entry) => entry.parentEffectId === "spray-instance"), true);
  assert.equal(mutation.changes.length, 1);
  assert.deepEqual(mutation.changes[0].before.conditions, []);
});
