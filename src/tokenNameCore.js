// A token's name as the tracker writes it (the double click on the card's name, __setSceneTokenDisplayName in
// initiativeList.js): the item's name and, for an image with a text, the label under the token. Pure, on the draft
// item of an updateItems call (attacchi dei mostri, fase 4, lotto 2: a monster's name from its stat block).
export function setTokenDisplayName(item, nextName) {
  if (!item) return;
  item.name = nextName;
  if (item.type !== "IMAGE" || !item.text || typeof item.text !== "object") return;
  item.text = { ...item.text, plainText: nextName, richText: [{ type: "paragraph", children: [{ text: nextName }] }] };
}

// The name to give a token from a stat block, or "" when there is nothing to change: the block's name, trimmed, at most
// 80 characters, different from the token's.
export function statblockTokenName(blockName, currentName = "") {
  const next = String(blockName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return next && next !== String(currentName ?? "").trim() ? next : "";
}

// Hit points to replace by default: a token without them, or at full health; a wounded one keeps its own (a monster in
// a fight never goes back to full by accident).
export function statblockReplacesHitPoints(meta = {}) {
  const hp = Number(meta?.hp);
  const hpMax = Number(meta?.hpMax);
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return true;
  return hp >= hpMax;
}
