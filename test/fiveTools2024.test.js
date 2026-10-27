// Attacchi dei mostri, fase 3, lotto 6: gli statblock 2024 opzionali. Spenti, tutto come prima (rifiutati); accesi
// dall'opzione di questo browser, si importano segnati «· 2024» e si giocano con le regole 2014 del plugin.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fiveToolsCollection, fiveToolsMonsterLabel, fiveToolsMonsterToStatblock, isFiveTools2024 } from "../src/fiveToolsMonsterCore.js";
import { normalizeOptionsPanelDraft, buildOptionsPanelPatches } from "../src/options/optionsPanelCore.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectFiveTools2024 } from "../src/options/optionsSelectors.js";

// A short 2024 block, written for the test: the 2024 tags, the 2025 Monster Manual's code.
const warrior = { name: "Test Warrior", source: "XMM", ac: [15], hp: { average: 10, formula: "3d6" },
  action: [{ name: "Scimitar", entries: ["{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage."] }] };
const chief = { name: "Test Chief", source: "HOMEBREW", _copy: { name: "Test Warrior", source: "XMM" } };
const goblin = { name: "Goblin", source: "MM", ac: [15], hp: { average: 7 },
  action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] };

test("spenti: un mostro 2024 e un derivato da una base 2024 restano rifiutati", () => {
  assert.equal(isFiveTools2024(warrior), true);
  assert.match(fiveToolsMonsterToStatblock(warrior).error, /regole 2024/);
  assert.match(fiveToolsMonsterToStatblock(chief, { pool: [warrior] }).error, /deriva da Test Warrior \(XMM\), un mostro delle regole 2024/);
  const collection = fiveToolsCollection([{ monster: [warrior, goblin] }]);
  assert.deepEqual([collection.monsters.map((monster) => monster.name), collection.excluded2024], [["Goblin"], 1]);
});

test("accesi: il mostro 2024 si importa, il rapporto dice che le regole restano 2014; l'elenco lo segna «· 2024»", () => {
  const converted = fiveToolsMonsterToStatblock(warrior, { allow2024: true });
  assert.equal(converted.error, "");
  assert.equal(converted.block.name, "Test Warrior");
  assert.equal(converted.report[0], "regole 2024: condizioni e regole del tracker restano quelle del 2014");
  const derived = fiveToolsMonsterToStatblock(chief, { pool: [warrior], allow2024: true });
  assert.equal(derived.error, "");
  assert.ok(derived.report.includes("regole 2024: condizioni e regole del tracker restano quelle del 2014"), "derived from a 2024 base");
  const collection = fiveToolsCollection([{ monster: [warrior, goblin] }], { allow2024: true });
  assert.deepEqual([collection.monsters.map((monster) => monster.name), collection.excluded2024], [["Goblin", "Test Warrior"], 0]);
  assert.equal(fiveToolsMonsterLabel(warrior), "Test Warrior (XMM) · 2024");
  assert.equal(fiveToolsMonsterLabel(goblin), "Goblin (MM)");
  assert.ok(!fiveToolsMonsterToStatblock(goblin, { allow2024: true }).report.some((line) => /regole 2024/.test(line)), "a 2014 monster says nothing");
});

test("l'opzione «Statblock 2024»: di questo browser, spenta di default, una casella nel pannello Opzioni", () => {
  assert.equal(selectFiveTools2024(resolveOptions({ local: {}, room: {}, scene: {} })), false);
  assert.equal(selectFiveTools2024(resolveOptions({ local: { tools: { fiveTools2024: true } }, room: {}, scene: {} })), true);
  assert.equal(selectFiveTools2024(resolveOptions({ local: { tools: { fiveTools2024: "sì" } }, room: {}, scene: {} })), false, "only true turns it on");
  const draft = normalizeOptionsPanelDraft({ local: { fiveTools2024: true } });
  assert.equal(buildOptionsPanelPatches(draft).local.tools.fiveTools2024, true);
  assert.match(readFileSync(new URL("../options-modal.html", import.meta.url), "utf8"), /type="checkbox" data-local="fiveTools2024"/);
});
