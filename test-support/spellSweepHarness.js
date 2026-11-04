// The whole spell catalog, one cast at a time (docs/PIANO_POLISH_INCANTESIMI.md, lotto P0): every spell, every variant, a
// failed and a passed save, from the panel's own contract and command to the production Undo and the panel's Termina.
// A scene in memory, three tokens, the real effects coordinator and History owner. It needs
// --experimental-test-module-mocks, and it mocks the SDK for the whole process: import it before anything from src/.
import { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "./fakeVersionedIndexedDb.js";

const source = (path) => new URL(`../src/${path}`, import.meta.url).href;

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/plugin.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const CASTER = "caster";
const TARGET_ONE = "target-1";
const TARGET_TWO = "target-2";
const TOKENS = 3;
const START_HP = 40;
export const SWEEP_DAMAGE = 20;
export const SWEEP_HEALING = 15;

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const sceneState = { ready: true, metadata: {}, items: [] };
const readyListeners = new Set();
const broadcastListeners = new Map();
const itemChangeListeners = new Set();
const currentItems = (ids) => {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items.filter((item) => !wanted || wanted.has(item?.id)).map(clone);
};
const emitItemsChange = () => {
  const items = sceneState.items.map(clone);
  for (const listener of [...itemChangeListeners]) {
    try { listener(items); } catch {}
  }
};
const sdkStub = {
  onReady: () => {},
  player: {
    getRole: async () => "GM",
    getSelection: async () => [],
    id: "gm",
    getId: async () => "gm",
    getName: async () => "GM",
    onChange: () => () => {},
  },
  party: { getPlayers: async () => [], onChange: () => () => {} },
  room: { id: "sweep-room", getMetadata: async () => ({}), setMetadata: async () => {}, onMetadataChange: () => () => {} },
  notification: { show: async () => "notification", close: async () => {} },
  popover: { open: async () => {}, close: async () => {}, setHeight: async () => {}, setWidth: async () => {} },
  action: { setBadgeText: async () => {}, setHeight: async () => {}, isOpen: async () => true, open: async () => {}, close: async () => {} },
  viewport: { getPosition: async () => ({ x: 0, y: 0 }), getScale: async () => 1, getWidth: async () => 1000, getHeight: async () => 800 },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) { readyListeners.add(listener); return () => readyListeners.delete(listener); },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => { sceneState.metadata = { ...sceneState.metadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m", digits: 1 }, raw: "1.5m" }),
      getDistance: async (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / 150,
      getType: async () => "SQUARE",
      getMeasurement: async () => "CHEBYSHEV",
      snapPosition: async (position) => position,
      onChange: () => () => {},
    },
    local: { getItems: async () => [], addItems: async () => {}, deleteItems: async () => {}, updateItems: async () => {}, onChange: () => () => {} },
    items: {
      getItems: async (predicateOrIds) => {
        if (!predicateOrIds) return currentItems();
        if (Array.isArray(predicateOrIds)) return currentItems(predicateOrIds);
        if (typeof predicateOrIds === "function") return sceneState.items.filter(predicateOrIds).map(clone);
        return currentItems();
      },
      updateItems: async (predicateOrIds, updater) => {
        let targets = [];
        if (typeof predicateOrIds === "function") targets = sceneState.items.filter(predicateOrIds).map(clone);
        else if (Array.isArray(predicateOrIds)) {
          const wanted = new Set(predicateOrIds.map((entry) => (typeof entry === "string" ? entry : entry?.id)));
          targets = sceneState.items.filter((item) => wanted.has(item.id)).map(clone);
        } else targets = sceneState.items.map(clone);
        await updater(targets);
        const byId = new Map(targets.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        emitItemsChange();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        emitItemsChange();
      },
      addItems: async (items) => { sceneState.items.push(...clone(items || [])); emitItemsChange(); },
      getItemAttachments: async () => [],
      getItemBounds: async () => ({ min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, center: { x: 0, y: 0 }, width: 1, height: 1 }),
      onChange(listener) { itemChangeListeners.add(listener); return () => itemChangeListeners.delete(listener); },
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};
let builtItems = 0;
const fluentBuilder = (type) => (...initial) => {
  const fields = { type, initial };
  const builder = new Proxy({}, {
    get(_, key) {
      if (key !== "build") return (...args) => { fields[key] = args.length <= 1 ? args[0] : args; return builder; };
      return () => {
        builtItems += 1;
        return {
          ...fields,
          id: fields.id || `built-${builtItems}`,
          layer: fields.layer || "DRAWING",
          position: fields.position || { x: 0, y: 0 },
          metadata: clone(fields.metadata) || {},
          name: fields.name || "",
        };
      };
    },
  });
  return builder;
};
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: fluentBuilder("LABEL"),
    buildImage: fluentBuilder("IMAGE"),
    buildPath: fluentBuilder("PATH"),
    buildText: fluentBuilder("TEXT"),
    buildShape: fluentBuilder("SHAPE"),
    buildCurve: fluentBuilder("CURVE"),
    buildLine: fluentBuilder("LINE"),
    Command: { MOVE: 0, LINE: 1, QUAD: 2, CONIC: 3, CUBIC: 4, CLOSE: 5 },
    isImage: () => false,
  },
});
const clientEffects = await import(`${source("effectsMutations.js")}?sweep-client`);
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import(`${source("effectsMutations.js")}?sweep-background`);
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import(`${source("effectsMutations.js")}?sweep-base`);
mock.module(source("effectsMutations.js"), {
  exports: {
    ...baseEffects,
    EFFECTS_MUTATION_STATUS: clientEffects.EFFECTS_MUTATION_STATUS,
    runEffectsMutation: clientEffects.runEffectsMutation,
    undoEffectsMutation: clientEffects.undoEffectsMutation,
    hasPendingEffectsHistory: clientEffects.hasPendingEffectsHistory,
    flushPendingEffectsHistory: clientEffects.flushPendingEffectsHistory,
  },
});
const history = await import(`${source("history.js")}?sweep-history`);
const historyOwner = await import(`${source("historyOwner.js")}?sweep-owner`);
mock.module(source("history.js"), { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import(source("sceneEpoch.js"));
const { spellCastTemporaryHpRollRange } = await import(source("spellTemporaryHpRules.js"));
const { buildSpellUnifiedPanelContract, createSpellPanelSession, buildSpellPanelViewModel } = await import(source("spellUnifiedPanelCore.js"));
const { buildUnifiedPanelViewModel } = await import(source("spellUnifiedPanelViewCore.js"));
const { buildSpellUnifiedAreaCommand, getSpellUnifiedAreaEligibility } = await import(source("spellUnifiedAreaAdapter.js"));
const { buildSpellUnifiedLifecycleRequest, getSpellUnifiedLifecycleEligibility } = await import(source("spellUnifiedLifecycleAdapter.js"));
const { executeSpellAreaResolution } = await import(source("spellAreaResolutionExecutor.js"));
const { executeSpellApplication } = await import(source("spellApplicationExecutor.js"));
const srd = await import(source("spells-srd.js"));
const { getSpellAreaRuleForPlacement, getSpellAreaPlacementChoices } = await import(source("spellAreaRules.js"));
const { getSpellCastPhaseOptions } = await import(source("spellCastPhaseCore.js"));
const { getSpellSaveWorkflowChoiceOptions, getSpellSaveWorkflowTargetContext } = await import(source("spellSaveWorkflowRules.js"));
const { spellOverviewGroups } = await import(source("spellsPanelViewCore.js"));
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import(source("historyUndoResultCore.js"));
const { spellEffectStandsAlone } = await import(source("effectLabelCore.js"));
const { getEffectiveConditionInstances } = await import(source("conditions.js"));

export const sweepCatalog = () => srd.getSpellCatalog();

async function resetScene() {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: { round: 1, current: 0, order: [CASTER, TARGET_ONE, TARGET_TWO] },
    "com.thebigpicture.initiative/history": { version: 1, roomId: "sweep-room", entries: [] },
  };
  const token = (id, name, x, extra = {}) => ({
    id,
    name,
    type: "IMAGE",
    layer: "CHARACTER",
    visible: true,
    position: { x, y: 600 },
    image: { width: 150, height: 150 },
    grid: { dpi: 150, offset: { x: 75, y: 75 } },
    scale: { x: 1, y: 1 },
    metadata: {
      [META_KEY]: {
        hp: START_HP,
        hpMax: 60,
        inInitiative: true,
        attitude: "enemy",
        creatureType: "umanoide",
        conditions: [],
        [CONCENTRATION_KEY]: {},
        [SPELLS_KEY]: [],
        ...extra,
      },
    },
  });
  sceneState.items = [
    token(CASTER, "Maga", 300, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "mago", level: 20 }], spellSaveDC: 15 } }),
    token(TARGET_ONE, "Bersaglio Uno", 600),
    token(TARGET_TWO, "Bersaglio Due", 750),
  ];
  markSceneEpochReady("sweep");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function converge() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!clientEffects.hasPendingEffectsHistory(sceneEpoch) && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)) return true;
  }
  return false;
}

const areaRuntime = () => ({
  getItems: sdkStub.scene.items.getItems,
  updateItems: sdkStub.scene.items.updateItems,
  deleteItems: sdkStub.scene.items.deleteItems,
  getSceneMetadata: sdkStub.scene.getMetadata,
  setSceneMetadata: sdkStub.scene.setMetadata,
  currentSceneEpoch,
  isCurrent: () => true,
  syncHPVisuals: async () => {},
  emitFireballVisual: async () => {},
  withItemMetaHistory: history.withItemMetaHistory,
});

// What the scene holds, without what is empty: an Undo may leave an empty list where there was nothing.
const pruned = (value) => {
  if (Array.isArray(value)) { const list = value.map(pruned); return list.length ? list : undefined; }
  if (value && typeof value === "object") {
    const object = {};
    for (const key of Object.keys(value).sort()) {
      const entry = pruned(value[key]);
      if (entry !== undefined && entry !== null) object[key] = entry;
    }
    return Object.keys(object).length ? object : undefined;
  }
  return value;
};
const sceneSnapshot = () => JSON.stringify(pruned(sceneState.items.map((item) => ({ id: item.id, metadata: item.metadata }))));
const metaOf = (id) => sceneState.items.find((item) => item.id === id)?.metadata?.[META_KEY] || {};
const conditionsOf = (id) => {
  const conditions = metaOf(id).conditions;
  return (Array.isArray(conditions) ? conditions : conditions?.instances || []).filter((entry) => entry && entry.active !== false);
};
const spellsOf = (id) => (Array.isArray(metaOf(id)[SPELLS_KEY]) ? metaOf(id)[SPELLS_KEY] : []);
const concentrationOf = (id) => Object.values(metaOf(id)[CONCENTRATION_KEY] || {});
const previewFor = (rule, targetIds) => {
  const shape = rule.geometry.shape;
  const cells = Math.max(1, Math.round((rule.geometry.size?.value || 1.5) / 1.5));
  return {
    type: shape,
    start: { x: 600, y: 600 },
    end: shape === "square" ? { x: 600 + cells * 150, y: 600 + cells * 150 } : { x: 600 + cells * 150, y: 600 },
    gridOrigin: { x: 0, y: 0 },
    dpi: 150,
    targetIds,
    targetLocked: true,
  };
};
const firstOption = (options, wanted) => {
  const values = (options || []).map((option) => (typeof option === "string" ? option : option?.value));
  for (const value of wanted) if (values.includes(value)) return value;
  return values[0] || "";
};
const withTimeout = (promise, label) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 4000); }),
  ]).finally(() => clearTimeout(timer));
};

// The inputs the panel would ask, for the spells that have their own.
function targetContextFor(id, targetIds, outcome) {
  const fields = getSpellSaveWorkflowTargetContext(id)?.fields || [];
  const values = Object.fromEntries(fields.filter((field) => field.required).map((field) => [field.id, field.options?.[0]?.value ?? ""]));
  if (id === "magic-missile") Object.assign(values, { darts: "3 3 3" });
  if (id === "prismatic-spray") Object.assign(values, { ray: "1", damage: SWEEP_DAMAGE });
  if (id === "xanathar-turbine") Object.assign(values, { turbineStrengthOutcome: outcome === "failed" ? "failed" : "passed" });
  return Object.keys(values).length ? Object.fromEntries(targetIds.map((target) => [target, values])) : {};
}

let keepRawConditions = false;
let slotOverride = null;

async function castOnce({ id, phase, variant, outcome }) {
  const spell = srd.getSpellDefinition(id);
  const slotLevel = slotOverride?.(id) ?? (spell.level > 0 ? spell.level : null);
  const contract = buildSpellUnifiedPanelContract({ spellId: id, phase, choiceValue: variant, castContext: { slotLevel } });
  const { presentation, execution } = contract;
  const mode = presentation.targeting?.mode;
  const subject = presentation.subjectMode;
  let targetIds = subject === "caster" || mode === "self" ? [CASTER]
    : mode === "none" || subject === "none" ? []
      : mode === "geometric" ? [TARGET_ONE, TARGET_TWO] : [TARGET_ONE];
  const limit = presentation.targeting?.limit?.maximum;
  if (Number.isInteger(limit) && limit > 0) targetIds = targetIds.slice(0, limit);
  const outcomeMode = presentation.outcomes?.mode;
  const options = presentation.outcomes?.options || [];
  const saveValue = firstOption(outcomeMode === "attack" ? [] : options, outcome === "failed" ? ["failed"] : ["passed"]);
  const attackValue = outcomeMode === "attack"
    ? firstOption(options, outcome === "failed" ? ["hit"] : ["miss"])
    : firstOption(presentation.outcomes?.attackOptions || [], outcome === "failed" ? ["hit"] : ["miss"]);
  const outcomes = saveValue && (presentation.inputs?.outcomes?.visible || presentation.inputs?.outcomes?.required)
    ? Object.fromEntries(targetIds.map((target) => [target, saveValue])) : {};
  let placement = null;
  const policy = presentation.placement?.policy;
  if (["required", "optional"].includes(policy) && presentation.placement?.ruleId) {
    const ruleId = presentation.placement.ruleId;
    const choices = getSpellAreaPlacementChoices(id);
    const placementChoice = choices.some((choice) => choice.value === variant) ? variant : choices[0]?.value || variant;
    placement = {
      status: "confirmed",
      confirmed: true,
      ruleId,
      ruleChoice: placementChoice || variant,
      spellId: id,
      casterId: CASTER,
      targetLocked: true,
      targetIds,
      preview: previewFor(getSpellAreaRuleForPlacement(ruleId, placementChoice), targetIds),
    };
  }
  const session = createSpellPanelSession({
    contract,
    spellId: id,
    phase,
    variant,
    casterId: CASTER,
    slotLevel,
    targetIds,
    primaryTargetId: presentation.inputs?.primaryTarget?.visible || presentation.inputs?.primaryTarget?.required ? targetIds[0] || "" : "",
    outcomes,
    attackOutcome: attackValue,
    targetContext: targetContextFor(id, targetIds, outcome),
    placement,
    castContext: { slotLevel },
    hpValues: {
      damage: SWEEP_DAMAGE,
      healing: SWEEP_HEALING,
      // The lowest roll of the die: False Life's 1d4 starts from 1, Bear's Endurance's 2d6 from 2.
      temporaryHp: spellCastTemporaryHpRollRange(presentation.inputs?.temporaryHp?.die)?.min ?? 1,
      hp: SWEEP_DAMAGE,
      ...(presentation.inputs?.primaryDamage?.required || presentation.inputs?.primaryDamage?.visible ? { primaryDamage: SWEEP_DAMAGE } : {}),
    },
  });
  const view = buildSpellPanelViewModel(contract, session);
  const damageField = buildUnifiedPanelViewModel({
    contract,
    session,
    casterOptions: [{ value: CASTER, label: "Maga" }],
    targetCandidates: [TARGET_ONE, TARGET_TWO].map((key) => ({ key, label: key, subtitle: "Creatura" })),
  }).effects?.fields?.find((field) => field.id === "damage");
  const record = {
    id,
    phase,
    variant,
    outcome,
    lane: execution?.lane,
    mode,
    policy,
    recordOnly: execution?.recordOnly === true,
    castHasHP: execution?.castHasHP === true,
    hasZones: execution?.hasZones === true,
    concentration: spell.concentration === true,
    primary: view.primaryAction?.label,
    primaryDisabled: view.primaryAction?.disabled === true,
    invalid: view.validation?.valid === false ? (view.validation.errors || []).map((error) => error.field || error) : [],
    askedSave: !!saveValue && !!(presentation.inputs?.outcomes?.visible || presentation.inputs?.outcomes?.required),
    castSave: presentation.outcomes?.save?.ability || "",
    damageLabel: damageField?.label || "",
    damageHint: damageField?.hint || "",
  };
  const historyBefore = (await history.getHistoryEntries()).length;
  if (execution?.lane === "area-transaction" || (execution?.lane === "spell-lifecycle" && execution?.hasTokens === true)) {
    const eligibility = getSpellUnifiedAreaEligibility(contract, session);
    if (!eligibility.eligible) return { ...record, refused: eligibility.code };
    const command = buildSpellUnifiedAreaCommand({
      contract,
      session,
      source: { sceneEpoch: currentSceneEpoch(), commandId: `sweep-${builtItems}-${Date.now()}` },
      candidateTargetIds: [CASTER, TARGET_ONE, TARGET_TWO],
      spatialValidation: {
        casterDistancesMeters: { [CASTER]: 0, [TARGET_ONE]: 3, [TARGET_TWO]: 3 },
        pairwiseDistancesMeters: [{ targetIds: [TARGET_ONE, TARGET_TWO], distanceMeters: 1.5 }],
        primaryDistanceMeters: 3,
        secondaryDistancesMeters: { [TARGET_TWO]: 1.5 },
      },
    });
    if (!command.valid) return { ...record, commandInvalid: (command.errors || []).map((error) => error.code || error) };
    const result = await withTimeout(executeSpellAreaResolution(command, areaRuntime()), "area");
    record.status = result.status;
    if (result.status !== "applied") record.errors = (result.errors || []).map((error) => error.code || error.message || error);
  } else if (execution?.lane === "spell-lifecycle") {
    const eligibility = getSpellUnifiedLifecycleEligibility(contract);
    if (!eligibility.eligible) return { ...record, refused: eligibility.code };
    const request = buildSpellUnifiedLifecycleRequest({ contract, session, spell, casterName: "Maga" });
    const result = await withTimeout(executeSpellApplication({ ...request, sceneEpoch: currentSceneEpoch() }), "lifecycle");
    record.status = result?.status || "applied";
  } else {
    return { ...record, refused: `lane:${execution?.lane}` };
  }
  record.converged = await converge();
  record.historyAdded = (await history.getHistoryEntries()).length - historyBefore;
  record.hp = { caster: metaOf(CASTER).hp, one: metaOf(TARGET_ONE).hp, two: metaOf(TARGET_TWO).hp };
  record.pills = [CASTER, TARGET_ONE, TARGET_TWO].flatMap((item) => spellsOf(item).map((pill) => ({
    item,
    name: pill.name,
    turns: pill.turns,
    expiry: pill.expiry?.mode,
    phase: pill.castContext?.phase,
    instanceId: pill.instanceId,
  })));
  record.concentrating = concentrationOf(CASTER).map((entry) => entry.name || entry.spellId);
  record.conditions = [CASTER, TARGET_ONE, TARGET_TWO].flatMap((item) => conditionsOf(item).map((condition) => ({
    item,
    name: condition.condition || condition.name,
    kind: condition.effectKind,
    parent: condition.parentEffectId,
    expiry: condition.expiry?.mode,
    remaining: condition.expiry?.remaining,
    effectId: condition.effectId,
    type: condition.type,
    spellId: condition.spellId,
    manualRemoval: condition.manualRemoval === true,
  })));
  if (keepRawConditions) {
    // Every saved field but the ones that change at each run: to compare two versions of a spell.
    record.rawConditions = [CASTER, TARGET_ONE, TARGET_TWO].flatMap((item) => conditionsOf(item)
      .map(({ id: _id, createdAt: _createdAt, appliedAt: _appliedAt, parentEffectId, ...rest }) => ({ item, ...rest, parent: !!parentEffectId })));
  }
  record.zones = sceneState.items.length - TOKENS;
  // The card shows a buff or a debuff only inside the pill of its spell, on that creature (initiativeCardCompact.js).
  record.hidden = [CASTER, TARGET_ONE, TARGET_TWO].flatMap((item) => {
    const instances = new Set(spellsOf(item).map((pill) => pill.instanceId));
    return getEffectiveConditionInstances({ instances: conditionsOf(item) })
      .filter((condition) => ["buff", "debuff"].includes(condition.effectKind)
        && !String(condition.effectId || "").startsWith("buff:")
        && !instances.has(condition.parentEffectId)
        && !spellEffectStandsAlone(condition, [...instances]))
      .map((condition) => `${item}: ${condition.condition || condition.name}`);
  });
  return record;
}

async function undoLast(before) {
  const entries = await history.getHistoryEntries();
  if (!entries.length) return { undo: "no-entry", undoRestores: sceneSnapshot() === before };
  const result = normalizeHistoryUndoResult(await withTimeout(
    history.undoHistoryThrough(entries[entries.length - 1].id, { sceneEpoch: currentSceneEpoch() }),
    "undo",
  ));
  await converge();
  return {
    undo: result.outcome === HISTORY_UNDO_OUTCOME.COMMITTED ? "ok" : result.outcome,
    undoRestores: sceneSnapshot() === before,
  };
}

// The panel's Termina (terminateActiveSpell in spell-unified-panel.js), on what is left of the cast.
async function terminate(id) {
  const groups = spellOverviewGroups(sceneState.items.map(clone)).filter((group) => (group.spellId || "") === id);
  if (!groups.length) return { nothingToEnd: true };
  for (const group of groups) {
    const instanceId = String(group.instanceId || "").trim();
    const casterId = String(group.casterId || "").trim();
    const targetIds = group.targets instanceof Map ? [...group.targets.keys()] : [];
    const lifecycle = [...new Set([...targetIds, ...(group.castContext?.staticZoneOwner === true && casterId ? [casterId] : [])])];
    const operations = [];
    if (group.concentrating === true && casterId) {
      operations.push({ type: "concentration:break", casterIds: [casterId], reference: String(group.concentrationRef || instanceId || group.storedName || "").trim() });
    }
    const removals = (group.effectInstances || [])
      .map((entry) => ({ itemId: String(entry?.itemId || "").trim(), parentEffectId: instanceId }))
      .filter((entry) => entry.itemId && entry.parentEffectId);
    if (removals.length) operations.push({ type: "condition:remove-parent-effects", removals });
    operations.push(instanceId
      ? { type: "spell:remove-instance", targetIds: lifecycle, instanceId }
      : { type: "spell:remove-name-source", targetIds: lifecycle, name: group.storedName, casterId });
    await withTimeout(clientEffects.runEffectsMutation(operations, {
      kind: "spell",
      label: "Terminato",
      targetIds: [...new Set([casterId, ...lifecycle])],
      sideEffects: instanceId ? [{ type: "static-zone:remove-ended", selectors: [{ instanceId }] }] : [],
    }), "terminate");
  }
  await converge();
  const instances = new Set(groups.map((group) => group.instanceId));
  const left = [CASTER, TARGET_ONE, TARGET_TWO].flatMap((item) => [
    ...spellsOf(item).filter((pill) => pill.spellId === id).map((pill) => `${item}: ${pill.name}`),
    ...conditionsOf(item).filter((condition) => instances.has(condition.parentEffectId)).map((condition) => `${item}: ${condition.condition || condition.name}`),
  ]);
  return { left, zones: sceneState.items.length - TOKENS, concentrating: concentrationOf(CASTER).length };
}

// Every run the catalog asks for. spellIds narrows it; quiet stops the History's debug logs for the length of the sweep.
export async function runSpellSweep({ spellIds = null, quiet = true, keepRaw = false, slotFor = null } = {}) {
  keepRawConditions = keepRaw;
  slotOverride = slotFor;
  const wanted = spellIds ? new Set(spellIds) : null;
  const silenced = ["log", "info", "warn", "error", "debug"];
  const originals = Object.fromEntries(silenced.map((name) => [name, console[name]]));
  const swallowRejection = () => {};
  if (quiet) silenced.forEach((name) => { console[name] = () => {}; });
  process.on("unhandledRejection", swallowRejection);
  const records = [];
  try {
    for (const entry of srd.getSpellCatalog().filter((candidate) => !wanted || wanted.has(candidate.id))) {
      const id = entry.id;
      const spell = srd.getSpellDefinition(id);
      const variants = [...new Set([
        ...srd.getAreaSaveRuleChoices(spell).map((choice) => choice.value),
        ...srd.getSpellEffectChoices(spell).map((choice) => choice.value),
        ...(getSpellSaveWorkflowChoiceOptions(id) || []).map((choice) => choice.value),
      ])];
      const placementVariants = getSpellAreaPlacementChoices(id).map((choice) => choice.value);
      const phaseOptions = getSpellCastPhaseOptions(spell).map((option) => option.value);
      const phase = phaseOptions[0] || "cast";
      for (const variant of variants.length ? variants : placementVariants.length ? placementVariants : [""]) {
        for (const outcome of ["failed", "passed"]) {
          let record = { id, phase, variant, outcome };
          try {
            await resetScene();
            const before = sceneSnapshot();
            record = await castOnce({ id, phase, variant, outcome });
            if (record.status === "applied") {
              record.changed = sceneSnapshot() !== before;
              Object.assign(record, await undoLast(before));
              if (outcome === "failed") {
                await resetScene();
                const again = await castOnce({ id, phase, variant, outcome });
                if (again.status === "applied") record.terminated = await terminate(id);
              }
            }
          } catch (error) {
            record.thrown = String(error?.message || error).slice(0, 200);
          }
          records.push(record);
        }
      }
    }
  } finally {
    if (quiet) silenced.forEach((name) => { console[name] = originals[name]; });
    process.off("unhandledRejection", swallowRejection);
    historyOwner.unmountHistoryOwner();
    backgroundEffects.unmountEffectsMutationCoordinatorService();
  }
  return records;
}

// What a run shows as wrong, one line per kind of defect. The sweep decides nothing by itself: the test keeps the list of
// what is known, with its reason (test/spellCatalogSweep.test.js).
export function sweepFindings(records) {
  const findings = new Map();
  const add = (kind, record, detail = "") => {
    const key = `${kind}:${record.id}`;
    if (!findings.has(key)) findings.set(key, { key, kind, id: record.id, variant: record.variant, outcome: record.outcome, detail });
  };
  for (const record of records) {
    if (record.thrown) add("throw", record, record.thrown);
    if (record.refused) add("refused", record, record.refused);
    if (record.commandInvalid) add("command-invalid", record, record.commandInvalid.join(", "));
    if (record.primaryDisabled) add("panel-blocked", record, `${record.primary} [${record.invalid.join(", ")}]`);
    if (record.status && !["applied", "noop"].includes(record.status)) add("rejected", record, (record.errors || []).join(", "));
    if (record.converged === false) add("history-pending", record);
    if (record.status !== "applied") continue;
    if (record.changed && !record.historyAdded) add("no-history", record);
    if (record.undo && !["ok", "no-entry"].includes(record.undo)) add("undo-failed", record, record.undo);
    if (record.undoRestores === false) add("undo-differs", record);
    if (record.hidden?.length) add("hidden-effect", record, record.hidden.join(" | "));
    if (record.outcome === "failed" && record.concentration && !record.recordOnly && !record.concentrating?.length) add("no-concentration", record);
    if (record.outcome === "failed" && !record.changed && !record.recordOnly) add("no-effect", record);
    const terminated = record.terminated;
    if (terminated && !terminated.nothingToEnd && (terminated.left?.length || terminated.zones || terminated.concentrating)) {
      add("termina-leaves", record, JSON.stringify(terminated));
    }
    if (record.castHasHP && record.mode !== "self" && record.outcome === "failed" && record.hp.one === START_HP && !record.hp.two) add("no-hp-change", record);
  }
  return [...findings.values()];
}
