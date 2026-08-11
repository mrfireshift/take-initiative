import {
  createButton,
  createField,
  createNode,
} from "./spellUnifiedPanelDom.js";

export function renderActiveSpellSection(documentRef, model, callbacks = {}) {
  const active = model.active;
  if (!active.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-active",
    attributes: { "aria-labelledby": "unified-active-heading" },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-active-heading",
        text: "Incantesimi attivi sul campo",
      }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow",
        text: String(active.overview?.length || 0),
      }),
    ],
  }));
  const list = createNode(documentRef, "div", {
    className: "unified-action-list",
    attributes: { role: "group", "aria-label": "Azioni attive" },
  });
  const persistentKindLabels = {
    zone: "Zona",
    aura: "Aura",
    "board-token": "Pedina",
  };
  const persistentStateLabels = {
    present: "presente",
    "scene-item-missing": "elemento in mappa mancante",
    "lifecycle-missing": "dati dell'incantesimo mancanti",
    orphaned: "da controllare",
  };
  for (const [index, overview] of (active.overview || []).entries()) {
    const persistent = overview.persistent;
    const targetLabel = overview.targetNames.length
      ? overview.targetNames.join(", ")
      : overview.prepared
        ? "nessun bersaglio registrato"
        : "nessun bersaglio";
    const details = [
      `Caster: ${overview.casterName}`,
      `${overview.prepared ? "Preparato su" : "Bersagli"}: ${targetLabel}`,
      overview.durationLabel,
      overview.concentrating ? "Concentrazione" : "",
      overview.zoneLabel,
      overview.tokenLabel,
      persistent
        ? `${persistentKindLabels[persistent.kind] || "Stato persistente"}: ${
          persistentStateLabels[persistent.state] || persistent.state || "non disponibile"}`
        : "",
    ].filter(Boolean);
    const item = createNode(documentRef, "article", {
      className: "unified-active-overview",
      attributes: { "data-active-overview-index": index },
      children: [
        createNode(documentRef, "strong", { text: overview.name }),
        createNode(documentRef, "span", {
          className: "unified-field__hint",
          text: details.join(" · "),
        }),
      ],
    });
    if (overview.terminable) {
      const terminate = createButton(documentRef, {
        label: "Termina",
        className: "unified-terminate-button",
        disabled: overview.terminating === true,
        attributes: {
          title: `Termina ${overview.name}`,
          "data-terminate-instance": overview.instanceId,
        },
      });
      terminate.addEventListener("click", () => callbacks.onActiveTerminate?.(overview));
      item.append(terminate);
    }
    if (overview.actionLabels.length && !overview.actions?.length) {
      item.append(createNode(documentRef, "span", {
        className: "unified-active-overview__actions",
        text: `Azioni: ${overview.actionLabels.join(", ")}`,
      }));
    }
    if (overview.actions?.length) {
      const actionList = createNode(documentRef, "div", {
        className: "unified-active-overview__action-list",
        attributes: { role: "group", "aria-label": `Azioni di ${overview.name}` },
      });
      for (const action of overview.actions) {
        const actionId = String(action?.id || "").trim();
        if (!actionId) continue;
        const detailId = `spell-unified-active-${index}-${actionId}`
          .replace(/[^a-zA-Z0-9_-]/g, "-");
        const button = createButton(documentRef, {
          label: action.buttonLabel || action.label || actionId,
          className: "unified-action-button",
          value: actionId,
          pressed: action.selected === true,
          disabled: action.disabled === true || action.available === false,
          attributes: {
            "aria-describedby": detailId,
            "data-active-instance": overview.instanceId,
          },
        });
        button.addEventListener("click", () => callbacks.onActiveActionChange?.({
          instanceId: overview.instanceId,
          actionId,
        }));
        const detail = [
          action.economyLabel || action.economy,
          action.detail,
          action.disabledReason || action.presentation?.title,
        ].filter(Boolean).join(" · ");
        actionList.append(createNode(documentRef, "div", {
          className: "unified-action-item",
          children: [
            button,
            createNode(documentRef, "p", {
              id: detailId,
              className: "unified-action-item__detail",
              text: detail,
            }),
          ],
        }));
      }
      if (actionList.childElementCount) item.append(actionList);
    }
    if (persistent?.triggers?.length) {
      item.append(createNode(documentRef, "span", {
        className: "unified-active-overview__actions",
        text: `Attivazioni: ${persistent.triggers.map((trigger) => (
          trigger.label || [trigger.type, trigger.resolution].filter(Boolean).join(" · ")
        )).filter(Boolean).join(", ")}`,
      }));
    }
    if (persistent?.kind === "board-token") {
      const token = persistent.token;
      const tokenRow = createNode(documentRef, "div", {
        className: "unified-active-overview__token",
      });
      if (token) {
        const hpMax = Math.max(0, Math.floor(Number(token.state?.hpMax) || 0));
        const hp = Math.max(0, Math.floor(Number(token.state?.hp) || 0));
        tokenRow.append(createNode(documentRef, "span", {
          className: "unified-field__hint",
          text: [
            token.armorClass ? `CA ${token.armorClass}` : "",
            token.modeLabel ? `Modalità: ${token.modeLabel}` : "",
            hpMax > 0 ? `Stato: ${hp}/${hpMax} PF` : "Stato: attiva",
          ].filter(Boolean).join(" · "),
        }));
        if (hpMax > 0) {
          const hpInput = createNode(documentRef, "input", {
            attributes: {
              type: "number",
              min: "0",
              max: String(hpMax),
              value: String(hp),
              "aria-label": `Punti ferita di ${overview.name}`,
            },
          });
          const save = createButton(documentRef, {
            label: "Aggiorna HP",
            className: "unified-secondary-button",
          });
          save.addEventListener("click", async () => {
            save.disabled = true;
            try {
              await callbacks.onBoardTokenUpdate?.({
                overview,
                hp: Number(hpInput.value),
              });
            } finally {
              save.disabled = false;
            }
          });
          tokenRow.append(hpInput, save);
        }
      } else if (persistent.state === "scene-item-missing"
        || persistent.state === "lifecycle-missing") {
        tokenRow.append(createNode(documentRef, "span", {
          className: "unified-field__hint",
          text: "La pedina non è presente sulla scena.",
        }));
        const recreate = createButton(documentRef, {
          label: "Posiziona pedina",
          className: "unified-secondary-button",
        });
        recreate.addEventListener("click", () => callbacks.onBoardTokenRecreate?.(overview));
        tokenRow.append(recreate);
      }
      if (tokenRow.childElementCount) item.append(tokenRow);
    }
    list.append(item);
  }
  const overviewActionIds = new Set((active.overview || [])
    .flatMap((overview) => (Array.isArray(overview.actions) ? overview.actions : []))
    .map((action) => String(action?.id || "").trim())
    .filter(Boolean));
  const catalogActions = [];
  for (const action of catalogActions) {
    const button = createButton(documentRef, {
      label: action.buttonLabel || action.label,
      className: "unified-action-button",
      value: action.id,
      pressed: action.id === active.selectedActionId,
      attributes: { "aria-describedby": `spell-unified-action-detail-${action.id}` },
    });
    button.addEventListener("click", () => callbacks.onActiveActionChange?.(action.id));
    const item = createNode(documentRef, "div", {
      className: "unified-action-item",
    });
    item.append(button, createNode(documentRef, "p", {
      id: `spell-unified-action-detail-${action.id}`,
      className: "unified-action-item__detail",
      text: [action.economyLabel, action.detail].filter(Boolean).join(" · "),
    }));
    list.append(item);
  }
  if (!list.childElementCount) {
    list.append(createNode(documentRef, "div", {
      className: "unified-empty-state",
      text: "Nessun incantesimo attivo sul campo.",
    }));
  }
  section.append(list);
  return section;
}

export function renderZoneTriggerBanner(documentRef, model, callbacks = {}) {
  const zone = model.zone;
  if (!zone.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-zone-trigger",
    attributes: {
      "aria-labelledby": "unified-zone-heading",
      "aria-live": "polite",
    },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-zone-heading",
        text: "Trigger della zona",
      }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow",
        text: zone.statusLabel,
      }),
    ],
  }));
  const list = createNode(documentRef, "ul", {
    className: "unified-zone-trigger__list",
  });
  for (const trigger of zone.triggers) {
    list.append(createNode(documentRef, "li", {
      children: [
        createNode(documentRef, "strong", { text: trigger.label }),
        createNode(documentRef, "span", {
          className: "unified-field__hint",
          text: trigger.detail,
        }),
      ],
    }));
  }
  section.append(list);
  if (zone.runtime.visible) {
    const action = createButton(documentRef, {
      label: zone.runtime.actionLabel,
      className: "unified-secondary-button",
      disabled: zone.runtime.pending,
      attributes: { "data-zone-trigger-action": "1" },
    });
    action.addEventListener("click", () => callbacks.onZoneTrigger?.());
    section.append(action);
  }
  if (zone.runtime.message) {
    section.append(createNode(documentRef, "div", {
      className: "unified-inline-feedback",
      text: zone.runtime.message,
      attributes: { role: "status" },
    }));
  }
  return section;
}

export function renderManualSpellEffectPanel(documentRef, model, callbacks = {}) {
  const manual = model.manual;
  if (!manual.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-manual-effect",
    attributes: { "aria-labelledby": "unified-manual-heading" },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-manual-heading",
        text: "Valori dell'effetto",
      }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow",
        text: manual.sourceLabel,
      }),
    ],
  }));
  section.append(createNode(documentRef, "p", {
    className: "unified-section__description",
    text: manual.description,
  }));
  const grid = createNode(documentRef, "div", { className: "unified-context-grid" });
  for (const field of manual.fields) {
    const input = createNode(documentRef, "input", {
      id: `spell-unified-manual-${field.id}`,
      attributes: {
        type: field.type,
        inputmode: "decimal",
        min: field.min ?? "",
        value: field.value ?? "",
        "data-field": field.id,
        "aria-invalid": field.invalid,
      },
    });
    input.addEventListener("change", (event) => callbacks.onHpChange?.(
      field.id,
      event.target.value,
    ));
    grid.append(createField(documentRef, {
      id: input.id,
      label: field.label,
      control: input,
      hint: field.hint,
      invalid: field.invalid,
    }));
  }
  if (grid.childElementCount) section.append(grid);
  return section;
}

export function renderEffectInputPanel(documentRef, model, callbacks = {}) {
  const effects = model.effects;
  if (!effects.visible) return null;
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-effect-inputs",
    attributes: { "aria-labelledby": "unified-effect-inputs-heading" },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-effect-inputs-heading",
        text: effects.label,
      }),
      createNode(documentRef, "span", {
        className: "unified-section__eyebrow",
        text: "Valori richiesti",
      }),
    ],
  }), createNode(documentRef, "p", {
    className: "unified-section__description",
    text: effects.description,
  }));
  const grid = createNode(documentRef, "div", { className: "unified-context-grid" });
  for (const field of effects.fields) {
    const input = createNode(documentRef, "input", {
      id: `spell-unified-effect-${field.id}`,
      attributes: {
        type: field.type,
        inputmode: "decimal",
        min: field.min ?? "",
        value: field.value ?? "",
        "data-field": field.id,
        "aria-invalid": field.invalid,
      },
    });
    input.addEventListener("change", (event) => callbacks.onHpChange?.(
      field.id,
      event.target.value,
    ));
    grid.append(createField(documentRef, {
      id: input.id,
      label: field.label,
      control: input,
      hint: field.hint,
      invalid: field.invalid,
    }));
  }
  section.append(grid);
  const preview = effects.preview;
  if (preview?.visible) {
    const previewSection = createNode(documentRef, "div", {
      className: "unified-hp-preview",
      attributes: {
        "aria-live": "polite",
        role: "status",
      },
      children: [
        createNode(documentRef, "strong", { text: preview.label }),
      ],
    });
    if (!preview.valid) {
      previewSection.append(createNode(documentRef, "span", {
        className: "unified-field__hint",
        text: "Inserisci un valore per calcolare il before/after.",
      }));
    } else if (!preview.targets.length) {
      previewSection.append(createNode(documentRef, "span", {
        className: "unified-field__hint",
        text: "Seleziona almeno un bersaglio.",
      }));
    } else {
      const list = createNode(documentRef, "ul", {
        className: "unified-hp-preview__list",
      });
      for (const target of preview.targets) {
        const detail = !target.available
          ? "HP autorevoli non disponibili"
          : target.pendingOutcome
            ? `${target.beforeHP} HP · registra l'esito`
            : `${target.beforeHP} → ${target.afterHP} HP (max ${target.hpMax}) · ${target.factorLabel}`;
        list.append(createNode(documentRef, "li", {
          children: [
            createNode(documentRef, "strong", { text: target.label }),
            createNode(documentRef, "span", {
              className: "unified-field__hint",
              text: detail,
            }),
          ],
        }));
      }
      previewSection.append(list);
    }
    section.append(previewSection);
  }
  return section;
}

export function renderFeedbackBanner(documentRef, model) {
  const feedback = model.workflow.feedback;
  if (!feedback || feedback.state === "idle") return null;
  const role = feedback.state === "error" ? "alert" : "status";
  return createNode(documentRef, "div", {
    className: `unified-feedback is-${feedback.state}`,
    text: feedback.message || model.feedbackLabels[feedback.state] || feedback.state,
    attributes: {
      role,
      "aria-live": feedback.state === "error" ? "assertive" : "polite",
    },
  });
}

export function renderReviewFooter(documentRef, model, callbacks = {}) {
  const effectFields = model.effects?.visible && Array.isArray(model.effects.fields)
    ? model.effects.fields
    : [];
  const footer = createNode(documentRef, "footer", {
    className: `unified-review-footer${effectFields.length ? " has-effect-inputs" : ""}`,
    attributes: { "aria-label": "Riepilogo e azioni" },
  });
  if (effectFields.length) {
    const effectInputs = createNode(documentRef, "div", {
      className: "unified-review-effect-inputs",
      attributes: { "aria-label": "Valori effetto" },
    });
    for (const field of effectFields) {
      const inputId = `spell-unified-sticky-${field.id}`;
      const input = createNode(documentRef, "input", {
        id: inputId,
        attributes: {
          type: field.type === "number" ? "text" : field.type,
          inputmode: "decimal",
          value: field.value ?? "",
          "data-field": field.id,
          "aria-label": field.label,
          "aria-invalid": field.invalid,
        },
      });
      input.addEventListener("change", (event) => callbacks.onHpChange?.(
        field.id,
        event.target.value,
      ));
      effectInputs.append(createField(documentRef, {
        id: inputId,
        label: field.label,
        control: input,
        hint: "",
        invalid: field.invalid,
        className: "unified-review-effect-input",
      }));
    }
    footer.append(effectInputs);
  }

  const actions = createNode(documentRef, "div", {
    className: "unified-review-actions",
  });
  if (model.workflow.undo.capable && model.workflow.undo.available) {
    const undo = createButton(documentRef, {
      label: "Undo",
      className: "unified-secondary-button",
      disabled: model.workflow.undo.disabled,
      attributes: {
        "data-undo-capable": "true",
        "data-undo-available": "true",
      },
    });
    undo.addEventListener("click", () => callbacks.onUndo?.());
    actions.append(undo);
  }
  const activePrimary = model.active?.primaryAction || null;
  const primaryModel = activePrimary || model.workflow.primaryAction;
  const placementRequired = !activePrimary && primaryModel.id === "place";
  const primary = createButton(documentRef, {
    label: placementRequired ? "Applica effetti" : primaryModel.label,
    className: "unified-primary-button",
    disabled: placementRequired
      || primaryModel.disabled
      || (!activePrimary && model.workflow.disabled),
    attributes: {
      "data-primary-action": primaryModel.id,
      "aria-describedby": !activePrimary && !effectFields.length
        && model.workflow.validation.firstInvalidField
        ? `spell-unified-validation-${model.workflow.validation.firstInvalidField}`
        : "",
    },
  });
  primary.addEventListener("click", () => callbacks.onPrimaryAction?.(
    primaryModel.id,
  ));
  actions.append(primary);
  footer.append(actions);
  return footer;
}
