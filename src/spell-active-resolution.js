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
let childPlacements = [];
let childActivationId = "";
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

function isChildZone() {
  return payload?.action?.resolutionKind === "child-zone";
}

function childZone() {
  return isChildZone() && payload?.action?.childZone
    && typeof payload.action.childZone === "object"
    ? payload.action.childZone
    : null;
}

function childKindLabel(value) {
  return String(value || "").trim() === "fissure" ? "Fessura" : "Vortice";
}

function childPlacementCount() {
  const config = childZone();
  if (!config) return 0;
  const minimum = Math.max(1, Math.floor(Number(config.placementCount?.min) || 1));
  const maximum = Math.max(minimum, Math.floor(Number(config.placementCount?.max) || minimum));
  const selected = Math.floor(Number($("childCount")?.value) || minimum);
  return Math.max(minimum, Math.min(maximum, selected));
}

function createChildActivationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${payload.instanceId}:${payload.actionId}:${Date.now()}`;
}

function renderContext() {
  const callLightning = isCallLightning();
  const flameInvestiture = isFlameInvestiture();
  const child = childZone();
  const childLabel = childKindLabel(child?.childKind);
  $("eyebrow").textContent = callLightning
    ? "Invocare il fulmine"
    : flameInvestiture
      ? "Investitura della Fiamma"
      : child
        ? payload.spellName || "Sottozona incantesimo"
    : "Attivazione incantesimo";
  $("attackTitle").textContent = "Fulmine";
  $("saveTitle").hidden = callLightning;
  $("saveTitle").textContent = callLightning
    ? "Richiama il fulmine"
    : flameInvestiture
      ? "Linea di fuoco"
      : child
        ? `${childLabel}: posizionamento e bersagli`
    : "Sagoma e tiri salvezza";
  $("place").textContent = callLightning
    ? "Posiziona il fulmine"
    : flameInvestiture
      ? "Posiziona la linea di fuoco"
      : child
        ? `Posiziona ${childLabel.toLocaleLowerCase("it-IT")}`
    : "Posiziona sagoma";
  $("damageLabel").textContent = callLightning
    ? "Danno del fulmine"
    : flameInvestiture
      ? "Danno della linea di fuoco"
    : "Danno pieno";
  if (child) {
    const minimum = Math.max(1, Math.floor(Number(child.placementCount?.min) || 1));
    const maximum = Math.max(minimum, Math.floor(Number(child.placementCount?.max) || minimum));
    $("childCountField").hidden = minimum === maximum;
    $("childCount").min = String(minimum);
    $("childCount").max = String(maximum);
    if (!$("childCount").value) $("childCount").value = String(minimum);
    $("childCountLabel").textContent = child.childKind === "fissure"
      ? "Numero di fessure"
      : "Numero di vortici";
  } else {
    $("childCountField").hidden = true;
  }
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
  const child = childZone();
  const childCount = childPlacementCount();
  const childLabel = childKindLabel(child?.childKind);
  $("placementStatus").textContent = child
    ? `${childLabel} ${childPlacements.length} di ${childCount}${targets.length ? ` Â· ${targets.length} bersagli` : ""}`
    : placement && targets.length
      ? `${targets.length} bersagli`
      : "";
  $("damageField").hidden = child || targets.length === 0;
  $("bulkOutcomes").hidden = child
    ? child.resolution !== "save"
    : !targets.length;
  $("targets").hidden = !!child && child.resolution !== "save";
  const depthField = $("childDepths");
  depthField.replaceChildren();
  depthField.hidden = !child?.depth || !childPlacements.length;
  if (child?.depth) {
    const minimumDepth = Math.max(1, Math.floor(Number(child.depth.min) || 1));
    const maximumDepth = Math.max(minimumDepth, Math.floor(Number(child.depth.max) || 10));
    childPlacements.forEach((entry, index) => {
      const field = document.createElement("div");
      field.className = "child-depth";
      const label = document.createElement("label");
      label.textContent = `${childKindLabel(child.childKind)} ${index + 1} · ${child.depth.label || "Profondità"}`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(minimumDepth);
      input.max = String(maximumDepth);
      input.step = "1";
      input.placeholder = "—";
      input.value = entry.depthRoll === undefined || entry.depthRoll === ""
        ? ""
        : String(entry.depthRoll);
      input.addEventListener("input", (event) => {
        entry.depthRoll = event.target.value;
        render();
      });
      field.append(label, input);
      depthField.appendChild(field);
    });
  }
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
  $("place").textContent = child && childPlacements.length >= childCount
    ? `Riposiziona ultima ${childLabel.toLocaleLowerCase("it-IT")}`
    : child
      ? `Posiziona ${childLabel.toLocaleLowerCase("it-IT")}`
      : $("place").textContent;
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
  const child = childZone();
  const save = payload.action.resolutionKind === "save-area" || !!child;
  const requiresSave = payload.action.resolutionKind === "save-area" || child?.resolution === "save";
  $("saveSection").hidden = !save;
  $("attackSection").hidden = save;
  $("footer").hidden = !save;
  if (save) {
    const selectedCount = child ? childPlacements.length : 1;
    const requiredCount = child ? childPlacementCount() : 1;
    const depthValid = !child?.depth || childPlacements.every((entry) => {
      if (entry.depthRoll === undefined || entry.depthRoll === "") return true;
      const value = Number(entry.depthRoll);
      const minimum = Number(child.depth.min ?? 1);
      const maximum = Number(child.depth.max ?? 10);
      return Number.isInteger(value) && value >= minimum && value <= maximum;
    });
    $("apply").disabled = busy
      || !placement
      || (child ? selectedCount !== requiredCount : !placement.targetIds?.length)
      || requiresSave && currentTargetItems().some((item) => !SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcomes.get(item.id)))
      || !depthValid
      || !child && !$("damage").value.trim();
    $("apply").textContent = child ? "Conferma" : "Applica";
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
  const child = childZone();
  const childCount = childPlacementCount();
  const replacingIndex = child && childPlacements.length >= childCount
    ? childPlacements.length - 1
    : -1;
  if (child && !childCount) return;
  busy = true;
  render();
  setStatus(child
    ? `${childKindLabel(child.childKind)} ${Math.min(childPlacements.length + 1, childCount)} di ${childCount}: posiziona e conferma sulla mappa.`
    : isCallLightning()
    ? "Scegli e conferma il punto del fulmine sulla mappa."
    : isFlameInvestiture()
      ? "Scegli e conferma la linea di fuoco sulla mappa."
      : "Posiziona e conferma la sagoma sulla mappa.");
  try {
    const result = await requestSpellAreaPlacement({
      ruleId: child?.placementRuleId || payload.action.placementRuleId,
      casterId: payload.casterId,
      context: child
        ? {
          parentZoneId: payload.zoneItemId,
          parentInstanceId: payload.instanceId,
          casterId: payload.casterId,
          spellId: payload.spellId,
          childKind: child.childKind,
          childIndex: replacingIndex >= 0 ? replacingIndex : childPlacements.length,
          activationId: childActivationId || (childActivationId = createChildActivationId()),
          sceneEpoch: payload.sceneEpoch,
        }
        : null,
    }, { broadcast: OBR.broadcast, windowRef: window });
    if (result?.status !== "confirmed" || !result.preview) {
      setStatus(result?.status === "cancelled" ? "Posizionamento annullato." : "Posizionamento non confermato.");
      return;
    }
    if (child) {
      const nextPreview = {
        ...result.preview,
        childIndex: replacingIndex >= 0 ? replacingIndex : childPlacements.length,
      };
      childPlacements = replacingIndex >= 0
        ? childPlacements.map((entry, index) => index === replacingIndex ? nextPreview : entry)
        : [...childPlacements, nextPreview];
      placement = {
        children: childPlacements,
        activationId: childActivationId,
        targetIds: Array.from(new Set(childPlacements.flatMap((entry) => entry.targetIds || []))),
      };
      const allowedIds = new Set(placement.targetIds);
      outcomes = new Map([...outcomes].filter(([id]) => allowedIds.has(id)));
    } else {
      placement = {
        ...result.preview,
        targetIds: Array.from(new Set(result.preview.targetIds || [])),
      };
      outcomes = new Map();
    }
    setStatus(child
      ? `${childKindLabel(child.childKind)} confermato. ${childPlacements.length} di ${childCount}.`
      : isCallLightning()
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
      damageRoll: payload.action.resolutionKind === "child-zone"
        ? 0
        : payload.action.resolutionKind === "single-attack"
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
  $("childCount").addEventListener("input", (event) => {
    const config = childZone();
    if (!config) return;
    const minimum = Math.max(1, Math.floor(Number(config.placementCount?.min) || 1));
    const maximum = Math.max(minimum, Math.floor(Number(config.placementCount?.max) || minimum));
    const value = Math.max(minimum, Math.min(maximum, Math.floor(Number(event.target.value) || minimum)));
    event.target.value = String(value);
    if (childPlacements.length > value) childPlacements = childPlacements.slice(0, value);
    if (childActivationId) {
      placement = childPlacements.length
        ? {
          children: childPlacements,
          activationId: childActivationId,
          targetIds: Array.from(new Set(childPlacements.flatMap((entry) => entry.targetIds || []))),
        }
        : null;
    }
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
