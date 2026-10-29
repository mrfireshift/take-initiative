import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { readSceneItemsSnapshot, subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { spellActiveResolutionPopoverId } from "./spellActiveResolutionCore.js";
import {
  spellTurnPromptRequests,
  spellTurnPromptSelectedCandidateId,
} from "./callLightningTurnPromptCore.js";
import {
  executeSpellActiveAction,
  executeSpellActiveResolution,
} from "./spellApplicationExecutor.js";
import { buildSpellUnifiedActivePopoverRequest } from "./spellUnifiedActiveAdapter.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { getSpellDefinition } from "./spells-srd.js";
import { spellOverviewGroups } from "./spellsPanelViewCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";

const STATE_KEY = `${ID}/state`;
export const CALL_LIGHTNING_TURN_NOTICE_CHANNEL = `${ID}/turn-notice`;
export const SPELL_TURN_PROMPT_ACTION_CHANNEL = `${ID}/spell-turn-prompt-action`;
const POPOVER_WIDTH = 360;
const POPOVER_HEIGHT = 470;
const SINGLE_ATTACK_POPOVER_HEIGHT = 300;
const SINGLE_HEAL_POPOVER_HEIGHT = 300;
const STORM_SPHERE_POPOVER_HEIGHT = 300;
const ENERVATION_POPOVER_HEIGHT = 245;
const CHOICE_POPOVER_WIDTH = 360;
const CHOICE_POPOVER_HEIGHT = 210;
const TELEKINESIS_CHOICE_POPOVER_HEIGHT = 160;
const SINGLE_ACTION_CHOICE_POPOVER_HEIGHT = 150;
const TARGET_SELECTION_CHOICE_POPOVER_HEIGHT = 165;
const EYEBITE_CHOICE_POPOVER_HEIGHT = 215;

let mounted = false;
let work = Promise.resolve();
let revision = 0;
let currentActorId = "";
let currentTurnKey = "";
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeTurnNotice = null;
let unsubscribeTurnAction = null;
let unsubscribePlayer = null;
let currentSelection = [];
const opened = new Map();
const dismissedChoiceKeys = new Set();

function enqueue(task) {
  work = work.then(task, task);
  return work;
}

function dismissedChoiceKey(instanceId, turnKey) {
  return `${String(turnKey || "").trim()}::${String(instanceId || "").trim()}`;
}

function choiceRequestStorageKey(popoverIdValue) {
  return `${ID}/spell-turn-action-choice/request/${String(popoverIdValue || "").replaceAll("/", "_")}`;
}

async function broadcastChoiceSelection(runtime, selection = currentSelection) {
  const request = runtime?.request;
  const targetId = spellTurnPromptSelectedCandidateId(request, selection);
  if (!targetId) return;
  await OBR.broadcast.sendMessage(
    SPELL_TURN_PROMPT_ACTION_CHANNEL,
    {
      type: "sync-choice-target",
      instanceId: request.instanceId,
      turnKey: request.turnKey,
      targetId,
    },
    { destination: "LOCAL" },
  ).catch(() => {});
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function popoverId(request) {
  if (request?.kind === "choice") {
    return `${ID}/spell-turn-action-choice/${String(request?.instanceId || "").trim()}`;
  }
  const payload = request?.payload || request;
  return spellActiveResolutionPopoverId(payload?.instanceId, payload?.actionId);
}

function popoverHeight(request) {
  if (request?.kind === "choice") {
    if (request?.spellId === "eyebite") return EYEBITE_CHOICE_POPOVER_HEIGHT;
    if (request?.targetSelection === true) return TARGET_SELECTION_CHOICE_POPOVER_HEIGHT;
    if (request?.spellId === "telekinesis") return TELEKINESIS_CHOICE_POPOVER_HEIGHT;
    const actionCount = Array.isArray(request?.actions) ? request.actions.length : 0;
    if (actionCount === 1) return SINGLE_ACTION_CHOICE_POPOVER_HEIGHT;
    const rows = Math.ceil(actionCount / 2);
    return Math.max(CHOICE_POPOVER_HEIGHT, 80 + rows * 65);
  }
  const payload = request?.payload || request;
  return payload?.spellId === "xanathar-debilitazione"
    ? ENERVATION_POPOVER_HEIGHT
    : payload?.spellId === "xanathar-sfera-della-tempesta"
      ? STORM_SPHERE_POPOVER_HEIGHT
      : payload?.action?.resolutionKind === "single-attack"
        ? SINGLE_ATTACK_POPOVER_HEIGHT
        : payload?.action?.resolutionKind === "single-heal"
          ? SINGLE_HEAL_POPOVER_HEIGHT
        : POPOVER_HEIGHT;
}

function popoverWidth(request) {
  return request?.kind === "choice" ? CHOICE_POPOVER_WIDTH : POPOVER_WIDTH;
}

async function closeRuntime(runtime) {
  if (!runtime?.popoverId) return;
  await OBR.popover.close(runtime.popoverId).catch(() => {});
  if (runtime?.requestStorageKey) {
    try { localStorage.removeItem(runtime.requestStorageKey); } catch {}
  }
}

async function closeAll() {
  const runtimes = [...opened.values()];
  opened.clear();
  await Promise.all(runtimes.map(closeRuntime));
}

async function currentTurnDescriptor() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || {};
  const order = Array.isArray(state.order) ? state.order.filter(Boolean) : [];
  if (!order.length) return null;
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state.current) || 0)),
  );
  return {
    actorId: String(order[current] || "").trim(),
    turnKey: currentInitiativeTurnKey(state),
    sceneEpoch: currentSceneEpoch(),
  };
}

async function casterAnchor(casterId) {
  const bounds = await OBR.scene.items.getItemBounds([casterId]).catch(() => null);
  const center = point(bounds?.center);
  const min = point(bounds?.min);
  const world = center && min
    ? { x: center.x, y: min.y }
    : center;
  const transformed = world
    ? await OBR.viewport.transformPoint(world).catch(() => null)
    : null;
  const screen = point(transformed);
  return screen
    ? { left: screen.x, top: screen.y }
    : { left: 120, top: 120 };
}

async function requestsForTurn(descriptor) {
  // The Event Hub snapshot when it is complete for this scene (it already holds the event that asked for this pass),
  // else one SDK read as before.
  const snapshot = readSceneItemsSnapshot(descriptor.sceneEpoch);
  const items = snapshot.complete
    ? snapshot.items
    : await OBR.scene.items.getItems().catch(() => []);
  return spellTurnPromptRequests({
    items,
    actorId: descriptor.actorId,
    sceneEpoch: descriptor.sceneEpoch,
    turnKey: descriptor.turnKey,
  });
}

async function openRequest(request, stackIndex, taskRevision) {
  if (taskRevision !== revision) return;
  const payload = request?.payload || request;
  const activePopover = request?.kind === "choice"
    ? null
    : buildSpellUnifiedActivePopoverRequest(payload, {
      width: POPOVER_WIDTH,
      height: popoverHeight(request),
    });
  const id = activePopover?.id || popoverId(request);
  const height = activePopover?.height || popoverHeight(request);
  const width = activePopover?.width || popoverWidth(request);
  const casterId = request?.casterId || payload?.casterId;
  const anchorId = request?.kind === "choice"
    ? request?.zoneItemId || casterId
    : ["xanathar-stretta-della-terra-di-maximilian", "arcane-hand"].includes(payload?.spellId)
      ? payload?.zoneItemId || casterId
      : casterId;
  const anchor = await casterAnchor(anchorId);
  if (taskRevision !== revision) return;
  const position = {
    left: anchor.left,
    top: anchor.top - stackIndex * (height + 8),
  };
  let requestStorageKey = "";
  const url = request?.kind === "choice"
    ? (() => {
      requestStorageKey = choiceRequestStorageKey(id);
      const storedRequest = {
        ...request,
        selectedTargetId: spellTurnPromptSelectedCandidateId(request, currentSelection),
      };
      let stored = false;
      try {
        localStorage.setItem(requestStorageKey, JSON.stringify(storedRequest));
        stored = true;
      } catch {}
      const query = new URLSearchParams(stored
        ? { popoverId: id, requestKey: requestStorageKey }
        : { popoverId: id, request: JSON.stringify(storedRequest) });
      return `/spell-turn-action-choice.html?${query.toString()}`;
    })()
    : activePopover.url;
  await openTrackedPopover({
    id,
    url,
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: position,
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 8,
    hidePaper: true,
  });
  const runtime = {
    popoverId: id,
    instanceId: request?.instanceId || payload?.instanceId,
    casterId,
    kind: request?.kind || "action",
    request,
    ...(requestStorageKey ? { requestStorageKey } : {}),
  };
  opened.set(id, runtime);
}

// The choice an open action popup came from (its "‹ Azioni" brings the choice back): the reconcile keeps that action
// open and does not reopen the choice above it.
function choiceHeldByAction(request) {
  if (request?.kind !== "choice") return false;
  const id = popoverId(request);
  return [...opened.values()].some((runtime) => runtime?.choiceRequest && popoverId(runtime.choiceRequest) === id);
}

async function closeMissing(requests) {
  const desiredIds = new Set(requests.map(popoverId));
  const heldChoiceIds = new Set(requests.filter(choiceHeldByAction).map(popoverId));
  for (const [id, runtime] of [...opened]) {
    // A popup the GM opened from the hand's row stays until it is closed or used, whoever's turn it is; so does an
    // action opened from a choice the turn still offers.
    if (desiredIds.has(id) || runtime?.manual === true) continue;
    if (runtime?.choiceRequest && heldChoiceIds.has(popoverId(runtime.choiceRequest))) continue;
    opened.delete(id);
    await closeRuntime(runtime);
  }
}

async function reconcileTurn(descriptor, taskRevision, forceOpen = false) {
  if (!descriptor?.actorId || !descriptor.turnKey) {
    currentActorId = "";
    currentTurnKey = "";
    await closeAll();
    return;
  }
  const isNewTurn = descriptor.turnKey !== currentTurnKey
    || descriptor.actorId !== currentActorId;
  if (isNewTurn) dismissedChoiceKeys.clear();
  currentActorId = descriptor.actorId;
  currentTurnKey = descriptor.turnKey;
  const requests = (await requestsForTurn(descriptor)).filter((request) => (
    request?.kind !== "choice"
    || !dismissedChoiceKeys.has(dismissedChoiceKey(request.instanceId, descriptor.turnKey))
  ));
  if (taskRevision !== revision) return;
  if (!forceOpen && !isNewTurn) {
    await closeMissing(requests);
    // Alcune azioni diventano disponibili nello stesso turno del cast (es.
    // Corona di Stelle, lanciata con azione bonus). Apriamo soltanto i prompt
    // nuovi senza ricreare quelli già presenti nello stesso turno.
    for (let index = 0; index < requests.length; index += 1) {
      if (opened.has(popoverId(requests[index])) || choiceHeldByAction(requests[index])) continue;
      await openRequest(requests[index], index, taskRevision);
    }
    return;
  }
  await closeAll();
  for (let index = 0; index < requests.length; index += 1) {
    await openRequest(requests[index], index, taskRevision);
  }
}

function requestCurrentTurn({ forceOpen = false } = {}) {
  const taskRevision = ++revision;
  return enqueue(async () => {
    if (!mounted) return;
    if (!await OBR.scene.isReady().catch(() => false)) {
      await closeAll();
      return;
    }
    const descriptor = await currentTurnDescriptor();
    await reconcileTurn(descriptor, taskRevision, forceOpen);
  }).catch((error) => {
    console.warn("[spell-turn-prompt] reconcile:", error?.message || error);
  });
}

// "Azioni della Mano" from the token's context menu (contextMenu.js): the popup the caster's turn opens, for this
// spell token's instance, at any time. The cast turn's exclusion does not apply: the GM asked for it.
async function openBoardTokenActions(zoneItemId) {
  const items = await OBR.scene.items.getItems().catch(() => []);
  const board = items.find((item) => item.id === zoneItemId)?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const instanceId = String(board?.instanceId || "").trim();
  if (!instanceId || !board?.casterId) return false;
  const requests = spellTurnPromptRequests({
    items,
    actorId: String(board.casterId),
    sceneEpoch: currentSceneEpoch(),
    turnKey: "",
  }).filter((request) => String(request?.instanceId || request?.payload?.instanceId || "").trim() === instanceId);
  if (!requests.length) {
    await OBR.notification.show("Nessuna azione disponibile per questo incantesimo.", "INFO").catch(() => {});
    return false;
  }
  for (const [index, request] of requests.entries()) {
    await openRequest(request, index, revision);
    const runtime = opened.get(popoverId(request));
    if (runtime) runtime.manual = true;
  }
  return true;
}

export async function mountCallLightningTurnPromptController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;

  mounted = true;
  currentSelection = await OBR.player.getSelection().catch(() => []);
  unsubscribePlayer = OBR.player.onChange((player) => {
    if (!Array.isArray(player?.selection)) return;
    currentSelection = [...player.selection];
    for (const runtime of opened.values()) {
      if (runtime?.kind === "choice"
        && (runtime?.request?.spellId === "eyebite"
          || runtime?.request?.targetSelection === true)) {
        void broadcastChoiceSelection(runtime, currentSelection);
      }
    }
  });
  unsubscribeItems = subscribeSceneItemChanges(
    () => { void requestCurrentTurn(); },
    {
      domains: ["effects", "zone"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      revision += 1;
      currentActorId = "";
      currentTurnKey = "";
      dismissedChoiceKeys.clear();
      void enqueue(() => closeAll());
      return;
    }
    void requestCurrentTurn({ forceOpen: true });
  });
  unsubscribeTurnNotice = OBR.broadcast.onMessage(
    CALL_LIGHTNING_TURN_NOTICE_CHANNEL,
    (event) => {
      if (event?.data?.type !== "show-turn-notice") return;
      const data = event.data;
      const taskRevision = ++revision;
      void enqueue(async () => {
        if (!mounted) return;
        // Gli epoch numerici sono runtime-local: il Turn Notice arriva da un
        // altro realm, quindi ricatturiamo sempre l'epoch del controller.
        const descriptor = {
          actorId: String(data.currentId || "").trim(),
          turnKey: String(data.turnKey || "").trim(),
          sceneEpoch: currentSceneEpoch(),
        };
        await reconcileTurn(descriptor, taskRevision, false);
      }).catch((error) => {
        console.warn("[spell-turn-prompt] turn notice:", error?.message || error);
      });
    },
  );
  unsubscribeTurnAction = OBR.broadcast.onMessage(
    SPELL_TURN_PROMPT_ACTION_CHANNEL,
    (event) => {
      const data = event?.data || {};
      // "‹ Azioni" in an action popup opened from a choice: the choice comes back, to pick another action.
      if (data.type === "back-to-choice") {
        void enqueue(async () => {
          const runtime = [...opened.values()].find((entry) => (
            entry?.kind === "action"
            && entry.choiceRequest
            && String(entry.instanceId || "").trim() === String(data.instanceId || "").trim()
          ));
          if (!runtime) return;
          opened.delete(runtime.popoverId);
          await closeRuntime(runtime);
          await openRequest(runtime.choiceRequest, 0, revision);
          const choice = opened.get(popoverId(runtime.choiceRequest));
          if (choice && runtime.manual) choice.manual = true;
        }).catch((error) => {
          console.warn("[spell-turn-prompt] back to choice:", error?.message || error);
        });
        return;
      }
      if (data.type === "open-board-token-actions") {
        void enqueue(() => openBoardTokenActions(String(data.zoneItemId || "").trim())).catch((error) => {
          console.warn("[spell-turn-prompt] board token actions:", error?.message || error);
        });
        return;
      }
      if (!["select-action", "apply-choice-action", "dismiss-choice"].includes(data.type)) return;

      // La X non deve aspettare la work queue: chiudiamo il runtime host subito
      // e invalidiamo eventuali reconcile già accodati. Questo evita la
      // sensazione di una X "morta" o una riapertura nello stesso turno.
      if (data.type === "dismiss-choice") {
        revision += 1;
        const explicitPopoverId = String(data.popoverId || "").trim();
        const runtime = (explicitPopoverId ? opened.get(explicitPopoverId) : null)
          || [...opened.values()].find((entry) => (
            entry?.kind === "choice"
            && String(entry?.instanceId || "").trim() === String(data.instanceId || "").trim()
          ));
        if (runtime) {
          const runtimeTurnKey = String(runtime?.request?.turnKey || currentTurnKey || "").trim();
          dismissedChoiceKeys.add(dismissedChoiceKey(runtime.instanceId, runtimeTurnKey));
          opened.delete(runtime.popoverId);
          void closeRuntime(runtime);
        } else if (explicitPopoverId) {
          void OBR.popover.close(explicitPopoverId).catch(() => {});
        }
        return;
      }

      const taskRevision = ++revision;
      void enqueue(async () => {
        if (!mounted) return;
        const runtime = [...opened.values()].find((entry) => (
          entry?.kind === "choice"
          && String(entry?.instanceId || "").trim() === String(data.instanceId || "").trim()
        ));
        const request = runtime?.request;
        if (!runtime) return;
        const runtimeTurnKey = String(request?.turnKey || currentTurnKey || "").trim();
        if (runtimeTurnKey && runtimeTurnKey !== currentTurnKey) return;

        const payload = Array.isArray(request?.actions)
          ? request.actions.find((entry) => String(entry?.actionId || "") === String(data.actionId || ""))
          : null;
        if (!payload) return;

        if (payload.executionKind === "active-action") {
          try {
            const actionSceneEpoch = currentSceneEpoch();
            const actionTurnKey = runtimeTurnKey || currentTurnKey;
            const selectedTargetId = data.type === "apply-choice-action"
              ? String(data.targetId || "").trim()
              : "";
            const items = await OBR.scene.items.getItems();
            const group = spellOverviewGroups(items).find((candidate) => (
              String(candidate?.instanceId || "").trim() === String(payload.instanceId || "").trim()
              && String(candidate?.casterId || "").trim() === String(payload.casterId || "").trim()
            ));
            const spell = getSpellDefinition(payload.spellId);
            if (!group || !spell) throw new Error(`L'istanza di ${spell?.displayName || "questo incantesimo"} non è più disponibile.`);
            const commandId = `turn-prompt:${String(data.instanceId || "").trim()}:${String(data.actionId || "").trim()}:${Date.now().toString(36)}`;
            const sceneContext = await getEffectsMutationSceneContext({ commandId });
            await executeSpellActiveAction({
              spell,
              actionId: payload.actionId,
              group,
              selectedTargetIds: selectedTargetId ? [selectedTargetId] : [],
              appliedAt: group.appliedAt,
              casterName: group.casterName,
              sceneEpoch: actionSceneEpoch,
              sceneIdentity: sceneContext?.sceneIdentity || null,
              commandId: sceneContext?.commandId || commandId,
              isCurrent: (epoch) => (
                Number(epoch) === actionSceneEpoch
                && currentSceneEpoch() === actionSceneEpoch
                && actionTurnKey === currentTurnKey
              ),
            });
            if (payload.action?.repeatableThisTurn === true) {
              const updatedItems = await OBR.scene.items.getItems().catch(() => []);
              const remainingGroup = spellOverviewGroups(updatedItems).find((candidate) => (
                String(candidate?.instanceId || "").trim() === String(payload.instanceId || "").trim()
                && String(candidate?.casterId || "").trim() === String(payload.casterId || "").trim()
              ));
              const remaining = Number(remainingGroup?.castContext?.uses?.remaining);
              if (remainingGroup && Number.isFinite(remaining) && remaining > 0) {
                await OBR.broadcast.sendMessage(
                  SPELL_TURN_PROMPT_ACTION_CHANNEL,
                  {
                    type: "active-action-complete",
                    instanceId: data.instanceId,
                    actionId: data.actionId,
                    turnKey: data.turnKey,
                    remaining,
                  },
                  { destination: "LOCAL" },
                ).catch(() => {});
                return;
              }
            }
            opened.delete(runtime.popoverId);
            await closeRuntime(runtime);
          } catch (error) {
            await OBR.broadcast.sendMessage(
              SPELL_TURN_PROMPT_ACTION_CHANNEL,
              {
                type: "choice-action-error",
                instanceId: data.instanceId,
                actionId: data.actionId,
                turnKey: data.turnKey,
                message: error?.message || "Impossibile cambiare modalità dell'incantesimo.",
              },
              { destination: "LOCAL" },
            ).catch(() => {});
            console.warn("[spell-turn-prompt] active action:", error?.message || error);
          }
          return;
        }

        if (data.type === "apply-choice-action") {
          const targetId = String(data.targetId || "").trim();
          if (!targetId) return;
          try {
            // Il click è l'origine di questo workflow: catturiamo qui l'epoch
            // locale e lo propaghiamo per tutta la risoluzione nello stesso realm.
            const actionSceneEpoch = currentSceneEpoch();
            const actionTurnKey = runtimeTurnKey || currentTurnKey;
            const executionPayload = { ...payload, sceneEpoch: actionSceneEpoch, turnKey: actionTurnKey };
            const commandId = `turn-prompt:${String(data.instanceId || "").trim()}:${String(data.actionId || "").trim()}:${Date.now().toString(36)}`;
            const sceneContext = await getEffectsMutationSceneContext({ commandId });
            await executeSpellActiveResolution({
              payload: executionPayload,
              targetIds: [targetId],
              outcomes: { [targetId]: String(payload.action?.assumedOutcome || "failed").trim() || "failed" },
              damageRoll: 0,
              sceneEpoch: actionSceneEpoch,
              sceneIdentity: sceneContext?.sceneIdentity || null,
              commandId: sceneContext?.commandId || commandId,
              isCurrent: (epoch) => (
                Number(epoch) === actionSceneEpoch
                && currentSceneEpoch() === actionSceneEpoch
                && actionTurnKey === currentTurnKey
              ),
            });
            opened.delete(runtime.popoverId);
            await closeRuntime(runtime);
          } catch (error) {
            await OBR.broadcast.sendMessage(
              SPELL_TURN_PROMPT_ACTION_CHANNEL,
              {
                type: "choice-action-error",
                instanceId: data.instanceId,
                turnKey: data.turnKey,
                message: error?.message || "Impossibile applicare l'effetto.",
              },
              { destination: "LOCAL" },
            ).catch(() => {});
            console.warn("[spell-turn-prompt] direct choice:", error?.message || error);
          }
          return;
        }

        opened.delete(runtime.popoverId);
        await closeRuntime(runtime);
        // The action remembers its choice, so its popup can go back to it ("‹ Azioni").
        const actionRequest = { kind: "action", payload: { ...payload, returnToChoice: true } };
        await openRequest(actionRequest, 0, taskRevision);
        const actionRuntime = opened.get(popoverId(actionRequest));
        if (actionRuntime) {
          actionRuntime.choiceRequest = request;
          if (runtime.manual) actionRuntime.manual = true;
        }
      }).catch((error) => {
        console.warn("[spell-turn-prompt] action choice:", error?.message || error);
      });
    },
  );
  await requestCurrentTurn({ forceOpen: true });
  return true;
}

export async function unmountCallLightningTurnPromptController() {
  revision += 1;
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeTurnNotice?.();
  unsubscribeTurnNotice = null;
  unsubscribeTurnAction?.();
  unsubscribeTurnAction = null;
  unsubscribePlayer?.();
  unsubscribePlayer = null;
  currentSelection = [];
  mounted = false;
  currentActorId = "";
  currentTurnKey = "";
  dismissedChoiceKeys.clear();
  await enqueue(() => closeAll());
}
