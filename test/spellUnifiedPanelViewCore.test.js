import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCatalogFilters,
  buildCatalogViewModel,
  dedupeCatalogEntries,
} from "../src/spellUnifiedPanelCatalogView.js";
import {
  buildSpellUnifiedPanelContract,
  changeSpellPanelPhase,
  changeSpellPanelSpell,
  createSpellPanelSession,
  updateSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const CASTERS = [
  { value: "caster-a", label: "Caster A" },
  { value: "caster-b", label: "Caster B" },
];

const TARGETS = [
  { key: "target-a", label: "Target A", subtitle: "Creatura" },
  { key: "target-b", label: "Target B", subtitle: "Creatura" },
];

function contract(spellId, options = {}) {
  return buildSpellUnifiedPanelContract({ spellId, ...options });
}

function modelFor(spellId, sessionPatch = {}, options = {}) {
  const currentContract = contract(spellId, options.contractOptions);
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-a",
    ...sessionPatch,
  });
  return buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    catalogEntries: options.catalogEntries || [],
    selectedCatalogKey: spellId,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
  });
}

test("catalogo UI deduplica per chiave e deriva i filtri dai dati", () => {
  const entries = [
    { key: "a", label: "A", flags: { concentration: true, targeting: true } },
    { key: "a", label: "A duplicato", flags: { active: true } },
    { key: "b", label: "B", flags: { placement: true, automated: true } },
  ];
  assert.deepEqual(dedupeCatalogEntries(entries).map((entry) => entry.key), ["a", "b"]);
  assert.deepEqual(
    buildCatalogFilters(entries).map((filter) => filter.id),
    ["all", "concentration", "automated", "targeting", "placement"],
  );
  const view = buildCatalogViewModel({ entries, query: "b" });
  assert.deepEqual(view.visibleEntries.map((entry) => entry.key), ["b"]);
  assert.equal(view.visibleEntries[0].selected, false);
  assert.equal(buildCatalogViewModel({ entries, selectedKey: "a" }).selectedConcentration, true);
});

test("i sette esempi UI espongono soltanto capacità normalizzate", () => {
  const cases = [
    ["fireball", { policy: "required", mode: "geometric" }],
    ["bane", { policy: "unavailable", mode: "discrete" }],
    ["chain-lightning", { primary: true, mode: "discrete" }],
    ["arcane-hand", { hasTokens: true, active: true }],
    ["phb2014-raffica-di-spine", { phase: true, manual: false }],
    ["xanathar-investitura-della-fiamma", { policy: "automatic", hasZones: true }],
    ["xanathar-sfera-della-tempesta", { policy: "required", zoneTrigger: false }],
  ];
  for (const [spellId, expectation] of cases) {
    const view = modelFor(spellId, {}, {
      catalogEntries: [{ key: spellId, label: spellId }],
    });
    if (expectation.policy) assert.equal(view.placement.policy, expectation.policy, spellId);
    if (expectation.mode) assert.equal(view.targets.mode, expectation.mode, spellId);
    if (expectation.primary) assert.equal(view.targets.primary.required, true, spellId);
    if (expectation.hasTokens) assert.equal(view.execution.hasTokens, true, spellId);
    if (expectation.hasZones) assert.equal(view.execution.hasZones, true, spellId);
    if (expectation.active) assert.equal(view.active.visible, true, spellId);
    if (expectation.phase) assert.equal(view.context.phase.visible, true, spellId);
    if (Object.hasOwn(expectation, "manual")) {
      assert.equal(view.manual.visible, expectation.manual, spellId);
    }
    if (Object.hasOwn(expectation, "zoneTrigger")) {
      assert.equal(view.zone.visible, expectation.zoneTrigger, spellId);
    }
  }
});

test("Muro di Fuoco proietta le scelte di placement nel modello visuale", () => {
  const initial = modelFor("wall-of-fire");
  assert.deepEqual(
    initial.placement.choices.map((choice) => choice.value),
    ["line-hot-left", "line-hot-right", "ring-hot-inside", "ring-hot-outside"],
  );
  assert.equal(initial.placement.choice, "");
  assert.equal(initial.placement.choiceRequired, true);

  const selected = modelFor("wall-of-fire", { variant: "line-hot-right" });
  assert.equal(selected.placement.choice, "line-hot-right");
  assert.equal(selected.placement.rules[0].shape, "line");
});

test("Catena di fulmini proietta gli step di selezione primaria e secondaria", () => {
  const primaryStep = modelFor("chain-lightning");
  assert.equal(primaryStep.targets.selection.mode, "primary-then-secondary");
  assert.equal(primaryStep.targets.selection.stage, "primary");
  assert.match(primaryStep.targets.selection.instruction, /primario/i);

  const secondaryStep = modelFor("chain-lightning", {
    targetIds: ["target-a"],
    primaryTargetId: "target-a",
  });
  assert.equal(secondaryStep.targets.selection.stage, "secondary");
  assert.equal(secondaryStep.targets.selection.resetVisible, true);
  assert.match(secondaryStep.targets.selection.instruction, /secondari/i);
});

test("zona e inserimento guidato compaiono solo con dati operativi reali", () => {
  const storm = contract("xanathar-sfera-della-tempesta");
  const view = buildUnifiedPanelViewModel({
    contract: storm,
    session: createSpellPanelSession({
      contract: storm,
      casterId: "caster-a",
    }),
    activeOverview: [{
      instanceId: "storm-1",
      name: "Sfera della Tempesta",
      persistent: {
        kind: "zone",
        state: "present",
        triggers: [{ label: "Fulmine" }],
      },
    }],
  });
  assert.equal(view.zone.visible, true);
  assert.equal(view.zone.runtime.visible, false);
  assert.equal(view.manual.visible, false);
});

test("la primary action e la visibilita bersagli derivano dal placement normalizzato", () => {
  const hand = modelFor("arcane-hand");
  assert.equal(hand.targets.visible, false);
  assert.equal(hand.workflow.primaryAction.id, "place");
  assert.equal(hand.workflow.primaryAction.label, "Posiziona pedina");

  const aura = modelFor("xanathar-investitura-della-fiamma");
  assert.equal(aura.targets.visible, false);
  assert.equal(aura.workflow.primaryAction.label, "Applica aura");

  const storm = modelFor("xanathar-sfera-della-tempesta", {
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpValues: { damage: 8 },
  });
  assert.equal(storm.workflow.primaryAction.label, "Posiziona area");
  const placedStorm = modelFor("xanathar-sfera-della-tempesta", {
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpValues: { damage: 8 },
    placement: { state: "confirmed", status: "confirmed", confirmed: true },
  });
  assert.equal(placedStorm.workflow.primaryAction.label, "Crea zona e applica");
});

test("i bersagli selezionati vengono proiettati in cima alla lista mantenendo l'ordine stabile", () => {
  const view = modelFor("fireball", { targetIds: ["target-b"] });
  assert.deepEqual(
    view.targets.candidates.map((target) => ({ key: target.key, selected: target.selected })),
    [
      { key: "target-b", selected: true },
      { key: "target-a", selected: false },
    ],
  );
});

test("un placement pendente espone conferma e annullamento senza riavviare la sagoma", () => {
  const view = modelFor("fireball", {
    placement: {
      state: "pending",
      status: "pending",
      requestId: "placement-1",
    },
  });
  assert.equal(view.placement.pending, true);
  assert.equal(view.placement.confirmVisible, true);
  assert.equal(view.placement.cancelVisible, true);
  assert.equal(view.placement.visibleAction, false);
});

test("Animare oggetti espone il progresso batch e blocca la conferma prima di N/N", () => {
  const view = modelFor("animate-objects", {
    castContext: {
      animatedObjects: { counts: { tiny: 1, large: 1 } },
    },
    placement: {
      state: "pending",
      status: "pending",
      requestId: "placement-batch",
      batchIndex: 1,
      batchTotal: 2,
    },
  });
  assert.equal(view.context.composition.visible, true);
  assert.deepEqual(view.context.composition.counts, { tiny: 1, large: 1 });
  assert.equal(view.placement.isBatch, true);
  assert.equal(view.placement.progressLabel, "1/2 oggetti posizionati");
  assert.equal(view.placement.batchComplete, false);
});

test("la preview HP usa i dati canonici e distingue pieno, meta e immune", () => {
  const currentContract = contract("fireball");
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-a",
    targetIds: ["failed", "passed", "immune"],
    outcomes: {
      failed: "failed",
      passed: "passed",
      immune: "immune",
    },
    hpValues: { damage: 20 },
  });
  const view = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    targetCandidates: [
      { key: "failed", label: "Fallito", hp: 20, hpMax: 20 },
      { key: "passed", label: "Superato", hp: 20, hpMax: 20 },
      { key: "immune", label: "Immune", hp: 20, hpMax: 20 },
    ],
  });

  assert.equal(view.effects.preview.mode, "damage");
  assert.deepEqual(
    view.effects.preview.targets.map((target) => ({
      key: target.key,
      factor: target.factor,
      beforeHP: target.beforeHP,
      afterHP: target.afterHP,
    })),
    [
      { key: "failed", factor: "full", beforeHP: 20, afterHP: 0 },
      { key: "passed", factor: "half", beforeHP: 20, afterHP: 10 },
      { key: "immune", factor: "immune", beforeHP: 20, afterHP: 20 },
    ],
  );
  assert.deepEqual(
    view.targets.candidates.map((target) => ({
      key: target.key,
      beforeHP: target.hpPreview?.beforeHP,
      afterHP: target.hpPreview?.afterHP,
    })),
    [
      { key: "failed", beforeHP: 20, afterHP: 0 },
      { key: "passed", beforeHP: 20, afterHP: 10 },
      { key: "immune", beforeHP: 20, afterHP: 20 },
    ],
  );
});

test("la preview healing usa il cap hpMax senza scrivere HP", () => {
  const currentContract = contract("mass-cure-wounds");
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-a",
    targetIds: ["ally"],
    hpValues: { healing: 12 },
  });
  const view = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    targetCandidates: [{ key: "ally", label: "Alleato", hp: 45, hpMax: 50 }],
  });

  assert.equal(view.effects.preview.mode, "heal");
  assert.equal(view.effects.preview.targets[0].beforeHP, 45);
  assert.equal(view.effects.preview.targets[0].afterHP, 50);
  assert.equal(view.effects.preview.targets[0].hpMax, 50);
});

test("la TargetMatrix conserva filtri nome/fazione e lock esplicito del placement", () => {
  const bane = contract("bane");
  const filtered = buildUnifiedPanelViewModel({
    contract: bane,
    session: createSpellPanelSession({
      contract: bane,
      targetIds: ["enemy"],
    }),
    targetCandidates: [
      { key: "enemy", label: "Goblin", faction: "hostile" },
      { key: "ally", label: "Alleato", faction: "friendly" },
    ],
    targetFilters: { name: "gob", factions: ["hostile"] },
  });
  assert.deepEqual(filtered.targets.candidates.map((target) => target.key), ["enemy"]);
  assert.deepEqual(filtered.targets.filters.factions, ["hostile"]);

  const fireball = contract("fireball");
  const locked = buildUnifiedPanelViewModel({
    contract: fireball,
    session: createSpellPanelSession({
      contract: fireball,
      targetIds: ["enemy"],
      placement: { state: "confirmed", status: "confirmed", confirmed: true, targetLocked: true },
    }),
    targetCandidates: [{ key: "enemy", label: "Goblin", faction: "hostile" }],
  });
  assert.equal(locked.placement.targetLocked, true);
  assert.equal(locked.placement.unlockVisible, true);
  assert.equal(locked.targets.candidates[0].disabled, true);
});

test("il view model conserva i reset runtime del contratto quando cambia fase o spell", () => {
  const fireball = contract("fireball");
  const dirty = createSpellPanelSession({
    contract: fireball,
    casterId: "caster-a",
    slotLevel: 9,
    targetIds: ["target-a"],
    primaryTargetId: "target-a",
    placement: { state: "confirmed", confirmed: true },
    outcomes: { "target-a": "failure" },
    feedback: { state: "info", message: "stale" },
  });
  const hail = contract("phb2014-raffica-di-spine");
  const afterSpell = changeSpellPanelSpell(dirty, hail, {
    validCasterIds: ["caster-a"],
    validSlotLevels: [1, 2, 3],
  });
  assert.deepEqual(afterSpell.targetIds, []);
  assert.equal(afterSpell.primaryTargetId, "");
  assert.equal(afterSpell.slotLevel, hail.presentation.slot.default);
  assert.equal(afterSpell.placement, null);
  assert.deepEqual(afterSpell.outcomes, {});

  const prepared = createSpellPanelSession({ contract: hail, casterId: "caster-a" });
  const resolved = changeSpellPanelPhase(prepared, hail, "resolve", {
    validCasterIds: ["caster-a"],
    validSlotLevels: [1, 2, 3],
  });
  assert.equal(resolved.phase, "resolve");
  assert.equal(resolved.casterId, "caster-a");
});

test("primary, feedback, HP e undo restano proiezioni del workflow", () => {
  const storm = contract("xanathar-sfera-della-tempesta");
  const initial = createSpellPanelSession({
    contract: storm,
    casterId: "caster-a",
    feedback: { state: "error", message: "placement richiesto dal test" },
    undoState: { state: "unavailable", available: false },
  });
  const initialView = buildUnifiedPanelViewModel({
    contract: storm,
    session: initial,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
  });
  assert.equal(initialView.workflow.primaryAction.id, "complete");
  assert.equal(initialView.workflow.feedback.state, "error");
  assert.equal(initialView.workflow.undo.capable, true);
  assert.equal(initialView.workflow.undo.available, false);
  assert.equal(initialView.execution.hasHP, true);
  assert.equal(initialView.execution.hasZones, true);
  assert.equal(initialView.manual.visible, false);
  assert.equal(initialView.effects.visible, true);
  assert.deepEqual(initialView.effects.fields.map((field) => field.id), ["damage"]);

  const committed = updateSpellPanelSession(initial, {
    placement: { state: "confirmed", confirmed: true },
    targetIds: ["target-a"],
    outcomes: { "target-a": "success" },
    damageValue: 7,
    undoState: { state: "available", available: true },
    feedback: { state: "success", message: "ok" },
  });
  const committedView = buildUnifiedPanelViewModel({
    contract: storm,
    session: committed,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
  });
  assert.equal(committedView.workflow.undo.capable, true);
  assert.equal(committedView.workflow.undo.available, true);
  assert.equal(committedView.workflow.undo.disabled, false);
  assert.equal(committedView.workflow.feedback.state, "success");
});

test("il ViewModel collega concentrazione corrente e overview attivi read-only", () => {
  const current = contract("bless");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
  });
  const view = buildUnifiedPanelViewModel({
    contract: current,
    session,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
    concentrationSummary: [{ name: "Benedizione", targetCount: 1 }],
    activeOverview: [{
      key: "instance-1",
      name: "Benedizione",
      casterName: "Caster A",
      targetNames: ["Target A"],
      durationLabel: "10 round",
      concentrating: true,
      actionLabels: ["Termina"],
    }],
  });

  assert.deepEqual(view.context.concentration.summary, [
    { name: "Benedizione", targetCount: 1 },
  ]);
  assert.equal(view.active.visible, true);
  assert.equal(view.active.overview[0].name, "Benedizione");
  assert.deepEqual(view.active.overview[0].targetNames, ["Target A"]);
});

test("senza nuova spell il pannello mantiene catalogo, overview attivi e primary esplicita", () => {
  const view = buildUnifiedPanelViewModel({
    contract: null,
    session: createSpellPanelSession({ contract: null }),
    activeOverview: [{
      instanceId: "active-1",
      name: "Benedizione",
      casterName: "Caster A",
      durationLabel: "10 round",
    }],
  });

  assert.equal(view.spell.label, "Seleziona un incantesimo");
  assert.equal(view.active.visible, true);
  assert.equal(view.active.overview[0].name, "Benedizione");
  assert.equal(view.targets.visible, false);
  assert.equal(view.workflow.primaryAction.id, "select-spell");
  assert.equal(view.workflow.primaryAction.disabled, true);
  assert.equal(view.workflow.validation.firstInvalidField, "spell");
});

test("il ViewModel seleziona l'azione runtime e delega i controlli complessi al popup", () => {
  const current = contract("xanathar-sfera-della-tempesta");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    activeInstanceId: "storm-1",
    activeActionId: "storm-sphere-lightning",
    activeActionState: {
      state: "selected",
      instanceId: "storm-1",
      actionId: "storm-sphere-lightning",
    },
  });
  const view = buildUnifiedPanelViewModel({
    contract: current,
    session,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
    activeOverview: [{
      instanceId: "storm-1",
      name: "Sfera della Tempesta",
      casterName: "Caster A",
      context: { spellId: "xanathar-sfera-della-tempesta", zoneItemId: "root-1" },
      actions: [{
        id: "storm-sphere-lightning",
        type: "manual",
        label: "Fulmine",
        buttonLabel: "Fulmine",
        resolutionKind: "single-attack",
        subjectMode: "none",
        requiresZoneRoot: true,
        available: true,
      }],
    }],
  });

  assert.equal(view.active.selectedInstanceId, "storm-1");
  assert.equal(view.active.selectedAction.id, "storm-sphere-lightning");
  assert.equal(view.active.primaryAction.id, "resolve-active-action");
  assert.equal(view.active.primaryAction.disabled, false);
  assert.equal(view.targets.visible, false);
  assert.equal(view.placement.visible, false);
});

test("un'azione attiva manuale mantiene nel pannello soltanto il targeting richiesto", () => {
  const current = contract("heat-metal");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    activeInstanceId: "heat-1",
    activeActionId: "heat-metal-repeat",
    activeActionState: {
      state: "selected",
      instanceId: "heat-1",
      actionId: "heat-metal-repeat",
    },
  });
  const view = buildUnifiedPanelViewModel({
    contract: current,
    session,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
    activeOverview: [{
      instanceId: "heat-1",
      name: "Riscaldare il Metallo",
      actions: [{
        id: "heat-metal-repeat",
        type: "manual",
        label: "Ripeti calore",
        subjectMode: "selected",
        requiresTargets: true,
        maxTargets: 1,
        available: true,
      }],
    }],
  });
  assert.equal(view.targets.visible, true);
  assert.equal(view.targets.mode, "discrete");
  assert.equal(view.active.primaryAction.id, "resolve-active-action");
});

test("il controllo automazioni deriva dalla capacità normalizzata", () => {
  const current = contract("bless");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
    applyAutomatedConditions: false,
  });
  const view = buildUnifiedPanelViewModel({
    contract: current,
    session,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
  });

  assert.equal(view.context.automation.applyVisible, true);
  assert.equal(view.context.automation.applyAutomatedConditions, false);
});

test("il contesto di targeting resta indicizzato per bersaglio", () => {
  const current = contract("banishment");
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
    targetContext: {
      "target-a": { planeOrigin: "other-plane" },
    },
  });
  const view = buildUnifiedPanelViewModel({
    contract: current,
    session,
    casterOptions: CASTERS,
    targetCandidates: TARGETS,
  });

  assert.equal(view.targets.context.visible, true);
  assert.deepEqual(view.targets.context.targets, [{
    key: "target-a",
    label: "Target A",
    values: { planeOrigin: "other-plane" },
  }]);
});

test("i renderer non dipendono da spell ID, heuristics area o API di dominio", async () => {
  const paths = [
    "../src/spellUnifiedPanelCatalogView.js",
    "../src/spellUnifiedPanelContextView.js",
    "../src/spellUnifiedPanelTargetView.js",
    "../src/spellUnifiedPanelEffectsView.js",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.equal(/fireball|bane|chain-lightning|arcane-hand|areaCandidate|isChainLightningSpell|callLightningCloudPending/.test(source), false, path);
    assert.equal(/getSpellAreaRule|getSpellDefinition|applyOperation|boardToken/.test(source), false, path);
  }
});

test("la superficie accessibility dichiara combobox, focus attivo, phase pressed e live region", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/spellUnifiedPanelCatalogView.js", import.meta.url), "utf8"),
    readFile(new URL("../src/spellUnifiedPanelContextView.js", import.meta.url), "utf8"),
    readFile(new URL("../src/spellUnifiedPanelEffectsView.js", import.meta.url), "utf8"),
    readFile(new URL("../src/spellUnifiedPanelDom.js", import.meta.url), "utf8"),
  ]);
  const source = sources.join("\n");
  assert.match(source, /role:\s*"combobox"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /aria-live/);
  assert.match(source, /role,\s*\n\s*"aria-live"/);
});

test("il controller reale usa adapter e provider senza importare executor o regole area", async () => {
  const [html, controller] = await Promise.all([
    readFile(new URL("../spell-unified-panel.html", import.meta.url), "utf8"),
    readFile(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-popover-id="com\.thebigpicture\.initiative\/spells-modal"/);
  assert.doesNotMatch(html, /data-unified-dev-host/);
  assert.doesNotMatch(html, /spells-panel\.js|quick-hp-modal\.js/);
  assert.match(controller, /executeSpellUnifiedLifecycle/);
  assert.match(controller, /executeSpellUnifiedArea/);
  assert.match(controller, /requestSpellAreaPlacement/);
  assert.match(controller, /undoSpellUnifiedArea/);
  assert.match(controller, /createSpellUnifiedPanelSceneProvider/);
  assert.doesNotMatch(controller, /executeSpellApplication|applyOperation|getSpellAreaRule|getSpellAreaRules/);
  assert.match(controller, /executeSpellUnifiedBoardToken(StateUpdate|Recreate)/);
});
