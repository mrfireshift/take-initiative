import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getConditionInstances } from "./conditions.js";
import {
  DEATH_SAVE_OUTCOME_LABELS,
  DEATH_SAVE_OUTCOMES,
  isDeadByDeathSaves,
  isStableByDeathSaves,
  readDeathSaves,
} from "./deathSaveCore.js";
import { lazyModule } from "./lazyModule.js";
import { normalizeReminderResolution } from "./reminderResolutionCore.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { perfBootPage } from "./perfProbe.js";

perfBootPage(OBR);
// The GM's outcome buttons only: not needed before the notice's first paint.
const loadReminderResolution = lazyModule(() => import("./reminderResolution.js"));

// The death save of the PC at 0 HP whose turn starts (deathSaveNoticeHost.js): its tally read live from the token,
// the GM's four outcomes through the same reminder resolution as the other reminders, the same card without buttons
// on the table screen. It closes on its own once the roll is written.
const POPOVER_ID = `${ID}/death-save-notice`;
const META_KEY = `${ID}/meta`;
const RESOLVED_CLOSE_MS = 3500;
const $ = (id) => document.getElementById(id);
const notice = (() => {
  try { return JSON.parse(new URLSearchParams(window.location.search).get("payload") || "{}").notice || null; }
  catch { return null; }
})();
const target = Array.isArray(notice?.targets) ? notice.targets[0] : notice?.target || null;
const activationId = String(notice?.activationId || "").trim();
const OUTCOME_HINTS = Object.freeze({
  [DEATH_SAVE_OUTCOMES.SUCCESS]: "10 o più",
  [DEATH_SAVE_OUTCOMES.FAILURE]: "sotto 10",
  [DEATH_SAVE_OUTCOMES.NAT20]: "torna a 1 PF",
  [DEATH_SAVE_OUTCOMES.NAT1]: "due fallimenti",
});
let resolving = false;
let closing = false;

function close() {
  if (closing) return;
  closing = true;
  void OBR.popover.close(POPOVER_ID).catch(() => {});
}

function renderMarks(node, count, className, symbol) {
  node.replaceChildren(...[0, 1, 2].map((index) => {
    const mark = document.createElement("span");
    mark.className = `mark ${className}${index < count ? " on" : ""}`;
    mark.textContent = symbol;
    return mark;
  }));
}

// The token as it is now: the tally, and whether the roll of this turn is already written.
function renderToken(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const instances = getConditionInstances(meta.conditions || {});
  const { successes, failures } = readDeathSaves(meta);
  const dead = isDeadByDeathSaves(instances);
  const stable = isStableByDeathSaves(instances);
  const revived = !dead && Number(meta.hp) > 0;
  renderMarks($("successes"), stable || revived ? 3 : successes, "success", "");
  renderMarks($("failures"), dead ? 3 : failures, "failure", "☠");
  const result = dead ? "dead" : stable ? "stable" : revived ? "revived" : "";
  if (result) $("card").dataset.result = result;
  const resolved = !!meta.reminderResolutions && Object.prototype.hasOwnProperty.call(meta.reminderResolutions, activationId);
  if (resolved || result) {
    $("status").textContent = dead ? "Tre fallimenti: è morto." : stable ? "Tre successi: è stabile."
      : revived ? "20 naturale: torna a 1 PF." : `Tirato · Successi ${successes}/3 · Fallimenti ${failures}/3`;
    for (const button of document.querySelectorAll("#outcomes button")) button.disabled = true;
    window.setTimeout(close, RESOLVED_CLOSE_MS);
  }
}

// The descriptor an Undo re-arms the reminder from (the same shape the shared reminder popover writes).
function historyReplay() {
  const resolution = notice?.resolution;
  const activation = resolution?.activation;
  const compactResolution = normalizeReminderResolution(resolution, { targetId: target?.id, activation });
  if (!activationId || !target?.id || !compactResolution) return null;
  return {
    type: "reminder",
    owner: "effect-save",
    activationId,
    targetId: target.id,
    descriptor: {
      activationId,
      targetId: target.id,
      notice: {
        activationId,
        ...(notice.turnKey ? { turnKey: String(notice.turnKey).slice(0, 300) } : {}),
        timing: "turn-start",
        effectName: "TS contro la morte",
        spellName: "TS contro la morte",
        kind: "effect-reminder",
        eyebrow: "TS contro la morte",
        ...(notice.saveLabel ? { saveLabel: String(notice.saveLabel).slice(0, 160) } : {}),
        targets: [{ id: target.id, name: String(target.name || "Token").slice(0, 100) }],
        resolution: compactResolution,
      },
    },
  };
}

async function resolve(outcome) {
  if (resolving) return;
  resolving = true;
  for (const button of document.querySelectorAll("#outcomes button")) button.disabled = true;
  $("status").textContent = "Registrazione…";
  try {
    const { resolveReminder } = await loadReminderResolution();
    const result = await resolveReminder({
      notice: {
        activationId,
        spellName: "TS contro la morte",
        kind: notice.kind || "effect-reminder",
        targets: [{ id: target.id, name: target.name || "Token" }],
        resolution: notice.resolution,
      },
      outcome,
      sceneEpoch: currentSceneEpoch(),
      historyReplay: historyReplay(),
    });
    if (result.status === "applied" || result.status === "already-resolved") {
      $("status").textContent = result.message || `Registrato: ${DEATH_SAVE_OUTCOME_LABELS[outcome]}.`;
      window.setTimeout(close, RESOLVED_CLOSE_MS);
      return;
    }
    $("status").textContent = result.message || "Il TS non è più valido.";
  } catch (error) {
    $("status").textContent = String(error?.message || "Registrazione non riuscita.");
  }
  resolving = false;
  for (const button of document.querySelectorAll("#outcomes button")) button.disabled = false;
}

function renderOutcomes() {
  const node = $("outcomes");
  const order = [DEATH_SAVE_OUTCOMES.SUCCESS, DEATH_SAVE_OUTCOMES.FAILURE, DEATH_SAVE_OUTCOMES.NAT20, DEATH_SAVE_OUTCOMES.NAT1];
  node.replaceChildren(...order.map((outcome) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outcome = outcome;
    button.append(DEATH_SAVE_OUTCOME_LABELS[outcome], Object.assign(document.createElement("small"), { textContent: OUTCOME_HINTS[outcome] }));
    button.addEventListener("click", () => void resolve(outcome));
    return button;
  }));
  node.hidden = false;
  $("rule").hidden = true;
}

$("close").addEventListener("click", close);
$("name").textContent = String(target?.name || "Personaggio");
if (target?.portrait) $("portrait").src = target.portrait;
else $("portrait").closest(".portrait").hidden = true;
renderMarks($("successes"), 0, "success", "");
renderMarks($("failures"), 0, "failure", "☠");

OBR.onReady(async () => {
  if (!activationId || !target?.id) { close(); return; }
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  // The GM records the roll; the table screen (and a GM in informational mode, without a resolution) only watches.
  if (role === "GM" && notice.resolution) renderOutcomes();
  const [item] = await OBR.scene.items.getItems([target.id]).catch(() => []);
  if (!item) { close(); return; }
  renderToken(item);
  OBR.scene.items.onChange((items) => {
    const current = items.find((entry) => entry.id === target.id);
    if (!current) { close(); return; }
    renderToken(current);
  });
});
