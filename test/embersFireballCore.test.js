import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBALL_BEAM_EFFECT_ID,
  FIREBALL_EXPLOSION_DELAY_MS,
  FIREBALL_EXPLOSION_EFFECT_ID,
  EMBERS_EFFECT_METADATA_KEY,
  buildFireballEmbersMessage,
  fireballEmbersRadiusFromPreview,
  fireballEmbersSizeFromPreview,
  fireballRadiusFromPreview,
  isEmbersFireballItem,
} from "../src/embersFireballCore.js";

test("riconosce gli item locali creati dal renderer Embers di Fireball", () => {
  assert.equal(isEmbersFireballItem({
    metadata: { [EMBERS_EFFECT_METADATA_KEY]: FIREBALL_EXPLOSION_EFFECT_ID },
  }), true);
  assert.equal(isEmbersFireballItem({
    metadata: { [EMBERS_EFFECT_METADATA_KEY]: "other.effect" },
  }), false);
});

test("calcola il raggio Fireball dal preview dell'area", () => {
  assert.equal(
    fireballRadiusFromPreview({
      start: { x: 100, y: 200 },
      end: { x: 400, y: 200 },
      radius: 45,
    }),
    45,
  );
  assert.equal(
    fireballRadiusFromPreview({ start: { x: 100, y: 200 }, end: { x: 400, y: 200 } }),
    300,
  );
  const preview = {
    start: { x: 100, y: 200 },
    end: { x: 6850, y: 200 },
    radius: 600,
    dpi: 150,
  };
  assert.equal(fireballEmbersRadiusFromPreview(preview), 4);
  assert.equal(fireballEmbersSizeFromPreview(preview), 8);
});

test("serializza beam ed esplosione in unità griglia Embers", () => {
  const message = buildFireballEmbersMessage({
    preview: {
      start: { x: 100, y: 200 },
      end: { x: 400, y: 200 },
      radius: 300,
      dpi: 150,
    },
    source: { x: -200, y: 200 },
    casterId: "caster-1",
  });

  assert.deepEqual(message.spellData, { name: "fireball", caster: "caster-1" });
  assert.equal(message.instructions[0].id, FIREBALL_BEAM_EFFECT_ID);
  assert.deepEqual(message.instructions[0].effectProperties, {
    copies: 1,
    source: { x: -200, y: 200 },
    destination: { x: 100, y: 200 },
  });
  assert.equal(message.instructions[1].id, FIREBALL_EXPLOSION_EFFECT_ID);
  assert.equal(message.instructions[1].delay, FIREBALL_EXPLOSION_DELAY_MS);
  assert.equal(message.instructions[1].effectProperties.size, 4);
});

test("senza caster invia comunque l'esplosione senza ritardo", () => {
  const message = buildFireballEmbersMessage({
    preview: {
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      dpi: 150,
    },
  });

  assert.equal(message.instructions.length, 1);
  assert.equal(message.instructions[0].id, FIREBALL_EXPLOSION_EFFECT_ID);
  assert.equal(message.instructions[0].delay, undefined);
  assert.equal(message.instructions[0].effectProperties.size, 2);
  assert.equal(message.spellData, undefined);
});

test("scarta un preview senza raggio", () => {
  assert.equal(buildFireballEmbersMessage({
    preview: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, dpi: 150 },
  }), null);
});
