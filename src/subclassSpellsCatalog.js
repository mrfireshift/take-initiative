// The spells a subclass gives (PHB 2014 and supplements): domain, circle and oath spells, the spells of the
// rangers' and sorcerers' subclasses. They are always prepared, or always known, and never count against the
// number of spells the character prepares or knows. A warlock's patron only widens the list the warlock chooses
// from: its spells are suggestions, never added by themselves. Derived from the class build on every read: the
// spellbook never stores them.
import { getAdditionalSubclassSpellEntries } from "./classFeatureCatalog.js";
import { getSpellDefinition } from "./spells-srd.js";
import { spellSlotMaximums } from "./spellSlotCore.js";

// The names of the class tables that the spell catalog writes another way.
const SUBCLASS_SPELL_ALIASES = Object.freeze({
  "Crescita di Spuntoni": "spike-growth",
  "Sfera Elastica di Otiluke": "resilient-sphere",
  "Legame Telepatico di Rary": "telepathic-bond",
  "Tocco Vampirico": "vampiric-touch",
  "Guscio Antivita": "antilife-shell",
  "Potenziare Caratteristica": "enhance-ability",
  "Tentacoli Neri di Evard": "black-tentacles",
  "Risata Incontenibile di Tasha": "hideous-laughter",
  "Evoca Elementale (solo acqua)": "conjure-elemental",
  "Mano di Bigby (come tentacolo)": "arcane-hand",
});

const GRANTING_CLASSES = new Set(["chierico", "druido", "paladino", "ranger", "ranger-revised", "stregone"]);
const SUGGESTING_CLASSES = new Set(["warlock"]);

export function subclassSpellId(name) {
  const alias = SUBCLASS_SPELL_ALIASES[String(name || "").trim()];
  return alias || getSpellDefinition(name)?.id || "";
}

function subclassSpells(profile, classes) {
  const spells = [];
  for (const entry of Array.isArray(profile?.characterBuild) ? profile.characterBuild : []) {
    const classId = String(entry?.classId || "").trim();
    if (!classes.has(classId)) continue;
    const { subclass, entries } = getAdditionalSubclassSpellEntries(profile, classId);
    for (const spell of entries) {
      const spellId = subclassSpellId(spell.name);
      if (!spellId || spells.some((known) => known.spellId === spellId)) continue;
      spells.push({ spellId, classId, source: subclass?.name || "", classLevel: spell.level });
    }
  }
  return spells;
}

// The spells the subclasses of the build give for good, up to the class level reached:
// [{ spellId, classId, source, classLevel }].
export function subclassGrantedSpells(profile) {
  return subclassSpells(profile, GRANTING_CLASSES);
}

// The spells a warlock's patron adds to the list the warlock chooses from. Their table goes by spell level, not
// by class level: only those the warlock can cast with its Pact Magic slots.
export function subclassSuggestedSpells(profile) {
  const pactLevel = spellSlotMaximums(profile?.characterBuild).pact?.level || 0;
  return subclassSpells(profile, SUGGESTING_CLASSES)
    .filter((spell) => (getSpellDefinition(spell.spellId)?.level ?? 99) <= pactLevel);
}
