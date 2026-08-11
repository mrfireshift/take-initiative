import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSpellUnifiedPanelRouteQuery,
  normalizeSpellUnifiedPanelOpenRequest,
  routeSpellUnifiedPanelOpenRequest,
  spellUnifiedPanelShouldAutoStartPlacement,
  SPELL_UNIFIED_PANEL_DESTINATION,
  SPELL_UNIFIED_PANEL_ROUTE_STATUS,
} from "../src/spellUnifiedPanelRoutingCore.js";
import { buildSpellCatalogEntries } from "../src/spellUnifiedPanelSceneProvider.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";

test("il router instrada lifecycle, area e active resolution dal contratto", () => {
  const lifecycle = routeSpellUnifiedPanelOpenRequest({
    sourceId: "caster-1",
    spellId: "magic-missile",
    casterId: "caster-2",
    slotLevel: 3,
  });
  assert.equal(lifecycle.destination, SPELL_UNIFIED_PANEL_DESTINATION);
  assert.equal(lifecycle.status, SPELL_UNIFIED_PANEL_ROUTE_STATUS.READY);
  assert.equal(lifecycle.lane, "spell-lifecycle");
  assert.equal(lifecycle.adapter, "spellUnifiedLifecycleAdapter");
  assert.equal(lifecycle.executor, "executeSpellUnifiedLifecycle");
  assert.equal(lifecycle.session.casterId, "caster-2");
  assert.equal(lifecycle.session.slotLevel, 3);

  const area = routeSpellUnifiedPanelOpenRequest({ spellId: "fireball" });
  assert.equal(area.lane, "area-transaction");
  assert.equal(area.adapter, "spellUnifiedAreaAdapter");
  assert.equal(area.executor, "executeSpellUnifiedArea");

  const token = routeSpellUnifiedPanelOpenRequest({ spellId: "arcane-hand" });
  assert.equal(token.lane, "spell-lifecycle");
  assert.equal(token.adapter, "spellUnifiedAreaAdapter");
  assert.equal(token.executor, "executeSpellUnifiedArea");

  const activeContract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-investitura-della-fiamma",
  });
  const actionId = activeContract.presentation.activeActions[0].id;
  const active = routeSpellUnifiedPanelOpenRequest({
    spellId: "xanathar-investitura-della-fiamma",
    actionId,
    activeInstanceId: "instance-1",
  });
  assert.equal(active.lane, "active-resolution");
  assert.equal(active.adapter, "spellUnifiedActiveAdapter");
  assert.equal(active.executor, "executeSpellUnifiedActiveAction");
  assert.equal(active.session.activeActionId, actionId);
  assert.equal(active.session.activeInstanceId, "instance-1");
});

test("il payload di apertura trasferisce caster, slot, bersagli, placement e contesto", () => {
  const request = {
    intent: "spell",
    sourceId: "source-1",
    casterId: "caster-1",
    spellId: "fireball",
    phase: "cast",
    slotLevel: 5,
    targetIds: ["target-1", "target-2"],
    targetContext: { "target-1": { cover: "half" } },
    placement: {
      status: "confirmed",
      ruleId: "fireball:cast",
      targetLocked: true,
      targetIds: ["target-1", "target-2"],
    },
    applyAutomatedConditions: false,
    sceneEpoch: 12,
    revision: 7,
    activationId: "activation-1",
    zoneRoot: "zone-root-1",
    parentInstanceId: "parent-1",
    origin: "legacy-entry-point",
  };
  const roundTrip = normalizeSpellUnifiedPanelOpenRequest(
    Object.fromEntries(buildSpellUnifiedPanelRouteQuery(request)),
  );
  assert.equal(roundTrip.casterId, "caster-1");
  assert.equal(roundTrip.slotLevel, 5);
  assert.deepEqual(roundTrip.targetIds, ["target-1", "target-2"]);
  assert.deepEqual(roundTrip.targetContext, request.targetContext);
  assert.deepEqual(roundTrip.placement, request.placement);
  assert.equal(roundTrip.applyAutomatedConditions, false);
  assert.equal(roundTrip.sceneEpoch, 12);
  assert.equal(roundTrip.revision, 7);
  assert.equal(roundTrip.activationId, "activation-1");
  assert.equal(roundTrip.zoneRoot, "zone-root-1");
  assert.equal(roundTrip.parentInstanceId, "parent-1");

  const routed = routeSpellUnifiedPanelOpenRequest(
    Object.fromEntries(buildSpellUnifiedPanelRouteQuery(request)),
  );
  assert.equal(routed.status, SPELL_UNIFIED_PANEL_ROUTE_STATUS.READY);
  assert.equal(routed.session.casterId, "caster-1");
  assert.deepEqual(routed.session.targetIds, request.targetIds);
  assert.deepEqual(routed.session.placement, request.placement);
  assert.equal(routed.context.activationId, "activation-1");
});

test("una quick action area con placement required avvia il percorso di disegno", () => {
  const areaQuickAction = routeSpellUnifiedPanelOpenRequest({
    sourceId: "caster-1",
    spellId: "fireball",
    quickActionId: "quick-fireball",
    origin: "quick-action",
  });
  const targetQuickAction = routeSpellUnifiedPanelOpenRequest({
    sourceId: "caster-1",
    spellId: "shield-of-faith",
    quickActionId: "quick-shield",
    origin: "quick-action",
  });

  assert.equal(spellUnifiedPanelShouldAutoStartPlacement(areaQuickAction), true);
  assert.equal(spellUnifiedPanelShouldAutoStartPlacement(targetQuickAction), false);
  assert.equal(spellUnifiedPanelShouldAutoStartPlacement({
    ...areaQuickAction,
    origin: "tracker-spells",
  }), false);
});

test("il router apre il catalogo o segnala il gap senza fallback impliciti", () => {
  const catalog = routeSpellUnifiedPanelOpenRequest({ sourceId: "caster-1" });
  assert.equal(catalog.destination, SPELL_UNIFIED_PANEL_DESTINATION);
  assert.equal(catalog.status, SPELL_UNIFIED_PANEL_ROUTE_STATUS.CATALOG);
  assert.equal(catalog.lane, null);

  const unsupported = routeSpellUnifiedPanelOpenRequest({ spellId: "spell-not-found" });
  assert.equal(unsupported.destination, SPELL_UNIFIED_PANEL_DESTINATION);
  assert.equal(unsupported.status, SPELL_UNIFIED_PANEL_ROUTE_STATUS.UNSUPPORTED);
  assert.equal(unsupported.executor, null);
});

test("ogni voce del catalogo Spells ha contratto e routing, senza duplicato visibile nella Console", async () => {
  const entries = buildSpellCatalogEntries();
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const contract = buildSpellUnifiedPanelContract({ spellId: entry.key });
    const route = routeSpellUnifiedPanelOpenRequest({ spellId: entry.key });
    assert.ok(contract, entry.key);
    assert.ok([
      "spell-lifecycle",
      "area-transaction",
      "active-resolution",
    ].includes(contract.execution.lane), entry.key);
    assert.equal(route.destination, SPELL_UNIFIED_PANEL_DESTINATION, entry.key);
    assert.equal(route.status, SPELL_UNIFIED_PANEL_ROUTE_STATUS.READY, entry.key);
  }

  const quickMarkup = await readFile(new URL("../quick-hp-modal.html", import.meta.url), "utf8");
  assert.doesNotMatch(quickMarkup, /areaSpellTab|areaSpellPanel|spellSearch|spellSelect/);
  assert.match(quickMarkup, /Console effetti manuali/);
});

test("il routing non dipende da layout, label, nome localizzato o provenienza del pannello", async () => {
  const source = await readFile(
    new URL("../src/spellUnifiedPanelRoutingCore.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /innerWidth|clientWidth|className|areaCandidate|spellName|label/i);
  assert.doesNotMatch(source, /quick-hp-modal|spells-modal\.html/);
});
