import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { compactSpeedReadout } from "./initiativeMovementPresentation.js";
import { shouldKeepSpeedReadoutOpen } from "./speedCheckCore.js";

const COMPACT_PART = new URLSearchParams(window.location.search).get("part") === "speed"
  ? "speed"
  : "round";
document.documentElement.dataset.part = COMPACT_PART;
// Tracker scale: the tab follows the compact bar (`scale` in the URL, see trackerPopover.js).
const TAB_SCALE = Number(new URLSearchParams(window.location.search).get("scale"));
if (Number.isFinite(TAB_SCALE) && TAB_SCALE > 0 && TAB_SCALE !== 1) document.documentElement.style.zoom = String(TAB_SCALE);
const STATE_KEY = `${ID}/state`;
const SPEED_STATE_CHANNEL = `${ID}/speed-state`;
const COMPACT_SPEED_COMMAND_CHANNEL = `${ID}/compact-speed-readout`;
const roundLabel = document.getElementById("round-label");
const speedReadout = document.getElementById("compact-speed-readout");
const speedSummary = document.getElementById("speed-summary");
const speedBar = document.getElementById("speed-bar");
const speedLimitControl = document.getElementById("speed-limit-control");
const speedLimitCheckbox = document.getElementById("speed-limit");
const speedModeControl = document.getElementById("speed-mode-control");
const speedModeLabel = document.getElementById("speed-mode-label");
const speedModeSelect = document.getElementById("speed-mode");
let latestSpeedSnapshot = null;
let isGm = false;

function renderRound(metadata) {
  const round = Math.max(1, Math.floor(Number(metadata?.[STATE_KEY]?.round) || 1));
  roundLabel.textContent = `Round ${round}`;
}

function movementNumber(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function renderSpeedModes({ modes, activeLabel }, activeMode) {
  speedModeControl.dataset.visible = modes.length ? "1" : "0";
  if (!modes.length) return;
  const signature = modes.map((mode) => `${mode.id}:${mode.label}`).join("|");
  if (speedModeSelect.dataset.signature !== signature) {
    speedModeSelect.dataset.signature = signature;
    speedModeSelect.replaceChildren(...modes.map((mode) => {
      const option = document.createElement("option");
      option.value = mode.id;
      option.textContent = mode.label;
      return option;
    }));
  }
  speedModeSelect.value = activeMode;
  speedModeLabel.textContent = activeLabel;
}

function renderSpeed(snapshot) {
  const previousSnapshot = latestSpeedSnapshot;
  latestSpeedSnapshot = snapshot;
  speedReadout.hidden = !shouldKeepSpeedReadoutOpen(snapshot, previousSnapshot);
  if (!snapshot?.available) return;

  const readout = compactSpeedReadout(snapshot, { gm: isGm });
  speedSummary.textContent = readout.summary;
  renderSpeedModes(readout, snapshot.activeMode);
  speedLimitCheckbox.checked = snapshot.movementLimited === true;
  const percent = Math.max(0, Math.min(100, (Number(snapshot.progress) || 0) * 100));
  speedBar.style.width = `${percent}%`;
  speedBar.style.background = snapshot.blocked || percent >= 99.9
    ? "#ef4444"
    : percent >= 75
      ? "#f59e0b"
      : "#3b82f6";
  speedReadout.title = `${snapshot.name || "Movimento"}: ${movementNumber(snapshot.totalMeters)} m totali; ${movementNumber(snapshot.remainingMeters)} m disponibili; ${movementNumber(snapshot.totalCells)}/${movementNumber(snapshot.allowanceCells)} caselle`;
}

function requestSpeedSnapshot() {
  void OBR.broadcast.sendMessage(SPEED_STATE_CHANNEL, {
    type: "request-speed-state",
    turnKey: "",
  }, { destination: "ALL" }).catch(() => {});
}

speedLimitCheckbox.addEventListener("change", () => {
  void OBR.broadcast.sendMessage(COMPACT_SPEED_COMMAND_CHANNEL, {
    type: "set-movement-limit",
    enabled: speedLimitCheckbox.checked,
  }, { destination: "LOCAL" }).catch(() => {});
});

speedModeSelect.addEventListener("change", () => {
  void OBR.broadcast.sendMessage(COMPACT_SPEED_COMMAND_CHANNEL, {
    type: "set-movement-mode",
    mode: speedModeSelect.value,
  }, { destination: "LOCAL" }).catch(() => {});
  // Out of the list, the arrow keys no longer change the mode by accident.
  speedModeSelect.blur();
});

OBR.onReady(async () => {
  if (COMPACT_PART === "round") {
    OBR.scene.onMetadataChange(renderRound);
    renderRound(await OBR.scene.getMetadata().catch(() => null));
    return;
  }

  OBR.broadcast.onMessage(SPEED_STATE_CHANNEL, (event) => {
    if (event?.data?.type === "speed-state") renderSpeed(event.data.snapshot);
  });

  const role = await Promise.resolve()
    .then(() => OBR.player?.getRole?.())
    .catch(() => "PLAYER");
  isGm = String(role || "").toUpperCase() === "GM";
  speedLimitControl.dataset.visible = isGm ? "1" : "0";
  requestSpeedSnapshot();
  window.setTimeout(requestSpeedSnapshot, 500);
});
