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
  getProposedConditions,
} from "./spells-srd.js";
import { withItemMetaHistory } from "./history.js";
import { ID } from "./constants.js";

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
          name: spellDisplayName(spell?.spellId || storedName),
          casterId,
          casterName: byId.get(casterId)?.name || "Non indicato",
          concentrating: !!spell?.conc,
          concentrationRef: instanceId || storedName,
          targets: new Map(),
          turns: [],
        };
        groups.set(key, group);
      }
      group.concentrating = group.concentrating || !!spell?.conc;
      group.targets.set(target.id, target.name || target.id);
      group.turns.push(Math.max(0, Math.floor(Number(spell?.turns) || 0)));
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
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "it") || a.casterName.localeCompare(b.casterName, "it")
  );
}

function spellTurnsLabel(turns = []) {
  const values = turns.filter(Number.isFinite);
  if (!values.length) return "Durata non indicata";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? min + " round" : min + "-" + max + " round";
}

async function terminateSpellGroup(group) {
  const targetIds = Array.from(group.targets.keys());
  const operations = [];
  if (group.concentrating && group.casterId) {
    operations.push({
      type: "concentration:break",
      casterIds: [group.casterId],
      reference: group.concentrationRef,
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
  const durationInput = $("dur");
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

  const dataList = $("spell-list");
  for (const entry of getTrackableSpellOptions()) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.label = entry.label;
    option.dataset.spellId = entry.id;
    dataList?.appendChild(option);
  }

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

  const applySpellTargetSelection = (ids) => {
    const selected = new Set(Array.isArray(ids) ? ids : []);
    for (const [id, control] of spellTargetControls) {
      control.checkbox.checked = selected.has(id);
      control.row.classList.toggle("selected", control.checkbox.checked);
    }
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
    const enabled = !!concentrationInput.checked && allCasters.length > 0;
    casterSelect.disabled = !enabled;
    casterSelect.style.opacity = enabled ? "1" : ".6";
  };
  concentrationInput.addEventListener("change", refreshCasterEnabled);
  refreshCasterEnabled();

  let automationSpellId = "";
  const renderAutomation = (spell) => {
    if (!automationWrap || !automationText || !applyConditionsInput || !conditionChoice) return;
    if (!spell) {
      automationWrap.style.display = "none";
      automationSpellId = "";
      return;
    }

    automationWrap.style.display = "";
    const targetLabel = spell.targetMode === "self"
      ? "caster"
      : spell.targetMode === "area"
        ? "token selezionati dopo gli esiti"
        : "token selezionati";
    const durationLabel = spell.duration
      ? " Durata SRD: " + spell.duration + "."
        + (spell.defaultTurns ? "" : " Imposta i round manualmente.")
      : "";
    const automation = spell.automation;

    if (!automation) {
      applyConditionsInput.checked = false;
      applyConditionsInput.disabled = true;
      applyConditionsInput.style.display = "none";
      conditionChoice.style.display = "none";
      automationText.textContent = "Solo tracciamento. Bersaglio: " + targetLabel + "." + durationLabel;
      automationSpellId = spell.id;
      return;
    }

    applyConditionsInput.disabled = false;
    applyConditionsInput.style.display = "";
    if (automationSpellId !== spell.id) applyConditionsInput.checked = true;
    conditionChoice.replaceChildren();

    if (automation.mode === "choice") {
      for (const choice of automation.choices || []) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice;
        conditionChoice.appendChild(option);
      }
      conditionChoice.style.display = "";
      automationText.textContent = "Scegli condizione; bersaglio: " + targetLabel + "." + durationLabel;
    } else {
      conditionChoice.style.display = "none";
      const conditions = (automation.conditions || []).join(", ");
      const prefix = automation.mode === "automatic"
        ? "Applica automaticamente: "
        : "Dopo gli esiti, applica: ";
      automationText.textContent = prefix + conditions + ". Bersaglio: " + targetLabel + "." + durationLabel;
    }
    automationSpellId = spell.id;
  };

  const syncCatalogSelection = (applyDefaults) => {
    const spell = getSpellDefinition(nameInput.value);
    if (spell && applyDefaults) {
      durationInput.value = spell.defaultTurns ? String(spell.defaultTurns) : "";
      concentrationInput.checked = !!spell.concentration;
      refreshCasterEnabled();
    }
    renderAutomation(spell);
    return spell;
  };

  nameInput.addEventListener("input", () => syncCatalogSelection(false));
  nameInput.addEventListener("change", () => syncCatalogSelection(true));

  const contextCasterId = isModal ? sourceId : await deduceContextSingleId();
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
      const row = document.createElement("article");
      row.className = "spell-overview-row";
      const content = document.createElement("div");
      content.className = "spell-overview-content";
      const heading = document.createElement("div");
      heading.className = "spell-overview-heading";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const duration = document.createElement("span");
      duration.className = "overview-badge";
      duration.textContent = spellTurnsLabel(group.turns);
      heading.append(name, duration);
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
      targets.textContent = "Bersagli: " + Array.from(group.targets.values()).join(", ");
      targets.title = targets.textContent;
      content.append(heading, caster, targets);

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
      row.append(content, terminate);
      overviewList.appendChild(row);
    }
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
    const name = spell?.displayName || enteredName;
    const rawTurns = Number(durationInput.value);
    if (!Number.isFinite(rawTurns) || rawTurns < 1) {
      durationInput.focus();
      return;
    }
    const turns = Math.floor(rawTurns);
    const wantsConcentration = !!concentrationInput.checked;
    let casterId = casterSelect.value || defaultCasterId || sourceId || null;
    if (wantsConcentration && !casterId && allCasters.length) casterId = allCasters[0].id;

    const targetIds = uniqueIds(
      spell?.targetMode === "self" && casterId ? [casterId] : selectedSpellTargetIds()
    );
    if (!targetIds.length) return;

    const caster = allCasters.find((item) => item.id === casterId) || null;
    const casterName = caster?.name || "";
    const instanceId = createSpellInstanceId();
    const spellId = spell?.id || "";
    const proposedConditions = applyConditionsInput?.checked
      ? getProposedConditions(spell, conditionChoice?.value || "")
      : [];

    submitButton.disabled = true;
    try {
      const appliedAt = await getAppliedAt();
      const expiry = wantsConcentration
        ? { mode: "concentration" }
        : { mode: "rounds", remaining: turns };
      const mutationPlan = await prepareEffectsMutation(spellApplicationOperations({
        targetIds,
        casterId,
        enteredName,
        name,
        storedName: spell?.name,
        turns,
        concentration: wantsConcentration,
        instanceId,
        spellId,
        proposedConditions,
        conditionOptions: {
          sourceId: casterId || "",
          sourceName: casterName,
          appliedAt,
          expiry,
        },
      }));
      const historyIds = mutationPlan.changedIds;

      await withItemMetaHistory({
        kind: "spell",
        label: "Incantesimo: " + name,
        itemIds: historyIds,
        fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
      }, () => commitEffectsMutationPlan(mutationPlan));

      await refreshConditionLabels(historyIds);
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
    };
  } catch {
    return null;
  }
}

async function refreshCasterSummary(casterId, wrap, list) {
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
