import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  effectSaveReminderBoundaries,
  effectSaveReminderNoticesForDamage,
  effectSaveReminderSourceIds,
  normalizeEffectSaveReminder,
  normalizeEffectSaveReminders,
  planEffectSaveReminderNotices,
} from "../src/effectSaveReminderCore.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;
const order = ["caster", "first", "second"];

function caster(metaOverrides = {}) {
  return {
    id: "caster",
    name: "Mago",
    image: { url: "https://example.test/caster.png" },
    metadata: {
      [META_KEY]: {
        initiativeCard: { spellSaveDC: 16 },
        ...metaOverrides,
      },
    },
  };
}

function target(id, conditions) {
  return {
    id,
    name: id === "first" ? "Primo" : "Secondo",
    image: { url: `https://example.test/${id}.png` },
    metadata: {
      [META_KEY]: { conditions },
    },
  };
}

function condition(id, timing, overrides = {}) {
  return {
    id,
    condition: overrides.condition || "Effetto persistente",
    active: overrides.active !== false,
    sourceId: "caster",
    ...(overrides.appliedAt ? { appliedAt: overrides.appliedAt } : {}),
    saveReminder: {
      ability: overrides.ability || "wis",
      timing,
      ...(overrides.actor ? { actor: overrides.actor } : {}),
      dcSource: "source-spell",
      success: overrides.success || "remove-effect",
      ...(overrides.label ? { label: overrides.label } : {}),
    },
  };
}

function state(current, round = 1) {
  return { order, current, round };
}

test("normalizza il contratto dichiarativo senza interpretare il testo della condizione", () => {
  assert.deepEqual(normalizeEffectSaveReminder({
    ability: "Saggezza",
    timing: "turn-end",
    dc: 17.4,
    success: "keep-effect",
    label: " Risolvi il tiro. ",
  }), {
    ability: "wis",
    timing: "turn-end",
    actor: "target",
    success: "keep-effect",
    dc: 17,
    label: "Risolvi il tiro.",
  });
  assert.equal(normalizeEffectSaveReminder({
    ability: "fortuna",
    timing: "turn-start",
  }), null);
  assert.deepEqual(normalizeEffectSaveReminders([
    { ability: "wis", timing: "turn-end" },
    { ability: "wis", timing: "damage" },
  ]).map((reminder) => reminder.timing), ["turn-end", "damage"]);
});

test("ricostruisce tutte le frontiere quando l'iniziativa avanza di più posizioni", () => {
  assert.deepEqual(
    effectSaveReminderBoundaries(state(0), state(2)),
    [
      {
        timing: "turn-end",
        actorId: "caster",
        turnKey: "1:0:caster",
        noticeTurnKey: "1:1:first",
      },
      {
        timing: "turn-start",
        actorId: "first",
        turnKey: "1:1:first",
        noticeTurnKey: "1:1:first",
      },
      {
        timing: "turn-end",
        actorId: "first",
        turnKey: "1:1:first",
        noticeTurnKey: "1:2:second",
      },
      {
        timing: "turn-start",
        actorId: "second",
        turnKey: "1:2:second",
        noticeTurnKey: "1:2:second",
      },
    ],
  );
});

test("emette reminder distinti per ogni token e di nuovo al round successivo", () => {
  const first = target("first", [condition("effect-first", "turn-start")]);
  const second = target("second", [condition("effect-second", "turn-start")]);
  const items = [caster(), first, second];

  const firstRoundFirst = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: state(0),
    initiativeState: state(1),
  });
  const firstRoundSecond = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: state(1),
    initiativeState: state(2),
  });
  const secondRoundFirst = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: state(0, 2),
    initiativeState: state(1, 2),
  });

  assert.deepEqual(firstRoundFirst.map((notice) => notice.target.id), ["first"]);
  assert.deepEqual(firstRoundSecond.map((notice) => notice.target.id), ["second"]);
  assert.deepEqual(secondRoundFirst.map((notice) => notice.target.id), ["first"]);
  assert.equal(firstRoundFirst[0].timing, "turn-start");
  assert.equal(firstRoundFirst[0].saveLabel, "TS Saggezza CD 16");
  assert.equal(firstRoundFirst[0].sourceName, "Mago");
  assert.notEqual(
    firstRoundFirst[0].activationId,
    secondRoundFirst[0].activationId,
  );

  const withoutEffect = target("first", []);
  assert.deepEqual(planEffectSaveReminderNotices({
    items: [caster(), withoutEffect, second],
    previousInitiativeState: state(0, 3),
    initiativeState: state(1, 3),
  }), []);
});

test("un reminder legato al caster viene emesso all'inizio del turno della fonte", () => {
  const bearer = target("first", [
    condition("heat-metal", "turn-start", {
      actor: "source",
      condition: "Metallo rovente",
      label: "Il caster può ripetere 2d8 fuoco e richiedere il TS.",
      success: "keep-effect",
    }),
  ]);
  const notices = planEffectSaveReminderNotices({
    items: [caster(), bearer],
    previousInitiativeState: state(2, 1),
    initiativeState: state(0, 2),
  });

  assert.equal(notices.length, 1);
  assert.equal(notices[0].target.id, "first");
  assert.equal(notices[0].timing, "turn-start");
  assert.match(notices[0].instruction, /2d8 fuoco/);

  const recoveredCurrentTurn = planEffectSaveReminderNotices({
    items: [caster(), bearer],
    previousInitiativeState: null,
    initiativeState: state(0, 2),
  });
  assert.equal(recoveredCurrentTurn.length, 1);
  assert.equal(recoveredCurrentTurn[0].activationId, notices[0].activationId);
});

test("Riscaldare il Metallo deriva il reminder dalla concentrazione del caster", () => {
  const heatMetalCaster = caster({
    [CONC_META_KEY]: {
      "riscaldare il metallo": {
        name: "Riscaldare il Metallo",
        spellId: "heat-metal",
        instanceId: "heat-metal-cast",
        targets: ["first"],
        appliedAt: { turnKey: "1:0:caster" },
      },
    },
  });
  const notices = planEffectSaveReminderNotices({
    items: [heatMetalCaster, target("first", [])],
    previousInitiativeState: state(2, 1),
    initiativeState: state(0, 2),
  });

  assert.equal(notices.length, 1);
  assert.equal(notices[0].target.id, "caster");
  assert.equal(notices[0].effectName, "Riscaldare il Metallo");
  assert.equal(notices[0].kind, "effect-reminder");
  assert.equal(notices[0].eyebrow, "Concentrazione");
  assert.match(notices[0].instruction, /azione bonus/);
  assert.match(notices[0].instruction, /2d8/);

  assert.deepEqual(planEffectSaveReminderNotices({
    items: [caster(), target("first", [])],
    previousInitiativeState: state(2, 1),
    initiativeState: state(0, 2),
  }), []);
});

test("Riscaldare il Metallo non ricorda la riattivazione nel turno del lancio", () => {
  const heatMetalCaster = caster({
    [CONC_META_KEY]: {
      heat: {
        name: "Riscaldare il Metallo",
        spellId: "heat-metal",
        instanceId: "heat-metal-cast",
        targets: ["first"],
        appliedAt: { turnKey: "2:0:caster" },
      },
    },
  });

  assert.deepEqual(planEffectSaveReminderNotices({
    items: [heatMetalCaster, target("first", [])],
    previousInitiativeState: null,
    initiativeState: state(0, 2),
  }), []);
});

test("un reminder di inizio turno non scatta nel turno in cui viene applicato", () => {
  const bearer = target("first", [
    condition("new-heat-metal", "turn-start", {
      actor: "source",
      appliedAt: { turnKey: "2:0:caster" },
    }),
  ]);
  assert.deepEqual(planEffectSaveReminderNotices({
    items: [caster(), bearer],
    previousInitiativeState: null,
    initiativeState: state(0, 2),
  }), []);
});

test("Nauseato consegna il reminder di fine turno nel nuovo turno visibile", () => {
  const first = target("first", [
    condition("eyebite-sickened", "turn-end", {
      condition: "Nauseato: svant. attacchi/prove",
      ability: "wis",
      label: "Se supera il TS, usa Segna Superato e rimuovi Nauseato.",
    }),
  ]);
  const notices = planEffectSaveReminderNotices({
    items: [caster(), first, target("second", [])],
    previousInitiativeState: state(1),
    initiativeState: state(2),
  });

  assert.equal(notices.length, 1);
  assert.equal(notices[0].target.id, "first");
  assert.equal(notices[0].timing, "turn-end");
  assert.equal(notices[0].turnKey, "1:2:second");
  assert.equal(
    notices[0].activationId,
    "eyebite-sickened:turn-end:1:1:first",
  );
});

test("supporta fine turno e danno, recuperando la CD dal caster sorgente", () => {
  const first = target("first", [
    condition("end-effect", "turn-end", { ability: "int" }),
    condition("damage-effect", "damage", {
      ability: "int",
      label: "Se supera, termina l'effetto.",
    }),
  ]);
  const items = [caster(), first, target("second", [])];

  const turnEnd = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: state(1),
    initiativeState: state(2),
  });
  const damage = effectSaveReminderNoticesForDamage({
    items,
    damageById: new Map([["first", 7]]),
    eventId: "damage-1",
  });

  assert.deepEqual(turnEnd.map((notice) => notice.effectName), [
    "Effetto persistente",
  ]);
  assert.equal(turnEnd[0].timing, "turn-end");
  assert.equal(damage[0].timing, "damage");
  assert.deepEqual(damage.map((notice) => ({
    target: notice.target.id,
    dc: notice.dc,
    activationId: notice.activationId,
  })), [{
    target: "first",
    dc: 16,
    activationId: "damage-effect:damage:damage-1",
  }]);
  assert.deepEqual(effectSaveReminderSourceIds([first]), ["caster"]);
});
