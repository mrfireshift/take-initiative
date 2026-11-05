// P4 of the spell polish, its last entry: the attack console and the spells of the monsters' sheets
// (docs/PIANO_POLISH_INCANTESIMI.md). What the bench found on stat blocks imported as the GM imports them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ID } from "../src/constants.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";
import { pcAttackPickerEntries } from "../src/pcAttackPickerCore.js";
import { buildPcAttackMutation, pcAttackPreview, pcAttackResolvedAction, pcAttackSpellBonusTags, pcAttackWeaponCantripIds,
  pcAttackActionPanelCantripIds, pcAttackActionWeaponCantripIds } from "../src/pcAttackCore.js";
import { damageDefensesForItem } from "../src/damageDefensesCore.js";
import { PC_ATTACK_SPELLS, getPcAttackSpell } from "../src/pcAttackSpellCatalog.js";
import { PC_ATTACK_CANTRIPS, getPcAttackCantrip } from "../src/pcAttackCantripCatalog.js";
import { spellbookActiveSpellIds, spellbookAttackAction, spellbookAttackActionFor, spellbookAttackWaitsForCast, spellbookCantripAttackAction,
  spellbookQuickAction, spellbookSpell } from "../src/spellbookCatalog.js";
import { isSpellbookAttackActionId, isSpellbookQuickAction, spellbookAttackActionId } from "../src/spellbookCore.js";
import { getSpellCatalog, getSpellDefinition } from "../src/spells-srd.js";
import { getSpellOverviewActions } from "../src/spellActiveActionCore.js";
import { normalizeSpellUnifiedActiveAction, spellUnifiedActiveActionPresentation } from "../src/spellUnifiedActiveAdapter.js";

const META = `${ID}/meta`;
const spell = (name) => `{@spell ${name}}`;
const mage = (spells) => ({
  name: "Mage", source: "MM", ac: [12], hp: { average: 40, formula: "9d8" }, int: 17,
  spellcasting: [{ name: "Spellcasting", type: "spellcasting", ability: "int",
    headerEntries: ["The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save {@dc 14}, {@hit 6} to hit with spell attacks). The mage has the following wizard spells prepared:"],
    spells }],
});
const importedSheet = (monster) => parseCharacterSheetImport(JSON.stringify(fiveToolsMonsterToStatblock(monster).block));
const CANTRIPS = spellbookAttackActionId("cantrip");
const SPELLS = spellbookAttackActionId("spell");
const book = (spellIds, extra = {}) => ({ spellIds, ...extra });
const modes = (card, options) => Object.fromEntries(pcAttackPickerEntries(card, options).filter((entry) => entry.spellId).map((entry) => [entry.spellId, entry.mode]));

test("l'azione costruita dal libro nomina i soli incantesimi del libro, come un'azione salvata a mano", () => {
  const card = { spellbook: book(["fire-bolt", "sacred-flame", "mage-hand", "guiding-bolt", "bless"]) };
  const tricks = spellbookAttackAction(card, CANTRIPS);
  const spells = spellbookAttackAction(card, SPELLS);
  assert.deepEqual([tricks.id, tricks.kind, tricks.source], [CANTRIPS, "attack", { kind: "cantrip", spellIds: ["fire-bolt", "sacred-flame"] }]);
  assert.deepEqual([spells.id, spells.kind, spells.source], [SPELLS, "attack", { kind: "spell", spellIds: ["guiding-bolt"] }]);
  assert.deepEqual(sanitizeQuickAction(tricks), tricks, "the sanitizer the runtime reads it with changes nothing");
  assert.equal(spellbookAttackAction({ spellbook: book(["mage-hand"]) }, CANTRIPS), null, "nothing to pick");
  assert.equal(spellbookAttackAction({}, SPELLS), null);
  assert.equal(spellbookAttackAction(card, "book-attack:other"), null);
});

test("il suo id non si confonde con quello di un incantesimo da lanciare", () => {
  assert.equal(isSpellbookAttackActionId(CANTRIPS), true);
  assert.equal(isSpellbookQuickAction({ id: CANTRIPS }), false);
  const launch = spellbookQuickAction("bless");
  assert.equal(isSpellbookQuickAction(launch), true);
  assert.equal(isSpellbookAttackActionId(launch.id), false);
  assert.equal(sanitizeQuickAction({ id: SPELLS, label: "x", kind: "attack", source: { kind: "spell" } }).id, SPELLS, "its colon survives the sanitizer");
});

test("solo ciò che il personaggio può lanciare oggi: un incantesimo non preparato resta fuori", () => {
  const cleric = { characterBuild: [{ classId: "chierico", level: 3 }], spellbook: book(["guiding-bolt", "inflict-wounds", "bless"], { unpreparedIds: ["inflict-wounds"] }) };
  assert.deepEqual(spellbookAttackAction(cleric, SPELLS).source.spellIds, ["guiding-bolt"]);
  assert.equal(spellbookAttackActionFor(cleric, "inflict-wounds"), null);
  assert.deepEqual(modes(cleric), { bless: "launch", "guiding-bolt": "attack" });
});

test("un PG senza azioni: gli incantesimi d'attacco del libro si risolvono in console, gli altri si lanciano", () => {
  const card = { characterBuild: [{ classId: "mago", level: 5 }],
    spellbook: book(["fire-bolt", "mage-hand", "xanathar-parola-radiosa", "magic-missile", "scorching-ray", "fireball"]) };
  const entries = pcAttackPickerEntries(card);
  assert.deepEqual(modes(card), { "fire-bolt": "attack", "mage-hand": "launch", "xanathar-parola-radiosa": "attack",
    "magic-missile": "attack", "scorching-ray": "attack", fireball: "launch" });
  const bolt = entries.find((entry) => entry.spellId === "fire-bolt");
  assert.deepEqual([bolt.actionId, bolt.tab, bolt.label], [CANTRIPS, "cantrips", "Dardo di fuoco"]);
  assert.equal(entries.find((entry) => entry.spellId === "magic-missile").actionId, SPELLS);
  assert.deepEqual(card.quickActions, undefined, "nothing is written on the card");
});

test("un mostro importato: lo statblock non scrive azioni e la console offre lo stesso i suoi incantesimi d'attacco", () => {
  const sheet = importedSheet(mage({
    0: { spells: [spell("fire bolt"), spell("light"), spell("shocking grasp")] },
    1: { slots: 4, spells: [spell("mage armor"), spell("magic missile")] },
    3: { slots: 3, spells: [spell("fireball")] },
  }));
  assert.equal(sheet.sections.attacks, undefined, "the import adds nothing to the Attacks");
  assert.deepEqual(modes({ characterBuild: sheet.sections.classes, spellbook: sheet.sections.spells }),
    { "fire-bolt": "attack", "shocking-grasp": "attack", light: "launch", "mage-armor": "launch", "magic-missile": "attack", fireball: "launch" });
});

test("un'azione salvata ha la precedenza; ciò che non elenca del libro va comunque in console", () => {
  const own = { id: "own", label: "Trucchetti", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } };
  const card = { quickActions: [own], spellbook: book(["fire-bolt", "ray-of-frost"]) };
  const entries = pcAttackPickerEntries(card);
  assert.equal(entries.find((entry) => entry.spellId === "fire-bolt").actionId, "own");
  assert.equal(entries.find((entry) => entry.spellId === "ray-of-frost").actionId, CANTRIPS);
  assert.equal(spellbookAttackActionFor(card, "fire-bolt").id, "own");
  assert.equal(spellbookAttackActionFor(card, "ray-of-frost").id, CANTRIPS);
  const every = { ...own, source: { kind: "cantrip" } };
  assert.equal(spellbookAttackActionFor({ quickActions: [every], spellbook: book(["ray-of-frost"]) }, "ray-of-frost").id, "own");
});

test("una lista dell'azione resta anche fuori dal libro: un trucchetto da specie o talento", () => {
  const card = { quickActions: [{ id: "drow", label: "Specie", kind: "attack", source: { kind: "cantrip", spellIds: ["ray-of-frost"] } }], spellbook: book(["fire-bolt"]) };
  const entries = pcAttackPickerEntries(card);
  assert.equal(entries.find((entry) => entry.spellId === "fire-bolt").actionId, CANTRIPS);
  assert.equal(entries.find((entry) => entry.spellId === "ray-of-frost").actionId, "drow");
});

test("Creare Falò è del pannello, anche con un'azione che offre tutti i trucchetti: Lancia non torna alla console", () => {
  const every = { id: "tricks", label: "Trucchetti", kind: "attack", source: { kind: "cantrip" } };
  const card = { quickActions: [every], spellbook: book(["xanathar-creare-falo", "fire-bolt"]) };
  assert.equal(spellbookCantripAttackAction([every], "xanathar-creare-falo"), null);
  assert.equal(spellbookAttackActionFor(card, "xanathar-creare-falo"), null);
  assert.equal(spellbookSpell("xanathar-creare-falo").attackCantrip, false);
  const entry = pcAttackPickerEntries(card).find((row) => row.spellId === "xanathar-creare-falo");
  assert.deepEqual([entry.mode, entry.actionId], ["launch", "book:xanathar-creare-falo"]);
  assert.deepEqual(spellbookAttackAction({ spellbook: book(["xanathar-creare-falo", "fire-bolt"]) }, CANTRIPS).source.spellIds, ["fire-bolt"]);
  assert.equal(spellbookAttackAction({ spellbook: book(["xanathar-creare-falo"]) }, CANTRIPS), null);
});

test("il listener del tracker chiede il lancio senza riaprire la console", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(source, /async function __runTrackerQuickAction\(sourceEntry, action, \{ fromConsole = false \} = \{\}\)/u);
  assert.match(source, /const cantripAttack = !fromConsole && isSpellbookQuickAction\(action\)/u);
  assert.match(source, /await __runTrackerQuickAction\(sourceEntry, action, \{ fromConsole: true \}\)/u);
});

test("Lama Roboante nel libro senza azioni: l'attacco con arma da mischia la offre, come dice la console", () => {
  const sword = sanitizeQuickAction({ id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8" }] });
  const bow = sanitizeQuickAction({ id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8" }] });
  const card = { quickActions: [sword, bow], spellbook: book(["tasha-lama-roboante", "fire-bolt"]) };
  assert.deepEqual(pcAttackWeaponCantripIds(sword, card), ["tasha-lama-roboante"]);
  assert.deepEqual(pcAttackWeaponCantripIds(bow, card), [], "a melee weapon only");
  assert.deepEqual(pcAttackWeaponCantripIds(sword, { quickActions: [sword] }), []);
  assert.equal(modes(card)["tasha-lama-roboante"], "weapon");
  assert.deepEqual(spellbookAttackAction({ spellbook: book(["tasha-lama-roboante"]) }, CANTRIPS), null, "not picked on its own");
});

test("con un libro le note tacciono: ogni trucchetto ha la sua riga, che dice come si lancia", () => {
  const every = sanitizeQuickAction({ id: "tricks", label: "Trucchetti", kind: "attack", source: { kind: "cantrip" } });
  assert.deepEqual(pcAttackActionWeaponCantripIds(every, { spellbook: book(["fire-bolt"]) }), []);
  assert.deepEqual(pcAttackActionPanelCantripIds(every, { spellbook: book(["fire-bolt"]) }), []);
  assert.deepEqual(pcAttackActionWeaponCantripIds(every, { spellbook: book(["tasha-lama-verdefiamma"]) }), []);
  assert.deepEqual(pcAttackActionPanelCantripIds(every, { spellbook: book(["xanathar-creare-falo"]) }), []);
  assert.equal(pcAttackActionWeaponCantripIds(every).length, 2, "without a book: every one");
  assert.equal(pcAttackActionPanelCantripIds(every).length, 1, "without a book: every one");
  const named = sanitizeQuickAction({ id: "named", label: "Trucchetti", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-lama-roboante"] } });
  assert.deepEqual(pcAttackActionWeaponCantripIds(named, { spellbook: book(["fire-bolt"]) }), ["tasha-lama-roboante"], "what an action names stays");
});

test("Tocco del vampiro: Lancia finché non è attivo, poi la console registra i tocchi", () => {
  const spells = { id: "spells", label: "Incantesimi", kind: "attack", source: { kind: "spell" } };
  const concentration = { [`${ID}/concentration`]: { tocco: { spellId: "vampiric-touch", instanceId: "vt" } } };
  assert.deepEqual(spellbookActiveSpellIds(concentration), ["vampiric-touch"]);
  assert.deepEqual(spellbookActiveSpellIds({}), []);
  assert.equal(spellbookAttackWaitsForCast("vampiric-touch", []), true);
  assert.equal(spellbookAttackWaitsForCast("vampiric-touch", ["vampiric-touch"]), false);
  assert.equal(spellbookAttackWaitsForCast("guiding-bolt", []), false);
  const noAction = { spellbook: book(["vampiric-touch", "guiding-bolt"]) };
  for (const card of [noAction, { ...noAction, quickActions: [spells] }]) {
    const waiting = pcAttackPickerEntries(card).find((entry) => entry.spellId === "vampiric-touch");
    assert.deepEqual([waiting.mode, waiting.actionId], ["launch", "book:vampiric-touch"]);
    const active = pcAttackPickerEntries(card, { activeSpellIds: ["vampiric-touch"] }).find((entry) => entry.spellId === "vampiric-touch");
    assert.equal(active.mode, "attack");
    assert.equal(pcAttackPickerEntries(card).find((entry) => entry.spellId === "guiding-bolt").mode, "attack");
  }
});

test("le tabelle della console e il libro parlano degli stessi incantesimi", () => {
  const ids = [...PC_ATTACK_CANTRIPS.map((entry) => entry.spellId), ...PC_ATTACK_SPELLS.map((entry) => entry.spellId)];
  const card = { spellbook: book(ids) };
  const offered = new Set([...spellbookAttackAction(card, CANTRIPS).source.spellIds, ...spellbookAttackAction(card, SPELLS).source.spellIds]);
  assert.deepEqual(ids.filter((id) => !offered.has(id)).sort(), ["tasha-lama-roboante", "tasha-lama-verdefiamma", "xanathar-creare-falo"]);
  const byMode = modes(card);
  assert.equal(byMode["xanathar-creare-falo"], "launch");
  assert.equal(byMode["tasha-lama-roboante"], "weapon");
  assert.equal(byMode["vampiric-touch"], "launch");
  assert.ok(ids.filter((id) => !["xanathar-creare-falo", "tasha-lama-roboante", "tasha-lama-verdefiamma", "vampiric-touch"].includes(id))
    .every((id) => byMode[id] === "attack"), JSON.stringify(byMode));
});

const cantrips = sanitizeQuickAction({ id: "tricks", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } });
const spells = sanitizeQuickAction({ id: "spells", label: "Incantesimi d'attacco", kind: "attack", source: { kind: "spell" } });

test("il tiro di un incantesimo dice il bonus della scheda; un TS, Dardo incantato o una scheda senza bonus no", () => {
  const tags = (action, spellId, card = { spellAttackBonus: 6 }) => pcAttackSpellBonusTags(pcAttackResolvedAction(action, spellId), card);
  assert.deepEqual(tags(cantrips, "fire-bolt"), ["+6 al tiro"]);
  assert.deepEqual(tags(spells, "guiding-bolt"), ["+6 al tiro"]);
  assert.deepEqual(tags(cantrips, "fire-bolt", { spellAttackBonus: -1 }), ["−1 al tiro"]);
  assert.deepEqual(tags(cantrips, "fire-bolt", { spellAttackBonus: 0 }), ["+0 al tiro"]);
  assert.deepEqual(tags(cantrips, "sacred-flame"), [], "a save");
  assert.deepEqual(tags(cantrips, "xanathar-rombo-di-tuono"), [], "an area with a save");
  assert.deepEqual(tags(spells, "magic-missile"), [], "no roll");
  assert.deepEqual(tags(cantrips, "fire-bolt", {}), []);
  assert.deepEqual(tags(cantrips, "fire-bolt", { spellAttackBonus: null }), [], "a card without the value");
  const sword = sanitizeQuickAction({ id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8" }] });
  assert.deepEqual(pcAttackSpellBonusTags(pcAttackResolvedAction(sword), { spellAttackBonus: 6 }), [], "a weapon is not a spell");
});

const creature = (id, meta = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const druid = creature("druid", { initiativeCard: { characterBuild: [{ classId: "druido", level: 5 }] } });
// A monster that resists piercing only from nonmagical weapons, as its import writes it.
const golem = creature("golem", { initiativeCard: { damageDefenses: { resistances: ["bludgeoning", "piercing", "slashing"] },
  monster: { source: "manual", nonmagicalDefenses: { types: ["bludgeoning", "piercing", "slashing"], except: ["silvered"] } } } });
const spear = sanitizeQuickAction({ id: "spear", label: "Lancia", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d6" }] });
const turnState = { round: 2, order: ["druid", "golem"], current: 0 };
const attack = (action, spellId, targetItem, extra = {}) => buildPcAttackMutation({ action, spellId, sourceItem: druid, targetItem, outcome: "hit", componentAmounts: { c1: 8 },
  attackInstanceId: "a1", expectedDefenses: damageDefensesForItem(targetItem, META), turnState, ...extra });
const preview = (action, spellId, targetItem, extra = {}) => pcAttackPreview({ action, spellId, sourceItem: druid, targetItem, outcome: "hit", amounts: { c1: "8" }, turnState, ...extra });

test("l'azione costruita dal libro registra come quella salvata: stesso conto, stesse difese", () => {
  const built = spellbookAttackAction({ spellbook: book(["phb2014-frusta-di-spine"]) }, CANTRIPS);
  assert.equal(attack(built, "phb2014-frusta-di-spine", golem).change.requested, 8);
  assert.equal(attack(cantrips, "phb2014-frusta-di-spine", golem).change.requested, 8);
  const plan = attack(built, "phb2014-frusta-di-spine", creature("real", { initiativeCard: { damageDefenses: { resistances: ["piercing"] } } }));
  assert.equal(plan.change.requested, 4);
  assert.equal(plan.causality.cause.quickActionId, CANTRIPS);
  assert.equal(plan.causality.action.label, "Frusta di Spine", "the log names the spell, not the action");
});

test("un trucchetto è magico: la difesa contro le armi non magiche non lo dimezza e la console non la propone", () => {
  const view = preview(cantrips, "phb2014-frusta-di-spine", golem);
  assert.deepEqual([view.total, view.defenses, view.defenseCounts], [8, [], []]);
  assert.equal(attack(cantrips, "phb2014-frusta-di-spine", golem).change.requested, 8, "the commit agrees with the preview");
});

test("l'arma non magica resta dimezzata, con la sua pillola", () => {
  const view = preview(spear, "", golem);
  assert.equal(view.total, 4);
  assert.deepEqual(view.defenses.map((row) => [row.type, row.defense, !!row.nonmagical]), [["piercing", "resistance", true]]);
  assert.equal(attack(spear, "", golem).change.requested, 4);
  assert.equal(preview(spear, "", golem, { ignoredDefenses: ["piercing"] }).total, 8, "a magic weapon: the chip's click still ignores it");
});

test("una resistenza vera ai perforanti dimezza anche il trucchetto", () => {
  const real = creature("real", { initiativeCard: { damageDefenses: { resistances: ["piercing"] } } });
  const view = preview(cantrips, "phb2014-frusta-di-spine", real);
  assert.equal(view.total, 4);
  assert.equal(view.defenses.length, 1);
  assert.equal(attack(cantrips, "phb2014-frusta-di-spine", real).change.requested, 4);
});

test("le tabelle della console non hanno altri tipi fisici oltre alla Frusta di Spine", () => {
  // The only spell the defense against nonmagical weapons can touch: if another joins, it goes through the same rule.
  const physical = new Set(["bludgeoning", "piercing", "slashing"]);
  const ids = ["fire-bolt", "eldritch-blast", "chill-touch", "ray-of-frost", "shocking-grasp", "produce-flame", "xanathar-ferocia-primordiale", "sacred-flame",
    "vicious-mockery", "poison-spray", "acid-splash", "xanathar-rintocco-dei-morti", "xanathar-infestazione", "xanathar-morsa-del-gelo", "tasha-scheggia-della-mente",
    "tasha-lenza-elettrizzante", "xanathar-parola-radiosa", "xanathar-rombo-di-tuono", "tasha-turbine-di-spade"];
  for (const id of ids) assert.equal(physical.has(getPcAttackCantrip(id).type), false, id);
  assert.equal(getPcAttackCantrip("phb2014-frusta-di-spine").type, "piercing");
  for (const id of ["inflict-wounds", "guiding-bolt", "magic-missile", "scorching-ray", "vampiric-touch"]) assert.equal(physical.has(getPcAttackSpell(id).type), false, id);
  for (const id of ["phb2014-globo-cromatico", "xanathar-dardo-di-caos"]) assert.equal(getPcAttackSpell(id).types.some((type) => physical.has(type)), false, id);
});

test("Risolvi di un incantesimo preparato: si accende con un bersaglio, ora che un limite non dichiarato non vale zero", () => {
  const spell = getSpellDefinition("phb2014-punizione-tonante");
  const [resolve] = getSpellOverviewActions({ spell, castContext: { phase: "prepare", slotLevel: 1 }, casterId: "dars", targetIds: ["dars"], effectInstances: [] });
  assert.deepEqual([resolve.id, resolve.type, resolve.subjectMode, resolve.maxTargets], ["resolve-prepared", "resolve", "selected", undefined]);
  assert.equal("maxTargets" in normalizeSpellUnifiedActiveAction(resolve), false, "no limit is written when the action declares none");
  const state = (ids) => spellUnifiedActiveActionPresentation({ action: resolve, selectedTargetIds: ids });
  assert.equal(state([]).disabled, true, "it needs a creature");
  assert.equal(state(["goblin"]).disabled, false);
  assert.doesNotMatch(state(["goblin"]).title, /massimo/u);
  // A limit declared still holds, a zero included.
  const twoAtMost = { id: "a", type: "manual", subjectMode: "selected", requiresTargets: true, maxTargets: 2 };
  assert.equal(normalizeSpellUnifiedActiveAction(twoAtMost).maxTargets, 2);
  assert.equal(spellUnifiedActiveActionPresentation({ action: twoAtMost, selectedTargetIds: ["a", "b"] }).disabled, false);
  assert.equal(spellUnifiedActiveActionPresentation({ action: twoAtMost, selectedTargetIds: ["a", "b", "d"] }).disabled, true);
  assert.equal(normalizeSpellUnifiedActiveAction({ ...twoAtMost, maxTargets: 0 }).maxTargets, 0);
  assert.equal("maxTargets" in normalizeSpellUnifiedActiveAction({ ...twoAtMost, maxTargets: null }), false);
});

test("nessuna azione del catalogo chiede bersagli con un limite di zero: tutte possono accendersi", () => {
  const resolved = [];
  for (const spell of getSpellCatalog()) {
    for (const phase of ["prepare", "cast"]) {
      const actions = getSpellOverviewActions({ spell, castContext: { phase, slotLevel: spell.level || 1 }, casterId: "c", targetIds: ["c"], effectInstances: [],
        currentTurnKey: "t2", appliedAt: { turnKey: "t1", actorId: "c", round: 1 } });
      for (const action of actions.filter((entry) => entry.subjectMode === "selected" || entry.requiresTargets === true)) {
        const shown = spellUnifiedActiveActionPresentation({ action, selectedTargetIds: ["t"], choiceValue: action.choice?.options?.[0]?.value || "" });
        assert.doesNotMatch(shown.title || "", /massimo 0/u, `${spell.id}/${action.id}`);
        if (action.id === "resolve-prepared") {
          assert.equal(shown.disabled, false, spell.id);
          resolved.push(spell.id);
        }
      }
    }
  }
  assert.deepEqual([...new Set(resolved)].sort(), ["branding-smite", "phb2014-colpo-intrappolante", "phb2014-freccia-folgorante", "phb2014-punizione-accecante",
    "phb2014-punizione-collerica", "phb2014-punizione-demoralizzante", "phb2014-punizione-esiliante", "phb2014-punizione-incandescente", "phb2014-punizione-tonante",
    "phb2014-raffica-di-spine"], "the spells a popup at the token waits for");
});

test("nel pannello il pulsante di Risolvi dice che cosa aspetta", async () => {
  const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
  const { buildSpellUnifiedPanelContract, createSpellPanelSession, updateSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
  const spell = getSpellDefinition("phb2014-punizione-tonante");
  const castContext = { phase: "prepare", slotLevel: 1 };
  const actions = getSpellOverviewActions({ spell, castContext, casterId: "dars", targetIds: ["dars"], effectInstances: [] });
  const activeOverview = [{ key: "o", name: spell.name, casterName: "Dars", instanceId: "i1", targetIds: ["dars"], actions, context: { spellId: spell.id, casterId: "dars", castContext, instanceId: "i1" } }];
  const contract = buildSpellUnifiedPanelContract({ spellId: spell.id, phase: "prepare", actionId: "", castContext });
  let session = updateSpellPanelSession(createSpellPanelSession({ contract, casterId: "dars" }),
    { activeInstanceId: "i1", activeActionId: "resolve-prepared", activeActionState: { state: "selected", instanceId: "i1", actionId: "resolve-prepared" }, targetIds: [] });
  const button = () => buildUnifiedPanelViewModel({ contract, session, activeOverview }).active.primaryAction;
  assert.deepEqual([button().label, button().disabled], ["Seleziona il bersaglio sulla mappa", true]);
  session = updateSpellPanelSession(session, { targetIds: ["goblin"] });
  assert.deepEqual([button().label, button().disabled], ["Apri risoluzione", false]);
  session = updateSpellPanelSession(session, { activeActionState: { state: "opened", instanceId: "i1", actionId: "resolve-prepared" } });
  assert.deepEqual([button().label, button().disabled], ["Apri risoluzione", true], "the popup is open: not twice");
});

test("il pannello dice la CD accanto al TS del lancio", async () => {
  const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
  const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
  const contract = buildSpellUnifiedPanelContract({ spellId: "cone-of-cold" });
  const session = createSpellPanelSession({ contract, casterId: "mage" });
  const model = (castSaveDC) => buildUnifiedPanelViewModel({ contract, session, castSaveDC }).targets.outcomes.save;
  assert.equal(model(14).dc, 14);
  assert.equal(model(null).dc, undefined, "a caster without a DC on its sheet");
  assert.equal(model(14).label, model(null).label);
  const view = readFileSync(new URL("../src/spellUnifiedPanelTargetView.js", import.meta.url), "utf8");
  assert.match(view, /targets\.outcomes\.save\.dc \? ` \(CD \$\{targets\.outcomes\.save\.dc\}\)`/u);
});
