import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L19 of the bugfix pass: polish R2 (docs/PIANO_BUGFIX_POLISHING.md, section 3), the errors without a message and
// the risky actions. The panels are pages with their own DOM: these check the wiring in their sources.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L19: il pannello Condizioni dice quando Aggiungi o Rimuovi non riescono e ridà il pulsante", () => {
  const panel = read("../src/effects-modal.ts");
  assert.match(panel, /function notifyEffectsError\(action: string, error: any\) \{[\s\S]{0,200}OBR\.notification\.show\(/);
  assert.match(panel, /\} catch \(error: any\) \{\n\s+notifyEffectsError\("Applicazione", error\);\n\s+setButtonEnabled\(addButton, true\);/);
  assert.match(panel, /\} catch \(error: any\) \{\n\s+notifyEffectsError\("Rimozione", error\);\n\s+setButtonEnabled\(button, true\);/);
});

test("L19: Rimuovi Tutto chiede un secondo clic e dice quanti token raggiunge", () => {
  const panel = read("../src/effects-modal.ts");
  assert.match(panel, /if \(Date\.now\(\) > removeAllArmedUntil\) \{\n\s+removeAllArmedUntil = Date\.now\(\) \+ 4000;/);
  assert.match(panel, /`Conferma: \$\{tokenCount\} token`/);
  assert.doesNotMatch(panel, /removeAllButton\.addEventListener\("click", \(\) => \{\n\s+void removeRows\(visibleEffectRows\);/);
});

test("L19: menu Condizioni, quota, proposta delle creature e PF condivisi danno un messaggio", () => {
  assert.match(read("../src/ctx-conditions.ts"), /OBR\.notification\.show\("Condizione non applicata:/);
  assert.match(read("../src/ctx-elevation.js"), /OBR\.notification\.show\("Quota non salvata:/);
  const console = read("../src/pc-attack.js");
  assert.equal(console.split(`setStatus("Creature vicine non lette dalla mappa: spuntale a mano.")`).length - 1, 2);
  const shared = read("../src/shared-hp-modal.js");
  assert.match(shared, /\} catch \(error\) \{ setStatus\(sharedHpErrorText\(error\), "error"\); \}/);
  assert.match(shared, /"shared-hp-incompatible-values": "i PF del principale sono cambiati/);
});

test("L19: un indirizzo 5eTools non valido ferma il salvataggio delle opzioni", () => {
  const modal = read("../src/options-modal.js");
  assert.match(modal, /async function save\(\) \{\n\s+if \(saving \|\| !draft\) return;\n\s+const invalidUrls = await invalidFiveToolsFields\(\)/);
  assert.match(modal, /\["fiveToolsArchiveInput", "Archivio 5eTools", normalizeFiveToolsArchiveBase\]/);
});

test("L19: le voci scartate dei pacchetti privati si contano nel pannello Pacchetti", () => {
  const reference = read("../src/reference-modal.js");
  assert.match(reference, /const skipped = Number\(rules\.merged\?\.skipped\) \|\| 0;/);
  assert.match(reference, /setRulesCatalog\(mergeRulesCatalogs\(rules\.srd, list\)\);\n\s+if \(packs\.open\) renderPacks\(\);/);
});

test("L19: la scheda non si salva con Invio nella ricerca e chiede prima di chiudere con modifiche", () => {
  const card = read("../src/initiative-card-modal.js");
  assert.match(card, /\$\("sheetImportSearch"\)\.addEventListener\("keydown", \(event\) => \{\n\s+if \(event\.key !== "Enter" \|\| event\.isComposing\) return;\n\s+event\.preventDefault\(\);/);
  assert.match(card, /if \(editing && editorChanged && !window\.confirm\("Chiudere la scheda\? Le modifiche non salvate andranno perse\."\)\) return;/);
  assert.match(card, /function setEditing\(active\) \{\n\s+editing = !!active;\n\s+editorChanged = false;/);
});

test("L19: Annulla sul nome del nuovo registro non crea nulla", () => {
  assert.match(read("../src/history-modal.ts"), /const typedName = window\.prompt\("Nome del nuovo combattimento:", ""\);\n\s+if \(typedName === null\) return;/);
});

test("L19: la console PF raggiunge solo i bersagli selezionati che il filtro mostra", () => {
  const modal = read("../src/quick-hp-modal.js");
  assert.match(modal, /return targets\.filter\(\(item\) => selectedIds\.has\(item\.id\) && targetMatchesFilters\(item\)\);/);
  assert.match(modal, /const liveItems = liveSceneItems\.filter\(item => selectedInView\.has\(item\.id\)\);/);
  assert.match(modal, /sono nascosti dal filtro: restano esclusi\./);
});
