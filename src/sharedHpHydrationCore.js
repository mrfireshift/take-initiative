import { ID } from "./constants.js";
import { resolveSharedHpGroup } from "./sharedHpCore.js";
const KEY = `${ID}/meta`;
const meta = item => item?.metadata?.[KEY] || {};
const field = (value, key) => Object.hasOwn(value, key) ? { present: true, value: structuredClone(value[key]) } : { present: false };
export const sharedHpFieldsSnapshot = item => ({ hp: field(meta(item), "hp"), hpMax: field(meta(item), "hpMax") });
const valid = value => value.hp !== null && value.hp !== undefined && Number.isFinite(Number(value.hp)) && Number(value.hpMax) > 0;

// Hydration only: secondary actor records never override the principal's pool.
export function sharedHpHydrationTargets(items, candidates = []) {
  const original = new Map(candidates.map(update => [update.id, update]));
  const updates = new Map(candidates.map(update => [update.id, { ...update }]));
  const byId = new Map(items.map(item => [item.id, item]));
  const handled = new Set();
  for (const item of items) {
    if (!meta(item).sharedHpSourceId) continue;
    const group = resolveSharedHpGroup(items, item.id);
    if (group.status) { updates.delete(item.id); continue; }
    if (handled.has(group.sourceId)) continue;
    handled.add(group.sourceId);
    const restore = updates.get(group.sourceId);
    const source = meta(group.source);
    const values = restore && !restore.absent && valid(restore) ? restore : source;
    const needed = group.memberIds.some(id => updates.has(id)
      || meta(byId.get(id)).hp !== Number(values.hp) || meta(byId.get(id)).hpMax !== Number(values.hpMax));
    for (const id of group.memberIds) updates.delete(id);
    if (!valid(values) || !needed) continue;
    for (const id of group.memberIds) {
      const member = byId.get(id);
      updates.set(id, { ...original.get(id), id, absent: false, actorProfileId: meta(member).actorProfileId,
        hp: Number(values.hp), hpMax: Number(values.hpMax), expectedFields: sharedHpFieldsSnapshot(member),
        sharedHpGuard: { sourceId: group.sourceId, expected: sharedHpFieldsSnapshot(group.source),
          memberSourceId: meta(member).sharedHpSourceId || "" } });
    }
  }
  return [...updates.values()];
}

export function canApplySharedHpHydration(update, itemsById) {
  if (!update.sharedHpGuard) return true;
  const guard = update.sharedHpGuard;
  const source = itemsById.get(guard.sourceId);
  const member = itemsById.get(update.id);
  return !!source && !!member && !meta(source).sharedHpSourceId
    && (meta(member).sharedHpSourceId || "") === guard.memberSourceId
    && JSON.stringify(sharedHpFieldsSnapshot(source)) === JSON.stringify(guard.expected);
}
