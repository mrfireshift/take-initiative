// Spell slots of a character, from its class build (PHB 2014). Pure data: no SDK, no catalog, no import of
// classFeatureCore.js, which reads the slot maximums from here.
// Spellcasting classes give a caster level: full casters their level, half casters half of it, the Eldritch
// Knight and the Arcane Trickster a third. One class uses its own table (rounded up); two or more add up
// their levels (rounded down) on the multiclass spellcaster table. Pact Magic stays apart: its slots share
// one level and come back on a short rest.

export const SPELL_SLOT_LEVELS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
export const SPELL_SLOT_PACT_POOL_ID = "spell-slot-pact";
export const SPELL_SLOT_CAPACITY_TYPE = "spell_slots";

// Slots per level for caster levels 1-20: the multiclass spellcaster table, which is also the table of the
// full casters.
const SLOTS_BY_CASTER_LEVEL = Object.freeze([
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
].map(Object.freeze));

const FULL_CASTERS = new Set(["bardo", "chierico", "druido", "mago", "stregone"]);
const HALF_CASTERS = new Set(["paladino", "ranger", "ranger-revised"]);
// Third casters by subclass: the class itself has no Spellcasting.
const THIRD_CASTER_SUBCLASSES = Object.freeze({
  guerriero: "guerriero-cavaliere-mistico",
  ladro: "ladro-mistificatore-arcano",
});
const PACT_CLASS_ID = "warlock";
// Warlock table: number of Pact Magic slots and their level, from the class level shown.
const PACT_SLOT_COUNT = Object.freeze({ 1: 1, 2: 2, 11: 3, 17: 4 });
const PACT_SLOT_LEVEL = Object.freeze({ 1: 1, 3: 2, 5: 3, 7: 4, 9: 5 });

function buildEntries(characterBuild) {
  return (Array.isArray(characterBuild) ? characterBuild : [])
    .map((entry) => ({
      classId: String(entry?.classId || "").trim(),
      subclassId: String(entry?.subclassId || "").trim(),
      level: Math.max(0, Math.min(20, Math.floor(Number(entry?.level) || 0))),
    }))
    .filter((entry) => entry.classId && entry.level > 0);
}

function tableValue(table, level) {
  let value = 0;
  for (const [minimum, entry] of Object.entries(table)) if (level >= Number(minimum)) value = entry;
  return value;
}

// "full", "half", "third" or "" for a class without Spellcasting at this level.
export function spellcastingProgression(entry) {
  const classId = String(entry?.classId || "").trim();
  const level = Math.floor(Number(entry?.level) || 0);
  if (FULL_CASTERS.has(classId) && level >= 1) return "full";
  if (HALF_CASTERS.has(classId) && level >= 2) return "half";
  if (THIRD_CASTER_SUBCLASSES[classId] === String(entry?.subclassId || "").trim() && level >= 3) return "third";
  return "";
}

// The caster level that indexes the slot table: 0 without Spellcasting.
export function spellcasterLevel(characterBuild) {
  const casters = buildEntries(characterBuild)
    .map((entry) => ({ ...entry, progression: spellcastingProgression(entry) }))
    .filter((entry) => entry.progression);
  if (!casters.length) return 0;
  if (casters.length === 1) {
    const [{ progression, level }] = casters;
    return progression === "full" ? level : Math.ceil(level / (progression === "half" ? 2 : 3));
  }
  return Math.min(20, casters.reduce((total, { progression, level }) => (
    total + (progression === "full" ? level : Math.floor(level / (progression === "half" ? 2 : 3)))
  ), 0));
}

// { slots: { 1: 4, 2: 3, ... } (levels with slots only), pact: { count, level } or null, casterLevel }.
export function spellSlotMaximums(characterBuild) {
  const casterLevel = spellcasterLevel(characterBuild);
  const row = casterLevel > 0 ? SLOTS_BY_CASTER_LEVEL[casterLevel - 1] : [];
  const slots = Object.fromEntries(row.map((count, index) => [index + 1, count]));
  const warlockLevel = buildEntries(characterBuild)
    .filter((entry) => entry.classId === PACT_CLASS_ID)
    .reduce((highest, entry) => Math.max(highest, entry.level), 0);
  const pact = warlockLevel
    ? { count: tableValue(PACT_SLOT_COUNT, warlockLevel), level: tableValue(PACT_SLOT_LEVEL, warlockLevel) }
    : null;
  return { slots, pact, casterLevel };
}

export function hasSpellSlots(characterBuild) {
  const { slots, pact } = spellSlotMaximums(characterBuild);
  return Object.keys(slots).length > 0 || !!pact;
}

export function spellSlotPoolId(level) {
  const value = Math.floor(Number(level));
  return SPELL_SLOT_LEVELS.includes(value) ? `spell-slot-${value}` : "";
}

const LONG_REST = Object.freeze({ event: "riposo_lungo", amount: "massimo" });
const SHORT_REST = Object.freeze({ event: "riposo_breve", amount: "massimo" });

// Resource pools of the class-feature state: one per slot level and one for Pact Magic. Their maximum is
// resolved from the build by resolveClassFeatureResourceMaximum (capacity type "spell_slots").
export const SPELL_SLOT_RESOURCE_POOLS = Object.freeze([
  ...SPELL_SLOT_LEVELS.map((level) => Object.freeze({
    id: spellSlotPoolId(level),
    name: `Slot di ${level}° livello`,
    capacity: Object.freeze({ type: SPELL_SLOT_CAPACITY_TYPE, slotLevel: level }),
    refresh: Object.freeze([LONG_REST]),
  })),
  Object.freeze({
    id: SPELL_SLOT_PACT_POOL_ID,
    name: "Slot del Patto",
    capacity: Object.freeze({ type: SPELL_SLOT_CAPACITY_TYPE, pact: true }),
    refresh: Object.freeze([SHORT_REST, LONG_REST]),
  }),
]);

// The maximum of a slot pool for this build, 0 when the build has none of those slots.
export function spellSlotPoolMaximum(pool, characterBuild) {
  const capacity = pool?.capacity;
  if (capacity?.type !== SPELL_SLOT_CAPACITY_TYPE) return null;
  const { slots, pact } = spellSlotMaximums(characterBuild);
  if (capacity.pact === true) return pact?.count || 0;
  return slots[capacity.slotLevel] || 0;
}

// The slots as the character sheet shows them: one row per slot level of the build, then Pact Magic.
// resources is classFeatureState.resources; a slot never spent counts as available. temporary counts the
// slots above the maximum (created with Font of Magic, gone at the long rest).
export function spellSlotStatus(characterBuild, resources = {}) {
  const { slots, pact } = spellSlotMaximums(characterBuild);
  const row = (poolId, maximum, extra) => {
    const stored = resources?.[poolId]?.current;
    const value = stored === null || stored === undefined || stored === "" ? NaN : Number(stored);
    const current = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : maximum;
    return { poolId, maximum, current, temporary: Math.max(0, current - maximum), ...extra };
  };
  return [
    ...Object.entries(slots).map(([level, maximum]) => row(spellSlotPoolId(level), maximum, { level: Number(level), pact: false })),
    ...(pact ? [row(SPELL_SLOT_PACT_POOL_ID, pact.count, { level: pact.level, pact: true })] : []),
  ];
}

export function isSpellSlotPool(pool) {
  return pool?.capacity?.type === SPELL_SLOT_CAPACITY_TYPE;
}
