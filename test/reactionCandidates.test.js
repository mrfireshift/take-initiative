// Reaction prompts, lot R0 of docs/STUDIO_AVVISI_REAZIONE.md: the catalog of the triggers and who can react to an
// event, with the filters of section 5.1 and the options of decisions D3 and D4. The expectations are read from the
// 2014 texts and from the study, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  REACTION_TRIGGER_CATALOG, REACTION_TRIGGERS, REACTION_TIMINGS, REACTION_FLOWS, REACTION_TRIGGER_OPTION, reactionTriggerEntry,
} = await import("../src/reactionTriggerCatalog.js");
const {
  REACTION_PROMPT_DEFAULTS, REACTION_PROMPT_MUTED_LIMIT, isReactionPromptMuted, normalizeReactionPromptOptions, reactionActorKey,
  reactionCandidates, reactionEventSignature, splitReactionCandidates, withReactionPromptMuted,
} = await import("../src/reactionCandidatesCore.js");
const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
const { REACTION_SPELL_IDS } = await import("../src/spellReactionCore.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const creature = (id, meta = {}, name = id) => ({ id, name, layer: "CHARACTER",
  metadata: { [META]: { hp: 30, hpMax: 30, attitude: "pc", ...meta } } });
const pills = (...instances) => ({ conditions: { version: 2, instances } });
const pill = (condition, extra = {}) => ({ id: `${condition}-${extra.sourceId || "pill"}`, condition, active: true, ...extra });
const book = (spellIds, card = {}) => ({ initiativeCard: { spellbook: { spellIds }, ...card } });
const sheet = (characterBuild, enabledClassFeatureIds, extra = {}) => ({
  initiativeCard: { characterBuild, classFeaturesConfigured: true, enabledClassFeatureIds, ...extra.card },
  ...(extra.resources ? { classFeatureState: { resources: extra.resources } } : {}),
});
const orc = creature("orc", { attitude: "enemy" }, "Orco");
const combat = (...ids) => ({ round: 2, current: 0, order: ["orc", ...ids] });
const hitOn = (targetId, extra = {}) => ({ trigger: "hit", attackerId: "orc", targetIds: [targetId], range: "melee", attackRoll: true, ...extra });
const damageOn = (targetId, extra = {}) => ({ trigger: "damage", attackerId: "orc", targetIds: [targetId], range: "melee", attackRoll: true,
  damageTypes: ["slashing"], ...extra });
const ids = (result) => result.candidates.map((candidate) => `${candidate.reactorId}:${candidate.reactionId}`);
const run = (event, items, extra = {}) => reactionCandidates(event, { items, state: combat(...items.map((item) => item.id)), ...extra });

test("the catalog: ids, triggers, timings and flows are known; features and spells exist and are reactions", () => {
  const seen = new Set();
  for (const entry of REACTION_TRIGGER_CATALOG) {
    assert.equal(seen.has(entry.id), false, `duplicate ${entry.id}`);
    seen.add(entry.id);
    assert.ok(entry.triggers.length && entry.triggers.every((trigger) => REACTION_TRIGGERS.includes(trigger)), entry.id);
    assert.ok(REACTION_TIMINGS.includes(entry.timing), entry.id);
    assert.ok(REACTION_FLOWS.includes(entry.flow), entry.id);
    assert.ok(entry.label && entry.short && entry.rule, entry.id);
    if (entry.source === "spell") {
      assert.ok(REACTION_SPELL_IDS.includes(entry.spellId), `${entry.id}: cast with a reaction`);
      assert.ok(getSpellDefinition(entry.spellId), `${entry.id}: in the spell catalog`);
    }
    if (entry.source === "class-feature") {
      assert.ok(entry.featureIds.length, entry.id);
      for (const featureId of entry.featureIds) {
        const feature = getClassFeatureDefinition(featureId);
        assert.ok(feature, `${entry.id}: ${featureId} exists`);
        assert.equal(feature.activation?.primary, "reazione", `${featureId} uses the reaction`);
      }
    }
  }
  for (const trigger of REACTION_TRIGGERS) assert.ok(REACTION_TRIGGER_OPTION[trigger], `${trigger} has its switch`);
  // Section 2.1 of the study: what changes the damage of the trigger is decided before the write.
  for (const id of ["shield", "absorb-elements", "uncanny-dodge", "parry-maneuver", "spectral-defense", "swarming-dispersal",
    "dampen-elements", "warding-maneuver", "counterspell"]) assert.equal(reactionTriggerEntry(id).timing, "before", id);
  for (const id of ["hellish-rebuke", "berserker-retaliation", "riposte", "opportunity-attack"]) assert.equal(reactionTriggerEntry(id).timing, "after", id);
  // Decision D12: no fall in the catalog.
  assert.equal(REACTION_TRIGGER_CATALOG.some((entry) => entry.spellId === "feather-fall"), false);
});

test("Shield: hit by an attack with a roll, the reaction free, not already up", () => {
  const mage = creature("mage", book(["shield"]), "Mira");
  const [shield] = run(hitOn("mage"), [orc, mage]).candidates;
  assert.equal(shield.reactionId, "shield");
  assert.equal(shield.timing, "before");
  assert.equal(shield.flow, "cast-spell");
  assert.equal(shield.spellId, "shield");
  assert.equal(shield.reactorName, "Mira");
  assert.equal(shield.protectedId, "mage");
  assert.match(shield.why, /Orco su Mira, in mischia/u);
  assert.deepEqual(ids(run(hitOn("mage", { attackRoll: false }), [orc, mage])), [], "no attack roll (a save)");
  assert.deepEqual(ids(run({ ...hitOn("mage"), trigger: "miss" }, [orc, mage])), [], "a miss");
  const shielded = creature("mage", { ...book(["shield"]), [SPELLS]: [{ spellId: "shield", instanceId: "s-1" }] });
  assert.deepEqual(ids(run(hitOn("mage"), [orc, shielded])), [], "Shield already up");
  assert.deepEqual(ids(run(hitOn("other"), [orc, mage, creature("other")])), [], "Shield is on the caster only");
});

test("what keeps a creature out: no combat, outside the order, reaction used, incapacitated, 0 HP", () => {
  const mage = (meta = {}) => creature("mage", { ...book(["shield"]), ...meta });
  assert.deepEqual(ids(reactionCandidates(hitOn("mage"), { items: [orc, mage()], state: { order: [] } })), [], "no combat");
  assert.deepEqual(ids(reactionCandidates(hitOn("mage"), { items: [orc, mage()], state: { order: ["orc"] } })), [], "outside the order");
  assert.deepEqual(ids(reactionCandidates(hitOn("mage"), { items: [orc, mage()], state: { order: ["orc", "mage::p2"] } })), ["mage:shield"],
    "a Paragon turn is its token's");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage(pills(pill("Reazione usata")))])), [], "reaction used");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage(pills(pill("Stordito")))])), [], "stunned: incapacitated");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage({ hp: 0 })])), [], "0 HP");
});

test("the slots: none left of the spell's level keeps Shield out; no slots in the plugin keeps it in", () => {
  const wizard = (resources) => creature("mage", { ...book(["shield"], { characterBuild: [{ classId: "mago", level: 5 }] }),
    classFeatureState: { resources } });
  const spent = { "spell-slot-1": { current: 0 }, "spell-slot-2": { current: 0 }, "spell-slot-3": { current: 0 } };
  assert.deepEqual(ids(run(hitOn("mage"), [orc, wizard(spent)])), [], "every slot spent");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, wizard({ ...spent, "spell-slot-2": { current: 1 } })])), ["mage:shield"], "a 2nd-level slot");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, creature("mage", book(["shield"]))])), ["mage:shield"], "no slots: the GM knows");
  const freeAction = creature("mage", { ...book([], { characterBuild: [{ classId: "mago", level: 5 }],
    quickActions: [{ id: "q", kind: "spell", label: "Scudo", spellId: "shield", cost: "free" }] }), classFeatureState: { resources: spent } });
  assert.deepEqual(ids(run(hitOn("mage"), [orc, freeAction])), ["mage:shield"], "a free quick action");
});

test("Absorb Elements on its five types, with the variant; Hellish Rebuke after the damage, on the attacker", () => {
  const tiefling = creature("tief", book(["xanathar-assorbire-elementi", "hellish-rebuke"]), "Zara");
  const fire = run(damageOn("tief", { damageTypes: ["fire", "slashing"] }), [orc, tiefling]).candidates;
  assert.deepEqual(fire.map((candidate) => candidate.reactionId), ["absorb-elements", "hellish-rebuke"], "before first");
  assert.equal(fire[0].variant, "fuoco");
  assert.equal(fire[0].flow, "spell-panel");
  assert.deepEqual(fire[1].targetIds, ["orc"]);
  const { before, after } = splitReactionCandidates(fire);
  assert.deepEqual([before.length, after.length], [1, 1]);
  assert.deepEqual(ids(run(damageOn("tief"), [orc, tiefling])), ["tief:hellish-rebuke"], "slashing: nothing to absorb");
  const far = (a, b) => (a.id === "tief" && b.id === "orc" ? 24 : 0);
  assert.deepEqual(ids(run(damageOn("tief"), [orc, tiefling], { distance: far })), [], "the attacker beyond 18 m");
});

test("class features: enabled on the sheet, the level reached, the resource left", () => {
  const rogue = (level) => creature("rogue", sheet([{ classId: "ladro", level }], ["ladro-schivata-prodigiosa"]), "Vex");
  const [dodge] = run(hitOn("rogue"), [orc, rogue(5)]).candidates;
  assert.equal(dodge.reactionId, "uncanny-dodge");
  assert.equal(dodge.featureId, "ladro-schivata-prodigiosa");
  assert.equal(dodge.flow, "use-feature");
  assert.equal(dodge.lot, "R3b");
  assert.deepEqual(ids(run(hitOn("rogue"), [orc, rogue(4)])), [], "before the 5th level");

  const fighter = (resources) => creature("fighter", sheet([{ classId: "guerriero", level: 5, subclassId: "guerriero-maestro-di-battaglia" }],
    ["guerriero-maestro-di-battaglia-manovre-parata"], { resources }), "Dars");
  assert.deepEqual(ids(run(damageOn("fighter"), [orc, fighter()])), ["fighter:parry-maneuver"]);
  assert.deepEqual(ids(run(damageOn("fighter", { range: "ranged" }), [orc, fighter()])), [], "Parry is melee only");
  assert.deepEqual(ids(run(damageOn("fighter"), [orc, fighter({ "guerriero-dadi-superiorita": { current: 0 } })])), [], "no superiority die left");
});

test("protecting an ally: friendly, within the range, the distance known", () => {
  const cleric = creature("cleric", sheet([{ classId: "chierico", level: 6, subclassId: "chierico-dominio-della-natura" }],
    ["chierico-dominio-della-natura-mitigare-elementi"]), "Ilse");
  const ally = creature("ally", {}, "Bram");
  const event = damageOn("ally", { damageTypes: ["fire"] });
  const near = () => 6;
  const [dampen] = run(event, [orc, cleric, ally], { distance: near }).candidates;
  assert.equal(dampen.reactionId, "dampen-elements");
  assert.equal(dampen.protectedId, "ally");
  assert.equal(dampen.protectedName, "Bram");
  assert.deepEqual(ids(run(event, [orc, cleric, ally], { distance: () => 12 })), [], "beyond 9 m");
  assert.deepEqual(ids(run(event, [orc, cleric, ally])), [], "an unknown distance drops a reaction on somebody else");
  assert.deepEqual(ids(run(damageOn("cleric", { damageTypes: ["fire"] }), [orc, cleric])), ["cleric:dampen-elements"], "on itself, no distance");
  const enemy = creature("ally", { attitude: "enemy" });
  assert.deepEqual(ids(run(event, [orc, cleric, enemy], { distance: near })), [], "not on an enemy");

  // An area: one candidate for each creature it can protect.
  const second = creature("second", {}, "Ada");
  const area = { ...event, targetIds: ["ally", "second"] };
  assert.deepEqual(run(area, [orc, cleric, ally, second], { distance: near }).candidates.map((candidate) => candidate.protectedName), ["Ada", "Bram"]);
});

test("a pill the reaction asks: Spirit Shield only while raging", () => {
  const barbarian = (meta = {}) => creature("barb", { ...sheet([{ classId: "barbaro", level: 6, subclassId: "barbaro-cammino-del-guardiano-ancestrale" }],
    ["barbaro-cammino-del-guardiano-ancestrale-spiriti-protettori"]), ...meta });
  const ally = creature("ally");
  const near = () => 3;
  assert.deepEqual(ids(run(damageOn("ally"), [orc, barbarian(), ally], { distance: near })), [], "not raging");
  assert.deepEqual(ids(run(damageOn("ally"), [orc, barbarian(pills(pill("Ira"))), ally], { distance: near })), ["barb:spirit-shield"]);
  assert.deepEqual(ids(run(damageOn("barb"), [orc, barbarian(pills(pill("Ira")))], { distance: near })), [], "an ally, not itself");
});

test("Counterspell: a hostile caster within 18 m, cantrips off by default", () => {
  const mage = creature("mage", book(["counterspell"]), "Mira");
  const shaman = creature("orc", { attitude: "enemy" }, "Sciamano");
  const cast = { trigger: "spell-cast", casterId: "orc", spellId: "fireball", spellName: "Palla di fuoco", spellLevel: 3 };
  const near = () => 12;
  const [counter] = run(cast, [shaman, mage], { distance: near }).candidates;
  assert.equal(counter.reactionId, "counterspell");
  assert.equal(counter.flow, "counterspell");
  assert.deepEqual(counter.targetIds, ["orc"]);
  assert.equal(counter.why, "Sciamano lancia Palla di fuoco (3°).");
  assert.deepEqual(ids(run(cast, [shaman, mage], { distance: () => 24 })), [], "beyond 18 m");
  assert.deepEqual(ids(run(cast, [shaman, mage])), [], "an unknown distance");
  const cantrip = { ...cast, spellId: "fire-bolt", spellLevel: 0 };
  assert.deepEqual(ids(run(cantrip, [shaman, mage], { distance: near })), [], "a cantrip");
  assert.deepEqual(ids(run(cantrip, [shaman, mage], { distance: near, options: { counterspellCantrips: true } })), ["mage:counterspell"]);
  const friend = creature("orc", { attitude: "ally" });
  assert.deepEqual(ids(run(cast, [friend, mage], { distance: near })), [], "not against a friend");
  // Decision D3: the other creatures are off by default.
  const enemyMage = creature("emage", { ...book(["counterspell"]), attitude: "enemy" });
  const pcCast = { ...cast, casterId: "mage" };
  assert.deepEqual(ids(run(pcCast, [mage, enemyMage], { distance: near })), []);
  assert.deepEqual(ids(run(pcCast, [mage, enemyMage], { distance: near, options: { actors: { npcs: true } } })), ["emage:counterspell"]);
});

test("the opportunity attack: off by default, then every hostile creature whose reach the mover left", () => {
  const goblin = creature("gob", { attitude: "enemy" }, "Goblin");
  const hero = creature("hero", {}, "Bram");
  const move = { trigger: "move-leave", moverId: "hero", reactorIds: ["gob"] };
  const npcs = { triggers: { move: true }, actors: { npcs: true } };
  assert.deepEqual(ids(run(move, [goblin, hero])), [], "D3: movement off");
  const [attack] = run(move, [goblin, hero], { options: npcs }).candidates;
  assert.equal(attack.reactionId, "opportunity-attack");
  assert.equal(attack.flow, "off-turn-attack");
  assert.deepEqual(attack.targetIds, ["hero"]);
  assert.deepEqual(ids(run({ ...move, reactorIds: [] }, [goblin, hero], { options: npcs })), [], "the caller measures the reach");
});

test("the options: defaults, switches, muted per creature and reaction", () => {
  assert.deepEqual(normalizeReactionPromptOptions(undefined), {
    enabled: true, triggers: { hit: true, damage: true, miss: false, spellCast: true, move: false },
    actors: { pcs: true, npcs: false }, counterspellCantrips: false, muted: [],
  });
  assert.equal(REACTION_PROMPT_DEFAULTS.triggers.hit, true);
  const mage = creature("mage", book(["shield"]), "Mira");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage], { options: { enabled: false } })), [], "the general switch");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage], { options: { triggers: { hit: false } } })), [], "the trigger's switch");
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage], { options: { actors: { pcs: false } } })), [], "the characters' switch");

  const key = reactionActorKey(mage);
  assert.match(key, /^[an]/u);
  const muted = withReactionPromptMuted(undefined, key, "shield");
  assert.equal(isReactionPromptMuted(muted, key, "shield"), true);
  assert.deepEqual(ids(run(hitOn("mage"), [orc, mage], { options: muted })), [], "Non chiedere più");
  const otherMage = creature("mage2", book(["shield"]), "Lia");
  assert.deepEqual(ids(run(hitOn("mage2"), [orc, otherMage], { options: muted })), ["mage2:shield"], "only that creature");
  assert.equal(isReactionPromptMuted(withReactionPromptMuted(muted, key, "shield", false), key, "shield"), false, "↺");

  let many = undefined;
  for (let index = 0; index < REACTION_PROMPT_MUTED_LIMIT + 5; index += 1) many = withReactionPromptMuted(many, `n${index}`, "shield");
  assert.equal(many.muted.length, REACTION_PROMPT_MUTED_LIMIT);
  assert.equal(many.muted.at(-1).actor, `n${REACTION_PROMPT_MUTED_LIMIT + 4}`, "the newest kept");
  assert.deepEqual(normalizeReactionPromptOptions({ muted: [{ actor: "x", reaction: "shield" }, { actor: "n1", reaction: "nope" }] }).muted, [],
    "invalid entries dropped");
});

test("one prompt per event: several reactors, before then after; the same event, the same signature", () => {
  const mage = creature("mage", book(["shield", "hellish-rebuke"]), "Mira");
  const rogue = creature("rogue", sheet([{ classId: "ladro", level: 5 }], ["ladro-schivata-prodigiosa"]), "Vex");
  const area = { trigger: "hit", attackerId: "orc", targetIds: ["rogue", "mage"], range: "melee", attackRoll: true };
  assert.deepEqual(ids(run(area, [orc, mage, rogue])), ["mage:shield", "rogue:uncanny-dodge"]);
  const damage = { ...area, trigger: "damage", damageTypes: ["slashing"] };
  assert.deepEqual(run(damage, [orc, mage, rogue]).candidates.map((candidate) => candidate.timing), ["after"]);
  assert.equal(reactionEventSignature(area), reactionEventSignature({ ...area, targetIds: ["mage", "rogue"] }));
  assert.notEqual(reactionEventSignature(area), reactionEventSignature({ ...area, critical: true }));
});
