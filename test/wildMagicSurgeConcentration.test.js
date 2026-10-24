// Wild Magic Surge (PHB 2014): "if that effect is a spell ... and it normally requires concentration, it doesn't
// require concentration in this case; the spell lasts for its full duration".
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { spellForCastContext } = await import("../src/spellCastContextCore.js");
const { buildSpellUnifiedPanelRouteQuery, routeSpellUnifiedPanelOpenRequest } = await import("../src/spellUnifiedPanelRoutingCore.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { executeSpellUnifiedLifecycle } = await import("../src/spellUnifiedLifecycleAdapter.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");

const META_KEY = "com.thebigpicture.initiative/meta";

test("only the spell the surge cast loses its concentration", () => {
  const levitate = getSpellDefinition("levitate");
  assert.equal(levitate.concentration, true);
  assert.equal(spellForCastContext(levitate, { withoutConcentration: "levitate" }).concentration, false);
  assert.equal(spellForCastContext(levitate, { withoutConcentration: "fly" }).concentration, true, "another spell keeps it");
  assert.equal(spellForCastContext(levitate, {}), levitate);
  assert.equal(levitate.concentration, true, "the catalog is never changed");
});

test("the surge's route opens the panel on the spell without concentration", () => {
  const query = buildSpellUnifiedPanelRouteQuery({ sourceId: "sor", casterId: "sor", spellId: "confusion", withoutConcentration: true });
  assert.equal(query.get("concentration"), "none");
  const route = routeSpellUnifiedPanelOpenRequest(Object.fromEntries(query));
  assert.equal(route.contract.spell.concentration, false);
  assert.equal(route.session.castContext.withoutConcentration, "confusion");
  assert.equal(routeSpellUnifiedPanelOpenRequest({ spellId: "confusion", casterId: "sor" }).contract.spell.concentration, true);
});

test("the lifecycle cast of Levitate tracks no concentration", async () => {
  const castContext = { withoutConcentration: "levitate" };
  const contract = buildSpellUnifiedPanelContract({ spellId: "levitate", castContext });
  const session = { ...createSpellPanelSession({ contract, casterId: "sor", targetIds: ["sor"] }), castContext };
  let request = null;
  await executeSpellUnifiedLifecycle({
    contract,
    session,
    runtime: {
      spell: getSpellDefinition("levitate"),
      executor: async (next) => { request = next; return ["sor"]; },
    },
  });
  assert.equal(request.spell.concentration, false);
  assert.equal(request.requestedConcentration, false);
});

test("the area cast of Fog Cloud registers no concentration and keeps the sorcerer's own", async () => {
  const items = [
    { id: "sor", name: "Zefiro", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp: 20, hpMax: 20, inInitiative: true } } },
  ];
  const plan = async (castContext) => {
    const command = buildSpellAreaResolutionCommand({
      contract: buildSpellUnifiedPanelContract({ spellId: "fog-cloud", phase: "cast", castContext: { slotLevel: 1, ...castContext } }),
      spellId: "fog-cloud",
      phase: "cast",
      source: { kind: "cast", sceneEpoch: 3 },
      casterId: "sor",
      slotLevel: 1,
      castContext: { slotLevel: 1, ...castContext },
      targetIds: [],
      candidateTargetIds: [],
      targetLocked: true,
      sceneEpoch: 3,
      currentSceneEpoch: 3,
      validateSpatial: false,
    });
    assert.equal(command.valid, true, JSON.stringify(command.errors));
    return buildSpellAreaResolutionExecutionPlan(command, {
      sceneEpoch: 3,
      isCurrent: () => true,
      readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
      readAllItems: async () => items,
      readSceneMetadata: async () => ({}),
      getInitiativeActorId: async () => null,
      createSpellInstanceId: async () => "instance",
    });
  };
  const concentrationOps = (result) => (result.effectOperations || [])
    .filter((operation) => /^concentration:/u.test(operation.type) || operation.conc === true);
  const usual = await plan({});
  assert.equal(usual.valid, true, JSON.stringify(usual.errors));
  assert.ok(concentrationOps(usual).length > 0, "an ordinary Fog Cloud is concentration");
  const surge = await plan({ withoutConcentration: "fog-cloud" });
  assert.equal(surge.valid, true, JSON.stringify(surge.errors));
  assert.deepEqual(concentrationOps(surge), [], "no concentration made, none broken");
});
