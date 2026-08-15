import OBR from "@owlbear-rodeo/sdk";
import {
  spellActiveResolutionPopoverId,
  SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES,
  SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
} from "./spellActiveResolutionCore.js";
import {
  cancelSpellAreaPlacementRequest,
  confirmSpellAreaPlacementRequest,
  createSpellAreaPlacementRequestId,
  requestSpellAreaPlacement,
} from "./spellAreaPlacementClient.js";
import { executeSpellActiveResolution } from "./spellApplicationExecutor.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import { ID } from "./constants.js";
import { areaHitsBounds } from "./aoeGeometryCore.js";
import { spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

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
let attackEntries = [];
let busy = false;
let pendingPlacementRequestId = "";
let statusMessage = "";
let parentNotified = false;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function sceneOperationId(prefix = "spell-active") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

const $ = (id) => document.getElementById(id);

function isCallLightning() {
  return payload?.spellId === "call-lightning";
}

function isFlameInvestiture() {
  return payload?.spellId === "xanathar-investitura-della-fiamma";
}

function isHolyWeapon() {
  return payload?.spellId === "xanathar-arma-sacra";
}

function isChildZone() {
  return payload?.action?.resolutionKind === "child-zone";
}

function maxAttackCount() {
  return Math.max(1, Math.floor(Number(payload?.action?.maxAttacks) || 1));
}

function isMultiAttack() {
  return payload?.action?.resolutionKind === "single-attack" && maxAttackCount() > 1;
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
  const holyWeapon = isHolyWeapon();
  const child = childZone();
  const childLabel = childKindLabel(child?.childKind);
  $("eyebrow").textContent = callLightning
    ? "Invocare il fulmine"
    : flameInvestiture
      ? "Investitura della Fiamma"
      : holyWeapon
        ? "Arma Sacra"
      : child
        ? payload.spellName || "Sottozona incantesimo"
    : "Attivazione incantesimo";
  $("attackTitle").textContent = payload?.action?.label || "Risoluzione dell'attacco";
  $("saveTitle").hidden = callLightning;
  $("saveTitle").textContent = callLightning
      ? "Richiama il fulmine"
      : flameInvestiture
        ? "Linea di fuoco"
        : holyWeapon
        ? "Esplosione radiosa · TS Costituzione"
      : child
        ? `${childLabel}: posizionamento e bersagli`
    : "Sagoma e tiri salvezza";
  $("place").textContent = callLightning
    ? "Posiziona il fulmine"
    : flameInvestiture
      ? "Posiziona la linea di fuoco"
      : holyWeapon
        ? "Posiziona l'esplosione"
      : child
        ? `Posiziona ${childLabel.toLocaleLowerCase("it-IT")}`
    : "Posiziona sagoma";
  const damage = payload?.action?.damage || {};
  const damageLabel = [damage.formula || "Danno", damage.type || ""].join(" ").trim();
  $("damageLabel").textContent = callLightning
    ? "Danno del fulmine"
    : flameInvestiture
      ? "Danno della linea di fuoco"
      : holyWeapon
        ? "Danno dell'esplosione"
    : damageLabel ? "Danno " + damageLabel : "Danno pieno";
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

async function notifyParent(status, message = "", executionResult = null) {
  if (!payload || parentNotified) return;
  parentNotified = true;
  const history = spellExecutionHistoryDetails(executionResult);
  await OBR.broadcast.sendMessage(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    buildSpellUnifiedPopupEvent({
      source: "spell-active-resolution",
      status,
      instanceId: payload.instanceId,
      actionId: payload.actionId,
      popoverId: popoverIdFromPayload(payload),
      message,
      ...(history.historyEntryId
        ? {
          historyEntryId: history.historyEntryId,
          undoAvailable: history.undoAvailable,
        }
        : {}),
    }),
    { destination: "LOCAL" },
  ).catch(() => {});
}

async function closePopup() {
  if (!payload) return;
  sceneLifecycle.dispose();
  if (pendingPlacementRequestId) {
    await cancelSpellAreaPlacementRequest(
      pendingPlacementRequestId,
      { broadcast: OBR.broadcast },
    ).catch(() => {});
    pendingPlacementRequestId = "";
  }
  await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  await OBR.popover.close(popoverIdFromPayload(payload)).catch(() => {});
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
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("storm-read") });
  if (!sceneLifecycle.isCurrent(operation)) return { area: null, entries: [] };
  const root = sceneItems.find((item) => item.id === payload?.zoneItemId);
  const area = root ? translatedZoneArea(root) : null;
  const requiresZoneRoot = payload?.action?.requiresZoneRoot !== false;
  const caster = sceneItems.find((item) => item.id === payload?.casterId);
  const casterBounds = caster
    ? await OBR.scene.items.getItemBounds([caster.id]).catch(() => null)
    : null;
  const origin = point(area?.origin)
    || point(root?.position)
    || (!requiresZoneRoot ? itemCenter(casterBounds, caster) : null);
  if (!origin) return { area: null, entries: [] };
  const dpi = await OBR.scene.grid.getDpi().catch(() => 150);
  const scale = await OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } }));
  const candidates = characters().filter((item) => item.id !== payload.casterId);
  const entries = await Promise.all(candidates.map(async (item) => {
    const bounds = await OBR.scene.items.getItemBounds([item.id]).catch(() => null);
    const center = itemCenter(bounds, item);
    if (!center) return null;
    const inRange = payload.action.range
      ? spellAreaOriginWithinRange({
        origin: center,
        casterOrigin: origin,
        range: payload.action.range,
        dpi,
        scale: scale?.parsed || scale,
      })
      : true;
    if (!inRange) return null;
    const inside = !!(area && areaHitsBounds(area, bounds));
    return { item, inside };
  }));
  if (!sceneLifecycle.isCurrent(operation)) return { area: null, entries: [] };
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
      button.disabled = busy || !sceneLifecycle.isReady();
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
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("storm-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const select = $("attackTarget");
  const previous = selectedAttackTarget;
  const { entries, area } = await stormTargetData();
  if (!sceneLifecycle.isCurrent(operation)) return;
  const multi = isMultiAttack();
  const outcomeDefinitions = Array.isArray(payload?.action?.attack?.outcomes)
    ? payload.action.attack.outcomes
    : [];
  const outcomeLabels = { hit: "Colpito", miss: "Mancato", critical: "Critico" };
  attackEntries = Array.from({ length: maxAttackCount() }, (_, index) => {
    const current = attackEntries[index] || {};
    return {
      targetId: entries.some(({ item }) => item.id === current.targetId)
        ? current.targetId
        : "",
      attackOutcome: outcomeDefinitions.includes(current.attackOutcome)
        ? current.attackOutcome
        : "",
      damageRoll: current.damageRoll || "",
    };
  });

  const attackRows = $("attackRows");
  const attackField = $("attackDamage").closest(".field");
  attackRows.hidden = !multi;
  $("attackTarget").hidden = multi;
  $("attackAdvantage").hidden = multi;
  $("attackOutcomes").hidden = multi;
  if (attackField) attackField.hidden = multi;

  select.replaceChildren(new Option("Seleziona il bersaglio", ""));
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
  const requiresZoneRoot = payload?.action?.requiresZoneRoot !== false;
  const canResolve = sceneLifecycle.isReady() && !busy
    && !!selectedAttackTarget
    && (!requiresZoneRoot || !!area)
    && !!$("attackDamage").value.trim();
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    button.classList.toggle("active", button.dataset.attackOutcome === attackOutcome);
    button.hidden = !payload?.action?.attack?.outcomes?.includes(button.dataset.attackOutcome);
    button.disabled = !canResolve;
  }
  attackRows.replaceChildren();
  if (multi) {
    for (let index = 0; index < attackEntries.length; index += 1) {
      const entry = attackEntries[index];
      const row = document.createElement("div");
      row.className = "attack-row";
      const title = document.createElement("div");
      title.className = "attack-row__title";
      title.textContent = `Attacco ${index + 1}`;
      const rowSelect = document.createElement("select");
      rowSelect.setAttribute("aria-label", `Bersaglio attacco ${index + 1}`);
      rowSelect.appendChild(new Option("Nessun attacco", ""));
      for (const { item, inside } of entries) {
        rowSelect.appendChild(new Option(
          `${displayName(item)}${inside ? " · vantaggio" : ""}`,
          item.id,
        ));
      }
      rowSelect.value = entry.targetId;
      rowSelect.disabled = busy;
      rowSelect.addEventListener("change", (event) => {
        attackEntries[index] = { ...attackEntries[index], targetId: event.target.value };
        render();
      });
      const rowOutcomes = document.createElement("div");
      rowOutcomes.className = "outcomes";
      for (const value of outcomeDefinitions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = outcomeLabels[value] || value;
        button.classList.toggle("active", entry.attackOutcome === value);
        button.disabled = busy || !entry.targetId || (requiresZoneRoot && !area);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          attackEntries[index] = { ...attackEntries[index], attackOutcome: value };
          render();
        });
        rowOutcomes.appendChild(button);
      }
      const damageField = document.createElement("div");
      damageField.className = "field";
      const damageLabel = document.createElement("label");
      damageLabel.textContent = `Danno ${payload?.action?.damage?.formula || ""} ${payload?.action?.damage?.type || ""}`.trim();
      const damageInput = document.createElement("input");
      damageInput.type = "number";
      damageInput.min = "0";
      damageInput.step = "1";
      damageInput.inputMode = "numeric";
      damageInput.placeholder = "Totale";
      damageInput.value = entry.damageRoll;
      damageInput.addEventListener("input", (event) => {
        attackEntries[index] = { ...attackEntries[index], damageRoll: event.target.value };
        render();
      });
      damageField.append(damageLabel, damageInput);
      row.append(title, rowSelect, rowOutcomes, damageField);
      attackRows.appendChild(row);
    }
  }
  $("status").textContent = area || !requiresZoneRoot
    ? ""
    : "La zona dell'incantesimo non è più disponibile.";
  $("status").hidden = !!area || !requiresZoneRoot;
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
  const multiAttack = !save && isMultiAttack();
  const sceneReady = sceneLifecycle.isReady();
  $("saveSection").hidden = !save;
  $("attackSection").hidden = save;
  $("footer").hidden = !save && !multiAttack;
  const placementPending = !!pendingPlacementRequestId;
  const confirmPlacementButton = $("confirmPlacement");
  const cancelPlacementButton = $("cancelPlacement");
  if (confirmPlacementButton) {
    confirmPlacementButton.hidden = !placementPending;
    confirmPlacementButton.disabled = !placementPending || !sceneReady;
  }
  if (cancelPlacementButton) {
    cancelPlacementButton.hidden = !placementPending;
    cancelPlacementButton.disabled = !placementPending || !sceneReady;
  }
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
    $("apply").disabled = !sceneReady || busy
      || !placement
      || (child ? selectedCount !== requiredCount : !placement.targetIds?.length)
      || requiresSave && currentTargetItems().some((item) => !SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcomes.get(item.id)))
      || !depthValid
      || !child && !$("damage").value.trim();
    $("apply").textContent = child ? "Conferma" : "Applica";
    $("summary").textContent = "";
    renderSave();
  } else {
    const completeAttacks = attackEntries.filter((entry) => (
      entry.targetId && entry.attackOutcome && String(entry.damageRoll).trim() !== ""
    ));
    if (multiAttack) {
      $("apply").disabled = !sceneReady || busy || !completeAttacks.length
        || completeAttacks.length < attackEntries.filter((entry) => entry.targetId).length;
      $("apply").textContent = "Applica attacchi";
      $("summary").textContent = `${completeAttacks.length}/${maxAttackCount()} attacchi pronti`;
    } else {
      $("summary").textContent = selectedAttackTarget ? "Bersaglio selezionato" : "Nessun bersaglio";
    }
    void renderStorm();
  }
  if (statusMessage) $("status").textContent = statusMessage;
}

async function placeArea() {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("placement") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const child = childZone();
  const childCount = childPlacementCount();
  const replacingIndex = child && childPlacements.length >= childCount
    ? childPlacements.length - 1
    : -1;
  if (child && !childCount) return;
  const requestId = createSpellAreaPlacementRequestId();
  pendingPlacementRequestId = requestId;
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
        }
        : null,
      requestId,
    }, { broadcast: OBR.broadcast, windowRef: window });
    if (!sceneLifecycle.isCurrent(operation)) return;
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
    pendingPlacementRequestId = "";
    busy = false;
    render();
  }
}

async function confirmPlacement() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("placement-confirm") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const requestId = pendingPlacementRequestId;
  if (!requestId) return;
  try {
    await confirmSpellAreaPlacementRequest(requestId, { broadcast: OBR.broadcast });
    if (!sceneLifecycle.isCurrent(operation)) return;
    setStatus("Conferma della sagoma richiesta: completa il calcolo dei bersagli…");
  } catch (error) {
    setStatus("Conferma della sagoma non riuscita: " + (error?.message || error));
  }
}

async function cancelPlacement() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("placement-cancel") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const requestId = pendingPlacementRequestId;
  if (!requestId) return;
  try {
    await cancelSpellAreaPlacementRequest(requestId, { broadcast: OBR.broadcast });
    if (!sceneLifecycle.isCurrent(operation)) return;
  } catch (error) {
    setStatus("Annullamento della sagoma non riuscito: " + (error?.message || error));
  }
}

async function apply() {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("active-resolution") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  busy = true;
  render();
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) {
      busy = false;
      return;
    }
    const executionResult = await executeSpellActiveResolution({
      payload,
      placement,
      targetIds: isMultiAttack()
        ? attackEntries.filter((entry) => entry.targetId).map((entry) => entry.targetId)
        : payload.action.resolutionKind === "single-attack"
        ? [selectedAttackTarget]
        : currentTargetItems().map((item) => item.id),
      outcomes: Object.fromEntries(outcomes),
      damageRoll: payload.action.resolutionKind === "child-zone"
        ? 0
        : payload.action.resolutionKind === "single-attack"
        ? $("attackDamage").value
        : $("damage").value,
      attackOutcome,
      attacks: isMultiAttack()
        ? attackEntries.filter((entry) => entry.targetId).map((entry) => ({
          targetId: entry.targetId,
          attackOutcome: entry.attackOutcome,
          damageRoll: entry.damageRoll,
        }))
        : [],
      sceneEpoch: operation.epoch,
      sceneIdentity: ownerSceneContext?.sceneIdentity || null,
      commandId: ownerSceneContext?.commandId || operation.operationId,
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) {
      busy = false;
      return;
    }
    await notifyParent(
      SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
      "",
      executionResult,
    );
    await OBR.popover.close(popoverIdFromPayload(payload)).catch(() => {});
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      busy = false;
      return;
    }
    busy = false;
    await notifyParent(
      SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED,
      error?.message || error,
    );
    setStatus(`Risoluzione non riuscita: ${error?.message || error}`);
    render();
  } finally {
    busy = false;
    if (sceneLifecycle.isReady()) render();
  }
}

async function loadScene() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("scene-load") });
  if (!sceneLifecycle.isCurrent(operation)) return false;
  sceneItems = await OBR.scene.items.getItems();
  if (!sceneLifecycle.isCurrent(operation)) return false;
  render();
  return true;
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
  window.addEventListener(
    "beforeunload",
    () => {
      sceneLifecycle.dispose();
      void notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
    },
    { once: true },
  );
  $("place").addEventListener("click", () => void placeArea());
  $("confirmPlacement")?.addEventListener("click", () => void confirmPlacement());
  $("cancelPlacement")?.addEventListener("click", () => void cancelPlacement());
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
    sceneLifecycle.subscribe((event) => {
      if (event.phase === "unavailable") {
        if (pendingPlacementRequestId) {
          void cancelSpellAreaPlacementRequest(
            pendingPlacementRequestId,
            { broadcast: OBR.broadcast },
          ).catch(() => {});
        }
        pendingPlacementRequestId = "";
        placement = null;
        childPlacements = [];
        childActivationId = "";
        sceneItems = [];
        outcomes.clear();
        busy = false;
        setStatus("Scena cambiata: riapri la risoluzione dal pannello Spells.", true);
        render();
      } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
        placement = null;
        childPlacements = [];
        childActivationId = "";
        outcomes.clear();
        selectedAttackTarget = "";
        setStatus("Nuova scena pronta: posiziona di nuovo la risoluzione.");
        void loadScene();
      }
    });
    await sceneLifecycle.mount();
    if (!sceneLifecycle.isReady()) {
      setStatus("Scena non disponibile: riapri la risoluzione.");
      render();
      return;
    }
    await loadScene();
    OBR.scene.items.onChange(() => {
      if (sceneLifecycle.isReady()) void loadScene();
    });
  });
}
