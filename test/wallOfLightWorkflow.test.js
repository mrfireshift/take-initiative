import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  getSpellAreaRuleById,
} from "../src/spellAreaRules.js";
import {
  getSpellResolutionAction,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import {
  callLightningTurnPromptPayloads,
} from "../src/callLightningTurnPromptCore.js";
import {
  buildEffectSaveReminderResolution,
  buildZoneTriggerReminderResolution,
  reminderResolutionControls,
} from "../src/reminderResolutionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { areaMembershipPlan } from "../src/spellAreaMembershipCore.js";
import { zoneTriggerNoticeFromActivation } from "../src/zoneTriggerNoticeCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { staticSpellZoneOwnerOperation } from "../src/spellStaticZoneCore.js";
import { buildArea } from "../src/aoeGeometryCore.js";

const SPELL_ID = "xanathar-muro-di-luce";
const ACTION_ID = "wall-of-light-beam";

function casterWithWall({ turnKey = "1:1:caster", slotLevel = 5 } = {}) {
  const metaKey = `${ID}/meta`;
  const spellsKey = `${ID}/spells`;
  return {
    id: "caster",
    name: "Anyanca",
    layer: "CHARACTER",
    metadata: {
      [metaKey]: {
        [spellsKey]: [{
          name: "Muro di Luce",
          spellId: SPELL_ID,
          instanceId: "wall-light-1",
          casterId: "caster",
          appliedAt: { round: 1, actorId: "caster", turnKey },
          conc: true,
          castContext: {
            slotLevel,
            staticZoneOwner: true,
            staticZoneRuleId: `${SPELL_ID}:cast`,
          },
        }],
      },
    },
  };
}



test("Muro di Luce conserva l'owner spell sul caster invece di persistere la spell sui falliti", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);

  assert.deepEqual(spell.saveAutomation.trackOutcomes, []);
  assert.equal(spell.saveAutomation.failed[0]?.condition, "Accecato");

  const lifecycleOps = saveSpellResolutionOperations({
    resolution: {
      valid: true,
      spellId: SPELL_ID,
      spellName: "Muro di Luce",
      concentration: true,
      casterId: "caster",
      spellTargetIds: [],
      conditionApplications: [{
        targetIds: ["target"],
        conditionName: "Accecato",
        options: { parentEffectId: "" },
      }],
    },
    instanceId: "wall-light-1",
    casterName: "Anyanca",
    castContext: { slotLevel: 7 },
  });
  assert.equal(lifecycleOps.some((operation) => operation.type === "spell:upsert"), false);

  const ownerOperation = staticSpellZoneOwnerOperation({
    rule,
    spell,
    instanceId: "wall-light-1",
    casterId: "caster",
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:1:caster" },
    trackConcentration: true,
    slotLevel: 7,
  });
  assert.ok(ownerOperation);
  assert.deepEqual(ownerOperation.targetIds, ["caster"]);
  assert.equal(ownerOperation.castContext.staticZoneOwner, true);
  assert.equal(ownerOperation.castContext.slotLevel, 7);

  // Verifica end-to-end del collegamento che in Owlbear alimenta l'auto-popup:
  // il producer del cast crea l'owner sul caster e il turn prompt lo scopre
  // dal turno successivo senza bisogno di forzature nel controller UI.
  const caster = {
    id: "caster",
    name: "Anyanca",
    layer: "CHARACTER",
    metadata: {
      [`${ID}/meta`]: {
        [`${ID}/spells`]: [{
          name: ownerOperation.name,
          spellId: ownerOperation.spellId,
          instanceId: ownerOperation.instanceId,
          casterId: "caster",
          appliedAt: ownerOperation.appliedAt,
          conc: ownerOperation.conc,
          castContext: ownerOperation.castContext,
        }],
      },
    },
  };
  const root = {
    id: "wall-root",
    name: "Zona: Muro di Luce",
    metadata: {
      [`${ID}/spellStaticZone`]: {
        role: "root",
        spellId: SPELL_ID,
        ruleId: `${SPELL_ID}:cast`,
        instanceId: "wall-light-1",
        casterId: "caster",
      },
    },
  };
  const payloads = callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "2:1:caster",
    items: [caster, root],
  });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].actionId, ACTION_ID);
  assert.equal(payloads[0].zoneItemId, "wall-root");
});

test("la pill Muro di Luce segue dinamicamente la membership geometrica", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  const membershipEffect = rule.zonePolicy.membershipEffects.find(
    (effect) => effect.id === "wall-of-light-membership",
  );
  assert.ok(membershipEffect);
  assert.equal(membershipEffect.label, "Muro di Luce");

  const entering = areaMembershipPlan({
    instanceId: "wall-light-1",
    sourceId: "caster",
    zoneId: "wall-root",
    rule,
    desiredTargetIds: ["target"],
    items: [],
    metaKey: `${ID}/meta`,
    sourceName: "Anyanca",
  });
  assert.deepEqual(entering.entering, ["target"]);
  assert.equal(entering.operations[0]?.type, "condition:add");
  assert.equal(entering.operations[0]?.conditionName, "Muro di Luce");

  const leaving = areaMembershipPlan({
    instanceId: "wall-light-1",
    sourceId: "caster",
    zoneId: "wall-root",
    rule,
    desiredTargetIds: [],
    items: [{
      id: "target",
      metadata: {
        [`${ID}/meta`]: {
          conditions: [{
            id: "wall-membership-1",
            active: true,
            name: "Muro di Luce",
            parentEffectId: "wall-light-1",
            effectId: "wall-of-light-membership",
            effectKind: "debuff",
          }],
        },
      },
    }],
    metaKey: `${ID}/meta`,
    sourceName: "Anyanca",
  });
  assert.deepEqual(leaving.leaving, ["target"]);
  assert.deepEqual(leaving.operations[0]?.removals, [{
    itemId: "target",
    instanceId: "wall-membership-1",
  }]);
});

test("Muro di Luce ancora l'origine della linea a un vertice della griglia", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  assert.equal(rule.placement.snapOrigin, "vertex");
});

test("il reminder visibile di Muro di Luce mostra i dadi scalati dall'upcast", () => {
  const caster = casterWithWall({ turnKey: "1:1:caster", slotLevel: 7 });
  const target = { id: "target", name: "Bersaglio", layer: "CHARACTER", metadata: {} };
  const root = {
    id: "wall-root",
    name: "Zona: Muro di Luce",
    metadata: {
      [`${ID}/spellStaticZone`]: {
        role: "root",
        spellId: SPELL_ID,
        ruleId: `${SPELL_ID}:cast`,
        instanceId: "wall-light-1",
        casterId: "caster",
      },
    },
  };
  const trigger = getSpellAreaRuleById(`${SPELL_ID}:cast`).zonePolicy.triggers.find(
    (entry) => entry.id === "wall-of-light-damage-on-turn-end",
  );
  const notice = zoneTriggerNoticeFromActivation({
    id: "activation-1",
    zoneItemId: "wall-root",
    instanceId: "wall-light-1",
    casterId: "caster",
    targetIds: ["target"],
    triggerId: trigger.id,
    event: "turn-end",
    resolution: trigger.resolution,
    label: trigger.label,
    damage: trigger.damage,
  }, new Map([["caster", caster], ["target", target], ["wall-root", root]]));

  assert.ok(notice);
  assert.equal(notice.resolution?.damage?.dice, "6d8");
  assert.match(notice.label, /^6d8\b/);
});

test("Muro di Luce mantiene il cast come zona persistente con TS iniziale", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  assert.ok(rule);
  assert.equal(rule.kind, "zone");
  assert.equal(rule.geometry.shape, "line");
  assert.deepEqual(rule.geometry.size, { value: 18, unit: "m", measure: "length" });
  assert.deepEqual(rule.geometry.width, { value: 1.5, unit: "m", measure: "width" });
  assert.equal(rule.zonePolicy.initialResolution, "manual-save");
  assert.equal(rule.lifecycle.persistence, "spell");
});

test("Muro di Luce espone il danno di fine turno come reminder risolvibile con input danno", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  const trigger = rule.zonePolicy.triggers.find((entry) => entry.id === "wall-of-light-damage-on-turn-end");

  assert.ok(trigger);
  assert.equal(trigger.event, "turn-end");
  assert.equal(trigger.resolution, "manual-effect");
  assert.deepEqual(trigger.damage, {
    dice: "4d8",
    type: "radiosi",
    onSave: "none",
    baseSlot: 5,
    additionalPerSlotAbove: 1,
  });
});


test("il reminder danno di Muro di Luce scala con lo slot e richiede input manuale", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  const trigger = rule.zonePolicy.triggers.find((entry) => entry.id === "wall-of-light-damage-on-turn-end");
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "wall-damage-1",
      zoneItemId: "wall-root",
      instanceId: "wall-light-1",
      triggerId: trigger.id,
      resolution: trigger.resolution,
      damage: trigger.damage,
    },
    targetId: "target",
    sourceId: "caster",
    slotLevel: 6,
    metadataKey: `${ID}/spellStaticZone`,
  });

  assert.ok(resolution);
  assert.equal(resolution.mode, "manual-damage");
  assert.deepEqual(resolution.damage, {
    dice: "5d8",
    type: "radiosi",
    onFailed: "full",
    onPassed: "zero",
    onImmune: "zero",
    baseSlot: 5,
    additionalPerSlotAbove: 1,
  });
  assert.equal(resolution.slotLevel, 6);
});

test("la cecita di Muro di Luce conserva il TS a fine turno con Superato/Fallito", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const failedRule = spell.saveAutomation.failed[0];
  const reminder = failedRule.saveReminder;
  assert.equal(failedRule.manualRemoval, true);
  const resolution = buildEffectSaveReminderResolution({
    item: { id: "target" },
    instance: {
      id: "blind-1",
      condition: "Accecato",
      sourceId: "caster",
      parentEffectId: "",
      spellId: SPELL_ID,
      spellName: "Muro di Luce",
      manualRemoval: failedRule.manualRemoval,
      saveReminder: reminder,
    },
    reminder,
    dc: 17,
    activationId: "blind-save-1",
    turnKey: "2:0:target",
  });

  assert.ok(resolution);
  assert.deepEqual(reminderResolutionControls({ role: "GM", resolution }), ["passed", "failed", "immune"]);
  assert.equal(resolution.outcomes.passed.mode, "remove-effect");
  assert.equal(resolution.outcomes.failed.mode, "keep-effect");
});

test("Muro di Luce espone il raggio radioso come active action dal muro", () => {
  const action = getSpellResolutionAction(SPELL_ID, ACTION_ID);

  assert.ok(action);
  assert.equal(action.id, ACTION_ID);
  assert.equal(action.economy, "action");
  assert.equal(action.resolutionKind, "single-attack");
  assert.equal(action.requiresZoneRoot, true);
  assert.equal(action.rangeOrigin, "root");
  assert.deepEqual(action.range, { value: 18, unit: "m" });
  assert.equal(action.rangeFromZoneArea, true);
  assert.equal(action.turnStartPrompt, true);
  assert.equal(action.showInOverview, true);
  assert.deepEqual(action.attack, {
    outcomes: ["hit", "miss"],
    damageRequiredOnHitOnly: true,
  });
  assert.deepEqual(action.damage, {
    formula: "4d8",
    type: "radiosi",
    onSave: "none",
    baseSlot: 5,
    additionalPerSlotAbove: 1,
  });
  assert.deepEqual(action.shortenStaticZone, {
    meters: 3,
    from: "end",
    chooseFrom: true,
    endSpellAtZero: true,
  });
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
});

test("il raggio radioso viene scoperto dal turno successivo del caster", () => {
  const caster = casterWithWall();
  const root = {
    id: "wall-root",
    name: "Zona: Muro di Luce",
    metadata: {
      [`${ID}/spellStaticZone`]: {
        role: "root",
        spellId: SPELL_ID,
        ruleId: `${SPELL_ID}:cast`,
        instanceId: "wall-light-1",
        casterId: "caster",
      },
    },
  };

  assert.deepEqual(callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "1:1:caster",
    items: [caster, root],
  }), []);

  const payloads = callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "2:1:caster",
    items: [caster, root],
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].actionId, ACTION_ID);
  assert.equal(payloads[0].zoneItemId, "wall-root");
});


test("Muro di Luce assegna esplicitamente il prompt automatico al caster", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/callLightningTurnPromptCore.js", import.meta.url), "utf8"));
  const blockStart = source.indexOf('spellId: "xanathar-muro-di-luce"');
  const block = source.slice(blockStart, source.indexOf("}),", blockStart) + 3);
  assert.match(block, /ownerContext:\s*"caster"/);
  assert.match(block, /availableAfterCast:\s*true/);
});

test("il resolver di Muro di Luce permette di scegliere estremita iniziale o finale", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../spell-active-resolution.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8");
  assert.match(html, /id="zoneShorteningFrom"/);
  assert.match(html, /value="start"[^>]*>Iniziale</);
  assert.match(html, /value="end"[^>]*>Finale</);
  assert.match(source, /shorteningFrom:\s*zoneShorteningFrom/);
});

test("Muro di Luce registra il turno di cast con la chiave iniziativa canonica", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/spellAreaResolutionExecutor.js", import.meta.url), "utf8");
  assert.match(source, /import\s*\{\s*currentInitiativeTurnKey\s*\}\s*from\s*["']\.\/turnBoundaryCore\.js["']/);
  assert.match(source, /turnKey:\s*currentInitiativeTurnKey\(state\)/);
});

test("Muro di Luce lascia la pill dinamica al solo reconcile runtime della zona", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/spellAreaResolutionExecutor.js", import.meta.url), "utf8");
  assert.match(source, /const\s+runtimeOwnedZoneMembership\s*=\s*spell\.id\s*===\s*["']xanathar-muro-di-luce["']/);
  assert.match(source, /if\s*\(!runtimeOwnedZoneMembership\)\s*\{[\s\S]*?areaMembershipPlan\(/);
});

test("il popup del Raggio radioso usa la formula upcastata nel titolo e non duplica la label danno", async () => {
  const { readFile } = await import("node:fs/promises");
  const [html, source] = await Promise.all([
    readFile(new URL("../spell-active-resolution.html", import.meta.url), "utf8"),
    readFile(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="attackDamageLabel"/);
  assert.doesNotMatch(html, /Danno 4d6 fulmine/);
  assert.match(source, /wallOfLight[\s\S]*attackDamageLabel/);
  assert.match(source, /activeDamageFormula[\s\S]*attackTitle/);
});

test("Muro di Luce usa il vertice scelto anche come vertice della footprint, non come mediana", () => {
  const rule = getSpellAreaRuleById("xanathar-muro-di-luce:cast");
  assert.equal(rule.geometry.widthAnchor, "edge");

  const area = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 0, y: 600 },
    100,
    { x: 0, y: 0 },
    { widthSquares: 1, widthAnchor: rule.geometry.widthAnchor },
  );

  assert.ok(area.points.some((point) => point.x === 0 && point.y === 0));
  const columns = new Set(area.cells.map((cell) => Math.round(cell.x / 100)));
  assert.equal(columns.size, 1);
});
