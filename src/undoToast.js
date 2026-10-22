// A short notice with "Annulla" at the bottom of the tracker, in place of a confirmation dialog (decision D3): the
// action happens at once, and the GM has a few seconds to take it back. One toast at a time: a new one replaces the
// previous, which can no longer be undone. It lives in <body>, outside the tracker's root, so renders leave it alone.
export const UNDO_TOAST_DURATION_MS = 8000;

let currentToast = null;

export function dismissUndoToast() {
  currentToast?.dismiss();
}

export function showUndoToast({
  message,
  onUndo,
  durationMs = UNDO_TOAST_DURATION_MS,
  documentRef = globalThis.document,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (!documentRef?.body || typeof onUndo !== "function") return null;
  dismissUndoToast();

  const toast = documentRef.createElement("div");
  toast.dataset.undoToast = "1";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    bottom: "10px",
    transform: "translateX(-50%)",
    zIndex: "2147483000",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    maxWidth: "calc(100% - 16px)",
    padding: "4px 4px 4px 10px",
    boxSizing: "border-box",
    border: "1px solid var(--obrt-line-strong, rgba(255,255,255,.28))",
    borderRadius: "10px",
    background: "rgba(13,18,27,.97)",
    boxShadow: "0 8px 22px rgba(0,0,0,.5)",
    color: "#fff",
    fontSize: "var(--obrt-type-body, 12px)",
    fontWeight: "600",
    whiteSpace: "nowrap",
    pointerEvents: "auto",
  });

  const text = documentRef.createElement("span");
  text.textContent = String(message || "");
  Object.assign(text.style, { minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" });

  const undoButton = documentRef.createElement("button");
  undoButton.type = "button";
  undoButton.className = "obrt-btn obrt-btn--primary";
  undoButton.textContent = "Annulla";

  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = "obrt-btn obrt-btn--ghost obrt-btn--icon";
  closeButton.textContent = "×";
  closeButton.title = "Chiudi";
  closeButton.setAttribute("aria-label", "Chiudi");

  toast.appendChild(text);
  toast.appendChild(undoButton);
  toast.appendChild(closeButton);

  let timer = null;
  const handle = {
    element: toast,
    dismiss() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      toast.remove?.();
      if (currentToast === handle) currentToast = null;
    },
  };

  // Clicks stay in the toast: the tracker behind it selects tokens and closes menus on click.
  toast.addEventListener("pointerdown", (event) => event.stopPropagation());
  toast.addEventListener("click", (event) => event.stopPropagation());
  closeButton.addEventListener("click", () => handle.dismiss());
  undoButton.addEventListener("click", async () => {
    if (undoButton.disabled) return;
    undoButton.disabled = true;
    closeButton.disabled = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    try {
      await onUndo();
    } catch (error) {
      console.warn("[undo-toast] annulla:", error?.message || error);
    } finally {
      handle.dismiss();
    }
  });

  documentRef.body.appendChild(toast);
  currentToast = handle;
  timer = setTimer(() => handle.dismiss(), Math.max(0, Number(durationMs) || 0));
  return handle;
}
