import OBR from "@owlbear-rodeo/sdk";
import {
  spellActiveResolutionPopoverId,
  SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES,
  SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
} from "./spellActiveResolutionCore.js";
import { requestSpellAreaPlacement } from "./spellAreaPlacementClient.js";
import { executeSpellActiveResolution } from "./spellApplicationExecutor.js";
import { ID } from "./constants.js";
import { areaHitsBounds } from "./aoeGeometryCore.js";
import { spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;
const params = new URLSearchParams(globalThis.location?.search || "");
const popoverIdFromPayload = (payload) => spellActiveResolutionPopoverId(
  payload?.instanceId,
  payload?.actionId,
);

let payload = null;
let placement = null;
let sceneItems = [];
let outcomes = new Map();
let selectedAttackTarget = "";
let attackOutcome = "";
let busy = false;
let statusMessage = "";

const $ = (id) => document.getElementById(id);

function isCallLightning() {
  return payload?.spellId === "call-lightning";
}

function isFlameInvestiture() {
  return payload?.spellId === "xanathar-investitura-della-fiamma";
}

function renderContext() {
  const callLightning = isCallLightning();
  const flameInvestiture = isFlameInvestiture();
  $("eyebrow").textContent = callLightning
    ? "Invocare il fulmine"
    : flameInvestiture
      ? "Investitura della Fiamma"
    : "Attivazione incantesimo";
  $("attackTitle").textContent = "Fulmine";
  $("saveTitle").hidden = callLightning;
  $("saveTitle").textContent = callLightning
    ? "Richiama il fulmine"
    : flameInvestiture
      ? "Linea di fuoco"
    : "Sagoma e tiri salvezza";
  $("place").textContent = callLightning
    ? "Posiziona il fulmine"
    : flameInvestiture
      ? "Posiziona la linea di fuoco"
    : "Posiziona sagoma";
  $("damageLabel").textContent = callLightning
    ? "Danno del fulmine"
    : flameInvestiture
      ? "Danno della linea di fuoco"
    : "Danno pieno";
}

function decodePayload() {
  try {
    return JSON.parse(params.get("payload") || "null");
  } catch {
    return null;
  }
}

async function closePopup() {
  if (!payload) return;
  await OBR.popover.close(popoverIdFromPayload(payload));
}

function displayName(item) {
  return String(item?.name || "").trim() || "Token";
}

function characters() {
  return sceneItems.filter((item) => item?.layer === "CHARACTER" && item?.metadata?.[META_KEY]);
}

function currentTargetItems() {
  const ids = placement?.targetIds || [];
  const byId = new Map(sceneItems.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
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
  return min && max ? { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 } : point(item?.position);
}

function economyLabel(value) {
  return value === "bonus-action" ? "Azione bonus" : "Azione";
}

async function stormTargetData() {
  const root = sceneItems.find((item) => item.id === payload?.zoneItemId);
  const area = root ? translatedZoneArea(root) : null;
  const origin = point(area?.origin);
  if (!origin) return { area: null, entries: [] };
  const dpi = await OBR.scene.grid.getDpi().catch(() => 150);
  const scale = await OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } }));
  const candidates = characters().filter((item) => item.id !== payload.casterId);
  const entries = await Promise.all(candidates.map(async (item) => {
    const bounds = await OBR.scene.items.getItemBounds([item.id]).catch(() => null);
    const center = itemCenter(bounds, item);
    if (!center) return null;
    const inRange = spellAreaOriginWithinRange({
      origin: center,
      casterOrigin: origin,
      range: payload.action.range,
      dpi,
      scale: scale?.parsed || scale,
    });
    if (!inRange) return null;
    const inside = areaHitsBounds(area, bounds);
    return { item, inside };
  }));
  return { area, entries: entries.filter(Boolean) };
}

function setStatus(message, stale = false) {
  statusMessage = String(message || "");
  $("status").textContent = statusMessage;
  $("status").hidden = !statusMessage;
  $("app").dataset.state = stale ? "stale" : "ready";
}

function renderSave() {
  const targetWrap = $("targets");
  targetWrap.replaceChildren();
  const targets = currentTargetItems();
  $("placementStatus").textContent = placement && targets.length
    ? `${targets.length} bersagli`
    : "";
  $("damageField").hidden = targets.length === 0;
  $("bulkOutcomes").hidden = !targets.length;
  for (const item of targets) {
    const row = document.createElement("div");
    row.className = "target";
    const name = document.createElement("span");
    name.className = "target-name";
    name.textContent = displayName(item);
    const outcomeLabels = { passed: "Superato", failed: "Fallito", immune: "Immune" };
    row.appendChild(name);
    for (const outcome of SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = outcomeLabels[outcome];
      button.classList.toggle("active", outcomes.get(item.id) === outcome);
      button.disabled = busy;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        outcomes.set(item.id, outcome);
        render();
      });
      row.appendChild(button);
    }
    targetWrap.appendChild(row);
  }
  $("damage").value = $("damage").dataset.value || "";
}

async function renderStorm() {
  const select = $("attackTarget");
  const previous = selectedAttackTarget;
  select.replaceChildren(new Option("Seleziona il bersaglio", ""));
  const { entries, area } = await stormTargetData();
  for (const { item, inside } of entries) {
    const option = new Option(`${displayName(item)}${inside ? " · vantaggio" : ""}`, item.id);
    option.dataset.inside = String(inside);
    select.appendChild(option);
  }
  selectedAttackTarget = entries.some(({ item }) => item.id === previous) ? previous : "";
  select.value = selectedAttackTarget;
  const selected = entries.find(({ item }) => item.id === selectedAttackTarget);
  $("attackAdvantage").textContent = selected?.inside
    ? "Vantaggio al tiro per colpire: il bersaglio è nella sfera."
    : selectedAttackTarget
      ? "Tiro per colpire normale."
      : "Scegli una creatura entro 18 m dal centro della sfera.";
  const canResolve = !busy
    && !!selectedAttackTarget
    && !!area
    && !!$("attackDamage").value.trim();
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    button.classList.toggle("active", button.dataset.attackOutcome === attackOutcome);
    button.disabled = !canResolve;
  }
  $("status").textContent = area
    ? ""
    : "La Sfera della Tempesta non è più disponibile.";
  $("status").hidden = !!area;
}

function render() {
  if (!payload) return;
  renderContext();
  $("title").textContent = `Risolvi: ${payload.spellName || payload.spellId}`;
  $("economy").textContent = economyLabel(payload.action.economy);
  $("caster").textContent = `Caster: ${payload.casterName || payload.casterId}`;
  const save = payload.action.resolutionKind === "save-area";
  $("saveSection").hidden = !save;
  $("attackSection").hidden = save;
  $("footer").hidden = !save;
  if (save) {
    $("apply").disabled = busy
      || !placement
      || !placement.targetIds?.length
      || currentTargetItems().some((item) => !SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcomes.get(item.id)))
      || !$("damage").value.trim();
    $("summary").textContent = "";
    renderSave();
  } else {
    $("summary").textContent = selectedAttackTarget ? "Bersaglio selezionato" : "Nessun bersaglio";
    void renderStorm();
  }
  if (statusMessage) $("status").textContent = statusMessage;
}

async function placeArea() {
  if (busy) return;
  busy = true;
  render();
  setStatus(isCallLightning()
    ? "Scegli e conferma il punto del fulmine sulla mappa."
    : isFlameInvestiture()
      ? "Scegli e conferma la linea di fuoco sulla mappa."
      : "Posiziona e conferma la sagoma sulla mappa.");
  try {
    const result = await requestSpellAreaPlacement({
      ruleId: payload.action.placementRuleId,
      casterId: payload.casterId,
    }, { broadcast: OBR.broadcast, windowRef: window });
    if (result?.status !== "confirmed" || !result.preview) {
      setStatus(result?.status === "cancelled" ? "Posizionamento annullato." : "Posizionamento non confermato.");
      return;
    }
    placement = {
      ...result.preview,
      targetIds: Array.from(new Set(result.preview.targetIds || [])),
    };
    outcomes = new Map();
    setStatus(isCallLightning()
      ? "Fulmine confermato. I bersagli sono ora bloccati."
      : isFlameInvestiture()
        ? "Linea di fuoco confermata. I bersagli sono ora bloccati."
        : "Sagoma confermata. I bersagli sono ora bloccati.");
  } catch (error) {
    setStatus(`Posizionamento non riuscito: ${error?.message || error}`);
  } finally {
    busy = false;
    render();
  }
}

async function apply() {
  if (busy) return;
  busy = true;
  render();
  try {
    await executeSpellActiveResolution({
      payload,
      placement,
      targetIds: payload.action.resolutionKind === "single-attack"
        ? [selectedAttackTarget]
        : currentTargetItems().map((item) => item.id),
      outcomes: Object.fromEntries(outcomes),
      damageRoll: payload.action.resolutionKind === "single-attack"
        ? $("attackDamage").value
        : $("damage").value,
      attackOutcome,
    });
    await OBR.popover.close(popoverIdFromPayload(payload));
  } catch (error) {
    busy = false;
    setStatus(`Risoluzione non riuscita: ${error?.message || error}`);
    render();
  }
}

async function loadScene() {
  sceneItems = await OBR.scene.items.getItems();
  render();
}

payload = decodePayload();
if (!payload) {
  $("app").dataset.state = "stale";
  setStatus("Payload di attivazione non valido.", true);
} else {
  $("app").dataset.popoverId = popoverIdFromPayload(payload);
  void import("./popoverDrag.js").then(({ initializePopoverDrag }) => {
    initializePopoverDrag($("app"));
  });
  $("close").addEventListener("click", () => void closePopup());
  $("place").addEventListener("click", () => void placeArea());
  $("apply").addEventListener("click", () => void apply());
  $("damage").addEventListener("input", (event) => {
    event.target.dataset.value = event.target.value;
    render();
  });
  $("attackDamage").addEventListener("input", render);
  $("attackTarget").addEventListener("change", (event) => {
    selectedAttackTarget = event.target.value;
    render();
  });
  for (const button of document.querySelectorAll("[data-bulk-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy) return;
      for (const item of currentTargetItems()) outcomes.set(item.id, button.dataset.bulkOutcome);
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      attackOutcome = button.dataset.attackOutcome;
      void apply();
    });
  }
  void OBR.onReady(async () => {
    await loadScene();
    OBR.scene.items.onChange(() => void loadScene());
  });
}
