import OBR from "@owlbear-rodeo/sdk";
import {
  ID,
  TRACKER_PANEL_REQUEST_CHANNEL,
} from "./constants.js";
import {
  SAVE_KEYS,
  getInitiativeCard,
  loadInitiativeCard,
  hasInitiativeCardValues,
  saveInitiativeCard,
} from "./initiativeCards.js";
import {
  APPLICABLE_CONDITION_LIST,
  formatConditionName,
} from "./conditions.js";
import {
  getSpellDefinition,
  getQuickActionSpellOptions,
} from "./spells-srd.js";
import {
  MAX_QUICK_ACTIONS,
  quickActionPanel,
  sanitizeQuickActions,
} from "./quickActionsCore.js";
import { executeDirectQuickAction } from "./quickActionExecution.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CLASSES,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureBuildLabel,
  classFeatureTargeting,
  classFeatureTargetMode,
  getAvailableClassFeatures,
  getClassFeatureSubclasses,
  getEnabledClassFeatures,
} from "./classFeatureCatalog.js";
import {
  MAX_CHARACTER_CLASSES,
  activeClassFeatureInstances,
  classFeatureChoiceOptions,
  classFeatureDisplayName,
  classFeatureDurationParentFeatureId,
  classFeatureDurationTiming,
  classFeatureEffectProjection,
  classFeatureRuntimeSupport,
  classFeatureTheme,
  classFeatureRemainingRounds,
  classFeatureResourceEntries,
  sanitizeCharacterBuild,
} from "./classFeatureCore.js";
import {
  activateClassFeature,
  adjustClassFeatureResource,
  deactivateClassFeature,
  getClassFeatureState,
} from "./classFeatureRuntime.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/initiative-card-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";

function closeInitiativeCardPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
const sourceId = new URLSearchParams(window.location.search).get("source") || "";
const labels = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };
const $ = (id) => document.getElementById(id);

let item = null;
let profile = null;
let isGM = false;
let exhaustionSaving = false;
let quickActionLaunching = false;
let classFeatureMutating = false;
let currentRoundValue = 1;
let draftEnabledFeatureIds = new Set();
let draftKnownAvailableFeatureIds = new Set();
let activeCardTab = "stats";
let editing = false;

const spellOptions = getQuickActionSpellOptions();
const spellOptionsById = new Map(spellOptions.map((entry) => [entry.id, entry]));

function requestPopoverHeight(height) {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "resize",
    id: MODAL_ID,
    height,
  }, { destination: "LOCAL" }).catch(() => {});
}

function setQuickActionsTabCount(count) {
  $("quickActionsTabCount").textContent = String(Math.max(0, Number(count) || 0));
}

function setClassFeaturesTabCount(count) {
  $("classFeaturesTabCount").textContent = String(Math.max(0, Number(count) || 0));
}

function syncCardTabs() {
  const quickActionsActive = activeCardTab === "quick-actions";
  const classFeaturesActive = activeCardTab === "class-features";
  const statsActive = !quickActionsActive && !classFeaturesActive;
  $("statsTab").setAttribute("aria-selected", statsActive ? "true" : "false");
  $("quickActionsTab").setAttribute("aria-selected", quickActionsActive ? "true" : "false");
  $("classFeaturesTab").setAttribute("aria-selected", classFeaturesActive ? "true" : "false");
  $("statsTab").tabIndex = statsActive ? 0 : -1;
  $("quickActionsTab").tabIndex = quickActionsActive ? 0 : -1;
  $("classFeaturesTab").tabIndex = classFeaturesActive ? 0 : -1;
  $("view").hidden = editing || !statsActive;
  $("quickActionsView").hidden = editing || !quickActionsActive;
  $("classFeaturesView").hidden = editing || !classFeaturesActive;
  $("statsEditPane").hidden = !editing || !statsActive;
  $("quickActionsEditPane").hidden = !editing || !quickActionsActive;
  $("classFeaturesEditPane").hidden = !editing || !classFeaturesActive;
  $("form").classList.toggle("active", editing);
  $("edit").style.display = isGM && !editing ? "inline-block" : "none";
  requestPopoverHeight(editing
    ? (classFeaturesActive ? 760 : quickActionsActive ? 680 : 640)
    : (classFeaturesActive ? 680 : 560));
}

function setCardTab(tab) {
  activeCardTab = tab === "quick-actions" || tab === "class-features"
    ? tab
    : "stats";
  syncCardTabs();
}

function valueText(value, suffix = "") {
  return value === null || value === undefined ? "-" : `${value}${suffix}`;
}

function signedText(value) {
  if (value === null || value === undefined) return "-";
  return value >= 0 ? `+${value}` : String(value);
}

function quickActionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `quick-${globalThis.crypto.randomUUID()}`;
  }
  return `quick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function selectControl(options, value = "") {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function quickActionReference(action) {
  if (action?.kind === "spell") {
    const spell = getSpellDefinition(action.spellId);
    return spell?.catalogLabel || spell?.displayName || spell?.name || action.spellId || "";
  }
  if (action?.kind === "feature") {
    const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
    return feature ? classFeatureDisplayName(feature) : action.featureId || "";
  }
  return action?.conditionName || "";
}

function quickActionSummary(action) {
  const target = action.targetMode === "self" ? "su di sé" : "selezione corrente";
  if (action.kind === "condition") {
    return `${action.conditionName} · ${target}`;
  }
  if (action.kind === "feature") {
    const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
    return `${feature ? classFeatureDisplayName(feature) : "Capacità"} · ${target}`;
  }
  const workflow = action.workflow === "area" ? "Console area" : "Incantesimi";
  return `${workflow} · ${target}`;
}

function classFeatureChoiceControl(feature, { compact = false, label = "" } = {}) {
  const options = classFeatureChoiceOptions(feature);
  if (!options.length) return null;
  const select = document.createElement("select");
  select.className = compact
    ? "class-feature-choice class-feature-choice-compact"
    : "class-feature-choice";
  select.title = label || `Variante di ${feature?.name || "capacità"}`;
  select.setAttribute("aria-label", select.title);
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue.id;
    option.textContent = optionValue.label;
    select.appendChild(option);
  }
  return select;
}

function classFeatureAutoChoiceControls(feature, { compact = false } = {}) {
  const controls = new Map();
  const enabledIds = new Set(
    profile ? getEnabledClassFeatures(profile).map((entry) => entry.id) : []
  );
  for (const childId of Array.isArray(feature?.autoActivateFeatureIds)
    ? feature.autoActivateFeatureIds
    : []) {
    if (!enabledIds.has(childId)) continue;
    const child = CLASS_FEATURE_BY_ID.get(childId);
    const control = child ? classFeatureChoiceControl(child, {
      compact,
      label: `Esito automatico: ${child.name}`,
    }) : null;
    if (control) controls.set(child.id, control);
  }
  return controls;
}

function classFeatureChoiceSelection(control) {
  return control ? String(control.value || "").trim() : "";
}

function classFeatureAutoChoiceSelection(controls) {
  return Object.fromEntries(
    [...(controls instanceof Map ? controls.entries() : [])]
      .map(([featureId, control]) => [featureId, classFeatureChoiceSelection(control)])
      .filter(([, choiceId]) => choiceId),
  );
}

async function launchQuickAction(action, choiceId = "", autoChoiceIds = {}) {
  if (!item || quickActionLaunching) return;
  const panel = quickActionPanel(action);
  if (!panel) return;
  quickActionLaunching = true;
  const status = $("quickActionRunStatus");
  const setStatus = (message, tone = "") => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const setButtonsDisabled = (disabled) => {
    $("quickActions").querySelectorAll("button").forEach((button) => {
      button.disabled = disabled || button.dataset.unsupportedFeature === "1";
    });
  };
  setButtonsDisabled(true);
  setStatus(`Esecuzione: ${action.label}…`);
  try {
    if (action.kind === "feature") {
      if (!isGM) throw new Error("Solo il GM può attivare una capacità.");
      const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
      const targetIds = classFeatureTargetMode(feature) === "selection"
        ? await OBR.player.getSelection().catch(() => [])
        : undefined;
      await activateClassFeature({
        sourceId: item.id,
        featureId: action.featureId,
        targetIds,
        choiceId,
        autoChoiceIds,
      });
      await refreshClassFeatureItem();
      setStatus(`Applicata: ${action.label}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    const result = await executeDirectQuickAction({
      action,
      sourceItem: item,
      confirmConcentration: (message) => window.confirm(message),
    });
    if (result.mode === "executed") {
      setStatus(`Applicata: ${action.label}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    if (result.mode === "cancelled") {
      setStatus(`Annullata: ${action.label}.`);
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }

    if (action.targetMode === "self") {
      await OBR.player.select([item.id], true);
    }
    await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, {
      type: "open",
      panel,
      sourceId: item.id,
      quickActionId: action.id,
    }, { destination: "LOCAL" });
    closeInitiativeCardPopover();
  } catch (error) {
    console.warn("[initiative-card] quick action:", error?.message || error);
    setStatus(`Applicazione non riuscita: ${action.label}.`, "error");
    quickActionLaunching = false;
    setButtonsDisabled(false);
  }
}

function renderQuickActions() {
  const list = $("quickActions");
  const actions = (Array.isArray(profile?.quickActions) ? profile.quickActions : [])
    .filter((action) => isGM || action?.kind !== "feature");
  setQuickActionsTabCount(actions.length);
  list.replaceChildren();
  $("quickActionRunStatus").textContent = "";
  $("quickActionRunStatus").dataset.tone = "";

  if (!actions.length) {
    const empty = document.createElement("div");
    empty.className = "quick-actions-empty";
    empty.textContent = "Nessuna azione rapida configurata.";
    list.appendChild(empty);
    return;
  }

  for (const action of actions) {
    const actionEntry = document.createElement("div");
    actionEntry.className = "quick-action-entry";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-action";
    button.title = `Precompila ${action.label}`;
    const icon = document.createElement("span");
    icon.className = "quick-action-icon";
    const feature = action.kind === "feature"
      ? CLASS_FEATURE_BY_ID.get(action.featureId)
      : null;
    const featureSupport = feature ? classFeatureRuntimeSupport(feature) : null;
    if (featureSupport && !featureSupport.ready) {
      button.disabled = true;
      button.dataset.unsupportedFeature = "1";
      button.title = "Questa capacitÃ  non Ã¨ ancora automatizzata";
    }
    icon.textContent = action.kind === "condition"
      ? "C"
      : feature
        ? classFeatureTheme(feature).emoji
        : "✦";
    const copy = document.createElement("span");
    copy.className = "quick-action-copy";
    const label = document.createElement("strong");
    label.textContent = action.label;
    const summary = document.createElement("small");
    summary.textContent = featureSupport && !featureSupport.ready
      ? `${quickActionSummary(action)} Â· non automatizzata`
      : quickActionSummary(action);
    copy.append(label, summary);
    button.append(icon, copy);
    const choiceControl = feature ? classFeatureChoiceControl(feature, { compact: true }) : null;
    const autoChoiceControls = feature
      ? classFeatureAutoChoiceControls(feature, { compact: true })
      : new Map();
    button.addEventListener("click", () => void launchQuickAction(
      action,
      classFeatureChoiceSelection(choiceControl),
      classFeatureAutoChoiceSelection(autoChoiceControls),
    ));
    actionEntry.appendChild(button);
    if (choiceControl) actionEntry.appendChild(choiceControl);
    for (const control of autoChoiceControls.values()) actionEntry.appendChild(control);
    list.appendChild(actionEntry);
  }
}

function classFeatureActivationLabel(feature) {
  const labelsById = {
    azione: "Azione",
    azione_bonus: "Azione bonus",
    azione_attacco: "Primo attacco",
    reazione: "Reazione",
    innesco: "Innesco",
    scelta: "Scelta",
  };
  const activation = String(feature?.activation?.primary || "non_specificata");
  return labelsById[activation]
    || activation.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function classFeatureMetaText(feature) {
  const targeting = classFeatureTargeting(feature);
  const runtimeSupport = classFeatureRuntimeSupport(feature);
  const parts = [
    classFeatureActivationLabel(feature),
    `liv. ${feature.minimumLevel}`,
    feature.sourceLabel,
    targeting.rangeMeters
      ? `${targeting.mode === "aura" ? "area" : "portata"} ${targeting.rangeMeters} m`
      : "",
  ];
  if (feature.automationLevel !== "automatica") parts.push("assistita");
  parts.push(runtimeSupport.ready ? "automazione disponibile" : "non automatizzata");
  return parts.join(" · ");
}

function classFeatureEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "class-feature-empty";
  empty.textContent = message;
  return empty;
}

async function refreshClassFeatureItem() {
  const [items, sceneMetadata] = await Promise.all([
    OBR.scene.items.getItems([item.id]),
    OBR.scene.getMetadata().catch(() => ({})),
  ]);
  item = items[0] || item;
  profile = getInitiativeCard(item);
  currentRoundValue = Math.max(
    1,
    Math.floor(Number(sceneMetadata?.[`${ID}/state`]?.round) || 1)
  );
}

async function runClassFeatureMutation(operation, successMessage) {
  if (!isGM || !item || classFeatureMutating) return;
  classFeatureMutating = true;
  const status = $("classFeatureRunStatus");
  status.textContent = "Aggiornamento…";
  status.dataset.tone = "";
  renderClassFeatures();
  try {
    await operation();
    await refreshClassFeatureItem();
    status.textContent = successMessage;
    status.dataset.tone = "success";
  } catch (error) {
    console.warn("[initiative-card] class feature:", error?.message || error);
    status.textContent = error?.cancelled
      ? "Attivazione annullata."
      : error?.message || "Operazione non riuscita.";
    status.dataset.tone = error?.cancelled ? "" : "error";
  } finally {
    classFeatureMutating = false;
    renderClassFeatures();
  }
}

function buildClassFeatureResourceRow(entry) {
  const row = document.createElement("div");
  row.className = "class-feature-resource";
  const copy = document.createElement("div");
  copy.className = "class-feature-resource-copy";
  const name = document.createElement("strong");
  name.textContent = entry.pool.name;
  const refresh = document.createElement("small");
  const refreshEvents = (Array.isArray(entry.pool.refresh) ? entry.pool.refresh : [])
    .map((value) => typeof value === "string" ? value : value?.event)
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));
  refresh.textContent = refreshEvents.length
    ? `Recupero: ${refreshEvents.join(", ")}`
    : "Recupero manuale";
  copy.append(name, refresh);
  const value = document.createElement("span");
  value.className = "class-feature-resource-value";
  value.textContent = entry.unlimited
    ? "∞"
    : `${entry.current ?? "–"} / ${entry.maximum ?? "–"}`;
  row.append(copy, value);

  if (isGM && !entry.unlimited) {
    const controls = document.createElement("div");
    controls.className = "class-feature-resource-controls";
    for (const [label, title, adjustment] of [
      ["−", "Consuma un uso", { delta: -1 }],
      ["+", "Recupera un uso", { delta: 1 }],
      ["↺", "Ripristina", { reset: true }],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.disabled = classFeatureMutating;
      button.addEventListener("click", () => void runClassFeatureMutation(
        () => adjustClassFeatureResource(item.id, entry.pool.id, adjustment),
        `${entry.pool.name} aggiornata.`,
      ));
      controls.appendChild(button);
    }
    row.appendChild(controls);
  }
  return row;
}

function renderClassFeatures() {
  if (!profile || !item) return;
  const enabled = getEnabledClassFeatures(profile);
  const state = getClassFeatureState(item);
  const active = activeClassFeatureInstances(state, currentRoundValue);
  setClassFeaturesTabCount(enabled.length);

  const buildSummary = $("classBuildSummary");
  const buildLabels = classFeatureBuildLabel(profile.characterBuild);
  buildSummary.replaceChildren(...(
    buildLabels.length
      ? buildLabels.map((text) => {
        const badge = document.createElement("span");
        badge.className = "class-build-badge";
        badge.textContent = text;
        return badge;
      })
      : [classFeatureEmpty("Nessuna classe configurata.")]
  ));

  const resources = classFeatureResourceEntries(
    state,
    enabled,
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile.characterBuild,
  );
  $("classFeatureResources").replaceChildren(...(
    resources.length
      ? resources.map(buildClassFeatureResourceRow)
      : [classFeatureEmpty("Nessuna risorsa da tracciare.")]
  ));

  $("classFeatureActive").replaceChildren(...(
    active.length
      ? active.map((instance) => {
        const feature = CLASS_FEATURE_BY_ID.get(instance.featureId);
        const row = document.createElement("div");
        row.className = "class-feature-active-row";
        const theme = classFeatureTheme(feature);
        row.style.setProperty("--feature-accent", theme.accent);
        row.style.setProperty("--feature-background", `${theme.background}26`);
        const copy = document.createElement("div");
        copy.className = "class-feature-active-copy";
        const name = document.createElement("strong");
        name.textContent = feature
          ? classFeatureDisplayName(feature, instance.choiceId)
          : instance.featureId;
        const detail = document.createElement("small");
        const remaining = classFeatureRemainingRounds(instance, currentRoundValue);
        const targetCount = instance.targetIds.filter((id) => id !== item.id).length;
        const targeting = classFeatureTargeting(feature);
        const parentFeatureId = classFeatureDurationParentFeatureId(feature);
        const parentFeature = parentFeatureId
          ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
          : null;
        const durationTiming = classFeatureDurationTiming(feature);
        const durationLabel = durationTiming === "next-turn"
          ? "fino al prossimo turno"
          : durationTiming === "next-turn-end"
            ? "fino al termine del prossimo turno"
          : parentFeature
            ? `fino al termine di ${parentFeature.name || parentFeatureId}`
          : remaining === null ? "durata manuale" : `${remaining} round rimanenti`;
        detail.textContent = [
          durationLabel,
          targeting.mode === "aura"
            ? `aura ${targeting.rangeMeters ? `${targeting.rangeMeters} m` : "attiva"}`
            : "",
          targetCount ? `${targetCount} bersaglio${targetCount === 1 ? "" : "i"}` : "",
        ].filter(Boolean).join(" · ");
        copy.append(name, detail);
        const projection = classFeatureEffectProjection(feature, instance.choiceId);
        const manualDetail = projection.targetEffect?.detail || "";
        if (manualDetail) {
          const manual = document.createElement("small");
          manual.className = "class-feature-manual";
          manual.textContent = `Manuale al tavolo: ${manualDetail}`;
          copy.appendChild(manual);
        }
        row.appendChild(copy);
        if (isGM) {
          const end = document.createElement("button");
          end.type = "button";
          end.className = "class-feature-end";
          end.textContent = "×";
          end.title = `Termina ${feature?.name || "capacità"}`;
          end.setAttribute("aria-label", end.title);
          end.disabled = classFeatureMutating;
          end.addEventListener("click", () => void runClassFeatureMutation(
            () => deactivateClassFeature(item.id, instance.instanceId),
            `${feature?.name || "Capacità"} terminata.`,
          ));
          row.appendChild(end);
        }
        return row;
      })
      : [classFeatureEmpty("Nessuna capacità attiva.")]
  ));

  $("classFeatureList").replaceChildren(...(
    enabled.length
      ? enabled.map((feature) => {
        const card = document.createElement("article");
        card.className = "class-feature-card";
        const theme = classFeatureTheme(feature);
        const runtimeSupport = classFeatureRuntimeSupport(feature);
        if (!runtimeSupport.ready) card.classList.add("class-feature-not-automated");
        card.style.setProperty("--feature-accent", theme.accent);
        card.style.setProperty("--feature-background", `${theme.background}26`);
        const head = document.createElement("div");
        head.className = "class-feature-head";
        const copy = document.createElement("div");
        copy.className = "class-feature-copy";
        const name = document.createElement("strong");
        name.textContent = classFeatureDisplayName(feature);
        const meta = document.createElement("span");
        meta.className = "class-feature-meta";
        meta.textContent = classFeatureMetaText(feature);
        copy.append(name, meta);
        if (!runtimeSupport.ready) {
          const status = document.createElement("small");
          status.className = "class-feature-runtime-status";
          status.textContent = "Non ancora automatizzata: gestione manuale al tavolo";
          copy.appendChild(status);
        }
        head.appendChild(copy);
        if (isGM) {
          const choiceControl = classFeatureChoiceControl(feature);
          const autoChoiceControls = classFeatureAutoChoiceControls(feature);
          if (choiceControl) head.appendChild(choiceControl);
          for (const control of autoChoiceControls.values()) head.appendChild(control);
          const activate = document.createElement("button");
          activate.type = "button";
          activate.textContent = !runtimeSupport.ready
            ? "Non disponibile"
            : feature.trackingMode === "instant" ? "Usa" : "Attiva";
          const alreadyActive = feature.trackingMode !== "instant"
            && active.some((entry) => entry.featureId === feature.id);
          const parentFeatureId = classFeatureDurationParentFeatureId(feature);
          const parentActive = !parentFeatureId
            || active.some((entry) => entry.featureId === parentFeatureId);
          activate.disabled = classFeatureMutating
            || alreadyActive
            || !runtimeSupport.ready
            || !parentActive;
          activate.title = alreadyActive
            ? "La capacità è già attiva"
            : !runtimeSupport.ready
              ? "Questa capacità non è ancora automatizzata"
            : !parentActive
              ? `Richiede prima ${CLASS_FEATURE_BY_ID.get(parentFeatureId)?.name || "la capacitÃ  collegata"}`
            : classFeatureTargetMode(feature) === "selection"
              ? "Usa i token selezionati come bersagli"
              : "Attiva sul personaggio";
          activate.addEventListener("click", () => void runClassFeatureMutation(
            async () => {
              await activateClassFeature({
                sourceId: item.id,
                featureId: feature.id,
                choiceId: classFeatureChoiceSelection(choiceControl),
                autoChoiceIds: classFeatureAutoChoiceSelection(autoChoiceControls),
              });
            },
            feature.trackingMode === "instant"
              ? `${feature.name} usata.`
              : `${feature.name} attivata.`,
          ));
          head.appendChild(activate);
        }
        card.appendChild(head);
        if (feature.description) {
          const description = document.createElement("p");
          description.className = "class-feature-description";
          description.textContent = feature.description;
          description.title = feature.description;
          card.appendChild(description);
        }
        return card;
      })
      : [classFeatureEmpty(
        profile.characterBuild?.length
          ? "Nessuna capacità attiva abilitata."
          : "Configura classe e livello in Modifica."
      )]
  ));
}

function populateQuickActionDatalists() {
  $("quickActionSpellOptions").replaceChildren(...spellOptions.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    return option;
  }));
  $("quickActionConditionOptions").replaceChildren(...APPLICABLE_CONDITION_LIST.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.label = formatConditionName(name);
    return option;
  }));
}

function syncQuickActionAddState() {
  const count = $("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']").length;
  setQuickActionsTabCount(count);
  $("quickActionAdd").disabled = count >= MAX_QUICK_ACTIONS;
  $("quickActionAdd").title = count >= MAX_QUICK_ACTIONS
    ? `Massimo ${MAX_QUICK_ACTIONS} azioni rapide`
    : "Aggiungi azione rapida";
}

function quickActionFeatureOptions(currentId = "") {
  const available = getEnabledClassFeatures(profile)
    .filter((feature) => classFeatureRuntimeSupport(feature).ready);
  const byId = new Map(available.map((feature) => [feature.id, feature]));
  const current = CLASS_FEATURE_BY_ID.get(String(currentId || "").trim());
  if (current && !byId.has(current.id)) byId.set(current.id, current);
  return Array.from(byId.values())
    .sort((a, b) => classFeatureDisplayName(a).localeCompare(classFeatureDisplayName(b), "it"));
}

function buildQuickActionEditorRow(action = null) {
  const current = action || {
    id: quickActionId(),
    label: "",
    kind: "spell",
    targetMode: "selection",
    workflow: "spell",
    slotLevel: null,
    turns: null,
    conditionName: "",
    expiryMode: "manual",
    duration: null,
  };

  const row = document.createElement("div");
  row.className = "quick-action-editor-row";
  row.dataset.quickActionRow = "1";
  row.dataset.actionId = current.id || quickActionId();

  const head = document.createElement("div");
  head.className = "quick-action-editor-head";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.maxLength = 80;
  labelInput.placeholder = "Etichetta pulsante";
  labelInput.value = current.label || "";
  labelInput.dataset.quickActionField = "label";

  const tools = document.createElement("div");
  tools.className = "quick-action-editor-tools";
  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "↑";
  up.title = "Sposta su";
  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "↓";
  down.title = "Sposta giù";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Rimuovi";
  tools.append(up, down, remove);
  head.append(labelInput, tools);

  const grid = document.createElement("div");
  grid.className = "quick-action-editor-grid";
  const kindSelect = selectControl([
    ["spell", "Incantesimo"],
    ["condition", "Condizione"],
    ["feature", "Capacità di classe"],
  ], current.kind || "spell");
  kindSelect.dataset.quickActionField = "kind";
  const currentFeature = CLASS_FEATURE_BY_ID.get(current.featureId);
  const targetSelect = selectControl([
    ["selection", "Selezione corrente"],
    ["self", "Su di sé"],
  ], current.kind === "feature"
    ? classFeatureTargetMode(currentFeature)
    : current.targetMode || "selection");
  targetSelect.dataset.quickActionField = "targetMode";

  const referenceInput = document.createElement("input");
  referenceInput.type = "text";
  referenceInput.maxLength = 160;
  referenceInput.autocomplete = "off";
  referenceInput.spellcheck = false;
  referenceInput.value = quickActionReference(current);
  referenceInput.dataset.quickActionField = "reference";

  const featureOptions = [["", "Scegli capacità"]];
  for (const feature of quickActionFeatureOptions(current.featureId)) {
    featureOptions.push([feature.id, classFeatureDisplayName(feature)]);
  }
  if (
    current.featureId
    && !featureOptions.some(([value]) => value === current.featureId)
  ) {
    featureOptions.push([current.featureId, current.featureId]);
  }
  const featureSelect = selectControl(featureOptions, current.featureId || "");
  featureSelect.dataset.quickActionField = "featureId";

  const workflowSelect = selectControl([
    ["spell", "Pannello Incantesimi"],
    ["area", "Console effetti ad area"],
  ], current.workflow || "spell");
  workflowSelect.dataset.quickActionField = "workflow";
  workflowSelect.dataset.touched = action ? "1" : "0";

  const slotInput = document.createElement("input");
  slotInput.type = "number";
  slotInput.min = "1";
  slotInput.max = "9";
  slotInput.placeholder = "Catalogo";
  slotInput.value = current.slotLevel ?? "";
  slotInput.dataset.quickActionField = "slotLevel";

  const turnsInput = document.createElement("input");
  turnsInput.type = "number";
  turnsInput.min = "1";
  turnsInput.max = "999";
  turnsInput.placeholder = "Catalogo";
  turnsInput.value = current.turns ?? "";
  turnsInput.dataset.quickActionField = "turns";

  const expirySelect = selectControl([
    ["manual", "Manuale"],
    ["rounds", "N round"],
    ["turn-start", "Inizio turno"],
    ["turn-end", "Fine turno"],
  ], current.expiryMode || "manual");
  expirySelect.dataset.quickActionField = "expiryMode";

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.max = "999";
  durationInput.value = current.duration ?? "1";
  durationInput.dataset.quickActionField = "duration";

  const makeLabel = (text, control, className = "") => {
    const label = document.createElement("label");
    if (className) label.className = className;
    label.append(text, control);
    return label;
  };
  const kindLabel = makeLabel("Tipo", kindSelect);
  const targetLabel = makeLabel("Bersaglio", targetSelect);
  const referenceLabel = makeLabel("Incantesimo", referenceInput, "wide");
  const featureLabel = makeLabel("Capacità", featureSelect, "wide");
  const workflowLabel = makeLabel("Apertura", workflowSelect);
  const slotLabel = makeLabel("Slot", slotInput);
  const turnsLabel = makeLabel("Durata in round", turnsInput);
  const expiryLabel = makeLabel("Scadenza", expirySelect);
  const durationLabel = makeLabel("Occorrenze", durationInput);
  grid.append(
    kindLabel,
    targetLabel,
    referenceLabel,
    featureLabel,
    workflowLabel,
    slotLabel,
    turnsLabel,
    expiryLabel,
    durationLabel,
  );

  const syncKind = () => {
    const spell = kindSelect.value === "spell";
    const feature = kindSelect.value === "feature";
    const selectedFeature = CLASS_FEATURE_BY_ID.get(featureSelect.value);
    referenceLabel.firstChild.textContent = spell ? "Incantesimo" : "Condizione";
    referenceLabel.hidden = feature;
    featureLabel.hidden = !feature;
    if (feature) referenceInput.removeAttribute("list");
    else referenceInput.setAttribute(
      "list",
      spell ? "quickActionSpellOptions" : "quickActionConditionOptions",
    );
    targetSelect.disabled = feature;
    if (feature && selectedFeature) {
      targetSelect.value = classFeatureTargetMode(selectedFeature);
    }
    workflowLabel.hidden = !spell;
    slotLabel.hidden = !spell;
    turnsLabel.hidden = !spell;
    expiryLabel.hidden = spell || feature;
    durationLabel.hidden = spell || feature || expirySelect.value === "manual";
  };

  kindSelect.addEventListener("change", () => {
    referenceInput.value = "";
    if (!labelInput.value.trim()) labelInput.value = "";
    syncKind();
    (kindSelect.value === "feature" ? featureSelect : referenceInput).focus();
  });
  featureSelect.addEventListener("change", () => {
    const feature = CLASS_FEATURE_BY_ID.get(featureSelect.value);
    if (feature) {
      targetSelect.value = classFeatureTargetMode(feature);
      if (!labelInput.value.trim()) labelInput.value = classFeatureDisplayName(feature);
    }
    syncKind();
  });
  workflowSelect.addEventListener("change", () => {
    workflowSelect.dataset.touched = "1";
  });
  referenceInput.addEventListener("change", () => {
    if (kindSelect.value === "spell") {
      const spell = getSpellDefinition(referenceInput.value);
      if (spell) {
        referenceInput.value = spell.catalogLabel || spell.displayName || spell.name;
        if (!labelInput.value.trim()) labelInput.value = spell.displayName || spell.name;
        if (workflowSelect.dataset.touched !== "1") {
          workflowSelect.value = spellOptionsById.get(spell.id)?.area ? "area" : "spell";
        }
      }
    } else if (kindSelect.value === "condition" && !labelInput.value.trim()) {
      labelInput.value = referenceInput.value.trim();
    }
  });
  expirySelect.addEventListener("change", syncKind);
  up.addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) previous.before(row);
  });
  down.addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) next.after(row);
  });
  remove.addEventListener("click", () => {
    row.remove();
    syncQuickActionAddState();
  });

  row.append(head, grid);
  syncKind();
  return row;
}

function buildQuickActionEditor() {
  const list = $("quickActionEditorList");
  const actions = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  list.replaceChildren(...actions.map((action) => buildQuickActionEditorRow(action)));
  syncQuickActionAddState();
}

function collectQuickActions() {
  const rows = Array.from(
    $("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']")
  );
  const drafts = rows.map((row) => {
    const field = (name) => row.querySelector(`[data-quick-action-field='${name}']`);
    const kind = field("kind").value;
    if (kind === "feature") {
      const featureId = field("featureId").value.trim();
      const feature = CLASS_FEATURE_BY_ID.get(featureId);
      if (!feature) throw new Error("Scegli una capacità di classe valida.");
      const label = field("label").value.trim() || classFeatureDisplayName(feature);
      return {
        id: row.dataset.actionId,
        label,
        kind,
        featureId,
        targetMode: classFeatureTargetMode(feature),
      };
    }
    const reference = field("reference").value.trim();
    const label = field("label").value.trim() || reference;
    if (!reference || !label) throw new Error("Completa nome e contenuto di ogni azione rapida.");
    if (kind === "spell") {
      const spell = getSpellDefinition(reference);
      if (!spell) throw new Error(`Incantesimo non riconosciuto: ${reference}`);
      return {
        id: row.dataset.actionId,
        label,
        kind,
        spellId: spell.id,
        workflow: field("workflow").value,
        targetMode: field("targetMode").value,
        slotLevel: field("slotLevel").value,
        turns: field("turns").value,
        applyAutomations: true,
      };
    }
    return {
      id: row.dataset.actionId,
      label,
      kind,
      conditionName: reference,
      targetMode: field("targetMode").value,
      expiryMode: field("expiryMode").value,
      duration: field("duration").value,
    };
  });
  const actions = sanitizeQuickActions(drafts);
  if (actions.length !== drafts.length) {
    throw new Error("Una o più azioni rapide non sono valide.");
  }
  return actions;
}

function populateSubclassSelect(select, classId, selectedId = "") {
  const options = [["", "Nessuna / non scelta"]];
  for (const subclass of getClassFeatureSubclasses(classId)) {
    options.push([subclass.id, subclass.name]);
  }
  select.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = options.some(([value]) => value === selectedId) ? selectedId : "";
  select.disabled = options.length === 1;
}

function collectCharacterBuildEditor({ validate = false } = {}) {
  const rows = Array.from(
    $("classBuildEditorList").querySelectorAll("[data-class-build-row='1']")
  );
  const drafts = rows.map((row) => ({
    classId: row.querySelector("[data-class-build-field='classId']").value,
    level: row.querySelector("[data-class-build-field='level']").value,
    subclassId: row.querySelector("[data-class-build-field='subclassId']").value,
  })).filter((entry) => entry.classId);
  if (validate && new Set(drafts.map((entry) => entry.classId)).size !== drafts.length) {
    throw new Error("Ogni classe può comparire una sola volta.");
  }
  return sanitizeCharacterBuild(drafts);
}

function syncClassBuildAddState() {
  const count = $("classBuildEditorList")
    .querySelectorAll("[data-class-build-row='1']").length;
  $("classBuildAdd").disabled = count >= MAX_CHARACTER_CLASSES;
  $("classBuildAdd").title = count >= MAX_CHARACTER_CLASSES
    ? `Massimo ${MAX_CHARACTER_CLASSES} classi`
    : "Aggiungi una classe";
}

function buildClassFeatureEditor() {
  const build = collectCharacterBuildEditor();
  const available = getAvailableClassFeatures(build);
  for (const feature of available) {
    if (!draftKnownAvailableFeatureIds.has(feature.id) && feature.defaultEnabled) {
      draftEnabledFeatureIds.add(feature.id);
    }
    draftKnownAvailableFeatureIds.add(feature.id);
  }

  const list = $("classFeatureEditorList");
  if (!available.length) {
    list.replaceChildren(classFeatureEmpty(
      build.length
        ? "Nessuna capacità attivabile per questa configurazione."
        : "Aggiungi almeno una classe."
    ));
    setClassFeaturesTabCount(0);
    return;
  }

  list.replaceChildren(...available.map((feature) => {
    const option = document.createElement("label");
    option.className = "class-feature-editor-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draftEnabledFeatureIds.has(feature.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) draftEnabledFeatureIds.add(feature.id);
      else draftEnabledFeatureIds.delete(feature.id);
      setClassFeaturesTabCount(
        available.filter((entry) => draftEnabledFeatureIds.has(entry.id)).length
      );
    });
    const copy = document.createElement("span");
    copy.className = "class-feature-editor-option-copy";
    const name = document.createElement("strong");
    name.textContent = feature.name;
    const meta = document.createElement("small");
    meta.textContent = classFeatureRuntimeSupport(feature).ready
      ? classFeatureMetaText(feature)
      : `${classFeatureMetaText(feature)} · solo riferimento`;
    copy.append(name, meta);
    option.append(checkbox, copy);
    return option;
  }));
  setClassFeaturesTabCount(
    available.filter((feature) => draftEnabledFeatureIds.has(feature.id)).length
  );
}

function buildClassBuildEditorRow(entry = {}) {
  const row = document.createElement("div");
  row.className = "class-build-editor-row";
  row.dataset.classBuildRow = "1";

  const classSelect = selectControl([
    ["", "Scegli classe"],
    ...CLASS_FEATURE_CLASSES.map((classEntry) => [classEntry.id, classEntry.name]),
  ], entry.classId || "");
  classSelect.dataset.classBuildField = "classId";

  const levelInput = document.createElement("input");
  levelInput.type = "number";
  levelInput.min = "1";
  levelInput.max = "20";
  levelInput.step = "1";
  levelInput.value = entry.level || 1;
  levelInput.dataset.classBuildField = "level";

  const subclassSelect = document.createElement("select");
  subclassSelect.dataset.classBuildField = "subclassId";
  populateSubclassSelect(subclassSelect, classSelect.value, entry.subclassId || "");

  const makeLabel = (text, control) => {
    const label = document.createElement("label");
    label.append(text, control);
    return label;
  };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "class-build-remove";
  remove.textContent = "×";
  remove.title = "Rimuovi classe";

  classSelect.addEventListener("change", () => {
    populateSubclassSelect(subclassSelect, classSelect.value);
    buildClassFeatureEditor();
  });
  levelInput.addEventListener("change", buildClassFeatureEditor);
  subclassSelect.addEventListener("change", buildClassFeatureEditor);
  remove.addEventListener("click", () => {
    row.remove();
    syncClassBuildAddState();
    buildClassFeatureEditor();
  });

  row.append(
    makeLabel("Classe", classSelect),
    makeLabel("Livello", levelInput),
    makeLabel("Sottoclasse", subclassSelect),
    remove,
  );
  return row;
}

function buildClassBuildEditor() {
  const build = sanitizeCharacterBuild(profile?.characterBuild);
  $("classBuildEditorList").replaceChildren(...(
    build.length
      ? build.map((entry) => buildClassBuildEditorRow(entry))
      : [buildClassBuildEditorRow()]
  ));
  const available = getAvailableClassFeatures(build);
  draftEnabledFeatureIds = new Set(
    profile?.classFeaturesConfigured === true
      ? profile.enabledClassFeatureIds
      : available.filter((feature) => feature.defaultEnabled).map((feature) => feature.id)
  );
  draftKnownAvailableFeatureIds = new Set(available.map((feature) => feature.id));
  syncClassBuildAddState();
  buildClassFeatureEditor();
}

function collectEnabledClassFeatureIds(characterBuild) {
  const availableIds = new Set(
    getAvailableClassFeatures(characterBuild).map((feature) => feature.id)
  );
  return Array.from(draftEnabledFeatureIds).filter((id) => availableIds.has(id));
}

function applyFactionTheme() {
  const meta = item?.metadata?.[META_KEY] || {};
  const attitude = String(meta.attitude || (meta.inInitiative === true ? "ally" : "neutral"))
    .trim()
    .toLowerCase();
  document.documentElement.dataset.faction = ["pc", "ally", "neutral", "enemy"].includes(attitude)
    ? attitude
    : "neutral";
}

function renderPortrait() {
  const portrait = $("portrait");
  const fallback = $("portraitFallback");
  const name = String(item?.name || "").trim();
  fallback.textContent = name.slice(0, 1).toUpperCase() || "?";
  const source = String(item?.image?.url || item?.image?.src || item?.image?.href || item?.data?.src || "").trim();
  portrait.querySelector("img")?.remove();
  fallback.style.display = "grid";
  if (!source) return;
  const image = document.createElement("img");
  image.alt = "";
  image.src = source;
  image.addEventListener("load", () => { fallback.style.display = "none"; });
  image.addEventListener("error", () => image.remove());
  portrait.appendChild(image);
}

function renderView() {
  const meta = item?.metadata?.[META_KEY] || {};
  $("title").textContent = item?.name || "Scheda iniziativa";
  const buildLabels = classFeatureBuildLabel(profile.characterBuild);
  $("characterBuildLine").textContent = buildLabels.join(" / ");
  $("characterBuildLine").hidden = buildLabels.length === 0;
  renderPortrait();
  $("hp").textContent = `${valueText(meta.hp)} / ${valueText(meta.hpMax)}`;
  $("armorClass").textContent = valueText(profile.armorClass);
  $("passivePerception").textContent = valueText(profile.passivePerception);
  $("speed").textContent = valueText(profile.speed, profile.speed === null ? "" : " m");
  $("spellSaveDC").textContent = valueText(profile.spellSaveDC);
  $("spellAttackBonus").textContent = signedText(profile.spellAttackBonus);
  $("notes").textContent = profile.notes || "";
  $("notesBlock").hidden = !profile.notes;
  renderQuickActions();
  renderClassFeatures();
  $("exhaustion").textContent = String(profile.exhaustion || 0);
  for (const [id, disabled] of [
    ["exhaustionDown", exhaustionSaving || !isGM || profile.exhaustion <= 0],
    ["exhaustionUp", exhaustionSaving || !isGM || profile.exhaustion >= 5],
  ]) {
    const button = $(id);
    button.style.display = isGM ? "inline-block" : "none";
    button.disabled = disabled;
  }
  $("saves").replaceChildren(...SAVE_KEYS.map((key) => {
    const row = document.createElement("div");
    row.className = "save";
    const label = document.createElement("span");
    label.textContent = labels[key];
    const value = document.createElement("strong");
    value.textContent = signedText(profile.savingThrows[key]);
    row.append(label, value);
    return row;
  }));
}

function setEditing(active) {
  editing = !!active;
  if (!editing) {
    setQuickActionsTabCount(profile?.quickActions?.length || 0);
    renderClassFeatures();
    syncCardTabs();
    return;
  }
  $("armorClassInput").value = profile.armorClass ?? "";
  $("passivePerceptionInput").value = profile.passivePerception ?? "";
  $("speedInput").value = profile.speed ?? "";
  $("exhaustionInput").value = profile.exhaustion ?? 0;
  $("spellSaveDCInput").value = profile.spellSaveDC ?? "";
  $("spellAttackBonusInput").value = profile.spellAttackBonus ?? "";
  $("notesInput").value = profile.notes ?? "";
  buildQuickActionEditor();
  buildClassBuildEditor();
  for (const key of SAVE_KEYS) $(`save-${key}`).value = profile.savingThrows[key] ?? "";
  $("status").textContent = "";
  syncCardTabs();
}

async function adjustExhaustion(delta) {
  if (!isGM || !item || exhaustionSaving) return;
  const next = Math.max(0, Math.min(5, Number(profile.exhaustion || 0) + delta));
  if (next === profile.exhaustion) return;
  exhaustionSaving = true;
  renderView();
  try {
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: next });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
  } catch (err) {
    console.warn("[initiative-card] Indebolimento:", err?.message || err);
  } finally {
    exhaustionSaving = false;
    renderView();
  }
}

function buildSaveInputs() {
  $("saveInputs").replaceChildren(...SAVE_KEYS.map((key) => {
    const label = document.createElement("label");
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.id = `save-${key}`;
    input.type = "number";
    input.min = "-99";
    input.max = "99";
    label.appendChild(input);
    return label;
  }));
}

function subscribeToSourceItemChanges() {
  OBR.scene.items.onChange((items) => {
    const next = (Array.isArray(items) ? items : [])
      .find((entry) => entry?.id === sourceId);
    if (!next) return;
    item = next;
    if (editing || classFeatureMutating || quickActionLaunching) return;
    profile = getInitiativeCard(item);
    applyFactionTheme();
    renderView();
  });
}

function subscribeToSceneStateChanges() {
  OBR.scene.onMetadataChange((metadata) => {
    const nextRound = Math.max(
      1,
      Math.floor(Number(metadata?.[`${ID}/state`]?.round) || 1)
    );
    if (nextRound === currentRoundValue) return;
    currentRoundValue = nextRound;
    if (editing || classFeatureMutating || quickActionLaunching) return;
    renderView();
  });
}

OBR.onReady(async () => {
  try {
    const [items, role, sceneMetadata] = await Promise.all([
      OBR.scene.items.getItems([sourceId]),
      OBR.player.getRole(),
      OBR.scene.getMetadata().catch(() => ({})),
    ]);
    item = items[0] || null;
    isGM = role === "GM";
    currentRoundValue = Math.max(
      1,
      Math.floor(Number(sceneMetadata?.[`${ID}/state`]?.round) || 1)
    );
    if (!item) throw new Error("Token non trovato");
    applyFactionTheme();
    profile = await loadInitiativeCard(item, { hydrate: isGM });
    populateQuickActionDatalists();
    buildSaveInputs();
    subscribeToSourceItemChanges();
    subscribeToSceneStateChanges();
    renderView();
    if (isGM && !hasInitiativeCardValues(profile)) setEditing(true);
    else syncCardTabs();
  } catch (err) {
    $("title").textContent = "Scheda non disponibile";
    $("edit").style.display = "none";
    $("hp").textContent = err?.message || "Errore";
  }
});

$("close").addEventListener("click", closeInitiativeCardPopover);
$("edit").addEventListener("click", () => setEditing(true));
$("cancel").addEventListener("click", () => setEditing(false));
$("statsTab").addEventListener("click", () => setCardTab("stats"));
$("quickActionsTab").addEventListener("click", () => setCardTab("quick-actions"));
$("classFeaturesTab").addEventListener("click", () => setCardTab("class-features"));
$("exhaustionDown").addEventListener("click", () => void adjustExhaustion(-1));
$("exhaustionUp").addEventListener("click", () => void adjustExhaustion(1));
$("quickActionAdd").addEventListener("click", () => {
  const list = $("quickActionEditorList");
  if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTIONS) return;
  const row = buildQuickActionEditorRow();
  list.appendChild(row);
  syncQuickActionAddState();
  row.querySelector("[data-quick-action-field='label']")?.focus();
});
$("classBuildAdd").addEventListener("click", () => {
  const list = $("classBuildEditorList");
  if (list.querySelectorAll("[data-class-build-row='1']").length >= MAX_CHARACTER_CLASSES) {
    return;
  }
  const row = buildClassBuildEditorRow();
  list.appendChild(row);
  syncClassBuildAddState();
  buildClassFeatureEditor();
  row.querySelector("[data-class-build-field='classId']")?.focus();
});
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isGM || !item) return;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  $("status").textContent = "";
  try {
    const savingThrows = Object.fromEntries(SAVE_KEYS.map((key) => [key, $(`save-${key}`).value]));
    const characterBuild = collectCharacterBuildEditor({ validate: true });
    await saveInitiativeCard(item.id, item.name, {
      armorClass: $("armorClassInput").value,
      passivePerception: $("passivePerceptionInput").value,
      speed: $("speedInput").value,
      exhaustion: $("exhaustionInput").value,
      spellSaveDC: $("spellSaveDCInput").value,
      spellAttackBonus: $("spellAttackBonusInput").value,
      notes: $("notesInput").value,
      quickActions: collectQuickActions(),
      characterBuild,
      enabledClassFeatureIds: collectEnabledClassFeatureIds(characterBuild),
      classFeaturesConfigured: true,
      savingThrows,
    });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
    renderView();
    setEditing(false);
  } catch (err) {
    $("status").textContent = err?.message || "Salvataggio non riuscito";
  } finally {
    if (submit) submit.disabled = false;
  }
});
