import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
  TRACKER_PANEL_REQUEST_CHANNEL,
} from "./constants.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import { getHistoryEntries, undoHistoryThrough, withItemMetaHistory } from "./history.js";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  createQuickHPVisualTransaction,
  failedQuickHPTargetIds,
  quickHPVisualUpdates,
  quickHPZeroReconcileTargetIds,
  shouldHandleQuickHPUndoShortcut,
} from "./quickHpCore.js";
import { APPLICABLE_CONDITION_LIST, getConditionInstances } from "./conditions.js";
import { resolveZeroHPUnconsciousAction } from "./hpConditionRulesCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  conditionMutationOperations,
  requireAppliedEffectsMutation,
  runEffectsMutation,
  saveSpellResolutionOperations,
  saveSpellTriggerResolutionOperations,
} from "./effectsMutations.js";
import {
  getZeroHPConditionHistoryIds,
} from "./hpConditionAutomation.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { createSpellInstanceId } from "./spells.js";
import {
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
  getAreaSaveSpellOptions,
  getSpellDefinition,
} from "./spells-srd.js";
import {
  AREA_HEALING_SPELL_ID_SET,
  AREA_SAVE_SPELL_ID_SET,
} from "./areaSaveSpellRules.js";
import { normalizeSaveSpellAutomation, resolveSaveSpellResolution } from "./saveSpellCore.js";
import {
  confirmedSpellAreaTargetIds,
  quickHpAreaPlacementPresentation,
  quickHpSpellUsesSaveOutcomes,
} from "./quickHpAreaWorkflowCore.js";
import { requestSpellAreaPlacement } from "./spellAreaPlacementClient.js";
import {
  buildStaticSpellZoneItems,
  getStaticSpellZoneItems,
} from "./spellStaticZone.js";
import { areaMembershipPlan } from "./spellAreaMembershipCore.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  staticSpellZoneOwnerOperation,
} from "./spellStaticZoneCore.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  consumeSpellZoneTrigger,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import { effectSaveReminderNoticesForDamage } from "./effectSaveReminderCore.js";
import { spellColorFor } from "./spellColorCore.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { findQuickAction } from "./quickActionsCore.js";
import { decorateCompositeEffectsHistoryEntry } from "./effectsMutationCompositeHistoryCore.js";

const META_KEY = ID + "/meta";
const STATE_KEY = ID + "/state";
const SPELLS_KEY = ID + "/spells";
const CONCENTRATION_KEY = ID + "/concentration";

function quickHpEffectsHistoryEntry(entry, mutation = null) {
  return decorateCompositeEffectsHistoryEntry({
    entry,
    mutation,
    effectMetadataFields: ["conditions", SPELLS_KEY, CONCENTRATION_KEY],
  });
}
const CONCENTRATION_WARNING_CHANNEL = ID + "/concentration-warning";
const MODAL_ID = ID + "/quick-hp-modal";
const TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";
const QUICK_ACTION_QUERY = new URLSearchParams(window.location.search);
const QUICK_ACTION_SOURCE_ID = QUICK_ACTION_QUERY.get("source") || "";
const QUICK_ACTION_ID = QUICK_ACTION_QUERY.get("quickAction") || "";
const LAIR_ID = "__LAIR__";
const EPIC_PREFIX = "__EPIC__";
const factorOptions = [
  { value: QUICK_HP_FACTORS.DOUBLE, label: "\u00d72", title: "Doppio" },
  { value: QUICK_HP_FACTORS.FULL, label: "1", title: "Intero" },
  { value: QUICK_HP_FACTORS.HALF, label: "\u00bd", title: "Meta" },
  { value: QUICK_HP_FACTORS.QUARTER, label: "\u00bc", title: "Quarto" },
];
const SAVE_OUTCOMES = Object.freeze({ PASSED: "passed", FAILED: "failed", IMMUNE: "immune" });
const outcomeOptions = [
  { value: SAVE_OUTCOMES.PASSED, label: "Superato", shortLabel: "Superato" },
  { value: SAVE_OUTCOMES.FAILED, label: "Fallito", shortLabel: "Fallito" },
  { value: SAVE_OUTCOMES.IMMUNE, label: "Immune", shortLabel: "Immune" },
];

let mode = QUICK_HP_MODES.DAMAGE;
let areaEffectTab = "spell";
let effectSaveDamageSequence = 0;
let targets = [];
let selectedIds = new Set();
let factors = new Map();
let saveOutcomes = new Map();
let selectionWriteDepth = 0;
let selectionPollBusy = false;
let selectionUnsubscribe = null;
let selectionTimer = null;
let busy = false;
let targetSelectionLocked = false;
let lastEntryId = "";
let pendingSpellAreaPlacement = null;
let activeZoneTrigger = null;
let lastZoneTriggerActivationId = "";
let zoneTriggerRequestUnsubscribe = null;

const closeButton = document.getElementById("close");
const amountInput = document.getElementById("amount");
const targetList = document.getElementById("targetList");
const bulkActions = document.getElementById("bulkActions");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
const applyButton = document.getElementById("apply");
const undoButton = document.getElementById("undo");
const targetNameFilter = document.getElementById("targetNameFilter");
const targetLock = document.getElementById("targetLock");
const unlockTargetsButton = document.getElementById("unlockTargets");
const saveOptions = document.getElementById("saveOptions");
const areaEffectTabButtons = Array.from(document.querySelectorAll("[data-area-effect-tab]"));
const areaSpellPanel = document.getElementById("areaSpellPanel");
const spellSelect = document.getElementById("spellSelect");
const spellSearch = document.getElementById("spellSearch");
const spellMenuToggle = document.getElementById("spellMenuToggle");
const spellMenu = document.getElementById("spellMenu");
const spellRuleChoiceWrap = document.getElementById("spellRuleChoiceWrap");
const spellRuleChoice = document.getElementById("spellRuleChoice");
const spellRuleSummary = document.getElementById("spellRuleSummary");
const areaPlacementButton = document.getElementById("areaPlacement");
const spellCasterWrap = document.getElementById("spellCasterWrap");
const spellCasterSelect = document.getElementById("spellCaster");
const manualConditionWrap = document.getElementById("manualConditionWrap");
const conditionSelect = document.getElementById("conditionSelect");
const conditionDetails = document.getElementById("conditionDetails");
const concentrationNotice = document.getElementById("concentrationNotice");
const conditionSourceWrap = document.getElementById("conditionSourceWrap");
const conditionSourceSelect = document.getElementById("conditionSource");
const conditionExpiryWrap = document.getElementById("conditionExpiryWrap");
const conditionExpirySelect = document.getElementById("conditionExpiry");
const conditionConcentrationExpiryOption = conditionExpirySelect.querySelector("[value='concentration']");
const conditionActorWrap = document.getElementById("conditionActorWrap");
const conditionActorSelect = document.getElementById("conditionActor");
const conditionDurationWrap = document.getElementById("conditionDurationWrap");
const conditionDurationCaption = document.getElementById("conditionDurationCaption");
const conditionDurationInput = document.getElementById("conditionDuration");
const factionFilterButtons = Array.from(document.querySelectorAll("[data-hp-faction]"));
const activeFactionFilters = new Set();
const spellIdsBySearchLabel = new Map();
const spellSearchEntries = [];

for (const conditionName of APPLICABLE_CONDITION_LIST) {
  const option = document.createElement("option");
  option.value = conditionName;
  option.textContent = conditionName;
  conditionSelect.appendChild(option);
}
const areaSaveSpells = getAreaSaveSpellOptions();
const spellsByLevel = new Map();
for (const spell of areaSaveSpells) {
  const level = Math.max(0, Math.floor(Number(spell.level) || 0));
  if (!spellsByLevel.has(level)) spellsByLevel.set(level, []);
  spellsByLevel.get(level).push(spell);
}
for (const [level, spells] of [...spellsByLevel.entries()].sort((a, b) => a[0] - b[0])) {
  const group = document.createElement("optgroup");
  group.label = level === 0 ? "Trucchetti" : `Livello ${level}`;
  for (const spell of spells) {
    const markers = [spell.concentration ? "C" : "", spell.automated ? "auto" : ""].filter(Boolean);
    const option = document.createElement("option");
    option.value = spell.id;
    option.textContent = `${spell.label}${markers.length ? ` (${markers.join(", ")})` : ""}`;
    group.appendChild(option);
    spellSearchEntries.push({ id: spell.id, label: option.textContent, level });
    spellIdsBySearchLabel.set(option.textContent.trim().toLocaleLowerCase("it"), spell.id);
  }
  spellSelect.appendChild(group);
}

function splitVirtualId(value) {
  const id = String(value || "");
  const index = id.indexOf("::p");
  return index >= 0 ? id.slice(0, index) : id;
}
function isRealTokenId(id) {
  return !!id && id !== LAIR_ID && !id.startsWith(EPIC_PREFIX);
}
function itemForId(id) {
  return targets.find((item) => item.id === id) || null;
}
async function currentInitiativeActorId() {
  try {
    const metadata = await OBR.scene.getMetadata();
    const state = metadata && metadata[STATE_KEY] || {};
    const order = Array.isArray(state.order) ? state.order : [];
    const activeId = splitVirtualId(order[state.current]);
    return isRealTokenId(activeId) && itemForId(activeId) ? activeId : "";
  } catch {
    return "";
  }
}
function selectedAreaSpell() {
  if (areaEffectTab !== "spell") return null;
  return getSpellDefinition(spellSelect.value) || null;
}
function spellUsesSaveOutcomes(spell = selectedAreaSpell()) {
  return quickHpSpellUsesSaveOutcomes({
    spellId: spell?.id,
    castSaveSpellIds: AREA_SAVE_SPELL_ID_SET,
    activeZoneTrigger,
  });
}
function spellUsesAreaHealing(spell = selectedAreaSpell()) {
  return !!spell && AREA_HEALING_SPELL_ID_SET.has(spell.id);
}
function areaOutcomeFor(targetId, spell = selectedAreaSpell()) {
  return spellUsesSaveOutcomes(spell)
    ? saveOutcomes.get(targetId)
    : SAVE_OUTCOMES.FAILED;
}
function pendingStaticZonePlacement(rule, spell, casterId) {
  if (rule?.kind !== "zone" || !pendingSpellAreaPlacement) return null;
  return pendingSpellAreaPlacement.ruleId === rule.id
    && pendingSpellAreaPlacement.spellId === spell?.id
    && pendingSpellAreaPlacement.casterId === String(casterId || "").trim()
    ? pendingSpellAreaPlacement
    : null;
}
function selectedSaveRuleChoice() {
  return spellRuleChoice.value.trim();
}
function catalogSaveAutomation(spell) {
  if (!spellUsesSaveOutcomes(spell)) return null;
  return getAreaSaveAutomation(spell, selectedSaveRuleChoice());
}
function refreshSpellRuleChoices() {
  const choices = getAreaSaveRuleChoices(selectedAreaSpell());
  const previous = selectedSaveRuleChoice();
  spellRuleChoice.replaceChildren();
  for (const choice of choices) {
    spellRuleChoice.appendChild(new Option(choice.label, choice.value));
  }
  if (choices.some((choice) => choice.value === previous)) {
    spellRuleChoice.value = previous;
  }
  spellRuleChoiceWrap.hidden = !choices.length;
}
function closeSpellMenu() {
  spellMenu.hidden = true;
  spellSearch.setAttribute("aria-expanded", "false");
  spellMenuToggle.setAttribute("aria-expanded", "false");
}
function openSpellMenu(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("it");
  const matches = spellSearchEntries.filter((entry) =>
    !normalizedQuery || entry.label.toLocaleLowerCase("it").includes(normalizedQuery)
  );
  spellMenu.replaceChildren();
  const entriesByLevel = new Map();
  for (const entry of matches) {
    if (!entriesByLevel.has(entry.level)) entriesByLevel.set(entry.level, []);
    entriesByLevel.get(entry.level).push(entry);
  }
  for (const [level, entries] of entriesByLevel) {
    const group = document.createElement("div");
    group.className = "spell-menu-group";
    const heading = document.createElement("div");
    heading.className = "spell-menu-level";
    heading.textContent = level === 0 ? "Trucchetti" : `Livello ${level}`;
    group.appendChild(heading);
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "spell-menu-option" + (spellSelect.value === entry.id ? " active" : "");
      button.textContent = entry.label;
      button.title = entry.label;
      button.dataset.spellId = entry.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(spellSelect.value === entry.id));
      button.addEventListener("click", () => {
        spellSearch.value = entry.label;
        spellSelect.value = entry.id;
        closeSpellMenu();
        spellSelect.dispatchEvent(new Event("change"));
        spellSearch.focus();
      });
      group.appendChild(button);
    }
    spellMenu.appendChild(group);
  }
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "spell-menu-empty";
    empty.textContent = "Nessun incantesimo trovato.";
    spellMenu.appendChild(empty);
  }
  spellMenu.hidden = false;
  spellSearch.setAttribute("aria-expanded", "true");
  spellMenuToggle.setAttribute("aria-expanded", "true");
}
function syncSpellSelectionFromSearch(settle = false) {
  const searchLabel = spellSearch.value.trim().toLocaleLowerCase("it");
  const nextId = searchLabel ? spellIdsBySearchLabel.get(searchLabel) || "" : "";
  if (settle && searchLabel && !nextId) spellSearch.value = "";
  if (spellSelect.value === nextId) return;
  spellSelect.value = nextId;
  spellSelect.dispatchEvent(new Event("change"));
}
function conditionExpiry() {
  const mode = conditionExpirySelect.value || "manual";
  const expiry = { mode };
  if (["rounds", "turn-start", "turn-end"].includes(mode)) {
    expiry.remaining = Math.max(1, Math.floor(Number(conditionDurationInput.value) || 1));
  }
  if (mode === "turn-start" || mode === "turn-end") {
    const sourceId = conditionSourceSelect.value.trim();
    const actor = conditionActorSelect.value === "source" && sourceId ? "source" : "target";
    expiry.actor = actor;
    if (actor === "source") {
      expiry.actorId = sourceId;
      const source = itemForId(sourceId);
      if (source) expiry.actorName = displayName(source);
    }
  }
  return expiry;
}
function conditionOptions(appliedAt) {
  const sourceId = conditionSourceSelect.value.trim();
  const source = itemForId(sourceId);
  return {
    sourceId,
    sourceName: sourceId && source ? displayName(source) : "",
    appliedAt,
    expiry: conditionExpiry(),
  };
}
function expirySummary(expiry = {}) {
  const mode = String(expiry?.mode || "manual");
  const remaining = Math.max(1, Math.floor(Number(expiry?.remaining) || 1));
  if (mode === "concentration") return "fino a fine concentrazione";
  if (mode === "rounds") return `per ${remaining} round`;
  if (mode === "turn-start" || mode === "turn-end") {
    const boundary = mode === "turn-start" ? "inizio" : "fine";
    const actor = expiry?.actor === "source" ? "della fonte" : "del bersaglio";
    return `fino a ${boundary} turno ${actor}`;
  }
  return "rimozione manuale";
}
function activeConcentrationForSpell(caster, spell) {
  const concentrations = caster?.metadata?.[META_KEY]?.[CONCENTRATION_KEY];
  if (!spell || !concentrations || typeof concentrations !== "object") return null;
  const names = new Set([
    spell.id,
    spell.name,
    spell.displayName,
    spell.catalogLabel,
  ].map((value) => String(value || "").trim().toLocaleLowerCase("it")).filter(Boolean));
  return Object.entries(concentrations)
    .map(([key, entry]) => ({ key, ...(entry && typeof entry === "object" ? entry : {}) }))
    .find((entry) =>
      String(entry.spellId || "").trim() === spell.id
      || names.has(String(entry.name || entry.key || "").trim().toLocaleLowerCase("it"))
    ) || null;
}
function remainingSpellTurnsForInstance(instanceId, fallback = 1) {
  const wanted = String(instanceId || "").trim();
  const values = targets.flatMap((item) => {
    const spells = item?.metadata?.[META_KEY]?.[SPELLS_KEY];
    if (!Array.isArray(spells)) return [];
    return spells
      .filter((entry) => String(entry?.instanceId || "") === wanted)
      .map((entry) => Math.floor(Number(entry?.turns) || 0))
      .filter((turns) => turns > 0);
  });
  return values.length
    ? Math.min(...values)
    : Math.max(1, Math.floor(Number(fallback) || 1));
}
function conditionExpirySummary() {
  return expirySummary(conditionExpiry()).replace("del bersaglio", "dei bersagli");
}
function currentSaveAutomation(spell) {
  const catalogAutomation = catalogSaveAutomation(spell);
  if (catalogAutomation) return catalogAutomation;
  const conditionName = conditionSelect.value.trim();
  return {
    trackOutcomes: conditionName ? [SAVE_OUTCOMES.FAILED] : [],
    failed: conditionName ? [{ condition: conditionName, expiry: conditionExpiry() }] : [],
  };
}
function updateSpellRuleSummary() {
  const spell = selectedAreaSpell();
  const automation = catalogSaveAutomation(spell);
  if (!automation) {
    spellRuleSummary.hidden = true;
    spellRuleSummary.textContent = "";
    return;
  }
  const normalized = normalizeSaveSpellAutomation(automation);
  const labels = {
    [SAVE_OUTCOMES.PASSED]: "Superato",
    [SAVE_OUTCOMES.FAILED]: "Fallito",
    [SAVE_OUTCOMES.IMMUNE]: "Immune",
  };
  const lines = [];
  for (const outcome of Object.values(SAVE_OUTCOMES)) {
    const rules = normalized.rulesByOutcome[outcome] || [];
    if (!rules.length) continue;
    lines.push(`${labels[outcome]}: ${rules.map((rule) => {
      const duration = rule.options?.expiry ? ` (${expirySummary(rule.options.expiry)})` : "";
      return rule.conditionName + duration;
    }).join(", ")}`);
  }
  spellRuleSummary.hidden = !lines.length;
  spellRuleSummary.textContent = lines.length ? lines.join("\n") : "";
}
function updateConcentrationNotice() {
  const spell = selectedAreaSpell();
  if (!spell?.concentration || mode !== QUICK_HP_MODES.SAVE) {
    concentrationNotice.hidden = true;
    concentrationNotice.textContent = "";
    concentrationNotice.title = "";
    return;
  }
  concentrationNotice.hidden = false;
  concentrationNotice.textContent = "C";
  concentrationNotice.style.background = spellColorFor(spell).solid;
  let title = "Incantesimo a concentrazione";
  if (activeZoneTrigger) {
    title = "Zona a concentrazione già attiva: la risoluzione non la rilancia";
    concentrationNotice.title = title;
    concentrationNotice.setAttribute("aria-label", title);
    return;
  }
  const casterId = spellCasterSelect.value.trim();
  const caster = itemForId(casterId);
  if (!casterId || !caster) {
    title = "Incantesimo a concentrazione: seleziona il caster";
    concentrationNotice.title = title;
    concentrationNotice.setAttribute("aria-label", title);
    return;
  }
  const concentration = caster.metadata?.[META_KEY]?.[CONCENTRATION_KEY];
  const names = concentration && typeof concentration === "object"
    ? Array.from(new Set(Object.entries(concentration).map(([key, entry]) =>
      String(entry?.name || key || "").trim()
    ).filter(Boolean)))
    : [];
  const concentrationAction = catalogSaveAutomation(spell)?.concentrationAction;
  if (concentrationAction === "dismiss") {
    title = names.length
      ? `L'effetto interromperà la concentrazione di ${displayName(caster)} su ${names.join(", ")}.`
      : `L'effetto conclusivo non registrerà una nuova concentrazione su ${displayName(caster)}.`;
  } else if (activeConcentrationForSpell(caster, spell)?.instanceId) {
    title =
      `Verrà aggiornata la concentrazione già attiva di ${displayName(caster)} su ${spell.displayName}.`;
  } else if (names.length) {
    title = `${displayName(caster)} interromperà la concentrazione su ${names.join(", ")}.`;
  }
  concentrationNotice.title = title;
  concentrationNotice.setAttribute("aria-label", title);
}
function syncConditionDetailControls() {
  const spell = selectedAreaSpell();
  const hasCatalogRules = !!catalogSaveAutomation(spell);
  const hasManualCondition = mode === QUICK_HP_MODES.SAVE
    && !hasCatalogRules
    && !!conditionSelect.value.trim();
  manualConditionWrap.hidden = false;
  for (const button of areaEffectTabButtons) {
    const active = button.dataset.areaEffectTab === areaEffectTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.disabled = busy;
  }
  areaSpellPanel.hidden = areaEffectTab !== "spell";
  conditionDetails.hidden = areaEffectTab !== "condition";
  spellCasterWrap.hidden = false;
  conditionSourceWrap.hidden = false;
  conditionExpiryWrap.hidden = false;
  conditionConcentrationExpiryOption.hidden = !spell?.concentration;
  conditionConcentrationExpiryOption.disabled = !spell?.concentration;
  if (!spell?.concentration && conditionExpirySelect.value === "concentration") {
    conditionExpirySelect.value = "manual";
  }
  const expiryMode = conditionExpirySelect.value || "manual";
  const hasDuration = hasManualCondition && ["rounds", "turn-start", "turn-end"].includes(expiryMode);
  const hasActor = hasManualCondition && (expiryMode === "turn-start" || expiryMode === "turn-end");
  conditionActorWrap.hidden = false;
  conditionDurationWrap.hidden = false;
  conditionDurationCaption.textContent = "Occorrenze";
  const sourceId = conditionSourceSelect.value.trim();
  if (!sourceId && conditionActorSelect.value === "source") conditionActorSelect.value = "target";
  spellSelect.disabled = busy || mode !== QUICK_HP_MODES.SAVE;
  spellSearch.disabled = busy || mode !== QUICK_HP_MODES.SAVE;
  spellMenuToggle.disabled = busy || mode !== QUICK_HP_MODES.SAVE;
  spellRuleChoice.disabled = busy || mode !== QUICK_HP_MODES.SAVE;
  if (spellSearch.disabled) closeSpellMenu();
  spellCasterSelect.disabled = busy || mode !== QUICK_HP_MODES.SAVE || !spell;
  conditionSelect.disabled = busy || mode !== QUICK_HP_MODES.SAVE || hasCatalogRules;
  conditionSourceSelect.disabled = busy || !hasManualCondition;
  conditionExpirySelect.disabled = busy || !hasManualCondition;
  conditionActorSelect.disabled = busy || !hasActor || !sourceId;
  conditionDurationInput.disabled = busy || !hasDuration;
  const areaPlacement = quickHpAreaPlacementPresentation({
    spellId: spell?.id,
    casterId: spellCasterSelect.value.trim(),
    busy,
  });
  areaPlacementButton.hidden = areaPlacement.hidden || !!activeZoneTrigger;
  areaPlacementButton.disabled = areaPlacement.disabled || !!activeZoneTrigger;
  areaPlacementButton.textContent = areaPlacement.text;
  areaPlacementButton.title = areaPlacement.title;
  if (areaPlacement.rule?.kind === "zone") {
    areaPlacementButton.title += ". La creazione della zona è facoltativa";
  }
  if (pendingStaticZonePlacement(
    areaPlacement.rule,
    spell,
    spellCasterSelect.value.trim(),
  )) {
    areaPlacementButton.textContent = "Riposiziona area";
    areaPlacementButton.title = "Sostituisci la zona statica già posizionata";
  }
  updateSpellRuleSummary();
  updateConcentrationNotice();
}
async function refreshConditionSourceOptions() {
  const previousSource = conditionSourceSelect.value.trim();
  const previousCaster = spellCasterSelect.value.trim();
  const activeId = await currentInitiativeActorId();
  conditionSourceSelect.replaceChildren(new Option("Nessuna fonte", ""));
  spellCasterSelect.replaceChildren(new Option("Nessun caster", ""));
  for (const item of targets) {
    conditionSourceSelect.appendChild(new Option(displayName(item), item.id));
    spellCasterSelect.appendChild(new Option(displayName(item), item.id));
  }
  const nextSource = previousSource && itemForId(previousSource) ? previousSource : activeId;
  const nextCaster = previousCaster && itemForId(previousCaster) ? previousCaster : activeId;
  conditionSourceSelect.value = nextSource || "";
  spellCasterSelect.value = nextCaster || "";
  if (!nextSource) conditionActorSelect.value = "target";
  syncConditionDetailControls();
}
function hasTrackedHP(item) {
  const meta = item && item.metadata && item.metadata[META_KEY];
  return !!meta
    && Object.prototype.hasOwnProperty.call(meta, "hp")
    && Object.prototype.hasOwnProperty.call(meta, "hpMax")
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax))
    && Number(meta.hpMax) > 0;
}
function displayName(item) {
  return String(item && item.name || "").trim() || "Token";
}
function factionKey(item) {
  const meta = item && item.metadata && item.metadata[META_KEY] || {};
  const attitude = String(meta.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}
function factionColor(item) {
  const attitude = factionKey(item);
  if (attitude === "enemy") return "#ef4444";
  if (attitude === "ally") return "#22c55e";
  if (attitude === "pc") return "#38bdf8";
  return "#eab308";
}
function currentValue() {
  return Math.max(0, Math.floor(Number(amountInput.value) || 0));
}
function factorFor(id) {
  return factors.get(id) || QUICK_HP_FACTORS.FULL;
}
function factorForOutcome(outcome) {
  if (outcome === SAVE_OUTCOMES.PASSED) return QUICK_HP_FACTORS.HALF;
  return QUICK_HP_FACTORS.FULL;
}
function previewFor(item) {
  const meta = item.metadata[META_KEY] || {};
  if (
    mode === QUICK_HP_MODES.SAVE
    && spellUsesSaveOutcomes()
    && !saveOutcomes.has(item.id)
  ) return null;
  const outcome = areaOutcomeFor(item.id);
  return calculateQuickHPChange({
    mode: mode === QUICK_HP_MODES.SAVE
      ? spellUsesAreaHealing()
        ? QUICK_HP_MODES.HEAL
        : QUICK_HP_MODES.DAMAGE
      : mode,
    value: mode === QUICK_HP_MODES.SAVE && outcome === SAVE_OUTCOMES.IMMUNE ? 0 : currentValue(),
    factor: mode === QUICK_HP_MODES.SAVE ? factorForOutcome(outcome) : factorFor(item.id),
    hp: meta.hp,
    hpMax: meta.hpMax,
  });
}
function targetSelectable(item) {
  return mode === QUICK_HP_MODES.SAVE || hasTrackedHP(item);
}
function selectedTargetItems() {
  return targets.filter((item) => selectedIds.has(item.id) && targetSelectable(item));
}
function sameSelection(nextIds) {
  if (nextIds.size !== selectedIds.size) return false;
  for (const id of nextIds) if (!selectedIds.has(id)) return false;
  return true;
}
function orderedTargets() {
  const selected = [];
  const unselected = [];
  for (const item of targets) {
    if (selectedIds.has(item.id) && targetSelectable(item)) selected.push(item);
    else unselected.push(item);
  }
  return selected.concat(unselected);
}
function activeChanges() {
  return selectedTargetItems()
    .filter(hasTrackedHP)
    .map((item) => ({ item, change: previewFor(item) }))
    .filter((entry) => entry.change?.changed);
}
function signed(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? "+" + number : String(number);
}
function modeLabel() {
  if (mode === QUICK_HP_MODES.HEAL) return "cura";
  if (mode === QUICK_HP_MODES.TEMP) return "HP temporanei";
  if (mode === QUICK_HP_MODES.SAVE) return "effetti ad area";
  return "danno";
}
function currentSpellResolution(selected) {
  const spell = selectedAreaSpell();
  if (!spell) return null;
  const placementRule = quickHpAreaPlacementPresentation({
    spellId: spell.id,
    casterId: spellCasterSelect.value.trim(),
  }).rule;
  const areaLifecycleOnly = placementRule?.kind === "aura"
    || !!pendingStaticZonePlacement(
      placementRule,
      spell,
      spellCasterSelect.value.trim(),
    );
  return resolveSaveSpellResolution({
    spell,
    casterId: spellCasterSelect.value.trim(),
    targetIds: selected.map((item) => item.id),
    outcomes: spellUsesSaveOutcomes(spell)
      ? saveOutcomes
      : new Map(selected.map((item) => [item.id, SAVE_OUTCOMES.FAILED])),
    automation: currentSaveAutomation(spell),
    allowEmptyTargets: areaLifecycleOnly,
  });
}
function updateControls() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  applyButton.className = "apply " + (
    mode === QUICK_HP_MODES.SAVE
      ? spellUsesAreaHealing()
        ? QUICK_HP_MODES.HEAL
        : QUICK_HP_MODES.DAMAGE
      : mode
  );
  applyButton.textContent = mode === QUICK_HP_MODES.HEAL
    ? "Applica cura"
    : mode === QUICK_HP_MODES.TEMP
      ? "Applica HP temp."
      : mode === QUICK_HP_MODES.SAVE
        ? spellUsesAreaHealing()
          ? "Applica cura"
          : "Applica effetti"
        : "Applica danno";
  const selected = selectedTargetItems();
  const changes = activeChanges();
  const total = changes.reduce((sum, entry) => sum + Math.abs(entry.change.delta), 0);
  saveOptions.hidden = mode !== QUICK_HP_MODES.SAVE;
  syncConditionDetailControls();
  const spell = mode === QUICK_HP_MODES.SAVE ? selectedAreaSpell() : null;
  const spellResolution = spell ? currentSpellResolution(selected) : null;
  const placementRule = spell
    ? quickHpAreaPlacementPresentation({
      spellId: spell.id,
      casterId: spellCasterSelect.value.trim(),
    }).rule
    : null;
  const hasAreaLifecycle = placementRule?.kind === "aura"
    || !!pendingStaticZonePlacement(
      placementRule,
      spell,
      spellCasterSelect.value.trim(),
    );
  if (
    mode === QUICK_HP_MODES.SAVE
    && selected.length
    && spellUsesSaveOutcomes(spell)
  ) {
    const counts = outcomeOptions.map((option) => selected.filter((item) => saveOutcomes.get(item.id) === option.value).length);
    const missing = selected.length - counts.reduce((sum, count) => sum + count, 0);
    const condition = !catalogSaveAutomation(spell) ? conditionSelect.value.trim() : "";
    summary.textContent = `${selected.length} bersagli - Superati ${counts[0]} - Falliti ${counts[1]} - Immune ${counts[2]}${missing ? ` - ${missing} senza esito` : ""}${condition && counts[1] ? ` · ${condition}, ${conditionExpirySummary()}` : ""}`;
  } else {
    summary.textContent = !selected.length ? "Nessun bersaglio selezionato" : selected.length + " bersagli - " + changes.length + " modificati - " + total + " HP";
  }
  const outcomesComplete = mode !== QUICK_HP_MODES.SAVE
    || !spellUsesSaveOutcomes(spell)
    || selected.every((item) => saveOutcomes.has(item.id))
      && (selected.length > 0 || hasAreaLifecycle);
  const failedWithManualCondition = mode === QUICK_HP_MODES.SAVE
    && !spell
    && conditionSelect.value.trim()
    && selected.some((item) => saveOutcomes.get(item.id) === SAVE_OUTCOMES.FAILED);
  const hasSpellEffect = !!spellResolution?.valid
    && (spellResolution.spellTargetIds.length > 0 || spellResolution.conditionApplications.length > 0);
  const hasSaveEffect = failedWithManualCondition || hasSpellEffect;
  const hasZoneTrigger = zoneTriggerMatchesForm(
    activeZoneTrigger,
    spell,
    selected.map((item) => item.id),
  );
  const zoneTriggerRequiresDamage = hasZoneTrigger
    && !!activeZoneTrigger?.damage?.dice;
  const casterMissing = !!spell?.concentration && !spellCasterSelect.value.trim();
  applyButton.disabled = busy
    || !outcomesComplete
    || casterMissing
    || (mode === QUICK_HP_MODES.SAVE
      ? hasZoneTrigger
        ? zoneTriggerRequiresDamage && (
          currentValue() <= 0 || changes.length === 0
        )
        : (changes.length === 0 && !hasSaveEffect && !hasAreaLifecycle)
          || (currentValue() <= 0 && !hasSaveEffect && !hasAreaLifecycle)
      : currentValue() <= 0 || changes.length === 0);
  targetNameFilter.disabled = busy;
  for (const button of factionFilterButtons) button.disabled = busy;
  amountInput.disabled = busy;
  renderBulkActions();
}
async function updateSceneSelection(ids, selected, replace) {
  selectionWriteDepth += 1;
  try {
    if (selected) await OBR.player.select(ids, !!replace);
    else await OBR.player.deselect(ids);
  } finally {
    selectionWriteDepth -= 1;
    await refreshSelectionFromScene();
  }
}
function setSelectedFromScene(ids) {
  if (targetSelectionLocked) return;
  const available = new Set(targets.map((item) => item.id));
  const nextIds = new Set((Array.isArray(ids) ? ids : []).map(splitVirtualId).filter((id) => available.has(id)));
  if (sameSelection(nextIds)) return;
  for (const id of selectedIds) if (!nextIds.has(id)) saveOutcomes.delete(id);
  selectedIds = nextIds;
  renderTargets();
}
async function refreshSelectionFromScene() {
  if (selectionPollBusy || selectionWriteDepth > 0) return;
  selectionPollBusy = true;
  try {
    setSelectedFromScene(await OBR.player.getSelection());
  } catch {
  } finally {
    selectionPollBusy = false;
  }
}
function mountSelectionSync() {
  if (!selectionUnsubscribe) {
    selectionUnsubscribe = OBR.player.onChange((player) => {
      if (selectionWriteDepth === 0 && Array.isArray(player && player.selection)) setSelectedFromScene(player.selection);
    });
  }
  if (!selectionTimer) selectionTimer = window.setInterval(refreshSelectionFromScene, 150);
}
function renderFactorButtons(item, disabled) {
  const group = document.createElement("div");
  group.className = "factor-group";
  const current = factorFor(item.id);
  for (const option of factorOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "factor" + (current === option.value ? " active" : "");
    button.textContent = option.label;
    button.title = option.title;
    button.dataset.factor = option.value;
    button.disabled = disabled || busy;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (disabled || busy) return;
      factors.set(item.id, option.value);
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        renderTargets();
        void updateSceneSelection([item.id], true, false);
      } else renderTargets();
    });
    group.appendChild(button);
  }
  return group;
}
function renderOutcomeButtons(item, disabled) {
  const group = document.createElement("div");
  group.className = "outcome-group";
  if (!spellUsesSaveOutcomes()) {
    group.classList.add("area-inside-group");
    const included = document.createElement("span");
    included.className = "outcome active area-inside";
    included.textContent = "All'interno dell'area";
    included.title = "Bersaglio incluso nell'area";
    group.appendChild(included);
    return group;
  }
  const current = saveOutcomes.get(item.id);
  for (const option of outcomeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outcome" + (current === option.value ? " active" : "");
    button.textContent = option.shortLabel;
    button.title = option.label;
    button.dataset.outcome = option.value;
    button.disabled = disabled || busy;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (disabled || busy) return;
      saveOutcomes.set(item.id, option.value);
      if (option.value !== SAVE_OUTCOMES.IMMUNE) factors.set(item.id, factorForOutcome(option.value));
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        renderTargets();
        void updateSceneSelection([item.id], true, false);
      } else renderTargets();
    });
    group.appendChild(button);
  }
  return group;
}
function renderTargets() {
  targetList.replaceChildren();
  targetLock.hidden = !targetSelectionLocked || mode !== QUICK_HP_MODES.SAVE;
  if (!targets.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun token in iniziativa.";
    targetList.appendChild(empty);
    updateControls();
    return;
  }
  const nameQuery = targetNameFilter.value.trim().toLocaleLowerCase("it");
  const visibleTargets = orderedTargets().filter((item) => {
    const matchesFaction = activeFactionFilters.size === 0 || activeFactionFilters.has(factionKey(item));
    const matchesName = !nameQuery || displayName(item).toLocaleLowerCase("it").includes(nameQuery);
    return matchesFaction && matchesName;
  });
  if (!visibleTargets.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun bersaglio corrisponde ai filtri.";
    targetList.appendChild(empty);
    updateControls();
    return;
  }
  for (const item of visibleTargets) {
    const trackedHP = hasTrackedHP(item);
    const disabled = mode !== QUICK_HP_MODES.SAVE && !trackedHP;
    const selected = selectedIds.has(item.id) && !disabled;
    const selectionLocked = targetSelectionLocked && mode === QUICK_HP_MODES.SAVE;
    const row = document.createElement("div");
    row.className = "target"
      + (mode === QUICK_HP_MODES.SAVE ? " save-target" : "")
      + (selected ? " selected" : "")
      + (disabled ? " disabled" : "")
      + (selectionLocked ? " selection-locked" : "");
    row.dataset.itemId = item.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected;
    checkbox.disabled = disabled || busy || selectionLocked;
    checkbox.setAttribute("aria-label", "Seleziona " + displayName(item));
    const identity = document.createElement("div");
    identity.className = "identity";
    const faction = document.createElement("span");
    faction.className = "faction";
    faction.style.background = factionColor(item);
    faction.style.color = factionColor(item);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = displayName(item);
    identity.append(faction, name);
    const preview = document.createElement("div");
    preview.className = "hp-preview";
    if (!trackedHP) {
      preview.textContent = mode === QUICK_HP_MODES.SAVE
        ? "HP non tracciati · solo effetti"
        : "HP non tracciati";
    } else if (mode === QUICK_HP_MODES.SAVE) {
      const outcome = areaOutcomeFor(item.id);
      const result = previewFor(item);
      const areaHealing = spellUsesAreaHealing();
      if (!spellUsesSaveOutcomes() && !areaHealing && currentValue() <= 0) {
        preview.hidden = true;
      } else if (!outcome) {
        preview.textContent = "Esito mancante";
      } else if (outcome === SAVE_OUTCOMES.IMMUNE) {
        preview.textContent = "Immune · nessun danno";
      } else {
        const before = document.createElement("span");
        before.className = "before";
        before.textContent = result.hp + "/" + result.hpMax + " -> ";
        const after = document.createElement("strong");
        after.textContent = result.afterHP;
        const delta = document.createElement("span");
        delta.className = "delta " + (
          areaHealing ? QUICK_HP_MODES.HEAL : QUICK_HP_MODES.DAMAGE
        );
        delta.textContent = areaHealing
          ? " (" + signed(result.delta) + ")"
          : " (" + (outcome === SAVE_OUTCOMES.PASSED ? "½" : "1") + ")";
        preview.append(before, after, delta);
      }
    } else {
      const result = previewFor(item);
      const before = document.createElement("span");
      before.className = "before";
      before.textContent = result.hp + "/" + result.hpMax + " -> ";
      const after = document.createElement("strong");
      after.textContent = result.afterHP;
      const delta = document.createElement("span");
      delta.className = "delta " + mode;
      delta.textContent = " (" + signed(result.delta) + ")";
      preview.append(before, after, delta);
    }
    row.append(
      checkbox,
      identity,
      preview,
      mode === QUICK_HP_MODES.SAVE
        ? renderOutcomeButtons(item, disabled || (selectionLocked && !selected))
        : renderFactorButtons(item, disabled),
    );
    const toggle = () => {
      if (disabled || busy || selectionLocked) return;
      const next = !selectedIds.has(item.id);
      if (next) selectedIds.add(item.id);
      else {
        selectedIds.delete(item.id);
        saveOutcomes.delete(item.id);
      }
      renderTargets();
      void updateSceneSelection([item.id], next, false);
    };
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-factor], [data-outcome]")) return;
      toggle();
    });
    targetList.appendChild(row);
  }
  updateControls();
}
function renderBulkActions() {
  bulkActions.replaceChildren();
  if (mode === QUICK_HP_MODES.SAVE && !spellUsesSaveOutcomes()) return;
  const options = mode === QUICK_HP_MODES.SAVE ? outcomeOptions : factorOptions;
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small";
    button.textContent = mode === QUICK_HP_MODES.SAVE ? option.label : option.title;
    button.title = "Imposta " + (mode === QUICK_HP_MODES.SAVE ? option.label.toLowerCase() : option.title.toLowerCase()) + " sui bersagli selezionati";
    button.addEventListener("click", () => {
      for (const item of selectedTargetItems()) {
        if (mode === QUICK_HP_MODES.SAVE) {
          saveOutcomes.set(item.id, option.value);
          if (option.value !== SAVE_OUTCOMES.IMMUNE) factors.set(item.id, factorForOutcome(option.value));
        } else factors.set(item.id, option.value);
      }
      renderTargets();
    });
    bulkActions.appendChild(button);
  }
}
async function loadTargets() {
  const metadata = await OBR.scene.getMetadata();
  const state = metadata && metadata[STATE_KEY] || { order: [] };
  const orderedIds = Array.from(new Set((Array.isArray(state.order) ? state.order : []).map(splitVirtualId).filter(isRealTokenId)));
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const orderedSet = new Set(orderedIds);
  const items = await OBR.scene.items.getItems((item) => {
    const meta = item.metadata && item.metadata[META_KEY];
    return !!meta && (meta.inInitiative === true || orderedSet.has(item.id));
  });
  items.sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ai !== bi ? ai - bi : displayName(a).localeCompare(displayName(b), "it");
  });
  targets = items;
  for (const item of targets) if (!factors.has(item.id)) factors.set(item.id, QUICK_HP_FACTORS.FULL);
}

function zoneTriggerDamageSummary(activation) {
  const damage = activation?.damage;
  if (!damage?.dice || !damage?.type) return "";
  const save = damage.onSave === "half" ? ", metà se superato" : "";
  return ` Danno suggerito: ${damage.dice} ${damage.type}${save}.`;
}

async function loadPendingZoneTriggerPreset(
  preferredActivationId = "",
  { allowBusy = false } = {},
) {
  if (busy && !allowBusy) return false;
  const zoneItems = await OBR.scene.items.getItems((item) =>
    item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root"
    || !!item?.metadata?.[SPELL_AURA_META_KEY]
  );
  const pending = pendingSpellZoneTriggerActivations(zoneItems);
  const preferred = String(preferredActivationId || "").trim();
  const activation = pending.find((entry) => entry.id === preferred)
    || pending[0]
    || null;
  if (!activation) return false;
  const spell = getSpellDefinition(activation.spellId);
  const availableIds = new Set(targets.map((item) => item.id));
  const targetIds = activation.targetIds.filter((id) => availableIds.has(id));
  if (!spell || !targetIds.length) return false;
  const casterAvailable = !activation.casterId
    || targets.some((item) => item.id === activation.casterId);
  if (!casterAvailable) return false;

  activeZoneTrigger = activation;
  pendingSpellAreaPlacement = null;
  mode = QUICK_HP_MODES.SAVE;
  areaEffectTab = "spell";
  spellSelect.value = spell.id;
  const searchEntry = spellSearchEntries.find((entry) => entry.id === spell.id);
  spellSearch.value = searchEntry?.label || spell.displayName || spell.name || "";
  refreshSpellRuleChoices();
  if (
    activation.ruleChoice
    && [...spellRuleChoice.options].some(
      (option) => option.value === activation.ruleChoice
    )
  ) {
    spellRuleChoice.value = activation.ruleChoice;
  }
  spellCasterSelect.value = activation.casterId || "";
  selectedIds = new Set(targetIds);
  saveOutcomes.clear();
  amountInput.value = "0";
  renderTargets();
  await updateSceneSelection(targetIds, true, true);
  status.textContent = `${activation.label}. Imposta gli esiti del tiro salvezza.${zoneTriggerDamageSummary(activation)}`;
  amountInput.focus();
  amountInput.select();
  return true;
}

async function loadQuickActionPreset() {
  if (!QUICK_ACTION_SOURCE_ID || !QUICK_ACTION_ID) return false;
  const [source] = await OBR.scene.items.getItems([QUICK_ACTION_SOURCE_ID]).catch(() => []);
  if (!source) return false;
  const action = findQuickAction(getInitiativeCard(source), QUICK_ACTION_ID);
  if (action?.kind !== "spell" || action.workflow !== "area") return false;
  const spell = getSpellDefinition(action.spellId);
  if (!spell || !areaSaveSpells.some((entry) => entry.id === spell.id)) return false;

  activeZoneTrigger = null;
  pendingSpellAreaPlacement = null;
  targetSelectionLocked = false;
  mode = QUICK_HP_MODES.SAVE;
  areaEffectTab = "spell";
  spellSelect.value = spell.id;
  const searchEntry = spellSearchEntries.find((entry) => entry.id === spell.id);
  spellSearch.value = searchEntry?.label || spell.displayName || spell.name || "";
  refreshSpellRuleChoices();
  if ([...spellCasterSelect.options].some((option) => option.value === source.id)) {
    spellCasterSelect.value = source.id;
  }
  if (action.targetMode === "self" && itemForId(source.id)) {
    selectedIds = new Set([source.id]);
  }
  saveOutcomes.clear();
  amountInput.value = "0";
  status.textContent = `Azione rapida: ${action.label}. Verifica bersagli, danno ed esiti.`;
  renderTargets();
  amountInput.focus();
  amountInput.select();
  return true;
}

function zoneTriggerMatchesForm(activation, spell, targetIds) {
  if (!activation || !spell) return false;
  if (activation.spellId !== spell.id) return false;
  if (activation.casterId !== spellCasterSelect.value.trim()) return false;
  const selected = Array.from(new Set(targetIds)).sort();
  const expected = Array.from(new Set(activation.targetIds)).sort();
  return selected.length === expected.length
    && selected.every((targetId, index) => targetId === expected[index]);
}

async function zoneTriggerRootItems(activation) {
  if (!activation?.zoneItemId) return [];
  const items = await OBR.scene.items.getItems([activation.zoneItemId]);
  return items.filter((item) =>
    pendingSpellZoneTriggerActivations([item]).some(
      (entry) => entry.id === activation.id
    )
  );
}

async function consumeZoneTriggerActivation(activation) {
  await OBR.scene.items.updateItems([activation.zoneItemId], (drafts) => {
    for (const item of drafts) {
      const metadataKey = item.metadata?.[SPELL_STATIC_ZONE_META_KEY]
        ? SPELL_STATIC_ZONE_META_KEY
        : item.metadata?.[SPELL_AURA_META_KEY]
          ? SPELL_AURA_META_KEY
          : "";
      const metadata = item.metadata?.[metadataKey];
      if (!metadataKey || !metadata) continue;
      item.metadata = {
        ...(item.metadata || {}),
        [metadataKey]: {
          ...metadata,
          triggerRuntime: consumeSpellZoneTrigger(
            metadata.triggerRuntime,
            activation.id,
          ),
        },
      };
    }
  });
}

async function restoreZoneTriggerRoot(snapshot) {
  if (!snapshot?.id) return;
  await OBR.scene.items.updateItems([snapshot.id], (drafts) => {
    for (const item of drafts) {
      if (item.id !== snapshot.id) continue;
      const metadataKey = snapshot.metadata?.[SPELL_STATIC_ZONE_META_KEY]
        ? SPELL_STATIC_ZONE_META_KEY
        : snapshot.metadata?.[SPELL_AURA_META_KEY]
          ? SPELL_AURA_META_KEY
          : "";
      const metadata = snapshot.metadata?.[metadataKey];
      if (!metadataKey || !metadata) continue;
      item.metadata = {
        ...(item.metadata || {}),
        [metadataKey]: metadata,
      };
    }
  });
}

function portraitUrl(item) {
  return String(item && item.image && (item.image.url || item.image.src) || item && item.asset && item.asset.image && item.asset.image.url || "");
}
async function showConcentrationWarnings(entries) {
  if (mode !== QUICK_HP_MODES.DAMAGE && mode !== QUICK_HP_MODES.SAVE) return;
  if (mode === QUICK_HP_MODES.SAVE && spellUsesAreaHealing()) return;
  const warnings = entries.filter((entry) => {
    const concentration = entry.item.metadata && entry.item.metadata[META_KEY] && entry.item.metadata[META_KEY][CONCENTRATION_KEY];
    return entry.change.requested > 0 && concentration && typeof concentration === "object" && Object.keys(concentration).length > 0;
  }).map((entry) => ({
    name: displayName(entry.item),
    damage: entry.change.requested,
    dc: Math.max(10, Math.floor(entry.change.requested / 2)),
    portrait: portraitUrl(entry.item),
    attitude: entry.item.metadata[META_KEY].attitude || "neutral",
  }));
  if (warnings.length) {
    await OBR.broadcast.sendMessage(CONCENTRATION_WARNING_CHANNEL, {
      type: "show-concentration-warning", warnings, createdAt: Date.now(),
    }, { destination: "ALL" });
  }
}
async function showEffectSaveDamageWarnings(entries) {
  if (mode !== QUICK_HP_MODES.DAMAGE && mode !== QUICK_HP_MODES.SAVE) return;
  if (mode === QUICK_HP_MODES.SAVE && spellUsesAreaHealing()) return;
  const damageById = new Map(entries
    .filter((entry) => entry.change.requested > 0)
    .map((entry) => [entry.item.id, entry.change.requested]));
  if (!damageById.size) return;
  const itemsById = new Map(targets.map((item) => [item.id, item]));
  for (const entry of entries) itemsById.set(entry.item.id, entry.item);
  const notices = effectSaveReminderNoticesForDamage({
    items: [...itemsById.values()],
    damageById,
    eventId: `${Date.now()}-${++effectSaveDamageSequence}`,
  });
  if (!notices.length) return;
  await OBR.broadcast.sendMessage(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, {
    type: "show-effect-save-notices",
    notices,
  }, { destination: "ALL" });
}
function setBusy(next) {
  busy = !!next;
  renderTargets();
}
async function placeSelectedSpellArea() {
  if (busy) return;
  const presentation = quickHpAreaPlacementPresentation({
    spellId: selectedAreaSpell()?.id,
    casterId: spellCasterSelect.value.trim(),
  });
  if (!presentation.rule || presentation.disabled) return;

  setBusy(true);
  status.textContent = "Posiziona la sagoma sulla mappa e confermala.";
  try {
    const result = await requestSpellAreaPlacement({
      ruleId: presentation.rule.id,
      casterId: spellCasterSelect.value.trim(),
    }, {
      broadcast: OBR.broadcast,
      windowRef: window,
    });
    if (result.status === "cancelled") {
      status.textContent = "Posizionamento della sagoma annullato.";
      return;
    }
    if (result.status !== "confirmed") {
      status.textContent = "Impossibile completare il posizionamento della sagoma.";
      return;
    }

    const targetIds = confirmedSpellAreaTargetIds(
      result,
      targets.map((item) => item.id),
    );
    pendingSpellAreaPlacement = presentation.rule.kind === "zone"
      ? {
        ruleId: presentation.rule.id,
        spellId: presentation.rule.spellId,
        casterId: spellCasterSelect.value.trim(),
        preview: result.preview,
      }
      : null;
    saveOutcomes.clear();
    selectedIds = new Set(targetIds);
    if (!AREA_SAVE_SPELL_ID_SET.has(presentation.rule.spellId)) {
      for (const targetId of targetIds) {
        saveOutcomes.set(targetId, SAVE_OUTCOMES.FAILED);
      }
    }
    targetSelectionLocked = true;
    if (targetIds.length) {
      await updateSceneSelection(targetIds, true, true);
    } else {
      await OBR.player.deselect();
    }
    status.textContent = targetIds.length
      ? `Sagoma confermata: ${targetIds.length} ${targetIds.length === 1 ? "bersaglio" : "bersagli"}.`
      : "Sagoma confermata: nessun bersaglio nell'area.";
  } catch (error) {
    console.error("[quick-hp] spell area placement:", error);
    status.textContent = "Impossibile avviare il posizionamento della sagoma.";
  } finally {
    busy = false;
    renderTargets();
  }
}

function syncHPVisualUpdates(updates = []) {
  for (const update of updates) {
    syncHPBarNow(update.tokenId, update.hp, update.hpMax);
  }
  return syncHPTextBatchNow(updates);
}

async function readAuthoritativeHPVisualUpdates(itemIds = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (!ids.length) return [];
  const items = await OBR.scene.items.getItems(ids);
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  return items.filter(hasTrackedHP).map((item) => {
    const meta = item.metadata?.[META_KEY] || {};
    return {
      tokenId: item.id,
      hp: Math.max(0, Math.floor(Number(meta.hp) || 0)),
      hpMax: Math.max(0, Math.floor(Number(meta.hpMax) || 0)),
    };
  });
}

async function applyOperation() {
  if (busy) return;
  const selectedItems = selectedTargetItems();
  const candidateIds = selectedItems.map((item) => item.id);
  const spell = mode === QUICK_HP_MODES.SAVE ? selectedAreaSpell() : null;
  const placementRule = quickHpAreaPlacementPresentation({
    spellId: spell?.id,
    casterId: spellCasterSelect.value.trim(),
  }).rule;
  const staticZonePlacement = pendingStaticZonePlacement(
    placementRule,
    spell,
    spellCasterSelect.value.trim(),
  );
  const mobileAuraPlacement = placementRule?.kind === "aura";
  if (!candidateIds.length && !staticZonePlacement && !mobileAuraPlacement) return;
  if (
    mode === QUICK_HP_MODES.SAVE
    && spellUsesSaveOutcomes(spell)
    && !selectedItems.every((item) => saveOutcomes.has(item.id))
  ) {
    status.textContent = "Imposta un esito per ogni bersaglio.";
    return;
  }
  setBusy(true);
  status.textContent = "";
  const operationSceneEpoch = currentSceneEpoch();
  let hpVisualTransaction = null;
  try {
    const liveItems = await OBR.scene.items.getItems(candidateIds);
    const factorSnapshot = new Map(factors);
    const entries = liveItems.filter(hasTrackedHP).map((item) => {
      const meta = item.metadata[META_KEY] || {};
      const outcome = areaOutcomeFor(item.id, spell);
      const change = calculateQuickHPChange({
        mode: mode === QUICK_HP_MODES.SAVE
          ? spellUsesAreaHealing(spell)
            ? QUICK_HP_MODES.HEAL
            : QUICK_HP_MODES.DAMAGE
          : mode,
        value: mode === QUICK_HP_MODES.SAVE && outcome === SAVE_OUTCOMES.IMMUNE
          ? 0
          : currentValue(),
        factor: mode === QUICK_HP_MODES.SAVE
          ? factorForOutcome(outcome)
          : factorSnapshot.get(item.id) || QUICK_HP_FACTORS.FULL,
        hp: meta.hp,
        hpMax: meta.hpMax,
      });
      return { item, change };
    }).filter((entry) => entry.change.changed);
    const requestedZoneTrigger = mode === QUICK_HP_MODES.SAVE
      && zoneTriggerMatchesForm(activeZoneTrigger, spell, candidateIds)
      ? activeZoneTrigger
      : null;
    const triggerRootItems = requestedZoneTrigger
      ? await zoneTriggerRootItems(requestedZoneTrigger)
      : [];
    if (requestedZoneTrigger && !triggerRootItems.length) {
      activeZoneTrigger = null;
      status.textContent = "L'attivazione della zona non è più disponibile.";
      return;
    }
    const conditionName = mode === QUICK_HP_MODES.SAVE && !catalogSaveAutomation(spell)
      ? conditionSelect.value.trim()
      : "";
    const initiativeState = mode === QUICK_HP_MODES.SAVE
      ? (await OBR.scene.getMetadata())?.[STATE_KEY] || {}
      : null;
    const appliedAt = initiativeState
      ? {
        round: Math.max(1, Number(initiativeState.round || 1)),
        actorId: await currentInitiativeActorId() || null,
        phase: "turn",
        turnKey: currentInitiativeTurnKey(initiativeState),
      }
      : null;
    let effectOperations = [];
    let effectSubjectIds = [];
    let spellInstanceId = "";
    let concentrationAction = "";
    if (mode === QUICK_HP_MODES.SAVE && spell) {
      const automation = currentSaveAutomation(spell);
      const resolution = resolveSaveSpellResolution({
        spell,
        casterId: spellCasterSelect.value.trim(),
        targetIds: liveItems.map((item) => item.id),
        outcomes: spellUsesSaveOutcomes(spell)
          ? saveOutcomes
          : new Map(liveItems.map((item) => [item.id, SAVE_OUTCOMES.FAILED])),
        automation,
        allowEmptyTargets: !!staticZonePlacement || mobileAuraPlacement,
      });
      if (!resolution.valid) {
        status.textContent = resolution.errors.includes("caster-required")
          ? "Seleziona il caster dello spell concentrato."
          : resolution.errors.includes("outcomes-incomplete")
            ? "Imposta un esito per ogni bersaglio."
            : "La configurazione dello spell non è completa.";
        return;
      }
      if (mobileAuraPlacement && resolution.casterId) {
        resolution.spellTargetIds = Array.from(new Set([
          ...resolution.spellTargetIds,
          resolution.casterId,
        ]));
      }
      effectSubjectIds = Array.from(new Set([
        ...resolution.spellTargetIds,
        ...resolution.conditionApplications.flatMap((application) => application.targetIds),
      ]));
      const caster = itemForId(resolution.casterId);
      if (requestedZoneTrigger) {
        concentrationAction = "trigger";
        spellInstanceId = requestedZoneTrigger.instanceId;
        effectOperations = saveSpellTriggerResolutionOperations({
          resolution,
          instanceId: spellInstanceId,
          casterName: caster ? displayName(caster) : "",
          turns: remainingSpellTurnsForInstance(
            spellInstanceId,
            spell.defaultTurns || 1,
          ),
          spellExpiry: spell.concentration
            ? { mode: "concentration" }
            : spell.expiry || null,
          appliedAt,
        });
      } else {
        const activeSpellConcentration = activeConcentrationForSpell(caster, spell);
        concentrationAction = automation?.concentrationAction === "dismiss"
          ? "dismiss"
          : activeSpellConcentration?.instanceId
            ? "extend"
            : "replace";
        spellInstanceId = concentrationAction === "extend"
          ? String(activeSpellConcentration.instanceId)
          : createSpellInstanceId();
        effectOperations = saveSpellResolutionOperations({
          resolution,
          instanceId: spellInstanceId,
          casterName: caster ? displayName(caster) : "",
          turns: spell.defaultTurns || 1,
          spellExpiry: spell.concentration ? { mode: "concentration" } : spell.expiry || null,
          appliedAt,
          concentrationAction,
          castContext: mobileAuraPlacement
            ? { mobileAura: true }
            : null,
        });
      }
    } else if (mode === QUICK_HP_MODES.SAVE && conditionName) {
      effectSubjectIds = failedQuickHPTargetIds(liveItems, saveOutcomes);
      if (effectSubjectIds.length) {
        effectOperations = conditionMutationOperations({
          targetIds: effectSubjectIds,
          conditionName,
          options: conditionOptions(appliedAt),
          automate: true,
        });
      }
    }
    if (staticZonePlacement) {
      const hasTrackedSpellInstance = effectOperations.some(
        (operation) => operation?.type === "spell:upsert"
          && String(operation?.instanceId || "").trim() === spellInstanceId
      );
      const ownerOperation = staticSpellZoneOwnerOperation({
        rule: placementRule,
        spell,
        instanceId: spellInstanceId,
        casterId: spellCasterSelect.value.trim(),
        appliedAt,
        trackConcentration: spell?.concentration === true && !hasTrackedSpellInstance,
        ruleChoice: selectedSaveRuleChoice(),
      });
      if (ownerOperation) effectOperations.push(ownerOperation);
      const passiveTargetIds = confirmedSpellAreaTargetIds({
        status: "confirmed",
        preview: staticZonePlacement.preview,
      }, targets.map((item) => item.id));
      const caster = itemForId(spellCasterSelect.value.trim());
      const passivePlan = areaMembershipPlan({
        instanceId: spellInstanceId,
        sourceId: spellCasterSelect.value.trim(),
        rule: placementRule,
        desiredTargetIds: passiveTargetIds,
        items: targets,
        metaKey: META_KEY,
        sourceName: caster ? displayName(caster) : "",
        defaultExpiry: { mode: "manual" },
      });
      effectOperations.push(...passivePlan.operations);
      effectSubjectIds = Array.from(new Set([
        ...effectSubjectIds,
        ...passiveTargetIds,
      ]));
    }
    const breaksExistingConcentration = effectOperations.some(
      (operation) => operation.type === "concentration:break"
    );
    const previousStaticZoneItems = breaksExistingConcentration
      ? await getStaticSpellZoneItems({
        casterId: spellCasterSelect.value.trim(),
      })
      : staticZonePlacement
        ? await getStaticSpellZoneItems({ instanceId: spellInstanceId })
        : [];
    const nextStaticZoneItems = staticZonePlacement
      ? buildStaticSpellZoneItems({
        ruleId: staticZonePlacement.ruleId,
        instanceId: spellInstanceId,
        casterId: spellCasterSelect.value.trim(),
        spellName: spell?.displayName || spell?.name,
        preview: staticZonePlacement.preview,
        ruleChoice: selectedSaveRuleChoice(),
      })
      : [];
    if (
      !entries.length
      && !effectOperations.length
      && !nextStaticZoneItems.length
      && !requestedZoneTrigger
    ) {
      status.textContent = "Nessuna modifica da applicare.";
      return;
    }
    let recordedEntry = null;
    const ids = entries.map((entry) => entry.item.id);
    const zeroHPReconcileIds = quickHPZeroReconcileTargetIds(entries, (entry) => {
      const meta = entry.item.metadata?.[META_KEY] || {};
      return resolveZeroHPUnconsciousAction(
        {
          ...meta,
          hp: entry.change.afterHP,
          hpMax: entry.change.hpMax,
        },
        getConditionInstances(meta.conditions || {}),
      );
    });
    const affectedIds = Array.from(new Set([
      ...ids,
      ...effectSubjectIds,
      ...(requestedZoneTrigger ? candidateIds : []),
    ]));
    const historyIds = Array.from(new Set([
      ...ids,
      ...effectSubjectIds,
      ...await getZeroHPConditionHistoryIds(ids),
    ]));
    const staticZoneSceneItemIds = Array.from(new Set([
      ...previousStaticZoneItems.map((item) => item.id),
      ...nextStaticZoneItems.map((item) => item.id),
      ...triggerRootItems.map((item) => item.id),
    ].filter(Boolean)));
    let coordinatedMutation = null;
    const optimisticHPVisualUpdates = quickHPVisualUpdates(entries);
    if (optimisticHPVisualUpdates.length && isCurrentSceneEpoch(operationSceneEpoch)) {
      hpVisualTransaction = createQuickHPVisualTransaction(optimisticHPVisualUpdates, {
        syncVisuals: syncHPVisualUpdates,
        onPreviewError: (error) => {
          console.warn("[quick-hp] optimistic HP visual sync:", error?.message || error);
        },
      });
    }
    await withItemMetaHistory({
      kind: mode === QUICK_HP_MODES.SAVE ? "save-resolution" : "hp",
      label: mode === QUICK_HP_MODES.SAVE
        ? "Effetti ad area: " + currentValue() + (spell ? " · " + spell.displayName : "") + " - " + affectedIds.length + " bersagli"
        : modeLabel().charAt(0).toUpperCase() + modeLabel().slice(1) + " rapido: " + currentValue() + " - " + ids.length + " bersagli",
      itemIds: historyIds,
      sceneItemIds: staticZoneSceneItemIds,
      fields: ["hp", "hpMax", "conditions", SPELLS_KEY, CONCENTRATION_KEY],
      onRecorded: (entry) => { recordedEntry = entry; },
      decorateEntry: (entry) => quickHpEffectsHistoryEntry(entry, coordinatedMutation),
    }, async () => {
      let removedPreviousZone = false;
      let addedNextZone = false;
      let consumedZoneTrigger = false;
      try {
        if (previousStaticZoneItems.length) {
          await OBR.scene.items.deleteItems(previousStaticZoneItems.map((item) => item.id));
          removedPreviousZone = true;
        }
        if (nextStaticZoneItems.length) {
          await OBR.scene.items.addItems(nextStaticZoneItems);
          addedNextZone = true;
        }
        if (entries.length) {
          const updates = new Map(entries.map((entry) => [entry.item.id, entry.change]));
          await OBR.scene.items.updateItems(ids, (drafts) => {
            for (const item of drafts) {
              const update = updates.get(item.id);
              if (!update) continue;
              const previous = item.metadata && item.metadata[META_KEY] || {};
              item.metadata = Object.assign({}, item.metadata || {}, {
                [META_KEY]: Object.assign({}, previous, { hp: update.afterHP, hpMax: update.hpMax }),
              });
            }
          });
        }
        const coordinatedOperations = [
          ...(zeroHPReconcileIds.length ? [{
            type: "condition:reconcile-zero-hp",
            targetIds: zeroHPReconcileIds,
          }] : []),
          ...effectOperations,
        ];
        if (coordinatedOperations.length) {
          // Il coordinatore legge e prepara sullo stato post-HP in testa alla
          // propria coda; non esiste piu un piano preparato prima dell'azione.
          coordinatedMutation = await runEffectsMutation(coordinatedOperations, {
            history: false,
            kind: mode === QUICK_HP_MODES.SAVE ? "save-resolution" : "hp-effects",
            label: "Effetti collegati alla modifica HP",
            targetIds: Array.from(new Set([...ids, ...effectSubjectIds])),
          });
          requireAppliedEffectsMutation(coordinatedMutation);
        }
        if (requestedZoneTrigger) {
          await consumeZoneTriggerActivation(requestedZoneTrigger);
          consumedZoneTrigger = true;
        }
      } catch (error) {
        if (addedNextZone) {
          await OBR.scene.items.deleteItems(
            nextStaticZoneItems.map((item) => item.id)
          ).catch(() => {});
        }
        if (removedPreviousZone) {
          await OBR.scene.items.addItems(previousStaticZoneItems).catch(() => {});
        }
        if (consumedZoneTrigger) {
          await restoreZoneTriggerRoot(triggerRootItems[0]).catch(() => {});
        }
        throw error;
      }
    });
    if (hpVisualTransaction) await hpVisualTransaction.completion;

    await Promise.all([
      syncHPBatchToMemory(entries.map((entry) => ({
        itemId: entry.item.id,
        hp: entry.change.afterHP,
        hpMax: entry.change.hpMax,
      })), {
        sceneEpoch: operationSceneEpoch,
        items: entries.map((entry) => entry.item),
      }).catch((error) => console.warn("[quick-hp] HP memory:", error && error.message || error)),
      showConcentrationWarnings(entries).catch((error) => console.warn("[quick-hp] concentration warning:", error && error.message || error)),
      showEffectSaveDamageWarnings(entries).catch((error) => console.warn("[quick-hp] effect save reminder:", error && error.message || error)),
    ]);
    lastEntryId = recordedEntry && recordedEntry.id || "";
    lastZoneTriggerActivationId = requestedZoneTrigger?.id || "";
    if (requestedZoneTrigger) activeZoneTrigger = null;
    undoButton.hidden = !lastEntryId;
    const affectedCount = affectedIds.length;
    status.textContent = mode === QUICK_HP_MODES.SAVE
      ? "Risoluzione applicata a " + affectedCount + " bersagli."
      : "Applicato a " + entries.length + " bersagli.";
    pendingSpellAreaPlacement = null;
    targetSelectionLocked = false;
    await loadTargets();
    await refreshConditionSourceOptions();
    if (requestedZoneTrigger) {
      await loadPendingZoneTriggerPreset("", { allowBusy: true });
    }
  } catch (error) {
    console.error("[quick-hp] apply:", error);
    if (hpVisualTransaction) {
      await hpVisualTransaction.recover((itemIds) => (
        readAuthoritativeHPVisualUpdates(itemIds, operationSceneEpoch)
      )).catch((syncError) => {
        console.warn("[quick-hp] HP visual recovery:", syncError?.message || syncError);
      });
    }
    status.textContent = "Applicazione non riuscita.";
  } finally {
    busy = false;
    renderTargets();
  }
}
async function undoLastOperation() {
  if (busy || !lastEntryId) return;
  setBusy(true);
  try {
    const zoneTriggerActivationId = lastZoneTriggerActivationId;
    const history = await getHistoryEntries();
    const latest = history[history.length - 1];
    if (!latest || latest.id !== lastEntryId) {
      status.textContent = "Sono presenti modifiche successive: usa la Cronologia.";
      lastEntryId = "";
      undoButton.hidden = true;
      return;
    }
    await undoHistoryThrough(lastEntryId);
    lastEntryId = "";
    lastZoneTriggerActivationId = "";
    undoButton.hidden = true;
    status.textContent = "Ultima applicazione annullata.";
    await loadTargets();
    await refreshConditionSourceOptions();
    if (zoneTriggerActivationId) {
      await loadPendingZoneTriggerPreset(
        zoneTriggerActivationId,
        { allowBusy: true },
      );
    }
  } catch (error) {
    console.error("[quick-hp] undo:", error);
    status.textContent = "Undo non riuscito.";
  } finally {
    busy = false;
    renderTargets();
  }
}
function closePopover() {
  void OBR.broadcast.sendMessage(TOGGLE_CHANNEL, { type: "closed", id: MODAL_ID }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (busy) return;
    mode = button.dataset.mode;
    if (mode !== QUICK_HP_MODES.SAVE) targetSelectionLocked = false;
    if (mode !== QUICK_HP_MODES.SAVE) activeZoneTrigger = null;
    status.textContent = "";
    renderTargets();
  });
});
for (const button of areaEffectTabButtons) {
  button.addEventListener("click", () => {
    if (busy) return;
    areaEffectTab = button.dataset.areaEffectTab;
    status.textContent = "";
    renderTargets();
  });
}
areaPlacementButton.addEventListener("click", () => void placeSelectedSpellArea());
spellSelect.addEventListener("change", () => {
  activeZoneTrigger = null;
  pendingSpellAreaPlacement = null;
  targetSelectionLocked = false;
  status.textContent = "";
  refreshSpellRuleChoices();
  renderTargets();
});
spellRuleChoice.addEventListener("change", () => {
  status.textContent = "";
  renderTargets();
});
spellSearch.addEventListener("input", () => {
  syncSpellSelectionFromSearch(false);
  openSpellMenu(spellSearch.value);
});
spellSearch.addEventListener("change", () => syncSpellSelectionFromSearch(true));
spellSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSpellMenu();
  else if (event.key === "ArrowDown" && spellMenu.hidden) {
    event.preventDefault();
    openSpellMenu(spellSearch.value);
  }
});
spellMenuToggle.addEventListener("click", () => {
  if (spellMenu.hidden) {
    openSpellMenu("");
    spellSearch.focus();
  } else closeSpellMenu();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".spell-combobox")) closeSpellMenu();
});
conditionSelect.addEventListener("change", () => {
  status.textContent = "";
  renderTargets();
});
spellCasterSelect.addEventListener("change", () => {
  activeZoneTrigger = null;
  pendingSpellAreaPlacement = null;
  targetSelectionLocked = false;
  status.textContent = "";
  renderTargets();
});
conditionSourceSelect.addEventListener("change", () => {
  conditionActorSelect.value = conditionSourceSelect.value.trim() ? "source" : "target";
  renderTargets();
});
conditionExpirySelect.addEventListener("change", renderTargets);
conditionActorSelect.addEventListener("change", renderTargets);
conditionDurationInput.addEventListener("input", renderTargets);
amountInput.addEventListener("input", () => {
  amountInput.value = String(amountInput.value || "").replace(/\D+/g, "").slice(0, 5);
  status.textContent = "";
  renderTargets();
});
amountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !applyButton.disabled) void applyOperation();
});
window.addEventListener("keydown", (event) => {
  if (!shouldHandleQuickHPUndoShortcut({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    busy,
    hasHistoryEntry: !!lastEntryId,
  })) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void undoLastOperation();
}, true);
targetNameFilter.addEventListener("input", renderTargets);
unlockTargetsButton.addEventListener("click", () => {
  if (busy || !targetSelectionLocked) return;
  targetSelectionLocked = false;
  status.textContent = "Selezione bersagli sbloccata per la correzione manuale.";
  renderTargets();
});
for (const button of factionFilterButtons) {
  button.addEventListener("click", () => {
    const faction = button.dataset.hpFaction;
    if (activeFactionFilters.has(faction)) activeFactionFilters.delete(faction);
    else activeFactionFilters.add(faction);
    const active = activeFactionFilters.has(faction);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    renderTargets();
  });
}
applyButton.addEventListener("click", () => void applyOperation());
undoButton.addEventListener("click", () => void undoLastOperation());
closeButton.addEventListener("click", closePopover);
window.addEventListener("beforeunload", () => {
  if (selectionUnsubscribe) selectionUnsubscribe();
  if (selectionTimer) window.clearInterval(selectionTimer);
  zoneTriggerRequestUnsubscribe?.();
});
OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") {
    targetList.textContent = "La console HP rapida e disponibile solo per il GM.";
    return;
  }
  renderBulkActions();
  mountSelectionSync();
  await loadTargets();
  await refreshConditionSourceOptions();
  renderTargets();
  await refreshSelectionFromScene();
  if (await loadQuickActionPreset()) return;
  if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) {
    zoneTriggerRequestUnsubscribe = OBR.broadcast.onMessage(
      TRACKER_PANEL_REQUEST_CHANNEL,
      (event) => {
        const data = event?.data;
        if (
          data?.type === "open"
          && data.panel === "quick-hp"
          && data.zoneTrigger?.activationId
        ) {
          void loadPendingZoneTriggerPreset(data.zoneTrigger.activationId);
        }
      },
    );
    if (await loadPendingZoneTriggerPreset()) return;
  }
  amountInput.focus();
  amountInput.select();
});
