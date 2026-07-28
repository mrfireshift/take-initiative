import { getSpellDefinition } from "./spells-srd.js";
import {
  resolveSpellConcentration,
  resolveSpellSubjectIds,
} from "./spellCastContextCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";

export function wireSpellPanelFormWorkflow({
  form,
  nameInput,
  durationInput,
  concentrationInput,
  casterSelect,
  conditionChoice = null,
  applyConditionsInput = null,
  submitButton,
  cancelButton = null,
  endButton = null,
  defaultCasterId = "",
  sourceId = "",
  allCasters = [],
  isModal = false,
  getCurrentCastContext = () => ({}),
  getSelectedTargetIds = () => [],
  getFallbackTargetIds = async () => [],
  onCommit = async () => {},
  onClearNonConcentration = async () => {},
  onAfterSubmit = async () => {},
  onAfterClear = async () => {},
  onClose = async () => {},
} = {}) {
  const closeAfterAction = async () => {
    if (!isModal) await onClose();
  };

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
    if (wantsConcentration && !casterId && allCasters.length) {
      casterId = allCasters[0].id;
    }

    const castContext = getCurrentCastContext(spell);
    const phasePlan = getSpellCastPhasePlan(spell, "", castContext);
    const targetIds = resolveSpellSubjectIds({
      spell,
      casterId,
      selectedIds: getSelectedTargetIds(),
      subjectMode: phasePlan.subjectMode,
    });
    if (!targetIds.length) return;

    const selectedChoice = conditionChoice?.value || "";
    submitButton.disabled = true;
    try {
      await onCommit({
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
      await onAfterSubmit();
      await closeAfterAction();
    } finally {
      submitButton.disabled = false;
    }
  });

  cancelButton?.addEventListener("click", async () => {
    const ids = isModal
      ? getSelectedTargetIds()
      : await getFallbackTargetIds();
    if (!ids.length) return;
    await onClearNonConcentration(ids);
    await onAfterClear();
    await closeAfterAction();
  });

  endButton?.addEventListener("click", () => cancelButton?.click());
}
