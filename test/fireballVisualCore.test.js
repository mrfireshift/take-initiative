import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBALL_VISUAL_CHANNEL,
  FIREBALL_VISUAL_EVENT_TYPE,
  buildFireballVisualEvent,
  fireballVideoPlan,
  fireballLocalVisualLayers,
  fireballRadiusFromPreview,
} from "../src/fireballVisualCore.js";

test("costruisce un evento visuale neutro senza dipendere da Embers", () => {
  const event = buildFireballVisualEvent({
    preview: {
      start: { x: 100, y: 200 },
      end: { x: 6850, y: 200 },
      radius: 600,
      dpi: 150,
    },
    casterId: "caster-1",
    eventId: "spell-1",
  });

  assert.equal(FIREBALL_VISUAL_CHANNEL, "com.thebigpicture.initiative/fireball-visual");
  assert.deepEqual(event, {
    type: FIREBALL_VISUAL_EVENT_TYPE,
    eventId: "spell-1",
    center: { x: 100, y: 200 },
    radius: 600,
    dpi: 150,
    casterId: "caster-1",
  });
  assert.equal(fireballRadiusFromPreview(event), 600);
});

test("il fallback conserva il raggio reale e crea livelli animabili", () => {
  const layers = fireballLocalVisualLayers({ radius: 600, dpi: 150 });
  assert.equal(layers.length, 4);
  assert.equal(layers[0].radius, 600);
  assert.equal(layers[0].shape, "circle");
  assert.equal(layers[1].radius, 504);
  assert.equal(layers[1].shape, "blob");
  assert.equal(layers[2].radius, 300);
  assert.equal(layers[2].shape, "blob");
  assert.equal(layers[3].shape, "rays");
});

test("scarta un evento visuale senza centro o raggio", () => {
  assert.equal(buildFireballVisualEvent({
    preview: { start: { x: 0, y: 0 }, radius: 0, dpi: 150 },
  }), null);
});

test("replica il piano video WebM di Embers con beam, ritardo e dimensioni coerenti", () => {
  const plan = fireballVideoPlan({
    center: { x: 1000, y: 500 },
    source: { x: 400, y: 500 },
    radius: 600,
    dpi: 150,
  });

  assert.equal(plan.explosionDelay, 3000);
  assert.equal(plan.duration, 4040);
  assert.equal(plan.explosion.width, 800);
  assert.equal(plan.explosion.height, 800);
  assert.equal(plan.explosion.scale, 2);
  assert.equal(plan.beam.width, 1000);
  assert.equal(plan.beam.height, 400);
  assert.equal(plan.beam.rotation, 0);
  assert.match(plan.explosion.url, /jb2a-free\.s3\.eu-west-3\.amazonaws\.com/);
  assert.match(plan.beam.url, /FireballBeam_01_Orange_15ft_1000x400\.webm$/);
});
