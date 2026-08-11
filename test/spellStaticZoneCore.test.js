import test from "node:test";
import assert from "node:assert/strict";

import {
  SPELL_STATIC_ZONE_META_KEY,
  activeSpellInstanceIds,
  isStaticSpellZoneRule,
  scopedStaticSpellZoneTargetIds,
  staleStaticSpellZoneItemIds,
  staticSpellZoneOwnerOperation,
  staticSpellZoneItems,
  staticSpellZoneItemsEndedByPlan,
  staticSpellZoneMetadata,
} from "../src/spellStaticZoneCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const META = "meta";
const SPELLS = "spells";
const CONCENTRATION = "concentration";

const zone = (id, instanceId, casterId = "caster") => ({
  id,
  metadata: {
    [SPELL_STATIC_ZONE_META_KEY]: staticSpellZoneMetadata({
      instanceId,
      ruleId: "web:cast",
      spellId: "web",
      casterId,
    }),
  },
});

test("la regola di Web espone il lifecycle di una zona statica", () => {
  assert.equal(isStaticSpellZoneRule(getSpellAreaRuleById("web:cast")), true);
  assert.equal(isStaticSpellZoneRule(getSpellAreaRuleById("entangle:cast")), true);
  assert.equal(isStaticSpellZoneRule(getSpellAreaRuleById("moonbeam:cast")), true);
  assert.equal(isStaticSpellZoneRule(getSpellAreaRuleById("fireball:cast")), false);
});

test("le zone sono ricercabili per istanza e caster", () => {
  const items = [
    zone("root", "spell-1"),
    zone("geometry", "spell-1"),
    zone("other", "spell-2", "other-caster"),
  ];
  assert.deepEqual(
    staticSpellZoneItems(items, { instanceId: "spell-1" }).map((item) => item.id),
    ["root", "geometry"],
  );
  assert.deepEqual(
    staticSpellZoneItems(items, { casterId: "other-caster" }).map((item) => item.id),
    ["other"],
  );
});

test("una zona diventa obsoleta soltanto quando istanza e concentrazione scompaiono", () => {
  const items = [
    zone("active-root", "spell-1"),
    zone("concentration-root", "spell-2"),
    zone("stale-root", "spell-3"),
    {
      id: "target",
      metadata: {
        [META]: {
          [SPELLS]: [{ instanceId: "spell-1" }],
        },
      },
    },
    {
      id: "caster",
      metadata: {
        [META]: {
          [CONCENTRATION]: {
            web: { instanceId: "spell-2" },
          },
        },
      },
    },
  ];
  assert.deepEqual(
    [...activeSpellInstanceIds(items, {
      metaKey: META,
      spellsKey: SPELLS,
      concentrationKey: CONCENTRATION,
    })].sort(),
    ["spell-1", "spell-2"],
  );
  assert.deepEqual(staleStaticSpellZoneItemIds(items, {
    metaKey: META,
    spellsKey: SPELLS,
    concentrationKey: CONCENTRATION,
  }), ["stale-root"]);
});

test("una zona non concentrata registra sul caster un marker di lifecycle", () => {
  const rule = {
    ...getSpellAreaRuleById("entangle:cast"),
    spellId: "grease",
  };
  const operation = staticSpellZoneOwnerOperation({
    rule,
    spell: {
      id: "grease",
      displayName: "Unto",
      concentration: false,
      defaultTurns: 10,
    },
    instanceId: "grease-instance",
    casterId: "caster",
    appliedAt: { round: 2, actorId: "caster", phase: "turn" },
  });
  assert.equal(operation.type, "spell:upsert");
  assert.deepEqual(operation.targetIds, ["caster"]);
  assert.equal(operation.turns, 10);
  assert.equal(operation.expiry, undefined);
  assert.equal(operation.castContext.staticZoneOwner, true);
  assert.equal(operation.castContext.staticZoneRuleId, rule.id);

  assert.equal(staticSpellZoneOwnerOperation({
    rule,
    spell: { ...operation, concentration: true },
    instanceId: "concentrated",
    casterId: "caster",
  }), null);
});

test("una zona senza durata finita resta a rimozione manuale", () => {
  const rule = {
    ...getSpellAreaRuleById("entangle:cast"),
    spellId: "symbol",
  };
  const operation = staticSpellZoneOwnerOperation({
    rule,
    spell: {
      id: "symbol",
      displayName: "Simbolo",
      concentration: false,
      defaultTurns: null,
    },
    instanceId: "symbol-instance",
    casterId: "caster",
  });

  assert.equal(operation.turns, 1);
  assert.deepEqual(operation.expiry, { mode: "manual" });
});

test("una zona concentrata senza altri effetti conserva la durata sul caster", () => {
  const rule = getSpellAreaRuleById("incendiary-cloud:cast");
  const operation = staticSpellZoneOwnerOperation({
    rule,
    spell: {
      id: "incendiary-cloud",
      displayName: "Nube incendiaria",
      concentration: true,
      defaultTurns: 10,
    },
    instanceId: "incendiary-cloud-instance",
    casterId: "caster",
    appliedAt: { round: 3, actorId: "caster", phase: "turn" },
    trackConcentration: true,
  });

  assert.equal(operation.type, "spell:upsert");
  assert.deepEqual(operation.targetIds, ["caster"]);
  assert.equal(operation.turns, 10);
  assert.equal(operation.conc, true);
  assert.deepEqual(operation.expiry, { mode: "concentration" });
  assert.equal(operation.castContext.staticZoneOwner, true);
  assert.equal(operation.castContext.staticZoneRuleId, rule.id);
});

test("il piano di terminazione distingue una zona conclusa da una ancora attiva", () => {
  const items = [
    zone("ended-root", "spell-ended"),
    zone("active-root", "spell-active"),
  ];
  const ended = staticSpellZoneItemsEndedByPlan(items, {
    changes: [{
      before: {
        spells: [{ instanceId: "spell-ended" }],
        concentrations: {
          active: { instanceId: "spell-active" },
        },
      },
      after: {
        spells: [],
        concentrations: {
          active: { instanceId: "spell-active" },
        },
      },
    }],
  });
  assert.deepEqual(ended.map((item) => item.id), ["ended-root"]);
  assert.deepEqual(staticSpellZoneItemsEndedByPlan(items, { changes: [] }), []);
});

test("la zona conserva la variante di regola scelta e la registra nel contesto del caster", () => {
  const metadata = staticSpellZoneMetadata({
    instanceId: "winds-1",
    ruleId: "xanathar-controllare-venti:cast",
    spellId: "xanathar-controllare-venti",
    casterId: "caster",
    ruleChoice: "downdraft",
  });
  assert.equal(metadata.ruleChoice, "downdraft");

  const operation = staticSpellZoneOwnerOperation({
    rule: getSpellAreaRuleById("xanathar-controllare-venti:cast"),
    spell: getSpellDefinition("xanathar-controllare-venti"),
    instanceId: "winds-1",
    casterId: "caster",
    trackConcentration: true,
    ruleChoice: "downdraft",
  });
  assert.equal(operation.castContext.choice, "downdraft");
});

test("una zona target-scoped ignora le altre creature nella sagoma", () => {
  const rule = getSpellAreaRuleById("phb2014-allucinazione-di-forza:cast");
  const metadata = staticSpellZoneMetadata({
    instanceId: "phantasmal-force-1",
    ruleId: rule.id,
    spellId: rule.spellId,
    casterId: "caster",
    targetIds: ["target", "target"],
  });

  assert.deepEqual(metadata.targetIds, ["target"]);
  assert.deepEqual(scopedStaticSpellZoneTargetIds({
    rule,
    zoneMetadata: metadata,
    targetIds: ["target", "bystander"],
  }), ["target"]);
});
