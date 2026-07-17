export const INITIATIVE_GROUP_SEPARATOR = "::";

export function _parseIndexedName(name) {
  const raw = String(name || "Unnamed").trim();
  const first = raw.match(/^\((\d+)\)/);
  const index = first ? parseInt(first[1], 10) : null;
  const base = raw.replace(/^(\(\d+\)\s*)+/, "").trim();
  return { index, base };
}

export function _indexName(base, n) {
  return `(${n}) ${base}`;
}

export function expandParagonEntries(entries, state) {
  const out = [];
  const paragonInits = state?.paragonInits || {};
  for (const entry of entries) {
    const count = Math.max(0, Math.floor(Number(entry.paragonActions) || 0));
    if (count <= 1) {
      out.push(entry);
      continue;
    }

    for (let index = 0; index < count; index++) {
      const clone = { ...entry };
      if (index > 0) clone.id = `${entry.id}::p${index}`;

      const initiatives = Array.isArray(paragonInits[entry.id]) ? paragonInits[entry.id] : [];
      clone.initiative = Number.isFinite(initiatives[index])
        ? Math.floor(initiatives[index])
        : entry.initiative;
      clone.__paragonIndex = index;
      clone.__paragonBaseId = entry.id;
      out.push(clone);
    }
  }
  return out;
}

export function __groupKey(entry) {
  if (entry.isEpicAction) {
    return `EPICACTION${INITIATIVE_GROUP_SEPARATOR}${entry.id}`;
  }
  if (entry.__paragonIndex !== undefined) {
    return `PARAGON${INITIATIVE_GROUP_SEPARATOR}${entry.id}`;
  }
  const { base } = _parseIndexedName(entry.name);
  return `${entry.attitude || "ally"}${INITIATIVE_GROUP_SEPARATOR}${base}`;
}

export function __buildGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = __groupKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

export function __autoCollapseSnapshot(entries, state) {
  if (!state) return { collapsed: {}, changed: false };
  const groups = __buildGroups(entries);
  const activeId = Array.isArray(state.order) ? state.order[state.current] : null;
  const collapsed = { ...(state.collapsed || {}) };
  let changed = false;

  for (const key of Object.keys(collapsed)) {
    if (!groups.has(key)) {
      delete collapsed[key];
      changed = true;
    }
  }

  for (const [key, members] of groups) {
    if (members.length > 1 && collapsed[key] === undefined) {
      collapsed[key] = true;
      changed = true;
    }
  }

  if (activeId) {
    for (const [key, members] of groups) {
      if (members.length <= 1) continue;
      const containsActive = members.some((member) => member.id === activeId);
      const wantCollapsed = !containsActive;
      if (!!collapsed[key] !== wantCollapsed) {
        collapsed[key] = wantCollapsed;
        changed = true;
      }
    }
  }

  return { collapsed, changed };
}

export function compactEntriesForRender(entries, state) {
  const collapsed = state?.collapsed || {};
  const groups = __buildGroups(entries);
  const emitted = new Set();
  const output = [];

  for (const entry of entries) {
    const key = __groupKey(entry);
    const members = groups.get(key) || [entry];
    if (members.length > 1 && collapsed[key]) {
      if (emitted.has(key)) continue;
      output.push({
        ...members[0],
        __groupKey: key,
        __groupMembers: members.slice(),
        __groupCollapsed: true,
        __groupBase: _parseIndexedName(entry.name).base,
        __groupCount: members.length,
      });
      emitted.add(key);
    } else {
      output.push(entry);
    }
  }
  return output;
}

export function sortByInitiative(entries, state, {
  lairInitiative = 20,
  lairId = "__LAIR__",
} = {}) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const positions = new Map(order.map((id, index) => [id, index]));

  return [...entries].sort((left, right) => {
    const leftInitiative = Number(left.initiative) || 0;
    const rightInitiative = Number(right.initiative) || 0;
    if (rightInitiative !== leftInitiative) return rightInitiative - leftInitiative;

    if (leftInitiative === lairInitiative) {
      const leftEpic = !!left.isEpic;
      const rightEpic = !!right.isEpic;
      if (leftEpic !== rightEpic) return leftEpic ? -1 : 1;

      const leftLair = left.id === lairId;
      const rightLair = right.id === lairId;
      if (leftLair !== rightLair) return leftLair ? 1 : -1;
    }

    const leftPosition = positions.has(left.id)
      ? positions.get(left.id)
      : Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.has(right.id)
      ? positions.get(right.id)
      : Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export function sanitizeState(state, byId) {
  const seen = new Set();
  const cleanOrder = [];

  for (const id of state?.order ?? []) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    cleanOrder.push(id);
  }

  if (cleanOrder.length === 0) {
    return {
      order: [],
      current: 0,
      round: 1,
      seededGroups: {},
      collapsed: {},
      paragonInits: {},
    };
  }

  const activeId = state?.order?.[state.current];
  let current = 0;
  if (activeId && byId.has(activeId)) {
    const index = cleanOrder.indexOf(activeId);
    current = index >= 0 ? index : 0;
  } else {
    current = Math.min(state?.current ?? 0, cleanOrder.length - 1);
  }

  const round = Math.max(1, state?.round || 1);
  const seededGroups = state?.seededGroups || {};
  const collapsed = state && typeof state.collapsed === "object" && state.collapsed
    ? state.collapsed
    : {};
  const paragonInits = state && typeof state.paragonInits === "object" && state.paragonInits
    ? state.paragonInits
    : {};
  const ui = state && typeof state.ui === "object" && state.ui ? state.ui : {};

  return { order: cleanOrder, current, round, seededGroups, collapsed, paragonInits, ui };
}

function tieBlock(state, entries, initiative) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const order = Array.isArray(state?.order) ? state.order.slice() : [];
  const indices = order
    .map((id, index) => ((Number(byId.get(id)?.initiative) || 0) === initiative ? index : -1))
    .filter((index) => index >= 0);
  if (!indices.length) return null;
  const start = Math.min(...indices);
  const end = Math.max(...indices);
  return { byId, order, start, end, ids: order.slice(start, end + 1) };
}

function reorderedStateSlice(state, block, tieIds) {
  const order = block.order
    .slice(0, block.start)
    .concat(tieIds, block.order.slice(block.end + 1));
  const activeId = state?.order?.[state.current];
  return { order, current: Math.max(0, order.indexOf(activeId)) };
}

export function reorderWithinSameInitiativeState(
  state,
  entries,
  sourceId,
  targetId,
  placeBefore,
  { lairInitiative = 20 } = {},
) {
  if (!sourceId || !targetId || sourceId === targetId) return null;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return null;

  const initiative = Number(source.initiative) || 0;
  const isLairInitiative = initiative === lairInitiative;
  if (isLairInitiative && source.isEpic) return null;
  if ((Number(target.initiative) || 0) !== initiative) return null;

  const block = tieBlock(state, entries, initiative);
  if (!block?.order.length) return null;
  const tieIds = block.ids.slice();
  const pinnedCount = isLairInitiative
    ? tieIds.filter((id) => !!byId.get(id)?.isEpic).length
    : 0;
  const sourceIndex = tieIds.indexOf(sourceId);
  const targetIndex = tieIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return null;

  const movingId = tieIds.splice(sourceIndex, 1)[0];
  let insertAt = placeBefore ? targetIndex : targetIndex + 1;
  if (targetIndex > sourceIndex) insertAt -= 1;
  if (isLairInitiative && insertAt < pinnedCount) insertAt = pinnedCount;
  tieIds.splice(insertAt, 0, movingId);
  return reorderedStateSlice(state, block, tieIds);
}

export function reorderBlockWithinSameInitiativeState(
  state,
  entries,
  sourceIds,
  targetId,
  placeBefore,
  { lairInitiative = 20 } = {},
) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetId) return null;
  const uniqueSourceIds = [...new Set(sourceIds)];
  if (uniqueSourceIds.includes(targetId)) return null;

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const target = byId.get(targetId);
  const sources = uniqueSourceIds.map((id) => byId.get(id)).filter(Boolean);
  if (!target || sources.length !== uniqueSourceIds.length) return null;

  const initiative = Number(target.initiative) || 0;
  const isLairInitiative = initiative === lairInitiative;
  if (sources.some((entry) => (Number(entry.initiative) || 0) !== initiative)) return null;

  const block = tieBlock(state, entries, initiative);
  if (!block?.order.length) return null;
  const pinnedCount = isLairInitiative
    ? block.ids.filter((id) => !!byId.get(id)?.isEpic).length
    : 0;
  const sourceSet = new Set(uniqueSourceIds);
  const moving = block.ids.filter((id) => sourceSet.has(id));
  if (!moving.length) return null;
  if (isLairInitiative && moving.some((id) => !!byId.get(id)?.isEpic)) return null;

  const filtered = block.ids.filter((id) => !sourceSet.has(id));
  const targetIndex = filtered.indexOf(targetId);
  if (targetIndex < 0) return null;
  let insertAt = placeBefore ? targetIndex : targetIndex + 1;
  if (isLairInitiative && insertAt < pinnedCount) insertAt = pinnedCount;
  filtered.splice(insertAt, 0, ...moving);
  return reorderedStateSlice(state, block, filtered);
}
