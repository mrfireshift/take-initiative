import test from "node:test";
import assert from "node:assert/strict";
import {
  factionRegistryCounts,
  mergeFactionAssets,
  registeredAttitudeForItem,
  removeFactionFromRegistry,
} from "../src/factionRegistryCore.js";

test("resolves renamed tokens from their image URL", () => {
  const registry = mergeFactionAssets({}, "pc", [
    { name: "Originale", image: { url: "https://assets.test/hero.png" } },
  ], 10);

  assert.equal(
    registeredAttitudeForItem(
      { name: "Nome cambiato", image: { url: "https://assets.test/hero.png" } },
      registry
    ),
    "pc"
  );
});

test("ignores transient query parameters in image URLs", () => {
  const registry = mergeFactionAssets({}, "enemy", [
    { name: "Orco", image: { url: "https://assets.test/orc.png?version=1" } },
  ], 10);

  assert.equal(
    registeredAttitudeForItem(
      { name: "Orco", image: { url: "https://assets.test/orc.png?version=2" } },
      registry
    ),
    "enemy"
  );
});

test("registers an item by name when no image URL is exposed", () => {
  const registry = mergeFactionAssets({}, "pc", [{ name: "Edelbrand" }], 10);

  assert.equal(
    registeredAttitudeForItem(
      { name: "Edelbrand", image: { url: "https://assets.test/new-image.png" } },
      registry
    ),
    "pc"
  );
});
test("falls back to the unnumbered token name when the image URL changes", () => {
  const registry = mergeFactionAssets({}, "ally", [
    { name: "Guardia", image: { url: "https://assets.test/guard-original.png" } },
  ], 10);

  assert.equal(
    registeredAttitudeForItem(
      { name: "(3) Guardia", image: { url: "https://assets.test/guard-copy.png" } },
      registry
    ),
    "ally"
  );
});

test("does not guess from an ambiguous token name", () => {
  let registry = mergeFactionAssets({}, "ally", [
    { name: "Guardia", image: { url: "https://assets.test/guard-a.png" } },
  ], 10);
  registry = mergeFactionAssets(registry, "enemy", [
    { name: "Guardia", image: { url: "https://assets.test/guard-b.png" } },
  ], 20);

  assert.equal(
    registeredAttitudeForItem(
      { name: "Guardia", image: { url: "https://assets.test/guard-new.png" } },
      registry
    ),
    ""
  );
});
test("moving an asset replaces its previous faction", () => {
  const ally = mergeFactionAssets({}, "ally", [
    { name: "Guardia", image: { url: "https://assets.test/guard.png" } },
  ], 10);
  const enemy = mergeFactionAssets(ally, "enemy", [
    { name: "Guardia", image: { url: "https://assets.test/guard.png" } },
  ], 20);

  assert.deepEqual(factionRegistryCounts(enemy), {
    ally: 0,
    neutral: 0,
    enemy: 1,
    pc: 0,
  });
});

test("clearing one faction preserves the others", () => {
  let registry = mergeFactionAssets({}, "pc", [
    { image: { url: "https://assets.test/hero.png" } },
  ], 10);
  registry = mergeFactionAssets(registry, "enemy", [
    { image: { url: "https://assets.test/orc.png" } },
  ], 10);

  assert.deepEqual(factionRegistryCounts(removeFactionFromRegistry(registry, "enemy")), {
    ally: 0,
    neutral: 0,
    enemy: 0,
    pc: 1,
  });
});
