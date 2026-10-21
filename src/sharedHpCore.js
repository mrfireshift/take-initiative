import { ID } from "./constants.js";
import { calculateQuickHPChange } from "./quickHpCore.js";

const META_KEY = `${ID}/meta`;
const text = value => typeof value === "string" ? value.trim() : "";
const unique = values => [...new Set(values)].sort();
const metaOf = (item, key) => item?.metadata?.[key] || {};
const conflict = (itemId, reason = "shared-hp-invalid-link") => ({ status: "conflict", conflicts: [{ itemId, reason }] });
const real = item => !!item?.id && item.layer === "CHARACTER" && !item.attachedTo
  && !/^__(?:LAIR|EPIC|PARAGON)__/.test(item.id) && !/::p\d+$/.test(item.id);
const validHP = meta => meta.hp !== null && meta.hp !== undefined && meta.hpMax !== null
  && meta.hpMax !== undefined && Number.isFinite(Number(meta.hp))
  && Number.isFinite(Number(meta.hpMax)) && Number(meta.hpMax) > 0;
const snapshot = (meta, field) => Object.hasOwn(meta, field)
  ? { present: true, value: structuredClone(meta[field]) } : { present: false };
const matches = (meta, field, expected) => !expected || JSON.stringify(snapshot(meta, field)) === JSON.stringify(expected);

export function isSharedHpInitiativeExcluded(item, { metadataKey = META_KEY } = {}) {
  const meta = metaOf(item, metadataKey);
  return !!text(meta.sharedHpSourceId) && meta.sharedHpExcludeFromInitiative === true;
}

export function resolveSharedHpGroup(items, itemId, { metadataKey = META_KEY } = {}) {
  const byId = new Map(items.map(item => [item.id, item]));
  const item = byId.get(itemId);
  if (!real(item)) return conflict(itemId);
  const sourceId = text(metaOf(item, metadataKey).sharedHpSourceId) || itemId;
  const source = byId.get(sourceId);
  if (!source) return conflict(itemId, "shared-hp-broken-link");
  if (!real(source) || text(metaOf(source, metadataKey).sharedHpSourceId)) return conflict(itemId);
  const members = items.filter(candidate => real(candidate)
    && text(metaOf(candidate, metadataKey).sharedHpSourceId) === sourceId);
  return { sourceId, source, memberIds: unique([sourceId, ...members.map(member => member.id)]) };
}

export function sharedHpScopeIds(items, itemIds, options = {}) {
  return unique(itemIds.flatMap(id => {
    const group = resolveSharedHpGroup(items, id, options);
    return group.status ? [id] : group.memberIds;
  }));
}

export function sharedHpHistorySnapshot(plan) {
  if (!plan?.sharedHpGroups?.length) return null;
  const names = new Map((plan.states || []).map(state => [state.id, state.name]));
  return { groups: plan.sharedHpGroups.map(group => ({ ...structuredClone(group),
    sourceName: names.get(group.sourceId) || group.sourceName || group.sourceId,
    targets: group.hitIds.map(id => ({ id, name: names.get(id) || group.targets?.find(target => target.id === id)?.name || id })),
  })) };
}

export function planSharedHpLinks(items, operation, { metadataKey = META_KEY } = {}) {
  const byId = new Map(items.map(item => [item.id, item]));
  if (operation.type === "shared-hp:visibility") {
    const source = byId.get(operation.sourceId);
    const meta = metaOf(source, metadataKey);
    if (!real(source) || text(meta.sharedHpSourceId) || !["gm", "all"].includes(operation.visibility)) return conflict(operation.sourceId);
    return { affectedIds: [source.id], metadataPatches: [{ id: source.id, fields: {
      sharedHpTrackerVisibility: { value: operation.visibility, expected: snapshot(meta, "sharedHpTrackerVisibility") },
      sharedHpSourceId: { mode: "assert", expected: snapshot(meta, "sharedHpSourceId") },
    } }] };
  }
  const targetIds = unique((operation.targetIds || []).filter(Boolean));
  if (!targetIds.length) return conflict(null);
  const patches = [];
  if (operation.type === "shared-hp:unlink") {
    for (const id of targetIds) {
      const item = byId.get(id);
      if (!real(item)) return conflict(id);
      const meta = metaOf(item, metadataKey);
      patches.push({ id, fields: Object.fromEntries(["sharedHpSourceId", "sharedHpExcludeFromInitiative"]
        .map(field => [field, { mode: "delete", expected: snapshot(meta, field) }])) });
    }
    return { metadataPatches: patches, affectedIds: targetIds };
  }
  if (operation.type !== "shared-hp:link") return conflict(null);
  const source = byId.get(operation.sourceId);
  const sourceMeta = metaOf(source, metadataKey);
  if (!real(source) || !validHP(sourceMeta) || text(sourceMeta.sharedHpSourceId)) return conflict(operation.sourceId);
  if (operation.expectedSourceHP && (operation.expectedSourceHP.hp !== sourceMeta.hp
    || operation.expectedSourceHP.hpMax !== sourceMeta.hpMax)) return conflict(source.id, "shared-hp-incompatible-values");
  // Keep source values and topology checked at commit, even if they are unchanged.
  patches.push({ id: source.id, fields: Object.fromEntries(["hp", "hpMax", "sharedHpSourceId", "attitude"]
    .map(field => [field, { mode: "assert", expected: snapshot(sourceMeta, field) }])) });
  for (const id of targetIds) {
    const item = byId.get(id);
    if (!real(item) || id === source.id || items.some(candidate => text(metaOf(candidate, metadataKey).sharedHpSourceId) === id)) {
      return conflict(id);
    }
    const meta = metaOf(item, metadataKey);
    const fields = {};
    for (const [field, value] of Object.entries({ hp: Number(sourceMeta.hp), hpMax: Number(sourceMeta.hpMax),
      sharedHpSourceId: source.id, sharedHpExcludeFromInitiative: true, attitude: sourceMeta.attitude || "ally" })) {
      fields[field] = { value, expected: snapshot(meta, field) };
    }
    fields.inInitiative = { mode: "delete", expected: snapshot(meta, "inInitiative") };
    patches.push({ id, fields });
  }
  return { metadataPatches: patches, affectedIds: unique([source.id, ...targetIds]) };
}

export function planSharedHpFactions(items, { metadataKey = META_KEY } = {}) {
  const patches = new Map();
  for (const item of items) {
    const meta = metaOf(item, metadataKey);
    if (!text(meta.sharedHpSourceId)) continue;
    const group = resolveSharedHpGroup(items, item.id, { metadataKey });
    if (group.status) continue;
    const sourceMeta = metaOf(group.source, metadataKey);
    const attitude = sourceMeta.attitude || "ally";
    if (meta.attitude === attitude) continue;
    patches.set(group.sourceId, { id: group.sourceId, fields: {
      attitude: { mode: "assert", expected: snapshot(sourceMeta, "attitude") },
      sharedHpSourceId: { mode: "assert", expected: snapshot(sourceMeta, "sharedHpSourceId") },
    } });
    patches.set(item.id, { id: item.id, fields: {
      attitude: { value: attitude, expected: snapshot(meta, "attitude") },
      sharedHpSourceId: { mode: "assert", expected: snapshot(meta, "sharedHpSourceId") },
    } });
  }
  return [...patches.values()];
}

export function planSharedHpMutation({ items, operations = [], metadataPatches = [], sharedHp = {}, metadataKey = META_KEY }) {
  sharedHp = sharedHp || {};
  const byId = new Map(items.map(item => [item.id, item]));
  const contributions = [];
  for (const operation of operations) {
    if (operation.type !== "hp:set") continue;
    for (const update of operation.updates || []) {
      const intents = update.hpIntents?.length ? update.hpIntents : [update.hpIntent];
      for (const hpIntent of intents) contributions.push({ ...update, hpIntent, damageEnds: operation.damageEnds });
    }
  }
  for (const patch of metadataPatches) {
    if (!["hp", "hpMax"].some(field => patch.fields?.[field] && patch.fields[field].mode !== "assert")) continue;
    const meta = metaOf(byId.get(patch.id), metadataKey);
    if (["hp", "hpMax"].some(field => patch.fields?.[field]?.mode === "delete")) {
      const resolved = resolveSharedHpGroup(items, patch.id, { metadataKey });
      if (!resolved.status && resolved.memberIds.length > 1) return conflict(patch.id, "shared-hp-incompatible-values");
    }
    const intents = patch.hpIntents?.length ? patch.hpIntents : [patch.hpIntent];
    for (const hpIntent of intents) contributions.push({ itemId: patch.id, hp: patch.fields?.hp?.value ?? meta.hp,
      hpMax: patch.fields?.hpMax?.value ?? meta.hpMax, expectedHP: patch.fields?.hp?.expected,
      expectedHPMax: patch.fields?.hpMax?.expected, hpIntent });
  }
  const bySource = new Map();
  const groupedIds = new Set();
  for (const update of contributions) {
    const item = byId.get(update.itemId);
    const group = resolveSharedHpGroup(items, update.itemId, { metadataKey });
    if (group.status) {
      if (text(metaOf(item, metadataKey).sharedHpSourceId)) return group;
      continue; // Preserve legacy validation for unrelated targets.
    }
    if (group.memberIds.length <= 1) continue;
    if (!validHP(metaOf(group.source, metadataKey))) return conflict(update.itemId, "shared-hp-broken-link");
    if (!bySource.has(group.sourceId)) bySource.set(group.sourceId, { ...group, contributions: [] });
    bySource.get(group.sourceId).contributions.push(update);
    group.memberIds.forEach(id => groupedIds.add(id));
  }
  if (!bySource.size) return { operations, metadataPatches, groups: [], affectedIds: [], hitIds: [] };

  const remainingOperations = operations.map(operation => operation.type === "hp:set"
    ? { ...operation, updates: (operation.updates || []).filter(update => !groupedIds.has(update.itemId)) }
    : operation).filter(operation => operation.type !== "hp:set" || operation.updates.length);
  const patchesById = new Map();
  for (const patch of metadataPatches) {
    const fields = Object.fromEntries(Object.entries(patch.fields || {})
      .filter(([field, descriptor]) => !groupedIds.has(patch.id) || !["hp", "hpMax"].includes(field) || descriptor?.mode === "assert"));
    if (Object.keys(fields).length) patchesById.set(patch.id, { ...patch,
      fields: { ...patchesById.get(patch.id)?.fields, ...fields } });
  }
  const groups = [];
  const allHitIds = new Set();
  for (const group of bySource.values()) {
    const sourceMeta = metaOf(group.source, metadataKey);
    let hp = Number(sourceMeta.hp);
    let hpMax = Number(sourceMeta.hpMax);
    let requestedAmount = 0;
    const events = new Map();
    const absolute = group.contributions.filter(update => !update.hpIntent);
    const relative = group.contributions.filter(update => update.hpIntent);
    if (absolute.length && relative.length) return conflict(group.sourceId, "shared-hp-incompatible-values");
    const damageHitIds = new Set();
    const hitIds = unique(group.contributions.map(update => update.itemId));
    hitIds.forEach(id => allHitIds.add(id));
    for (const update of absolute) {
      const meta = metaOf(byId.get(update.itemId), metadataKey);
      if (!Number.isFinite(update.hp) || !Number.isFinite(update.hpMax)
        || !matches(meta, "hp", update.expectedHP) || !matches(meta, "hpMax", update.expectedHPMax)) {
        return conflict(update.itemId, "shared-hp-incompatible-values");
      }
      if (update.hp !== absolute[0].hp || update.hpMax !== absolute[0].hpMax) return conflict(update.itemId, "shared-hp-incompatible-values");
      if (update.damageEnds !== false && update.hp < hp) damageHitIds.add(update.itemId);
    }
    if (absolute.length) { hp = absolute[0].hp; hpMax = absolute[0].hpMax; }
    for (const update of relative) {
      const intent = update.hpIntent;
      if (!["damage", "heal", "temp"].includes(intent.mode) || !Number.isFinite(intent.amount) || intent.amount < 0
        || !text(intent.eventId)) return conflict(update.itemId, "shared-hp-intent-required");
      if (!events.has(intent.eventId)) events.set(intent.eventId, []);
      events.get(intent.eventId).push(update);
      if (intent.mode === "damage" && intent.amount > 0 && update.damageEnds !== false) damageHitIds.add(update.itemId);
    }
    for (const event of events.values()) {
      const mode = event[0].hpIntent.mode;
      if (event.some(update => update.hpIntent.mode !== mode)) return conflict(group.sourceId, "shared-hp-incompatible-values");
      let amount;
      if (sharedHp.policy === "per-token" && mode === "damage") {
        amount = event.reduce((sum, update) => sum + update.hpIntent.amount, 0);
      } else {
        const distinct = new Set(event.map(update => update.hpIntent.amount));
        const chosen = event.find(update => update.itemId === sharedHp.chosenTargetIds?.[group.sourceId]);
        if (distinct.size > 1 && !chosen) return conflict(group.sourceId, "shared-hp-selection-required");
        amount = chosen ? chosen.hpIntent.amount : event[0].hpIntent.amount;
      }
      requestedAmount += amount;
      hp = calculateQuickHPChange({ mode, value: amount, hp, hpMax }).afterHP;
    }
    for (const id of group.memberIds) {
      const meta = metaOf(byId.get(id), metadataKey);
      const patch = patchesById.get(id) || { id, fields: {} };
      patch.fields.hp = { value: hp, expected: snapshot(meta, "hp") };
      patch.fields.hpMax = { value: hpMax, expected: snapshot(meta, "hpMax") };
      patch.fields.sharedHpSourceId = { mode: "assert", expected: snapshot(meta, "sharedHpSourceId") };
      patchesById.set(id, patch);
    }
    remainingOperations.push({ type: "hp:set", updates: group.memberIds.map(itemId => ({ itemId, hp, hpMax,
      sharedHpMirror: !damageHitIds.has(itemId) })) });
    // damageHitIds: the members that took damage in this command (Rimebound Link reads which manifestation was hit).
    groups.push({ sourceId: group.sourceId, memberIds: group.memberIds, hitIds, damageHitIds: unique([...damageHitIds]),
      beforeHP: Number(sourceMeta.hp), beforeHPMax: Number(sourceMeta.hpMax), afterHP: hp, hpMax, requestedAmount,
      policy: sharedHp.policy === "per-token" ? "per-token" : "once", eventIds: [...events.keys()] });
  }
  return { operations: remainingOperations, metadataPatches: [...patchesById.values()], groups,
    affectedIds: [...groupedIds].sort(), hitIds: [...allHitIds].sort() };
}
