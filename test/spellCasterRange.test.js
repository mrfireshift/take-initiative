// The range from the caster on every spell that asks for targets (lot 3 of docs/PIANO_POLISH_INCANTESIMI.md): it comes from
// the range the spell's text gives, is measured at each cast, and leaves to the GM what the scene cannot measure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { spellTargetRangeMeters } from "../src/spellAreaCatalog.js";
import { SPELL_AREA_RANGE_RETRY_MS, spellAreaRangeRetry } from "../src/spellAreaPlacementCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { resolveChainLightningTargeting } from "../src/chainLightningTargetingCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  updateSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import {
  SPELL_UNIFIED_LIFECYCLE_STATUS,
  executeSpellUnifiedLifecycle,
} from "../src/spellUnifiedLifecycleAdapter.js";
import {
  getSpellAreaSpatialValidation,
  validateSpellAreaSceneSpatial,
  validateSpellCasterRange,
  validateSpellUnifiedTargetSelection,
} from "../src/spellUnifiedPanelSceneProvider.js";

const register = JSON.parse(readFileSync(new URL("../data/spell-polish-register.json", import.meta.url), "utf8"));
const contractOf = (spellId) => buildSpellUnifiedPanelContract({ spellId });

// A scene of one-cell tokens at a grid position: 150 px a cell, 1,5 m a cell.
function scene(positions, { unit = "m", multiplier = 1.5 } = {}) {
  const items = Object.keys(positions).map((id) => ({ id, name: id, layer: "CHARACTER", metadata: {} }));
  return {
    scene: {
      items: {
        getItems: async (ids) => items.filter((item) => !Array.isArray(ids) || ids.includes(item.id)),
        getItemBounds: async ([id]) => {
          const cell = positions[id];
          return cell ? { min: { x: cell[0] * 150, y: cell[1] * 150 }, max: { x: (cell[0] + 1) * 150, y: (cell[1] + 1) * 150 } } : null;
        },
      },
      grid: { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier, unit } }) },
    },
  };
}

test("la gittata dei bersagli viene dal testo dell'incantesimo", () => {
  const meters = (range) => spellTargetRangeMeters({ range });
  assert.equal(meters("60 feet"), 18);
  assert.equal(meters("18 metri"), 18);
  assert.equal(meters("Touch"), 1.5);
  assert.equal(meters("Contatto"), 1.5);
  assert.equal(meters("Incantatore (raggio di 4,5 metri)"), 4.5);
  assert.ok(meters("1 mile") > 1000);
  for (const range of ["Self", "Incantatore", "Incantatore (cono di 9 metri)", "Sight", "Vista", "Unlimited", "Illimitata", "Special", ""]) {
    assert.equal(meters(range), null, range);
  }
});

test("ogni incantesimo con bersagli e una gittata misurabile la controlla", () => {
  const unmeasured = [];
  const disagreeing = [];
  for (const { id } of register.spells) {
    const spell = getSpellDefinition(id);
    const targeting = contractOf(id).presentation.targeting;
    const meters = spellTargetRangeMeters(spell);
    if (targeting.mode !== "discrete") {
      assert.equal(targeting.casterRange, undefined, `${id}: its range is measured by the placement`);
      continue;
    }
    const spatial = targeting.spatialRules?.mode;
    if (spatial === "primary-and-secondary-range") continue;
    if (spatial === "caster-range") {
      // Catapulta: the 18 m are for the object, which flies 27 m more; the target is the creature it strikes.
      const expected = id === "xanathar-catapulta" ? 45 : meters;
      if (meters && targeting.spatialRules.maxMeters !== expected) disagreeing.push(`${id}: ${targeting.spatialRules.maxMeters} / ${spell.range}`);
      continue;
    }
    if (meters && targeting.casterRange?.maxMeters !== meters) unmeasured.push(id);
    if (!meters) assert.equal(targeting.casterRange, undefined, id);
  }
  assert.deepEqual(unmeasured, []);
  assert.deepEqual(disagreeing, []);
});

test("il controllo non è una regola spaziale: non chiede il caster e non manda il lancio rapido al pannello", () => {
  const targeting = contractOf("bless").presentation.targeting;
  assert.equal(targeting.casterRange.maxMeters, 9);
  assert.equal(targeting.spatialRules, null);
  assert.equal(contractOf("bless").presentation.caster.reasons.includes("targeting-spatial"), false);
  assert.equal(contractOf("shield").presentation.targeting.casterRange, undefined, "Self");
  assert.equal(contractOf("fireball").presentation.targeting.casterRange, undefined, "the area tool measures it");
  assert.equal(contractOf("sending").presentation.targeting.casterRange, undefined, "Unlimited");
});

test("Blocca persone controlla la gittata dal caster oltre alla distanza tra i bersagli", async () => {
  const contract = contractOf("hold-person");
  assert.equal(contract.presentation.targeting.spatialRules.mode, "pairwise-distance");
  const select = (cell) => validateSpellUnifiedTargetSelection(scene({ caster: [0, 0], target: cell }), {
    contract,
    session: { casterId: "caster" },
    targetIds: ["target"],
  });
  assert.deepEqual((await select([8, 8])).invalidDistanceTargetIds, [], "16,97 m");
  const beyond = await select([9, 9]);
  assert.deepEqual(beyond.invalidDistanceTargetIds, ["target"], "19,09 m");
  assert.deepEqual(beyond.errors, ["caster-range-exceeded"]);
});

test("il contatto raggiunge le caselle vicine, anche in diagonale, e non oltre", async () => {
  const contract = contractOf("cure-wounds");
  const check = (cell) => validateSpellCasterRange(scene({ caster: [5, 5], target: cell }), {
    contract,
    session: { casterId: "caster", targetIds: ["target"] },
  });
  assert.equal((await check([6, 5])).valid, true);
  assert.equal((await check([6, 6])).valid, true, "the diagonal");
  assert.equal((await check([5, 5])).valid, true, "the same space");
  const far = await check([7, 5]);
  assert.equal(far.valid, false);
  assert.deepEqual(far.invalidTargetIds, ["target"]);
});

test("il caster può sempre scegliere sé stesso, e su una scena in piedi la casella al bordo è dentro", async () => {
  const check = (cell, options) => validateSpellCasterRange(scene({ caster: [0, 0], target: cell }, options), {
    contract: contractOf("healing-word"),
    session: { casterId: "caster", targetIds: ["caster", "target"] },
  });
  assert.equal((await check([12, 0], { multiplier: 5, unit: "ft" })).valid, true, "12 squares are 60 ft");
  assert.deepEqual((await check([13, 0], { multiplier: 5, unit: "ft" })).invalidTargetIds, ["target"]);
});

test("ciò che la scena non sa misurare resta al GM", async () => {
  const contract = contractOf("healing-word");
  const obr = scene({ caster: [0, 0], target: [50, 0] });
  assert.equal((await validateSpellCasterRange(obr, { contract, session: { targetIds: ["target"] } })).valid, true, "no caster");
  assert.equal((await validateSpellCasterRange(obr, { contract, session: { casterId: "gone", targetIds: ["target"] } })).valid, true, "a caster not on the scene");
  assert.equal((await validateSpellCasterRange(obr, { contract, session: { casterId: "caster", targetIds: ["gone"] } })).valid, true, "a target not on the scene");
  assert.equal((await validateSpellCasterRange(obr, { contract: contractOf("sending"), session: { casterId: "caster", targetIds: ["target"] } })).valid, true, "Unlimited");
});

test("sulla corsia di area il controllo vale per il lancio, non per i trigger", async () => {
  const items = [{ id: "caster", layer: "CHARACTER" }, { id: "target", layer: "CHARACTER" }];
  const obr = scene({ caster: [0, 0], target: [40, 0] });
  const run = (spellId, kind, targetIds = ["target"]) => validateSpellAreaSceneSpatial(obr, {
    command: {
      source: { kind },
      spell: { spellId, casterId: "caster", slotLevel: 2 },
      targeting: { mode: "discrete", targetIds },
    },
    spell: getSpellDefinition(spellId),
    items,
    targetIds,
    caster: items[0],
  });
  assert.deepEqual((await run("suggestion", "cast")).errors, ["caster-range-exceeded"]);
  assert.deepEqual((await run("hold-person", "cast")).errors, ["caster-range-exceeded"], "beyond the range, with no second target to compare");
  assert.equal((await run("suggestion", "zone-trigger")).valid, true);
  assert.equal((await run("suggestion", "active-action")).valid, true);
});

test("la corsia lifecycle rifiuta il lancio fuori gittata senza applicare né spendere nulla", async () => {
  const contract = contractOf("bless");
  const session = createSpellPanelSession({ contract, casterId: "caster", targetIds: ["target"] });
  let executed = 0;
  const run = (validateCasterRange) => executeSpellUnifiedLifecycle({
    contract,
    session,
    runtime: {
      validateCasterRange,
      extraOperations: [{ type: "spell-slot" }],
      executor: async () => {
        executed += 1;
        return ["caster", "target"];
      },
    },
  });
  const refused = await run(async () => ({ valid: false, errors: ["caster-range-exceeded"], invalidTargetIds: ["target"] }));
  assert.equal(refused.status, SPELL_UNIFIED_LIFECYCLE_STATUS.REJECTED);
  assert.equal(refused.error.code, "caster-range-exceeded");
  assert.equal(executed, 0);

  assert.equal((await run(async () => ({ valid: true, errors: [], invalidTargetIds: [] }))).status, SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED);
  assert.equal(executed, 1);
  assert.equal((await run(async () => { throw new Error("scene read failed"); })).status, SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED, "a failed read stays with the GM");
  assert.equal((await run(undefined)).status, SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED);
});

// The exception, for what the map does not know (Distant Spell, Spell Sniper, a familiar's touch): the same target or point
// chosen again after its refusal. No button.
test("l'eccezione vale bersaglio per bersaglio: nella scelta, all'applicazione e sulle due corsie", async () => {
  const positions = { caster: [0, 0], far: [40, 0], other: [41, 0] };
  const select = (spellId, rangeOverrideIds = []) => validateSpellUnifiedTargetSelection(scene(positions), {
    contract: contractOf(spellId),
    session: { casterId: "caster", rangeOverrideIds },
    targetIds: ["far", "other"],
  });
  // With a rule that measures the targets from each other, and with one that measures them from the caster.
  for (const spellId of ["hold-person", "disintegrate"]) {
    assert.deepEqual((await select(spellId)).invalidDistanceTargetIds, ["far", "other"], spellId);
    assert.deepEqual((await select(spellId, ["far"])).invalidDistanceTargetIds, ["other"], spellId);
    assert.deepEqual((await select(spellId, ["far", "other"])).invalidDistanceTargetIds, [], spellId);
  }

  const lifecycle = await validateSpellCasterRange(scene(positions), {
    contract: contractOf("bless"),
    session: { casterId: "caster", targetIds: ["far"], rangeOverrideIds: ["far"] },
  });
  assert.equal(lifecycle.valid, true);

  const items = Object.keys(positions).map((id) => ({ id, layer: "CHARACTER" }));
  const area = (spellId, rangeOverrideIds) => validateSpellAreaSceneSpatial(scene(positions), {
    command: {
      source: { kind: "cast" },
      spell: { spellId, casterId: "caster", slotLevel: 6 },
      targeting: { mode: "discrete", targetIds: ["far"], ...(rangeOverrideIds ? { rangeOverrideIds } : {}) },
    },
    spell: getSpellDefinition(spellId),
    items,
    targetIds: ["far"],
    caster: items[0],
  });
  for (const spellId of ["suggestion", "disintegrate"]) {
    assert.deepEqual((await area(spellId)).errors, ["caster-range-exceeded"], spellId);
    assert.equal((await area(spellId, ["far"])).valid, true, spellId);
  }
});

test("il comando porta l'eccezione, e il tiro del lancio non rifiuta quel bersaglio", () => {
  const build = (rangeOverrideIds) => buildSpellAreaResolutionCommand({
    contract: contractOf("disintegrate"),
    spellId: "disintegrate",
    phase: "cast",
    casterId: "caster",
    slotLevel: 6,
    targetIds: ["far"],
    candidateTargetIds: ["far"],
    outcomes: { far: "failed" },
    hp: { mode: "damage", amount: 40 },
    casterDistancesMeters: { far: 60 },
    rangeOverrideIds,
    sceneEpoch: 4,
    currentSceneEpoch: 4,
  });
  assert.ok(build([]).errors.includes("caster-range-exceeded"));
  const excepted = build(["far"]);
  assert.equal(excepted.errors.includes("caster-range-exceeded"), false, excepted.errors.join(", "));
  assert.deepEqual(excepted.targeting.rangeOverrideIds, ["far"]);
});

test("Catena di fulmini: l'eccezione arriva al bersaglio primario, non ai 9 m da lui", () => {
  const resolve = (rangeOverrideIds) => resolveChainLightningTargeting({
    slotLevel: 6,
    primaryId: "primary",
    secondaryIds: ["secondary"],
    primaryDistanceMeters: 90,
    secondaryDistancesMeters: { secondary: 12 },
    rangeOverrideIds,
  });
  assert.deepEqual(resolve([]).errors, ["primary-out-of-range", "secondary-out-of-range"]);
  assert.deepEqual(resolve(["primary"]).errors, ["secondary-out-of-range"]);
  assert.deepEqual(resolve(["primary", "secondary"]).errors, ["secondary-out-of-range"]);
});

test("sulla mappa l'eccezione è un secondo tentativo sullo stesso punto, e il teletrasporto se la porta dietro", async () => {
  const refused = { origin: { x: 1000, y: 1000 }, at: 10000 };
  const retry = (x, y, now) => spellAreaRangeRetry(refused, { origin: { x, y }, dpi: 150, now });
  assert.equal(retry(1000, 1000, 10000 + SPELL_AREA_RANGE_RETRY_MS), true);
  assert.equal(retry(1000, 1000, 10000 + SPELL_AREA_RANGE_RETRY_MS - 1), false, "a double click is one gesture");
  assert.equal(retry(1070, 1000, 20000), true, "the same cell");
  assert.equal(retry(1075, 1000, 20000), false, "another cell");
  assert.equal(spellAreaRangeRetry(null, { origin: { x: 1000, y: 1000 }, dpi: 150, now: 20000 }), false, "the first try");

  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");
  assert.match(tool, /!inRange && !grantRangeException\(pointPlacementPosition\(state\), state\.dpi\)/u);
  assert.match(tool, /!inRange && !grantRangeException\(position, state\.dpi\)/u);
  assert.match(tool, /rangeOverride: true/u);

  const contract = contractOf("dimension-door");
  const preview = { type: "square", position: { x: 30000, y: 0 }, start: { x: 30000, y: 0 }, end: { x: 30150, y: 150 }, gridOrigin: { x: 0, y: 0 }, dpi: 150 };
  const destination = (rangeOverride) => getSpellAreaSpatialValidation(scene({ caster: [0, 0] }), {
    contract,
    session: {
      casterId: "caster",
      placement: { status: "confirmed", confirmed: true, preview: { ...preview, ...(rangeOverride ? { rangeOverride: true } : {}) } },
    },
  });
  assert.equal((await destination(false)).invalidDestination, true);
  assert.equal((await destination(true)).invalidDestination, false);

  // Who measures it again on the commit: the command keeps the mark, the board token reads it.
  const command = buildSpellAreaResolutionCommand({
    contract: contractOf("xanathar-stretta-della-terra-di-maximilian"),
    spellId: "xanathar-stretta-della-terra-di-maximilian",
    phase: "cast",
    casterId: "caster",
    slotLevel: 2,
    targetIds: ["target"],
    candidateTargetIds: ["target"],
    placement: {
      status: "confirmed",
      spellId: "xanathar-stretta-della-terra-di-maximilian",
      ruleId: "xanathar-stretta-della-terra-di-maximilian:board-token",
      casterId: "caster",
      preview: { position: { x: 10, y: 20 }, targetIds: [], rangeOverride: true },
    },
    outcomes: { target: "failed" },
    hp: { mode: "damage", amount: 7 },
    sceneEpoch: 4,
    currentSceneEpoch: 4,
  });
  assert.equal(command.placement.preview.rangeOverride, true);
  assert.match(readFileSync(new URL("../src/effectsMutations.js", import.meta.url), "utf8"), /descriptor\.rangeOverride !== true && !spellAreaOriginWithinRange/u);
});

test("il pannello ricorda l'eccezione finché vale il lancio, e la dice accanto alla gittata", () => {
  const contract = contractOf("hold-person");
  let session = createSpellPanelSession({ contract, casterId: "caster", targetIds: ["far"], rangeRefusedIds: ["far"] });
  assert.deepEqual(session.rangeRefusedIds, ["far"]);
  session = updateSpellPanelSession(session, { rangeRefusedIds: [], rangeOverrideIds: ["far"] });
  assert.deepEqual(session.rangeOverrideIds, ["far"]);
  const label = (current) => buildUnifiedPanelViewModel({ contract, session: current, targetCandidates: [] }).targets.spatialLabel;
  assert.equal(label(session), "Bersagli entro 18 m · Distanza massima tra bersagli: 9 m · Gittata ignorata per 1 bersaglio");
  assert.equal(label(updateSpellPanelSession(session, { targetIds: [] })), "Bersagli entro 18 m · Distanza massima tra bersagli: 9 m", "only for who is selected");

  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  const toggle = panel.slice(panel.indexOf("onTargetToggle: async"), panel.indexOf("onIgnoreTargetLimitChange"));
  assert.match(toggle, /checked && \(state\.session\.rangeRefusedIds \|\| \[\]\)\.includes\(key\)/u);
  assert.match(toggle, /grantCasterRangeException\(key\)/u);
  assert.match(toggle, /dropCasterRangeException\(key\)/u);
});

// Found at the bench: a reaction to the map's selection that writes it back chases any other writer for ever, and hangs the page.
test("il controllo non riscrive la selezione della mappa quando reagisce a un suo cambiamento", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  const enforce = panel.slice(panel.indexOf("const enforceCasterRange = async"), panel.indexOf("const applyPrimarySecondarySelection = async"));
  assert.match(enforce, /applyCasterRangeValidation\([^)]*\), validation, \{ writeMapSelection: false \}\)/u);
  assert.doesNotMatch(enforce, /writeSelection\(/u);
  assert.match(panel, /if \(writeMapSelection\) await writeSelection\(nextIds\);/u);
});

test("il pannello mostra il motivo di un rifiuto spaziale, non un errore generico", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  assert.match(panel, /code === "spatial-validation-failed" \? String\(result\.errors\[0\]\.message/u);
  assert.match(panel, /"caster-range-exceeded": "Un bersaglio supera la portata del caster\."/u);
  assert.match(panel, /validateCasterRange: \(input\) => provider\.validateCasterRange\?\.\(input\)/u);
});
