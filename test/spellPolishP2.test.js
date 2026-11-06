// Lotto P2 of docs/PIANO_POLISH_INCANTESIMI.md, on the 2014 texts: what the card hides, what the panel does not say, and the
// numbers that do not grow with the slot. Through the sweep's real cast where the panel and the Undo are involved.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { runSpellSweep, sweepCatalog, SWEEP_DAMAGE } = await import("../test-support/spellSweepHarness.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellSaveWorkflowRule } = await import("../src/spellSaveWorkflowRules.js");
const {
  spellCantripDamageHint,
  spellCastSaveAbility,
  spellSaveDamageFormula,
} = await import("../src/spellCastResolutionRules.js");
const {
  spellEffectPillLabel,
  spellEffectRemovableFromCard,
  spellEffectStandsAlone,
} = await import("../src/effectLabelCore.js");
const { __compactEffectItems } = await import("../src/initiativeCardCompact.js");
const { getEffectiveConditionInstances } = await import("../src/conditions.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellAreaRules } = await import("../src/spellAreaRules.js");
const { getSpellDefinition, getSpellSummaryParts, isSpellCastRecordOnly } = await import("../src/spells-srd.js");
const { spellTurnsLabel } = await import("../src/spellsPanelViewCore.js");

const START_HP = 40;
const records = await runSpellSweep();
const runsOf = (spellId) => ({
  failed: records.find((record) => record.id === spellId && record.outcome === "failed"),
  passed: records.find((record) => record.id === spellId && record.outcome === "passed"),
});

// D2: the card.
test("a spell's effect with no pill of its spell on the creature has a pill of its own", () => {
  const debuff = { condition: "Niente recupero PF", effectKind: "debuff", type: "automatic", spellId: "chill-touch" };
  assert.equal(spellEffectStandsAlone(debuff, []), true);
  const held = { condition: "Velocità dimezzata", effectKind: "debuff", type: "spell", parentEffectId: "zone-pill" };
  assert.equal(spellEffectStandsAlone(held, []), true, "the pill of the zone is on the caster");
  assert.equal(spellEffectStandsAlone(held, ["zone-pill"]), false, "the pill of the spell already names it");
});

test("difficult terrain always shows, even next to the pill of its spell (D2)", () => {
  const terrain = {
    condition: "Terreno difficile / Intralciare",
    effectKind: "debuff",
    type: "spell",
    parentEffectId: "zone-pill",
    mechanics: { movement: { category: "difficult-terrain", costMultiplier: 2 } },
  };
  assert.equal(spellEffectStandsAlone(terrain, ["zone-pill"]), true);
  assert.equal(spellEffectPillLabel(terrain.condition), "Terreno difficile", "the card is narrow, the tooltip keeps the rest");
});

test("monster actions, class features and untyped effects stay as they are", () => {
  for (const effect of [
    { condition: "Marchio", effectKind: "debuff", type: "automatic", effectId: "monster-action:mark" },
    { condition: "Ira", effectKind: "buff", type: "class-feature" },
    { condition: "Effetto orfano", effectKind: "debuff" },
    { condition: "Trattenuto", type: "spell", spellId: "entangle" },
  ]) {
    assert.equal(spellEffectStandsAlone(effect, []), false, effect.condition);
  }
});

test("the compact card shows the effect, with no × when leaving the area or ending the spell takes it away", () => {
  const zone = {
    id: "held",
    condition: "Velocità dimezzata",
    effectKind: "debuff",
    type: "spell",
    parentEffectId: "zone-pill",
    expiry: { mode: "manual" },
  };
  const own = {
    id: "own",
    condition: "Regressione mentale",
    effectKind: "debuff",
    type: "spell",
    spellId: "feeblemind",
    manualRemoval: true,
    expiry: { mode: "manual" },
  };
  const items = __compactEffectItems([zone, own], [], [], { formatConditionName: (name) => name });
  assert.equal(items.find((item) => item.instanceId === "held").kind, "debuff");
  assert.equal(items.find((item) => item.instanceId === "held").fixed, true);
  assert.equal(items.find((item) => item.instanceId === "own").fixed, undefined);
  assert.equal(spellEffectRemovableFromCard(zone), false);
  assert.equal(spellEffectRemovableFromCard(own), true);
  // Inside the pill of the spell on the same creature, as before.
  const inside = __compactEffectItems(
    [zone],
    [{ name: "Zona", instanceId: "zone-pill" }],
    [],
    { formatConditionName: (name) => name },
  );
  assert.equal(inside.some((item) => item.instanceId === "held"), false);
});

test("the card reads normalized conditions: they keep the spell of an effect, or an attack's effect stays hidden", () => {
  const [effect] = getEffectiveConditionInstances({
    instances: [{
      id: "attack-effect",
      condition: "Niente recupero PF",
      effectKind: "debuff",
      type: "automatic",
      spellId: "chill-touch",
    }],
  });
  assert.equal(effect.spellId, "chill-touch");
  assert.equal(spellEffectStandsAlone(effect, []), true);
});

test("the sweep finds no spell effect left without a place on the card", () => {
  assert.deepEqual(records.filter((record) => record.hidden?.length).map((record) => record.id), []);
});

// The save that spares all the damage, and the expiry of an attack's effect.
for (const spellId of ["xanathar-coltello-di-ghiaccio", "xanathar-creare-falo"]) {
  test(`${spellId}: a passed save takes no damage, as its text says`, () => {
    const { failed, passed } = runsOf(spellId);
    // Ice Knife's target also takes the shard's hit: the failed run hits with it, the passed run misses.
    const hit = spellId === "xanathar-coltello-di-ghiaccio" ? SWEEP_DAMAGE : 0;
    assert.equal(START_HP - failed.hp.one, SWEEP_DAMAGE + hit);
    assert.equal(START_HP - passed.hp.one, 0);
  });
}

for (const [spellId, mode] of [["chill-touch", "turn-start"], ["ray-of-frost", "turn-start"], ["guiding-bolt", "turn-end"]]) {
  test(`${spellId}: from the panel its effect ends as the spell declares, and knows its spell`, () => {
    const { failed } = runsOf(spellId);
    const effect = failed.conditions.find((condition) => condition.item === "target-1");
    assert.equal(effect.expiry, mode);
    assert.equal(effect.spellId, spellId);
  });
}

// Targets with the slot.
const limitAt = (spellId, slotLevel) => buildSpellUnifiedPanelContract({
  spellId,
  phase: "cast",
  castContext: { slotLevel },
}).presentation.targeting.limit.maximum;

for (const [spellId, baseSlot, base] of [
  ["charm-person", 1, 1],
  ["longstrider", 1, 1],
  ["enhance-ability", 2, 1],
  ["fly", 3, 1],
  ["xanathar-incuti-paura", 1, 1],
  ["xanathar-charme-sui-mostri", 4, 1],
  ["tasha-fortezza-della-mente", 3, 1],
  ["xanathar-sonnellino", 3, 3],
  ["banishment", 4, 1],
]) {
  test(`${spellId}: one more target for each slot above the ${baseSlot}°`, () => {
    assert.equal(limitAt(spellId, baseSlot), base);
    assert.equal(limitAt(spellId, baseSlot + 2), base + 2);
  });
}

// The dice of the reminders.
for (const [spellId, dice, baseSlot, triggers] of [
  ["cloudkill", "5d8", 5, 2],
  ["flaming-sphere", "2d6", 2, 2],
  ["insect-plague", "4d10", 5, 2],
  ["moonbeam", "2d10", 2, 2],
  ["spirit-guardians", "3d8", 3, 2],
  ["wall-of-ice", "5d6", 6, 3],
  ["wall-of-thorns", "7d8", 6, 2],
]) {
  test(`${spellId}: the dice of its reminders grow with the slot`, () => {
    const found = getSpellAreaRules(spellId)
      .flatMap((rule) => [...(rule.zonePolicy?.triggers || []), ...(rule.triggerPolicy?.triggers || [])])
      .filter((trigger) => trigger.damage?.dice === dice);
    assert.equal(found.length, triggers);
    for (const trigger of found) {
      assert.equal(trigger.damage.baseSlot, baseSlot, trigger.id);
      assert.equal(trigger.damage.additionalPerSlotAbove, 1, trigger.id);
      assert.equal(trigger.resolutionData?.damage?.baseSlot, baseSlot, `${trigger.id}: what the reminder reads`);
    }
  });
}

// D3: which save.
test("every cast that asks for the outcome of a save says which save it is", () => {
  const silent = [...new Set(records
    .filter((record) => record.outcome === "failed" && record.askedSave && !record.castSave)
    .map((record) => record.id))];
  // Telekinesis asks for the outcome of a contest, not of a save. An attack asks for "Colpito" or "Mancato".
  assert.deepEqual(silent.sort(), ["phb2014-dardo-stregato", "ray-of-enfeeblement", "telekinesis"]);
});

test("the abilities of the panel come from one source each", () => {
  for (const spell of sweepCatalog()) {
    if (spellCastSaveAbility(spell.id)) {
      assert.equal(getSpellSaveWorkflowRule(spell.id)?.ability, undefined, `${spell.id}: already named by its workflow`);
    }
  }
  assert.equal(spellCastSaveAbility("fireball"), "dex");
  assert.equal(spellCastSaveAbility("sacred-flame"), "dex");
  assert.equal(spellCastSaveAbility("magic-missile"), "");
});

test("a prepared smite says its save when it resolves, not at the preparation", () => {
  const save = (phase) => buildSpellUnifiedPanelContract({
    spellId: "phb2014-colpo-intrappolante",
    phase,
    castContext: { slotLevel: 1 },
  }).presentation.outcomes.save?.ability;
  assert.equal(save("prepare"), undefined);
  assert.equal(save("resolve"), "str");
});

// D4: the formula.
test("the formula grows with the slot as the texts say, and keeps what does not grow", () => {
  for (const [spellId, slot, formula] of [
    ["fireball", 3, "8d6"],
    ["fireball", 5, "10d6"],
    ["circle-of-death", 8, "12d6"],
    ["wall-of-ice", 7, "12d6"],
    ["flame-strike", 6, "5d6+4d6"],
    ["ice-storm", 5, "3d8+4d6"],
    ["meteor-swarm", 9, "20d6+20d6"],
    ["sunburst", 9, "12d6"],
    ["guiding-bolt", 3, "6d6"],
    ["acid-arrow", 3, "5d4"],
    ["disintegrate", 8, "16d6+40"],
  ]) {
    assert.equal(spellSaveDamageFormula(spellId, "failed", slot), formula, `${spellId} al ${slot}°`);
    assert.equal(spellSaveDamageFormula(spellId, "passed", slot), formula, `${spellId}, TS superato`);
  }
});

test("the storm proposes the dice of its cast: the later rounds stay at the table", () => {
  assert.equal(spellSaveDamageFormula("storm-of-vengeance", "failed", 9), "2d6");
});

test("a cantrip says how its dice grow with the character's level", () => {
  assert.equal(spellSaveDamageFormula("xanathar-creare-falo", "failed", null), "1d8");
  assert.match(spellCantripDamageHint("xanathar-creare-falo"), /2d8.*3d8.*4d8/u);
  assert.match(spellCantripDamageHint("chill-touch"), /2d8.*3d8.*4d8/u);
  assert.equal(spellCantripDamageHint("fireball"), "");
});

test("mixed outcomes with different dice say the dice of each, and the footer shows it", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-debilitazione",
    phase: "cast",
    castContext: { slotLevel: 2 },
  });
  const session = createSpellPanelSession({
    contract,
    casterId: "caster",
    slotLevel: 2,
    targetIds: ["one", "two"],
    outcomes: { one: "failed", two: "passed" },
  });
  const field = buildUnifiedPanelViewModel({
    contract,
    session,
    casterOptions: [{ value: "caster", label: "Maga" }],
    targetCandidates: [{ key: "one", label: "Uno" }, { key: "two", label: "Due" }],
  }).effects.fields.find((candidate) => candidate.id === "damage");
  assert.equal(field.label, "Danno");
  assert.equal(field.hint, "TS superato: 2d8. TS fallito: 4d8.");
  // The panel draws only the footer's field: the hint has to be there.
  const footer = readFileSync(new URL("../src/spellUnifiedPanelEffectsView.js", import.meta.url), "utf8");
  assert.match(footer, /hint: field\.hint \|\| "",\n\s+invalid: field\.invalid,\n\s+className: "unified-review-effect-input"/u);
});

test("the target section says the save of the cast", () => {
  const view = readFileSync(new URL("../src/spellUnifiedPanelTargetView.js", import.meta.url), "utf8");
  assert.match(view, /"data-cast-save"/u);
  assert.match(view, /Tiro salvezza: \$\{castSaveLabel\}/u);
});

test("the panel's damage field proposes the dice on every cast of the sweep", () => {
  // The Tasha's Mind Whip of the legacy catalog has no text to read them from.
  const exempt = new Set(["legacy-tashas-mind-whip"]);
  const plain = [...new Set(records
    .filter((record) => record.damageLabel === "Danno" && !exempt.has(record.id))
    .map((record) => `${record.id}/${record.variant}`))];
  assert.deepEqual(plain, []);
  assert.equal(runsOf("fireball").failed.damageLabel, "Danno · 8d6");
  assert.match(runsOf("tasha-turbine-di-spade").failed.damageHint, /2d6/u);
});

// The small ones.
for (const spellId of ["xanathar-controllare-fiamme", "xanathar-modellare-acqua", "xanathar-modellare-terra"]) {
  test(`${spellId}: its cast is recorded, no Apply that leaves no trace`, () => {
    assert.equal(isSpellCastRecordOnly(spellId), true);
    assert.equal(buildSpellUnifiedPanelContract({ spellId }).execution.recordOnly, true);
  });
}

test("Punizione Esiliante: the extraplanar choice does not take the concentration away at the preparation", () => {
  const prepared = records.filter((record) => record.id === "phb2014-punizione-esiliante" && record.phase === "prepare");
  assert.ok(prepared.length > 0);
  for (const record of prepared) assert.equal(record.concentrating.length, 1, record.variant);
});

test("Trama ipnotica: the pill says the speed is 0", () => {
  assert.deepEqual(
    getSpellSummaryParts(getSpellDefinition("hypnotic-pattern")).map((part) => part.label),
    ["Vel 0"],
  );
});

test("a spell of concentration alone does not read «Durata non indicata»: it has its badge", () => {
  assert.equal(spellTurnsLabel([], [], true), "");
  assert.equal(spellTurnsLabel([], [], false), "Durata non indicata");
});

test("Dominare persone is a 5th level spell in the reference too", async () => {
  const { default: reference } = await import("../src/spell-reference-it.json", { with: { type: "json" } });
  const spells = reference.spells || reference;
  assert.equal(spells["dominate-person"].level, 5);
  assert.deepEqual(
    Object.entries(spells)
      .filter(([id, entry]) => getSpellDefinition(id) && Number(getSpellDefinition(id).level) !== Number(entry.level))
      .map(([id]) => id),
    [],
  );
});
