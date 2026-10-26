// 5eTools' JSON of a monster (attacchi dei mostri, fase 2, lotto 1): read into the stat block format of phase 1
// (monsterStatblockImportCore.js, docs/IMPORT_SCHEDA.md), which the sheet's import then reads as any other block, so no
// rule lives twice. Pure. The plugin ships no 5eTools data: the GM brings it.
// Only the 2014 data: a 2024 block ({@atkr}, {@actSave}, the 2025 Monster Manual) is refused, as the plugin's rules are
// the 2014 ones. What the adapter cannot read becomes the action's note or a line of the report, never a guess.
import { monsterImportConditionName } from "./monsterStatblockImportCore.js";

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

const ATTACK = /^\{@atk ([a-z,]+)\} \{@hit (-?\d+)\} to hit(?: \([^)]*\))?, (?:reach (\d+) ft\.(?: or range (\d+)(?:\/(\d+))? ft\.)?|range (\d+)(?:\/(\d+))? ft\.).*?\{@h\}(.*)$/;

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
  return [{ ...base, damage: components, ...(remainder ? { note: remainder } : {}), status }];
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
  const condition = failure.match(/(?:\b(?:or|and) (?:be|become|fall|is|are)|\bis|\bbecomes)(?: \w+ly)? \{@condition ([^}|]+)/);
  if (!components.length && !condition) return [{ name, status: "manual", text }];
  const area = saveArea(text);
  return [{ name, save: { ability: ABILITY_BY_NAME[dc[2].toLowerCase()], dc: Number(dc[1]), half: /half as much damage/.test(text) },
    ...(area ? { area } : {}), ...(condition ? { onFail: { condition: condition[1] } } : {}),
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

/**
 * A 5eTools monster as a stat block of phase 1: { block, report, error }. block goes to the sheet's import as it is;
 * report lists, in Italian, what stays at the table (traits, legendary actions, spells, conditional defenses, the
 * actions with neither damage nor save); error refuses the monster (2024 data, a monster derived from another).
 */
export function fiveToolsMonsterToStatblock(monster) {
  if (!monster || typeof monster !== "object" || typeof monster.name !== "string") return { block: null, report: [], error: "Non è un mostro di 5eTools." };
  if (isFiveTools2024(monster)) return { block: null, report: [], error: `${monster.name} (${monster.source}) è un mostro delle regole 2024: il plugin usa quelle del 2014.` };
  if (monster._copy) {
    return { block: null, report: [], error: `${monster.name} deriva da ${monster._copy.name} (${monster._copy.source}): i mostri derivati arrivano con il lotto 2.` };
  }
  const report = [];
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
  if (traits.length) report.push(`tratti da leggere al tavolo: ${traits.join(", ")}`);
  if (monster.legendary) report.push("azioni leggendarie non ancora importate");
  if (monster.spellcasting) report.push("incantesimi del mostro non importati");
  if (Array.isArray(monster.reaction) && monster.reaction.length) report.push(`reazioni da gestire al tavolo: ${monster.reaction.map((entry) => fiveToolsPlainText(entry?.name || "")).join(", ")}`);
  if (monster.hp && !Number.isFinite(monster.hp.average)) report.push(`punti ferita speciali: ${fiveToolsPlainText(monster.hp.special || "")}`);
  const block = {
    kind: "monster", source: "5etools", name: monster.name,
    ...(armorClass ? { armorClass } : {}),
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
  return { block, report, counts, error: "" };
}
