// The character's spellbook: profile field, catalog view, launch as a spell quick action and ⚡ favourites.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  MAX_SPELLBOOK_PINNED,
  MAX_SPELLBOOK_SPELLS,
  hasSpellbook,
  isSpellbookQuickAction,
  sanitizeSpellbook,
  spellbookQuickActionId,
} = await import("../src/spellbookCore.js");
const {
  spellbookCantripAttackAction,
  spellbookGroups,
  spellbookQuickAction,
  spellbookMenuSections,
  spellbookSearchOptions,
  spellbookSpell,
  spellbookTrackerQuickActions,
} = await import("../src/spellbookCatalog.js");
const { sanitizeInitiativeCard, hasInitiativeCardValues } = await import("../src/initiativeCards.js");
const { initiativeCardQuickActionMemoryCandidates } = await import("../src/initiativeCardRegistryCore.js");
const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");
const { trackerQuickActionSummary } = await import("../src/trackerQuickActions.js");

test("the spellbook keeps unique ids, and favourites only among its spells", () => {
  assert.deepEqual(sanitizeSpellbook(null), { spellIds: [], pinnedIds: [] });
  assert.deepEqual(
    sanitizeSpellbook({ spellIds: ["shield", " shield", "fire<ball>", "", 7], pinnedIds: ["fireball", "bless", "shield", "shield"] }),
    { spellIds: ["shield", "fireball", "7"], pinnedIds: ["fireball", "shield"] },
  );
  const many = Array.from({ length: MAX_SPELLBOOK_SPELLS + 5 }, (_, index) => `spell-${index}`);
  const capped = sanitizeSpellbook({ spellIds: many, pinnedIds: many });
  assert.equal(capped.spellIds.length, MAX_SPELLBOOK_SPELLS);
  assert.equal(capped.pinnedIds.length, MAX_SPELLBOOK_PINNED);
  assert.equal(hasSpellbook({ spellIds: [] }), false);
  assert.equal(hasSpellbook({ spellIds: ["shield"] }), true);
});

test("spellbookCore stays free of the spell catalog and the SDK", () => {
  const source = readFileSync(new URL("../src/spellbookCore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
});

test("the spellbook is an optional profile field", () => {
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({}), "spellbook"), false, "profiles without a spellbook keep their shape");
  assert.deepEqual(sanitizeInitiativeCard({ spellbook: { spellIds: ["shield"], pinnedIds: ["shield"] } }).spellbook,
    { spellIds: ["shield"], pinnedIds: ["shield"] });
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ spellbook: { spellIds: ["shield"] } })), true);
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ spellbook: { spellIds: [] } })), false);
});

test("a recreated token recovers a spellbook-only profile from the Room", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const token = { id: "new-wizard", name: "Ilse", layer: "CHARACTER", metadata: { [metadataKey]: { inInitiative: true } } };
  const registry = { ilse: { profile: { spellbook: { spellIds: ["shield"], pinnedIds: [] } }, updatedAt: 100 } };
  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates([token], registry, { metadataKey }).map((item) => item.id),
    ["new-wizard"],
  );
});

test("the book reads names, levels and what each spell can do from the catalog", () => {
  assert.deepEqual(spellbookSpell("shield"), {
    id: "shield", label: "Scudo", level: 1, concentration: false, launchable: true, automated: true, recordOnly: false,
    area: false, attackCantrip: false, targetMode: "self", ritual: false,
  });
  const fireball = spellbookSpell("fireball");
  assert.equal(fireball.area, true);
  assert.equal(fireball.targetMode, "selection", "an area spell is placed, never cast on its caster");
  const fireBolt = spellbookSpell("fire-bolt");
  assert.equal(fireBolt.attackCantrip, true);
  assert.equal(fireBolt.launchable, true, "without a cantrip attack its cast is recorded");
  assert.equal(fireBolt.recordOnly, true);
  const counterspell = spellbookSpell("counterspell");
  assert.deepEqual([counterspell.launchable, counterspell.recordOnly], [true, true], "every spell of the catalog is launched");
  assert.equal(spellbookSpell("not-a-spell").launchable, false);
});

test("the book groups by level, cantrips first, names in order, unknown spells last", () => {
  const groups = spellbookGroups({ spellIds: ["fireball", "not-a-spell", "shield", "fire-bolt", "bless"], pinnedIds: ["bless"] });
  assert.deepEqual(groups.map((group) => group.title), ["Trucchetti", "1° livello", "3° livello", "Fuori catalogo"]);
  assert.deepEqual(groups[1].spells.map((spell) => [spell.label, spell.pinned]), [["Benedizione", true], ["Scudo", false]]);
});

test("a book spell launches as a spell quick action of its own", () => {
  const action = spellbookQuickAction("hold-person");
  assert.deepEqual(action, sanitizeQuickAction(action), "it is a valid quick action");
  assert.equal(action.id, spellbookQuickActionId("hold-person"));
  assert.equal(isSpellbookQuickAction(action), true);
  assert.equal(action.kind, "spell");
  assert.equal(action.launchMode, "auto");
  assert.equal(action.slotLevel, null);
  assert.equal(spellbookQuickAction("hold-person", { launchMode: "review" }).launchMode, "review");
  // A spell the plugin does not automate launches too: its cast is recorded with the slot it spends.
  assert.equal(spellbookQuickAction("counterspell").spellId, "counterspell");
  assert.equal(spellbookQuickAction("not-a-spell"), null);
  assert.equal(isSpellbookQuickAction({ id: "quick-1" }), false);
  assert.equal(trackerQuickActionSummary(action), "Lancio rapido · bersaglio selezionato");
});

test("the tracker card carries every launchable spell of the book after its quick actions, for the 🪄 menu", () => {
  const ownFireball = { version: 2, id: "quick-fireball", label: "Palla di fuoco", kind: "spell", spellId: "fireball", targetMode: "selection", slotLevel: 4, turns: null, applyAutomations: true, launchMode: "review" };
  const profile = {
    quickActions: [ownFireball],
    spellbook: { spellIds: ["fireball", "bless", "shield", "fire-bolt", "hold-person"], pinnedIds: ["fireball", "shield", "fire-bolt"] },
  };
  // By level, favourites first in each. Fire Bolt opens the attack console when the character has a cantrip attack
  // (initiativeList.js), otherwise its cast is recorded.
  assert.deepEqual(spellbookTrackerQuickActions(profile).map((action) => action.id),
    ["quick-fireball", "book:fire-bolt", "book:shield", "book:bless", "book:hold-person", "book:fireball"]);
  assert.deepEqual(spellbookMenuSections(profile), [
    { title: "Preferiti", inline: true, actionIds: ["book:fire-bolt", "book:shield", "book:fireball"] },
    { title: "Trucchetti", actionIds: ["book:fire-bolt"] },
    { title: "1° livello", actionIds: ["book:shield", "book:bless"] },
    { title: "2° livello", actionIds: ["book:hold-person"] },
    { title: "3° livello", actionIds: ["book:fireball"] },
  ]);
  assert.equal(spellbookTrackerQuickActions({ quickActions: [ownFireball] })[0], ownFireball);
  assert.deepEqual(spellbookTrackerQuickActions({}), []);
  assert.deepEqual(spellbookMenuSections({}), []);
});

test("an attack cantrip of the book goes to the attack console when the character has a cantrip attack", () => {
  const cantrips = { version: 2, id: "cantrips", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } };
  assert.equal(spellbookCantripAttackAction([cantrips], "fire-bolt"), cantrips);
  assert.equal(spellbookCantripAttackAction([cantrips], "ray-of-frost"), null, "a cantrip the action does not list");
  const every = { ...cantrips, source: { kind: "cantrip", spellIds: [] } };
  assert.equal(spellbookCantripAttackAction([every], "ray-of-frost"), every, "an action listing none offers them all");
  assert.equal(spellbookCantripAttackAction([every], "counterspell"), null, "not an attack cantrip");
  assert.equal(spellbookCantripAttackAction(undefined, "fire-bolt"), null);
});

test("every catalog spell can be searched, each under its own name", () => {
  const options = spellbookSearchOptions();
  assert.ok(options.length > 400);
  assert.equal(new Set(options.map((option) => option.label)).size, options.length);
});

test("a preparing caster's book keeps the unprepared spells apart; other books keep their shape", async () => {
  const { spellbookGroupsForProfile, spellbookPreparation } = await import("../src/spellbookCatalog.js");
  assert.deepEqual(sanitizeSpellbook({ spellIds: ["shield", "bless"], unpreparedIds: [] }), { spellIds: ["shield", "bless"], pinnedIds: [] });
  assert.deepEqual(sanitizeSpellbook({ spellIds: ["shield", "bless"], unpreparedIds: ["bless", "fireball"] }),
    { spellIds: ["shield", "bless"], pinnedIds: [], unpreparedIds: ["bless"] }, "only spells of the book");
  const cleric = {
    characterBuild: [{ classId: "chierico", level: 3 }],
    abilityModifiers: { wis: 2 },
    spellbook: { spellIds: ["guidance", "bless", "shield-of-faith", "hold-person"], pinnedIds: ["bless"], unpreparedIds: ["hold-person", "guidance"] },
  };
  const prepared = (profile) => spellbookGroupsForProfile(profile).flatMap((group) => group.spells)
    .map((spell) => [spell.id, spell.prepared]);
  assert.deepEqual(prepared(cleric), [["guidance", true], ["bless", true], ["shield-of-faith", true], ["hold-person", false]],
    "a cantrip is always ready");
  assert.deepEqual(spellbookPreparation(cleric), { preparing: true, prepared: 2, limit: 5,
    classes: [{ classId: "chierico", label: "Chierico", level: 3, limit: 5 }] });
  assert.equal(spellbookTrackerQuickActions(cleric).some((action) => action.id === "book:hold-person"), false);
  assert.equal(spellbookMenuSections(cleric).flatMap((section) => section.actionIds).includes("book:hold-person"), false);
  // A sorcerer knows its spells: every one is ready, whatever the book says.
  const sorcerer = { ...cleric, characterBuild: [{ classId: "stregone", level: 3 }] };
  assert.equal(prepared(sorcerer).every(([, ready]) => ready), true);
  assert.equal(spellbookPreparation(sorcerer).preparing, false);
  assert.equal(spellbookTrackerQuickActions(sorcerer).some((action) => action.id === "book:hold-person"), true);
});
