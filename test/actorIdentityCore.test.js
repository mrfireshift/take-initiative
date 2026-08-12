import assert from "node:assert/strict";
import test from "node:test";
import {
  actorProfileIdForCardSave,
  actorProfileIdFromItem,
  createActorProfileId,
  legacyActorIdentityKeys,
  metadataWithActorProfileId,
} from "../src/actorIdentityCore.js";
import { resolveInitiativeCardActorMatch } from "../src/initiativeCardRegistryCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";

function token(id, name, image, extra = {}) {
  return {
    id,
    name,
    image: { url: image },
    metadata: { [META_KEY]: { attitude: "pc", ...extra } },
  };
}

test("actorProfileId viene generato esplicitamente e non deriva dall'item ID", () => {
  const id = createActorProfileId({
    randomUUID: () => "00000000-0000-0000-0000-000000000001",
  });
  assert.equal(id, "actor_00000000-0000-0000-0000-000000000001");
  assert.notEqual(id, "token-scene-a");
});

test("il randomUUID di Web Crypto viene chiamato con il ricevitore corretto", () => {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) return;

  const original = cryptoObject.randomUUID;
  let receiver = null;
  Object.defineProperty(cryptoObject, "randomUUID", {
    configurable: true,
    writable: true,
    value() {
      receiver = this;
      return "00000000-0000-0000-0000-000000000002";
    },
  });
  try {
    assert.equal(
      createActorProfileId(),
      "actor_00000000-0000-0000-0000-000000000002",
    );
    assert.equal(receiver, cryptoObject);
  } finally {
    if (original === undefined) delete cryptoObject.randomUUID;
    else cryptoObject.randomUUID = original;
  }
});

test("il salvataggio conserva l'ID esistente e genera solo quando manca", () => {
  const existing = actorProfileIdForCardSave({
    item: token("scene-a", "Aria", "https://assets.test/aria.png", {
      actorProfileId: "actor_existing",
    }),
    value: { actorProfileId: "actor_other" },
    create: () => "actor_generated",
  });
  assert.equal(existing, "actor_existing");

  const fromProfile = actorProfileIdForCardSave({
    item: token("scene-b", "Aria", "https://assets.test/aria.png"),
    existingProfile: { actorProfileId: "actor_profile" },
    create: () => "actor_generated",
  });
  assert.equal(fromProfile, "actor_profile");

  const generated = actorProfileIdForCardSave({
    item: token("scene-c", "Aria", "https://assets.test/aria.png"),
    create: () => "actor_generated",
  });
  assert.equal(generated, "actor_generated");
});

test("la lettura/derivazione dell'identità è read-only", () => {
  const item = token("scene-a", "Aria", "https://assets.test/aria.png");
  const before = JSON.stringify(item);
  assert.equal(actorProfileIdFromItem(item), "");
  legacyActorIdentityKeys(item);
  assert.equal(JSON.stringify(item), before);
});

test("il matching legacy inequivocabile collega, quello ambiguo non collega", () => {
  const item = token("scene-a", "Aria", "https://assets.test/aria.png?cache=2");
  const [assetKey, nameKey] = legacyActorIdentityKeys(item);
  const uniqueEntry = {
    profile: { armorClass: 17 },
    updatedAt: 10,
  };
  assert.equal(
    resolveInitiativeCardActorMatch({ [assetKey]: uniqueEntry, [nameKey]: uniqueEntry }, item).status,
    "legacy",
  );

  const ambiguous = resolveInitiativeCardActorMatch({
    [assetKey]: { profile: { armorClass: 17 }, updatedAt: 10 },
    [nameKey]: { profile: { armorClass: 18 }, updatedAt: 11 },
  }, item);
  assert.equal(ambiguous.status, "ambiguous");
});

test("due attori distinti con stesso nome e ritratto non vengono fusi dopo il collegamento", () => {
  const itemA = token("scene-a", "Aria", "https://assets.test/aria.png", {
    actorProfileId: "actor-a",
  });
  const itemB = token("scene-b", "Aria", "https://assets.test/aria.png", {
    actorProfileId: "actor-b",
  });
  assert.notEqual(actorProfileIdFromItem(itemA), actorProfileIdFromItem(itemB));
  assert.notEqual(
    metadataWithActorProfileId(itemA.metadata[META_KEY], "actor-a").actorProfileId,
    metadataWithActorProfileId(itemB.metadata[META_KEY], "actor-b").actorProfileId,
  );
});
