// Species traits (dragonborn and the PHB 2014 species): profile field, passive resistance, Chromatic Warding.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { SPECIES, sanitizeSpecies, speciesDamageDefenses, speciesDisplayName, speciesOptionMissing, speciesFeaturesForProfile, SPECIES_FEATURES } = await import("../src/speciesTraitCore.js");
const { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID, CLASS_FEATURES, getEnabledClassFeatures, getAvailableClassFeatures } = await import("../src/classFeatureCatalog.js");
const { planClassFeatureActivation, classFeatureConditionInstancesForActivation, classFeatureRuntimeSupport, resolveClassFeatureResourceMaximum } = await import("../src/classFeatureCore.js");
const { damageDefensesForItem, profileDamageDefenses } = await import("../src/damageDefensesCore.js");
const { sanitizeInitiativeCard, hasInitiativeCardValues } = await import("../src/initiativeCards.js");

const META = "com.thebigpicture.initiative/meta";
const WARDING = "specie-dragonide-cromatico-interdizione-cromatica-bianco";
const whiteDragonborn = (level = 5) => ({ species: { id: "dragonide-cromatico", ancestryId: "bianco" }, characterBuild: [{ classId: "stregone", level }] });

test("the species field is sanitized and optional", () => {
  assert.deepEqual(sanitizeSpecies({ id: "dragonide-cromatico", ancestryId: "bianco" }), { id: "dragonide-cromatico", ancestryId: "bianco" });
  assert.deepEqual(sanitizeSpecies({ id: "dragonide-cromatico", ancestryId: "oro" }), { id: "dragonide-cromatico", ancestryId: "" }, "gold is metallic, not chromatic");
  assert.equal(sanitizeSpecies({ id: "autognome" }), null, "not in the catalog yet");
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({}), "species"), false, "profiles without a species keep their shape");
  assert.deepEqual(sanitizeInitiativeCard({ species: { id: "dragonide-cromatico", ancestryId: "bianco" } }).species, { id: "dragonide-cromatico", ancestryId: "bianco" });
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ species: { id: "dragonide", ancestryId: "rosso" } })), true);
  assert.equal(speciesDisplayName({ id: "dragonide-cromatico", ancestryId: "bianco" }), "Dragonide cromatico (bianco · freddo)");
});

test("the ancestry resistance is a passive profile defense", () => {
  assert.deepEqual(speciesDamageDefenses({ id: "dragonide-cromatico", ancestryId: "bianco" }), { resistances: ["cold"] });
  assert.deepEqual(profileDamageDefenses({ ...whiteDragonborn(), damageDefenses: { resistances: ["fire"] } }),
    { immunities: [], resistances: ["cold", "fire"], vulnerabilities: [] });
  const item = { id: "kriv", metadata: { [META]: { initiativeCard: whiteDragonborn() } } };
  assert.deepEqual(damageDefensesForItem(item, META).resistances, ["cold"]);
});

test("species traits resolve by id but stay out of the class catalog", () => {
  assert.ok(CLASS_FEATURE_BY_ID.get(WARDING));
  assert.equal(CLASS_FEATURES.some((feature) => feature.speciesId), false);
  assert.equal(getAvailableClassFeatures([{ classId: "stregone", level: 5 }]).some((feature) => feature.speciesId), false);
  for (const feature of SPECIES_FEATURES) {
    for (const poolId of feature.trackedResourcePoolIds) assert.ok(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(poolId), poolId);
  }
});

test("Chromatic Warding is enabled from 5th level, even on a profile with configured class features", () => {
  const ids = (profile) => getEnabledClassFeatures(profile).filter((feature) => feature.speciesId).map((feature) => feature.id);
  assert.deepEqual(ids(whiteDragonborn(4)), ["specie-dragonide-cromatico-arma-a-soffio-bianco"]);
  assert.deepEqual(ids({ ...whiteDragonborn(5), classFeaturesConfigured: true, enabledClassFeatureIds: [] }),
    ["specie-dragonide-cromatico-arma-a-soffio-bianco", WARDING]);
  assert.deepEqual(ids({ species: { id: "dragonide-cromatico", ancestryId: "bianco" } }).length, 2, "without a class build the level is unknown");
  assert.deepEqual(ids({ species: { id: "dragonide-cromatico", ancestryId: "" } }), []);
});

test("activating Chromatic Warding spends its long-rest use and grants cold immunity for 1 minute", async () => {
  const feature = CLASS_FEATURE_BY_ID.get(WARDING);
  const build = whiteDragonborn().characterBuild;
  assert.equal(classFeatureRuntimeSupport(feature).ready, true);
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(feature.resourceCosts[0].poolId), build).maximum, 1);
  const activation = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "kriv", targetIds: ["kriv"], currentRound: 2, currentTurnKey: "2:kriv", instanceId: "ward-1" });
  assert.equal(activation.ok, true, activation.reason);
  const [instance] = classFeatureConditionInstancesForActivation(feature, activation.instance, "Kriv", build);
  assert.equal(instance.condition, "Interdizione Cromatica");
  assert.deepEqual(instance.expiry.remaining, 10);
  assert.deepEqual(instance.mechanics.damageDefenses, { immunities: ["cold"] });
  assert.equal(instance.displayLabel, undefined, "a short pill: the immunity is a micropill");
  const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");
  assert.deepEqual(effectSummaryPartsFor(instance), [{ id: "damage-defense-immunity-cold", label: "Imm. freddo" }]);
  const item = { id: "kriv", metadata: { [META]: { initiativeCard: whiteDragonborn(), conditions: { version: 2, instances: [instance] } } } };
  assert.deepEqual(damageDefensesForItem(item, META), { immunities: ["cold"], resistances: [], vulnerabilities: [] });
  const again = planClassFeatureActivation({ state: activation.state, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "kriv", targetIds: ["kriv"], currentRound: 3, currentTurnKey: "3:kriv", instanceId: "ward-2" });
  assert.equal(again.ok, false, "a second use needs a long rest");
});

test("the Fizban breath weapon uses equal the proficiency bonus", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-dragonide-fizban-arma-a-soffio-usi");
  assert.equal(resolveClassFeatureResourceMaximum(pool, [{ classId: "stregone", level: 5 }]).maximum, 3);
});

const traits = (species, level = 0) => speciesFeaturesForProfile({ species }, level).map((feature) => feature.id);

test("a PHB species has its own traits and those of the chosen subrace only", () => {
  assert.deepEqual(traits({ id: "elfo", ancestryId: "drow" }, 3), [
    "specie-elfo-ascendenza-fatata", "specie-elfo-sensibilita-alla-luce-del-sole", "specie-elfo-magia-drow", "specie-elfo-magia-drow-luminescenza",
  ]);
  assert.equal(traits({ id: "elfo", ancestryId: "drow" }, 5).includes("specie-elfo-magia-drow-oscurita"), true);
  assert.deepEqual(traits({ id: "elfo", ancestryId: "" }), [], "a species with subraces needs one");
  assert.equal(speciesOptionMissing({ id: "elfo" }), true);
  assert.equal(speciesOptionMissing({ id: "tiefling" }), false, "a species without options is complete");
  assert.deepEqual(traits({ id: "mezzorco" }), ["specie-mezzorco-tenacia-implacabile", "specie-mezzorco-attacchi-selvaggi"]);
  assert.deepEqual(traits({ id: "umano", ancestryId: "standard" }), []);
  assert.equal(speciesDisplayName({ id: "nano", ancestryId: "colline" }), "Nano delle colline");
  assert.equal(speciesDisplayName({ id: "mezzelfo" }), "Mezzelfo");
});

test("species and subrace resistances are passive profile defenses", () => {
  assert.deepEqual(speciesDamageDefenses({ id: "nano", ancestryId: "montagne" }), { resistances: ["poison"] });
  assert.deepEqual(speciesDamageDefenses({ id: "halfling", ancestryId: "tozzo" }), { resistances: ["poison"] });
  assert.deepEqual(speciesDamageDefenses({ id: "halfling", ancestryId: "piedelesto" }), {});
  assert.deepEqual(speciesDamageDefenses({ id: "tiefling" }), { resistances: ["fire"] });
});

test("every species trait names its manual and page, and no option id collides", () => {
  for (const feature of SPECIES_FEATURES) {
    assert.ok(feature.sourceLabel && Number.isInteger(feature.page), feature.id);
    for (const optionId of feature.ancestryIds || [feature.ancestryId].filter(Boolean)) {
      assert.ok(SPECIES.find((entry) => entry.id === feature.speciesId).ancestries.some((entry) => entry.id === optionId), feature.id);
    }
  }
  assert.equal(new Set(SPECIES_FEATURES.map((feature) => feature.id)).size, SPECIES_FEATURES.length);
});

test("an innate spell spends its own long-rest use", () => {
  const feature = CLASS_FEATURE_BY_ID.get("specie-tiefling-eredita-infernale-intimorire-infernale");
  const build = [{ classId: "warlock", level: 3 }];
  const activation = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "zar", targetIds: ["zar"], currentRound: 1, currentTurnKey: "1:zar", instanceId: "rebuke-1" });
  assert.equal(activation.ok, true, activation.reason);
  const again = planClassFeatureActivation({ state: activation.state, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "zar", targetIds: ["zar"], currentRound: 2, currentTurnKey: "2:zar", instanceId: "rebuke-2" });
  assert.equal(again.ok, false);
  assert.equal(classFeatureRuntimeSupport(CLASS_FEATURE_BY_ID.get("specie-dragonide-arma-a-soffio-rosso")).ready, true, "the breath weapon spends its use too");
  assert.equal(classFeatureRuntimeSupport(CLASS_FEATURE_BY_ID.get("specie-halfling-fortunato")).ready, false, "a passive trait is a reminder");
});

test("Volo, Tomo dei Nemici and Mostri del Multiverso: two versions side by side", () => {
  const volo = SPECIES.find((entry) => entry.id === "firbolg");
  const motm = SPECIES.find((entry) => entry.id === "firbolg-multiverso");
  assert.equal(volo.sourceLabel, "Guida di Volo ai Mostri");
  assert.equal(motm.sourceLabel, "Mordenkainen presenta: Mostri del Multiverso");
  assert.equal(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-firbolg-passo-nascosto-usi").refresh.length, 2, "Volo: short or long rest");
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-firbolg-multiverso-passo-nascosto-usi"), [{ classId: "druido", level: 9 }]).maximum, 4,
    "Mostri del Multiverso: proficiency bonus uses");
  const groups = [...new Set(SPECIES.map((entry) => entry.sourceLabel))];
  assert.deepEqual(groups, ["Manuale del Giocatore 2014", "Elemental Evil Player's Companion", "Guida del Giocatore alla Costa della Spada",
    "Guida di Volo ai Mostri", "The Tortle Package", "One Grung Above", "Il Tomo dei Nemici di Mordenkainen", "Guildmasters' Guide to Ravnica",
    "Acquisitions Incorporated", "Locathah Rising", "Eberron: Rising from the Last War", "Explorer's Guide to Wildemount",
    "Mythic Odysseys of Theros", "Van Richten's Guide to Ravenloft", "The Wild Beyond the Witchlight", "Il Tesoro dei Draghi di Fizban", "Strixhaven: A Curriculum of Chaos",
    "Mordenkainen presenta: Mostri del Multiverso"]);
});

test("a yuan-ti is immune to poison; a Tomo tiefling gets its bloodline's spells", () => {
  assert.deepEqual(speciesDamageDefenses({ id: "yuan-ti" }), { immunities: ["poison"] });
  assert.deepEqual(profileDamageDefenses({ species: { id: "yuan-ti" } }), { immunities: ["poison"], resistances: [], vulnerabilities: [] });
  assert.deepEqual(traits({ id: "tiefling-stirpe", ancestryId: "levistus" }, 3), [
    "specie-tiefling-stirpe-resistenza-infernale", "specie-tiefling-stirpe-eredita-levistus", "specie-tiefling-stirpe-eredita-levistus-3",
  ]);
  assert.deepEqual(traits({ id: "tiefling-stirpe", ancestryId: "" }), []);
});

test("an aasimar transformation is a 1-minute pill that spends its long-rest use", () => {
  const feature = CLASS_FEATURE_BY_ID.get("specie-aasimar-multiverso-rivelazione-celestiale-ali");
  const build = [{ classId: "paladino", level: 3 }];
  assert.equal(classFeatureRuntimeSupport(feature).ready, true);
  const activation = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "aela", targetIds: ["aela"], currentRound: 1, currentTurnKey: "1:aela", instanceId: "wings-1" });
  assert.equal(activation.ok, true, activation.reason);
  const [instance] = classFeatureConditionInstancesForActivation(feature, activation.instance, "Aela", build);
  assert.equal(instance.condition, "Rivelazione celestiale: Ali celestiali");
  assert.equal(instance.expiry.remaining, 10);
  const shroud = CLASS_FEATURE_BY_ID.get("specie-aasimar-multiverso-rivelazione-celestiale-sudario");
  const again = planClassFeatureActivation({ state: activation.state, feature: shroud, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "aela", targetIds: ["aela"], currentRound: 2, currentTurnKey: "2:aela", instanceId: "shroud-1" });
  assert.equal(again.ok, false, "the three revelations share one use");
});

test("Elemental Evil and Costa della Spada: the element or the variant chooses traits and resistances", () => {
  assert.deepEqual(speciesDamageDefenses({ id: "genasi", ancestryId: "acqua" }), { resistances: ["acid"] });
  assert.deepEqual(speciesDamageDefenses({ id: "genasi-multiverso", ancestryId: "aria" }), { resistances: ["lightning"] });
  assert.deepEqual(speciesDamageDefenses({ id: "genasi", ancestryId: "aria" }), {}, "the Elemental Evil air genasi has no resistance");
  assert.deepEqual(traits({ id: "genasi", ancestryId: "fuoco" }, 2), ["specie-genasi-resistenza-al-fuoco", "specie-genasi-raggiungere-la-fiamma"]);
  assert.deepEqual(traits({ id: "tiefling-variante", ancestryId: "alato" }, 5), ["specie-tiefling-variante-resistenza-infernale", "specie-tiefling-variante-alato"]);
  assert.equal(traits({ id: "mezzelfo-variante", ancestryId: "abilita" }).length, 1, "skill versatility leaves only Fey Ancestry");
  assert.equal(speciesDisplayName({ id: "tiefling-variante", ancestryId: "alato" }), "Tiefling (alato)");
  assert.equal(speciesDisplayName({ id: "genasi", ancestryId: "terra" }), "Genasi della terra");
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-genasi-multiverso-interdizione-alle-lame-usi"), [{ classId: "mago", level: 5 }]).maximum, 3);
});

test("an identical reprint names its other manuals instead of a duplicate entry", () => {
  assert.equal(SPECIES.some((entry) => entry.id.startsWith("goliath") && entry.source === "elemental-evil"), false);
  assert.ok(SPECIES.find((entry) => entry.id === "goliath").sourceAliases.includes("elemental evil"));
  assert.ok(SPECIES.find((entry) => entry.id === "duergar").sourceAliases.includes("scag"));
});

test("Eberron: a dragonmark keeps the traits of its base species and names itself on the card", () => {
  assert.equal(speciesDisplayName({ id: "marchio-del-drago", ancestryId: "ombra" }), "Marchio dell'ombra (elfo)");
  assert.deepEqual(speciesDamageDefenses({ id: "marchio-del-drago", ancestryId: "protezione" }), { resistances: ["poison"] });
  assert.deepEqual(speciesDamageDefenses({ id: "marchio-del-drago", ancestryId: "tempesta" }), { resistances: ["lightning"] }, "Storm's Boon");
  const healing = traits({ id: "marchio-del-drago", ancestryId: "guarigione" }, 1);
  assert.ok(healing.includes("specie-marchio-del-drago-guarigione-fortunato"), "the halfling keeps Lucky");
  assert.ok(healing.includes("specie-marchio-del-drago-incantesimi-del-marchio"));
  assert.equal(healing.includes("specie-marchio-del-drago-tocco-guaritore-ristorare-inferiore"), false, "Lesser Restoration from 3rd level");
  assert.deepEqual(speciesDamageDefenses({ id: "kalashtar" }), { resistances: ["psychic"] });
  assert.deepEqual(speciesDamageDefenses({ id: "warforged" }), { resistances: ["poison"] });
});

test("shifting is a 1-minute pill: once per short rest in Eberron, proficiency bonus uses in Mostri del Multiverso", () => {
  const build = [{ classId: "ranger", level: 5 }];
  assert.equal(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-shifter-mutazione-usi").refresh.length, 2);
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-shifter-multiverso-mutazione-usi"), build).maximum, 3);
  const feature = CLASS_FEATURE_BY_ID.get("specie-shifter-mutazione-pelle-bestiale");
  const activation = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "geth", targetIds: ["geth"], currentRound: 1, currentTurnKey: "1:geth", instanceId: "shift-1" });
  assert.equal(activation.ok, true, activation.reason);
  const [instance] = classFeatureConditionInstancesForActivation(feature, activation.instance, "Geth", build);
  assert.equal(instance.expiry.remaining, 10);
  assert.deepEqual(traits({ id: "shifter", ancestryId: "zanna-lunga" }), ["specie-shifter-mutazione-zanna-lunga"]);
});

test("Ravnica: a Simic hybrid's pair of enhancements, the first at 1st level and the second at 5th", () => {
  assert.equal(SPECIES.find((entry) => entry.id === "ibrido-simic").ancestries.length, 15);
  assert.deepEqual(traits({ id: "ibrido-simic", ancestryId: "planata-sputo" }, 4), ["specie-ibrido-simic-potenziamento-planata"]);
  assert.deepEqual(traits({ id: "ibrido-simic", ancestryId: "planata-sputo" }, 5), ["specie-ibrido-simic-potenziamento-planata", "specie-ibrido-simic-potenziamento-sputo-acido"]);
  assert.deepEqual(traits({ id: "ibrido-simic", ancestryId: "scalatore-planata" }, 5), ["specie-ibrido-simic-potenziamento-planata-5", "specie-ibrido-simic-potenziamento-scalatore"]);
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-ibrido-simic-sputo-acido-usi");
  assert.equal(resolveClassFeatureResourceMaximum(pool, [{ classId: "guerriero", level: 5 }], { con: 3 }).maximum, 3);
  assert.equal(resolveClassFeatureResourceMaximum(pool, [{ classId: "guerriero", level: 5 }], { con: -1 }).maximum, 1, "minimum once");
});

test("Theros: the leonin roar spends a short-rest use; a satyr is a fey with magic resistance", () => {
  assert.equal(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-leonin-ruggito-intimidatorio-usi").refresh.length, 2);
  assert.deepEqual(traits({ id: "satiro" }), ["specie-satiro-fatato", "specie-satiro-ariete", "specie-satiro-resistenza-alla-magia", "specie-satiro-balzi-gioiosi"]);
  assert.ok(SPECIES.find((entry) => entry.id === "centauro").sourceAliases.includes("theros"), "the Theros centaur is the Ravnica one");
});

test("Witchlight and Strixhaven: the fairy's spells from 3rd and 5th level, the harengon's proficiency bonus hops", () => {
  assert.deepEqual(traits({ id: "fata" }, 3), ["specie-fata-fatato", "specie-fata-volo", "specie-fata-magia-fatata", "specie-fata-magia-fatata-luminescenza"]);
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-harengon-salto-del-coniglio-usi"), [{ classId: "ladro", level: 9 }]).maximum, 4);
  assert.deepEqual(traits({ id: "owlin" }), ["specie-owlin-volo"]);
  assert.ok(SPECIES.find((entry) => entry.id === "harengon").sourceAliases.includes("motm"), "the Mostri del Multiverso reprint has the same text");
  assert.equal(SPECIES.some((entry) => entry.id === "fata-multiverso"), false);
});

test("the tortle's Shell Defense is an untimed label with no uses, removed by hand", () => {
  const feature = CLASS_FEATURE_BY_ID.get("specie-tortle-difesa-del-guscio");
  const build = [{ classId: "monaco", level: 3 }];
  assert.equal(classFeatureRuntimeSupport(feature).ready, true);
  const activation = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
    sourceId: "shell", targetIds: ["shell"], currentRound: 1, currentTurnKey: "1:shell", instanceId: "shell-1" });
  assert.equal(activation.ok, true, activation.reason);
  const [instance] = classFeatureConditionInstancesForActivation(feature, activation.instance, "Shell", build);
  assert.equal(instance.expiry.mode, "manual");
  assert.equal(instance.manualRemoval, true);
  assert.deepEqual(speciesDamageDefenses({ id: "grung" }), { immunities: ["poison"] });
  assert.deepEqual(traits({ id: "verdan" }), ["specie-verdan-guarigione-del-sangue-nero", "specie-verdan-telepatia-limitata", "specie-verdan-intuito-telepatico"]);
});

test("Wildemount and Van Richten: dragonborn variants without breath, lineages with their own uses", () => {
  assert.deepEqual(traits({ id: "dragonide-wildemount", ancestryId: "ravenite" }), ["specie-dragonide-wildemount-assalto-vendicativo"]);
  assert.deepEqual(speciesDamageDefenses({ id: "dragonide-wildemount", ancestryId: "draconblood" }), {}, "no ancestry resistance");
  assert.equal(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-dragonide-wildemount-assalto-vendicativo-usi").refresh.length, 2);
  assert.deepEqual(speciesDamageDefenses({ id: "reborn" }), { resistances: ["poison"] });
  assert.equal(resolveClassFeatureResourceMaximum(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("specie-dhampir-morso-vampirico-usi"), [{ classId: "ladro", level: 5 }]).maximum, 3);
  assert.equal(traits({ id: "elfo-pallido" }, 2).includes("specie-elfo-pallido-benedizione-sonno"), false, "Sleep from 3rd level");
  assert.ok(SPECIES.find((entry) => entry.id === "elfo-marino").sourceAliases.includes("wildemount"));
});
