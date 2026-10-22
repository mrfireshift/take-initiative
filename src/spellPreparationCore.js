// Which classes prepare their spells, and how many (PHB 2014). Pure data: no SDK, no catalog.
// Clerics and druids prepare Wisdom modifier + class level spells, wizards Intelligence modifier + wizard level,
// paladins Charisma modifier + half their paladin level (they cast from 2nd level); always at least one. The other
// spellcasters know their spells: everything they know is ready.

const PREPARING_CLASSES = Object.freeze({
  chierico: Object.freeze({ ability: "wis", label: "Chierico", levelDivisor: 1, minimumLevel: 1 }),
  druido: Object.freeze({ ability: "wis", label: "Druido", levelDivisor: 1, minimumLevel: 1 }),
  mago: Object.freeze({ ability: "int", label: "Mago", levelDivisor: 1, minimumLevel: 1 }),
  paladino: Object.freeze({ ability: "cha", label: "Paladino", levelDivisor: 2, minimumLevel: 2 }),
});

function buildEntries(characterBuild) {
  return (Array.isArray(characterBuild) ? characterBuild : [])
    .map((entry) => ({
      classId: String(entry?.classId || "").trim(),
      level: Math.max(0, Math.min(20, Math.floor(Number(entry?.level) || 0))),
    }))
    .filter((entry) => entry.classId && entry.level > 0);
}

function modifier(abilityModifiers, ability) {
  const value = abilityModifiers?.[ability];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

/**
 * The preparing classes of a build, with the number of spells each prepares: [{ classId, label, level, limit }].
 * limit is null when the sheet has no modifier for the class's ability. Empty for a build that only knows its
 * spells.
 */
export function spellPreparationClasses(characterBuild, abilityModifiers = null) {
  return buildEntries(characterBuild)
    .filter((entry) => PREPARING_CLASSES[entry.classId] && entry.level >= PREPARING_CLASSES[entry.classId].minimumLevel)
    .map((entry) => {
      const rule = PREPARING_CLASSES[entry.classId];
      const bonus = modifier(abilityModifiers, rule.ability);
      return {
        classId: entry.classId,
        label: rule.label,
        level: entry.level,
        limit: bonus === null ? null : Math.max(1, bonus + Math.floor(entry.level / rule.levelDivisor)),
      };
    });
}

export function preparesSpells(characterBuild) {
  return spellPreparationClasses(characterBuild).length > 0;
}

// The number of spells the character prepares: the sum over its preparing classes (the book does not tell which
// class a spell belongs to), null when a modifier is missing.
export function spellPreparationLimit(characterBuild, abilityModifiers = null) {
  const classes = spellPreparationClasses(characterBuild, abilityModifiers);
  if (!classes.length || classes.some((entry) => entry.limit === null)) return null;
  return classes.reduce((total, entry) => total + entry.limit, 0);
}
