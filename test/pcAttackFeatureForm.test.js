import assert from "node:assert/strict";
import test from "node:test";
import { getClassFeatureDefinition, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { pcAttackFeatureForm, pcAttackFeatureRequest, pcAttackFeatureState, pcAttackFeatureUsable } from "../src/pcAttackFeatureFormCore.js";

const paladin = { characterBuild: [{ classId: "paladino", level: 20, subclassId: "paladino-giuramento-di-devozione" }], abilityModifiers: { cha: 4 } };
const feature = (id) => getClassFeatureDefinition(id);
const stateOf = (profile, stateValue = {}, round = 3) => pcAttackFeatureState(profile, stateValue, getEnabledClassFeatures(profile), round);
const form = (id, profile = paladin, stateValue = {}) => pcAttackFeatureForm(feature(id), stateOf(profile, stateValue), { characterBuild: profile.characterBuild });
const active = (featureId, instanceId = "i1") => ({ version: 1, instances: [{ instanceId, featureId, sourceId: "pal" }], resources: {} });

test("the auras are usable: an aura is a toggle with its radius at the paladin's level", () => {
  assert.equal(pcAttackFeatureUsable(feature("paladino-aura-di-protezione")), true, "not a quick action, yet the sheet activates it");
  const off = form("paladino-aura-di-protezione");
  assert.deepEqual([off.kind, off.label, off.auraMeters], ["toggle", "Attiva", 9]);
  assert.deepEqual(pcAttackFeatureRequest(feature("paladino-aura-di-protezione"), off, {}, { sourceId: "pal" }),
    { fn: "activateClassFeature", params: { sourceId: "pal", featureId: "paladino-aura-di-protezione" } });
  const on = form("paladino-aura-di-protezione", paladin, active("paladino-aura-di-protezione"));
  assert.deepEqual([on.kind, on.label, on.instanceId], ["toggle", "Disattiva", "i1"]);
  assert.deepEqual(pcAttackFeatureRequest(feature("paladino-aura-di-protezione"), on, {}, { sourceId: "pal" }),
    { fn: "deactivateClassFeature", args: ["pal", "i1"] });
  assert.equal(form("paladino-aura-di-protezione", { characterBuild: [{ classId: "paladino", level: 10 }] }).auraMeters, 3, "3 m before the 18th level");
});

test("Lay on Hands asks the points (or the diseases) and heals the creature selected", () => {
  const layOnHands = form("paladino-imposizione-delle-mani");
  assert.equal(layOnHands.call, "applyLayOnHands");
  assert.deepEqual(layOnHands.fields.map((field) => field.id), ["mode", "value"]);
  assert.equal(layOnHands.fields[1].max, 100, "no more than the pool holds");
  assert.deepEqual(pcAttackFeatureRequest(feature("paladino-imposizione-delle-mani"), layOnHands, { mode: "heal", value: "7" }, { sourceId: "pal", targetIds: ["ally"] }),
    { fn: "applyLayOnHands", params: { sourceId: "pal", featureId: "paladino-imposizione-delle-mani", targetIds: ["ally"], mode: "heal", value: "7" } });
  assert.deepEqual(pcAttackFeatureRequest(feature("paladino-imposizione-delle-mani"), layOnHands, { mode: "disease-poison", value: "2" }, { sourceId: "pal" }).params,
    { sourceId: "pal", featureId: "paladino-imposizione-delle-mani", mode: "disease-poison", conditionCount: "2" });
  const spent = form("paladino-imposizione-delle-mani", paladin, { version: 1, instances: [], resources: { "paladino-imposizione-mani-punti": { current: 0 } } });
  assert.match(spent.disabledReason || "", /Nessun punto/);
});

test("Purifying Touch names the spell to end on the target, or says there is none", () => {
  const purify = form("paladino-tocco-purificatore");
  assert.deepEqual(purify.fields.map((field) => field.type), ["target-spell"]);
  assert.deepEqual(pcAttackFeatureRequest(feature("paladino-tocco-purificatore"), purify, { spell: { instanceId: "sp1", name: "Blocca persone" } }, { sourceId: "pal", targetIds: ["ally"] }),
    { fn: "purifyClassFeatureSpell", params: { sourceId: "pal", featureId: "paladino-tocco-purificatore", targetIds: ["ally"], spellInstanceId: "sp1", spellName: "Blocca persone" } });
  assert.match(pcAttackFeatureRequest(feature("paladino-tocco-purificatore"), purify, {}, { sourceId: "pal" }).error, /nessun|non ha/i);
});

test("the generic path across classes: a variant to choose, a required feature, an active one to end", () => {
  // Forma della Bestia: a variant to choose, a duration tied to Rage (classFeatureCore's own rule throws there).
  const beast = { characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-della-bestia" }] };
  const form1 = form("barbaro-cammino-della-bestia-forma-della-bestia", beast, active("barbaro-ira"));
  assert.equal(form1.fields[0].id, "choice");
  assert.ok(form1.fields[0].options.length >= 2);
  const choiceId = form1.fields[0].options[1].value;
  assert.equal(pcAttackFeatureRequest(feature("barbaro-cammino-della-bestia-forma-della-bestia"), form1, { choice: choiceId }, { sourceId: "bar" }).params.choiceId, choiceId);
  // A variant already fixed by the enabled sub-features (Spirit Totem's spirits) asks nothing, as in the sheet.
  const druid = { characterBuild: [{ classId: "druido", level: 2, subclassId: "druido-circolo-del-pastore" }] };
  assert.deepEqual(form("druido-circolo-del-pastore-totem-spirituale", druid).fields, []);
  const barbarian = { characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-combattente-totemico" }] };
  const wolf = getEnabledClassFeatures(barbarian).find((entry) => entry.id === "barbaro-cammino-del-combattente-totemico-sintonia-totemica-lupo");
  if (wolf) assert.match(form(wolf.id, barbarian).disabledReason, /Richiede prima Ira/);
  const rage = form("barbaro-ira", barbarian, active("barbaro-ira", "rage-1"));
  assert.deepEqual([rage.kind, rage.label], ["end", "Termina"]);
  assert.deepEqual(pcAttackFeatureRequest(feature("barbaro-ira"), rage, {}, { sourceId: "bar" }), { fn: "deactivateClassFeature", args: ["bar", "rage-1"] });
});

test("Bardic Inspiration can be granted again while one is active; Twinned Spell asks the spell's level", () => {
  const bard = { characterBuild: [{ classId: "bardo", level: 5 }], abilityModifiers: { cha: 3 } };
  const inspiration = form("bardo-ispirazione-bardica", bard, active("bardo-ispirazione-bardica"));
  assert.equal(inspiration.kind, "activate");
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 3 }] };
  const twinned = form("stregone-metamagia-incantesimo-raddoppiato", sorcerer);
  assert.deepEqual(twinned.fields.map((field) => field.id), ["spellLevel"]);
  assert.deepEqual(pcAttackFeatureRequest(feature("stregone-metamagia-incantesimo-raddoppiato"), twinned, { spellLevel: "3" }, { sourceId: "sor" }).params.resourceValues,
    { "stregone-punti-stregoneria": 3 });
  assert.match(pcAttackFeatureRequest(feature("stregone-metamagia-incantesimo-raddoppiato"), twinned, { spellLevel: "12" }, { sourceId: "sor" }).error, /tra 0 e 9/);
});

test("the adapters with controls of their own open the character sheet; a reference feature is only read", () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 2 }] };
  assert.equal(form("stregone-fonte-di-magia", sorcerer).kind, "sheet");
  assert.equal(form("paladino-attacco-extra").kind, "reference");
});
