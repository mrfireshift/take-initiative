import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mock } from "node:test";
import { ID } from "../src/constants.js";
import {
  classifySceneItemChanges,
} from "../src/sceneItemChangeDispatcherCore.js";
import {
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardQuickActionMemoryEligibleItems,
} from "../src/initiativeCardRegistryCore.js";

const META_KEY = `${ID}/meta`;
const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
);
const hpMemorySource = readFileSync(
  new URL("../src/hpMemory.js", import.meta.url),
  "utf8",
);
const initiativeCardsSource = readFileSync(
  new URL("../src/initiativeCards.js", import.meta.url),
  "utf8",
);

const sdkState = {
  role: "GM",
  sceneItemReads: 0,
  roomReads: 0,
  itemUpdates: 0,
};
const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => sdkState.role },
  room: {
    getMetadata: async () => {
      sdkState.roomReads += 1;
      return {};
    },
    setMetadata: async () => {},
  },
  scene: {
    getMetadata: async () => ({}),
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    items: {
      onChange: () => () => {},
      getItems: async () => {
        sdkState.sceneItemReads += 1;
        return [];
      },
      updateItems: async () => {
        sdkState.itemUpdates += 1;
      },
    },
  },
  broadcast: { onMessage: () => () => {} },
};
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", ...args }),
    buildImage: (...args) => ({ type: "IMAGE", ...args }),
    buildPath: (...args) => ({ type: "PATH", ...args }),
    buildText: (...args) => ({ type: "TEXT", ...args }),
    buildShape: (...args) => ({ type: "SHAPE", ...args }),
    Command: class Command {},
  },
});
const { applyHPMemoryToSceneForMissingHP } = await import("../src/hpMemory.js");

function character(id, {
  name = "Mira",
  layer = "CHARACTER",
  attachedTo,
  metadata = {},
  image = { url: `https://assets.test/${id}.png` },
} = {}) {
  return {
    id,
    name,
    layer,
    attachedTo,
    image,
    metadata: {
      [META_KEY]: {
        inInitiative: true,
        attitude: "pc",
        hp: 12,
        hpMax: 24,
        ...metadata,
      },
    },
  };
}

function withoutHP(id, options = {}) {
  const item = character(id, options);
  delete item.metadata[META_KEY].hp;
  delete item.metadata[META_KEY].hpMax;
  return item;
}

function event(before, after) {
  return classifySceneItemChanges(
    before ? [before] : [],
    after ? [after] : [],
  );
}

test("la matrice memory separa quick-action e legacy HP", () => {
  const base = character("matrix");

  for (const metadata of [
    { hp: 11 },
    { hpMax: 25 },
    { conditions: { poisoned: true } },
    { [`${ID}/spells`]: [{ spellId: "bless" }] },
    { classFeatureState: { rage: 1 } },
    { unrelated: { value: 1 } },
  ]) {
    const change = event(base, character("matrix", { metadata }));
    assert.deepEqual(change.candidateIds, {
      quickActionHydration: [],
      legacyHpHydration: [],
    });
  }

  const added = event(null, withoutHP("added"));
  assert.deepEqual(added.candidateIds.quickActionHydration, ["added"]);
  assert.deepEqual(added.candidateIds.legacyHpHydration, ["added"]);

  const identityWithHP = event(
    character("identity"),
    character("identity", { name: "Mira nuova", image: { url: "new.png" } }),
  );
  assert.deepEqual(identityWithHP.candidateIds.quickActionHydration, ["identity"]);
  assert.deepEqual(identityWithHP.candidateIds.legacyHpHydration, []);

  const identityWithoutHP = event(
    withoutHP("legacy-identity"),
    withoutHP("legacy-identity", { name: "Mira nuova", image: { url: "new.png" } }),
  );
  assert.deepEqual(identityWithoutHP.candidateIds.quickActionHydration, ["legacy-identity"]);
  assert.deepEqual(identityWithoutHP.candidateIds.legacyHpHydration, ["legacy-identity"]);

  const profileComplete = event(
    character("profile"),
    character("profile", {
      metadata: {
        initiativeCard: { quickActions: [{ id: "qa", label: "Bless", kind: "spell" }] },
      },
    }),
  );
  assert.deepEqual(profileComplete.candidateIds.quickActionHydration, []);

  const profileDeleted = event(
    character("profile-deleted", {
      metadata: {
        initiativeCard: { quickActions: [{ id: "qa", label: "Bless", kind: "spell" }] },
      },
    }),
    character("profile-deleted"),
  );
  assert.deepEqual(profileDeleted.candidateIds.quickActionHydration, ["profile-deleted"]);
  assert.deepEqual(profileDeleted.candidateIds.legacyHpHydration, []);

  const hpMissing = event(character("hp-missing"), withoutHP("hp-missing"));
  assert.deepEqual(hpMissing.candidateIds.quickActionHydration, []);
  assert.deepEqual(hpMissing.candidateIds.legacyHpHydration, ["hp-missing"]);

  const actorLinked = event(
    withoutHP("actor-linked", { metadata: { actorProfileId: "actor-1" } }),
    withoutHP("actor-linked", { metadata: { actorProfileId: "actor-1", hp: 7 } }),
  );
  assert.deepEqual(actorLinked.candidateIds.legacyHpHydration, []);

  const actorAdded = event(
    withoutHP("actor-added"),
    withoutHP("actor-added", { metadata: { actorProfileId: "actor-2" } }),
  );
  assert.deepEqual(actorAdded.candidateIds.legacyHpHydration, []);

  const pluginCleared = event(withoutHP("cleared"), {
    ...withoutHP("cleared"),
    metadata: {},
  });
  assert.deepEqual(pluginCleared.candidateIds.quickActionHydration, ["cleared"]);
  assert.deepEqual(pluginCleared.candidateIds.legacyHpHydration, ["cleared"]);

  const removed = event(character("removed"), null);
  assert.deepEqual(removed.candidateIds, {
    quickActionHydration: [],
    legacyHpHydration: [],
  });
});

test("gli ID dei domini sono uniti e deduplicati senza passare tutto event.items", () => {
  const before = [withoutHP("one"), withoutHP("two")];
  const after = [
    withoutHP("one", { name: "One updated" }),
    withoutHP("two", { image: { url: "two-new.png" } }),
  ];
  const change = classifySceneItemChanges(before, after);

  assert.deepEqual(change.invalidations.quickActionHydration.sort(), ["one", "two"]);
  assert.deepEqual(change.invalidations.legacyHpHydration.sort(), ["one", "two"]);
  assert.deepEqual(change.candidateIds.quickActionHydration.sort(), ["one", "two"]);
  assert.deepEqual(change.items.map((item) => item.id).sort(), ["one", "two"]);
  assert.deepEqual(change.allItems.map((item) => item.id).sort(), ["one", "two"]);

  const duplicate = event(character("one"), character("one"));
  assert.equal(duplicate.flags.any, false);
  assert.deepEqual(duplicate.candidateIds.quickActionHydration, []);
});

test("il registry viene consultato solo per candidati CHARACTER in iniziativa privi di quick actions", () => {
  const candidate = character("candidate", { name: "Omar" });
  const existing = character("existing", {
    name: "Existing",
    metadata: {
      initiativeCard: {
        quickActions: [{
          id: "already",
          label: "Già attiva",
          kind: "spell",
          spellId: "bless",
        }],
      },
    },
  });
  const excluded = [
    character("not-in-initiative", { metadata: { inInitiative: false } }),
    character("attachment", { attachedTo: "parent" }),
    character("not-character", { layer: "PROP" }),
    existing,
  ];
  const eligible = initiativeCardQuickActionMemoryEligibleItems(
    [candidate, ...excluded],
    { metadataKey: META_KEY },
  );
  assert.deepEqual(eligible.map((item) => item.id), ["candidate"]);

  const registry = {
    omar: {
      updatedAt: 3,
      profile: {
        quickActions: [{
          id: "remembered",
          label: "Animare oggetti",
          kind: "spell",
          spellId: "animate-objects",
        }],
      },
    },
  };
  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(eligible, registry, { metadataKey: META_KEY })
      .map((item) => item.id),
    ["candidate"],
  );
});

test("il bootstrap HP di initiativeList resta singolo e l'autofill mantiene i gate GM/merge", () => {
  assert.equal(
    (initiativeSource.match(/applyHPMemoryToSceneForMissingHP\(/g) || []).length,
    1,
  );
  assert.match(initiativeSource, /event\.flags\.quickActionHydration/);
  assert.match(initiativeSource, /event\.flags\.legacyHpHydration/);
  assert.match(initiativeSource, /candidateIds\?\.quickActionHydration/);
  assert.match(initiativeSource, /candidateIds\?\.legacyHpHydration/);
  assert.match(hpMemorySource, /await isGMAuthorized\(\)/);
  assert.match(hpMemorySource, /const nextMeta = \{\s*\.\.\.prev,\s*hp: t\.hp,\s*hpMax: t\.hpMax/s);
  assert.match(hpMemorySource, /__autofillCandidatesByEpoch/);
  assert.match(hpMemorySource, /for \(const id of candidateIds\) previous\.add\(id\)/);
});

test("i gate produttivi evitano Room/items reads senza candidati e bloccano il Player", async () => {
  const present = character("present");
  sdkState.role = "GM";
  sdkState.sceneItemReads = 0;
  sdkState.roomReads = 0;
  sdkState.itemUpdates = 0;
  await applyHPMemoryToSceneForMissingHP(0, {
    candidateIds: [present.id],
    items: [present],
    itemsComplete: true,
    isCurrent: () => true,
  });
  assert.equal(sdkState.sceneItemReads, 0);
  assert.equal(sdkState.roomReads, 0);
  assert.equal(sdkState.itemUpdates, 0);

  sdkState.role = "PLAYER";
  const missing = withoutHP("player-missing");
  await applyHPMemoryToSceneForMissingHP(0, {
    candidateIds: [missing.id],
    items: [missing],
    itemsComplete: true,
    isCurrent: () => true,
  });
  assert.equal(sdkState.sceneItemReads, 0);
  assert.equal(sdkState.roomReads, 0);
  assert.equal(sdkState.itemUpdates, 0);

  assert.match(
    initiativeCardsSource,
    /if \(!await initiativeCardHydrationIsGM\(options\)\)\s*\{\s*throw new Error\("initiative-card-hydration-requires-gm"\)/,
  );
  assert.equal(sdkState.sceneItemReads, 0);
  assert.equal(sdkState.roomReads, 0);
});
