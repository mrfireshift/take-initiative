// The spell details of the card and the ritual cast (PHB 2014): no slot, and only for the classes that can.
import test from "node:test";
import assert from "node:assert/strict";
import { buildQuickActionSpellLaunchPlan } from "../src/quickActionSpellExecutionCore.js";
import { planSpellCastCost } from "../src/spellSlotSpendCore.js";
import {
  spellbookGroupsForProfile,
  spellbookQuickAction,
  spellbookRitualCastable,
  spellbookSpell,
  spellbookSpellDetails,
} from "../src/spellbookCatalog.js";
import { routeSpellUnifiedPanelOpenRequest, buildSpellUnifiedPanelRouteQuery } from "../src/spellUnifiedPanelRoutingCore.js";

const bookSpell = (profile, spellId) => spellbookGroupsForProfile(profile)
  .flatMap((group) => group.spells)
  .find((spell) => spell.id === spellId);

test("an expanded spell shows its rules text from the Italian reference", () => {
  const details = spellbookSpellDetails("detect-magic");
  assert.equal(details.castingTime, "1 azione");
  assert.equal(details.components, "V, S");
  assert.match(details.duration, /10 minuti/);
  assert.ok(details.description.length > 50);
  assert.equal(spellbookSpell("detect-magic").ritual, true);
  assert.equal(spellbookSpell("fireball").ritual, false);
  assert.equal(spellbookSpellDetails("not-a-spell"), null);
});

test("a wizard casts the rituals of its book even unprepared; a cleric only prepared ones; a sorcerer none", () => {
  const book = { spellIds: ["detect-magic", "magic-missile"], pinnedIds: [], unpreparedIds: ["detect-magic"] };
  const wizard = { characterBuild: [{ classId: "mago", level: 3 }], abilityModifiers: { int: 3 }, spellbook: book };
  const cleric = { characterBuild: [{ classId: "chierico", level: 3 }], abilityModifiers: { wis: 3 }, spellbook: book };
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 3 }], spellbook: book };
  const bard = { characterBuild: [{ classId: "bardo", level: 3 }], spellbook: book };
  assert.equal(bookSpell(wizard, "detect-magic").prepared, false);
  assert.equal(spellbookRitualCastable(wizard, bookSpell(wizard, "detect-magic")), true);
  assert.equal(spellbookRitualCastable(cleric, bookSpell(cleric, "detect-magic")), false, "not prepared today");
  assert.equal(spellbookRitualCastable({ ...cleric, spellbook: { ...book, unpreparedIds: [] } },
    bookSpell({ ...cleric, spellbook: { ...book, unpreparedIds: [] } }, "detect-magic")), true);
  assert.equal(spellbookRitualCastable(bard, bookSpell(bard, "detect-magic")), true, "a bard casts the rituals it knows");
  assert.equal(spellbookRitualCastable(sorcerer, bookSpell(sorcerer, "detect-magic")), false);
  assert.equal(spellbookRitualCastable(wizard, bookSpell(wizard, "magic-missile")), false, "not a ritual");
});

test("a ritual cast spends no slot, directly or through the panel", () => {
  const ritual = spellbookQuickAction("detect-magic", { cost: "free" });
  assert.equal(ritual.cost, "free");
  assert.equal(spellbookQuickAction("detect-magic").cost, undefined, "the slot cost is never stored");
  const cost = planSpellCastCost({
    action: ritual,
    sourceId: "wizard",
    characterBuild: [{ classId: "mago", level: 3 }],
    resources: {},
    spellLevel: 1,
  });
  assert.equal(cost.operation, null);
  assert.equal(cost.exhausted, false);

  const review = buildQuickActionSpellLaunchPlan({
    action: spellbookQuickAction("detect-magic", { launchMode: "review", cost: "free" }),
    sourceId: "wizard",
  });
  assert.equal(review.mode, "review");
  assert.equal(review.route.request.slotSource, "none");
  assert.equal(review.route.query.slotSource, "none");
  const reviewWithSlot = buildQuickActionSpellLaunchPlan({
    action: spellbookQuickAction("detect-magic", { launchMode: "review" }),
    sourceId: "wizard",
  });
  assert.equal("slotSource" in reviewWithSlot.route.request, false);
});

test("the panel route keeps the slot chosen before it opens, and only a known one", () => {
  const route = routeSpellUnifiedPanelOpenRequest({ intent: "spell-cast", sourceId: "wizard", spellId: "detect-magic", slotSource: "none" });
  assert.equal(route.slotSource, "none");
  assert.equal(routeSpellUnifiedPanelOpenRequest({ intent: "spell-cast", sourceId: "w", spellId: "detect-magic", slotSource: "pact" }).slotSource, "pact");
  assert.equal(routeSpellUnifiedPanelOpenRequest({ intent: "spell-cast", sourceId: "w", spellId: "detect-magic", slotSource: "x" }).slotSource, "");
  assert.equal(buildSpellUnifiedPanelRouteQuery({ sourceId: "w", spellId: "detect-magic" }).has("slotSource"), false);
});
