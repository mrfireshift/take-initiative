import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  application: "../src/spellApplicationExecutor.js",
  area: "../src/spellAreaResolutionExecutor.js",
  reminder: "../src/reminderResolution.js",
};

function sourceFor(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("i tre producer CL-3 usano il core puro e conservano il percorso History", () => {
  for (const [name, relative] of Object.entries(files)) {
    const source = sourceFor(relative);
    assert.match(source, /buildSpellCausality/u, name);
    assert.doesNotMatch(source, /appendCombatLogEvent|recordCombatLog\(/u, name);
  }
});

test("la risoluzione area arricchisce decorateEntry e non crea entry per target", () => {
  const source = sourceFor(files.area);
  assert.match(source, /withItemMetaHistory\(\{/u);
  assert.match(source, /causality: spellAreaCausality\(plan\)/u);
  assert.match(source, /decorateCompositeEffectsHistoryEntry/u);
  assert.doesNotMatch(source, /for \(const .*target.*\)\s*\{[\s\S]{0,300}withItemMetaHistory/u);
});

test("la causalità active separa tiro, danno richiesto e delta HP", () => {
  const source = sourceFor(files.application);
  assert.match(source, /resolutionDamageByTarget/u);
  assert.match(source, /requestedDamage: damage\.amount/u);
  assert.match(source, /appliedHpDelta/u);
  assert.match(source, /damageRoll/u);
});

test("nessun producer CL-3 aggiunge letture SDK per recuperare nomi", () => {
  const application = sourceFor(files.application);
  const area = sourceFor(files.area);
  const reminder = sourceFor(files.reminder);
  assert.match(application, /const byId = new Map\(items\.map/u);
  assert.match(area, /const allItems = Array\.isArray\(plan\?\.allItems\)/u);
  assert.match(reminder, /buildReminderResolutionPlan\(/u);
  assert.doesNotMatch(reminder.slice(reminder.indexOf("function reminderCausality"), reminder.indexOf("async function executeReminderResolution")), /OBR\./u);
});

test("initiativeList e i workflow classi non sono dipendenze del nuovo core", () => {
  const core = sourceFor("../src/combatLogCausalityCore.js");
  assert.doesNotMatch(core, /initiativeList|classFeature/i);
});
