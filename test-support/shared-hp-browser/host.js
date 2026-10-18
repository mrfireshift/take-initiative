// Uses the existing browser SDK double: run Vite with the boss-actions-browser config.
import OBR, { fakeHost } from "@owlbear-rodeo/sdk";
import { markSceneEpochReady } from "/src/sceneEpoch.js";
import { mountHistoryOwner } from "/src/historyOwner.js";
import { mountEffectsMutationCoordinatorService } from "/src/effectsMutations.js";
import { getHistoryEntries, undoLastHistoryEntry } from "/src/history.js";
import { combatEventFromHistoryEntry } from "/src/combatLogCore.js";
import { buildCombatLogPresentation } from "/src/combatLogPresentationCore.js";
import { setupContextMenu } from "/src/contextMenu.js";
import { openTrackerPopover } from "/src/trackerPopover.js";
import "/src/sync-open.js";

const KEY = "com.thebigpicture.initiative/meta";
const linked = new URLSearchParams(location.search).get("linked") !== "0";
fakeHost.state.items = ["Auril", "Mano del Titano", "Testa del Titano", "Corpo del Titano"].map((name, index) => ({
  id: ["auril", "hand", "head", "body"][index], name, type: "IMAGE", layer: "CHARACTER", image: { url: "/quick-damage.svg" }, position: { x: 100, y: 100 },
  metadata: { [KEY]: { hp: linked || !index ? 300 : 60, hpMax: 400, attitude: "enemy",
    ...(index && linked ? { sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true } : index ? {} : { inInitiative: true }) } },
}));
fakeHost.state.sceneMetadata = { "com.thebigpicture.initiative/state": { round: 1, current: 0, order: ["auril"] } };
fakeHost.sdk.room.id = `shared-hp-preview-${Date.now()}`;
fakeHost.setSelection(["hand"]);
const frames = new Map();
fakeHost.onPopover = (action, options, previous) => {
  if (action === "close") { frames.get(options.id)?.remove(); frames.delete(options.id); return; }
  let frame = frames.get(options.id);
  if (!frame || (action === "open" && previous?.url !== options.url)) {
    frame?.remove(); frame = document.createElement("iframe"); frame.title = options.id.split("/").at(-1);
    frame.src = options.url; frames.set(options.id, frame); document.body.append(frame);
  }
  const current = fakeHost.state.popovers.get(options.id) || options;
  const left = current.anchorPosition.left - (current.transformOrigin?.horizontal === "RIGHT" ? current.width : current.transformOrigin?.horizontal === "CENTER" ? current.width / 2 : 0);
  const top = current.anchorPosition.top - (current.transformOrigin?.vertical === "BOTTOM" ? current.height : current.transformOrigin?.vertical === "CENTER" ? current.height / 2 : 0);
  Object.assign(frame.style, { width: `${current.width}px`, height: `${current.height}px`, left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px` });
};
function renderTokens() {
  const list = document.getElementById("tokens"); list.replaceChildren();
  for (const item of fakeHost.state.items.filter(item => item.layer === "CHARACTER")) {
    const button = document.createElement("button");
    button.textContent = `${item.name} · ${item.metadata[KEY].hp}/${item.metadata[KEY].hpMax} HP`;
    button.setAttribute("aria-pressed", fakeHost.state.selection.includes(item.id));
    button.onclick = () => fakeHost.setSelection([item.id]); list.append(button);
  }
}
async function renderLog() {
  const entries = await getHistoryEntries();
  const presentation = buildCombatLogPresentation(null, entries.map(combatEventFromHistoryEntry));
  document.getElementById("log").replaceChildren(...presentation.events.map(event => {
    const line = document.createElement("p"); line.textContent = event.summary; return line;
  }));
}
fakeHost.onItems = renderTokens;
fakeHost.onSelection = renderTokens;
const menus = new Map();
fakeHost.sdk.contextMenu.create = async config => menus.set(config.id, config);
markSceneEpochReady("shared-hp-preview");
await mountHistoryOwner(); await mountEffectsMutationCoordinatorService();
setupContextMenu();
document.getElementById("open-shared").onclick = () => menus.get("com.thebigpicture.initiative/shared-hp").onClick({
  items: fakeHost.state.items.filter(item => fakeHost.state.selection.includes(item.id)),
});
document.getElementById("open-hp").onclick = () => openTrackerPopover({ refresh: true });
document.getElementById("undo").onclick = async () => { await undoLastHistoryEntry(); await renderLog(); };
document.getElementById("refresh-log").onclick = renderLog;
renderTokens();
document.getElementById("open-shared").click();
