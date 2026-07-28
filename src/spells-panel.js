import OBR from "@owlbear-rodeo/sdk";
import {
  createSpellInstanceId,
  getCasterConcentrations,
} from "./spells.js";
import { refreshConditionLabels } from "./conditions.js";
import {
  commitEffectsMutationPlan,
  prepareEffectsMutation,
} from "./effectsMutations.js";
import {
  getTrackableSpellOptions,
  getSpellDefinition,
  getSpellChoiceTiming,
} from "./spells-srd.js";
import {
  resolveSpellSlotLevel,
} from "./spellCastContextCore.js";
import {
  getSpellCastPhasePlan,
} from "./spellCastPhaseCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { withItemMetaHistory } from "./history.js";
import { ID } from "./constants.js";
import { openReferencePopover } from "./referencePopover.js";
import { makeReferenceButton } from "./referenceButton.js";
import { buildSpellAutomationViewModel } from "./spellsPanelAutomationViewCore.js";
import { createSpellCatalogMenuController } from "./spellsPanelCatalogMenu.js";
import {
  createSpellTargetPicker,
  spellResolveActionPresentation,
  spellSubmitActionLabel,
  spellTargetCountLabel,
} from "./spellsPanelTargetPicker.js";
import {
  getTrackerBaseItemId,
  spellOverviewGroups,
} from "./spellsPanelViewCore.js";
import { renderSpellOverview } from "./spellsPanelOverviewView.js";
import { renderCasterConcentrationSummary } from "./spellsPanelCasterSummaryView.js";
import { wireSpellPanelFormWorkflow } from "./spellsPanelFormWorkflow.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "./spellApplicationPlanCore.js";

const META_KEY = ID + "/meta";
const STATE_KEY = ID + "/state";
const SPELLS_META_KEY = ID + "/spells";
const CONC_META_KEY = ID + "/concentration";
const MODAL_ID = ID + "/spells-modal";
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";

function closeSpellsPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

const $ = (id) => document.getElementById(id);
const uniqueIds = (values) => Array.from(new Set((values || []).filter(Boolean)));

async function terminateSpellGroup(group, requestedTargetIds = null) {
  const scoped = Array.isArray(requestedTargetIds);
  const targetIds = scoped
    ? uniqueIds(requestedTargetIds)
    : Array.from(group.targets.keys());
  if (!targetIds.length) return;
  const operations = [];
  if (group.concentrating && group.casterId) {
    operations.push({
      type: scoped ? "concentration:break-targets" : "concentration:break",
      casterIds: [group.casterId],
      reference: group.concentrationRef,
      ...(scoped ? { targetIds } : {}),
    });
  }
  operations.push(group.instanceId
    ? { type: "spell:remove-instance", targetIds, instanceId: group.instanceId }
    : {
      type: "spell:remove-name-source",
      targetIds,
      name: group.storedName,
      casterId: group.casterId || null,
    });
  const mutationPlan = await prepareEffectsMutation(operations);
  const historyIds = mutationPlan.changedIds;
  await withItemMetaHistory({
    kind: "spell",
    label: "Terminato incantesimo: " + group.name,
    itemIds: historyIds,
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, () => commitEffectsMutationPlan(mutationPlan));
  await refreshConditionLabels(targetIds);
}

OBR.onReady(() => {
  init().catch((err) => {
    console.error("[spell-panel] init:", err?.message || err);
  });
});

async function init() {
  const form = $("f");
  const nameInput = $("name");
  const spellMenuToggle = $("spellMenuToggle");
  const spellMenu = $("spellMenu");
  const durationInput = $("dur");
  const slotLevelInput = $("slotLevel");
  const slotLevelLabel = $("slotLevelLabel");
  const concentrationInput = $("conc");
  const casterSelect = $("caster");
  const endButton = $("end");
  const concentrationWrap = $("concWrap");
  const concentrationList = $("concList");
  const cancelButton = $("cancel");
  const submitButton = $("submit");
  const modalTitle = $("modalTitle");
  const modalClose = $("modalClose");
  const automationWrap = $("automationWrap");
  const applyConditionsInput = $("applyConditions");
  const automationText = $("automationText");
  const conditionChoice = $("conditionChoice");
  const overviewList = $("spellOverviewList");
  const overviewCount = $("spellOverviewCount");
  const spellTargetList = $("spellTargetList");
  const spellTargetNameFilter = $("spellTargetNameFilter");
  const spellTargetSelectionCount = $("spellTargetSelectionCount");
  const spellFactionButtons = Array.from(document.querySelectorAll("[data-spell-faction]"));
  const sourceId = new URLSearchParams(window.location.search).get("source") || "";
  const isModal = !!sourceId;

  if (isModal) {
    let sourceName = "Token";
    try {
      const [source] = await OBR.scene.items.getItems([sourceId]);
      sourceName = source?.name || sourceName;
    } catch {}
    if (modalTitle) modalTitle.textContent = "Incantesimi: " + sourceName;
    modalClose?.addEventListener("click", closeSpellsPopover);
  }

  try {
    nameInput.setAttribute("autocomplete", "off");
    nameInput.focus();
  } catch {}

  const {
    closeSpellMenu,
    openSpellMenu,
  } = createSpellCatalogMenuController({
    document,
    input: nameInput,
    toggle: spellMenuToggle,
    menu: spellMenu,
    entries: getTrackableSpellOptions(),
    getSelectedId: () => getSpellDefinition(nameInput.value)?.id || "",
    onSelect: () => syncCatalogSelection(true),
  });

  const allCasters = await getAllInitiativeCharacters(sourceId);
  const capturedTargetIds = isModal
    ? await getCardTargetIds(sourceId, allCasters)
    : await getContextOrSelectionIds();
  let spellSelectionWriteDepth = 0;
  let spellTargetPicker = null;

  const selectedSpellTargetIds = () =>
    spellTargetPicker?.selectedSpellTargetIds() || [];

  const refreshSpellTargetCount = (requestedCount = null) => {
    const count = Number.isInteger(requestedCount)
      ? requestedCount
      : selectedSpellTargetIds().length;
    if (spellTargetSelectionCount) {
      spellTargetSelectionCount.textContent = spellTargetCountLabel(count);
    }
    if (submitButton) {
      const spell = getSpellDefinition(nameInput.value);
      const phasePlan = getSpellCastPhasePlan(
        spell,
        "",
        { slotLevel: resolveSpellSlotLevel(spell, slotLevelInput?.value) },
      );
      const subjectMode = phasePlan.subjectMode || spell?.targetMode;
      submitButton.textContent = spellSubmitActionLabel({
        count,
        phase: phasePlan.phase,
        subjectMode,
      });
    }
    overviewList?.querySelectorAll("[data-resolve-spell='1']").forEach((button) => {
      const presentation = spellResolveActionPresentation(count);
      button.disabled = presentation.disabled;
      button.textContent = presentation.text;
      button.title = presentation.title;
    });
  };

  const writeSpellTargetSelection = async (ids, selected, replace = false) => {
    spellSelectionWriteDepth += 1;
    try {
      if (selected) await OBR.player.select(ids, replace);
      else await OBR.player.deselect(ids);
    } finally {
      spellSelectionWriteDepth -= 1;
    }
  };

  spellTargetPicker = createSpellTargetPicker({
    document,
    items: allCasters,
    list: spellTargetList,
    nameFilter: spellTargetNameFilter,
    factionButtons: spellFactionButtons,
    onSelectionChange: writeSpellTargetSelection,
    onSelectionCountChange: refreshSpellTargetCount,
  });
  const applySpellTargetSelection = (ids) =>
    spellTargetPicker.applySpellTargetSelection(ids);
  applySpellTargetSelection(capturedTargetIds);

  const refreshSpellTargetSelection = async () => {
    if (spellSelectionWriteDepth > 0) return;
    try {
      applySpellTargetSelection(await OBR.player.getSelection());
    } catch {}
  };
  const selectionUnsubscribe = OBR.player.onChange((player) => {
    if (spellSelectionWriteDepth === 0 && Array.isArray(player?.selection)) {
      applySpellTargetSelection(player.selection);
    }
  });
  const selectionPollTimer = window.setInterval(refreshSpellTargetSelection, 120);
  window.addEventListener("beforeunload", () => {
    selectionUnsubscribe?.();
    window.clearInterval(selectionPollTimer);
  }, { once: true });

  for (const item of allCasters) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || item.id;
    casterSelect.appendChild(option);
  }

  const defaultCasterId = isModal ? sourceId : (capturedTargetIds[0] || "");
  if (defaultCasterId && allCasters.some((item) => item.id === defaultCasterId)) {
    casterSelect.value = defaultCasterId;
  }

  const refreshCasterEnabled = () => {
    const enabled = allCasters.length > 0;
    casterSelect.disabled = !enabled;
    casterSelect.style.opacity = enabled ? "1" : ".6";
  };
  concentrationInput.addEventListener("change", refreshCasterEnabled);
  refreshCasterEnabled();

  const currentCastContext = (spell) => ({
    slotLevel: resolveSpellSlotLevel(spell, slotLevelInput?.value),
  });

  let automationSpellId = "";
  const renderAutomation = (spell) => {
    if (!automationWrap || !automationText || !applyConditionsInput || !conditionChoice) return;
    const wasAutomationDisabled = applyConditionsInput.disabled;
    if (!spell) {
      automationWrap.style.display = "none";
      automationSpellId = "";
      refreshSpellTargetCount();
      return;
    }

    const previousChoice = automationSpellId === spell.id ? conditionChoice.value : "";
    const viewModel = buildSpellAutomationViewModel({
      spell,
      castContext: currentCastContext(spell),
      previousChoice,
    });

    automationWrap.style.display = "";
    conditionChoice.replaceChildren();
    for (const choice of viewModel.choices) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      conditionChoice.appendChild(option);
    }
    if (viewModel.selectedChoice) conditionChoice.value = viewModel.selectedChoice;
    conditionChoice.style.display = viewModel.showChoice ? "" : "none";
    automationText.textContent = viewModel.text;

    if (!viewModel.hasAutomatedConditions) {
      applyConditionsInput.checked = false;
      applyConditionsInput.disabled = true;
      applyConditionsInput.style.display = "none";
      automationSpellId = spell.id;
      refreshSpellTargetCount();
      return;
    }

    applyConditionsInput.disabled = false;
    applyConditionsInput.style.display = "";
    if (automationSpellId !== spell.id || wasAutomationDisabled) {
      applyConditionsInput.checked = true;
    }
    automationSpellId = spell.id;
    refreshSpellTargetCount();
  };
  conditionChoice?.addEventListener("change", () => {
    const spell = getSpellDefinition(nameInput.value);
    renderAutomation(spell);
    const timing = getSpellChoiceTiming(
      spell,
      conditionChoice.value,
      currentCastContext(spell),
    );
    if (timing?.defaultTurns) durationInput.value = String(timing.defaultTurns);
  });
  slotLevelInput?.addEventListener("change", () => {
    const spell = getSpellDefinition(nameInput.value);
    const resolvedLevel = resolveSpellSlotLevel(spell, slotLevelInput.value);
    slotLevelInput.value = String(resolvedLevel);
    const timing = getSpellChoiceTiming(
      spell,
      conditionChoice?.value || "",
      currentCastContext(spell),
    );
    if (timing?.defaultTurns) durationInput.value = String(timing.defaultTurns);
    renderAutomation(spell);
  });

  const syncCatalogSelection = (applyDefaults) => {
    const spell = getSpellDefinition(nameInput.value);
    renderAutomation(spell);
    concentrationInput.disabled = !!spell;
    concentrationInput.title = spell
      ? "Valore definito dal catalogo dell'incantesimo"
      : "Imposta la concentrazione per una spell personalizzata";
    concentrationInput.style.opacity = spell ? ".72" : "1";
    if (spell) concentrationInput.checked = spell.concentration === true;
    const usesSlot = !!spell && Number(spell.level) > 0;
    if (slotLevelInput && slotLevelLabel) {
      slotLevelInput.style.display = usesSlot ? "" : "none";
      slotLevelLabel.style.display = usesSlot ? "" : "none";
      slotLevelInput.disabled = !usesSlot;
      if (usesSlot) {
        slotLevelInput.min = String(spell.level);
        slotLevelInput.max = "9";
        if (applyDefaults) slotLevelInput.value = String(spell.level);
      }
    }
    if (spell && applyDefaults) {
      const timing = getSpellChoiceTiming(
        spell,
        conditionChoice.value,
        currentCastContext(spell),
      );
      const defaultTurns = timing?.defaultTurns ?? spell.defaultTurns;
      durationInput.value = defaultTurns ? String(defaultTurns) : "";
      refreshCasterEnabled();
      renderAutomation(spell);
    }
    return spell;
  };

  nameInput.addEventListener("input", () => {
    syncCatalogSelection(false);
    openSpellMenu(nameInput.value);
  });
  nameInput.addEventListener("change", () => syncCatalogSelection(true));
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSpellMenu();
    else if (event.key === "ArrowDown" && spellMenu?.hidden) {
      event.preventDefault();
      openSpellMenu(nameInput.value);
    }
  });
  spellMenuToggle?.addEventListener("click", () => {
    if (spellMenu?.hidden) {
      openSpellMenu("");
      nameInput.focus();
    } else {
      closeSpellMenu();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".spell-combobox")) closeSpellMenu();
  });

  const contextCasterId = isModal ? sourceId : await deduceContextSingleId();
  const commitSpellApplication = async ({
    spell,
    enteredName = "",
    turns = 1,
    casterId = "",
    targetIds = [],
    castContext = {},
    selectedChoice = "",
    phasePlan = null,
    applyAutomatedConditions = true,
    activeConcentration = null,
    historyLabel = "",
    requestedConcentration = false,
  } = {}) => {
    const intent = buildSpellApplicationIntent({
      spell,
      enteredName,
      turns,
      casterId,
      targetIds,
      castContext,
      selectedChoice,
      phasePlan,
      applyAutomatedConditions,
      activeConcentration,
      historyLabel,
      requestedConcentration,
    });
    if (!intent) return [];
    const instanceId = String(activeConcentration?.instanceId || "").trim()
      || createSpellInstanceId();
    const appliedAt = await getAppliedAt();
    const caster = allCasters.find((item) => item.id === casterId) || null;
    const applicationPlan = buildSpellApplicationPlan({
      intent,
      instanceId,
      appliedAt,
      casterName: caster?.name || "",
    });
    const mutationPlan = await prepareEffectsMutation(applicationPlan.operations);
    const historyIds = mutationPlan.changedIds;
    await withItemMetaHistory({
      kind: "spell",
      label: applicationPlan.historyLabel,
      itemIds: historyIds,
      fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
    }, () => commitEffectsMutationPlan(mutationPlan));
    await refreshConditionLabels(historyIds);
    return historyIds;
  };

  let overviewRevision = 0;
  const refreshOverview = async () => {
    if (!overviewList) return;
    const revision = ++overviewRevision;
    const items = await getAllInitiativeCharacters(sourceId);
    const groups = spellOverviewGroups(items);
    if (revision !== overviewRevision) return;

    renderSpellOverview({
      document,
      overviewList,
      overviewCount,
      groups,
      createReferenceButton: makeReferenceButton,
      getSelectedTargetIds: selectedSpellTargetIds,
      onOpenReference(group) {
        void openReferencePopover({
          tab: "spells",
          entry: group.name,
          closeId: MODAL_ID,
        }).catch((error) => console.warn("[spells] reference open error:", error?.message || error));
      },
      async onTerminateTarget(group, targetId) {
        await terminateSpellGroup(group, [targetId]);
        await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
        await refreshOverview();
      },
      async onResolve({
        group,
        spell,
        targetIds,
        selectedChoice,
      }) {
        const castContext = {
          ...(group.castContext || {}),
          phase: "resolve",
        };
        await commitSpellApplication({
          spell,
          enteredName: group.storedName,
          turns: Math.max(1, ...group.turns),
          casterId: group.casterId,
          targetIds,
          castContext,
          selectedChoice,
          phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
          applyAutomatedConditions: group.castContext?.applyAutomatedConditions !== false,
          activeConcentration: {
            instanceId: group.instanceId,
            spellId: group.spellId,
            name: group.storedName,
            targets: Array.from(group.targets.keys()),
          },
          historyLabel: "Risoluzione: " + group.name,
        });
        await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
        await refreshOverview();
      },
      async onTerminate(group) {
        await terminateSpellGroup(group);
        await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
        await refreshOverview();
      },
      onActionError(action, error) {
        console.warn(`[spell-panel] ${action}:`, error?.message || error);
      },
    });
    if (!groups.length) return;
    refreshSpellTargetCount();
  };

  await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
  await refreshOverview();
  let overviewRefreshTimer = null;
  if (overviewList) {
    OBR.scene.items.onChange(() => {
      if (overviewRefreshTimer) clearTimeout(overviewRefreshTimer);
      overviewRefreshTimer = setTimeout(() => void refreshOverview(), 80);
    });
  }

  wireSpellPanelFormWorkflow({
    form,
    nameInput,
    durationInput,
    concentrationInput,
    casterSelect,
    conditionChoice,
    applyConditionsInput,
    submitButton,
    cancelButton,
    endButton,
    defaultCasterId,
    sourceId,
    allCasters,
    isModal,
    getCurrentCastContext: currentCastContext,
    getSelectedTargetIds: selectedSpellTargetIds,
    getFallbackTargetIds: getContextOrSelectionIds,
    onCommit: commitSpellApplication,
    async onClearNonConcentration(ids) {
      const mutationPlan = await prepareEffectsMutation([{
        type: "spell:clear-non-concentration",
        targetIds: ids,
      }]);
      await withItemMetaHistory({
        kind: "spell",
        label: ids.length > 1 ? "Terminati incantesimi multipli" : "Terminati incantesimi",
        itemIds: mutationPlan.changedIds,
        fields: [SPELLS_META_KEY, "conditions"],
      }, () => commitEffectsMutationPlan(mutationPlan));
      await refreshConditionLabels(ids);
    },
    async onAfterSubmit() {
      await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
      await refreshOverview();
    },
    onAfterClear: refreshOverview,
    async onClose() {
      try {
        await OBR.contextMenu.close?.();
      } catch {}
    },
  });
}

async function getContextOrSelectionIds() {
  try {
    const context = await OBR.contextMenu.getContext();
    const ids = (context?.items || []).map((item) => item.id).filter(Boolean);
    if (ids.length) return ids;
  } catch {}
  try {
    const selection = await OBR.player.getSelection();
    if (selection?.length) return selection.filter(Boolean);
  } catch {}
  return [];
}

async function getCardTargetIds(sourceId, initiativeCharacters = []) {
  try {
    const selected = await OBR.player.getSelection();
    const ids = uniqueIds(Array.isArray(selected) ? selected : []);
    if (ids.length) {
      const activeIds = new Set(initiativeCharacters.map((item) => item.id));
      const valid = ids.filter((id) => activeIds.has(id));
      if (valid.length) return valid;
    }
  } catch {}
  return sourceId ? [sourceId] : [];
}

async function deduceContextSingleId() {
  const ids = await getContextOrSelectionIds();
  return ids.length === 1 ? ids[0] : null;
}

async function getAllInitiativeCharacters(sourceId = "") {
  try {
    const metadata = await OBR.scene.getMetadata();
    const order = Array.isArray(metadata?.[STATE_KEY]?.order)
      ? metadata[STATE_KEY].order
      : [];
    const orderedIds = uniqueIds(order.map(getTrackerBaseItemId));
    const orderedSet = new Set(orderedIds);
    const items = await OBR.scene.items.getItems((item) => {
      const meta = item.metadata?.[META_KEY];
      return item.layer === "CHARACTER"
        && !!meta
        && (meta.inInitiative === true || orderedSet.has(item.id) || item.id === sourceId);
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const active = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    for (const item of items) {
      if (!active.some((candidate) => candidate.id === item.id)
        && (item.metadata?.[META_KEY]?.inInitiative === true || item.id === sourceId)) {
        active.push(item);
      }
    }
    if (active.length) return active;
  } catch (err) {
    console.warn("[spell-panel] initiative caster lookup:", err?.message || err);
  }

  try {
    const items = await OBR.scene.items.getItems(
      (item) => item.layer === "CHARACTER" && !!item.metadata?.[META_KEY]
    );
    items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "it"));
    return items;
  } catch {
    return [];
  }
}

async function getAppliedAt() {
  try {
    const metadata = await OBR.scene.getMetadata();
    const state = metadata?.[STATE_KEY] || {};
    const order = Array.isArray(state.order) ? state.order : [];
    return {
      round: Math.max(1, Number(state.round || 1)),
      actorId: order[state.current] || null,
      phase: "turn",
      turnKey: currentInitiativeTurnKey(state),
    };
  } catch {
    return null;
  }
}

async function refreshCasterSummary(casterId, wrap, list) {
  if (!wrap || !list) return;
  list.replaceChildren();
  if (!casterId) {
    wrap.style.display = "none";
    return;
  }
  try {
    const concentrations = await getCasterConcentrations(casterId);
    renderCasterConcentrationSummary({
      document,
      wrap,
      list,
      concentrations,
      async onBreak({
        key,
        info,
        displayName,
        targetIds,
      }) {
        const mutationPlan = await prepareEffectsMutation([{
          type: "concentration:break",
          casterIds: [casterId],
          reference: info?.instanceId || key,
        }]);
        const ids = mutationPlan.changedIds;
        await withItemMetaHistory({
          kind: "spell",
          label: "Concentrazione interrotta: " + displayName,
          itemIds: ids,
          fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
        }, () => commitEffectsMutationPlan(mutationPlan));
        await refreshConditionLabels(targetIds);
        await refreshCasterSummary(casterId, wrap, list);
      },
    });
  } catch {
    wrap.style.display = "none";
  }
}
