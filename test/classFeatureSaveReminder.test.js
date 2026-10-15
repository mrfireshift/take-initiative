import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { CLASS_FEATURE_BY_ID } from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
} from "../src/classFeatureCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { initiativeTurnKeyAtOrdinal } from "../src/turnBoundaryCore.js";

const META_KEY = `${ID}/meta`;
const order = ["hero", "goblin"];

const FIRE_RUNE_ID = "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-fuoco";
const STONE_RUNE_ID = "guerriero-cavaliere-runico-intagliatore-di-rune-runa-della-pietra";
const REND_MIND_ID = "ladro-lama-spirituale-squarciare-la-mente";
const BEGUILING_TWIST_ID = "ranger-viandante-fatato-scambio-seducente";
const CONQUERING_PRESENCE_ID = "paladino-giuramento-di-conquista-incanalare-divinita-presenza-conquistatrice";
const NATURES_WRATH_ID = "paladino-giuramento-degli-antichi-incanalare-divinita-collera-della-natura";

function feature(id) {
  const entry = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(entry, id);
  return entry;
}

function pillFor(featureId, choiceId = "") {
  const instances = classFeatureConditionInstancesForActivation(feature(featureId), {
    instanceId: `${featureId}-1`,
    sourceId: "hero",
    targetIds: ["goblin"],
    startedRound: 1,
    startedTurnKey: initiativeTurnKeyAtOrdinal(order, 0),
    ...(choiceId ? { choiceId } : {}),
  }, "Eroe");
  assert.equal(instances.length, 1, featureId);
  return instances[0];
}

function scene(pill) {
  return [
    {
      id: "hero",
      name: "Eroe",
      metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 15 } } },
    },
    {
      id: "goblin",
      name: "Goblin",
      metadata: { [META_KEY]: { conditions: { instances: [pill] } } },
    },
  ];
}

function noticesBetween(pill, previous, next) {
  return planEffectSaveReminderNotices({
    items: scene(pill),
    previousInitiativeState: { order, ...previous },
    initiativeState: { order, ...next },
    includeCurrentTurnStart: false,
  });
}

// Fine del turno del goblin: dal goblin (round 1) all'eroe (round 2).
const goblinTurnEnd = [{ current: 1, round: 1 }, { current: 0, round: 2 }];

test("la proiezione porta saveReminder normalizzato, anche dalle opzioni di scelta", () => {
  const base = {
    id: "capacita-test",
    runtimeSupport: { status: "implemented", adapter: "condition" },
    targeting: { mode: "single-target", excludeSource: true },
    effectPlan: {
      kind: "condition",
      conditionName: "Spaventato",
      saveReminder: { ability: "Saggezza", timing: "turn-end", dcSource: "source-spell" },
    },
    choiceOptions: [
      {
        id: "trattenuto",
        label: "Trattenuto",
        effectPlan: {
          conditionName: "Trattenuto",
          saveReminder: { ability: "str", timing: "turn-end", dc: 14 },
        },
      },
      { id: "spaventato", label: "Spaventato", effectPlan: { conditionName: "Spaventato" } },
    ],
  };
  assert.deepEqual(classFeatureEffectProjection(base).saveReminder, {
    ability: "wis",
    timing: "turn-end",
    actor: "target",
    success: "remove-effect",
    dcSource: "source-spell",
  });
  assert.deepEqual(classFeatureEffectProjection(base, "trattenuto").saveReminder, {
    ability: "str",
    timing: "turn-end",
    actor: "target",
    success: "remove-effect",
    dc: 14,
  });
  assert.equal(classFeatureEffectProjection(base, "spaventato").saveReminder.ability, "wis");
  assert.equal(
    classFeatureEffectProjection({ ...base, effectPlan: { kind: "condition", saveReminder: { timing: "mai" } } })
      .saveReminder,
    undefined,
  );
});

test("la pill copia saveReminder, la secondaria non lo eredita", () => {
  const instances = classFeatureConditionInstancesForActivation({
    id: "capacita-test",
    runtimeSupport: { status: "implemented", adapter: "condition" },
    targeting: { mode: "single-target", excludeSource: true },
    effectPlan: {
      kind: "condition",
      conditionName: "Trattenuto",
      saveReminder: [
        { timing: "turn-start", damage: { dice: "1d6", type: "fuoco" } },
        { ability: "str", timing: "turn-end" },
      ],
      secondaryEffects: [{ conditionName: "Bruciato", idSuffix: "fuoco" }],
    },
  }, { instanceId: "act-1", sourceId: "hero", targetIds: ["goblin"], startedRound: 1 });
  assert.equal(instances.length, 2);
  assert.deepEqual(instances[0].saveReminder.map((reminder) => reminder.timing), ["turn-start", "turn-end"]);
  assert.equal(instances[0].saveReminder[0].mode, "manual-damage");
  assert.equal(instances[1].saveReminder, undefined);
});

test("le pill senza saveReminder restano invariate", () => {
  const pill = pillFor("guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-gelo");
  assert.equal(pill.saveReminder, undefined);
});

test("Runa del Fuoco: danni a inizio turno e TS Forza a fine turno del bersaglio", () => {
  const pill = pillFor(FIRE_RUNE_ID);
  const start = noticesBetween(pill, { current: 0, round: 1 }, { current: 1, round: 1 });
  assert.equal(start.length, 1);
  assert.equal(start[0].kind, "effect-reminder");
  assert.equal(start[0].saveLabel, "Danni (2d6)");
  assert.equal(start[0].resolution.mode, "manual-damage");
  assert.equal(start[0].resolution.damage.type, "fuoco");
  assert.equal(start[0].target.id, "goblin");

  const end = noticesBetween(pill, ...goblinTurnEnd);
  assert.equal(end.length, 1);
  assert.equal(end[0].kind, "effect-save");
  assert.equal(end[0].ability, "FOR");
  assert.equal(end[0].dc, undefined);
  assert.equal(end[0].saveLabel, "TS Forza");
  assert.match(end[0].instruction, /Costituzione del guerriero/);
});

const turnEndCases = [
  { id: STONE_RUNE_ID, ability: "SAG", dc: undefined },
  { id: REND_MIND_ID, ability: "SAG", dc: undefined },
  { id: BEGUILING_TWIST_ID, ability: "SAG", dc: 15 },
  { id: BEGUILING_TWIST_ID, choiceId: "spaventato", ability: "SAG", dc: 15 },
  { id: CONQUERING_PRESENCE_ID, ability: "SAG", dc: 15 },
  { id: NATURES_WRATH_ID, ability: "FOR", dc: 15 },
];

for (const { id, choiceId = "", ability, dc } of turnEndCases) {
  test(`${id}${choiceId ? ` (${choiceId})` : ""}: TS a fine turno rimuove la pill se superato`, () => {
    const pill = pillFor(id, choiceId);
    assert.deepEqual(
      noticesBetween(pill, { current: 0, round: 1 }, { current: 1, round: 1 }),
      [],
      "nessun popup a inizio turno",
    );
    const notices = noticesBetween(pill, ...goblinTurnEnd);
    assert.equal(notices.length, 1);
    const [notice] = notices;
    assert.equal(notice.kind, "effect-save");
    assert.equal(notice.timing, "turn-end");
    assert.equal(notice.ability, ability);
    assert.equal(notice.dc, dc);
    assert.equal(notice.target.id, "goblin");
    assert.equal(notice.sourceName, "Eroe");
    assert.deepEqual(notice.resolution.outcomes.passed.actions, [{
      kind: "condition",
      action: "remove-instance",
      targetId: "goblin",
      instanceId: pill.id,
    }]);
    assert.deepEqual(notice.resolution.outcomes.failed.actions, []);
  });
}
