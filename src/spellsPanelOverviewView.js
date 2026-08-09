import {
  getSpellDefinition,
  getSpellEffectChoices,
} from "./spells-srd.js";
import {
  getSpellOverviewActions,
  spellActiveActionPresentation,
} from "./spellActiveActionCore.js";
import { spellTurnsLabel } from "./spellsPanelViewCore.js";

export function renderSpellOverview({
  document: documentRef = globalThis.document,
  overviewList = null,
  overviewCount = null,
  groups = [],
  createReferenceButton,
  getSelectedTargetIds = () => [],
  getActionChoiceValue = () => "",
  onActionChoiceChange = () => {},
  onOpenReference = () => {},
  onTerminateTarget = async () => {},
  onResolve = async () => {},
  onActivate = async () => {},
  onTerminate = async () => {},
  onActionError = () => {},
} = {}) {
  if (!overviewList) return;

  overviewList.replaceChildren();
  if (overviewCount) overviewCount.textContent = String(groups.length);
  if (!groups.length) {
    const empty = documentRef.createElement("div");
    empty.className = "overview-empty";
    empty.textContent = "Nessun incantesimo attivo sul campo.";
    overviewList.appendChild(empty);
    return;
  }

  for (const group of groups) {
    const groupSpell = getSpellDefinition(group.spellId || group.storedName);
    const targetEntries = Array.from(group.targets);
    const targetIds = targetEntries.map(([targetId]) => targetId);
    const overviewActions = getSpellOverviewActions({
      spell: groupSpell,
      castContext: group.castContext,
      casterId: group.casterId,
      targetIds,
      effectInstances: group.effectInstances,
    });
    const manualActions = overviewActions.filter(
      (candidate) => candidate.type === "manual",
    );
    const hasMultipleActions = manualActions.length >= 3;
    const prepared = overviewActions.some((action) => action.type === "resolve");

    const row = documentRef.createElement("article");
    row.className = hasMultipleActions
      ? "spell-overview-row spell-overview-row--multi-action"
      : "spell-overview-row";
    const content = documentRef.createElement("div");
    content.className = "spell-overview-content";
    const heading = documentRef.createElement("div");
    heading.className = "spell-overview-heading";
    const name = documentRef.createElement("strong");
    name.textContent = group.name;
    const referenceButton = createReferenceButton(
      `Apri Enciclopedia: ${group.name}`,
      () => onOpenReference(group),
    );
    const duration = documentRef.createElement("span");
    duration.className = "overview-badge";
    duration.textContent = spellTurnsLabel(group.turns, group.counters);
    heading.append(name, referenceButton);
    if (duration.textContent) heading.appendChild(duration);
    if (group.concentrating) {
      const concentration = documentRef.createElement("span");
      concentration.className = "overview-badge concentration";
      concentration.textContent = "C";
      concentration.title = "Concentrazione";
      heading.appendChild(concentration);
    }

    const caster = documentRef.createElement("div");
    caster.className = "spell-overview-meta";
    caster.textContent = "Caster: " + group.casterName;
    const targets = documentRef.createElement("div");
    targets.className = "spell-overview-targets";
    targets.appendChild(documentRef.createTextNode(prepared ? "Preparato su: " : "Bersagli: "));
    if (!targetEntries.length) {
      targets.appendChild(documentRef.createTextNode("nessuno registrato"));
    }
    targetEntries.forEach(([targetId, targetName], index) => {
      const target = documentRef.createElement("span");
      target.className = "spell-overview-target";
      target.title = `Termina ${group.name} su ${targetName || targetId}`;

      const label = documentRef.createElement("span");
      label.textContent = targetName || targetId;
      const terminateTarget = documentRef.createElement("button");
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
          await onTerminateTarget(group, targetId);
        } catch (error) {
          onActionError("terminate target spell", error);
          terminateTarget.disabled = false;
        }
      });
      target.append(label, terminateTarget);
      targets.appendChild(target);
      if (index < targetEntries.length - 1) {
        targets.appendChild(documentRef.createTextNode(", "));
      }
    });
    targets.title = targetEntries.length
      ? `${prepared ? "Preparato su" : "Bersagli"}: ${targetEntries
        .map(([, targetName]) => targetName)
        .join(", ")}`
      : "Nessun bersaglio registrato";
    content.append(heading, caster, targets);

    const actions = documentRef.createElement("div");
    actions.className = hasMultipleActions
      ? "spell-overview-actions spell-overview-actions--grid"
      : "spell-overview-actions";
    if (hasMultipleActions) {
      actions.setAttribute("aria-label", `Esiti di ${group.name}`);
    }
    let resolutionChoice = null;
    const resolveAction = overviewActions.find((action) => action.type === "resolve");
    if (resolveAction && groupSpell) {
      const choices = getSpellEffectChoices(groupSpell);
      if (choices.length > 1) {
        resolutionChoice = documentRef.createElement("select");
        resolutionChoice.className = "active-spell-choice";
        resolutionChoice.setAttribute("aria-label", `Variante per ${group.name}`);
        for (const choice of choices) {
          const option = documentRef.createElement("option");
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

      const resolve = documentRef.createElement("button");
      resolve.type = "button";
      resolve.className = "resolve-spell";
      resolve.dataset.resolveSpell = "1";
      resolve.textContent = "Risolvi";
      resolve.addEventListener("click", async () => {
        const selectedTargetIds = getSelectedTargetIds();
        if (!selectedTargetIds.length) return;
        resolve.disabled = true;
        if (resolutionChoice) resolutionChoice.disabled = true;
        try {
          await onResolve({
            group,
            spell: groupSpell,
            targetIds: selectedTargetIds,
            selectedChoice: resolutionChoice?.value
              || String(group.castContext?.choice || ""),
          });
        } catch (error) {
          onActionError("resolve overview spell", error);
          resolve.disabled = false;
          if (resolutionChoice) resolutionChoice.disabled = false;
        }
      });
      actions.appendChild(resolve);
    }

    for (const action of manualActions) {
      const actionChoice = action.choice && typeof action.choice === "object"
        ? action.choice
        : null;
      const actionChoices = Array.isArray(actionChoice?.options)
        ? actionChoice.options
        : [];
      let actionChoiceSelect = null;
      if (actionChoice && actionChoices.length) {
        actionChoiceSelect = documentRef.createElement("select");
        actionChoiceSelect.className = "active-spell-choice";
        actionChoiceSelect.setAttribute(
          "aria-label",
          `Variante per ${group.name}`,
        );
        if (actionChoice.required === true) {
          const placeholder = documentRef.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "Seleziona una variante";
          placeholder.disabled = true;
          placeholder.selected = true;
          actionChoiceSelect.appendChild(placeholder);
        }
        for (const optionValue of actionChoices) {
          const option = documentRef.createElement("option");
          option.value = String(optionValue?.value || "");
          option.textContent = String(optionValue?.label || option.value);
          actionChoiceSelect.appendChild(option);
        }
        const storedChoice = String(
          getActionChoiceValue(group, action) || "",
        ).trim();
        if (storedChoice && actionChoices.some((option) => option.value === storedChoice)) {
          actionChoiceSelect.value = storedChoice;
        }
        actionChoiceSelect.addEventListener("change", () => {
          onActionChoiceChange(group, action, actionChoiceSelect.value);
          updatePresentation();
        });
        actions.appendChild(actionChoiceSelect);
      }
      const activate = documentRef.createElement("button");
      activate.type = "button";
      activate.className = "activate-spell";
      activate.dataset.activeSpellAction = "1";
      activate.dataset.actionSubjectMode = action.subjectMode;
      activate.dataset.actionLabel = String(action.buttonLabel || action.label || "Attiva");
      activate.dataset.actionDetail = String(action.detail || "");
      activate.dataset.actionEmptySelectionTitle = String(action.emptySelectionTitle || "");
      activate.dataset.actionTooManySelectionTitle = String(action.tooManySelectionTitle || "");
      activate.dataset.actionUnavailableSelectionTitle = String(
        action.unavailableSelectionTitle || "",
      );
      activate.dataset.actionUnavailableTargetIds = JSON.stringify(
        action.unavailableTargetIds || [],
      );
      activate.dataset.actionMaxTargets = String(action.maxTargets || "");
      activate.dataset.actionCountLabelSingular = String(action.countLabelSingular || "bersaglio");
      activate.dataset.actionCountLabelPlural = String(action.countLabelPlural || "bersagli");
      activate.dataset.actionChoice = JSON.stringify(actionChoice || null);
      activate.dataset.actionChoiceValue = actionChoiceSelect?.value || "";
      const updatePresentation = () => {
        const presentation = spellActiveActionPresentation(
          {
            ...action,
            choiceValue: actionChoiceSelect?.value || activate.dataset.actionChoiceValue || "",
          },
          getSelectedTargetIds(),
        );
        activate.disabled = presentation.disabled;
        activate.textContent = presentation.text;
        activate.title = presentation.title;
        activate.dataset.actionChoiceValue = actionChoiceSelect?.value || "";
      };
      updatePresentation();
      activate.addEventListener("click", async () => {
        const selectedTargetIds = getSelectedTargetIds();
        if (action.requiresTargets && !selectedTargetIds.length) return;
        activate.disabled = true;
        try {
          await onActivate({
            group,
            spell: groupSpell,
            action,
            targetIds: selectedTargetIds,
            choiceValue: actionChoiceSelect?.value || "",
          });
        } catch (error) {
          onActionError("activate overview spell", error);
          updatePresentation();
        }
      });
      actions.appendChild(activate);
    }

    const terminate = documentRef.createElement("button");
    terminate.type = "button";
    terminate.className = "terminate-spell";
    terminate.textContent = "Termina";
    terminate.addEventListener("click", async () => {
      terminate.disabled = true;
      try {
        await onTerminate(group);
      } catch (error) {
        onActionError("terminate overview spell", error);
        terminate.disabled = false;
      }
    });
    actions.appendChild(terminate);
    row.append(content, actions);
    overviewList.appendChild(row);
  }
}
