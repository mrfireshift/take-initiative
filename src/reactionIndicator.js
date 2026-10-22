// The reaction indicator of a tracker card: a round 18px button in the HP row, like the character sheet and ± buttons.
// It shows a curved reaction arrow (public/reaction.svg, drawn for the plugin, used as a mask so it takes the state's
// colour): bright green = reaction available; dimmed red = used (it comes back at the start of the creature's turn).
// The GM clicks it to mark or restore the reaction; players only see it.
import { buildCardIconGlyph, styleCardIconButton } from "./cardIconButton.js";

function paint(node, used) {
  node.dataset.reactionUsed = used ? "1" : "0";
  styleCardIconButton(node, used ? "spent" : "ready");
}

export function buildReactionIndicator({ used = false, interactive = false, onToggle = null } = {}) {
  const node = document.createElement(interactive ? "button" : "span");
  node.appendChild(buildCardIconGlyph("reaction.svg"));
  paint(node, used);
  node.dataset.reactionIndicator = "1";
  node.dataset.cardSelectionIgnore = "1";
  const title = used
    ? "Reazione usata: torna all'inizio del suo turno"
    : "Reazione disponibile";
  node.title = interactive ? `${title} · clic per ${used ? "ripristinarla" : "segnarla come usata"}` : title;
  node.setAttribute("aria-label", node.title);
  if (!interactive || typeof onToggle !== "function") return node;

  node.type = "button";
  node.setAttribute("aria-pressed", String(!!used));
  node.style.cursor = "pointer";
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
  });
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (node.disabled) return;
    // Optimistic: the card is rebuilt from the new conditions right after the command.
    node.disabled = true;
    paint(node, !used);
    Promise.resolve()
      .then(() => onToggle())
      .catch((error) => {
        console.warn("[reaction] toggle:", error?.message || error);
        paint(node, used);
      })
      .finally(() => { node.disabled = false; });
  });
  return node;
}
