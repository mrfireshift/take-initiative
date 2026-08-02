import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import {
  isZeroHPTransition,
  rageIsActive,
  relentlessRageIsEnabled,
  relentlessRageNotice,
  shouldAnnounceRelentlessRage,
} from "../src/classFeatureReminderCore.js";

const META_KEY = `${ID}/meta`;

function item({ hp, enabled = true, rage = true } = {}) {
  return {
    id: "barbarian-token",
    layer: "CHARACTER",
    name: "Barbaro",
    image: { url: "https://example.test/barbaro.png" },
    metadata: {
      [META_KEY]: {
        hp,
        initiativeCard: {
          characterBuild: [{
            classId: "barbaro",
            level: 11,
            subclassId: "",
          }],
          classFeaturesConfigured: true,
          enabledClassFeatureIds: enabled ? ["barbaro-ira-implacabile"] : [],
        },
        classFeatureState: {
          instances: rage
            ? [{
              instanceId: "rage-1",
              featureId: "barbaro-ira",
              sourceId: "barbarian-token",
              targetIds: ["barbarian-token"],
              startedRound: 1,
              expiresRound: 10,
            }]
            : [],
        },
      },
    },
  };
}

test("Ira Implacabile si attiva solo nella transizione positiva verso 0 PF durante Ira", () => {
  const before = item({ hp: 5 });
  const after = item({ hp: 0 });
  assert.equal(isZeroHPTransition(before, after), true);
  assert.equal(relentlessRageIsEnabled(after), true);
  assert.equal(rageIsActive(after, 3), true);
  assert.equal(shouldAnnounceRelentlessRage({
    beforeItem: before,
    afterItem: after,
    currentRound: 3,
  }), true);
  assert.equal(shouldAnnounceRelentlessRage({
    beforeItem: item({ hp: 0 }),
    afterItem: item({ hp: 0 }),
    currentRound: 3,
  }), false);
});

test("Ira Implacabile non mostra il reminder senza capacità abilitata o senza Ira", () => {
  const before = item({ hp: 5 });
  assert.equal(shouldAnnounceRelentlessRage({
    beforeItem: before,
    afterItem: item({ hp: 0, enabled: false }),
    currentRound: 3,
  }), false);
  assert.equal(shouldAnnounceRelentlessRage({
    beforeItem: before,
    afterItem: item({ hp: 0, rage: false }),
    currentRound: 3,
  }), false);
});

test("il reminder di Ira Implacabile usa il formato dei TS", () => {
  const notice = relentlessRageNotice({
    item: item({ hp: 0 }),
    activationId: "relentless-rage:barbarian-token:1",
    turnKey: "round:3:item:barbarian-token",
  });
  assert.equal(notice.kind, "effect-reminder");
  assert.equal(notice.effectName, "Ira Implacabile");
  assert.equal(notice.saveLabel, "TS Costituzione CD 10");
  assert.equal(notice.target.id, "barbarian-token");
});
