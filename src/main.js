import OBR from "@owlbear-rodeo/sdk";
import "./buildInfo.js";
import { setupContextMenu } from "./contextMenu";
import { mountInitiativeList } from "./initiativeList";
import { initHPMemory } from "./hpMemory.js";


const app = document.querySelector("#app");

// reset minimi + altezze piene
document.documentElement.style.margin = "0";
document.documentElement.style.height = "100%";
document.body.style.margin = "0";
document.body.style.height = "100%";
document.body.style.background = "transparent";

app.style.height = "100%";
app.style.display = "flex";
app.style.flexDirection = "column";

// Contenitore (colonna: track sopra, pulsanti sotto)
const root = document.createElement("div");
root.id = "initiative-widget";
root.dataset.glassPopover = "1";
root.style.boxSizing = "border-box";
root.style.padding = "2px";
root.style.background = "transparent";
root.style.border = "none";
root.style.borderRadius = "12px";
root.style.fontFamily = 'var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif)';
root.style.display = "flex";
root.style.flexDirection = "column";
root.style.gap = "6px";
root.style.height = "100%";     // ← riempi tutto
root.style.overflow = "hidden"; // ← niente seconda scrollbar

app.replaceChildren(root);

const list = document.createElement("div");
list.style.flex = "1 1 auto";   // ← prende tutto lo spazio disponibile
list.style.minHeight = "0";     // ← sblocca lo shrink in flex
root.appendChild(list);

OBR.onReady(() => {
  setupContextMenu();
  initHPMemory();
  mountInitiativeList(list);
});
