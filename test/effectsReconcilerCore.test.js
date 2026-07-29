import test from "node:test";
import assert from "node:assert/strict";
import {
  collectEffectsInvalidation,
  conditionLabelNeedsUpdate,
  createEffectsReconcileQueue,
  isEffectsLocalRendererRole,
  isEffectsWidgetWriterRole,
} from "../src/effectsReconcilerCore.js";

test("solo il ruolo GM può ripulire i widget globali legacy degli effetti", () => {
  assert.equal(isEffectsWidgetWriterRole("GM"), true);
  assert.equal(isEffectsWidgetWriterRole("gm"), true);
  assert.equal(isEffectsWidgetWriterRole("PLAYER"), false);
  assert.equal(isEffectsWidgetWriterRole(undefined), false);
});

test("GM e player possono renderizzare widget locali isolati", () => {
  assert.equal(isEffectsLocalRendererRole("GM"), true);
  assert.equal(isEffectsLocalRendererRole("PLAYER"), true);
  assert.equal(isEffectsLocalRendererRole("player"), true);
  assert.equal(isEffectsLocalRendererRole(undefined), false);
});

test("la coda accorpa gli ID e non sovrappone le riconciliazioni", async () => {
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  const batches = [];
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const queue = createEffectsReconcileQueue({
    async run(batch, context) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const record = { ...batch, staleAtStart: context.isStale(), staleAtEnd: false };
      batches.push(record);
      if (batches.length === 1) await firstGate;
      record.staleAtEnd = context.isStale();
      active -= 1;
    },
  });

  const first = queue.request({ conditions: ["a", "a"], concentration: ["b"] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = queue.request({ conditions: ["c"], concentration: ["d", "d"] });
  releaseFirst();

  await Promise.all([first.done, second.done, queue.idle()]);
  assert.equal(maxActive, 1);
  assert.deepEqual(batches[0].conditions, ["a"]);
  assert.deepEqual(batches[0].concentration, ["b"]);
  assert.deepEqual(batches[1].conditions, ["c"]);
  assert.deepEqual(batches[1].concentration, ["d"]);
  assert.ok(batches[0].revision < batches[1].revision);
  assert.equal(batches[0].staleAtEnd, true);
  assert.equal(batches[1].staleAtEnd, false);
});

test("20 invalidazioni rapide convergono nell'ultimo batch senza concorrenza", async () => {
  let active = 0;
  let maxActive = 0;
  const seen = [];
  const queue = createEffectsReconcileQueue({
    async run(batch) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, batch.revision % 3));
      seen.push(...batch.conditions);
      active -= 1;
    },
  });

  const requests = [];
  for (let index = 0; index < 20; index += 1) {
    requests.push(queue.request({ conditions: [`token-${index}`] }).done);
  }
  await Promise.all([...requests, queue.idle()]);

  assert.equal(maxActive, 1);
  assert.equal(new Set(seen).size, 20);
  assert.ok(seen.includes("token-19"));
  assert.equal(queue.getState().latestRevision, queue.getState().completedRevision);
});

test("l'invalidazione usa solo token e include il caster indicato dalla spell", () => {
  const metaKey = "plugin/meta";
  const spellsKey = "plugin/spells";
  const event = {
    flags: { conditions: true, concentration: true },
    items: [
      {
        id: "target",
        metadata: {
          [metaKey]: {
            [spellsKey]: [{ name: "Velocità", casterId: "caster" }],
          },
        },
      },
      { id: "widget", metadata: { "plugin/condWidgetOf": "target" } },
    ],
    removedItems: [],
  };

  assert.deepEqual(collectEffectsInvalidation(event, { metaKey, spellsKey }), {
    full: false,
    conditions: ["target"],
    concentration: ["target", "caster"],
  });
});

test("il movimento invalida l'intero stack per correggere pill create durante il drag", () => {
  const metaKey = "plugin/meta";
  const spellsKey = "plugin/spells";
  assert.deepEqual(collectEffectsInvalidation({
    flags: { movement: true, conditions: false, concentration: false },
    items: [{
      id: "target",
      metadata: { [metaKey]: {} },
    }],
    removedItems: [],
  }, { metaKey, spellsKey }), {
    full: true,
    conditions: [],
    concentration: [],
  });
});

test("un widget condizione conforme non richiede update", () => {
  const desired = {
    targetId: "token",
    x: 10,
    y: 20,
    width: 120,
    height: 27,
    label: "Accecato",
    backgroundColor: "#0e131f",
    backgroundOpacity: 0.9,
    maxViewScale: 1.35,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1,
    textFill: "#f8fafc",
    textStroke: "rgba(2,6,23,.55)",
    textStrokeWidth: 1,
    zIndex: 100000,
  };
  const widget = {
    type: "LABEL",
    attachedTo: "token",
    layer: "TEXT",
    locked: true,
    disableHit: true,
    position: { x: 10, y: 20 },
    zIndex: 100000,
    style: {
      backgroundColor: "#0e131f",
      backgroundOpacity: 0.9,
      cornerRadius: 13.5,
      maxViewScale: 1.35,
      pointerWidth: 0,
      pointerHeight: 0,
      pointerDirection: "LEFT",
    },
    text: {
      type: "PLAIN",
      plainText: "Accecato",
      width: 120,
      height: 27,
      style: {
        padding: 0,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 1,
        textAlign: "CENTER",
        textAlignVertical: "MIDDLE",
        fillColor: "#f8fafc",
        fillOpacity: 1,
        strokeColor: "rgba(2,6,23,.55)",
        strokeWidth: 1,
      },
    },
  };

  assert.equal(conditionLabelNeedsUpdate(widget, desired), false);
  assert.equal(conditionLabelNeedsUpdate({ ...widget, position: { x: 11, y: 20 } }, desired), true);
});
