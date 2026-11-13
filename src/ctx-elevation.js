import OBR from "@owlbear-rodeo/sdk";
import {
  isElevationToken,
  readClimbing,
  readElevation,
  writeElevationForItems,
} from "./distance3d.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  spellZoneHoverElevation,
  spellZoneHoverMaxSquares,
} from "./spellStaticZoneCore.js";

const input = document.querySelector("#elevation");
const climbingInput = document.querySelector("#climbing");
const unitLabel = document.querySelector("#unit");
let ids = [];
let step = 1;
// The selection had different heights: an empty field keeps each token's own.
let mixedElevation = false;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
// CAP-CARRIAGE (decision H-1 of 12/11/2026): opened on a zone that holds creatures up (the Watery Sphere), the height is
// the zone's, up to its maximum, and the creatures it holds go with it, in one command with its History and Undo.
const zoneMode = new URLSearchParams(location.search).get("zone") === "1";
// The coordinator is heavy: loaded alongside, as in ctx-conditions.ts.
const mutationsModule = zoneMode ? import("./effectsMutations.js") : null;
let zones = [];

function hoverZone(item) {
  const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  return metadata?.role === "root" && !!spellZoneHoverMaxSquares(metadata.spellId);
}

async function applyZoneHeight(operation) {
  const typed = input.value.trim();
  const value = typed === "" ? 0 : Number(typed);
  if (!Number.isFinite(value) || value < 0) return false;
  const {
    getEffectsMutationSceneContext,
    requireAppliedEffectsMutation,
    runEffectsMutation,
  } = await mutationsModule;
  if (!sceneLifecycle.isCurrent(operation)) return false;
  for (const zone of zones) {
    const name = String(zone.name || "").replace(/^Zona:\s*/u, "").trim() || "Zona";
    const label = `${name} · quota ${String(value).replace(".", ",")} ${unitLabel.textContent}`.trim();
    const owner = await getEffectsMutationSceneContext({ commandId: `${operation.operationId}:${zone.id}` });
    if (!sceneLifecycle.isCurrent(operation)) return false;
    const mutation = await runEffectsMutation([], {
      kind: "zone-hover",
      label,
      targetIds: [zone.id],
      sideEffects: [{ type: "static-zone:set-hover", zoneItemId: zone.id, value }],
      history: { kind: "zone-hover", label },
      commandId: owner.commandId,
      sceneIdentity: owner.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return false;
    requireAppliedEffectsMutation(mutation);
  }
  return true;
}

function closeSoon() {
  Promise.resolve().then(() => OBR.player.deselect().catch(() => {}));
  setTimeout(() => OBR.player.deselect().catch(() => {}), 20);
}

async function apply() {
  const operation = sceneLifecycle.capture({ operationId: `ctx-elevation:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  if (zoneMode) {
    try {
      if (!await applyZoneHeight(operation)) return;
    } catch (error) {
      console.warn("[ctx-elevation] quota della zona:", error?.message || error);
      void OBR.notification.show("Quota non salvata: la zona è cambiata nel frattempo. Riprova.", "WARNING").catch(() => {});
      return;
    }
    if (!sceneLifecycle.isCurrent(operation)) return;
    closeSoon();
    return;
  }
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
  if (zoneMode) {
    zones = await OBR.scene.items.getItems((item) => selected.has(item.id) && hoverZone(item));
    if (!sceneLifecycle.isReady()) return;
    const heights = zones.map(spellZoneHoverElevation);
    const same = heights.length && heights.every((value) => value === heights[0]);
    const maxSquares = Math.min(...zones.map((zone) => spellZoneHoverMaxSquares(zone.metadata[SPELL_STATIC_ZONE_META_KEY].spellId)));
    step = Math.max(0.01, Number(scale?.parsed?.multiplier) || 1);
    input.value = same ? String(heights[0]) : "";
    input.placeholder = "0";
    input.step = String(step);
    input.min = "0";
    unitLabel.textContent = String(scale?.parsed?.unit || "");
    // The climbing box is a creature's: here the line says how high the zone goes (in the scene's unit: 3 m, 10 ft) and
    // who follows it.
    const maxText = `${String(Math.round(maxSquares * step * 100) / 100).replace(".", ",")} ${unitLabel.textContent}`.trim();
    const hint = climbingInput.closest("label");
    climbingInput.remove();
    if (hint) hint.textContent = `Fino a ${maxText} da terra: chi trattiene la segue.`;
    input.focus();
    input.select();
    return;
  }
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
