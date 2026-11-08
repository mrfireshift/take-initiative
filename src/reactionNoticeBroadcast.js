// Avvisi di reazione, lot R6 (docs/STUDIO_AVVISI_REAZIONE.md §6.14): the GM's prompt sent to the players' screens
// (reactionNoticeCore.js), and the players' answers back. Only the GM's prompts send: the two consoles and the spell
// panel. Table profile: only with the "screen" option (decision H4). Online profile: always, to the characters'
// players. A prompt that goes, or that changes event, sends its clear.
import OBR from "@owlbear-rodeo/sdk";
import { REACTION_NOTICE_CHANNEL, buildReactionNoticePayload, normalizeReactionNotice } from "./reactionNoticeCore.js";

let runtimeStart = null;
async function onlineRoomProfile() {
  try {
    const [{ runtimeOptionsService, startRuntimeOptions }, { selectOnlineRoomProfile }] = await Promise.all([
      import("./options/optionsRuntime.js"), import("./options/optionsSelectors.js")]);
    runtimeStart ||= startRuntimeOptions();
    await runtimeStart;
    return runtimeOptionsService.get(selectOnlineRoomProfile) === true;
  } catch {
    runtimeStart = null;
    return false;
  }
}

export function createReactionNoticeBroadcaster({ obr = OBR, online = onlineRoomProfile } = {}) {
  let sentId = "";
  let sentJson = "";
  let queue = Promise.resolve();
  let unsubscribe = null;
  const send = async (data) => {
    try { await obr.broadcast.sendMessage(REACTION_NOTICE_CHANNEL, data, { destination: "REMOTE" }); }
    catch (error) { console.warn("[reaction-notice] send:", error?.message || error); }
  };
  const clear = async () => {
    if (!sentId) return;
    const promptId = sentId;
    sentId = "";
    sentJson = "";
    await send({ type: "clear", promptId });
  };
  return {
    // shown: the prompt's { phase, signature, list, items }; event: its event; options: the prompts' options.
    update({ shown = null, event = null, options = null, effectText = () => "" } = {}) {
      queue = queue.then(async () => {
        const mode = !shown?.list?.length ? "" : await online() ? "online" : options?.screen === true ? "table" : "";
        const payload = mode ? buildReactionNoticePayload({ shown, event, mode, effectText }) : null;
        if (!payload) return clear();
        const json = JSON.stringify(payload);
        if (json === sentJson) return undefined;
        if (sentId && sentId !== payload.promptId) await clear();
        sentId = payload.promptId;
        sentJson = json;
        return send(payload);
      }).catch(() => {});
      return queue;
    },
    // listener(answer): a player's Usa or Ignora on the prompt sent now.
    onAnswer(listener) {
      try {
        unsubscribe = obr.broadcast.onMessage(REACTION_NOTICE_CHANNEL, (event) => {
          const notice = normalizeReactionNotice(event?.data);
          if (notice?.type === "answer" && notice.promptId === sentId) listener(notice);
        });
      } catch (error) {
        console.warn("[reaction-notice] listen:", error?.message || error);
      }
    },
    currentId: () => sentId,
    stop() {
      try { unsubscribe?.(); } catch {}
      unsubscribe = null;
      queue = queue.then(clear).catch(() => {});
      return queue;
    },
  };
}
