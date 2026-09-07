import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { initializePopoverDrag } from "./popoverDrag.js";

const CHANNEL = `${ID}/spell-turn-prompt-action`;
const META_KEY = `${ID}/meta`;
const params = new URLSearchParams(globalThis.location?.search || "");

// Ogni popover è un realm SDK autonomo: le API OBR non sono affidabili finché
// questo frame non ha completato OBR.onReady(). Il DOM può essere costruito
// subito, ma scene/player/broadcast/popover vengono usati solo dopo questo gate.
const sdkReady = new Promise((resolve) => {
  void OBR.onReady(() => resolve(true));
});

function decodeRequest() {
  try {
    const inline = params.get("request");
    if (inline) return JSON.parse(inline);
    const requestKey = String(params.get("requestKey") || "").trim();
    if (!requestKey) return null;
    return JSON.parse(localStorage.getItem(requestKey) || "null");
  } catch {
    return null;
  }
}

function popoverId(instanceId) {
  const explicit = String(params.get("popoverId") || "").trim();
  if (explicit) return explicit;
  return `${ID}/spell-turn-action-choice/${String(instanceId || "").trim()}`;
}

function actionCopy(action = {}) {
  const id = String(action.actionId || action.action?.id || "");
  if (id === "maximilian-earth-grasp-grab") {
    return "TS For · Trattenuto (al tavolo)";
  }
  if (id === "maximilian-earth-grasp-crush") {
    return "2d6 contundenti · metà su superato";
  }
  if (id === "eyebite-saved") {
    return "Immune a questo lancio";
  }
  if (id === "eyebite-asleep") {
    return "Privo di sensi";
  }
  if (id === "eyebite-panicked") {
    return "Spaventato";
  }
  if (id === "eyebite-sickened") {
    return "Svant. attacchi e prove";
  }
  if (id === "spirit-shroud-mark-hit") {
    return "No recupero PF";
  }
  return String(action.action?.detail || "");
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function itemCenter(bounds, item) {
  const center = point(bounds?.center);
  if (center) return center;
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  return min && max
    ? { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }
    : point(item?.position);
}

function conditionInstances(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.instances) ? value.instances : [];
}

function baseActorId(value) {
  return String(value || "").trim().replace(/::p\d+$/u, "");
}

function selectedEyebiteTargetId(selection = [], targets = []) {
  const exact = new Set((Array.isArray(targets) ? targets : [])
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean));
  const byActor = new Map((Array.isArray(targets) ? targets : [])
    .map((item) => [baseActorId(item?.id), String(item?.id || "").trim()])
    .filter(([actorId, itemId]) => actorId && itemId));
  for (const value of Array.isArray(selection) ? selection : []) {
    const selectedId = String(value || "").trim();
    if (exact.has(selectedId)) return selectedId;
    const mapped = byActor.get(baseActorId(selectedId));
    if (mapped) return mapped;
  }
  return "";
}

function syncEyebiteTargetFromSelection(selection, targets) {
  const targetId = selectedEyebiteTargetId(selection, targets);
  if (!targetId) return;
  targetSelect.value = targetId;
  setStatus("");
  setDirectBusy(false);
}

function itemHasExcludedEyebiteEffect(item, request) {
  const effectIds = new Set(
    (Array.isArray(request?.actions) ? request.actions : [])
      .flatMap((payload) => [
        ...(Array.isArray(payload?.action?.excludedTargetEffectIds)
          ? payload.action.excludedTargetEffectIds
          : []),
        ...(Array.isArray(payload?.action?.rejectActiveEffectIds)
          ? payload.action.rejectActiveEffectIds
          : []),
      ])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  if (!effectIds.size) return false;
  const conditions = conditionInstances(item?.metadata?.[META_KEY]?.conditions);
  return conditions.some((instance) => (
    String(instance?.parentEffectId || "").trim() === String(request?.instanceId || "").trim()
    && effectIds.has(String(instance?.effectId || "").trim())
  ));
}

async function eyebiteTargets(request) {
  const items = await OBR.scene.items.getItems().catch(() => []);
  const wantedCasterId = baseActorId(request?.casterId);
  const declaredCandidates = (Array.isArray(request?.candidateTargets) ? request.candidateTargets : [])
    .map((entry) => ({
      id: String(entry?.id || "").trim(),
      name: String(entry?.name || "").trim() || "Token",
    }))
    .filter((entry) => entry.id);
  const declaredIds = new Set(declaredCandidates.map((entry) => entry.id));
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [item?.id, item]));
  const liveCandidates = (Array.isArray(items) ? items : []).filter((item) => (
    item?.layer === "CHARACTER"
    && baseActorId(item?.id) !== wantedCasterId
    && !itemHasExcludedEyebiteEffect(item, request)
    && (!declaredIds.size || declaredIds.has(String(item?.id || "").trim()))
  ));
  const liveCandidateIds = new Set(liveCandidates.map((item) => String(item?.id || "").trim()));
  const candidates = declaredCandidates.length
    ? declaredCandidates
      .filter((entry) => !byId.has(entry.id) || liveCandidateIds.has(entry.id))
      .map((entry) => byId.get(entry.id) || entry)
    : liveCandidates;
  if (!candidates.length) return [];

  const caster = items.find((item) => item?.id === request?.casterId)
    || items.find((item) => baseActorId(item?.id) === wantedCasterId);
  if (!caster) return candidates;

  const [casterBounds, dpi, scale] = await Promise.all([
    OBR.scene.items.getItemBounds([caster.id]).catch(() => null),
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
  ]);
  const casterOrigin = itemCenter(casterBounds, caster);
  if (!casterOrigin) return candidates;

  const unrestricted = request?.targetSelectionMode === "free";
  const declaredRange = (Array.isArray(request?.actions) ? request.actions : [])
    .map((payload) => payload?.action?.range)
    .find((range) => Number(range?.value) > 0 && range?.unit === "m");
  const range = unrestricted ? null : (declaredRange || { value: 18, unit: "m" });
  const filtered = [];
  for (const item of candidates) {
    const liveItem = byId.get(item.id) || item;
    const bounds = byId.has(item.id)
      ? await OBR.scene.items.getItemBounds([item.id]).catch(() => null)
      : null;
    const origin = itemCenter(bounds, liveItem);
    if (unrestricted || !origin || spellAreaOriginWithinRange({
      origin,
      casterOrigin,
      range,
      dpi,
      scale: scale?.parsed || scale,
    })) filtered.push(liveItem);
  }
  // Se il frame del popover riceve geometria incoerente/temporaneamente
  // incompleta, non nascondiamo tutti i target: il commit resta il gate
  // autoritativo per i 18 m quando il chooser dichiara una distanza RAW.
  return filtered.length ? filtered : candidates;
}

const request = decodeRequest();
const app = document.getElementById("app");
const title = document.getElementById("title");
const hint = document.getElementById("hint");
const actions = document.getElementById("actions");
const close = document.getElementById("close");
const targetField = document.getElementById("targetField");
const targetSelect = document.getElementById("target");
const status = document.getElementById("status");
let busy = false;
let directButtons = [];
let unsubscribePlayer = null;
let selectionPollTimer = null;
let selectionPollBusy = false;

app.dataset.popoverId = popoverId(request?.instanceId);
initializePopoverDrag(app);

let resizeFrame = 0;
let lastPopoverHeight = 0;

function requestCompactPopoverResize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(async () => {
    await sdkReady;
    const appElement = document.getElementById("app");
    if (!appElement) return;
    const rectHeight = appElement.getBoundingClientRect?.().height || 0;
    const naturalHeight = Math.ceil(
      Math.max(rectHeight, appElement.offsetHeight || 0, appElement.scrollHeight || 0) + 8,
    );
    const targetHeight = Math.max(80, Math.min(500, naturalHeight));
    if (targetHeight === lastPopoverHeight) return;
    const id = appElement.dataset.popoverId || popoverId(request?.instanceId);
    if (id) {
      OBR.popover.setHeight(id, targetHeight)
        .then(() => {
          lastPopoverHeight = targetHeight;
        })
        .catch(() => {});
    }
  });
}

function setStatus(message = "", error = false) {
  status.textContent = String(message || "");
  status.hidden = !message;
  status.dataset.error = error ? "true" : "false";
  requestCompactPopoverResize();
}

function setDirectBusy(value) {
  busy = value === true;
  targetSelect.disabled = busy;
  for (const button of directButtons) button.disabled = busy || !targetSelect.value;
}

async function renderEyebiteDirect() {
  await sdkReady;
  const freeTargetSelection = request?.targetSelectionMode === "free";
  app.dataset.mode = freeTargetSelection ? "compact" : "direct";
  hint.textContent = request?.choiceHint || "";
  hint.hidden = !hint.textContent;
  targetField.hidden = false;
  const targets = await eyebiteTargets(request);
  targetSelect.replaceChildren(new Option("Seleziona il bersaglio", ""));
  for (const item of targets) {
    targetSelect.appendChild(new Option(String(item?.name || "").trim() || "Token", item.id));
  }
  const requestedTargetId = String(request?.selectedTargetId || "").trim();
  if (requestedTargetId && targets.some((item) => item.id === requestedTargetId)) {
    targetSelect.value = requestedTargetId;
  } else if (targets.length === 1) targetSelect.value = targets[0].id;

  for (const payload of Array.isArray(request.actions) ? request.actions : []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = freeTargetSelection
      ? "action action--compact"
      : "action action--direct";
    button.dataset.actionId = String(payload.actionId || "").trim();
    const strong = document.createElement("strong");
    strong.textContent = payload.action?.buttonLabel || payload.action?.label || payload.actionId;
    button.append(strong);
    if (!freeTargetSelection) {
      const detailText = actionCopy(payload);
      if (detailText) {
        const detail = document.createElement("span");
        detail.textContent = detailText;
        button.append(detail);
      }
    }
    button.addEventListener("click", async () => {
      const targetId = String(targetSelect.value || "").trim();
      if (!targetId || busy) return;
      await sdkReady;
      setDirectBusy(true);
      setStatus("Applico l'effetto…");
      await OBR.broadcast.sendMessage(
        CHANNEL,
        {
          type: "apply-choice-action",
          instanceId: request.instanceId,
          actionId: payload.actionId,
          targetId,
          turnKey: request.turnKey,
        },
        { destination: "LOCAL" },
      );
    });
    directButtons.push(button);
    actions.append(button);
  }
  targetSelect.addEventListener("change", () => setDirectBusy(false));
  setDirectBusy(false);
  if (!targets.length) {
    setStatus(
      request?.targetSelectionMode === "free"
        ? "Nessun bersaglio disponibile."
        : "Nessun bersaglio valido entro 18 m.",
      true,
    );
  }

  // La selection OBR è un enhancement post-render: non deve mai bloccare la
  // costruzione del chooser. onChange è affiancato da un polling leggero, lo
  // stesso pattern già usato dai popup Effects/Quick HP, perché alcuni frame
  // non ricevono sempre il change event della selection.
  unsubscribePlayer?.();
  unsubscribePlayer = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) {
      syncEyebiteTargetFromSelection(player.selection, targets);
    }
  });
  const refreshSelection = async () => {
    if (selectionPollBusy) return;
    selectionPollBusy = true;
    try {
      const selection = await OBR.player.getSelection();
      syncEyebiteTargetFromSelection(selection, targets);
    } catch {} finally {
      selectionPollBusy = false;
    }
  };
  if (selectionPollTimer) window.clearInterval(selectionPollTimer);
  selectionPollTimer = window.setInterval(() => { void refreshSelection(); }, 150);
  void refreshSelection();
  requestCompactPopoverResize();
}

function renderLegacyChoice() {
  const compact = Array.isArray(request?.actions) && request.actions.length === 1;
  app.dataset.spell = String(request?.spellId || "").trim();
  if (compact) app.dataset.mode = "compact";
  hint.textContent = request?.choiceHint || "";
  hint.hidden = !hint.textContent;
  for (const payload of Array.isArray(request?.actions) ? request.actions : []) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actionId = String(payload.actionId || "").trim();
    button.className = compact ? "action action--compact" : "action";
    if (request?.spellId === "telekinesis") button.classList.add("action--telekinesis");
    const strong = document.createElement("strong");
    strong.textContent = payload.action?.buttonLabel || payload.action?.label || payload.actionId;
    button.append(strong);
    if (!compact) {
      if (request?.spellId !== "telekinesis") {
        const detailText = actionCopy(payload);
        if (detailText) {
          const detail = document.createElement("span");
          detail.textContent = detailText;
          button.append(detail);
        }
      }
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      await sdkReady;
      await OBR.broadcast.sendMessage(
        CHANNEL,
        {
          type: "select-action",
          instanceId: request.instanceId,
          actionId: payload.actionId,
          turnKey: request.turnKey,
        },
        { destination: "LOCAL" },
      );
    });
    actions.append(button);
  }
  requestCompactPopoverResize();
}

window.addEventListener("resize", () => requestCompactPopoverResize());

if (!request) {
  title.textContent = "Azione";
  hint.textContent = "Contesto non disponibile.";
  hint.hidden = false;
  setStatus("Contesto azione non disponibile.", true);
}

if (request) {
  title.textContent = request.spellName || request.spellId || "Azione";
  if (request.spellId === "eyebite" || request.targetSelection === true) {
    void renderEyebiteDirect();
  } else {
    renderLegacyChoice();
  }
}

void sdkReady.then(() => {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    const data = event?.data || {};
    if (String(data.instanceId || "") !== String(request?.instanceId || "")) return;
    if (String(data.turnKey || "") !== String(request?.turnKey || "")) return;
    if (data.type === "sync-choice-target") {
      const targetId = String(data.targetId || "").trim();
      if (targetId && [...targetSelect.options].some((option) => option.value === targetId)) {
        targetSelect.value = targetId;
        setStatus("");
        setDirectBusy(false);
      }
      return;
    }
    if (data.type === "active-action-complete") {
      const actionId = String(data.actionId || "").trim();
      for (const button of actions.querySelectorAll("button")) {
        if (String(button.dataset.actionId || "").trim() === actionId) {
          button.disabled = false;
        }
      }
      return;
    }
    if (data.type !== "choice-action-error") return;
    setStatus(data.message || "Impossibile applicare l'effetto.", true);
    setDirectBusy(false);
    const actionId = String(data.actionId || "").trim();
    for (const button of actions.querySelectorAll("button")) {
      if (!actionId || String(button.dataset.actionId || "").trim() === actionId) {
        button.disabled = false;
      }
    }
  });
});

let dismissing = false;
function dismissChoice(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  if (dismissing) return;
  dismissing = true;
  close.disabled = true;
  const id = app.dataset.popoverId || popoverId(request?.instanceId);

  // La chiusura autoritativa avviene nel controller host, che possiede il
  // runtime del popover. La self-close resta come fallback visivo.
  void sdkReady.then(async () => {
    await OBR.broadcast.sendMessage(
      CHANNEL,
      {
        type: "dismiss-choice",
        popoverId: id,
        instanceId: request?.instanceId,
        turnKey: request?.turnKey,
      },
      { destination: "LOCAL" },
    ).catch(() => {});
    void OBR.popover.close(id).catch((error) => {
      console.warn("[spell-turn-choice] close:", error?.message || error);
    });
  });
}
// pointerdown rende la X indipendente dall'eventuale gesture di drag HTML5;
// click resta come fallback per tastiera/accessibilità.
close.addEventListener("pointerdown", dismissChoice, { capture: true });
close.addEventListener("click", dismissChoice);

window.addEventListener("beforeunload", () => {
  unsubscribePlayer?.();
  if (selectionPollTimer) window.clearInterval(selectionPollTimer);
  selectionPollTimer = null;
});
