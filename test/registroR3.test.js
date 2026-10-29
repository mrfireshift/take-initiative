import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20 of the bugfix pass, polish R3 "Registro" (docs/PIANO_BUGFIX_POLISHING.md, section 3). The History panel is
// a page with its own DOM and SDK: these check its wiring in the source.
const modal = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L20: «Statistiche archivio» chiude l'operazione prima di mostrare il risultato", () => {
  const handler = modal.slice(modal.indexOf("storageStats.addEventListener(\"click\""), modal.indexOf("retention.addEventListener(\"click\""));
  assert.match(handler, /if \(!stats\) \{\n\s+await renderAfterStorageAction\("Statistiche dell'archivio non disponibili\."\);\n\s+return;\n\s+\}\n\s+await renderAfterStorageAction\(`Archivio locale: /);
  assert.doesNotMatch(handler, /await scheduleRender\(/, "drawn while the action still ran, every button stayed disabled");
  assert.match(modal, /async function renderAfterStorageAction\(message: string\) \{\n\s+combatLogStorageAction = false;/);
});

test("L20: un registro archiviato si esporta dal menu «Da esportare» senza diventare quello attivo", () => {
  assert.match(modal, /let combatLogExportSessionId = "";/);
  assert.match(modal, /exportTargetField\.append\(document\.createTextNode\("Da esportare"\), exportTarget\);/);
  assert.match(modal, /toolbarMenu\("Esporta\/importa", "log-export\.svg", \[exportTargetField, exportText, exportJson, importJson\]\)/);
  for (const exporter of ["getCombatLogExportData(target.id", "exportCombatLogJSONFromStorage(target.id"]) {
    assert.ok(modal.includes(exporter), exporter);
  }
  assert.doesNotMatch(modal, /getCombatLogExportData\(session\.id|exportCombatLogJSONFromStorage\(session\.id/);
  const exportHandlers = modal.slice(modal.indexOf("exportText.addEventListener(\"click\""), modal.indexOf("importJson.addEventListener(\"click\""));
  assert.doesNotMatch(exportHandlers, /activateCombatLogSession/, "exporting never activates the registro");
  // The select inside the menu does not close it when used: only its buttons do.
  assert.match(modal, /for \(const control of controls\) \{\n\s+if \(control\.tagName !== "BUTTON"\) \{\n\s+menu\.appendChild\(control\);\n\s+continue;/);
});
