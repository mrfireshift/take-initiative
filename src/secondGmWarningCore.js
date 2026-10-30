// A second GM client in the room (a co-GM, or the GM's own second window) runs every GM-only service again: durations
// tick twice, History and Undo split between two browsers, notices arrive twice (audit online, ON-14). Nothing elects
// one of them yet; the GM is warned instead.

// The connections of the other GM clients, from Owlbear's party: the current connection never counts, in case the
// party lists it.
export function otherGmConnections(players, selfConnectionId) {
  const self = String(selfConnectionId || "");
  const seen = new Set();
  const result = [];
  for (const player of Array.isArray(players) ? players : []) {
    const connectionId = String(player?.connectionId || "");
    if (!connectionId || connectionId === self || seen.has(connectionId)) continue;
    if (String(player?.role || "").toUpperCase() !== "GM") continue;
    seen.add(connectionId);
    result.push({ connectionId, name: String(player?.name || "").trim() });
  }
  return result;
}

// The connections not warned about yet; a GM who reconnects comes back with a new connection and is warned again.
export function unwarnedGmConnections(others, warnedConnectionIds) {
  return (Array.isArray(others) ? others : []).filter((other) => !warnedConnectionIds.has(other.connectionId));
}

export function secondGmWarningText(others) {
  const names = (Array.isArray(others) ? others : []).map((other) => other.name).filter(Boolean);
  const who = names.length ? ` (${names.join(", ")})` : "";
  return `Nella stanza c'è un altro client GM${who}: con due finestre GM le durate possono scendere due volte e la Cronologia si divide. Tienine aperta una sola.`;
}
