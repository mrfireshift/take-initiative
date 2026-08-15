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
import { getSpellsFromItem } from "./spells.js";
import {
  MAX_QUICK_ACTIONS,
  sanitizeQuickActions,
} from "./quickActionsCore.js";
import { executeDirectQuickAction } from "./quickActionExecution.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CLASSES,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureBuildLabel,
  classFeatureDisplayNameWithParent,
  orderClassFeaturesByParent,
  classFeatureTargeting,
  classFeatureTargetMode,
  getAvailableClassFeatures,
  getAdditionalSubclassSpellEntries,
  getClassFeatureSubclasses,
  getEnabledClassFeatures,
} from "./classFeatureCatalog.js";
import {
  MAX_CHARACTER_CLASSES,
  activeClassFeatureInstances,
  classFeatureAutoActivateParentFeatureId,
  classFeatureChoiceOptions,
  classFeatureDisplayName,
  classFeatureDurationParentFeatureId,
  classFeatureDurationTiming,
  classFeatureEffectProjection,
  CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS,
  classFeatureIsReferenceOnly,
  classFeatureParentFeatureId,
  classFeatureRequiredActiveFeatureId,
  classFeatureRuntimeSupport,
  classFeatureTheme,
  classFeatureRemainingRounds,
  classFeatureResourceEntries,
  resolveClassFeatureResourceMaximum,
  resolveClassFeatureResourceDie,
  classFeatureSpecialRefresh,
  classFeatureSpellSlotCreationCost,
  classFeatureTwinnedSpellCost,
  sanitizeCharacterBuild,
  resolveClassFeatureProgressionValue,
} from "./classFeatureCore.js";
import {
  activateClassFeature,
  applySorcerousRestoration,
  adjustClassFeatureResource,
  convertClassFeatureSpellSlot,
  createClassFeatureSpellSlot,
  deactivateClassFeature,
  getClassFeatureState,
  applyLayOnHands,
  purifyClassFeatureSpell,
  restoreWildMagicTidesOfChaos,
} from "./classFeatureRuntime.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/initiative-card-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

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

const SORCERY_SOURCE_FEATURE_ID = "stregone-fonte-di-magia";
const BARDIC_INSPIRATION_FEATURE_ID = "bardo-ispirazione-bardica";
const SORCERY_RESTORATION_FEATURE_ID = "stregone-ripristino-stregonesco";
const SORCERY_POINTS_POOL_ID = "stregone-punti-stregoneria";
const WILD_MAGIC_SURGE_FEATURE_ID = "stregone-magia-selvaggia-impulso-di-magia-selvaggia";
const WILD_MAGIC_TIDES_FEATURE_ID = "stregone-magia-selvaggia-onde-di-caos";
const WILD_MAGIC_TIDES_POOL_ID = "stregone-magia-selvaggia-onde-di-caos-usi";
const WILD_MAGIC_CONTROLLED_FEATURE_ID = "stregone-magia-selvaggia-caos-controllato";
const TWINNED_SPELL_FEATURE_ID = "stregone-metamagia-incantesimo-raddoppiato";
const SPELL_THIEF_FEATURE_ID = "ladro-mistificatore-arcano-ladro-di-incantesimi";
const UNSETTLING_WORDS_FEATURE_ID = "bardo-collegio-dell-eloquenza-parole-inquietanti";
const UNIVERSAL_SPEECH_FEATURE_ID = "bardo-collegio-dell-eloquenza-linguaggio-universale";
const CONTAGIOUS_INSPIRATION_FEATURE_ID = "bardo-collegio-dell-eloquenza-ispirazione-contagiosa";

const WILD_MAGIC_GUIDANCE = Object.freeze({
  "01-02": { where: "Sullo Stregone", duration: "1 minuto; nuovo tiro all'inizio di ogni suo turno", resolve: "Tiro sulla tabella manuale; ignora 01-02 nei tiri successivi." },
  "03-04": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Linea di vista e applicazione del senso speciale al tavolo." },
  "05-06": { where: "Spazio libero entro 1,5 m dallo Stregone", duration: "Scompare dopo 1 minuto", resolve: "Il DM sceglie il modron; nessun token o stat block creato." },
  "07-08": { where: "Centrato sullo Stregone", duration: "Istantanea", resolve: "Risolvi danni e TS con il tavolo; il link spell è consultivo." },
  "09-10": { where: "Bersagli scelti al tavolo", duration: "Istantanea", resolve: "Risolvi il lancio di 5° livello manualmente; nessun danno automatico." },
  "11-12": { where: "Sullo Stregone", duration: "Finché il tavolo non ripristina l'altezza", resolve: "Tira d10 e misura manualmente; nessun token scalato." },
  "13-14": { where: "Centrato sullo Stregone", duration: "1 minuto completo, senza concentrazione", resolve: "TS e area al tavolo; il link spell non crea concentrazione." },
  "15-16": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Ricorda 5 PF all'inizio del turno; non mutare HP automaticamente." },
  "17-18": { where: "Sullo Stregone", duration: "Fino allo starnuto", resolve: "Reminder cosmetico; fine manuale." },
  "19-20": { where: "Centrato sullo Stregone", duration: "1 minuto", resolve: "Link spell consultivo; nessuna zona o TS automatici." },
  "21-22": { where: "Creature contro la prossima spell idonea", duration: "Prima spell con TS entro 1 minuto", resolve: "Ricorda il prossimo TS; fine manuale." },
  "23-24": { where: "Sullo Stregone", duration: "Fino a Rimuovi Maledizione", resolve: "Reminder cosmetico; terminazione manuale." },
  "25-26": { where: "Sulla fronte dello Stregone", duration: "1 minuto", resolve: "Vantaggio alla Percezione visiva resta un promemoria." },
  "27-28": { where: "Incantesimi dello Stregone", duration: "1 minuto", resolve: "Ricorda il nuovo tempo di lancio; non modificare il cast." },
  "29-30": { where: "Spazio libero visibile entro 18 m", duration: "Istantanea", resolve: "Destinazione e movimento restano manuali." },
  "31-32": { where: "Stregone sul Piano Astrale", duration: "Fino alla fine del suo turno successivo", resolve: "Ricorda il ritorno; nessun token rimosso." },
  "33-34": { where: "Prossima spell dannosa dello Stregone", duration: "Prima spell idonea o 1 minuto", resolve: "Massimizzazione dei danni al tavolo; nessun calcolo automatico." },
  "35-36": { where: "Sullo Stregone", duration: "Indefinita", resolve: "Tira d10 e aggiorna età manualmente." },
  "37-38": { where: "Spazi liberi entro 18 m", duration: "Scompaiono dopo 1 minuto", resolve: "Numero, token e stat block dei flumph restano manuali." },
  "39-40": { where: "Sullo Stregone", duration: "Istantanea", resolve: "Tiro 2d10 e modifica HP manualmente." },
  "41-42": { where: "Sullo Stregone", duration: "Fino all'inizio del turno successivo", resolve: "Ricorda incapacità e vulnerabilità; nessun watcher HP." },
  "43-44": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Riuso come azione bonus e distanza restano manuali." },
  "45-46": { where: "Sullo Stregone", duration: "10 minuti completi, senza concentrazione", resolve: "Link spell consultivo; TS e movimento restano al tavolo." },
  "47-48": { where: "Spazio entro 1,5 m dallo Stregone", duration: "Scompare dopo 1 minuto", resolve: "Nessun token o stat block creato." },
  "49-50": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Reminder sulla voce; fine manuale." },
  "51-52": { where: "Accanto allo Stregone", duration: "1 minuto", resolve: "Non mutare CA e non applicare immunità automaticamente." },
  "53-54": { where: "Sullo Stregone", duration: "5d6 giorni", resolve: "Tiro della durata e fine manuali." },
  "55-56": { where: "Sullo Stregone", duration: "Ricrescono in 24 ore", resolve: "Reminder cosmetico; fine manuale." },
  "57-58": { where: "Oggetti infiammabili toccati", duration: "1 minuto", resolve: "Nessun oggetto modificato automaticamente." },
  "59-60": { where: "Slot incantesimo dello Stregone", duration: "Istantanea", resolve: "Segna il recupero sulla scheda esterna; nessun inventario slot duplicato." },
  "61-62": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Reminder sul modo di parlare." },
  "63-64": { where: "Centrata sullo Stregone", duration: "1 ora completa, senza concentrazione", resolve: "Link spell consultivo; nessuna zona automatica." },
  "65-66": { where: "Fino a tre creature scelte entro 9 m", duration: "Istantanea", resolve: "Scelta, tiro 4d10 e danni al tavolo." },
  "67-68": { where: "Sullo Stregone e creatura più vicina", duration: "Fino alla fine del suo turno successivo", resolve: "Scegli la creatura e gestisci eventuali parità al tavolo." },
  "69-70": { where: "Fotografia iniziale delle creature entro 9 m", duration: "1 minuto; fine individuale ad attacco o spell", resolve: "Non è un'aura dinamica; nessuna pill automatica." },
  "71-72": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Resistenza a tutti i danni resta un reminder." },
  "73-74": { where: "Una creatura casuale entro 18 m", duration: "1d4 ore", resolve: "Bersaglio e durata sono tirati al tavolo." },
  "75-76": { where: "Luce intensa entro 9 m dallo Stregone", duration: "1 minuto; Accecato fino al turno successivo", resolve: "Innesco di fine turno; non applicare Accecato automaticamente." },
  "77-78": { where: "Sullo Stregone", duration: "1 ora completa, senza concentrazione", resolve: "TS e forma di pecora al tavolo; nessuno stat block copiato." },
  "79-80": { where: "Entro 3 m dallo Stregone", duration: "1 minuto", resolve: "Effetto cosmetico; nessuna aura con pill." },
  "81-82": { where: "Sullo Stregone", duration: "Istantanea", resolve: "Azione aggiuntiva da gestire manualmente." },
  "83-84": { where: "Ogni creatura entro 9 m", duration: "Istantanea", resolve: "Bersagli, 1d10, danni e cura restano manuali; non mutare HP." },
  "85-86": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Link spell consultivo; risoluzione manuale." },
  "87-88": { where: "Una creatura casuale entro 18 m", duration: "10 minuti completi, senza concentrazione", resolve: "Bersaglio casuale e durata completa al tavolo." },
  "89-90": { where: "Sullo Stregone", duration: "1 minuto; fine ad attacco o spell", resolve: "Reminder con fine anticipata manuale." },
  "91-92": { where: "Sullo Stregone", duration: "Finestra di 1 minuto o innesco", resolve: "Nessun watcher morte/HP e nessuna spell automatica." },
  "93-94": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Reminder; non scalare il token." },
  "95-96": { where: "Fotografia iniziale dello Stregone e creature entro 9 m", duration: "1 minuto", resolve: "Non è un'aura dinamica; vulnerabilità resta manuale." },
  "97-98": { where: "Attorno allo Stregone", duration: "1 minuto", resolve: "Reminder cosmetico." },
  "99-00": { where: "Pool Punti Stregoneria dello Stregone", duration: "Istantanea", resolve: "Dopo conferma può ripristinare il pool con history/Undo." },
});

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
  const launch = action.launchMode === "review" ? "revisione" : "lancio rapido";
  return `Incantesimo · ${launch} · ${target}`;
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

function classFeatureSelectionTargetIds(feature) {
  return classFeatureTargetMode(feature, profile?.characterBuild) === "selection"
    ? OBR.player.getSelection().catch(() => [])
    : undefined;
}

function classFeatureResourceRemaining(feature, state = getClassFeatureState(item)) {
  const cost = Array.isArray(feature?.resourceCosts) ? feature.resourceCosts[0] : null;
  if (!cost?.poolId) return null;
  const entry = classFeatureResourceEntries(
    state,
    [feature],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
  ).find((value) => value.pool.id === cost.poolId);
  return entry?.unlimited ? null : entry?.current ?? null;
}

async function choosePurifyingSpell(targetIds) {
  const ids = Array.isArray(targetIds) && targetIds.length
    ? targetIds
    : await OBR.player.getSelection().catch(() => []);
  const resolvedIds = ids.length ? ids : [item.id];
  const [target] = await OBR.scene.items.getItems(resolvedIds).catch(() => []);
  const spells = getSpellsFromItem(target).filter((spell) =>
    spell?.castContext?.staticZoneOwner !== true
  );
  if (!spells.length) throw new Error("Il bersaglio non ha incantesimi attivi.");
  const choices = spells.map((spell, index) =>
    `${index + 1}. ${spell.name || "Incantesimo"} · ${spell.instanceId || "senza ID"}`
  ).join("\n");
  const selected = window.prompt(
    `Scegli l'incantesimo da rimuovere:\n${choices}`,
    spells[0].instanceId || spells[0].name || "",
  );
  if (selected === null) throw { cancelled: true };
  const wanted = String(selected || "").trim();
  const numeric = Number(wanted);
  const spell = Number.isInteger(numeric) && numeric >= 1 && numeric <= spells.length
    ? spells[numeric - 1]
    : spells.find((entry) => String(entry.instanceId || "") === wanted
      || String(entry.name || "").toLocaleLowerCase() === wanted.toLocaleLowerCase());
  if (!spell) throw new Error("Incantesimo non riconosciuto.");
  return {
    targetIds: resolvedIds,
    spellInstanceId: spell.instanceId,
    spellName: spell.name,
  };
}

async function launchSpecialClassFeature(feature, targetIds) {
  const adapter = String(feature?.runtimeSupport?.adapter || "").trim();
  if (adapter === "lay-on-hands") {
    const rawValue = window.prompt(
      "Quanti punti della riserva spendere per curare?",
      "1",
    );
    if (rawValue === null) throw { cancelled: true };
    await applyLayOnHands({
      sourceId: item.id,
      featureId: feature.id,
      targetIds,
      value: rawValue,
      mode: "heal",
    });
    return;
  }
  if (adapter === "purifying-touch") {
    const selected = await choosePurifyingSpell(targetIds);
    await purifyClassFeatureSpell({ sourceId: item.id, featureId: feature.id, ...selected });
  }
}

async function launchQuickAction(action, choiceId = "", autoChoiceIds = {}) {
  const operation = sceneLifecycle.capture({ operationId: `initiative-quick-action:${action?.id || "unknown"}:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !item || quickActionLaunching) return;
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
  const sceneStillCurrent = () => {
    if (sceneLifecycle.isCurrent(operation)) return true;
    quickActionLaunching = false;
    setButtonsDisabled(false);
    setStatus("Scena cambiata: riapri la scheda.", "error");
    return false;
  };
  setButtonsDisabled(true);
  setStatus(`Esecuzione: ${action.label}…`);
  try {
    if (action.kind === "feature") {
      if (!isGM) throw new Error("Solo il GM può attivare una capacità.");
      const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
      const targetIds = await classFeatureSelectionTargetIds(feature);
      if (!sceneStillCurrent()) return;
      if (["lay-on-hands", "purifying-touch"].includes(feature?.runtimeSupport?.adapter)) {
        await launchSpecialClassFeature(feature, targetIds);
      } else {
        let resourceValues = {};
        if (feature?.id === TWINNED_SPELL_FEATURE_ID) {
          const rawLevel = window.prompt("Livello della spell (0-9):", "0");
          if (rawLevel === null) throw { cancelled: true };
          const cost = classFeatureTwinnedSpellCost(rawLevel);
          if (cost === null) throw new Error("Inserisci un livello spell tra 0 e 9.");
          resourceValues = { [SORCERY_POINTS_POOL_ID]: cost };
        }
        await activateClassFeature({
          sourceId: item.id,
          featureId: action.featureId,
          targetIds,
          choiceId,
          autoChoiceIds,
          resourceValues,
        });
      }
      if (!sceneStillCurrent()) return;
      await refreshClassFeatureItem();
      if (!sceneStillCurrent()) return;
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
    if (!sceneStillCurrent()) return;
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

    if (result.mode === "invalid") {
      throw new Error(result.reason || "quick-action-invalid");
    }
    const routeRequest = action.kind === "spell"
      ? result.route?.request
      : null;
    await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, {
      type: "open",
      ...(routeRequest || {
        panel: "conditions",
        sourceId: item.id,
        quickActionId: action.id,
      }),
    }, { destination: "LOCAL" });
    if (!sceneStillCurrent()) return;
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
  const targeting = classFeatureTargeting(feature, profile?.characterBuild);
  const currentDie = resolveClassFeatureProgressionValue(feature, profile?.characterBuild);
  const parts = [
    classFeatureActivationLabel(feature),
    `liv. ${feature.minimumLevel}`,
    feature.sourceLabel,
    currentDie ? `dado corrente ${currentDie}` : "",
    targeting.rangeMeters
      ? `${targeting.mode === "aura" ? "area" : "portata"} ${targeting.rangeMeters} m`
      : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

function classFeatureInstanceDisplayName(feature, instance) {
  const base = classFeatureDisplayNameWithParent(feature, instance?.choiceId);
  if (feature?.id === UNSETTLING_WORDS_FEATURE_ID) {
    const value = String(instance?.choiceId || "").match(/^value-(\d+)$/u)?.[1];
    if (value) return `${base} −${value}`;
  }
  if (feature?.id !== SPELL_THIEF_FEATURE_ID || !instance?.choiceId) return base;
  const spell = getSpellDefinition(instance.choiceId);
  const spellName = spell?.catalogLabel || spell?.displayName || spell?.name || instance.choiceId;
  return `${base} · ${spellName}`;
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
  const sceneOperation = sceneLifecycle.capture({ operationId: `initiative-class-feature:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(sceneOperation) || !isGM || !item || classFeatureMutating) return;
  classFeatureMutating = true;
  const status = $("classFeatureRunStatus");
  status.textContent = "Aggiornamento…";
  status.dataset.tone = "";
  renderClassFeatures();
  try {
    await operation();
    if (!sceneLifecycle.isCurrent(sceneOperation)) {
      status.textContent = "Scena cambiata: riapri la scheda.";
      status.dataset.tone = "error";
      return;
    }
    await refreshClassFeatureItem();
    if (!sceneLifecycle.isCurrent(sceneOperation)) {
      status.textContent = "Scena cambiata: riapri la scheda.";
      status.dataset.tone = "error";
      return;
    }
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
    if (sceneLifecycle.isReady()) renderClassFeatures();
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
  const refreshEvents = (Array.isArray(entry.refreshEvents) && entry.refreshEvents.length
    ? entry.refreshEvents
    : Array.isArray(entry.pool.refresh) ? entry.pool.refresh : [])
    .map((value) => typeof value === "string" ? value : value?.event)
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));
  refresh.textContent = refreshEvents.length
    ? `Recupero: ${refreshEvents.join(", ")}`
    : "Recupero manuale";
  copy.append(name, refresh);
  if (entry.die) {
    const die = document.createElement("small");
    die.textContent = `Dado corrente: ${entry.die}`;
    copy.insertBefore(die, refresh);
  }
  const expression = String(entry.pool.capacity?.expression || "").trim();
  if (expression) {
    const maximum = document.createElement("small");
    maximum.textContent = `Massimo: ${expression}`;
    copy.insertBefore(maximum, refresh);
  }
  const special = classFeatureSpecialRefresh(
    entry.pool,
    profile?.characterBuild,
    "riposo_breve",
  );
  if (special) {
    const specialLabel = document.createElement("small");
    specialLabel.textContent = `Recupero speciale: +${special.amount} con riposo breve (liv. ${special.minClassLevel})`;
    copy.appendChild(specialLabel);
  }
  const value = document.createElement("span");
  value.className = "class-feature-resource-value";
  const resolvedMaximum = entry.unlimited
    ? null
    : resolveClassFeatureResourceMaximum(entry.pool, profile?.characterBuild).maximum;
  const maximumEditable = !entry.unlimited
    && entry.pool.capacity?.type === "formula"
    && resolvedMaximum === null;
  if (entry.unlimited) {
    value.textContent = "∞";
  } else {
    const current = document.createElement("span");
    current.textContent = String(entry.current ?? "–");
    const slash = document.createElement("span");
    slash.textContent = "/";
    value.append(current, slash);
    const maximum = document.createElement("span");
    maximum.textContent = String(entry.maximum ?? "–");
    if (maximumEditable && isGM) {
      maximum.className = "class-feature-resource-maximum-editable";
      maximum.title = "Clicca per modificare il massimo degli usi";
      maximum.setAttribute("role", "button");
      maximum.tabIndex = 0;
      const startMaximumEdit = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (classFeatureMutating || maximum.nextSibling) return;

        const maximumInput = document.createElement("input");
        maximumInput.type = "number";
        maximumInput.className = "class-feature-resource-maximum-input";
        maximumInput.min = "0";
        maximumInput.max = "9999";
        maximumInput.step = "1";
        maximumInput.inputMode = "numeric";
        maximumInput.value = entry.maximum === null ? "" : String(entry.maximum);
        maximumInput.placeholder = "max";
        maximumInput.title = "Imposta il massimo degli usi";
        maximumInput.setAttribute("aria-label", `Massimo usi di ${entry.pool.name}`);
        let editFinished = false;
        const restoreDisplay = () => {
          if (maximumInput.isConnected) maximumInput.replaceWith(maximum);
        };
        const cancelMaximum = () => {
          if (editFinished) return;
          editFinished = true;
          restoreDisplay();
        };
        const commitMaximum = () => {
          if (editFinished || classFeatureMutating) return;
          if (!maximumInput.value.trim()) {
            cancelMaximum();
            return;
          }
          if (!maximumInput.checkValidity()) {
            maximumInput.setCustomValidity("Inserisci un numero intero tra 0 e 9999.");
            maximumInput.reportValidity();
            return;
          }
          editFinished = true;
          void runClassFeatureMutation(
            () => adjustClassFeatureResource(item.id, entry.pool.id, {
              maximum: Number(maximumInput.value),
            }),
            `${entry.pool.name} aggiornata.`,
          );
        };
        maximumInput.addEventListener("input", () => maximumInput.setCustomValidity(""));
        maximumInput.addEventListener("blur", commitMaximum);
        maximumInput.addEventListener("keydown", (keyEvent) => {
          if (keyEvent.key === "Escape") {
            keyEvent.preventDefault();
            cancelMaximum();
          } else if (keyEvent.key === "Enter") {
            keyEvent.preventDefault();
            commitMaximum();
          }
        });
        maximum.replaceWith(maximumInput);
        maximumInput.focus({ preventScroll: true });
        maximumInput.select();
      };
      maximum.addEventListener("click", startMaximumEdit);
      maximum.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        startMaximumEdit(event);
      });
    }
    value.appendChild(maximum);
  }
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

function classFeatureButton(label, title, operation, message, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.disabled = classFeatureMutating || disabled;
  button.addEventListener("click", () => void runClassFeatureMutation(operation, message));
  return button;
}

function wildMagicGuidance(row) {
  return WILD_MAGIC_GUIDANCE[row?.d100] || {
    where: "Bersagli e posizione indicati nell'effetto",
    duration: "Vedi effetto; fine manuale al tavolo",
    resolve: "Tiri, bersagli e conseguenze restano manuali.",
  };
}

function wildMagicField(label, value) {
  const field = document.createElement("div");
  field.className = "class-feature-wild-magic-field";
  const title = document.createElement("strong");
  title.textContent = label;
  const copy = document.createElement("span");
  copy.textContent = value;
  field.append(title, copy);
  return field;
}

function wildMagicOutcomeView(row, { onRestorePoints = null } = {}) {
  const outcome = document.createElement("div");
  outcome.className = "class-feature-wild-magic-outcome";
  const guidance = wildMagicGuidance(row);
  const effect = document.createElement("div");
  effect.className = "class-feature-wild-magic-effect";
  const effectLabel = document.createElement("strong");
  effectLabel.textContent = `Risultato ${row.d100}`;
  const effectText = document.createElement("span");
  effectText.textContent = row.effect;
  effect.append(effectLabel, effectText);
  outcome.append(
    effect,
    wildMagicField("Dove", guidance.where),
    wildMagicField("Durata/Fine", guidance.duration),
    wildMagicField("Da risolvere al tavolo", guidance.resolve),
  );
  if (row.spellId) {
    const spell = getSpellDefinition(row.spellId);
    if (spell) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "class-feature-spell-link";
      link.textContent = `Record Incantesimi: ${spell.displayName || spell.catalogLabel || spell.name}`;
      link.title = `Consultazione di ${spell.id}; il lancio resta manuale`;
      link.dataset.spellId = spell.id;
      link.addEventListener("click", () => window.alert(
        `${spell.displayName || spell.name}\n\n${spell.description || "Consultare il record Incantesimi."}`
      ));
      outcome.appendChild(link);
    }
  }
  if (row.noConcentration) {
    const rule = document.createElement("small");
    rule.className = "class-feature-wild-magic-rule";
    rule.textContent = "Questo esito ignora la concentrazione e resta attivo per la durata completa.";
    outcome.appendChild(rule);
  }
  if (row.d100 === "99-00" && typeof onRestorePoints === "function") {
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Conferma recupero punti stregoneria";
    restore.title = "Ripristina il pool punti con history/Undo";
    restore.disabled = classFeatureMutating;
    restore.addEventListener("click", () => void onRestorePoints());
    outcome.appendChild(restore);
  }
  return outcome;
}

function buildWildMagicViewer({ recoverTides = false } = {}) {
  const feature = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID);
  const rows = Array.isArray(feature?.wildMagicTable) ? feature.wildMagicTable : [];
  const viewer = document.createElement("div");
  viewer.className = "class-feature-wild-magic-viewer";
  if (!rows.length) {
    viewer.textContent = "Tabella Impulsi non disponibile.";
    return viewer;
  }
  const heading = document.createElement("strong");
  heading.textContent = recoverTides
    ? "Impulso richiesto dal DM: inserisci il d100"
    : "Consulta risultato Impulsi di Magia Selvaggia";
  viewer.appendChild(heading);
  const controlled = getEnabledClassFeatures(profile)
    .some((entry) => entry.id === WILD_MAGIC_CONTROLLED_FEATURE_ID);
  const controls = document.createElement("div");
  controls.className = "class-feature-wild-magic-controls";
  const options = rows.map((row) => [row.d100, row.d100]);
  let firstSelect = null;
  let secondSelect = null;
  let choiceSelect = null;
  if (controlled) {
    const firstLabel = document.createElement("label");
    firstLabel.textContent = "Risultato manuale A";
    firstSelect = selectControl([["", "Scegli A"], ...options]);
    firstLabel.appendChild(firstSelect);
    const secondLabel = document.createElement("label");
    secondLabel.textContent = "Risultato manuale B";
    secondSelect = selectControl([["", "Scegli B"], ...options]);
    secondLabel.appendChild(secondSelect);
    const choiceLabel = document.createElement("label");
    choiceLabel.textContent = "Scelta finale"
    choiceSelect = selectControl([["A", "Usa A"], ["B", "Usa B"]]);
    choiceLabel.appendChild(choiceSelect);
    controls.append(firstLabel, secondLabel, choiceLabel);
  } else {
    const label = document.createElement("label");
    label.textContent = "Risultato d100 tirato al tavolo";
    firstSelect = selectControl([["", "Scegli intervallo"], ...options]);
    label.appendChild(firstSelect);
    controls.appendChild(label);
  }
  const result = document.createElement("div");
  result.className = "class-feature-wild-magic-result";
  result.hidden = true;
  const restoreTides = document.createElement("button");
  restoreTides.type = "button";
  restoreTides.textContent = "Conferma Impulso richiesto dal DM";
  restoreTides.title = "Recupera Onde di Caos solo dopo conferma";
  restoreTides.hidden = !recoverTides;
  restoreTides.disabled = true;
  restoreTides.addEventListener("click", () => {
    if (!window.confirm("Il DM ha confermato che l'Impulso è stato richiesto?")) return;
    void runClassFeatureMutation(
      () => restoreWildMagicTidesOfChaos(item.id),
      "Onde di Caos recuperate.",
    );
  });
  const renderSelectedResult = () => {
    const range = controlled
      ? (choiceSelect?.value === "B" ? secondSelect?.value : firstSelect?.value)
      : firstSelect?.value;
    const row = rows.find((entry) => entry.d100 === range);
    if (!row) {
      result.replaceChildren();
      result.hidden = true;
      restoreTides.disabled = true;
      return;
    }
    result.replaceChildren(wildMagicOutcomeView(row, {
      onRestorePoints: row.d100 === "99-00"
        ? () => {
          if (!window.confirm("Confermare il recupero di tutti i punti stregoneria?")) return;
          void runClassFeatureMutation(
            () => adjustClassFeatureResource(item.id, SORCERY_POINTS_POOL_ID, { reset: true }),
            "Punti stregoneria ripristinati.",
          );
        }
        : null,
    }));
    result.hidden = false;
    restoreTides.disabled = false;
  };
  for (const select of [firstSelect, secondSelect, choiceSelect]) {
    select?.addEventListener("change", renderSelectedResult);
  }
  viewer.append(controls, result, restoreTides);
  return viewer;
}

function buildWildMagicSurgeControls() {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-wild-magic-controls-wrap";
  const viewer = buildWildMagicViewer();
  controls.appendChild(viewer);
  return controls;
}

function buildWildMagicTidesControls() {
  const entry = classFeatureResourceEntries(
    getClassFeatureState(item),
    [CLASS_FEATURE_BY_ID.get(WILD_MAGIC_TIDES_FEATURE_ID)],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
  ).find((value) => value.pool.id === WILD_MAGIC_TIDES_POOL_ID);
  const current = entry?.current ?? 0;
  const button = classFeatureButton(
    "Attiva",
    "Consuma l'unico uso e applica vantaggio al tiro fisico scelto",
    () => activateClassFeature({
      sourceId: item.id,
      featureId: WILD_MAGIC_TIDES_FEATURE_ID,
    }),
    "Onde di Caos attivate.",
    current <= 0,
  );
  button.className = "class-feature-tides-button";
  return button;
}

function buildSorcerousRestorationControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(SORCERY_POINTS_POOL_ID);
  const entry = classFeatureResourceEntries(
    state,
    [{ trackedResourcePoolIds: [SORCERY_POINTS_POOL_ID] }],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
  ).find((value) => value.pool.id === SORCERY_POINTS_POOL_ID);
  const special = classFeatureSpecialRefresh(pool, profile?.characterBuild, "riposo_breve");
  const unavailable = !special || (entry?.maximum !== null && entry?.current >= entry?.maximum);
  controls.appendChild(classFeatureButton(
    "Recupera 4",
    "Recupera 4 punti, senza superare il massimo",
    () => applySorcerousRestoration({ sourceId: item.id, featureId: feature.id }),
    "Ripristino Stregonesco applicato.",
    unavailable,
  ));
  return controls;
}

function buildSorcerySourceControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-sorcery-source-controls";
  const createLabel = document.createElement("label");
  createLabel.textContent = "Crea slot";
  const createSelect = document.createElement("select");
  for (let level = 1; level <= 5; level += 1) {
    const cost = classFeatureSpellSlotCreationCost(feature, level);
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Livello ${level} · ${cost} punti`;
    createSelect.appendChild(option);
  }
  createLabel.appendChild(createSelect);
  const createButton = classFeatureButton(
    "Crea slot",
    "Consuma punti e crea solo un reminder temporaneo",
    () => createClassFeatureSpellSlot({
      sourceId: item.id,
      featureId: feature.id,
      slotLevel: Number(createSelect.value),
    }),
    "Slot temporaneo creato.",
  );

  const convertLabel = document.createElement("label");
  convertLabel.textContent = "Converti slot speso";
  const convertSelect = document.createElement("select");
  for (let level = 1; level <= 9; level += 1) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Livello ${level} → +${level} punti`;
    convertSelect.appendChild(option);
  }
  convertLabel.appendChild(convertSelect);
  const convertButton = classFeatureButton(
    "Converti slot",
    "Conferma prima che lo slot sia stato speso sulla scheda esterna",
    async () => {
      const level = Number(convertSelect.value);
      if (!window.confirm(`Confermare che lo slot di livello ${level} è già stato segnato come speso sulla scheda esterna?`)) {
        throw { cancelled: true };
      }
      return convertClassFeatureSpellSlot({
        sourceId: item.id,
        featureId: feature.id,
        slotLevel: level,
      });
    },
    "Slot convertito in punti.",
  );
  const note = document.createElement("small");
  note.textContent = "Nessun inventario slot viene scritto dal plugin; il reminder termina manualmente o al riposo lungo.";
  controls.append(createLabel, createButton, convertLabel, convertButton, note);
  return controls;
}

function buildTwinnedSpellControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const label = document.createElement("label");
  label.textContent = "Livello spell (0–9)";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "9";
  input.step = "1";
  input.value = "0";
  label.appendChild(input);
  const button = classFeatureButton(
    "Conferma consumo",
    "Costo: 1 per trucchetto, altrimenti pari al livello della spell",
    () => {
      const cost = classFeatureTwinnedSpellCost(input.value);
      if (cost === null) throw new Error("Inserisci un livello spell tra 0 e 9.");
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        resourceValues: { [SORCERY_POINTS_POOL_ID]: cost },
      });
    },
    "Incantesimo Raddoppiato confermato.",
  );
  controls.append(label, button);
  return controls;
}

function buildResourceOnlyControls(feature) {
  return classFeatureButton(
    "Conferma consumo",
    "Consuma soltanto la risorsa; non crea pill o effetti automatici",
    () => activateClassFeature({ sourceId: item.id, featureId: feature.id }),
    `${feature.name} confermata.`,
  );
}

function buildUnsettlingWordsControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("bardo-ispirazione-bardica-usi");
  const die = resolveClassFeatureResourceDie(pool, profile?.characterBuild);
  const faces = Number(String(die || "").match(/d(\d+)/iu)?.[1]);
  const remaining = classFeatureResourceRemaining(feature);

  const note = document.createElement("small");
  note.textContent = "Tira il dado di Ispirazione Bardica al tavolo; inserisci soltanto il risultato già ottenuto e seleziona una creatura entro 18 m.";

  const valueLabel = document.createElement("label");
  valueLabel.textContent = `Risultato del dado${die ? ` (${die})` : ""}`;
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.step = "1";
  valueInput.inputMode = "numeric";
  valueInput.required = true;
  if (Number.isInteger(faces) && faces > 0) valueInput.max = String(faces);
  valueInput.placeholder = Number.isInteger(faces) && faces > 0 ? `1–${faces}` : "risultato";
  valueInput.title = Number.isInteger(faces) && faces > 0
    ? `Inserisci un intero tra 1 e ${faces}`
    : "Dado di Ispirazione Bardica non disponibile";
  valueLabel.appendChild(valueInput);

  const button = classFeatureButton(
    "Conferma risultato",
    "Consuma un uso di Ispirazione Bardica e crea il reminder sul bersaglio",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        value: valueInput.value,
      });
    },
    `${feature.name} registrata.`,
    remaining === 0 || !Number.isInteger(faces) || faces < 1,
  );
  controls.append(note, valueLabel, button);
  return controls;
}

function buildTurnCreaturesControls(feature, { legacyTurnUndead = false } = {}) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const remaining = classFeatureResourceRemaining(feature);

  const note = document.createElement("small");
  note.textContent = legacyTurnUndead
    ? "Dopo aver risolto al tavolo i TS Saggezza e Distruggere Non Morti, seleziona soltanto i fallimenti non distrutti. Tipo, vista, udito, GS e danni restano manuali."
    : "Dopo aver risolto al tavolo i TS Saggezza, seleziona soltanto le creature che hanno fallito. Tipo, vista, udito e danni restano manuali.";

  const failedTargets = classFeatureButton(
    legacyTurnUndead ? "Marca fallimenti" : "Applica ai fallimenti selezionati",
    `Consuma un uso e applica ${feature.name} ai token selezionati`,
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: "failed-targets",
      });
    },
    `${feature.name} applicata ai fallimenti selezionati.`,
    remaining === 0,
  );
  const noTargets = classFeatureButton(
    legacyTurnUndead ? "Nessun bersaglio da marcare" : "Nessun fallimento",
    `Consuma l'uso di ${feature.name} senza creare pill`,
    () => activateClassFeature({
      sourceId: item.id,
      featureId: feature.id,
      mode: "no-targets",
    }),
    `Uso di ${feature.name} consumato senza pill.`,
    remaining === 0,
  );
  controls.append(note, failedTargets, noTargets);
  return controls;
}

function buildTurnUndeadControls(feature) {
  return buildTurnCreaturesControls(feature, { legacyTurnUndead: true });
}

function buildUniversalSpeechControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";

  const note = document.createElement("small");
  note.textContent = "Seleziona uno o più token, includendo il Bardo se desiderato. Visibilità e limite basato sul Carisma restano conferme del tavolo.";

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Pagamento";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["daily", "Uso gratuito (recupera con riposo lungo)"],
    ["slot", "Slot già speso"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che lo slot è già stato speso");
  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "slot";
    if (modeSelect.value !== "slot") confirmation.checked = false;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Attiva Linguaggio Universale",
    "Crea un reminder di comprensione unidirezionale per 1 ora",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: modeSelect.value,
        slotConfirmed: confirmation.checked,
      });
    },
    `${feature.name} attivato.`,
  );
  controls.append(note, modeLabel, confirmationLabel, button);
  return controls;
}

function buildNightEyesControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";

  const note = document.createElement("small");
  note.textContent = "La scurovisione personale di 90 m resta descrittiva. Seleziona creature consenzienti entro 3 m; visibilità e limite basato su SAG restano conferme del tavolo.";

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Pagamento";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["daily", "Uso gratuito (recupera con riposo lungo)"],
    ["slot", "Slot già speso"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che lo slot è già stato speso");
  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "slot";
    if (modeSelect.value !== "slot") confirmation.checked = false;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Condividi Occhi della Notte",
    "Crea reminder di scurovisione condivisa per 1 ora",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: modeSelect.value,
        slotConfirmed: confirmation.checked,
      });
    },
    feature.name + " attivato.",
  );
  controls.append(note, modeLabel, confirmationLabel, button);
  return controls;
}

function buildContagiousInspirationControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const note = document.createElement("small");
  note.textContent = "Conferma al tavolo il successo dell'Ispirazione precedente, poi seleziona un nuovo destinatario diverso dal Bardo entro 18 m.";
  const button = classFeatureButton(
    "Conferma reazione",
    "Consuma soltanto il pool di Ispirazione Contagiosa e concede la normale Ispirazione Bardica",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
      });
    },
    `${feature.name} registrata.`,
  );
  controls.append(note, button);
  return controls;
}

function buildSpellThiefControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-spell-thief-controls";

  const note = document.createElement("small");
  note.textContent = "Seleziona una sola creatura-lanciatore sulla mappa; trigger, CD e TS sono già stati confermati al tavolo.";

  const spellLabel = document.createElement("label");
  spellLabel.textContent = "Incantesimo";
  const spellInput = document.createElement("input");
  spellInput.type = "text";
  spellInput.placeholder = "Nome o ID dal catalogo";
  spellInput.setAttribute("list", "quickActionSpellOptions");
  spellInput.autocomplete = "off";
  spellInput.spellcheck = false;
  spellLabel.appendChild(spellInput);

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Risoluzione";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["deny", "Solo effetto negato"],
    ["steal", "Incantesimo rubato per 8 ore"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che il Ladro può lanciare questo livello");

  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "steal";
    confirmation.checked = modeSelect.value !== "steal" ? false : confirmation.checked;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Conferma reazione",
    "Consuma 1 uso dopo la conferma manuale del trigger e del TS",
    async () => {
      const spell = getSpellDefinition(spellInput.value);
      if (!spell) throw new Error("Seleziona un incantesimo dal catalogo.");
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        spellId: spell.id,
        spellMode: modeSelect.value,
        spellLevelConfirmed: confirmation.checked,
      });
    },
    `${feature.name} registrata.`,
  );
  controls.append(note, spellLabel, modeLabel, confirmationLabel, button);
  return controls;
}

function buildLayOnHandsControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-lay-on-hands-controls";
  const remaining = classFeatureResourceRemaining(feature, state);
  const valueLabel = document.createElement("label");
  valueLabel.textContent = "Punti";
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.step = "1";
  valueInput.value = remaining === 0 ? "" : "1";
  if (remaining !== null) valueInput.max = String(remaining);
  valueInput.title = remaining === null
    ? "Punti della riserva da spendere"
    : `Massimo ${remaining} punti disponibili`;
  valueLabel.appendChild(valueInput);

  const conditionLabel = document.createElement("label");
  conditionLabel.textContent = "Malattie/veleni";
  const conditionInput = document.createElement("input");
  conditionInput.type = "number";
  conditionInput.min = "1";
  conditionInput.step = "1";
  conditionInput.value = "1";
  if (remaining !== null) conditionInput.max = String(Math.floor(remaining / 5));
  conditionLabel.appendChild(conditionInput);

  const makeButton = (label, title, operation, message) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.disabled = classFeatureMutating || remaining === 0;
    button.addEventListener("click", () => void runClassFeatureMutation(operation, message));
    return button;
  };
  const heal = makeButton(
    "Cura",
    "Spendi punti per ripristinare HP",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      await applyLayOnHands({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        value: valueInput.value,
        mode: "heal",
      });
    },
    `${feature.name} usata per curare.`,
  );
  const disease = makeButton(
    "Rimuovi",
    "Spendi 5 punti per ogni malattia o veleno",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      await applyLayOnHands({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: "disease-poison",
        conditionCount: conditionInput.value,
      });
    },
    `${feature.name} usata per malattie/veleni.`,
  );
  controls.append(valueLabel, heal, conditionLabel, disease);
  return controls;
}

function buildPurifyingTouchControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Rimuovi incantesimo";
  button.title = "Seleziona un bersaglio e scegli un suo incantesimo attivo";
  button.disabled = classFeatureMutating;
  button.addEventListener("click", () => void runClassFeatureMutation(
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      const selected = await choosePurifyingSpell(targetIds);
      await purifyClassFeatureSpell({ sourceId: item.id, featureId: feature.id, ...selected });
    },
    `${feature.name} applicato.`,
  ));
  controls.appendChild(button);
  return controls;
}

function buildAdditionalSpellsSummary({ subclass, entries }) {
  const box = document.createElement("div");
  box.className = "class-feature-additional-spells";
  const title = document.createElement("strong");
  title.textContent = "Incantesimi del " + (subclass?.name || "sottoclasse");
  const note = document.createElement("small");
  note.textContent = "Sempre preparati; non contano nel limite degli incantesimi preparati.";
  box.append(title, note);
  const list = document.createElement("ul");
  list.className = "class-feature-additional-spells-list";
  const byLevel = new Map();
  for (const entry of entries) {
    const spells = byLevel.get(entry.level) || [];
    const definition = getSpellDefinition(entry.name);
    spells.push(definition?.catalogLabel || entry.name);
    byLevel.set(entry.level, spells);
  }
  for (const [level, spells] of byLevel) {
    const row = document.createElement("li");
    row.className = "class-feature-additional-spell-row";
    const levelLabel = document.createElement("strong");
    levelLabel.className = "class-feature-additional-spell-level";
    levelLabel.textContent = `Livello ${level}`;
    const names = document.createElement("span");
    names.className = "class-feature-additional-spell-names";
    names.textContent = spells.join(", ");
    row.append(levelLabel, names);
    list.appendChild(row);
  }
  box.appendChild(list);
  return box;
}

function renderClassFeatures() {
  if (!profile || !item) return;
  const enabled = getEnabledClassFeatures(profile);
  const orderedEnabled = orderClassFeaturesByParent(enabled);
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
          ? classFeatureInstanceDisplayName(feature, instance)
          : instance.featureId;
        const detail = document.createElement("small");
        const remaining = classFeatureRemainingRounds(instance, currentRoundValue);
        const targetCount = instance.targetIds.filter((id) => id !== item.id).length;
        const projection = classFeatureEffectProjection(
          feature,
          instance.choiceId,
          profile?.characterBuild,
        );
        const bardicInspirationDie = (
          feature?.id === BARDIC_INSPIRATION_FEATURE_ID
          || projection.conditionEffectId === BARDIC_INSPIRATION_FEATURE_ID
        )
          ? resources.find((entry) => entry.pool.id === "bardo-ispirazione-bardica-usi")?.die
          : null;
        const targeting = classFeatureTargeting(feature, profile?.characterBuild);
        const isAuraToggle = targeting.mode === "aura"
          && feature?.trackingMode !== "instant";
        const parentFeatureId = classFeatureDurationParentFeatureId(feature);
        const parentFeature = parentFeatureId
          ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
          : null;
        const durationTiming = classFeatureDurationTiming(feature);
        const temporarySlotLevel = feature?.id === SORCERY_SOURCE_FEATURE_ID
          ? Number(String(instance.choiceId || "").replace(/^slot-/, ""))
          : null;
        const durationLabel = bardicInspirationDie
          ? `Dado concesso: ${bardicInspirationDie}`
          : Number.isInteger(temporarySlotLevel) && temporarySlotLevel >= 1
          ? `slot temporaneo di livello ${temporarySlotLevel}; termina quando speso o al riposo lungo`
          : durationTiming === "next-turn"
          ? feature?.id === UNSETTLING_WORDS_FEATURE_ID
            ? "fino all'inizio del prossimo turno"
            : "fino al prossimo turno"
          : durationTiming === "next-turn-end"
            ? "fino al termine del prossimo turno"
          : durationTiming === "turn-end"
            ? "fino alla fine del turno corrente"
          : parentFeature
            ? `fino al termine di ${parentFeature.name || parentFeatureId}`
          : remaining === null
            ? "durata manuale"
            : remaining > CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
              ? "durata estesa"
              : `${remaining} round rimanenti`;
        detail.textContent = [
          durationLabel,
          targeting.mode === "aura"
            ? `aura ${targeting.rangeMeters ? `${targeting.rangeMeters} m` : "attiva"}`
            : "",
          targetCount ? `${targetCount} bersaglio${targetCount === 1 ? "" : "i"}` : "",
        ].filter(Boolean).join(" · ");
        copy.append(name, detail);
        const unsettlingValue = feature?.id === UNSETTLING_WORDS_FEATURE_ID
          ? String(instance.choiceId || "").match(/^value-(\d+)$/u)?.[1]
          : "";
        const manualDetail = unsettlingValue
          ? `Il bersaglio sottrae ${unsettlingValue} al prossimo tiro salvezza; tiro e risultato restano manuali.`
          : projection.targetEffect?.detail || "";
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
    orderedEnabled.length
      ? orderedEnabled.map((feature) => {
        const card = document.createElement("article");
        card.className = "class-feature-card";
        const theme = classFeatureTheme(feature);
        const runtimeSupport = classFeatureRuntimeSupport(feature);
        const referenceOnly = classFeatureIsReferenceOnly(feature);
        const targeting = classFeatureTargeting(feature, profile?.characterBuild);
        const isAuraToggle = targeting.mode === "aura"
          && feature.trackingMode !== "instant";
        const parentFeatureId = classFeatureParentFeatureId(feature);
        const parentFeature = parentFeatureId
          ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
          : null;
        if (parentFeature) {
          card.classList.add("class-feature-subfeature");
          card.dataset.parentFeatureId = parentFeature.id;
        }
        if (referenceOnly) card.classList.add("class-feature-reference-only");
        else if (!runtimeSupport.ready) card.classList.add("class-feature-not-automated");
        card.style.setProperty("--feature-accent", theme.accent);
        card.style.setProperty("--feature-background", `${theme.background}26`);
        const head = document.createElement("div");
        head.className = "class-feature-head";
        const copy = document.createElement("div");
        copy.className = "class-feature-copy";
        const name = document.createElement("strong");
        const displayName = classFeatureDisplayNameWithParent(feature);
        name.textContent = displayName;
        const meta = document.createElement("span");
        meta.className = "class-feature-meta";
        meta.textContent = classFeatureMetaText(feature);
        copy.append(name, meta);
        if (referenceOnly || !runtimeSupport.ready) {
          const status = document.createElement("small");
          status.className = "class-feature-runtime-status";
          status.textContent = referenceOnly
            ? "Promemoria Descrittivo"
            : "Non ancora automatizzata: gestione manuale al tavolo";
          copy.appendChild(status);
        }
        head.appendChild(copy);
        let featureControls = null;
        const appendFeatureControl = (control) => {
          if (!control) return;
          if (!featureControls) {
            featureControls = document.createElement("div");
            featureControls.className = "class-feature-controls";
          }
          featureControls.appendChild(control);
        };
        if (isGM && !referenceOnly) {
          const adapter = String(feature.runtimeSupport?.adapter || "").trim();
          if (adapter === "lay-on-hands") {
            appendFeatureControl(buildLayOnHandsControls(feature, state));
          } else if (adapter === "purifying-touch") {
            appendFeatureControl(buildPurifyingTouchControls(feature));
          } else if (adapter === "unsettling-words") {
            appendFeatureControl(buildUnsettlingWordsControls(feature));
          } else if (adapter === "turn-undead") {
            appendFeatureControl(buildTurnUndeadControls(feature));
          } else if (adapter === "turn-creatures") {
            appendFeatureControl(buildTurnCreaturesControls(feature));
          } else if (adapter === "universal-speech") {
            appendFeatureControl(buildUniversalSpeechControls(feature));
          } else if (adapter === "night-eyes") {
            appendFeatureControl(buildNightEyesControls(feature));
          } else if (adapter === "bardic-inspiration"
            && feature.id === CONTAGIOUS_INSPIRATION_FEATURE_ID) {
            appendFeatureControl(buildContagiousInspirationControls(feature));
          } else if (adapter === "sorcery-source") {
            appendFeatureControl(buildSorcerySourceControls(feature, state));
          } else if (adapter === "sorcerous-restoration") {
            appendFeatureControl(buildSorcerousRestorationControls(feature, state));
          } else if (adapter === "wild-magic-surge") {
            appendFeatureControl(buildWildMagicSurgeControls());
          } else if (adapter === "wild-magic-tides") {
            appendFeatureControl(buildWildMagicTidesControls());
          } else if (adapter === "spell-thief") {
            appendFeatureControl(buildSpellThiefControls(feature));
          } else if (adapter === "resource-only" && feature.id === TWINNED_SPELL_FEATURE_ID) {
            appendFeatureControl(buildTwinnedSpellControls(feature));
          } else if (adapter === "resource-only") {
            appendFeatureControl(buildResourceOnlyControls(feature));
          } else {
          const choiceControl = classFeatureChoiceControl(feature);
          const autoChoiceControls = classFeatureAutoChoiceControls(feature);
          appendFeatureControl(choiceControl);
          for (const control of autoChoiceControls.values()) appendFeatureControl(control);
          const activate = document.createElement("button");
          activate.type = "button";
          const activeInstance = active.find((entry) => entry.featureId === feature.id) || null;
          const alreadyActive = Boolean(activeInstance);
          activate.textContent = !runtimeSupport.ready
            ? "Non disponibile"
            : feature.trackingMode === "instant"
              ? "Usa"
              : isAuraToggle && alreadyActive
                ? "Disattiva"
                : "Attiva";
          const requiredFeatureIds = Array.from(new Set([
            ...(classFeatureAutoActivateParentFeatureId(feature)
              ? []
              : [classFeatureDurationParentFeatureId(feature)]),
            classFeatureRequiredActiveFeatureId(feature),
          ].filter(Boolean)));
          const missingRequiredFeatureId = requiredFeatureIds.find((requiredId) =>
            !active.some((entry) => entry.featureId === requiredId)
          ) || "";
          const parentActive = !missingRequiredFeatureId;
          activate.disabled = classFeatureMutating
            || (!isAuraToggle && alreadyActive)
            || !runtimeSupport.ready
            || !parentActive;
          if (isAuraToggle) {
            activate.setAttribute("aria-pressed", String(alreadyActive));
          }
          activate.title = !runtimeSupport.ready
            ? "Questa capacità non è ancora automatizzata"
            : !parentActive
              ? `Richiede prima ${CLASS_FEATURE_BY_ID.get(missingRequiredFeatureId)?.name || "la capacità collegata"}`
            : isAuraToggle
              ? alreadyActive ? "Disattiva l’aura" : "Attiva l’aura"
            : alreadyActive
              ? "La capacità è già attiva"
            : classFeatureTargetMode(feature, profile?.characterBuild) === "selection"
              ? "Usa i token selezionati come bersagli"
              : "Attiva sul personaggio";
          activate.addEventListener("click", () => void runClassFeatureMutation(
            async () => {
              if (isAuraToggle && activeInstance) {
                await deactivateClassFeature(item.id, activeInstance.instanceId);
                return;
              }
              await activateClassFeature({
                sourceId: item.id,
                featureId: feature.id,
                choiceId: classFeatureChoiceSelection(choiceControl),
                autoChoiceIds: classFeatureAutoChoiceSelection(autoChoiceControls),
              });
            },
            isAuraToggle && alreadyActive
              ? `${feature.name} disattivata.`
              : feature.trackingMode === "instant"
                ? `${feature.name} usata.`
                : `${feature.name} attivata.`,
          ));
          appendFeatureControl(activate);
          }
        }
        card.appendChild(head);
        if (feature.description) {
          const description = document.createElement("p");
          description.className = "class-feature-description";
          description.textContent = feature.description;
          description.title = feature.description;
          card.appendChild(description);
        }
        if (featureControls) card.appendChild(featureControls);
        if (feature.id.endsWith("-incantesimi")) {
          const additionalSpells = getAdditionalSubclassSpellEntries(
            profile,
            feature.classId,
          );
          if (additionalSpells.entries.length) {
            card.appendChild(buildAdditionalSpellsSummary(additionalSpells));
          }
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
    .sort((a, b) => classFeatureDisplayNameWithParent(a)
      .localeCompare(classFeatureDisplayNameWithParent(b), "it"));
}

function buildQuickActionEditorRow(action = null) {
  const current = action || {
    id: quickActionId(),
    label: "",
    kind: "spell",
    targetMode: "selection",
    launchMode: "auto",
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
    featureOptions.push([feature.id, classFeatureDisplayNameWithParent(feature)]);
  }
  if (
    current.featureId
    && !featureOptions.some(([value]) => value === current.featureId)
  ) {
    featureOptions.push([current.featureId, current.featureId]);
  }
  const featureSelect = selectControl(featureOptions, current.featureId || "");
  featureSelect.dataset.quickActionField = "featureId";

  const launchModeSelect = selectControl([
    ["auto", "Lancia subito se possibile"],
    ["review", "Apri il pannello prima del lancio"],
  ], current.launchMode || "auto");
  launchModeSelect.dataset.quickActionField = "launchMode";

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
  const launchModeLabel = makeLabel("Lancio", launchModeSelect);
  const slotLabel = makeLabel("Slot", slotInput);
  const turnsLabel = makeLabel("Durata in round", turnsInput);
  const expiryLabel = makeLabel("Scadenza", expirySelect);
  const durationLabel = makeLabel("Occorrenze", durationInput);
  grid.append(
    kindLabel,
    targetLabel,
    referenceLabel,
    featureLabel,
    launchModeLabel,
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
    launchModeLabel.hidden = !spell;
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
      if (!labelInput.value.trim()) labelInput.value = classFeatureDisplayNameWithParent(feature);
    }
    syncKind();
  });
  referenceInput.addEventListener("change", () => {
    if (kindSelect.value === "spell") {
      const spell = getSpellDefinition(referenceInput.value);
      if (spell) {
        referenceInput.value = spell.catalogLabel || spell.displayName || spell.name;
        if (!labelInput.value.trim()) labelInput.value = spell.displayName || spell.name;
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
      const label = field("label").value.trim() || classFeatureDisplayNameWithParent(feature);
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
        launchMode: field("launchMode").value,
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

  const buildFeatureOption = (feature) => {
    const option = document.createElement("label");
    option.className = "class-feature-editor-option";
    const parentFeatureId = classFeatureParentFeatureId(feature);
    const parentFeature = parentFeatureId
      ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
      : null;
    if (parentFeature) {
      option.classList.add("class-feature-editor-suboption");
      option.dataset.parentFeatureId = parentFeature.id;
    }
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.classFeatureId = feature.id;
    checkbox.checked = draftEnabledFeatureIds.has(feature.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        draftEnabledFeatureIds.add(feature.id);
        if (feature.optionGroup) {
          for (const peer of available.filter((entry) =>
            entry.optionGroup === feature.optionGroup && entry.id !== feature.id
          )) {
            draftEnabledFeatureIds.delete(peer.id);
            for (const peerCheckbox of list.querySelectorAll("input[data-class-feature-id]")) {
              if (peerCheckbox.dataset.classFeatureId === peer.id) peerCheckbox.checked = false;
            }
          }
        }
      } else {
        draftEnabledFeatureIds.delete(feature.id);
      }
      setClassFeaturesTabCount(
        available.filter((entry) => draftEnabledFeatureIds.has(entry.id)).length
      );
    });
    const copy = document.createElement("span");
    copy.className = "class-feature-editor-option-copy";
    const name = document.createElement("strong");
    name.textContent = parentFeature ? `↳ ${feature.name}` : feature.name;
    const meta = document.createElement("small");
    meta.textContent = classFeatureIsReferenceOnly(feature)
      ? classFeatureMetaText(feature)
      : classFeatureRuntimeSupport(feature).ready
        ? classFeatureMetaText(feature)
        : `${classFeatureMetaText(feature)} · solo riferimento`;
    copy.append(name, meta);
    option.append(checkbox, copy);
    return option;
  };
  const availableIds = new Set(available.map((feature) => feature.id));
  const childrenByParent = new Map();
  for (const feature of available) {
    const parentId = classFeatureParentFeatureId(feature);
    if (!parentId || !availableIds.has(parentId)) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(feature);
    childrenByParent.set(parentId, children);
  }
  const roots = available.filter((feature) => {
    const parentId = classFeatureParentFeatureId(feature);
    return !parentId || !availableIds.has(parentId);
  });
  const nodes = [];
  for (const feature of roots) {
    nodes.push(buildFeatureOption(feature));
    const children = childrenByParent.get(feature.id) || [];
    if (!children.length) continue;
    const subgroup = document.createElement("div");
    subgroup.className = "class-feature-editor-subgroup";
    subgroup.dataset.parentFeatureId = feature.id;
    const label = document.createElement("small");
    label.textContent = `Scelte di ${feature.name}`;
    subgroup.append(label, ...children.map(buildFeatureOption));
    nodes.push(subgroup);
  }
  list.replaceChildren(...nodes);
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
  const operation = sceneLifecycle.capture({ operationId: `initiative-exhaustion:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item || exhaustionSaving) return;
  const next = Math.max(0, Math.min(5, Number(profile.exhaustion || 0) + delta));
  if (next === profile.exhaustion) return;
  exhaustionSaving = true;
  renderView();
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: next }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
  } catch (err) {
    console.warn("[initiative-card] Indebolimento:", err?.message || err);
  } finally {
    exhaustionSaving = false;
    if (sceneLifecycle.isReady()) renderView();
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
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      item = null;
      profile = null;
      editing = false;
      classFeatureMutating = false;
      quickActionLaunching = false;
      document.querySelectorAll("input, select, textarea, button").forEach((control) => {
        if (control.id !== "close") control.disabled = true;
      });
      $("status").textContent = "Scena cambiata: riapri la scheda.";
      $("classFeatureRunStatus").textContent = "Scena cambiata: riapri la scheda.";
      closeInitiativeCardPopover();
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      window.location.reload();
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    $("title").textContent = "Scheda non disponibile";
    $("hp").textContent = "Scena non disponibile: riapri la scheda.";
    return;
  }
  try {
    const [items, role, sceneMetadata] = await Promise.all([
      OBR.scene.items.getItems([sourceId]),
      OBR.player.getRole(),
      OBR.scene.getMetadata().catch(() => ({})),
    ]);
    if (!sceneLifecycle.isReady()) throw new Error("Scena cambiata: riapri la scheda.");
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
  const operation = sceneLifecycle.capture({ operationId: `initiative-card-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item) return;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  $("status").textContent = "";
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
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
    }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
    renderView();
    setEditing(false);
  } catch (err) {
    $("status").textContent = err?.message || "Salvataggio non riuscito";
  } finally {
    if (submit) submit.disabled = false;
  }
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
