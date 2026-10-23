import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { isBossActionCreature } from "./bossActionExecutionCore.js";
import { isEpicActionId, isLairId, splitParagonId } from "./initiativeSelectionProjectionCore.js";
import { pcAttackPickerEntries } from "./pcAttackPickerCore.js";
import { openPcAttackConsoleForActor, PC_ATTACK_CONSOLE_CHANNEL } from "./pcAttackLauncher.js";
import { BOSS_ACTIONS_CONSOLE_CHANNEL, openBossActionsPopover } from "./bossActionsLauncher.js";
import { INITIATIVE_EPIC_ACTION_PREFIX } from "./initiativeSelectionProjectionCore.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import { selectPcAttackAutoOpen } from "./options/optionsSelectors.js";

// The attack console opens by itself on the turn of an actor with attacks (GM only, local option off by default); on a
// boss's turn, and on its Epic Action slots, Boss Actions opens instead, and closes (idle) when that turn is over.
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

// The boss an Epic Action slot belongs to ("__EPIC__::<boss>::after::<character>"), or "".
export function pcAttackEpicBossId(actorId) {
  const prefix = `${INITIATIVE_EPIC_ACTION_PREFIX}::`;
  if (typeof actorId !== "string" || !actorId.startsWith(prefix)) return "";
  return actorId.slice(prefix.length).split("::after::")[0] || "";
}

const standing = (item) => {
  const hp = item?.metadata?.[META_KEY]?.hp;
  return !(hp !== undefined && hp !== null && hp !== "" && Number.isFinite(Number(hp)) && Number(hp) <= 0);
};

// A boss with Boss Actions: an Epic Boss, or a creature bound to a boss profile; standing.
export function pcAttackTurnBoss(item, getCard = getInitiativeCard) {
  if (!isBossActionCreature(item) || !standing(item)) return false;
  return item.metadata?.[META_KEY]?.epic === true || !!getCard(item)?.bossActionBinding;
}

// A creature on the map, standing (HP above 0: a character at 0 HP rolls death saves), with an attack or a spell.
export function pcAttackTurnReady(item, getCard = getInitiativeCard) {
  if (!isBossActionCreature(item) || !standing(item)) return false;
  return pcAttackPickerEntries(getCard(item)).length > 0;
}

function pingConsole(api, channel = PC_ATTACK_CONSOLE_CHANNEL, timeoutMs = CONSOLE_PING_TIMEOUT_MS) {
  if (typeof api.broadcast?.onMessage !== "function") return Promise.resolve(false);
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    // The pong itself (its console's sourceId, Boss Actions' idle), or false: a closed console answers nothing.
    const finish = (open) => { clearTimeout(timer); unsubscribe(); resolve(open); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    unsubscribe = api.broadcast.onMessage(channel, (event) => {
      if (event?.data?.type === "pong") finish(event.data);
    }) || (() => {});
    Promise.resolve()
      .then(() => api.broadcast.sendMessage(channel, { type: "ping" }, { destination: "LOCAL" }))
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

function tellBossConsole(api, message) {
  if (typeof api.broadcast?.sendMessage !== "function") return Promise.resolve();
  return Promise.resolve()
    .then(() => api.broadcast.sendMessage(BOSS_ACTIONS_CONSOLE_CHANNEL, message, { destination: "LOCAL" }))
    .catch(() => {});
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPcAttackTurnController({
  api = OBR,
  isEnabled = () => runtimeOptionsService.get(selectPcAttackAutoOpen) === true,
  openConsole = openPcAttackConsoleForActor,
  isConsoleOpen = () => pingConsole(api),
  openBossConsole = openBossActionsPopover,
  isBossConsoleOpen = () => pingConsole(api, BOSS_ACTIONS_CONSOLE_CHANNEL),
  closeBossConsole = () => tellBossConsole(api, { type: "close-if-idle" }),
  closeSettleMs = 150,
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
      const epicBossId = pcAttackEpicBossId(turn.actorId);
      const lookupId = sourceId || epicBossId;
      const [item] = lookupId ? await api.scene.items.getItems([lookupId]) : [];
      if (taskRevision !== revision) return;
      // Both consoles are asked at once: a closed one answers nothing within the ping's time.
      const [attackOpen, bossOpen] = await Promise.all([isConsoleOpen(), isBossConsoleOpen()]);
      if (taskRevision !== revision) return;
      // A boss's turn, or one of its Epic Action slots: Boss Actions, never reloaded when open on this boss; open on
      // another boss and idle, it gives way. A clean attack console left open closes (no attack of its own there).
      if (pcAttackTurnBoss(item, getCard)) {
        if (attackOpen) await followConsole("", String(item?.name || ""));
        if (bossOpen && (bossOpen.sourceId === undefined || bossOpen.sourceId === item.id)) return;
        if (bossOpen) {
          if (bossOpen.idle === false) return;
          await closeBossConsole();
          await settle(closeSettleMs);
          if (taskRevision !== revision || await isBossConsoleOpen()) return;
        }
        if (taskRevision === revision) await openBossConsole(item.id);
        return;
      }
      // The boss's turn or Epic Action is over: an idle Boss Actions closes by itself.
      if (bossOpen) await closeBossConsole();
      if (taskRevision !== revision) return;
      const ready = !!sourceId && pcAttackTurnReady(item, getCard);
      // An open console is never reloaded: it moves to the new actor by itself (or closes), unless a draft holds it.
      if (attackOpen) {
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
