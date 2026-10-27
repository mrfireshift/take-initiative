// Search and table of contents of the rules compendium (src/rules-reference-it.json): topics, their sections and
// the entries under them. Pure functions, so the Encyclopedia builds the index once and searches it on every key.

const COMBINING_MARKS = /[\u0300-\u036f]/gu;
const NOT_A_WORD = /[^\p{L}\p{N}]+/gu;
const CONDITION_PREFIX = "condition:";

// Score tiers, best first; a bonus never reaches the next tier.
const TIER_EXACT_NAME = 6;
const TIER_NAME_STARTS = 5;
const TIER_NAME_WORDS = 4;
const TIER_ALIAS = 3;
const TIER_PATH = 2;
const TIER_TEXT = 1;
const TIER_SIZE = 100;
const NAME_WORD_BONUS = 10;
const TEXT_HITS_CAP = 9;

// Lowercase, without accents, every run of punctuation, apostrophes or spaces made one space: the modal's normalize,
// so that "d'opportunità" reads "d opportunita".
export function normalizeRulesText(value) {
  return String(value || "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(NOT_A_WORD, " ")
    .trim();
}

function queryWords(query) {
  return [...new Set(normalizeRulesText(query).split(" ").filter(Boolean))];
}

// A word matches when it starts one of the words of a normalized field, kept with a leading space.
function spaced(text) {
  return text ? ` ${text}` : "";
}

function hasAllWords(field, words) {
  return words.every((word) => field.includes(` ${word}`));
}

function countHits(field, word) {
  let hits = 0;
  for (let at = field.indexOf(` ${word}`); at !== -1 && hits < TEXT_HITS_CAP; at = field.indexOf(` ${word}`, at + 1)) {
    hits += 1;
  }
  return hits;
}

function topicsById(catalog) {
  return new Map((catalog?.topics || []).map((topic) => [topic.id, topic]));
}

function sectionOf(topic, entry) {
  if (!topic || entry?.section == null) return null;
  return (topic.sections || []).find((section) => section.id === entry.section) || null;
}

// { catalog, entries: [{ entry, order, name, aliases, path, text, all }], byId }, each field normalized once.
export function buildRulesIndex(catalog) {
  const topics = topicsById(catalog);
  const entries = (catalog?.entries || []).map((entry, order) => {
    const topic = topics.get(entry.topic);
    const name = normalizeRulesText(entry.name);
    const aliases = (entry.aliases || []).map(normalizeRulesText).filter(Boolean).map(spaced);
    const path = spaced(normalizeRulesText([topic?.name, sectionOf(topic, entry)?.name, entry.name].filter(Boolean).join(" ")));
    const text = spaced(normalizeRulesText(entry.text));
    return { entry, order, name, aliases, path, text, all: [spaced(name), ...aliases, path, text].join(" ") };
  });
  return { catalog, entries, byId: new Map(entries.map((item) => [item.entry.id, item.entry])) };
}

function scoreOf(item, phrase, words) {
  const name = spaced(item.name);
  if (item.name === phrase) return TIER_EXACT_NAME * TIER_SIZE;
  if (item.name.startsWith(phrase)) return TIER_NAME_STARTS * TIER_SIZE;
  if (hasAllWords(name, words)) return TIER_NAME_WORDS * TIER_SIZE;
  if (item.aliases.some((alias) => hasAllWords(alias, words))) return TIER_ALIAS * TIER_SIZE;
  // Below the name and the aliases, the words found in the name and how often they come up in the text break ties.
  const nameWords = words.filter((word) => name.includes(` ${word}`)).length;
  const textHits = Math.min(TEXT_HITS_CAP, words.reduce((sum, word) => sum + countHits(item.text, word), 0));
  const bonus = Math.min(TIER_SIZE - 1, nameWords * NAME_WORD_BONUS + textHits);
  return (hasAllWords(item.path, words) ? TIER_PATH : TIER_TEXT) * TIER_SIZE + bonus;
}

// Every word of the query must start a word of the name, an alias, the path or the text. Best score first, then the
// order of the table of contents. { results: [entry], total } with total counting the matches past the limit too.
export function searchRules(index, query, { limit = 60 } = {}) {
  const words = queryWords(query);
  if (!words.length || !index?.entries?.length) return { results: [], total: 0 };
  const phrase = words.join(" ");
  const matches = [];
  for (const item of index.entries) {
    if (!hasAllWords(item.all, words)) continue;
    matches.push({ item, score: scoreOf(item, phrase, words) });
  }
  matches.sort((a, b) => b.score - a.score || a.item.order - b.item.order);
  return { results: matches.slice(0, Math.max(0, limit)).map(({ item }) => item.entry), total: matches.length };
}

// [{ topic, sections: [{ section, entries }] }] in catalog order. The entries straight under a topic, or under a
// section the topic does not list, come first with section null; sections without entries are left out.
export function rulesTree(catalog) {
  const tree = (catalog?.topics || []).map((topic) => ({
    topic,
    groups: new Map([[null, []], ...(topic.sections || []).map((section) => [section.id, []])]),
  }));
  const byTopic = new Map(tree.map((node) => [node.topic.id, node]));
  for (const entry of catalog?.entries || []) {
    const node = byTopic.get(entry.topic);
    if (!node) continue;
    const key = node.groups.has(entry.section ?? null) ? entry.section ?? null : null;
    node.groups.get(key).push(entry);
  }
  return tree.map(({ topic, groups }) => ({
    topic,
    sections: [...groups]
      .filter(([, entries]) => entries.length)
      .map(([id, entries]) => ({ section: id === null ? null : sectionOf(topic, { section: id }), entries })),
  }));
}

// [topicName, sectionName?] for the breadcrumbs above an entry.
export function entryPath(catalog, entry) {
  const topic = topicsById(catalog).get(entry?.topic);
  if (!topic) return [];
  const section = sectionOf(topic, entry);
  return section ? [topic.name, section.name] : [topic.name];
}

// The "Vedi anche" of an entry: [{ kind: "rule", entry } | { kind: "condition", condition }], in its order.
// "condition:<Nome>" looks the name up in conditions (CONDITION_REFERENCE); ids that resolve to nothing are dropped.
export function resolveRelated(catalog, entry, conditions = []) {
  const related = [];
  for (const id of entry?.related || []) {
    if (String(id).startsWith(CONDITION_PREFIX)) {
      const wanted = normalizeRulesText(String(id).slice(CONDITION_PREFIX.length));
      const condition = conditions.find((candidate) => normalizeRulesText(candidate.name) === wanted);
      if (condition) related.push({ kind: "condition", condition });
      continue;
    }
    const rule = (catalog?.entries || []).find((candidate) => candidate.id === id);
    if (rule) related.push({ kind: "rule", entry: rule });
  }
  return related;
}
