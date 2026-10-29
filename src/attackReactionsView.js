// CAP-REACTION, lotto 1: the target's reactions under the target of the PC attack console and the Boss console
// (attackReactionsCore.js). Rebuilt only when what it shows changes, so a retaliation amount being typed stays.
import { attackTargetReactions } from "./attackReactionsCore.js";

function element(documentRef, tag, text = "", className = "") {
  const node = documentRef.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// box: the container; context: attackTargetReactions' input; handlers: retaliate(row, amount), cast(offer);
// buttonClass: the console's own small button.
export function renderAttackReactions(box, context = {}, {
  busy = false, retaliate = null, cast = null, buttonClass = "mini-button", documentRef = globalThis.document,
} = {}) {
  if (!box) return;
  const model = attackTargetReactions(context);
  const signature = JSON.stringify([context.target?.id || "", model, busy]);
  if (box.dataset.signature === signature) return;
  box.dataset.signature = signature;
  box.replaceChildren();
  const rows = [];
  if (model.sanctuary) rows.push(element(documentRef, "p", model.sanctuary.text, "attack-reaction-note"));
  for (const row of model.retaliations) {
    const line = element(documentRef, "div", "", "attack-reaction");
    const input = element(documentRef, "input", "", "attack-reaction-amount");
    input.type = "number";
    input.min = "0";
    input.placeholder = row.dice;
    input.setAttribute("aria-label", `Danni di ${row.label}`);
    input.dataset.retaliation = row.instanceId;
    const button = element(documentRef, "button", "Applica", buttonClass);
    button.type = "button";
    button.disabled = busy;
    button.dataset.retaliationApply = row.instanceId;
    button.addEventListener("click", () => {
      if (typeof retaliate === "function") void retaliate(row, input.value);
    });
    // Enter in the amount applies this retaliation only (lot L17, AT-03): it does not reach the console's own Enter
    // (the PC console's main button) nor submit the Boss console's form with its average damage.
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) button.click();
    });
    line.append(element(documentRef, "p", row.text, "attack-reaction-note"), input, button);
    rows.push(line);
  }
  for (const offer of model.offers) {
    const line = element(documentRef, "div", "", "attack-reaction");
    const button = element(documentRef, "button", offer.direct ? offer.label : `${offer.label} ›`, buttonClass);
    button.type = "button";
    button.disabled = busy;
    button.dataset.reactionSpell = offer.spellId;
    button.addEventListener("click", () => {
      if (typeof cast === "function") void cast(offer);
    });
    line.append(element(documentRef, "p", offer.text, "attack-reaction-note"), button);
    rows.push(line);
  }
  box.append(...rows);
  box.hidden = !rows.length;
}
