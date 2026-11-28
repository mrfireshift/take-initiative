// Lot R0 of docs/STUDIO_ARCHIVIO_ATTORI.md: at start-up the GM's background compacts the Room's metadata (16 kB in all,
// shared with every extension) and until now only the console said what left the Room. This is the sentence the GM
// reads: which characters' cards, how many remembered hit points, factions and assigned players. Pure: the plan comes
// from compactOwnedRoomMetadata, the notification is the caller's. A key rewritten with nothing dropped says nothing.
import { ID } from "./constants.js";
import { normalizeActorVitalsRegistry } from "./actorVitalsCore.js";
import { droppedInitiativeCardRegistryNames } from "./initiativeCardRegistryCore.js";

const CARDS_KEY = `${ID}/initiativeCards`;
const ACTOR_VITALS_KEY = `${ID}/actorVitals`;
const HP_MEMORY_KEY = `${ID}/hpMemory`;
const FACTION_KEY = `${ID}/factionRegistry`;
const PLAYER_ASSIGNMENTS_KEY = `${ID}/playerAssignments`;
const MAX_NAMES = 4;

function entryCount(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function actorCount(value) {
  return Object.keys(normalizeActorVitalsRegistry(value).actors).length;
}

function droppedCount(previousValues, updates, key, count = entryCount) {
  return Object.hasOwn(updates, key) ? Math.max(0, count(previousValues[key]) - count(updates[key])) : 0;
}

function italianList(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : parts.join("");
}

function cardsPart(names) {
  if (!names.length) return "";
  const shown = names.slice(0, MAX_NAMES);
  const others = names.length - shown.length;
  const list = others > 0 ? `${shown.join(", ")} e ${others === 1 ? "un altro" : `altri ${others}`}` : italianList(shown);
  return `${names.length === 1 ? "la scheda" : "le schede"} di ${list}`;
}

// "" when the compaction dropped nothing.
export function roomBudgetPruningNotice(plan) {
  const updates = plan?.updates && typeof plan.updates === "object" ? plan.updates : {};
  const previousValues = plan?.previousValues && typeof plan.previousValues === "object" ? plan.previousValues : {};
  const cardNames = Object.hasOwn(updates, CARDS_KEY)
    ? droppedInitiativeCardRegistryNames(previousValues[CARDS_KEY], updates[CARDS_KEY])
    : [];
  const hitPoints = droppedCount(previousValues, updates, ACTOR_VITALS_KEY, actorCount)
    + droppedCount(previousValues, updates, HP_MEMORY_KEY);
  const factions = droppedCount(previousValues, updates, FACTION_KEY);
  const players = droppedCount(previousValues, updates, PLAYER_ASSIGNMENTS_KEY);
  const parts = [
    cardsPart(cardNames),
    hitPoints ? `i PF ricordati di ${hitPoints === 1 ? "un personaggio" : `${hitPoints} personaggi`}` : "",
    factions ? (factions === 1 ? "una fazione ricordata" : `${factions} fazioni ricordate`) : "",
    players ? (players === 1 ? "un giocatore assegnato" : `${players} giocatori assegnati`) : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return `Memoria della stanza piena. Tolti dalla stanza all'avvio: ${italianList(parts)}. In questo browser restano le copie già salvate.`;
}
