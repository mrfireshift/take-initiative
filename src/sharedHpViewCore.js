import { ID } from "./constants.js";
import { planSharedHpMutation, resolveSharedHpGroup } from "./sharedHpCore.js";
import { quickHPVisualUpdates } from "./quickHpCore.js";
const KEY = `${ID}/meta`;

export function sharedHpTargetItems(items, orderedIds = []) {
  const ordered = new Set(orderedIds);
  const sources = new Set(items.map(item => item.metadata?.[KEY]?.sharedHpSourceId).filter(Boolean));
  return items.filter(item => item.layer === "CHARACTER" && !item.attachedTo && item.metadata?.[KEY]
    && (item.metadata[KEY].inInitiative === true || ordered.has(item.id)
      || !!item.metadata[KEY].sharedHpSourceId || sources.has(item.id)));
}

export function sharedHpIntent(entry, eventId = "shared-hp-preview") {
  return { mode: entry.change.mode, amount: Number(entry.change.requested) || 0, eventId: entry.eventId || eventId };
}

export function buildSharedHpPreview(items, entries, sharedHp = {}) {
  const active = entries.filter(entry => entry.change);
  const choices = new Map(); let multiTarget = false;
  for (const entry of active) {
    const group = resolveSharedHpGroup(items, entry.item.id);
    if (group.status || group.memberIds.length < 2) continue;
    if (!choices.has(group.sourceId)) choices.set(group.sourceId, { sourceId: group.sourceId,
      name: group.source.name || group.sourceId, options: [] });
    choices.get(group.sourceId).options.push({ targetId: entry.item.id, name: entry.item.name || entry.item.id,
      amount: Number(entry.change.requested) || 0 });
  }
  const choiceGroups = [...choices.values()].filter(group => {
    if (group.options.length > 1) multiTarget = true;
    return sharedHp.policy !== "per-token" && new Set(group.options.map(option => option.amount)).size > 1;
  });
  const result = planSharedHpMutation({ items, sharedHp, operations: [{ type: "hp:set", updates: active.map(entry => ({
    itemId: entry.item.id, hp: entry.change.afterHP, hpMax: entry.change.hpMax, hpIntent: sharedHpIntent(entry),
  })) }] });
  if (result.status) return { groups: [], updates: [], choiceGroups, multiTarget, conflicts: result.conflicts };
  const updates = new Map(quickHPVisualUpdates(active).map(update => [update.tokenId, update]));
  for (const group of result.groups) for (const tokenId of group.memberIds) {
    updates.set(tokenId, { tokenId, hp: group.afterHP, hpMax: group.hpMax });
  }
  return { groups: result.groups, updates: [...updates.values()].sort((a, b) => a.tokenId.localeCompare(b.tokenId)),
    choiceGroups, multiTarget, conflicts: [] };
}

export function sharedHpCommittedUpdates(result, entries = []) {
  const updates = new Map(quickHPVisualUpdates(entries).map(update => [update.tokenId, update]));
  for (const group of result?.plan?.sharedHpGroups || []) for (const tokenId of group.memberIds) {
    updates.set(tokenId, { tokenId, hp: group.afterHP, hpMax: group.hpMax });
  }
  // Partial/final commit snapshots take precedence over the optimistic plan.
  for (const change of result?.changes || result?.commitResult?.changes || []) {
    if (change.afterMetadata?.hp?.present && change.afterMetadata?.hpMax?.present) updates.set(change.id, {
      tokenId: change.id, hp: change.afterMetadata.hp.value, hpMax: change.afterMetadata.hpMax.value,
    });
  }
  return [...updates.values()].sort((a, b) => a.tokenId.localeCompare(b.tokenId));
}
