import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

import { readableResourceExpression } from "../src/resourceExpressionText.js";
import { zoneTriggerResourceSpend } from "../src/zoneResourceCore.js";

// Lot L18 of the bugfix pass: the texts of polish R1 (docs/PIANO_BUGFIX_POLISHING.md, section 3).
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L18: le formule delle risorse si leggono in parole sulla scheda", () => {
  assert.equal(readableResourceExpression("max(1, modificatore_carisma)"), "mod. Carisma (minimo 1)");
  assert.equal(readableResourceExpression("2 * bonus_competenza"), "2 × bonus di competenza");
  assert.equal(readableResourceExpression("8 + bonus_competenza + max(modificatore_forza, modificatore_destrezza)"),
    "8 + bonus di competenza + il più alto tra mod. Forza e mod. Destrezza");
  assert.equal(readableResourceExpression("1 + livello_warlock"), "1 + livello di warlock");
  assert.equal(readableResourceExpression("3"), "3");
  assert.match(read("../src/initiative-card-modal.js"), /maximum\.textContent = `Massimo: \$\{readableResourceExpression\(expression\)\}`;/);
});

test("L18: l'ultima risorsa di una zona si legge come contatore a zero", () => {
  const spend = zoneTriggerResourceSpend({
    spellId: "phb2014-cordone-di-frecce", spellName: "Cordone di Frecce", casterId: "caster", targetIds: ["goblin"],
    ownerEntry: { instanceId: "cordon-1", casterId: "caster", castContext: { uses: { key: "ammunition", label: "munizioni", remaining: 1, total: 4 } } },
  });
  assert.equal(spend.note, "Cordone di Frecce: 0/4 munizioni, l'incantesimo termina.");
});

test("L18: la console Boss si chiama così ovunque la veda il GM", () => {
  const html = read("../boss-actions.html");
  assert.match(html, /<title>Console Boss<\/title>/);
  assert.match(html, /id="boss-name">Console Boss</);
  for (const file of ["../src/boss-actions.js", "../src/bossActionExecution.js", "../src/contextMenu.js", "../src/trackerQuickActions.js"]) {
    const source = read(file).split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
    assert.doesNotMatch(source, /"[^"\n]*Boss Actions[^"\n]*"/, file);
  }
});

test("L18: un salvataggio delle opzioni rifiutato dice il motivo in italiano", () => {
  const modal = read("../src/options-modal.js");
  assert.match(modal, /"scene-options-changed-during-write": "le opzioni della scena sono cambiate durante il salvataggio/);
  assert.match(modal, /Impossibile salvare le opzioni: \$\{optionsSaveErrorText\(error\)\}/);
});

test("L18: il configuratore delle fazioni ha le quattro fazioni e le parole della guida", () => {
  const html = read("../faction-configurator.html");
  assert.match(html, /<span class="dot neutral"><\/span>Neutrali<\/div><div class="count" data-count="neutral">/);
  assert.match(html, /data-register="neutral"/);
  assert.match(html, /<span class="dot enemy"><\/span>Nemici</);
  assert.doesNotMatch(html, /Mostri|restera |come ostili|Reset registro/);
  assert.match(html, /data-clear>Azzera registro</);
  assert.match(read("../docs/GUIDA_UTENTE.md"), /\*\*Azzera registro\*\*/);
});

test("L18: testi piccoli del tracker, della console e delle carte", () => {
  const tracker = read("../src/initiativeList.js");
  assert.match(tracker, /"Tutti i token sono già nell'iniziativa\."/);
  assert.match(tracker, /roundPill\.title = "Round del combattimento: avanza quando l'iniziativa torna all'inizio";/);
  assert.match(read("../src/pc-attack.js"), /cylinder:"il cilindro"/);
  assert.match(read("../src/pc-attack.js"), /cylinder:"Nel cilindro"/);
  assert.match(read("../src/death-save-notice.js"), /revived \? "Di nuovo sopra 0 PF: è cosciente\."/);
  assert.match(read("../src/aoeTargetTool.js"), /almeno \$\{formatMeasure\(areaBatch\.minDistanceFeet \/ 5 \* 1\.5\)\} m\./);
  assert.match(read("../src/initiativeCardClassicBuilder.js"), /"Clic: modifica i PF\. \+N\/-N su questo token e sul suo gruppo; ± modifica anche i PF massimi"/);
  assert.match(read("../src/initiativeEditors.js"), /nameLabel\.title = `\$\{String\(nameLabel\.textContent \|\| ""\)\.trim\(\)\}\\nDoppio clic per rinominare il token`/);
  assert.match(read("../src/callLightningTurnPromptController.js"), /`L'istanza di \$\{spell\?\.displayName \|\| "questo incantesimo"\} non è più disponibile\.`/);
});

test("L18: nessun «Â·» (UTF-8 letto due volte) nei sorgenti", () => {
  const sources = readdirSync(new URL("../src/", import.meta.url)).filter((name) => /\.(js|ts)$/.test(name));
  const broken = sources.filter((name) => read(`../src/${name}`).includes("Â·"));
  assert.deepEqual(broken, []);
});

test("L18: il Registro accorda i conteggi e parla di voci, registro, archivio e PF", () => {
  const modal = read("../src/history-modal.ts");
  assert.match(modal, /function countText\(count: number, one: string, many: string\) \{\n\s+return `\$\{count\} \$\{count === 1 \? one : many\}`;/);
  assert.match(modal, /countText\(sessionSummary\.turnCount, "turno", "turni"\)/);
  assert.match(modal, /countText\(visibleTurns\.length, "turno", "turni"\)/);
  assert.match(modal, /"1 operazione precedente non è più annullabile\."/);
  const visible = modal.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
  assert.doesNotMatch(visible, /"[^"\n]*\b(entry|storage|Storage)\b[^"\n]*"|`[^`\n]*\b(entry incomplete|Storage locale|dal log)\b[^`\n]*`/);
  assert.doesNotMatch(visible, /"[^"\n]*\bdal log\b[^"\n]*"/);
  assert.match(read("../src/history.js"), /\(\+\$\{labels\.length - 1\} \$\{labels\.length === 2 \? "evento" : "eventi"\}\)/);
  const presentation = read("../src/combatLogPresentationCore.js");
  assert.doesNotMatch(presentation, /[`"][^`"\n]*\bHP\b[^`"\n]*[`"]/, "PF in the Combat Log");
  assert.match(presentation, /`Archivio: \$\{summary\.localStorageLabel\}`/);
});

test("L18: il motivo di un annullamento bloccato è in parole, senza id del token né codici", () => {
  const modal = read("../src/history-modal.ts");
  assert.match(modal, /"current-value-mismatch": "è cambiato dopo l'operazione"/);
  assert.match(modal, /return \[\.\.\.new Set\(conflicts\.map\(undoConflictText\)\)\]\.slice\(0, 3\)\.join\(" · "\);/);
  assert.doesNotMatch(modal, /conflict\?\.itemId \|\| conflict\?\.id,/);
  assert.match(modal, /reason && !\/\^\[a-z\]\+\(-\[a-z\]\+\)\+\$\/\.test\(reason\) \? reason : undoReadinessLabel\(row\)/);
});

// Lot L17 (SP-4), the turn prompt too: its actions' new effects start on the turn they are used, as in the spell panel.
test("L17: il prompt di turno non passa all'esecutore il turno del lancio", () => {
  const controller = read("../src/callLightningTurnPromptController.js");
  assert.match(controller, /await executeSpellActiveAction\(\{[\s\S]{0,400}\n(\s+\/\/.*\n)+\s+appliedAt: undefined,/);
  assert.doesNotMatch(controller, /appliedAt: group\.appliedAt,/);
});
