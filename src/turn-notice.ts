import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  planZoneTriggerNoticeDelivery,
  shouldClearZoneNoticeAtTurn,
  zoneTriggerNoticeDetail,
  zoneTriggerNoticeFromActivation,
} from "./zoneTriggerNoticeCore.js";
import {
  mergeSaveReminderNoticeBatch,
  saveReminderNoticeBatchPresentation,
} from "./saveReminderNoticeCore.js";
import {
  REMINDER_OUTCOMES,
  reminderResolutionNeedsDamage,
} from "./reminderResolutionCore.js";
import { resolveReminder } from "./reminderResolution.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { isTurnNoticeForScene } from "./turnNotice.js";
import { projectReminderNotices } from "./options/optionsProjection.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectReminderProjectionPolicy } from "./options/optionsSelectors.js";

const CHANNEL = ID + "/turn-notice";
const READY_CHANNEL = CHANNEL + "/ready";
const LAYOUT_CHANNEL = CHANNEL + "/layout";
const UI_CHANNEL = CHANNEL + "/ui";
const AUTO_CLOSE_MS = 4500;
const ZONE_AUTO_CLOSE_MS = 6500;
const SAVE_REMINDER_AGGREGATION_MS = 16;
const FADE_MS = 220;
const ATTITUDES = new Set(["pc", "ally", "enemy", "neutral"]);

type TurnNotice = {
  currentName: string;
  nextName: string;
  currentPortrait: string;
  currentAttitude: string;
  round: number;
  noticeId: number;
  turnKey: string;
  sceneEpoch: number;
};

type ZoneNoticeTarget = {
  id: string;
  name: string;
  portrait: string;
};

type ZoneTriggerNotice = {
  activationId: string;
  turnKey?: string;
  timing?: "turn-start" | "turn-end" | "damage" | "enter" | "leave";
  spellName: string;
  label: string;
  failureEffect?: string;
  dc?: number;
  casterName?: string;
  targets: ZoneNoticeTarget[];
  kind?: "zone" | "zone-effect" | "effect-save" | "effect-reminder";
  eyebrow?: string;
  instruction?: string;
  resolution?: any;
};

function normalizeNotice(parsed: any): TurnNotice | null {
  const currentName = String(parsed?.currentName || "").trim().slice(0, 100);
  const nextName = String(parsed?.nextName || "").trim().slice(0, 100);
  const currentPortrait = String(parsed?.currentPortrait || "").trim().slice(0, 2048);
  const attitude = String(parsed?.currentAttitude || "neutral").trim().toLowerCase();
  if (!currentName) return null;
  return {
    currentName,
    nextName: nextName || "Nessuno",
    currentPortrait,
    currentAttitude: ATTITUDES.has(attitude) ? attitude : "neutral",
    round: Math.max(1, Math.floor(Number(parsed?.round) || 1)),
    noticeId: Math.max(0, Math.floor(Number(parsed?.noticeId) || 0)),
    turnKey: String(parsed?.turnKey || "").trim().slice(0, 300),
    sceneEpoch: Math.max(0, Math.floor(Number(parsed?.sceneEpoch) || 0)),
  };
}

let currentPanel: HTMLElement | null = null;
let hideTimer = 0;
let currentZonePanel: HTMLElement | null = null;
let zoneHideTimer = 0;
let currentZoneTurnKey = "";
let currentSaveReminderBatch: any = null;
let pendingSaveReminderNotices: ZoneTriggerNotice[] = [];
let saveReminderAggregationTimer = 0;
let lastNoticeId = 0;
const announcedZoneActivationIds = new Set<string>();
const announcedEffectActivationIds = new Set<string>();
let zonePendingBaselineReady = false;
let zonePendingSyncRequested = false;
let zonePendingSyncRunning = false;
let unsubscribeZoneSceneReady: (() => void) | null = null;
let unsubscribeUiBroadcast: (() => void) | null = null;
let unsubscribeTurnNoticeReadyRequest: (() => void) | null = null;
let noticeSceneEpoch = 0;
let noticeSceneReady = true;
let noticeRole = "PLAYER";
let reminderProjectionPolicy = {
  player: { visibility: "full", showDc: true, showCaster: true },
  popup: true,
  directResolution: "assisted",
};
let unsubscribeOptions: (() => void) | null = null;
let lastNoticeLayoutKey = "";
const resolutionDrafts = new Map<string, { outcome: string; damageRoll: string }>();
const resolutionStatus = new Map<string, string>();
const resolvingActivations = new Set<string>();

const RESOLUTION_LABELS: Record<string, string> = {
  [REMINDER_OUTCOMES.PASSED]: "Superato",
  [REMINDER_OUTCOMES.FAILED]: "Fallito",
  apply: "Applica cura",
  ignore: "Ignora",
};
const RESOLUTION_BUTTON_OUTCOMES = [
  REMINDER_OUTCOMES.PASSED,
  REMINDER_OUTCOMES.FAILED,
] as const;

function announceNoticeLayout() {
  const hasTurnNotice = !!currentPanel;
  const hasZoneNotice = !!currentZonePanel;
  const fallbackHeight = !hasTurnNotice && !hasZoneNotice
    ? 1
    : hasTurnNotice && hasZoneNotice
      ? 232
      : hasZoneNotice
        ? 158
        : 122;
  const stack = document.getElementById("notice-stack");
  const measuredHeight = Number(stack?.scrollHeight || 0);
  const height = hasTurnNotice || hasZoneNotice
    ? Math.max(
      1,
      window.innerWidth > 100 && measuredHeight > 1
        ? Math.ceil(measuredHeight)
        : fallbackHeight,
    )
    : 1;
  const key = `${hasTurnNotice ? 1 : 0}:${hasZoneNotice ? 1 : 0}:${height}`;
  if (key === lastNoticeLayoutKey) return;
  lastNoticeLayoutKey = key;
  void OBR.broadcast.sendMessage(
    LAYOUT_CHANNEL,
    {
      type: "turn-notice-layout",
      visible: hasTurnNotice || hasZoneNotice,
      height,
    },
    { destination: "LOCAL" },
  ).catch(() => {});
}

window.addEventListener("resize", () => {
  if (!currentPanel && !currentZonePanel) return;
  lastNoticeLayoutKey = "";
  window.requestAnimationFrame(announceNoticeLayout);
});

function buildPanel(notice: TurnNotice) {
  const panel = document.createElement("section");
  panel.className = "notice";
  panel.dataset.attitude = notice.currentAttitude;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-label", "Turno di " + notice.currentName + ". Prossimo: " + notice.nextName);

  const portrait = document.createElement("div");
  portrait.className = "portrait";
  const fallback = document.createElement("div");
  fallback.className = "portrait-fallback";
  fallback.textContent = notice.currentName.slice(0, 1).toUpperCase() || "?";
  portrait.appendChild(fallback);
  if (notice.currentPortrait) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = notice.currentPortrait;
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    portrait.appendChild(image);
  }

  const copy = document.createElement("div");
  copy.className = "copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Iniziativa";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Turno di " + notice.currentName;
  copy.append(eyebrow, title);

  const roundBadge = document.createElement("div");
  roundBadge.className = "round-badge";
  const roundLabel = document.createElement("span");
  roundLabel.textContent = "ROUND";
  const roundValue = document.createElement("strong");
  roundValue.textContent = String(notice.round);
  roundBadge.append(roundLabel, roundValue);

  const next = document.createElement("div");
  next.className = "next";
  const nextLabel = document.createElement("span");
  nextLabel.textContent = "A seguire";
  const nextName = document.createElement("strong");
  nextName.textContent = notice.nextName;
  next.append(nextLabel, nextName);

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, roundBadge, next, timer);
  return panel;
}

function hideCurrent() {
  if (!currentPanel) return;
  const leaving = currentPanel;
  currentPanel = null;
  announceNoticeLayout();
  leaving.classList.remove("is-visible");
  leaving.classList.add("is-leaving");
  window.setTimeout(() => leaving.remove(), FADE_MS);
}

function clearTurnNotice() {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  currentPanel?.remove();
  currentPanel = null;
  document.getElementById("app")?.replaceChildren();
  announceNoticeLayout();
}

function clearZoneNotice() {
  window.clearTimeout(zoneHideTimer);
  zoneHideTimer = 0;
  currentZonePanel?.remove();
  currentZonePanel = null;
  currentZoneTurnKey = "";
  currentSaveReminderBatch = null;
  document.getElementById("zone-app")?.replaceChildren();
  announceNoticeLayout();
}

function clearPendingSaveReminderNotices() {
  window.clearTimeout(saveReminderAggregationTimer);
  saveReminderAggregationTimer = 0;
  pendingSaveReminderNotices = [];
}

function showNotice(raw: any) {
  const app = document.getElementById("app");
  const notice = normalizeNotice(raw);
  if (!app || !notice) return;
  if (notice.noticeId && notice.noticeId <= lastNoticeId) return;
  if (notice.noticeId) lastNoticeId = notice.noticeId;

  pendingSaveReminderNotices = pendingSaveReminderNotices.filter((pending) =>
    !pending.turnKey
    || !notice.turnKey
    || pending.turnKey === notice.turnKey,
  );
  if (
    currentZonePanel
    && shouldClearZoneNoticeAtTurn(currentZoneTurnKey, notice.turnKey)
  ) {
    clearZoneNotice();
  }

  window.clearTimeout(hideTimer);
  const previous = currentPanel;
  const nextPanel = buildPanel(notice);
  currentPanel = nextPanel;
  app.appendChild(nextPanel);
  requestAnimationFrame(() => nextPanel.classList.add("is-visible"));
  if (previous) {
    previous.classList.remove("is-visible");
    previous.classList.add("is-leaving");
    window.setTimeout(() => previous.remove(), FADE_MS);
  }
  hideTimer = window.setTimeout(hideCurrent, AUTO_CLOSE_MS);
  announceNoticeLayout();
}

function resolutionDraftFor(activationId: string) {
  const current = resolutionDrafts.get(activationId);
  if (current) return current;
  const draft = { outcome: "", damageRoll: "" };
  resolutionDrafts.set(activationId, draft);
  return draft;
}

function setResolutionStatus(line: HTMLElement, activationId: string, message: string) {
  resolutionStatus.set(activationId, message);
  line.dataset.resolutionState = message ? "done" : "";
  line.querySelector("[data-resolution-controls]")?.remove();
  const previous = line.querySelector("[data-resolution-status]");
  previous?.remove();
  if (!message) return;
  const status = document.createElement("span");
  status.dataset.resolutionStatus = "1";
  status.textContent = message;
  status.setAttribute("role", "status");
  line.appendChild(status);
}

function resolutionStatusNode(line: HTMLElement, message: string) {
  const previous = line.querySelector("[data-resolution-status]");
  previous?.remove();
  if (!message) return;
  const status = document.createElement("span");
  status.dataset.resolutionStatus = "1";
  status.textContent = message;
  status.setAttribute("role", "alert");
  line.appendChild(status);
}

function dismissResolvedReminder(activationId: string) {
  const entries = Array.isArray(currentSaveReminderBatch?.entries)
    ? currentSaveReminderBatch.entries.filter((entry: any) => (
      String(entry?.activationId || "").trim() !== activationId
    ))
    : [];
  resolutionDrafts.delete(activationId);
  resolutionStatus.delete(activationId);
  if (!entries.length) {
    clearZoneNotice();
    return;
  }
  const nextBatch = mergeSaveReminderNoticeBatch(null, entries);
  if (!nextBatch || !renderSaveReminderBatch(nextBatch)) {
    clearZoneNotice();
    return;
  }
  currentSaveReminderBatch = nextBatch;
}

function buildResolutionControls(line: HTMLElement, row: any) {
  if (!reminderRowRequiresResponse(row)) return;
  const activationId = String(row.activationId || "").trim();
  const completed = resolutionStatus.get(activationId);
  if (completed) {
    setResolutionStatus(line, activationId, completed);
    return;
  }
  const draft = resolutionDraftFor(activationId);
  const manualHeal = row.resolution?.mode === "manual-heal";
  const manualDamage = row.resolution?.mode === "manual-damage";
  const controls = document.createElement("div");
  controls.dataset.resolutionControls = "1";
  controls.className = "zone-resolution";

  let damageInput: HTMLInputElement | null = null;
  if (reminderResolutionNeedsDamage(row.resolution) || manualHeal) {
    const damageLabel = document.createElement("label");
    damageLabel.className = "zone-resolution-damage";
    damageLabel.textContent = `${manualDamage ? "Danni" : "Risultato dadi"} (${manualHeal
      ? row.resolution.healing?.dice
      : row.resolution.damage.dice})`;
    damageInput = document.createElement("input");
    damageInput.type = manualDamage ? "text" : "number";
    damageInput.min = "0";
    damageInput.step = "1";
    damageInput.inputMode = "numeric";
    damageInput.value = draft.damageRoll;
    damageInput.placeholder = "0";
    damageInput.setAttribute("aria-label", "Risultato dei dadi");
    damageInput.addEventListener("input", () => {
      draft.damageRoll = damageInput?.value || "";
    });
    damageLabel.appendChild(damageInput);
    controls.appendChild(damageLabel);
  }

  const outcomes = document.createElement("div");
  outcomes.className = "zone-resolution-outcomes";

  const refreshSelection = () => {
    for (const button of Array.from(outcomes.querySelectorAll("button"))) {
      button.classList.toggle("is-selected", button.dataset.outcome === draft.outcome);
    }
  };

  const resolve = async (outcome: string) => {
    if (resolvingActivations.has(activationId)) return;
    draft.outcome = outcome;
    refreshSelection();
    if (
      damageInput
      && outcome !== "ignore"
      && (!damageInput.value.trim() || !Number.isFinite(Number(damageInput.value)))
    ) {
      resolutionStatusNode(line, "Inserisci un risultato dei dadi valido.");
      damageInput.focus();
      return;
    }

    resolvingActivations.add(activationId);
    for (const button of Array.from(controls.querySelectorAll("button, input"))) {
      (button as HTMLButtonElement | HTMLInputElement).disabled = true;
    }
    resolutionStatusNode(line, "Risoluzione in corso…");
    try {
      const result = await resolveReminder({
        notice: {
          activationId,
          targets: row.targets || [],
          resolution: row.resolution,
        },
        outcome: draft.outcome,
        damageRoll: draft.damageRoll,
        sceneEpoch: currentSceneEpoch(),
      });
      if (result.status === "applied" || result.status === "already-resolved") {
        setResolutionStatus(
          line,
          activationId,
          result.message || `Risolto: ${RESOLUTION_LABELS[draft.outcome]}.`,
        );
        dismissResolvedReminder(activationId);
      } else {
        resolutionStatusNode(line, result.message || "Reminder non più corrente; puoi chiuderlo.");
        for (const button of Array.from(controls.querySelectorAll("button, input"))) {
          (button as HTMLButtonElement | HTMLInputElement).disabled = false;
        }
        refreshSelection();
      }
    } catch (error) {
      resolutionStatusNode(line, String((error as any)?.message || "Risoluzione non riuscita; puoi chiudere il reminder."));
      for (const button of Array.from(controls.querySelectorAll("button, input"))) {
        (button as HTMLButtonElement | HTMLInputElement).disabled = false;
      }
      refreshSelection();
    } finally {
      resolvingActivations.delete(activationId);
    }
  };

  const outcomeOptions = manualDamage
    ? [{ value: "confirmed", label: "Conferma" }]
    : manualHeal
      ? [{ value: "apply", label: "Applica cura" }, { value: "ignore", label: "Ignora" }]
      : RESOLUTION_BUTTON_OUTCOMES.map((value) => ({
      value,
      label: row.resolution?.choiceLabels?.[value]
        || RESOLUTION_LABELS[value]
        || value,
      }));
  for (const option of outcomeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outcome = option.value;
    button.textContent = option.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void resolve(option.value);
    });
    outcomes.appendChild(button);
  }
  controls.append(outcomes);
  line.appendChild(controls);
}

function reminderRowRequiresResponse(row: any) {
  return noticeRole === "GM"
    && !!row?.resolution
    && row.resolution?.mode !== "consume"
    && Array.isArray(row.targets)
    && row.targets.length === 1
    && !!String(row.activationId || "").trim();
}

function renderSaveReminderBatch(batch: any) {
  const app = document.getElementById("zone-app");
  const presentation = saveReminderNoticeBatchPresentation(batch);
  if (!app || !presentation) return false;
  const primary = presentation.primaryTarget;
  const panel = document.createElement("section");
  panel.className = "zone-notice";
  panel.dataset.kind = presentation.kind;
  panel.dataset.activationId = batch.activationIds.join(" ");
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-label", presentation.ariaLabel);

  const portrait = document.createElement("div");
  portrait.className = "zone-portrait";
  const fallback = document.createElement("div");
  fallback.className = "zone-portrait-fallback";
  fallback.textContent = primary.name.slice(0, 1).toUpperCase() || "?";
  portrait.appendChild(fallback);
  if (primary.portrait) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = primary.portrait;
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    portrait.appendChild(image);
  }

  const copy = document.createElement("div");
  copy.className = "zone-copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "zone-eyebrow";
  eyebrow.textContent = presentation.eyebrow;
  const title = document.createElement("div");
  title.className = "zone-title";
  title.textContent = presentation.title;
  copy.append(eyebrow, title);

  const detail = document.createElement("div");
  detail.className = "zone-detail";
  detail.dataset.multiple = presentation.rows.length > 1 ? "true" : "false";
  for (const row of presentation.rows) {
    const line = document.createElement("div");
    line.className = "zone-detail-row";
    line.dataset.activationId = row.activationId;
    if (row.title) {
      const rowTitle = document.createElement("strong");
      rowTitle.textContent = row.title;
      line.append(rowTitle);
    }
    const instruction = document.createElement("span");
    instruction.textContent = row.detail;
    line.append(instruction);
    buildResolutionControls(line, row);
    detail.append(line);
  }

  const requiresResponse = presentation.rows.some(reminderRowRequiresResponse);
  panel.append(portrait, copy, detail);
  window.clearTimeout(zoneHideTimer);
  zoneHideTimer = 0;
  app.replaceChildren(panel);
  currentZonePanel = panel;
  currentZoneTurnKey = String(batch.turnKey || "").trim();
  announceNoticeLayout();
  if (!requiresResponse) {
    const timer = document.createElement("div");
    timer.className = "zone-timer";
    panel.appendChild(timer);
    zoneHideTimer = window.setTimeout(() => {
      if (currentZonePanel === panel) {
        currentZonePanel = null;
        currentZoneTurnKey = "";
        currentSaveReminderBatch = null;
        zoneHideTimer = 0;
        announceNoticeLayout();
      }
      panel.remove();
    }, ZONE_AUTO_CLOSE_MS);
  }
  return true;
}

function flushSaveReminderNotices() {
  saveReminderAggregationTimer = 0;
  const values = pendingSaveReminderNotices;
  pendingSaveReminderNotices = [];
  if (!values.length) return;
  const baseBatch = currentZonePanel ? currentSaveReminderBatch : null;
  const batch = mergeSaveReminderNoticeBatch(baseBatch, values);
  if (!batch || !renderSaveReminderBatch(batch)) return;
  currentSaveReminderBatch = batch;
}

function queueSaveReminderNotices(values: ZoneTriggerNotice[]) {
  const notices = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!notices.length) return false;
  pendingSaveReminderNotices.push(...notices.map((notice) => ({
    ...notice,
    instruction: notice.instruction || zoneTriggerNoticeDetail(notice),
  })));
  window.clearTimeout(saveReminderAggregationTimer);
  saveReminderAggregationTimer = window.setTimeout(
    flushSaveReminderNotices,
    SAVE_REMINDER_AGGREGATION_MS,
  );
  return true;
}

function effectSaveNotice(raw: any): ZoneTriggerNotice | null {
  const activationId = String(raw?.activationId || "").trim();
  const effectName = String(raw?.effectName || "").trim().slice(0, 100);
  const saveLabel = String(raw?.saveLabel || "").trim().slice(0, 160);
  const targetId = String(raw?.target?.id || "").trim();
  if (!activationId || !effectName || !saveLabel || !targetId) return null;
  const targetName = String(raw?.target?.name || "Token").trim().slice(0, 100)
    || "Token";
  const casterName = String(raw?.sourceName || "").trim().slice(0, 100);
  const informational = raw?.kind === "effect-reminder";
  return {
    activationId,
    turnKey: String(raw?.turnKey || "").trim().slice(0, 300) || undefined,
    timing: (
      raw?.timing === "turn-start"
      || raw?.timing === "turn-end"
      || raw?.timing === "damage"
    ) ? raw.timing : undefined,
    spellName: effectName,
    label: saveLabel,
    kind: informational ? "effect-reminder" : "effect-save",
    eyebrow: informational
      ? String(raw?.eyebrow || "Promemoria").trim().slice(0, 80)
      : "Tiro salvezza",
    instruction: informational
      ? String(raw?.instruction || saveLabel).trim()
      : `${saveLabel}${casterName ? ` (${casterName})` : ""}. ${
        String(raw?.instruction || "Risolvi il tiro salvezza.").trim()
      }`,
    ...(raw?.resolution ? { resolution: raw.resolution } : {}),
    targets: [{
      id: targetId,
      name: targetName,
      portrait: String(raw?.target?.portrait || "").trim().slice(0, 2048),
    }],
  };
}

function showEffectSaveNotices(raw: any) {
  const values = projectReminderNotices(raw?.notices, {
    role: noticeRole,
    policy: reminderProjectionPolicy.player,
    directResolution: reminderProjectionPolicy.directResolution,
  });
  const notices: ZoneTriggerNotice[] = [];
  for (const value of values) {
    const notice = effectSaveNotice(value);
    if (
      !notice
      || announcedEffectActivationIds.has(notice.activationId)
    ) {
      continue;
    }
    notices.push(notice);
    announcedEffectActivationIds.add(notice.activationId);
  }
  queueSaveReminderNotices(notices);
}

function showZoneNotices(raw: any, { baseline = false } = {}) {
  const values = projectReminderNotices(raw?.notices, {
    role: noticeRole,
    policy: reminderProjectionPolicy.player,
    directResolution: reminderProjectionPolicy.directResolution,
  });
  const plan = planZoneTriggerNoticeDelivery(
    values,
    [...announcedZoneActivationIds],
  );
  if (baseline) {
    for (const activationId of plan.announcedIds) {
      announcedZoneActivationIds.add(activationId);
    }
    return;
  }
  if (queueSaveReminderNotices(plan.notices as ZoneTriggerNotice[])) {
    for (const activationId of plan.announcedIds) {
      announcedZoneActivationIds.add(activationId);
    }
  }
}

async function syncPendingZoneNotices() {
  if (!await OBR.scene.isReady().catch(() => false)) {
    zonePendingBaselineReady = false;
    announcedZoneActivationIds.clear();
    clearPendingSaveReminderNotices();
    clearZoneNotice();
    return;
  }
  const items = await OBR.scene.items.getItems();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const notices = pendingSpellZoneTriggerActivations(items)
    .map((activation) => zoneTriggerNoticeFromActivation(
      activation,
      itemsById,
    ))
    .filter((notice): notice is ZoneTriggerNotice => !!notice);
  const baseline = !zonePendingBaselineReady;
  showZoneNotices({ notices }, { baseline });
  zonePendingBaselineReady = true;
}

function requestPendingZoneNoticeSync() {
  zonePendingSyncRequested = true;
  if (zonePendingSyncRunning) return;
  zonePendingSyncRunning = true;
  const run = async () => {
    try {
      while (zonePendingSyncRequested) {
        zonePendingSyncRequested = false;
        await syncPendingZoneNotices();
      }
    } catch (error) {
      console.warn(
        "[turn-notice] zone sync:",
        (error as any)?.message || error,
      );
    } finally {
      zonePendingSyncRunning = false;
      if (zonePendingSyncRequested) requestPendingZoneNoticeSync();
    }
  };
  void run();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideCurrent();
    clearZoneNotice();
  }
});

OBR.onReady(async () => {
  await startRuntimeOptions().catch(() => {});
  noticeRole = await OBR.player.getRole()
    .then((role) => role === "GM" ? "GM" : "PLAYER")
    .catch(() => "PLAYER");
  if (noticeRole === "GM" && currentSaveReminderBatch) {
    renderSaveReminderBatch(currentSaveReminderBatch);
  }
  reminderProjectionPolicy = runtimeOptionsService.get(selectReminderProjectionPolicy);
  unsubscribeOptions = runtimeOptionsService.subscribe(
    selectReminderProjectionPolicy,
    (policy) => {
      reminderProjectionPolicy = policy;
      if (!policy.popup) clearTurnNotice();
      clearPendingSaveReminderNotices();
      clearZoneNotice();
    },
    { emitCurrent: false },
  );
  unsubscribeUiBroadcast = OBR.broadcast.onMessage(UI_CHANNEL, (event) => {
    const data = event?.data;
    if (
      data?.type === "show-turn-notice"
      && reminderProjectionPolicy.popup
      && isTurnNoticeForScene(data, noticeSceneEpoch, noticeSceneReady)
    ) {
      showNotice(data);
      return;
    }
    if (data?.type === "show-effect-save-notices") {
      showEffectSaveNotices(data);
      return;
    }
    if (data?.type === "show-zone-trigger-notices") {
      showZoneNotices(data);
    }
  });
  const announceReady = () => OBR.broadcast.sendMessage(
    READY_CHANNEL,
    { type: "turn-notice-ready", sceneEpoch: noticeSceneEpoch },
    { destination: "LOCAL" },
  ).catch(() => {});
  unsubscribeTurnNoticeReadyRequest = OBR.broadcast.onMessage(
    READY_CHANNEL,
    (event) => {
      if (event?.data?.type !== "turn-notice-ready-request") return;
      const requestedEpoch = Number(event?.data?.sceneEpoch);
      if (Number.isFinite(requestedEpoch) && requestedEpoch >= 0) {
        noticeSceneEpoch = Math.floor(requestedEpoch);
      }
      void announceReady();
    },
  );
  void announceReady();
  unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      noticeSceneEpoch += 1;
      noticeSceneReady = false;
      clearTurnNotice();
      zonePendingBaselineReady = false;
      announcedZoneActivationIds.clear();
      announcedEffectActivationIds.clear();
      resolutionDrafts.clear();
      resolutionStatus.clear();
      resolvingActivations.clear();
      clearPendingSaveReminderNotices();
      clearZoneNotice();
      return;
    }
    noticeSceneReady = true;
    void announceReady();
    if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) requestPendingZoneNoticeSync();
  });
  announceNoticeLayout();
  if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;
  requestPendingZoneNoticeSync();
});

window.addEventListener("beforeunload", () => {
  clearTurnNotice();
  clearPendingSaveReminderNotices();
  unsubscribeZoneSceneReady?.();
  unsubscribeUiBroadcast?.();
  unsubscribeTurnNoticeReadyRequest?.();
  unsubscribeOptions?.();
});
