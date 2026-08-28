import OBR from "@owlbear-rodeo/sdk";
import {
  executeDelayedBlastFireballTerminalResolution,
  getDelayedBlastFireballTerminalContext,
} from "./delayedBlastFireballResolutionCore.js";
import {
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
  buildSpellUnifiedPopupEvent,
} from "./spellUnifiedPopupProtocol.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const params = new URLSearchParams(globalThis.location?.search || "");
const payload = (() => {
  try {
    return JSON.parse(params.get("payload") || "null");
  } catch {
    return null;
  }
})();
const $ = (id) => document.getElementById(id);
let context = null;
let outcomes = {};
let busy = false;
let notified = false;
let damageInitialized = false;
let sdkReady = false;
let resizeFrame = 0;
let lastPopoverHeight = 0;

function text(value) {
  return String(value ?? "").trim();
}

function uniqueIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter(Boolean))];
}

function currentEpoch() {
  // The parent panel and this popup run in separate Owlbear realms.  Their
  // numeric scene epochs are not interchangeable, so prefer the popup's live
  // epoch and only fall back to the payload for test/offline runtimes.
  const live = currentSceneEpoch();
  return Number.isInteger(Number(live))
    ? Number(live)
    : Number.isInteger(Number(payload?.sceneEpoch))
      ? Number(payload.sceneEpoch)
      : 0;
}

function requestCompactPopoverResize() {
  if (!payload?.popoverId || !sdkReady) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const app = $("app");
    if (!app) return;
    // Misura il contenuto effettivo: con pochi bersagli il popover si riduce,
    // mentre una lista lunga mantiene lo scroll interno della sezione.
    const naturalHeight = Math.ceil(app.scrollHeight + 8);
    const targetHeight = Math.max(150, Math.min(620, naturalHeight));
    if (targetHeight === lastPopoverHeight) return;
    lastPopoverHeight = targetHeight;
    void OBR.popover.setHeight(payload.popoverId, targetHeight).catch(() => {});
  });
}

function setStatus(message, error = false) {
  const node = $("status");
  if (!node) return;
  node.hidden = !message;
  node.textContent = text(message);
  node.style.color = error ? "#fecaca" : "rgba(254,226,226,.76)";
  requestCompactPopoverResize();
}

async function notifyParent(status, message = "", result = null) {
  if (notified || !payload) return;
  notified = true;
  await OBR.broadcast.sendMessage(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    buildSpellUnifiedPopupEvent({
      source: "delayed-blast-fireball-resolution",
      status,
      instanceId: payload.instanceId,
      actionId: payload.actionId,
      popoverId: payload.popoverId,
      message,
      ...(result?.historyEntryId ? { historyEntryId: result.historyEntryId } : {}),
      ...(result?.undoAvailable !== undefined ? { undoAvailable: result.undoAvailable === true } : {}),
    }),
    { destination: "LOCAL" },
  ).catch(() => {});
}

function render() {
  const targetRoot = $("targets");
  if (!targetRoot) return;
  targetRoot.replaceChildren();
  const itemsById = new Map((Array.isArray(context?.allItems) ? context.allItems : [])
    .map((item) => [text(item?.id), item]));
  for (const id of uniqueIds(context?.targetIds)) {
    const row = document.createElement("div");
    row.className = "target";
    const name = document.createElement("span");
    name.className = "target-name";
    name.textContent = text(itemsById.get(id)?.name) || id;
    row.append(name);
    for (const [value, label] of [["failed", "Fallito"], ["passed", "Superato"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.classList.toggle("active", outcomes[id] === value);
      button.addEventListener("click", () => {
        if (busy) return;
        outcomes[id] = value;
        render();
      });
      row.append(button);
    }
    targetRoot.append(row);
  }
  if (!context?.targetIds?.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Nessuna creatura nel raggio corrente.";
    targetRoot.append(empty);
  }
  $("formula").textContent = `${Math.max(0, Number(context?.currentDice) || 0)}d6`;
  const damage = $("damage");
  if (damage && !damageInitialized) {
    damage.value = String(Math.max(0, Number(context?.currentDice) || 0));
    damageInitialized = true;
  }
  const ids = uniqueIds(context?.targetIds);
  $("apply").disabled = busy
    || !ids.every((id) => ["passed", "failed"].includes(outcomes[id]))
    || damage?.value === ""
    || !Number.isFinite(Number(damage?.value))
    || Number(damage?.value) < 0;
  requestCompactPopoverResize();
}

async function loadContext() {
  if (!payload?.casterId || !payload?.instanceId) {
    setStatus("Contesto della detonazione non valido.", true);
    return;
  }
  try {
    context = await getDelayedBlastFireballTerminalContext({
      casterId: payload.casterId,
      instanceId: payload.instanceId,
    });
    if (!context.valid) {
      setStatus(context.errors?.[0]?.message || "La perla non è più disponibile.", true);
      $("apply").disabled = true;
      return;
    }
    const activeIds = new Set(uniqueIds(context.targetIds));
    outcomes = Object.fromEntries(Object.entries(outcomes)
      .filter(([id]) => activeIds.has(id)));
    setStatus("");
    render();
  } catch (error) {
    setStatus(error?.message || "Impossibile leggere la posizione corrente della perla.", true);
  }
}

async function apply() {
  if (busy || !context?.valid) return;
  const epoch = currentEpoch();
  if (!isCurrentSceneEpoch(epoch)) {
    setStatus("La scena è cambiata: riapri la detonazione.", true);
    return;
  }
  busy = true;
  render();
  setStatus("Detonazione in corso…");
  try {
    const result = await executeDelayedBlastFireballTerminalResolution({
      casterId: payload.casterId,
      instanceId: payload.instanceId,
      pendingTermination: payload.pendingTermination,
      castContext: payload.castContext,
      outcomes,
      damage: Number($("damage")?.value),
      sceneEpoch: epoch,
      commandId: `delayed-blast-fireball:${payload.instanceId}:${Date.now().toString(36)}`,
      isCurrent: (value) => isCurrentSceneEpoch(value),
    });
    if (["applied", "noop"].includes(String(result?.status || ""))) {
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED, "Detonazione completata.", result);
      await OBR.popover.close(payload.popoverId).catch(() => {});
      return;
    }
    setStatus(result?.errors?.[0]?.message || "Detonazione non riuscita.", true);
  } catch (error) {
    setStatus(error?.message || "Detonazione non riuscita.", true);
  } finally {
    busy = false;
    render();
  }
}

async function close() {
  await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  await OBR.popover.close(payload?.popoverId).catch(() => {});
}

if (!payload) {
  setStatus("Payload di detonazione non valido.", true);
} else {
  $("title").textContent = text(payload.spellName) || "Palla di fuoco ritardata";
  $("close").addEventListener("click", () => void close());
  $("apply").addEventListener("click", () => void apply());
  $("damage").addEventListener("input", render);
  window.addEventListener("beforeunload", () => { void notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED); }, { once: true });
  void OBR.onReady(async () => {
    sdkReady = true;
    await loadContext();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => requestCompactPopoverResize());
      observer.observe($("app"));
      window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
    }
    requestCompactPopoverResize();
    OBR.scene.items.onChange(() => {
      if (!busy) void loadContext();
    });
  });
}
