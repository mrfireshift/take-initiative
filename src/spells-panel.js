import OBR from "@owlbear-rodeo/sdk";
import {
  createSpellInstanceId,
  getCasterConcentrations,
  getSpellsFromItem,
} from "./spells.js";
import { refreshConditionLabels } from "./conditions.js";
import {
  commitEffectsMutationPlan,
  prepareEffectsMutation,
  spellApplicationOperations,
} from "./effectsMutations.js";
import {
  getTrackableSpellOptions,
  getSpellDefinition,
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
  getSpellChoiceTiming,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
} from "./spells-srd.js";
import { buildSpellCastAutomationPlan } from "./spellCastAutomationCore.js";
import {
  resolveSpellConcentration,
  resolveSpellSlotLevel,
  resolveSpellSubjectIds,
} from "./spellCastContextCore.js";
import {
  getSpellCastPhasePlan,
  isPreparedSpellCast,
  withSpellPhaseTransitionOperations,
} from "./spellCastPhaseCore.js";
import { spellExpiryCounter } from "./spellExpiryCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { withItemMetaHistory } from "./history.js";
import { ID } from "./constants.js";
import { openReferencePopover } from "./referencePopover.js";
import { makeReferenceButton } from "./referenceButton.js";

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

function spellDisplayName(value) {
  const raw = String(value || "").trim();
  return getSpellDefinition(raw)?.displayName || raw || "Incantesimo";
}

function factionKey(item) {
  const attitude = String(item?.metadata?.[META_KEY]?.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}

function factionColor(item) {
  const attitude = factionKey(item);
  if (attitude === "enemy") return "#ef4444";
  if (attitude === "ally") return "#22c55e";
  if (attitude === "pc") return "#38bdf8";
  return "#eab308";
}

function spellOverviewGroups(items = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groups = new Map();

  for (const target of items) {
    for (const spell of getSpellsFromItem(target)) {
      const instanceId = String(spell?.instanceId || "").trim();
      const casterId = String(spell?.casterId || "").trim();
      const storedName = String(spell?.name || "").trim();
      const fallbackKey = casterId + "\u0000" + storedName.toLocaleLowerCase("it");
      const key = instanceId ? "instance:" + instanceId : "legacy:" + fallbackKey;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          instanceId,
          storedName,
          spellId: String(spell?.spellId || "").trim(),
          castContext: spell?.castContext && typeof spell.castContext === "object"
            ? { ...spell.castContext }
            : null,
          name: spellDisplayName(spell?.spellId || storedName),
          casterId,
          casterName: byId.get(casterId)?.name || "Non indicato",
          concentrating: !!spell?.conc,
          concentrationRef: instanceId || storedName,
          targets: new Map(),
          turns: [],
          counters: [],
        };
        groups.set(key, group);
      }
      group.concentrating = group.concentrating || !!spell?.conc;
      if (!group.spellId && spell?.spellId) group.spellId = String(spell.spellId);
      if (!group.castContext && spell?.castContext && typeof spell.castContext === "object") {
        group.castContext = { ...spell.castContext };
      }
      group.targets.set(target.id, target.name || target.id);
      group.turns.push(Math.max(0, Math.floor(Number(spell?.turns) || 0)));
      group.counters.push(spellExpiryCounter(spell));
    }
  }

  for (const caster of items) {
    const concentrations = caster?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
    for (const [key, info] of Object.entries(concentrations)) {
      const instanceId = String(info?.instanceId || "").trim();
      const storedName = String(info?.name || key).trim();
      const exactKey = instanceId ? "instance:" + instanceId : "";
      const legacyKey = "legacy:" + caster.id + "\u0000" + storedName.toLocaleLowerCase("it");
      const group = (exactKey && groups.get(exactKey)) || groups.get(legacyKey);
      if (!group) continue;
      group.concentrating = true;
      group.casterId = caster.id;
      group.casterName = caster.name || caster.id;
      group.concentrationRef = instanceId || key;
      if (!group.spellId && info?.spellId) group.spellId = String(info.spellId);
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "it") || a.casterName.localeCompare(b.casterName, "it")
  );
}

function spellTurnsLabel(turns = [], counters = []) {
  const exact = Array.from(new Set(counters.filter((value) => /[IF]\s[CB]/.test(value))));
  if (exact.length) return exact.join(" / ");
  const values = turns.filter(Number.isFinite);
  if (!values.length) return "Durata non indicata";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? min + " round" : min + "-" + max + " round";
}

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

  const spellSearchEntries = getTrackableSpellOptions();
  let activeSpellCatalogFilter = "all";
  const closeSpellMenu = () => {
    if (!spellMenu || !spellMenuToggle) return;
    spellMenu.hidden = true;
    nameInput.setAttribute("aria-expanded", "false");
    spellMenuToggle.setAttribute("aria-expanded", "false");
  };
  const openSpellMenu = (query = "") => {
    if (!spellMenu || !spellMenuToggle) return;
    const normalizedQuery = String(query || "").trim().toLocaleLowerCase("it");
    const matchesFilter = (entry) => ({
      concentration: entry.concentration,
      area: entry.area,
      automated: entry.automated,
    })[activeSpellCatalogFilter] ?? true;
    const matches = spellSearchEntries.filter((entry) =>
      matchesFilter(entry)
      && (!normalizedQuery || entry.label.toLocaleLowerCase("it").includes(normalizedQuery))
    );
    const selectedId = getSpellDefinition(nameInput.value)?.id || "";
    spellMenu.replaceChildren();
    const filters = document.createElement("div");
    filters.className = "spell-menu-filters";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filtra catalogo incantesimi");
    for (const [value, label] of [
      ["all", "Tutti"],
      ["concentration", "Concentrazione"],
      ["area", "Area/TS"],
      ["automated", "Effetti"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "spell-menu-filter" + (activeSpellCatalogFilter === value ? " active" : "");
      button.textContent = label;
      button.setAttribute("aria-pressed", String(activeSpellCatalogFilter === value));
      button.addEventListener("click", () => {
        activeSpellCatalogFilter = value;
        openSpellMenu(query);
      });
      filters.appendChild(button);
    }
    spellMenu.appendChild(filters);
    const entriesByLevel = new Map();
    for (const entry of matches) {
      const level = Math.max(0, Math.floor(Number(entry.level) || 0));
      if (!entriesByLevel.has(level)) entriesByLevel.set(level, []);
      entriesByLevel.get(level).push(entry);
    }
    for (const [level, entries] of [...entriesByLevel.entries()].sort((a, b) => a[0] - b[0])) {
      const group = document.createElement("div");
      group.className = "spell-menu-group";
      const heading = document.createElement("div");
      heading.className = "spell-menu-level";
      heading.textContent = level === 0 ? "Trucchetti" : `Livello ${level}`;
      group.appendChild(heading);
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "spell-menu-option" + (selectedId === entry.id ? " active" : "");
        button.textContent = entry.label;
        button.title = entry.label;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(selectedId === entry.id));
        button.addEventListener("click", () => {
          nameInput.value = entry.value;
          closeSpellMenu();
          syncCatalogSelection(true);
          nameInput.focus();
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
    nameInput.setAttribute("aria-expanded", "true");
    spellMenuToggle.setAttribute("aria-expanded", "true");
  };

  const allCasters = await getAllInitiativeCharacters(sourceId);
  const capturedTargetIds = isModal
    ? await getCardTargetIds(sourceId, allCasters)
    : await getContextOrSelectionIds();
  const spellTargetControls = new Map();
  const activeSpellFactionFilters = new Set();
  let spellSelectionWriteDepth = 0;

  const selectedSpellTargetIds = () => Array.from(spellTargetControls.entries())
    .filter(([, control]) => control.checkbox.checked)
    .map(([id]) => id);

  const refreshSpellTargetCount = () => {
    const count = selectedSpellTargetIds().length;
    if (spellTargetSelectionCount) {
      spellTargetSelectionCount.textContent = count === 1 ? "1 selezionato" : `${count} selezionati`;
    }
    if (submitButton) {
      const spell = getSpellDefinition(nameInput.value);
      const phasePlan = getSpellCastPhasePlan(
        spell,
        "",
        { slotLevel: resolveSpellSlotLevel(spell, slotLevelInput?.value) },
      );
      const subjectMode = phasePlan.subjectMode || spell?.targetMode;
      if (phasePlan.phase === "prepare") {
        submitButton.textContent = "Prepara sul caster";
      } else if (subjectMode === "self" || subjectMode === "caster") {
        submitButton.textContent = "Applica al caster";
      } else {
        submitButton.textContent = count === 1
          ? "Applica a 1 bersaglio"
          : `Applica a ${count} bersagli`;
      }
    }
    overviewList?.querySelectorAll("[data-resolve-spell='1']").forEach((button) => {
      button.disabled = count === 0;
      button.textContent = count > 0 ? `Risolvi (${count})` : "Risolvi";
      button.title = count > 0
        ? `Risolvi sui ${count} bersagli selezionati`
        : "Seleziona almeno un bersaglio";
    });
  };

  const applySpellTargetSelection = (ids) => {
    const selected = new Set(Array.isArray(ids) ? ids : []);
    for (const [id, control] of spellTargetControls) {
      control.checkbox.checked = selected.has(id);
      control.row.classList.toggle("selected", control.checkbox.checked);
    }
    refreshSpellTargetCount();
  };

  const applySpellTargetFilter = () => {
    const nameQuery = String(spellTargetNameFilter?.value || "").trim().toLocaleLowerCase("it");
    for (const control of spellTargetControls.values()) {
      const matchesFaction = activeSpellFactionFilters.size === 0
        || activeSpellFactionFilters.has(control.faction);
      const matchesName = !nameQuery || control.name.includes(nameQuery);
      control.row.style.display = matchesFaction && matchesName ? "flex" : "none";
    }
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

  for (const item of allCasters) {
    const row = document.createElement("label");
    row.className = "spell-target";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.style.accentColor = "#2563eb";
    const faction = document.createElement("span");
    faction.className = "spell-target-faction";
    faction.style.background = factionColor(item);
    faction.style.color = factionColor(item);
    const label = document.createElement("span");
    label.className = "spell-target-name";
    label.textContent = item.name || item.id;
    row.append(checkbox, faction, label);
    spellTargetList?.appendChild(row);
    spellTargetControls.set(item.id, {
      row,
      checkbox,
      faction: factionKey(item),
      name: String(item.name || item.id).toLocaleLowerCase("it"),
    });
    checkbox.addEventListener("change", () => {
      row.classList.toggle("selected", checkbox.checked);
      refreshSpellTargetCount();
      void writeSpellTargetSelection([item.id], checkbox.checked);
    });
  }
  applySpellTargetSelection(capturedTargetIds);
  applySpellTargetFilter();
  spellTargetNameFilter?.addEventListener("input", applySpellTargetFilter);
  for (const button of spellFactionButtons) {
    button.addEventListener("click", () => {
      const faction = button.dataset.spellFaction;
      if (activeSpellFactionFilters.has(faction)) activeSpellFactionFilters.delete(faction);
      else activeSpellFactionFilters.add(faction);
      const active = activeSpellFactionFilters.has(faction);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      applySpellTargetFilter();
    });
  }

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

    automationWrap.style.display = "";
    const phasePlan = getSpellCastPhasePlan(
      spell,
      "",
      currentCastContext(spell),
    );
    const durationLabel = spell.duration
      ? " Durata da catalogo: " + spell.duration + "."
        + (spell.defaultTurns ? "" : " Imposta i round manualmente.")
      : "";
    const automation = spell.automation;
    const areaRuleChoices = getAreaSaveRuleChoices(spell);
    const effectChoices = getSpellEffectChoices(spell);
    const previousChoice = automationSpellId === spell.id ? conditionChoice.value : "";
    conditionChoice.replaceChildren();

    if (automation?.mode === "choice") {
      for (const choice of automation.choices || []) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice;
        conditionChoice.appendChild(option);
      }
    } else if (areaRuleChoices.length) {
      for (const choice of areaRuleChoices) {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        conditionChoice.appendChild(option);
      }
    } else {
      for (const choice of effectChoices) {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        conditionChoice.appendChild(option);
      }
    }
    if (previousChoice && Array.from(conditionChoice.options).some((option) => option.value === previousChoice)) {
      conditionChoice.value = previousChoice;
    }
    const selectedChoice = conditionChoice.value;
    const catalogEffects = getSpellEffects(spell, selectedChoice, currentCastContext(spell));
    const phaseEffects = phasePlan.effects === null ? catalogEffects : phasePlan.effects;
    const previewPlan = phasePlan.useCatalogAutomation
      ? buildSpellCastAutomationPlan({
        proposedConditions: getProposedConditions(spell, selectedChoice),
        proposedEffects: phaseEffects,
        saveAutomation: getAreaSaveAutomation(spell, selectedChoice),
        applyAutomatedConditions: true,
        hasEffectChoices: effectChoices.length > 0,
      })
      : {
        conditions: [],
        effects: phaseEffects,
        usedSaveAutomation: false,
      };
    const targetMode = phasePlan.subjectMode || spell.targetMode;
    const targetLabel = targetMode === "self" || targetMode === "caster"
      ? "caster"
      : previewPlan.usedSaveAutomation
        ? "token selezionati con esito configurato"
        : "token selezionati";
    const conditionLabels = previewPlan.conditions.map((condition) =>
      typeof condition === "string" ? condition : condition.name
    );
    const effectLabels = previewPlan.effects.map((effect) => effect.label);
    const effectsLabel = effectLabels.length
      ? " Pill effetto: " + effectLabels.join(", ") + "."
      : "";
    const hasAutomatedConditions = conditionLabels.length > 0;
    const hasChoices = phasePlan.useCatalogAutomation && (
      automation?.mode === "choice"
      || areaRuleChoices.length > 0
      || effectChoices.length > 0
    );

    if (!hasAutomatedConditions) {
      applyConditionsInput.checked = false;
      applyConditionsInput.disabled = true;
      applyConditionsInput.style.display = "none";
      conditionChoice.style.display = hasChoices ? "" : "none";
      automationText.textContent = (effectLabels.length ? "Tracciamento con effetti." : "Solo tracciamento.")
        + " Bersaglio: " + targetLabel + "." + effectsLabel + durationLabel;
      automationSpellId = spell.id;
      refreshSpellTargetCount();
      return;
    }

    applyConditionsInput.disabled = false;
    applyConditionsInput.style.display = "";
    if (automationSpellId !== spell.id || wasAutomationDisabled) {
      applyConditionsInput.checked = true;
    }
    if (automation?.mode === "choice") {
      conditionChoice.style.display = "";
      automationText.textContent = "Scegli condizione; bersaglio: " + targetLabel + "."
        + effectsLabel + durationLabel;
    } else if (areaRuleChoices.length) {
      conditionChoice.style.display = "";
      automationText.textContent = "Ai bersagli selezionati con TS fallito applica: "
        + conditionLabels.join(", ") + "." + effectsLabel + durationLabel;
    } else {
      conditionChoice.style.display = effectChoices.length ? "" : "none";
      const prefix = automation?.mode === "automatic"
        ? "Applica automaticamente: "
        : "Dopo gli esiti, applica: ";
      automationText.textContent = prefix + conditionLabels.join(", ")
        + ". Bersaglio: " + targetLabel + "."
        + effectsLabel + durationLabel;
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
    const subjects = uniqueIds(targetIds);
    if (!subjects.length) return [];
    const name = spell?.displayName || enteredName;
    const resolvedPhasePlan = phasePlan || getSpellCastPhasePlan(spell, "", castContext);
    const wantsConcentration = resolveSpellConcentration(spell, requestedConcentration);
    const persistedCastContext = {
      ...(castContext && typeof castContext === "object" ? castContext : {}),
      phase: resolvedPhasePlan.phase,
      choice: String(selectedChoice || ""),
      applyAutomatedConditions: applyAutomatedConditions !== false,
    };
    const catalogEffects = getSpellEffects(spell, selectedChoice, persistedCastContext);
    const phaseEffects = resolvedPhasePlan.effects === null
      ? catalogEffects
      : resolvedPhasePlan.effects;
    const castAutomationPlan = resolvedPhasePlan.useCatalogAutomation
      ? buildSpellCastAutomationPlan({
        proposedConditions: getProposedConditions(spell, selectedChoice),
        proposedEffects: phaseEffects,
        saveAutomation: getAreaSaveAutomation(spell, selectedChoice),
        applyAutomatedConditions,
        hasEffectChoices: getSpellEffectChoices(spell).length > 0,
      })
      : {
        conditions: [],
        effects: phaseEffects,
        usedSaveAutomation: false,
      };
    const choiceTiming = getSpellChoiceTiming(spell, selectedChoice, persistedCastContext);
    let concentrationAction = castAutomationPlan.concentrationAction
      || choiceTiming?.concentrationAction
      || resolvedPhasePlan.concentrationAction
      || "replace";
    if (
      resolvedPhasePlan.phase === "resolve"
      && concentrationAction === "extend"
      && !activeConcentration?.instanceId
    ) {
      throw new Error("prepared-instance-required");
    }
    const instanceId = String(activeConcentration?.instanceId || "").trim()
      || createSpellInstanceId();
    const appliedAt = await getAppliedAt();
    const spellExpiry = choiceTiming && Object.prototype.hasOwnProperty.call(choiceTiming, "spellExpiry")
      ? choiceTiming.spellExpiry
      : spell?.expiry ? { ...spell.expiry } : null;
    const expiry = spellExpiry || (wantsConcentration
      ? { mode: "concentration" }
      : { mode: "rounds", remaining: turns });
    const caster = allCasters.find((item) => item.id === casterId) || null;
    const lifecycleOperations = spellApplicationOperations({
      targetIds: subjects,
      casterId,
      enteredName,
      name,
      storedName: spell?.name,
      turns,
      concentration: wantsConcentration,
      instanceId,
      spellId: spell?.id || "",
      spellExpiry,
      appliedAt,
      castContext: persistedCastContext,
      proposedConditions: castAutomationPlan.conditions,
      proposedEffects: castAutomationPlan.effects,
      conditionOptions: {
        sourceId: casterId || "",
        sourceName: caster?.name || "",
        appliedAt,
        expiry,
      },
      concentrationAction,
    });
    const operations = withSpellPhaseTransitionOperations({
      operations: lifecycleOperations,
      phasePlan: resolvedPhasePlan,
      concentrationAction,
      activeConcentration,
      casterId,
    });
    const mutationPlan = await prepareEffectsMutation(operations);
    const historyIds = mutationPlan.changedIds;
    await withItemMetaHistory({
      kind: "spell",
      label: historyLabel || (
        resolvedPhasePlan.phase === "prepare"
          ? "Preparazione: " + name
          : resolvedPhasePlan.phase === "resolve"
            ? "Risoluzione: " + name
            : "Incantesimo: " + name
      ),
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

    overviewList.replaceChildren();
    if (overviewCount) overviewCount.textContent = String(groups.length);
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "overview-empty";
      empty.textContent = "Nessun incantesimo attivo sul campo.";
      overviewList.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const groupSpell = getSpellDefinition(group.spellId || group.storedName);
      const prepared = isPreparedSpellCast({
        spell: groupSpell,
        castContext: group.castContext,
        casterId: group.casterId,
        targetIds: Array.from(group.targets.keys()),
      });
      const row = document.createElement("article");
      row.className = "spell-overview-row";
      const content = document.createElement("div");
      content.className = "spell-overview-content";
      const heading = document.createElement("div");
      heading.className = "spell-overview-heading";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const referenceButton = makeReferenceButton(`Apri Enciclopedia: ${group.name}`, () => {
        void openReferencePopover({
          tab: "spells",
          entry: group.name,
          closeId: MODAL_ID,
        }).catch((error) => console.warn("[spells] reference open error:", error?.message || error));
      });
      const duration = document.createElement("span");
      duration.className = "overview-badge";
      duration.textContent = spellTurnsLabel(group.turns, group.counters);
      heading.append(name, referenceButton, duration);
      if (group.concentrating) {
        const concentration = document.createElement("span");
        concentration.className = "overview-badge concentration";
        concentration.textContent = "C";
        concentration.title = "Concentrazione";
        heading.appendChild(concentration);
      }

      const caster = document.createElement("div");
      caster.className = "spell-overview-meta";
      caster.textContent = (group.concentrating ? "Concentrazione: " : "Caster: ") + group.casterName;
      const targets = document.createElement("div");
      targets.className = "spell-overview-targets";
      targets.appendChild(document.createTextNode(prepared ? "Preparato su: " : "Bersagli: "));
      for (const [targetId, targetName] of group.targets) {
        const target = document.createElement("span");
        target.className = "spell-overview-target";
        target.title = `Termina ${group.name} su ${targetName || targetId}`;

        const label = document.createElement("span");
        label.textContent = targetName || targetId;
        const terminateTarget = document.createElement("button");
        terminateTarget.type = "button";
        terminateTarget.className = "terminate-spell-target";
        terminateTarget.textContent = "×";
        terminateTarget.title = target.title;
        terminateTarget.setAttribute("aria-label", target.title);
        terminateTarget.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          terminateTarget.disabled = true;
          try {
            await terminateSpellGroup(group, [targetId]);
            await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
            await refreshOverview();
          } catch (err) {
            console.warn("[spell-panel] terminate target spell:", err?.message || err);
            terminateTarget.disabled = false;
          }
        });
        target.append(label, terminateTarget);
        targets.appendChild(target);
        if (targetId !== Array.from(group.targets.keys()).at(-1)) {
          targets.appendChild(document.createTextNode(", "));
        }
      }
      targets.title = `${prepared ? "Preparato su" : "Bersagli"}: ${Array.from(group.targets.values()).join(", ")}`;
      content.append(heading, caster, targets);

      const actions = document.createElement("div");
      actions.className = "spell-overview-actions";
      let resolutionChoice = null;
      if (prepared && groupSpell) {
        const choices = getSpellEffectChoices(groupSpell);
        if (choices.length > 1) {
          resolutionChoice = document.createElement("select");
          resolutionChoice.className = "active-spell-choice";
          resolutionChoice.setAttribute("aria-label", `Variante per ${group.name}`);
          for (const choice of choices) {
            const option = document.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            resolutionChoice.appendChild(option);
          }
          const storedChoice = String(group.castContext?.choice || "");
          if (storedChoice && choices.some((choice) => choice.value === storedChoice)) {
            resolutionChoice.value = storedChoice;
          }
          actions.appendChild(resolutionChoice);
        }

        const resolve = document.createElement("button");
        resolve.type = "button";
        resolve.className = "resolve-spell";
        resolve.dataset.resolveSpell = "1";
        resolve.textContent = "Risolvi";
        resolve.addEventListener("click", async () => {
          const targetIds = selectedSpellTargetIds();
          if (!targetIds.length) return;
          resolve.disabled = true;
          if (resolutionChoice) resolutionChoice.disabled = true;
          try {
            const castContext = {
              ...(group.castContext || {}),
              phase: "resolve",
            };
            const selectedChoice = resolutionChoice?.value
              || String(group.castContext?.choice || "");
            await commitSpellApplication({
              spell: groupSpell,
              enteredName: group.storedName,
              turns: Math.max(1, ...group.turns),
              casterId: group.casterId,
              targetIds,
              castContext,
              selectedChoice,
              phasePlan: getSpellCastPhasePlan(groupSpell, "resolve", castContext),
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
          } catch (err) {
            console.warn("[spell-panel] resolve overview spell:", err?.message || err);
            resolve.disabled = false;
            if (resolutionChoice) resolutionChoice.disabled = false;
          }
        });
        actions.appendChild(resolve);
      }

      const terminate = document.createElement("button");
      terminate.type = "button";
      terminate.className = "terminate-spell";
      terminate.textContent = "Termina";
      terminate.addEventListener("click", async () => {
        terminate.disabled = true;
        try {
          await terminateSpellGroup(group);
          await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
          await refreshOverview();
        } catch (err) {
          console.warn("[spell-panel] terminate overview spell:", err?.message || err);
          terminate.disabled = false;
        }
      });
      actions.appendChild(terminate);
      row.append(content, actions);
      overviewList.appendChild(row);
    }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const enteredName = String(nameInput.value || "").trim();
    if (!enteredName) {
      nameInput.focus();
      return;
    }

    const spell = getSpellDefinition(enteredName);
    const rawTurns = Number(durationInput.value);
    if (!Number.isFinite(rawTurns) || rawTurns < 1) {
      durationInput.focus();
      return;
    }
    const turns = Math.floor(rawTurns);
    const wantsConcentration = resolveSpellConcentration(
      spell,
      !!concentrationInput.checked,
    );
    let casterId = casterSelect.value || defaultCasterId || sourceId || null;
    if (wantsConcentration && !casterId && allCasters.length) casterId = allCasters[0].id;

    const castContext = currentCastContext(spell);
    const phasePlan = getSpellCastPhasePlan(spell, "", castContext);
    const targetIds = resolveSpellSubjectIds({
      spell,
      casterId,
      selectedIds: selectedSpellTargetIds(),
      subjectMode: phasePlan.subjectMode,
    });
    if (!targetIds.length) return;

    const selectedChoice = conditionChoice?.value || "";
    submitButton.disabled = true;
    try {
      await commitSpellApplication({
        spell,
        enteredName,
        turns,
        casterId,
        targetIds,
        castContext,
        selectedChoice,
        phasePlan,
        applyAutomatedConditions: phasePlan.phase === "prepare"
          ? true
          : !!applyConditionsInput?.checked,
        requestedConcentration: !!concentrationInput.checked,
      });
      await refreshCasterSummary(contextCasterId, concentrationWrap, concentrationList);
      await refreshOverview();
      if (!isModal) {
        try {
          await OBR.contextMenu.close?.();
        } catch {}
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  cancelButton?.addEventListener("click", async () => {
    const ids = isModal ? selectedSpellTargetIds() : await getContextOrSelectionIds();
    if (!ids.length) return;
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
    await refreshOverview();
    if (!isModal) {
      try {
        await OBR.contextMenu.close?.();
      } catch {}
    }
  });

  endButton?.addEventListener("click", () => cancelButton?.click());
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

function getTrackerBaseItemId(value) {
  const id = String(value || "").trim();
  if (!id || id === "__LAIR__" || id.startsWith("__EPIC__")) return "";
  return id.replace(/::p\d+$/, "");
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
    const entries = Object.entries(concentrations || {});
    if (!entries.length) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "";

    for (const [key, info] of entries) {
      const storedName = String(info?.name || key);
      const nice = getSpellDefinition(storedName)?.displayName || storedName;
      const targets = Array.isArray(info?.targets) ? info.targets : [];
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = nice + " (" + targets.length + ")";

      const button = document.createElement("button");
      button.className = "iconbtn";
      button.type = "button";
      button.textContent = "X";
      button.title = "Interrompi questa concentrazione";
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const mutationPlan = await prepareEffectsMutation([{
          type: "concentration:break",
          casterIds: [casterId],
          reference: info?.instanceId || key,
        }]);
        const ids = mutationPlan.changedIds;
        await withItemMetaHistory({
          kind: "spell",
          label: "Concentrazione interrotta: " + nice,
          itemIds: ids,
          fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
        }, () => commitEffectsMutationPlan(mutationPlan));
        await refreshConditionLabels(targets);
        await refreshCasterSummary(casterId, wrap, list);
      });

      const row = document.createElement("span");
      row.className = "row";
      row.append(chip, button);
      list.append(row);
    }
  } catch {
    wrap.style.display = "none";
  }
}
