// Combat snapshot: a read-only photograph of the tracker state for the log and for simulations.
// Pure data: no SDK, no DOM, no metadata writes. The caller passes scene state, items and grid.
import { ID } from "./constants.js";
import { sharedHpScopeIds } from "./sharedHpCore.js";
import { damageDefensesForItem, hasDamageDefenses } from "./damageDefensesCore.js";
import { spellExpiryDescription } from "./spellExpiryCore.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY, spellBoardTokenView } from "./spellBoardTokenCore.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import { CUSTOM_AURA_META_KEY } from "./customAuraCore.js";
import { CLASS_FEATURE_AURA_META_KEY } from "./classFeatureAuraCore.js";
import {
  CLASS_FEATURE_STATE_FIELD,
  activeClassFeatureInstances,
  classFeatureRemainingRounds,
  normalizeClassFeatureState,
} from "./classFeatureCore.js";

export const COMBAT_SNAPSHOT_FORMAT = "take-initiative-combat-snapshot";
export const COMBAT_SNAPSHOT_VERSION = 1;
export const COMBAT_SNAPSHOT_LOG_KIND = "combat-snapshot";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const LAIR_ID = "__LAIR__";
const EPIC_PREFIX = "__EPIC__";
const DEFAULT_DPI = 150;

export const COMBAT_SNAPSHOT_FACTION_LABELS = Object.freeze({
  pc: "PG",
  ally: "Alleato",
  neutral: "Neutrale",
  enemy: "Nemico",
});

const FACTION_COLORS = Object.freeze({
  pc: "#3b82f6",
  ally: "#22c55e",
  neutral: "#eab308",
  enemy: "#ef4444",
});

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const round2 = (value) => Math.round(Number(value) * 100) / 100;
const point = (value) => {
  const x = finiteOrNull(value?.x);
  const y = finiteOrNull(value?.y);
  return x === null || y === null ? null : { x: round2(x), y: round2(y) };
};
const ids = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map((value) => text(value, 220)).filter(Boolean),
));

function virtualOrderName(id) {
  if (id === LAIR_ID) return "Azioni di Tana";
  if (id.startsWith(EPIC_PREFIX)) return "Azione Epica";
  return null;
}

function realOrderId(id) {
  const index = id.indexOf("::p");
  return index >= 0 ? id.slice(0, index) : id;
}

function metaOf(item) {
  const meta = item?.metadata?.[META_KEY];
  return meta && typeof meta === "object" ? meta : {};
}

// Footprint in grid cells, from the image size, its own dpi and the item scale.
export function combatSnapshotItemSizeCells(item, sceneDpi = DEFAULT_DPI) {
  const width = Number(item?.image?.width);
  const imageDpi = Number(item?.grid?.dpi);
  const scale = Math.abs(Number(item?.scale?.x)) || 1;
  if (width > 0 && imageDpi > 0) return round2(Math.max(0.25, (width / imageDpi) * scale));
  const plain = Number(item?.width);
  return plain > 0 ? round2(Math.max(0.25, (plain / (Number(sceneDpi) || DEFAULT_DPI)) * scale)) : 1;
}

function conditionRemainingText(expiry = {}) {
  const remaining = Math.max(1, Math.floor(Number(expiry.remaining) || 1));
  const actor = text(expiry.actorName) || (expiry.actor === "source" ? "fonte" : "bersaglio");
  if (expiry.mode === "rounds") return `${remaining} round`;
  if (expiry.mode === "turn-start") return `inizio turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  if (expiry.mode === "turn-end") return `fine turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  if (expiry.mode === "concentration") return "concentrazione";
  return "manuale";
}

function conditionInstances(meta) {
  const value = meta.conditions;
  const list = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return list
    .filter((instance) => instance && typeof instance === "object" && instance.active !== false)
    .map((instance) => {
      const name = text(instance.condition || instance.name);
      const expiry = instance.expiry && typeof instance.expiry === "object"
        ? { ...instance.expiry }
        : { mode: "manual" };
      return {
        id: text(instance.id, 220) || null,
        name: name || null,
        label: text(instance.displayLabel) || name || null,
        kind: text(instance.effectKind) || "condition",
        ...(instance.level ? { level: finiteOrNull(instance.level) } : {}),
        source: text(instance.sourceName) || null,
        sourceId: text(instance.sourceId, 220) || null,
        expiry,
        remainingText: conditionRemainingText(expiry),
      };
    })
    .filter((instance) => instance.name || instance.label);
}

function concentrationEntries(meta) {
  const value = meta[CONCENTRATION_KEY];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([, entry]) => entry && typeof entry === "object")
    .map(([key, entry]) => ({
      spell: text(entry.name) || key,
      spellId: text(entry.spellId) || null,
      instanceId: text(entry.instanceId, 220) || null,
      targetIds: ids(entry.targets),
    }));
}

function classFeatureSummary(meta, round, featureLookup, poolLookup) {
  const state = normalizeClassFeatureState(meta[CLASS_FEATURE_STATE_FIELD]);
  const active = activeClassFeatureInstances(state, round).map((instance) => {
    const feature = featureLookup(instance.featureId);
    return {
      instanceId: instance.instanceId,
      featureId: instance.featureId,
      name: text(feature?.name) || instance.featureId,
      ...(instance.choiceId ? { choiceId: instance.choiceId } : {}),
      targetIds: instance.targetIds,
      startedRound: instance.startedRound,
      remainingRounds: classFeatureRemainingRounds(instance, round),
    };
  });
  // Stored values: a formula maximum the card cannot resolve stays as the tracker last saved it.
  const resources = Object.entries(state.resources).map(([poolId, entry]) => ({
    poolId,
    name: text(poolLookup(poolId)?.name) || poolId,
    current: entry.unlimited ? null : finiteOrNull(entry.current),
    maximum: entry.unlimited ? null : finiteOrNull(entry.maximum),
    unlimited: entry.unlimited === true,
  }));
  return { active, resources };
}

function backgroundOf(item) {
  const url = text(item?.image?.url, 4000);
  const width = Number(item?.image?.width);
  const height = Number(item?.image?.height);
  const imageDpi = Number(item?.grid?.dpi);
  const position = point(item?.position);
  if (!url || !(width > 0) || !(height > 0) || !(imageDpi > 0) || !position) return null;
  return {
    id: text(item.id, 220),
    name: text(item.name) || null,
    url,
    width,
    height,
    imageDpi,
    offset: point(item?.grid?.offset) || { x: 0, y: 0 },
    position,
    scale: { x: Number(item?.scale?.x) || 1, y: Number(item?.scale?.y) || 1 },
    rotation: Number(item?.rotation) || 0,
  };
}

/**
 * @param {object} input
 * @param {object} input.state scene tracker state (`${ID}/state`)
 * @param {object[]} input.items every scene item
 * @param {{dpi:number, scale?:object, type?:string}} [input.grid]
 */
export function buildCombatSnapshot({
  state = {},
  items = [],
  grid = {},
  capturedAt = Date.now(),
  roomId = "",
  featureLookup = () => null,
  poolLookup = () => null,
} = {}) {
  const list = (Array.isArray(items) ? items : []).filter((item) => text(item?.id, 220));
  const byId = new Map(list.map((item) => [text(item.id, 220), item]));
  const nameOf = (id) => text(byId.get(text(id, 220))?.name) || null;
  const dpi = Number(grid?.dpi) > 0 ? Number(grid.dpi) : DEFAULT_DPI;
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  const orderIds = (Array.isArray(state?.order) ? state.order : [])
    .map((id) => text(id, 220))
    .filter(Boolean);
  const currentIndex = Number.isInteger(Number(state?.current)) ? Number(state.current) : null;
  const activeId = currentIndex === null ? null : orderIds[currentIndex] || null;

  const order = orderIds.map((id) => {
    const virtualName = virtualOrderName(id);
    const item = virtualName ? null : byId.get(realOrderId(id));
    return {
      id,
      name: virtualName || text(item?.name) || null,
      virtual: !!virtualName,
      initiative: virtualName ? null : finiteOrNull(metaOf(item).initiative),
      ...(!virtualName && !item ? { missing: true } : {}),
    };
  });

  const initiativeActorIds = ids(orderIds.filter((id) => !virtualOrderName(id)).map(realOrderId));
  const actorIds = ids([...initiativeActorIds, ...sharedHpScopeIds(list, initiativeActorIds)]);
  const actors = actorIds.map((id) => {
    const item = byId.get(id);
    if (!item) return { id, missing: true };
    const meta = metaOf(item);
    const attitude = text(meta.attitude) || null;
    const defenses = damageDefensesForItem(item, META_KEY);
    return {
      id,
      name: text(item.name) || null,
      attitude,
      faction: COMBAT_SNAPSHOT_FACTION_LABELS[attitude] || null,
      hp: finiteOrNull(meta.hp),
      hpMax: finiteOrNull(meta.hpMax),
      initiative: finiteOrNull(meta.initiative),
      ...(text(meta.sharedHpSourceId, 220) ? {
        sharedHpSourceId: text(meta.sharedHpSourceId, 220),
        inInitiative: initiativeActorIds.includes(id),
      } : {}),
      visible: item.visible !== false,
      position: point(item.position),
      sizeCells: combatSnapshotItemSizeCells(item, dpi),
      conditions: conditionInstances(meta),
      damageDefenses: hasDamageDefenses(defenses) ? defenses : null,
      concentration: concentrationEntries(meta),
      classFeatures: classFeatureSummary(meta, round, featureLookup, poolLookup),
    };
  });

  // Active spells live on every affected token: one row per instance, with its bearers.
  const spellsById = new Map();
  for (const item of list) {
    const spells = metaOf(item)[SPELLS_KEY];
    for (const spell of Array.isArray(spells) ? spells : []) {
      if (!spell || typeof spell !== "object") continue;
      const instanceId = text(spell.instanceId || spell.id, 220);
      const key = instanceId || `${text(spell.casterId, 220)}:${text(spell.name)}`;
      let row = spellsById.get(key);
      if (!row) {
        const casterId = text(spell.casterId, 220) || null;
        row = {
          instanceId: instanceId || null,
          spellId: text(spell.spellId) || null,
          name: text(spell.name || spell.spellName) || null,
          casterId,
          casterName: casterId ? nameOf(casterId) : null,
          targetIds: [],
          targetNames: [],
          turns: finiteOrNull(spell.turns),
          expiry: spell.expiry && typeof spell.expiry === "object" ? { ...spell.expiry } : null,
          remainingText: spellExpiryDescription(spell),
          concentration: spell.conc === true,
        };
        spellsById.set(key, row);
      }
      const bearerId = text(item.id, 220);
      const isOwnerRecord = spell?.castContext?.staticZoneOwner === true && bearerId === row.casterId;
      if (!isOwnerRecord && !row.targetIds.includes(bearerId)) {
        row.targetIds.push(bearerId);
        row.targetNames.push(text(item.name) || bearerId);
      }
    }
  }

  const zones = [];
  const auras = [];
  const summons = [];
  const backgrounds = [];
  for (const item of list) {
    const metadata = item.metadata || {};
    const zone = metadata[SPELL_STATIC_ZONE_META_KEY];
    if (zone?.instanceId) {
      let area = null;
      try { area = translatedZoneArea(item); } catch { area = null; }
      zones.push({
        itemId: text(item.id, 220),
        instanceId: text(zone.instanceId, 220),
        spellId: text(zone.spellId) || null,
        spellName: spellsById.get(text(zone.instanceId, 220))?.name || null,
        ruleId: text(zone.ruleId) || null,
        role: text(zone.role) || "root",
        casterId: text(zone.casterId, 220) || null,
        casterName: nameOf(zone.casterId),
        targetIds: ids(zone.targetIds),
        position: point(item.position),
        areaType: text(area?.type) || null,
        cells: (Array.isArray(area?.cells) ? area.cells : []).slice(0, 2000).map((cell) => [
          round2(cell.x), round2(cell.y), round2(cell.width), round2(cell.height),
        ]),
      });
    }
    const auraKinds = [
      ["spell", metadata[SPELL_AURA_META_KEY]],
      ["custom", metadata[CUSTOM_AURA_META_KEY]],
      ["class-feature", metadata[CLASS_FEATURE_AURA_META_KEY]],
    ];
    for (const [kind, aura] of auraKinds) {
      if (!aura?.instanceId) continue;
      const sourceId = text(aura.casterId || aura.sourceId, 220) || null;
      const feature = aura.featureId ? featureLookup(aura.featureId) : null;
      auras.push({
        kind,
        itemId: text(item.id, 220),
        instanceId: text(aura.instanceId, 220),
        name: text(aura.name)
          || text(feature?.name)
          || spellsById.get(text(aura.instanceId, 220))?.name
          || text(aura.spellId || aura.featureId)
          || null,
        spellId: text(aura.spellId) || null,
        featureId: text(aura.featureId) || null,
        sourceId,
        sourceName: nameOf(sourceId),
        radiusMeters: finiteOrNull(aura.radiusMeters),
        sizeCells: finiteOrNull(aura.sizeCells),
        color: text(aura.strokeColor || aura.fillColor, 40) || null,
        position: point(item.position),
      });
    }
    if (metadata[SPELL_BOARD_TOKEN_META_KEY]?.kind === "spell-board-token") {
      const view = spellBoardTokenView(item);
      const meta = metaOf(item);
      const casterId = text(view?.casterId || metadata[SPELL_BOARD_TOKEN_META_KEY].casterId, 220) || null;
      summons.push({
        itemId: text(item.id, 220),
        name: text(item.name) || view?.label || null,
        spellId: view?.spellId || text(metadata[SPELL_BOARD_TOKEN_META_KEY].spellId) || null,
        label: view?.label || null,
        instanceId: view?.instanceId || text(metadata[SPELL_BOARD_TOKEN_META_KEY].instanceId, 220) || null,
        casterId,
        casterName: nameOf(casterId),
        hp: finiteOrNull(meta.hp ?? view?.state?.hp),
        hpMax: finiteOrNull(meta.hpMax ?? view?.state?.hpMax),
        armorClass: finiteOrNull(view?.armorClass),
        mode: view?.modeLabel || null,
        inInitiative: actorIds.includes(text(item.id, 220)),
        position: point(item.position),
        sizeCells: combatSnapshotItemSizeCells(item, dpi),
      });
    }
    if (item.layer === "MAP" && item.type === "IMAGE" && item.visible !== false) {
      const background = backgroundOf(item);
      if (background) backgrounds.push(background);
    }
  }

  const activeItem = activeId && !virtualOrderName(activeId) ? byId.get(realOrderId(activeId)) : null;
  return {
    format: COMBAT_SNAPSHOT_FORMAT,
    version: COMBAT_SNAPSHOT_VERSION,
    capturedAt: Number(capturedAt) || Date.now(),
    roomId: text(roomId, 220) || null,
    round,
    turn: {
      index: currentIndex,
      activeId,
      activeName: activeId ? (virtualOrderName(activeId) || text(activeItem?.name) || null) : null,
    },
    order,
    actors,
    spells: [...spellsById.values()],
    zones,
    auras,
    summons,
    board: {
      dpi,
      scale: grid?.scale?.parsed
        ? { multiplier: Number(grid.scale.parsed.multiplier) || null, unit: text(grid.scale.parsed.unit, 20) || null }
        : null,
      gridType: text(grid?.type, 40) || null,
      backgrounds,
    },
  };
}

function hpText(hp, hpMax) {
  if (hp === null && hpMax === null) return "HP ?";
  return `${hp ?? "?"}/${hpMax ?? "?"}`;
}

export function combatSnapshotSummaryText(snapshot) {
  const actors = (snapshot?.actors || []).filter((actor) => !actor.missing);
  const turn = snapshot?.turn?.activeName ? ` · turno di ${snapshot.turn.activeName}` : "";
  const head = `Round ${snapshot?.round || 1}${turn}`;
  const roster = actors.map((actor) => `${actor.name || actor.id} ${hpText(actor.hp, actor.hpMax)}`).join(", ");
  const counts = [
    `${actors.length} attori`,
    `${(snapshot?.spells || []).length} incantesimi`,
    `${(snapshot?.zones || []).length + (snapshot?.auras || []).length} zone/aure`,
    `${(snapshot?.summons || []).length} evocazioni`,
  ].join(", ");
  return [head, counts, roster].filter(Boolean).join(" · ");
}

export function combatSnapshotFileName(snapshot, extension = "json") {
  const date = new Date(Number(snapshot?.capturedAt) || Date.now());
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `snapshot-round${snapshot?.round || 1}-${stamp}.${extension}`;
}

// Combat Log entry: a compact summary plus the whole snapshot in the payload for the JSON export.
export function combatSnapshotLogEvent(snapshot) {
  return {
    kind: COMBAT_SNAPSHOT_LOG_KIND,
    category: "roster",
    action: "snapshot",
    source: "manual",
    label: "Snapshot del combattimento",
    targets: [],
    payload: {
      summary: combatSnapshotSummaryText(snapshot),
      snapshot,
    },
  };
}

// --- Schematic board image -------------------------------------------------

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"']/gu, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[char]);
}

function backgroundTransform(background, dpi) {
  const k = dpi / background.imageDpi;
  return {
    k,
    transform: `translate(${background.position.x} ${background.position.y}) rotate(${background.rotation}) scale(${background.scale.x} ${background.scale.y})`,
    x: -background.offset.x * k,
    y: -background.offset.y * k,
    width: background.width * k,
    height: background.height * k,
  };
}

function backgroundCorners(background, dpi) {
  const { x, y, width, height } = backgroundTransform(background, dpi);
  const radians = (background.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [[x, y], [x + width, y], [x, y + height], [x + width, y + height]].map(([px, py]) => {
    const sx = px * background.scale.x;
    const sy = py * background.scale.y;
    return {
      x: background.position.x + sx * cos - sy * sin,
      y: background.position.y + sx * sin + sy * cos,
    };
  });
}

/**
 * Scene-space window of the schematic image: the map backgrounds when present,
 * otherwise everything the snapshot positions, with one cell of margin.
 */
export function combatSnapshotBoardView(snapshot) {
  const dpi = Number(snapshot?.board?.dpi) || DEFAULT_DPI;
  const points = [];
  for (const background of snapshot?.board?.backgrounds || []) points.push(...backgroundCorners(background, dpi));
  if (!points.length) {
    const radiusOf = (cells) => (Number(cells) || 1) * dpi / 2;
    for (const actor of snapshot?.actors || []) {
      if (!actor.position) continue;
      const radius = radiusOf(actor.sizeCells);
      points.push({ x: actor.position.x - radius, y: actor.position.y - radius });
      points.push({ x: actor.position.x + radius, y: actor.position.y + radius });
    }
    for (const summon of snapshot?.summons || []) if (summon.position) points.push(summon.position);
    for (const zone of snapshot?.zones || []) {
      for (const [x, y, width, height] of zone.cells || []) points.push({ x, y }, { x: x + width, y: y + height });
    }
    for (const aura of snapshot?.auras || []) {
      if (!aura.position) continue;
      const radius = radiusOf(aura.sizeCells);
      points.push({ x: aura.position.x - radius, y: aura.position.y - radius });
      points.push({ x: aura.position.x + radius, y: aura.position.y + radius });
    }
  }
  if (!points.length) points.push({ x: 0, y: 0 }, { x: dpi * 10, y: dpi * 10 });
  const minX = Math.min(...points.map((entry) => entry.x)) - dpi;
  const minY = Math.min(...points.map((entry) => entry.y)) - dpi;
  const maxX = Math.max(...points.map((entry) => entry.x)) + dpi;
  const maxY = Math.max(...points.map((entry) => entry.y)) + dpi;
  const header = dpi * 0.9;
  return {
    dpi,
    minX: round2(minX),
    minY: round2(minY - header),
    width: round2(maxX - minX),
    height: round2(maxY - minY + header),
    header: round2(header),
  };
}

const ZONE_COLORS = ["#a855f7", "#f97316", "#06b6d4", "#84cc16", "#ec4899", "#f59e0b"];

function hpColor(hp, hpMax) {
  if (!(hpMax > 0) || hp === null) return "#94a3b8";
  const ratio = hp / hpMax;
  if (ratio > 0.5) return "#22c55e";
  if (ratio > 0.25) return "#eab308";
  return "#ef4444";
}

function tokenMarkup({ x, y, radius, fill, name, hp, hpMax, active, dashed, lines, dpi }) {
  const font = dpi * 0.2;
  const parts = [
    `<circle cx="${x}" cy="${y}" r="${round2(radius)}" fill="${fill}" fill-opacity="0.55" stroke="${active ? "#facc15" : "#0f172a"}" stroke-width="${round2(active ? dpi * 0.08 : dpi * 0.03)}"${dashed ? ` stroke-dasharray="${round2(dpi * 0.08)}"` : ""}/>`,
  ];
  if (hpMax > 0 && hp !== null) {
    const width = radius * 1.8;
    const ratio = Math.max(0, Math.min(1, hp / hpMax));
    const top = y - radius - dpi * 0.16;
    parts.push(`<rect x="${round2(x - width / 2)}" y="${round2(top)}" width="${round2(width)}" height="${round2(dpi * 0.1)}" fill="#0f172a" fill-opacity="0.8"/>`);
    parts.push(`<rect x="${round2(x - width / 2)}" y="${round2(top)}" width="${round2(width * ratio)}" height="${round2(dpi * 0.1)}" fill="${hpColor(hp, hpMax)}"/>`);
  }
  const labels = [`${name}${hpMax > 0 || hp !== null ? ` ${hpText(hp, hpMax)}` : ""}`, ...lines];
  labels.forEach((label, index) => {
    parts.push(`<text x="${x}" y="${round2(y + radius + font * (1.1 + index * 1.15))}" font-size="${round2(index ? font * 0.85 : font)}" text-anchor="middle" fill="#f8fafc" stroke="#020617" stroke-width="${round2(font * 0.18)}" paint-order="stroke">${escapeXml(label)}</text>`);
  });
  return parts.join("");
}

/**
 * Schematic SVG of the board. With `includeBackground` the map images are linked
 * by URL (no pixels are read, so CORS does not apply); `baseFill` paints a dark
 * base under everything and is turned off when a canvas already drew the map.
 */
export function buildCombatSnapshotSvg(snapshot, { includeBackground = true, baseFill = true } = {}) {
  const view = combatSnapshotBoardView(snapshot);
  const { dpi } = view;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${view.minX} ${view.minY} ${view.width} ${view.height}" width="${Math.round(view.width)}" height="${Math.round(view.height)}" font-family="system-ui, sans-serif">`);
  if (baseFill) out.push(`<rect x="${view.minX}" y="${view.minY}" width="${view.width}" height="${view.height}" fill="#1e293b"/>`);
  if (includeBackground) {
    for (const background of snapshot?.board?.backgrounds || []) {
      const placed = backgroundTransform(background, dpi);
      out.push(`<g transform="${placed.transform}"><image href="${escapeXml(background.url)}" xlink:href="${escapeXml(background.url)}" x="${round2(placed.x)}" y="${round2(placed.y)}" width="${round2(placed.width)}" height="${round2(placed.height)}" preserveAspectRatio="none"/></g>`);
    }
  }
  const gridType = String(snapshot?.board?.gridType || "SQUARE").toUpperCase();
  if (gridType === "SQUARE") {
    const lines = [];
    const startX = Math.ceil(view.minX / dpi) * dpi;
    const startY = Math.ceil((view.minY + view.header) / dpi) * dpi;
    for (let x = startX; x <= view.minX + view.width; x += dpi) lines.push(`M${round2(x)} ${round2(view.minY + view.header)}V${round2(view.minY + view.height)}`);
    for (let y = startY; y <= view.minY + view.height; y += dpi) lines.push(`M${view.minX} ${round2(y)}H${round2(view.minX + view.width)}`);
    if (lines.length <= 4000) out.push(`<path d="${lines.join("")}" stroke="#e2e8f0" stroke-opacity="0.25" stroke-width="${round2(dpi * 0.015)}" fill="none"/>`);
  }
  (snapshot?.zones || []).forEach((zone, index) => {
    const color = ZONE_COLORS[index % ZONE_COLORS.length];
    const cells = (zone.cells || []).map(([x, y, width, height]) => `<rect x="${x}" y="${y}" width="${width}" height="${height}"/>`).join("");
    if (cells) out.push(`<g fill="${color}" fill-opacity="0.28" stroke="${color}" stroke-opacity="0.7" stroke-width="${round2(dpi * 0.02)}">${cells}</g>`);
    const anchor = zone.cells?.[0];
    if (anchor) out.push(`<text x="${round2(anchor[0] + dpi * 0.05)}" y="${round2(anchor[1] + dpi * 0.22)}" font-size="${round2(dpi * 0.18)}" fill="${color}" stroke="#020617" stroke-width="${round2(dpi * 0.03)}" paint-order="stroke">${escapeXml(zone.spellName || zone.spellId || "Zona")}</text>`);
  });
  for (const aura of snapshot?.auras || []) {
    if (!aura.position || !(aura.sizeCells > 0)) continue;
    const color = /^#[0-9a-f]{3,8}$/iu.test(aura.color || "") ? aura.color : "#38bdf8";
    out.push(`<circle cx="${aura.position.x}" cy="${aura.position.y}" r="${round2(aura.sizeCells * dpi / 2)}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="${round2(dpi * 0.04)}" stroke-dasharray="${round2(dpi * 0.12)}"/>`);
  }
  for (const summon of snapshot?.summons || []) {
    if (!summon.position || summon.inInitiative) continue;
    out.push(tokenMarkup({
      x: summon.position.x,
      y: summon.position.y,
      radius: (summon.sizeCells || 1) * dpi / 2 * 0.9,
      fill: "#a78bfa",
      name: summon.name || summon.label || "Evocazione",
      hp: summon.hp,
      hpMax: summon.hpMax,
      active: false,
      dashed: true,
      lines: summon.casterName ? [`di ${summon.casterName}`] : [],
      dpi,
    }));
  }
  for (const actor of snapshot?.actors || []) {
    if (actor.missing || !actor.position) continue;
    const lines = [];
    const conditions = (actor.conditions || []).map((entry) => entry.label).filter(Boolean);
    if (conditions.length) lines.push(conditions.slice(0, 3).join(", ") + (conditions.length > 3 ? ` +${conditions.length - 3}` : ""));
    if (actor.concentration?.length) lines.push(`Conc.: ${actor.concentration.map((entry) => entry.spell).join(", ")}`);
    out.push(tokenMarkup({
      x: actor.position.x,
      y: actor.position.y,
      radius: (actor.sizeCells || 1) * dpi / 2 * 0.9,
      fill: FACTION_COLORS[actor.attitude] || "#94a3b8",
      name: actor.name || actor.id,
      hp: actor.hp,
      hpMax: actor.hpMax,
      active: snapshot?.turn?.activeId && realOrderId(String(snapshot.turn.activeId)) === actor.id,
      dashed: false,
      lines,
      dpi,
    }));
  }
  const when = new Date(Number(snapshot?.capturedAt) || Date.now()).toLocaleString("it-IT");
  const title = `Round ${snapshot?.round || 1}${snapshot?.turn?.activeName ? ` · turno di ${snapshot.turn.activeName}` : ""} · ${when}`;
  out.push(`<rect x="${view.minX}" y="${view.minY}" width="${view.width}" height="${view.header}" fill="#0f172a" fill-opacity="0.92"/>`);
  out.push(`<text x="${round2(view.minX + dpi * 0.3)}" y="${round2(view.minY + view.header * 0.66)}" font-size="${round2(dpi * 0.36)}" font-weight="600" fill="#f8fafc">${escapeXml(title)}</text>`);
  out.push("</svg>");
  return out.join("");
}
