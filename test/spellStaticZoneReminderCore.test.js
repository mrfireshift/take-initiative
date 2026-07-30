import test from "node:test";
import assert from "node:assert/strict";

import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import {
  mergeStaticSpellZoneReminderMetadata,
  planStaticSpellZoneReminder,
} from "../src/spellStaticZoneReminderCore.js";
import { consumeSpellZoneTrigger } from "../src/spellZoneTriggerCore.js";

const rule = getSpellAreaRuleById("web:cast");
const order = ["caster", "first", "second", "third"];
const itemsById = new Map(order.map((id) => [id, {
  id,
  name: id[0].toUpperCase() + id.slice(1),
  image: { url: `https://example.test/${id}.png` },
}]));

function initiativeState(current, round = 1) {
  return { order, current, round };
}

function zoneItem() {
  return {
    id: "web-zone",
    name: "Zona: Ragnatela",
    position: { x: 100, y: 200 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        version: 1,
        instanceId: "web-instance",
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId: "caster",
        role: "root",
      },
    },
  };
}

function reconcile(item, current, round, now) {
  const update = planStaticSpellZoneReminder({
    zoneItem: item,
    rule,
    desiredTargetIds: ["first", "second", "third"],
    initiativeState: initiativeState(current, round),
    itemsById,
    now,
  });
  if (update.changed) {
    item.metadata = {
      ...item.metadata,
      [SPELL_STATIC_ZONE_META_KEY]: mergeStaticSpellZoneReminderMetadata(
        item.metadata[SPELL_STATIC_ZONE_META_KEY],
        update,
      ),
    };
  }
  return update;
}

function consume(item, activationId) {
  const metadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
  item.metadata = {
    ...item.metadata,
    [SPELL_STATIC_ZONE_META_KEY]: {
      ...metadata,
      triggerRuntime: consumeSpellZoneTrigger(
        metadata.triggerRuntime,
        activationId,
      ),
    },
  };
}

test("Ragnatela consegna reminder persistiti a token e turni successivi", () => {
  const item = zoneItem();
  assert.deepEqual(reconcile(item, 0, 1, 100).notices, []);

  const first = reconcile(item, 1, 1, 200);
  assert.deepEqual(first.notices.map((notice) =>
    notice.targets.map((target) => target.id)
  ), [["first"]]);
  consume(item, first.notices[0].activationId);

  const second = reconcile(item, 2, 1, 300);
  assert.deepEqual(second.notices.map((notice) =>
    notice.targets.map((target) => target.id)
  ), [["second"]]);
  consume(item, second.notices[0].activationId);

  const third = reconcile(item, 3, 1, 400);
  assert.deepEqual(third.notices.map((notice) =>
    notice.targets.map((target) => target.id)
  ), [["third"]]);
  consume(item, third.notices[0].activationId);

  const nextRound = reconcile(item, 1, 2, 500);
  assert.deepEqual(nextRound.notices.map((notice) =>
    notice.targets.map((target) => target.id)
  ), [["first"]]);
  assert.equal(
    item.metadata[SPELL_STATIC_ZONE_META_KEY].triggerRuntime.pending.length,
    1,
  );
});
