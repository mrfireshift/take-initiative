// A monster's stat block pasted as text (statblock da testo, lotto ST1, docs/STUDIO_IMPORT_STATBLOCK_TESTO.md): read into a
// 5eTools monster, which fiveToolsMonsterToStatblock() then reads as any other (decision D1), so the rules that read the
// actions live in one place. Pure. English 2014 stat blocks as the Monster Manual prints them, copied from a PDF, from
// D&D Beyond or from Homebrewery and GM Binder (their Markdown). The fixed phrases get 5eTools' tags back ("Melee Weapon
// Attack: +4 to hit" → "{@atk mw} {@hit 4} to hit"); everything else stays as written. What it cannot place is never
// guessed: a header line it does not know and a section it does not read (lair actions, regional effects) go to the
// report and to a last trait, «Testo non letto» (decision D5). The 2024 stat blocks and the Italian ones come later
// (lotti ST4 e ST6): for now they are refused with a message.

export const STATBLOCK_TEXT_SOURCE = "testo";
export const MAX_STATBLOCK_TEXT = 20000;
export const UNREAD_TEXT_TRAIT = "Testo non letto";

// What a copy from a PDF or a web page brings along: invisible characters, wide spaces, ligatures, typographic quotes,
// the minus sign (U+2212). Built from their codes, so the source stays readable.
const char = (code) => String.fromCharCode(code);
const INVISIBLE = new RegExp(`[${[0xad, 0x200b, 0x200c, 0x200d, 0xfeff].map(char).join("")}]`, "g");
const WIDE_SPACES = new RegExp(`[${[0x9, 0xa0, 0x2007, 0x2009, 0x202f].map(char).join("")}]`, "g");
const LIGATURES = Object.freeze([[0xfb00, "ff"], [0xfb01, "fi"], [0xfb02, "fl"], [0xfb03, "ffi"], [0xfb04, "ffl"]].map(([code, text]) => [char(code), text]));
const SINGLE_QUOTES = new RegExp(`[${char(0x2018)}${char(0x2019)}]`, "g");
const DOUBLE_QUOTES = new RegExp(`[${char(0x201c)}${char(0x201d)}]`, "g");
// The minus sign stays in the prose, as the book prints it, and becomes "-" only in the numbers the plugin reads.
const MINUS = new RegExp(char(0x2212), "g");
const hyphenMinus = (text) => String(text).replace(MINUS, "-");

const SIZE_CODES = Object.freeze({ tiny: "T", small: "S", medium: "M", large: "L", huge: "H", gargantuan: "G" });
const TYPE_LINE = /^(tiny|small|medium|large|huge|gargantuan)(?:\s+or\s+(tiny|small|medium|large|huge|gargantuan))?\s+(\S.*)$/i;
const ALIGNMENTS = Object.freeze({
  "lawful good": ["L", "G"], "neutral good": ["N", "G"], "chaotic good": ["C", "G"], "lawful neutral": ["L", "N"], neutral: ["N"],
  "chaotic neutral": ["C", "N"], "lawful evil": ["L", "E"], "neutral evil": ["N", "E"], "chaotic evil": ["C", "E"], unaligned: ["U"],
  "any alignment": ["A"],
});
const HEADER_LABELS = Object.freeze([
  ["armor class", "ac"], ["hit points", "hp"], ["speed", "speed"], ["saving throws", "save"], ["skills", "skill"],
  ["damage vulnerabilities", "vulnerable"], ["damage resistances", "resist"], ["damage immunities", "immune"],
  ["condition immunities", "conditionImmune"], ["senses", "senses"], ["languages", "languages"], ["challenge", "cr"],
  ["proficiency bonus", "pb"],
]);
const HEADINGS = Object.freeze({ ACTIONS: "action", BONUSACTIONS: "bonus", REACTIONS: "reaction", LEGENDARYACTIONS: "legendary",
  MYTHICACTIONS: "mythic", LAIRACTIONS: "lair", REGIONALEFFECTS: "regional" });
const UNREAD_SECTIONS = Object.freeze({ lair: "Lair Actions", regional: "Regional Effects" });
const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const ABILITY_BY_NAME = Object.freeze({ str: "str", strength: "str", dex: "dex", dexterity: "dex", con: "con", constitution: "con",
  int: "int", intelligence: "int", wis: "wis", wisdom: "wis", cha: "cha", charisma: "cha" });
const ABILITY_LINE = /^(?:\s|\||STR|DEX|CON|INT|WIS|CHA|\d+|\(\s*[+\-−]?\s*\d+\s*\))+$/i;
const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";
const DAMAGE_RUN = new RegExp(String.raw`^(.*?)\b((?:${DAMAGE_TYPES})(?:(?:,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+)(?:${DAMAGE_TYPES}))*)\b(.*)$`, "i");
const PHYSICAL_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);
const CONDITION_WORDS = /\b(blinded|charmed|deafened|exhaustion|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b/g;
const ATTACK_CODES = Object.freeze({ "melee or ranged weapon attack": "mw,rw", "melee or ranged spell attack": "ms,rs", "melee weapon attack": "mw",
  "ranged weapon attack": "rw", "melee spell attack": "ms", "ranged spell attack": "rs" });
const ATTACK_LEAD = /^(Melee or Ranged Weapon Attack|Melee or Ranged Spell Attack|Melee Weapon Attack|Ranged Weapon Attack|Melee Spell Attack|Ranged Spell Attack):\s*([+\-−]?\d+) to hit\b/i;
// A spell list: "Cantrips (at will):", "1st level (4 slots):", "1st–5th level (3 5th-level slots):", "At will:", "3/day each:".
const SPELL_LEVEL_LINE = /^(?:(Cantrips)|(\d)(?:st|nd|rd|th)(?:\s*[-–]\s*(\d)(?:st|nd|rd|th))?[- ]level)\s*\(([^)]*)\)\s*:\s*(.*)$/i;
const SPELL_USES_LINE = /^(At will|(\d+)\/(day|week|rest)( each)?)\s*:\s*(.*)$/i;
const SPELL_LIST_START = /\s+(?=(?:Cantrips \(at will\)|\d(?:st|nd|rd|th)(?:\s*[-–]\s*\d(?:st|nd|rd|th))?[- ]level \([^)]*\)|At will|\d+\/(?:day|week|rest)(?: each)?):)/i;
const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "vs"]);
// The 2024 stat block ("AC 15 Initiative +2 (12)", "Melee Attack Roll: +4", "Dexterity Saving Throw: DC 13") and the Italian
// one ("Classe Armatura", "Punti Ferita"): not read yet.
const RULES_2024 = /^(?:AC \d+|HP \d+|CR [\d/]+)\b|\b(?:Melee|Ranged|Melee or Ranged) Attack Roll:|\b(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC \d+/m;
const ITALIAN = /^\W*(?:Classe Armatura|Punti Ferita)\b/im;

const textOf = (lines) => lines.join(" ").replace(/\s+/g, " ").trim();

// "a, b (c, d), e" → ["a", "b (c, d)", "e"]: the separators inside parentheses do not split.
function splitTop(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const letter = text[index];
    if (letter === "(") depth += 1;
    else if (letter === ")") depth = Math.max(0, depth - 1);
    else if (letter === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

// The name of an entry: words with a capital letter (the small ones aside), what is in parentheses not counted, at most
// 60 characters. "Multiattack (Humanoid or Hybrid Form Only)", "Wing Attack (Costs 2 Actions)"; never "The lich can take".
export function isStatblockEntryName(name) {
  const core = String(name || "").replace(/\s*\([^()]*\)/g, "").trim();
  if (!core || core.length > 60 || /[:;]$/.test(core)) return false;
  return core.split(/\s+/).every((word, index) => /^[A-Z0-9"'(]/.test(word) || (index > 0 && MINOR_WORDS.has(word.toLowerCase())));
}

// The text looks like a stat block: an armor class and hit points, in English or Italian, 2014 or 2024.
export function looksLikeStatblockText(text) {
  const value = String(text ?? "");
  return /^\W*(?:Armor Class|AC|Classe Armatura|CA)\s+\d/im.test(value) && /^\W*(?:Hit Points|HP|Punti Ferita|PF)\s+\d/im.test(value);
}

function normalizedLines(text, report) {
  let value = String(text ?? "");
  if (value.length > MAX_STATBLOCK_TEXT) {
    value = value.slice(0, MAX_STATBLOCK_TEXT);
    report.push("testo tagliato a 20.000 caratteri");
  }
  value = value.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(WIDE_SPACES, " ").replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
  for (const [from, to] of LIGATURES) value = value.split(from).join(to);
  return value.split("\n").map((line) => ({ text: line.replace(/ {2,}/g, " ").trim() }));
}

// Homebrewery and GM Binder: "> - **Armor Class** 15", "***Nimble Escape.*** …", "|STR|DEX|…|", "### Actions",
// "{{monster,frame". The markup goes; "***Name.***" stays as the sure start of an entry.
function isMarkdown(lines) {
  return lines.some(({ text }) => /^>|^#{1,4} |^\{\{|^_{3,}$|\*\*\*[^*]+\*\*\*|^\*\*[^*]+\*\*/.test(text));
}

function fromMarkdown(lines) {
  const out = [];
  for (const { text: raw } of lines) {
    let text = raw.replace(/^(?:>\s*)+/, "").replace(/^[-*]\s+(?=\*\*)/, "").replace(/^#{1,6}\s+/, "").trim();
    if (/^\{\{|^\}\}$|^\\(?:pagebreak|column)\b|^_{3,}$|^-{3,}$|^:+$/.test(text)) continue;
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/.test(text)) continue;
    if (/^\|.*\|$/.test(text)) text = text.split("|").map((cell) => cell.trim()).filter(Boolean).join(" ");
    let name = "";
    const marked = text.match(/^(?:\*{3}|_\*\*|\*\*_)\s*([^*_]+?)\s*(?:\*{3}|\*\*_|_\*\*)\s*(\.?)\s*/);
    if (marked && (/\.$/.test(marked[1]) || marked[2])) {
      name = marked[1].replace(/\.$/, "").trim();
      text = text.slice(marked[0].length);
    }
    text = text.replace(/\s*::\s*/g, " ").replace(/\*{1,3}([^*]+?)\*{1,3}/g, "$1").replace(/(^|\s)_([^_]+?)_(?=\s|[.,:;]|$)/g, "$1$2")
      .replace(/\\([*_|])/g, "$1").replace(/ {2,}/g, " ").trim();
    if (name) out.push({ text, name });
    else out.push({ text });
  }
  return out;
}

// "satu-" and "rated" on the next line are one word, between two lowercase letters only; "30-" and "foot cone" keep
// their hyphen ("30-foot cone").
function joinHyphenated(lines) {
  const out = [];
  for (const line of lines) {
    const previous = out.at(-1);
    if (previous && !line.name && /\d-$/.test(previous.text) && /^[a-z]/.test(line.text)) previous.text = `${previous.text}${line.text}`;
    else if (previous && !line.name && /[a-z]-$/.test(previous.text) && /^[a-z]/.test(line.text)) previous.text = `${previous.text.slice(0, -1)}${line.text}`;
    else out.push({ ...line });
  }
  return out;
}

function headerLabel(text) {
  const lower = text.toLowerCase();
  for (const [label, field] of HEADER_LABELS) {
    if (lower === label || lower.startsWith(`${label} `) || lower.startsWith(`${label}:`)) return { field, value: text.slice(label.length).replace(/^:?\s*/, "") };
  }
  return null;
}

function headingOf(text) {
  if (!/^[A-Z]/.test(text) || /\.$/.test(text)) return "";
  return HEADINGS[text.replace(/[^A-Za-z]/g, "").toUpperCase()] || "";
}

// A new entry starts a line: "Name. text", after a line that ends a sentence (a PDF breaks lines anywhere), a heading, a
// blank line, a list of spells or a whole paragraph (a line of 100 characters or more is never a column of a PDF); or
// anywhere when an attack follows its name ("Javelin. Melee or Ranged Weapon Attack:"), or for a spellcasting. A long name
// is one with its parentheses ("Psychic Screech (Hybrid Form Only; Recharges after a Short or Long Rest)").
const PARAGRAPH_LINE = 100;
function entryStart(text, previous) {
  const match = text.match(/^([A-Z][^.]{0,120}?)\.(?:\s+(.*))?$/);
  if (!match || !isStatblockEntryName(match[1])) return null;
  const rest = (match[2] || "").trim();
  const after = previous.kind !== "text" || /[.!?:)"']$/.test(previous.text) || previous.text.length >= PARAGRAPH_LINE
    || SPELL_LEVEL_LINE.test(previous.text) || SPELL_USES_LINE.test(previous.text) || ATTACK_LEAD.test(rest) || /\bSpellcasting\b/.test(match[1]);
  return after ? { name: match[1].trim(), rest } : null;
}

function titleCase(name) {
  if (/[a-z]/.test(name)) return name;
  return name.toLowerCase().split(/\s+/).map((word, index) => (index > 0 && MINOR_WORDS.has(word) ? word : word.replace(/^[a-z]/, (letter) => letter.toUpperCase()))).join(" ");
}

// "Medium humanoid (any race), any alignment": { size: ["M"], type, alignment }. An alignment the codes do not name stays
// in the type, so the stat block prints it as written.
function typeLine(text) {
  const match = text.match(TYPE_LINE);
  if (!match) return null;
  const size = [SIZE_CODES[match[1].toLowerCase()], ...(match[2] ? [SIZE_CODES[match[2].toLowerCase()]] : [])];
  const parts = splitTop(match[3], ",");
  const alignmentText = parts.length > 1 ? parts.at(-1) : "";
  const codes = ALIGNMENTS[alignmentText.toLowerCase()];
  const type = codes ? parts.slice(0, -1).join(", ") : match[3].trim();
  return { size, type, ...(codes ? { alignment: [...codes] } : {}) };
}

// "15 (leather armor, shield)", "12 (15 with mage armor)", "11 in humanoid form, 12 (natural armor) in wolf or hybrid form".
function armorClass(text, report) {
  const match = text.match(/^(\d+)\s*(.*)$/);
  if (!match) {
    report.push(`CA non letta: «${text}»`);
    return null;
  }
  const ac = Number(match[1]);
  const rest = match[2].trim();
  if (!rest) return [ac];
  const inner = rest.match(/^\(([^()]*)\)$/)?.[1];
  if (inner !== undefined) {
    const other = inner.match(/^(\d+)\s+(.*)$/);
    if (other) return [ac, { ac: Number(other[1]), condition: other[2].trim(), braces: true }];
    return [{ ac, from: splitTop(inner, ",") }];
  }
  return [{ ac, condition: rest }];
}

// "7 (2d6)", "135 (18d8 + 54)", "1 (1d4 - 1)", "16": { average, formula }; anything else is { special }.
function hitPoints(text) {
  const match = text.match(/^(\d+)(?:\s*\((\d+d\d+(?:\s*[+\-−]\s*\d+)?)\))?\s*$/);
  if (!match) return { special: text };
  return { average: Number(match[1]), ...(match[2] ? { formula: hyphenMinus(match[2]).replace(/\s*([+-])\s*/, " $1 ") } : {}) };
}

// "30 ft., fly 60 ft. (hover), swim 30 ft.": { walk: 30, fly: { number: 60, condition: "(hover)" }, swim: 30, canHover }.
function speed(text, report) {
  const out = {};
  for (const part of splitTop(text.replace(/\.$/, ""), ",")) {
    const match = part.match(/^(?:(walk|fly|swim|climb|burrow)\s+)?(\d+)\s*(?:ft\.?|feet)(?:\s*(\(.*\)))?$/i);
    if (!match) {
      report.push(`velocità non letta: «${part}»`);
      continue;
    }
    const mode = (match[1] || "walk").toLowerCase();
    const number = Number(match[2]);
    const condition = match[3] || "";
    if (/^\(hover\)$/i.test(condition)) out.canHover = true;
    out[mode] = condition ? { number, condition } : number;
  }
  if (out.canHover) {
    const { canHover, ...modes } = out;
    return { ...modes, canHover };
  }
  return Object.keys(out).length ? out : null;
}

// The six scores, on one line or more ("STR 8 (-1) DEX 14 (+2) …", the names on a line and the scores on the next, one
// per line as D&D Beyond copies them). Six scores whose modifiers agree, or none.
function abilities(text, report) {
  const scores = [...hyphenMinus(text).matchAll(/(\d+)\s*\(\s*([+-]?)\s*(\d+)\s*\)/g)].map((match) => ({ score: Number(match[1]), modifier: Number(`${match[2] === "-" ? "-" : ""}${match[3]}`) }));
  if (scores.length !== 6 || scores.some(({ score, modifier }) => Math.floor((score - 10) / 2) !== modifier)) {
    report.push(`caratteristiche non lette: «${text}»`);
    return null;
  }
  return Object.fromEntries(ABILITY_KEYS.map((key, index) => [key, scores[index].score]));
}

// "Dex +5, Wis +4": { dex: "+5", wis: "+4" }.
function savingThrows(text, report) {
  const out = {};
  for (const part of splitTop(hyphenMinus(text), ",")) {
    const match = part.match(/^([A-Za-z]+)\s*([+-]\s*\d+)$/);
    const key = match ? ABILITY_BY_NAME[match[1].toLowerCase()] : "";
    if (key) out[key] = match[2].replace(/\s+/g, "");
    else report.push(`tiro salvezza non letto: «${part}»`);
  }
  return Object.keys(out).length ? out : null;
}

// "Arcana +6, Sleight of Hand +4": { arcana: "+6", "sleight of hand": "+4" }.
function skills(text, report) {
  const out = {};
  for (const part of splitTop(hyphenMinus(text), ",")) {
    const match = part.match(/^(.+?)\s*([+-]\s*\d+)$/);
    if (match) out[match[1].trim().toLowerCase()] = match[2].replace(/\s+/g, "");
    else report.push(`abilità non letta: «${part}»`);
  }
  return Object.keys(out).length ? out : null;
}

// "cold; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered": the plain types, and each group
// with a note as 5eTools keeps it ({ resist: [...], note, cond: true }). Without the semicolon (an older print), the note
// "from nonmagical …" is only the physical types', as the plugin reads it.
function defenses(text, field) {
  const out = [];
  for (const group of splitTop(text, ";")) {
    const match = group.match(DAMAGE_RUN);
    if (!match) {
      out.push({ special: group });
      continue;
    }
    const preNote = match[1].trim();
    const types = match[2].split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/).map((type) => type.trim().toLowerCase()).filter(Boolean);
    const note = match[3].trim();
    if (!preNote && !note) {
      out.push(...types);
      continue;
    }
    const firstPhysical = types.findIndex((type) => PHYSICAL_TYPES.has(type));
    if (!preNote && /nonmagical|silvered|adamantine|magic weapons/i.test(note) && firstPhysical > 0 && types.slice(firstPhysical).every((type) => PHYSICAL_TYPES.has(type))) {
      out.push(...types.slice(0, firstPhysical));
      out.push({ [field]: types.slice(firstPhysical), note, cond: true });
      continue;
    }
    out.push({ [field]: types, ...(preNote ? { preNote } : {}), ...(note ? { note } : {}), cond: true });
  }
  return out.length ? out : null;
}

function conditionImmunities(text) {
  const out = splitTop(text.replace(/;/g, ","), ",").map((entry) => entry.toLowerCase());
  return out.length ? out : null;
}

// "darkvision 60 ft., passive Perception 10": { senses: ["darkvision 60 ft."], passive: 10 }.
function senses(text) {
  const out = { senses: [] };
  for (const part of splitTop(text, ",")) {
    const passive = part.match(/^passive Perception\s+(\d+)$/i);
    if (passive) out.passive = Number(passive[1]);
    else out.senses.push(part);
  }
  return out;
}

// "1/4 (50 XP)", "13 (10,000 XP, or 11,500 XP when encountered in lair)", "21 (22 in lair)".
function challenge(text) {
  const match = text.match(/^(\d+(?:\/\d+)?)\b(.*)$/);
  if (!match) return text;
  const lair = match[2].match(/\b(\d+(?:\/\d+)?) in lair\b/i)?.[1];
  return lair ? { cr: match[1], lair } : match[1];
}

// The actions' fixed phrases with 5eTools' tags, as fiveToolsActions() reads them.
function taggedActionName(name) {
  return name.replace(/\s*\(Recharge (\d)(?:\s*[-–]\s*6)?\)/i, (_, low) => (low === "6" ? " {@recharge}" : ` {@recharge ${low}}`));
}

function taggedActionText(text) {
  let value = text;
  const lead = value.match(ATTACK_LEAD);
  if (lead) {
    value = `{@atk ${ATTACK_CODES[lead[1].toLowerCase()]}} {@hit ${Number(hyphenMinus(lead[2]))}} to hit${value.slice(lead[0].length)}`;
    value = value.replace(/\bHit: ?/, "{@h}");
  }
  return value.replace(/(\d+) \((\d+d\d+(?: ?[+\-−] ?\d+)?)\)/g, (_, average, formula) => `${average} ({@damage ${hyphenMinus(formula)}})`)
    .replace(/\bDC (\d+)\b/g, "{@dc $1}").replace(CONDITION_WORDS, "{@condition $1}");
}

// The items of a list an action runs into one paragraph ("… one of the following breath weapons. Fire Breath. The dragon
// exhales … Sleep Breath. …", "… within 120 feet of it: 1. Charm Ray. …"), as 5eTools prints them and a PDF joins them:
// two or more short names in title case (or numbered) alone in their sentence. { intro, items } or null.
function inlineListOf(text) {
  const pieces = text.split(/(?<=[.:])\s+/);
  const merged = [];
  for (const piece of pieces) {
    if (/^\d{1,2}\.$/.test(merged.at(-1) || "") && /^[A-Z]/.test(piece)) merged[merged.length - 1] = `${merged.at(-1)} ${piece}`;
    else merged.push(piece);
  }
  const itemName = (piece) => {
    if (/^\d{1,2}\. [A-Z][^.:]{0,40}\.$/.test(piece)) return piece.slice(0, -1);
    if (!/\.$/.test(piece)) return "";
    const name = piece.slice(0, -1);
    const words = name.replace(/\s*\([^()]*\)$/, "").split(/\s+/);
    return words.length <= 5 && /^[A-Z]/.test(name) && !/[:;,]/.test(name) && isStatblockEntryName(name) && !/\d/.test(name.replace(/\([^()]*\)/g, "")) ? name : "";
  };
  const starts = merged.map((piece, index) => (index > 0 && itemName(piece) ? index : -1)).filter((index) => index >= 0);
  if (starts.length < 2) return null;
  const items = starts.map((start, position) => ({ name: itemName(merged[start]), text: merged.slice(start + 1, starts[position + 1] ?? merged.length).join(" ") }));
  if (items.some((item) => !item.text)) return null;
  return { intro: merged.slice(0, starts[0]).join(" "), items };
}

// What follows the list and speaks of its items in general ("one of the following options: …" and, after the last one,
// "If the chosen option kills a creature, …"): the action's, not the last item's. Never what an item says of itself ("If
// this ray reduces the creature to 0 hit points").
function listOutro(items, intro) {
  const noun = intro.match(/\bfollowing ((?:[a-z]+ ){0,3}?[a-z]+?)s?(?= at\b| to\b| from\b| on\b| \(|[.,:;]|$)/i)?.[1].split(" ").at(-1);
  if (!noun || !items.length) return "";
  const last = items.at(-1);
  const sentences = last.text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const general = new RegExp(String.raw`\b(?:the chosen|each|these|every|all the|any of the) (?:[a-z]+ )?${noun}s?\b`, "i");
  const start = sentences.findIndex((sentence, index) => index > 0 && general.test(sentence));
  if (start < 0) return "";
  last.text = sentences.slice(0, start).join(" ");
  return sentences.slice(start).join(" ");
}

function actionEntries(text, items = null) {
  const list = items ? { intro: text, items: items.map((item) => ({ ...item })) } : inlineListOf(text);
  if (!list) return [taggedActionText(text)];
  const outro = listOutro(list.items, list.intro);
  return [taggedActionText(list.intro), { type: "list", items: list.items.map((item) => ({ type: "item", name: item.name, entry: taggedActionText(item.text) })) },
    ...(outro ? [taggedActionText(outro)] : [])];
}

// The book's own layout: "Breath Weapons (Recharge 5–6). The dragon uses one of the following breath weapons." and then
// "Fire Breath. …" and "Sleep Breath. …" as entries of their own. They are the action's list when the action opens one
// (it ends with a colon, or says "one of the following" or "detailed below") and their names end with a word of the
// action's name ("Breath", "Roar"); after a colon, every entry that follows in the section.
function withListItems(entries) {
  const out = [];
  const lastWord = (name) => name.replace(/\s*\([^()]*\)/g, "").trim().split(/\s+/).at(-1).toLowerCase().replace(/s$/, "");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const text = textOf(entry.lines);
    const colon = /:$/.test(text);
    if (!ATTACK_LEAD.test(text) && (colon || /\bone of the following\b|\bdetailed below\b/i.test(text)) && !inlineListOf(text)) {
      const words = new Set(entry.name.replace(/\s*\([^()]*\)/g, "").toLowerCase().split(/\s+/).map((word) => word.replace(/s$/, "")));
      let next = index + 1;
      while (next < entries.length && (colon || words.has(lastWord(entries[next].name)))) next += 1;
      if (next - index - 1 >= 2) {
        out.push({ ...entry, items: entries.slice(index + 1, next).map((item) => ({ name: item.name, text: textOf(item.lines) })) });
        index = next - 1;
        continue;
      }
    }
    out.push(entry);
  }
  return out;
}

function spellItems(text) {
  return splitTop(text, ",").map((item) => {
    const match = item.match(/^(.+?)(\**)(\s*\(.*\))?(\**)$/);
    const name = match ? match[1].trim() : item;
    return match ? `{@spell ${name}}${match[2]}${match[3] || ""}${match[4]}` : item;
  });
}

// "Spellcasting. The mage is a 9th-level spellcaster. … prepared:" and its lists, as 5eTools keeps them: headerEntries
// (with {@dc} and {@hit}, where the plugin reads the DC and the bonus), spells by level with their slots, will, daily.
function spellcastingBlock(entry, report) {
  const lines = entry.lines.flatMap((line) => line.split(SPELL_LIST_START)).map((line) => line.trim()).filter(Boolean);
  const header = [];
  const footer = [];
  const block = { name: entry.name, type: "spellcasting" };
  let list = null;
  let lists = 0;
  for (const [position, line] of lines.entries()) {
    const level = line.match(SPELL_LEVEL_LINE);
    const uses = !level && line.match(SPELL_USES_LINE);
    if (level) {
      lists += 1;
      const key = level[1] ? "0" : level[3] || level[2];
      const slots = Number(level[4].match(/^(\d+)(?:\s+\d(?:st|nd|rd|th)-level)?\s+slots?\b/i)?.[1]) || 0;
      block.spells ||= {};
      block.spells[key] = { ...(level[3] ? { lower: Number(level[2]) } : {}), ...(slots ? { slots } : {}), spells: spellItems(level[5]) };
      list = block.spells[key].spells;
    } else if (uses) {
      lists += 1;
      if (!uses[5].trim()) report.push(`${entry.name}: «${uses[1]}» senza incantesimi`);
      if (/^at will$/i.test(uses[1])) {
        block.will = [...(block.will || []), ...spellItems(uses[5])];
        list = block.will;
      } else {
        const field = { day: "daily", week: "weekly", rest: "rest" }[uses[3].toLowerCase()];
        const key = `${uses[2]}${uses[4] ? "e" : ""}`;
        block[field] ||= {};
        block[field][key] = [...(block[field][key] || []), ...spellItems(uses[5])];
        list = block[field][key];
      }
    } else if (list && (/^[a-z]/.test(line) || /,$/.test(lines[position - 1] || ""))) {
      list.push(...spellItems(line));
    } else if (!lists) header.push(line);
    else {
      footer.push(line);
      list = null;
    }
  }
  // The spells the header names instead of a list ("The archmage can cast disguise self and invisibility at will and has
  // the following wizard spells prepared:", "The mephit can innately cast sleep, requiring no material components."): as
  // 5eTools keeps them, a hidden "at will" list, so the stat block does not print them twice.
  const named = block.will ? [] : headerSpells(textOf(header));
  if (named.length) {
    block.will = named;
    block.hidden = ["will"];
  }
  const headerText = textOf(header).replace(/\bDC (\d+)\b/g, "{@dc $1}").replace(/([+\-−]\d+) to hit\b/g, (_, bonus) => `{@hit ${Number(hyphenMinus(bonus))}} to hit`);
  if (headerText) block.headerEntries = [headerText];
  if (footer.length) block.footerEntries = [textOf(footer)];
  if (!lists && !named.length) report.push(`${entry.name}: nessun elenco di incantesimi letto`);
  return block;
}

// The spells of "can (innately) cast X and Y at will", "can innately cast X, requiring …", "X up to three times per day"
// (5eTools keeps those at will too); never "the following spells" or "a randomly determined 1st-level wizard spell". The
// save DC in parentheses is not a name ("heat metal (spell save DC 10)"); the names with an "and" of their own stay whole.
const SPELLS_WITH_AND = Object.freeze(["create food and water", "detect evil and good", "dispel evil and good", "protection from evil and good",
  "purify food and drink"]);
function headerSpells(text) {
  const match = text.match(/\bcan (?:innately )?cast (.+?)(?= at will\b| (?:up to )?(?:once|twice|\w+ times) (?:per|a) day\b|, |,$| and has\b|\.|$)/i);
  if (!match) return [];
  const named = match[1].replace(/\s*\((?:[^()]*\b(?:spell save|DC)\b[^()]*)\)/gi, "").trim();
  if (!named || /^(?:the|a|an|one|two|three|any|its|his|her|their)\b|\bspells?\b|\blevel\b/i.test(named)) return [];
  const pieces = named.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);
  const names = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const joined = `${pieces[index]} and ${pieces[index + 1] || ""}`.toLowerCase();
    if (index + 1 < pieces.length && SPELLS_WITH_AND.some((name) => joined.startsWith(name))) {
      names.push(`${pieces[index]} and ${pieces[index + 1]}`);
      index += 1;
    } else names.push(pieces[index]);
  }
  return spellItems(names.join(", "));
}

/**
 * Reads a stat block pasted as text: { monster, report, error }. monster is a 5eTools monster (source "testo") for
 * fiveToolsMonsterToStatblock(); report lists, in Italian, what was not read; error refuses the text (empty, not a stat
 * block, a 2024 or an Italian one for now).
 */
export function parseStatblockText(text) {
  const report = [];
  if (!String(text ?? "").trim()) return { monster: null, report, error: "Il testo è vuoto." };
  if (ITALIAN.test(String(text))) {
    return { monster: null, report, error: "Statblock in italiano: dal testo per ora si legge solo l'inglese. Usa il prompt per un assistente (IMPORT_SCHEDA.md)." };
  }
  let lines = normalizedLines(text, report);
  if (isMarkdown(lines)) lines = fromMarkdown(lines);
  lines = joinHyphenated(lines);
  if (RULES_2024.test(lines.map((line) => line.text).join("\n"))) {
    return { monster: null, report, error: "Statblock delle regole 2024: dal testo per ora si leggono solo quelli del 2014. Usa il JSON di 5eTools o il prompt per un assistente (IMPORT_SCHEDA.md)." };
  }
  let index = lines.findIndex((line) => line.text);
  if (index < 0) return { monster: null, report, error: "Il testo è vuoto." };
  if (TYPE_LINE.test(lines[index].text) || headerLabel(lines[index].text)) return { monster: null, report, error: "Manca il nome del mostro nella prima riga." };
  const monster = { name: titleCase(lines[index].text.replace(/\.$/, "")), source: STATBLOCK_TEXT_SOURCE };
  index += 1;
  while (index < lines.length && !lines[index].text) index += 1;
  const kind = index < lines.length ? typeLine(lines[index].text) : null;
  if (kind) {
    Object.assign(monster, kind);
    index += 1;
  }

  // The header: its labels, the scores, a value that runs on the next line; it ends at the first heading or entry.
  const header = [];
  const unread = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.text) continue;
    if (line.name || headingOf(line.text)) break;
    const label = headerLabel(line.text);
    if (label) {
      header.push(label);
      continue;
    }
    if (/^STR(?:\s|$)/i.test(line.text)) {
      let scores = line.text;
      while (index + 1 < lines.length && (!lines[index + 1].text || ABILITY_LINE.test(lines[index + 1].text))) {
        index += 1;
        if (lines[index].text) scores = `${scores} ${lines[index].text}`;
      }
      header.push({ field: "abilities", value: scores });
      continue;
    }
    if (entryStart(line.text, { kind: "header" })) break;
    if (header.length && header.at(-1).field !== "abilities") header.at(-1).value = `${header.at(-1).value} ${line.text}`;
    else unread.push(line.text);
  }
  if (!header.some(({ field }) => field === "ac") && !header.some(({ field }) => field === "hp")) {
    return { monster: null, report, error: "Non sembra uno statblock: mancano «Armor Class» e «Hit Points»." };
  }
  for (const { field, value } of header) {
    if (field === "ac") {
      const ac = armorClass(value, report);
      if (ac) monster.ac = ac;
    } else if (field === "hp") monster.hp = hitPoints(value);
    else if (field === "speed") {
      const read = speed(value, report);
      if (read) monster.speed = read;
    } else if (field === "abilities") Object.assign(monster, abilities(value, report) || {});
    else if (field === "save") {
      const read = savingThrows(value, report);
      if (read) monster.save = read;
    } else if (field === "skill") {
      const read = skills(value, report);
      if (read) monster.skill = read;
    } else if (["vulnerable", "resist", "immune"].includes(field)) {
      const read = defenses(value, field);
      if (read) monster[field] = read;
    } else if (field === "conditionImmune") {
      const read = conditionImmunities(value);
      if (read) monster.conditionImmune = read;
    } else if (field === "senses") {
      const read = senses(value);
      if (read.senses.length) monster.senses = read.senses;
      if (read.passive !== undefined) monster.passive = read.passive;
    } else if (field === "languages") monster.languages = /^[-—–]$/.test(value) ? null : splitTop(value, ",");
    else if (field === "cr") monster.cr = challenge(value);
  }

  // The sections and their entries.
  const sections = {};
  const sectionOf = (key) => (sections[key] ||= { intro: [], entries: [] });
  let section = "trait";
  let current = null;
  let previous = { kind: "header", text: "" };
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.text && !line.name) {
      previous = { kind: "blank", text: "" };
      continue;
    }
    const heading = !line.name && headingOf(line.text);
    if (heading) {
      section = heading;
      sectionOf(section);
      current = null;
      previous = { kind: "heading", text: line.text };
      continue;
    }
    const start = line.name ? { name: line.name, rest: line.text } : entryStart(line.text, previous);
    if (start) {
      current = { name: start.name, lines: start.rest ? [start.rest] : [] };
      sectionOf(section).entries.push(current);
    } else if (current) current.lines.push(line.text);
    else sectionOf(section).intro.push(line.text);
    previous = { kind: "text", text: line.text };
  }

  const traits = [];
  const spellcasting = [];
  for (const entry of sections.trait?.entries || []) {
    if (/\bSpellcasting\b/.test(entry.name)) spellcasting.push(spellcastingBlock(entry, report));
    else traits.push({ name: entry.name, entries: [textOf(entry.lines)] });
  }
  if (sections.trait?.intro.length) unread.push(...sections.trait.intro);
  for (const [key, field] of [["action", "action"], ["bonus", "bonus"]]) {
    if (!sections[key]) continue;
    if (sections[key].intro.length) unread.push(...sections[key].intro);
    monster[field] = withListItems(sections[key].entries).map((entry) => ({ name: taggedActionName(entry.name), entries: actionEntries(textOf(entry.lines), entry.items || null) }));
  }
  if (sections.reaction) {
    if (sections.reaction.intro.length) unread.push(...sections.reaction.intro);
    monster.reaction = sections.reaction.entries.map((entry) => ({ name: entry.name, entries: [textOf(entry.lines)] }));
  }
  if (sections.legendary) {
    const intro = textOf(sections.legendary.intro);
    const uses = Number(intro.match(/\bcan take (\d+) legendary actions?\b/i)?.[1]);
    if (uses) monster.legendaryActions = uses;
    if (intro) monster.legendaryHeader = [intro];
    monster.legendary = sections.legendary.entries.map((entry) => ({ name: entry.name, entries: [textOf(entry.lines)] }));
  }
  if (sections.mythic) {
    const intro = textOf(sections.mythic.intro);
    if (intro) monster.mythicHeader = [intro];
    monster.mythic = sections.mythic.entries.map((entry) => ({ name: entry.name, entries: [textOf(entry.lines)] }));
  }
  for (const [key, title] of Object.entries(UNREAD_SECTIONS)) {
    if (!sections[key]) continue;
    report.push(`sezione non letta: ${title}`);
    unread.push(`${title}:`, ...sections[key].intro, ...sections[key].entries.map((entry) => `${entry.name}. ${textOf(entry.lines)}`.trim()));
  }
  if (unread.length) {
    for (const line of unread) if (!line.endsWith(":") || !Object.values(UNREAD_SECTIONS).includes(line.slice(0, -1))) report.push(`riga non letta: «${line.length > 80 ? `${line.slice(0, 79)}…` : line}»`);
    traits.push({ name: UNREAD_TEXT_TRAIT, entries: [textOf(unread)] });
  }
  if (traits.length) monster.trait = traits;
  if (spellcasting.length) monster.spellcasting = spellcasting;
  return { monster, report, error: "" };
}
