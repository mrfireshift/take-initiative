// The release of a readied spell (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6c, decisions P5–P9): «Rilascia» alone on its
// hold, from the pill's ⚡, the card's menu or the panel's own list, never a turn popup; the panel opened on it casts the
// spell itself with the reaction, no slot, no Counterspell, the hold named apart. The command itself:
// test/spellReadiedReleaseIntegration.test.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}), Command: class {} } });

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { isReadiedSpellHold, readiedSpellReleaseHistoryLabel } = await import("../src/spellCastPhaseCore.js");
const { getSpellOverviewActions } = await import("../src/spellActiveActionCore.js");
const { spellPillHasActions } = await import("../src/spellPillActionsCore.js");
const { isPreparedSpellResolutionGroup, preparedSpellResolutionAction } = await import("../src/preparedSpellResolutionCore.js");
const { buildSpellUnifiedPanelRouteQuery, routeSpellUnifiedPanelOpenRequest } = await import("../src/spellUnifiedPanelRoutingCore.js");
const { buildSpellPanelViewModel, buildSpellUnifiedPanelContract, createSpellPanelSession, readiedReleaseHoldId, updateSpellPanelSession } =
  await import("../src/spellUnifiedPanelCore.js");
const { renderReviewFooter } = await import("../src/spellUnifiedPanelEffectsView.js");
const { FakeNode } = await import("../test-support/fakeBossActionsDom.js");
const { buildSpellUnifiedAreaCommand } = await import("../src/spellUnifiedAreaAdapter.js");
const { planSpellReactionSpend } = await import("../src/spellReactionCore.js");
const { READIED_ACTION_CONDITION, REACTION_USED_CONDITION, readiedSpellHold } = await import("../src/reactionTrackerCore.js");
const { buildInitiativeCardContextMenuPayload, routeInitiativeCardContextMenuAction } = await import("../src/initiativeMenuActionsCore.js");
const { isAllowedInitiativeCardMenuAction } = await import("../src/menuPopoverProtocolCore.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");

const spell = (id) => getSpellDefinition(id);
const held = (extra = {}) => ({ readied: true, phase: "prepare", slotLevel: 3, ...extra });
const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("a hold offers «Rilascia» alone, completed in the panel; the spell's own actions start with its cast", () => {
  const release = { id: "release-readied", type: "resolve", readied: true, buttonLabel: "Rilascia", subjectMode: "none",
    requiresTargets: false, completesInPanel: true };
  assert.deepEqual(getSpellOverviewActions({ spell: spell("fireball"), castContext: held(), casterId: "maga", targetIds: ["maga"] }), [release]);
  assert.deepEqual(getSpellOverviewActions({ spell: spell("mirror-image"), castContext: held({ slotLevel: 2 }), casterId: "maga",
    targetIds: ["maga"] }), [release], "no duplicate to strike while the spell is held");
  assert.equal(getSpellOverviewActions({ spell: spell("fireball"), castContext: { slotLevel: 3 }, casterId: "maga" })
    .some((action) => action.readied), false, "a cast is no hold");
  assert.equal(isReadiedSpellHold({ spell: spell("fireball"), castContext: { readied: true, phase: "cast" } }), false);
  // Symbol keeps its own prepared resolution (CAP-ORIGIN).
  const symbol = getSpellOverviewActions({ spell: spell("symbol"), castContext: { phase: "prepare", choice: "death" }, casterId: "maga",
    targetIds: ["maga"] });
  assert.deepEqual(symbol.map((action) => [action.id, action.readied === true]), [["resolve-prepared", false]]);
});

test("the hold's pill gets its ⚡; no turn popup for it, Symbol's stays", () => {
  assert.equal(spellPillHasActions({ spellId: "fireball", name: "Palla di fuoco", castContext: held() }), true);
  assert.equal(spellPillHasActions({ spellId: "fireball", name: "Palla di fuoco", castContext: { slotLevel: 3 } }), false);
  const group = { spellId: "fireball", instanceId: "hold-1", casterId: "maga", castContext: held(), targets: ["maga"] };
  assert.equal(preparedSpellResolutionAction(group), null, "released with the reaction, on any turn: no prompt of the caster's turn");
  assert.equal(isPreparedSpellResolutionGroup(group), false);
  assert.equal(preparedSpellResolutionAction({ spellId: "symbol", instanceId: "glyph-1", casterId: "maga",
    castContext: { phase: "prepare", choice: "death" }, targets: ["maga"] })?.id, "resolve-prepared");
});

test("the panel opened on a hold casts the spell itself, the hold named apart, never its concentration", () => {
  const request = { spellId: "fireball", casterId: "maga", phase: "resolve", parentInstanceId: "hold-1", slotLevel: 3 };
  for (const route of [
    routeSpellUnifiedPanelOpenRequest(request),
    // From the URL the ⚡ and the card's menu open.
    routeSpellUnifiedPanelOpenRequest(Object.fromEntries(buildSpellUnifiedPanelRouteQuery(request))),
  ]) {
    assert.equal(route.status, "ready");
    assert.deepEqual([route.contract.presentation.phase.selected, route.session.phase, route.session.activeConcentration,
      route.session.readiedRelease], ["cast", "cast", null, { instanceId: "hold-1" }]);
    assert.deepEqual(route.session.castContext, { slotLevel: 3 }, "a cast's context: no phase, no mark");
  }
  assert.equal(readiedReleaseHoldId({ spellId: "misty-step", phase: "resolve", parentInstanceId: "x" }), "", "never held");
  // Symbol and Freezing Sphere resolve their own prepared phase, as before.
  for (const spellId of ["symbol", "freezing-sphere"]) {
    const route = routeSpellUnifiedPanelOpenRequest({ spellId, casterId: "maga", phase: "resolve", parentInstanceId: "p-1", slotLevel: 7 });
    assert.deepEqual([route.session.phase, route.session.activeConcentration?.instanceId, route.session.readiedRelease], ["resolve", "p-1", undefined]);
  }
  const session = createSpellPanelSession({ contract: routeSpellUnifiedPanelOpenRequest(request).contract,
    ...routeSpellUnifiedPanelOpenRequest(request).session });
  assert.deepEqual(updateSpellPanelSession(session, { targetIds: ["goblin"] }).readiedRelease, { instanceId: "hold-1" });
});

test("the release in the panel: «Rilascia», neither caster nor slot to choose, no «Prepara»", () => {
  const route = routeSpellUnifiedPanelOpenRequest({ spellId: "bless", casterId: "maga", phase: "resolve", parentInstanceId: "hold-1", slotLevel: 1 });
  const release = buildSpellPanelViewModel(route.contract, createSpellPanelSession({ contract: route.contract, ...route.session,
    targetIds: ["aria", "dars"] }));
  assert.deepEqual([release.primaryAction.id, release.primaryAction.label, release.readied.visible], ["apply", "Rilascia", false]);
  assert.equal(release.controls.includes("caster") || release.controls.includes("slot-level"), false, release.controls.join(","));
  assert.equal(release.summary.lines[0], "Rilascio");
  const cast = buildSpellPanelViewModel(route.contract, createSpellPanelSession({ contract: route.contract, casterId: "maga",
    targetIds: ["aria", "dars"] }));
  assert.deepEqual([cast.primaryAction.label === "Rilascia", cast.readied.visible], [false, true], "a cast as before");
  assert.equal(readiedSpellReleaseHistoryLabel(spell("bless")), "Rilascio: Benedizione");
  // An area still to place: the footer's button already says «Rilascia», off until the area is placed.
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: () => new FakeNode(doc, "#text") };
  const footerPrimary = (contract, session) => renderReviewFooter(doc, { workflow: buildSpellPanelViewModel(contract, session) }, {})
    .querySelectorAll("button").find((button) => button.getAttribute("data-primary-action"));
  const fireball = routeSpellUnifiedPanelOpenRequest({ spellId: "fireball", casterId: "maga", phase: "resolve", parentInstanceId: "hold-1", slotLevel: 3 });
  const placing = footerPrimary(fireball.contract, createSpellPanelSession({ contract: fireball.contract, ...fireball.session }));
  assert.deepEqual([placing.textContent, placing.disabled, placing.getAttribute("data-primary-action")], ["Rilascia", true, "place"]);
  const castFireball = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  assert.equal(footerPrimary(castFireball, createSpellPanelSession({ contract: castFireball, casterId: "maga" })).textContent, "Applica effetti");
});

test("the area command carries the hold it ends", () => {
  const route = routeSpellUnifiedPanelOpenRequest({ spellId: "fireball", casterId: "maga", phase: "resolve", parentInstanceId: "hold-1", slotLevel: 3 });
  const command = buildSpellUnifiedAreaCommand({ contract: route.contract, session: createSpellPanelSession({ contract: route.contract,
    ...route.session }), source: { sceneEpoch: 1 } });
  assert.deepEqual([command.readiedRelease, command.source.kind, command.spell.phase], [{ instanceId: "hold-1" }, "cast", "cast"]);
  assert.equal(command.automation, undefined, "the catalog's saves, as a cast's");
});

test("the release spends the reaction, whatever the spell's casting time; already used, the GM confirms", () => {
  const caster = (instances = []) => ({ id: "maga", name: "Maga", metadata: { "com.thebigpicture.initiative/meta": { conditions: { instances } } } });
  const initiativeState = { order: ["maga", "goblin"], round: 2, current: 1 };
  const plan = planSpellReactionSpend({ spellId: "fireball", caster: caster(), initiativeState, readiedRelease: true });
  assert.deepEqual([plan.applies, plan.alreadyUsed, plan.operations[0].conditionName], [true, false, REACTION_USED_CONDITION]);
  assert.equal(planSpellReactionSpend({ spellId: "fireball", caster: caster(), initiativeState }).applies, false, "a cast of Fireball, as before");
  const used = planSpellReactionSpend({ spellId: "fireball", caster: caster([{ id: "r", condition: REACTION_USED_CONDITION }]),
    initiativeState, readiedRelease: true });
  assert.deepEqual([used.alreadyUsed, used.operations], [true, []]);
});

test("the card's menu: «Rilascia Palla di fuoco» for a held spell, in place of «Innesca», routed to its handler", async () => {
  const conditions = { instances: [{ id: "pill-1", condition: READIED_ACTION_CONDITION, parentEffectId: "hold-1" }] };
  const spells = [{ instanceId: "hold-1", spellId: "fireball", name: "Palla di fuoco", castContext: held() }];
  assert.deepEqual(readiedSpellHold(conditions, spells), { instanceId: "hold-1", spellId: "fireball", name: "Palla di fuoco", slotLevel: 3 });
  assert.equal(readiedSpellHold(conditions, [{ ...spells[0], castContext: { slotLevel: 3 } }]), null, "a cast is no hold");
  assert.equal(readiedSpellHold({ instances: [{ id: "pill-2", condition: READIED_ACTION_CONDITION }] }, spells), null, "a readied attack");
  const entry = { id: "maga", name: "Maga", attitude: "pc", conditions, spells, pcAttackConsole: true };
  const payload = buildInitiativeCardContextMenuPayload({ sourceEntry: entry, scopeIds: ["maga"] });
  assert.deepEqual([payload.hasReadiedAction, payload.readiedSpell, payload.readiedAttack],
    [true, { instanceId: "hold-1", name: "Palla di fuoco" }, undefined], "an attack would lose the spell");
  assert.equal(isAllowedInitiativeCardMenuAction("readied-spell-release"), true);
  const calls = [];
  assert.equal(await routeInitiativeCardContextMenuAction({ sourceEntry: entry, scopeIds: ["maga"] }, { action: "readied-spell-release" },
    { releaseReadiedSpell: async (sourceEntry) => calls.push(sourceEntry.id) }), true);
  assert.deepEqual(calls, ["maga"]);
  const menu = source("initiative-card-context-menu.js");
  assert.ok(menu.includes('makeAction(root, `Rilascia ${payload.readiedSpell.name || "l\'incantesimo"}`, "mark.svg", "readied-spell-release"'));
  assert.ok(menu.includes("if (payload.hasReadiedAction && payload.readiedSpell) {"), "no «Innesca» for a held spell");
  const tracker = source("initiativeList.js");
  const handler = tracker.slice(tracker.indexOf("async function __releaseReadiedSpellFromContext"));
  assert.match(handler.slice(0, handler.indexOf("\n}")), /spellId: hold\.spellId, phase: "resolve", parentInstanceId: hold\.instanceId/u,
    "the spell panel on the release, nothing written");
  assert.ok(tracker.includes("releaseReadiedSpell: __releaseReadiedSpellFromContext,"));
});

test("the panel: the reaction and the hold's end in the cast's command, no slot, no Counterspell, the hold not asked about", () => {
  const panel = source("spell-unified-panel.js");
  assert.ok(panel.includes("&& !state.session?.readiedRelease;"), "no slot, no use: spent at the hold (P3)");
  assert.ok(panel.includes("if (state.session?.readiedRelease) return prepareReadiedRelease(operation);"));
  assert.ok(panel.includes('{ type: "concentration:break", casterIds: [state.session.casterId], reference: holdId, reason: "readied-release" },'));
  assert.ok(panel.includes("readiedRelease: true });"), "the reaction, whatever the spell");
  assert.ok(panel.includes("String(entry?.instanceId || \"\").trim() !== releasedHoldId"), "only another concentration is confirmed");
  assert.equal(panel.match(/if \(action\.type === "resolve" && action\.readied === true\) \{\s+enterReadiedRelease\(overview\);/gu)?.length, 2,
    "«Rilascia» from the panel's own list, both ways");
});

test("«Annulla azione preparata»: the card removes the pill, the spell vanishes with its concentration, the reaction stays", () => {
  const intent = buildSpellApplicationIntent({ spell: spell("fireball"), enteredName: "fireball", turns: 1, casterId: "caster",
    targetIds: ["caster"], castContext: held() });
  const plan = buildSpellApplicationPlan({ intent, instanceId: "hold-1",
    appliedAt: { round: 2, actorId: "caster", phase: "turn", turnKey: "2:caster" }, casterName: "Maga" });
  const operations = plan.operations.map((operation, index) => ({ ...operation, operationId: `op-${index}`, createdAt: 100 + index,
    ...(operation.type === "condition:add" ? { instanceIds: { caster: "pill-1" } } : {}),
    ...(operation.type === "spell:upsert" ? { entryIds: { caster: "entry-1" } } : {}) }));
  const token = { id: "caster", name: "caster", spells: [], concentrations: {}, conditions: [] };
  const holding = buildEffectsMutationPlan([token], operations);
  // As __removeConditionOnTrackerCard writes it (initiativeList.js).
  const cancelled = buildEffectsMutationPlan(holding.states, [{ type: "condition:remove-instances", removals: [{ itemId: "caster", instanceId: "pill-1" }] }]);
  const caster = cancelled.states.find((entry) => entry.id === "caster");
  assert.deepEqual([caster.spells, caster.conditions.filter((instance) => instance.active !== false), caster.concentrations], [[], [], {}]);
});

test("a readied Blink is held, not cast: no plane and no return to resolve when its hold ends", () => {
  const intent = (castContext) => buildSpellApplicationIntent({ spell: spell("blink"), enteredName: "Intermittenza", turns: 10,
    casterId: "maga", targetIds: ["maga"], castContext });
  assert.equal(intent({ readied: true, phase: "prepare", slotLevel: 3 }).persistedCastContext.terminalResolution, undefined);
  assert.ok(intent({ slotLevel: 3 }).persistedCastContext.terminalResolution, "a cast of Blink, as before");
});
