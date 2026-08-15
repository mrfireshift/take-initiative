import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { METADATA_OWNERSHIP } from "../src/metadataKeyScoped.js";

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

test("initiative state ha un solo writer produttivo key-scoped", () => {
  const gateway = source("initiativeStateGateway.js");
  const initiativeList = source("initiativeList.js");
  const contextMenu = source("contextMenu.js");
  const stateWriteCalls = gateway.match(/writeSceneMetadataKey\(/g) || [];

  assert.equal(stateWriteCalls.length, 1);
  assert.match(gateway, /METADATA_OWNERSHIP\.INITIATIVE_STATE/);
  assert.doesNotMatch(initiativeList, /writeSceneMetadataKey\(/);
  assert.doesNotMatch(contextMenu, /writeSceneMetadataKey\(/);
  assert.match(initiativeList, /enqueueInitiativeState(?:Patch|Reducer)/);
  assert.match(contextMenu, /enqueueInitiativeStateReducer/);
  assert.deepEqual(METADATA_OWNERSHIP.INITIATIVE_STATE.owners, ["initiativeStateGateway.js"]);
});

test("i writer dichiarano ownership field-scoped per navigation e Paragon", () => {
  const initiativeList = source("initiativeList.js");
  const contextMenu = source("contextMenu.js");
  assert.match(initiativeList, /ownedFields: \["order", "current", "round", "collapsed"\]/);
  assert.match(initiativeList, /ownedFields: \["order", "current", "round", "seededGroups"\]/);
  assert.match(contextMenu, /ownedFields: \["paragonInits"\]/);
  assert.doesNotMatch(contextMenu, /\{\.\.\.prev[^\n]*paragonInits/);
});
