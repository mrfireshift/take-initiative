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

test("Font of Magic offers only what the sorcerer can do: the slots its level allows and its points pay for, the slots it has left", () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 6 }], abilityModifiers: { cha: 4 } };
  const fontState = (points) => ({ ...stateOf(sorcerer), resources: { "stregone-fonte-di-magia": [{ poolId: "stregone-punti-stregoneria", name: "Punti Stregoneria", current: points, maximum: 6, unlimited: false }] } });
  const values = (points, spellSlots) => pcAttackFeatureForm(feature("stregone-fonte-di-magia"), fontState(points), { characterBuild: sorcerer.characterBuild, spellSlots })
    .fields[0]?.options.map((option) => option.value) || [];
  const slots = [{ level: 1, current: 2, maximum: 4 }, { level: 2, current: 0, maximum: 3 }, { level: 3, current: 3, maximum: 3 }];
  assert.deepEqual(values(6, slots), ["create:1", "create:2", "create:3", "convert:1", "convert:3"],
    "no 4th level slot before the 7th sorcerer level; no slot of a level spent or not owned to convert");
  assert.deepEqual(values(3, slots), ["create:1", "create:2", "convert:1", "convert:3"], "three points: no 3rd level slot (5)");
  const none = pcAttackFeatureForm(feature("stregone-fonte-di-magia"), fontState(1), { characterBuild: sorcerer.characterBuild, spellSlots: [] });
  assert.deepEqual([none.fields.length, none.disabledReason], [0, "Nessuna operazione possibile: punti e slot esauriti."]);
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

test("Wild Magic Surge's d100 table stays in the character sheet; a reference feature with nothing to spend is only read", () => {
  const wild = { characterBuild: [{ classId: "stregone", level: 1, subclassId: "stregone-magia-selvaggia" }] };
  assert.equal(form("stregone-magia-selvaggia-impulso-di-magia-selvaggia", wild).kind, "sheet");
  assert.equal(form("paladino-attacco-extra").kind, "reference");
});

// Spendi: a cost the console does not automate, spent by hand as the sheet's − button.
test("a reference feature with a fixed cost spends it by hand: Spendi 1, blocked when the pool is empty", () => {
  const bard = { characterBuild: [{ classId: "bardo", level: 3, subclassId: "bardo-collegio-dei-sussurri" }], abilityModifiers: { cha: 3 } };
  const blades = form("bardo-collegio-dei-sussurri-lame-psichiche", bard);
  assert.deepEqual([blades.kind, blades.label, blades.fields.length], ["spend", "Spendi 1", 0]);
  assert.match(blades.note, /al tavolo/);
  const request = pcAttackFeatureRequest(feature("bardo-collegio-dei-sussurri-lame-psichiche"), blades, {}, { sourceId: "bar" });
  assert.deepEqual([request.fn, request.args], ["adjustClassFeatureResource", ["bar", "bardo-ispirazione-bardica-usi", { delta: -1 }, { featureId: "bardo-collegio-dei-sussurri-lame-psichiche" }]]);
  assert.match(request.done, /Risorsa spesa: .* −1 \(Lame Psichiche\)/);
  const empty = form("bardo-collegio-dei-sussurri-lame-psichiche", bard, { version: 1, instances: [], resources: { "bardo-ispirazione-bardica-usi": { current: 0 } } });
  assert.match(empty.disabledReason, /Non basta/);
});

test("a variable cost asks the amount, never more than the pool holds", () => {
  const clockwork = { characterBuild: [{ classId: "stregone", level: 6, subclassId: "stregone-anima-meccanica" }] };
  const bastion = form("stregone-anima-meccanica-bastione-della-legge", clockwork);
  assert.deepEqual([bastion.kind, bastion.label, bastion.fields[0].id, bastion.fields[0].max], ["spend", "Spendi", "amount", 6]);
  assert.deepEqual(pcAttackFeatureRequest(feature("stregone-anima-meccanica-bastione-della-legge"), bastion, { amount: "3" }, { sourceId: "sor" }).args,
    ["sor", "stregone-punti-stregoneria", { delta: -3 }, { featureId: "stregone-anima-meccanica-bastione-della-legge" }]);
  assert.match(pcAttackFeatureRequest(feature("stregone-anima-meccanica-bastione-della-legge"), bastion, { amount: "9" }, { sourceId: "sor" }).error, /Non basta/);
});

test("Font of Magic creates or converts a slot; Sorcerous Restoration takes its 4 points back", () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 20 }] };
  const font = form("stregone-fonte-di-magia", sorcerer);
  assert.equal(font.kind, "activate");
  const values = font.fields[0].options.map((option) => option.value);
  assert.ok(values.includes("create:1") && values.includes("create:5") && values.includes("convert:9"));
  assert.deepEqual(pcAttackFeatureRequest(feature("stregone-fonte-di-magia"), font, { operation: "create:2" }, { sourceId: "sor" }),
    { fn: "createClassFeatureSpellSlot", params: { sourceId: "sor", featureId: "stregone-fonte-di-magia", slotLevel: 2 }, done: "Slot di 2° creato." });
  assert.equal(pcAttackFeatureRequest(feature("stregone-fonte-di-magia"), font, { operation: "convert:3" }, { sourceId: "sor" }).fn, "convertClassFeatureSpellSlot");
  const restoration = form("stregone-ripristino-stregonesco", sorcerer);
  assert.deepEqual([restoration.kind, restoration.label], ["activate", "Recupera 4"]);
  assert.equal(pcAttackFeatureRequest(feature("stregone-ripristino-stregonesco"), restoration, {}, { sourceId: "sor" }).fn, "applySorcerousRestoration");
});

test("the bard's Eloquence: Unsettling Words takes the die rolled, Universal Speech its payment, Contagious Inspiration the generic path", () => {
  const bard = { characterBuild: [{ classId: "bardo", level: 14, subclassId: "bardo-collegio-dell-eloquenza" }], abilityModifiers: { cha: 4 } };
  const words = form("bardo-collegio-dell-eloquenza-parole-inquietanti", bard);
  assert.deepEqual([words.fields[0].id, words.fields[0].max], ["value", 10], "a d10 at the 14th level");
  assert.match(pcAttackFeatureRequest(feature("bardo-collegio-dell-eloquenza-parole-inquietanti"), words, {}, { sourceId: "bar" }).error, /risultato/);
  assert.deepEqual(pcAttackFeatureRequest(feature("bardo-collegio-dell-eloquenza-parole-inquietanti"), words, { value: "7" }, { sourceId: "bar", targetIds: ["gob"] }).params,
    { sourceId: "bar", featureId: "bardo-collegio-dell-eloquenza-parole-inquietanti", targetIds: ["gob"], value: "7" });
  const speech = form("bardo-collegio-dell-eloquenza-linguaggio-universale", bard);
  assert.equal(speech.includeSource, true, "the bard may be one of the creatures");
  assert.deepEqual(speech.fields[1].showWhen, { field: "mode", value: "slot" });
  assert.deepEqual(pcAttackFeatureRequest(feature("bardo-collegio-dell-eloquenza-linguaggio-universale"), speech, { mode: "slot", slotConfirmed: true }, { sourceId: "bar" }).params,
    { sourceId: "bar", featureId: "bardo-collegio-dell-eloquenza-linguaggio-universale", mode: "slot", slotConfirmed: true });
  assert.equal(form("bardo-collegio-dell-eloquenza-ispirazione-contagiosa", bard).kind, "activate");
  const wild = { characterBuild: [{ classId: "stregone", level: 1, subclassId: "stregone-magia-selvaggia" }] };
  assert.equal(form("stregone-magia-selvaggia-onde-di-caos", wild).kind, "activate", "Tides of Chaos: its use from the console");
});

test("Spell Thief names a catalog spell; stealing asks the level confirmation", () => {
  const rogue = { characterBuild: [{ classId: "ladro", level: 17, subclassId: "ladro-mistificatore-arcano" }] };
  const thief = form("ladro-mistificatore-arcano-ladro-di-incantesimi", rogue);
  assert.deepEqual(thief.fields.map((field) => field.type), ["spell-text", "select", "checkbox"]);
  assert.match(pcAttackFeatureRequest(feature("ladro-mistificatore-arcano-ladro-di-incantesimi"), thief, { spell: "nonexistent" }, { sourceId: "rog" }).error, /catalogo/);
  const steal = pcAttackFeatureRequest(feature("ladro-mistificatore-arcano-ladro-di-incantesimi"), thief,
    { spell: "Palla di fuoco", spellMode: "steal", spellLevelConfirmed: true }, { sourceId: "rog", targetIds: ["mage"] });
  assert.deepEqual(steal.params, { sourceId: "rog", featureId: "ladro-mistificatore-arcano-ladro-di-incantesimi", targetIds: ["mage"],
    spellId: "fireball", spellMode: "steal", spellLevelConfirmed: true });
  assert.equal(pcAttackFeatureRequest(feature("ladro-mistificatore-arcano-ladro-di-incantesimi"), thief,
    { spell: "Palla di fuoco", spellMode: "deny", spellLevelConfirmed: true }, { sourceId: "rog" }).params.spellLevelConfirmed, false);
});

test("a reaction feature with nothing to spend: Usa reazione marks only the reaction, in combat and once", async () => {
  const { pcAttackFeatureReactable } = await import("../src/pcAttackFeatureFormCore.js");
  const rogue = { characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { dex: 4 } };
  const dodge = feature("ladro-schivata-prodigiosa");
  assert.equal(pcAttackFeatureReactable(dodge), true);
  assert.equal(pcAttackFeatureReactable(feature("ladro-colpo-di-fortuna")), false, "a feature the console runs");
  assert.equal(pcAttackFeatureReactable(feature("bardo-collegio-della-sapienza-parole-taglienti")), false, "Spendi marks it already");
  const state = { enabledIds: [], active: {}, activeFeatureIds: [], resources: {} };
  const ready = pcAttackFeatureForm(dodge, state, { characterBuild: rogue.characterBuild, reaction: { inCombat: true, used: false } });
  assert.deepEqual([ready.kind, ready.label, ready.disabledReason], ["reaction", "Usa reazione", ""]);
  assert.match(ready.note, /segna solo la reazione/);
  assert.match(pcAttackFeatureForm(dodge, state, { reaction: { inCombat: false } }).disabledReason, /Fuori dal combattimento/);
  assert.match(pcAttackFeatureForm(dodge, state, { reaction: { inCombat: true, used: true } }).disabledReason, /già usata/);
  const request = pcAttackFeatureRequest(dodge, ready, {}, { sourceId: "rog" });
  assert.deepEqual([request.fn, request.params], ["useClassFeatureReaction", { sourceId: "rog", featureId: "ladro-schivata-prodigiosa" }]);
  assert.equal(request.done, "Reazione segnata: Schivata Prodigiosa.");
  const { pcAttackFeatureEntries } = await import("../src/pcAttackPickerCore.js");
  const row = pcAttackFeatureEntries(rogue).find((entry) => entry.featureId === "ladro-schivata-prodigiosa");
  assert.deepEqual([row.mode, row.group, row.activation], ["activate", "usable", "reazione"]);
});
