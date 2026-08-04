function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function snapshotValue(change, side, field) {
  const snapshot = change?.[side]?.[field];
  return snapshot?.present ? clone(snapshot.value) : undefined;
}

function numberText(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function targetSnapshot(change) {
  return {
    id: String(change?.id || ""),
    name: String(change?.name || "Token"),
  };
}

function hpPayload(changes) {
  const targets = changes.map((change) => {
    const beforeHP = Number(snapshotValue(change, "before", "hp"));
    const afterHP = Number(snapshotValue(change, "after", "hp"));
    const beforeMax = Number(snapshotValue(change, "before", "hpMax"));
    const afterMax = Number(snapshotValue(change, "after", "hpMax"));
    return {
      ...targetSnapshot(change),
      before: {
        hp: Number.isFinite(beforeHP) ? beforeHP : 0,
        hpMax: Number.isFinite(beforeMax) ? beforeMax : 0,
      },
      after: {
        hp: Number.isFinite(afterHP) ? afterHP : 0,
        hpMax: Number.isFinite(afterMax) ? afterMax : 0,
      },
      delta: (Number.isFinite(afterHP) ? afterHP : 0) - (Number.isFinite(beforeHP) ? beforeHP : 0),
    };
  });
  const deltas = targets.map((target) => target.delta).filter((delta) => delta !== 0);
  const action = deltas.length && deltas.every((delta) => delta < 0)
    ? "damage"
    : deltas.length && deltas.every((delta) => delta > 0)
      ? "healing"
      : "change";
  return { action, targets };
}

export function combatEventFromHistoryEntry(entry, context = {}) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const kind = String(entry?.kind || "change");
  const base = {
    at: Number(entry?.at) || Date.now(),
    kind,
    action: "change",
    label: String(entry?.label || "Modifica"),
    source: "automatic",
    round: Math.max(1, Number(context?.round) || 1),
    turn: context?.turn ? clone(context.turn) : null,
    historyEntryId: String(entry?.id || ""),
    targets: changes.map(targetSnapshot),
    payload: {},
  };

  if (kind === "hp") {
    const hp = hpPayload(changes);
    return { ...base, action: hp.action, targets: hp.targets, payload: { targets: hp.targets } };
  }
  if (kind === "move") {
    const targets = changes.map((change) => ({
      ...targetSnapshot(change),
      cells: Math.round((Number(change?.movement?.cells) || 0) * 100) / 100,
      from: clone(change?.beforePosition),
      to: clone(change?.afterPosition),
    }));
    return { ...base, action: "move", targets, payload: { targets } };
  }
  if (kind === "condition") return { ...base, action: "condition" };
  if (kind === "spell") return { ...base, action: "spell" };
  if (kind === "reminder-resolution") {
    return {
      ...base,
      action: "reminder-resolution",
      payload: clone(entry?.payload || {}),
    };
  }
  if (kind === "initiative-card") return { ...base, kind: "resource", action: "sheet" };
  return base;
}

export function combatEventDetail(event) {
  const targets = Array.isArray(event?.targets) ? event.targets : [];
  if (event?.kind === "hp") {
    return targets.map((target) => {
      const before = target?.before || {};
      const after = target?.after || {};
      const delta = Number(target?.delta) || 0;
      const signed = delta > 0 ? `+${numberText(delta)}` : numberText(delta);
      return `${target.name}: ${numberText(before.hp)}/${numberText(before.hpMax)} → ${numberText(after.hp)}/${numberText(after.hpMax)} (${signed})`;
    }).join(" | ");
  }
  if (event?.kind === "move") {
    return targets.map((target) => `${target.name}: ${numberText(target.cells)} caselle`).join(" | ");
  }
  if (event?.kind === "turn") return String(event?.payload?.actorName || event?.turn?.name || "");
  if (event?.kind === "note") return String(event?.payload?.text || "");
  if (event?.kind === "undo") return String(event?.payload?.description || "");
  if (event?.kind === "reminder-resolution") {
    const outcome = {
      passed: "Superato",
      failed: "Fallito",
      immune: "Immune",
    }[String(event?.payload?.outcome || "").trim().toLowerCase()] || "Risolto";
    const damage = Number(event?.payload?.damage) || 0;
    return `${outcome}${damage > 0 ? ` · ${numberText(damage)} danni` : ""}`;
  }
  if (event?.kind === "scene-add" || event?.kind === "scene-remove" || event?.kind === "initiative-add" || event?.kind === "initiative-remove") {
    return targets.map((target) => target.name).join(", ");
  }
  const names = targets.slice(0, 4).map((target) => target.name).filter(Boolean);
  return `${names.join(", ")}${targets.length > 4 ? ` +${targets.length - 4}` : ""}`;
}

export function aggregateCombatLogEvents(events) {
  const movementGroups = new Map();
  const output = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== "move") {
      output.push(event);
      continue;
    }
    const targets = Array.isArray(event.targets) ? event.targets : [];
    for (const target of targets) {
      const round = Math.max(1, Number(event.round) || 1);
      const turnId = String(event?.turn?.id || "no-turn");
      const targetId = String(target?.id || target?.name || "token");
      const key = `${round}\u0000${turnId}\u0000${targetId}`;
      let aggregate = movementGroups.get(key);
      if (!aggregate) {
        const aggregateTarget = {
          ...clone(target),
          cells: 0,
          from: clone(target?.from),
          to: clone(target?.to),
        };
        aggregate = {
          ...event,
          id: `movement-total:${key}`,
          action: "move-total",
          label: `Movimento totale: ${target?.name || "Token"}`,
          targets: [aggregateTarget],
          payload: { targets: [aggregateTarget] },
        };
        movementGroups.set(key, aggregate);
      }
      const aggregateTarget = aggregate.targets[0];
      aggregateTarget.cells = Math.round((Number(aggregateTarget.cells) + (Number(target?.cells) || 0)) * 100) / 100;
      if (!aggregateTarget.from && target?.from) aggregateTarget.from = clone(target.from);
      if (target?.to) aggregateTarget.to = clone(target.to);
      aggregate.at = Math.max(Number(aggregate.at) || 0, Number(event.at) || 0);
      aggregate.sequence = Math.max(Number(aggregate.sequence) || 0, Number(event.sequence) || 0);
    }
  }
  output.push(...Array.from(movementGroups.values()).filter((event) =>
    Math.abs(Number(event?.targets?.[0]?.cells) || 0) >= 0.01
  ));
  return output.sort((a, b) => {
    const aOrder = Number(a?.sequence) || Number(a?.at) || 0;
    const bOrder = Number(b?.sequence) || Number(b?.at) || 0;
    return aOrder - bOrder;
  });
}

export function serializeCombatLogText(session, events) {
  const lines = [
    `Registro combattimento: ${session?.name || "Combattimento"}`,
    `Inizio: ${new Date(Number(session?.startedAt) || Date.now()).toLocaleString("it-IT")}`,
    "",
  ];
  let lastRound = null;
  for (const event of aggregateCombatLogEvents(events)) {
    const round = Math.max(1, Number(event?.round) || 1);
    if (round !== lastRound) {
      if (lastRound !== null) lines.push("");
      lines.push(`ROUND ${round}`);
      lastRound = round;
    }
    const time = new Date(Number(event?.at) || Date.now()).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    lines.push(`[${time}] ${event?.label || "Evento"}`);
    const detail = combatEventDetail(event);
    if (detail) lines.push(`  ${detail}`);
  }
  return lines.join("\n");
}
