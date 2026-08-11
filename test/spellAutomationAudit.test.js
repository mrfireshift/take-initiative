import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpellAutomationAudit,
  renderSpellAutomationMarkdown,
} from "../scripts/audit-spell-automation.mjs";

test("l'audit copre l'intero catalogo e conserva le evidenze disponibili", () => {
  const audit = buildSpellAutomationAudit();
  assert.equal(audit.summary.catalogTotal, 477);
  assert.equal(audit.summary.catalog + audit.summary.excluded, 477);
  assert.equal(new Set([...audit.rows, ...audit.excluded].map((row) => row.id)).size, 477);
  assert.equal(audit.rows.find((row) => row.id === "legacy-crusaders-mantle")?.textAvailable, false);
});

test("la matrice operativa esclude casting time maggiori di 1 azione", () => {
  const audit = buildSpellAutomationAudit();
  assert.ok(audit.rows.every((row) => !row.castingTime || /^1 (?:azione|reazione)\b/iu.test(row.castingTime)));
  assert.ok(audit.excluded.some((row) => row.castingTime === "10 minuti"));
  assert.ok(audit.excluded.every((row) => row.reason));
});

test("le esclusioni curate non compaiono nella matrice operativa", () => {
  const audit = buildSpellAutomationAudit();
  const excludedIds = [
    "alter-self",
    "feather-fall",
    "water-walk",
    "meld-into-stone",
    "gaseous-form",
    "project-image",
    "silent-image",
    "hunters-mark",
    "modify-memory",
    "phb2014-sortilegio",
    "zone-of-truth",
  ];

  assert.ok(excludedIds.every((id) => !audit.rows.some((row) => row.id === id)));
  assert.ok(excludedIds.every((id) => audit.excluded.some((row) =>
    row.id === id
    && row.reason === "esclusione curata dal perimetro operativo"
  )));
});

test("le lacune curate restano separate dalle candidate testuali", () => {
  const audit = buildSpellAutomationAudit();
  const wall = audit.rows.find((row) => row.id === "wall-of-fire");
  assert.equal(wall?.priority, "P1");
  assert.equal(wall?.reviewBasis, "curata sul testo RAW");
  assert.ok(wall?.gaps.some((entry) => entry.code === "HOT_SIDE_GEOMETRY"));
  assert.ok(wall?.gaps.some((entry) => entry.code === "CROSSING_DETECTION"));

  const enhanceAbility = audit.rows.find((row) => row.id === "enhance-ability");
  assert.equal(enhanceAbility?.reviewBasis, "curata sul testo RAW");
  assert.equal(enhanceAbility?.priority, "—");
  assert.deepEqual(enhanceAbility?.gaps, []);
});

test("il TS iniziale richiede un workflow soltanto per aree o bersagli multipli", () => {
  const audit = buildSpellAutomationAudit();
  const immolation = audit.rows.find((row) => row.id === "xanathar-immolazione");
  const command = audit.rows.find((row) => row.id === "command");
  const elementalBane = audit.rows.find((row) => row.id === "xanathar-anatema-elementale");
  const banishment = audit.rows.find((row) => row.id === "banishment");
  const disperse = audit.excluded.find((row) => row.id === "xanathar-disperdere");
  const massPolymorph = audit.excluded.find((row) => row.id === "xanathar-metamorfosi-di-massa");
  const fireball = audit.rows.find((row) => row.id === "fireball");
  const bane = audit.rows.find((row) => row.id === "bane");
  const mindWhip = audit.rows.find((row) => row.id === "legacy-tashas-mind-whip");
  const bless = audit.rows.find((row) => row.id === "bless");
  const planeShift = audit.rows.find((row) => row.id === "plane-shift");

  assert.equal(immolation?.saveScope, "singolo");
  assert.equal(immolation?.runtime.batchSaveWorkflowRequired, false);
  assert.deepEqual(immolation?.gaps, []);
  assert.equal(command?.saveScope, "multiplo");
  assert.deepEqual(command?.gaps, []);
  assert.equal(command?.runtime.saveAutomation, true);
  assert.match(command?.curatedNote || "", /Supplica/);
  assert.equal(elementalBane?.runtime.saveAutomation, true);
  assert.ok(!elementalBane?.gaps.some((entry) => entry.code === "SAVE_WORKFLOW_MISSING"));
  assert.ok(elementalBane?.gaps.some((entry) => entry.code === "CONDITIONAL_TRIGGER"));
  assert.match(elementalBane?.curatedNote || "", /pairwise/);
  for (const row of [banishment]) {
    assert.equal(row?.runtime.saveAutomation, true, row?.id);
    assert.ok(!row?.gaps.some((entry) => entry.code === "SAVE_WORKFLOW_MISSING"), row?.id);
  }
  assert.equal(disperse?.reason, "gestione manuale intenzionale");
  assert.equal(massPolymorph?.reason, "gestione manuale intenzionale");
  assert.deepEqual(banishment?.gaps, []);
  assert.match(banishment?.curatedNote || "", /origine del piano/);
  assert.match(banishment?.curatedNote || "", /gestione fisica manuale/);
  assert.equal(fireball?.saveScope, "area");
  assert.equal(bane?.saveScope, "multiplo");
  assert.equal(bane?.priority, "—");
  assert.deepEqual(bane?.gaps, []);
  assert.equal(mindWhip?.priority, "—");
  assert.deepEqual(mindWhip?.gaps, []);
  assert.equal(bless?.saveScope, "—");
  assert.deepEqual(bless?.gaps, []);
  assert.equal(planeShift?.saveScope, "singolo");
  assert.deepEqual(planeShift?.gaps, []);
});

test("Catena di fulmini e Gabbia di forza hanno workflow distinti e coperti", () => {
  const audit = buildSpellAutomationAudit();
  const chainLightning = audit.rows.find((row) => row.id === "chain-lightning");
  const forcecage = audit.rows.find((row) => row.id === "forcecage");

  assert.deepEqual(chainLightning?.gaps, []);
  assert.match(chainLightning?.curatedNote || "", /rivalida le distanze/);
  assert.deepEqual(forcecage?.gaps, []);
  assert.match(forcecage?.curatedNote || "", /Box solida 2×2/);
  assert.ok(!forcecage?.gaps.some((entry) => entry.code === "SAVE_WORKFLOW_MISSING"));
  assert.ok(!forcecage?.gaps.some((entry) => entry.code === "BOUNDARY_REJECTION"));
});

test("Lotto I copre le attivazioni offensive ripetibili", () => {
  const audit = buildSpellAutomationAudit();
  const gust = audit.rows.find((row) => row.id === "gust-of-wind");
  const freedom = audit.rows.find((row) => row.id === "freedom-of-movement");
  const callLightning = audit.rows.find((row) => row.id === "call-lightning");
  const flameInvestiture = audit.rows.find((row) => row.id === "xanathar-investitura-della-fiamma");
  const stormSphere = audit.rows.find((row) => row.id === "xanathar-sfera-della-tempesta");

  assert.deepEqual(gust?.gaps, []);
  assert.deepEqual(freedom?.gaps, []);
  for (const row of [callLightning, flameInvestiture, stormSphere]) {
    assert.deepEqual(row?.gaps, [], row?.id);
  }
  assert.match(callLightning?.curatedNote || "", /raggio 18 m/);
  assert.match(flameInvestiture?.curatedNote || "", /reminder manuali da 1d10/);
  assert.match(stormSphere?.curatedNote || "", /rivalida 18 m/);
  assert.ok(!stormSphere?.gaps.some((entry) => entry.code === "REPEATED_ACTION"));
  assert.ok(!stormSphere?.gaps.some((entry) => entry.code === "TURN_EFFECT_MISSING"));
});

test("il report espone metodo, priorità e matrice completa", () => {
  const markdown = renderSpellAutomationMarkdown(buildSpellAutomationAudit());
  assert.match(markdown, /P1 — lacune confermate sul testo RAW/);
  assert.match(markdown, /\| Muro di fuoco \|/);
  assert.match(markdown, /## Matrice completa/);
  assert.match(markdown, /## Integrazione con la console unificata/);
  assert.match(markdown, /Invocare il fulmine/);
});

test("l'audit separa conformita RAW e raggiungibilita nella console unificata", () => {
  const audit = buildSpellAutomationAudit();
  assert.equal(audit.schemaVersion, 4);
  assert.ok(audit.rows.every((row) => row.integration?.status));
  assert.ok(audit.summary.unifiedCatalogExposed > 0);
  assert.ok(audit.summary.integrationDisconnected > 0);
  assert.ok(audit.summary.byIntegrationStatus.reachable > 0);
  assert.ok(audit.summary.byIntegrationIssue.UNIFIED_CATALOG_MISSING > 0);
});

test("Invocare il Fulmine segnala i workflow raggiungibili solo via reminder", () => {
  const audit = buildSpellAutomationAudit();
  const callLightning = audit.rows.find((row) => row.id === "call-lightning");

  assert.equal(callLightning?.integration.catalog.exposed, true);
  assert.equal(callLightning?.integration.contract.lane, "area-transaction");
  assert.equal(callLightning?.integration.cast.adapter, "area-transaction");
  assert.equal(callLightning?.integration.cast.valid, true);
  assert.ok(callLightning?.integration.persistence.ruleIds.includes("call-lightning:cloud"));
  assert.deepEqual(callLightning?.integration.actions.declaredActionIds, ["call-lightning-strike"]);
  assert.deepEqual(callLightning?.integration.actions.panelActionIds, []);
  assert.deepEqual(callLightning?.integration.actions.reminderActionIds, ["call-lightning-strike"]);
  assert.equal(callLightning?.integration.actions.mode, "reminder-only");
  assert.equal(callLightning?.integration.status, "fragile");
  assert.ok(callLightning?.integration.issues.some((issue) =>
    issue.code === "ACTIVE_ACTION_REMINDER_ONLY"
  ));
});

test("l'audit intercetta cast senza mutazioni e spell non esposte", () => {
  const audit = buildSpellAutomationAudit();
  const immolation = audit.rows.find((row) => row.id === "xanathar-immolazione");
  const planeShift = audit.rows.find((row) => row.id === "plane-shift");

  assert.equal(immolation?.integration.cast.valid, false);
  assert.equal(immolation?.integration.cast.mutationMode, "none");
  assert.equal(immolation?.integration.status, "disconnected");
  assert.ok(immolation?.integration.issues.some((issue) =>
    issue.code === "CAST_NO_MUTATIONS"
  ));

  assert.equal(planeShift?.integration.catalog.exposed, false);
  assert.equal(planeShift?.integration.status, "disconnected");
  assert.ok(planeShift?.integration.issues.some((issue) =>
    issue.code === "UNIFIED_CATALOG_MISSING"
  ));
});
