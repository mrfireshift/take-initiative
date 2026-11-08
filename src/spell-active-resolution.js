import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import {
  spellActiveResolutionPopoverId,
  SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES,
  SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES,
  spellActiveResolutionDamageFormula,
  spellActiveResolutionCriticalFormula,
  spellActiveResolutionDirectHitFormula,
  resolveSpellActiveResolutionDirectHitDamage,
  resolveSpellActiveResolutionDamage,
  spellActiveResolutionHealingFormula,
  spellActiveResolutionAttackDamageRequired,
  spellActiveResolutionSelectedTargetId,
  spellActiveResolutionTokenDisplayName,
  formatCompactTarget,
  spellActiveResolutionPopoverHeight,
} from "./spellActiveResolutionCore.js";
import {
  PRISMATIC_WALL_LAYER_IDS,
  prismaticWallFirstRemainingLayer,
  prismaticWallLayerById,
  prismaticWallStateFromCastContext,
  prismaticWallTraversalPlan,
} from "./prismaticWallRules.js";
import {
  TELEKINESIS_OUTCOMES,
  telekinesisStateFromCastContext,
} from "./telekinesisRules.js";
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
import { buildSharedHpPreview } from "./sharedHpViewCore.js";
import { calculateQuickHPChange } from "./quickHpCore.js";
import { renderSharedHpControls } from "./sharedHpControls.js";
import { areaHitsBounds, buildArea, buildCellBoundaryLoops, buildCircleArea } from "./aoeGeometryCore.js";
import { gridPlanarDistance } from "./distance3dCore.js";
import { spellAreaGridCells, spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { mobileAuraTargetIds, getMobileAuraRule } from "./spellAuraCore.js";
import { loadAoEStyle } from "./aoeStyle.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";
import {
  getSpellStructureRule,
  normalizeSpellStructureState,
  spellStructureDamageAfterDefenses,
  spellStructureNounWords,
  spellStructureSegmentMiddle,
} from "./spellStructureCore.js";
import { DAMAGE_TYPES, evasionForItem } from "./damageDefensesCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";
import { wallOfLightTargetWithinRange } from "./wallOfLightActiveCore.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { SPELL_TURN_PROMPT_ACTION_CHANNEL } from "./callLightningTurnPromptController.js";
import {
  magicalDamageDefensesForItem,
  spellActionDamageTypes,
  spellDamageAfterDefense,
  spellDamageDefenseApplied,
  spellDamageDefenseRows,
  spellDamageDefenseText,
  spellDamageDefenseTitle,
  spellDamagePartAfterDefense,
  spellDamageTypes,
} from "./spellDamageDefenseCore.js";

const META_KEY = `${ID}/meta`;
const params = new URLSearchParams(globalThis.location?.search || "");
const popoverIdFromPayload = (payload) => String(payload?.popoverId || "").trim()
  || spellActiveResolutionPopoverId(payload?.instanceId, payload?.actionId);

let payload = null;
let placement = null;
let childPlacements = [];
let childActivationId = "";
let sceneItems = [];
let sharedHpSelection = { policy: "once", chosenTargetIds: {} };
// The damage defenses the GM ignores in this action: targetId → the types.
const ignoredDefenses = new Map();
let outcomes = new Map();
let selectedAttackTarget = "";
let selectedSaveTarget = "";
let selectedHealTarget = "";
let selectedPrismaticTarget = "";
let initialPrismaticTarget = "";
let selectedTelekinesisTarget = "";
let telekinesisOutcome = "";
let saveOutcome = "";
let saveAbility = "";
let attackOutcome = "";
let selectedChoice = "";
let attackEntries = [];
// Where the cursor goes when the attack's controls are drawn: the damage, after the outcome that asks for it.
let attackDamageFocus = false;
// Lightning Arrow's own hit: its outcome, and the cursor to its damage once the outcome is chosen.
let directHitOutcome = "";
let directHitFocus = false;
let attackRowFocus = -1;
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
let lastPopoverHeight = 0;
let sdkReady = false;
let fixedRadiusPreviewCleanup = null;
let fixedRadiusPreviewSequence = 0;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function sceneOperationId(prefix = "spell-active") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

// The window's one height for this kind of popup: it never follows the content.
function requestCompactPopoverResize() {
  if (!payload || !sdkReady) return;
  const targetHeight = spellActiveResolutionPopoverHeight(payload);
  if (targetHeight === lastPopoverHeight) return;
  const id = popoverIdFromPayload(payload);
  if (!id) return;
  lastPopoverHeight = targetHeight;
  OBR.popover.setHeight(id, targetHeight).catch(() => {
    lastPopoverHeight = 0;
  });
}

const $ = (id) => document.getElementById(id);

// An outcome button's state: `.segmented` (console-shell.css) colours it from data-outcome and aria-pressed.
function markOutcome(button, outcome, pressed) {
  button.dataset.outcome = outcome;
  button.setAttribute("aria-pressed", String(pressed));
}

// The main button as in the consoles: red when it registers damage, blue for everything else.
function applyRegistersDamage() {
  if (isPreparedResolution()) return !!preparedPhasePlan()?.resolution?.mechanics?.damageBonus;
  return !!payload?.action?.damage || isPrismaticWallTraversal();
}

const TARGET_ON_THE_MAP = "Seleziona il bersaglio sulla mappa";

// A target's hit points, as the consoles show them: the bare numbers in a list of creatures.
function targetHpNumbers(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const hp = Number(meta.hp);
  const hpMax = Number(meta.hpMax);
  return Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0 ? `${hp}/${hpMax}` : "";
}

function targetHpText(item) {
  const numbers = targetHpNumbers(item);
  return numbers ? `${numbers} PF` : "";
}

// A target in a menu: its name, what the action says of it, its hit points.
function targetOptionLabel(item, note = "") {
  return [displayName(item), note, targetHpText(item)].filter(Boolean).join(" · ");
}

// A damage or healing row's label, as in the consoles: what it is, then its dice. A type the GM chooses is no name.
function renderAmountLabel(node, type, dice) {
  if (!node) return;
  const word = typeof type === "string" && type.trim() && !/^del /iu.test(type.trim()) ? type.trim() : "danno";
  const name = document.createElement("span");
  name.textContent = word[0].toLocaleUpperCase("it") + word.slice(1);
  node.replaceChildren(name);
  if (dice) {
    const meta = document.createElement("span");
    meta.className = "dice";
    meta.textContent = dice;
    node.append(meta);
  }
}

// An attack's dice beside its damage, as in the console: on a critical the doubled dice follow.
function attackDiceText(outcome) {
  const action = payload?.action;
  const dice = spellActiveResolutionDamageFormula({ action, slotLevel: payload?.slotLevel, outcome: "hit" }).scaledFormula
    || String(action?.damage?.formula || "").trim();
  if (outcome !== "critical" || !dice) return dice;
  return `${dice} · critico ${spellActiveResolutionCriticalFormula({ action, slotLevel: payload?.slotLevel })}`;
}

// The save's DC: the action's own, the one fixed at the cast, or the caster's sheet.
function actionSaveDC() {
  const caster = sceneItems.find((item) => item?.id === payload?.casterId);
  const dc = Number(payload?.action?.save?.dc
    ?? payload?.castContext?.spellSaveDC
    ?? payload?.spellSaveDC
    ?? caster?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC);
  return Number.isInteger(dc) && dc > 0 ? dc : null;
}

// The action's cost as in the consoles, in its colour and shape. A prepared spell has paid it; a GM's command has none.
function renderEconomy() {
  const node = $("economy");
  const value = isTelekinesisContest() ? "action" : payload?.action?.economy;
  const free = isPreparedResolution() || isBlinkReturn() || isPrismaticWallAction() || value === "gm";
  node.textContent = free ? "" : economyLabel(value);
  node.dataset.cost = value === "bonus-action" ? "bonus" : "action";
  node.hidden = free;
}

// Who acts and, when the main button does not say it already, what: the same words never twice.
function renderHeadingSubtitle() {
  const spellTitle = String(payload.spellName || payload.spellId || "Incantesimo").trim();
  const singleSave = isSingleSave();
  const activeActionTitle = singleSave
    ? payload.action?.buttonLabel || payload.action?.label || spellTitle
    : payload.action?.buttonLabel || payload.action?.label;
  const rawActionLabel = String(activeActionTitle || "").trim();
  const actionWords = rawActionLabel.toLocaleLowerCase("it");
  const buttonWords = $("footer").hidden || $("apply").hidden
    ? ""
    : String($("apply").textContent || "").trim().toLocaleLowerCase("it");
  const buttonSaysIt = !!buttonWords && (actionWords === buttonWords || actionWords.startsWith(`${buttonWords} `));
  const redundant = isPreparedResolution() || actionWords === "risolvi" || buttonSaysIt
    || actionWords === spellTitle.toLocaleLowerCase("it");
  const casterName = String(payload.casterName || payload.casterId || "").trim();
  const text = [casterName, redundant ? "" : rawActionLabel].filter(Boolean).join(" · ");
  $("subtitle").textContent = text;
  $("subtitle").hidden = !text;
}

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

function isBlinkReturn() {
  return payload?.spellId === "blink"
    && payload?.action?.resolutionKind === "blink-return";
}

// CAP-TELEPORT: a teleport from a spell already active (Far Step, Arcane Gate). It reuses Blink's section: one click
// on the destination cell, then the move.
function isTeleportAction() {
  return payload?.action?.resolutionKind === "teleport";
}

function teleportsSelectedCreature() {
  return isTeleportAction() && payload?.action?.teleport?.subject === "target";
}

function pointTeleport() {
  return isBlinkReturn() || isTeleportAction();
}

// CAP-STRUCTURE: a panel or pillar damaged or brought down. The GM clicks it on the map; its hit points come from the
// caster's pill (castContext.structure).
let structureSegmentIndex = 0;

function isStructureSegment() {
  return payload?.action?.resolutionKind === "structure-segment";
}

function structureOperation() {
  return String(payload?.action?.structure?.operation || "damage").trim();
}

function structureParentState() {
  const caster = sceneItems.find((item) => item.id === payload?.casterId);
  const spells = caster?.metadata?.[META_KEY]?.[`${ID}/spells`];
  const parent = (Array.isArray(spells) ? spells : []).find((entry) => (
    String(entry?.instanceId || "").trim() === String(payload?.instanceId || "").trim()
  ));
  return normalizeSpellStructureState(parent?.castContext?.structure);
}

// The segments of this spell on the map, the standing ones with their hit points.
function structureSegmentItems() {
  const rule = getSpellStructureRule(payload?.spellId);
  if (!rule) return [];
  const state = structureParentState();
  return sceneItems
    .map((item) => ({ item, metadata: item?.metadata?.[SPELL_STATIC_ZONE_META_KEY] }))
    .filter(({ metadata }) => metadata?.role === "subzone"
      && String(metadata.parentInstanceId || "") === String(payload?.instanceId || "")
      && String(metadata.childKind || "") === rule.segmentKind)
    .map(({ item, metadata }) => ({
      item,
      index: Number(metadata.childIndex),
      geometry: metadata.geometry || {},
      segment: state.segments.find((entry) => entry.index === Number(metadata.childIndex)) || null,
    }))
    .filter((entry) => entry.segment && entry.segment.hp > 0);
}

function distanceToSegment(position, start, end) {
  const a = point(start);
  const b = point(end);
  if (!a || !b) return Infinity;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / length)) : 0;
  return Math.hypot(position.x - (a.x + dx * t), position.y - (a.y + dy * t));
}

// The standing segment nearest the click, within a square and a half of it: the line of a panel, the middle of a
// pillar.
function structureSegmentAt(position) {
  let best = null;
  for (const entry of structureSegmentItems()) {
    const dpi = Number(entry.geometry.dpi) || 70;
    const middle = entry.geometry.type === "line" ? null : spellStructureSegmentMiddle(entry.geometry);
    const distance = middle
      ? Math.hypot(position.x - middle.x, position.y - middle.y)
      : distanceToSegment(position, entry.geometry.start, entry.geometry.end);
    if (distance <= dpi * 1.5 && (!best || distance < best.distance)) best = { ...entry, distance };
  }
  return best;
}

function renderStructureSegment() {
  const rule = getSpellStructureRule(payload?.spellId);
  const chosen = structureSegmentItems().find((entry) => entry.index === structureSegmentIndex) || null;
  const words = spellStructureNounWords(rule);
  const noun = words.noun;
  const collapse = structureOperation() === "collapse";
  $("structureTitle").textContent = String(payload?.action?.label || "").trim() || `Danneggia ${noun}`;
  $("structurePick").disabled = busy || !sceneLifecycle.isReady();
  $("structurePick").textContent = chosen ? "Cambia" : "Scegli sulla mappa";
  $("structureStatus").textContent = chosen
    ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${chosen.index} · ${chosen.segment.hp}/${chosen.segment.hpMax} PF · CA ${rule.armorClass}`
    : `Clicca sulla mappa ${words.the}.`;
  $("structureDamageRow").hidden = collapse || !chosen;
  const typeSelect = $("structureType");
  if (!typeSelect.options.length) {
    typeSelect.replaceChildren(...DAMAGE_TYPES.map((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.label;
      return option;
    }));
    typeSelect.value = "bludgeoning";
  }
  const amount = Math.floor(Number($("structureDamage").value));
  const dealt = chosen && !collapse && amount > 0
    ? spellStructureDamageAfterDefenses(rule, amount, typeSelect.value)
    : null;
  const defenseWord = { immunity: "immune", vulnerability: "vulnerabile", resistance: "resistente" }[dealt?.defense] || "";
  renderSummary(
    !chosen ? "" : collapse ? "" : !(amount > 0) ? "Scrivi il danno." : "",
    dealt ? `${defenseWord ? `${defenseWord.charAt(0).toUpperCase()}${defenseWord.slice(1)}: ` : ""}${chosen.segment.hp} →` : "",
    dealt ? Math.max(0, chosen.segment.hp - dealt.amount) : null,
  );
  $("apply").hidden = false;
  $("apply").textContent = collapse ? "Fai crollare" : "Applica danno";
  $("apply").disabled = busy || !chosen || (!collapse && !(amount > 0));
}

async function pickStructureSegment() {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("structure-pick") });
  const requestId = createSpellAreaPlacementRequestId();
  pendingPlacementRequestId = requestId;
  busy = true;
  render();
  try {
    const result = await requestSpellAreaPlacement({
      ruleId: String(payload.action.placementRuleId || "").trim(),
      casterId: payload.casterId,
      context: { pointSelection: true, autoConfirmPoint: true, directPointSelection: true },
      requestId,
    }, { broadcast: OBR.broadcast, windowRef: window });
    if (!sceneLifecycle.isCurrent(operation) || pendingPlacementRequestId !== requestId) return;
    const position = result?.status === "confirmed" ? point(result.preview?.position || result.preview?.start) : null;
    if (!position) {
      setStatus(result?.status === "cancelled" ? "Scelta annullata." : "Nessun punto scelto.", false, "warn");
      return;
    }
    sceneItems = await OBR.scene.items.getItems();
    const found = structureSegmentAt(position);
    const words = spellStructureNounWords(getSpellStructureRule(payload?.spellId));
    if (!found) {
      setStatus(`${words.none} in piedi lì: clicca su ${words.one}.`, false, "warn");
      return;
    }
    structureSegmentIndex = found.index;
    setStatus("", false);
  } catch (error) {
    setStatus(`Scelta non riuscita: ${error?.message || error}`, false, "error");
  } finally {
    if (pendingPlacementRequestId === requestId) {
      pendingPlacementRequestId = "";
      busy = false;
      render();
    }
  }
}

// Who teleports: the caster (Far Step) or the one creature selected on the map (Arcane Gate's traversal).
function teleportSubjectIds() {
  if (!isTeleportAction()) return [];
  if (!teleportsSelectedCreature()) return [String(payload?.casterId || "").trim()].filter(Boolean);
  const byId = new Map(sceneItems.map((item) => [item.id, item]));
  const ids = (Array.isArray(currentPlayerSelection) ? currentPlayerSelection : [])
    .map((id) => String(id || "").trim())
    .filter((id) => byId.get(id)?.layer === "CHARACTER");
  return ids.length === 1 ? ids : [];
}

function isTelekinesisContest() {
  return payload?.spellId === "telekinesis"
    && payload?.action?.resolutionKind === "telekinesis-contest";
}

function telekinesisCurrentTargetId() {
  return String(
    telekinesisStateFromCastContext(payload?.castContext).targetId
      || payload?.linkedTargetId
      || "",
  ).trim();
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
  // Feet as D&D counts them (5 ft = 1,5 m), as the spell ranges do (docs/AREE_SU_GRIGLIA.md, MP-09).
  const unitMeters = {
    m: 1, meter: 1, meters: 1, metro: 1, metri: 1,
    ft: 0.3, foot: 0.3, feet: 0.3, cm: 0.01, km: 1000,
  }[unit] || 1;
  return (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5) * unitMeters;
}

function saveAbilityLabel(value) {
  return ({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" })[String(value || "").trim().toLowerCase()] || "";
}

function isTurbineEscape() {
  return payload?.spellId === "xanathar-turbine"
    && payload?.actionId === "xanathar-turbine-escape";
}

function maxAttackCount() {
  return Math.max(1, Math.floor(Number(payload?.action?.maxAttacks) || 1));
}

// An action opened from the choice of the hand's actions (or another turn choice) can go back to it.
function renderBackToChoice() {
  const button = $("backToChoice");
  if (!button) return;
  button.hidden = payload?.returnToChoice !== true || isPreparedResolution();
  button.disabled = busy;
}

function isMultiAttack() {
  return payload?.action?.resolutionKind === "single-attack" && maxAttackCount() > 1;
}

// As the PC attack console: the outcome is chosen first, the damage is asked only on a hit or a critical, and the button
// records it; a miss needs no damage. Several attacks go in the same order, one box each.
function isConsoleFlowAttack() {
  return !isPreparedResolution() && !isMultiAttack()
    && payload?.action?.resolutionKind === "single-attack";
}

// One of several attacks is ready with its target, its outcome and, on a hit, its damage.
function attackEntryComplete(entry) {
  if (!entry.targetId || !entry.attackOutcome) return false;
  return !spellActiveResolutionAttackDamageRequired(payload?.action, entry.attackOutcome)
    || String(entry.damageRoll).trim() !== "";
}

// The number one of several attacks sends: a miss has none to send.
function attackEntryRoll(entry) {
  return spellActiveResolutionAttackDamageRequired(payload?.action, entry.attackOutcome) ? entry.damageRoll : 0;
}

function childZone() {
  return isChildZone() && payload?.action?.childZone
    && typeof payload.action.childZone === "object"
    ? payload.action.childZone
    : null;
}

function childKindLabel(value) {
  const kind = String(value || "").trim();
  // Arcane Gate's second portal (CAP-TELEPORT, lotto T4).
  return kind === "fissure" ? "Fessura" : kind === "portal" ? "Portale" : "Vortice";
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

// What the action places, in the panel's words when it is an area: its button before and after, and the line once confirmed.
function placementWords() {
  // An action may say its own words (Melf's meteors); the spells below kept theirs here.
  const declared = payload?.action?.placementWords;
  if (declared?.place && declared?.again && declared?.done) {
    return { place: String(declared.place), again: String(declared.again), done: String(declared.done) };
  }
  if (isCallLightning()) return { place: "Posiziona il fulmine", again: "Riposiziona il fulmine", done: "Fulmine confermato" };
  if (isFlameInvestiture()) return { place: "Posiziona la linea di fuoco", again: "Riposiziona la linea di fuoco", done: "Linea di fuoco confermata" };
  if (isHolyWeapon()) return { place: "Posiziona l'esplosione", again: "Riposiziona l'esplosione", done: "Esplosione confermata" };
  if (isPrimaryTargetAnchoredArea()) return { place: "Centra sul bersaglio dell'attacco", again: "Centra di nuovo sul bersaglio", done: "Esplosione confermata" };
  return { place: "Posiziona area", again: "Riposiziona area", done: "Area confermata" };
}

function creaturesHit(count) {
  return count === 1 ? "1 creatura colpita" : count ? `${count} creature colpite` : "nessuna creatura colpita";
}

function renderContext() {
  if (isTelekinesisContest()) {
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
    $("prismaticWallSection").hidden = true;
    $("blinkReturnSection").hidden = true;
    return;
  }
  if (pointTeleport() || isStructureSegment()) {
    $("blinkReturnHint").textContent = "";
    $("blinkReturnHint").hidden = true;
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
    $("prismaticWallSection").hidden = true;
    return;
  }
  if (isPrismaticWallAction()) {
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
    return;
  }
  if (isPreparedResolution()) {
    const action = preparedAction();
    if (action?.type === "manual") {
      const damageField = $("attackDamage")?.closest(".field");
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
    $("saveTitle").hidden = true;
    $("placementToolbar").hidden = true;
    $("childCountField").hidden = true;
    $("childDepths").hidden = true;
    $("bulkOutcomes").hidden = true;
    $("attackRows").hidden = true;
    $("attackOutcomes").hidden = true;
    $("attackAdvantage").hidden = true;
    $("saveTargetHint").hidden = true;
    $("singleHealSection").hidden = true;
    if (damageField) damageField.hidden = true;
    attackOutcome = "hit";
    $("attackTitle").textContent = "Bersaglio";
    renderAmountLabel($("attackDamageLabel"), damage?.type, damage?.dice);
    $("attackDamage").placeholder = "Totale";
    return;
  }
  const callLightning = isCallLightning();
  const flameInvestiture = isFlameInvestiture();
  const holyWeapon = isHolyWeapon();
  const primaryTargetArea = isPrimaryTargetAnchoredArea();
  const child = childZone();
  const singleSave = isSingleSave();
  const fixedRadius = fixedCasterRadiusConfig();
  const childLabel = childKindLabel(child?.childKind);
  $("saveTitle").hidden = callLightning || true;
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
  const placementLabels = placementWords();
  $("place").textContent = child
    ? `Posiziona ${childLabel.toLocaleLowerCase("it-IT")}`
    : placement ? placementLabels.again : placementLabels.place;
  const damage = payload?.action?.damage || {};
  const activeDamageFormula = spellActiveResolutionDamageFormula({
    action: payload?.action,
    slotLevel: payload?.slotLevel,
    outcome: manualSaveAtTable() ? payload?.action?.assumedOutcome || "failed" : saveOutcome,
  }).scaledFormula;
  const damageDice = activeDamageFormula || damage.formula || "";
  const wallOfLight = payload?.spellId === "xanathar-muro-di-luce"
    && payload?.actionId === "wall-of-light-beam";
  const activeActionLabel = String(payload?.action?.label || "Risoluzione dell'attacco").trim();
  $("attackTitle").textContent = wallOfLight && activeDamageFormula
    ? activeActionLabel.replace(/\d+d\d+/iu, activeDamageFormula)
    : activeActionLabel;
  const attackDamageLabel = $("attackDamageLabel");
  if (attackDamageLabel) {
    renderAmountLabel(attackDamageLabel, damage.type,
      payload?.action?.resolutionKind === "single-attack" ? attackDiceText(attackOutcome) : damageDice);
  }
  if (wallOfLight) {
    $("attackDamage").setAttribute("aria-label", "Danno del Raggio radioso");
  } else {
    $("attackDamage").removeAttribute("aria-label");
  }
  if (singleSave) {
    const manualSave = manualSaveAtTable();
    const ability = manualSave ? ""
      : isTurbineEscape() ? "Prova di fuga"
        : saveAbilityLabel(payload?.action?.save?.ability);
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
    renderAmountLabel($("singleSaveDamageLabel"), damage.type, damageDice);
  }
  renderAmountLabel($("damageLabel"), payload?.action?.directHit ? "esplosione" : damage.type, damageDice);
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
  return spellActiveResolutionTokenDisplayName(item);
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
  // adjacentRing: the reach of a large root (Mano arcana) is measured from its edge, not from its centre.
  const rootBounds = payload?.action?.adjacentRing === true && payload?.action?.rangeOrigin === "root" && root
    ? await OBR.scene.items.getItemBounds([root.id]).catch(() => null)
    : null;
  const metersPerCell = Number(scale?.parsed?.multiplier ?? scale?.multiplier ?? 1.5) || 1.5;
  const candidates = characters().filter((item) => item.id !== payload.casterId);
  const entries = await Promise.all(candidates.map(async (item) => {
    const bounds = await OBR.scene.items.getItemBounds([item.id]).catch(() => null);
    const center = itemCenter(bounds, item);
    if (!center) return null;
    const planar = rootBounds
      ? gridPlanarDistance(itemCenter(rootBounds, root), center, dpi, metersPerCell,
        boundsSize(rootBounds, dpi), boundsSize(bounds, dpi))
      : null;
    const inRange = planar
      ? planar.squares > 0 && planar.squares <= 1 + 1e-9
      : payload.action.range
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
  // The root of a board token (Mano arcana) is the token of the same cast, as validateStorm accepts it.
  const boardRoot = root?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const rootReady = !!area || (boardRoot?.kind === "spell-board-token"
    && String(boardRoot.instanceId || "") === String(payload?.instanceId || "")
    && String(boardRoot.casterId || "") === String(payload?.casterId || ""));
  return { area, rootReady, entries: entries.filter(Boolean) };
}

// A message in the bar at the bottom. Its kind (ok, warn, error) gives it the consoles' colour and icon.
function setStatus(message, stale = false, kind = "") {
  statusMessage = String(message || "");
  $("status").textContent = statusMessage;
  $("status").hidden = !statusMessage;
  $("status").dataset.kind = kind || (stale ? "warn" : "");
  $("app").dataset.state = stale ? "stale" : "ready";
}

// A refusal speaks of the attack as it was: once the GM changes it, it says nothing more.
function clearRefusal() {
  if ($("status").dataset.kind === "error") setStatus("");
}

// Beside the main button: what is still missing, or what it will register.
function renderSummary(missing = "", label = "", amount = null, extra = []) {
  const node = $("summary");
  node.replaceChildren();
  if (missing) {
    node.textContent = missing;
  } else if (Number.isFinite(amount)) {
    const number = document.createElement("strong");
    number.textContent = String(amount);
    node.append(`${label} `, number);
    // A second number after the first: Lightning Arrow's burst after its hit.
    for (const [extraLabel, extraAmount] of extra) {
      if (!Number.isFinite(extraAmount)) continue;
      const more = document.createElement("strong");
      more.textContent = String(extraAmount);
      node.append(` · ${extraLabel} `, more);
    }
  }
  node.hidden = !node.childNodes.length;
}

// The damage a creature takes, after its defense, once its outcome and its number are known.
function subjectDamage(subject) {
  const written = String(subject?.roll ?? "").trim() !== "" && Number.isFinite(Number(subject?.roll));
  if (!subject?.outcome || !written) return null;
  const rows = targetDefenseRows(subject.item, subject.direct ? directHitTypes() : undefined);
  const resolved = resolvedDamage(subject.outcome, subject.roll, spellDamageDefenseApplied(rows), subject.direct === true, subject.item);
  return resolved?.valid ? resolved.amount : null;
}

// The damage this popup writes, after a defense. A smite's has no save to halve it: only the defense changes it. item: the
// creature, for its Evasion against a Dexterity save that halves.
function resolvedDamage(outcome, roll, defense, direct = false, item = null) {
  if (direct) {
    return resolveSpellActiveResolutionDirectHitDamage({ action: payload.action, slotLevel: payload.slotLevel, outcome, roll, defense });
  }
  if (isPreparedResolution()) return { valid: true, amount: spellDamageAfterDefense(Number(roll), "full", defense) };
  return resolveSpellActiveResolutionDamage({ action: payload.action, slotLevel: payload.slotLevel, outcome, roll: Number(roll), defense,
    evasion: evasionForItem(item, META_KEY) });
}

// The type of that damage: the action's, or a smite's own (spellDamageDefenseCore.js), by the spell's id as the executor reads it.
function popupDamageTypes() {
  return isPreparedResolution()
    ? spellDamageTypes(preparedSpellDefinition({ spellId: payload?.spellId })?.id)
    : spellActionDamageTypes(payload?.action);
}

// Lightning Arrow's own hit (the directHit of its action), on the creature the burst is anchored to.
function directHitAction() {
  return payload?.action?.directHit || null;
}

function directHitTypes() {
  return spellActionDamageTypes(directHitAction());
}

function directHitTarget() {
  const id = directHitAction() ? currentAnchoredTargetId() : "";
  return id ? sceneItems.find((item) => item?.id === id) || null : null;
}

function directHitRoll() {
  return String($("directHitDamage")?.value || "").trim();
}

// Who takes the hit, with what the popup knows so far. Before the outcome its defense is said as for a hit.
function directHitSubject() {
  const item = directHitTarget();
  return item ? { item, outcome: directHitOutcome || "hit", roll: directHitRoll(), direct: true } : null;
}

// What is still missing for the hit, from the target to its damage: the burst says its own after it.
function directHitMissing() {
  if (!directHitAction()) return "";
  if (!directHitTarget()) return "Manca il bersaglio.";
  if (!directHitOutcome) return "Manca l'esito del colpo.";
  return directHitRoll() ? "" : "Manca il danno del colpo.";
}

// The hit's dice beside its damage, as an attack's in the console: the doubled ones on a critical, the half on a miss.
function directHitDiceText(outcome) {
  const { scaledFormula, criticalFormula } = spellActiveResolutionDirectHitFormula({
    action: payload?.action,
    slotLevel: payload?.slotLevel,
  });
  if (!scaledFormula) return "";
  return outcome === "critical" ? `${scaledFormula} · critico ${criticalFormula}`
    : outcome === "miss" ? `${scaledFormula} · metà se manca`
    : scaledFormula;
}

// Its row, as the burst's creatures: name, hit points, outcome; under it, its damage.
function renderDirectHit() {
  const box = $("directHit");
  if (!box) return;
  const item = directHitTarget();
  box.hidden = !item;
  if (!item) return;
  $("directHitName").textContent = displayName(item);
  $("directHitName").title = displayName(item);
  $("directHitHp").textContent = targetHpNumbers(item);
  const declared = Array.isArray(directHitAction()?.outcomes) ? directHitAction().outcomes : [];
  for (const button of box.querySelectorAll("[data-direct-hit-outcome]")) {
    const outcome = button.dataset.directHitOutcome;
    markOutcome(button, outcome, outcome === directHitOutcome);
    button.hidden = !declared.includes(outcome);
    button.disabled = busy || !sceneLifecycle.isReady();
  }
  renderAmountLabel($("directHitLabel"), "colpo", directHitDiceText(directHitOutcome));
  if (directHitFocus) $("directHitDamage").focus?.();
  directHitFocus = false;
}

function renderSave() {
  renderDirectHit();
  const targetWrap = $("targets");
  targetWrap.replaceChildren();
  const targets = currentTargetItems();
  const child = childZone();
  const childCount = childPlacementCount();
  const childLabel = childKindLabel(child?.childKind);
  const fixedRadius = fixedCasterRadiusConfig();
  // Beside the button that draws it: what has been drawn and whom it hits. While it is being drawn the bar says what to do.
  $("placementStatus").textContent = pendingPlacementRequestId
    ? ""
    : child
    ? `${childLabel} ${childPlacements.length} di ${childCount}${child.resolution === "save" && targets.length ? ` · ${creaturesHit(targets.length)}` : ""}`
    : fixedRadius
      ? `${creaturesHit(targets.length)} entro ${String(fixedRadius.value).replace(".", ",")} m`
    : placement
      ? `${placementWords().done}: ${creaturesHit(targets.length)}.`
      : "Le creature colpite compariranno qui.";
  const damageRequired = !!payload?.action?.damage
    && (!payload?.action?.damageRequiredWithTargetsOnly || targets.length > 0);
  $("damageField").hidden = child || targets.length === 0 || !damageRequired;
  $("bulkOutcomes").hidden = !targets.length || (!!child && child.resolution !== "save");
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
      const [depthName, depthDie] = String(child.depth.label || "Profondità").split(/\s*[()]/);
      label.textContent = `${depthName} ${index + 1}`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(minimumDepth);
      input.max = String(maximumDepth);
      input.step = "1";
      input.placeholder = depthDie || "—";
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
    name.title = displayName(item);
    const outcomeLabels = { passed: "Superato", failed: "Fallito", immune: "Immune" };
    row.appendChild(name);
    const hp = document.createElement("span");
    hp.className = "target-hp";
    hp.textContent = targetHpNumbers(item);
    row.appendChild(hp);
    const outcomeGroup = document.createElement("div");
    outcomeGroup.className = "segmented mini";
    for (const outcome of SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = outcomeLabels[outcome];
      markOutcome(button, outcome, outcomes.get(item.id) === outcome);
      button.disabled = busy || !sceneLifecycle.isReady();
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        outcomes.set(item.id, outcome);
        render();
      });
      outcomeGroup.appendChild(button);
    }
    row.appendChild(outcomeGroup);
    targetWrap.appendChild(row);
  }
  $("damage").value = $("damage").dataset.value || "";
  $("place").textContent = child && childPlacements.length >= childCount
    ? `Riposiziona ${childCount > 1 ? "ultima " : ""}${childLabel.toLocaleLowerCase("it-IT")}`
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
  // anyCreature (Goodberry): every creature on the scene, no aura to read them from.
  if (payload?.action?.anyCreature === true) return caster ? characters() : [];
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
  if (selectedEntry) {
    renderTargetLine(formatCompactTarget(displayName(selectedEntry)), "", selectedEntry);
  } else {
    renderTargetLine("", TARGET_ON_THE_MAP);
  }
  const healingFormula = spellActiveResolutionHealingFormula({
    action: payload?.action,
    slotLevel: payload?.slotLevel,
  }).scaledFormula;
  renderAmountLabel($("healAmountLabel"), "cura", healingFormula);
  // A fixed healing (Goodberry's 1 hit point) needs no roll: the field starts with it.
  $("healAmount").value = $("healAmount").dataset.value
    || (/^\d+$/u.test(String(healingFormula || "").trim()) ? String(healingFormula).trim() : "");
  $("healAmount").disabled = busy || !selectedHealTarget;
  const healingReady = String($("healAmount").value || "").trim() !== "";
  const canResolve = sceneLifecycle.isReady()
    && !busy
    && !!selectedHealTarget
    && healingReady;
  $("apply").disabled = !canResolve;
  $("apply").textContent = "Cura";
  renderSummary(
    !selectedHealTarget ? "Manca il bersaglio." : !healingReady ? "Manca la cura." : "",
    "Cura",
    healingReady ? Number($("healAmount").value) : null,
  );
  renderHeadingSubtitle();
  requestCompactPopoverResize();
}

async function renderSingleSave() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("single-save-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const select = $("saveTarget");
  const previous = selectedSaveTarget;
  const entries = await singleSaveTargetData();
  if (!sceneLifecycle.isCurrent(operation)) return;
  select.replaceChildren(new Option("Seleziona il bersaglio", ""));
  for (const item of entries) select.appendChild(new Option(targetOptionLabel(item), item.id));
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
  const abilityOptions = Array.isArray(payload?.action?.save?.abilityOptions)
    ? payload.action.save.abilityOptions
      .map((option) => ({
        value: String(option?.value || "").trim().toLowerCase(),
        label: String(option?.label || "").trim(),
      }))
      .filter((option) => option.value && option.label)
    : [];
  const abilityField = $("singleSaveAbilityField");
  const abilitySelect = $("saveAbility");
  if (abilityOptions.length) {
    abilityField.hidden = false;
    abilitySelect.replaceChildren(...abilityOptions.map((option) =>
      new Option(option.label, option.value)));
    const defaultAbility = String(
      payload?.action?.save?.ability || abilityOptions[0].value,
    ).trim().toLowerCase();
    saveAbility = abilityOptions.some((option) => option.value === saveAbility)
      ? saveAbility
      : defaultAbility;
    if (!abilityOptions.some((option) => option.value === saveAbility)) {
      saveAbility = abilityOptions[0].value;
    }
    abilitySelect.value = saveAbility;
  } else {
    abilityField.hidden = true;
    saveAbility = String(payload?.action?.save?.ability || "").trim().toLowerCase();
  }
  if (manualSave) saveOutcome = String(payload?.action?.assumedOutcome || "failed").trim() || "failed";
  const linkedTargetHint = String(payload?.action?.linkedTargetHint || "").trim();
  const maximilianLinkedTarget = requiredEffectId === "maximilian-earth-grasp-restrained";
  const singleSaveRootNotice = payload?.action?.rangeOrigin === "root" ? "dalla mano" : "";
  const singleSaveHintText = requiredEffect || automaticLinkedTarget
    ? entries.length === 1
      ? linkedTargetHint
        ? `${formatCompactTarget(displayName(entries[0]))} · ${linkedTargetHint}`
        : maximilianLinkedTarget
          ? formatCompactTarget(displayName(entries[0]), "Trattenuto")
          : `${formatCompactTarget(displayName(entries[0]))} · collegato a questa istanza`
      : entries.length
        ? maximilianLinkedTarget
          ? "Più bersagli collegati alla mano: seleziona quello da risolvere."
          : "Più bersagli collegati a questa istanza: seleziona quello da risolvere."
        : maximilianLinkedTarget
          ? "Nessun bersaglio attualmente trattenuto dalla mano."
          : "Nessun bersaglio collegato a questa istanza."
    : "";
  if (selectedSaveTarget) {
    const targetItem = entries.find((item) => item?.id === selectedSaveTarget);
    const label = targetItem ? formatCompactTarget(displayName(targetItem)) : "";
    const extra = maximilianLinkedTarget ? " [TRATTENUTO]" : "";
    renderTargetLine(`${label}${extra}`, "", targetItem);
  } else {
    renderTargetLine("", TARGET_ON_THE_MAP);
  }
  $("saveTargetHint").textContent = singleSaveHintText;
  $("saveTargetHint").hidden = automaticRequiredTarget || !singleSaveHintText;
  const damageRequired = !!payload?.action?.damage;
  const damageReady = !damageRequired || String($("saveDamage")?.value || "").trim() !== "";
  const canResolve = sceneLifecycle.isReady() && !busy && !!selectedSaveTarget
    && !!saveAbility
    && (manualSave || !!saveOutcome) && damageReady;
  for (const button of document.querySelectorAll("[data-save-outcome]")) {
    markOutcome(button, button.dataset.saveOutcome, button.dataset.saveOutcome === saveOutcome);
    button.disabled = busy || !selectedSaveTarget;
  }
  $("apply").disabled = !canResolve;
  $("apply").textContent = manualSave ? (payload?.action?.buttonLabel || "Applica") : "Applica";
  const saveOutcomeRequiredNotice = "Seleziona l'esito del TS";
  renderSummary(
    !selectedSaveTarget ? "Manca il bersaglio."
      : !manualSave && !saveOutcome ? `${saveOutcomeRequiredNotice}.`
      : !damageReady ? "Manca il danno." : "",
    "Danni",
    damageRequired ? subjectDamage(damageDefenseSubjects()[0]) : null,
  );
  renderDamageDefenseChips();
  renderHeadingSubtitle();
  requestCompactPopoverResize();
}

async function renderStorm() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("storm-render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const select = $("attackTarget");
  const previous = selectedAttackTarget;
  const { entries, area, rootReady } = await stormTargetData();
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
    const option = new Option(targetOptionLabel(item, inside ? "vantaggio" : ""), item.id);
    option.dataset.inside = String(inside);
    select.appendChild(option);
  }
  selectedAttackTarget = multi
    ? (entries.some(({ item }) => item.id === previous) ? previous : "")
    : spellActiveResolutionSelectedTargetId(entries, currentPlayerSelection, previous);
  select.value = selectedAttackTarget;
  const selected = entries.find(({ item }) => item.id === selectedAttackTarget);
  if (selected?.item) {
    renderTargetLine(formatCompactTarget(displayName(selected.item)), "", selected.item);
  } else if (!multi) {
    renderTargetLine("", TARGET_ON_THE_MAP);
  } else {
    renderTargetLine("");
  }
  const stormAdvantageText = selected?.inside
    ? "Vantaggio al tiro per colpire: bersaglio nella sfera."
    : "";
  $("attackAdvantage").textContent = stormAdvantageText;
  $("attackAdvantage").hidden = !stormAdvantageText;
  const requiresZoneRoot = payload?.action?.requiresZoneRoot !== false;
  const baseReady = sceneLifecycle.isReady() && !busy
    && !!selectedAttackTarget
    && (!requiresZoneRoot || rootReady);
  const damageValue = String($("attackDamage")?.value || "").trim();
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    const outcome = button.dataset.attackOutcome;
    markOutcome(button, outcome, outcome === attackOutcome);
    button.hidden = !payload?.action?.attack?.outcomes?.includes(outcome);
    button.disabled = !baseReady;
  }
  if (isConsoleFlowAttack()) {
    const damageNeeded = spellActiveResolutionAttackDamageRequired(payload?.action, attackOutcome);
    if (attackField) attackField.hidden = !damageNeeded;
    $("footer").hidden = false;
    $("apply").disabled = !baseReady || !attackOutcome || (damageNeeded && !damageValue);
    renderSummary(
      !selectedAttackTarget ? "Manca il bersaglio."
        : !attackOutcome ? "Manca l'esito."
        : damageNeeded && !damageValue ? "Manca il danno." : "",
      "Danni",
      // No damage asked once the outcome is known: a miss, 0 as in the console.
      damageNeeded ? subjectDamage(damageDefenseSubjects()[0]) : payload?.action?.damage ? 0 : null,
    );
    // Here and not on the click: the field appears only now, after the scene's answers.
    if (attackDamageFocus && damageNeeded) $("attackDamage").focus?.();
    attackDamageFocus = false;
  } else if (multi) {
    const chosen = attackEntries.filter((entry) => entry.targetId);
    const done = chosen.filter(attackEntryComplete);
    renderSummary(!chosen.length ? "Manca almeno un attacco."
      : done.length < chosen.length ? "Manca l'esito o il danno di un attacco." : "",
      "Danni",
      done.reduce((sum, entry) => {
        const item = entries.find((candidate) => candidate.item.id === entry.targetId)?.item;
        return sum + (subjectDamage({ item, outcome: entry.attackOutcome, roll: attackEntryRoll(entry) }) ?? 0);
      }, 0));
  }
  // The boxes are drawn again with every answer of the scene: the field being written keeps the cursor.
  const writing = document.activeElement;
  const writingRow = writing?.tagName === "INPUT" && attackRows.contains(writing)
    ? [...attackRows.children].findIndex((row) => row.contains(writing))
    : -1;
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
      rowOutcomes.className = "outcomes segmented";
      for (const value of ["hit", "critical", "miss"].filter((outcome) => outcomeDefinitions.includes(outcome))) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = outcomeLabels[value] || value;
        markOutcome(button, value, entry.attackOutcome === value);
        button.disabled = busy || !entry.targetId || (requiresZoneRoot && !rootReady);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          attackEntries[index] = { ...attackEntries[index], attackOutcome: value };
          attackRowFocus = index;
          render();
        });
        rowOutcomes.appendChild(button);
      }
      const damageField = document.createElement("div");
      damageField.className = "field";
      damageField.hidden = !spellActiveResolutionAttackDamageRequired(payload?.action, entry.attackOutcome);
      const damageLabel = document.createElement("label");
      renderAmountLabel(damageLabel, payload?.action?.damage?.type, attackDiceText(entry.attackOutcome));
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
    attackRows.children[attackRowFocus >= 0 ? attackRowFocus : writingRow]?.querySelector("input")?.focus?.();
    attackRowFocus = -1;
  }
  // The zone gone is this renderer's own word. Any other message stays: an attack refused must be read.
  const zoneGone = requiresZoneRoot && !rootReady;
  $("status").textContent = zoneGone ? "La zona dell'incantesimo non è più disponibile." : statusMessage;
  $("status").hidden = !zoneGone && !statusMessage;
  if (zoneGone) $("status").dataset.kind = "warn";
  renderDamageDefenseChips();
  renderHeadingSubtitle();
  requestCompactPopoverResize();
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
  if (section) section.hidden = true;
  const singleSaveDamage = $("singleSaveDamageField");
  if (singleSaveDamage) singleSaveDamage.hidden = true;
  const preparedOutcomesNode = $("preparedSaveOutcomes");
  if (preparedOutcomesNode) {
    preparedOutcomesNode.hidden = !visible;
  }
  if (!visible) {
    selectedSaveTarget = "";
    return;
  }
  const target = targetItems.find((item) => item?.id === selectedAttackTarget);
  selectedSaveTarget = String(target?.id || "").trim();
  for (const button of document.querySelectorAll("[data-save-outcome]")) {
    markOutcome(button, button.dataset.saveOutcome, button.dataset.saveOutcome === saveOutcome);
    button.disabled = busy || !selectedSaveTarget;
  }
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
    renderSummary();
    renderHeadingSubtitle();
    return;
  }
  renderPreparedChoice(group);
  const targets = preparedTargetItems();
  const targetSelect = $("attackTarget");
  targetSelect.replaceChildren();
  if (targets.length === 1) {
    selectedAttackTarget = targets[0].id;
    targetSelect.hidden = true;
    targetSelect.disabled = true;
    renderTargetLine(formatCompactTarget(displayName(targets[0])), "", targets[0]);
  } else if (targets.length > 1) {
    targetSelect.hidden = false;
    targetSelect.disabled = busy;
    targetSelect.replaceChildren(new Option("Seleziona bersaglio…", ""));
    for (const t of targets) {
      targetSelect.appendChild(new Option(targetOptionLabel(t), t.id));
    }
    const matching = targets.find((t) => t.id === selectedAttackTarget);
    if (matching) {
      selectedAttackTarget = matching.id;
      targetSelect.value = matching.id;
      renderTargetLine(formatCompactTarget(displayName(matching)), "", matching);
    } else {
      selectedAttackTarget = "";
      targetSelect.value = "";
      renderTargetLine("", "Seleziona un bersaglio");
    }
  } else {
    selectedAttackTarget = "";
    targetSelect.hidden = true;
    targetSelect.disabled = true;
    renderTargetLine("", TARGET_ON_THE_MAP);
  }
  // The target's row already says what is missing: the message only stays while it speaks of something else.
  if (selectedAttackTarget && statusMessage === "Seleziona un bersaglio prima di continuare.") {
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
  renderSummary(
    !selectedAttackTarget ? "Manca il bersaglio."
      : !saveReady ? "Seleziona l'esito del TS."
      : !damageReady ? "Manca il danno." : "",
    "Danni",
    damageRequired && damageReady
      ? subjectDamage(damageDefenseSubjects()[0]) ?? Number(damageInput.value)
      : null,
  );
  // F1 of the purple popups' audit: the target's defense against the smite, in the fixed row as in every other popup.
  renderDamageDefenseChips();
  renderHeadingSubtitle();
  requestCompactPopoverResize();
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
  if (!isPrismaticWallTraversal()) {
    renderSummary(`${state.remainingLayers.length}/${PRISMATIC_WALL_LAYER_IDS.length} strati`);
    return;
  }
  if (!selectedPrismaticTarget) {
    renderSummary("Manca la creatura.");
    return;
  }
  if (state.exemptCreatureIds.includes(selectedPrismaticTarget)) {
    renderSummary("Creatura esente.");
    return;
  }
  const layersCount = (count) => `${count} ${count === 1 ? "strato" : "strati"}`;
  const missingOutcomes = state.remainingLayers.filter((layerId) => !prismaticLayerOutcomes.has(layerId)).length;
  const missingDamage = state.remainingLayers.filter((layerId) => {
    const outcome = prismaticLayerOutcomes.get(layerId);
    return outcome && outcome !== "immune" && prismaticWallLayerById(layerId)?.damage
      && !prismaticWallNumericDamageReady(prismaticLayerDamage.get(layerId));
  }).length;
  renderSummary(
    missingOutcomes ? `Manca l'esito di ${layersCount(missingOutcomes)}.`
      : missingDamage ? `Manca il danno di ${layersCount(missingDamage)}.` : "",
    "Danni",
    prismaticWallTraversalDamage(state),
  );
}

// What the whole wall does to the creature, by the plan and the defenses the resolution applies.
function prismaticWallTraversalDamage(state) {
  const item = sceneItems.find((entry) => entry?.id === selectedPrismaticTarget);
  const plan = prismaticWallTraversalPlan({
    targetId: selectedPrismaticTarget,
    remainingLayers: state.remainingLayers,
    outcomes: Object.fromEntries(prismaticLayerOutcomes),
    damageTotals: Object.fromEntries(prismaticLayerDamage),
    parentEffectId: payload?.instanceId,
    sourceId: payload?.casterId,
  });
  const defenses = magicalDamageDefensesForItem(item, META_KEY);
  const ignored = [...(ignoredDefenses.get(selectedPrismaticTarget) || [])];
  return plan.damageContributions.reduce(
    (sum, part) => sum + (Number(spellDamagePartAfterDefense(part, defenses, ignored)?.amount) || 0),
    0,
  );
}

function renderPrismaticWall() {
  const state = prismaticWallLiveState();
  const traversal = isPrismaticWallTraversal();
  const targetSelect = $("prismaticWallTarget");
  const layerWrap = $("prismaticWallLayers");
  const detail = $("prismaticWallLayerDetail");
  const candidates = characters().filter((item) => item?.id !== payload?.casterId);
  if (traversal) {
    const initialTarget = String(initialPrismaticTarget || "").trim();
    if (!selectedPrismaticTarget
      && initialTarget
      && candidates.some((item) => item?.id === initialTarget)) {
      selectedPrismaticTarget = initialTarget;
      initialPrismaticTarget = "";
    } else {
      const previous = selectedPrismaticTarget;
      selectedPrismaticTarget = spellActiveResolutionSelectedTargetId(
        candidates,
        currentPlayerSelection,
        previous,
      );
    }
    targetSelect.hidden = false;
    targetSelect.replaceChildren(new Option("Seleziona la creatura", ""));
    for (const item of candidates) {
      targetSelect.appendChild(new Option(targetOptionLabel(item), item.id));
    }
    targetSelect.value = selectedPrismaticTarget;
    targetSelect.disabled = busy || !sceneLifecycle.isReady();
    const exempt = state.exemptCreatureIds.includes(selectedPrismaticTarget);
    // The menu asks for the creature, the fixed row says it is missing: nothing moves when it is chosen.
    $("prismaticWallHint").textContent = exempt
      ? "Creatura designata al lancio: ignora prossimità e strati del muro."
      : "";
    detail.hidden = true;
    layerWrap.replaceChildren();
    // One row per layer, as the creatures of an area: its name and its damage, its outcome, its number.
    for (const layerId of exempt ? [] : state.remainingLayers) {
      const layer = prismaticWallLayerById(layerId);
      if (!layer) continue;
      const row = document.createElement("div");
      row.className = "prismatic-wall-layer";
      const name = document.createElement("div");
      name.className = "prismatic-wall-layer__name";
      const title = document.createElement("strong");
      title.textContent = layer.label;
      name.append(title);
      const outcomeWrap = document.createElement("div");
      outcomeWrap.className = "segmented mini";
      const outcomeLabels = { passed: "Superato", failed: "Fallito", immune: "Immune" };
      for (const outcome of SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = outcomeLabels[outcome];
        markOutcome(button, outcome, prismaticLayerOutcomes.get(layerId) === outcome);
        button.disabled = busy || !sceneLifecycle.isReady() || !selectedPrismaticTarget;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (busy || !selectedPrismaticTarget) return;
          prismaticLayerOutcomes.set(layerId, outcome);
          render();
        });
        outcomeWrap.appendChild(button);
      }
      row.append(name, outcomeWrap);
      if (layer.damage) {
        const damageLabel = document.createElement("label");
        damageLabel.className = "prismatic-wall-layer__meta";
        renderAmountLabel(damageLabel, layer.damage.type, layer.damage.dice);
        name.append(damageLabel);
        const damageInput = document.createElement("input");
        damageInput.setAttribute("aria-label", `Danno dello strato ${layer.label}`);
        damageInput.type = "number";
        damageInput.min = "0";
        damageInput.step = "1";
        damageInput.inputMode = "numeric";
        damageInput.placeholder = "Totale";
        damageInput.value = prismaticLayerDamage.get(layerId) ?? "";
        damageInput.disabled = busy || !selectedPrismaticTarget || prismaticLayerOutcomes.get(layerId) === "immune";
        const defenseBox = document.createElement("div");
        defenseBox.className = "damage-defenses";
        const refreshDefenseChips = () => {
          const chips = prismaticLayerDefenseChips(layer, layerId);
          defenseBox.replaceChildren(...chips);
          defenseBox.hidden = chips.length === 0;
        };
        refreshDefenseChips();
        damageInput.addEventListener("input", (event) => {
          prismaticLayerDamage.set(layerId, event.target.value);
          updatePrismaticWallApplyState(state);
          refreshDefenseChips();
        });
        row.append(damageInput, defenseBox);
      } else {
        const effect = document.createElement("div");
        effect.className = "prismatic-wall-layer__detail";
        effect.textContent = layerId === "indigo"
          ? "Fallito: Trattenuto · TS Cos alla fine del turno · 3S/3F"
          : "Fallito: Accecato · TS Sag all'inizio del prossimo turno del caster";
        row.appendChild(effect);
      }
      layerWrap.appendChild(row);
    }
  } else {
    selectedPrismaticTarget = "";
    targetSelect.hidden = true;
    targetSelect.replaceChildren(new Option("", ""));
    $("prismaticWallHint").textContent = state.remainingLayers.length
      ? "Gli strati si distruggono in ordine, dal Rosso al Viola."
      : "Tutti gli strati sono distrutti: il muro resta fino alla sua durata o finché non lo rimuovi.";
    layerWrap.replaceChildren();
    prismaticWallLayerId = prismaticWallFirstRemainingLayer(state.remainingLayers);
    if (prismaticWallLayerId) {
      const layer = prismaticWallLayerById(prismaticWallLayerId);
      const row = document.createElement("div");
      row.className = "prismatic-wall-layer";
      const name = document.createElement("div");
      name.className = "prismatic-wall-layer__name";
      const title = document.createElement("strong");
      title.textContent = "Esposto: " + layer.label;
      name.append(title);
      row.appendChild(name);
      for (const said of [layer.destructionRequirement, layer.passive]) {
        if (!said) continue;
        const line = document.createElement("div");
        line.className = "prismatic-wall-layer__detail";
        line.textContent = said;
        row.appendChild(line);
      }
      layerWrap.appendChild(row);
      detail.hidden = true;
    } else {
      detail.hidden = true;
    }
  }
  updatePrismaticWallApplyState(state);
}

function telekinesisTargetCandidates() {
  const currentTargetId = telekinesisCurrentTargetId();
  const operation = String(payload?.action?.telekinesisOperation || "").trim();
  return characters().filter((item) => {
    const id = String(item?.id || "").trim();
    if (!id || id === String(payload?.casterId || "").trim()) return false;
    return operation === "maintain" ? id === currentTargetId : id !== currentTargetId;
  });
}

function renderTelekinesis() {
  const currentTargetId = telekinesisCurrentTargetId();
  const operation = String(payload?.action?.telekinesisOperation || "").trim();
  const entries = telekinesisTargetCandidates();
  const select = $("telekinesisTarget");
  select.replaceChildren(new Option(
    operation === "maintain" ? "Bersaglio collegato" : "Seleziona una nuova creatura",
    "",
  ));
  for (const item of entries) {
    select.appendChild(new Option(targetOptionLabel(item), item.id));
  }
  const resolved = operation === "maintain"
    ? entries.some((item) => item.id === currentTargetId) ? currentTargetId : ""
    : spellActiveResolutionSelectedTargetId(
      entries,
      currentPlayerSelection,
      selectedTelekinesisTarget,
    );
  selectedTelekinesisTarget = resolved;
  select.value = selectedTelekinesisTarget;
  select.disabled = busy || !sceneLifecycle.isReady();
  const selectedItem = entries.find((item) => item.id === selectedTelekinesisTarget);
  if (selectedItem) {
    renderTargetLine(formatCompactTarget(displayName(selectedItem)), "", selectedItem);
  } else {
    renderTargetLine("", TARGET_ON_THE_MAP);
  }
  $("telekinesisHint").textContent = operation === "maintain"
    ? currentTargetId && entries.length
      ? "Il bersaglio corrente resta collegato a questa istanza."
      : "Il bersaglio corrente non è più disponibile nella scena."
    : currentTargetId
      ? "Il nuovo bersaglio deve essere una creatura diversa da quella corrente e restare entro 18 m dal caster."
      : "Scegli una creatura entro 18 m dal caster.";
  for (const button of document.querySelectorAll("[data-telekinesis-outcome]")) {
    markOutcome(button, button.dataset.telekinesisOutcome, button.dataset.telekinesisOutcome === telekinesisOutcome);
    button.disabled = busy || !selectedTelekinesisTarget || !sceneLifecycle.isReady();
  }
  $("apply").disabled = busy
    || !sceneLifecycle.isReady()
    || !selectedTelekinesisTarget
    || !TELEKINESIS_OUTCOMES.includes(telekinesisOutcome);
  $("apply").textContent = operation === "maintain"
    ? "Conferma contesa"
    : "Conferma nuovo bersaglio";
  $("app").dataset.mode = "telekinesis";
  renderSummary(!selectedTelekinesisTarget ? "Manca il bersaglio."
    : !TELEKINESIS_OUTCOMES.includes(telekinesisOutcome) ? "Manca l'esito della contesa." : "");
}

// What the action is, in one line above its damage, as the consoles' #pc-attack-facts: the cost is in the header, and the
// dice in the damage row when there is one.
function renderActiveMicropills() {
  const containers = document.querySelectorAll("[data-facts]");
  if (!containers.length) return;
  const pills = [];
  const prepared = isPreparedResolution();
  const telekinesis = isTelekinesisContest();
  const saveWithDC = (ability) => {
    const dc = actionSaveDC();
    return `${ability ? `TS ${saveAbilityLabel(ability) || ability}` : "TS"}${dc ? ` CD ${dc}` : ""}`;
  };

  if (prepared) {
    const plan = preparedPhasePlan();
    const prepSave = plan?.resolution?.mechanics?.savingThrow;
    if (prepSave) {
      pills.push(saveWithDC(String(prepSave.ability || "").trim()));
      if (prepSave.failureCondition) {
        pills.push(`${String(prepSave.failureCondition).trim()} se fallisce`);
      }
    }
  } else {
    // 2. Attacco / TS
    const saveArea = payload?.action?.resolutionKind === "save-area" || childZone()?.resolution === "save";
    const singleSave = isSingleSave();
    // checkLabel: an action resolved at the table without a save (Mano arcana's grapple or contest) names its
    // check instead, or nothing when empty.
    const checkLabel = payload?.action?.checkLabel;
    if (singleSave && typeof checkLabel === "string") {
      if (checkLabel.trim()) pills.push(checkLabel.trim());
    } else if (saveArea || singleSave) {
      const save = saveWithDC(payload?.action?.save?.ability || childZone()?.save?.ability || saveAbility);
      pills.push(payload?.action?.directHit ? `Esplosione: ${save}` : save);
    } else if (payload?.action?.attack || isMultiAttack()) {
      pills.push("Attacco");
    } else if (isPrismaticWallTraversal()) {
      pills.push(`${saveWithDC("dex")} per ogni strato`, "metà se supera");
    }

    // 3. Range
    if (payload?.action?.range) {
      const reach = `${String(payload.action.range.value).replace(".", ",")} ${payload.action.range.unit}`;
      pills.push(payload.action.rangeOrigin === "root" ? `${reach} ${payload.action.rangeOriginLabel || "dalla zona"}` : `gittata ${reach}`);
    } else {
      const fixedRadius = fixedCasterRadiusConfig();
      if (fixedRadius?.value) {
        pills.push(`raggio ${String(fixedRadius.value).replace(".", ",")} m`);
      }
    }

    // 4. Formula e tipo di danno atomico, solo dove la riga del danno non c'è ancora: un'area senza creature, una sottozona.
    const damageRowInView = !childZone() && (!saveArea || currentTargetItems().length > 0);
    if (!damageRowInView) {
      const formula = spellActiveResolutionDamageFormula({
        action: payload?.action,
        slotLevel: payload?.slotLevel,
        outcome: manualSaveAtTable() ? payload?.action?.assumedOutcome || "failed" : saveOutcome,
      })?.scaledFormula || "";
      const dType = payload?.action?.damage?.type;
      const said = [formula, typeof dType === "string" ? dType : ""].filter(Boolean).join(" ");
      if (said) pills.push(said);
    }

    // 5. Conseguenza del save
    // An attack's damage carries the default onSave "none": without a save there is no save pill. Nor with a check in its
    // place (checkLabel): the damage of Witch Bolt's repeat or of Arcane Hand's crush has no save to pass.
    const savePills = (saveArea || singleSave) && typeof checkLabel !== "string";
    if (savePills && (payload?.action?.save?.halfOnSuccess || payload?.action?.damage?.onSave === "half")) {
      pills.push("metà se supera");
    } else if (savePills && payload?.action?.damage && (payload.action.damage.onSave === "none" || payload?.action?.save?.noDamageOnSuccess)) {
      pills.push("nessun danno se supera");
    }

    // 6. Condizione
    if (payload?.action?.condition) {
      const cond = payload.action.condition;
      const label = typeof cond === "object" ? cond?.label || cond?.name || "" : String(cond);
      if (label) pills.push(label);
    } else if (Array.isArray(payload?.action?.conditions)) {
      for (const c of payload.action.conditions) {
        const label = typeof c === "object" ? c?.label || c?.name || "" : String(c || "");
        if (label) pills.push(label);
      }
    }

    // 7. Boundary sintetici
    if (manualSaveAtTable() && checkLabel !== "") {
      pills.push("esito al tavolo");
    }
    if (telekinesis) {
      pills.push("Contesa For vs For");
    }
  }

  const facts = pills.join(" · ");
  for (const container of containers) container.textContent = facts;
}

// The target's row: its label, the creature and its hit points, or what is missing. A menu of targets takes its place.
function renderTargetLine(targetName = "", emptyText = "", item = null) {
  const line = $("targetLine");
  if (!line) return;
  const cleanName = String(targetName || "").trim();
  const shown = cleanName || String(emptyText || "").trim();
  $("targetLineName").textContent = shown;
  $("targetLineHp").textContent = cleanName ? targetHpText(item) : "";
  line.dataset.empty = cleanName ? "false" : "true";
  line.hidden = !shown;
}

function targetDefenseRows(item, types = popupDamageTypes()) {
  return spellDamageDefenseRows({
    types,
    defenses: magicalDamageDefensesForItem(item, META_KEY),
    ignoredTypes: [...(ignoredDefenses.get(item?.id) || [])],
  });
}

// Who takes this action's damage, with what the popup knows so far: an outcome and a number may still be missing.
function damageDefenseSubjects() {
  const kind = payload?.action?.resolutionKind;
  const byId = (id, outcome, roll) => {
    const item = sceneItems.find((entry) => entry?.id === id);
    return item ? [{ item, outcome, roll }] : [];
  };
  // A smite hits its one target: its damage, when it has some to write.
  if (isPreparedResolution()) {
    return preparedPhasePlan()?.resolution?.mechanics?.damageBonus ? byId(selectedAttackTarget, "hit", $("attackDamage").value) : [];
  }
  if (kind === "save-area") {
    if (childZone()) return [];
    const hit = directHitSubject();
    return [
      ...(hit ? [hit] : []),
      ...currentTargetItems().map((item) => ({ item, outcome: outcomes.get(item.id), roll: $("damage").value })),
    ];
  }
  if (kind === "single-save") return byId(selectedSaveTarget, saveOutcome, $("saveDamage").value);
  if (kind !== "single-attack") return [];
  // Before the outcome a defense is said as for a hit, so that it is seen before the number is written. A miss deals nothing.
  if (!isMultiAttack()) {
    return attackOutcome === "miss" ? [] : byId(selectedAttackTarget, attackOutcome || "hit", $("attackDamage").value);
  }
  const seen = new Set();
  return attackEntries.filter((entry) => entry.targetId && entry.attackOutcome !== "miss"
    && !seen.has(entry.targetId) && seen.add(entry.targetId))
    .flatMap((entry) => byId(entry.targetId, entry.attackOutcome || "hit", entry.damageRoll));
}

// A defense's chip: it says the sum, its tooltip whose defense it is, and a click ignores it in this action.
function damageDefenseChip({ item, row, numbers, label }) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `defense-chip damage-defense is-${row.defense}`;
  chip.textContent = label;
  chip.title = spellDamageDefenseTitle(row, { name: displayName(item), ...numbers, where: "in questa azione" });
  chip.dataset.defenseType = row.type;
  chip.dataset.targetId = item.id;
  if (row.ignored) chip.dataset.ignored = "true";
  chip.disabled = busy;
  chip.setAttribute("aria-pressed", String(!row.ignored));
  chip.addEventListener("click", () => {
    const ignored = new Set(ignoredDefenses.get(item.id) || []);
    if (ignored.has(row.type)) ignored.delete(row.type);
    else ignored.add(row.type);
    ignoredDefenses.set(item.id, ignored);
    render();
  });
  return chip;
}

// In the fixed row, under the total: each defense at work, what it does to the number, whose it is in the tooltip. A click
// ignores it.
function renderDamageDefenseChips() {
  const box = $("damageDefenses");
  if (!box) return;
  const subjects = popupDamageTypes().length ? damageDefenseSubjects() : [];
  const chips = subjects.flatMap(({ item, outcome, roll, direct = false }) => {
    const rows = targetDefenseRows(item, direct ? directHitTypes() : undefined);
    const written = String(roll ?? "").trim() !== "" && Number.isFinite(Number(roll));
    const resolve = (defense) => (outcome && written ? resolvedDamage(outcome, roll, defense, direct, item) : null);
    return rows.map((row) => {
      const before = resolve(null);
      const after = resolve(row.ignored ? null : row.defense);
      const numbers = before?.valid && after?.valid ? { before: before.amount, after: after.amount } : { before: 0, after: 0 };
      const said = spellDamageDefenseText(row, numbers);
      return damageDefenseChip({ item, row, numbers, label: subjects.length > 1 ? `${displayName(item)} · ${said}` : said });
    });
  });
  box.replaceChildren(...chips);
  box.hidden = chips.length === 0;
}

// A layer of Prismatic Wall has its own type and its own save: the chip sits in its row, beside its number.
function prismaticLayerDefenseChips(layer, layerId) {
  const item = sceneItems.find((entry) => entry?.id === selectedPrismaticTarget);
  const outcome = prismaticLayerOutcomes.get(layerId);
  if (!item || !layer?.damage || outcome === "immune") return [];
  const factor = outcome === "passed" ? 0.5 : 1;
  const written = String(prismaticLayerDamage.get(layerId) ?? "").trim();
  const roll = written !== "" && Number.isFinite(Number(written)) ? Math.max(0, Math.floor(Number(written))) : 0;
  return spellDamageDefenseRows({
    types: spellActionDamageTypes(layer),
    defenses: magicalDamageDefensesForItem(item, META_KEY),
    ignoredTypes: [...(ignoredDefenses.get(item.id) || [])],
  }).map((row) => {
    const before = Math.floor(roll * factor);
    const numbers = { before, after: row.ignored ? before : spellDamageAfterDefense(roll, factor === 1 ? "full" : "half", row.defense) };
    return damageDefenseChip({ item, row, numbers, label: spellDamageDefenseText(row, numbers) });
  });
}

function render() {
  if (!payload) return;
  if ($("apply")) $("apply").hidden = false;
  renderBackToChoice();
  renderContext();
  $("apply").classList.toggle("primary", !applyRegistersDamage());
  const prepared = isPreparedResolution();
  const child = childZone();
  const blinkReturn = pointTeleport();
  const telekinesis = isTelekinesisContest();
  const save = payload.action.resolutionKind === "save-area" || !!child;
  const singleSave = isSingleSave();
  const singleHeal = isSingleHeal();
  const prismaticWall = isPrismaticWallAction();
  $("title").textContent = String(payload.spellName || payload.spellId || "Incantesimo").trim();
  renderEconomy();
  renderActiveMicropills();
  // Before the first answer of the renderers that wait for the scene: from then on they keep it.
  if ($("subtitle").hidden) renderHeadingSubtitle();
  const requiresSave = payload.action.resolutionKind === "save-area" || child?.resolution === "save";
  const multiAttack = !save && !singleSave && !singleHeal && isMultiAttack();
  const sceneReady = sceneLifecycle.isReady();
  $("saveSection").hidden = prepared || !save;
  $("singleSaveSection").hidden = prepared || !singleSave;
  $("singleHealSection").hidden = prepared || !singleHeal;
  $("attackSection").hidden = prepared ? false : save || singleSave || singleHeal;
  $("telekinesisSection").hidden = !telekinesis;
  $("prismaticWallSection").hidden = !prismaticWall;
  $("blinkReturnSection").hidden = !blinkReturn;
  $("structureSection").hidden = !isStructureSegment();
  $("footer").hidden = false;
  if (isStructureSegment()) {
    $("saveSection").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    renderStructureSegment();
    if (statusMessage) $("status").textContent = statusMessage;
    renderHeadingSubtitle();
    requestCompactPopoverResize();
    return;
  }
  if (telekinesis) {
    $("saveSection").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    $("prismaticWallSection").hidden = true;
    $("blinkReturnSection").hidden = true;
    $("footer").hidden = false;
    $("apply").hidden = false;
    renderTelekinesis();
    if (statusMessage) $("status").textContent = statusMessage;
    renderHeadingSubtitle();
    requestCompactPopoverResize();
    return;
  }
  if (prismaticWall) {
    $("saveSection").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    $("footer").hidden = false;
    $("title").textContent = payload.spellName || "Muro Prismatico";
    $("apply").textContent = isPrismaticWallTraversal()
      ? "Risolvi attraversamento"
      : "Segna strato distrutto";
    renderPrismaticWall();
    if (statusMessage) $("status").textContent = statusMessage;
    renderHeadingSubtitle();
    requestCompactPopoverResize();
    return;
  }
  if (blinkReturn) {
    const teleport = isTeleportAction();
    // Arcane Gate: the creature that crosses is the one selected on the map.
    const subjectMissing = teleportsSelectedCreature() && !teleportSubjectIds().length;
    $("saveSection").hidden = true;
    $("singleSaveSection").hidden = true;
    $("singleHealSection").hidden = true;
    $("attackSection").hidden = true;
    $("prismaticWallSection").hidden = true;
    $("footer").hidden = false;
    $("title").textContent = payload.spellName || (teleport ? "Teletrasporto" : "Intermittenza");
    $("blinkReturnTitle").textContent = teleport
      ? String(payload.action?.label || "Teletrasporto").trim()
      : "Piano Etereo · ritorno";
    $("apply").hidden = true;
    $("apply").textContent = teleport ? "Teletrasportati" : "Ritorna";
    renderSummary();
    $("blinkReturnHint").hidden = !teleport;
    $("blinkReturnHint").textContent = teleport
      ? subjectMissing
        ? "Seleziona sulla mappa la creatura che attraversa, poi scegli l'uscita."
        : String(payload.action?.detail || "").trim()
      : "";
    $("blinkPlace").disabled = !sceneReady || busy || subjectMissing;
    $("blinkPlace").textContent = "Scegli destinazione";
    $("blinkPlacementStatus").textContent = "";
    $("apply").disabled = true;
    if (statusMessage) $("status").textContent = statusMessage;
    renderHeadingSubtitle();
    requestCompactPopoverResize();
    return;
  }
  const placementPending = !!pendingPlacementRequestId;
  const confirmPlacementButton = $("confirmPlacement");
  const cancelPlacementButton = $("cancelPlacement");
  const autoAnchoredArea = isPrimaryTargetAnchoredArea()
    && payload?.action?.anchorTargetFromSelection === true;
  $("place").hidden = placementPending;
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
    const hitMissing = child ? "" : directHitMissing();
    $("apply").disabled = !sceneReady || busy
      || !!hitMissing
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
    renderSave();
    const missingOutcomes = requiresSave
      ? currentTargetItems().filter((item) => !SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.includes(outcomes.get(item.id))).length
      : 0;
    const areaMissing = child
      ? selectedCount !== requiredCount ? "Manca la posizione."
        : missingOutcomes ? `Manca l'esito di ${missingOutcomes} ${missingOutcomes === 1 ? "creatura" : "creature"}.`
        : !depthValid ? `La profondità va da ${child.depth.min} a ${child.depth.max}.` : ""
      : !placement ? "Manca l'area."
      : !placement.targetIds?.length && payload?.action?.allowEmptyTargets !== true ? "Nessuna creatura nell'area."
      : missingOutcomes ? `Manca l'esito di ${missingOutcomes} ${missingOutcomes === 1 ? "creatura" : "creature"}.`
      : damageInputMissing && areaDamageRequired ? "Manca il danno." : "";
    if (directHitAction() && !child) {
      // Lightning Arrow: what its target takes, then the burst's roll when it hits someone.
      const burstRoll = areaTargets.length && !damageInputMissing ? Number($("damage").value) : null;
      renderSummary(hitMissing || areaMissing, "Colpo", subjectDamage(directHitSubject()),
        Number.isFinite(burstRoll) ? [["Esplosione", burstRoll]] : []);
    } else {
      renderSummary(areaMissing, "Danni",
        !child && payload?.action?.damage && !damageInputMissing ? Number($("damage").value) : null);
    }
    renderHeadingSubtitle();
  } else if (singleSave) {
    void renderSingleSave();
  } else if (singleHeal) {
    void renderSingleHeal();
  } else {
    const completeAttacks = attackEntries.filter(attackEntryComplete);
    if (multiAttack) {
      $("apply").disabled = !sceneReady || busy || !completeAttacks.length
        || completeAttacks.length < attackEntries.filter((entry) => entry.targetId).length;
      $("apply").textContent = "Applica attacchi";
    } else {
      // The button says what it does: Lancia una stella, Raggio radioso. Its dice are in the row above, not here.
      $("apply").textContent = String(payload?.action?.buttonLabel || "Applica").split(" · ")[0];
    }
    void renderStorm();
  }
  let sharedControls = $("sharedHpControls");
  if (!sharedControls) { sharedControls = document.createElement("div"); sharedControls.id = "sharedHpControls";
    $("summary").parentElement.appendChild(sharedControls); }
  sharedControls.hidden = true;
  if (save && !child && payload.action.damage) {
    const entries = currentTargetItems().filter(item => outcomes.has(item.id)).map(item => {
      const damage = resolveSpellActiveResolutionDamage({ action: payload.action, slotLevel: payload.slotLevel,
        outcome: outcomes.get(item.id), roll: Number($("damage").value),
        defense: spellDamageDefenseApplied(targetDefenseRows(item)), evasion: evasionForItem(item, META_KEY) });
      return { item, change: damage.valid ? calculateQuickHPChange({ mode: "damage", value: damage.amount,
        hp: item.metadata?.[META_KEY]?.hp, hpMax: item.metadata?.[META_KEY]?.hpMax,
        tempHp: item.metadata?.[META_KEY]?.tempHp }) : null };
    });
    const preview = buildSharedHpPreview(sceneItems, entries, sharedHpSelection);
    renderSharedHpControls(sharedControls, preview, sharedHpSelection,
      next => { sharedHpSelection = next; render(); }, { disabled: busy });
    if (preview.conflicts.length) $("apply").disabled = true;
  }
  if (statusMessage) $("status").textContent = statusMessage;
  renderDamageDefenseChips();
  requestCompactPopoverResize();
}

async function placeBlinkReturn() {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("blink-placement") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const requestId = createSpellAreaPlacementRequestId();
  pendingPlacementRequestId = requestId;
  busy = true;
  placement = null;
  render();
  try {
    const request = requestSpellAreaPlacement({
      // A teleport's own rule keeps the click within its range (Far Step: 18 m from the caster).
      ruleId: isTeleportAction() ? String(payload.action.placementRuleId || "").trim() : "blink:return",
      casterId: payload.casterId,
      context: {
        pointSelection: true,
        autoConfirmPoint: true,
        directPointSelection: true,
        snapToItemCenter: true,
      },
      requestId,
    }, {
      broadcast: OBR.broadcast,
      windowRef: window,
    });
    pendingPlacementPromise = request;
    const result = await request;
    if (!sceneLifecycle.isCurrent(operation)
      || pendingPlacementRequestId !== requestId) return;
    if (result?.status !== "confirmed" || !result.preview) {
      setStatus(result?.status === "cancelled"
        ? "Scelta dello spazio annullata."
        : isTeleportAction()
          ? "Destinazione non confermata."
          : "Spazio di ritorno non confermato.", false, "warn");
      return;
    }
    const position = point(result.preview.position || result.preview.start);
    if (!position) throw new Error("blink-return-position-required");
    placement = {
      ...result.preview,
      position,
      targetIds: [],
    };
    pendingPlacementRequestId = "";
    pendingPlacementPromise = null;
    busy = false;
    render();
    await apply();
  } catch (error) {
    if (pendingPlacementRequestId === requestId) {
      setStatus(`Scelta dello spazio non riuscita: ${error?.message || error}`, false, "error");
    }
  } finally {
    if (pendingPlacementRequestId === requestId) {
      pendingPlacementRequestId = "";
      pendingPlacementPromise = null;
      if (committingPlacementRequestId !== requestId) busy = false;
      render();
    }
  }
}

async function placeArea(anchorTargetOverride = "") {
  if (pointTeleport()) {
    await placeBlinkReturn();
    return;
  }
  if (isStructureSegment()) {
    await pickStructureSegment();
    return;
  }
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
      : "Seleziona il bersaglio dell'attacco sulla mappa.", false, "warn");
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
          setStatus("Esplosione ancorata. Seleziona gli esiti dei TS nell'area.", false, "ok");
          render();
        }
        : undefined,
    });
    pendingPlacementPromise = request;
    const result = await request;
    if (!sceneLifecycle.isCurrent(operation)
      || pendingPlacementRequestId !== requestId) return;
    if (result?.status !== "confirmed" || !result.preview) {
      setStatus(result?.status === "cancelled" ? "Posizionamento annullato." : "Posizionamento non confermato.", false, "warn");
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
    // The step's own line says what has been drawn and whom it hits (renderSave); an anchored area has no such line.
    if (anchoredArea) setStatus("Esplosione ancorata. Seleziona gli esiti dei TS nell'area.", false, "ok");
    else setStatus("");
  } catch (error) {
    if (pendingPlacementRequestId === requestId) {
      setStatus(`Posizionamento non riuscito: ${error?.message || error}`, false, "error");
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
    setStatus("Conferma della sagoma non riuscita: " + (error?.message || error), false, "error");
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
    setStatus("Annullamento della sagoma non riuscito: " + (error?.message || error), false, "error");
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
    setStatus("Seleziona un bersaglio prima di continuare.", false, "warn");
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
          ignoredDefenses: Object.fromEntries([...ignoredDefenses].map(([targetId, types]) => [targetId, [...types]])),
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
      : `Risoluzione non riuscita: ${code}`, false, "error");
    await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED, code);
  } finally {
    busy = false;
    if (sceneLifecycle.isReady()) render();
  }
}

// A refusal the GM can act on, in words. Any other keeps its code, for whoever has to look into it.
function resolutionErrorText(error) {
  const message = String(error?.message || error);
  if (message.includes("child-placement-outside-parent")) {
    return childZone()?.childKind === "fissure"
      ? "La fessura deve andare da un bordo all'altro della zona: riposizionala."
      : "Il vortice deve stare dentro la zona: riposizionalo.";
  }
  if (message.includes("target-out-of-range")) return "Il bersaglio è fuori gittata: spostalo o scegline un altro.";
  return `Risoluzione non riuscita: ${message}`;
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
      sharedHp: sharedHpSelection,
      payload,
      placement,
      targetIds: isTelekinesisContest()
        ? [selectedTelekinesisTarget]
        : isBlinkReturn()
        ? [payload.casterId]
        : isTeleportAction()
        ? teleportSubjectIds()
        : isStructureSegment()
        ? []
        : isPrismaticWallAction()
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
        : isTelekinesisContest()
        ? { [selectedTelekinesisTarget]: telekinesisOutcome }
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
      ...(isStructureSegment()
        ? { segmentIndex: structureSegmentIndex, damageType: $("structureType").value }
        : {}),
      damageRoll: pointTeleport()
        ? 0
        : isStructureSegment()
        ? (structureOperation() === "collapse" ? 0 : $("structureDamage").value)
        : isTelekinesisContest()
        ? 0
        : isPrismaticWallAction()
        ? 0
        : payload.action.resolutionKind === "child-zone"
        ? 0
        : payload.action.resolutionKind === "single-attack"
        ? (isConsoleFlowAttack() && !spellActiveResolutionAttackDamageRequired(payload.action, attackOutcome)
          ? 0
          : $("attackDamage").value)
        : payload.action.resolutionKind === "single-heal"
          ? $("healAmount").value
        : payload.action.resolutionKind === "single-save"
          ? payload.action.damage ? $("saveDamage").value : 0
          : $("damage").value,
      attackOutcome,
      saveAbility,
      shorteningFrom: zoneShorteningFrom,
      attacks: isMultiAttack()
        ? attackEntries.filter((entry) => entry.targetId).map((entry) => ({
          targetId: entry.targetId,
          attackOutcome: entry.attackOutcome,
          damageRoll: attackEntryRoll(entry),
        }))
        : [],
      directHit: directHitAction()
        ? { targetId: currentAnchoredTargetId(), attackOutcome: directHitOutcome, damageRoll: directHitRoll() }
        : null,
      ignoredDefenses: Object.fromEntries([...ignoredDefenses].map(([targetId, types]) => [targetId, [...types]])),
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
      executionResult?.manualNotice || "",
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
    setStatus(resolutionErrorText(error), false, "error");
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
  initialPrismaticTarget = String(payload.initialTargetId || "").trim();
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
  $("blinkPlace")?.addEventListener("click", () => void placeArea());
  // CAP-STRUCTURE: the click on the panel, then its damage and type.
  $("structurePick")?.addEventListener("click", () => void placeArea());
  $("structureDamage")?.addEventListener("input", () => render());
  $("structureType")?.addEventListener("change", () => render());
  $("apply").addEventListener("click", () => void apply());
  $("backToChoice")?.addEventListener("click", () => {
    if (busy) return;
    void OBR.broadcast.sendMessage(SPELL_TURN_PROMPT_ACTION_CHANNEL, {
      type: "back-to-choice",
      instanceId: payload?.instanceId,
      actionId: payload?.actionId,
    }, { destination: "LOCAL" }).catch(() => {});
  });
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
    saveAbility = String(payload?.action?.save?.ability || "").trim().toLowerCase();
    render();
  });
  $("saveAbility").addEventListener("change", (event) => {
    saveAbility = String(event.target.value || "").trim().toLowerCase();
    render();
  });
  $("prismaticWallTarget").addEventListener("change", (event) => {
    selectedPrismaticTarget = String(event.target.value || "").trim();
    prismaticLayerOutcomes = new Map();
    prismaticLayerDamage = new Map();
    render();
  });
  $("telekinesisTarget").addEventListener("change", (event) => {
    selectedTelekinesisTarget = String(event.target.value || "").trim();
    render();
  });
  $("attackTarget").addEventListener("change", (event) => {
    selectedAttackTarget = event.target.value;
    clearRefusal();
    render();
  });
  // Enter in a damage records the attack, as in the console. A prepared spell has its own button.
  $("attackSection").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.target?.tagName !== "INPUT") return;
    if (isPreparedResolution() || payload?.action?.resolutionKind !== "single-attack") return;
    event.preventDefault();
    if (!$("apply").disabled) void apply();
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
  for (const button of document.querySelectorAll("[data-telekinesis-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy || !selectedTelekinesisTarget) return;
      telekinesisOutcome = button.dataset.telekinesisOutcome;
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-direct-hit-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy) return;
      directHitOutcome = button.dataset.directHitOutcome;
      directHitFocus = true;
      clearRefusal();
      render();
    });
  }
  $("directHitDamage")?.addEventListener("input", () => {
    clearRefusal();
    render();
  });
  for (const button of document.querySelectorAll("[data-attack-outcome]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      attackOutcome = button.dataset.attackOutcome;
      attackDamageFocus = true;
      clearRefusal();
      render();
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
        || isTelekinesisContest()
        || teleportsSelectedCreature()
        || (payload?.action?.resolutionKind === "single-attack" && !isMultiAttack())) {
        render();
      }
      autoPlaceAnchoredAreaFromSelection();
    });
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
        selectedTelekinesisTarget = "";
        telekinesisOutcome = "";
        busy = false;
        setStatus("Scena cambiata: riapri la risoluzione dal pannello Incantesimi.", true);
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
        selectedTelekinesisTarget = "";
        telekinesisOutcome = "";
        setStatus(fixedCasterRadiusConfig()
          ? "Nuova scena pronta: ricalcolo i bersagli della scossa."
          : "Nuova scena pronta: posiziona di nuovo la risoluzione.");
        void loadScene();
      }
    });
    await sceneLifecycle.mount();
    if (!sceneLifecycle.isReady()) {
      setStatus("Scena non disponibile: riapri la risoluzione.", false, "warn");
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
