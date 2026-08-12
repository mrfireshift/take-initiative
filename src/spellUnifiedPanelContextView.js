import {
  createButton,
  createField,
  createNode,
  createSelect,
  createStatusChip,
} from "./spellUnifiedPanelDom.js";

function renderLaneSummary(documentRef, execution) {
  const laneList = createNode(documentRef, "div", {
    className: "unified-lane-list",
    attributes: { "aria-label": "Lane di esecuzione" },
  });
  for (const lane of execution.lanes || []) {
    laneList.append(createStatusChip(
      documentRef,
      lane === execution.lane ? "lane attiva" : "lane",
      lane,
      lane === execution.lane ? "is-active" : "",
    ));
  }
  return laneList;
}

export function renderWorkflowContextBar(documentRef, model, callbacks = {}) {
  if (!model.workflow.spell) return null;
  const context = model.context;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-context",
    attributes: { "aria-label": "Contesto dell'incantesimo" },
  });

  const grid = createNode(documentRef, "div", { className: "unified-context-grid" });
  if (context.caster.visible) {
    const select = createSelect(documentRef, {
      id: "spell-unified-caster",
      options: context.caster.options,
      value: context.caster.value,
      invalid: model.workflow.validation.firstInvalidField === "caster",
      attributes: { "data-field": "caster" },
    });
    select.addEventListener("change", (event) => callbacks.onCasterChange?.(event.target.value));
    grid.append(createField(documentRef, {
      id: select.id,
      label: context.caster.label,
      control: select,
      hint: context.caster.hint,
      invalid: model.workflow.validation.firstInvalidField === "caster",
    }));
  }
  if (context.slot.visible) {
    const select = createSelect(documentRef, {
      id: "spell-unified-slot",
      options: context.slot.options,
      value: context.slot.value,
      invalid: model.workflow.validation.firstInvalidField === "slot-level",
      attributes: { "data-field": "slot-level" },
    });
    select.addEventListener("change", (event) => callbacks.onSlotChange?.(event.target.value));
    grid.append(createField(documentRef, {
      id: select.id,
      label: context.slot.label,
      control: select,
      hint: context.slot.hint,
      invalid: model.workflow.validation.firstInvalidField === "slot-level",
    }));
  }
  if (context.duration.visible) {
    const input = createNode(documentRef, "input", {
      id: "spell-unified-duration",
      attributes: {
        type: "number",
        min: context.duration.min ?? 1,
        max: context.duration.max ?? "",
        value: context.duration.value ?? "",
        "data-field": "duration",
        "aria-invalid": model.workflow.validation.firstInvalidField === "duration",
      },
    });
    input.addEventListener("change", (event) => callbacks.onDurationChange?.(event.target.value));
    grid.append(createField(documentRef, {
      id: input.id,
      label: context.duration.label,
      control: input,
      hint: context.duration.hint,
      invalid: model.workflow.validation.firstInvalidField === "duration",
    }));
  }
  if (grid.childElementCount) section.append(grid);
  return section;
}

export function renderPhaseSelector(documentRef, model, callbacks = {}) {
  if (!model.context.phase.visible) return null;
  const fieldset = createNode(documentRef, "fieldset", {
    className: "unified-section unified-phase-selector",
  });
  fieldset.append(createNode(documentRef, "legend", {
    className: "unified-section__heading",
    text: model.context.phase.label,
  }));
  const tabs = createNode(documentRef, "div", {
    className: "unified-phase-tabs",
    attributes: { role: "tablist", "aria-label": model.context.phase.label },
  });
  for (const phase of model.context.phase.options) {
    const button = createButton(documentRef, {
      label: phase.label,
      className: "unified-phase-tab",
      value: phase.value,
      pressed: phase.value === model.context.phase.selected,
      attributes: {
        role: "tab",
        "aria-selected": phase.value === model.context.phase.selected,
        "data-phase": phase.value,
      },
    });
    button.addEventListener("click", () => callbacks.onPhaseChange?.(phase.value));
    tabs.append(button);
  }
  fieldset.append(tabs);
  return fieldset;
}

export function renderAutomationAndVariantPanel(documentRef, model, callbacks = {}) {
  const context = model.context;
  if (!context.automation.applyVisible && !context.variant.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-automation",
    attributes: { "aria-label": "Opzioni dell'incantesimo" },
  });
  const grid = createNode(documentRef, "div", { className: "unified-context-grid" });
  if (context.variant.visible) {
    const select = createSelect(documentRef, {
      id: "spell-unified-variant",
      options: context.variant.options,
      value: context.variant.value,
      invalid: model.workflow.validation.firstInvalidField === "variant",
      attributes: { "data-field": "variant" },
    });
    select.addEventListener("change", (event) => callbacks.onVariantChange?.(event.target.value));
    grid.append(createField(documentRef, {
      id: select.id,
      label: context.variant.label,
      control: select,
      hint: context.variant.hint,
      invalid: model.workflow.validation.firstInvalidField === "variant",
      className: "unified-field unified-automation-variant",
    }));
  }
  if (context.automation.applyVisible) {
    const checkbox = createNode(documentRef, "input", {
      id: "spell-unified-apply-automation",
      attributes: {
        type: "checkbox",
        "data-field": "automation",
      },
    });
    checkbox.checked = context.automation.applyAutomatedConditions === true;
    checkbox.addEventListener("change", (event) => callbacks.onAutomationChange?.(
      event.target.checked,
    ));
    grid.append(createField(documentRef, {
      id: checkbox.id,
      label: "Applica condizioni dell'incantesimo",
      control: checkbox,
      hint: "",
      className: "unified-field unified-automation-toggle",
    }));
  }
  section.append(grid);
  return section;
}

export function renderCompositionPanel(documentRef, model, callbacks = {}) {
  const context = model.context.composition;
  if (!context?.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-composition",
    attributes: { "aria-label": context.label },
  });
  section.append(createNode(documentRef, "h3", {
    className: "unified-section__heading",
    text: context.label,
  }));
  section.append(createNode(documentRef, "p", {
    className: "unified-section__description",
    text: `Componi fino a ${context.maximumCost} oggetti-peso, poi posizionali uno alla volta sulla mappa.`,
  }));
  const grid = createNode(documentRef, "div", { className: "unified-context-grid" });
  for (const option of context.options || []) {
    const input = createNode(documentRef, "input", {
      id: `spell-unified-composition-${option.id}`,
      attributes: {
        type: "number",
        min: "0",
        max: String(Math.floor(context.maximumCost / Math.max(1, Number(option.cost) || 1))),
        step: "1",
        inputmode: "numeric",
        "data-field": "composition",
        "data-composition-size": option.id,
      },
    });
    input.value = String(Math.max(0, Math.floor(Number(context.counts?.[option.id]) || 0)));
    input.addEventListener("change", (event) => callbacks.onCompositionChange?.(
      option.id,
      event.target.value,
    ));
    grid.append(createField(documentRef, {
      id: input.id,
      label: `${option.label} · ${option.cost} peso`,
      control: input,
      hint: `PF ${option.hp} · CA ${option.armorClass} · Schianto ${option.attackDamage}`,
      invalid: model.workflow.validation.firstInvalidField === "composition",
    }));
  }
  const cost = (context.options || []).reduce((total, option) => (
    total + Math.max(0, Math.floor(Number(context.counts?.[option.id]) || 0))
      * Math.max(1, Number(option.cost) || 1)
  ), 0);
  const count = (context.options || []).reduce((total, option) => (
    total + Math.max(0, Math.floor(Number(context.counts?.[option.id]) || 0))
  ), 0);
  section.append(
    grid,
    createStatusChip(documentRef, "Combinazione", `${count} oggetti · ${cost}/${context.maximumCost}`),
  );
  return section;
}
