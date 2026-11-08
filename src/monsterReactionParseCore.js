// Avvisi di reazione, lot R4 (docs/STUDIO_AVVISI_REAZIONE.md §6.12): a monster's reactions read from its full stat block
// (monsterStatblockTextView: the 5eTools "Reactions" section, or the "Reactions" lines of a pasted text, decision G3).
// Only the forms the plugin can recognize (decision G1); the 2024 form ("Trigger: … Response: …") is read the same way
// (decision G2: a 2024 monster is there only with the "Statblock 2024" option). Everything else stays in the Capacità
// tab, as it is. Pure.
//
// A reaction: { kind, name, text, amount?, melee? }
// - "ac-bonus": "adds 2 to its AC against one melee attack that would hit it" (Parry): +amount AC, melee when the text
//   says so;
// - "halve": "halves the damage that it takes from an attack that hits it" (a monster's Uncanny Dodge);
// - "note-hit" / "note-miss": "when a creature … hits / misses it with an attack": the text, after the attack.

export const MONSTER_REACTION_KINDS = Object.freeze(["ac-bonus", "halve", "note-hit", "note-miss"]);

const MAX_TEXT = 600;
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// The reaction one entry describes, or null.
export function monsterReactionFromEntry(entry) {
  const name = clean(entry?.name).slice(0, 80);
  const body = clean(entry?.text);
  if (!name || !body) return null;
  const text = body.slice(0, MAX_TEXT);
  const ac = body.match(/\badds (\d{1,2}) to (?:its|their|his|her) AC against (?:one|an?|that|the|this) (melee )?(?:weapon )?attack/i);
  if (ac) {
    const amount = Number(ac[1]);
    if (amount < 1) return null;
    const melee = !!ac[2] || /Trigger:[^.]*\bmelee\b/i.test(body);
    return { kind: "ac-bonus", name, text, amount, melee };
  }
  if (/\bhalves the (?:attack's |attack’s )?damage\b/i.test(body)) return { kind: "halve", name, text };
  const struck = body.match(/\b(hits|misses) (?:it|him|her|them|the [\w'’ -]{1,40}?) with (?:an? |a )?(?:melee |ranged )?(?:weapon |spell )?attack/i);
  if (struck) return { kind: struck[1].toLowerCase() === "hits" ? "note-hit" : "note-miss", name, text };
  return null;
}

// A pasted stat block is one text: the entries under its "Reactions" line, up to the next heading.
const HEADING = /^(?:reactions|reazioni|actions|azioni|bonus actions|azioni bonus|legendary actions|azioni leggendarie|mythic actions|lair actions|traits|tratti)$/i;
function pastedReactionEntries(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
  const start = lines.findIndex((line) => /^(?:reactions|reazioni)$/i.test(line));
  if (start < 0) return [];
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    if (!line) continue;
    const named = line.match(/^([A-Z][^.]{0,60}?)\.\s+(.+)$/);
    if (named) entries.push({ name: named[1], text: named[2] });
    else if (entries.length) entries.at(-1).text += ` ${line}`;
  }
  return entries;
}

// view: { header, sections } of monsterStatblockTextView. Every recognized reaction of the monster, in its order.
export function monsterReactionsFromView(view) {
  const entries = [];
  for (const section of Array.isArray(view?.sections) ? view.sections : []) {
    const list = Array.isArray(section?.entries) ? section.entries : [];
    if (section?.title === "Reactions") entries.push(...list);
    else if (!section?.title) for (const entry of list) if (!entry?.name) entries.push(...pastedReactionEntries(entry?.text));
  }
  return entries.map(monsterReactionFromEntry).filter(Boolean);
}
