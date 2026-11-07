// CAP-MULTIAREA, the general rule of several areas in one cast (PHB 2014 texts). An area rule declares
// placement.multiArea: the area tool draws its shapes one by one, each keeps its number on the map, and one
// confirmation takes them together. A creature in more than one shape is a target once, with one save and one damage:
// Meteor Swarm says so, and Fire Storm is one storm made of cubes. Pure: the tool keeps the shapes on the map, this
// module says what the rule allows and what to tell the GM.

export const SPELL_MULTI_AREA_MAX_COUNT = 12;
export const SPELL_MULTI_AREA_ADJACENCY = Object.freeze(["none", "side"]);

// The words for the GM, by the noun the rule declares: Italian agrees them.
const NOUNS = Object.freeze({
  esplosione: Object.freeze({
    one: "esplosione",
    many: "esplosioni",
    the: "L'esplosione",
    indefinite: "un'esplosione",
    another: "un'altra esplosione",
    besideAnother: "accanto a un'altra",
    all: "tutte le",
    first: "la prima",
    next: "la prossima",
    someone: "una",
    pronoun: "la",
    removed: "tolta",
  }),
  cubo: Object.freeze({
    one: "cubo",
    many: "cubi",
    the: "Il cubo",
    indefinite: "un cubo",
    another: "un altro cubo",
    besideAnother: "accanto a un altro",
    all: "tutti i",
    first: "il primo",
    next: "il prossimo",
    someone: "uno",
    pronoun: "lo",
    removed: "tolto",
  }),
});
export const SPELL_MULTI_AREA_NOUNS = Object.freeze(Object.keys(NOUNS));

const capitalized = (text) => text.charAt(0).toLocaleUpperCase("it") + text.slice(1);

function uniqueIds(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// What a rule declares, with its defaults: exactly count shapes unless minCount says fewer will do, no constraint on
// how they sit unless adjacency says "side", and "esplosione" as the word. Null without a valid declaration.
export function spellMultiAreaSpec(rule) {
  const value = rule?.placement?.multiArea;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const count = Number(value.count);
  if (!Number.isInteger(count) || count < 2 || count > SPELL_MULTI_AREA_MAX_COUNT) return null;
  const minCount = value.minCount === undefined ? count : Number(value.minCount);
  if (!Number.isInteger(minCount) || minCount < 1 || minCount > count) return null;
  const adjacency = value.adjacency === undefined ? "none" : value.adjacency;
  if (!SPELL_MULTI_AREA_ADJACENCY.includes(adjacency)) return null;
  const noun = value.noun === undefined ? "esplosione" : value.noun;
  if (!Object.hasOwn(NOUNS, noun)) return null;
  return Object.freeze({ count, minCount, adjacency, noun });
}

// The errors of a rule's placement.multiArea, for validateSpellAreaRule: circles or squares, drawn on free points by an
// instant spell, and side adjacency only between squares.
export function spellMultiAreaRuleErrors(rule) {
  const value = rule?.placement?.multiArea;
  if (value === undefined) return [];
  const errors = [];
  const shape = rule?.geometry?.shape;
  if (!spellMultiAreaSpec(rule)) errors.push("multi-area-invalid");
  if (!["circle", "square"].includes(shape)) errors.push("multi-area-shape-invalid");
  if (value?.adjacency === "side" && shape !== "square") errors.push("multi-area-adjacency-invalid");
  if (
    rule?.kind !== "instant"
    || rule?.placement?.origin !== "point"
    || rule?.placement?.mode === "point"
  ) {
    errors.push("multi-area-placement-invalid");
  }
  return errors;
}

// The tool's state for one placement: the declaration and the shapes fixed on the map, in the order of their numbers.
export function createSpellMultiAreaRuntime(rule) {
  const spec = spellMultiAreaSpec(rule);
  return spec ? { ...spec, shapes: [] } : null;
}

export function spellMultiAreaFreeOrdinal(runtime) {
  for (let ordinal = 1; ordinal <= Number(runtime?.count || 0); ordinal += 1) {
    if (!runtime.shapes.some((shape) => shape.ordinal === ordinal)) return ordinal;
  }
  return 0;
}

// Where a shape's number sits: the centre of a circle, the middle of a square.
export function spellMultiAreaShapeMiddle(area) {
  if (area?.type === "circle") return finitePoint(area.origin);
  const points = (Array.isArray(area?.points) && area.points.length ? area.points : [area?.origin])
    .map(finitePoint)
    .filter(Boolean);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, entry) => sum + entry.x, 0) / points.length,
    y: points.reduce((sum, entry) => sum + entry.y, 0) / points.length,
  };
}

// The placed shape whose number is under the pointer, within three quarters of a cell of its middle, or -1: pressing
// on it takes it off the map. A square's corners and the cells around it stay free for its neighbour.
export function spellMultiAreaShapeAt(runtime, pointer) {
  const target = finitePoint(pointer);
  let found = -1;
  let nearest = Infinity;
  if (!target) return found;
  (Array.isArray(runtime?.shapes) ? runtime.shapes : []).forEach((shape, index) => {
    const middle = finitePoint(shape?.middle);
    const cell = Number(shape?.dpi);
    if (!middle || !(cell > 0)) return;
    const distance = Math.hypot(middle.x - target.x, middle.y - target.y);
    if (distance <= cell * 0.75 && distance < nearest) {
      found = index;
      nearest = distance;
    }
  });
  return found;
}

// The number written on a placed shape: "2/4" when they must all be drawn, the number alone when fewer will do.
export function spellMultiAreaShapeLabel(runtime, ordinal) {
  return runtime.minCount === runtime.count ? `${ordinal}/${runtime.count}` : String(ordinal);
}

// What the GM reads while drawing: kind "progress" (the default), "full" or "removed" (with the ordinal taken off).
export function spellMultiAreaMessage(runtime, kind = "progress", { ordinal = 0 } = {}) {
  const words = NOUNS[runtime?.noun] || NOUNS.esplosione;
  const placed = runtime.shapes.length;
  const exact = runtime.minCount === runtime.count;
  const canConfirm = placed >= runtime.minCount;
  if (kind === "removed") {
    return `${capitalized(words.one)} ${ordinal} ${words.removed}: ridisegna${words.pronoun} dove vuoi${canConfirm ? ", oppure conferma senza" : ""}.`;
  }
  if (kind === "full" || placed >= runtime.count) {
    return `${capitalized(words.all)} ${runtime.count} ${words.many} sono sulla mappa: conferma. Premi sul numero di ${words.someone} per toglier${words.pronoun}.`;
  }
  const atLeast = runtime.minCount > 1 ? `almeno ${runtime.minCount}, ` : "";
  if (!placed) {
    return exact
      ? `Disegna ${words.first} ${words.one}: ${runtime.count} in tutto.`
      : `Disegna ${words.first} ${words.one}: ${atLeast}fino a ${runtime.count}.`;
  }
  if (exact) {
    return `${capitalized(words.many)} sulla mappa: ${placed} di ${runtime.count}. Disegna ${words.next}.`;
  }
  return canConfirm
    ? `${capitalized(words.many)} sulla mappa: ${placed}, fino a ${runtime.count}. Disegna ${words.next}, oppure conferma.`
    : `${capitalized(words.many)} sulla mappa: ${placed}, ${atLeast}fino a ${runtime.count}. Disegna ${words.next}.`;
}

function squareBounds(shape) {
  const points = (Array.isArray(shape?.area?.points) ? shape.area.points : [])
    .map(finitePoint)
    .filter(Boolean);
  if (points.length < 3) return null;
  const xs = points.map((entry) => entry.x);
  const ys = points.map((entry) => entry.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Two squares share a stretch of side, or overlap; a corner alone does not count.
function touchBySide(a, b, epsilon) {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return (overlapX > epsilon && overlapY > -epsilon) || (overlapY > epsilon && overlapX > -epsilon);
}

// "Each cube must have at least one face adjacent to the face of another cube": the number of the first square that
// touches no other one along a side, or 0 when they all do, with a single shape, or when the rule asks nothing.
export function spellMultiAreaIsolatedOrdinal(runtime) {
  const shapes = Array.isArray(runtime?.shapes) ? runtime.shapes : [];
  if (runtime?.adjacency !== "side" || shapes.length < 2) return 0;
  const bounds = shapes.map(squareBounds);
  for (let index = 0; index < shapes.length; index += 1) {
    const own = bounds[index];
    if (!own) continue;
    const epsilon = Math.max(0.5, (Number(shapes[index].dpi) || 0) * 0.01);
    const touches = bounds.some((other, otherIndex) => (
      otherIndex !== index && other && touchBySide(own, other, epsilon)
    ));
    if (!touches) return shapes[index].ordinal;
  }
  return 0;
}

// Why the confirmation is refused, in the GM's words, or "" when it can go.
export function spellMultiAreaConfirmProblem(runtime) {
  const words = NOUNS[runtime?.noun] || NOUNS.esplosione;
  const placed = runtime.shapes.length;
  if (placed < runtime.minCount) {
    if (runtime.minCount === runtime.count) {
      return `Disegna ${words.all} ${runtime.count} ${words.many} prima di confermare (${placed}/${runtime.count}).`;
    }
    return runtime.minCount === 1
      ? `Disegna almeno ${words.indefinite} prima di confermare.`
      : `Disegna almeno ${runtime.minCount} ${words.many} prima di confermare (${placed}).`;
  }
  const isolated = spellMultiAreaIsolatedOrdinal(runtime);
  if (isolated) {
    return `${words.the} ${isolated} non tocca ${words.another} con un lato: togli${words.pronoun} e ridisegna${words.pronoun} ${words.besideAnother}.`;
  }
  return "";
}

// The confirmed placement: each shape with its own hit targets, and every creature once, in the order of the numbers
// on the map. hitTargetIds holds the targets of each shape, index by index.
export function spellMultiAreaPreview(runtime, hitTargetIds, { includeCaster = false, casterId = "" } = {}) {
  const caster = String(casterId || "").trim();
  const areas = runtime.shapes.map((shape, index) => ({
    start: finitePoint(shape.start),
    end: finitePoint(shape.end),
    ...(shape.area?.type === "circle" && Number(shape.area.radius) > 0 ? { radius: Number(shape.area.radius) } : {}),
    targetIds: uniqueIds(hitTargetIds?.[index]).filter((id) => includeCaster || id !== caster),
  }));
  return { areas, targetIds: uniqueIds(areas.flatMap((entry) => entry.targetIds)) };
}

// What a progress message carries for whoever shows it: how many shapes, out of how many.
export function spellMultiAreaProgress(runtime) {
  return {
    placed: runtime.shapes.length,
    count: runtime.count,
    minCount: runtime.minCount,
    noun: runtime.noun,
  };
}
