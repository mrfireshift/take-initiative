import OBR from "@owlbear-rodeo/sdk";
import {
  isElevationToken,
  readClimbing,
  readElevation,
  writeElevationForItems,
} from "./distance3d.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const input = document.querySelector("#elevation");
const climbingInput = document.querySelector("#climbing");
const unitLabel = document.querySelector("#unit");
let ids = [];
let step = 1;
// The selection had different heights: an empty field keeps each token's own.
let mixedElevation = false;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function closeSoon() {
  Promise.resolve().then(() => OBR.player.deselect().catch(() => {}));
  setTimeout(() => OBR.player.deselect().catch(() => {}), 20);
}

async function apply() {
  const operation = sceneLifecycle.capture({ operationId: `ctx-elevation:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const typed = input.value.trim();
  // An indeterminate box (different climbing states, left untouched) keeps each token's own.
  try {
    await writeElevationForItems(ids, typed === "" ? mixedElevation ? null : 0 : typed,
      climbingInput.indeterminate ? null : climbingInput.checked, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
  } catch (error) {
    // A refused write said nothing (lot L19): the field stays open with a notice.
    console.warn("[ctx-elevation] quota:", error?.message || error);
    void OBR.notification.show("Quota non salvata: il token è cambiato nel frattempo. Riprova.", "WARNING").catch(() => {});
    return;
  }
  if (!sceneLifecycle.isCurrent(operation)) return;
  closeSoon();
}

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = String((Number(input.value) || 0) + Number(button.dataset.step) * step);
  });
});
document.querySelector("#apply").addEventListener("click", () => void apply());
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void apply();
  if (event.key === "Escape") closeSoon();
});

OBR.onReady(async () => {
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) return;
  const [selection, scale] = await Promise.all([
    OBR.player.getSelection().catch(() => []),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1, unit: "" } })),
  ]);
  if (!sceneLifecycle.isReady()) return;
  const selected = new Set(selection || []);
  const items = await OBR.scene.items.getItems((item) => selected.has(item.id) && isElevationToken(item));
  if (!sceneLifecycle.isReady()) return;
  ids = items.map((item) => item.id);
  step = Math.max(0.01, Number(scale?.parsed?.multiplier) || 1);
  const values = items.map(readElevation);
  const same = values.length && values.every((value) => value === values[0]);
  mixedElevation = !same && values.length > 1;
  input.value = same ? String(values[0]) : "";
  input.placeholder = same ? "0" : "Valori diversi";
  input.step = String(step);
  const climbingValues = items.map(readClimbing);
  const sameClimbing = climbingValues.length
    && climbingValues.every((value) => value === climbingValues[0]);
  climbingInput.checked = sameClimbing ? climbingValues[0] : false;
  climbingInput.indeterminate = climbingValues.length > 0 && !sameClimbing;
  unitLabel.textContent = String(scale?.parsed?.unit || "");
  input.focus();
  input.select();
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
