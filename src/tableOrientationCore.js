// Table screen orientation: the screen lies flat on the table and turns toward the player whose creature is active.
// Owlbear's viewport cannot rotate, so the plugin only tells the table browser which way to face: a userscript there
// (public/table-rotation.user.js) rotates the whole Owlbear page. Read-only on the initiative state.
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

// Token field (inside the plugin metadata) with the side of the table the creature's player sits on.
export const TABLE_SIDE_FIELD = "tableSide";

// postMessage namespace shared with the userscript: it sends "hello", the background answers "orientation".
export const TABLE_ORIENTATION_NAMESPACE = `${ID}/table-orientation`;
export const TABLE_ORIENTATION_PROTOCOL_VERSION = 1;

// Side of the screen the player sits at -> clockwise CSS rotation that turns the page's bottom edge toward them.
export const TABLE_SIDES = Object.freeze([
  Object.freeze({ id: "south", label: "Sud", hint: "bordo in basso", degrees: 0 }),
  Object.freeze({ id: "west", label: "Ovest", hint: "bordo sinistro", degrees: 90 }),
  Object.freeze({ id: "north", label: "Nord", hint: "bordo in alto", degrees: 180 }),
  Object.freeze({ id: "east", label: "Est", hint: "bordo destro", degrees: 270 }),
]);

const SIDES_BY_ID = new Map(TABLE_SIDES.map((side) => [side.id, side]));

export function normalizeTableSide(value) {
  const side = String(value || "").trim().toLowerCase();
  return SIDES_BY_ID.has(side) ? side : null;
}

export function tableSideDegrees(value) {
  const side = normalizeTableSide(value);
  return side ? SIDES_BY_ID.get(side).degrees : null;
}

export function tableSideOfItem(item) {
  return normalizeTableSide(item?.metadata?.[META_KEY]?.[TABLE_SIDE_FIELD]);
}

// The order may hold virtual Lair, Paragon and Epic IDs: they are not scene items, so they have no side.
export function activeInitiativeId(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return null;
  const current = Math.floor(Number(state?.current) || 0);
  const id = order[current];
  return typeof id === "string" && id ? id : null;
}

// side/degrees are null when the active creature has no side (monsters, virtual entries) or when no combat is running:
// the userscript then faces its own default.
export function tableOrientationFor({ state = null, activeItem = null } = {}) {
  const activeId = activeInitiativeId(state);
  const side = activeId && activeItem?.id === activeId ? tableSideOfItem(activeItem) : null;
  return {
    activeId,
    side,
    degrees: side ? tableSideDegrees(side) : null,
  };
}

export function sameTableOrientation(left, right) {
  return !!left && !!right
    && left.activeId === right.activeId
    && left.side === right.side
    && left.degrees === right.degrees;
}

export function isTableOrientationHello(data) {
  return !!data
    && typeof data === "object"
    && data.ns === TABLE_ORIENTATION_NAMESPACE
    && data.type === "hello";
}

export function tableOrientationMessage(orientation, { nonce = null } = {}) {
  return {
    ns: TABLE_ORIENTATION_NAMESPACE,
    v: TABLE_ORIENTATION_PROTOCOL_VERSION,
    type: "orientation",
    nonce: typeof nonce === "string" ? nonce : null,
    side: orientation?.side ?? null,
    degrees: Number.isFinite(orientation?.degrees) ? orientation.degrees : null,
  };
}

// The plugin metadata of a token with its side set (null clears it); every other field is kept.
export function pluginMetaWithTableSide(metadata, side) {
  const meta = metadata?.[META_KEY] && typeof metadata[META_KEY] === "object" ? metadata[META_KEY] : {};
  const next = { ...meta };
  const normalized = normalizeTableSide(side);
  if (normalized) next[TABLE_SIDE_FIELD] = normalized;
  else delete next[TABLE_SIDE_FIELD];
  return next;
}

export { META_KEY as TABLE_SIDE_META_KEY };
