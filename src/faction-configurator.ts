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

const META_KEY = `${ID}/meta`;

function setBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

async function refreshCounts() {
  const counts = factionRegistryCounts(await readFactionRegistry());
  for (const [attitude, count] of Object.entries(counts)) {
    const output = document.querySelector<HTMLElement>(`[data-count="${attitude}"]`);
    if (output) output.textContent = `${count} asset`;
  }
}

async function assignSelection(button: HTMLButtonElement, attitude: string) {
  setBusy(button, true);
  try {
    const selection = await OBR.player.getSelection();
    const selectedItems = selection.length
      ? await OBR.scene.items.getItems(selection)
      : [];
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
    await rememberFactionForIds(ids, attitude);
    await refreshCounts();
    await OBR.notification.show(`${ids.length} token associati.`, "SUCCESS");
  } catch {
    await OBR.notification.show("Impossibile aggiornare il registro fazioni.", "ERROR").catch(() => {});
  } finally {
    setBusy(button, false);
  }
}

async function importScene(button: HTMLButtonElement) {
  setBusy(button, true);
  try {
    const items = await OBR.scene.items.getItems((item) => (
      item.layer === "CHARACTER" && Boolean(item.metadata?.[META_KEY]?.attitude)
    ));
    await rememberKnownItemFactions(items);
    await refreshCounts();
    await OBR.notification.show(`${items.length} token importati dalla scena.`, "SUCCESS");
  } catch {
    await OBR.notification.show("Impossibile importare le fazioni della scena.", "ERROR").catch(() => {});
  } finally {
    setBusy(button, false);
  }
}

OBR.onReady(async () => {
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
    setBusy(clearButton, true);
    try {
      await clearFactionRegistry();
      await refreshCounts();
    } finally {
      setBusy(clearButton, false);
    }
  });

  OBR.room.onMetadataChange(() => void refreshCounts());
  await refreshCounts();
});
