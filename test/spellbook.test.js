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
    id: "shield", label: "Scudo", level: 1, concentration: false, launchable: true, automated: true, area: false,
    attackCantrip: false, targetMode: "self",
  });
  const fireball = spellbookSpell("fireball");
  assert.equal(fireball.area, true);
  assert.equal(fireball.targetMode, "selection", "an area spell is placed, never cast on its caster");
  const fireBolt = spellbookSpell("fire-bolt");
  assert.equal(fireBolt.attackCantrip, true);
  assert.equal(fireBolt.launchable, false, "an attack cantrip is recorded in the attack console");
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
  assert.equal(spellbookQuickAction("fire-bolt"), null);
  assert.equal(isSpellbookQuickAction({ id: "quick-1" }), false);
  assert.equal(trackerQuickActionSummary(action), "Lancio rapido · bersaglio selezionato");
});

test("the tracker card carries every launchable spell of the book after its quick actions, for the 🪄 menu", () => {
  const ownFireball = { version: 2, id: "quick-fireball", label: "Palla di fuoco", kind: "spell", spellId: "fireball", targetMode: "selection", slotLevel: 4, turns: null, applyAutomations: true, launchMode: "review" };
  const profile = {
    quickActions: [ownFireball],
    spellbook: { spellIds: ["fireball", "bless", "shield", "fire-bolt", "hold-person"], pinnedIds: ["fireball", "shield", "fire-bolt"] },
  };
  // By level, favourites first in each; Fire Bolt is recorded in the attack console, not launched from here.
  assert.deepEqual(spellbookTrackerQuickActions(profile).map((action) => action.id),
    ["quick-fireball", "book:shield", "book:bless", "book:hold-person", "book:fireball"]);
  assert.deepEqual(spellbookMenuSections(profile), [
    { title: "Preferiti", inline: true, actionIds: ["book:shield", "book:fireball"] },
    { title: "1° livello", actionIds: ["book:shield", "book:bless"] },
    { title: "2° livello", actionIds: ["book:hold-person"] },
    { title: "3° livello", actionIds: ["book:fireball"] },
  ]);
  assert.equal(spellbookTrackerQuickActions({ quickActions: [ownFireball] })[0], ownFireball);
  assert.deepEqual(spellbookTrackerQuickActions({}), []);
  assert.deepEqual(spellbookMenuSections({}), []);
});

test("every catalog spell can be searched, each under its own name", () => {
  const options = spellbookSearchOptions();
  assert.ok(options.length > 400);
  assert.equal(new Set(options.map((option) => option.label)).size, options.length);
});
