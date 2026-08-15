import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { shouldKeepSpeedReadoutOpen } from "./speedCheckCore.js";

const COMPACT_PART = new URLSearchParams(window.location.search).get("part") === "speed"
  ? "speed"
  : "round";
document.documentElement.dataset.part = COMPACT_PART;
const STATE_KEY = `${ID}/state`;
const SPEED_STATE_CHANNEL = `${ID}/speed-state`;
const COMPACT_SPEED_COMMAND_CHANNEL = `${ID}/compact-speed-readout`;
const roundLabel = document.getElementById("round-label");
const speedReadout = document.getElementById("compact-speed-readout");
const speedSummary = document.getElementById("speed-summary");
const speedBar = document.getElementById("speed-bar");
const speedLimitControl = document.getElementById("speed-limit-control");
const speedLimitCheckbox = document.getElementById("speed-limit");
let latestSpeedSnapshot = null;

function renderRound(metadata) {
  const round = Math.max(1, Math.floor(Number(metadata?.[STATE_KEY]?.round) || 1));
  roundLabel.textContent = `Round ${round}`;
}

function movementNumber(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function renderSpeed(snapshot) {
  const previousSnapshot = latestSpeedSnapshot;
  latestSpeedSnapshot = snapshot;
  speedReadout.hidden = !shouldKeepSpeedReadoutOpen(snapshot, previousSnapshot);
  if (!snapshot?.available) return;

  speedSummary.textContent = `${movementNumber(snapshot.totalMeters)}/${movementNumber(snapshot.allowanceMeters)} m · (${movementNumber(snapshot.totalCells)}/${movementNumber(snapshot.allowanceCells)})`;
  speedLimitCheckbox.checked = snapshot.movementLimited === true;
  const percent = Math.max(0, Math.min(100, (Number(snapshot.progress) || 0) * 100));
  speedBar.style.width = `${percent}%`;
  speedBar.style.background = snapshot.blocked || percent >= 99.9
    ? "#ef4444"
    : percent >= 75
      ? "#f59e0b"
      : "#3b82f6";
  speedReadout.title = `${snapshot.name || "Movimento"}: ${movementNumber(snapshot.totalMeters)} m totali; ${movementNumber(snapshot.remainingMeters)} m disponibili`;
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
  speedLimitControl.dataset.visible = String(role || "").toUpperCase() === "GM" ? "1" : "0";
  requestSpeedSnapshot();
  window.setTimeout(requestSpeedSnapshot, 500);
});
