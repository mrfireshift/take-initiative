import {
  createButton,
  createField,
  createNode,
  createSelect,
} from "./spellUnifiedPanelDom.js";

const DEFAULT_OUTCOME_OPTIONS = Object.freeze([
  { value: "passed", label: "Superato" },
  { value: "failed", label: "Fallito" },
  { value: "immune", label: "Immune" },
]);

function targetHPChangeLabel(target) {
  const preview = target.hpPreview;
  if (!preview || preview.available !== true || preview.afterHP === null) return "";
  return `${preview.beforeHP} \u2192 ${preview.afterHP} HP`;
}

function renderOutcomeButtons(documentRef, target, callbacks) {
  const options = Array.isArray(target.outcomeOptions) && target.outcomeOptions.length
    ? target.outcomeOptions
    : DEFAULT_OUTCOME_OPTIONS;
  const group = createNode(documentRef, "div", {
    className: `unified-outcome-group is-count-${Math.max(1, options.length)}`,
    attributes: {
      role: "group",
      "aria-label": `Esito per ${target.label}`,
    },
  });
  for (const option of options) {
    const button = createButton(documentRef, {
      label: option.label,
      className: `unified-outcome-button is-${option.value}`,
      value: option.value,
      pressed: target.outcome?.value === option.value,
      disabled: target.eligible === false || (target.disabled === true && target.selected !== true),
      attributes: { "data-outcome": option.value },
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.onOutcomeChange?.(target.key, option.value);
    });
    group.append(button);
  }
  return group;
}

function renderAttackOutcomeButtons(documentRef, attack, callbacks) {
  const options = Array.isArray(attack?.options) && attack.options.length
    ? attack.options
    : [];
  if (!attack?.visible || !options.length) return null;
  const group = createNode(documentRef, "div", {
    className: "unified-attack-outcome",
    attributes: {
      role: "group",
      "aria-label": attack.label || "Esito dell'attacco",
    },
    children: [
      createNode(documentRef, "span", {
        className: "unified-field__label",
        text: attack.label || "Esito dell'attacco",
      }),
    ],
  });
  const actions = createNode(documentRef, "div", {
    className: `unified-outcome-group is-count-${Math.max(1, options.length)}`,
  });
  for (const option of options) {
    const button = createButton(documentRef, {
      label: option.label,
      className: `unified-outcome-button is-${option.value}`,
      value: option.value,
      pressed: attack.value === option.value,
      disabled: attack.required !== true && !attack.visible,
      attributes: { "data-attack-outcome": option.value },
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.onAttackOutcomeChange?.(option.value);
    });
    actions.append(button);
  }
  group.append(actions);
  return group;
}

export function renderTargetMatrix(documentRef, model, callbacks = {}) {
  const targets = model.targets;
  if (!targets.visible) return null;
  const section = createNode(documentRef, "section", {
    className: `unified-section unified-targets ${targets.outcomes.visible ? "has-outcomes" : "is-simple"}`,
    attributes: {
      "aria-labelledby": "unified-targets-heading",
      "data-target-mode": targets.mode,
    },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-targets-heading",
        text: "Bersagli",
      }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow unified-target-count",
        text: targets.countLabel,
      }),
    ],
  }));

  const filters = targets.filters || {};
  const filterBar = createNode(documentRef, "div", {
    className: "unified-target-filters",
    attributes: { role: "search", "aria-label": "Filtri bersagli" },
  });
  const nameFilter = createNode(documentRef, "input", {
    id: "spell-unified-target-name-filter",
    attributes: {
      type: "search",
      value: filters.name || "",
      placeholder: "Filtra per nome",
      "aria-label": "Filtra bersagli per nome",
    },
  });
  nameFilter.addEventListener("input", (event) => callbacks.onTargetNameFilter?.(
    event.target.value,
  ));
  filterBar.append(nameFilter);
  for (const faction of filters.factionOptions || []) {
    const button = createButton(documentRef, {
      label: faction.label,
      className: "unified-filter-button",
      pressed: (filters.factions || []).includes(faction.value),
      value: faction.value,
      attributes: { "aria-label": `Filtra fazione ${faction.label}` },
    });
    button.addEventListener("click", () => callbacks.onTargetFactionToggle?.(faction.value));
    filterBar.append(button);
  }
  section.append(filterBar);

  const spatialLabel = String(targets.spatialLabel || "").trim();
  if (targets.spatialRules && spatialLabel) {
    section.append(createNode(documentRef, "div", {
      className: "unified-target-spatial",
      text: spatialLabel,
    }));
  }

  const attackOutcomeButtons = renderAttackOutcomeButtons(
    documentRef,
    targets.outcomes.attack,
    callbacks,
  );
  if (attackOutcomeButtons) section.append(attackOutcomeButtons);

  if (targets.selection?.mode) {
    const stage = createNode(documentRef, "div", {
      className: "unified-target-selection-stage",
      children: [
        createNode(documentRef, "span", {
          className: "unified-target-selection-stage__hint",
          text: targets.selection.instruction,
        }),
      ],
    });
    if (targets.selection.resetVisible) {
      const reset = createButton(documentRef, {
        label: "Cambia primario",
        className: "unified-secondary-button",
        attributes: { "data-primary-reset": "true" },
      });
      reset.addEventListener("click", (event) => {
        event.stopPropagation();
        callbacks.onPrimaryReset?.();
      });
      stage.append(reset);
    }
    section.append(stage);
  }

  const list = createNode(documentRef, "div", {
    className: "unified-target-list",
    attributes: { role: "group", "aria-label": "Selezione bersagli" },
  });
  for (const target of targets.candidates) {
    const row = createNode(documentRef, "div", {
      className: "unified-target-row",
      attributes: {
        "data-target-key": target.key,
        ...(target.selected ? { "data-selected": "true" } : {}),
      },
    });
    const label = createNode(documentRef, "label", {
      className: "unified-target-row__select",
    });
    const checkbox = createNode(documentRef, "input", {
      attributes: {
        type: "checkbox",
        value: target.key,
        "aria-label": `Seleziona ${target.label}`,
      },
    });
    checkbox.checked = target.selected === true;
    checkbox.disabled = target.eligible === false || target.disabled === true;
    checkbox.addEventListener("change", (event) => callbacks.onTargetToggle?.(
      target.key,
      event.target.checked,
    ));
    const dot = createNode(documentRef, "span", {
      className: `unified-target-row__faction is-${target.faction || "neutral"}`,
      attributes: {
        "aria-label": target.factionLabel || "Neutrale",
        title: target.factionLabel || "Neutrale",
      },
    });
    label.append(checkbox, dot, createNode(documentRef, "span", {
      className: "unified-target-row__copy",
      children: [
        createNode(documentRef, "strong", { text: target.label }),
      ],
    }));
    row.append(label);
    const hpChange = targetHPChangeLabel(target);
    if (hpChange) {
      row.append(createNode(documentRef, "span", {
        className: "unified-target-row__hp-change",
        text: hpChange,
        attributes: {
          "aria-label": `HP: ${hpChange}`,
          title: `HP: ${hpChange}`,
        },
      }));
    }
    if (targets.outcomes.visible) row.append(renderOutcomeButtons(documentRef, target, callbacks));
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, label")) return;
      if (target.disabled || target.eligible === false) return;
      callbacks.onTargetToggle?.(target.key, !target.selected);
    });
    list.append(row);
  }
  if (!targets.candidates.length) {
    list.append(createNode(documentRef, "div", {
      className: "unified-empty-state",
      text: targets.emptyLabel,
    }));
  }
  section.append(list);

  if (targets.primary.visible && targets.selection?.mode !== "primary-then-secondary") {
    const options = targets.candidates
      .filter((target) => target.selected)
      .map((target) => ({ value: target.key, label: target.label }));
    const select = createSelect(documentRef, {
      id: "spell-unified-primary-target",
      options,
      value: targets.primary.value,
      invalid: model.workflow.validation.firstInvalidField === "primary-target",
      attributes: { "data-field": "primary-target" },
    });
    select.addEventListener("change", (event) => callbacks.onPrimaryTargetChange?.(event.target.value));
    section.append(createField(documentRef, {
      id: select.id,
      label: targets.primary.label,
      control: select,
      hint: targets.primary.hint,
      invalid: model.workflow.validation.firstInvalidField === "primary-target",
    }));
  }

  if (targets.outcomes.visible) {
    const selectedCount = targets.candidates.filter((target) => target.selected).length;
    const bulk = createNode(documentRef, "div", {
      className: "unified-target-bulk",
      attributes: { "aria-label": "Imposta esiti sui bersagli selezionati" },
      children: [
        createNode(documentRef, "span", {
          className: "unified-field__label",
          text: "Imposta selezionati",
        }),
      ],
    });
    const options = Array.isArray(targets.outcomeOptions) && targets.outcomeOptions.length
      ? targets.outcomeOptions
      : DEFAULT_OUTCOME_OPTIONS;
    const actions = createNode(documentRef, "div", {
      className: `unified-target-bulk__actions is-count-${Math.max(1, options.length)}`,
    });
    for (const option of options) {
      const button = createButton(documentRef, {
        label: option.label,
        className: `unified-outcome-button is-${option.value}`,
        disabled: selectedCount === 0,
        attributes: { "data-outcome-bulk": option.value },
      });
      button.addEventListener("click", () => callbacks.onOutcomeBulkChange?.(option.value));
      actions.append(button);
    }
    bulk.append(actions);
    section.append(bulk);
  }

  if (targets.context.visible && targets.context.fields.length) {
    const contextSection = createNode(documentRef, "div", {
      className: "unified-target-context",
      children: [
        createNode(documentRef, "div", {
          className: "unified-field__label",
          text: targets.context.label,
        }),
      ],
    });
    const contextTargets = targets.context.targets || [];
    for (const target of contextTargets) {
      const targetSection = createNode(documentRef, "div", {
        className: "unified-target-context__target",
        children: [createNode(documentRef, "strong", { text: target.label })],
      });
      for (const field of targets.context.fields) {
        const control = field.type === "select"
          ? createSelect(documentRef, {
            id: `spell-unified-context-${target.key}-${field.id}`,
            options: field.options || [],
            value: target.values?.[field.id] ?? "",
            invalid: model.workflow.validation.firstInvalidField === "target-context",
            attributes: { "data-field": "target-context" },
          })
          : createNode(documentRef, "input", {
            id: `spell-unified-context-${target.key}-${field.id}`,
            attributes: {
              type: field.type || "text",
              value: target.values?.[field.id] ?? "",
              ...(field.required ? { required: true } : {}),
              "data-field": "target-context",
            },
          });
        control.addEventListener("change", (event) => callbacks.onTargetContextChange?.(
          target.key,
          field.id,
          event.target.value,
        ));
        targetSection.append(createField(documentRef, {
          id: control.id,
          label: field.label || field.id,
          control,
          invalid: model.workflow.validation.firstInvalidField === "target-context",
        }));
      }
      contextSection.append(targetSection);
    }
    if (!contextTargets.length) {
      contextSection.append(createNode(documentRef, "span", {
        className: "unified-field__hint",
        text: "Seleziona almeno un bersaglio per compilare il contesto.",
      }));
    }
    section.append(contextSection);
  }
  return section;
}

export function renderPlacementStage(documentRef, model, callbacks = {}) {
  const placement = model.placement;
  if (!placement.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-placement",
    attributes: { "aria-label": "Area" },
  });
  const details = createNode(documentRef, "div", {
    className: "unified-placement-card",
  });
  if (placement.choices?.length) {
    const choice = createSelect(documentRef, {
      id: "spell-unified-placement-choice",
      options: [
        { value: "", label: "Seleziona forma e lato caldo" },
        ...placement.choices,
      ],
      value: placement.choice || "",
      invalid: model.workflow.validation.firstInvalidField === "rule-choice",
      attributes: {
        "data-field": "rule-choice",
        "aria-label": "Forma e lato caldo della sagoma",
      },
    });
    choice.addEventListener("change", (event) => callbacks.onVariantChange?.(
      event.target.value,
    ));
    details.append(createField(documentRef, {
      id: choice.id,
      label: "Forma / lato caldo",
      control: choice,
      hint: "La scelta viene salvata nella zona persistente.",
      invalid: model.workflow.validation.firstInvalidField === "rule-choice",
    }));
  }
  if (placement.visibleAction) {
    const choiceMissing = placement.choiceRequired && !placement.choice;
    const button = createButton(documentRef, {
      label: placement.actionLabel,
      className: "unified-secondary-button unified-placement-action",
      disabled: placement.pending || choiceMissing,
      attributes: {
        "data-placement-action": placement.policy,
      },
    });
    button.addEventListener("click", () => callbacks.onPlacement?.());
    details.append(button);
  }
  if (placement.confirmVisible) {
    const controls = createNode(documentRef, "div", {
      className: "unified-placement-controls",
    });
    if (placement.progressLabel) {
      controls.append(createNode(documentRef, "span", {
        className: "unified-placement-progress",
        text: placement.progressLabel,
        attributes: { "aria-live": "polite" },
      }));
    }
    const confirm = createButton(documentRef, {
      label: placement.isBatch ? "Conferma oggetti" : "Conferma sagoma",
      className: "unified-primary-button unified-placement-action",
      disabled: placement.isBatch && !placement.batchComplete,
      attributes: {
        "data-placement-confirm": "true",
      },
    });
    confirm.addEventListener("click", () => callbacks.onPlacementConfirm?.());
    controls.append(confirm);
    if (placement.cancelVisible) {
      const cancel = createButton(documentRef, {
        label: "Annulla area",
        className: "unified-secondary-button",
        attributes: { "data-placement-cancel": "true" },
      });
      cancel.addEventListener("click", () => callbacks.onPlacementCancel?.());
      controls.append(cancel);
    }
    details.append(controls);
  }
  if (placement.unlockVisible) {
    const unlock = createButton(documentRef, {
      label: "Modifica bersagli",
      className: "unified-secondary-button unified-placement-action",
      disabled: placement.pending,
      attributes: { "data-placement-unlock": "true" },
    });
    unlock.addEventListener("click", () => callbacks.onPlacementUnlock?.());
    details.append(unlock);
  }
  section.append(details);
  if (placement.error) {
    section.append(createNode(documentRef, "div", {
      className: "unified-inline-error",
      text: placement.error,
      attributes: { role: "alert" },
    }));
  }
  return section;
}
