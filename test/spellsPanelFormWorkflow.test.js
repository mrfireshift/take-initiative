import test from "node:test";
import assert from "node:assert/strict";

import { wireSpellPanelFormWorkflow } from "../src/spellsPanelFormWorkflow.js";

function createControl(overrides = {}) {
  return {
    checked: false,
    clickCount: 0,
    disabled: false,
    focusCount: 0,
    listeners: {},
    value: "",
    addEventListener(type, listener) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(listener);
    },
    async dispatch(type, event = {}) {
      for (const listener of this.listeners[type] || []) {
        await listener(event);
      }
    },
    focus() {
      this.focusCount += 1;
    },
    click() {
      this.clickCount += 1;
    },
    ...overrides,
  };
}

function createControls(overrides = {}) {
  return {
    form: createControl(),
    nameInput: createControl(),
    durationInput: createControl(),
    concentrationInput: createControl(),
    casterSelect: createControl(),
    conditionChoice: createControl(),
    applyConditionsInput: createControl(),
    submitButton: createControl(),
    cancelButton: createControl(),
    endButton: createControl(),
    ...overrides,
  };
}

test("la validazione conserva focus e ritorni anticipati", async () => {
  const controls = createControls();
  let commits = 0;
  let prevented = 0;
  wireSpellPanelFormWorkflow({
    ...controls,
    getSelectedTargetIds: () => ["target"],
    async onCommit() {
      commits += 1;
    },
  });

  await controls.form.dispatch("submit", {
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(controls.nameInput.focusCount, 1);

  controls.nameInput.value = "Spell manuale";
  controls.durationInput.value = "0";
  await controls.form.dispatch("submit", {
    preventDefault() {
      prevented += 1;
    },
  });

  assert.equal(prevented, 2);
  assert.equal(controls.durationInput.focusCount, 1);
  assert.equal(commits, 0);
  assert.equal(controls.submitButton.disabled, false);
});

test("il submit manuale conserva payload, fallback caster e ordine degli effetti", async () => {
  const controls = createControls();
  controls.nameInput.value = "Aura personalizzata";
  controls.durationInput.value = "3.9";
  controls.concentrationInput.checked = true;
  controls.conditionChoice.value = "smoke";
  controls.applyConditionsInput.checked = true;
  const castContext = { slotLevel: 4 };
  const order = [];
  let payload = null;

  wireSpellPanelFormWorkflow({
    ...controls,
    allCasters: [{ id: "fallback-caster" }],
    getCurrentCastContext: () => castContext,
    getSelectedTargetIds: () => ["target", "target"],
    async onCommit(request) {
      assert.equal(controls.submitButton.disabled, true);
      payload = request;
      order.push("commit");
    },
    async onAfterSubmit() {
      assert.equal(controls.submitButton.disabled, true);
      order.push("after");
    },
    async onClose() {
      order.push("close");
    },
  });

  await controls.form.dispatch("submit", { preventDefault() {} });

  assert.equal(payload.spell, null);
  assert.equal(payload.enteredName, "Aura personalizzata");
  assert.equal(payload.turns, 3);
  assert.equal(payload.casterId, "fallback-caster");
  assert.deepEqual(payload.targetIds, ["target"]);
  assert.equal(payload.castContext, castContext);
  assert.equal(payload.selectedChoice, "smoke");
  assert.equal(payload.phasePlan.phase, "cast");
  assert.equal(payload.applyAutomatedConditions, true);
  assert.equal(payload.requestedConcentration, true);
  assert.deepEqual(order, ["commit", "after", "close"]);
  assert.equal(controls.submitButton.disabled, false);
});

test("una spell preparata risolve sul caster e forza le automazioni", async () => {
  const controls = createControls();
  controls.nameInput.value = "Punizione Collerica";
  controls.durationInput.value = "10";
  controls.casterSelect.value = "paladin";
  controls.applyConditionsInput.checked = false;
  let payload = null;

  wireSpellPanelFormWorkflow({
    ...controls,
    isModal: true,
    getCurrentCastContext: () => ({ slotLevel: 1 }),
    getSelectedTargetIds: () => ["enemy"],
    async onCommit(request) {
      payload = request;
    },
  });

  await controls.form.dispatch("submit", { preventDefault() {} });

  assert.equal(payload.spell.id, "phb2014-punizione-collerica");
  assert.equal(payload.phasePlan.phase, "prepare");
  assert.deepEqual(payload.targetIds, ["paladin"]);
  assert.equal(payload.applyAutomatedConditions, true);
});

test("un errore nel commit riabilita sempre il pulsante", async () => {
  const controls = createControls();
  controls.nameInput.value = "Benedizione";
  controls.durationInput.value = "2";
  controls.casterSelect.value = "cleric";
  let afterCalls = 0;

  wireSpellPanelFormWorkflow({
    ...controls,
    getSelectedTargetIds: () => ["ally"],
    async onCommit() {
      throw new Error("fallimento atteso");
    },
    async onAfterSubmit() {
      afterCalls += 1;
    },
  });

  await assert.rejects(
    controls.form.dispatch("submit", { preventDefault() {} }),
    /fallimento atteso/,
  );
  assert.equal(controls.submitButton.disabled, false);
  assert.equal(afterCalls, 0);
});

test("cancel distingue target modali e fallback del context menu", async () => {
  const modalControls = createControls();
  const modalOrder = [];
  wireSpellPanelFormWorkflow({
    ...modalControls,
    isModal: true,
    getSelectedTargetIds: () => ["modal-target"],
    getFallbackTargetIds: async () => {
      throw new Error("fallback non previsto");
    },
    async onClearNonConcentration(ids) {
      modalOrder.push(["clear", ids]);
    },
    async onAfterClear() {
      modalOrder.push(["after"]);
    },
    async onClose() {
      modalOrder.push(["close"]);
    },
  });

  await modalControls.cancelButton.dispatch("click");
  assert.deepEqual(modalOrder, [
    ["clear", ["modal-target"]],
    ["after"],
  ]);

  const contextControls = createControls();
  const contextOrder = [];
  wireSpellPanelFormWorkflow({
    ...contextControls,
    getFallbackTargetIds: async () => ["context-target"],
    async onClearNonConcentration(ids) {
      contextOrder.push(["clear", ids]);
    },
    async onAfterClear() {
      contextOrder.push(["after"]);
    },
    async onClose() {
      contextOrder.push(["close"]);
    },
  });

  await contextControls.cancelButton.dispatch("click");
  assert.deepEqual(contextOrder, [
    ["clear", ["context-target"]],
    ["after"],
    ["close"],
  ]);
});

test("end inoltra l'azione al pulsante cancel", async () => {
  const controls = createControls();
  wireSpellPanelFormWorkflow(controls);

  await controls.endButton.dispatch("click");

  assert.equal(controls.cancelButton.clickCount, 1);
});
