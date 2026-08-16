import { ID } from "./constants.js";

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

const EVENT_CATEGORY_BY_KIND = Object.freeze({
  hp: "hp",
  spell: "spell",
  save: "save",
  condition: "condition",
  resource: "resource",
  movement: "movement",
  turn: "turn",
  roster: "roster",
  undo: "undo",
  note: "note",
  other: "other",
});

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

export function combatEventCategory(kind) {
  const value = String(kind || "").trim().toLowerCase();
  if (value === "hp" || value.startsWith("hp-")) return EVENT_CATEGORY_BY_KIND.hp;
  if (value === "spell" || value.startsWith("spell-")) return EVENT_CATEGORY_BY_KIND.spell;
  if (value === "save-resolution" || value === "reminder-resolution") return EVENT_CATEGORY_BY_KIND.save;
  if (value === "condition" || value.startsWith("condition-")) return EVENT_CATEGORY_BY_KIND.condition;
  if (value === "class-feature" || value.startsWith("class-feature-") || value === "initiative-card" || value === "resource") {
    return EVENT_CATEGORY_BY_KIND.resource;
  }
  if (value === "move" || value === "movement") return EVENT_CATEGORY_BY_KIND.movement;
  if (value === "turn" || value === "round") return EVENT_CATEGORY_BY_KIND.turn;
  if (value === "scene" || value === "initiative" || value.startsWith("scene-") || value.startsWith("initiative-")) {
    return EVENT_CATEGORY_BY_KIND.roster;
  }
  if (value === "undo") return EVENT_CATEGORY_BY_KIND.undo;
  if (value === "note") return EVENT_CATEGORY_BY_KIND.note;
  return EVENT_CATEGORY_BY_KIND.other;
}

function unwrapSnapshot(value) {
  if (value && typeof value === "object" && typeof value.present === "boolean") {
    return value.present ? clone(value.value) : undefined;
  }
  return clone(value);
}

function fieldSnapshot(change, side, field) {
  const aliases = {
    spells: ["spells", `${ID}/spells`],
    concentrations: ["concentrations", `${ID}/concentration`],
  }[field] || [field];
  const containers = [change?.[side], change?.[`${side}Metadata`]];
  for (const container of containers) {
    const alias = aliases.find((candidate) => hasOwn(container, candidate));
    if (alias) {
      const raw = container[alias];
      if (raw && typeof raw === "object" && typeof raw.present === "boolean") {
        return {
          present: raw.present,
          value: raw.present ? clone(raw.value) : undefined,
        };
      }
      return { present: true, value: unwrapSnapshot(raw) };
    }
  }
  return { present: false, value: undefined };
}

function snapshotValue(change, side, field) {
  const snapshot = fieldSnapshot(change, side, field);
  return snapshot.present ? clone(snapshot.value) : undefined;
}

function numberText(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function targetSnapshot(change, names = null) {
  const id = String(change?.id || "");
  const knownName = names?.get(id);
  const name = String(
    change?.name
      || change?.targetName
      || change?.target?.name
      || knownName
      || "Token",
  ).trim() || "Token";
  return {
    id,
    name,
  };
}

function numericOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hpPayload(changes, names = null) {
  const targets = changes
    .filter((change) => (
      fieldSnapshot(change, "before", "hp").present
      || fieldSnapshot(change, "after", "hp").present
      || fieldSnapshot(change, "before", "hpMax").present
      || fieldSnapshot(change, "after", "hpMax").present
    ))
    .map((change) => {
    const beforeHP = numericOrZero(snapshotValue(change, "before", "hp"));
    const afterHP = numericOrZero(snapshotValue(change, "after", "hp"));
    const beforeMax = numericOrZero(snapshotValue(change, "before", "hpMax"));
    const afterMax = numericOrZero(snapshotValue(change, "after", "hpMax"));
    return {
      ...targetSnapshot(change, names),
      before: {
        hp: beforeHP,
        hpMax: beforeMax,
      },
      after: {
        hp: afterHP,
        hpMax: afterMax,
      },
      delta: afterHP - beforeHP,
      hpMaxDelta: afterMax - beforeMax,
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

function mergeHistoryChanges(entry) {
  const sources = [
    ...(Array.isArray(entry?.changes) ? entry.changes : []),
    ...(Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []),
  ];
  for (const sideEffect of Array.isArray(entry?.effectsMutation?.sideEffects) ? entry.effectsMutation.sideEffects : []) {
    if (sideEffect?.type === "item" && sideEffect.id) {
      sources.push({
        id: sideEffect.id,
        name: sideEffect.after?.name || sideEffect.before?.name || "",
        beforePosition: sideEffect.before?.position,
        afterPosition: sideEffect.after?.position,
      });
    }
  }
  const causality = entry?.payload?.causality;
  if (causality?.casterId) {
    sources.push({
      id: causality.casterId,
      name: causality.casterName || "",
    });
  }
  for (const target of Array.isArray(causality?.targets) ? causality.targets : []) {
    if (target?.id) {
      sources.push({
        id: target.id,
        name: target.name || "",
      });
    }
  }
  const byId = new Map();
  const anonymous = [];
  for (const raw of sources) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || "");
    if (!id) {
      anonymous.push(clone(raw));
      continue;
    }
    const previous = byId.get(id);
    if (!previous) {
      byId.set(id, clone(raw));
      continue;
    }
    const merged = {
      ...previous,
      ...clone(raw),
      ...(previous.name || raw.name ? { name: previous.name || raw.name } : {}),
      before: { ...(previous.before || {}), ...(raw.before || {}) },
      after: { ...(previous.after || {}), ...(raw.after || {}) },
      beforeMetadata: { ...(previous.beforeMetadata || {}), ...(raw.beforeMetadata || {}) },
      afterMetadata: { ...(previous.afterMetadata || {}), ...(raw.afterMetadata || {}) },
      fields: { ...(previous.fields || {}), ...(raw.fields || {}) },
      metadataFields: { ...(previous.metadataFields || {}), ...(raw.metadataFields || {}) },
    };
    for (const key of ["beforeMetadata", "afterMetadata", "fields", "metadataFields"]) {
      if (!Object.keys(merged[key] || {}).length) delete merged[key];
    }
    byId.set(id, merged);
  }
  return [...byId.values(), ...anonymous];
}

function historyNameMap(entry, changes) {
  const names = new Map();
  for (const change of [
    ...(Array.isArray(entry?.changes) ? entry.changes : []),
    ...(Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []),
    ...(Array.isArray(changes) ? changes : []),
  ]) {
    const id = String(change?.id || "");
    const name = String(change?.name || change?.targetName || "").trim();
    if (id && name) names.set(id, name);
  }
  return names;
}

function uniqueTargets(changes, names) {
  const targets = [];
  const seen = new Set();
  for (const change of changes) {
    const target = targetSnapshot(change, names);
    const key = target.id || `anonymous:${targets.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return targets;
}

function collectionItems(value, field) {
  const unwrapped = unwrapSnapshot(value);
  if (Array.isArray(unwrapped)) return unwrapped.map(clone);
  if (unwrapped && typeof unwrapped === "object") {
    const nested = unwrapped[field] ?? unwrapped.instances;
    if (Array.isArray(nested)) return nested.map(clone);
  }
  return [];
}

function collectionIdentity(value, field, index) {
  if (value && typeof value === "object") {
    const stable = field === "concentrations"
      ? value.instanceId || value.id || value.key || value.name
      : value.instanceId || value.id || value.spellId || value.name;
    if (stable) return String(stable);
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : `${field}:${index}`;
}

function concentrationItems(value) {
  const unwrapped = unwrapSnapshot(value);
  if (Array.isArray(unwrapped)) return unwrapped.map(clone);
  if (!unwrapped || typeof unwrapped !== "object") return [];
  return Object.entries(unwrapped).map(([key, item]) => ({
    ...(item && typeof item === "object" ? clone(item) : { value: clone(item) }),
    key,
  }));
}

function sameSemanticValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
}

function diffCollection(before, after, field, targetId) {
  const beforeItems = field === "concentrations"
    ? concentrationItems(before)
    : collectionItems(before, field);
  const afterItems = field === "concentrations"
    ? concentrationItems(after)
    : collectionItems(after, field);
  const beforeMap = new Map(beforeItems.map((item, index) => [collectionIdentity(item, field, index), item]));
  const afterMap = new Map(afterItems.map((item, index) => [collectionIdentity(item, field, index), item]));
  const added = [];
  const removed = [];
  const updated = [];
  for (const [id, item] of afterMap) {
    if (!beforeMap.has(id)) added.push(clone(item));
    else if (!sameSemanticValue(beforeMap.get(id), item)) {
      updated.push({ id, targetId, before: clone(beforeMap.get(id)), after: clone(item) });
    }
  }
  for (const [id, item] of beforeMap) {
    if (!afterMap.has(id)) removed.push(clone(item));
  }
  return { added, removed, updated };
}

function collectionFacet(changes, field, names) {
  const targets = [];
  const added = [];
  const removed = [];
  const updated = [];
  for (const change of changes) {
    const before = fieldSnapshot(change, "before", field);
    const after = fieldSnapshot(change, "after", field);
    if (!before.present && !after.present) continue;
    const target = targetSnapshot(change, names);
    const diff = diffCollection(
      before.present ? before.value : [],
      after.present ? after.value : [],
      field,
      target.id,
    );
    if (!diff.added.length && !diff.removed.length && !diff.updated.length) continue;
    targets.push({ ...target, ...diff });
    added.push(...diff.added.map(clone));
    removed.push(...diff.removed.map(clone));
    updated.push(...diff.updated.map(clone));
  }
  if (!targets.length) return null;
  return { added, removed, updated, targets };
}

function buildFacets(changes, names) {
  const facets = {};
  const hp = hpPayload(changes, names);
  if (hp.targets.length) facets.hp = hp;
  for (const field of ["conditions", "spells", "concentrations"]) {
    const facet = collectionFacet(changes, field, names);
    if (facet) facets[field] = facet;
  }
  return Object.keys(facets).length ? facets : undefined;
}

function originalPayload(entry) {
  return hasOwn(entry, "payload") ? clone(entry.payload) : {};
}

export function combatEventFromHistoryEntry(entry, context = {}) {
  const changes = mergeHistoryChanges(entry);
  const names = historyNameMap(entry, changes);
  const kind = String(entry?.kind || "change");
  const facets = buildFacets(changes, names);
  const base = {
    version: 2,
    at: Number.isFinite(Number(entry?.at)) ? Number(entry.at) : Date.now(),
    kind,
    category: combatEventCategory(kind),
    action: "change",
    label: String(entry?.label || "Modifica"),
    source: entry?.source === "manual" ? "manual" : "automatic",
    round: Math.max(1, Number(context?.round ?? entry?.round) || 1),
    turn: context?.turn ? clone(context.turn) : (entry?.turn ? clone(entry.turn) : null),
    historyEntryId: String(entry?.id || entry?.historyEntryId || ""),
    ...(entry?.effectsMutation?.commandId || entry?.commandId || context?.commandId
      ? { commandId: String(entry?.effectsMutation?.commandId || entry?.commandId || context.commandId) }
      : {}),
    ...(entry?.effectsMutation?.correlationId || entry?.correlationId || context?.correlationId
      ? { correlationId: String(entry?.effectsMutation?.correlationId || entry?.correlationId || context.correlationId) }
      : {}),
    targets: uniqueTargets(changes, names),
    payload: originalPayload(entry),
    ...(facets ? { facets } : {}),
  };

  if (combatEventCategory(kind) === "hp") {
    const hp = hpPayload(changes, names);
    return { ...base, action: hp.action, targets: hp.targets };
  }
  if (kind === "move") {
    const targets = changes.map((change) => ({
      ...targetSnapshot(change, names),
      cells: Math.round((Number(change?.movement?.cells) || 0) * 100) / 100,
      from: clone(change?.beforePosition),
      to: clone(change?.afterPosition),
    }));
    return { ...base, action: "move", targets };
  }
  if (combatEventCategory(kind) === "condition") return { ...base, action: kind };
  if (combatEventCategory(kind) === "spell") return { ...base, action: kind };
  if (combatEventCategory(kind) === "save") return { ...base, action: kind };
  if (kind === "class-feature") return { ...base, action: "resource" };
  if (kind === "initiative-card") return { ...base, action: "sheet" };
  if (kind === "undo") return { ...base, action: "undo" };
  if (kind === "note") return { ...base, action: "note" };
  return base;
}

export function normalizeCombatLogEvent(event) {
  const copy = clone(event && typeof event === "object" ? event : {}) || {};
  const kind = String(copy.kind || "change");
  return {
    ...copy,
    version: Number(copy.version) === 2 ? 2 : 1,
    kind,
    category: String(copy.category || combatEventCategory(kind)),
    source: String(copy.source || "automatic"),
    targets: Array.isArray(copy.targets) ? copy.targets : [],
    payload: hasOwn(copy, "payload") ? copy.payload : {},
  };
}

export function combatEventDetail(event) {
  const targets = Array.isArray(event?.targets) ? event.targets : [];
  if (combatEventCategory(event?.kind) === "hp") {
    return targets.map((target) => {
      const before = target?.before || {};
      const after = target?.after || {};
      const delta = Number(target?.delta) || 0;
      const signed = delta > 0 ? `+${numberText(delta)}` : numberText(delta);
      return `${target.name}: ${numberText(before.hp)}/${numberText(before.hpMax)} → ${numberText(after.hp)}/${numberText(after.hpMax)} (${signed})`;
    }).join(" | ");
  }
  if (combatEventCategory(event?.kind) === "movement") {
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
  const normalizedEvents = (Array.isArray(events) ? events : []).map(normalizeCombatLogEvent);
  const movementOrigins = new Map();
  for (const event of normalizedEvents) {
    if (event?.category !== EVENT_CATEGORY_BY_KIND.movement) continue;
    if (event?.action === "move-undo" || event?.payload?.nativeUndo) continue;
    const historyEntryId = String(event?.historyEntryId || "").trim();
    if (!historyEntryId) continue;
    movementOrigins.set(historyEntryId, {
      round: Math.max(1, Number(event.round) || 1),
      turn: clone(event.turn),
      turnId: String(event?.turn?.id || "no-turn"),
    });
  }

  for (const event of normalizedEvents) {
    if (event?.category !== EVENT_CATEGORY_BY_KIND.movement) {
      output.push(event);
      continue;
    }
    const targets = Array.isArray(event.targets) ? event.targets : [];
    for (const target of targets) {
      const undoOfHistoryEntryId = String(target?.undoOfHistoryEntryId || "").trim();
      const origin = undoOfHistoryEntryId
        ? movementOrigins.get(undoOfHistoryEntryId)
        : null;
      const round = origin?.round ?? Math.max(1, Number(event.round) || 1);
      const turnId = origin?.turnId ?? String(event?.turn?.id || "no-turn");
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
        const aggregateContext = origin
          ? { ...event, round: origin.round, turn: clone(origin.turn) }
          : event;
        aggregate = {
          ...aggregateContext,
          id: `movement-total:${key}`,
          category: EVENT_CATEGORY_BY_KIND.movement,
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
      if (
        event?.action === "move-undo"
        || event?.payload?.movementCorrection
        || event?.payload?.nativeUndo
      ) {
        const currentSource = String(event?.payload?.undoSource || "").trim()
          || (event?.payload?.nativeUndo ? "obr-native" : "unknown");
        const existingSources = Array.isArray(aggregate?.payload?.undoSources)
          ? aggregate.payload.undoSources
          : [aggregate?.payload?.undoSource].filter(Boolean);
        const undoSources = Array.from(new Set([...existingSources, currentSource]));
        aggregate.payload = {
          ...(aggregate.payload && typeof aggregate.payload === "object" ? aggregate.payload : {}),
          movementCorrection: true,
          nativeUndo: Boolean(aggregate?.payload?.nativeUndo || event?.payload?.nativeUndo),
          undoSource: undoSources.length === 1 ? undoSources[0] : "mixed",
          undoSources,
        };
      }
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
