import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { factionRegistryCounts } from "./factionRegistryCore.js";
import {
  FACTION_CONFIGURATOR_ID,
  clearFactionRegistry,
  readFactionRegistry,
  rememberFactionForIds,
  rememberKnownItemFactions,
} from "./factionRegistry.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const META_KEY = `${ID}/meta`;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function setBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

async function refreshCounts() {
  if (!sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: "faction-counts" });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const counts = factionRegistryCounts(await readFactionRegistry({
    isCurrent: () => sceneLifecycle.isCurrent(operation),
  }));
  if (!sceneLifecycle.isCurrent(operation)) return;
  for (const [attitude, count] of Object.entries(counts)) {
    const output = document.querySelector<HTMLElement>(`[data-count="${attitude}"]`);
    if (output) output.textContent = `${count} asset`;
  }
}

async function assignSelection(button: HTMLButtonElement, attitude: string) {
  const operation = sceneLifecycle.capture({ operationId: `faction-assign:${attitude}:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  setBusy(button, true);
  try {
    const selection = await OBR.player.getSelection();
    if (!sceneLifecycle.isCurrent(operation)) return;
    const selectedItems = selection.length
      ? await OBR.scene.items.getItems(selection)
      : [];
    if (!sceneLifecycle.isCurrent(operation)) return;
    const ids = selectedItems
      .filter((item) => item.layer === "CHARACTER" && !item.attachedTo)
      .map((item) => item.id);
    if (!ids.length) {
      await OBR.notification.show("Seleziona almeno un token sulla mappa.", "INFO");
      return;
    }
    await OBR.scene.items.updateItems(ids, (items) => {
      for (const item of items) {
        const previous = item.metadata?.[META_KEY] || {};
        item.metadata = {
          ...(item.metadata || {}),
          [META_KEY]: { ...previous, attitude },
        };
      }
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await rememberFactionForIds(ids, attitude, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await refreshCounts();
    if (!sceneLifecycle.isCurrent(operation)) return;
    await OBR.notification.show(`${ids.length} token associati.`, "SUCCESS");
  } catch {
    await OBR.notification.show("Impossibile aggiornare il registro fazioni.", "ERROR").catch(() => {});
  } finally {
    setBusy(button, false);
  }
}

async function importScene(button: HTMLButtonElement) {
  const operation = sceneLifecycle.capture({ operationId: `faction-import:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  setBusy(button, true);
  try {
    const items = await OBR.scene.items.getItems((item) => (
      item.layer === "CHARACTER" && Boolean(item.metadata?.[META_KEY]?.attitude)
    ));
    if (!sceneLifecycle.isCurrent(operation)) return;
    await rememberKnownItemFactions(items, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await refreshCounts();
    await OBR.notification.show(`${items.length} token importati dalla scena.`, "SUCCESS");
  } catch {
    await OBR.notification.show("Impossibile importare le fazioni della scena.", "ERROR").catch(() => {});
  } finally {
    setBusy(button, false);
  }
}

OBR.onReady(async () => {
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
      return;
    }
    if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = false; });
      void refreshCounts();
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
    return;
  }
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (String(role).toUpperCase() !== "GM") {
    await OBR.popover.close(FACTION_CONFIGURATOR_ID).catch(() => {});
    return;
  }

  document.querySelector<HTMLElement>("[data-close]")?.addEventListener("click", () => {
    void OBR.popover.close(FACTION_CONFIGURATOR_ID);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-register]").forEach((button) => {
    button.addEventListener("click", () => {
      void assignSelection(button, button.dataset.register || "");
    });
  });

  const importButton = document.querySelector<HTMLButtonElement>("[data-import-scene]");
  importButton?.addEventListener("click", () => void importScene(importButton));

  const clearButton = document.querySelector<HTMLButtonElement>("[data-clear]");
  clearButton?.addEventListener("click", async () => {
    if (!window.confirm("Azzerare tutte le associazioni automatiche?")) return;
    const operation = sceneLifecycle.capture({ operationId: `faction-clear:${Date.now().toString(36)}` });
    if (!sceneLifecycle.isCurrent(operation)) return;
    setBusy(clearButton, true);
    try {
      await clearFactionRegistry({ isCurrent: () => sceneLifecycle.isCurrent(operation) });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await refreshCounts();
    } finally {
      setBusy(clearButton, false);
    }
  });

  OBR.room.onMetadataChange(() => {
    if (sceneLifecycle.isReady()) void refreshCounts();
  });
  await refreshCounts();
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
