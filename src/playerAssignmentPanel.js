// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md: the «Giocatori» panel of the Options (GM, Online room profile). Loaded
// lazily by options-modal.js: the card registry's module is a heavy one. A choice is written at once, not at «Salva»:
// first the room memory (as the card menu does, so that the GM's background never gives the old player back), then
// the current scene's tokens of that character that the tracker knows. The others get it from the GM's background.
// After the first room test: the card stays closed on a one-line summary, the PCs come first and the other cards of
// the room apart (P2, P3), and a card can be taken out of this Room's registry with ✕, confirmed in its row (P4).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { METADATA_OWNERSHIP } from "./metadataKeyScoped.js";
import { actorProfileIdFromItem } from "./actorIdentityCore.js";
import { resolveInitiativeCardActorMatch } from "./initiativeCardRegistryCore.js";
import { forgetInitiativeCardRegistryCharacter, readInitiativeCardRegistry } from "./initiativeCards.js";
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

export function mountPlayerAssignmentPanel(container, { obr = OBR, isCurrent = () => true, notify = () => {}, summary = null } = {}) {
  // registry: this browser's copy merged with the Room's, to recognise a scene token with no identity yet; cards: the
  // Room's alone, the rows (P1).
  let registry = {};
  let cards = {};
  let othersOpen = false;
  let confirming = "";
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
    const { rows, orphanKeys } = playerAssignmentPanelRows(cards, memory, { items, registryActorOf });
    const choices = playerAssignmentPanelChoices(players, readRememberedPlayerNames(), Object.values(memory));
    return { rows, orphanKeys, choices };
  };

  const draw = () => {
    if (disposed) return;
    // A select the GM has open is not replaced under the pointer: drawn again when it loses the focus.
    if (container.contains(document.activeElement) && document.activeElement?.tagName === "SELECT") { stale = true; return; }
    stale = false;
    const { rows, orphanKeys, choices } = model();
    const button = (text, dataKey, value, title = "") => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "secondary";
      node.dataset[dataKey] = value;
      node.disabled = busy;
      node.textContent = text;
      if (title) node.title = title;
      return node;
    };
    const rowNode = (row) => {
      const line = document.createElement("div");
      line.className = "player-assignment-row";
      const name = document.createElement("span");
      name.className = "player-assignment-name";
      if (confirming === row.id) {
        line.classList?.add("is-confirming");
        name.textContent = `Togliere «${row.name}» dal registro della stanza?`;
        line.append(name, button("Togli", "playerAssignmentRemoveConfirm", row.id), button("Annulla", "playerAssignmentRemoveCancel", "1"));
        return line;
      }
      name.textContent = row.name;
      name.title = row.name;
      const select = document.createElement("select");
      select.dataset.playerAssignmentRow = row.id;
      select.disabled = busy;
      select.setAttribute?.("aria-label", `Giocatore di ${row.name}`);
      select.append(new Option("Nessuno", ""));
      for (const choice of choices) {
        select.append(new Option(choice.connected ? choice.name : `${choice.name} (non collegato)`, choice.id));
      }
      select.value = row.userId && choices.some((choice) => choice.id === row.userId) ? row.userId : "";
      line.append(name, select);
      if (row.inRegistry) {
        line.append(button("✕", "playerAssignmentRemove", row.id, "Togli dal registro delle schede di questa stanza"));
      }
      return line;
    };
    const pcs = rows.filter((row) => row.pc);
    const others = rows.filter((row) => !row.pc);
    const nodes = pcs.map(rowNode);
    if (!pcs.length) {
      const empty = document.createElement("p");
      empty.className = "player-assignment-empty";
      empty.textContent = "Nessun PG: salva la scheda di un PG o mettilo nel tracker.";
      nodes.push(empty);
    }
    if (others.length) {
      const group = document.createElement("details");
      group.className = "player-assignment-others";
      group.open = othersOpen || others.some((row) => row.id === confirming);
      group.addEventListener("toggle", () => { othersOpen = group.open; });
      const title = document.createElement("summary");
      title.textContent = `Altre schede (${others.length})`;
      group.append(title, ...others.map(rowNode));
      nodes.push(group);
    }
    if (orphanKeys.length) {
      const line = document.createElement("div");
      line.className = "player-assignment-row player-assignment-orphans";
      const text = document.createElement("span");
      text.className = "player-assignment-name";
      text.textContent = orphanKeys.length === 1
        ? "1 giocatore ricordato per un personaggio senza scheda"
        : `${orphanKeys.length} giocatori ricordati per personaggi senza scheda`;
      line.append(text, button("Dimentica", "playerAssignmentForget", "1"));
      nodes.push(line);
    }
    if (summary) {
      const assigned = pcs.filter((row) => row.userId).length;
      summary.textContent = pcs.length ? `${pcs.length} PG · ${assigned} assegnat${assigned === 1 ? "o" : "i"}` : "nessun PG";
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
          ({ registry, room: cards = {} } = await readInitiativeCardRegistry());
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
  // P4: ✕ asks in the row; «Togli» takes the card out of this Room's registry and forgets its player.
  const removeCard = (rowId) => run(async () => {
    confirming = "";
    const row = model().rows.find((candidate) => candidate.id === rowId);
    if (!row?.inRegistry) return;
    const removed = await forgetInitiativeCardRegistryCharacter({ actorProfileId: row.actorProfileId, name: row.name });
    await updatePlayerAssignmentMemory((current) => playerAssignmentMemoryWithout(current, row.keys), { obr });
    registryAgain = true;
    if (removed) notify(`«${row.name}» non è più nel registro delle schede di questa stanza.`, "SUCCESS");
  });
  const onClick = (event) => {
    const target = event.target;
    if (target.closest?.("[data-player-assignment-forget]")) { void forgetOrphans(); return; }
    const remove = target.closest?.("[data-player-assignment-remove]");
    if (remove) { confirming = remove.dataset.playerAssignmentRemove; draw(); return; }
    if (target.closest?.("[data-player-assignment-remove-cancel]")) { confirming = ""; draw(); return; }
    const confirm = target.closest?.("[data-player-assignment-remove-confirm]");
    if (confirm) void removeCard(confirm.dataset.playerAssignmentRemoveConfirm);
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
      const roomCards = metadata?.[CARD_KEY];
      if (previousCards !== undefined && JSON.stringify(roomCards) !== JSON.stringify(previousCards)) registryAgain = true;
      previousCards = roomCards;
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
