import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackAreaMutation, buildPcAttackMutation, pcAttackActionPanelCantripIds, pcAttackActivationOptions, pcAttackAreaPreview,
  pcAttackCantripIds, pcAttackModeOptions, pcAttackNearbyIds, pcAttackPreview, pcAttackResolvedAction, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const ARROW = (slug) => `guerriero-arciere-arcano-tiro-arcano-freccia-${slug}`;
const POOL = "guerriero-arciere-arcano-tiro-arcano-usi";
const MODS = { str: 1, dex: 4, con: 2, int: 1, wis: 1, cha: 0 };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing" }] };
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, ...meta } } });
const archer = (level = 7, meta = {}) => creature("dars", "Dars", { initiativeCard: {
  characterBuild: [{ classId: "guerriero", level, subclassId: "guerriero-arciere-arcano" }], abilityModifiers: MODS, classFeaturesConfigured: true,
  enabledClassFeatureIds: ["guerriero-arciere-arcano-tiro-arcano", ...["esplosiva", "cercatrice", "perforante"].map(ARROW)], quickActions: [bow, sword] }, ...meta });
const wizard = (featureIds = [], level = 5) => creature("lyra", "Lyra", { initiativeCard: {
  characterBuild: [{ classId: "mago", level, subclassId: "mago-scuola-di-invocazione" }], abilityModifiers: MODS, classFeaturesConfigured: true,
  enabledClassFeatureIds: featureIds, spellSaveDC: 14, quickActions: [cantrips] } });
const imp = () => creature("imp", "Imp", { hp: 10, hpMax: 10 });
const orc = () => creature("orc", "Orco", { hp: 15, hpMax: 15 });
const ghoul = () => creature("ghoul", "Ghoul");
const ownTurn = { round: 2, order: ["dars", "lyra", "imp", "orc", "ghoul"], current: 0 };
const sourcePatch = (result) => result.options.metadataPatches[0].fields;
const logLines = (result) => buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0]
  .details.flatMap((section) => section.lines);
const hpOf = (result) => Object.fromEntries(result.operations.filter((operation) => operation.type === "hp:set")
  .flatMap((operation) => operation.updates.map((update) => [update.itemId, update.hp])));

test("3C catalog: the area cantrips resolve to an area around the caster; Create Bonfire stays in the spell panel", () => {
  assert.ok(["xanathar-parola-radiosa", "xanathar-rombo-di-tuono", "tasha-turbine-di-spade"].every((id) => pcAttackCantripIds(cantrips).includes(id)));
  assert.equal(pcAttackCantripIds(cantrips).includes("xanathar-creare-falo"), false);
  assert.deepEqual(pcAttackActionPanelCantripIds(cantrips), ["xanathar-creare-falo"]);
  assert.deepEqual(pcAttackResolvedAction(cantrips, "xanathar-parola-radiosa").area, { radiusFeet: 5, chosen: true });
  assert.deepEqual(pcAttackResolvedAction(cantrips, "tasha-turbine-di-spade").area, { radiusFeet: 5 });
});

test("the arrows that replace the attack roll: offered on a ranged weapon, with the Arcane Archer's DC and the arrow's die", () => {
  const modes = pcAttackModeOptions({ action: bow, sourceItem: archer(), turnState: ownTurn });
  assert.deepEqual(modes.map((mode) => [mode.id, mode.kind, mode.dice, mode.save.ability, mode.save.dc, mode.available]),
    [[ARROW("cercatrice"), "save", "1d6", "dex", 12, true], [ARROW("perforante"), "area", "1d6", "dex", 12, true]]);
  assert.deepEqual(pcAttackModeOptions({ action: bow, sourceItem: archer(18), turnState: ownTurn }).map((mode) => mode.dice), ["2d6", "2d6"]);
  assert.deepEqual(pcAttackModeOptions({ action: sword, sourceItem: archer(), turnState: ownTurn }), [], "a ranged weapon only");
  assert.deepEqual(pcAttackModeOptions({ action: cantrips, sourceItem: archer(), turnState: ownTurn }), []);
  // The modes are no on-hit activations: Bursting Arrow is.
  const activations = pcAttackActivationOptions({ action: bow, sourceItem: archer(), targetItem: ghoul(), turnState: ownTurn });
  assert.deepEqual(activations.map((option) => option.id), [ARROW("esplosiva")]);
  assert.deepEqual(activations[0].burst, { radiusFeet: 10 });
  // One Arcane Shot per turn: a used one blocks the modes too.
  const used = archer(7, { [PC_ATTACK_STATE_FIELD]: { version: 1, riderUses: [{ riderId: "group:tiro-arcano", turnKey: "2:0:dars" }] } });
  assert.match(pcAttackModeOptions({ action: bow, sourceItem: used, turnState: ownTurn })[0].reason, /Già usato in questo turno/);
});

test("Seeking Arrow: a Dexterity save instead of the attack roll, half on a success, a use of Arcane Shot spent", () => {
  const attack = pcAttackResolvedAction(bow, "", ARROW("cercatrice"));
  assert.deepEqual([attack.save, attack.saveHalf, attack.mode.kind, attack.area], ["dex", true, "save", undefined]);
  const plan = (outcome) => buildPcAttackMutation({ action: bow, sourceItem: archer(), targetItem: ghoul(), outcome, componentAmounts: { c1: 9 },
    attackMode: ARROW("cercatrice"), modeAmount: 4, attackInstanceId: "seek-1", turnState: ownTurn, expectedDefenses: {} });
  const failed = plan("failed");
  assert.equal(failed.change.afterHP, 7);
  assert.deepEqual(failed.damageComponents.map((component) => [component.id, component.amount]), [["c1", 9], [`a:${ARROW("cercatrice")}`, 4]]);
  assert.equal(sourcePatch(failed)[CLASS_FEATURE_STATE_FIELD].value.resources[POOL].current, 1);
  assert.deepEqual(sourcePatch(failed)[PC_ATTACK_STATE_FIELD].value.riderUses, [{ riderId: "group:tiro-arcano", turnKey: "2:0:dars" }]);
  const passed = plan("passed");
  assert.equal(passed.change.afterHP, 20 - passed.damageComponents.reduce((sum, component) => sum + component.amount, 0));
  assert.ok(passed.change.afterHP > failed.change.afterHP, "half the damage on a success");
  assert.throws(() => plan("hit"), /esito/i, "no attack roll with Seeking Arrow");
  assert.ok(logLines(failed).includes("Tiro: Freccia Cercatrice · TS Destrezza CD 12 al posto del tiro per colpire"), logLines(failed).join(" | "));
  const preview = pcAttackPreview({ action: bow, sourceItem: archer(), targetItem: ghoul(), outcome: "failed", amounts: { c1: "9" },
    attackMode: ARROW("cercatrice"), modeAmount: "", turnState: ownTurn });
  assert.equal(preview.ready, false, "the arrow's die is needed");
});

test("Bursting Arrow: the die hits the target and each creature kept around it, without a save; one command", () => {
  const result = buildPcAttackMutation({ action: bow, sourceItem: archer(), targetItem: ghoul(), outcome: "hit", componentAmounts: { c1: 9 },
    activations: [{ id: ARROW("esplosiva"), type: "force", amount: 7, burstTargetIds: ["imp", "orc"] }], burstItems: [imp(), orc()],
    attackInstanceId: "burst-1", turnState: ownTurn, expectedDefenses: {}, expectedBurstDefenses: {} });
  assert.deepEqual(hpOf(result), { ghoul: 4, imp: 3, orc: 8 });
  assert.deepEqual(result.burstChanges.map((row) => [row.item.id, row.change.afterHP]), [["imp", 3], ["orc", 8]]);
  assert.ok(logLines(result).some((line) => line.startsWith("Attivazione: Freccia Esplosiva") && line.includes("esplosione: Imp, Orco")), logLines(result).join(" | "));
  assert.throws(() => buildPcAttackMutation({ action: bow, sourceItem: archer(), targetItem: ghoul(), outcome: "hit", componentAmounts: { c1: 9 },
    activations: [{ id: ARROW("esplosiva"), type: "force", amount: 7, burstTargetIds: ["ghoul"] }], burstItems: [ghoul()],
    attackInstanceId: "burst-2", turnState: ownTurn, expectedDefenses: {} }), /bersaglio subisce già/);
});

test("the creatures near a token: edge-to-edge grid distance, never the centre", () => {
  const cell = (id, x, y) => ({ id, bounds: { min: { x: x * 100, y: y * 100 }, max: { x: x * 100 + 100, y: y * 100 + 100 }, width: 100, height: 100 } });
  const rows = [cell("lyra", 5, 5), cell("imp", 6, 5), cell("orc", 4, 4), cell("ghoul", 7, 5), cell("far", 9, 9)];
  assert.deepEqual(pcAttackNearbyIds({ centerId: "lyra", rows, dpi: 100, feetPerCell: 5, radiusFeet: 5 }), ["imp", "orc"]);
  assert.deepEqual(pcAttackNearbyIds({ centerId: "lyra", rows, dpi: 100, feetPerCell: 5, radiusFeet: 10 }), ["imp", "orc", "ghoul"]);
  assert.deepEqual(pcAttackNearbyIds({ centerId: "nobody", rows, dpi: 100, feetPerCell: 5, radiusFeet: 10 }), []);
});

test("an area cantrip: one roll, a save for each creature; nothing on a success, half with Potent Cantrip", () => {
  const members = [{ item: imp(), outcome: "failed" }, { item: orc(), outcome: "passed" }];
  const preview = pcAttackAreaPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(), members, amounts: { c1: "6" }, turnState: ownTurn });
  assert.deepEqual([preview.ready, preview.total, preview.rows.map((row) => [row.id, row.factor, row.total])],
    [true, 6, [["imp", "full", 6], ["orc", "zero", 0]]]);
  const potent = pcAttackAreaPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(["mago-scuola-di-invocazione-trucchetto-potente"], 6),
    members, amounts: { c1: "6" }, turnState: ownTurn });
  assert.deepEqual(potent.rows.map((row) => [row.id, row.factor, row.total]), [["imp", "full", 6], ["orc", "half", 3]]);
  const blockers = [
    pcAttackAreaPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(), members: [], amounts: { c1: "6" } }).blocker,
    pcAttackAreaPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(), members: [{ item: imp(), outcome: "" }], amounts: { c1: "6" } }).blocker,
    pcAttackAreaPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(), members, amounts: { c1: "" } }).blocker,
  ];
  assert.deepEqual(blockers, ["Scegli le creature dell'area.", "Scegli l'esito del tiro salvezza di ogni creatura.", "Inserisci il danno."]);
  // A single-target attack refuses an area.
  assert.equal(pcAttackPreview({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(), targetItem: imp(), outcome: "failed",
    amounts: { c1: "6" }, turnState: ownTurn }).blocker, "Attacco ad area: scegli le creature dell'area.");
});

test("the area mutation: each creature's HP, one History entry with the area and each save", () => {
  const result = buildPcAttackAreaMutation({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(),
    members: [{ item: imp(), outcome: "failed" }, { item: orc(), outcome: "passed" }], componentAmounts: { c1: 10 },
    attackInstanceId: "whirl-1", expectedDefenses: {}, turnState: ownTurn });
  assert.deepEqual(hpOf(result), { imp: 0 });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.outcome, row.factor, row.change.afterHP]), [["imp", "failed", "full", 0], ["orc", "passed", "zero", 15]]);
  assert.deepEqual(result.causality.area, { radiusFeet: 5, origin: "caster", count: 2 });
  assert.deepEqual(result.causality.save, { ability: "dex", dc: 14 });
  assert.equal(result.options.label, "Lyra: Turbine di Spade → 2 creature");
  assert.equal(sourcePatch(result)[PC_ATTACK_STATE_FIELD].value.lastAttack.outcome, "area");
  assert.throws(() => buildPcAttackAreaMutation({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(),
    members: [{ item: wizard(), outcome: "failed" }], componentAmounts: { c1: 10 }, attackInstanceId: "whirl-2", turnState: ownTurn }), /attaccante non è tra/);
  assert.throws(() => buildPcAttackAreaMutation({ action: cantrips, spellId: "tasha-turbine-di-spade", sourceItem: wizard(),
    members: [{ item: imp(), outcome: "failed" }, { item: imp(), outcome: "passed" }], componentAmounts: { c1: 10 }, attackInstanceId: "whirl-3", turnState: ownTurn }),
  /due volte/);
});

test("Piercing Arrow: a line ticked by hand, the weapon's damage plus the arrow's die, half on a success, a use spent", () => {
  const attack = pcAttackResolvedAction(bow, "", ARROW("perforante"));
  assert.deepEqual([attack.save, attack.saveHalf, attack.area], ["dex", true, { manual: true }]);
  const result = buildPcAttackAreaMutation({ action: bow, attackMode: ARROW("perforante"), sourceItem: archer(),
    members: [{ item: imp(), outcome: "failed" }, { item: orc(), outcome: "passed" }], componentAmounts: { c1: 8 }, modeAmount: 4,
    attackInstanceId: "pierce-1", expectedDefenses: {}, turnState: ownTurn });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.factor, row.change.afterHP]), [["imp", "full", 0], ["orc", "half", 9]]);
  assert.equal(sourcePatch(result)[CLASS_FEATURE_STATE_FIELD].value.resources[POOL].current, 1);
  assert.deepEqual(result.causality.area, { manual: true, count: 2 });
  assert.ok(logLines(result).includes("Area: 2 creature sulla linea"), logLines(result).join(" | "));
  assert.equal(result.options.label, "Dars: Arco lungo · Freccia Perforante → 2 creature");
  // Its die is needed.
  assert.equal(pcAttackAreaPreview({ action: bow, attackMode: ARROW("perforante"), sourceItem: archer(), members: [{ item: imp(), outcome: "failed" }],
    amounts: { c1: "8" }, modeAmount: "", turnState: ownTurn }).blocker, "Inserisci il danno di Freccia Perforante.");
});
