// P4 of the spell polish: what the bench found in the workflows (docs/PIANO_POLISH_INCANTESIMI.md).
import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { getSpellOverviewActions } from "../src/spellActiveActionCore.js";
import {
  buildSpellActiveResolutionFailureOperations,
  getSpellResolutionAction,
  resolveSpellActiveResolutionDamage,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import { SUPPLEMENT_ACTIVE_ACTIONS } from "../src/supplementSpellRules.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { nearestGridCellSideCenter, spellAreaOriginAdjacentToCaster } from "../src/spellAreaPlacementCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import { planStaticSpellZoneReminder } from "../src/spellStaticZoneReminderCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CAST_TURN = "1:0:caster";

const overviewOnCastTurn = (spellId, actionId) => getSpellOverviewActions({
  spell: getSpellDefinition(spellId),
  casterId: "caster",
  zoneItemId: "zone",
  appliedAt: { round: 1, actorId: "caster", turnKey: CAST_TURN },
  currentTurnKey: CAST_TURN,
  currentActorId: "caster",
}).find((action) => action.id === actionId);

test("le azioni bonus si usano già nel turno del lancio", () => {
  for (const [spellId, actionId] of [
    ["xanathar-corona-di-stelle", "crown-of-stars-launch"],
    ["xanathar-drago-illusorio", "illusory-dragon-breath"],
    ["gust-of-wind", "gust-of-wind-direction"],
    ["arcane-hand", "arcane-hand-clenched"],
  ]) {
    const action = overviewOnCastTurn(spellId, actionId);
    assert.ok(action, `${spellId}: l'azione è nell'elenco del ⚡`);
    assert.equal(action.economy, "bonus-action", actionId);
    assert.equal(action.unavailableReason, undefined, actionId);
  }
});

test("Drago illusorio: senza una pill con il ⚡, il popup del Soffio compare già nel turno del lancio", () => {
  const items = [{
    id: "caster",
    name: "Mago",
    metadata: { [META_KEY]: { [`${ID}/concentration`]: { "drago illusorio": {
      name: "Drago Illusorio",
      spellId: "xanathar-drago-illusorio",
      instanceId: "dragon-1",
      casterId: "caster",
      appliedAt: { round: 1, actorId: "caster", turnKey: CAST_TURN },
    } } } },
  }];
  const [request, ...rest] = spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 1, turnKey: CAST_TURN });
  assert.equal(rest.length, 0);
  assert.equal(request.kind, "action");
  assert.equal(request.payload.actionId, "illusory-dragon-breath");
});

test("le azioni vere aspettano il turno dopo: si è già usata l'azione per lanciare", () => {
  for (const [spellId, actionId] of [
    ["xanathar-investitura-del-ghiaccio", "ice-investiture-cone"],
    ["xanathar-investitura-della-fiamma", "flame-investiture-line"],
  ]) {
    const action = overviewOnCastTurn(spellId, actionId);
    assert.ok(action, spellId);
    assert.equal(action.economy, "action", actionId);
    assert.equal(action.unavailableReason, "Disponibile dal turno successivo al lancio.", actionId);
  }
});

test("Cono gelido: sagoma di 4,5 m dal caster, TS Costituzione, 4d6 freddo, metà se superato", () => {
  const spell = getSpellDefinition("xanathar-investitura-del-ghiaccio");
  assert.deepEqual(spell.activeActions.map((action) => action.id), ["ice-investiture-cone"]);
  assert.equal(SUPPLEMENT_ACTIVE_ACTIONS["xanathar-investitura-del-ghiaccio"], undefined, "la vecchia azione sui falliti selezionati è sparita");
  const cone = getSpellResolutionAction(spell.id, "ice-investiture-cone");
  assert.equal(validateSpellActiveResolutionAction(cone).valid, true);
  assert.deepEqual(cone.save, { ability: "con", onSuccess: "half" });
  assert.deepEqual([cone.damage.formula, cone.damage.type], ["4d6", "freddo"]);
  assert.equal(resolveSpellActiveResolutionDamage({ action: cone, slotLevel: 6, outcome: "failed", roll: 15 }).amount, 15);
  assert.equal(resolveSpellActiveResolutionDamage({ action: cone, slotLevel: 6, outcome: "passed", roll: 15 }).amount, 7);
  const area = getSpellAreaRuleById(cone.placementRuleId);
  assert.deepEqual([area.geometry.shape, area.geometry.size.value], ["cone", 4.5]);
});

test("Cono gelido: solo chi fallisce ha la velocità dimezzata, fino all'inizio del turno dopo del caster", () => {
  const cone = getSpellResolutionAction("xanathar-investitura-del-ghiaccio", "ice-investiture-cone");
  const operations = buildSpellActiveResolutionFailureOperations({
    action: cone,
    payload: { casterId: "caster", casterName: "Druido", instanceId: "ice-1" },
    targetIds: ["failed", "saved"],
    outcomes: { failed: "failed", saved: "passed" },
  });
  const add = operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(add.targetIds, ["failed"]);
  assert.equal(add.conditionName, "Velocità dimezzata");
  assert.equal(add.options.mechanics.movement.multiplier, 0.5);
  assert.deepEqual(add.options.summaryParts.map((part) => part.label), ["Vel ½"]);
  assert.deepEqual(add.options.expiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
  assert.equal(add.options.parentEffectId, "", "la velocità resta dimezzata anche se l'investitura finisce");
});

test("Cono gelido: il popup di turno arriva dal turno dopo il lancio, una sola volta", () => {
  const items = [{
    id: "caster",
    name: "Druido",
    metadata: { [META_KEY]: { [SPELLS_KEY]: [{
      name: "Investitura del Ghiaccio",
      spellId: "xanathar-investitura-del-ghiaccio",
      instanceId: "ice-1",
      casterId: "caster",
      conc: true,
      appliedAt: { round: 1, actorId: "caster", turnKey: CAST_TURN },
      castContext: { mobileAura: true, slotLevel: 6 },
    }] } },
  }];
  assert.deepEqual(spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 1, turnKey: CAST_TURN }), []);
  const [request, ...rest] = spellTurnPromptRequests({ items, actorId: "caster", sceneEpoch: 1, turnKey: "2:0:caster" });
  assert.equal(rest.length, 0);
  assert.equal(request.kind, "action");
  assert.equal(request.payload.actionId, "ice-investiture-cone");
});

test("Cono gelido: l'origine sul lato che guarda il caster passa il controllo del popup, una lontana no", () => {
  // A token on one 70 px cell, and the cell next to it on the east: as the real tool does, the cone starts on their shared side.
  const dpi = 70;
  const casterBounds = { min: { x: 910, y: 490 }, max: { x: 980, y: 560 } };
  const cell = { x: 1015, y: 525 };
  assert.equal(spellAreaOriginAdjacentToCaster({ origin: cell, casterBounds, dpi }), true, "la casella è adiacente");
  const { position: side } = nearestGridCellSideCenter(cell, { x: 980, y: 490 }, dpi, { x: 945 - cell.x, y: 525 - cell.y });
  assert.deepEqual(side, { x: 980, y: 525 });
  assert.equal(spellAreaOriginAdjacentToCaster({ origin: side, casterBounds, dpi }), false, "per le altre sagome il bordo non basta");
  assert.equal(spellAreaOriginAdjacentToCaster({ origin: side, casterBounds, dpi, allowCasterEdge: true }), true);
  // The caster moved away after the placement.
  assert.equal(spellAreaOriginAdjacentToCaster({ origin: { x: 1190, y: 525 }, casterBounds, dpi, allowCasterEdge: true }), false);
});

function zoneOf(rule, targetIds, triggerRuntime) {
  return {
    id: "zone",
    name: "Zona",
    position: { x: 100, y: 100 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        version: 1,
        instanceId: "zone-1",
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId: "caster",
        role: "root",
        targetIds,
        ...(triggerRuntime ? { triggerRuntime } : {}),
      },
    },
  };
}

function reminderOf(rule, zone, desiredTargetIds, { current = 0, round = 1, now = 100 } = {}) {
  return planStaticSpellZoneReminder({
    zoneItem: zone,
    rule,
    desiredTargetIds,
    initiativeState: { order: ["caster", "goblin", "ogre"], current, round },
    itemsById: new Map(["caster", "goblin", "ogre"].map((id) => [id, { id, name: id, image: { url: `https://example.test/${id}.png` } }])),
    now,
  });
}

const enteredIds = (plan) => plan.newActivations
  .filter((activation) => activation.event === "enter")
  .flatMap((activation) => activation.targetIds || []);

for (const [spellName, ruleId] of [
  ["Nube di Pugnali", "phb2014-nube-di-pugnali:cast"],
  ["Crescita di spine", "spike-growth:cast"],
]) {
  test(`${spellName}: il caster già dentro al lancio non «entra», chi arriva dopo sì`, () => {
    const rule = getSpellAreaRuleById(ruleId);
    assert.ok(rule, ruleId);
    // The shape leaves the caster out of the targets, but the caster stands inside.
    const bootstrap = reminderOf(rule, zoneOf(rule, ["goblin"]), ["caster", "goblin"]);
    assert.deepEqual(enteredIds(bootstrap), []);

    // Whoever arrives before the first check keeps the notice (SP-B04A).
    const early = reminderOf(rule, zoneOf(rule, ["goblin"]), ["caster", "goblin", "ogre"]);
    assert.deepEqual(enteredIds(early), ["ogre"]);

    // The caster who leaves and comes back on a later turn does enter.
    const left = reminderOf(rule, zoneOf(rule, ["goblin"], bootstrap.runtime), ["goblin"], { now: 200 });
    assert.deepEqual(enteredIds(left), []);
    const back = reminderOf(rule, zoneOf(rule, ["goblin"], left.runtime), ["caster", "goblin"], { current: 1, now: 300 });
    assert.deepEqual(enteredIds(back), ["caster"]);
  });

  test(`${spellName}: il caster fuori al lancio che entra è un ingresso vero`, () => {
    const rule = getSpellAreaRuleById(ruleId);
    const bootstrap = reminderOf(rule, zoneOf(rule, ["goblin"]), ["goblin"]);
    assert.deepEqual(enteredIds(bootstrap), []);
    const entered = reminderOf(rule, zoneOf(rule, ["goblin"], bootstrap.runtime), ["caster", "goblin"], { now: 200 });
    assert.deepEqual(enteredIds(entered), ["caster"]);
  });
}

test("Nube di Pugnali: il caster rimasto dentro ha comunque il promemoria quando il suo turno comincia lì", () => {
  const rule = getSpellAreaRuleById("phb2014-nube-di-pugnali:cast");
  const bootstrap = reminderOf(rule, zoneOf(rule, ["goblin"]), ["caster", "goblin"]);
  const nextRound = reminderOf(rule, zoneOf(rule, ["goblin"], bootstrap.runtime), ["caster", "goblin"], { round: 2, now: 200 });
  const starting = nextRound.newActivations.filter((activation) => activation.event === "turn-start");
  assert.ok(starting.flatMap((activation) => activation.targetIds || []).includes("caster"));
});

test("una zona che esenta il caster resta esente anche nella fotografia del lancio", () => {
  const rule = getSpellAreaRuleById("phb2014-nube-di-pugnali:cast");
  const zone = zoneOf(rule, ["goblin"]);
  zone.metadata[SPELL_STATIC_ZONE_META_KEY].exemptCreatureIds = ["caster"];
  const bootstrap = reminderOf(rule, zone, ["caster", "goblin"]);
  assert.deepEqual(enteredIds(bootstrap), []);
  assert.deepEqual(bootstrap.runtime.memberIds, ["goblin"]);
});
