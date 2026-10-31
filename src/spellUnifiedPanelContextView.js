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
  // Which of the caster's slots the cast spends (spell-unified-panel.js, spellSlotSpendCore.js).
  if (context.slotSpend?.visible) {
    const select = createSelect(documentRef, {
      id: "spell-unified-slot-spend",
      options: context.slotSpend.options,
      value: context.slotSpend.value,
      attributes: { "data-field": "slot-spend" },
    });
    select.addEventListener("change", (event) => callbacks.onSlotSourceChange?.(event.target.value));
    grid.append(createField(documentRef, {
      id: select.id,
      label: context.slotSpend.label,
      control: select,
      hint: "",
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

export function renderAutomationAndVariantPanel() {
  return null;
}

// Animate Objects: the section heading of the panel (caption and count), a meter of the weight used, and a card per
// size with its statistics and − / + for the objects of that size.
export function renderCompositionPanel(documentRef, model, callbacks = {}) {
  const context = model.context.composition;
  if (!context?.visible) return null;
  const maximum = Math.max(1, Number(context.maximumCost) || 1);
  const countOf = (option) => Math.max(0, Math.floor(Number(context.counts?.[option.id]) || 0));
  const costOf = (option) => Math.max(1, Number(option.cost) || 1);
  const cost = (context.options || []).reduce((total, option) => total + countOf(option) * costOf(option), 0);
  const count = (context.options || []).reduce((total, option) => total + countOf(option), 0);
  const over = cost > maximum;
  const section = createNode(documentRef, "section", {
    className: `unified-section unified-composition${over ? " is-invalid" : ""}`,
    attributes: { "aria-labelledby": "unified-composition-heading" },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", { id: "unified-composition-heading", text: "Oggetti animati" }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow unified-target-count",
        text: `${count} ${count === 1 ? "oggetto" : "oggetti"} · ${cost}/${maximum} peso`,
        attributes: { "data-composition-total": "" },
      }),
    ],
  }));
  const meter = createNode(documentRef, "div", {
    className: "unified-composition__meter",
    attributes: { role: "meter", "aria-valuemin": 0, "aria-valuemax": maximum, "aria-valuenow": cost, "aria-label": "Peso usato" },
  });
  const fill = createNode(documentRef, "span", { className: "unified-composition__meter-fill" });
  fill.style.width = `${Math.min(100, Math.round((cost / maximum) * 100))}%`;
  meter.append(fill);
  section.append(meter, createNode(documentRef, "p", {
    className: "unified-section__description",
    text: over
      ? `Oltre ${maximum} di peso: togli qualche oggetto.`
      : "Minuscola e piccola pesano 1, media 2, grande 4, enorme 8. Poi posizioni gli oggetti uno alla volta.",
  }));
  const grid = createNode(documentRef, "div", { className: "unified-composition__grid" });
  for (const option of context.options || []) {
    const current = countOf(option);
    const step = (delta) => callbacks.onCompositionChange?.(option.id, String(Math.max(0, current + delta)));
    const remove = createButton(documentRef, {
      label: "−",
      className: "unified-darts__step",
      ariaLabel: `Un oggetto ${option.label.toLocaleLowerCase("it")} in meno`,
      disabled: current <= 0,
      attributes: { "data-composition-step": "remove", "data-composition-size": option.id },
    });
    remove.addEventListener("click", () => step(-1));
    const add = createButton(documentRef, {
      label: "+",
      className: "unified-darts__step",
      ariaLabel: `Un oggetto ${option.label.toLocaleLowerCase("it")} in più`,
      disabled: cost + costOf(option) > maximum,
      attributes: { "data-composition-step": "add", "data-composition-size": option.id },
    });
    add.addEventListener("click", () => step(1));
    grid.append(createNode(documentRef, "div", {
      className: `unified-composition__size${current ? " is-used" : ""}`,
      attributes: { "data-composition-size": option.id },
      children: [
        createNode(documentRef, "div", {
          className: "unified-composition__size-head",
          children: [
            createNode(documentRef, "strong", { className: "unified-composition__name", text: option.label }),
            createNode(documentRef, "span", { className: "unified-composition__cost", text: `${costOf(option)} peso` }),
          ],
        }),
        createNode(documentRef, "div", {
          className: "unified-composition__stats",
          text: `PF ${option.hp} · CA ${option.armorClass} · Schianto ${option.attackDamage}`,
        }),
        createNode(documentRef, "div", {
          className: "unified-darts__stepper unified-composition__stepper",
          children: [remove, createNode(documentRef, "span", {
            className: "unified-darts__target-count",
            text: String(current),
            attributes: { "data-composition-count": option.id },
          }), add],
        }),
      ],
    }));
  }
  section.append(grid);
  return section;
}
