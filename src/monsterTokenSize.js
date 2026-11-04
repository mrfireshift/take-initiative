// A monster's size on the map, written after the sheet's Salva on its token and its namesakes. Scale and position go
// together, one write for all of them; nothing else on the item changes. A token moved to fit the grid is relocated, not
// walked: the speed check charges nothing for it. Outside the History, as the token's name and portrait.
import OBR from "@owlbear-rodeo/sdk";
import { suppressMovementHistory } from "./history.js";
import { planMonsterTokenSize, setTokenCells, tokenCentreSnap } from "./tokenSizeCore.js";

function samePoint(left, right) {
  return Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y);
}

// Returns how many tokens were resized.
export async function applyMonsterTokenSize({ sourceId, cells, isCurrent = () => true } = {}) {
  const items = await OBR.scene.items.getItems();
  if (!isCurrent()) return 0;
  const { targetIds } = planMonsterTokenSize({ items, sourceId, cells });
  if (!targetIds.length) return 0;
  const { useCorners, useCenter } = tokenCentreSnap(cells);
  const positions = new Map();
  for (const id of targetIds) {
    const { position } = items.find((item) => item.id === id);
    const snapped = await OBR.scene.grid.snapPosition(position, 1, useCorners, useCenter).catch(() => null);
    if (Number.isFinite(snapped?.x) && Number.isFinite(snapped?.y) && !samePoint(snapped, position)) positions.set(id, snapped);
  }
  if (!isCurrent()) return 0;
  for (const [id, position] of positions) suppressMovementHistory(id, position, 5000, { relocation: true });
  let written = 0;
  await OBR.scene.items.updateItems(targetIds, (drafts) => {
    for (const draft of drafts) {
      if (!setTokenCells(draft, cells)) continue;
      written += 1;
      const position = positions.get(draft.id);
      if (position) draft.position = { x: position.x, y: position.y };
    }
  });
  return written;
}
