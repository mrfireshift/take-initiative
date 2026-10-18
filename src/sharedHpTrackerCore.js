import { ID } from "./constants.js";
import { resolveSharedHpGroup } from "./sharedHpCore.js";
const KEY = `${ID}/meta`;

// Local card updates rebuild the principal without rereading scene structure.
export function refreshSharedHpTrackerChildren(entry, previous) {
  if (!entry || !previous?.sharedHpChildren?.length) return entry;
  return { ...entry, sharedHpMemberCount: previous.sharedHpMemberCount,
    sharedHpTrackerVisibility: previous.sharedHpTrackerVisibility,
    sharedHpChildren: previous.sharedHpChildren.map(child => ({ ...child,
      hp: entry.hp, hpMax: entry.hpMax, attitude: entry.attitude,
    })),
  };
}

export function sharedHpTrackerChildren(items, sourceId) {
  const group = resolveSharedHpGroup(items, sourceId);
  if (group.status || group.sourceId !== sourceId) return [];
  const meta = group.source.metadata?.[KEY] || {};
  return items.filter(item => group.memberIds.includes(item.id) && item.id !== sourceId)
    .map(item => ({ id: item.id, itemId: item.id, casterId: sourceId, instanceId: `shared-hp:${sourceId}`,
      sharedHp: true, label: item.name || item.id, name: item.name || item.id,
      iconUrl: item.image?.url || item.image?.src || item.image?.href || item.src || "/quick-damage.svg",
      attitude: meta.attitude || "ally", hp: meta.hp ?? null, hpMax: meta.hpMax ?? null,
    })).sort((a, b) => a.label.localeCompare(b.label, "it") || a.id.localeCompare(b.id));
}
