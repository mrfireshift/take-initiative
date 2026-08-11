import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { planPluginDerivedDataCleanup } from "../src/pluginDataCleanupCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  staticSpellZoneMetadata,
} from "../src/spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "../src/spellBoardTokenCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

function zone(id, instanceId) {
  return {
    id,
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: staticSpellZoneMetadata({
        instanceId,
        ruleId: "web:cast",
        spellId: "web",
        casterId: "caster",
      }),
    },
  };
}

function boardToken(id, instanceId) {
  return {
    id,
    metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: {
        kind: "spell-board-token",
        instanceId,
        casterId: "caster",
        spellId: "spiritual-weapon",
      },
    },
  };
}

test("la pulizia propone solo derivati orfani e non token", () => {
  const items = [
    {
      id: "caster",
      metadata: {
        [META_KEY]: {
          [SPELLS_KEY]: [{ instanceId: "active-spell" }],
          conditions: [{ id: "condition-1", name: "Concentrato" }],
        },
      },
    },
    zone("active-zone", "active-spell"),
    zone("stale-zone", "missing-spell"),
    boardToken("active-board-token", "active-spell"),
    boardToken("stale-board-token", "missing-spell"),
  ];

  const plan = planPluginDerivedDataCleanup(items);

  assert.deepEqual(plan.deleteIds.sort(), ["stale-board-token", "stale-zone"]);
  assert.deepEqual(plan.staleZoneIds, ["stale-zone"]);
  assert.deepEqual(plan.staleBoardTokenIds, ["stale-board-token"]);
  assert.equal(plan.tokenMetadataTouched, false);
  assert.equal(plan.tokenIds.has("caster"), true);
  assert.equal(plan.deleteIds.includes("caster"), false);
});

test("la pulizia tollera input incompleto senza inventare cancellazioni", () => {
  const plan = planPluginDerivedDataCleanup([null, {}, { id: "plain" }]);

  assert.deepEqual(plan.deleteIds, []);
  assert.deepEqual(plan.staleZoneIds, []);
  assert.deepEqual(plan.staleBoardTokenIds, []);
});
