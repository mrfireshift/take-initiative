import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { isBossActionCreature } from "./bossActionExecutionCore.js";
import { isEpicActionId, isLairId, splitParagonId } from "./initiativeSelectionProjectionCore.js";
import { pcAttackPickerEntries } from "./pcAttackPickerCore.js";
import { openPcAttackConsoleForActor, PC_ATTACK_CONSOLE_CHANNEL } from "./pcAttackLauncher.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import { selectPcAttackAutoOpen } from "./options/optionsSelectors.js";

// The attack console opens by itself on the turn of an actor with attacks (GM only, local option off by default).
// It only reads the initiative state: never writes it, never moves the turn.
const STATE_KEY = `${ID}/state`;
const META_KEY = `${ID}/meta`;
// The console answers a ping while it is open (pc-attack.js): an open console is never reloaded (its draft stays).
export { PC_ATTACK_CONSOLE_CHANNEL };
const CONSOLE_PING_TIMEOUT_MS = 300;

// The turn as this controller sees it: the actor in the turn and a key that changes only with a new turn (another
// round or another actor). A creature added to the order keeps the key: the console never reopens on the same turn.
export function pcAttackTurnOf(state) {
  const order = Array.isArray(state?.order) ? state.order.filter((id) => typeof id === "string" && id) : [];
  if (!order.length) return null;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state.current) || 0)));
  const round = Math.max(1, Math.floor(Number(state.round) || 1));
  return { actorId: order[current], key: `${round}|${order[current]}` };
}

// The creature a turn belongs to: never the Lair or an Epic Action slot; a Paragon's extra turn is its creature's.
export function pcAttackTurnSourceId(actorId) {
  if (!actorId || isLairId(actorId) || isEpicActionId(actorId)) return "";
  const { baseId } = splitParagonId(actorId);
  return baseId && !String(baseId).startsWith("__") ? baseId : "";
}

// A creature on the map, standing (HP above 0: a character at 0 HP rolls death saves), with an attack or a spell.
export function pcAttackTurnReady(item, getCard = getInitiativeCard) {
  if (!isBossActionCreature(item)) return false;
  const hp = item.metadata?.[META_KEY]?.hp;
  if (hp !== undefined && hp !== null && hp !== "" && Number.isFinite(Number(hp)) && Number(hp) <= 0) return false;
  return pcAttackPickerEntries(getCard(item)).length > 0;
}

function pingConsole(api, timeoutMs = CONSOLE_PING_TIMEOUT_MS) {
  if (typeof api.broadcast?.onMessage !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const finish = (open) => { clearTimeout(timer); unsubscribe(); resolve(open); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    unsubscribe = api.broadcast.onMessage(PC_ATTACK_CONSOLE_CHANNEL, (event) => {
      if (event?.data?.type === "pong") finish(true);
    }) || (() => {});
    Promise.resolve()
      .then(() => api.broadcast.sendMessage(PC_ATTACK_CONSOLE_CHANNEL, { type: "ping" }, { destination: "LOCAL" }))
      .catch(() => finish(false));
  });
}

// The open console follows the turn (pc-attack.js): the actor in the turn, or "" for a turn without one to show (the
// Lair, an Epic Action slot, a creature without attacks or spells, at 0 HP).
function tellConsole(api, sourceId, name) {
  if (typeof api.broadcast?.sendMessage !== "function") return Promise.resolve();
  return Promise.resolve()
    .then(() => api.broadcast.sendMessage(PC_ATTACK_CONSOLE_CHANNEL, { type: "follow", sourceId, name }, { destination: "LOCAL" }))
    .catch(() => {});
}

export function createPcAttackTurnController({
  api = OBR,
  isEnabled = () => runtimeOptionsService.get(selectPcAttackAutoOpen) === true,
  openConsole = openPcAttackConsoleForActor,
  isConsoleOpen = () => pingConsole(api),
  followConsole = (sourceId, name) => tellConsole(api, sourceId, name),
  getCard = getInitiativeCard,
} = {}) {
  // null: no turn seen yet. The first turn seen (mount, scene ready) is recorded, never opened: a reload opens nothing.
  let lastKey = null;
  let revision = 0;
  let work = Promise.resolve();
  const enqueue = (task) => {
    work = work.then(task, task);
    return work;
  };

  function onState(state, { prime = false } = {}) {
    const turn = pcAttackTurnOf(state);
    const key = turn?.key || "";
    if (key === lastKey && !prime) return work;
    const first = lastKey === null || prime;
    lastKey = key;
    const taskRevision = ++revision;
    if (first || !turn) return work;
    return enqueue(async () => {
      // A later turn (the GM skipped several) wins: only the latest one opens or moves the console.
      if (taskRevision !== revision || !isEnabled()) return;
      const sourceId = pcAttackTurnSourceId(turn.actorId);
      const [item] = sourceId ? await api.scene.items.getItems([sourceId]) : [];
      if (taskRevision !== revision) return;
      const ready = !!sourceId && pcAttackTurnReady(item, getCard);
      // An open console is never reloaded: it moves to the new actor by itself (or closes), unless a draft holds it.
      if (await isConsoleOpen()) {
        if (taskRevision === revision) await followConsole(ready ? sourceId : "", String(item?.name || ""));
        return;
      }
      if (!ready || taskRevision !== revision) return;
      await openConsole(sourceId);
    }).catch((error) => {
      console.warn("[pc-attack-turn] open:", error?.message || error);
    });
  }

  function reset() {
    lastKey = null;
    revision += 1;
  }

  return { onState, reset, idle: () => work };
}

let mounted = false;

export async function mountPcAttackTurnController() {
  if (mounted) return true;
  if (await OBR.player.getRole().catch(() => "PLAYER") !== "GM") return false;
  mounted = true;
  const controller = createPcAttackTurnController();
  const readState = async () => {
    const metadata = await OBR.scene.getMetadata().catch(() => null);
    if (metadata) controller.onState(metadata[STATE_KEY], { prime: true });
  };
  OBR.scene.onMetadataChange((metadata) => { controller.onState(metadata?.[STATE_KEY]); });
  OBR.scene.onReadyChange((ready) => {
    controller.reset();
    if (ready) void readState();
  });
  if (await OBR.scene.isReady().catch(() => false)) await readState();
  return true;
}
