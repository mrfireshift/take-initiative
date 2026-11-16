// Lot T4a of docs/STUDIO_AZIONI_DI_TURNO.md (decision A1): the features that grant Dash, Disengage, Hide or Help as a
// bonus action do it from their card in Capacità, through the Azioni tab's command, with their cost and their name in it.
// The command end to end: test/pcAttackExecutionIntegration.test.js.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { buildPcTurnActionMutation } = await import("../src/pcAttackTurnActionCore.js");
const { PC_TURN_ACTION_VIAS, pcTurnActionViaBlocker, pcTurnActionViaKinds, planPcTurnActionVia } = await import("../src/pcAttackTurnActionViaCore.js");
const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
const { pcAttackFeatureForm, pcAttackFeatureRequest, pcAttackFeatureState, pcAttackFeatureUsable } = await import("../src/pcAttackFeatureFormCore.js");
const { pcAttackFeatureEntries } = await import("../src/pcAttackPickerCore.js");
const { DRUNKEN_TECHNIQUE_PILL, movementReactionEvents } = await import("../src/opportunityAttackCore.js");
const { turnActionSummary } = await import("../src/pc-attack.js");

const META = "com.thebigpicture.initiative/meta";
const CUNNING = "ladro-azione-scaltra";
const WIND = "monaco-ki-passo-del-vento";
const TACTICS = "ladro-pianificatore-maestro-di-tattiche";
const ADRENALINE = "specie-orco-multiverso-scarica-di-adrenalina";
const EAGLE = "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila";
const creature = (id, card = {}, meta = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "IMAGE", layer: "CHARACTER",
  position: { x: 0, y: 0 }, metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, attitude: "pc", initiativeCard: card, ...meta } } });
const rogue = (meta = {}) => creature("vex", { characterBuild: [{ classId: "ladro", level: 3, subclassId: "ladro-pianificatore" }] }, meta);
const monk = (meta = {}) => creature("kai", { characterBuild: [{ classId: "monaco", level: 2 }] }, meta);
const orc = (meta = {}) => creature("grok", { characterBuild: [{ classId: "guerriero", level: 4 }], species: { id: "orco-multiverso" } }, meta);
const barbarian = (meta = {}) => creature("brok", { characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-combattente-totemico" }],
  classFeaturesConfigured: true, enabledClassFeatureIds: ["barbaro-ira", "barbaro-difesa-senza-armatura", "barbaro-cammino-del-combattente-totemico-spirito-totemico", EAGLE] }, meta);
const turnOf = (id) => ({ round: 2, order: [id, "goblin"], current: 0 });
const command = (item, kind, via, extra = {}) => buildPcTurnActionMutation({ kind, sourceItem: item, attackInstanceId: `${kind}-${via}`,
  turnState: turnOf(item.id), via, ...extra });

test("the ten features of A1 and the actions they grant; every id is a feature of the catalog", () => {
  assert.deepEqual(Object.keys(PC_TURN_ACTION_VIAS).filter((id) => !getClassFeatureDefinition(id)), [], "no stale id");
  assert.deepEqual(pcTurnActionViaKinds(CUNNING), ["dash", "disengage", "hide"]);
  assert.deepEqual(pcTurnActionViaKinds(WIND), ["dash", "disengage"]);
  assert.deepEqual(pcTurnActionViaKinds("specie-goblin-fuga-agile"), ["disengage", "hide"]);
  assert.deepEqual(pcTurnActionViaKinds(TACTICS), ["help"]);
  assert.deepEqual(pcTurnActionViaKinds("monaco-via-del-maestro-ubriaco-tecnica-dell-ubriaco"), [], "Drunken Technique: its pill is the Disengage");
});

test("Azione Scaltra: the Azioni tab's Disengage, its name in the label and the log; nothing to spend", () => {
  const plan = command(rogue(), "disengage", CUNNING);
  assert.equal(plan.options.label, "Vex: Disimpegno (Azione Scaltra)");
  assert.deepEqual(plan.causality.turnAction.via, { featureId: CUNNING, name: "Azione Scaltra" });
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["condition:add", "condition:automate"], "the Disengage's own pill");
  assert.equal(plan.operations[0].conditionName, "Disimpegno");
  assert.throws(() => command(rogue(), "dodge", CUNNING), /non dà questa azione/u);
  assert.throws(() => command(monk(), "dash", CUNNING), /non è nella scheda/u);
  assert.throws(() => command(rogue(), "dash", CUNNING, { turnState: { round: 2, order: ["goblin", "vex"], current: 0 } }),
    /Solo nel turno della creatura/u, "the action's own checks first");
});

test("Passo del Vento: the Dash and its ki in one command; no ki left, no action", () => {
  const plan = command(monk(), "dash", WIND);
  assert.equal(plan.options.label, "Kai: Scatto (Passo del Vento)");
  const resource = plan.operations.find((operation) => operation.type === "class-feature:adjust-resource");
  assert.deepEqual([resource.pool.id, resource.adjustment.delta, resource.sourceId], ["monaco-punti-ki", -1, "kai"]);
  assert.equal(plan.causality.turnAction.via.spent, "Punti Ki 1/2");
  assert.equal(plan.options.metadataPatches.length, 1, "the dash of the movement panel, as the Azioni tab's");
  const spent = monk({ classFeatureState: { version: 1, resources: { "monaco-punti-ki": { current: 0 } }, instances: [] } });
  assert.match(pcTurnActionViaBlocker({ featureId: WIND, kind: "dash", sourceItem: spent, turnState: turnOf("kai") }), /nessun uso rimasto \(Punti Ki\)/u);
  assert.throws(() => command(spent, "disengage", WIND), /nessun uso rimasto/u);
  assert.equal(command(monk(), "dash", "").causality.turnAction.via, undefined, "the Azioni tab's own Dash, as before");
});

test("Scarica di adrenalina: the Dash, its use and the temporary hit points of its trait; more already, none added", () => {
  const pool = getClassFeatureDefinition(ADRENALINE).resourceCosts[0].poolId;
  const plan = command(orc(), "dash", ADRENALINE);
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["class-feature:adjust-resource", "hp:set"]);
  assert.equal(plan.operations[0].pool.id, pool);
  const [update] = plan.operations[1].updates;
  assert.deepEqual([update.itemId, update.hp, update.hpMax, update.tempHp, update.hpIntent.amount], ["grok", 30, 30, 2, 2], "PB 2 at the 4th level");
  assert.deepEqual(plan.causality.turnAction.via.tempHp, { amount: 2, after: 2 });
  const more = command(orc({ tempHp: 5 }), "dash", ADRENALINE);
  assert.deepEqual(more.operations.map((operation) => operation.type), ["class-feature:adjust-resource"], "they do not add up");
  assert.match(more.causality.turnAction.via.warning, /Ha già 5 PF temporanei/u);
  assert.throws(() => command(orc({ hp: 0 }), "dash", ADRENALINE), /a 0 PF non si può usare/u);
});

test("Spirito Totemico dell'Aquila: the Dash only while it is active, with Rage", () => {
  assert.match(pcTurnActionViaBlocker({ featureId: EAGLE, kind: "dash", sourceItem: barbarian(), turnState: turnOf("brok") }), /solo mentre è attivo/u);
  const raging = barbarian({ classFeatureState: { version: 1, resources: {}, instances: [
    { instanceId: "eagle-1", featureId: EAGLE, sourceId: "brok", targetIds: ["brok"], startedRound: 2 }] } });
  assert.equal(command(raging, "dash", EAGLE).options.label, "Brok: Scatto (Spirito Totemico: Aquila)");
});

test("Maestro di Tattiche: the Help on the enemy selected, «Bersaglio dell'aiuto» as the Azioni tab's", () => {
  const goblin = creature("goblin", {}, { attitude: "enemy" });
  const plan = command(rogue(), "help", TACTICS, { targetItem: goblin, mode: "attack" });
  assert.equal(plan.options.label, "Vex: Aiuto (Maestro di Tattiche) → Goblin");
  assert.equal(plan.operations[0].conditionName, "Bersaglio dell'aiuto");
});

test("the card in Capacità: the action to choose, Hide's Stealth, Help's mode; off when spent or without Rage", () => {
  const state = (item) => pcAttackFeatureState(item.metadata[META].initiativeCard, item.metadata[META].classFeatureState,
    [getClassFeatureDefinition(CUNNING), getClassFeatureDefinition(WIND), getClassFeatureDefinition(EAGLE), getClassFeatureDefinition(TACTICS)], 2);
  const cunning = pcAttackFeatureForm(getClassFeatureDefinition(CUNNING), state(rogue()));
  assert.deepEqual([cunning.kind, cunning.label, cunning.call, cunning.selectionTargets], ["turn-action", "Usa", "turn-action", false]);
  assert.deepEqual(cunning.fields.map((field) => [field.id, field.type, field.showWhen?.value || ""]), [["action", "select", ""], ["stealth", "number", "hide"]]);
  assert.deepEqual(cunning.fields[0].options.map((option) => option.label), ["Scatto", "Disimpegno", "Nascondersi"]);
  assert.equal(cunning.note, "Scatto, Disimpegno o Nascondersi della scheda Azioni, come azione bonus.");
  assert.equal(pcAttackFeatureUsable(getClassFeatureDefinition(CUNNING)), true, "a button, not a text to read");
  assert.equal(pcAttackFeatureEntries(rogue().metadata[META].initiativeCard).find((entry) => entry.featureId === CUNNING).mode, "activate");
  const wind = pcAttackFeatureForm(getClassFeatureDefinition(WIND), state(monk()));
  assert.equal(wind.note, "Scatto o Disimpegno della scheda Azioni, come azione bonus (Punti Ki −1). Per il turno raddoppia anche la distanza dei salti.");
  const noKi = monk({ classFeatureState: { version: 1, resources: { "monaco-punti-ki": { current: 0 } }, instances: [] } });
  assert.equal(pcAttackFeatureForm(getClassFeatureDefinition(WIND), state(noKi)).disabledReason, "Nessun uso rimasto (Punti Ki).");
  assert.equal(pcAttackFeatureForm(getClassFeatureDefinition(EAGLE), state(barbarian())).disabledReason,
    "Solo in Ira: Spirito Totemico: Aquila arriva con l'Ira.");
  const tactics = pcAttackFeatureForm(getClassFeatureDefinition(TACTICS), state(rogue()));
  assert.deepEqual([tactics.selectionTargets, tactics.fields.map((field) => field.id)], [true, ["mode"]]);
});

test("Usa sends the Azioni tab's request with the feature: the action, Hide's total, Help's creature and mode", () => {
  const form = pcAttackFeatureForm(getClassFeatureDefinition(CUNNING), {});
  const request = (values, targetIds) => pcAttackFeatureRequest(getClassFeatureDefinition(CUNNING), form, values, { sourceId: "vex", targetIds });
  assert.deepEqual(request({}), { turnAction: { kind: "dash", via: CUNNING } }, "the first action when none is chosen");
  assert.deepEqual(request({ action: "hide", stealth: "17" }), { turnAction: { kind: "hide", via: CUNNING, stealth: 17 } });
  assert.deepEqual(request({ action: "hide", stealth: "" }), { turnAction: { kind: "hide", via: CUNNING } });
  const tactics = pcAttackFeatureForm(getClassFeatureDefinition(TACTICS), {});
  const help = (values, targetIds) => pcAttackFeatureRequest(getClassFeatureDefinition(TACTICS), tactics, values, { sourceId: "vex", targetIds });
  assert.match(help({}, []).error, /Seleziona sulla mappa una sola creatura/u);
  assert.deepEqual(help({ mode: "attack" }, ["goblin"]), { turnAction: { kind: "help", via: TACTICS, targetId: "goblin", mode: "attack" } });
  assert.deepEqual(help({}, ["mira"]).turnAction.mode, "check");
});

test("the status names the feature and what it spent; Adrenaline Rush's temporary hit points after", () => {
  assert.equal(turnActionSummary({ turnAction: { kind: "dash", dashes: 1, via: { featureId: WIND, name: "Passo del Vento", spent: "Punti Ki 1/2" } },
    target: { id: "kai", name: "Kai" } }), "Registrato: Scatto di Kai (Passo del Vento · Punti Ki 1/2), uno scatto in più nel riquadro Movimento.");
  assert.equal(turnActionSummary({ turnAction: { kind: "dash", via: { name: "Scarica di adrenalina", spent: "Scarica di adrenalina 1/2",
    tempHp: { amount: 2, after: 2 } } }, target: { name: "Grok" } }),
  "Registrato: Scatto di Grok (Scarica di adrenalina · Scarica di adrenalina 1/2), uno scatto in più nel riquadro Movimento. 2 PF temporanei.");
  assert.equal(turnActionSummary({ turnAction: { kind: "disengage", condition: "Disimpegno" }, target: { name: "Vex" } }),
    "Registrato: Disimpegno di Vex, niente attacchi di opportunità fino alla fine del turno.", "the Azioni tab's own, as before");
});

test("Tecnica dell'Ubriaco: its pill is the Disengage for the opportunity attacks; Sentinel still reacts", () => {
  const positioned = (item, x) => ({ ...item, position: { x, y: 0 } });
  const distance = (a, b) => Math.abs(a.position.x - b.position.x);
  const drunk = (conditions) => positioned(creature("kai", {}, { attitude: "enemy", conditions: { version: 2, instances: conditions } }), 1.5);
  const plain = positioned(creature("bram"), 0);
  const sentinel = positioned(creature("guard", { characterBuild: [{ classId: "guerriero", level: 5 }], feats: [{ id: "sentinella" }] }), 0);
  const leave = (mover) => movementReactionEvents({ mover, path: [{ x: 1.5, y: 0 }, { x: 6, y: 0 }], others: [plain, sentinel], distance });
  assert.deepEqual(leave(drunk([])), [{ trigger: "move-leave", moverId: "kai", reactorIds: ["bram", "guard"] }]);
  assert.equal(DRUNKEN_TECHNIQUE_PILL, "Tecnica dell'Ubriaco");
  assert.deepEqual(leave(drunk([{ id: "dt-1", condition: DRUNKEN_TECHNIQUE_PILL, active: true }])),
    [{ trigger: "move-leave", moverId: "kai", reactorIds: ["guard"] }], "only Sentinel reacts, as to a Disengage");
});
