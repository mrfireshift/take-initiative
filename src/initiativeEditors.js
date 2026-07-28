export function parseInlineMath(input, baseValue) {
  const value = String(input || "").trim();
  if (value === "") return baseValue;
  const relative = /^([+\-])(\d+)$/.exec(value);
  if (relative) {
    const sign = relative[1] === "-" ? -1 : 1;
    const amount = parseInt(relative[2], 10);
    return Math.max(0, (baseValue || 0) + sign * amount);
  }
  const absolute = parseInt(value, 10);
  if (!Number.isNaN(absolute)) return Math.max(0, absolute);
  return baseValue;
}

export function normalizeSignedIntegerInput(value) {
  let normalized = String(value || "").replace(/\s+/g, "");
  normalized = normalized.replace(/(?!^)[+\-]/g, "");
  normalized = normalized.replace(/(?!^[+\-])\D+/g, "");
  return normalized;
}

export function normalizeInitiativeInput(value) {
  let normalized = String(value || "").replace(/[^\d-]/g, "");
  if (normalized.indexOf("-") > 0) {
    normalized = `-${normalized.replace(/-/g, "")}`;
  }
  return normalized;
}

export function bindClassicInitiativeEditor({
  badge,
  isEditable,
  armClickIgnore,
  beginEdit,
  readValue,
  editorReady,
  cleanupEdit,
  saveValue,
  afterCommit,
  afterCancel,
  isFillMode,
  finishFillMode,
  openFillNeighbor,
  commitAndOpenNeighbor,
  documentRef = globalThis.document,
  requestAnimationFrameRef = globalThis.requestAnimationFrame,
  setTimeoutRef = globalThis.setTimeout,
}) {
  if (!badge?.addEventListener) return badge;

  badge.addEventListener("pointerdown", async (event) => {
    if (!isEditable()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (badge.dataset.editing === "1") return;

    event.stopImmediatePropagation();
    event.preventDefault();
    armClickIgnore(350);
    const onPointerUp = () => {
      armClickIgnore(150);
      documentRef.removeEventListener("pointerup", onPointerUp, true);
    };
    documentRef.addEventListener("pointerup", onPointerUp, true);

    await beginEdit();

    const input = documentRef.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.pattern = "-?\\d*";
    input.value = String(await readValue());
    setTimeoutRef(() => editorReady(), 0);

    Object.assign(input.style, {
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      margin: "0",
      padding: "0",
      border: "none",
      outline: "none",
      background: "transparent",
      color: "#fff",
      fontSize: "15px",
      fontWeight: "700",
      textAlign: "center",
      lineHeight: "1",
      appearance: "none",
    });

    const old = badge.textContent;
    badge.textContent = "";
    badge.appendChild(input);
    badge.dataset.editing = "1";
    badge.dataset.initEditing = "1";

    const swallowFirstClick = (clickEvent) => {
      if (!badge.contains(clickEvent.target)) return;
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    };
    documentRef.addEventListener("click", swallowFirstClick, {
      capture: true,
      once: true,
    });

    input.addEventListener("wheel", (wheelEvent) => {
      wheelEvent.preventDefault();
    }, { passive: false });
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "ArrowUp" || keyEvent.key === "ArrowDown") {
        keyEvent.preventDefault();
      }
    });
    input.addEventListener("input", () => {
      input.value = normalizeInitiativeInput(input.value);
    });
    input.addEventListener("pointerdown", (pointerEvent) => {
      pointerEvent.stopPropagation();
    });

    input.focus({ preventScroll: true });
    input.select();

    let committed = false;
    let tabbing = false;

    const cleanup = () => {
      delete badge.dataset.editing;
      delete badge.dataset.initEditing;
      cleanupEdit();
      delete badge.__commitFn;
      delete badge.__cancelFn;
    };

    const commit = async () => {
      if (committed) return;
      committed = true;
      const value = input.value.trim();
      try { badge.removeChild(input); } catch {}
      const normalized = value === ""
        ? old
        : String(Math.floor(Number(value) || 0));
      badge.textContent = normalized;
      await saveValue(normalized);
      cleanup();
      await afterCommit(normalized);
    };

    const cancel = async (options = {}) => {
      if (committed) return;
      committed = true;
      try { badge.removeChild(input); } catch {}
      badge.textContent = old;
      cleanup();
      await afterCancel(options);
    };

    badge.__commitFn = commit;
    badge.__cancelFn = cancel;

    const commitAndNavigate = async (goPrev = false) => {
      tabbing = true;
      try {
        await commitAndOpenNeighbor({ goPrev, commit });
      } finally {
        tabbing = false;
      }
    };

    input.addEventListener("keydown", async (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        if (keyEvent.ctrlKey || keyEvent.metaKey) {
          await commit();
          if (isFillMode()) await finishFillMode();
        } else if (isFillMode()) {
          await commit();
          await openFillNeighbor(keyEvent.shiftKey);
        } else {
          await commitAndNavigate(keyEvent.shiftKey);
        }
        return;
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        await cancel();
        return;
      }
      if (keyEvent.key === "Tab") {
        keyEvent.preventDefault();
        if (isFillMode()) {
          await commit();
          await openFillNeighbor(keyEvent.shiftKey);
        } else {
          await commitAndNavigate(keyEvent.shiftKey);
        }
      }
    });

    input.addEventListener("blur", () => {
      if (!tabbing) requestAnimationFrameRef(() => commit());
    });
  });

  return badge;
}

export function bindClassicHPEditor({
  pill,
  itemId,
  snapshotHP,
  snapshotHPMax,
  hpFill,
  getEditingItemId,
  isCurrentEditor,
  armClickIgnore,
  handoffEditor,
  beginEdit,
  readLiveValues,
  editorReady,
  cleanupEdit,
  parseRelativeDelta,
  setDeltaButtonActive,
  shouldIgnoreDocumentClick,
  formatHP,
  hpColorByPct,
  saveValues,
  afterCommit,
  commitAndOpenNeighbor,
  documentRef = globalThis.document,
  requestAnimationFrameRef = globalThis.requestAnimationFrame,
  setTimeoutRef = globalThis.setTimeout,
}) {
  if (!pill?.addEventListener) return pill;

  const focusHalf = (clientX) => {
    const bounds = pill.getBoundingClientRect();
    const input = (clientX - bounds.left) > (bounds.width / 2)
      ? pill.__iMax
      : pill.__iHP;
    input?.focus({ preventScroll: true });
    input?.select();
  };

  pill.addEventListener("pointerdown", async (event) => {
    event.stopImmediatePropagation();
    event.preventDefault();

    if (pill.dataset.hpEditing === "1" && isCurrentEditor()) {
      armClickIgnore(200);
      focusHalf(event.clientX);
      return;
    }

    const editingItemId = getEditingItemId();
    if (editingItemId && editingItemId !== itemId) {
      await handoffEditor();
      return;
    }

    armClickIgnore(350);
    const onPointerUp = () => {
      armClickIgnore(150);
      documentRef.removeEventListener("pointerup", onPointerUp, true);
    };
    documentRef.addEventListener("pointerup", onPointerUp, true);

    const swallowFirstClick = (clickEvent) => {
      if (!pill.contains(clickEvent.target)) return;
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    };
    documentRef.addEventListener("click", swallowFirstClick, {
      capture: true,
      once: true,
    });

    await beginEdit();
    pill.dataset.hpEditing = "1";

    const card = pill.closest("[data-item-id]");
    const previousDraggable = card?.getAttribute("draggable") ?? null;
    card?.setAttribute("draggable", "false");

    const liveValues = await readLiveValues();
    const pillText = String(pill.textContent || "").trim();
    const pillMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(pillText);
    const pillHP = pillMatch ? parseInt(pillMatch[1], 10) : null;
    const pillHPMax = pillMatch ? parseInt(pillMatch[2], 10) : null;
    const hp = liveValues?.hp ?? pillHP ??
      (Number.isFinite(snapshotHP) ? snapshotHP : 0);
    const hpMax = liveValues?.hpMax ?? pillHPMax ??
      (Number.isFinite(snapshotHPMax) ? snapshotHPMax : 0);

    const wrap = documentRef.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "4px";

    const hpInput = documentRef.createElement("input");
    const hpMaxInput = documentRef.createElement("input");
    for (const input of [hpInput, hpMaxInput]) {
      input.type = "text";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.pattern = "[+\\-]?\\d*";
      Object.assign(input.style, {
        width: "22px",
        border: "none",
        outline: "none",
        background: "transparent",
        color: "#fff",
        fontFamily: "inherit",
        fontSize: pill.style.fontSize || "12px",
        fontWeight: pill.style.fontWeight || "700",
        lineHeight: pill.style.lineHeight || "13px",
        padding: "0",
        textAlign: "center",
      });
      input.addEventListener("wheel", (wheelEvent) => {
        wheelEvent.preventDefault();
      }, { passive: false });
      input.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "ArrowUp" || keyEvent.key === "ArrowDown") {
          keyEvent.preventDefault();
        }
      });
      input.addEventListener("input", () => {
        input.value = normalizeSignedIntegerInput(input.value);
      });
      input.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
      });
    }
    hpInput.value = String(Number.isFinite(hp) ? hp : 0);
    hpMaxInput.value = String(Number.isFinite(hpMax) ? hpMax : 0);

    let linkedHPMaxDelta = false;
    const syncLinkedHPMaxDelta = () => {
      if (!linkedHPMaxDelta) return;
      const relative = parseRelativeDelta(hpInput.value);
      hpMaxInput.value = relative === null
        ? String(hpMax)
        : hpInput.value.trim();
    };
    const setLinkedHPMaxDelta = (enabled) => {
      linkedHPMaxDelta = !!enabled;
      pill.__linkedHPMaxDelta = linkedHPMaxDelta;
      setDeltaButtonActive(linkedHPMaxDelta);
      hpMaxInput.readOnly = linkedHPMaxDelta;
      hpMaxInput.style.opacity = linkedHPMaxDelta ? ".72" : "1";
      if (linkedHPMaxDelta) syncLinkedHPMaxDelta();
      else hpMaxInput.value = String(hpMax);
    };
    hpInput.addEventListener("input", syncLinkedHPMaxDelta);

    for (const input of [hpInput, hpMaxInput]) {
      input.addEventListener("pointerdown", (pointerEvent) => {
        if (pill.dataset.hpEditing !== "1" || !isCurrentEditor()) return;
        pointerEvent.preventDefault();
        armClickIgnore(200);
        setTimeoutRef(() => {
          try {
            input.focus({ preventScroll: true });
            input.select();
          } catch {}
        }, 0);
      }, { capture: true });
    }

    const slash = documentRef.createElement("span");
    slash.textContent = "/";
    slash.style.opacity = ".8";
    slash.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
    });

    const oldHTML = pill.innerHTML;
    pill.textContent = "";
    wrap.append(hpInput, slash, hpMaxInput);
    pill.appendChild(wrap);
    pill.__iHP = hpInput;
    pill.__iMax = hpMaxInput;
    pill.__setLinkedHPMaxDelta = setLinkedHPMaxDelta;
    if (pill.dataset.hpOpenLinkedDelta === "1") {
      delete pill.dataset.hpOpenLinkedDelta;
      setLinkedHPMaxDelta(true);
    }

    focusHalf(event.clientX);
    setTimeoutRef(() => editorReady(), 0);

    let committed = false;
    let commit;

    const cleanup = () => {
      try {
        documentRef.removeEventListener("click", onDocumentClick, true);
      } catch {}
      cleanupEdit();
      delete pill.dataset.hpEditing;
      delete pill.__iHP;
      delete pill.__iMax;
      delete pill.__setLinkedHPMaxDelta;
      delete pill.__linkedHPMaxDelta;
      delete pill.__commitFn;
      delete pill.__cancelFn;
      setDeltaButtonActive(false);
      if (card) {
        if (previousDraggable === null) card.removeAttribute("draggable");
        else card.setAttribute("draggable", previousDraggable);
      }
    };

    commit = async () => {
      if (committed) return;
      committed = true;

      const hpText = hpInput.value.trim();
      const hpMaxText = hpMaxInput.value.trim();
      const nextHP = parseInlineMath(hpText, hp);
      let nextHPMax = parseInlineMath(hpMaxText, hpMax);
      const hpDelta = parseRelativeDelta(hpText);
      const hpMaxWasInvalid = !Number.isFinite(hpMax) || hpMax <= 0;
      const singleAbsoluteHP = /^\d+$/.test(hpText);
      if (hpMaxWasInvalid &&
          singleAbsoluteHP &&
          hpMaxText === String(hpMax)) {
        nextHPMax = nextHP;
      }

      pill.innerHTML = formatHP(nextHP, nextHPMax);
      const percentage = nextHPMax > 0
        ? Math.max(0, Math.min(1, nextHP / nextHPMax))
        : 0;
      hpFill.style.width = `${percentage * 100}%`;
      hpFill.style.background = nextHPMax > 0 && nextHP <= 0
        ? "#475569"
        : hpColorByPct(percentage);

      const recalibratesMax = linkedHPMaxDelta && hpDelta !== null;
      const concentrationDamage = hpDelta !== null && hpDelta < 0
        ? Math.abs(hpDelta)
        : Math.max(0, hp - nextHP);
      const result = {
        nextHP,
        nextHPMax,
        recalibratesMax,
        concentrationDamage,
      };
      await saveValues(result);
      cleanup();
      await afterCommit(result);
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      pill.innerHTML = oldHTML;
      cleanup();
    };

    const onDocumentClick = async (clickEvent) => {
      if (shouldIgnoreDocumentClick()) return;
      if (pill.contains(clickEvent.target)) return;
      await commit();
    };
    documentRef.addEventListener("click", onDocumentClick, true);

    pill.__commitFn = commit;
    pill.__cancelFn = cancel;

    wrap.addEventListener("focusout", () => {
      setTimeoutRef(async () => {
        if (!pill.contains(documentRef.activeElement)) await commit();
      }, 0);
    });

    const commitAndNavigate = (goPrev = false) =>
      commitAndOpenNeighbor({ goPrev, commit });

    hpInput.addEventListener("keydown", async (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        if (keyEvent.altKey) setLinkedHPMaxDelta(true);
        await commit();
        return;
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        cancel();
        return;
      }
      if (keyEvent.key === "Tab") {
        keyEvent.preventDefault();
        if (keyEvent.shiftKey) await commitAndNavigate(true);
        else {
          hpMaxInput.focus({ preventScroll: true });
          hpMaxInput.select();
        }
      }
    });

    hpMaxInput.addEventListener("keydown", async (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        await commit();
        return;
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        cancel();
        return;
      }
      if (keyEvent.key === "Tab") {
        keyEvent.preventDefault();
        if (keyEvent.shiftKey) {
          hpInput.focus({ preventScroll: true });
          hpInput.select();
        } else {
          await commitAndNavigate(false);
        }
      }
    });
  });

  return pill;
}

export function bindGroupHPDeltaEditor({
  button,
  card,
  armClickIgnore,
  closeEditors,
  parseRelativeDelta,
  applyDelta,
  onError = () => {},
  documentRef = globalThis.document,
  requestAnimationFrameRef = globalThis.requestAnimationFrame,
}) {
  if (!button?.addEventListener) return button;

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
    armClickIgnore(350);
  });

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    event.preventDefault();
    armClickIgnore(350);
    await closeEditors();

    const input = documentRef.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "+/-";
    input.pattern = "[+\\-]?\\d*";
    input.dataset.groupHpDeltaEditor = "1";
    Object.assign(input.style, {
      width: "52px",
      height: "20px",
      boxSizing: "border-box",
      padding: "0 4px",
      borderRadius: "999px",
      border: "1px solid rgba(251,191,36,.82)",
      outline: "none",
      background: "rgba(245,158,11,.42)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "700",
      textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
    });

    const previousDraggable = card.getAttribute("draggable");
    card.setAttribute("draggable", "false");
    button.replaceWith(input);

    let finished = false;
    const restore = () => {
      if (input.isConnected) input.replaceWith(button);
      if (previousDraggable === null) card.removeAttribute("draggable");
      else card.setAttribute("draggable", previousDraggable);
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      restore();
    };
    const commit = async () => {
      if (finished) return;
      const delta = parseRelativeDelta(input.value);
      if (delta === null || delta === 0) {
        cancel();
        return;
      }
      finished = true;
      input.disabled = true;
      try {
        await applyDelta(delta);
      } catch (error) {
        onError(error);
      } finally {
        restore();
      }
    };

    input.addEventListener("pointerdown", (inputEvent) => {
      inputEvent.stopPropagation();
    });
    input.addEventListener("click", (inputEvent) => {
      inputEvent.stopPropagation();
    });
    input.addEventListener("input", () => {
      input.value = normalizeSignedIntegerInput(input.value);
    });
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") {
        keyEvent.preventDefault();
        void commit();
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", () => void commit());
    requestAnimationFrameRef(() => {
      input.focus({ preventScroll: true });
      input.select();
    });
  });

  return button;
}

export function enableInlineNameEditor({
  card,
  trigger,
  getOriginalName,
  dragAllowed,
  buildInput,
  saveName,
  restoreName,
  onError = () => {},
  stopInputDblclick = false,
}) {
  trigger.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (card.dataset.renaming === "1") return;

    const originalName = String(getOriginalName() || "").trim();
    const input = buildInput(originalName);
    card.dataset.renaming = "1";
    card.draggable = false;
    trigger.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      const nextName = input.value.trim();
      let displayedName = originalName;
      if (save && nextName && nextName !== originalName) {
        try {
          await saveName(nextName);
          displayedName = nextName;
        } catch (error) {
          onError(error);
        }
      }
      restoreName(displayedName);
      if (input.isConnected) input.replaceWith(trigger);
      delete card.dataset.renaming;
      card.draggable = dragAllowed;
    };

    input.addEventListener("pointerdown", (inputEvent) => inputEvent.stopPropagation());
    input.addEventListener("click", (inputEvent) => inputEvent.stopPropagation());
    if (stopInputDblclick) {
      input.addEventListener("dblclick", (inputEvent) => inputEvent.stopPropagation());
    }
    input.addEventListener("keydown", (inputEvent) => {
      if (inputEvent.key === "Enter") {
        inputEvent.preventDefault();
        void finish(true);
      } else if (inputEvent.key === "Escape") {
        inputEvent.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener("blur", () => void finish(true));
  });
}

export function enableClassicCardRename({
  card,
  name,
  nameLabel,
  getOriginalName,
  borderColor,
  dragAllowed,
  saveName,
  onError = () => {},
  documentRef = globalThis.document,
}) {
  nameLabel.title = "Doppio clic per rinominare il token";
  nameLabel.style.cursor = "text";
  enableInlineNameEditor({
    card,
    trigger: nameLabel,
    getOriginalName,
    dragAllowed,
    buildInput: (originalName) => {
      const input = documentRef.createElement("input");
      input.type = "text";
      input.value = originalName;
      input.maxLength = 120;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.cardSelectionIgnore = "1";
      Object.assign(input.style, {
        flex: "1 1 auto",
        minWidth: "0",
        height: "28px",
        padding: "2px 7px",
        border: `1px solid ${borderColor}`,
        borderRadius: "7px",
        background: "rgba(5,9,15,.96)",
        color: "#fff",
        font: "inherit",
        fontSize: "14px",
        fontWeight: "700",
        outline: "none",
      });
      return input;
    },
    saveName,
    restoreName: (displayedName) => {
      nameLabel.textContent = displayedName;
      name.title = displayedName;
    },
    onError,
  });
}
