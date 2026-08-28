import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpellAutomationAudit,
  renderSpellAutomationMarkdown,
} from "../scripts/audit-spell-automation.mjs";

test("l'audit copre l'intero catalogo e conserva le evidenze disponibili", () => {
  const audit = buildSpellAutomationAudit();
  assert.equal(audit.summary.catalogTotal, 477);
  assert.equal(audit.summary.catalog, 477);
  assert.equal(audit.rows.length, 477);
  assert.equal(audit.summary.excluded, 103);
  assert.equal(new Set(audit.rows.map((row) => row.id)).size, 477);
  assert.ok(audit.excluded.every((e) => audit.rows.some((row) => row.id === e.id)));
  assert.equal(audit.rows.find((row) => row.id === "legacy-crusaders-mantle")?.textAvailable, false);
});

test("ogni row possiede assi validi di automazione, copertura, target ed esposizione", () => {
  const audit = buildSpellAutomationAudit();
  const validAutomation = ["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL"];
  const validCoverage = ["ACCEPTED", "CLOSED", "GAP", "UNREVIEWED"];
  const validTarget = ["FULL", "PARTIAL", "TRACK_ONLY", "MANUAL", "UNREVIEWED"];
  const validUi = ["UNIFIED", "TRACKER_ONLY", "REFERENCE_ONLY", "NONE"];
  const validTargetUi = ["UNIFIED", "TRACKER_ONLY", "REFERENCE_ONLY", "NONE", "UNREVIEWED"];

  assert.ok(audit.rows.every((row) => validAutomation.includes(row.currentAutomationLevel)));
  assert.ok(audit.rows.every((row) => validCoverage.includes(row.coverageStatus)));
  assert.ok(audit.rows.every((row) => validTarget.includes(row.targetAutomationLevel)));
  assert.ok(audit.rows.every((row) => validUi.includes(row.currentUiExposure)));
  assert.ok(audit.rows.every((row) => validTargetUi.includes(row.targetUiExposure)));
});

test("MANUAL non implica automaticamente ACCEPTED o UI exclusion", () => {
  const audit = buildSpellAutomationAudit();
  assert.ok(audit.rows.some((row) => row.currentAutomationLevel === "MANUAL" && row.coverageStatus !== "ACCEPTED"));
  assert.ok(audit.rows.some((row) => row.currentAutomationLevel === "MANUAL" && row.targetUiExposure === "UNIFIED"));
});

test("Fireball non viene auto-ACCEPTED e resta UNREVIEWED in assenza di review curata", () => {
  const audit = buildSpellAutomationAudit();
  const fireball = audit.rows.find((row) => row.id === "fireball");
  assert.ok(fireball);
  assert.equal(fireball.currentAutomationLevel, "PARTIAL");
  assert.equal(fireball.coverageStatus, "UNREVIEWED");
  assert.equal(fireball.targetAutomationLevel, "UNREVIEWED");
});

test("Call Lightning con review curata completa senza gap e ACCEPTED con target FULL", () => {
  const audit = buildSpellAutomationAudit();
  const callLightning = audit.rows.find((row) => row.id === "call-lightning");
  assert.ok(callLightning);
  assert.equal(callLightning.currentAutomationLevel, "FULL");
  assert.equal(callLightning.coverageStatus, "ACCEPTED");
  assert.equal(callLightning.targetAutomationLevel, "FULL");
  assert.deepEqual(callLightning.gaps, []);
});

test("Haste include la meccanica di movimento ed e ACCEPTED tramite review curata completa", () => {
  const audit = buildSpellAutomationAudit();
  const haste = audit.rows.find((row) => row.id === "haste");
  assert.ok(haste);
  assert.equal(haste.runtime.movementMechanics, true);
  assert.notEqual(haste.currentAutomationLevel, "TRACK_ONLY");
  assert.equal(haste.currentAutomationLevel, "FULL");
  assert.equal(haste.coverageStatus, "ACCEPTED");
  assert.equal(haste.targetAutomationLevel, "FULL");
});

test("Gabbia dell'Anima è accettata come tracking-only", () => {
  const audit = buildSpellAutomationAudit();
  const soulCage = audit.rows.find((row) => row.id === "xanathar-gabbia-dellanima");
  assert.ok(soulCage);
  assert.equal(soulCage.currentAutomationLevel, "TRACK_ONLY");
  assert.equal(soulCage.coverageStatus, "ACCEPTED");
  assert.equal(soulCage.targetAutomationLevel, "TRACK_ONLY");
  assert.deepEqual(soulCage.gaps, []);
  assert.deepEqual(soulCage.runtime.activeActionIds, []);
  assert.deepEqual(soulCage.runtime.smokeCategories, ["PERSISTENCE"]);
  assert.match(soulCage.curatedNote || "", /^PASS:/u);
});

test("Lama Infuocata e Lama d'Ombra sono CLOSED come tracking-only", () => {
  const audit = buildSpellAutomationAudit();
  for (const id of ["flame-blade", "xanathar-lama-dombra"]) {
    const spell = audit.rows.find((row) => row.id === id);
    assert.ok(spell, id);
    assert.equal(spell.currentAutomationLevel, "TRACK_ONLY", id);
    assert.equal(spell.coverageStatus, "CLOSED", id);
    assert.equal(spell.targetAutomationLevel, "TRACK_ONLY", id);
    assert.equal(spell.priority, "—", id);
    assert.deepEqual(spell.gaps, [], id);
    assert.equal(spell.gaps.some((entry) => entry.code === "REPEATED_ACTION"), false, id);
    assert.match(spell.curatedNote || "", /TRACK_ONLY\/CLOSED/iu, id);
  }
});

test("Aura di Vitalità e Aura di Vita sono CLOSED dopo la verifica del workflow", () => {
  const audit = buildSpellAutomationAudit();
  const vitality = audit.rows.find((row) => row.id === "phb2014-aura-di-vitalita");
  const life = audit.rows.find((row) => row.id === "phb2014-aura-di-vita");

  assert.equal(vitality?.coverageStatus, "CLOSED");
  assert.equal(vitality?.currentAutomationLevel, "FULL");
  assert.equal(vitality?.targetAutomationLevel, "FULL");
  assert.deepEqual(vitality?.gaps, []);
  assert.match(vitality?.curatedNote || "", /FULL\/CLOSED/u);

  assert.equal(life?.coverageStatus, "CLOSED");
  assert.equal(life?.currentAutomationLevel, "PARTIAL");
  assert.equal(life?.targetAutomationLevel, "PARTIAL");
  assert.deepEqual(life?.gaps, []);
  assert.match(life?.curatedNote || "", /PARTIAL\/CLOSED/u);
});

test("Guscio Anti-vita è PASS/PARTIAL-CLOSED con crossing e boundary manuali accettati", () => {
  const audit = buildSpellAutomationAudit();
  const shell = audit.rows.find((row) => row.id === "antilife-shell");
  assert.ok(shell);
  assert.equal(shell.currentAutomationLevel, "PARTIAL");
  assert.equal(shell.targetAutomationLevel, "PARTIAL");
  assert.equal(shell.coverageStatus, "CLOSED");
  assert.equal(shell.priority, "—");
  assert.deepEqual(shell.gaps, []);
  assert.deepEqual(shell.runtime.activeActionIds, []);
  assert.deepEqual(shell.runtime.triggerIds, []);
  assert.deepEqual(shell.runtime.areaKinds, ["aura"]);
  assert.match(shell.curatedNote || "", /PASS: Guscio Anti-vita è PARTIAL\/CLOSED/u);
  assert.match(shell.curatedNote || "", /attraversamento\/crossing/u);
});

test("Palla di Fuoco Ritardata è PASS/PARTIAL-CLOSED con interazioni manuali accettate", () => {
  const audit = buildSpellAutomationAudit();
  const spell = audit.rows.find((row) => row.id === "delayed-blast-fireball");
  assert.ok(spell);
  assert.equal(spell.currentAutomationLevel, "PARTIAL");
  assert.equal(spell.coverageStatus, "CLOSED");
  assert.equal(spell.targetAutomationLevel, "PARTIAL");
  assert.equal(spell.priority, "—");
  assert.deepEqual(spell.gaps, []);
  assert.deepEqual(spell.runtime.areaKinds, ["zone"]);
  assert.equal(spell.runtime.movementMechanics, true);
  assert.match(spell.curatedNote || "", /^PASS: Palla di Fuoco Ritardata è PARTIAL\/CLOSED/u);
  assert.match(spell.curatedNote || "", /contatto automatico/u);
  assert.match(spell.curatedNote || "", /fuoco sugli oggetti/u);
});

test("Muro di Vento è PASS/PARTIAL-ACCEPTED con vincoli passivi manuali", () => {
  const audit = buildSpellAutomationAudit();
  const wall = audit.rows.find((row) => row.id === "wind-wall");
  assert.ok(wall);
  assert.equal(wall.currentAutomationLevel, "PARTIAL");
  assert.equal(wall.targetAutomationLevel, "PARTIAL");
  assert.equal(wall.coverageStatus, "ACCEPTED");
  assert.equal(wall.priority, "—");
  assert.deepEqual(wall.gaps, []);
  assert.deepEqual(wall.runtime.areaKinds, ["zone"]);
  assert.deepEqual(wall.runtime.triggerIds, []);
  assert.deepEqual(wall.runtime.activeActionIds, []);
  assert.equal(wall.runtime.saveAutomation, true);
  assert.equal(wall.integration.status, "reachable");
  assert.equal(wall.integration.contract.lane, "area-transaction");
  assert.equal(wall.integration.contract.placementPolicy, "required");
  assert.match(wall.curatedNote || "", /^PASS: Muro di Vento è PARTIAL\/ACCEPTED/u);
  assert.match(wall.curatedNote || "", /proiettili/u);
  assert.match(wall.curatedNote || "", /crossing/u);
});

test("le spell lavorate nella tranche RAW sono PASS", () => {
  const audit = buildSpellAutomationAudit();
  for (const id of ["slow", "confusion", "fear", "contagion", "flesh-to-stone"]) {
    const spell = audit.rows.find((row) => row.id === id);
    assert.ok(spell, id);
    assert.equal(spell.currentAutomationLevel, "FULL", id);
    assert.equal(spell.coverageStatus, "ACCEPTED", id);
    assert.equal(spell.targetAutomationLevel, "FULL", id);
    assert.equal(spell.priority, "—", id);
    assert.deepEqual(spell.gaps, [], id);
    assert.match(spell.curatedNote || "", /^PASS:/u, id);
  }
});

test("Longstrider include la meccanica di movimento ma resta UNREVIEWED senza review curata", () => {
  const audit = buildSpellAutomationAudit();
  const longstrider = audit.rows.find((row) => row.id === "longstrider");
  assert.ok(longstrider);
  assert.equal(longstrider.runtime.movementMechanics, true);
  assert.notEqual(longstrider.currentAutomationLevel, "TRACK_ONLY");
  assert.equal(longstrider.currentAutomationLevel, "PARTIAL");
  assert.equal(longstrider.coverageStatus, "UNREVIEWED");
  assert.equal(longstrider.targetAutomationLevel, "UNREVIEWED");
});

test("Muro di Fuoco è completo dopo l'audit del workflow persistente", () => {
  const audit = buildSpellAutomationAudit();
  const wall = audit.rows.find((row) => row.id === "wall-of-fire");
  assert.ok(wall);
  assert.equal(wall.currentAutomationLevel, "FULL");
  assert.equal(wall.coverageStatus, "ACCEPTED");
  assert.equal(wall.targetAutomationLevel, "FULL");
  assert.equal(wall.priority, "—");
  assert.deepEqual(wall.gaps, []);
});

test("Investitura del Vento e Investitura della Pietra sono accettate", () => {
  const audit = buildSpellAutomationAudit();
  for (const id of ["xanathar-investitura-del-vento", "xanathar-investitura-della-pietra"]) {
    const spell = audit.rows.find((row) => row.id === id);
    assert.ok(spell, id);
    assert.equal(spell.coverageStatus, "ACCEPTED", id);
    assert.deepEqual(spell.gaps, [], id);
    assert.match(spell.curatedNote || "", /^PASS:/u, id);
  }
});

test("una spell intenzionalmente manuale ha target MANUAL e non forza targetUiExposure UNIFIED", () => {
  const audit = buildSpellAutomationAudit();
  const wish = audit.rows.find((row) => row.id === "wish");
  assert.ok(wish);
  assert.equal(wish.currentAutomationLevel, "MANUAL");
  assert.equal(wish.coverageStatus, "ACCEPTED");
  assert.equal(wish.targetAutomationLevel, "MANUAL");
  assert.equal(wish.currentUiExposure, "REFERENCE_ONLY");
  assert.equal(wish.targetUiExposure, "UNREVIEWED");
});

test("una spell non-unified senza decisione esplicita ha targetUiExposure UNREVIEWED e non e bloccante P0", () => {
  const audit = buildSpellAutomationAudit();
  const planeShift = audit.rows.find((row) => row.id === "plane-shift");
  assert.ok(planeShift);
  assert.equal(planeShift.integration.catalog.exposed, false);
  assert.equal(planeShift.currentUiExposure, "REFERENCE_ONLY");
  assert.equal(planeShift.targetUiExposure, "UNREVIEWED");
  assert.ok(planeShift.integration.issues.some((issue) => issue.code === "UNIFIED_CATALOG_MISSING"));
  assert.equal(planeShift.integration.priority, "—");
});

test("verificationEvidence non assegna UNIT_TEST tramite whitelist hardcoded e releaseReady resta false", () => {
  const audit = buildSpellAutomationAudit();
  const mantle = audit.rows.find((row) => row.id === "legacy-crusaders-mantle");
  assert.ok(mantle);
  assert.equal(mantle.verificationEvidence.includes("UNIT_TEST"), false);
  assert.ok(audit.rows.every((row) => !row.verificationEvidence.includes("UNIT_TEST")));
  assert.equal(audit.summary.releaseReady, false);
});

test("le lacune curate restano separate dalle candidate testuali", () => {
  const audit = buildSpellAutomationAudit();
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
  const disperse = audit.rows.find((row) => row.id === "xanathar-disperdere");
  const massPolymorph = audit.rows.find((row) => row.id === "xanathar-metamorfosi-di-massa");
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
  assert.equal(elementalBane?.coverageStatus, "ACCEPTED");
  assert.equal(elementalBane?.priority, "—");
  assert.deepEqual(elementalBane?.gaps, []);
  assert.match(elementalBane?.curatedNote || "", /non dispone degli strumenti/);
  assert.match(elementalBane?.curatedNote || "", /pairwise/);
  for (const row of [banishment]) {
    assert.equal(row?.runtime.saveAutomation, true, row?.id);
    assert.ok(!row?.gaps.some((entry) => entry.code === "SAVE_WORKFLOW_MISSING"), row?.id);
  }
  assert.equal(disperse?.exclusionReason, "gestione manuale intenzionale");
  assert.equal(massPolymorph?.exclusionReason, "gestione manuale intenzionale");
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
  assert.match(markdown, /\| Lama d'Ombra \| `xanathar-lama-dombra` \| Xanathar \/ 2 \| TRACK_ONLY \| CLOSED \| TRACK_ONLY \|/);
  assert.match(markdown, /\| Lama infuocata \| `flame-blade` \| SRD 5\.1 \/ 2 \| TRACK_ONLY \| CLOSED \| TRACK_ONLY \|/);
  assert.match(markdown, /`CLOSED` indica una decisione di prodotto chiusa/);
});

test("Spruzzo Prismatico è FULL/ACCEPTED senza gap random o di multi-save", () => {
  const audit = buildSpellAutomationAudit();
  const spell = audit.rows.find((row) => row.id === "prismatic-spray");
  assert.ok(spell);
  assert.equal(spell.currentAutomationLevel, "FULL");
  assert.equal(spell.coverageStatus, "ACCEPTED");
  assert.equal(spell.priority, "—");
  assert.deepEqual(spell.gaps, []);
  assert.equal(spell.integration.cast.valid, true);
  assert.match(spell.curatedNote || "", /tiro fisico del d8/i);
  assert.match(spell.curatedNote || "", /trasferimento materiale fra piani/i);
});

test("l'audit separa conformita RAW e raggiungibilita nella console unificata", () => {
  const audit = buildSpellAutomationAudit();
  assert.equal(audit.schemaVersion, 5);
  assert.ok(audit.rows.every((row) => row.integration?.status));
  assert.ok(audit.summary.unifiedCatalogExposed > 0);
  assert.ok(audit.summary.byIntegrationStatus.reachable > 0);
});

test("Invocare il Fulmine resta raggiungibile sia dalla scheda sia dal reminder", () => {
  const audit = buildSpellAutomationAudit();
  const callLightning = audit.rows.find((row) => row.id === "call-lightning");

  assert.equal(callLightning?.integration.catalog.exposed, true);
  assert.equal(callLightning?.integration.contract.lane, "area-transaction");
  assert.equal(callLightning?.integration.cast.adapter, "area-transaction");
  assert.equal(callLightning?.integration.cast.valid, true);
  assert.ok(callLightning?.integration.persistence.ruleIds.includes("call-lightning:cloud"));
  assert.deepEqual(callLightning?.integration.actions.declaredActionIds, ["call-lightning-strike"]);
  assert.deepEqual(callLightning?.integration.actions.panelActionIds, ["call-lightning-strike"]);
  assert.deepEqual(callLightning?.integration.actions.reminderActionIds, ["call-lightning-strike"]);
  assert.equal(callLightning?.integration.actions.mode, "panel-and-reminder");
  assert.equal(callLightning?.integration.status, "reachable");
  assert.equal(callLightning?.integration.issues.some((issue) =>
    issue.code === "ACTIVE_ACTION_REMINDER_ONLY"
  ), false);
});

test("Animate Objects ha un cast sintetico valido tramite contract composition e resta PARTIAL/UNREVIEWED", () => {
  const audit = buildSpellAutomationAudit();
  const anim = audit.rows.find((row) => row.id === "animate-objects");
  assert.ok(anim);
  assert.equal(anim.integration.contract.lane, "spell-lifecycle");
  assert.equal(anim.integration.cast.valid, true);
  assert.equal(anim.integration.cast.adapter, "area-transaction");
  assert.equal(anim.integration.issues.some((issue) => issue.code === "CAST_PATH_INVALID"), false);
  assert.notEqual(anim.integration.status, "disconnected");
  assert.equal(anim.currentAutomationLevel, "PARTIAL");
  assert.equal(anim.coverageStatus, "UNREVIEWED");
  assert.equal(anim.targetAutomationLevel, "UNREVIEWED");
});

test("Modellare Acqua e Modellare Terra non hanno falsi RAW gaps e restano MANUAL/UNREVIEWED", () => {
  const audit = buildSpellAutomationAudit();
  const moldWater = audit.rows.find((row) => row.id === "xanathar-modellare-acqua");
  const moldEarth = audit.rows.find((row) => row.id === "xanathar-modellare-terra");

  assert.ok(moldWater);
  assert.equal(moldWater.currentAutomationLevel, "MANUAL");
  assert.equal(moldWater.coverageStatus, "UNREVIEWED");
  assert.equal(moldWater.targetAutomationLevel, "UNREVIEWED");
  assert.deepEqual(moldWater.gaps, []);
  assert.equal(moldWater.integration.issues.some((issue) => issue.code === "CAST_NO_MUTATIONS" && issue.severity === "P0"), false);

  assert.ok(moldEarth);
  assert.equal(moldEarth.currentAutomationLevel, "MANUAL");
  assert.equal(moldEarth.coverageStatus, "UNREVIEWED");
  assert.equal(moldEarth.targetAutomationLevel, "UNREVIEWED");
  assert.deepEqual(moldEarth.gaps, []);
  assert.equal(moldEarth.integration.issues.some((issue) => issue.code === "CAST_NO_MUTATIONS" && issue.severity === "P0"), false);
});

test("le spell già lavorate nella tranche corrente sono ACCEPTED", () => {
  const audit = buildSpellAutomationAudit();
  const immolation = audit.rows.find((row) => row.id === "xanathar-immolazione");
  const flame = audit.rows.find((row) => row.id === "xanathar-investitura-della-fiamma");
  const storm = audit.rows.find((row) => row.id === "xanathar-sfera-della-tempesta");
  const hail = audit.rows.find((row) => row.id === "phb2014-raffica-di-spine");
  const fireArrows = audit.rows.find((row) => row.id === "xanathar-frecce-infuocate");
  const crown = audit.rows.find((row) => row.id === "xanathar-corona-di-stelle");
  const wall = audit.rows.find((row) => row.id === "xanathar-muro-di-luce");

  assert.equal(immolation?.coverageStatus, "ACCEPTED");
  assert.deepEqual(immolation?.gaps, []);
  assert.equal(immolation?.integration.issues.some((issue) => issue.code === "CAST_NO_MUTATIONS"), false);

  assert.equal(flame?.coverageStatus, "ACCEPTED");
  assert.equal(flame?.currentAutomationLevel, "FULL");
  assert.deepEqual(flame?.gaps, []);
  assert.deepEqual(flame?.integration.issues, []);

  for (const row of [storm, hail, fireArrows, crown, wall]) {
    assert.equal(row?.coverageStatus, "ACCEPTED", row?.id);
    assert.equal(row?.currentAutomationLevel, "FULL", row?.id);
    assert.equal(row?.targetAutomationLevel, "FULL", row?.id);
    assert.deepEqual(row?.gaps, [], row?.id);
    assert.match(row?.curatedNote || "", /^PASS:/u, row?.id);
  }
  assert.equal(storm?.integration.actions.mode, "turn-prompt");
  assert.deepEqual(storm?.integration.issues, []);
});

test("runtimeSmokeRequired resta coerente con smokeCategories e l'audit e deterministico", () => {
  const audit1 = buildSpellAutomationAudit();
  const audit2 = buildSpellAutomationAudit();

  assert.ok(audit1.rows.every((row) => row.integration.smokeRequired === (row.smokeCategories.length > 0)));
  assert.equal(audit1.fingerprint, audit2.fingerprint);
  assert.deepEqual(audit1, audit2);
});
