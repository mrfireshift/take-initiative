import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import {
  buildSpellActiveResolutionResourceOperations,
  getSpellResolutionAction,
  spellActiveResolutionAttackDamageRequired,
} from "../src/spellActiveResolutionCore.js";
import { spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import { spellPillCounter, spellExpiryCounter } from "../src/spellExpiryCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planEffectsLayout } from "../src/effectsLayoutCore.js";

const SPELL_ID = "xanathar-corona-di-stelle";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

function castPlan(slotLevel) {
  const spell = getSpellDefinition(SPELL_ID);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 600,
    casterId: "caster",
    targetIds: ["caster"],
    castContext: { slotLevel },
    requestedConcentration: false,
  });
  return buildSpellApplicationPlan({
    intent,
    instanceId: `crown-${slotLevel}`,
    casterName: "Mago",
  });
}

function item(id, spells = []) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    metadata: { [META_KEY]: { [SPELLS_KEY]: spells } },
  };
}

function activeSpell({ slotLevel = 7, remaining = 7, turnKey = "1:0:caster" } = {}) {
  return {
    id: "crown-entry",
    name: "Corona di Stelle",
    spellId: SPELL_ID,
    instanceId: "crown-instance",
    casterId: "caster",
    casterName: "Mago",
    turns: 600,
    conc: false,
    appliedAt: { round: 1, actorId: "caster", turnKey },
    castContext: {
      slotLevel,
      uses: { key: "stars", label: "stelle", remaining, total: remaining, showInPill: true },
    },
  };
}

test("SP-B06E.1 — il cast inizializza 7 stelle +2 per ogni slot sopra il 7°", () => {
  for (const [slotLevel, expected] of [[7, 7], [8, 9], [9, 11]]) {
    const plan = castPlan(slotLevel);
    const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");
    assert.ok(upsert, `slot ${slotLevel}`);
    assert.equal(upsert.castContext?.uses?.key, "stars");
    assert.equal(upsert.castContext?.uses?.remaining, expected);
    assert.equal(upsert.castContext?.uses?.total, expected);
    assert.equal(upsert.castContext?.uses?.showInPill, true);
  }
});

test("SP-B06E.2 — espone Lancia una stella come attacco bonus a 36 m", () => {
  const action = getSpellResolutionAction(SPELL_ID, "crown-of-stars-launch");
  assert.ok(action);
  assert.equal(action.buttonLabel, "Lancia una stella");
  assert.equal(action.economy, "bonus-action");
  assert.equal(action.turnStartPrompt, true);
  assert.equal(action.availableAfterCast, true);
  assert.equal(action.resolutionKind, "single-attack");
  assert.equal(action.requiresZoneRoot, false);
  assert.equal(action.rangeOrigin, "caster");
  assert.deepEqual(action.range, { value: 36, unit: "m" });
  assert.deepEqual(action.attack.outcomes, ["hit", "miss"]);
  assert.equal(action.damage.formula, "4d12");
  assert.equal(action.damage.type, "radiosi");
  assert.deepEqual(action.resource, { key: "stars", consume: 1, endSpellAtZero: true });
});

test("SP-B06E.3 — il prompt compare già nel turno del cast e conserva le stelle rimaste", () => {
  const castTurn = "1:0:caster";
  const items = [item("caster", [activeSpell({ turnKey: castTurn, remaining: 6 })]), item("target")];

  const sameTurnRequests = spellTurnPromptRequests({
    items,
    actorId: "caster",
    sceneEpoch: 5,
    turnKey: castTurn,
  });
  assert.equal(sameTurnRequests.length, 1);
  assert.equal(sameTurnRequests[0].payload.actionId, "crown-of-stars-launch");

  const requests = spellTurnPromptRequests({
    items,
    actorId: "caster",
    sceneEpoch: 5,
    turnKey: "2:0:caster",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "action");
  assert.equal(requests[0].payload.spellId, SPELL_ID);
  assert.equal(requests[0].payload.actionId, "crown-of-stars-launch");
  assert.equal(requests[0].payload.castContext.uses.remaining, 6);
});


test("SP-B06E.4 — il contatore pill privilegia le stelle rimaste rispetto alla durata", () => {
  const entry = activeSpell({ remaining: 5 });
  assert.equal(spellPillCounter(entry), "5");
});



test("SP-B06E.4b — il contatore stelle compare anche nella pill del tabellone", () => {
  const entry = activeSpell({ remaining: 5 });
  const rows = planEffectsLayout({
    measureText: (text) => String(text).length * 10,
    tokens: [{
      id: "caster",
      position: { x: 100, y: 100 },
      width: 70,
      height: 70,
      scale: { x: 1, y: 1 },
      conditionParts: [],
      concentrationKey: null,
      spellEntries: [entry],
      assignments: [{
        key: "Corona di Stelle",
        displayName: "Corona di Stelle",
        targets: ["caster"],
        instanceId: "crown-instance",
        color: { solid: "#7e22ce", fillOpacity: 0.84 },
      }],
    }],
  });
  const pill = rows.find((row) => row.kind === "spell" && row.targetId === "caster");
  assert.equal(pill?.text, "Corona di Stelle (5)");
});

test("SP-B06E.5 — ogni attacco consuma una stella e l'ultima termina la spell", () => {
  const action = getSpellResolutionAction(SPELL_ID, "crown-of-stars-launch");
  const payload = {
    instanceId: "crown-instance",
    casterId: "caster",
    spellId: SPELL_ID,
    spellName: "Corona di Stelle",
  };

  const sixToFive = buildSpellActiveResolutionResourceOperations({
    action,
    payload,
    spellEntry: activeSpell({ remaining: 6 }),
  });
  assert.equal(sixToFive.valid, true);
  assert.equal(sixToFive.remaining, 5);
  assert.equal(sixToFive.operations.length, 1);
  assert.equal(sixToFive.operations[0].type, "spell:upsert");
  assert.equal(sixToFive.operations[0].castContext.uses.remaining, 5);

  const last = buildSpellActiveResolutionResourceOperations({
    action,
    payload,
    spellEntry: activeSpell({ remaining: 1 }),
  });
  assert.equal(last.valid, true);
  assert.equal(last.remaining, 0);
  assert.deepEqual(last.operations, [{
    type: "spell:remove-instance",
    targetIds: ["caster"],
    instanceId: "crown-instance",
  }]);
});

test("SP-B06E.6 — Mancato non richiede un danno, Colpito sì", () => {
  const action = getSpellResolutionAction(SPELL_ID, "crown-of-stars-launch");
  assert.equal(spellActiveResolutionAttackDamageRequired(action, "miss"), false);
  assert.equal(spellActiveResolutionAttackDamageRequired(action, "hit"), true);
});


test("SP-B06E.7 — la mutation aggiorna il contatore sulla stessa entry senza alterare la durata", () => {
  const action = getSpellResolutionAction(SPELL_ID, "crown-of-stars-launch");
  const entry = activeSpell({ remaining: 6 });
  const resource = buildSpellActiveResolutionResourceOperations({
    action,
    payload: {
      instanceId: "crown-instance",
      casterId: "caster",
      spellId: SPELL_ID,
      spellName: "Corona di Stelle",
    },
    spellEntry: entry,
  });

  const plan = buildEffectsMutationPlan([{
    id: "caster",
    name: "caster",
    spells: [entry],
    concentrations: {},
    conditions: [],
  }], resource.operations);
  const next = plan.states.find((state) => state.id === "caster");
  assert.equal(next.spells.length, 1);
  assert.equal(next.spells[0].turns, 600);
  assert.equal(next.spells[0].castContext.uses.remaining, 5);
  assert.equal(spellPillCounter(next.spells[0]), "5");
  assert.equal(spellExpiryCounter(next.spells[0]), "");
});


test("SP-B06E.8 — la proiezione tabellone conserva la risorsa uses per aggiornare il contatore", () => {
  const source = readFileSync(new URL("../src/spells-tag.js", import.meta.url), "utf8");
  assert.match(source, /castContext: readSpellCastContext\(s\.castContext\)/);
  assert.match(source, /u: spell\.castContext\?\.uses \|\| null/);
});
