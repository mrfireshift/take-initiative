import OBR from "@owlbear-rodeo/sdk";
import { projectReminderNotices } from "./optionsProjection.js";
import { runtimeOptionsService, startRuntimeOptions } from "./optionsRuntime.js";
import { selectReminderProjectionPolicy } from "./optionsSelectors.js";

export async function sendProjectedReminderPayload(channel, payload = {}) {
  await startRuntimeOptions().catch(() => {});
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return { gm: 0, player: 0 };
  const projection = runtimeOptionsService.get(selectReminderProjectionPolicy);
  const rawNotices = Array.isArray(payload.notices) ? payload.notices : [];
  const gmNotices = projectReminderNotices(rawNotices, {
    role: "GM",
    policy: projection.player,
    directResolution: projection.directResolution,
  });
  const playerNotices = projectReminderNotices(rawNotices, {
    role: "PLAYER",
    policy: projection.player,
    directResolution: projection.directResolution,
  });
  const deliveries = [];
  if (gmNotices.length) {
    deliveries.push(OBR.broadcast.sendMessage(
      channel,
      { ...payload, notices: gmNotices },
      { destination: "LOCAL" },
    ));
  }
  if (playerNotices.length) {
    deliveries.push(OBR.broadcast.sendMessage(
      channel,
      { ...payload, notices: playerNotices },
      { destination: "REMOTE" },
    ));
  }
  await Promise.all(deliveries);
  return { gm: gmNotices.length, player: playerNotices.length };
}
