import { getSpellDefinition } from "./spells-srd.js";

export function renderCasterConcentrationSummary({
  document: documentRef = globalThis.document,
  wrap = null,
  list = null,
  concentrations = {},
  onBreak = async () => {},
} = {}) {
  if (!wrap || !list) return;

  const entries = Object.entries(concentrations || {});
  if (!entries.length) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

  for (const [key, info] of entries) {
    const storedName = String(info?.name || key);
    const displayName = getSpellDefinition(storedName)?.displayName || storedName;
    const targetIds = Array.isArray(info?.targets) ? info.targets : [];
    const chip = documentRef.createElement("span");
    chip.className = "chip";
    chip.textContent = displayName + " (" + targetIds.length + ")";

    const button = documentRef.createElement("button");
    button.className = "iconbtn";
    button.type = "button";
    button.textContent = "X";
    button.title = "Interrompi questa concentrazione";
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await onBreak({
        key,
        info,
        displayName,
        targetIds,
      });
    });

    const row = documentRef.createElement("span");
    row.className = "row";
    row.append(chip, button);
    list.append(row);
  }
}
