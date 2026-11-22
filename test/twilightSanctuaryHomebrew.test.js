// The table's homebrew Twilight Sanctuary beside the manual's (docs/STUDIO_SANTUARIO_HOMEBREW.md, D1–D7): one option of
// the card, the same aura, and at the end of a creature's turn in it the cleric's reaction for one benefit, the
// creature's choice: temporary hit points (the d6 entered, the cleric's level added) or Charmed or Frightened taken away.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ID } from "../src/constants.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  getEnabledClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  CLASS_FEATURE_AURA_META_KEY,
  classFeatureAuraEndsOnSourceCondition,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";
import { planClassFeatureActivation } from "../src/classFeatureCore.js";
import {
  mergeClassFeatureAuraReminderMetadata,
  planClassFeatureAuraReminder,
} from "../src/classFeatureAuraReminderCore.js";
import {
  REMINDER_REMOVE_CONDITION_OUTCOME,
  buildReminderResolutionPlan,
  reminderConditionInstances,
  reminderRemovableConditions,
  reminderTemporaryHpBonus,
} from "../src/reminderResolutionCore.js";
import { REACTION_USED_CONDITION } from "../src/reactionTrackerCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SUBCLASS = "chierico-dominio-del-crepuscolo";
const OFFICIAL = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";
const HOMEBREW = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-homebrew";
const CHANNEL_POOL = "chierico-incanalare-divinita-usi";
const ORDER = ["cleric", "enemy", "neutral", "ally"];
const AURA_ITEM_ID = "sanctuary-visual";

const feature = (id) => {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
};
const build = (level = 5) => [{ classId: "chierico", level, subclassId: SUBCLASS }];
const instance = (id, condition, extra = {}) => ({ id, condition, active: true, ...extra });

function fixture({ featureId = HOMEBREW, level = 5, clericConditions = [], allyConditions = [] } = {}) {
  const characterBuild = build(level);
  const result = planClassFeatureActivation({
    state: { resources: { [CHANNEL_POOL]: { current: 1, maximum: 1 } } },
    feature: feature(featureId),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild,
    sourceId: "cleric",
    targetIds: ["cleric"],
    currentRound: 1,
    currentTurnKey: "1:0:cleric",
    instanceId: "sanctuary-1",
  });
  assert.equal(result.ok, true);
  const creature = (id, name, attitude, conditions = []) => ({
    id,
    name,
    metadata: { [META_KEY]: { attitude, hp: 20, hpMax: 20, conditions: { instances: conditions } } },
  });
  const cleric = creature("cleric", "Sera", "pc", clericConditions);
  cleric.metadata[META_KEY].initiativeCard = { characterBuild };
  cleric.metadata[META_KEY].classFeatureState = result.state;
  const items = [
    cleric,
    creature("enemy", "Goblin", "enemy"),
    creature("neutral", "Mercante", "neutral"),
    creature("ally", "Mira", "ally", allyConditions),
  ];
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    currentRound: 1,
    characterBuildBySourceId: new Map([["cleric", characterBuild]]),
  });
  assert.ok(aura, featureId);
  return { aura, items, result };
}

// The turns one after another, as the aura's controller sees them: the notices of each step and the aura item with the
// pending activations it keeps (mergeClassFeatureAuraReminderMetadata), which the resolution reads.
// itemsAt: the scene at each step, when it changes along the way (a reaction spent, then given back).
function walk({ aura, items }, steps, itemsAt = () => items) {
  let auraMetadata = { instanceId: aura.instanceId };
  return steps.map(([round, current], index) => {
    const auraItem = { id: AURA_ITEM_ID, metadata: { [CLASS_FEATURE_AURA_META_KEY]: auraMetadata } };
    const state = { order: ORDER, current, round };
    const plan = planClassFeatureAuraReminder({
      aura,
      auraItem,
      desiredTargetIds: ORDER,
      initiativeState: state,
      itemsById: new Map(itemsAt(index).map((item) => [item.id, item])),
      areaPosition: { x: 0, y: 0 },
      now: index + 1,
    });
    auraMetadata = mergeClassFeatureAuraReminderMetadata(auraMetadata, plan);
    return {
      state,
      notices: plan.notices,
      auraItem: { id: AURA_ITEM_ID, metadata: { [CLASS_FEATURE_AURA_META_KEY]: auraMetadata } },
    };
  });
}

// cleric's end → enemy's end → neutral's end → ally's end, the last one answered on the cleric's next turn.
const ROUND = [[1, 0], [1, 1], [1, 2], [1, 3], [2, 0]];

function resolve(step, notice, items, options = {}) {
  return buildReminderResolutionPlan({
    notice,
    items: [...items, step.auraItem],
    sceneMetadata: { [STATE_KEY]: step.state },
    now: 100,
    ...options,
  });
}

test("D1: l'homebrew è una capacità del catalogo con la sua fonte, scelta sulla scheda in alternativa all'ufficiale", () => {
  const homebrew = feature(HOMEBREW);
  const official = feature(OFFICIAL);
  assert.equal(CLASS_FEATURE_CATALOG.sources.at(-1).id, "homebrew");
  assert.equal(homebrew.source, "homebrew");
  assert.equal(homebrew.sourceLabel, "Homebrew del tavolo");
  assert.equal(homebrew.name, "Incanalare Divinità: Santuario del Crepuscolo (homebrew)");
  assert.equal(homebrew.parentFeatureId, "chierico-incanalare-divinita");
  assert.equal(homebrew.subclassId, SUBCLASS);
  assert.equal(homebrew.minimumLevel, 2);
  assert.equal(homebrew.activation.primary, "azione");
  assert.deepEqual(homebrew.resourceCosts, [{ poolId: CHANNEL_POOL, amount: 1 }]);
  assert.equal(homebrew.runtimeSupport.status, "implemented");
  assert.equal(homebrew.theme.emoji, official.theme.emoji);
  // One option group: radio buttons on the card, one of the two at a time, the manual's by default.
  assert.equal(homebrew.optionGroup, official.optionGroup);
  assert.ok(homebrew.optionGroup);
  assert.equal(official.defaultEnabled, true);
  assert.equal(homebrew.defaultEnabled, false);
  const enabled = (profile) => getEnabledClassFeatures({ characterBuild: build(5), ...profile })
    .map((entry) => entry.id)
    .filter((id) => id === OFFICIAL || id === HOMEBREW);
  assert.deepEqual(enabled({}), [OFFICIAL]);
  assert.deepEqual(enabled({ classFeaturesConfigured: true, enabledClassFeatureIds: [HOMEBREW] }), [HOMEBREW]);
  assert.deepEqual(enabled({ classFeaturesConfigured: true, enabledClassFeatureIds: [OFFICIAL, HOMEBREW] }).length, 1);
  // The text is the GM's own, worded like a manual's entry: it ships with the plugin, unlike the manual's.
  const descriptions = JSON.parse(fs.readFileSync(new URL("../src/class-features-descriptions.json", import.meta.url), "utf8"));
  assert.match(descriptions[HOMEBREW], /il chierico può usare la sua reazione/u);
  assert.match(descriptions[HOMEBREW], /\n• La creatura ottiene/u);
  assert.equal(descriptions[OFFICIAL], undefined);
});

test("D5 e D6: stessa sfera di 9 m per 10 round, pill uguali all'ufficiale, fine quando il chierico è incapacitato", () => {
  const { aura, result } = fixture();
  assert.equal(aura.radiusMeters, 9);
  assert.equal(result.instance.expiresRound, 10);
  assert.equal(aura.conditionName, "Santuario del Crepuscolo");
  assert.equal(aura.targetEffect.label, "Nel Santuario del Crepuscolo");
  assert.deepEqual(aura.membershipTargeting, { filter: "all", includeCaster: true });
  assert.match(aura.targetEffect.detail, /reazione/u);
  for (const id of [HOMEBREW, OFFICIAL]) {
    const { aura: current } = fixture({ featureId: id });
    assert.equal(classFeatureAuraEndsOnSourceCondition(current, [instance("down", "Privo di sensi")]), true, id);
    assert.equal(classFeatureAuraEndsOnSourceCondition(current, [instance("stun", "Stordito")]), true, id);
    assert.equal(classFeatureAuraEndsOnSourceCondition(current, [instance("prone", "Prono")]), false, id);
  }
});

test("D2, D3, D5: a fine turno l'offerta va al chierico, ai neutrali e agli alleati, non ai nemici, con il livello da aggiungere al d6", () => {
  const steps = walk(fixture(), ROUND);
  assert.deepEqual(steps.map((step) => step.notices.map((notice) => notice.targets[0].id)), [
    [],
    ["cleric"],
    [],
    ["neutral"],
    ["ally"],
  ]);
  const notice = steps[3].notices[0];
  assert.match(notice.label, /reazione del Chierico/u);
  assert.match(notice.label, /Sceglie la creatura/u);
  assert.equal(notice.resolution.mode, "manual-heal");
  assert.equal(notice.resolution.activation.resolutionData.spendsSourceReaction, true);
  assert.deepEqual(reminderTemporaryHpBonus(notice.resolution), { bonus: 5, faces: 6, dice: "1d6" });
  assert.deepEqual(reminderRemovableConditions(notice.resolution), ["Affascinato", "Spaventato"]);
  // The pending activation the aura keeps has the level too: a notice drawn again from it shows the same sum.
  const pending = steps[3].auraItem.metadata[CLASS_FEATURE_AURA_META_KEY].triggerRuntime.pending;
  assert.equal(pending.find((entry) => entry.targetIds.includes("neutral"))?.resolutionData?.temporaryHpBonus, 5);
});

test("D5: con la reazione del chierico già usata non c'è offerta", () => {
  const used = instance("reaction", REACTION_USED_CONDITION, {
    expiry: { mode: "turn-start", actor: "target", remaining: 1 },
  });
  const steps = walk(fixture({ clericConditions: [used] }), ROUND);
  assert.deepEqual(steps.flatMap((step) => step.notices), []);
});

test("D5: la reazione spesa nel round vale anche alla fine del turno subito prima del chierico, se il plugin l'ha già tolta", () => {
  const value = fixture();
  const used = instance("reaction", REACTION_USED_CONDITION, {
    expiry: { mode: "turn-start", actor: "target", remaining: 1 },
  });
  // Spent after the cleric's own turn ended (step 1), given back by the plugin at the start of its next turn (step 4),
  // before the aura reads the end of the ally's turn, the creature right before it.
  const withReaction = value.items.map((item) => (item.id === "cleric"
    ? { ...item, metadata: { [META_KEY]: { ...item.metadata[META_KEY], conditions: { instances: [used] } } } }
    : item));
  const steps = walk(value, ROUND, (index) => (index >= 2 && index <= 3 ? withReaction : value.items));
  assert.deepEqual(steps.map((step) => step.notices.map((notice) => notice.targets[0].id)), [
    [],
    ["cleric"],
    [],
    [],
    [],
  ]);
  assert.deepEqual(steps[3].auraItem.metadata[CLASS_FEATURE_AURA_META_KEY].sourceReaction, { used: true, turnKey: "1:3:ally" });
  assert.deepEqual(steps[4].auraItem.metadata[CLASS_FEATURE_AURA_META_KEY].sourceReaction, { used: false, turnKey: "2:0:cleric" });
  // The next round, with the reaction back, the offers come again.
  const next = walk(value, [...ROUND, [2, 1], [2, 2], [2, 3]], (index) => (index >= 2 && index <= 3 ? withReaction : value.items));
  assert.deepEqual(next.slice(5).map((step) => step.notices.map((notice) => notice.targets[0].id)), [["cleric"], [], ["neutral"]]);
  // An aura whose reminders cost nothing does not keep the reaction.
  const official = walk(fixture({ featureId: OFFICIAL }), ROUND);
  assert.equal(official.at(-1).auraItem.metadata[CLASS_FEATURE_AURA_META_KEY].sourceReaction, undefined);
});

test("D3: senza livello sulla scheda il GM scrive il totale, come prima", () => {
  const value = fixture();
  delete value.items[0].metadata[META_KEY].initiativeCard;
  const notice = walk(value, ROUND)[3].notices[0];
  assert.deepEqual(reminderTemporaryHpBonus(notice.resolution).bonus, 0);
  const plan = resolve(walk(value, ROUND)[3], notice, value.items, { outcome: "apply", damageRoll: 11 });
  assert.equal(plan.status, "ready", plan.message);
  assert.equal(plan.hpChange.afterTempHp, 11);
});

test("D3 e D5: i PF temporanei sono il d6 più il livello e spendono la reazione del chierico nello stesso comando", () => {
  const value = fixture();
  const step = walk(value, ROUND)[3];
  const notice = step.notices[0];
  const plan = resolve(step, notice, value.items, { outcome: "apply", damageRoll: 4 });
  assert.equal(plan.status, "ready", plan.message);
  assert.deepEqual([plan.hpChange.before, plan.hpChange.after, plan.hpChange.afterTempHp], [20, 20, 9]);
  assert.deepEqual(plan.healing, { roll: 4, amount: 9 });
  const reaction = plan.operations.find((operation) => operation.type === "condition:add"
    && operation.conditionName === REACTION_USED_CONDITION);
  assert.deepEqual(reaction?.targetIds, ["cleric"]);
  assert.deepEqual(reaction?.options?.expiry, { mode: "turn-start", actor: "target", remaining: 1 });
  assert.deepEqual(plan.reaction, { sourceId: "cleric", sourceName: "Sera" });
  assert.ok(plan.targetIds.includes("cleric"));
  // The die alone: a total written by habit is refused, not added to the level.
  const total = resolve(step, notice, value.items, { outcome: "apply", damageRoll: 9 });
  assert.equal(total.status, "invalid");
  assert.match(total.message, /1d6, da 1 a 6/u);
  // Ignora spends nothing.
  const ignored = resolve(step, notice, value.items, { outcome: "ignore" });
  assert.equal(ignored.status, "ready", ignored.message);
  assert.equal(ignored.operations.length, 0);
  assert.equal(ignored.hpChange, null);
});

test("D4: «Togli Spaventato» toglie tutte le pill di Spaventato, lascia le altre e spende la reazione", () => {
  const allyConditions = [
    instance("fear-1", "Spaventato", { sourceId: "dragon" }),
    instance("fear-2", "Spaventato", { sourceId: "banshee" }),
    instance("charm", "Affascinato"),
  ];
  const value = fixture({ allyConditions });
  const step = walk(value, ROUND).at(-1);
  const notice = step.notices[0];
  assert.equal(notice.targets[0].id, "ally");
  assert.deepEqual(reminderConditionInstances(value.items[3], "Spaventato").map((entry) => entry.id), ["fear-1", "fear-2"]);
  // The ally's turn ended just before the cleric's, answered on the cleric's turn: its reaction is back, nothing is spent.
  const plan = resolve(step, notice, value.items, {
    outcome: REMINDER_REMOVE_CONDITION_OUTCOME,
    removeCondition: "Spaventato",
  });
  assert.equal(plan.status, "ready", plan.message);
  assert.deepEqual(plan.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "ally", instanceId: "fear-1" }, { itemId: "ally", instanceId: "fear-2" }],
  }]);
  assert.equal(plan.removedCondition, "Spaventato");
  assert.equal(plan.reaction, undefined);
  assert.equal(plan.hpChange, null);
  const marker = plan.metadataPatches[0].fields.reminderResolutions.value[notice.activationId];
  assert.equal(marker.outcome, REMINDER_REMOVE_CONDITION_OUTCOME);
  assert.equal(marker.condition, "Spaventato");

  // The same answer before the cleric's turn spends the reaction.
  const before = walk(fixture({ allyConditions }), ROUND.slice(0, -1));
  const neutralStep = before.at(-1);
  const neutralItems = value.items.map((item) => (item.id === "neutral"
    ? { ...item, metadata: { [META_KEY]: { ...item.metadata[META_KEY], conditions: { instances: [instance("charm-n", "Affascinato")] } } } }
    : item));
  const spent = resolve(neutralStep, neutralStep.notices[0], neutralItems, {
    outcome: REMINDER_REMOVE_CONDITION_OUTCOME,
    removeCondition: "affascinato",
  });
  assert.equal(spent.status, "ready", spent.message);
  assert.deepEqual(spent.operations[0].removals, [{ itemId: "neutral", instanceId: "charm-n" }]);
  assert.ok(spent.operations.some((operation) => operation.conditionName === REACTION_USED_CONDITION));
});

test("D4: una condizione che la creatura non ha più, o che il Santuario non toglie, non scrive niente", () => {
  const value = fixture();
  const step = walk(value, ROUND)[3];
  const gone = resolve(step, step.notices[0], value.items, {
    outcome: REMINDER_REMOVE_CONDITION_OUTCOME,
    removeCondition: "Spaventato",
  });
  assert.equal(gone.status, "stale");
  assert.match(gone.message, /Spaventato non è più attiva su Mercante/u);
  const other = resolve(step, step.notices[0], value.items, {
    outcome: REMINDER_REMOVE_CONDITION_OUTCOME,
    removeCondition: "Prono",
  });
  assert.equal(other.status, "invalid");
});

test("D5: con due offerte aperte, la seconda rifiuta se la reazione è già stata usata", () => {
  const value = fixture();
  const step = walk(value, ROUND)[3];
  const items = value.items.map((item) => (item.id === "cleric"
    ? {
      ...item,
      metadata: { [META_KEY]: { ...item.metadata[META_KEY], conditions: { instances: [instance("reaction", REACTION_USED_CONDITION)] } } },
    }
    : item));
  const plan = resolve(step, step.notices[0], items, { outcome: "apply", damageRoll: 3 });
  assert.equal(plan.status, "unsupported");
  assert.match(plan.message, /Sera ha già usato la reazione/u);
  assert.match(plan.message, /Ignora/u);
  assert.equal(resolve(step, step.notices[0], items, { outcome: "ignore" }).status, "ready");
});

test("D7: l'ufficiale ha il d6 più il livello e i pulsanti delle condizioni, senza reazione e anche per i nemici", () => {
  const value = fixture({ featureId: OFFICIAL });
  const steps = walk(value, ROUND);
  assert.deepEqual(steps.map((step) => step.notices.map((notice) => notice.targets[0].id)), [
    [],
    ["cleric"],
    ["enemy"],
    ["neutral"],
    ["ally"],
  ]);
  const step = steps[3];
  const notice = step.notices[0];
  assert.equal(notice.resolution.activation.resolutionData.spendsSourceReaction, undefined);
  const plan = resolve(step, notice, value.items, { outcome: "apply", damageRoll: 6 });
  assert.equal(plan.status, "ready", plan.message);
  assert.equal(plan.hpChange.afterTempHp, 11);
  assert.equal(plan.operations.some((operation) => operation.conditionName === REACTION_USED_CONDITION), false);
  assert.equal(plan.reaction, undefined);
});

test("D2–D4: il popup del GM ha il campo del solo d6 con la somma e i pulsanti delle condizioni lette dal token", () => {
  const turnNotice = fs.readFileSync(new URL("../src/turn-notice.ts", import.meta.url), "utf8");
  assert.match(turnNotice, /const tempHpBonus = manualTempHp \? reminderTemporaryHpBonus\(row\.resolution\)/u);
  assert.match(turnNotice, /`\+ \$\{tempHpBonus\.bonus\} = \$\{roll \+ tempHpBonus\.bonus\}`/u);
  assert.match(turnNotice, /const removableConditions = reminderRemovableConditions\(row\.resolution\)/u);
  assert.match(turnNotice, /reminderConditionInstances\(items\?\.\[0\], name\)\.length > 0/u);
  assert.match(turnNotice, /button\.textContent = `Togli \$\{name\}`/u);
  assert.match(turnNotice, /draft\.removeCondition = name;\s*void resolve\(REMINDER_REMOVE_CONDITION_OUTCOME\);/u);
  assert.match(turnNotice, /\.\.\.\(draft\.removeCondition \? \{ removeCondition: draft\.removeCondition \} : \{\}\)/u);
});
