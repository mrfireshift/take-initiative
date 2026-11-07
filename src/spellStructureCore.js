// CAP-STRUCTURE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, decisions D1–D8 of 6/11/2026): the spells that raise objects
// with hit points on the map. Each panel or pillar is a child zone of the spell (D1), drawn under an invisible root;
// its hit points live in the caster's pill (castContext.structure), never in meta.hp. A ⚡ damages a segment with the
// defenses objects have (D4) and, at 0, takes it off the map and leaves its residue (frigid air, rubble). Pure data and
// arithmetic: no SDK.
import { componentDamageAfterDefense, damageDefenseFor, sanitizeDamageDefenses } from "./damageDefensesCore.js";

// Objects are immune to poison and psychic damage (Dungeon Master's Guide, "Objects").
const OBJECT_IMMUNITIES = Object.freeze(["poison", "psychic"]);

// The walls are thin (decisions D1–D5 of 7/11/2026, from the 2014 texts): on the grid lines, from a grid corner, their
// cells on one side of them (widthAnchor "edge", as Wall of Fire and the other thin walls); in a row with one drag, or
// panel by panel, each touching another.
export const SPELL_STRUCTURE_RULES = Object.freeze({
  // Ten 10-foot panels, AC 15 and 30 hit points per inch: 6 inches (180) or, as 10-by-20-foot panels, 3 inches (90).
  "wall-of-stone": Object.freeze({
    spellId: "wall-of-stone",
    kind: "wall",
    segmentKind: "panel",
    segmentRuleId: "wall-of-stone:panel",
    noun: "pannello",
    nounPlural: "pannelli",
    armorClass: 15,
    maxSegments: 10,
    widthAnchor: "edge",
    choices: Object.freeze({
      thick: Object.freeze({ hp: 180, panelMeters: 3, thicknessMeters: 0.15 }),
      thin: Object.freeze({ hp: 90, panelMeters: 6, thicknessMeters: 0.075 }),
      "thick-panels": Object.freeze({ hp: 180, panelMeters: 3, thicknessMeters: 0.15 }),
      "thin-panels": Object.freeze({ hp: 90, panelMeters: 6, thicknessMeters: 0.075 }),
    }),
    defaultChoice: "thick",
    defenses: Object.freeze({ immunities: OBJECT_IMMUNITIES }),
    // Connected panels may collapse at the GM's discretion (D5): a command by hand, never automatic.
    collapse: true,
  }),
  // Ten 10-foot panels a foot thick, AC 12 and 30 hit points, vulnerable to fire; a destroyed one leaves a sheet of frigid
  // air (D6). The dome or the sphere has no panels: its sections stay at the table (D4 of 7/11/2026).
  "wall-of-ice": Object.freeze({
    spellId: "wall-of-ice",
    kind: "wall",
    segmentKind: "panel",
    segmentRuleId: "wall-of-ice:panel",
    residueKind: "frigid-air",
    residueRuleId: "wall-of-ice:frigid-air",
    noun: "pannello",
    nounPlural: "pannelli",
    armorClass: 12,
    maxSegments: 10,
    widthAnchor: "edge",
    choices: Object.freeze({
      row: Object.freeze({ hp: 30, panelMeters: 3, thicknessMeters: 0.3 }),
      panels: Object.freeze({ hp: 30, panelMeters: 3, thicknessMeters: 0.3 }),
    }),
    defaultChoice: "row",
    defenses: Object.freeze({ vulnerabilities: Object.freeze(["fire"]), immunities: OBJECT_IMMUNITIES }),
    collapse: false,
  }),
  // Xanathar: up to six 5-foot pillars (two more for each slot above the 6th), one cell each, AC 5 and 30 hit points; a
  // destroyed one crumbles into rubble, difficult terrain 10 feet around it until cleared (D8).
  "xanathar-ossa-della-terra": Object.freeze({
    spellId: "xanathar-ossa-della-terra",
    kind: "pillars",
    segmentKind: "pillar",
    segmentRuleId: "xanathar-ossa-della-terra:pillar",
    residueKind: "rubble",
    residueRuleId: "xanathar-ossa-della-terra:rubble",
    residueRadiusMeters: 3,
    noun: "colonna",
    nounPlural: "colonne",
    feminine: true,
    armorClass: 5,
    maxSegments: 12,
    choices: Object.freeze({ "": Object.freeze({ hp: 30 }) }),
    defaultChoice: "",
    defenses: Object.freeze({ immunities: OBJECT_IMMUNITIES }),
    collapse: false,
  }),
});

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function getSpellStructureRule(value) {
  const id = typeof value === "object" ? value?.id : value;
  return SPELL_STRUCTURE_RULES[String(id || "").trim()] || null;
}

export function isSpellStructureSegmentRuleId(ruleId) {
  return Object.values(SPELL_STRUCTURE_RULES).some((rule) => rule.segmentRuleId === String(ruleId || "").trim());
}

function choiceOf(rule, choice = "") {
  const key = String(choice || "").trim();
  return rule?.choices?.[key] || rule?.choices?.[rule?.defaultChoice || ""] || null;
}

// The grid corner nearest a point, on the grid the cast's own corner lies on. An area looks for its cells only a few
// squares around its corner (aoeGeometryCore.js), so each piece needs one of its own: with the corner of the whole
// wall, the panels beyond the third had no cell and were not drawn (found in the room on 7/11/2026).
function gridCornerNear(value, gridOrigin, dpi) {
  const target = point(value);
  const origin = point(gridOrigin) || target;
  if (!target || !origin || !(dpi > 0)) return origin;
  return {
    x: origin.x + Math.round((target.x - origin.x) / dpi) * dpi,
    y: origin.y + Math.round((target.y - origin.y) / dpi) * dpi,
  };
}

// What a wall's segment carries besides its line: its anchor and its thickness, for its cells and its drawing.
function wallSegmentExtras({ widthAnchor = "", thicknessMeters = 0 } = {}) {
  return {
    ...(widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
    ...(Number(thicknessMeters) > 0 ? { thicknessMeters: Number(thicknessMeters) } : {}),
  };
}

// A wall's panels along the line drawn (D2): tracts of the panel's length, the spell's ten on its whole line; panels
// stacked in height stay with the GM.
export function spellStructureWallSegments(preview = null, {
  panelMeters = 3,
  maxSegments = 10,
  widthAnchor = "",
  thicknessMeters = 0,
} = {}) {
  const start = point(preview?.start);
  const end = point(preview?.end);
  const dpi = Number(preview?.dpi);
  if (!start || !end || !(dpi > 0)) return [];
  const lengthCells = Math.hypot(end.x - start.x, end.y - start.y) / dpi;
  const panelCells = Math.max(1, Number(panelMeters) / 1.5);
  const count = Math.max(1, Math.min(Math.max(1, Math.floor(Number(maxSegments) || 1)), Math.round(lengthCells / panelCells)));
  const at = (fraction) => ({ x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction });
  const gridOrigin = point(preview?.gridOrigin) || start;
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    preview: {
      type: "line",
      start: at(index / count),
      end: at((index + 1) / count),
      dpi,
      gridOrigin: gridCornerNear(at(index / count), gridOrigin, dpi),
      ...(Number(preview?.widthSquares) > 0 ? { widthSquares: Math.max(1, Math.round(Number(preview.widthSquares))) } : {}),
      ...wallSegmentExtras({ widthAnchor, thicknessMeters }),
    },
  }));
}

// A wall drawn panel by panel (D3): one panel on each line the GM drew (CAP-MULTIAREA: preview.areas), as drawn.
export function spellStructurePanelSegments(preview = null, {
  maxSegments = 10,
  widthAnchor = "",
  thicknessMeters = 0,
} = {}) {
  const dpi = Number(preview?.dpi);
  if (!(dpi > 0)) return [];
  const gridOrigin = point(preview?.gridOrigin) || point(preview?.start);
  return (Array.isArray(preview?.areas) ? preview.areas : [])
    .map((shape) => ({ start: point(shape?.start), end: point(shape?.end) }))
    .filter((shape) => shape.start && shape.end)
    .slice(0, Math.max(1, Math.floor(Number(maxSegments) || 1)))
    .map((shape, index) => ({
      index: index + 1,
      preview: {
        type: "line",
        start: shape.start,
        end: shape.end,
        dpi,
        gridOrigin: gridCornerNear(shape.start, gridOrigin || shape.start, dpi),
        ...wallSegmentExtras({ widthAnchor, thicknessMeters }),
      },
    }));
}

// One pillar on each shape the GM drew (CAP-MULTIAREA: preview.areas, in the order of their numbers), on the grid of
// the first one; a cast with a single shape raises one pillar on it.
export function spellStructurePillarSegments(preview = null, { maxSegments = 12 } = {}) {
  const dpi = Number(preview?.dpi);
  if (!(dpi > 0)) return [];
  const type = String(preview?.type || "").trim();
  const gridOrigin = point(preview?.gridOrigin) || point(preview?.start);
  const shapes = Array.isArray(preview?.areas) && preview.areas.length
    ? preview.areas
    : [{ start: preview?.start, end: preview?.end }];
  return shapes
    .map((shape) => ({ start: point(shape?.start), end: point(shape?.end) }))
    .filter((shape) => shape.start && shape.end)
    .slice(0, Math.max(1, Math.floor(Number(maxSegments) || 1)))
    .map((shape, index) => ({
      index: index + 1,
      preview: { type, start: shape.start, end: shape.end, dpi, gridOrigin: gridCornerNear(shape.start, gridOrigin || shape.start, dpi) },
    }));
}

// The segments a cast raises, from the placement confirmed on the map.
export function spellStructureSegments(rule, preview = null, choice = "") {
  if (!rule || !preview) return [];
  if (rule.kind === "wall") {
    // A dome or a sphere is no line: no panels (D4).
    if (String(preview.type || "").trim() !== "line") return [];
    const options = choiceOf(rule, choice);
    const extras = { maxSegments: rule.maxSegments, widthAnchor: rule.widthAnchor, thicknessMeters: options?.thicknessMeters };
    if (Array.isArray(preview.areas) && preview.areas.length) return spellStructurePanelSegments(preview, extras);
    return spellStructureWallSegments(preview, { panelMeters: options?.panelMeters || 3, ...extras });
  }
  if (rule.kind === "pillars") return spellStructurePillarSegments(preview, { maxSegments: rule.maxSegments });
  return [];
}

// The middle of a segment's geometry: half a side from a square's corner toward its pointer (as the area tool draws
// it), a circle's centre, the middle of a line.
export function spellStructureSegmentMiddle(geometry = null) {
  const start = point(geometry?.start);
  const end = point(geometry?.end);
  const dpi = Number(geometry?.dpi);
  if (!start || !end) return null;
  const type = String(geometry?.type || "").trim();
  if (type === "circle") return start;
  if (type === "square" && dpi > 0) {
    const side = Math.max(1, Math.round(Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / dpi)) * dpi;
    return {
      x: start.x + (end.x < start.x ? -1 : 1) * (side / 2),
      y: start.y + (end.y < start.y ? -1 : 1) * (side / 2),
    };
  }
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

// The words the popup says about a segment, agreed with its noun: "il pannello", "Nessuna colonna", "un pannello del
// muro".
export function spellStructureNounWords(rule) {
  const noun = String(rule?.noun || "segmento").trim();
  const feminine = rule?.feminine === true;
  return {
    noun,
    the: `${feminine ? "la" : "il"} ${noun}`,
    none: `${feminine ? "Nessuna" : "Nessun"} ${noun}`,
    one: `${feminine ? "una" : "un"} ${noun}${rule?.kind === "wall" ? " del muro" : ""}`,
  };
}

// Where a destroyed segment leaves its residue: on the segment itself (a wall's frigid air), or a circle of the rule's
// radius around its middle (a pillar's rubble, 3 m). The geometry is the one stored on the segment's zone.
export function spellStructureResiduePreview(rule, geometry = null) {
  const start = point(geometry?.start);
  const end = point(geometry?.end);
  const dpi = Number(geometry?.dpi);
  if (!start || !end || !(dpi > 0)) return null;
  const gridOrigin = point(geometry?.gridOrigin) || start;
  const radiusMeters = Number(rule?.residueRadiusMeters);
  if (!(radiusMeters > 0)) {
    return {
      type: String(geometry?.type || "").trim(),
      start,
      end,
      dpi,
      gridOrigin,
      ...(Number(geometry?.widthSquares) > 0 ? { widthSquares: geometry.widthSquares } : {}),
      ...wallSegmentExtras(geometry || {}),
    };
  }
  const middle = spellStructureSegmentMiddle(geometry);
  const radiusCells = Math.max(1, Math.round(radiusMeters / 1.5));
  return {
    type: "circle",
    start: middle,
    end: { x: middle.x + radiusCells * dpi, y: middle.y },
    dpi,
    gridOrigin: gridCornerNear(middle, gridOrigin, dpi),
  };
}

// The pill's state: each segment with its hit points (a destroyed one at 0).
export function spellStructureInitialState(rule, segments = [], choice = "") {
  const options = choiceOf(rule, choice);
  const hpMax = Math.max(1, Math.floor(Number(options?.hp) || 1));
  return {
    ...(String(choice || "").trim() ? { choice: String(choice).trim() } : {}),
    segments: segments.map((segment) => ({ index: segment.index, hp: hpMax, hpMax })),
  };
}

export function normalizeSpellStructureState(value = null) {
  const segments = Array.isArray(value?.segments)
    ? value.segments
      .map((segment) => ({
        index: Math.floor(Number(segment?.index)),
        hp: Math.max(0, Math.floor(Number(segment?.hp))),
        hpMax: Math.max(1, Math.floor(Number(segment?.hpMax))),
      }))
      .filter((segment) => segment.index >= 1 && Number.isFinite(segment.hp) && Number.isFinite(segment.hpMax))
    : [];
  return {
    ...(String(value?.choice || "").trim() ? { choice: String(value.choice).trim() } : {}),
    segments,
  };
}

export function spellStructureStanding(state = null) {
  return normalizeSpellStructureState(state).segments.filter((segment) => segment.hp > 0);
}

// "9/10 pannelli": what the pill says.
export function spellStructureSummaryParts(rule, state = null) {
  const normalized = normalizeSpellStructureState(state);
  if (!rule || !normalized.segments.length) return [];
  const standing = normalized.segments.filter((segment) => segment.hp > 0).length;
  return [{ id: `${rule.spellId}-structure`, label: `${standing}/${normalized.segments.length} ${rule.nounPlural}` }];
}

// The damage a segment takes, after the defenses objects have (D4): an immunity stops it, a vulnerability doubles it.
export function spellStructureDamageAfterDefenses(rule, amount, type = "") {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  const defense = damageDefenseFor(sanitizeDamageDefenses(rule?.defenses || {}), String(type || "").trim());
  return { amount: componentDamageAfterDefense(value, "full", defense), defense };
}

// A damage or a collapse on one segment: the next state, and whether the segment is gone.
export function planSpellStructureSegmentChange({ rule = null, state = null, index = 0, amount = 0, type = "", operation = "damage" } = {}) {
  const current = normalizeSpellStructureState(state);
  const segment = current.segments.find((entry) => entry.index === Math.floor(Number(index)));
  if (!rule || !segment) return { valid: false, errors: ["structure-segment-missing"] };
  if (segment.hp <= 0) return { valid: false, errors: ["structure-segment-destroyed"] };
  if (operation === "collapse" && rule.collapse !== true) return { valid: false, errors: ["structure-collapse-not-allowed"] };
  const dealt = operation === "collapse"
    ? { amount: segment.hp, defense: null }
    : spellStructureDamageAfterDefenses(rule, amount, type);
  if (operation !== "collapse" && !(Math.floor(Number(amount)) > 0)) return { valid: false, errors: ["structure-damage-required"] };
  const after = Math.max(0, segment.hp - dealt.amount);
  return {
    valid: true,
    errors: [],
    segment: { ...segment },
    before: segment.hp,
    after,
    dealt: dealt.amount,
    defense: dealt.defense,
    destroyed: after === 0,
    state: {
      ...clone(current),
      segments: current.segments.map((entry) => (entry.index === segment.index ? { ...entry, hp: after } : { ...entry })),
    },
  };
}

// A segment's hit points when whole, for the variant chosen at the cast.
export function spellStructureSegmentHpMax(rule, choice = "") {
  return Math.max(1, Math.floor(Number(choiceOf(rule, choice)?.hp) || 1));
}

// The bar under each segment (the owner's decision of 7/11/2026): one cell wide like a token's, overlapping the segment's
// lower edge by a quarter of its height, seen by everyone, with no numbers. A track and its fill, two child zones of their
// own kinds and no rule: the zone engine leaves them alone, while the cast, the ⚡, Termina and Undo carry them with the
// segment they belong to.
export const SPELL_STRUCTURE_BAR_KIND = "bar";
export const SPELL_STRUCTURE_BAR_FILL_KIND = "bar-fill";

// The colours of the tokens' bars (hpbar-items.js, hpColorByPct): green, amber, red.
export function spellStructureBarColor(fraction) {
  const value = Number(fraction);
  if (value > 0.66) return "#22c55e";
  if (value > 0.33) return "#f59e0b";
  return "#ef4444";
}

// The thin slab a wall's segment, or the sheet of frigid air left in its place, is drawn as (D1): its line, as thick
// as the wall, but never thinner than an eighth of a cell, so it can be seen. Null for what is not a thin wall.
export function spellStructureSlab(geometry = null) {
  const start = point(geometry?.start);
  const end = point(geometry?.end);
  const dpi = Number(geometry?.dpi);
  const thickness = Number(geometry?.thicknessMeters);
  if (String(geometry?.type || "").trim() !== "line" || !start || !end || !(dpi > 0) || !(thickness > 0)) return null;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!(length > 0)) return null;
  const half = Math.max((dpi * thickness) / 1.5, dpi * 0.125) / 2;
  const across = { x: (-(end.y - start.y) / length) * half, y: ((end.x - start.x) / length) * half };
  return [
    { x: start.x + across.x, y: start.y + across.y },
    { x: end.x + across.x, y: end.y + across.y },
    { x: end.x - across.x, y: end.y - across.y },
    { x: start.x - across.x, y: start.y - across.y },
  ];
}

// The rectangle around a slab, for the bar under it.
export function spellStructureSlabBounds(slab = null) {
  const points = (Array.isArray(slab) ? slab : []).map(point).filter(Boolean);
  if (!points.length) return null;
  const xs = points.map((entry) => entry.x);
  const ys = points.map((entry) => entry.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// The track: centred under the segment's middle, on the lowest edge of its cells (or of its slab).
export function spellStructureBarFrame(cells = [], middle = null, dpi = 0) {
  const size = Number(dpi);
  const center = point(middle);
  const rects = (Array.isArray(cells) ? cells : []).filter((cell) => (
    [cell?.x, cell?.y, cell?.width, cell?.height].every((value) => Number.isFinite(Number(value)))
  ));
  if (!(size > 0) || !center || !rects.length) return null;
  const bottom = Math.max(...rects.map((cell) => Number(cell.y) + Number(cell.height)));
  const width = size * 0.9;
  const height = Math.max(3, size * 0.12);
  return { x: center.x - width / 2, y: bottom - height * 0.25, width, height };
}

// The fill inside the track, as long as the share of hit points left; none at 0.
export function spellStructureBarFill(frame = null, hp = 0, hpMax = 1) {
  const max = Number(hpMax);
  const fraction = max > 0 ? Math.max(0, Math.min(1, Number(hp) / max)) : 0;
  if (!frame || !(fraction > 0)) return null;
  const inset = Math.max(1, frame.height * 0.15);
  const innerWidth = Math.max(0, frame.width - inset * 2);
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    width: innerWidth * fraction,
    height: Math.max(1, frame.height - inset * 2),
    color: spellStructureBarColor(fraction),
  };
}

// The words of the History and the combat log: "Muro di pietra · pannello 3: 180 → 60 PF", or "… distrutto"; a
// pillar is "distrutta".
export function spellStructureChangeLabel(rule, spellName, plan, operation = "damage") {
  const name = String(spellName || rule?.spellId || "Incantesimo").trim();
  const noun = `${rule?.noun || "segmento"} ${plan?.segment?.index ?? ""}`.trim();
  const ending = rule?.feminine === true ? "a" : "o";
  if (operation === "collapse") return `${name} · ${noun} crollat${ending}`;
  return plan?.destroyed ? `${name} · ${noun} distrutt${ending}` : `${name} · ${noun}: ${plan?.before} → ${plan?.after} PF`;
}
