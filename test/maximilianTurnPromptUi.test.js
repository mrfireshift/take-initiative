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

test("il chooser con una sola azione usa il pulsante compatto senza descrizione duplicata", () => {
  assert.match(html, /#app\[data-mode="compact"\] \.actions/);
  assert.match(html, /\.action--compact/);
  assert.match(controller, /request\?\.actions\) && request\.actions\.length === 1/);
  assert.match(controller, /compact \? "action action--compact" : "action"/);
  assert.match(controller, /if \(!compact\)/);
  assert.match(html, /\.action--compact strong \{ font:inherit; \}/);
  assert.match(turnController, /SINGLE_ACTION_CHOICE_POPOVER_HEIGHT = 150/);
  assert.match(turnController, /if \(actionCount === 1\) return SINGLE_ACTION_CHOICE_POPOVER_HEIGHT/);
});

test("l'azione ripetibile del popup può restare aperta dopo il consumo", () => {
  assert.match(controller, /active-action-complete/);
  assert.match(turnController, /repeatableThisTurn/);
  assert.match(turnController, /remainingGroup/);
});
