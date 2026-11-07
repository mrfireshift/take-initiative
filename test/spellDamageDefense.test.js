// The damage defenses in a spell's damage written by hand: the panel's cast and the ⚡ actions (docs/PIANO_POLISH_INCANTESIMI.md, P4).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The harness mocks the SDK: the executors import it.
await import("../test-support/spellSweepHarness.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract, changeSpellPanelSpell, createSpellPanelSession, updateSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { buildSpellUnifiedAreaCommand } = await import("../src/spellUnifiedAreaAdapter.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan, spellAreaCausality } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellResolutionAction, resolveSpellActiveResolutionDamage } = await import("../src/spellActiveResolutionCore.js");
const { getSpellActiveResolutionActions } = await import("../src/spellActiveResolutionRules.js");
const { buildReminderResolutionPlan, buildZoneTriggerReminderResolution, reminderDamageDefenseRows, reminderResolutionDamage } = await import("../src/reminderResolutionCore.js");
const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
const {
  SPELL_DAMAGE_TYPE_LEFT_TO_GM,
  magicalDamageDefensesForItem,
  spellActionDamageTypes,
  spellDamageAfterDefense,
  spellDamageDefenseApplied,
  spellDamageDefenseRows,
  spellDamageDefenseText,
  spellDamageDefenseTitle,
  spellDamagePartAfterDefense,
  spellDamagePartsDefenses,
  spellDamageTypes,
  spellPanelDamageTypes,
} = await import("../src/spellDamageDefenseCore.js");

const META = "com.thebigpicture.initiative/meta";
const register = JSON.parse(readFileSync(new URL("../data/spell-polish-register.json", import.meta.url), "utf8")).spells;

const creature = (id, card = {}, extra = {}) => ({
  id,
  name: id,
  type: "IMAGE",
  layer: "CHARACTER",
  position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, initiativeCard: card, ...extra } },
});
const RESISTS_COLD = { damageDefenses: { resistances: ["cold"] } };

test("ogni incantesimo con un campo danno dichiara il suo tipo, o dice perché resta al GM", () => {
  const undeclared = [];
  for (const { id } of register) {
    const level = Math.max(1, getSpellDefinition(id).level || 1);
    // Every variant too: Symbol and Transmute Rock deal damage in one only, and they had got away.
    const hasDamage = ["prepare", "cast", "resolve"].some((phase) => {
      const contract = (choiceValue) => buildSpellUnifiedPanelContract({ spellId: id, phase, choiceValue, castContext: { slotLevel: level } });
      const variants = (contract("")?.presentation?.variant?.options || []).map((option) => option.value);
      return ["", ...variants].some((choiceValue) => contract(choiceValue)?.presentation?.inputs?.damage?.visible === true);
    });
    if (hasDamage && !spellDamageTypes(id).length && !SPELL_DAMAGE_TYPE_LEFT_TO_GM[id]) undeclared.push(id);
  }
  assert.deepEqual(undeclared, []);
  assert.deepEqual([...spellDamageTypes("symbol")], ["necrotic"]);
  assert.deepEqual([...spellDamageTypes("xanathar-trasmutare-roccia")], ["bludgeoning"]);
});

test("una parte di danno con il suo tipo e il suo TS: il raggio, lo strato", () => {
  const part = (type, roll, factor) => ({ type, roll, factor, amount: Math.floor(roll * factor) });
  const fire = { resistances: ["fire"], immunities: [], vulnerabilities: [] };
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 1), fire).amount, 15);
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 0.5), fire).amount, 7, "31, metà per il TS, metà per la resistenza");
  assert.equal(spellDamagePartAfterDefense(part("acido", 31, 1), fire).amount, 31, "un altro tipo");
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 1), fire, ["fire"]).amount, 31, "ignorata");
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 0), fire).amount, 0, "Immune");
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 1), { immunities: ["fire"] }).amount, 0);
  assert.equal(spellDamagePartAfterDefense(part("fuoco", 31, 1), { vulnerabilities: ["fire"] }).amount, 62);
  const frozen = Object.freeze(part("fuoco", 31, 1));
  assert.equal(spellDamagePartAfterDefense(frozen, fire).amount, 15, "i piani sono congelati: ne fa una copia");
  assert.deepEqual(spellDamagePartsDefenses([
    spellDamagePartAfterDefense(part("fuoco", 31, 1), fire),
    spellDamagePartAfterDefense(part("fuoco", 10, 1), fire),
    spellDamagePartAfterDefense(part("acido", 10, 1), { resistances: ["acid"] }, ["acid"]),
    spellDamagePartAfterDefense(part("freddo", 10, 0), { resistances: ["cold"] }),
    part("veleno", 10, 1),
  ]), [{ type: "fire", defense: "resistance" }, { type: "acid", defense: "resistance", ignored: true }], "una riga per tipo, nessuna per chi non subisce nulla");
});

function sprayCommand({ ignoredDefenses } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "prismatic-spray", phase: "cast", castContext: { slotLevel: 7 } });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "prismatic-spray",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 7,
    targetIds: ["sera", "mira"],
    candidateTargetIds: ["sera", "mira"],
    outcomes: { sera: "failed", mira: "passed" },
    // Sera a red ray and the "special" 8: blue and orange. Mira a red ray.
    targetContexts: {
      sera: { ray: "8", rayA: "1", damageA: 30, rayB: "2", damageB: 20 },
      mira: { ray: "1", damage: 30 },
    },
    ...(ignoredDefenses ? { ignoredDefenses } : {}),
    placement: {
      status: "confirmed",
      spellId: "prismatic-spray",
      ruleId: "prismatic-spray:cast",
      casterId: "caster",
      sceneEpoch: 3,
      preview: { type: "cone", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: ["sera", "mira"], targetLocked: true },
    },
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
}

async function sprayPlan(options = {}) {
  const items = [
    creature("caster"),
    creature("sera", { damageDefenses: { resistances: ["fire"] } }),
    creature("mira", { damageDefenses: { resistances: ["fire"] } }),
  ];
  const plan = await buildSpellAreaResolutionExecutionPlan(sprayCommand(options), {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "spray-instance",
  });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  return plan;
}

test("Simbolo (Morte) e Trasmutare Roccia (fango che cade): il danno di una sola variante ha il suo chip", () => {
  for (const [spellId, phase, choiceValue, slotLevel, type, text] of [
    ["symbol", "resolve", "death", 7, "necrotic", "Res. necrotici: 20 → 10"],
    ["xanathar-trasmutare-roccia", "cast", "falling-mud", 5, "bludgeoning", "Res. contundenti: 20 → 10"],
  ]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase, choiceValue, castContext: { slotLevel } });
    assert.equal(contract.presentation.inputs.damage.visible, true, spellId);
    const session = createSpellPanelSession({ contract, casterId: "caster", phase, variant: choiceValue, targetIds: ["sera"], outcomes: { sera: "failed" }, hpValues: { damage: 20 } });
    const [row] = buildUnifiedPanelViewModel({ contract, session, targetCandidates: [{ key: "sera", label: "Sera", hp: 40, hpMax: 40, damageDefenses: { resistances: [type] } }] }).targets.candidates;
    assert.equal(row.hpPreview.afterHP, 30, spellId);
    assert.deepEqual(row.defenseChips.map((chip) => chip.text), [text], spellId);
  }
});

test("Spruzzo prismatico: la difesa conta raggio per raggio, ognuno col suo tipo e il suo TS", async () => {
  const plan = await sprayPlan();
  const entry = (id) => plan.entries.find((candidate) => candidate.item.id === id);
  assert.equal(entry("sera").change.requested, 35, "fuoco 30 → 15 con la resistenza, acido 20 pieno");
  assert.equal(entry("sera").change.afterHP, 5);
  assert.equal(entry("mira").change.requested, 7, "fuoco 30, metà per il TS, metà per la resistenza");
  assert.deepEqual(spellAreaCausality(plan).targets.find((target) => target.id === "sera").defenses, [{ type: "fire", defense: "resistance" }]);
  const ignored = await sprayPlan({ ignoredDefenses: { sera: ["fire"] } });
  assert.equal(ignored.entries.find((candidate) => candidate.item.id === "sera").change.requested, 50, "ignorata");
  assert.equal(ignored.entries.find((candidate) => candidate.item.id === "mira").change.requested, 7, "solo per Sera");
});

test("Spruzzo prismatico: il chip nasce con il raggio scelto e segue il danno scritto e il TS", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "prismatic-spray", phase: "cast", castContext: { slotLevel: 7 } });
  const row = (context, outcome = "failed", ignoredDefenses = {}) => {
    const session = createSpellPanelSession({ contract, casterId: "caster", targetIds: ["sera"], outcomes: { sera: outcome }, targetContext: { sera: context }, ignoredDefenses });
    return buildUnifiedPanelViewModel({ contract, session, targetCandidates: [{ key: "sera", label: "Sera", hp: 40, hpMax: 40, damageDefenses: { resistances: ["fire"] } }] }).targets.candidates[0];
  };
  assert.deepEqual(row({}).defenseChips, [], "nessun raggio ancora");
  assert.deepEqual(row({ ray: "1" }).defenseChips.map((chip) => chip.text), ["Res. fuoco"], "raggio scelto, danno da scrivere");
  assert.match(row({ ray: "1" }).defenseChips[0].title, /Sera ha resistenza ai danni da fuoco.*scrivilo intero/u);
  assert.deepEqual(row({ ray: "1", damage: 30 }).defenseChips.map((chip) => chip.text), ["Res. fuoco: 30 → 15"]);
  assert.deepEqual(row({ ray: "1", damage: 30 }, "passed").defenseChips.map((chip) => chip.text), ["Res. fuoco: 15 → 7"]);
  assert.deepEqual(row({ ray: "1", damage: 30 }, "immune").defenseChips, [], "nessun danno");
  assert.deepEqual(row({ ray: "2", damage: 30 }).defenseChips, [], "il raggio arancione è acido");
  assert.deepEqual(row({ ray: "6" }).defenseChips, [], "il raggio indaco non fa danni");
  assert.deepEqual(row({ ray: "8", rayA: "1", damageA: 20, rayB: "2", damageB: 20 }).defenseChips.map((chip) => chip.text), ["Res. fuoco: 20 → 10"]);
  const ignored = row({ ray: "1", damage: 30 }, "failed", { sera: ["fire"] }).defenseChips[0];
  assert.equal(ignored.ignored, true);
  assert.equal(ignored.text, "Res. fuoco");
});

test("il comando porta le difese ignorate anche quando non c'è un campo danno unico", () => {
  assert.deepEqual(sprayCommand({ ignoredDefenses: { sera: ["fire"], other: ["cold"] } }).hp.ignoredDefenses, { sera: ["fire"] });
  const contract = buildSpellUnifiedPanelContract({ spellId: "prismatic-spray", phase: "cast", castContext: { slotLevel: 7 } });
  const session = createSpellPanelSession({ contract, casterId: "caster", slotLevel: 7, targetIds: ["sera"], outcomes: { sera: "failed" },
    targetContext: { sera: { ray: "1", damage: 30 } }, ignoredDefenses: { sera: ["fire"] } });
  assert.deepEqual(buildSpellUnifiedAreaCommand({ contract, session, sceneEpoch: 3 }).hp?.ignoredDefenses, { sera: ["fire"] });
});

test("il tipo della tabella non contraddice il catalogo, che ha solo il primo tipo di un incantesimo", () => {
  for (const { id } of register) {
    const declared = spellDamageTypes(id);
    const catalog = getSpellDefinition(id).damageType;
    if (declared.length && catalog) assert.ok(declared.includes(catalog), `${id}: ${catalog}`);
  }
  assert.deepEqual([...spellDamageTypes("flame-strike")], ["fire", "radiant"]);
  assert.deepEqual([...spellDamageTypes("ice-storm")], ["bludgeoning", "cold"]);
  assert.deepEqual([...spellDamageTypes("meteor-swarm")], ["bludgeoning", "fire"]);
  assert.deepEqual([...spellDamageTypes("phb2014-onda-distruttiva")], ["thunder", "radiant", "necrotic"],
    "5d6 da tuono e 5d6 radiosi o necrotici, a scelta: due caselle (spellCastDamageParts)");
});

test("le azioni del ⚡ leggono il tipo dalla loro etichetta; un tipo scelto al lancio resta al GM", () => {
  assert.deepEqual(spellActionDamageTypes(getSpellResolutionAction("xanathar-investitura-del-ghiaccio", "ice-investiture-cone")), ["cold"]);
  assert.deepEqual(spellActionDamageTypes(getSpellResolutionAction("xanathar-drago-illusorio", "illusory-dragon-breath")), []);
  for (const spellId of ["call-lightning", "xanathar-corona-di-stelle", "arcane-hand", "phb2014-raffica-di-spine"]) {
    for (const action of getSpellActiveResolutionActions(spellId)) {
      if (action.damage) assert.equal(spellActionDamageTypes(action).length, 1, action.id);
    }
  }
});

test("il TS prima, la difesa dopo, con lo stesso arrotondamento delle console", () => {
  assert.equal(spellDamageAfterDefense(21, "full", "resistance"), 10);
  assert.equal(spellDamageAfterDefense(21, "half", "resistance"), 5);
  assert.equal(spellDamageAfterDefense(21, "half", "vulnerability"), 20);
  assert.equal(spellDamageAfterDefense(21, "full", "immunity"), 0);
  assert.equal(spellDamageAfterDefense(21, "half", null), 10);
});

test("il chip dice il conto; due tipi in un numero restano al GM", () => {
  const rows = spellDamageDefenseRows({ types: ["cold"], defenses: { resistances: ["cold"] } });
  assert.equal(spellDamageDefenseApplied(rows), "resistance");
  assert.equal(spellDamageDefenseText(rows[0], { before: 20, after: 10 }), "Res. freddo: 20 → 10");
  assert.equal(spellDamageDefenseText(rows[0]), "Res. freddo", "prima che il danno sia scritto, solo la difesa");
  const ignored = spellDamageDefenseRows({ types: ["cold"], defenses: { resistances: ["cold"] }, ignoredTypes: ["cold"] });
  assert.equal(spellDamageDefenseApplied(ignored), null);
  assert.equal(ignored[0].ignored, true);

  const mixed = spellDamageDefenseRows({ types: ["fire", "radiant"], defenses: { resistances: ["fire"] } });
  assert.equal(spellDamageDefenseApplied(mixed), null, "non si sa quanta parte è di fuoco");
  assert.equal(spellDamageDefenseText(mixed[0]), "Res. fuoco: al GM");
  assert.deepEqual(spellDamageDefenseRows({ types: ["cold"], defenses: { resistances: ["fire"] } }), []);
});

test("il tooltip dice di chi è la difesa e che cosa fa al numero", () => {
  const row = { type: "cold", defense: "resistance", ignored: false };
  const written = spellDamageDefenseTitle(row, { name: "Sera", before: 20, after: 10 });
  assert.match(written, /Sera ha resistenza ai danni da freddo/u);
  assert.match(written, /20 danni diventano 10/u);
  assert.match(written, /ignorare la resistenza in questo lancio/u);
  assert.match(spellDamageDefenseTitle(row, { name: "Sera" }), /sarà dimezzato, quindi scrivilo intero/u);
  assert.match(spellDamageDefenseTitle({ ...row, ignored: true }, { name: "Sera" }), /ignorata in questo lancio.*applicarla/u);
  assert.match(spellDamageDefenseTitle({ type: "necrotic", defense: "immunity" }, { name: "Sera", before: 8, after: 0 }), /è immune ai danni necrotici: 8 danni diventano 0/u);
  assert.match(spellDamageDefenseTitle({ type: "fire", defense: "vulnerability" }, { name: "Sera", before: 8, after: 16 }), /è vulnerabile ai danni da fuoco: 8 danni diventano 16/u);
  assert.match(spellDamageDefenseTitle({ type: "fire", defense: "resistance", manual: true }, { name: "Sera" }), /due tipi di danno in un solo numero.*scrivi il danno già ridotto/u);
});

test("le difese di un mostro limitate alle armi non magiche non valgono contro un incantesimo", () => {
  const monster = creature("golem", {
    damageDefenses: { resistances: ["bludgeoning", "piercing", "slashing", "cold"] },
    monster: { nonmagicalDefenses: { types: ["bludgeoning", "piercing", "slashing"] } },
  });
  assert.deepEqual(magicalDamageDefensesForItem(monster, META).resistances, ["cold"]);
  const pc = creature("mira", { damageDefenses: { resistances: ["bludgeoning"] } });
  assert.deepEqual(magicalDamageDefensesForItem(pc, META).resistances, ["bludgeoning"]);
  // An effect's defense counts as well (Absorb Elements, Fire Shield).
  const shielded = creature("sera", {}, { conditions: { version: 2, instances: [{ id: "a", active: true, mechanics: { damageDefenses: { resistances: ["fire"] } } }] } });
  assert.deepEqual(magicalDamageDefensesForItem(shielded, META).resistances, ["fire"]);
});

test("un'azione del ⚡ applica la difesa dopo il TS", () => {
  const action = getSpellResolutionAction("xanathar-investitura-del-ghiaccio", "ice-investiture-cone");
  const resolve = (outcome, defense) => resolveSpellActiveResolutionDamage({ action, slotLevel: 6, outcome, roll: 21, defense });
  assert.equal(resolve("failed", null).amount, 21);
  assert.equal(resolve("failed", "resistance").amount, 10);
  assert.equal(resolve("passed", "resistance").amount, 5);
  assert.equal(resolve("failed", "immunity").amount, 0);
  assert.equal(resolve("failed", "vulnerability").amount, 42);
  assert.equal(resolve("immune", "vulnerability").amount, 0);
});

function coneContract() {
  return buildSpellUnifiedPanelContract({ spellId: "cone-of-cold", phase: "cast", castContext: { slotLevel: 5 } });
}

function coneView({ outcomes, hpValues = { damage: 20 }, ignoredDefenses = {}, spellId = null }) {
  const contract = spellId ? buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: 5 } }) : coneContract();
  const session = createSpellPanelSession({ contract, casterId: "caster", targetIds: Object.keys(outcomes), outcomes, hpValues, ignoredDefenses });
  return buildUnifiedPanelViewModel({
    contract,
    session,
    targetCandidates: Object.keys(outcomes).map((key) => ({
      key,
      label: key,
      hp: 40,
      hpMax: 40,
      damageDefenses: key === "sera" ? { resistances: ["cold", "fire"] } : { resistances: [] },
    })),
  });
}

test("il pannello fa il conto nell'anteprima e mostra il chip sotto il bersaglio", () => {
  const view = coneView({ outcomes: { sera: "failed", mira: "failed" } });
  const row = (key) => view.targets.candidates.find((target) => target.key === key);
  assert.equal(row("sera").hpPreview.afterHP, 30, "la resistenza dimezza i 20 scritti");
  assert.equal(row("mira").hpPreview.afterHP, 20, "chi non resiste li prende tutti");
  assert.deepEqual(row("sera").defenseChips.map((chip) => chip.text), ["Res. freddo: 20 → 10"]);
  assert.match(row("sera").defenseChips[0].title, /sera ha resistenza ai danni da freddo: 20 danni diventano 10/u);
  assert.deepEqual(row("mira").defenseChips, []);
  assert.equal(coneView({ outcomes: { sera: "passed" } }).targets.candidates[0].hpPreview.afterHP, 35, "20, metà per il TS, metà per la resistenza");
  assert.deepEqual(coneView({ outcomes: { sera: "passed" } }).targets.candidates[0].defenseChips.map((chip) => chip.text), ["Res. freddo: 10 → 5"]);
});

test("il chip c'è già prima che il danno sia scritto, e un clic ignora la difesa", () => {
  const before = coneView({ outcomes: { sera: "failed" }, hpValues: {} }).targets.candidates[0];
  assert.deepEqual(before.defenseChips.map((chip) => chip.text), ["Res. freddo"]);
  assert.match(before.defenseChips[0].title, /scrivilo intero/u);
  const ignored = coneView({ outcomes: { sera: "failed" }, ignoredDefenses: { sera: ["cold"] } }).targets.candidates[0];
  assert.equal(ignored.hpPreview.afterHP, 20, "ignorata: 20 pieni");
  assert.equal(ignored.defenseChips[0].ignored, true);
  assert.deepEqual(ignored.defenseChips.map((chip) => chip.text), ["Res. freddo"]);
});

test("il chip sta accanto al nome, senza una riga sua, e resta attivo anche con la riga bloccata dalla sagoma", async () => {
  const { FakeNode } = await import("../test-support/fakeBossActionsDom.js");
  const { renderTargetMatrix } = await import("../src/spellUnifiedPanelTargetView.js");
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: () => new FakeNode(doc, "#text") };
  const view = coneView({ outcomes: { sera: "failed", mira: "failed" } });
  const locked = { ...view, targets: { ...view.targets, candidates: view.targets.candidates.map((target) => ({ ...target, disabled: true })) } };
  const toggles = [];
  const section = renderTargetMatrix(doc, locked, { onDefenseToggle: (key, type) => toggles.push([key, type]) });
  const beside = section.querySelectorAll(".unified-target-row__identity");
  assert.equal(beside.length, 1, "solo chi ha una difesa cambia struttura");
  assert.equal(beside[0].querySelectorAll(".unified-target-row__select").length, 1, "il nome");
  const [chip] = beside[0].querySelectorAll(".unified-target-row__defense");
  assert.equal(chip.textContent, "Res. freddo: 20 → 10");
  assert.match(chip.getAttribute("title"), /sera ha resistenza ai danni da freddo/u);
  assert.equal(chip.disabled, false);
  await chip.click();
  assert.deepEqual(toggles, [["sera", "cold"]]);
  assert.equal(section.querySelectorAll(".unified-target-row__select").length, 2, "la riga senza difese ha il suo nome com'era");
});

test("due tipi in un danno: una casella per tipo, e ognuna incontra la sua difesa (test/spellDamageParts.test.js)", () => {
  const [row] = coneView({ spellId: "flame-strike", outcomes: { sera: "failed" }, hpValues: { damage: 20, secondDamage: 10 } }).targets.candidates;
  assert.equal(row.hpPreview.afterHP, 40 - (10 + 10), "sera resiste al fuoco: 20 → 10; i radiosi interi");
  assert.deepEqual(row.defenseChips.map((chip) => chip.text), ["Res. fuoco: 20 → 10"]);
  assert.equal(row.defenseChips[0].manual, undefined);
});

test("la sessione conserva le difese ignorate e le dimentica cambiando incantesimo", () => {
  const contract = coneContract();
  const session = updateSpellPanelSession(createSpellPanelSession({ contract, casterId: "caster" }), { ignoredDefenses: { sera: ["cold"] } });
  assert.deepEqual(session.ignoredDefenses, { sera: ["cold"] });
  const fireball = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast", castContext: { slotLevel: 3 } });
  assert.deepEqual(changeSpellPanelSpell(session, fireball).ignoredDefenses, {});
});

async function conePlan({ ignoredDefenses = undefined, damageTypes = undefined, outcomes = { sera: "failed", mira: "failed", golem: "passed" } } = {}) {
  const contract = coneContract();
  const items = [
    creature("caster"),
    creature("sera", RESISTS_COLD),
    creature("mira"),
    creature("golem", { damageDefenses: { vulnerabilities: ["cold"] } }),
  ];
  const targetIds = Object.keys(outcomes);
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "cone-of-cold",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 5,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes,
    hp: { mode: "damage", amount: 20, ...(ignoredDefenses ? { ignoredDefenses } : {}), ...(damageTypes ? { damageTypes } : {}) },
    placement: {
      status: "confirmed",
      spellId: "cone-of-cold",
      ruleId: "cone-of-cold:cast",
      casterId: "caster",
      sceneEpoch: 3,
      preview: { type: "cone", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds, targetLocked: true },
    },
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "cone-instance",
  });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  return { command, plan };
}

test("il lancio applica le difese ai PF, ognuna per il suo bersaglio", async () => {
  const { plan } = await conePlan();
  const after = (id) => plan.entries.find((entry) => entry.item.id === id).change.afterHP;
  assert.equal(after("sera"), 30, "fallito, resiste: 20 → 10");
  assert.equal(after("mira"), 20, "fallito: 20");
  assert.equal(after("golem"), 20, "superato e vulnerabile: 10 → 20");
  const sera = plan.entries.find((entry) => entry.item.id === "sera").change;
  assert.equal(sera.requested, 10);
  assert.equal(sera.factor, "full", "il fattore resta quello dell'esito");
  assert.equal(plan.entries.find((entry) => entry.item.id === "golem").change.factor, "half");
});

test("il registro di combattimento dice quale difesa ha contato o è stata ignorata", async () => {
  const defensesOf = (plan, id) => spellAreaCausality(plan).targets.find((target) => target.id === id).defenses;
  const { plan } = await conePlan();
  assert.deepEqual(defensesOf(plan, "sera"), [{ type: "cold", defense: "resistance" }]);
  assert.deepEqual(defensesOf(plan, "golem"), [{ type: "cold", defense: "vulnerability" }]);
  assert.equal(defensesOf(plan, "mira"), undefined);
  const { plan: ignored } = await conePlan({ ignoredDefenses: { sera: ["cold"] } });
  assert.deepEqual(defensesOf(ignored, "sera"), [{ type: "cold", defense: "resistance", ignored: true }]);
});

test("una difesa ignorata non conta, e il comando la tiene solo per i bersagli del lancio", async () => {
  const { plan, command } = await conePlan({ ignoredDefenses: { sera: ["cold"], other: ["fire"] } });
  assert.deepEqual(command.hp.ignoredDefenses, { sera: ["cold"] });
  assert.equal(plan.entries.find((entry) => entry.item.id === "sera").change.afterHP, 20);
  const { command: plain } = await conePlan();
  assert.equal("ignoredDefenses" in plain.hp, false);
});

test("un immune non subisce danni e un esito Immune non cerca difese", async () => {
  const { plan } = await conePlan({ outcomes: { sera: "immune", mira: "failed" } });
  assert.equal(plan.entries.some((entry) => entry.item.id === "sera"), false, "nessuna modifica ai PF");
});

function reminderPlan({ damage = { dice: "1d6", type: "fuoco", onSave: "half" }, resolutionKind = "manual-save", outcome = "failed", roll = 9, card = { damageDefenses: { resistances: ["fire"] } }, ignoredDefenses = [] } = {}) {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "activation",
      resolution: resolutionKind,
      ...(resolutionKind === "manual-save" ? { ability: "dex" } : {}),
      zoneItemId: "zone",
      targetIds: ["target"],
      turnKey: "turn-1",
      damage,
    },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  const items = [
    creature("target", card),
    creature("caster"),
    { id: "zone", name: "Zona", metadata: { [SPELL_STATIC_ZONE_META_KEY]: { triggerRuntime: { pending: [{ id: "activation", targetIds: ["target"] }] } } } },
  ];
  return {
    resolution,
    target: items[0],
    plan: buildReminderResolutionPlan({
      notice: { activationId: "activation", targets: [{ id: "target", name: "Target" }], resolution },
      items,
      outcome,
      damageRoll: roll,
      ignoredDefenses,
      sceneMetadata: { "com.thebigpicture.initiative/state": { round: 1, current: 0 } },
      now: 100,
    }),
  };
}

test("un promemoria di zona applica la difesa dopo il TS", () => {
  const failed = reminderPlan().plan;
  assert.equal(failed.status, "ready");
  assert.equal(failed.damage.amount, 4, "9 fuoco, resiste");
  assert.equal(failed.hpChange.after, 36);
  assert.equal(failed.metadataPatches[0].hpIntent.amount, 4, "la concentrazione e i TS contro la morte leggono il danno ridotto");
  assert.deepEqual(failed.damageDefenses, [{ type: "fire", defense: "resistance", ignored: false }]);
  assert.equal(reminderPlan({ outcome: "passed" }).plan.damage.amount, 2, "9, metà per il TS, metà per la resistenza");
  assert.equal(reminderPlan({ card: { damageDefenses: { vulnerabilities: ["fire"] } } }).plan.damage.amount, 18);
  const immune = reminderPlan({ card: { damageDefenses: { immunities: ["fire"] } } }).plan;
  assert.equal(immune.damage.amount, 0);
  assert.equal(immune.hpChange, null);
  assert.equal(reminderPlan({ card: {} }).plan.damage.amount, 9, "chi non ha difese prende tutto");
});

test("un promemoria: la difesa ignorata non conta, il danno senza TS passa dal chip, un tipo a scelta resta al GM", () => {
  const ignored = reminderPlan({ ignoredDefenses: ["fire"] }).plan;
  assert.equal(ignored.damage.amount, 9);
  assert.deepEqual(ignored.damageDefenses, [{ type: "fire", defense: "resistance", ignored: true }]);
  const direct = reminderPlan({ resolutionKind: "manual-effect", damage: { dice: "4d4", type: "taglienti", onSave: "none" }, outcome: "confirmed", card: { damageDefenses: { resistances: ["slashing"] } } }).plan;
  assert.equal(direct.damage.amount, 4);
  const chosen = reminderPlan({ damage: { dice: "3d8", type: "radiosi o necrotici", onSave: "half" }, card: { damageDefenses: { resistances: ["radiant"] } } });
  assert.equal(chosen.plan.damage.amount, 9);
  assert.deepEqual(reminderDamageDefenseRows({ resolution: chosen.resolution, target: chosen.target }), []);
  const noDamage = reminderPlan({ outcome: "immune" }).plan;
  assert.equal(noDamage.damage.amount, 0);
  assert.equal("damageDefenses" in noDamage, false, "nessun danno, nessuna riga nel registro");
});

test("un promemoria: senza difesa il conto è quello di sempre", () => {
  const resolution = { damage: { onFailed: "full", onPassed: "half", onImmune: "zero" } };
  assert.equal(reminderResolutionDamage(resolution, "failed", 9).amount, 9);
  assert.equal(reminderResolutionDamage(resolution, "passed", 9).amount, 4);
  assert.equal(reminderResolutionDamage(resolution, "immune", 9).amount, 0);
  assert.equal(reminderResolutionDamage(resolution, "failed", 9, "resistance").amount, 4);
});

test("un trigger di zona risolto dal pannello legge il tipo dal trigger", async () => {
  assert.deepEqual(spellPanelDamageTypes("moonbeam", { damage: { dice: "2d10", type: "radiosi" } }), ["radiant"]);
  assert.deepEqual([...spellPanelDamageTypes("cone-of-cold", null)], ["cold"]);
  assert.deepEqual(spellPanelDamageTypes("spirit-guardians", { damage: { dice: "3d8", type: "radiosi o necrotici" } }), []);
  const contract = buildSpellUnifiedPanelContract({ spellId: "cone-of-cold", phase: "cast", castContext: { slotLevel: 5 } });
  const session = createSpellPanelSession({ contract, casterId: "caster", targetIds: ["sera"], outcomes: { sera: "failed" }, hpValues: { damage: 20 },
    triggerRuntime: { damage: { dice: "1d6", type: "fuoco" } } });
  const [row] = buildUnifiedPanelViewModel({ contract, session, targetCandidates: [{ key: "sera", label: "Sera", hp: 40, hpMax: 40, damageDefenses: { resistances: ["fire"] } }] }).targets.candidates;
  assert.equal(row.hpPreview.afterHP, 30, "il fuoco del trigger, non il freddo dell'incantesimo");
  assert.deepEqual(row.defenseChips.map((chip) => chip.text), ["Res. fuoco: 20 → 10"]);
  const { plan } = await conePlan({ damageTypes: ["fire"] });
  assert.equal(plan.entries.find((entry) => entry.item.id === "sera").change.afterHP, 20, "Sera resiste al freddo, non al fuoco");
});

test("il comando dell'adattatore porta le difese ignorate dal pannello al lancio", () => {
  const contract = coneContract();
  const session = createSpellPanelSession({
    contract,
    casterId: "caster",
    slotLevel: 5,
    targetIds: ["sera"],
    outcomes: { sera: "failed" },
    hpValues: { damage: 20 },
    ignoredDefenses: { sera: ["cold"] },
  });
  const command = buildSpellUnifiedAreaCommand({ contract, session, sceneEpoch: 3 });
  assert.deepEqual(command?.hp?.ignoredDefenses, { sera: ["cold"] });
});

// F1 dell'audit dei popup viola: le punizioni hanno il loro tipo, come ogni altro incantesimo, e nessuna resta al GM.
test("le sette punizioni dichiarano il tipo del loro danno, letto dalle regole della risoluzione", async () => {
  const { getSpellCastPhasePlan } = await import("../src/spellCastPhaseCore.js");
  const { spellActionDamageTypes } = await import("../src/spellDamageDefenseCore.js");
  const smites = {
    "phb2014-punizione-tonante": "thunder",
    "phb2014-punizione-incandescente": "fire",
    "phb2014-punizione-collerica": "psychic",
    "phb2014-punizione-accecante": "radiant",
    "phb2014-punizione-demoralizzante": "psychic",
    "phb2014-punizione-esiliante": "force",
    "branding-smite": "radiant",
  };
  for (const [id, type] of Object.entries(smites)) {
    assert.deepEqual([...spellDamageTypes(id)], [type], id);
    assert.equal(SPELL_DAMAGE_TYPE_LEFT_TO_GM[id], undefined, `${id} non resta al GM`);
    const spell = getSpellDefinition(id);
    const bonus = getSpellCastPhasePlan(spell, "resolve", { slotLevel: spell.level || 1 })?.resolution?.mechanics?.damageBonus;
    assert.deepEqual(spellActionDamageTypes({ damage: { type: bonus?.type } }), [type], `${id}: il tipo delle regole`);
  }
  assert.equal(Object.keys(SPELL_DAMAGE_TYPE_LEFT_TO_GM).some((id) => /punizione|smite/.test(id)), false);
});
