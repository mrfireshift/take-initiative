// CAP-ORIGIN: actions that do not start from the caster. Lotto O1, Rampicante Afferrante, and lotto O2, Segugio fedele:
// a token on the map, its actions measured from it, its turn prompts and the hound's 30 m leash (D5). Lotto O3, Soffio
// del Drago: the breath in the attack console of the creature that carries the pill.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

// The console's turn controller reads the SDK: a stand-in, as in pcAttackTurnController.test.js.
mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, broadcast: { onMessage: () => () => {} } },
  buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { pcAttackTurnReady } = await import("../src/pcAttackTurnController.js");

import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellActiveResolutionPayload,
  resolveSpellActiveResolutionDamage,
  spellActiveResolutionActionForCast,
  spellActiveResolutionDamageFormula,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenPlacementRule,
  spellBoardTokenAssetPath,
  spellBoardTokenAssetPixelSize,
} from "../src/spellBoardTokenCore.js";
import { spellTurnPromptNeedsDistance, spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import { spellBoardTokenCompanionsByCasterId } from "../src/spellBoardTokenTrackerCore.js";
import { buildSpellActiveActionPlan, getSpellOverviewActions } from "../src/spellActiveActionCore.js";
import { getAreaSaveAutomation, getSpellEffects, getSpellSummaryParts } from "../src/spells-srd.js";
import { getSpellAreaRuleById, getSpellAreaRules } from "../src/spellAreaRules.js";
import { spellActionDamageTypes } from "../src/spellDamageDefenseCore.js";
import {
  DRAGON_BREATH_TYPES,
  dragonBreathDice,
  isSpellGrantActionId,
  spellGrantInstanceId,
  spellGrantedActionForItem,
  spellGrantedActionsForItem,
} from "../src/spellGrantedActionsCore.js";
import { pcAttackAction, pcAttackResolvedAction, pcAttackSaveLabel } from "../src/pcAttackCore.js";
import { pcAttackPickerEntries } from "../src/pcAttackPickerCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const VINE = "phb2014-rampicante-afferrante";
const HOUND = "faithful-hound";
const CAST_TURN = "1:0:caster";
const NEXT_TURN = "2:0:caster";

const action = (spellId, id) => getSpellDefinition(spellId).activeActions.find((entry) => entry.id === id);

// The caster with the spell's pill (castContext.boardToken, as the executor writes it) and the spell's token.
function scene(spellId, { conc = spellId === VINE } = {}) {
  return [
    {
      id: "caster", name: "Maga", layer: "CHARACTER",
      metadata: { [META_KEY]: { [SPELLS_KEY]: [{
        name: getSpellDefinition(spellId).name, spellId, instanceId: "cast-1", casterId: "caster",
        appliedAt: { round: 1, actorId: "caster", turnKey: CAST_TURN },
        ...(conc ? { conc: true } : {}),
        castContext: { boardToken: true, slotLevel: 4 },
      }] } },
    },
    {
      id: "token", layer: "PROP",
      metadata: { [SPELL_BOARD_TOKEN_META_KEY]: {
        kind: "spell-board-token", spellId, instanceId: "cast-1", casterId: "caster", slotLevel: 4, state: { revision: 0 },
      } },
    },
  ];
}

const requests = (items, turnKey, distanceMeters = null) => spellTurnPromptRequests({
  items, actorId: "caster", sceneEpoch: 3, turnKey, distanceMeters,
});

test("il rampicante e il segugio sono pedine entro 9 m, con le immagini compresse dell'utente", () => {
  for (const [spellId, file] of [[VINE, "spell-token-grasping-vine.webp"], [HOUND, "spell-token-faithful-hound.webp"]]) {
    const rule = getSpellBoardTokenPlacementRule(spellId);
    assert.equal(rule.id, `${spellId}:board-token`);
    assert.deepEqual(rule.placement.range, { value: 9, unit: "m", measure: "range" });
    assert.equal(spellBoardTokenAssetPath(spellId), `/${file}`);
    assert.equal(spellBoardTokenAssetPixelSize(spellId), 1024);
    const asset = new URL(`../public/${file}`, import.meta.url);
    assert.ok(existsSync(asset), file);
    assert.ok(statSync(asset).size < 260 * 1024, `${file} resta leggero`);
    assert.equal(readFileSync(asset).subarray(8, 12).toString("latin1"), "WEBP");
    // The cast places the token: no target, no save, no damage at the cast.
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: 4 } });
    assert.equal(contract.presentation.placement.ruleId, `${spellId}:board-token`);
    assert.equal(contract.presentation.inputs.targets.required, false);
    assert.equal(contract.presentation.inputs.outcomes.required, false);
  }
  assert.equal(getSpellDefinition(VINE).boardToken.concentration, true);
  assert.equal(getSpellDefinition(HOUND).boardToken.concentration, false);
  // In the tracker, under its caster: the vine acts with a bonus action, the hound costs nothing.
  const companions = spellBoardTokenCompanionsByCasterId([...scene(VINE).slice(1), {
    ...scene(HOUND)[1], id: "hound-token",
    metadata: { [SPELL_BOARD_TOKEN_META_KEY]: { ...scene(HOUND)[1].metadata[SPELL_BOARD_TOKEN_META_KEY], instanceId: "cast-2" } },
  }].map((item) => ({ ...item, layer: "PROP" })));
  assert.deepEqual(companions.get("caster").map((entry) => [entry.spellId, entry.actionLabel]),
    [[VINE, "(Azione Bonus)"], [HOUND, ""]]);
});

test("la frusta del rampicante: TS Destrezza entro 9 m dal rampicante, nessun danno, il trascinamento a mano", () => {
  const lash = action(VINE, "grasping-vine-lash");
  assert.deepEqual(validateSpellActiveResolutionAction(lash).errors, []);
  assert.equal(lash.resolutionKind, "single-save");
  assert.equal(lash.economy, "bonus-action");
  assert.equal(lash.rangeOrigin, "root");
  assert.deepEqual(lash.range, { value: 9, unit: "m" });
  assert.equal(lash.maxTargets, 1);
  assert.deepEqual(lash.save, { ability: "dex", onSuccess: "none" });
  assert.equal(lash.damage, undefined);
  assert.match(lash.failureNotice, /6 m.*rampicante.*token/u);
  // D6: nothing moves the token; the lash is available on the cast's turn, as the text gives it at the cast.
  assert.notEqual(lash.availableAfterCast, true);
});

test("il rampicante frusta già nel turno del lancio e poi a ogni turno del caster, dalla sua pedina", () => {
  const items = scene(VINE);
  for (const turnKey of [CAST_TURN, NEXT_TURN]) {
    const [request, ...rest] = requests(items, turnKey);
    assert.equal(rest.length, 0, turnKey);
    assert.equal(request.kind, "action", turnKey);
    assert.equal(request.payload.actionId, "grasping-vine-lash");
    assert.equal(request.payload.zoneItemId, "token");
  }
  assert.equal(spellTurnPromptNeedsDistance(items), false);
});

test("il segugio morde dal turno dopo il lancio, senza costo d'azione: 4d8 perforanti entro 1,5 m", () => {
  const bite = action(HOUND, "faithful-hound-bite");
  assert.deepEqual(validateSpellActiveResolutionAction(bite).errors, []);
  assert.equal(bite.resolutionKind, "single-attack");
  assert.equal(bite.economy, "gm");
  assert.equal(bite.rangeOrigin, "root");
  assert.deepEqual(bite.range, { value: 1.5, unit: "m" });
  assert.equal(bite.availableAfterCast, true);
  assert.equal(spellActiveResolutionDamageFormula({ action: bite, slotLevel: 4, outcome: "hit" }).scaledFormula, "4d8");
  assert.equal(spellActiveResolutionDamageFormula({ action: bite, slotLevel: 9, outcome: "hit" }).scaledFormula, "4d8",
    "the slot does not change the bite");
  assert.equal(resolveSpellActiveResolutionDamage({ action: bite, slotLevel: 4, outcome: "hit", roll: 18 }).amount, 18);
  assert.equal(resolveSpellActiveResolutionDamage({ action: bite, slotLevel: 4, outcome: "hit", roll: 18 }).type, "perforanti");

  const items = scene(HOUND);
  assert.deepEqual(requests(items, CAST_TURN), [], "not on the cast's turn");
  const [request, ...rest] = requests(items, NEXT_TURN);
  assert.equal(rest.length, 0);
  assert.equal(request.kind, "action");
  assert.equal(request.payload.actionId, "faithful-hound-bite");
  assert.equal(request.payload.zoneItemId, "token");
});

test("oltre 30 m dal segugio il promemoria offre il congedo al posto del morso (D5)", () => {
  const items = scene(HOUND);
  assert.equal(spellTurnPromptNeedsDistance(items), true);
  const measured = [];
  const at = (meters) => (from, to) => {
    measured.push([from.id, to.id]);
    return meters;
  };
  for (const meters of [null, 12, 30]) {
    const [request, ...rest] = requests(items, NEXT_TURN, at(meters));
    assert.equal(rest.length, 0, String(meters));
    assert.equal(request.payload?.actionId, "faithful-hound-bite", String(meters));
  }
  assert.deepEqual(measured[1], ["caster", "token"], "from the caster to the hound");
  const [beyond, ...rest] = requests(items, NEXT_TURN, at(30.5));
  assert.equal(rest.length, 0);
  assert.equal(beyond.kind, "choice");
  assert.equal(beyond.zoneItemId, "token");
  assert.match(beyond.choiceHint, /30 m/u);
  assert.deepEqual(beyond.actions.map((entry) => entry.actionId), ["faithful-hound-dismiss"]);
  assert.equal(beyond.actions[0].executionKind, "active-action");
});

test("il congedo del segugio chiude l'incantesimo, dal menu ⚡ come dal promemoria oltre 30 m", () => {
  const dismiss = action(HOUND, "faithful-hound-dismiss");
  assert.equal(dismiss.termination, true);
  assert.equal(dismiss.showInOverview, true);
  assert.match(dismiss.detail, /azione.*30 m/u);
  const plan = buildSpellActiveActionPlan({
    spell: getSpellDefinition(HOUND),
    actionId: "faithful-hound-dismiss",
    group: { instanceId: "cast-1", casterId: "caster", castContext: { boardToken: true } },
  });
  assert.equal(plan.valid, true, plan.errors?.join(", "));
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["spell:remove-instance"]);
  assert.equal(plan.operations[0].instanceId, "cast-1");
});

test("il testo del segugio: abbaia per una creatura Piccola o superiore, come nel manuale (D9)", () => {
  const reference = JSON.parse(readFileSync(new URL("../src/spell-reference-it.json", import.meta.url), "utf8"));
  const hound = reference.spells[HOUND];
  assert.match(hound.description, /di taglia Piccola o superiore si avvicina entro 9 metri/u);
  assert.doesNotMatch(hound.description, /Piccola o inferiore/u);
});

// Lotto O3: Dragon's Breath. The creature touched breathes with its own action, in its attack console (D1).
const BREATH = "xanathar-soffio-del-drago";
const bearer = (castContext, extra = {}) => ({
  id: "bearer", name: "Guerriera", type: "IMAGE", layer: "CHARACTER",
  metadata: { [META_KEY]: { hp: 30, hpMax: 30, inInitiative: true, [SPELLS_KEY]: [{
    spellId: BREATH, instanceId: "breath-1", casterId: "mage", name: "Soffio del Drago", castContext,
  }], ...extra } },
});

test("il Soffio del Drago sceglie l'energia al lancio, e la pill di chi soffia la dice", () => {
  const definition = getSpellDefinition(BREATH);
  assert.deepEqual(definition.effectChoices.map((choice) => choice.id), ["acid", "cold", "fire", "lightning", "poison"]);
  assert.deepEqual(definition.effectChoices.map((choice) => choice.label), ["Acido", "Freddo", "Fuoco", "Fulmine", "Veleno"]);
  const contract = buildSpellUnifiedPanelContract({ spellId: BREATH, phase: "cast", castContext: { slotLevel: 2 } });
  assert.equal(contract.presentation.inputs.variant.required, true);
  assert.equal(contract.presentation.inputs.targets.required, true);
  const [effect, ...rest] = getSpellEffects(BREATH, "fire");
  assert.equal(rest.length, 0, "one pill, not the generic one too");
  assert.equal(effect.id, "dragon-breath-action");
  assert.equal(effect.label, "Azione: soffio (fuoco)");
  assert.deepEqual(effect.summaryParts.map((part) => part.label), ["Soffio: fuoco"]);
  assert.match(effect.detail, /console attacchi/u);
});

test("chi porta la pill trova il soffio nella console: cono di 4,5 m dal suo token, CD del caster, metà se supera", () => {
  const item = bearer({ choice: "lightning", slotLevel: 2, spellSaveDC: 14 });
  const [raw, ...rest] = spellGrantedActionsForItem(item);
  assert.equal(rest.length, 0);
  assert.equal(isSpellGrantActionId(raw.id), true);
  assert.equal(spellGrantInstanceId(raw.id), "breath-1");
  assert.deepEqual(spellGrantedActionForItem(item, raw.id), raw);
  const action = pcAttackAction(raw);
  assert.equal(action.label, "Soffio del Drago (fulmine)");
  assert.deepEqual(action.components, [{ id: "c1", type: "lightning", formula: "3d6" }]);
  assert.equal(action.save, "dex");
  assert.equal(action.saveDC, 14);
  assert.equal(action.saveHalf, true);
  assert.deepEqual(action.area, { shape: "cone", sizeFeet: 15, origin: "self" });
  const resolved = pcAttackResolvedAction(action);
  assert.equal(resolved.area.manual, true);
  assert.equal(resolved.monster.half, true);
  assert.equal(pcAttackSaveLabel(resolved, { spellSaveDC: 9 }), "TS Destrezza (CD 14)", "the caster's DC, not the bearer's");
  const picker = pcAttackPickerEntries({}, { grantedActions: spellGrantedActionsForItem(item) });
  assert.deepEqual(picker.map((entry) => [entry.tab, entry.actionId, entry.label]), [["attacks", raw.id, "Soffio del Drago (fulmine)"]]);
  // A creature with nothing else on its card: the console opens on its turn for the breath.
  assert.equal(pcAttackTurnReady(item, () => ({})), true);
  assert.equal(pcAttackTurnReady({ ...item, metadata: { [META_KEY]: {} } }, () => ({})), false);
});

test("il soffio cresce di 1d6 per slot sopra il 2°, ogni energia ha il suo tipo, e senza CD o tipo resta al tavolo", () => {
  assert.deepEqual([2, 3, 5, 9].map(dragonBreathDice), ["3d6", "4d6", "6d6", "10d6"]);
  for (const type of DRAGON_BREATH_TYPES) {
    const [raw] = spellGrantedActionsForItem(bearer({ choice: type.id, slotLevel: 3, spellSaveDC: 13 }));
    assert.deepEqual(pcAttackAction(raw).components, [{ id: "c1", type: type.id, formula: "4d6" }], type.id);
  }
  assert.deepEqual(spellGrantedActionsForItem(bearer({ choice: "fire", slotLevel: 2 })), [], "no DC");
  assert.deepEqual(spellGrantedActionsForItem(bearer({ slotLevel: 2, spellSaveDC: 13 })), [], "no energy");
  assert.deepEqual(spellGrantedActionsForItem({ id: "x", metadata: {} }), []);
});

// Lotto O4: Freezing Sphere's kept globe. The executor's side (the throw, the pill dismissed, Undo) is in
// spellSlotSpendUndo.test.js, with the real History.
test("la Sfera congelante si lancia come prima o trattiene il globo, e il pulsante lo dice", async () => {
  const { buildSpellPanelViewModel } = await import("../src/spellUnifiedPanelCore.js");
  const { getSpellCastPhasePlan, isPreparedSpellCast, spellPreparedRoundSummaryParts } = await import("../src/spellCastPhaseCore.js");
  const spell = getSpellDefinition("freezing-sphere");
  const contract = (phase) => buildSpellUnifiedPanelContract({
    spellId: "freezing-sphere", phase, castContext: { slotLevel: 7, ...(phase === "cast" ? {} : { phase }) },
  });
  assert.equal(contract("cast").presentation.phase.selected, "cast");
  assert.equal(contract("cast").execution.lane, "area-transaction");
  assert.equal(contract("prepare").execution.lane, "spell-lifecycle");
  assert.deepEqual(contract("resolve").presentation.phase.options.map((option) => option.label), ["Esplosione del globo"]);
  assert.equal(contract("resolve").presentation.placement.ruleId, "freezing-sphere:cast");
  const button = (phase) => buildSpellPanelViewModel(contract(phase), {
    spellId: "freezing-sphere", phase, casterId: "c", slotLevel: 7, targetIds: phase === "prepare" ? ["c"] : [],
  }).primaryAction;
  assert.equal(button("prepare").label, "Trattieni il globo");
  assert.equal(button("cast").label, "Posiziona area");
  // A cast with no phase in its context is the old cast, never a kept globe; the globe's pill grows with the slot.
  assert.equal(getSpellCastPhasePlan(spell, "", { slotLevel: 6 }).phase, "cast");
  assert.equal(getSpellCastPhasePlan(spell, "", { slotLevel: 6, phase: "prepare" }).phase, "prepare");
  assert.equal(isPreparedSpellCast({ spell, castContext: {}, casterId: "c", targetIds: ["c"] }), false);
  assert.equal(isPreparedSpellCast({ spell, castContext: { phase: "prepare" }, casterId: "c", targetIds: ["c"] }), true);
  const [globe] = getSpellCastPhasePlan(spell, "prepare", { slotLevel: 8 }).effects;
  assert.equal(globe.label, "Globo di Otiluke / 12d6 freddo");
  assert.match(globe.detail, /12 m.*18 m.*TS Costituzione.*1 minuto/u);
  // The round it explodes at: 1 minute after the cast, only for the kept globe and only in initiative.
  assert.deepEqual(spellPreparedRoundSummaryParts(spell, { phase: "prepare" }, { round: 4 }).map((part) => part.label), ["Esplode al round 14"]);
  assert.deepEqual(spellPreparedRoundSummaryParts(spell, { phase: "prepare" }, null), []);
  assert.deepEqual(spellPreparedRoundSummaryParts(spell, { phase: "cast" }, { round: 4 }), []);
  assert.deepEqual(spellPreparedRoundSummaryParts(getSpellDefinition("symbol"), { phase: "prepare" }, { round: 4 }), []);
  // The smites keep their own words.
  const smite = buildSpellUnifiedPanelContract({ spellId: "phb2014-colpo-intrappolante", phase: "prepare", castContext: { slotLevel: 1, phase: "prepare" } });
  assert.equal(buildSpellPanelViewModel(smite, { spellId: "phb2014-colpo-intrappolante", phase: "prepare", casterId: "c", slotLevel: 1, targetIds: ["c"] })
    .primaryAction.label, "Prepara incantesimo");
});

// Lotto O6: the Illusory Dragon, a token. Its appearance frightens the creatures the GM ticks, the damage type of its breath
// is chosen at the cast, the breath starts from the dragon's edge, and who discerned the illusion has advantage.
const DRAGON = "xanathar-drago-illusorio";

test("il Drago illusorio è una pedina enorme entro 36 m, con l'immagine dell'utente, che si muove di 18 m", () => {
  const rule = getSpellDefinition(DRAGON).boardToken;
  assert.equal(rule.spaceCells, 3);
  assert.equal(rule.sizeCategory, "Huge");
  assert.equal(rule.movementMeters, 18);
  assert.equal(rule.speedCheck, true, "its moves count on the caster's turn, as Bigby's hand's");
  assert.notEqual(rule.flies, true);
  assert.equal(rule.concentration, true);
  assert.equal(rule.hasHitPoints, undefined, "attacks miss it, it is immune: no hit points");
  assert.equal(spellBoardTokenAssetPath(DRAGON), "/spell-token-illusory-dragon.webp");
  assert.ok(statSync(new URL("../public/spell-token-illusory-dragon.webp", import.meta.url)).size < 200 * 1024);
  assert.deepEqual(getSpellBoardTokenPlacementRule(DRAGON).placement.range, { value: 36, unit: "m", measure: "range" });
  // The cast: the token first, then the enemies that can see it, their Wisdom save; the damage type is the cast's choice.
  const contract = buildSpellUnifiedPanelContract({ spellId: DRAGON, phase: "cast", castContext: { slotLevel: 8 } });
  assert.equal(contract.presentation.placement.ruleId, `${DRAGON}:board-token`);
  assert.equal(contract.presentation.targeting.selectionMode, "post-placement");
  assert.equal(contract.presentation.targeting.maximum, null, "as many enemies as see it");
  assert.equal(contract.presentation.inputs.outcomes.required, true);
  assert.deepEqual(contract.presentation.choices.area.map((choice) => choice.value),
    ["acid", "cold", "fire", "lightning", "necrotic", "poison"]);
  assert.deepEqual(getSpellAreaRules(DRAGON, { triggerType: "cast" }), [], "no cone at the cast any more");
});

test("la paura del Drago illusorio: Spaventato per 1 minuto, con il TS a fine turno senza linea di vista", () => {
  for (const type of ["acid", "necrotic"]) {
    const [frightened] = getAreaSaveAutomation(DRAGON, type).failed;
    assert.equal(frightened.condition, "Spaventato", type);
    assert.deepEqual(frightened.expiry, { mode: "rounds", remaining: 10 }, type);
    assert.equal(frightened.saveReminder.ability, "wis", type);
    assert.match(frightened.saveReminder.label, /linea di vista/u, type);
  }
  assert.deepEqual(getSpellSummaryParts(DRAGON, "necrotic", { slotLevel: 8 }).map((part) => part.label), ["Soffio: necrotici"]);
  assert.deepEqual(getSpellSummaryParts(DRAGON, "", { slotLevel: 8, choice: "fire" }).map((part) => part.label), ["Soffio: fuoco"]);
});

test("il soffio parte dal bordo del drago, ha il tipo scelto al lancio e le difese di quel tipo", () => {
  const breath = action(DRAGON, "illusory-dragon-breath");
  assert.deepEqual(validateSpellActiveResolutionAction(breath).errors, []);
  assert.equal(breath.placementOrigin, "root");
  assert.equal(breath.economy, "bonus-action");
  assert.notEqual(breath.availableAfterCast, true, "a bonus action: on the cast turn too");
  const rule = getSpellAreaRuleById(breath.placementRuleId);
  assert.equal(rule.placement.origin, "caster-adjacent");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value], ["cone", 18]);
  assert.equal(rule.targeting.includeCaster, true, "the real caster in the cone is breathed on too");
  const spell = getSpellDefinition(DRAGON);
  const payloadFor = (choice) => buildSpellActiveResolutionPayload({
    spell, action: breath, group: { instanceId: "dragon-1", casterId: "mage", castContext: { slotLevel: 8, choice } },
    sceneEpoch: 1, zoneItemId: "dragon-token",
  });
  for (const [choice, type, defense] of [["acid", "acido", "acid"], ["cold", "freddo", "cold"], ["fire", "fuoco", "fire"],
    ["lightning", "fulmine", "lightning"], ["necrotic", "necrotici", "necrotic"], ["poison", "veleno", "poison"]]) {
    const payload = payloadFor(choice);
    assert.equal(payload.action.damage.type, type, choice);
    assert.deepEqual(spellActionDamageTypes(payload.action), [defense], choice);
    assert.equal(payload.zoneItemId, "dragon-token");
  }
  assert.equal(payloadFor("").action.damage.type, "del tipo scelto", "an old pill with no choice: as before");
  assert.equal(spellActiveResolutionActionForCast(action(VINE, "grasping-vine-lash"), { choice: "fire" }),
    action(VINE, "grasping-vine-lash"), "only the actions that declare it");
  // The new origin is for an area drawn from a token only.
  assert.ok(validateSpellActiveResolutionAction({ ...breath, requiresZoneRoot: false }).errors.includes("action-placement-origin-invalid"));
  assert.ok(validateSpellActiveResolutionAction({ ...breath, placementOrigin: "caster" }).errors.includes("action-placement-origin-invalid"));
});

test("chi scopre l'illusione la segna dal ⚡: una pill legata all'incantesimo, una volta sola", () => {
  const discern = action(DRAGON, "illusory-dragon-discern");
  assert.equal(discern.showInOverview, true);
  assert.equal(action(DRAGON, "illusory-dragon-breath").saveAdvantageEffectId, "illusory-dragon-discerned");
  const plan = buildSpellActiveActionPlan({
    spell: getSpellDefinition(DRAGON),
    actionId: "illusory-dragon-discern",
    group: { instanceId: "dragon-1", casterId: "mage", castContext: { boardToken: true, choice: "fire" } },
    selectedTargetIds: ["goblin"],
  });
  assert.equal(plan.valid, true, plan.errors?.join(", "));
  const [add] = plan.operations;
  assert.equal(add.type, "condition:add");
  assert.deepEqual(add.targetIds, ["goblin"]);
  assert.equal(add.conditionName, "Vede oltre il drago");
  assert.equal(add.options.effectId, "illusory-dragon-discerned");
  assert.equal(add.options.parentEffectId, "dragon-1");
  assert.deepEqual(discern.rejectActiveEffectIds, ["illusory-dragon-discerned"]);
});

// D7: the globe changes hands on the caster's pill, which stays where the throw finds it.
test("Consegna il globo: la pill del caster dice chi lo tiene, e torna com'era quando il caster lo riprende", () => {
  const spell = getSpellDefinition("freezing-sphere");
  const castContext = { slotLevel: 6, phase: "prepare", choice: "" };
  const overview = getSpellOverviewActions({ spell, castContext, casterId: "mage", targetIds: ["mage"] });
  assert.deepEqual(overview.map((entry) => entry.id), ["resolve-prepared", "freezing-sphere-hand-over"]);
  const group = { instanceId: "globe-1", casterId: "mage", castContext, appliedAt: { round: 2 }, turns: [1], name: "Sfera congelante" };
  const handOver = (targetId, name) => buildSpellActiveActionPlan({
    spell, actionId: "freezing-sphere-hand-over", group, selectedTargetIds: [targetId], selectedTargetNames: { [targetId]: name },
  });
  const [toMira, ...rest] = handOver("mira", "Mira").operations;
  assert.equal(rest.length, 0, "no pill on the holder, nothing moved");
  assert.equal(toMira.type, "spell:upsert");
  assert.deepEqual(toMira.targetIds, ["mage"]);
  assert.equal(toMira.instanceId, "globe-1");
  assert.deepEqual(toMira.castContext.holder, { id: "mira", name: "Mira" });
  assert.deepEqual(toMira.summaryParts.map((part) => part.label), ["Esplode al round 12", "In mano a: Mira"]);
  assert.deepEqual(toMira.expectedCastContext, castContext, "a context changed meanwhile refuses the command");
  const [back] = handOver("mage", "Dars").operations;
  assert.equal(back.castContext.holder, undefined);
  assert.deepEqual(back.summaryParts.map((part) => part.label), ["Esplode al round 12"]);
});
