import test from "node:test";
import assert from "node:assert/strict";
import {
  findInitiativeCardRegistryEntry,
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardRegistryKeys,
  mergeInitiativeCardRegistries,
  resolveInitiativeCardActorMatch,
} from "../src/initiativeCardRegistryCore.js";
import { isLegacyActorMigrationEligible } from "../src/actorIdentityCore.js";

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

test("dopo il collegamento il cambio di nome e ritratto usa actorProfileId", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const item = {
    id: "scene-b",
    name: "Nome nuovo",
    image: { url: "https://assets.test/new.png?rev=2" },
    metadata: { [metadataKey]: { actorProfileId: "actor-aria" } },
  };
  const entry = {
    actorProfileId: "actor-aria",
    profile: { armorClass: 18 },
    updatedAt: 20,
  };
  assert.equal(findInitiativeCardRegistryEntry({ old: entry }, item), entry);
});

test("un mostro con lo stesso asset non viene collegato alla migrazione PC/alleati", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const monster = {
    id: "monster",
    name: "Goblin",
    image: { url: "https://assets.test/goblin.png" },
    metadata: { [metadataKey]: { attitude: "enemy" } },
  };
  const [assetKey] = initiativeCardRegistryKeys(monster);
  resolveInitiativeCardActorMatch({ [assetKey]: { profile: { armorClass: 15 } } }, monster);
  assert.equal(isLegacyActorMigrationEligible(monster), false);
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

test("un token ricreato recupera anche la configurazione multiclasse", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const recreated = {
    id: "new-paladin",
    name: "Alaric",
    layer: "CHARACTER",
    metadata: { [metadataKey]: { inInitiative: true } },
  };
  const registry = {
    alaric: {
      profile: {
        characterBuild: [
          { classId: "paladino", level: 3 },
          { classId: "stregone", level: 2 },
        ],
        enabledClassFeatureIds: [
          "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia",
        ],
      },
      updatedAt: 100,
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [recreated],
      registry,
      { metadataKey },
    ).map((item) => item.id),
    ["new-paladin"],
  );
});

test("un profilo token vuoto non impedisce il recupero delle azioni rapide dalla Room", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const quickAction = {
    id: "fireball",
    label: "Palla di fuoco",
    kind: "spell",
    spellId: "fireball",
    targetMode: "selection",
  };
  const token = {
    id: "token-with-empty-profile",
    name: "Omar",
    layer: "CHARACTER",
    metadata: {
      [metadataKey]: {
        inInitiative: true,
        initiativeCard: { quickActions: [] },
      },
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [token],
      { omar: { profile: { quickActions: [quickAction] }, updatedAt: 100 } },
      { metadataKey },
    ).map((item) => item.id),
    ["token-with-empty-profile"],
  );
});
