import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { createBossActionProfileStore, latestRevision } from "../src/bossActionProfileStore.js";

const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
function storageHarness() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("local export/import preserves full definitions and revisions in a separate namespace", async () => {
  const storage = storageHarness();
  const profile = await importBossActionHTML(html, { sourceName: "auril.html" });
  const store = createBossActionProfileStore({ storage });
  assert.equal(store.get(profile.profileId, profile.profileRevision), null);
  assert.deepEqual(store.put(profile), profile);
  const reconstructed = createBossActionProfileStore({ storage });
  assert.deepEqual(reconstructed.get(profile.profileId, profile.profileRevision), profile);
  assert.deepEqual(reconstructed.list(), [profile]);
  assert.deepEqual([...storage.values.keys()], ["com.thebigpicture.initiative/bossActionProfiles/v1"]);
  const nextStorage = storageHarness();
  const second = createBossActionProfileStore({ storage: nextStorage });
  assert.deepEqual(second.importProfile(store.exportProfile(profile.profileId, profile.profileRevision)), profile);
  assert.deepEqual(second.get(profile.profileId, profile.profileRevision), profile);
  assert.throws(() => store.exportProfile("missing", "missing"), /not found/i);
});

test("separate revisions are retained and a revision cannot silently overwrite a different definition", async () => {
  const store = createBossActionProfileStore({ storage: storageHarness() });
  const first = await importBossActionHTML(html);
  const next = await importBossActionHTML(html.replace("Auril occupa due", "Auril ora occupa due"));
  store.put(first);
  store.put(next);
  assert.equal(first.profileId, next.profileId);
  assert.notEqual(first.profileRevision, next.profileRevision);
  assert.equal(store.list().length, 2);
  const conflict = structuredClone(first);
  conflict.name = "Different definition at same revision";
  assert.throws(() => store.put(conflict), /revision|conflict/i);
  const fetched = store.get(first.profileId, first.profileRevision);
  fetched.abilities[0].name = "client mutation";
  assert.notEqual(store.get(first.profileId, first.profileRevision).abilities[0].name, "client mutation");
});

test("malformed JSON and invalid profiles never write or truncate the store", async () => {
  const storage = storageHarness();
  const store = createBossActionProfileStore({ storage });
  const profile = await importBossActionHTML(html);
  store.put(profile);
  const before = [...storage.values.entries()];
  assert.throws(() => store.importProfile("{bad json"), /JSON|json/i);
  assert.throws(() => store.importProfile(JSON.stringify({ ...profile, profileVersion: 999 })), /unsupported|invalid/i);
  assert.throws(() => store.importProfile(JSON.stringify({ ...profile, rawSource: { ...profile.rawSource, sourceHash: "0".repeat(64) } })), /integrity|invalid/i);
  assert.deepEqual([...storage.values.entries()], before);
});

test("storage read, quota, and unavailable storage errors surface to the caller", async () => {
  const profile = await importBossActionHTML(html);
  const readFailure = createBossActionProfileStore({ storage: { getItem() { throw new Error("read denied"); }, setItem() {} } });
  assert.throws(() => readFailure.list(), /read denied/);
  const quota = createBossActionProfileStore({ storage: { getItem() { return null; }, setItem() { throw new Error("quota exceeded"); } } });
  assert.throws(() => quota.put(profile), /quota exceeded/);
  assert.throws(() => createBossActionProfileStore({ storage: null }).put(profile), /storage|unavailable/i);
  const corrupt = storageHarness();
  corrupt.setItem("com.thebigpicture.initiative/bossActionProfiles/v1", "{truncated");
  assert.throws(() => createBossActionProfileStore({ storage: corrupt }).list(), /JSON|json/i);
});


test("stored version 1 definitions round trip unchanged beside the new parser revision of the same HTML", async () => {
  const revision = createHash("sha256").update(html).digest("hex");
  const legacy = {
    profileVersion: 1, parserVersion: 1,
    profileId: "auril-fase2", profileRevision: revision, bossDefinitionId: "auril", phaseId: "fase2",
    name: "Auril", type: "Divinità",
    rawSource: { html, sourceName: "old-export.html", sourceHash: revision }, diagnostics: [],
    abilities: [{ id: "icekiss-2", name: "Icekiss +2", category: "epic-action", automation: "SUPPORTED", rawText: "Original Icekiss attack", usage: {},
      execution: { kind: "attack-damage", attack: { bonus: 12, modes: ["melee", "ranged"], reach: 10, range: { normal: 150, long: 600 } },
        target: { mode: "single", maxTargets: 1 }, damage: [
          { id: "slashing", formula: "2d10+7", printedAverage: 18, type: "slashing" },
          { id: "cold", formula: "2d6", printedAverage: 7, type: "cold" },
        ] } }],
  };
  const storage = storageHarness();
  storage.setItem("com.thebigpicture.initiative/bossActionProfiles/v1", JSON.stringify({ version: 1, profiles: [legacy] }));
  const store = createBossActionProfileStore({ storage });
  assert.deepEqual(store.list(), [legacy]);
  const exported = store.exportProfile(legacy.profileId, legacy.profileRevision);
  assert.deepEqual(JSON.parse(exported), legacy);
  const destination = createBossActionProfileStore({ storage: storageHarness() });
  assert.deepEqual(destination.importProfile(exported), legacy);
  assert.deepEqual(destination.list(), [legacy]);
  const current = await importBossActionHTML(html);
  assert.equal(current.profileId, legacy.profileId);
  assert.equal(current.rawSource.sourceHash, legacy.rawSource.sourceHash);
  assert.notEqual(current.profileRevision, legacy.profileRevision);
  assert.deepEqual(store.put(current), current);
  assert.deepEqual(store.list(), [legacy, current]);
  assert.deepEqual(JSON.parse(storage.values.get("com.thebigpicture.initiative/bossActionProfiles/v1")), { version: 1, profiles: [legacy, current] });
});


test("version 2 Polar Ray printed total survives local export and JSON import", async () => {
  const polarHTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
  const profile = await importBossActionHTML(polarHTML);
  const store = createBossActionProfileStore({ storage: storageHarness() });
  store.put(profile);
  const exported = store.exportProfile(profile.profileId, profile.profileRevision);
  const imported = createBossActionProfileStore({ storage: storageHarness() }).importProfile(exported);
  const execution = imported.abilities.find((entry) => entry.name === "Polar Ray").execution;
  assert.equal(execution.printedTotalAverage, 21);
  assert.deepEqual(execution.damage.map((part) => part.average), [10, 10]);
});

test("cleanup: remove one revision, prune superseded ones but keep the newest per phase and every revision in use", async () => {
  const store = createBossActionProfileStore({ storage: storageHarness() });
  const phase3 = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
  const a = store.put(await importBossActionHTML(html));
  const b = store.put(await importBossActionHTML(html.replace("Auril occupa due", "Auril ora occupa due")));
  const c = store.put(await importBossActionHTML(html.replace("Auril occupa due", "Auril adesso occupa due")));
  const p3 = store.put(await importBossActionHTML(phase3));
  assert.deepEqual(store.supersededRevisions().map((row) => row.profileRevision), [a.profileRevision, b.profileRevision]);
  assert.deepEqual(store.supersededRevisions({ keep: [{ profileId: a.profileId, profileRevision: a.profileRevision }] }).map((row) => row.profileRevision), [b.profileRevision]);
  assert.equal(store.prune({ keep: [{ profileId: a.profileId, profileRevision: a.profileRevision }] }), 1);
  assert.deepEqual(store.list().map((row) => row.profileRevision), [a.profileRevision, c.profileRevision, p3.profileRevision]);
  assert.equal(store.remove(a.profileId, a.profileRevision), true);
  assert.equal(store.remove(a.profileId, a.profileRevision), false, "already gone");
  assert.deepEqual(store.list().map((row) => row.profileRevision), [c.profileRevision, p3.profileRevision]);
  assert.equal(store.prune(), 0);
});

test("the newest revision prefers the highest parser version over import order", async () => {
  const current = await importBossActionHTML(html);
  const older = { ...structuredClone(current), profileVersion: 2, profileRevision: "f".repeat(64) };
  assert.equal(latestRevision(current.profileId, [current, older]).profileRevision, current.profileRevision, "an old HTML imported later is not the newest");
  assert.equal(latestRevision(current.profileId, [older, current]).profileRevision, current.profileRevision);
  assert.equal(latestRevision("missing", [current]), null);
});
