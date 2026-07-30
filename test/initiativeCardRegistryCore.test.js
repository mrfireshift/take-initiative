import test from "node:test";
import assert from "node:assert/strict";
import {
  findInitiativeCardRegistryEntry,
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardRegistryKeys,
  mergeInitiativeCardRegistries,
} from "../src/initiativeCardRegistryCore.js";

test("initiative card identity survives scene-specific names and URL query changes", () => {
  const first = { name: "Edelbrand", image: { url: "https://assets.test/hero.png?version=1" } };
  const second = { name: "Nome scena diverso", image: { url: "https://assets.test/hero.png?version=2" } };
  const [assetKey] = initiativeCardRegistryKeys(first);
  const entry = { profile: { armorClass: 18 }, updatedAt: 100 };
  assert.equal(findInitiativeCardRegistryEntry({ [assetKey]: entry }, second), entry);
});

test("initiative card identity keeps the legacy normalized-name fallback", () => {
  const entry = { profile: { armorClass: 17 }, updatedAt: 100 };
  assert.equal(
    findInitiativeCardRegistryEntry({ guardia: entry }, { name: "(3) Guardia" }),
    entry
  );
});

test("registry merge preserves the newest copy from room or local storage", () => {
  const older = { profile: { armorClass: 14 }, updatedAt: 100 };
  const newer = { profile: { armorClass: 19 }, updatedAt: 200 };
  assert.deepEqual(mergeInitiativeCardRegistries({ hero: older }, { hero: newer }), { hero: newer });
  assert.deepEqual(mergeInitiativeCardRegistries({ hero: newer }, { hero: older }), { hero: newer });
});

test("un token ricreato in iniziativa recupera le azioni rapide dalla memoria", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const quickAction = {
    id: "fireball",
    label: "Palla di fuoco",
    kind: "spell",
    spellId: "fireball",
    workflow: "area",
    targetMode: "selection",
  };
  const recreated = {
    id: "new-token",
    name: "Omar",
    layer: "CHARACTER",
    metadata: { [metadataKey]: { inInitiative: true } },
  };
  const alreadyHydrated = {
    ...recreated,
    id: "hydrated-token",
    metadata: {
      [metadataKey]: {
        inInitiative: true,
        initiativeCard: { quickActions: [quickAction] },
      },
    },
  };
  const outsideInitiative = {
    ...recreated,
    id: "outside-token",
    metadata: { [metadataKey]: {} },
  };
  const registry = {
    omar: {
      profile: { quickActions: [quickAction] },
      updatedAt: 100,
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [recreated, alreadyHydrated, outsideInitiative],
      registry,
      { metadataKey },
    ).map((item) => item.id),
    ["new-token"],
  );
});
