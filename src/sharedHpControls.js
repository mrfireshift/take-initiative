export function renderSharedHpControls(container, preview, selection, onChange, { disabled = false, documentRef = document } = {}) {
  container.replaceChildren();
  container.hidden = !preview.groups.length && !preview.choiceGroups.length && !preview.conflicts.length;
  if (container.hidden) return;
  if (preview.multiTarget) {
    const label = documentRef.createElement("label"); label.textContent = "HP condivisi · ";
    const policy = documentRef.createElement("select"); policy.setAttribute("aria-label", "Policy HP condivisi"); policy.disabled = disabled;
    for (const [value, text] of [["once", "Una volta per gruppo"], ["per-token", "Per ogni token colpito"]]) {
      const option = documentRef.createElement("option"); option.value = value; option.textContent = text; policy.append(option);
    }
    policy.value = selection.policy || "once";
    policy.addEventListener("change", () => onChange({ policy: policy.value, chosenTargetIds: {} }));
    label.append(policy); container.append(label);
  }
  for (const group of preview.choiceGroups) {
    const label = documentRef.createElement("label"); label.style.display = "block"; label.textContent = `${group.name}: scegli l’importo · `;
    const choice = documentRef.createElement("select"); choice.setAttribute("aria-label", `Importo condiviso di ${group.name}`); choice.disabled = disabled;
    const empty = documentRef.createElement("option"); empty.value = ""; empty.textContent = "Scegli il bersaglio…"; choice.append(empty);
    for (const target of group.options) {
      const option = documentRef.createElement("option"); option.value = target.targetId; option.textContent = `${target.name}: ${target.amount} HP`; choice.append(option);
    }
    choice.value = selection.chosenTargetIds?.[group.sourceId] || "";
    choice.addEventListener("change", () => onChange({ ...selection,
      chosenTargetIds: { ...selection.chosenTargetIds, [group.sourceId]: choice.value } }));
    label.append(choice); container.append(label);
  }
  for (const group of preview.groups) {
    const line = documentRef.createElement("div");
    line.textContent = `${group.hitIds.length} token collegati colpiti → ${group.requestedAmount} HP sulla riserva · ${group.beforeHP} → ${group.afterHP}/${group.hpMax}`;
    container.append(line);
  }
  if (preview.conflicts.some(conflict => conflict.reason !== "shared-hp-selection-required")) {
    const error = documentRef.createElement("div"); error.textContent = "Collegamento HP non valido: apri HP condivisi per verificarlo.";
    container.append(error);
  }
}
