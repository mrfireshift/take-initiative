const SIZE_DEFINITIONS = [
  {
    id: "tiny",
    label: "Minuscola",
    sizeCategory: "Tiny",
    cost: 1,
    hp: 20,
    armorClass: 18,
    attackBonus: 8,
    attackDamage: "1d4 + 4",
    strength: 4,
    dexterity: 18,
    spaceCells: 0.5,
    assetPath: "/spell-token-animated-tiny-small.webp",
    assetPixelSize: 1067,
  },
  {
    id: "small",
    label: "Piccola",
    sizeCategory: "Small",
    cost: 1,
    hp: 25,
    armorClass: 16,
    attackBonus: 6,
    attackDamage: "1d8 + 2",
    strength: 6,
    dexterity: 14,
    spaceCells: 1,
    assetPath: "/spell-token-animated-tiny-small.webp",
    assetPixelSize: 1067,
  },
  {
    id: "medium",
    label: "Media",
    sizeCategory: "Medium",
    cost: 2,
    hp: 40,
    armorClass: 13,
    attackBonus: 5,
    attackDamage: "2d6 + 1",
    strength: 10,
    dexterity: 12,
    spaceCells: 1,
    assetPath: "/spell-token-animated-medium.webp",
    assetPixelSize: 1067,
  },
  {
    id: "large",
    label: "Grande",
    sizeCategory: "Large",
    cost: 4,
    hp: 50,
    armorClass: 10,
    attackBonus: 6,
    attackDamage: "2d10 + 2",
    strength: 14,
    dexterity: 10,
    spaceCells: 2,
    assetPath: "/spell-token-animated-large-huge.webp",
    assetPixelSize: 560,
  },
  {
    id: "huge",
    label: "Enorme",
    sizeCategory: "Huge",
    cost: 8,
    hp: 80,
    armorClass: 10,
    attackBonus: 8,
    attackDamage: "2d12 + 4",
    strength: 18,
    dexterity: 6,
    spaceCells: 3,
    assetPath: "/spell-token-animated-large-huge.webp",
    assetPixelSize: 560,
  },
];

export const ANIMATED_OBJECTS_MAX_COST = 10;
export const ANIMATED_OBJECT_COMMON_STATS = Object.freeze({
  constitution: 10,
  intelligence: 3,
  wisdom: 3,
  charisma: 1,
  blindsightMeters: 9,
});
export const ANIMATED_OBJECT_SIZES = Object.freeze(
  SIZE_DEFINITIONS.map((definition) => Object.freeze({ ...definition })),
);

const SIZE_BY_ID = new Map(ANIMATED_OBJECT_SIZES.map((size) => [size.id, size]));

function sourceCounts(value) {
  if (value?.counts && typeof value.counts === "object" && !Array.isArray(value.counts)) {
    return value.counts;
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function countValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function getAnimatedObjectSize(value) {
  const id = String(value || "").trim().toLocaleLowerCase("it");
  return SIZE_BY_ID.get(id)
    || ANIMATED_OBJECT_SIZES.find((size) => size.sizeCategory.toLocaleLowerCase("it") === id)
    || null;
}

export function normalizeAnimatedObjectComposition(value) {
  const source = sourceCounts(value);
  return Object.fromEntries(ANIMATED_OBJECT_SIZES.map((size) => [
    size.id,
    Math.max(0, Math.floor(Number(source[size.id]) || 0)),
  ]));
}

export function animatedObjectCompositionCost(value) {
  const counts = normalizeAnimatedObjectComposition(value);
  return ANIMATED_OBJECT_SIZES.reduce(
    (total, size) => total + counts[size.id] * size.cost,
    0,
  );
}

export function animatedObjectCompositionCount(value) {
  const counts = normalizeAnimatedObjectComposition(value);
  return ANIMATED_OBJECT_SIZES.reduce(
    (total, size) => total + counts[size.id],
    0,
  );
}

export function validateAnimatedObjectComposition(value) {
  const source = sourceCounts(value);
  const counts = normalizeAnimatedObjectComposition(source);
  const errors = [];
  const unknown = Object.keys(source).filter((key) => !SIZE_BY_ID.has(String(key)));
  if (unknown.length) errors.push("composition-option-invalid");
  for (const size of ANIMATED_OBJECT_SIZES) {
    if (source[size.id] === undefined) continue;
    if (countValue(source[size.id]) === null) {
      errors.push("composition-count-invalid");
      break;
    }
  }
  const cost = animatedObjectCompositionCost(counts);
  const count = animatedObjectCompositionCount(counts);
  if (!count) errors.push("composition-empty");
  if (cost > ANIMATED_OBJECTS_MAX_COST) errors.push("composition-limit-exceeded");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    counts,
    cost,
    count,
    maximumCost: ANIMATED_OBJECTS_MAX_COST,
  };
}

export function expandAnimatedObjectComposition(value) {
  const validation = validateAnimatedObjectComposition(value);
  if (!validation.valid) return [];
  const result = [];
  for (const size of ANIMATED_OBJECT_SIZES) {
    for (let index = 0; index < validation.counts[size.id]; index += 1) {
      result.push({
        ...size,
        index,
        ordinal: result.length,
      });
    }
  }
  return result;
}
