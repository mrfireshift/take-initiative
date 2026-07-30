import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  buildPreparedSpellResolutionRequest,
  findPreparedSpellResolutionGroup,
  preparedSpellResolutionGroups,
  preparedSpellResolutionPopoverId,
} from "../src/preparedSpellResolutionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

function preparedItems({ phase = "prepare" } = {}) {
  const spell = getSpellDefinition("Punizione Collerica");
  const instanceId = "prepared:wrathful:1";
  return [{
    id: "caster",
    name: "Paladino",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        [SPELLS_META_KEY]: [{
          instanceId,
          name: spell.name,
          spellId: spell.id,
          casterId: "caster",
          conc: true,
          turns: 10,
          castContext: {
            phase,
            slotLevel: 1,
            applyAutomatedConditions: true,
          },
        }],
        [CONC_META_KEY]: {
          [spell.name.toLocaleLowerCase("it")]: {
            instanceId,
            name: spell.name,
            spellId: spell.id,
            targets: ["caster"],
          },
        },
      },
    },
  }, {
    id: "enemy",
    name: "Goblin",
    layer: "CHARACTER",
    metadata: { [META_KEY]: {} },
  }];
}

test("trova solo istanze ancora in fase di preparazione", () => {
  const groups = preparedSpellResolutionGroups(preparedItems());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].instanceId, "prepared:wrathful:1");
  assert.equal(groups[0].casterId, "caster");

  assert.equal(preparedSpellResolutionGroups(preparedItems({ phase: "resolve" })).length, 0);
  assert.equal(
    findPreparedSpellResolutionGroup(preparedItems(), "missing"),
    null,
  );
});

test("costruisce la stessa richiesta di risoluzione sul target selezionato", () => {
  const group = preparedSpellResolutionGroups(preparedItems())[0];
  const request = buildPreparedSpellResolutionRequest({
    group,
    targetIds: ["enemy", "enemy"],
  });

  assert.equal(request.castContext.phase, "resolve");
  assert.equal(request.phasePlan.phase, "resolve");
  assert.equal(request.casterId, "caster");
  assert.deepEqual(request.targetIds, ["enemy"]);
  assert.equal(request.activeConcentration.instanceId, "prepared:wrathful:1");
  assert.deepEqual(request.activeConcentration.targets, ["caster"]);
  assert.equal(request.historyLabel, "Risoluzione: Punizione Collerica");
});

test("rifiuta preparazioni stale o risoluzioni senza bersagli", () => {
  const group = preparedSpellResolutionGroups(preparedItems())[0];
  assert.throws(
    () => buildPreparedSpellResolutionRequest({ group, targetIds: [] }),
    /prepared-spell-targets-required/,
  );
  assert.throws(
    () => buildPreparedSpellResolutionRequest({
      group: { ...group, castContext: { phase: "resolve" } },
      targetIds: ["enemy"],
    }),
    /prepared-spell-stale/,
  );
});

test("genera id di popover stabili e distinti", () => {
  const first = preparedSpellResolutionPopoverId("prepared:one");
  assert.equal(first, preparedSpellResolutionPopoverId("prepared:one"));
  assert.notEqual(first, preparedSpellResolutionPopoverId("prepared:two"));
  assert.match(first, /prepared-spell-resolution/);
});
