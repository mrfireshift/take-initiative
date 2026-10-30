import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Audit online, ON-11/ON-12: three tracker paths wrote tokens from every open tracker, players' included. Online that
// made N+1 writers of the same boss or group, each from its own copy; with Owner Only the players' writes were refused.
// The functions are taken from the source and run with stubs: a player's tracker writes nothing, the GM's still does.
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const META_KEY = "com.thebigpicture.initiative/meta";

function functionSource(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `funzione assente: ${startMarker}`);
  return source.slice(start, end);
}

function fakeObr(items) {
  const calls = { getItems: 0, updateItems: 0 };
  return {
    calls,
    scene: {
      items: {
        async getItems() { calls.getItems += 1; return structuredClone(items); },
        async updateItems(ids, update) {
          calls.updateItems += 1;
          const drafts = structuredClone(items.filter((item) => ids.includes(item.id)));
          update(drafts);
        },
      },
    },
  };
}

const boss = () => ({ id: "boss", name: "Auril", metadata: { [META_KEY]: { legendary: { max: 3, current: 1 } } } });

function resetLegendaryFor(isGm, obr) {
  const body = functionSource("async function resetLegendaryIfAny(activeId)", "// Cambia il numero massimo di pips");
  return new Function("IS_GM", "OBR", "META_KEY", "readSceneItemsSnapshot", `${body}; return resetLegendaryIfAny;`)(
    isGm, obr, META_KEY, () => ({ complete: true, items: [boss()] }),
  );
}

test("il reset delle azioni leggendarie scrive solo dal tracker del GM", async () => {
  const player = fakeObr([boss()]);
  await resetLegendaryFor(false, player)("boss");
  assert.equal(player.calls.updateItems, 0);

  const gm = fakeObr([boss()]);
  await resetLegendaryFor(true, gm)("boss");
  assert.equal(gm.calls.updateItems, 1);
});

test("la rinomina degli omonimi non parte dal tracker di un giocatore", async () => {
  const body = functionSource("async function enforceUniqueNamePrefixes(", "async function updateHP(");
  const run = (isGm, obr) => new Function(
    "IS_GM", "OBR", "META_KEY", "currentSceneEpoch", "__isCurrentSceneOperation",
    `${body}; return enforceUniqueNamePrefixes;`,
  )(isGm, obr, META_KEY, () => 1, () => true);

  const player = fakeObr([]);
  await run(false, player)(1);
  assert.equal(player.calls.getItems, 0);

  const gm = fakeObr([]);
  await run(true, gm)(1);
  assert.equal(gm.calls.getItems, 1);
});

test("l'iniziativa dei nuovi membri di un gruppo la scrive solo il GM", async () => {
  const body = functionSource("async function __backfillInitiativeForSeededGroups(", "async function trySeedGroupInitiative(");
  let stateReads = 0;
  const run = (isGm) => new Function(
    "IS_GM", "OBR", "META_KEY", "currentSceneEpoch", "__isCurrentSceneOperation", "getSceneState",
    `${body}; return __backfillInitiativeForSeededGroups;`,
  )(isGm, fakeObr([]), META_KEY, () => 1, () => true, async () => { stateReads += 1; return { seededGroups: {} }; });

  assert.equal(await run(false)(1), false);
  assert.equal(stateReads, 0);
  await run(true)(1);
  assert.equal(stateReads, 1);
});
