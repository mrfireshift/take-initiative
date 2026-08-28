import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import {
  spellActiveResolutionPopoverId,
  SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES,
  SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
  spellActiveResolutionDamageFormula,
  spellActiveResolutionHealingFormula,
  spellActiveResolutionAttackDamageRequired,
  spellActiveResolutionSelectedTargetId,
} from "./spellActiveResolutionCore.js";
import {
  PRISMATIC_WALL_LAYER_IDS,
  prismaticWallFirstRemainingLayer,
  prismaticWallLayerById,
  prismaticWallStateFromCastContext,
} from "./prismaticWallRules.js";
import {
  cancelSpellAreaPlacementRequest,
  confirmSpellAreaPlacementRequest,
  createSpellAreaPlacementRequestId,
  requestSpellAreaPlacement,
} from "./spellAreaPlacementClient.js";
import {
  buildPreparedSpellResolutionRequest,
  findPreparedSpellResolutionGroup,
  preparedSpellDefinition,
  preparedSpellResolutionAction,
  PREPARED_SPELL_RESOLUTION_CHANNEL,
} from "./preparedSpellResolutionCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import {
  executeSpellActiveAction,
  executeSpellActiveResolution,
  executeSpellApplication,
} from "./spellApplicationExecutor.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import { ID } from "./constants.js";
import { areaHitsBounds, buildArea, buildCellBoundaryLoops, buildCircleArea } from "./aoeGeometryCore.js";
import { gridPlanarDistance } from "./distance3dCore.js";
import { spellAreaGridCells, spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { mobileAuraTargetIds, getMobileAuraRule } from "./spellAuraCore.js";
import { loadAoEStyle } from "./aoeStyle.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";
import { wallOfLightTargetWithinRange } from "./wallOfLightActiveCore.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const META_KEY = `${ID}/meta`;
const params = new URLSearchParams(globalThis.location?.search || "");
const popoverIdFromPayload = (payload) => String(payload?.popoverId || "").trim()
  || spellActiveResolutionPopoverId(payload?.instanceId, payload?.actionId);

let payload = null;
let placement = null;
let childPlacements = [];
let childActivationId = "";
let sceneItems = [];
let outcomes = new Map();
let selectedAttackTarget = "";
let selectedSaveTarget = "";
let selectedHealTarget = "";
let selectedPrismaticTarget = "";
let saveOutcome = "";
let attackOutcome = "";
let selectedChoice = "";
let attackEntries = [];
let prismaticLayerOutcomes = new Map();
let prismaticLayerDamage = new Map();
let prismaticWallLayerId = "";
let prismaticTraversalId = "";
let busy = false;
let pendingPlacementRequestId = "";
let statusMessage = "";
let parentNotified = false;
let currentPlayerSelection = [];
let unsubscribePlayer = null;
let pendingPlacementPromise = null;
let pendingPlacementAnchorTargetId = "";
let committingPlacementRequestId = "";
let anchoredTargetSyncPromise = null;
let desiredAnchoredTargetId = "";
let resizeFrame = 0;
let lastPopoverHeight = 0;
let sdkReady = false;
let fixedRadiusPreviewCleanup = null;
let fixedRadiusPreviewSequence = 0;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function sceneOperationId(prefix = "spell-active") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function requestCompactPopoverResize() {
  if (!payload || !sdkReady) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const app = $("app");
    if (!app) return;
    // Il frame non deve imporre l'altezza ricevuta dal controller: misuriamo il
    // contenuto reale e teniamo lo scroll interno solo per sezioni già limitate.
    const naturalHeight = Math.ceil(app.scrollHeight + 8); // 4 px di margine sopra/sotto
    const targetHeight = Math.max(150, Math.min(620, naturalHeight));
    if (targetHeight === lastPopoverHeight) return;
    lastPopoverHeight = targetHeight;
    void OBR.popover.setHeight(popoverIdFromPayload(payload), targetHeight).catch(() => {});
  });
}

const $ = (id) => document.getElementById(id);

function conditionInstances(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.instances) ? value.instances : [];
}

function isCallLightning() {
  return payload?.spellId === "call-lightning";
}

function isFlameInvestiture() {
  return payload?.spellId === "xanathar-investitura-della-fiamma";
}

function isHolyWeapon() {
  return payload?.spellId === "xanathar-arma-sacra";
}

function isPrismaticWallAction() {
  return payload?.spellId === "prismatic-wall"
    && ["prismatic-wall-traversal", "prismatic-wall-layers"]
      .includes(String(payload?.action?.resolutionKind || "").trim());
}

function isPrismaticWallTraversal() {
  return isPrismaticWallAction()
    && payload?.action?.resolutionKind === "prismatic-wall-traversal";
}

function prismaticWallParentFromScene() {
  const caster = sceneItems.find((item) => item?.id === payload?.casterId);
  const spells = caster?.metadata?.[META_KEY]?.[`${ID}/spells`];
  return (Array.isArray(spells) ? spells : []).find((entry) => (
    String(entry?.instanceId || "").trim() === String(payload?.instanceId || "").trim()
    && String(entry?.spellId || "").trim() === "prismatic-wall"
    && String(entry?.casterId || payload?.casterId || "").trim() === String(payload?.casterId || "").trim()
  )) || null;
}

function prismaticWallLiveState() {
  return prismaticWallStateFromCastContext(prismaticWallParentFromScene()?.castContext);
}

function isPrimaryTargetAnchoredArea() {
  return payload?.action?.areaAnchor === "primary-target";
}

function isAutoTargetAnchoredArea() {
  return isPrimaryTargetAnchoredArea()
    && payload?.action?.anchorTargetFromSelection === true
    && !childZone();
}

function selectedPrimaryTargetIds() {
  const selected = Array.from(new Set(
    (Array.isArray(currentPlayerSelection) ? currentPlayerSelection : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  ));
  const characterIds = new Set(characters().map((item) => String(item?.id || "").trim()));
  return selected.filter((id) => characterIds.has(id));
}

function selectedPrimaryTargetId() {
  const ids = selectedPrimaryTargetIds();
  return ids.length === 1 ? ids[0] : "";
}

function currentAnchoredTargetId() {
  return String(
    pendingPlacementAnchorTargetId
      || placement?.anchorTargetId
      || "",
  ).trim();
}

function autoPlaceAnchoredAreaFromSelection() {
  if (!isAutoTargetAnchoredArea()
    || committingPlacementRequestId
    || (busy && !pendingPlacementRequestId)
    || !sceneLifecycle.isReady()) {
    return;
  }
  desiredAnchoredTargetId = selectedPrimaryTargetId();
  const currentTargetId = currentAnchoredTargetId();
  const hasCurrentPlacement = !!pendingPlacementRequestId || !!placement;
  if (desiredAnchoredTargetId === currentTargetId
    && (desiredAnchoredTargetId ? hasCurrentPlacement : !hasCurrentPlacement)) {
    return;
  }
  if (anchoredTargetSyncPromise) return;
  anchoredTargetSyncPromise = (async () => {
    while (sceneLifecycle.isReady()) {
      const desiredTargetId = desiredAnchoredTargetId;
      const currentTargetId = currentAnchoredTargetId();
      const hasCurrentPlacement = !!pendingPlacementRequestId || !!placement;
      if (desiredTargetId === currentTargetId
        && (desiredTargetId ? hasCurrentPlacement : !hasCurrentPlacement)) {
        return;
      }
      if (pendingPlacementRequestId) {
        const requestId = pendingPlacementRequestId;
        const request = pendingPlacementPromise;
        await cancelSpellAreaPlacementRequest(requestId, { broadcast: OBR.broadcast }).catch(() => {});
        await request?.catch(() => {});
        continue;
      }
      placement = null;
      outcomes = new Map();
      if (!desiredTargetId) {
        busy = false;
        render();
        return;
      }
      void placeArea(desiredTargetId);
      return;
    }
  })().finally(() => {
    anchoredTargetSyncPromise = null;
    if (sceneLifecycle.isReady()
      && isPrimaryTargetAnchoredArea()
      && desiredAnchoredTargetId !== currentAnchoredTargetId()) {
      autoPlaceAnchoredAreaFromSelection();
    }
  });
}

function selectedZoneShorteningFrom() {
  const config = payload?.action?.shortenStaticZone;
  const fallback = ["start", "end"].includes(String(config?.from || "").trim())
    ? String(config.from).trim()
    : "end";
  if (config?.chooseFrom !== true) return fallback;
  const selected = String($("zoneShorteningFrom")?.value || "").trim();
  return ["start", "end"].includes(selected) ? selected : fallback;
}

function isChildZone() {
  return payload?.action?.resolutionKind === "child-zone";
}

function isSingleSave() {
  return payload?.action?.resolutionKind === "single-save";
}

function isSingleHeal() {
  return payload?.action?.resolutionKind === "single-heal";
}

function isPreparedResolution() {
  return payload?.mode === "prepared"
    || payload?.type === `${ID}/spell-prepared-resolution`;
}

function preparedGroup() {
  return isPreparedResolution()
    ? findPreparedSpellResolutionGroup(sceneItems, payload?.instanceId)
    : null;
}

function preparedPhasePlan(group = preparedGroup()) {
  const spell = preparedSpellDefinition(group);
  return spell
    ? getSpellCastPhasePlan(spell, "resolve", group?.castContext || {})
    : null;
}

function preparedAction(group = preparedGroup()) {
  return group
    ? preparedSpellResolutionAction(group)
    : payload?.action?.type === "manual"
      ? payload.action
      : null;
}

function preparedTargetItems() {
  const byId = new Map(characters().map((item) => [String(item?.id || ""), item]));
  return Array.from(new Set(
    (Array.isArray(currentPlayerSelection) ? currentPlayerSelection : [])
      .map((id) => String(id || "").trim())
      .filter((id) => byId.has(id)),
  )).map((id) => byId.get(id));
}

function fixedCasterRadiusConfig() {
  const config = payload?.action?.fixedCasterRadius;
  if (!config || typeof config !== "object") return null;
  const value = Number(config.value);
  if (!Number.isFinite(value) || value <= 0 || String(config.unit || "") !== "m") return null;
  return { value, includeCaster: config.includeCaster === true };
}


function clearFixedCasterRadiusPreview() {
  fixedRadiusPreviewSequence += 1;
  fixedRadiusPreviewCleanup?.();
  fixedRadiusPreviewCleanup = null;
}

function fixedCasterRadiusCircleArea({
  origin,
  radiusMeters,
  metersPerCell,
  dpi,
  gridOrigin,
} = {}) {
  if (!origin || !gridOrigin || !(radiusMeters > 0) || !(metersPerCell > 0) || !(dpi > 0)) return null;
  const radiusPixels = radiusMeters / metersPerCell * dpi;
  return buildCircleArea(
    origin,
    { x: origin.x + radiusPixels, y: origin.y },
    dpi,
    gridOrigin,
  );
}

function fixedCasterRadiusCellCommands(cells) {
  const commands = [];
  for (const cell of cells || []) {
    const x = Number(cell?.x);
    const y = Number(cell?.y);
    const width = Number(cell?.width);
    const height = Number(cell?.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    commands.push(
      [Command.MOVE, x, y],
      [Command.LINE, x + width, y],
      [Command.LINE, x + width, y + height],
      [Command.LINE, x, y + height],
      [Command.CLOSE],
    );
  }
  return commands;
}

function fixedCasterRadiusBoundaryCommands(cells) {
  const commands = [];
  for (const loop of buildCellBoundaryLoops(cells || [])) {
    if (!loop.length) continue;
    commands.push([Command.MOVE, loop[0].x, loop[0].y]);
    for (let index = 1; index < loop.length; index += 1) {
      commands.push([Command.LINE, loop[index].x, loop[index].y]);
    }
    commands.push([Command.CLOSE]);
  }
  return commands;
}

async function showFixedCasterRadiusPreview({ cells, dpi, operation = null } = {}) {
  clearFixedCasterRadiusPreview();
  const sequence = fixedRadiusPreviewSequence;
  if (!Array.isArray(cells) || !cells.length || typeof OBR.interaction?.startItemInteraction !== "function") {
    return false;
  }
  const style = spellAreaStyle(payload?.spellId, loadAoEStyle());
  const outlineWidth = Math.max(2, Number(dpi) * 0.035 * style.strokeWidth);
  const cellsPreview = buildPath()
    .commands(fixedCasterRadiusCellCommands(cells))
    .fillRule("evenodd")
    .fillColor(style.fillColor)
    .fillOpacity(Math.max(0.06, Number(style.fillOpacity) || 0.12))
    .strokeColor(style.strokeColor)
    .strokeOpacity(0.42)
    .strokeWidth(Math.max(1, outlineWidth * 0.28))
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .name(`${payload?.action?.label || "Area incantesimo"} · caselle interessate`)
    .build();
  const boundaryPreview = buildPath()
    .commands(fixedCasterRadiusBoundaryCommands(cells))
    .fillRule("evenodd")
    .fillColor(style.fillColor)
    .fillOpacity(0)
    .strokeColor(style.strokeColor)
    .strokeOpacity(0.95)
    .strokeWidth(outlineWidth)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .name(`${payload?.action?.label || "Area incantesimo"} · contorno`)
    .build();
  try {
    const interaction = await OBR.interaction.startItemInteraction([cellsPreview, boundaryPreview]);
    if ((operation && !sceneLifecycle.isCurrent(operation)) || sequence !== fixedRadiusPreviewSequence) {
      interaction?.[1]?.();
      return false;
    }
    fixedRadiusPreviewCleanup = interaction?.[1] || null;
    return true;
  } catch (error) {
    if (sequence === fixedRadiusPreviewSequence) {
      console.warn("[spell-active-resolution] fixed radius preview:", error?.message || error);
    }
    return false;
  }
}

function gridMetersPerCell(scale = {}) {
  const parsed = scale?.parsed && typeof scale.parsed === "object" ? scale.parsed : scale;
  const multiplier = Number(parsed?.multiplier);
  const unit = String(parsed?.unit || "").trim().toLocaleLowerCase("it");
  const unitMeters = {
    m: 1, meter: 1, meters: 1, metro: 1, metri: 1,
    ft: 0.3048, foot: 0.3048, feet: 0.3048, cm: 0.01, km: 1000,
  }[unit] || 1;
  return (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5) * unitMeters;
}

function saveAbilityLabel(value) {
  return ({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" })[String(value || "").trim().toLowerCase()] || "";
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
  if (isPrismaticWallAction()) {
    $("eyebrow").textContent = "Comando GM";
    $("saveTitle").hidden = true;
    $("placementToolbar").hidden = true;
    $("childCountField").hidden = true;
    $("childDepths").hidden = true;
    $("bulkOutcomes").hidden = true;
    $("attackRows").hidden = true;
    $("attackTarget").hidden = true;
    $("attackOutcomes").hidden = true;
    $("attackAdvantage").hidden = true;
    $("saveTargetHint").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    $("damageField").hidden = true;
    $("singleSaveDamageField").hidden = true;
    $("prismaticWallTitle").textContent = isPrismaticWallTraversal()
      ? "Attraversamento · strati residui"
      : "Gestione strati";
    return;
  }
  if (isPreparedResolution()) {
    const action = preparedAction();
    if (action?.type === "manual") {
      const damageField = $("attackDamage")?.closest(".field");
      $("eyebrow").textContent = "Incantesimo attivo";
      $("saveTitle").hidden = true;
      $("placementToolbar").hidden = true;
      $("childCountField").hidden = true;
      $("childDepths").hidden = true;
      $("bulkOutcomes").hidden = true;
      $("attackRows").hidden = true;
      $("attackTarget").hidden = true;
      $("attackTarget").disabled = true;
      $("attackOutcomes").hidden = true;
      $("attackAdvantage").hidden = !String(action.detail || "").trim();
      $("attackAdvantage").textContent = String(action.detail || "").trim();
      $("saveTargetHint").hidden = true;
      $("summary").hidden = true;
      $("singleSaveSection").hidden = true;
      $("singleHealSection").hidden = true;
      if (damageField) damageField.hidden = true;
      attackOutcome = "";
      $("attackTitle").textContent = "Pronto sul caster";
      return;
    }
    const plan = preparedPhasePlan();
    const damage = plan?.resolution?.mechanics?.damageBonus || null;
    const damageField = $("attackDamage")?.closest(".field");
    $("eyebrow").textContent = "Incantesimo preparato";
    $("saveTitle").hidden = true;
    $("placementToolbar").hidden = true;
    $("childCountField").hidden = true;
    $("childDepths").hidden = true;
    $("bulkOutcomes").hidden = true;
    $("attackRows").hidden = true;
    $("attackOutcomes").hidden = true;
    $("attackAdvantage").hidden = true;
    $("saveTargetHint").hidden = true;
    $("summary").hidden = true;
    $("singleHealSection").hidden = true;
    if (damageField) damageField.hidden = true;
    attackOutcome = "hit";
    $("attackTitle").textContent = "Bersaglio";
    const damageLabel = [damage?.dice, damage?.type].filter(Boolean).join(" ");
    $("attackDamageLabel").textContent = damageLabel
      ? `Danno extra · ${damageLabel}`
      : "Danno extra";
    $("attackDamage").placeholder = "Totale";
    return;
  }
  const callLightning = isCallLightning();
  const flameInvestiture = isFlameInvestiture();
  const holyWeapon = isHolyWeapon();
  const primaryTargetArea = isPrimaryTargetAnchoredArea();
  const child = childZone();
  const singleSave = isSingleSave();
  const singleHeal = isSingleHeal();
  const fixedRadius = fixedCasterRadiusConfig();
  const childLabel = childKindLabel(child?.childKind);
  $("eyebrow").textContent = callLightning
    ? "Invocare il fulmine"
    : flameInvestiture
      ? "Investitura della Fiamma"
      : holyWeapon
        ? "Arma Sacra"
      : primaryTargetArea
        ? payload.spellName || "Freccia Folgorante"
      : child
        ? payload.spellName || "Sottozona incantesimo"
      : singleSave
        ? payload.spellName || "Tiro salvezza"
      : singleHeal
        ? "Aura Attiva"
    : "Attivazione incantesimo";
  $("saveTitle").hidden = callLightning && !primaryTargetArea;
  $("saveTitle").textContent = callLightning
      ? "Richiama il fulmine"
      : flameInvestiture
        ? "Linea di fuoco"
        : holyWeapon
        ? "Esplosione radiosa · TS Costituzione"
      : primaryTargetArea
        ? "Esplosione sul bersaglio dell'attacco · TS Destrezza"
      : child
        ? `${childLabel}: posizionamento e bersagli`
      : fixedRadius
        ? `${payload?.action?.label || "Tiro salvezza"} · TS ${saveAbilityLabel(payload?.action?.save?.ability)}`
    : "Sagoma e tiri salvezza";
  const autoAnchoredArea = primaryTargetArea
    && payload?.action?.anchorTargetFromSelection === true;
  $("placementToolbar").hidden = !!fixedRadius || autoAnchoredArea;
  $("place").textContent = callLightning
    ? "Posiziona il fulmine"
    : flameInvestiture
      ? "Posiziona la linea di fuoco"
      : holyWeapon
        ? "Posiziona l'esplosione"
      : primaryTargetArea
        ? "Centra sul bersaglio dell'attacco"
      : child
        ? `Posiziona ${childLabel.toLocaleLowerCase("it-IT")}`
    : "Posiziona sagoma";
  const damage = payload?.action?.damage || {};
  const activeDamageFormula = spellActiveResolutionDamageFormula({
    action: payload?.action,
    slotLevel: payload?.slotLevel,
    outcome: manualSaveAtTable() ? payload?.action?.assumedOutcome || "failed" : saveOutcome,
  }).scaledFormula;
  const damageLabel = [activeDamageFormula || damage.formula || "Danno", damage.type || ""]
    .join(" ")
    .trim();
  const wallOfLight = payload?.spellId === "xanathar-muro-di-luce"
    && payload?.actionId === "wall-of-light-beam";
  const activeActionLabel = String(payload?.action?.label || "Risoluzione dell'attacco").trim();
  $("attackTitle").textContent = wallOfLight && activeDamageFormula
    ? activeActionLabel.replace(/\d+d\d+/iu, activeDamageFormula)
    : activeActionLabel;
  const attackDamageLabel = $("attackDamageLabel");
  if (attackDamageLabel) {
    attackDamageLabel.textContent = damageLabel ? `Danno ${damageLabel}` : "Danno";
    attackDamageLabel.hidden = wallOfLight;
  }
  if (wallOfLight) {
    $("attackDamage").setAttribute("aria-label", "Danno del Raggio radioso");
  } else {
    $("attackDamage").removeAttribute("aria-label");
  }
  if (singleSave) {
    const manualSave = manualSaveAtTable();
    const ability = manualSave ? "" : saveAbilityLabel(payload?.action?.save?.ability);
    const hasDamage = !!payload?.action?.damage;
    $("singleSaveOutcomes").hidden = manualSave;
    $("singleSaveDamageField").hidden = !hasDamage;
    const failedOnlyDamage = payload?.action?.damage?.onSave === "none";
    const failedCondition = Array.isArray(payload?.action?.failureEffects)
      && payload.action.failureEffects.some((effect) => String(effect?.label || "").trim() === "Trattenuto");
    const damageSuffix = manualSave
      ? ""
      : failedOnlyDamage
        ? failedCondition ? " · solo se fallisce e viene trattenuto" : " · solo se fallisce"
        : payload?.action?.damage?.onSave === "full"
          ? " · pieno anche se supera"
        : payload?.action?.damage?.onSave === "half"
          ? " · metà se supera"
          : "";
    $("singleSaveTitle").textContent = manualSave
      ? String(payload?.action?.manualOutcomeLabel || "Esito al tavolo").trim()
      : ability ? `TS ${ability}` : "Tiro salvezza";
    $("singleSaveDamageLabel").textContent = damageLabel ? `Danno ${damageLabel}${damageSuffix}` : "Danno";
  }
  if (singleHeal) {
    const healingFormula = spellActiveResolutionHealingFormula({
      action: payload?.action,
      slotLevel: payload?.slotLevel,
    }).scaledFormula;
    $("singleHealTitle").textContent = "Bersaglio";
    $("healAmountLabel").textContent = healingFormula
      ? `Cura · ${healingFormula}`
      : "Cura";
  }
  $("damageLabel").textContent = callLightning
    ? "Danno del fulmine"
    : flameInvestiture
      ? "Danno della linea di fuoco"
      : holyWeapon
        ? "Danno dell'esplosione"
      : primaryTargetArea
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
  clearFixedCasterRadiusPreview();
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
  return sceneItems.filter((item) => item?.layer === "CHARACTER");
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

function boundsSize(bounds, dpi = 1) {
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  if (!min || !max) return { width: dpi, height: dpi };
  return {
    width: Math.max(1, max.x - min.x),
    height: Math.max(1, max.y - min.y),
  };
}

async function refreshFixedCasterRadiusPlacement(operation = null) {
  const config = fixedCasterRadiusConfig();
  if (!config) return false;
  const caster = sceneItems.find((item) => item?.id === payload?.casterId);
  if (!caster) {
    clearFixedCasterRadiusPreview();
    placement = { targetIds: [], fixedCasterRadius: true };
    outcomes.clear();
    return true;
  }
  const candidates = characters().filter((item) => config.includeCaster || item.id !== payload.casterId);
  const [dpi, scale, casterBounds, candidateBounds] = await Promise.all([
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
    OBR.scene.items.getItemBounds([caster.id]).catch(() => null),
    Promise.all(candidates.map((item) => OBR.scene.items.getItemBounds([item.id]).catch(() => null))),
  ]);
  if (operation && !sceneLifecycle.isCurrent(operation)) return false;
  const casterOrigin = itemCenter(casterBounds, caster);
  const metersPerCell = gridMetersPerCell(scale);
  const gridOrigin = point(casterBounds?.min) || (casterOrigin
    ? point(await OBR.scene.grid.snapPosition(casterOrigin, 1, true, false).catch(() => casterOrigin)) || casterOrigin
    : null);
  const circleArea = fixedCasterRadiusCircleArea({
    origin: casterOrigin,
    radiusMeters: config.value,
    metersPerCell,
    dpi: Math.max(1, Number(dpi) || 1),
    gridOrigin,
  });
  await showFixedCasterRadiusPreview({
    cells: circleArea?.cells || [],
    dpi,
    operation,
  });
  if (operation && !sceneLifecycle.isCurrent(operation)) return false;
  const targetIds = candidates.filter((item, index) => {
    const bounds = candidateBounds[index];
    return !!circleArea && !!bounds && areaHitsBounds(circleArea, bounds);
  }).map((item) => item.id);
  const allowedIds = new Set(targetIds);
  outcomes = new Map([...outcomes].filter(([id]) => allowedIds.has(id)));
  placement = {
    targetIds,
    fixedCasterRadius: true,
    radiusMeters: config.value,
    casterId: payload.casterId,
  };
  return true;
}

function manualSaveAtTable() {
  return payload?.action?.manualSaveAtTable === true;
}

function economyLabel(value) {
  return value === "gm"
    ? "Comando GM"
    : value === "bonus-action" ? "Azione bonus" : "Azione";
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
      ? payload.action.rangeFromZoneArea === true && area
        ? wallOfLightTargetWithinRange({
          area,
          targetBounds: bounds,
          range: payload.action.range,
          dpi,
          scale: scale?.parsed || scale,
        })
        : spellAreaOriginWithinRange({
          origin: center,
          casterOrigin: origin,
          range: payload.action.range,
          dpi,
          scale: scale?.parsed || scale,
        })
      : true;
    if (!inRange) return null;
    const inside = payload?.action?.attack?.advantageWhen === "inside-root"
      && !!(area && areaHitsBounds(area, bounds));
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
  const fixedRadius = fixedCasterRadiusConfig();
  $("placementStatus").textContent = child
    ? `${childLabel} ${childPlacements.length} di ${childCount}${targets.length ? ` · ${targets.length} bersagli` : ""}`
    : fixedRadius
      ? `${targets.length} bersagli entro ${String(fixedRadius.value).replace(".", ",")} m`
    : placement && targets.length
      ? `${targets.length} bersagli`
      : "";
  const damageRequired = !!payload?.action?.damage
    && (!payload?.action?.damageRequiredWithTargetsOnly || targets.length > 0);
  $("damageField").hidden = child || targets.length === 0 || !damageRequired;
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

function itemHasLinkedSaveEffect(item, effectId) {
  const wantedEffect = String(effectId || "").trim();
  if (!wantedEffect) return false;
  const parentEffectId = String(payload?.instanceId || "").trim();
  const meta = item?.metadata?.[META_KEY] || {};
  return conditionInstances(meta.conditions).some((instance) => (
    String(instance?.effectId || "").trim() === wantedEffect
    && String(instance?.parentEffectId || "").trim() === parentEffectId
  ));
}

function itemMatchesSingleSaveTarget(item) {
  const requiredEffectId = String(payload?.action?.requiredTargetEffectId || "").trim();
  const excludedEffectIds = Array.from(new Set([
    String(payload?.action?.excludedTargetEffectId || "").trim(),
    ...(Array.isArray(payload?.action?.excludedTargetEffectIds)
      ? payload.action.excludedTargetEffectIds.map((effectId) => String(effectId || "").trim())
      : []),
  ].filter(Boolean)));
  if (requiredEffectId && !itemHasLinkedSaveEffect(item, requiredEffectId)) return false;
  if (excludedEffectIds.some((effectId) => itemHasLinkedSaveEffect(item, effectId))) return false;
  return true;
}

async function singleSaveTargetData() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("single-save-read") });
  if (!sceneLifecycle.isCurrent(operation)) return [];
  const linkedTargetId = String(payload?.linkedTargetId || "").trim();
  if (linkedTargetId) {
    const linkedTarget = sceneItems.find((item) => (
      item.id === linkedTargetId && itemMatchesSingleSaveTarget(item)
    ));
    return linkedTarget ? [linkedTarget] : [];
  }
  const caster = sceneItems.find((item) => item.id === payload?.casterId);
  const root = sceneItems.find((item) => item.id === payload?.zoneItemId);
  const candidates = characters().filter((item) => (
    item.id !== payload?.casterId && itemMatchesSingleSaveTarget(item)
  ));
  if (!payload?.action?.range) return candidates;
  const [rootBounds, casterBounds, dpi, scale] = await Promise.all([
    root ? OBR.scene.items.getItemBounds([root.id]).catch(() => null) : null,
    caster ? OBR.scene.items.getItemBounds([caster.id]).catch(() => null) : null,
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
  ]);
  const originSource = payload?.action?.rangeOrigin === "root" ? root : caster;
  const originBounds = payload?.action?.rangeOrigin === "root" ? rootBounds : casterBounds;
  const rangeOrigin = itemCenter(originBounds, originSource);
  if (!rangeOrigin) return [];
  const filtered = [];
  const metersPerCell = Number(scale?.parsed?.multiplier ?? scale?.multiplier ?? 1.5) || 1.5;
  for (const item of candidates) {
    const bounds = await OBR.scene.items.getItemBounds([item.id]).catch(() => null);
    const origin = itemCenter(bounds, item);
    if (!origin) continue;
    if (payload?.action?.adjacentRing === true && payload?.action?.rangeOrigin === "root") {
      const planar = gridPlanarDistance(
        rangeOrigin,
        origin,
        dpi,
        metersPerCell,
        boundsSize(originBounds, dpi),
        boundsSize(bounds, dpi),
      );
      if (planar.squares > 0 && planar.squares <= 1 + 1e-9) filtered.push(item);
      continue;
    }
    if (spellAreaOriginWithinRange({
      origin,
      casterOrigin: rangeOrigin,
      range: payload.action.range,
      dpi,
      scale: scale?.parsed || scale,
    })) filtered.push(item);
  }
  if (!sceneLifecycle.isCurrent(operation)) return [];
  return filtered;
}

async function singleHealTargetData() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("single-heal-read") });
  if (!sceneLifecycle.isCurrent(operation)) return [];
  const caster = sceneItems.find((item) => item.id === payload?.casterId);
  const rule = getMobileAuraRule(payload?.spellId);
  if (!caster || !rule) return [];
  const [dpi, scale, casterBounds] = await Promise.all([
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
    OBR.scene.items.getItemBounds([caster.id]).catch(() => null),
  ]);
  if (!sceneLifecycle.isCurrent(operation)) return [];
  const casterOrigin = itemCenter(casterBounds, caster);
  if (!casterOrigin) return [];
  const sizeCells = spellAreaGridCells(rule.geometry?.size, scale?.parsed || scale);
  const snappedOrigin = typeof OBR.scene.grid.snapPosition === "function"
    ? await OBR.scene.grid.snapPosition(casterOrigin, 1, true, false).catch(() => casterOrigin)
    : casterOrigin;
  const gridOrigin = point(snappedOrigin) || casterOrigin;
  const area = casterOrigin && gridOrigin && sizeCells > 0
    ? buildArea(
      rule.geometry.shape,
      casterOrigin,
      { x: casterOrigin.x + sizeCells * Math.max(1, Number(dpi) || 1), y: casterOrigin.y },
      Math.max(1, Number(dpi) || 1),
      gridOrigin,
    )
    : null;
  if (!area) return [];
  const candidates = await Promise.all(characters().map(async (item) => ({
    item,
    bounds: await OBR.scene.items.getItemBounds([item.id]).catch(() => null),
  })));
  if (!sceneLifecycle.isCurrent(operation)) return [];
  const membership = payload?.action?.membership;
  const membershipRule = membership?.targeting && typeof membership.targeting === "object"
    ? { ...rule, targeting: { ...rule.targeting, ...membership.targeting } }
    : rule;
  const targetIds = mobileAuraTargetIds({
    aura: { casterId: payload.casterId, rule: membershipRule },
    area,
    candidates,
    metaKey: META_KEY,
  });
  const allowed = new Set(targetIds);
  return characters().filter((item) => allowed.has(item.id));
}

async function renderSingleHeal() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("single-heal-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const previous = selectedHealTarget;
  const entries = await singleHealTargetData();
  if (!sceneLifecycle.isCurrent(operation)) return;
  const resolvedTarget = spellActiveResolutionSelectedTargetId(
    entries,
    currentPlayerSelection,
    previous,
  );
  selectedHealTarget = resolvedTarget || (entries.length === 1 ? entries[0].id : "");
  const selectedEntry = entries.find((item) => item?.id === selectedHealTarget);
  $("singleHealTitle").textContent = selectedEntry
    ? `Bersaglio: ${displayName(selectedEntry)}`
    : "Bersaglio: —";
  const healingFormula = spellActiveResolutionHealingFormula({
    action: payload?.action,
    slotLevel: payload?.slotLevel,
  }).scaledFormula;
  $("healAmountLabel").textContent = healingFormula
    ? `Cura ${healingFormula}`
    : "Cura";
  $("healAmount").value = $("healAmount").dataset.value || "";
  $("healAmount").disabled = busy || !selectedHealTarget;
  const healingReady = String($("healAmount").value || "").trim() !== "";
  const canResolve = sceneLifecycle.isReady()
    && !busy
    && !!selectedHealTarget
    && healingReady;
  $("apply").disabled = !canResolve;
  $("apply").textContent = "Cura";
  $("summary").textContent = "";
}

async function renderSingleSave() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("single-save-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const select = $("saveTarget");
  const previous = selectedSaveTarget;
  const entries = await singleSaveTargetData();
  if (!sceneLifecycle.isCurrent(operation)) return;
  select.replaceChildren(new Option("Seleziona il bersaglio", ""));
  for (const item of entries) select.appendChild(new Option(displayName(item), item.id));
  const requiredEffectId = String(payload?.action?.requiredTargetEffectId || "").trim();
  const requiredEffect = !!requiredEffectId;
  const linkedTargetId = String(payload?.linkedTargetId || "").trim();
  const automaticLinkedTarget = linkedTargetId && entries.some((entry) => entry.id === linkedTargetId);
  const automaticRequiredTarget = (requiredEffect || automaticLinkedTarget) && entries.length === 1;
  selectedSaveTarget = automaticRequiredTarget
    ? entries[0].id
    : spellActiveResolutionSelectedTargetId(entries, currentPlayerSelection, previous);
  select.value = selectedSaveTarget;
  // Le azioni legate a un unico effetto persistente (es. Stritola) usano
  // direttamente il bersaglio già collegato alla stessa istanza della spell.
  select.hidden = automaticRequiredTarget;
  const manualSave = manualSaveAtTable();
  if (manualSave) saveOutcome = String(payload?.action?.assumedOutcome || "failed").trim() || "failed";
  const linkedTargetHint = String(payload?.action?.linkedTargetHint || "").trim();
  const maximilianLinkedTarget = requiredEffectId === "maximilian-earth-grasp-restrained";
  $("saveTargetHint").textContent = requiredEffect || automaticLinkedTarget
    ? entries.length === 1
      ? linkedTargetHint
        ? `Bersaglio: ${displayName(entries[0])} · ${linkedTargetHint}`
        : maximilianLinkedTarget
          ? `Bersaglio: ${displayName(entries[0])} · attualmente trattenuto dalla mano.`
          : `Bersaglio: ${displayName(entries[0])} · collegato a questa istanza.`
      : entries.length
        ? maximilianLinkedTarget
          ? "Più bersagli risultano collegati alla mano: seleziona quello da risolvere."
          : "Più bersagli risultano collegati a questa istanza: seleziona quello da risolvere."
        : maximilianLinkedTarget
          ? "Nessun bersaglio è attualmente trattenuto da questa mano."
          : "Nessun bersaglio è collegato a questa istanza."
    : payload?.action?.adjacentRing === true
      ? "Scegli una creatura in una delle 8 caselle attorno alla mano."
      : payload?.action?.range
        ? payload?.action?.rangeOrigin === "root"
          ? `Scegli una creatura entro ${payload.action.range.value} ${payload.action.range.unit} dalla mano.`
          : `Scegli una creatura entro ${payload.action.range.value} ${payload.action.range.unit}.`
        : "";
  const damageRequired = !!payload?.action?.damage;
  const damageReady = !damageRequired || String($("saveDamage")?.value || "").trim() !== "";
  const canResolve = sceneLifecycle.isReady() && !busy && !!selectedSaveTarget
    && (manualSave || !!saveOutcome) && damageReady;
  for (const button of document.querySelectorAll("[data-save-outcome]")) {
    button.classList.toggle("active", button.dataset.saveOutcome === saveOutcome);
    button.disabled = busy || !selectedSaveTarget;
  }
  $("apply").disabled = !canResolve;
  $("apply").textContent = manualSave ? (payload?.action?.buttonLabel || "Applica") : "Applica";
  $("summary").textContent = selectedSaveTarget
    ? manualSave ? "" : saveOutcome ? "" : "Seleziona l'esito del TS"
    : "Nessun bersaglio";
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
  const shorteningField = $("zoneShorteningField");
  if (shorteningField) {
    shorteningField.hidden = multi || payload?.action?.shortenStaticZone?.chooseFrom !== true;
  }
  const shorteningSelect = $("zoneShorteningFrom");
  if (shorteningSelect) shorteningSelect.disabled = busy;
  if (attackField) attackField.hidden = multi;

  select.replaceChildren(new Option("Seleziona il bersaglio", ""));
  for (const { item, inside } of entries) {
    const option = new Option(`${displayName(item)}${inside ? " · vantaggio" : ""}`, item.id);
    option.dataset.inside = String(inside);
    select.appendChild(option);
  }
  selectedAttackTarget = multi
    ? (entries.some(({ item }) => item.id === previous) ? previous : "")
    : spellActiveResolutionSelectedTargetId(entries, currentPlayerSelection, previous);
  select.value = selectedAttackTarget;
  const selected = entries.find(({ item }) => item.id === selectedAttackTarget);
  $("attackAdvantage").textContent = selected?.inside
    ? "Vantaggio al tiro per colpire: il bersaglio è nella sfera."
    : selectedAttackTarget
      ? "Tiro per colpire normale."
      : payload?.action?.requiresZoneRoot === false && payload?.action?.range
        ? `Scegli una creatura entro ${payload.action.range.value} ${payload.action.range.unit} dal caster.`
        : payload?.action?.rangeFromZoneArea === true && payload?.action?.range
          ? `Scegli una creatura entro ${payload.action.range.value} ${payload.action.range.unit} dal muro.`
          : "Scegli una creatura entro 18 m dal centro della sfera.";
  const requiresZoneRoot = payload?.action?.requiresZoneRoot !== false;
  const baseReady = sceneLifecycle.isReady() && !busy
    && !!selectedAttackTarget
    && (!requiresZoneRoot || !!area);
  const damageValue = String($("attackDamage")?.value || "").trim();
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    const outcome = button.dataset.attackOutcome;
    const damageRequired = spellActiveResolutionAttackDamageRequired(payload?.action, outcome);
    button.classList.toggle("active", outcome === attackOutcome);
    button.hidden = !payload?.action?.attack?.outcomes?.includes(outcome);
    button.disabled = !baseReady || (damageRequired && !damageValue);
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

function preparedChoiceOptions(group = preparedGroup()) {
  const declared = Array.isArray(payload?.choiceOptions) ? payload.choiceOptions : [];
  if (declared.length) return declared;
  const spell = preparedSpellDefinition(group);
  return spell?.effectChoices && Array.isArray(spell.effectChoices)
    ? spell.effectChoices.map((entry) => ({
      value: String(entry?.value || ""),
      label: String(entry?.label || entry?.value || ""),
    }))
    : [];
}

function renderPreparedChoice(group) {
  const select = $("preparedChoice");
  if (!select) return;
  const options = preparedChoiceOptions(group);
  select.replaceChildren();
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = String(entry?.value || "");
    option.textContent = String(entry?.label || entry?.value || "");
    select.appendChild(option);
  }
  const groupChoice = String(group?.castContext?.choice || "").trim();
  const nextChoice = selectedChoice || groupChoice || String(payload?.selectedChoice || "").trim();
  selectedChoice = options.some((entry) => String(entry?.value || "") === nextChoice)
    ? nextChoice
    : String(options[0]?.value || "");
  select.value = selectedChoice;
  select.hidden = options.length <= 1;
}

function renderPreparedSave(group, targetItems, saveRequired) {
  const visible = saveRequired;
  const section = $("singleSaveSection");
  section.hidden = !visible;
  $("singleSaveDamageField").hidden = true;
  if (!visible) {
    selectedSaveTarget = "";
    return;
  }
  const target = targetItems.find((item) => item?.id === selectedAttackTarget);
  selectedSaveTarget = String(target?.id || "").trim();
  const select = $("saveTarget");
  select.replaceChildren();
  if (target) {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = displayName(target);
    select.appendChild(option);
    select.value = target.id;
  }
  select.disabled = busy || !target;
  select.hidden = true;
  for (const button of document.querySelectorAll("[data-save-outcome]")) {
    button.classList.toggle("active", button.dataset.saveOutcome === saveOutcome);
    button.disabled = busy || !selectedSaveTarget;
  }
  $("singleSaveTitle").textContent = `TS ${String(
    group && preparedPhasePlan(group)?.resolution?.mechanics?.savingThrow?.ability || "",
  ).trim() || "al tavolo"}`;
}

async function renderPrepared() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("prepared-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const group = preparedGroup();
  const plan = preparedPhasePlan(group);
  if (!group || !plan) {
    setStatus("La preparazione non è più disponibile.", true);
    $("apply").disabled = true;
    return;
  }
  if (preparedAction(group)?.type === "manual") {
    selectedAttackTarget = "";
    $("attackTarget").replaceChildren();
    $("attackTarget").hidden = true;
    $("attackTarget").disabled = true;
    $("attackOutcomes").hidden = true;
    $("singleSaveSection").hidden = true;
    $("attackDamage").closest(".field").hidden = true;
    $("apply").disabled = !sceneLifecycle.isReady() || busy;
    $("apply").textContent = preparedAction(group)?.buttonLabel || "Usa colpo";
    $("summary").textContent = "";
    return;
  }
  renderPreparedChoice(group);
  const targets = preparedTargetItems();
  const targetSelect = $("attackTarget");
  targetSelect.replaceChildren();
  targetSelect.hidden = true;
  targetSelect.disabled = true;
  if (targets.length === 1) {
    selectedAttackTarget = targets[0].id;
    $("attackTitle").textContent = `Bersaglio: ${displayName(targets[0])}`;
  } else {
    selectedAttackTarget = "";
    $("attackTitle").textContent = "Bersaglio";
  }
  if (!selectedAttackTarget) {
    setStatus("Seleziona un bersaglio prima di continuare.");
  } else if (statusMessage === "Seleziona un bersaglio prima di continuare.") {
    setStatus("");
  }

  attackOutcome = "hit";
  $("attackOutcomes").hidden = true;

  const damageRequired = !!plan.resolution?.mechanics?.damageBonus;
  const damageInput = $("attackDamage");
  damageInput.closest(".field").hidden = !damageRequired;
  damageInput.hidden = false;
  damageInput.disabled = !damageRequired
    || busy;
  damageInput.value = damageInput.dataset.value || "";
  renderPreparedSave(
    group,
    targets,
    !!plan.resolution?.mechanics?.savingThrow,
  );
  const saveRequired = !!plan.resolution?.mechanics?.savingThrow;
  const damageReady = !damageRequired
    || String(damageInput.value || "").trim() !== "";
  const saveReady = !saveRequired || !!saveOutcome;
  $("apply").disabled = !sceneLifecycle.isReady()
    || busy
    || !selectedAttackTarget
    || !damageReady
    || !saveReady;
  $("apply").textContent = "Risolvi";
  $("summary").textContent = "";
}

function prismaticWallNumericDamageReady(value) {
  if (value === "" || value === null || value === undefined) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed);
}

function prismaticWallTraversalReady(state) {
  if (!selectedPrismaticTarget) return false;
  if (state.exemptCreatureIds.includes(selectedPrismaticTarget)) return true;
  return state.remainingLayers.every((layerId) => {
    const outcome = prismaticLayerOutcomes.get(layerId);
    if (!SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcome)) return false;
    const layer = prismaticWallLayerById(layerId);
    return !layer?.damage
      || outcome === "immune"
      || prismaticWallNumericDamageReady(prismaticLayerDamage.get(layerId));
  });
}

function updatePrismaticWallApplyState(state = prismaticWallLiveState()) {
  const ready = isPrismaticWallTraversal()
    ? prismaticWallTraversalReady(state)
    : !!prismaticWallLayerId;
  $("apply").disabled = !sceneLifecycle.isReady() || busy || !ready;
  $("summary").textContent = isPrismaticWallTraversal()
    ? state.exemptCreatureIds.includes(selectedPrismaticTarget)
      ? state.remainingLayers.length + "/" + PRISMATIC_WALL_LAYER_IDS.length + " strati · creatura esente"
      : state.remainingLayers.length + "/" + PRISMATIC_WALL_LAYER_IDS.length + " strati · "
        + state.remainingLayers.filter((layerId) => prismaticLayerOutcomes.has(layerId)).length
        + "/" + state.remainingLayers.length + " esiti"
    : state.remainingLayers.length + "/" + PRISMATIC_WALL_LAYER_IDS.length + " strati"
      + (prismaticWallLayerId
        ? " · esposto: " + (prismaticWallLayerById(prismaticWallLayerId)?.label || prismaticWallLayerId)
        : "");
}

function renderPrismaticWall() {
  const state = prismaticWallLiveState();
  const traversal = isPrismaticWallTraversal();
  const targetSelect = $("prismaticWallTarget");
  const layerWrap = $("prismaticWallLayers");
  const detail = $("prismaticWallLayerDetail");
  const candidates = characters().filter((item) => item?.id !== payload?.casterId);
  if (traversal) {
    const previous = selectedPrismaticTarget;
    selectedPrismaticTarget = spellActiveResolutionSelectedTargetId(
      candidates,
      currentPlayerSelection,
      previous,
    );
    targetSelect.hidden = false;
    targetSelect.replaceChildren(new Option("Seleziona la creatura", ""));
    for (const item of candidates) {
      targetSelect.appendChild(new Option(displayName(item), item.id));
    }
    targetSelect.value = selectedPrismaticTarget;
    targetSelect.disabled = busy || !sceneLifecycle.isReady();
    const exempt = state.exemptCreatureIds.includes(selectedPrismaticTarget);
    $("prismaticWallHint").textContent = selectedPrismaticTarget
      ? exempt
        ? "Creatura designata al lancio: ignora prossimità e strati del muro."
        : "Risolvi un TS Destrezza per ogni strato ancora presente, dal Rosso al Viola."
      : "Seleziona una sola creatura; il crossing è dichiarato dal GM al tavolo.";
    detail.hidden = true;
    layerWrap.replaceChildren();
    for (const layerId of state.remainingLayers) {
      const layer = prismaticWallLayerById(layerId);
      if (!layer) continue;
      const row = document.createElement("div");
      row.className = "prismatic-wall-layer";
      const top = document.createElement("div");
      top.className = "prismatic-wall-layer__top";
      const title = document.createElement("strong");
      title.textContent = layer.label;
      const meta = document.createElement("span");
      meta.className = "prismatic-wall-layer__meta";
      meta.textContent = "TS " + saveAbilityLabel(layer.saveAbility)
        + (layer.damage ? " · " + layer.damage.dice + " " + layer.damage.type : "");
      top.append(title, meta);
      const layerDetail = document.createElement("div");
      layerDetail.className = "prismatic-wall-layer__detail";
      layerDetail.textContent = layer.damage
        ? "Fallito: danno pieno · Superato: metà · Immune: nessun danno"
        : layerId === "indigo"
          ? "Fallito: Trattenuto · TS Cos alla fine del turno · 3S/3F"
          : "Fallito: Accecato · TS Sag all'inizio del prossimo turno del caster";
      const outcomeWrap = document.createElement("div");
      outcomeWrap.className = "prismatic-wall-layer__outcomes";
      const outcomeLabels = { passed: "Superato", failed: "Fallito", immune: "Immune" };
      for (const outcome of SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = outcomeLabels[outcome];
        button.classList.toggle("active", prismaticLayerOutcomes.get(layerId) === outcome);
        button.disabled = busy || !sceneLifecycle.isReady() || !selectedPrismaticTarget;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (busy || !selectedPrismaticTarget) return;
          prismaticLayerOutcomes.set(layerId, outcome);
          render();
        });
        outcomeWrap.appendChild(button);
      }
      row.append(top, layerDetail, outcomeWrap);
      if (layer.damage) {
        const damageField = document.createElement("div");
        damageField.className = "prismatic-wall-layer__damage";
        const damageLabel = document.createElement("label");
        damageLabel.textContent = "Danno · " + layer.damage.dice + " " + layer.damage.type;
        const damageInput = document.createElement("input");
        damageInput.type = "number";
        damageInput.min = "0";
        damageInput.step = "1";
        damageInput.inputMode = "numeric";
        damageInput.placeholder = "Totale";
        damageInput.value = prismaticLayerDamage.get(layerId) ?? "";
        damageInput.disabled = busy || !selectedPrismaticTarget;
        damageInput.addEventListener("input", (event) => {
          prismaticLayerDamage.set(layerId, event.target.value);
          updatePrismaticWallApplyState(state);
        });
        damageField.append(damageLabel, damageInput);
        row.appendChild(damageField);
      }
      layerWrap.appendChild(row);
    }
  } else {
    selectedPrismaticTarget = "";
    targetSelect.hidden = true;
    targetSelect.replaceChildren(new Option("", ""));
    $("prismaticWallHint").textContent = state.remainingLayers.length
      ? "Gli strati si distruggono solo dopo conferma GM e in ordine dal Rosso al Viola."
      : "Tutti gli strati sono distrutti; il muro resta attivo fino alla durata RAW o alla rimozione GM.";
    layerWrap.replaceChildren();
    prismaticWallLayerId = prismaticWallFirstRemainingLayer(state.remainingLayers);
    if (prismaticWallLayerId) {
      const layer = prismaticWallLayerById(prismaticWallLayerId);
      const row = document.createElement("div");
      row.className = "prismatic-wall-layer";
      const top = document.createElement("div");
      top.className = "prismatic-wall-layer__top";
      const title = document.createElement("strong");
      title.textContent = "Esposto: " + layer.label;
      const meta = document.createElement("span");
      meta.className = "prismatic-wall-layer__meta";
      meta.textContent = "Distruzione manuale";
      top.append(title, meta);
      const requirement = document.createElement("div");
      requirement.className = "prismatic-wall-layer__detail";
      requirement.textContent = "Requisito RAW: " + layer.destructionRequirement;
      const passive = document.createElement("div");
      passive.className = "prismatic-wall-layer__detail";
      passive.textContent = "Proprietà: " + layer.passive;
      row.append(top, requirement, passive);
      layerWrap.appendChild(row);
      detail.hidden = true;
    } else {
      detail.hidden = true;
    }
  }
  updatePrismaticWallApplyState(state);
}

function render() {
  if (!payload) return;
  renderContext();
  const prepared = isPreparedResolution();
  const child = childZone();
  const save = payload.action.resolutionKind === "save-area" || !!child;
  const singleSave = isSingleSave();
  const singleHeal = isSingleHeal();
  const prismaticWall = isPrismaticWallAction();
  $("title").textContent = prepared
    ? payload.spellName || payload.spellId
    : singleSave
    ? payload.action?.buttonLabel || payload.action?.label || payload.spellName || payload.spellId
    : singleHeal
    ? payload.spellName || payload.spellId || "Aura di Vitalità"
    : payload.spellName || payload.spellId;
  $("economy").textContent = prepared ? "" : economyLabel(payload.action.economy);
  $("caster").textContent = `Caster: ${payload.casterName || payload.casterId}`;
  const requiresSave = payload.action.resolutionKind === "save-area" || child?.resolution === "save";
  const multiAttack = !save && !singleSave && !singleHeal && isMultiAttack();
  const sceneReady = sceneLifecycle.isReady();
  $("saveSection").hidden = prepared || !save;
  $("singleSaveSection").hidden = prepared || !singleSave;
  $("singleHealSection").hidden = prepared || !singleHeal;
  $("attackSection").hidden = prepared ? false : save || singleSave || singleHeal;
  $("prismaticWallSection").hidden = !prismaticWall;
  $("footer").hidden = !save;
  if (prepared || singleSave || singleHeal || multiAttack) $("footer").hidden = false;
  if (prismaticWall) {
    $("saveSection").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    $("footer").hidden = false;
    $("title").textContent = payload.spellName || "Muro Prismatico";
    $("economy").textContent = "Comando GM";
    $("apply").textContent = isPrismaticWallTraversal()
      ? "Risolvi attraversamento"
      : "Segna strato distrutto";
    renderPrismaticWall();
    if (statusMessage) $("status").textContent = statusMessage;
    requestCompactPopoverResize();
    return;
  }
  const placementPending = !!pendingPlacementRequestId;
  const confirmPlacementButton = $("confirmPlacement");
  const cancelPlacementButton = $("cancelPlacement");
  const autoAnchoredArea = isPrimaryTargetAnchoredArea()
    && payload?.action?.anchorTargetFromSelection === true;
  if (confirmPlacementButton) {
    confirmPlacementButton.hidden = !placementPending || autoAnchoredArea;
    confirmPlacementButton.disabled = !placementPending || autoAnchoredArea || !sceneReady;
  }
  if (cancelPlacementButton) {
    cancelPlacementButton.hidden = !placementPending || autoAnchoredArea;
    cancelPlacementButton.disabled = !placementPending || autoAnchoredArea || !sceneReady;
  }
  if (prepared) {
    $("apply").disabled = true;
    void renderPrepared();
  } else if (save) {
    const selectedCount = child ? childPlacements.length : 1;
    const requiredCount = child ? childPlacementCount() : 1;
    const areaTargets = currentTargetItems();
    const areaDamageRequired = !!payload?.action?.damage
      && (!payload?.action?.damageRequiredWithTargetsOnly || areaTargets.length > 0);
    const damageInputMissing = (!child && !!payload?.action?.damage && !$("damage").value.trim());
    const depthValid = !child?.depth || childPlacements.every((entry) => {
      if (entry.depthRoll === undefined || entry.depthRoll === "") return true;
      const value = Number(entry.depthRoll);
      const minimum = Number(child.depth.min ?? 1);
      const maximum = Number(child.depth.max ?? 10);
      return Number.isInteger(value) && value >= minimum && value <= maximum;
    });
    $("apply").disabled = !sceneReady || busy
      || !placement
      || (child
        ? selectedCount !== requiredCount
        : !placement.targetIds?.length && payload?.action?.allowEmptyTargets !== true)
      || requiresSave && currentTargetItems().some((item) => !SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcomes.get(item.id)))
      || !depthValid
      || (damageInputMissing && areaDamageRequired);
    $("apply").textContent = child
      ? "Conferma"
      : payload?.action?.buttonLabel || "Risolvi";
    $("summary").textContent = "";
    renderSave();
  } else if (singleSave) {
    $("apply").disabled = true;
    $("apply").textContent = "Applica";
    $("summary").textContent = "Caricamento bersagli…";
    void renderSingleSave();
  } else if (singleHeal) {
    $("apply").disabled = true;
    $("apply").textContent = "Cura";
    $("summary").textContent = "Caricamento bersagli…";
    void renderSingleHeal();
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
      $("summary").textContent = selectedAttackTarget ? "" : "Nessun bersaglio";
    }
    void renderStorm();
  }
  if (statusMessage) $("status").textContent = statusMessage;
  requestCompactPopoverResize();
}

async function placeArea(anchorTargetOverride = "") {
  if (fixedCasterRadiusConfig()) return;
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("placement") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const child = childZone();
  const childCount = childPlacementCount();
  const replacingIndex = child && childPlacements.length >= childCount
    ? childPlacements.length - 1
    : -1;
  if (child && !childCount) return;
  const anchoredArea = isPrimaryTargetAnchoredArea() && !child;
  const explicitAnchorTargetId = String(anchorTargetOverride || "").trim();
  const selectedIds = selectedPrimaryTargetIds();
  const selectedAnchorIds = anchoredArea
    ? explicitAnchorTargetId
      ? selectedIds.includes(explicitAnchorTargetId) ? [explicitAnchorTargetId] : []
      : selectedIds
    : [];
  if (anchoredArea && selectedAnchorIds.length !== 1) {
    setStatus(selectedAnchorIds.length
      ? "Seleziona un solo bersaglio dell'attacco sulla mappa."
      : "Seleziona il bersaglio dell'attacco sulla mappa.");
    return;
  }
  const anchorTargetId = selectedAnchorIds[0] || "";
  const requestId = createSpellAreaPlacementRequestId();
  pendingPlacementRequestId = requestId;
  pendingPlacementAnchorTargetId = anchorTargetId;
  busy = true;
  render();
  setStatus(child
    ? `${childKindLabel(child.childKind)} ${Math.min(childPlacements.length + 1, childCount)} di ${childCount}: posiziona e conferma sulla mappa.`
    : anchoredArea
    ? "Calcolo l'esplosione attorno al bersaglio dell'attacco."
    : isCallLightning()
    ? "Scegli e conferma il punto del fulmine sulla mappa."
    : isFlameInvestiture()
      ? "Scegli e conferma la linea di fuoco sulla mappa."
      : "Posiziona e conferma la sagoma sulla mappa.");
  try {
    const request = requestSpellAreaPlacement({
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
        : anchoredArea
          ? {
            anchorTargetId,
            primaryTargetId: anchorTargetId,
            areaAnchor: "primary-target",
            autoConfirmAnchor: true,
          }
        : null,
      requestId,
    }, {
      broadcast: OBR.broadcast,
      windowRef: window,
      onProgress: anchoredArea
        ? (progress) => {
          if (!sceneLifecycle.isCurrent(operation)
            || pendingPlacementRequestId !== requestId
            || !progress?.preview) return;
          const resultAnchorTargetId = String(
            progress.preview.anchorTargetId || anchorTargetId,
          ).trim();
          if (resultAnchorTargetId !== anchorTargetId) return;
          placement = {
            ...progress.preview,
            ...(resultAnchorTargetId ? { anchorTargetId: resultAnchorTargetId } : {}),
            targetIds: Array.from(new Set(progress.preview.targetIds || []))
              .filter((id) => payload?.action?.excludeAnchorTarget !== true
                || id !== anchorTargetId),
          };
          const allowedIds = new Set(placement.targetIds);
          outcomes = new Map([...outcomes].filter(([id]) => allowedIds.has(id)));
          busy = committingPlacementRequestId === requestId;
          setStatus("Esplosione ancorata. Seleziona gli esiti dei TS nell'area.");
          render();
        }
        : undefined,
    });
    pendingPlacementPromise = request;
    const result = await request;
    if (!sceneLifecycle.isCurrent(operation)
      || pendingPlacementRequestId !== requestId) return;
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
      const resultAnchorTargetId = String(
        result.preview.anchorTargetId || anchorTargetId,
      ).trim();
      if (anchoredArea && resultAnchorTargetId !== anchorTargetId) {
        throw new Error("placement-anchor-mismatch");
      }
      placement = {
        ...result.preview,
        ...(resultAnchorTargetId ? { anchorTargetId: resultAnchorTargetId } : {}),
        targetIds: Array.from(new Set(result.preview.targetIds || []))
          .filter((id) => !anchoredArea
            || payload?.action?.excludeAnchorTarget !== true
            || id !== anchorTargetId),
      };
      if (anchoredArea) {
        const allowedIds = new Set(placement.targetIds);
        outcomes = new Map([...outcomes].filter(([id]) => allowedIds.has(id)));
      } else {
        outcomes = new Map();
      }
    }
    setStatus(child
      ? `${childKindLabel(child.childKind)} confermato. ${childPlacements.length} di ${childCount}.`
      : anchoredArea
      ? "Esplosione ancorata. Seleziona gli esiti dei TS nell'area."
      : isCallLightning()
      ? "Fulmine confermato. I bersagli sono ora bloccati."
      : isFlameInvestiture()
        ? "Linea di fuoco confermata. I bersagli sono ora bloccati."
        : "Sagoma confermata. I bersagli sono ora bloccati.");
  } catch (error) {
    if (pendingPlacementRequestId === requestId) {
      setStatus(`Posizionamento non riuscito: ${error?.message || error}`);
    }
  } finally {
    if (pendingPlacementRequestId === requestId) {
      pendingPlacementRequestId = "";
      pendingPlacementPromise = null;
      pendingPlacementAnchorTargetId = "";
      if (committingPlacementRequestId !== requestId) busy = false;
      render();
    }
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

async function applyPreparedResolution() {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("prepared-resolution") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const group = preparedGroup();
  const action = preparedAction(group);
  const manual = action?.type === "manual";
  if (!group || !action || (!manual && !selectedAttackTarget)) {
    setStatus("Seleziona un bersaglio prima di continuare.");
    return;
  }
  attackOutcome = "hit";
  busy = true;
  render();
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const executionResult = manual
      ? await executeSpellActiveAction({
        spell: preparedSpellDefinition(group),
        actionId: action.id,
        group,
        selectedTargetIds: [],
        casterName: group.casterName,
        sceneEpoch: operation.epoch,
        sceneIdentity: ownerSceneContext?.sceneIdentity || null,
        commandId: ownerSceneContext?.commandId || operation.operationId,
        isCurrent: () => sceneLifecycle.isCurrent(operation),
      })
      : await (async () => {
        const request = buildPreparedSpellResolutionRequest({
          group,
          targetIds: [selectedAttackTarget],
          selectedChoice,
          attackOutcome: "hit",
          saveOutcome,
          damageValue: $("attackDamage").value,
        });
        return executeSpellApplication({
          ...request,
          casterName: group.casterName,
          sceneEpoch: operation.epoch,
          sceneIdentity: ownerSceneContext?.sceneIdentity || null,
          commandId: ownerSceneContext?.commandId || operation.operationId,
          isCurrent: () => sceneLifecycle.isCurrent(operation),
        });
      })();
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (executionResult?.status === "miss" && executionResult?.pending === true) {
      setStatus("La preparazione resta disponibile.");
      await OBR.broadcast.sendMessage(
        PREPARED_SPELL_RESOLUTION_CHANNEL,
        { type: "request-sync", instanceId: payload.instanceId },
        { destination: "LOCAL" },
      ).catch(() => {});
      await loadScene();
      return;
    }
    if (executionResult?.status === "stale") {
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED, "prepared-spell-stale");
    } else {
      await notifyParent(
        SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
        "",
        executionResult,
      );
    }
    await OBR.broadcast.sendMessage(
      PREPARED_SPELL_RESOLUTION_CHANNEL,
      { type: "request-sync", instanceId: payload.instanceId },
      { destination: "LOCAL" },
    ).catch(() => {});
    await OBR.popover.close(popoverIdFromPayload(payload)).catch(() => {});
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) return;
    const code = String(error?.message || error);
    setStatus(code === "prepared-spell-targets-required"
      ? "Seleziona un bersaglio valido."
      : `Risoluzione non riuscita: ${code}`);
    await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED, code);
  } finally {
    busy = false;
    if (sceneLifecycle.isReady()) render();
  }
}

async function apply() {
  if (isPreparedResolution()) {
    await applyPreparedResolution();
    return;
  }
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("active-resolution") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const anchoredPlacementRequestId = isPrimaryTargetAnchoredArea()
    ? String(pendingPlacementRequestId || "").trim()
    : "";
  const anchoredPlacementRequest = anchoredPlacementRequestId
    ? pendingPlacementPromise
    : null;
  if (anchoredPlacementRequestId) committingPlacementRequestId = anchoredPlacementRequestId;
  busy = true;
  render();
  try {
    if (anchoredPlacementRequestId) {
      if (!anchoredPlacementRequest) throw new Error("placement-preview-required");
      await confirmSpellAreaPlacementRequest(
        anchoredPlacementRequestId,
        { broadcast: OBR.broadcast },
      );
      const result = await anchoredPlacementRequest;
      if (!sceneLifecycle.isCurrent(operation)) return;
      if (result?.status !== "confirmed" || !placement) {
        throw new Error(result?.error || "placement-preview-required");
      }
    }
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) {
      busy = false;
      return;
    }
    const zoneShorteningFrom = selectedZoneShorteningFrom();
    if (isPrismaticWallTraversal() && !prismaticTraversalId) {
      prismaticTraversalId = sceneOperationId("prismatic-wall-traversal");
    }
    const executionResult = await executeSpellActiveResolution({
      payload,
      placement,
      targetIds: isPrismaticWallAction()
        ? isPrismaticWallTraversal()
          ? [selectedPrismaticTarget]
          : []
        : isMultiAttack()
        ? attackEntries.filter((entry) => entry.targetId).map((entry) => entry.targetId)
        : payload.action.resolutionKind === "single-attack"
        ? [selectedAttackTarget]
        : payload.action.resolutionKind === "single-save"
          ? [selectedSaveTarget]
          : payload.action.resolutionKind === "single-heal"
            ? [selectedHealTarget]
          : currentTargetItems().map((item) => item.id),
      outcomes: isPrismaticWallAction()
        ? {}
        : payload.action.resolutionKind === "single-save"
        ? { [selectedSaveTarget]: saveOutcome }
        : payload.action.resolutionKind === "single-heal"
          ? {}
        : Object.fromEntries(outcomes),
      layerOutcomes: isPrismaticWallTraversal()
        ? Object.fromEntries(prismaticLayerOutcomes)
        : {},
      layerDamage: isPrismaticWallTraversal()
        ? Object.fromEntries(prismaticLayerDamage)
        : {},
      layerId: isPrismaticWallAction() && !isPrismaticWallTraversal()
        ? prismaticWallLayerId
        : "",
      traversalId: isPrismaticWallTraversal() ? prismaticTraversalId : "",
      damageRoll: isPrismaticWallAction()
        ? 0
        : payload.action.resolutionKind === "child-zone"
        ? 0
        : payload.action.resolutionKind === "single-attack"
        ? $("attackDamage").value
        : payload.action.resolutionKind === "single-heal"
          ? $("healAmount").value
        : payload.action.resolutionKind === "single-save"
          ? payload.action.damage ? $("saveDamage").value : 0
          : $("damage").value,
      attackOutcome,
      shorteningFrom: zoneShorteningFrom,
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
    clearFixedCasterRadiusPreview();
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
    if (committingPlacementRequestId === anchoredPlacementRequestId) {
      committingPlacementRequestId = "";
    }
    busy = false;
    if (sceneLifecycle.isReady()) render();
  }
}

async function loadScene() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("scene-load") });
  if (!sceneLifecycle.isCurrent(operation)) return false;
  sceneItems = await OBR.scene.items.getItems();
  if (!sceneLifecycle.isCurrent(operation)) return false;
  if (fixedCasterRadiusConfig()) {
    await refreshFixedCasterRadiusPlacement(operation);
    if (!sceneLifecycle.isCurrent(operation)) return false;
  }
  render();
  autoPlaceAnchoredAreaFromSelection();
  return true;
}

payload = decodePayload();
if (!payload) {
  $("app").dataset.state = "stale";
  setStatus("Payload di attivazione non valido.", true);
} else {
  selectedChoice = String(payload.selectedChoice || "").trim();
  $("app").dataset.popoverId = popoverIdFromPayload(payload);
  void import("./popoverDrag.js").then(({ initializePopoverDrag }) => {
    initializePopoverDrag($("app"));
  });
  $("close").addEventListener("click", () => void closePopup());
  window.addEventListener(
    "beforeunload",
    () => {
      unsubscribePlayer?.();
      unsubscribePlayer = null;
      clearFixedCasterRadiusPreview();
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
  $("healAmount").addEventListener("input", (event) => {
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
  $("attackDamage").addEventListener("input", (event) => {
    if (isPreparedResolution()) event.target.dataset.value = event.target.value;
    render();
  });
  $("preparedChoice")?.addEventListener("change", (event) => {
    selectedChoice = String(event.target.value || "").trim();
    render();
  });
  $("zoneShorteningFrom")?.addEventListener("change", render);
  $("saveDamage").addEventListener("input", render);
  $("saveTarget").addEventListener("change", (event) => {
    selectedSaveTarget = event.target.value;
    saveOutcome = manualSaveAtTable()
      ? String(payload?.action?.assumedOutcome || "failed").trim() || "failed"
      : "";
    render();
  });
  $("prismaticWallTarget").addEventListener("change", (event) => {
    selectedPrismaticTarget = String(event.target.value || "").trim();
    prismaticLayerOutcomes = new Map();
    prismaticLayerDamage = new Map();
    render();
  });
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
  for (const button of document.querySelectorAll("[data-save-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy || !selectedSaveTarget) return;
      saveOutcome = button.dataset.saveOutcome;
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      attackOutcome = button.dataset.attackOutcome;
      if (isPreparedResolution()) render();
      else void apply();
    });
  }
  void OBR.onReady(async () => {
    sdkReady = true;
    currentPlayerSelection = await OBR.player.getSelection().catch(() => []);
    unsubscribePlayer = OBR.player.onChange((player) => {
      if (!Array.isArray(player?.selection)) return;
      currentPlayerSelection = [...player.selection];
      // Solo i resolver con un singolo bersaglio hanno un dropdown da
      // sincronizzare; render() mantiene invariati gli altri workflow.
      if (isPreparedResolution()
        || isSingleSave()
        || isSingleHeal()
        || isPrimaryTargetAnchoredArea()
        || isPrismaticWallTraversal()
        || (payload?.action?.resolutionKind === "single-attack" && !isMultiAttack())) {
        render();
      }
      autoPlaceAnchoredAreaFromSelection();
    });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => requestCompactPopoverResize());
      observer.observe($("app"));
      window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
    }
    sceneLifecycle.subscribe((event) => {
      if (event.phase === "unavailable") {
        clearFixedCasterRadiusPreview();
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
        selectedSaveTarget = "";
        selectedHealTarget = "";
        saveOutcome = "";
        busy = false;
        setStatus("Scena cambiata: riapri la risoluzione dal pannello Spells.", true);
        render();
      } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
        placement = null;
        childPlacements = [];
        childActivationId = "";
        outcomes.clear();
        selectedAttackTarget = "";
        selectedSaveTarget = "";
        selectedHealTarget = "";
        saveOutcome = "";
        setStatus(fixedCasterRadiusConfig()
          ? "Nuova scena pronta: ricalcolo i bersagli della scossa."
          : "Nuova scena pronta: posiziona di nuovo la risoluzione.");
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
    requestCompactPopoverResize();
    OBR.scene.items.onChange(() => {
      if (sceneLifecycle.isReady()) void loadScene();
    });
  });
}
