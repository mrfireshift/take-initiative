import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID, getAvailableClassFeatures, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import {
  classFeatureChoiceOptions, classFeatureParentFeatureId, classFeatureRequiresActivationChoice, planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { pcAttackFeatureForm, pcAttackFeatureRequest, pcAttackFeatureState } from "../src/pcAttackFeatureFormCore.js";

// classFeatureRequiresActivationChoice looked a variant feature's parent up in CLASS_FEATURE_BY_ID, a name
// classFeatureCore.js does not define: a ReferenceError for every feature with variants and a duration tied to another
// feature (Beast Form and Wild Surge, both until Rage). The character sheet calls it on each feature card and for Rage's
// automatic outcomes, and lost its features list. The catalog's map now comes from the caller (the catalog imports
// classFeatureCore.js), and the rule is the attack console's own (requiresChoice, pcAttackFeatureFormCore.js).

const RAGE = "barbaro-ira";
const BEAST_FORM = "barbaro-cammino-della-bestia-forma-della-bestia";
const WILD_SURGE = "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio";
const STORM_AURA = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa";

// A 3rd level barbarian of the subclass: its default features, plus the ones given.
const barbarian = (subclassId, extraIds = []) => {
  const characterBuild = [{ classId: "barbaro", level: 3, subclassId }];
  if (!extraIds.length) return { characterBuild };
  const defaults = getAvailableClassFeatures(characterBuild).filter((entry) => entry.defaultEnabled).map((entry) => entry.id);
  return { characterBuild, classFeaturesConfigured: true, enabledClassFeatureIds: [...defaults, ...extraIds] };
};
const feature = (id) => CLASS_FEATURE_BY_ID.get(id);
// The sheet's call (renderClassFeatures, classFeatureChoiceControl): the profile's enabled ids and the catalog's map.
const sheetAsks = (profile, id) => classFeatureRequiresActivationChoice(
  feature(id),
  getEnabledClassFeatures(profile).map((entry) => entry.id),
  CLASS_FEATURE_BY_ID,
);
// Whether the console asks it: the field its requiresChoice adds, "choice", or "auto:<child>" on the parent's form.
const consoleAsks = (profile, id, fieldId = "choice") => pcAttackFeatureForm(
  feature(id),
  pcAttackFeatureState(profile, {}, getEnabledClassFeatures(profile), 1),
  { characterBuild: profile.characterBuild },
).fields.some((field) => field.id === fieldId);

test("Beast Form asks its form as the console does, a form's card enabled or not: it is chosen at each rage", () => {
  const beast = barbarian("barbaro-cammino-della-bestia", [BEAST_FORM]);
  assert.equal(sheetAsks(beast, BEAST_FORM), true);
  assert.equal(sheetAsks(beast, BEAST_FORM), consoleAsks(beast, BEAST_FORM));
  const claws = barbarian("barbaro-cammino-della-bestia", [BEAST_FORM, `${BEAST_FORM}-artigli`]);
  assert.equal(sheetAsks(claws, BEAST_FORM), true, "the Claws' card enabled: the form is still chosen (Tasha's)");
  assert.equal(sheetAsks(claws, BEAST_FORM), consoleAsks(claws, BEAST_FORM));
});

test("Wild Surge asks its outcome on its own card and as Rage's automatic outcome, as the console does", () => {
  const wild = barbarian("barbaro-cammino-della-magia-selvaggia");
  assert.ok(feature(RAGE).autoActivateFeatureIds.includes(WILD_SURGE));
  assert.equal(sheetAsks(wild, WILD_SURGE), true);
  assert.equal(sheetAsks(wild, WILD_SURGE), consoleAsks(wild, WILD_SURGE));
  assert.equal(sheetAsks(wild, WILD_SURGE), consoleAsks(wild, RAGE, `auto:${WILD_SURGE}`), "Rage's control for the outcome");
  // The d8 is rolled each time Rage starts (Tasha's): an outcome's card enabled alone fixes nothing.
  const card = barbarian("barbaro-cammino-della-magia-selvaggia", [`${WILD_SURGE}-risultato-2`]);
  assert.equal(sheetAsks(card, WILD_SURGE), true, "an outcome's card enabled: the outcome is still rolled");
  assert.equal(sheetAsks(card, WILD_SURGE), consoleAsks(card, RAGE, `auto:${WILD_SURGE}`));
});

test("a duration tied to a feature with variants asks nothing, as in the console: the sheet passes the map for it", () => {
  assert.ok(classFeatureChoiceOptions(feature(STORM_AURA)).length > 0, "the parent has variants");
  const child = {
    id: "prova-figlio-dell-aura", name: "Figlio dell'aura (prova)", classId: "barbaro",
    choiceOptions: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    duration: { rounds: null, untilFeatureId: STORM_AURA },
    runtimeSupport: { status: "implemented", adapter: "condition" },
    activation: { primary: "azione_bonus" },
  };
  const storm = barbarian("barbaro-cammino-dell-araldo-della-tempesta");
  const consoleForm = pcAttackFeatureForm(child, pcAttackFeatureState(storm, {}, getEnabledClassFeatures(storm), 1),
    { characterBuild: storm.characterBuild });
  assert.equal(consoleForm.fields.some((field) => field.id === "choice"), false);
  assert.equal(classFeatureRequiresActivationChoice(child, [], CLASS_FEATURE_BY_ID), false);
  assert.equal(classFeatureRequiresActivationChoice(child, []), true, "without the map the parent is unknown");
});

test("no feature of the catalog throws, with the map or without it", () => {
  for (const entry of CLASS_FEATURE_BY_ID.values()) {
    assert.doesNotThrow(() => classFeatureRequiresActivationChoice(entry, [], CLASS_FEATURE_BY_ID), entry.id);
    assert.doesNotThrow(() => classFeatureRequiresActivationChoice(entry, []), entry.id);
  }
});

// Which enabled id fixes the variant: only a sub-feature of a choice the manual ties to the sheet (choiceMode
// "configuration": Storm Aura's environment), enabled alone. The rule took any id ending with "-<choice>", and the species
// traits, always enabled, matched it: a Leonin's claws fixed Beast Form's Claws, a tiefling's bloodline trait (-3) Wild
// Surge's outcome 3. The dropdown vanished from the sheet and the console, and the activation imposed that variant over
// the GM's (planClassFeatureActivation reads the same rule). Starry Form and Spirit Totem, whose three variants are
// reference cards enabled by default, always took the first one. The manual chooses Beast Form's form at each rage,
// Starry Form's constellation at each transformation and Spirit Totem's spirit at each summoning: no card fixes them.

const BEAST = "barbaro-cammino-della-bestia";
const WILD = "barbaro-cammino-della-magia-selvaggia";
const STARRY_FORM = "druido-circolo-delle-stelle-forma-siderale";
const SPIRIT_TOTEM = "druido-circolo-del-pastore-totem-spirituale";
const THIRD_EYE = "mago-scuola-di-divinazione-terzo-occhio";

const enabledIds = (profile) => getEnabledClassFeatures(profile).map((entry) => entry.id);
// The variant the activation applies when the GM asks choiceId, with Rage active (Beast Form and Wild Surge end with it).
const applied = (profile, id, choiceId) => {
  const result = planClassFeatureActivation({
    state: { version: 1, resources: {}, instances: [{ instanceId: "rage-1", featureId: RAGE, sourceId: "pc", startedRound: 1, expiresRound: 10 }] },
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: profile.characterBuild,
    sourceId: "pc",
    instanceId: "prova-1",
    currentRound: 1,
    choiceId,
    enabledFeatureIds: enabledIds(profile),
  });
  return result.ok ? result.instance.choiceId : result.reason;
};

test("a species trait that ends like a variant leaves Beast Form's to the GM: in the sheet, the console and the activation", () => {
  for (const [speciesId, traitId, asked] of [
    ["leonin", "specie-leonin-artigli", "morso"],
    ["tortle", "specie-tortle-artigli", "morso"],
    ["aarakocra", "specie-aarakocra-artigli", "morso"],
    ["lucertoloide", "specie-lucertoloide-morso", "artigli"],
  ]) {
    const profile = { ...barbarian(BEAST, [BEAST_FORM]), species: { id: speciesId } };
    assert.ok(enabledIds(profile).includes(traitId), traitId);
    assert.equal(sheetAsks(profile, BEAST_FORM), true, speciesId);
    assert.equal(consoleAsks(profile, BEAST_FORM), true, speciesId);
    assert.equal(applied(profile, BEAST_FORM, asked), asked, `${speciesId}: the GM's variant, not the trait's`);
  }
});

test("a tiefling's bloodline traits leave Wild Surge's outcome to the GM, on its card and as Rage's automatic outcome", () => {
  for (const level of [3, 5]) {
    const profile = { characterBuild: [{ classId: "barbaro", level, subclassId: WILD }], species: { id: "tiefling-stirpe", ancestryId: "asmodeus" } };
    assert.ok(enabledIds(profile).includes("specie-tiefling-stirpe-eredita-asmodeus-3"), `level ${level}`);
    assert.equal(sheetAsks(profile, WILD_SURGE), true, `level ${level}`);
    assert.equal(consoleAsks(profile, WILD_SURGE), true, `level ${level}`);
    assert.equal(consoleAsks(profile, RAGE, `auto:${WILD_SURGE}`), true, `level ${level}: Rage's automatic outcome`);
    assert.equal(applied(profile, WILD_SURGE, "7"), "7", `level ${level}`);
  }
});

test("another trait, or another class's feature, that ends like a variant fixes nothing", () => {
  const diviner = (species) => ({ characterBuild: [{ classId: "mago", level: 10, subclassId: "mago-scuola-di-divinazione" }], species });
  for (const species of [{ id: "duergar" }, { id: "elfo-pallido" }, { id: "marchio-del-drago", ancestryId: "ombra" }]) {
    assert.equal(sheetAsks(diviner(species), THIRD_EYE), true, `${species.id}: its Invisibility is not the Third Eye's`);
    assert.equal(applied(diviner(species), THIRD_EYE, "scurovisione"), "scurovisione", species.id);
  }
  const simic = { characterBuild: [{ classId: "barbaro", level: 5, subclassId: WILD }], species: { id: "ibrido-simic", ancestryId: "scalatore-planata" } };
  assert.equal(sheetAsks(simic, WILD_SURGE), true, "the manta glide (-5) is not outcome 5");
  // A druid and sorcerer with the Chalice's card: the dragon wings (-drago) fix nothing, nor does the card.
  const starsSorcerer = {
    characterBuild: [{ classId: "druido", level: 2, subclassId: "druido-circolo-delle-stelle" },
      { classId: "stregone", level: 14, subclassId: "stregone-discendenza-draconica" }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [STARRY_FORM, `${STARRY_FORM}-calice`, "stregone-discendenza-draconica-ali-di-drago"],
  };
  assert.ok(enabledIds(starsSorcerer).includes("stregone-discendenza-draconica-ali-di-drago"));
  assert.equal(sheetAsks(starsSorcerer, STARRY_FORM), true);
  assert.equal(applied(starsSorcerer, STARRY_FORM, "arciere"), "arciere");
  // A druid and Totem Warrior with the Unicorn's card: neither the barbarian's bear nor the card chooses the spirit.
  const shepherdTotem = {
    characterBuild: [{ classId: "druido", level: 2, subclassId: "druido-circolo-del-pastore" },
      { classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-combattente-totemico" }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [SPIRIT_TOTEM, `${SPIRIT_TOTEM}-spirito-unicorno`, RAGE,
      "barbaro-cammino-del-combattente-totemico-spirito-totemico", "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso"],
  };
  assert.ok(enabledIds(shepherdTotem).includes("barbaro-cammino-del-combattente-totemico-spirito-totemico-orso"));
  assert.equal(sheetAsks(shepherdTotem, SPIRIT_TOTEM), true);
  assert.equal(applied(shepherdTotem, SPIRIT_TOTEM, "falco"), "falco");
});

test("Starry Form, Spirit Totem and Beast Form ask at each use, whatever variant cards the sheet enables", () => {
  const stars = { characterBuild: [{ classId: "druido", level: 2, subclassId: "druido-circolo-delle-stelle" }] };
  const shepherd = { characterBuild: [{ classId: "druido", level: 2, subclassId: "druido-circolo-del-pastore" }] };
  for (const [profile, id, asked] of [[stars, STARRY_FORM, "calice"], [shepherd, SPIRIT_TOTEM, "unicorno"]]) {
    assert.equal(enabledIds(profile).filter((entryId) => entryId.startsWith(`${id}-`)).length, 3, `${id}: three reference cards`);
    assert.equal(sheetAsks(profile, id), true, id);
    assert.equal(consoleAsks(profile, id), true, id);
    assert.equal(applied(profile, id, asked), asked, `${id}: the GM's variant, not the first card's`);
  }
  const bear = { ...shepherd, classFeaturesConfigured: true, enabledClassFeatureIds: [SPIRIT_TOTEM, `${SPIRIT_TOTEM}-spirito-orso`] };
  assert.equal(sheetAsks(bear, SPIRIT_TOTEM), true, "the Bear's card alone: the spirit is still chosen at each summoning");
  assert.equal(consoleAsks(bear, SPIRIT_TOTEM), true);
  assert.equal(applied(bear, SPIRIT_TOTEM, "falco"), "falco");
  assert.equal(applied(bear, SPIRIT_TOTEM, ""), "choice-required");
  const clawsAndTail = barbarian(BEAST, [BEAST_FORM, `${BEAST_FORM}-artigli`, `${BEAST_FORM}-coda`]);
  assert.equal(sheetAsks(clawsAndTail, BEAST_FORM), true, "Claws and Tail enabled: the GM chooses");
  assert.equal(applied(clawsAndTail, BEAST_FORM, "morso"), "morso");
  const tail = { ...barbarian(BEAST, [BEAST_FORM, `${BEAST_FORM}-coda`]), species: { id: "leonin" } };
  assert.equal(sheetAsks(tail, BEAST_FORM), true, "the Tail's card alone: the form is still chosen at each rage");
  assert.equal(applied(tail, BEAST_FORM, "morso"), "morso");
});

// The one choice the manual ties to the sheet: Storm Aura's environment, changed only on gaining a level (Xanathar's).
// Its card enabled alone is the variant, whatever the GM asks; with none, there is nothing to apply.
test("Storm Aura's environment is the sheet's: its card enabled alone fixes it", () => {
  const herald = "barbaro-cammino-dell-araldo-della-tempesta";
  assert.equal(feature(STORM_AURA).choiceMode, "configuration");
  assert.equal(applied(barbarian(herald, [STORM_AURA, `${STORM_AURA}-tundra`]), STORM_AURA, "deserto"), "tundra");
  assert.equal(applied(barbarian(herald, [STORM_AURA]), STORM_AURA, ""), "choice-required");
});

// Tasha's rolls Wild Surge's d8 each time Rage starts: the outcome is never the sheet's (choiceMode "roll"). The console,
// as the sheet, starts its dropdown empty and asks the roll before it activates Rage.
test("Wild Surge's outcome is rolled each time: never fixed by a card, an empty dropdown, the roll asked first", () => {
  assert.equal(feature(WILD_SURGE).choiceMode, "roll");
  const card = barbarian(WILD, [`${WILD_SURGE}-risultato-2`]);
  assert.equal(applied(card, WILD_SURGE, "7"), "7", "the outcome rolled, not the card's");
  const form = pcAttackFeatureForm(feature(RAGE), pcAttackFeatureState(card, {}, getEnabledClassFeatures(card), 1),
    { characterBuild: card.characterBuild });
  const outcome = form.fields.find((field) => field.id === `auto:${WILD_SURGE}`);
  assert.deepEqual([outcome.rolled, outcome.options[0]], [true, { value: "", label: "Esito tirato…" }]);
  assert.match(pcAttackFeatureRequest(feature(RAGE), form, {}, { sourceId: "pc" }).error, /^Indica l'esito tirato/u);
  assert.deepEqual(pcAttackFeatureRequest(feature(RAGE), form, { [`auto:${WILD_SURGE}`]: "7" }, { sourceId: "pc" }).params.autoChoiceIds,
    { [WILD_SURGE]: "7" });
});

test("the catalog names each sub-feature of a feature with variants after it, and nothing else: the rule reads the id", () => {
  const all = [...CLASS_FEATURE_BY_ID.values()];
  for (const entry of all.filter((candidate) => classFeatureChoiceOptions(candidate).length)) {
    const named = all.filter((other) => other.id.startsWith(`${entry.id}-`)).map((other) => other.id).sort();
    const children = all.filter((other) => classFeatureParentFeatureId(other) === entry.id).map((other) => other.id).sort();
    assert.deepEqual(named, children, entry.id);
  }
});
