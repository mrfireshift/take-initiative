// Writes the table side of tokens (tableOrientationCore.js): merge-only on the plugin metadata, nothing else changes.
import OBR from "@owlbear-rodeo/sdk";
import { TABLE_SIDE_META_KEY, pluginMetaWithTableSide } from "./tableOrientationCore.js";

export async function writeTableSide(ids, side, { isCurrent = () => true, obr = OBR } = {}) {
  const targetIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id)));
  if (!targetIds.length || !isCurrent()) return false;
  await obr.scene.items.updateItems(targetIds, (items) => {
    for (const item of items) {
      item.metadata[TABLE_SIDE_META_KEY] = pluginMetaWithTableSide(item.metadata, side);
    }
  });
  return true;
}
