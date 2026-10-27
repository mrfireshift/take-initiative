// 5eTools' JSON of a monster (attacchi dei mostri, fase 2, lotto 1): read into the stat block format of phase 1
// (monsterStatblockImportCore.js, docs/IMPORT_SCHEDA.md), which the sheet's import then reads as any other block, so no
// rule lives twice. Pure. The plugin ships no 5eTools data: the GM brings it.
// Only the 2014 data: a 2024 block ({@atkr}, {@actSave}, the 2025 Monster Manual) is refused, as the plugin's rules are
// the 2014 ones. What the adapter cannot read becomes the action's note or a line of the report, never a guess.
import { monsterImportConditionName } from "./monsterStatblockImportCore.js";
import { fiveToolsTokenPath } from "./fiveToolsArchiveCore.js";
import { spellSlotMaximums } from "./spellSlotCore.js";
import { monsterActionAreaOrigin, monsterHitEffects, monsterSaveEffects } from "./monsterActionHeuristicsCore.js";

const ABILITY_BY_NAME = Object.freeze({ strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" });
const SOURCES_2024 = new Set(["XMM", "XPHB", "XDMG"]);
const TAGS_2024 = /\{@(?:atkr|actSave|actSaveFail|actSaveSuccess|actSaveSuccessOrFail|actTrigger|actResponse)\b/;
const ATTACK_LABELS = Object.freeze({ mw: "Melee Weapon Attack", rw: "Ranged Weapon Attack", ms: "Melee Spell Attack", rs: "Ranged Spell Attack",
  "mw,rw": "Melee or Ranged Weapon Attack", "ms,rs": "Melee or Ranged Spell Attack" });
const MAX_NOTE = 280;
const DAMAGE = String.raw`(\d+) \(\{@damage ([^}]+)\}\) (\w+) damage|(\d+) (\w+) damage`;

// One monster, a list of monsters or a bestiary/homebrew file ({ "monster": [...] }): the monsters in it, or [].
export function fiveToolsMonsters(value) {
  const list = Array.isArray(value?.monster) ? value.monster : Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return list.filter((monster) => monster && typeof monster === "object" && typeof monster.name === "string" && typeof monster.source === "string");
}

// 5eTools' data rather than the plugin's own block: a bestiary file, or monsters with a source and 5eTools' fields.
export function isFiveToolsData(value) {
  if (Array.isArray(value?.monster)) return true;
  const monsters = fiveToolsMonsters(value);
  return monsters.length > 0 && monsters.every((monster) => monster.kind === undefined
    && (Array.isArray(monster.ac) || Array.isArray(monster.action) || Array.isArray(monster.trait) || monster._copy || typeof monster.hp === "object"));
}

export function isFiveTools2024(monster) {
  return SOURCES_2024.has(String(monster?.source || "")) || TAGS_2024.test(JSON.stringify(monster || {}));
}

// 5eTools' inline tags as plain text: "{@condition frightened}" → "frightened", "{@dc 13}" → "DC 13", "{@hit 4}" → "+4".
export function fiveToolsPlainText(value) {
  return String(value ?? "").replace(/\{@(\w+)(?: ([^}]*))?\}/g, (_, tag, body = "") => {
    const parts = body.split("|");
    if (tag === "atk") return `${ATTACK_LABELS[parts[0]] || "Attack"}:`;
    if (tag === "hit") return `${Number(parts[0]) >= 0 ? "+" : ""}${parts[0]}`;
    if (tag === "h") return "Hit: ";
    if (tag === "dc") return `DC ${parts[0]}`;
    if (tag === "recharge") return `(Recharge ${parts[0] ? `${parts[0]}–6` : "6"})`;
    // {@chance 50|50 percent|…}: the second part is what the book prints; {@quickref name|source|chapter|index|text}.
    if (tag === "chance") return parts[1] || `${parts[0]} percent`;
    if (tag === "quickref" || tag === "filter") return parts[4] || parts[0];
    return parts[2] || parts[0];
  }).replace(/\s+/g, " ").trim();
}

// An action's entries as one text: its strings, and the strings of its lists' items.
function entriesText(entries) {
  return (Array.isArray(entries) ? entries : [entries]).map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry?.type === "list") return (entry.items || []).map((item) => (typeof item === "string" ? item : `${item.name || ""}. ${entriesText(item.entry ?? item.entries)}`)).join(" ");
    if (entry?.entries || entry?.entry) return entriesText(entry.entries ?? entry.entry);
    return "";
  }).filter(Boolean).join(" ");
}

function note(text) {
  const plain = fiveToolsPlainText(text).replace(/^[.,;]\s*/, "").trim();
  if (!plain || /^[.,;]?$/.test(plain)) return "";
  return plain.length > MAX_NOTE ? `${plain.slice(0, MAX_NOTE - 1).trimEnd()}…` : plain;
}

// The damage at the start of a hit: "19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage"; also "1 piercing damage".
function hitDamage(text) {
  const components = [];
  let rest = text;
  const first = rest.match(new RegExp(`^(?:${DAMAGE})`));
  if (!first) return { components, rest };
  const push = (match) => components.push(match[2] ? { type: match[3], formula: match[2].replace(/\s+/g, "") } : { type: match[5], formula: match[4] });
  push(first);
  rest = rest.slice(first[0].length);
  for (let next = rest.match(new RegExp(`^,? plus (?:${DAMAGE})`)); next && components.length < 3; next = rest.match(new RegExp(`^,? plus (?:${DAMAGE})`))) {
    push(next);
    rest = rest.slice(next[0].length);
  }
  return { components, rest };
}

const ATTACK = /^\{@atk ([a-z,]+)\} \{@hit (-?\d+)\} to hit(?: \([^)]*\))?, (?:reach (\d+) ft\.(?: or ranged? (\d+)(?:\/(\d+))? ft\.)?|ranged? (\d+)(?:\/(\d+))? ft\.).*?\{@h\}(.*)$/;

function attackAction(name, text, extra) {
  const match = text.match(ATTACK);
  if (!match) return null;
  const [, codes, bonus, reach, meleeRange, meleeLong, range, long, hit] = match;
  const ranged = !reach;
  const normal = Number(range || meleeRange) || null;
  const longRange = Number(long || meleeLong) || null;
  const base = { name, attack: { bonus: Number(bonus), type: ranged || !codes.includes("m") ? "ranged" : "melee",
    ...(reach ? { reach: Number(reach) } : {}), ...(normal ? { range: { normal, ...(longRange ? { long: longRange } : {}) } } : {}) }, ...extra };
  // "9 (2d6 + 2) piercing damage in melee or 5 (1d6 + 2) piercing damage at range": two actions.
  const split = hit.match(new RegExp(`^(?:${DAMAGE}) in melee or (?:${DAMAGE}) at range\\.?(.*)$`));
  if (split && reach && normal) {
    const separator = " in melee or ";
    const melee = hitDamage(hit.slice(0, hit.indexOf(separator)));
    const far = hitDamage(hit.slice(hit.indexOf(separator) + separator.length).replace(/ at range\.?.*$/, ""));
    const rest = note(split[split.length - 1]);
    const status = /\{@dc \d+\}|\{@condition /.test(split[split.length - 1]) ? "partial" : "full";
    return [
      { ...base, name: `${name} (melee)`, attack: { bonus: Number(bonus), type: "melee", reach: Number(reach) }, damage: melee.components, ...(rest ? { note: rest } : {}), status },
      { ...base, name: `${name} (ranged)`, attack: { bonus: Number(bonus), type: "ranged", range: { normal, ...(longRange ? { long: longRange } : {}) } },
        damage: far.components, ...(rest ? { note: rest } : {}), status },
    ];
  }
  const { components, rest } = hitDamage(hit);
  const remainder = note(rest);
  const status = !components.length ? "manual" : /\{@dc \d+\}|\{@condition /.test(rest) ? "partial" : "full";
  // What the hit does beyond its damage, read by rule (fase 5, lotto 0): the console reads it from lot 4.
  const onHit = monsterHitEffects(rest);
  return [{ ...base, damage: components, ...(remainder ? { note: remainder } : {}), ...(Object.keys(onHit).length ? { onHit } : {}), status }];
}

// The sentences of a save that tell what a failure does: the one with the DC and those that open with "On a failed save"
// or "On a failure". Damage told only for a success (the banshee's Wail) is never read as a failure's.
const sentencesOf = (text) => text.split(/(?<=\.)\s+(?=[A-Z{])/);
const OUTCOME_SENTENCE = /^On a (?:fail(?:ed save|ure)|success(?:ful save)?)/;
function failureText(text) {
  const sentences = sentencesOf(text);
  const start = sentences.findIndex((sentence) => /\{@dc \d+\}/.test(sentence));
  if (start < 0) return "";
  return [sentences[start], ...sentences.slice(start + 1).filter((sentence) => /^On a fail(?:ed save|ure)/.test(sentence))].join(" ");
}

// What the console does not automate in a save: the sentences after the DC's, but its outcomes (a repeated save, an
// immunity for 24 hours).
function saveRemainder(text) {
  const sentences = sentencesOf(text);
  const start = sentences.findIndex((sentence) => /\{@dc \d+\}/.test(sentence));
  return note(sentences.slice(start + 1).filter((sentence) => !OUTCOME_SENTENCE.test(sentence)).join(" "));
}

function saveArea(text) {
  let match = text.match(/(\d+)-foot(?:-long)? (cone|line|cube)/);
  if (match) {
    const width = match[2] === "line" ? text.match(/(\d+) feet wide/) : null;
    return { shape: match[2], size: Number(match[1]), ...(width ? { width: Number(width[1]) } : {}) };
  }
  match = text.match(/(\d+)-foot-radius (sphere|cylinder)/) || text.match(/(\d+)-foot (sphere|cylinder)/);
  if (match) return { shape: match[2], size: Number(match[1]) };
  match = text.match(/(?:[Ee]ach|[Aa]ll|[Ee]very)[^.]*? within (\d+) feet of/);
  if (match) return { shape: "sphere", size: Number(match[1]) };
  return null;
}

function saveAction(name, text, extra) {
  const dc = text.match(/\{@dc (\d+)\} (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
  if (!dc) return null;
  const failure = failureText(text);
  const components = [...failure.matchAll(new RegExp(String.raw`(\d+) \(\{@damage ([^}]+)\}\) (\w+) damage`, "g"))].slice(0, 3)
    .map((match) => ({ type: match[3], formula: match[2].replace(/\s+/g, "") }));
  // "or be frightened", "or become", "or fall unconscious", "or be magically charmed", "and be stunned".
  const tagged = failure.match(/(?:\b(?:or|and) (?:be|become|fall|is|are)|\bis|\bbecomes)(?: \w+ly)? \{@condition ([^}|]+)/);
  // The rules of phase 5 (lotto 0): every condition, its duration, the repeated save, the 24-hour immunity, where the
  // area starts. The first condition stays in `condition`, as the console reads it today.
  const effects = monsterSaveEffects(text);
  const condition = effects.conditions[0] || tagged?.[1] || "";
  if (!components.length && !condition) return [{ name, status: "manual", text }];
  const area = saveArea(text);
  const { origin, choice } = area ? monsterActionAreaOrigin(text, area.shape) : {};
  const onFail = condition ? { condition, ...(effects.conditions.length > 1 ? { also: effects.conditions.slice(1) } : {}),
    ...(effects.duration ? { duration: effects.duration } : {}), ...(effects.repeat ? { repeat: effects.repeat } : {}),
    ...(effects.endsOnDamage ? { endsOnDamage: true } : {}) } : null;
  return [{ name, save: { ability: ABILITY_BY_NAME[dc[2].toLowerCase()], dc: Number(dc[1]), half: /half as much damage/.test(text) },
    ...(area ? { area: { ...area, ...(origin ? { origin } : {}), ...(choice ? { choice: true } : {}) } } : {}), ...(onFail ? { onFail } : {}),
    ...(effects.immuneHours ? { immuneHours: effects.immuneHours } : {}),
    damage: components, ...extra, ...(saveRemainder(text) ? { note: saveRemainder(text) } : {}), status: "full" }];
}

// One 5eTools action: zero, one or two stat block actions (a thrown weapon with two damages), each with its status:
// "full" (registered as printed), "partial" (a save or condition on the hit, left in the note), "manual" (the table's).
export function fiveToolsActions(action, { suffix = "" } = {}) {
  const rawName = String(action?.name || "");
  const recharge = rawName.match(/\{@recharge(?: (\d))?\}/);
  const perDay = rawName.match(/\((\d+)\/Day(?:[^)]*)?\)/i);
  const name = `${fiveToolsPlainText(rawName.replace(/\{@recharge[^}]*\}/, "").replace(/\((\d+)\/Day[^)]*\)/i, "")).replace(/\s+/g, " ").trim()}${suffix}`;
  const extra = { ...(recharge ? { recharge: Number(recharge[1] || 6) } : {}), ...(perDay ? { uses: Number(perDay[1]) } : {}) };
  const list = (Array.isArray(action?.entries) ? action.entries : []).find((entry) => entry?.type === "list" && entry.items?.every((item) => item?.name));
  // "Breath Weapons": one action for each breath, the same recharge.
  if (list) return list.items.flatMap((item) => fiveToolsActions({ name: item.name, entries: [entriesText(item.entry ?? item.entries)] })
    .map((entry) => ({ ...entry, ...extra })));
  const text = entriesText(action?.entries);
  return attackAction(name, text, extra) || saveAction(name, text, extra) || [{ name, status: "manual", text }];
}

function defenses(list, field, report) {
  const plain = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (typeof entry === "string") plain.push(entry);
    else if (entry && typeof entry === "object") {
      const types = Array.isArray(entry[field]) ? entry[field].filter((type) => typeof type === "string") : [];
      // "from nonmagical attacks": the plugin does not tell magic weapons apart (decision D3 of phase 2).
      if (types.length) report.push(`${{ resist: "resistenza", immune: "immunità", vulnerable: "vulnerabilità" }[field]} condizionale non importata: ${types.join(", ")}${entry.note ? ` (${fiveToolsPlainText(entry.note)})` : ""}`);
      else if (entry.special) report.push(`difesa speciale: ${fiveToolsPlainText(entry.special)}`);
    }
  }
  return plain;
}

// A monster derived from another (fase 2, lotto 2): `_copy` names its base (name and source) and `_mod` its changes.
// The base comes from the monsters the GM loaded together (pool), a derived base is resolved in turn. The copy's own
// fields replace the base's; the changes 5eTools data use on monsters are applied, the others reported.
// A monster's spells (fase 4, lotto 4). The plugin's catalog is the SRD's: the spells named after a wizard in the
// Monster Manual have their SRD name there; any other name stays as it is, and the sheet's import reports it if unknown.
const SPELL_NAME_ALIASES = Object.freeze({
  "bigby's hand": "Arcane Hand", "drawmij's instant summons": "Instant Summons", "evard's black tentacles": "Black Tentacles",
  "leomund's secret chest": "Secret Chest", "leomund's tiny hut": "Tiny Hut", "melf's acid arrow": "Acid Arrow",
  "mordenkainen's faithful hound": "Faithful Hound", "mordenkainen's magnificent mansion": "Magnificent Mansion",
  "mordenkainen's private sanctum": "Private Sanctum", "mordenkainen's sword": "Arcane Sword", "nystul's magic aura": "Arcanist's Magic Aura",
  "otiluke's freezing sphere": "Freezing Sphere", "otiluke's resilient sphere": "Resilient Sphere", "otto's irresistible dance": "Irresistible Dance",
  "rary's telepathic bond": "Telepathic Bond", "tasha's hideous laughter": "Hideous Laughter", "tenser's floating disk": "Floating Disk",
});
// "The mage has the following wizard spells prepared": the class whose slots the plugin keeps (decision D5).
const SPELLCASTING_CLASSES = Object.freeze({ bard: "bardo", cleric: "chierico", druid: "druido", paladin: "paladino", ranger: "ranger",
  sorcerer: "stregone", warlock: "warlock", wizard: "mago" });
const ORDINAL_LEVEL = /\b(\d{1,2})(?:st|nd|rd|th)-level spellcaster/i;

// One spell of a list: "{@spell levitate} (self only)", "{@spell mage armor}*", "{@spell invisibility|PHB}" → its name.
export function fiveToolsSpellName(value) {
  // A spell the stat block does not print ({ entry, hidden: true }) is still one the monster casts.
  const entry = value && typeof value === "object" ? value.entry : value;
  const tagged = String(entry ?? "").match(/\{@spell ([^}|]+)/);
  const name = (tagged ? tagged[1] : fiveToolsPlainText(entry).replace(/\*+$/, "").replace(/\s*\(.*\)\s*$/, "")).replace(/\s+/g, " ").trim();
  return SPELL_NAME_ALIASES[name.toLowerCase()] || name;
}

// The spellcasting of a monster as the plugin's stat block reads it: { spellSaveDC, spellAttackBonus, classes, spells,
// innateSpells }. The block with slots gives the class and level (their slots are the plugin's, as a character's) and
// the book, all prepared; "at will" and "X/day" give the innate spells, cast without slots. What the plugin cannot keep
// goes to the report.
function fiveToolsSpellcasting(monster, report) {
  const blocks = (Array.isArray(monster.spellcasting) ? monster.spellcasting : []).filter((block) => block && typeof block === "object");
  if (!blocks.length) return {};
  const out = { spells: [], innateSpells: [] };
  const header = (block) => entriesText(block.headerEntries);
  const numberAfter = (text, tag) => {
    const match = String(text).match(new RegExp(String.raw`\{@${tag} (-?\d+)\}`));
    return match ? Number(match[1]) : null;
  };
  // The DC and bonus of the card: the block with slots first, as its are the ones a caster's spells use.
  const ordered = [...blocks.filter((block) => block.spells), ...blocks.filter((block) => !block.spells)];
  for (const block of ordered) {
    const dc = numberAfter(header(block), "dc");
    const hit = numberAfter(header(block), "hit");
    if (out.spellSaveDC === undefined && dc !== null) out.spellSaveDC = dc;
    else if (dc !== null && dc !== out.spellSaveDC) report.push(`${fiveToolsPlainText(block.name || "Spellcasting")}: CD ${dc}, sulla scheda ${out.spellSaveDC}`);
    if (out.spellAttackBonus === undefined && hit !== null) out.spellAttackBonus = hit;
  }
  for (const block of ordered) {
    const name = fiveToolsPlainText(block.name || "Spellcasting");
    if (block.spells && typeof block.spells === "object") {
      for (const level of Object.values(block.spells)) for (const spell of asList(level?.spells)) out.spells.push({ name: fiveToolsSpellName(spell) });
      const text = header(block);
      const level = Number(text.match(ORDINAL_LEVEL)?.[1]);
      const englishClass = Object.keys(SPELLCASTING_CLASSES).find((key) => new RegExp(String.raw`\b${key} spells\b`, "i").test(text));
      if (!out.classes && englishClass && level >= 1 && level <= 20) {
        out.classes = [{ class: englishClass, level }];
        const slotsReport = fiveToolsSlotMismatch(block.spells, [{ classId: SPELLCASTING_CLASSES[englishClass], level }]);
        if (slotsReport) report.push(`${name}: slot dello statblock ${slotsReport.statblock}, quelli del plugin per ${englishClass} ${level} ${slotsReport.plugin}`);
      } else if (!out.classes) {
        report.push(`${name}: incantatore senza classe, gli slot restano al tavolo`);
      }
    }
    for (const spell of asList(block.will)) out.innateSpells.push({ name: fiveToolsSpellName(spell) });
    // As the stat block prints them, the most uses first ("3/day each", then "1/day each").
    const daily = Object.entries(block.daily && typeof block.daily === "object" ? block.daily : {})
      .sort(([left], [right]) => Number.parseInt(right, 10) - Number.parseInt(left, 10));
    for (const [key, list] of daily) {
      const perDay = Number.parseInt(key, 10);
      if (!(perDay >= 1)) continue;
      const spells = asList(list).map(fiveToolsSpellName);
      for (const spell of spells) out.innateSpells.push({ name: spell, perDay });
      // "3/day" without "each": one pool for all of them; the plugin gives each one its own uses.
      if (!key.endsWith("e") && spells.length > 1) report.push(`${perDay}/giorno in comune tra ${spells.join(", ")}: ognuno ha i suoi usi, il totale si tiene al tavolo`);
    }
    for (const field of ["weekly", "rest", "recharge", "charges"]) {
      if (block[field]) report.push(`${name}: incantesimi a uso ${field === "weekly" ? "settimanale" : field === "rest" ? "per riposo" : "a ricarica"} da gestire al tavolo`);
    }
  }
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
}

// The tracker's Leggendario mode (lotto 5): { actions, resistances } from the legendary actions (3 unless the stat block
// says otherwise) and "Legendary Resistance (N/Day)", or null without legendary actions.
function fiveToolsLegendary(monster, report) {
  const resistance = (Array.isArray(monster.trait) ? monster.trait : [])
    .map((trait) => fiveToolsPlainText(trait?.name || "")).find((name) => /^Legendary Resistance\b/i.test(name)) || "";
  const resistances = Number(resistance.match(/\((\d+)\/Day/i)?.[1]) || 0;
  if (!Array.isArray(monster.legendary) || !monster.legendary.length) {
    if (resistance) report.push(`${resistance} senza azioni leggendarie: le resistenze si tengono al tavolo`);
    return null;
  }
  if (/in this form/i.test(resistance)) report.push(`${resistance}: il contatore vale per la forma importata`);
  const actions = Math.floor(Number(monster.legendaryActions)) || 3;
  return { actions: Math.max(1, Math.min(5, actions)), resistances: Math.max(0, Math.min(5, resistances)) };
}

// The stat block's slots against the plugin's for the class: "" when they are the same.
function fiveToolsSlotMismatch(levels, characterBuild) {
  const { slots, pact } = spellSlotMaximums(characterBuild);
  const plugin = pact ? `${pact.count}×${pact.level}°` : Object.entries(slots).map(([level, count]) => `${count}×${level}°`).join(" ");
  const statblock = Object.entries(levels).filter(([, level]) => Number(level?.slots) > 0)
    .map(([level, entry]) => `${entry.slots}×${level}°`).join(" ");
  return statblock && statblock !== plugin ? { statblock, plugin: plugin || "nessuno" } : null;
}

// The stat block as 5eTools prints it, for the GM to read (fase 4, lotto 4b): { header: [{ label, text }], sections:
// [{ title, entries: [{ name, text }] }] }, in English, the tags made plain. Pure; nothing here is guessed or translated.
const SIZE_NAMES = Object.freeze({ T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" });
const ALIGNMENT_NAMES = Object.freeze({ L: "lawful", N: "neutral", C: "chaotic", G: "good", E: "evil", U: "unaligned", A: "any alignment" });
const ABILITY_ORDER = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const SPELL_LEVEL_NAMES = Object.freeze(["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"]);

function plainList(value) {
  return asList(value).map((entry) => {
    if (typeof entry === "string") return fiveToolsPlainText(entry);
    if (entry?.special) return fiveToolsPlainText(entry.special);
    const inner = Object.entries(entry || {}).find(([, list]) => Array.isArray(list))?.[1];
    return [fiveToolsPlainText(entry?.preNote || ""), inner ? plainList(inner) : "", fiveToolsPlainText(entry?.note || "")].filter(Boolean).join(" ");
  }).filter(Boolean).join(", ");
}

function fiveToolsHeader(monster) {
  const rows = [];
  const add = (label, text) => { if (text) rows.push({ label, text }); };
  const type = typeof monster.type === "string" ? monster.type
    : monster.type?.type ? `${typeof monster.type.type === "string" ? monster.type.type : plainList(monster.type.type?.choose)}${monster.type.tags?.length ? ` (${monster.type.tags.map((tag) => (typeof tag === "string" ? tag : [tag?.prefixHidden ? "" : tag?.prefix, tag?.tag].filter(Boolean).join(" "))).join(", ")})` : ""}` : "";
  const alignment = asList(monster.alignment).every((entry) => typeof entry === "string")
    ? asList(monster.alignment).map((code) => ALIGNMENT_NAMES[code] || "").filter(Boolean).join(" ") : "";
  add("", [asList(monster.size).map((code) => SIZE_NAMES[code] || code).join(" or "), type].filter(Boolean).join(" ") + (alignment ? `, ${alignment}` : ""));
  // "12 (15 with mage armor)": an alternative AC in braces follows the one before it.
  add("Armor Class", asList(monster.ac).map((entry) => {
    if (typeof entry === "number") return String(entry);
    const text = `${entry?.ac ?? ""}${entry?.from ? ` (${entry.from.map(fiveToolsPlainText).join(", ")})` : ""}${entry?.condition ? ` ${fiveToolsPlainText(entry.condition)}` : ""}`;
    return entry?.braces ? `(${text})` : text;
  }).join(", ").replace(/, \(/g, " ("));
  add("Hit Points", monster.hp ? (Number.isFinite(monster.hp.average) ? `${monster.hp.average}${monster.hp.formula ? ` (${monster.hp.formula})` : ""}` : fiveToolsPlainText(monster.hp.special || "")) : "");
  add("Speed", Object.entries(monster.speed && typeof monster.speed === "object" ? monster.speed : {}).filter(([mode]) => mode !== "canHover")
    .map(([mode, value]) => {
      const feet = typeof value === "object" ? `${value?.number ?? ""} ft.${value?.condition ? ` ${fiveToolsPlainText(value.condition)}` : ""}` : `${value} ft.`;
      return mode === "walk" ? feet : `${mode} ${feet}`;
    }).join(", "));
  if (ABILITY_ORDER.some((key) => Number.isFinite(monster[key]))) {
    add("", ABILITY_ORDER.map((key) => {
      const score = Number(monster[key]);
      const modifier = Math.floor((score - 10) / 2);
      // No break inside a score: "CHA 12 (+1)" stays on one line.
      return Number.isFinite(score) ? `${key.toUpperCase()} ${score} (${modifier >= 0 ? "+" : "−"}${Math.abs(modifier)})` : "";
    }).filter(Boolean).join("  "));
  }
  const bonuses = (value) => Object.entries(value && typeof value === "object" ? value : {})
    .filter(([, bonus]) => typeof bonus === "string" || typeof bonus === "number")
    .map(([key, bonus]) => `${key.length === 3 ? key[0].toUpperCase() + key.slice(1) : key.replace(/^\w/, (letter) => letter.toUpperCase())} ${bonus}`).join(", ");
  add("Saving Throws", bonuses(monster.save));
  add("Skills", bonuses(monster.skill));
  add("Damage Vulnerabilities", plainList(monster.vulnerable));
  add("Damage Resistances", plainList(monster.resist));
  add("Damage Immunities", plainList(monster.immune));
  add("Condition Immunities", plainList(monster.conditionImmune));
  add("Senses", [plainList(monster.senses), Number.isFinite(monster.passive) ? `passive Perception ${monster.passive}` : ""].filter(Boolean).join(", "));
  add("Languages", plainList(monster.languages) || (monster.languages === null ? "—" : ""));
  add("Challenge", typeof monster.cr === "string" ? monster.cr : monster.cr?.cr ? `${monster.cr.cr}${monster.cr.lair ? ` (${monster.cr.lair} in lair)` : ""}` : "");
  return rows;
}

function spellcastingText(block) {
  const list = (spells) => asList(spells).filter((entry) => !(entry && typeof entry === "object" && entry.hidden))
    .map((entry) => fiveToolsPlainText(entry && typeof entry === "object" ? entry.entry : entry)).filter(Boolean).join(", ");
  const lines = [entriesText(block.headerEntries)];
  for (const [level, entry] of Object.entries(block.spells && typeof block.spells === "object" ? block.spells : {})) {
    const slots = Number(entry?.slots) > 0 ? ` (${entry.slots} slot${entry.slots === 1 ? "" : "s"}${entry.lower ? `, level ${level}` : ""})` : level === "0" ? " (at will)" : "";
    lines.push(`${SPELL_LEVEL_NAMES[Number(level)] || `Level ${level}`}${slots}: ${list(entry?.spells)}`);
  }
  if (block.will) lines.push(`At will: ${list(block.will)}`);
  const daily = Object.entries(block.daily && typeof block.daily === "object" ? block.daily : {})
    .sort(([left], [right]) => Number.parseInt(right, 10) - Number.parseInt(left, 10));
  for (const [key, spells] of daily) lines.push(`${Number.parseInt(key, 10)}/day${key.endsWith("e") ? " each" : ""}: ${list(spells)}`);
  for (const [key, label] of [["weekly", "week"], ["rest", "rest"]]) {
    for (const [count, spells] of Object.entries(block[key] && typeof block[key] === "object" ? block[key] : {})) {
      lines.push(`${Number.parseInt(count, 10)}/${label}${count.endsWith("e") ? " each" : ""}: ${list(spells)}`);
    }
  }
  if (block.footerEntries) lines.push(entriesText(block.footerEntries));
  return lines.map(fiveToolsPlainText).filter(Boolean).join("\n");
}

export function fiveToolsStatblockSections(monster) {
  if (!monster || typeof monster !== "object") return { header: [], sections: [] };
  const named = (list) => asList(list).filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({ name: fiveToolsPlainText(entry.name || ""), text: fiveToolsPlainText(entriesText(entry.entries ?? entry.entry)) }))
    .filter((entry) => entry.name || entry.text);
  const shortName = String(monster.shortName === true ? monster.name : monster.shortName || monster.name || "").toLowerCase();
  const legendaryIntro = monster.legendaryHeader ? fiveToolsPlainText(entriesText(monster.legendaryHeader))
    : `The ${shortName} can take ${monster.legendaryActions || 3} legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The ${shortName} regains spent legendary actions at the start of its turn.`;
  const sections = [
    { title: "", entries: [...named(monster.trait), ...asList(monster.spellcasting).filter((block) => block && typeof block === "object")
      .map((block) => ({ name: fiveToolsPlainText(block.name || "Spellcasting"), text: spellcastingText(block) }))] },
    { title: "Actions", entries: named(monster.action) },
    { title: "Bonus Actions", entries: named(monster.bonus) },
    { title: "Reactions", entries: named(monster.reaction) },
    { title: "Legendary Actions", entries: monster.legendary ? [{ name: "", text: legendaryIntro }, ...named(monster.legendary)] : [] },
    { title: "Mythic Actions", entries: monster.mythic ? [...(monster.mythicHeader ? [{ name: "", text: fiveToolsPlainText(entriesText(monster.mythicHeader)) }] : []), ...named(monster.mythic)] : [] },
  ].filter((section) => section.entries.length);
  return { header: fiveToolsHeader(monster), sections };
}

const MOD_TEXT_PROPS = Object.freeze(["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"]);
const MOD_ARRAY_MODES = new Set(["prependArr", "appendArr", "insertArr", "removeArr", "replaceArr", "replaceOrAppendArr", "appendIfNotExistsArr"]);
const monsterKey = (name, source) => `${String(name || "").trim().toLowerCase()}|${String(source || "").trim().toLowerCase()}`;
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const asList = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

// The text of entries, never the names of the actions: "the goliath" becomes "Aruk" in what the actions say.
function replaceText(value, pattern, replacement) {
  if (typeof value === "string") return value.replace(pattern, replacement);
  if (Array.isArray(value)) return value.map((entry) => replaceText(entry, pattern, replacement));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === "name" ? entry : replaceText(entry, pattern, replacement)]));
  }
  return value;
}

function arrayMod(list, op, report, where) {
  const current = asList(list);
  const items = asList(op.items).map(clone);
  const byName = (target) => (entry) => typeof target === "string" && String(entry?.name ?? entry) === target;
  const indexOf = (target) => (typeof target === "object" && Number.isInteger(target?.index) ? target.index
    : target && typeof target === "object" && target.regex ? current.findIndex((entry) => new RegExp(target.regex, target.flags || "").test(String(entry?.name ?? entry)))
      : current.findIndex(byName(target)));
  switch (op.mode) {
    case "prependArr": return [...items, ...current];
    case "appendArr": return [...current, ...items];
    case "insertArr": return [...current.slice(0, op.index ?? current.length), ...items, ...current.slice(op.index ?? current.length)];
    case "appendIfNotExistsArr": return [...current, ...items.filter((item) => !current.some((entry) => String(entry?.name ?? entry) === String(item?.name ?? item)))];
    case "removeArr": {
      const names = asList(op.names);
      return current.filter((entry) => !names.includes(String(entry?.name ?? entry))
        && !asList(op.items).some((item) => JSON.stringify(item) === JSON.stringify(entry)));
    }
    case "replaceArr":
    case "replaceOrAppendArr": {
      const index = indexOf(op.replace);
      if (index < 0) {
        if (op.mode === "replaceOrAppendArr") return [...current, ...items];
        report.push(`${where}: «${typeof op.replace === "string" ? op.replace : "voce"}» da sostituire non trovata`);
        return current;
      }
      return [...current.slice(0, index), ...items, ...current.slice(index + 1)];
    }
    default: return current;
  }
}

function applyMods(monster, mods, report) {
  const result = monster;
  for (const [prop, ops] of Object.entries(mods || {})) {
    for (const op of asList(ops)) {
      const mode = typeof op === "string" ? op : op?.mode;
      const targets = prop === "*" ? MOD_TEXT_PROPS.filter((name) => result[name] !== undefined) : [prop];
      if (mode === "remove" && prop !== "*" && prop !== "_") delete result[prop];
      else if (mode === "replaceTxt" && op.replace) {
        const pattern = new RegExp(op.replace, `g${String(op.flags || "").replace(/g/g, "")}`);
        for (const name of targets) if (result[name] !== undefined) result[name] = replaceText(result[name], pattern, op.with ?? "");
      } else if (MOD_ARRAY_MODES.has(mode) && prop !== "*" && prop !== "_") result[prop] = arrayMod(result[prop], op, report, prop);
      else report.push(`modifica di 5eTools ignorata: ${mode || "?"}${prop === "_" || prop === "*" ? "" : ` (${prop})`}`);
    }
  }
  return result;
}

/**
 * The monster with its `_copy` resolved: { monster, report, error }. pool: every monster loaded with it (files,
 * pasted blocks). A missing base names the book to load; a chain deeper than 5, or a loop, is refused.
 */
export function resolveFiveToolsMonster(monster, pool = [], seen = new Set()) {
  if (!monster?._copy) return { monster, report: [], error: "" };
  const { name, source, _mod: mods, _templates: templates, ...copyRest } = monster._copy;
  const key = monsterKey(name, source);
  if (seen.has(key) || seen.size >= 5) return { monster: null, report: [], error: `${monster.name}: catena di mostri derivati non risolvibile.` };
  const base = pool.find((entry) => monsterKey(entry?.name, entry?.source) === key);
  // missingSource: the book to load (or download from the archive, fase 3) for the base.
  if (!base) return { monster: null, report: [], missingSource: String(source || ""), error: `${monster.name} deriva da ${name} (${source}): carica anche il bestiario ${source}.` };
  // The merged monster carries the copy's own source: a 2024 base is caught here, before it.
  if (isFiveTools2024(base)) return { monster: null, report: [], error: `${monster.name} deriva da ${name} (${source}), un mostro delle regole 2024: il plugin usa quelle del 2014.` };
  const resolvedBase = resolveFiveToolsMonster(base, pool, new Set([...seen, key]));
  if (resolvedBase.error) return { monster: null, report: [], ...(resolvedBase.missingSource ? { missingSource: resolvedBase.missingSource } : {}), error: resolvedBase.error };
  const report = [`derivato da ${name} (${source})`, ...resolvedBase.report.filter((line) => !line.startsWith("derivato da"))];
  const { _copy: _ignored, ...own } = monster;
  const merged = { ...clone(resolvedBase.monster), ...clone(copyRest), ...clone(own) };
  delete merged._copy;
  applyMods(merged, mods, report);
  if (asList(templates).length) report.push(`modelli di 5eTools ignorati: ${asList(templates).map((entry) => entry?.name).filter(Boolean).join(", ")}`);
  return { monster: merged, report, error: "" };
}

/**
 * A 5eTools monster as a stat block of phase 1: { block, report, error }. block goes to the sheet's import as it is;
 * report lists, in Italian, what stays at the table (traits, legendary actions, spells, conditional defenses, the
 * actions with neither damage nor save) and, for a derived monster, its base; error refuses the monster (2024 data, a
 * derived monster whose base is not in pool, the monsters loaded with it).
 */
export function fiveToolsMonsterToStatblock(input, { pool = [] } = {}) {
  if (!input || typeof input !== "object" || typeof input.name !== "string") return { block: null, report: [], error: "Non è un mostro di 5eTools." };
  if (isFiveTools2024(input)) return { block: null, report: [], error: `${input.name} (${input.source}) è un mostro delle regole 2024: il plugin usa quelle del 2014.` };
  const resolved = resolveFiveToolsMonster(input, pool);
  if (resolved.error) return { block: null, report: [], ...(resolved.missingSource ? { missingSource: resolved.missingSource } : {}), error: resolved.error };
  const monster = resolved.monster;
  const report = [...resolved.report];
  const actions = [];
  const counts = { full: 0, partial: 0, manual: 0 };
  let multiattack = "";
  for (const [list, suffix] of [[monster.action, ""], [monster.bonus, " (bonus action)"]]) {
    for (const action of Array.isArray(list) ? list : []) {
      if (/^Multiattack/i.test(String(action?.name || ""))) {
        multiattack = note(entriesText(action.entries));
        continue;
      }
      for (const entry of fiveToolsActions(action, { suffix })) {
        counts[entry.status] += 1;
        if (entry.status === "manual") report.push(`da gestire al tavolo: ${entry.name}`);
        else if (entry.status === "partial") report.push(`${entry.name}: il tiro salvezza o la condizione al colpo resta nella nota`);
        if (entry.status === "manual") continue;
        const { status: _status, ...rest } = entry;
        actions.push(rest);
      }
    }
  }
  const ac = Array.isArray(monster.ac) ? monster.ac[0] : monster.ac;
  const armorClass = typeof ac === "number" ? ac : Number(ac?.ac) || null;
  const walk = typeof monster.speed?.walk === "object" ? monster.speed.walk.number : monster.speed?.walk;
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].filter((key) => Number.isFinite(monster[key])).map((key) => [key, monster[key]]));
  const savingThrows = monster.save && typeof monster.save === "object" ? { ...monster.save } : null;
  const damageDefenses = {
    resistances: defenses(monster.resist, "resist", report),
    immunities: defenses(monster.immune, "immune", report),
    vulnerabilities: defenses(monster.vulnerable, "vulnerable", report),
  };
  const conditionImmune = (Array.isArray(monster.conditionImmune) ? monster.conditionImmune : [])
    .flatMap((entry) => (typeof entry === "string" ? [entry] : Array.isArray(entry?.conditionImmune) ? entry.conditionImmune : []))
    .map((entry) => (entry === "exhaustion" ? "indebolimento" : monsterImportConditionName(entry).toLocaleLowerCase("it") || entry));
  const traits = (Array.isArray(monster.trait) ? monster.trait : []).map((trait) => fiveToolsPlainText(trait?.name || "")).filter(Boolean);
  const notes = [traits.length ? `Tratti: ${traits.join(", ")}.` : "", conditionImmune.length ? `Immune a: ${conditionImmune.join(", ")}.` : ""].filter(Boolean).join(" ");
  // Traits, reactions and legendary actions are read in the console's Capacità tab (fase 4, lotto 5).
  if (traits.length) report.push(`tratti da leggere nella console (Capacità): ${traits.join(", ")}`);
  const legendary = fiveToolsLegendary(monster, report);
  const spellcasting = fiveToolsSpellcasting(monster, report);
  if (Array.isArray(monster.reaction) && monster.reaction.length) report.push(`reazioni da leggere nella console (Capacità): ${monster.reaction.map((entry) => fiveToolsPlainText(entry?.name || "")).join(", ")}`);
  if (monster.hp && !Number.isFinite(monster.hp.average)) report.push(`punti ferita speciali: ${fiveToolsPlainText(monster.hp.special || "")}`);
  const portrait = fiveToolsTokenPath({ ...monster, name: input.name, source: input.source });
  // The monster as read, kept in the GM's browser for its full stat block (lotto 4b).
  const resolvedMonster = { ...monster, name: input.name, source: input.source };
  const block = {
    kind: "monster", source: "5etools", ref: `${input.name}|${input.source}`, name: monster.name,
    // Its token image in 5eTools' image mirror (fase 4, lotto 3): the path; the sheet adds the mirror's address.
    ...(portrait ? { portrait: { fiveTools: portrait } } : {}),
    ...(armorClass ? { armorClass } : {}),
    ...spellcasting,
    ...(legendary ? { legendary } : {}),
    // The console's «Immune» and Evasion (fase 5, lotto 2): the conditions it is immune to, an Evasion trait.
    ...(conditionImmune.length ? { conditionImmunities: conditionImmune } : {}),
    ...(traits.some((name) => /^Evasion$/i.test(name)) ? { evasion: true } : {}),
    ...(Number.isFinite(monster.hp?.average) ? { hitPoints: { average: monster.hp.average, ...(monster.hp.formula ? { formula: monster.hp.formula } : {}) } } : {}),
    ...(Number.isFinite(walk) && walk > 0 ? { speed: `${walk} ft` } : {}),
    ...(Object.keys(abilities).length ? { abilities } : {}),
    ...(savingThrows ? { savingThrows } : {}),
    ...(Number.isFinite(monster.passive) ? { passivePerception: monster.passive } : {}),
    ...(Object.values(damageDefenses).some((list) => list.length) ? { damageDefenses } : {}),
    ...(multiattack ? { multiattack } : {}),
    ...(notes ? { notes: notes.length > MAX_NOTE ? `${notes.slice(0, MAX_NOTE - 1).trimEnd()}…` : notes } : {}),
    actions,
  };
  return { block, report, counts, monster: resolvedMonster, error: "" };
}

// The monsters of everything the GM loaded in the sheet (files and pasted blocks, fase 2, lotto 3): one entry per name
// and source, the last one loaded winning, sorted by name. The 2024 monsters are counted and left out of the list
// (decision D6): the derived monsters still find a 2014 base among all the loaded ones (pool).
export function fiveToolsCollection(inputs = []) {
  const byKey = new Map();
  for (const input of inputs) for (const monster of fiveToolsMonsters(input)) byKey.set(monsterKey(monster.name, monster.source), monster);
  const pool = [...byKey.values()];
  const modern = pool.filter(isFiveTools2024);
  const monsters = pool.filter((monster) => !isFiveTools2024(monster))
    .sort((left, right) => left.name.localeCompare(right.name, "en") || left.source.localeCompare(right.source));
  return { pool, monsters, excluded2024: modern.length, sources: [...new Set(monsters.map((monster) => monster.source))].sort() };
}

export function fiveToolsMonsterLabel(monster) {
  return `${monster?.name || ""} (${monster?.source || ""})${monster?._copy ? " · derivato" : ""}`;
}

// The monsters whose name or source holds every word of the query (case and accents aside), at most `limit`.
export function fiveToolsSearch(monsters = [], query = "", limit = 200) {
  const plain = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = plain(query).split(/\s+/).filter(Boolean);
  return monsters.filter((monster) => words.every((word) => plain(`${monster.name} ${monster.source}`).includes(word))).slice(0, limit);
}

// The line over the sections: where the monster comes from and how much of it the console registers.
export function fiveToolsImportSummary({ block, counts } = {}, monster = {}) {
  const parts = [`${counts?.full || 0} ${counts?.full === 1 ? "azione registrabile" : "azioni registrabili"}`];
  if (counts?.partial) parts.push(`${counts.partial} con il tiro salvezza al colpo nella nota`);
  if (counts?.manual) parts.push(`${counts.manual} da gestire al tavolo`);
  return `Da 5eTools (${monster.source || "?"}): ${block?.name || monster.name || ""}, ${parts.join(", ")}.`;
}
