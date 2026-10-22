// The spellbook read through the spell catalog: names, levels, what each spell can do from the card, and the
// spell quick actions that launch it. Loads spells-srd.js: import it only where the catalog is already loaded
// (the character sheet and the tracker), never from initiativeCards.js.
import { getQuickActionSpellOptions, getSpellCatalog, getSpellDefinition } from "./spells-srd.js";
import { PC_ATTACK_CANTRIPS } from "./pcAttackCantripCatalog.js";
import { QUICK_ACTION_VERSION, sanitizeQuickAction } from "./quickActionsCore.js";
import { sanitizeSpellbook, spellbookQuickActionId } from "./spellbookCore.js";
import { preparesSpells, spellPreparationClasses, spellPreparationLimit } from "./spellPreparationCore.js";
import { subclassGrantedSpells } from "./subclassSpellsCatalog.js";
import spellReferenceRuntime from "./spell-reference-it-runtime.json" with { type: "json" };

let launchOptionsById = null;

// How a spell quick action launches the spell: every catalog spell, recordOnly for the spells whose cast the plugin
// only records.
function launchOption(spellId) {
  if (!launchOptionsById) {
    launchOptionsById = new Map(getQuickActionSpellOptions().map((option) => [option.id, option]));
  }
  return launchOptionsById.get(spellId) || null;
}

const ATTACK_CANTRIP_IDS = new Set(PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId));

export function spellbookLevelTitle(level) {
  if (level === 0) return "Trucchetti";
  return Number.isInteger(level) && level > 0 ? `${level}° livello` : "Fuori catalogo";
}

// One spell of the book as the card shows it. An id the catalog no longer knows stays listed, so the GM can
// remove it, but it cannot be launched.
export function spellbookSpell(spellId) {
  const spell = getSpellDefinition(spellId);
  if (!spell) {
    return { id: spellId, label: spellId, level: null, concentration: false, launchable: false, automated: false, recordOnly: false, area: false, attackCantrip: false, targetMode: "selection", ritual: false };
  }
  const option = launchOption(spell.id);
  return {
    id: spell.id,
    label: spell.catalogLabel || spell.displayName || spell.name || spell.id,
    level: Number.isInteger(spell.level) ? spell.level : null,
    concentration: spell.concentration === true,
    launchable: !!option,
    automated: option?.automated === true,
    // The plugin records its cast, the slot it spends and a combat log entry; the table resolves it.
    recordOnly: option?.recordOnly === true,
    // A spell with a shape (sphere, cone...): it is placed on the map. The area console also hosts some
    // multi-target spells without a shape, such as Hold Person.
    area: !!spell.area,
    attackCantrip: ATTACK_CANTRIP_IDS.has(spell.id),
    // A personal spell targets its caster; an area spell is placed in the panel, never on the caster.
    targetMode: spell.targetMode === "self" && option?.area !== true ? "self" : "selection",
    ritual: SRD_RITUAL_IDS.has(spell.id) || spell.italianReference?.ritual === true,
  };
}

const SRD_RITUAL_IDS = new Set(spellReferenceRuntime.ritualIds || []);

// The Italian reference of the SRD spells (466 KB): loaded on the first expanded spell, never with the catalog.
let spellReferenceSpells = null;
let spellReferenceLoading = null;

export function spellbookSpellReferenceLoaded() {
  return !!spellReferenceSpells;
}

export function loadSpellbookSpellReference() {
  spellReferenceLoading ||= import("./spellReferenceItData.js")
    .then((module) => { spellReferenceSpells = module.default?.spells || {}; })
    .catch((error) => {
      spellReferenceLoading = null;
      throw error;
    });
  return spellReferenceLoading;
}

// The Italian text of a spell: the SRD reference file once loaded, or the reference a supplement spell carries.
function spellReference(spell) {
  return spellReferenceSpells?.[spell?.id] || spell?.italianReference || null;
}

// What the card shows when a spell is expanded: { school, castingTime, range, components, duration, description,
// higherLevels }; null for a spell without a reference, or before loadSpellbookSpellReference for an SRD spell.
export function spellbookSpellDetails(spellId) {
  const reference = spellReference(getSpellDefinition(spellId));
  if (!reference) return null;
  const field = (name) => String(reference[name] ?? "").trim();
  return {
    school: field("school"),
    castingTime: field("castingTime"),
    range: field("range"),
    components: field("components"),
    duration: field("duration"),
    description: field("description"),
    higherLevels: field("higherLevels"),
  };
}

// Ritual casting (PHB 2014): a wizard casts any ritual of the spellbook, even unprepared; a cleric or a druid the
// rituals it has prepared; a bard the rituals it knows. The other classes cannot (a feat such as Ritual Caster
// goes through a free quick action). spell: an entry of spellbookGroups.
export function spellbookRitualCastable(profile, spell) {
  if (!spell?.ritual || !spell.launchable || !spell.level) return false;
  const classes = new Set((Array.isArray(profile?.characterBuild) ? profile.characterBuild : [])
    .filter((entry) => Number(entry?.level) > 0)
    .map((entry) => String(entry?.classId || "").trim()));
  if (classes.has("mago") && !spell.granted) return true;
  if (classes.has("bardo")) return true;
  return (classes.has("chierico") || classes.has("druido")) && spell.prepared;
}

// The cantrip attack quick action that records this cantrip in the attack console, when the character has one: the
// sheet and the 🪄 menu open the console with it instead of casting the spell.
export function spellbookCantripAttackAction(quickActions, spellId) {
  if (!ATTACK_CANTRIP_IDS.has(spellId)) return null;
  return (Array.isArray(quickActions) ? quickActions : []).find((action) => (
    action?.kind === "attack"
    && action.source?.kind === "cantrip"
    && (!action.source.spellIds?.length || action.source.spellIds.includes(spellId))
  )) || null;
}

// The book grouped by level, cantrips first; spells outside the catalog last. preparing: the character prepares
// its spells (spellPreparationCore.js); then a spell of the book is prepared unless listed in unpreparedIds, and a
// cantrip always is. For the other casters every spell they know is ready. granted: the spells its subclasses give
// ([{ spellId, source }], subclassSpellsCatalog.js), listed with their source and always prepared.
export function spellbookGroups(value, { preparing = false, granted = [] } = {}) {
  const { spellIds, pinnedIds, unpreparedIds = [] } = sanitizeSpellbook(value);
  const pinned = new Set(pinnedIds);
  const unprepared = new Set(preparing ? unpreparedIds : []);
  const grantedBy = new Map((Array.isArray(granted) ? granted : []).map((entry) => [entry.spellId, entry.source || "Sottoclasse"]));
  const groups = new Map();
  for (const spellId of [...spellIds, ...[...grantedBy.keys()].filter((id) => !spellIds.includes(id))]) {
    const entry = spellbookSpell(spellId);
    const spell = {
      ...entry,
      pinned: pinned.has(spellId),
      prepared: entry.level === 0 || grantedBy.has(spellId) || !unprepared.has(spellId),
      ...(grantedBy.has(spellId) ? { granted: grantedBy.get(spellId) } : {}),
    };
    const key = spell.level ?? 99;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(spell);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([key, spells]) => ({
      level: key === 99 ? null : key,
      title: spellbookLevelTitle(key === 99 ? null : key),
      spells: spells.sort((left, right) => left.label.localeCompare(right.label, "it")),
    }));
}

// launchMode "auto" applies the spell when nothing needs the GM (it falls back to the panel otherwise);
// "review" always opens the panel, where slot level, targets and choices are set. cost "free" casts it without a
// slot, as a ritual.
export function spellbookQuickAction(spellId, { launchMode = "auto", cost = "slot" } = {}) {
  const spell = spellbookSpell(spellId);
  if (!spell.launchable) return null;
  return sanitizeQuickAction({
    version: QUICK_ACTION_VERSION,
    id: spellbookQuickActionId(spell.id),
    label: spell.label,
    kind: "spell",
    spellId: spell.id,
    targetMode: spell.targetMode,
    slotLevel: null,
    turns: null,
    applyAutomations: true,
    launchMode,
    cost,
  });
}

// The book of a profile, with its prepared spells when the character prepares them.
export function spellbookGroupsForProfile(profile) {
  return spellbookGroups(profile?.spellbook, {
    preparing: preparesSpells(profile?.characterBuild),
    granted: subclassGrantedSpells(profile),
  });
}

// How many spells the character has prepared, against its limit: { preparing, prepared, limit, classes }.
// Cantrips and the spells of the subclass do not count; limit is null when a modifier is missing on the sheet.
export function spellbookPreparation(profile) {
  const classes = spellPreparationClasses(profile?.characterBuild, profile?.abilityModifiers);
  if (!classes.length) return { preparing: false, prepared: 0, limit: null, classes };
  const prepared = spellbookGroupsForProfile(profile)
    .flatMap((group) => group.spells)
    .filter((spell) => spell.level && spell.prepared && !spell.granted).length;
  return {
    preparing: true,
    prepared,
    limit: spellPreparationLimit(profile?.characterBuild, profile?.abilityModifiers),
    classes,
  };
}

// The spells the card can cast now, by level, favourites first in each level, then by name: launchable and,
// for a character who prepares, prepared.
function launchableBookGroups(profile) {
  return spellbookGroupsForProfile(profile)
    .map((group) => ({
      ...group,
      spells: group.spells.filter((spell) => spell.launchable && spell.prepared)
        .sort((left, right) => Number(right.pinned) - Number(left.pinned)),
    }))
    .filter((group) => group.spells.length);
}

// The tracker card's actions: the profile's own, then every launchable spell of the book, which the 🪄 launcher
// lists (trackerQuickActions.js tells them apart by their id).
export function spellbookTrackerQuickActions(profile) {
  const quickActions = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  const bookActions = launchableBookGroups(profile)
    .flatMap((group) => group.spells.map((spell) => spellbookQuickAction(spell.id)))
    .filter(Boolean);
  return bookActions.length ? [...quickActions, ...bookActions] : quickActions;
}

// The sections of the 🪄 menu: the favourites at its top, then one submenu per level ({ title, actionIds }).
export function spellbookMenuSections(profile) {
  const groups = launchableBookGroups(profile);
  const favourites = groups.flatMap((group) => group.spells.filter((spell) => spell.pinned));
  return [
    ...(favourites.length ? [{
      title: "Preferiti",
      inline: true,
      actionIds: favourites.map((spell) => spellbookQuickActionId(spell.id)),
    }] : []),
    ...groups.map((group) => ({
      title: group.title,
      actionIds: group.spells.map((spell) => spellbookQuickActionId(spell.id)),
    })),
  ];
}

let searchOptions = null;

// Every catalog spell, for the editor's search field.
export function spellbookSearchOptions() {
  if (!searchOptions) {
    searchOptions = getSpellCatalog()
      .map((spell) => ({
        id: spell.id,
        label: spell.catalogLabel || spell.displayName || spell.name || spell.id,
        level: spell.level,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "it"));
  }
  return searchOptions;
}
