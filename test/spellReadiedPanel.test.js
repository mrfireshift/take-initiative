// «Prepara» in the spell panel and in the console's Azioni tab (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6b, decisions
// P1–P4, P9, P10): a spell the Ready action can hold is prepared beside its cast, on the caster, its concentration forced;
// Counterspell asks at the hold; a creature not on the players' side keeps its hold to the GM.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}), Command: class {} } });

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { getSpellCastPhaseOptions, getSpellCastPhasePlan } = await import("../src/spellCastPhaseCore.js");
const { buildSpellUnifiedPanelContract, buildSpellPanelViewModel, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellUnifiedLifecycleRequest } = await import("../src/spellUnifiedLifecycleAdapter.js");
const { renderReviewFooter } = await import("../src/spellUnifiedPanelEffectsView.js");
const { FakeNode, textOf } = await import("../test-support/fakeBossActionsDom.js");

const contract = (spellId, extra = {}) => buildSpellUnifiedPanelContract({ spellId, ...extra });
const controlsOf = (value) => [...(value.presentation.controls || [])];

test("a spell cast with 1 action: cast at once, or prepared; the hold is the «Prepara» button, not a tab", () => {
  assert.deepEqual(getSpellCastPhaseOptions(getSpellDefinition("fireball"), "prepare"),
    [{ value: "cast", label: "Lancio" }, { value: "prepare", label: "Prepara incantesimo", readied: true }]);
  assert.deepEqual(getSpellCastPhaseOptions(getSpellDefinition("fireball")), [], "a cast has no phases: the quick actions cast it at once");
  assert.deepEqual(getSpellCastPhaseOptions(getSpellDefinition("misty-step"), "prepare"), [], "a bonus action");
  assert.equal(getSpellCastPhaseOptions(getSpellDefinition("symbol")).some((option) => option.readied), false, "Symbol keeps its phases");
  const cast = contract("fireball");
  assert.deepEqual([cast.presentation.phase.selected, cast.presentation.readied.available, cast.spell.concentration], ["cast", true, false]);
  assert.deepEqual(cast.presentation.phase.options.map((option) => option.value), ["cast"], "as before");
  assert.equal(controlsOf(cast).includes("phase"), false, "no tabs");
  const sphere = contract("freezing-sphere");
  assert.equal(controlsOf(sphere).includes("phase"), true, "Freezing Sphere keeps its tabs");
  assert.equal(sphere.presentation.readied.available, false);
});

test("the hold's contract and session: on the caster, readied, its concentration forced (P4); a cast never carries the mark", () => {
  const hold = contract("fireball", { phase: "prepare", castContext: { slotLevel: 3 } });
  assert.deepEqual([hold.presentation.phase.selected, hold.presentation.phase.plan.readied, hold.presentation.phase.plan.subjectMode],
    ["prepare", true, "caster"]);
  assert.equal(hold.spell.concentration, true, "the panel asks before ending another concentration");
  const session = createSpellPanelSession({ contract: hold, phase: "prepare", casterId: "maga", castContext: { slotLevel: 3 } });
  assert.deepEqual([session.phase, session.castContext.readied], ["prepare", true]);
  const cast = createSpellPanelSession({ contract: contract("fireball"), castContext: { readied: true, slotLevel: 3 } });
  assert.equal(cast.castContext.readied, undefined, "back to the cast: the mark goes");
  // What the executor receives: the hold's plan, on the caster alone, with the mark (spellApplicationPlanCore.js).
  const request = buildSpellUnifiedLifecycleRequest({ contract: hold, session, spell: getSpellDefinition("fireball") });
  assert.deepEqual([request.phasePlan.phase, request.phasePlan.readied, request.targetIds, request.castContext.readied],
    ["prepare", true, ["maga"], true]);
  assert.equal(request.requestedConcentration, false, "the spell's own: the hold's comes from its cast context");
});

test("a creature not on the players' side keeps its readied spell to the GM (P10)", () => {
  const pill = (castContext) => getSpellCastPhasePlan(getSpellDefinition("fireball"), "prepare", { readied: true, phase: "prepare", ...castContext }).effects[0];
  assert.deepEqual(pill({ readiedGmOnly: true }).mechanics, { gmOnly: true });
  assert.equal(pill({}).mechanics, undefined);
});

test("the footer: «Prepara» beside the primary button; preparing, «Lancia» back and «Prepara incantesimo»", async () => {
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: () => new FakeNode(doc, "#text") };
  const footer = (spellContract, session) => {
    const calls = [];
    const node = renderReviewFooter(doc, { workflow: buildSpellPanelViewModel(spellContract, session) }, { onPhaseChange: (phase) => calls.push(phase) });
    // The fake DOM reads data-* selectors from dataset: the buttons are found by their attribute.
    const buttons = node.querySelectorAll("button");
    return { node, calls, toggle: buttons.find((button) => button.getAttribute("data-readied-toggle")) || null,
      primary: buttons.find((button) => button.getAttribute("data-primary-action")) || null };
  };
  const cast = footer(contract("fireball"), { casterId: "maga" });
  assert.deepEqual([cast.toggle.textContent, cast.toggle.getAttribute("data-readied-toggle"), cast.toggle.getAttribute("aria-pressed")],
    ["Prepara", "prepare", "false"]);
  assert.match(cast.toggle.getAttribute("title"), /si rilascia con la reazione/);
  await cast.toggle.click();
  assert.deepEqual(cast.calls, ["prepare"]);
  const hold = contract("fireball", { phase: "prepare", castContext: { slotLevel: 3 } });
  const held = footer(hold, createSpellPanelSession({ contract: hold, phase: "prepare", casterId: "maga", castContext: { slotLevel: 3 } }));
  assert.deepEqual([held.toggle.textContent, held.toggle.getAttribute("data-readied-toggle")], ["Lancia", "cast"]);
  assert.deepEqual([held.primary.textContent, held.primary.getAttribute("data-primary-action")], ["Prepara incantesimo", "prepare"]);
  assert.equal(footer(contract("misty-step"), { casterId: "maga" }).toggle, null, "a bonus action: no Prepara");
  assert.ok(textOf(cast.node).length > 0);
});

test("the panel asks Counterspell at the hold, marks a creature's hold for the GM, and keeps preparing across spells", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  assert.ok(panel.includes('const readiedHold = actionId === "prepare" && state.session.castContext?.readied === true;'));
  assert.ok(panel.includes('if ((actionId === "apply" && !readiedRelease) || readiedHold) {'),
    "the cast's reactions gate (Counterspell) at the hold (P9), never at the release (lot T6c)");
  assert.ok(panel.includes('!["pc", "ally"].includes(String(caster?.metadata?.[`${ID}/meta`]?.attitude || "").trim().toLowerCase());'));
  assert.ok(panel.includes('const nextContract = buildContract(spellKey, preparing ? { phase: "prepare" } : {});'));
});

test("the console's Azioni tab: Preparare → Un incantesimo asks the tracker to open the panel on the hold", () => {
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const opener = tracker.slice(tracker.indexOf("async function __openTrackerReadiedSpell("));
  assert.ok(opener.slice(0, 400).includes('routeRequest: { phase: "prepare" }'), "the panel on the hold, never a direct cast");
  assert.match(tracker, /const result = data\.phase === "prepare" && action\.kind === "spell"\s+\? await __openTrackerReadiedSpell\(sourceEntry, action\)/u,
    "the console's request carries it");
});
