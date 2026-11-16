// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md: the «Giocatori» panel of the Options (GM, Online room profile). Loaded
// lazily by options-modal.js: the card registry's module is a heavy one. A choice is written at once, not at «Salva»:
// first the room memory (as the card menu does, so that the GM's background never gives the old player back), then
// the current scene's tokens of that character that the tracker knows. The others get it from the GM's background.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { METADATA_OWNERSHIP } from "./metadataKeyScoped.js";
import { actorProfileIdFromItem } from "./actorIdentityCore.js";
import { resolveInitiativeCardActorMatch } from "./initiativeCardRegistryCore.js";
import { readInitiativeCardRegistry } from "./initiativeCards.js";
import { readRememberedPlayerNames, rememberPlayerName, updatePlayerAssignmentMemory } from "./playerAssignmentMemory.js";
import { normalizePlayerAssignmentMemory } from "./playerAssignmentMemoryCore.js";
import {
  playerAssignmentMemoryForRow,
  playerAssignmentMemoryWithout,
  playerAssignmentPanelChoices,
  playerAssignmentPanelRows,
  playerAssignmentPanelTargets,
} from "./playerAssignmentPanelCore.js";
import { writePlayerAssignment } from "./playerAssignmentWriter.js";

const MEMORY_KEY = METADATA_OWNERSHIP.PLAYER_ASSIGNMENTS.key;
const CARD_KEY = `${ID}/initiativeCards`;

export function mountPlayerAssignmentPanel(container, { obr = OBR, isCurrent = () => true, notify = () => {} } = {}) {
  let registry = {};
  let memory = {};
  let players = [];
  let items = [];
  let busy = false;
  let stale = false;
  let disposed = false;
  let loading = null;
  let loadAgain = false;
  let registryAgain = true;
  const stops = [];

  const registryActorOf = (item) => {
    if (actorProfileIdFromItem(item)) return "";
    const match = resolveInitiativeCardActorMatch(registry, item);
    return match.status === "matched" ? match.actorProfileId : "";
  };
  const model = () => {
    const { rows, orphanKeys } = playerAssignmentPanelRows(registry, memory, { items, registryActorOf });
    const choices = playerAssignmentPanelChoices(players, readRememberedPlayerNames(), Object.values(memory));
    return { rows, orphanKeys, choices };
  };

  const draw = () => {
    if (disposed) return;
    // A select the GM has open is not replaced under the pointer: drawn again when it loses the focus.
    if (container.contains(document.activeElement) && document.activeElement?.tagName === "SELECT") { stale = true; return; }
    stale = false;
    const { rows, orphanKeys, choices } = model();
    const nodes = rows.map((row) => {
      const line = document.createElement("label");
      line.className = "player-assignment-row";
      const name = document.createElement("span");
      name.textContent = row.name;
      const select = document.createElement("select");
      select.dataset.playerAssignmentRow = row.id;
      select.disabled = busy;
      const none = new Option("Nessuno", "");
      select.append(none);
      for (const choice of choices) {
        select.append(new Option(choice.connected ? choice.name : `${choice.name} (non collegato)`, choice.id));
      }
      select.value = row.userId && choices.some((choice) => choice.id === row.userId) ? row.userId : "";
      line.append(name, select);
      return line;
    });
    if (!nodes.length) {
      const empty = document.createElement("p");
      empty.className = "player-assignment-empty";
      empty.textContent = "Nessun personaggio: salva la scheda di un PG o mettilo nel tracker.";
      nodes.push(empty);
    }
    if (orphanKeys.length) {
      const line = document.createElement("div");
      line.className = "player-assignment-row player-assignment-orphans";
      const text = document.createElement("span");
      text.textContent = orphanKeys.length === 1
        ? "1 giocatore ricordato per un personaggio senza scheda"
        : `${orphanKeys.length} giocatori ricordati per personaggi senza scheda`;
      const forget = document.createElement("button");
      forget.type = "button";
      forget.className = "secondary";
      forget.dataset.playerAssignmentForget = "1";
      forget.disabled = busy;
      forget.textContent = "Dimentica";
      line.append(text, forget);
      nodes.push(line);
    }
    container.replaceChildren(...nodes);
  };

  const load = () => {
    if (loading) { loadAgain = true; return loading; }
    loading = (async () => {
      const withRegistry = registryAgain;
      registryAgain = false;
      const [metadata, partyPlayers, sceneItems] = await Promise.all([
        obr.room.getMetadata().catch(() => ({})),
        obr.party.getPlayers().catch(() => []),
        isCurrent() ? obr.scene.items.getItems().catch(() => []) : [],
      ]);
      if (withRegistry) {
        try {
          ({ registry } = await readInitiativeCardRegistry());
        } catch (error) {
          console.warn("[player-assignment-panel] registro delle schede:", error?.message || error);
        }
      }
      memory = normalizePlayerAssignmentMemory(metadata?.[MEMORY_KEY]);
      players = Array.isArray(partyPlayers) ? partyPlayers : [];
      items = Array.isArray(sceneItems) ? sceneItems : [];
      draw();
    })().finally(() => {
      loading = null;
      if (loadAgain && !disposed) { loadAgain = false; void load(); }
    });
    return loading;
  };

  const run = async (work) => {
    if (busy) return;
    busy = true;
    draw();
    try {
      await work();
    } catch (error) {
      console.warn("[player-assignment-panel]", error?.message || error);
      notify(`Assegnazione non salvata: ${error?.message || error}`, "ERROR");
    } finally {
      busy = false;
      await load();
    }
  };

  const assign = (rowId, userId) => run(async () => {
    const { rows, choices } = model();
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    const choice = userId ? choices.find((candidate) => candidate.id === userId) : null;
    if (userId && !choice) return;
    const player = choice ? { id: choice.id, name: choice.name, color: choice.color } : null;
    if (player) rememberPlayerName(player);
    await updatePlayerAssignmentMemory((current) => playerAssignmentMemoryForRow(current, row, player?.id || null), { obr });
    if (!isCurrent()) return;
    const sceneItems = await obr.scene.items.getItems().catch(() => []);
    const ids = playerAssignmentPanelTargets(sceneItems, row, player?.id || "", { registryActorOf });
    let result = null;
    if (ids.length) {
      let fallbackOwnerId = "";
      try { fallbackOwnerId = String(obr.player.id || ""); } catch {}
      result = await writePlayerAssignment(ids, player, { obr, isCurrent, fallbackOwnerId });
    }
    if (player && result?.written && !result.owner) {
      notify(`${player.name || "Il giocatore"} è assegnato, ma Owlbear non ha cambiato il proprietario del token: usa il menu Owner di Owlbear.`, "WARNING");
    } else {
      notify(player ? `${row.name}: ${player.name}.` : `${row.name}: nessun giocatore.`, "SUCCESS");
    }
  });

  const forgetOrphans = () => run(async () => {
    const { orphanKeys } = model();
    if (orphanKeys.length) await updatePlayerAssignmentMemory((current) => playerAssignmentMemoryWithout(current, orphanKeys), { obr });
  });

  const onChange = (event) => {
    const select = event.target.closest?.("[data-player-assignment-row]");
    if (select) void assign(select.dataset.playerAssignmentRow, select.value);
  };
  const onClick = (event) => {
    if (event.target.closest?.("[data-player-assignment-forget]")) void forgetOrphans();
  };
  const onFocusOut = () => { if (stale) setTimeout(draw, 0); };
  container.addEventListener("change", onChange);
  container.addEventListener("click", onClick);
  container.addEventListener("focusout", onFocusOut);
  stops.push(() => {
    container.removeEventListener("change", onChange);
    container.removeEventListener("click", onClick);
    container.removeEventListener("focusout", onFocusOut);
  });
  let previousCards;
  const subscriptions = [
    obr.room.onMetadataChange?.((metadata) => {
      const cards = metadata?.[CARD_KEY];
      if (previousCards !== undefined && JSON.stringify(cards) !== JSON.stringify(previousCards)) registryAgain = true;
      previousCards = cards;
      void load();
    }),
    obr.party.onChange?.(() => void load()),
  ];
  for (const unsubscribe of subscriptions) if (typeof unsubscribe === "function") stops.push(unsubscribe);
  void load();

  return {
    refresh() { registryAgain = true; return load(); },
    dispose() {
      disposed = true;
      for (const stop of stops) { try { stop(); } catch {} }
      stops.length = 0;
    },
  };
}
