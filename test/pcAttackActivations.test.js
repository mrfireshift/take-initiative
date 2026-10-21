import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackActivationOptions, pcAttackPreview, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+4" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const blast = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["eldritch-blast"] } };
const MODS = { str: 4, dex: 2, con: 3, int: 1, wis: 3, cha: 4 };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const actor = (classId, level, featureIds, meta = {}, subclassId = "") => creature("dars", "Dars", { initiativeCard: {
  characterBuild: [{ classId, level, ...(subclassId ? { subclassId } : {}) }], abilityModifiers: MODS, classFeaturesConfigured: true,
  enabledClassFeatureIds: featureIds, quickActions: [sword, bow, blast] }, ...meta });
const MANEUVER = (slug) => `guerriero-maestro-di-battaglia-manovre-${slug}`;
const battleMaster = (meta = {}) => actor("guerriero", 10, ["guerriero-maestro-di-battaglia-manovre",
  ...["attacco-minaccioso", "attacco-sbilanciante", "attacco-con-spinta", "attacco-con-affondo"].map(MANEUVER)], meta, "guerriero-maestro-di-battaglia");
const ghoul = () => creature("ghoul", "Ghoul");
const ownTurn = { round: 2, order: ["dars", "ghoul"], current: 0 };
const ghoulTurn = { ...ownTurn, current: 1 };
const option = (options, id) => options.find((entry) => entry.id === id);
const options = (sourceItem, overrides = {}) => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: ghoul(), turnState: ownTurn, ...overrides });
const plan = (sourceItem, activations, overrides = {}) => buildPcAttackMutation({ action: sword, sourceItem, targetItem: ghoul(), outcome: "hit",
  componentAmounts: { c1: 9 }, attackInstanceId: "attack-one", turnState: ownTurn, expectedDefenses: {}, activations, ...overrides });
const sourcePatch = (result) => result.options.metadataPatches[0].fields;
// The attacker as it is after a committed plan: its resources and its turn uses are the ones the plan wrote.
const after = (result, item) => ({ ...item, metadata: { [META]: { ...item.metadata[META],
  [PC_ATTACK_STATE_FIELD]: sourcePatch(result)[PC_ATTACK_STATE_FIELD].value,
  ...(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD] ? { [CLASS_FEATURE_STATE_FIELD]: sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value } : {}) } } });
const menacing = (saveOutcome, amount = 6) => ({ id: MANEUVER("attacco-minaccioso"), type: "slashing", amount, saveOutcome });

test("a Battle Master's maneuvers: superiority die, save DC, the dice left and the effect", () => {
  const minaccioso = option(options(battleMaster()), MANEUVER("attacco-minaccioso"));
  assert.deepEqual([minaccioso.label, minaccioso.dice, minaccioso.types, minaccioso.available], ["Attacco Minaccioso", "1d10", ["slashing"], true]);
  assert.deepEqual(minaccioso.save, { ability: "wis", label: "Saggezza", dc: 16 });
  assert.deepEqual(minaccioso.effect, { kind: "pill", label: "Spaventato", self: false });
  assert.deepEqual(minaccioso.resources.map((entry) => [entry.name, entry.current, entry.maximum]), [["Dadi di Superiorità", 5, 5]]);
  assert.equal(minaccioso.group, "manovra");
  // Lunging Attack: melee, on the fighter's own turn.
  assert.equal(option(options(battleMaster(), { action: bow }), MANEUVER("attacco-con-affondo")).reason, "Solo per gli attacchi in mischia.");
  assert.equal(option(options(battleMaster(), { turnState: ghoulTurn }), MANEUVER("attacco-con-affondo")).reason, "Solo nel proprio turno.");
  // A cantrip is no weapon attack.
  assert.equal(option(options(battleMaster(), { action: blast, spellId: "eldritch-blast" }), MANEUVER("attacco-minaccioso")).reason, "Solo per gli attacchi con arma.");
});

test("Menacing Attack with a failed save: the die adds to the damage, a die is spent and the target is frightened, in one command", () => {
  const result = plan(battleMaster(), [menacing("failed")]);
  assert.deepEqual(result.damageComponents.map((component) => [component.id, component.amount, component.source.kind]),
    [["c1", 9, "weapon"], [`a:${MANEUVER("attacco-minaccioso")}`, 6, "class-feature"]]);
  assert.equal(result.change.afterHP, 25);
  assert.deepEqual(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["guerriero-dadi-superiorita"], { current: 4, maximum: 5, unlimited: false });
  const pills = result.operations.find((operation) => operation.type === "condition:add-instances").instancesByTarget.ghoul;
  assert.deepEqual(pills.map((pill) => [pill.condition, pill.sourceId]), [["Spaventato", "dars"]]);
  assert.deepEqual(result.causality.activations[0].save, { ability: "wis", label: "Saggezza", dc: 16, outcome: "failed" });
  assert.deepEqual(result.causality.activations[0].effect, { kind: "pill", label: "Spaventato", applied: true });
  assert.deepEqual(result.causality.activations[0].spent, [{ poolId: "guerriero-dadi-superiorita", name: "Dadi di Superiorità", amount: 1, before: 5, after: 4 }]);
  assert.deepEqual(result.causality.conditionsApplied.map((entry) => [entry.targetId, entry.condition, entry.featureId]),
    [["ghoul", "Spaventato", MANEUVER("attacco-minaccioso")]]);
  assert.deepEqual(result.labelTargetIds, ["ghoul"]);
});

test("a passed save still spends the die and adds it to the damage, without the pill", () => {
  const result = plan(battleMaster(), [menacing("passed")]);
  assert.equal(result.change.afterHP, 25);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["guerriero-dadi-superiorita"].current, 4);
  assert.equal(result.operations.some((operation) => operation.type === "condition:add-instances"), false);
  assert.equal(result.causality.activations[0].effect.applied, false);
});

test("one maneuver per attack; the save outcome and the die's damage are required", () => {
  const trip = { id: MANEUVER("attacco-sbilanciante"), type: "slashing", amount: 4, saveOutcome: "failed" };
  assert.throws(() => plan(battleMaster(), [menacing("failed"), trip]), /Attacco Sbilanciante: una manovra per attacco\./);
  assert.throws(() => plan(battleMaster(), [{ ...menacing("failed"), saveOutcome: "" }]), /scegli l'esito del tiro salvezza/);
  const preview = (activations) => pcAttackPreview({ action: sword, sourceItem: battleMaster(), targetItem: ghoul(), outcome: "hit",
    amounts: { c1: "9" }, turnState: ownTurn, activations });
  assert.equal(preview([menacing("failed"), trip]).blocker, "Attacco Sbilanciante: una manovra per attacco.");
  assert.equal(preview([{ ...menacing("failed"), amount: "" }]).blocker, "Inserisci il danno di Attacco Minaccioso.");
  assert.equal(preview([{ ...menacing(""), amount: "6" }]).blocker, "Attacco Minaccioso: scegli l'esito del tiro salvezza.");
  const ready = preview([{ ...menacing("failed"), amount: "6" }]);
  assert.deepEqual([ready.ready, ready.total], [true, 15]);
});

test("activations need an attack roll, and a hit unless they act on the roll itself", () => {
  assert.throws(() => plan(battleMaster(), [menacing("failed")], { outcome: "miss", componentAmounts: {} }), /Attacco Minaccioso: Solo se l'attacco colpisce\./);
  assert.equal(pcAttackPreview({ action: sword, sourceItem: battleMaster(), targetItem: ghoul(), outcome: "miss", amounts: {}, turnState: ownTurn,
    activations: [menacing("failed")] }).blocker, "Attacco Minaccioso: Solo se l'attacco colpisce.");
  assert.equal(option(options(battleMaster(), { outcome: "miss" }), MANEUVER("attacco-minaccioso")).reason, "Solo se l'attacco colpisce.");
});

test("Trip Attack applies the standard Prono pill; a push is a note for the GM", () => {
  const tripped = plan(battleMaster(), [{ id: MANEUVER("attacco-sbilanciante"), type: "slashing", amount: 4, saveOutcome: "failed" }]);
  const prone = tripped.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual([prone.conditionName, prone.targetIds, prone.options.sourceId], ["Prono", ["ghoul"], "dars"]);
  assert.ok(tripped.operations.some((operation) => operation.type === "condition:automate"));
  assert.equal(option(options(battleMaster()), MANEUVER("attacco-sbilanciante")).size, "Grande o inferiore");
  const pushed = plan(battleMaster(), [{ id: MANEUVER("attacco-con-spinta"), type: "slashing", amount: 4, saveOutcome: "failed" }]);
  assert.deepEqual(pushed.causality.notes, ["Attacco con Spinta: Spinto fino a 4,5 m lontano dal guerriero."]);
  assert.ok(pushed.followUps.includes("Attacco con Spinta: Spinto fino a 4,5 m lontano dal guerriero."));
  const resisted = plan(battleMaster(), [{ id: MANEUVER("attacco-con-spinta"), type: "slashing", amount: 4, saveOutcome: "passed" }]);
  assert.equal(resisted.causality.notes, undefined);
});

test("no die left: the maneuver is disabled with its reason and refused at commit", () => {
  const spent = battleMaster({ [CLASS_FEATURE_STATE_FIELD]: { version: 1, resources: { "guerriero-dadi-superiorita": { current: 0, maximum: 5 } }, instances: [] } });
  const minaccioso = option(options(spent), MANEUVER("attacco-minaccioso"));
  assert.deepEqual([minaccioso.available, minaccioso.reason], [false, "Dadi di Superiorità: nessun uso rimasto."]);
  assert.throws(() => plan(spent, [menacing("failed")]), /Dadi di Superiorità: nessun uso rimasto\. Riapri/);
});

test("Arcane Shot: ranged only, once per turn whatever the arrow; a reaction on another turn may use it again", () => {
  const arrows = ["afferrante", "d-ombra"].map((slug) => `guerriero-arciere-arcano-tiro-arcano-freccia-${slug}`);
  const archer = actor("guerriero", 7, ["guerriero-arciere-arcano-tiro-arcano", ...arrows], {}, "guerriero-arciere-arcano");
  assert.equal(option(options(archer), arrows[0]).reason, "Solo per gli attacchi a distanza.");
  const first = plan(archer, [{ id: arrows[0], type: "poison", amount: 7 }], { action: bow, componentAmounts: { c1: 8 } });
  assert.deepEqual(sourcePatch(first)[PC_ATTACK_STATE_FIELD].value.riderUses, [{ riderId: "group:tiro-arcano", turnKey: "2:0:dars" }]);
  assert.equal(sourcePatch(first)[CLASS_FEATURE_STATE_FIELD].value.resources["guerriero-arciere-arcano-tiro-arcano-usi"].current, 1);
  const spent = after(first, archer);
  assert.equal(option(options(spent, { action: bow }), arrows[1]).reason, "Già usato in questo turno (un Tiro Arcano per turno).");
  assert.equal(option(options(spent, { action: bow, turnState: ghoulTurn }), arrows[1]).available, true);
  assert.deepEqual(first.options.sceneMetadataPreconditions.map((entry) => entry.field), ["round", "current"]);
});

test("a self pill: Defensive Flourish spends a Bardic Inspiration and puts its pill on the bard", () => {
  const difensivo = "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo";
  const mobile = "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-mobile";
  const bard = actor("bardo", 6, ["bardo-collegio-delle-spade-virtuosismo-della-lama", difensivo, mobile], {}, "bardo-collegio-delle-spade");
  const flourishes = options(bard);
  assert.deepEqual([difensivo, mobile].map((id) => [option(flourishes, id).dice, option(flourishes, id).group]), [["1d8", "virtuosismo"], ["1d8", "virtuosismo"]]);
  assert.deepEqual(option(flourishes, mobile).resources.map((entry) => [entry.name, entry.current]), [["Ispirazione Bardica", 4]]);
  const result = plan(bard, [{ id: difensivo, type: "slashing", amount: 5 }]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["bardo-ispirazione-bardica-usi"].current, 3);
  const pills = result.operations.find((operation) => operation.type === "condition:add-instances").instancesByTarget;
  assert.deepEqual(Object.keys(pills), ["dars"]);
  assert.equal(pills.dars[0].condition, "Virtuosismo Difensivo");
  assert.ok(result.options.targetIds.includes("dars"), "the coordinator loads the attacker's pills");
  assert.deepEqual(result.labelTargetIds, ["dars"]);
  assert.equal(result.causality.activations[0].effect.self, true);
});

test("requirements read from the attack: Eldritch Blast, Divine Strike, lightning damage, the first round", () => {
  const warlock = actor("warlock", 5, ["warlock-suppliche-occulte-lancia-della-letargia", "warlock-suppliche-occulte-deflagrazione-respingente"]);
  assert.equal(option(options(warlock), "warlock-suppliche-occulte-lancia-della-letargia").reason, "Solo con la Deflagrazione occulta.");
  const onBlast = options(warlock, { action: blast, spellId: "eldritch-blast" });
  assert.equal(option(onBlast, "warlock-suppliche-occulte-lancia-della-letargia").available, true);
  const repelled = plan(warlock, [{ id: "warlock-suppliche-occulte-deflagrazione-respingente" }],
    { action: blast, spellId: "eldritch-blast", componentAmounts: { c1: 7 } });
  assert.deepEqual(repelled.causality.notes, ["Deflagrazione Respingente: Spinto di 3 m in linea retta lontano dal warlock."]);

  const order = actor("chierico", 17, ["chierico-dominio-dell-ordine-colpo-divino", "chierico-dominio-dell-ordine-ira-dell-ordine"], {}, "chierico-dominio-dell-ordine");
  const wrath = "chierico-dominio-dell-ordine-ira-dell-ordine";
  assert.equal(option(options(order), wrath).reason, "Solo insieme a Colpo Divino.");
  const strike = { id: "chierico-dominio-dell-ordine-colpo-divino", type: "psychic", amount: 8 };
  assert.equal(option(options(order, { riders: [strike] }), wrath).available, true);
  const cursed = plan(order, [{ id: wrath }], { riders: [strike] });
  assert.equal(cursed.operations.find((operation) => operation.type === "condition:add-instances").instancesByTarget.ghoul[0].condition, "Ira dell'Ordine");

  const tempest = actor("chierico", 6, ["chierico-dominio-della-tempesta-colpo-del-tuono-e-del-fulmine"], {}, "chierico-dominio-della-tempesta");
  const thunderbolt = "chierico-dominio-della-tempesta-colpo-del-tuono-e-del-fulmine";
  assert.equal(option(options(tempest), thunderbolt).reason, "Solo con danni da fulmine.");
  assert.equal(option(options(tempest, { extras: [{ type: "lightning", amount: 5 }] }), thunderbolt).available, true);

  const scout = actor("ladro", 13, ["ladro-esploratore-maestro-di-imboscate"], {}, "ladro-esploratore");
  assert.equal(option(options(scout), "ladro-esploratore-maestro-di-imboscate").reason, "Solo nel primo round del combattimento.");
  assert.equal(option(options(scout, { turnState: { ...ownTurn, round: 1 } }), "ladro-esploratore-maestro-di-imboscate").available, true);
});

test("a spend-only activation: Fangs of the Fire Snake spends 1 Ki for 1d10 fire while active, without a new pill", () => {
  const fangs = "monaco-via-dei-quattro-elementi-discipline-elementali-zanne-del-serpente-di-fuoco";
  const monk = (meta = {}) => actor("monaco", 6, ["monaco-via-dei-quattro-elementi-discipline-elementali", fangs], meta, "monaco-via-dei-quattro-elementi");
  assert.equal(option(options(monk()), fangs).reason, "Zanne del Serpente di Fuoco non è attiva.");
  const active = monk({ conditions: [{ id: "fangs", condition: "Zanne del Serpente di Fuoco", active: true, sourceId: "dars" }] });
  const fangsOption = option(options(active), fangs);
  assert.deepEqual([fangsOption.available, fangsOption.dice, fangsOption.types], [true, "1d10", ["fire"]]);
  const result = plan(active, [{ id: fangs, type: "fire", amount: 6 }]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["monaco-punti-ki"].current, 5);
  assert.equal(result.operations.some((operation) => operation.type === "condition:add-instances"), false);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.instances.length, 0);
});

test("the Combat Log names the activation, its save and its effect, and the resource spent", () => {
  const result = plan(battleMaster(), [menacing("failed")]);
  const event = { category: "attack", payload: result.options.history.payload };
  const lines = buildCombatLogPresentation(null, [event]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.includes("Attivazione: Attacco Minaccioso 1d10 (6 taglienti) · TS Saggezza CD 16 fallito → Spaventato · Dadi di Superiorità 5 → 4"),
    lines.join("\n"));
  const pushed = plan(battleMaster(), [{ id: MANEUVER("attacco-con-spinta"), type: "slashing", amount: 4, saveOutcome: "failed" }]);
  const pushLines = buildCombatLogPresentation(null, [{ category: "attack", payload: pushed.options.history.payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(pushLines.includes("Nota: Attacco con Spinta: Spinto fino a 4,5 m lontano dal guerriero."), pushLines.join("\n"));
});

// 3B-1
const imp = () => creature("imp", "Imp", { hp: 12, hpMax: 12 });
const fighter = (slugs, meta = {}) => actor("guerriero", 10, ["guerriero-maestro-di-battaglia-manovre", ...slugs.map(MANEUVER)], meta, "guerriero-maestro-di-battaglia");

test("Sweeping Attack: the die damages only a second creature, with its own HP, in the same command", () => {
  const sweep = { id: MANEUVER("attacco-con-spazzata"), type: "slashing", amount: 7, secondaryTargetId: "imp" };
  const sweepOption = option(options(fighter(["attacco-con-spazzata"])), MANEUVER("attacco-con-spazzata"));
  assert.deepEqual([sweepOption.damage, sweepOption.dice, sweepOption.secondary.targetDamage], [false, "1d10", false]);
  const result = plan(fighter(["attacco-con-spazzata"]), [sweep], { secondaryItem: imp() });
  assert.equal(result.change.afterHP, 31, "the target takes only the weapon");
  assert.deepEqual([result.secondaryChange.hp, result.secondaryChange.afterHP], [12, 5]);
  assert.deepEqual(result.operations.find((operation) => operation.type === "hp:set").updates.map((update) => [update.itemId, update.hp]), [["ghoul", 31], ["imp", 5]]);
  assert.deepEqual(result.causality.activations[0].secondary, { targetId: "imp", name: "Imp" });
  assert.deepEqual(result.causality.targets.map((target) => [target.id, target.outcome]), [["ghoul", "hit"], ["imp", "secondary"]]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["guerriero-dadi-superiorita"].current, 4);
  assert.throws(() => plan(fighter(["attacco-con-spazzata"]), [{ ...sweep, secondaryTargetId: "" }]), /scegli la seconda creatura/);
  assert.throws(() => plan(fighter(["attacco-con-spazzata"]), [{ ...sweep, secondaryTargetId: "ghoul" }], { secondaryItem: ghoul() }), /un'altra creatura/);
  const preview = (activations, secondaryItem) => pcAttackPreview({ action: sword, sourceItem: fighter(["attacco-con-spazzata"]), targetItem: ghoul(),
    outcome: "hit", amounts: { c1: "9" }, turnState: ownTurn, activations, secondaryItem });
  assert.equal(preview([{ ...sweep, secondaryTargetId: "" }]).blocker, "Attacco con Spazzata: scegli la seconda creatura.");
  const ready = preview([sweep], imp());
  assert.deepEqual([ready.ready, ready.total, ready.secondary.total, ready.secondary.hp.after], [true, 9, 7, 5]);
});

test("Slashing Flourish: one roll of the bardic die damages the target and the second creature", () => {
  const tagliente = "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-tagliente";
  const bard = actor("bardo", 6, ["bardo-collegio-delle-spade-virtuosismo-della-lama", tagliente], {}, "bardo-collegio-delle-spade");
  const result = plan(bard, [{ id: tagliente, type: "slashing", amount: 5, secondaryTargetId: "imp" }], { secondaryItem: imp() });
  assert.equal(result.change.afterHP, 26);
  assert.equal(result.secondaryChange.afterHP, 7);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["bardo-ispirazione-bardica-usi"].current, 3);
});

test("Wails from the Grave: half the Sneak Attack dice, necrotic, only with Sneak Attack on the rogue's turn", () => {
  const wails = "ladro-fantasma-lamenti-dalla-tomba";
  const rogue = actor("ladro", 9, ["ladro-attacco-furtivo", wails], {}, "ladro-fantasma");
  assert.equal(option(options(rogue), wails).reason, "Solo insieme a Attacco Furtivo.");
  const sneak = { id: "ladro-attacco-furtivo", type: "slashing", amount: 17 };
  const wailsOption = option(options(rogue, { riders: [sneak] }), wails);
  assert.deepEqual([wailsOption.available, wailsOption.dice, wailsOption.types], [true, "3d6", ["necrotic"]]);
  assert.equal(option(options(rogue, { riders: [sneak], turnState: ghoulTurn }), wails).reason, "Solo nel proprio turno.");
  const result = plan(rogue, [{ id: wails, type: "necrotic", amount: 10, secondaryTargetId: "imp" }], { riders: [sneak], secondaryItem: imp() });
  assert.deepEqual([result.change.afterHP, result.secondaryChange.afterHP], [14, 2]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["ladro-fantasma-lamenti-dalla-tomba-usi"].current, 3);
});

test("one second creature per attack: Green-Flame Blade and Sweeping Attack exclude each other", () => {
  const card = fighter(["attacco-con-spazzata"]).metadata[META].initiativeCard;
  const knight = creature("dars", "Dars", { initiativeCard: { ...card, characterBuild: [{ classId: "guerriero", level: 10, subclassId: "guerriero-maestro-di-battaglia" }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-lama-verdefiamma"] } }] } });
  assert.throws(() => plan(knight, [{ id: MANEUVER("attacco-con-spazzata"), type: "slashing", amount: 4, secondaryTargetId: "imp" }],
    { secondaryItem: imp(), weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 5, secondary: { targetId: "imp", amount: 6 } } }),
  /Una sola seconda creatura per attacco/);
});

test("Precision Attack and Guided Strike act on the roll: available on a miss, they spend the resource and add no damage", () => {
  const precise = { id: MANEUVER("attacco-preciso") };
  const preciseOption = option(options(fighter(["attacco-preciso"]), { outcome: "miss" }), MANEUVER("attacco-preciso"));
  assert.deepEqual([preciseOption.available, preciseOption.preRoll, preciseOption.rollBonus, preciseOption.damage], [true, true, "+1d10", false]);
  const missed = plan(fighter(["attacco-preciso"]), [precise], { outcome: "miss", componentAmounts: {} });
  assert.equal(missed.change, null);
  assert.equal(sourcePatch(missed)[CLASS_FEATURE_STATE_FIELD].value.resources["guerriero-dadi-superiorita"].current, 4);
  assert.equal(missed.causality.activations[0].rollBonus, "+1d10");
  // A maneuver per attack: Precision Attack excludes another maneuver on the same attack.
  assert.throws(() => plan(fighter(["attacco-preciso", "attacco-minaccioso"]), [precise, menacing("failed")]), /una manovra per attacco/);
  const guided = "paladino-giuramento-di-conquista-incanalare-divinita-colpo-guidato";
  const paladin = actor("paladino", 7, [guided], {}, "paladino-giuramento-di-conquista");
  const hit = plan(paladin, [{ id: guided }]);
  assert.equal(hit.causality.activations[0].rollBonus, "+10");
  assert.equal(sourcePatch(hit)[CLASS_FEATURE_STATE_FIELD].value.resources["paladino-incanalare-divinita-usi"].current, 0);
  assert.equal(option(options(paladin, { action: blast, spellId: "eldritch-blast" }), guided).available, true, "any attack roll");
  const lines = buildCombatLogPresentation(null, [{ category: "attack", payload: missed.options.history.payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.includes("Attivazione: Attacco Preciso · +1d10 al tiro per colpire · Dadi di Superiorità 5 → 4"), lines.join("\n"));
});

// 3B-2
const fist = { id: "fist", label: "Colpo senz'armi", kind: "attack", range: "melee", components: [{ type: "bludgeoning" }] };
const monkCard = (featureIds) => ({ initiativeCard: { characterBuild: [{ classId: "monaco", level: 17, subclassId: "monaco-via-della-mano-aperta" }],
  abilityModifiers: { str: 1, dex: 4, con: 2, int: 0, wis: 3, cha: 0 }, classFeaturesConfigured: true, enabledClassFeatureIds: featureIds, quickActions: [fist] } });
const OPEN_HAND = "monaco-via-della-mano-aperta-tecnica-della-mano-aperta";
const PALM = "monaco-via-della-mano-aperta-palmo-tremante";
const monk = (meta = {}) => creature("dars", "Kai", { ...monkCard([OPEN_HAND, PALM]), ...meta });
const punch = (sourceItem, activations, overrides = {}) => buildPcAttackMutation({ action: fist, sourceItem, targetItem: ghoul(), outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "punch", turnState: ownTurn, expectedDefenses: {}, activations, ...overrides });

test("Riposte: a maneuver for the reaction attack, never on the fighter's own turn", () => {
  const riposte = MANEUVER("replica");
  assert.equal(option(options(fighter(["replica"])), riposte).reason, "Solo come reazione, fuori dal proprio turno.");
  const result = plan(fighter(["replica"]), [{ id: riposte, type: "slashing", amount: 5 }], { turnState: ghoulTurn });
  assert.equal(result.change.afterHP, 26);
});

test("Open Hand Technique: the GM picks the effect; each has its own save; no reactions ends with the monk's next turn", () => {
  const openHand = option(pcAttackActivationOptions({ action: fist, sourceItem: monk(), targetItem: ghoul(), turnState: ownTurn }), OPEN_HAND);
  assert.deepEqual(openHand.choices.map((choice) => [choice.id, choice.save?.dc ?? null, choice.effect.label]),
    [["prone", 17, "Prono"], ["push", 17, "Spinto fino a 4,5 m lontano dal monaco."], ["no-reactions", null, "Niente reazioni"]]);
  assert.equal(openHand.hint, "Solo con gli attacchi della Raffica di Colpi.");
  assert.throws(() => punch(monk(), [{ id: OPEN_HAND }]), /scegli l'effetto/);
  assert.throws(() => punch(monk(), [{ id: OPEN_HAND, choice: "prone" }]), /scegli l'esito del tiro salvezza/);
  const prone = punch(monk(), [{ id: OPEN_HAND, choice: "prone", saveOutcome: "failed" }]);
  assert.equal(prone.operations.find((operation) => operation.type === "condition:add").conditionName, "Prono");
  assert.deepEqual(prone.causality.activations[0].choice, { id: "prone", label: "Prono" });
  assert.equal(punch(monk(), [{ id: OPEN_HAND, choice: "prone", saveOutcome: "passed" }]).operations.some((operation) => operation.type === "condition:add"), false);
  const pushed = punch(monk(), [{ id: OPEN_HAND, choice: "push", saveOutcome: "failed" }]);
  assert.deepEqual(pushed.causality.notes, ["Tecnica della Mano Aperta: Spinto fino a 4,5 m lontano dal monaco."]);
  const silenced = punch(monk(), [{ id: OPEN_HAND, choice: "no-reactions" }]).operations.find((operation) => operation.type === "condition:add");
  assert.equal(silenced.conditionName, "Niente reazioni");
  assert.deepEqual(silenced.options.expiry, { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn", actorId: "dars" });
  assert.equal(silenced.options.manualRemoval, false);
  const lines = buildCombatLogPresentation(null, [{ category: "attack", payload: prone.options.history.payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.includes("Attivazione: Tecnica della Mano Aperta (Prono) · TS Destrezza CD 17 fallito → Prono"), lines.join("\n"));
});

test("Inspiring Smite: with a Divine Smite, the total shared as temporary hit points in the same command", () => {
  const ISPIRATRICE = "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice";
  const paladin = creature("dars", "Aldric", { hp: 30, initiativeCard: { characterBuild: [{ classId: "paladino", level: 7, subclassId: "paladino-giuramento-di-gloria" }],
    abilityModifiers: MODS, classFeaturesConfigured: true, enabledClassFeatureIds: ["paladino-punizione-divina", ISPIRATRICE], quickActions: [sword] } });
  const mira = creature("mira", "Mira", { hp: 20, hpMax: 30 });
  const smite = { id: "paladino-punizione-divina", type: "radiant", amount: 9, slotLevel: 1 };
  assert.equal(option(options(paladin), ISPIRATRICE).reason, "Solo insieme a Punizione Divina.");
  const ready = option(options(paladin, { riders: [smite] }), ISPIRATRICE);
  assert.deepEqual([ready.available, ready.dice, ready.tempHp, ready.damage], [true, "2d8+7", true, false]);
  const request = { id: ISPIRATRICE, amount: 15, tempHp: [{ targetId: "dars", amount: 7 }, { targetId: "mira", amount: 8 }] };
  const items = [paladin, ghoul(), mira];
  const preview = (activation) => pcAttackPreview({ action: sword, sourceItem: paladin, targetItem: ghoul(), outcome: "hit", amounts: { c1: "8" },
    turnState: ownTurn, riders: [smite], activations: [activation], tempHpItems: items }).blocker;
  assert.equal(preview(request), "");
  assert.equal(preview({ ...request, amount: 10 }), "Punizione Ispiratrice: distribuiti 15 PF temporanei su 10.");
  assert.equal(preview({ ...request, tempHp: [{ targetId: "ghoul", amount: 5 }] }), "Punizione Ispiratrice: le creature colpite dall'attacco non ricevono PF temporanei.");
  assert.equal(preview({ ...request, tempHp: [{ targetId: "mira", amount: 5 }, { targetId: "mira", amount: 5 }] }), "Punizione Ispiratrice: la stessa creatura è indicata due volte.");
  assert.equal(preview({ ...request, tempHp: [{ targetId: "", amount: 5 }] }), "Punizione Ispiratrice: scegli chi riceve i PF temporanei.");
  const result = plan(paladin, [request], { riders: [smite], tempHpItems: items });
  assert.deepEqual(result.operations.find((operation) => operation.type === "hp:set").updates.map((update) => [update.itemId, update.hp, update.hpIntent.mode]),
    [["ghoul", 22, "damage"], ["dars", 37, "temp"], ["mira", 28, "temp"]]);
  assert.deepEqual(result.tempHpChanges.map((row) => [row.item.id, row.change.afterHP]), [["dars", 37], ["mira", 28]]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources["paladino-incanalare-divinita-usi"].current, 0);
  assert.equal(result.followUps.some((note) => note.startsWith("Punizione Ispiratrice")), false, "used here: no reminder");
  const lines = buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.some((line) => line.includes("PF temporanei 15: Aldric +7 (30 → 37), Mira +8 (20 → 28)")), lines.join("\n"));
});

test("Quivering Palm: the vibrations on a hit (3 Ki), then ending them apart: 0 HP, 10d10 necrotic or no effect", async () => {
  const { buildPcAttackQuiveringPalmMutation, pcAttackQuiveringPalm } = await import("../src/pcAttackCore.js");
  const hit = punch(monk(), [{ id: PALM }]);
  const pill = hit.operations.find((operation) => operation.type === "condition:add-instances").instancesByTarget.ghoul[0];
  assert.equal(pill.condition, "Palmo Tremante");
  const state = sourcePatch(hit)[CLASS_FEATURE_STATE_FIELD].value;
  assert.equal(state.resources["monaco-punti-ki"].current, 14);
  const palmMonk = monk({ [CLASS_FEATURE_STATE_FIELD]: state });
  const vibrating = (meta = {}) => creature("ghoul", "Ghoul", { conditions: [pill], ...meta });
  assert.equal(pcAttackQuiveringPalm(palmMonk, ghoul()), null, "no vibrations, nothing to end");
  assert.deepEqual(pcAttackQuiveringPalm(palmMonk, vibrating()), { instanceId: pill.id, dice: "10d10", dc: 17 });
  const end = (outcome, overrides = {}) => buildPcAttackQuiveringPalmMutation({ sourceItem: palmMonk, targetItem: vibrating(), outcome,
    attackInstanceId: "palm-end", turnState: ownTurn, expectedDefenses: {}, ...overrides });
  const failed = end("failed");
  assert.equal(failed.change.afterHP, 0);
  assert.deepEqual(failed.operations.map((operation) => operation.type), ["hp:set", "condition:remove-instances"]);
  assert.deepEqual(failed.operations[1].removals, [{ itemId: "ghoul", instanceId: pill.id }]);
  assert.equal(failed.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.instances.length, 0, "the active feature ends");
  const defenses = { resistances: ["necrotic"], immunities: [], vulnerabilities: [] };
  const passed = end("passed", { amount: 50, targetItem: vibrating({ initiativeCard: { damageDefenses: defenses } }), expectedDefenses: defenses });
  assert.deepEqual([passed.damageComponents[0].amount, passed.change.afterHP], [25, 15]);
  const none = end("none");
  assert.equal(none.change, null);
  assert.deepEqual(none.operations.map((operation) => operation.type), ["condition:remove-instances"]);
  assert.throws(() => end("passed"), /Inserisci i danni necrotici/);
  assert.throws(() => buildPcAttackQuiveringPalmMutation({ sourceItem: palmMonk, targetItem: ghoul(), outcome: "failed", attackInstanceId: "x" }), /non ha le vibrazioni/);
  const lines = (result) => buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines(failed).includes("Palmo Tremante: TS Costituzione CD 17 fallito → 0 PF"), lines(failed).join("\n"));
  assert.ok(lines(passed).includes("Palmo Tremante: TS Costituzione CD 17 superato → 10d10 (25 necrotici)"), lines(passed).join("\n"));
  assert.ok(lines(none).includes("Palmo Tremante: vibrazioni terminate senza effetto"));
});
