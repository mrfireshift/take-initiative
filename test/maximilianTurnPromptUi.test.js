import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../spell-turn-action-choice.html");
const controller = read("../src/spell-turn-action-choice.js");
const turnController = read("../src/callLightningTurnPromptController.js");
const vite = read("../vite.config.js");

test("Maximilian usa un chooser di turno con Afferra e Stritola e routing al popup attivo", () => {
  assert.match(html, /id="actions"/);
  assert.match(controller, /maximilian-earth-grasp-grab/);
  assert.match(controller, /maximilian-earth-grasp-crush/);
  assert.match(controller, /spell-turn-prompt-action/);
  assert.match(turnController, /spell-turn-action-choice\.html/);
  assert.match(turnController, /select-action/);
  assert.match(vite, /spellTurnActionChoice/);
});
