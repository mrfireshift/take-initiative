import OBR from "@owlbear-rodeo/sdk";

// Lot L16: a token the GM keeps hidden never shows up on the players' screens, and neither does an animation that
// starts from it or reaches it. Such a broadcast stays on this client (the GM's): "LOCAL" instead of "ALL".
export async function broadcastDestinationForTokens(ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!wanted.length) return "ALL";
  try {
    const items = await OBR.scene.items.getItems(wanted);
    return items.some((item) => item?.visible === false) ? "LOCAL" : "ALL";
  } catch {
    return "ALL";
  }
}
