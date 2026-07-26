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
