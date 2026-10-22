// The spellbook read through the spell catalog: names, levels, what each spell can do from the card, and the
// spell quick actions that launch it. Loads spells-srd.js: import it only where the catalog is already loaded
// (the character sheet and the tracker), never from initiativeCards.js.
import { getQuickActionSpellOptions, getSpellCatalog, getSpellDefinition } from "./spells-srd.js";
import { PC_ATTACK_CANTRIPS } from "./pcAttackCantripCatalog.js";
import { QUICK_ACTION_VERSION, sanitizeQuickAction } from "./quickActionsCore.js";
import { sanitizeSpellbook, spellbookQuickActionId } from "./spellbookCore.js";

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
    return { id: spellId, label: spellId, level: null, concentration: false, launchable: false, automated: false, recordOnly: false, area: false, attackCantrip: false, targetMode: "selection" };
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
  };
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

// The book grouped by level, cantrips first; spells outside the catalog last.
export function spellbookGroups(value) {
  const { spellIds, pinnedIds } = sanitizeSpellbook(value);
  const pinned = new Set(pinnedIds);
  const groups = new Map();
  for (const spellId of spellIds) {
    const spell = { ...spellbookSpell(spellId), pinned: pinned.has(spellId) };
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
// "review" always opens the panel, where slot level, targets and choices are set.
export function spellbookQuickAction(spellId, { launchMode = "auto" } = {}) {
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
  });
}

// The launchable spells of the book by level, favourites first in each level, then by name.
function launchableBookGroups(profile) {
  return spellbookGroups(profile?.spellbook)
    .map((group) => ({
      ...group,
      spells: group.spells.filter((spell) => spell.launchable)
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
