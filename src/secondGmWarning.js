// Warns the GM when another GM client joins the room (secondGmWarningCore.js). Mounted by the GM's background only.
import OBR from "@owlbear-rodeo/sdk";
import { otherGmConnections, secondGmWarningText, unwarnedGmConnections } from "./secondGmWarningCore.js";

export function mountSecondGmWarning({ obr = OBR } = {}) {
  const warned = new Set();
  let selfConnection = null;
  const check = async (players) => {
    selfConnection ??= obr.player.getConnectionId().catch(() => "");
    const fresh = unwarnedGmConnections(otherGmConnections(players, await selfConnection), warned);
    if (!fresh.length) return;
    for (const other of fresh) warned.add(other.connectionId);
    await obr.notification.show(secondGmWarningText(fresh), "WARNING");
  };
  const run = (players) => {
    void check(players).catch((error) => console.warn("[second-gm] avviso:", error?.message || error));
  };
  void obr.party.getPlayers().then(run, () => {});
  return obr.party.onChange(run);
}
