import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  formatConditionInstance,
  getConditionInstances,
  removeConditionInstancesFromItems,
  refreshConditionLabels,
} from "./conditions.js";
import { withItemMetaHistory } from "./history.js";

const META_KEY = `${ID}/meta`;
let currentIds: string[] = [];
let busy = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getContextIds(): Promise<string[]> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const context = await OBR.contextMenu.getContext();
      const ids = (context?.items || []).map((item) => item.id).filter(Boolean);
      if (ids.length) return Array.from(new Set(ids));
    } catch {}
    await sleep(40);
  }
  try {
    const selected = await OBR.player.getSelection();
    return Array.isArray(selected) ? Array.from(new Set(selected)) : [];
  } catch {
    return [];
  }
}

async function readRows(ids: string[]) {
  if (!ids.length) return [];
  const idSet = new Set(ids);
  const items = await OBR.scene.items.getItems((item) => idSet.has(item.id));
  const showTarget = items.length > 1;
  return items.flatMap((item) => {
    const conditions = item.metadata?.[META_KEY]?.conditions || {};
    return getConditionInstances(conditions).map((instance: any) => ({
      itemId: item.id,
      instanceId: String(instance.id || ""),
      name: String(instance.condition || "Condizione"),
      label: formatConditionInstance(instance),
      target: showTarget ? String(item.name || "Token") : "",
    }));
  });
}

async function render() {
  const app = document.getElementById("app");
  if (!app) return;
  const rows = await readRows(currentIds);
  app.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessuna condizione attiva.";
    app.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "condition-row";
    button.title = "Rimuovi questa condizione";

    const name = document.createElement("span");
    name.className = "condition-name";
    name.textContent = row.label;
    button.appendChild(name);

    if (row.target) {
      const target = document.createElement("span");
      target.className = "condition-target";
      target.textContent = row.target;
      button.appendChild(target);
    }

    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      app.querySelectorAll<HTMLButtonElement>("button").forEach((entry) => { entry.disabled = true; });
      try {
        await withItemMetaHistory({
          kind: "condition",
          label: `Rimossa: ${row.name}`,
          itemIds: [row.itemId],
          fields: ["conditions"],
        }, () => removeConditionInstancesFromItems([
          { itemId: row.itemId, instanceId: row.instanceId },
        ]));
        await refreshConditionLabels([row.itemId]);
      } finally {
        busy = false;
        await render();
      }
    });

    app.appendChild(button);
  }
}

OBR.onReady(async () => {
  currentIds = await getContextIds();
  await render();
});