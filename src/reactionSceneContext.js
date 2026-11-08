// Avvisi di reazione, lots R2 and R3a: what the reaction candidates read of the scene. The distance in meters between
// two creatures, as Counterspell's popup measures it (a spell's range is a circle, distance3d.js): for the spell panel
// with the items and the initiative state, read when the GM presses Lancia; for the consoles the distance alone, read
// once (the grid), so that a reaction on an ally within a few meters can be offered.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { measureItems } from "./distance3d.js";

const STATE_KEY = `${ID}/state`;
const settled = (read, fallback) => Promise.resolve().then(read).catch(() => fallback);

// A scene in feet counts 1.5 m a square of 5 ft, as the plugin does everywhere (60 ft = 18 m).
export function sceneUnitToMeters(unit) {
  return /^(ft|feet|foot|piedi|piede)\.?$/iu.test(String(unit || "").trim()) ? 0.3 : 1;
}

// (a, b) => meters, or null when it cannot be measured. squares (lot R5): a melee reach, counted in squares like the
// ruler; otherwise a range is a circle.
export function reactionDistanceFunction({ dpi = 1, scale = null, squares = false } = {}) {
  const context = { dpi: Math.max(1, Number(dpi) || 1), multiplier: Math.max(0, Number(scale?.parsed?.multiplier) || 1), spellRange: squares !== true };
  const toMeters = sceneUnitToMeters(scale?.parsed?.unit);
  return (a, b) => {
    try {
      const measured = Number(measureItems(a, b, context)?.spatial);
      return Number.isFinite(measured) ? Math.round(measured * toMeters * 10) / 10 : null;
    } catch {
      return null;
    }
  };
}

export async function loadReactionSceneGrid(obr = OBR, { squares = false } = {}) {
  const [dpi, scale] = await Promise.all([
    settled(() => obr.scene.grid.getDpi(), 1),
    settled(() => obr.scene.grid.getScale(), { parsed: { multiplier: 1, unit: "" } }),
  ]);
  return reactionDistanceFunction({ dpi, scale, squares });
}

export async function loadReactionSceneContext(obr = OBR) {
  const [items, metadata, distance] = await Promise.all([
    settled(() => obr.scene.items.getItems(), []),
    settled(() => obr.scene.getMetadata(), {}),
    loadReactionSceneGrid(obr),
  ]);
  return { items: Array.isArray(items) ? items : [], state: metadata?.[STATE_KEY] || null, distance };
}

// Avvisi di reazione, lot R4 (decisions G1-G5): the reactions of the creatures that are not characters (monsters and
// the GM's allies, G5), read from the full stat blocks kept in the GM's browser, for the creatures in the initiative
// order: { item id: [reactions] } (monsterReactionParseCore.js). Nothing is read with the "Mostri" switch off (the
// default): the stat block code is only loaded when it is on. A stat block read once is kept by the loader.
let monsterStatblockLoader = null;
async function reactionNpcsEnabled() {
  const { createReactionPromptOption } = await import("./reactionPromptOption.js");
  const option = createReactionPromptOption();
  let options = null;
  try {
    const stop = await option.subscribe((value) => { options = value; });
    if (typeof stop === "function") stop();
  } finally {
    try { option.stop(); } catch {}
  }
  return options?.enabled === true && options?.actors?.npcs === true;
}
export async function loadMonsterReactions(obr = OBR, { npcs = null } = {}) {
  const enabled = npcs === null ? await settled(reactionNpcsEnabled, false) : npcs === true;
  if (!enabled) return {};
  const [items, metadata] = await Promise.all([settled(() => obr.scene.items.getItems(), []), settled(() => obr.scene.getMetadata(), {})]);
  const order = new Set((Array.isArray(metadata?.[STATE_KEY]?.order) ? metadata[STATE_KEY].order : []).map((id) => String(id || "").replace(/::p\d+$/u, "")));
  if (!order.size) return {};
  const [{ createMonsterStatblockTextLoader }, { monsterStatblockTextRef }, { MONSTER_PROFILE_FIELD }, { monsterReactionsFromView }] = await Promise.all([
    import("./monsterStatblockTextLoader.js"), import("./monsterStatblockTextCore.js"), import("./monsterProfileCore.js"),
    import("./monsterReactionParseCore.js")]);
  monsterStatblockLoader ||= createMonsterStatblockTextLoader();
  const META_KEY = `${ID}/meta`;
  const result = {};
  await Promise.all((Array.isArray(items) ? items : []).filter((item) => item?.id && order.has(item.id)).map(async (item) => {
    const meta = item.metadata?.[META_KEY] || {};
    const card = meta.initiativeCard || {};
    const ref = monsterStatblockTextRef({ isGM: true, attitude: meta.attitude, card });
    if (!ref) return;
    const view = await monsterStatblockLoader.view(ref, { fromArchive: card[MONSTER_PROFILE_FIELD]?.source === "5etools",
      revision: JSON.stringify(card[MONSTER_PROFILE_FIELD] || null) }).catch(() => null);
    const reactions = monsterReactionsFromView(view);
    if (reactions.length) result[item.id] = reactions;
  }));
  return result;
}
