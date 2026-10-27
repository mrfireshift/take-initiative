// Duration override popup, opened by a right click on a tracker pill (GM only).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { describeEffectDurationTarget, planEffectDurationOverride } from "./effectDurationOverrideCore.js";
import { refreshConditionLabels } from "./conditions.js";
import { lazyModule } from "./lazyModule.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

export const EFFECT_DURATION_POPOVER_ID = `${ID}/effect-duration`;
const STATE_KEY = `${ID}/state`;
const params = new URLSearchParams(window.location.search);
const request = {
  itemId: params.get("itemId") || "",
  conditionInstanceId: params.get("conditionInstanceId") || "",
  spellInstanceId: params.get("spellInstanceId") || "",
};
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
// The Applica button only: not needed before the popup's first paint.
const loadEffectsMutations = lazyModule(() => import("./effectsMutations.js"));
const $ = (id) => document.getElementById(id);
let target = null;

const close = () => { void OBR.popover.close(EFFECT_DURATION_POPOVER_ID).catch(() => {}); };

// The popup opens with a guessed height; it then fits its content.
function fitHeight() {
  const shell = document.querySelector(".glass-shell");
  const height = Math.ceil(shell?.getBoundingClientRect?.().height || 0);
  if (height > 0) void OBR.popover.setHeight(EFFECT_DURATION_POPOVER_ID, height).catch(() => {});
}

function syncManual() {
  const manual = $("manual").checked;
  $("amount").disabled = manual;
  $("unit").disabled = manual;
}

async function load() {
  const items = await OBR.scene.items.getItems();
  target = describeEffectDurationTarget(items, request);
  if (!target) {
    $("title").textContent = "Effetto non trovato";
    $("meta").textContent = "L'effetto è già terminato o è stato rimosso.";
    $("apply").disabled = true;
    fitHeight();
    return;
  }
  $("title").textContent = target.label;
  $("title").title = target.label;
  const scope = target.kind === "spell"
    ? `Incantesimo intero${target.targetIds.length > 1 ? `, ${target.targetIds.length} token` : ""}`
    : target.kind === "class-feature"
      ? `Attivazione intera${target.targetIds.length > 1 ? `, ${target.targetIds.length} token` : ""}`
      : "Solo questo effetto";
  $("meta").textContent = `Ora: ${target.current} · ${scope}${target.concentration ? " · la concentrazione resta" : ""}`;
  $("amount").value = String(target.remaining || 1);
  $("manual").checked = target.current === "manuale";
  syncManual();
  $("amount").focus();
  $("amount").select?.();
  fitHeight();
}

async function apply() {
  if (!target) return;
  const operation = sceneLifecycle.capture({ operationId: `effect-duration:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const manual = $("manual").checked;
  const remaining = Math.floor(Number($("amount").value)) * Math.max(1, Number($("unit").value) || 1);
  const sceneState = (await OBR.scene.getMetadata().catch(() => ({})))?.[STATE_KEY] || {};
  const plan = planEffectDurationOverride(target, manual ? { mode: "manual" } : { mode: "rounds", remaining }, {
    currentRound: sceneState.round,
  });
  if (!plan.ok) {
    $("status").textContent = plan.error;
    fitHeight();
    return;
  }
  $("apply").disabled = true;
  try {
    const { requireAppliedEffectsMutation, runEffectsMutation } = await loadEffectsMutations();
    const mutation = await runEffectsMutation(plan.operations, {
      kind: "condition",
      label: plan.label,
      targetIds: plan.targetIds,
      history: { kind: "condition", label: plan.label },
    });
    requireAppliedEffectsMutation(mutation);
    if (!sceneLifecycle.isCurrent(operation)) return;
    await refreshConditionLabels(mutation.changedIds);
    close();
  } catch (error) {
    console.warn("[effect-duration]", error?.message || error);
    $("status").textContent = "Durata non aggiornata: l'effetto è cambiato, riapri il menu.";
    $("apply").disabled = false;
    fitHeight();
  }
}

$("manual").addEventListener("change", syncManual);
$("cancel").addEventListener("click", close);
$("apply").addEventListener("click", () => { void apply(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") close();
  if (event.key === "Enter") void apply();
});

OBR.onReady(async () => {
  try {
    await sceneLifecycle.mount();
    await load();
  } catch (error) {
    console.warn("[effect-duration] load", error?.message || error);
    $("status").textContent = "Impossibile leggere l'effetto.";
  }
});
window.addEventListener("pagehide", () => sceneLifecycle.dispose());
