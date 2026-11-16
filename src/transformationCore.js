// Trasformazioni (docs/PIANO_TRASFORMAZIONI.md): the forms a creature can take, read from 5eTools and from a stat block
// pasted as text (lotto W1), and imported by the console's «Altra forma…» (lotto W2a). The light half (challenge rating,
// type, the limits of each source, the card's quick forms) is transformationFormsCore.js, re-exported here. Pure: nothing
// here reads or writes the scene.
import {
  fiveToolsCollection,
  fiveToolsMonsterToStatblock,
  fiveToolsSearch,
  isFiveTools2024,
  isFiveToolsData,
  resolveFiveToolsMonster,
} from "./fiveToolsMonsterCore.js";
import { statblockTextImport } from "./monsterStatblockTextImportCore.js";
import { parseCharacterSheetImport } from "./characterSheetImportCore.js";
import { MONSTER_PROFILE_FIELD, sanitizeMonsterProfile } from "./monsterProfileCore.js";
import { normalizeSpeedMeters } from "./speedCheckCore.js";
import {
  TRANSFORMATION_SIZES,
  TRANSFORMATION_SPEED_MODES,
  challengeRatingLabel,
  challengeRatingValue,
  creatureTypeOf,
  sanitizeTransformationForm,
  transformationFormReasons,
  transformationLimits,
} from "./transformationFormsCore.js";

export * from "./transformationFormsCore.js";

const SIZE_CODES = Object.freeze({ T: "tiny", S: "small", M: "medium", L: "large", H: "huge", G: "gargantuan" });
const FEET_TO_METERS = 0.3;

function integer(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : 0;
}

function sizeOf(value) {
  const code = Array.isArray(value) ? value[0] : value;
  const text = String(code ?? "").trim();
  return SIZE_CODES[text.toUpperCase()] || (TRANSFORMATION_SIZES.includes(text.toLowerCase()) ? text.toLowerCase() : "");
}

// The speeds of a 5eTools record in metres, every mode it has (a conditional one too): { speeds, hover }.
function recordSpeeds(speed) {
  const source = typeof speed === "number" ? { walk: speed } : speed && typeof speed === "object" ? speed : {};
  const speeds = {};
  for (const mode of TRANSFORMATION_SPEED_MODES) {
    const value = source[mode];
    const feet = Number(value && typeof value === "object" ? value.number : value);
    if (feet > 0) speeds[mode] = normalizeSpeedMeters(feet * FEET_TO_METERS);
  }
  const hover = !!speeds.fly && (source.canHover === true || /hover/i.test(String(source.fly?.condition || "")));
  return { speeds, hover };
}

// The speeds of a stat block of the plugin ("40 ft" and { fly: "80 ft", hover }), when there is no 5eTools record.
function blockSpeeds(block) {
  const feet = (text) => Number(String(text ?? "").match(/(\d+(?:\.\d+)?)/)?.[1]) || 0;
  const speeds = {};
  if (feet(block?.speed) > 0) speeds.walk = normalizeSpeedMeters(feet(block.speed) * FEET_TO_METERS);
  for (const mode of TRANSFORMATION_SPEED_MODES.filter((entry) => entry !== "walk")) {
    if (feet(block?.speeds?.[mode]) > 0) speeds[mode] = normalizeSpeedMeters(feet(block.speeds[mode]) * FEET_TO_METERS);
  }
  return { speeds, hover: !!speeds.fly && block?.speeds?.hover === true };
}

/**
 * What the limits read of a 5eTools record (an archive's monster, or the text parser's): name, type, swarm, challenge
 * rating, size and speeds in metres. Light: no stat block is built, so a whole archive can be filtered. null without a
 * record.
 */
export function transformationFormFacts(record) {
  if (!record || typeof record !== "object") return null;
  const { type, swarm } = creatureTypeOf(record.type);
  const { speeds, hover } = recordSpeeds(record.speed);
  return {
    name: String(record.name ?? "").trim(),
    type,
    ...(swarm ? { swarm: true } : {}),
    cr: challengeRatingLabel(record.cr),
    size: sizeOf(record.size),
    speeds,
    ...(hover ? { hover: true } : {}),
  };
}

function savingThrowBonuses(value) {
  if (!value || typeof value !== "object") return null;
  const saves = {};
  for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
    const bonus = Number.parseInt(String(value[ability] ?? "").replace(/\s+/g, "").replace("−", "-"), 10);
    if (Number.isFinite(bonus)) saves[ability] = bonus;
  }
  return Object.keys(saves).length ? saves : null;
}

/**
 * The form a creature takes, as the pill carries it (lotto W2): a snapshot of the stat block of the plugin (from
 * fiveToolsMonsterToStatblock, or the text import) with the type and the challenge rating of its 5eTools record, which
 * the block does not keep. Only what the console, the movement panel and the defenses read, checked as the card keeps it
 * (sanitizeTransformationForm). null without a block, and for a stat block of the 2024 rules (the transformations follow
 * the 2014 ones).
 */
export function transformationFormFromStatblock(block, record = null) {
  if (!block || typeof block !== "object" || typeof block.name !== "string" || !block.name.trim()) return null;
  if (record && isFiveTools2024(record)) return null;
  const facts = transformationFormFacts(record);
  const { speeds, hover } = facts ? { speeds: facts.speeds, hover: facts.hover === true } : blockSpeeds(block);
  return sanitizeTransformationForm({
    name: block.name,
    ref: block.ref,
    source: block.source,
    type: facts?.type || "",
    swarm: facts?.swarm === true,
    cr: facts?.cr || "",
    size: sizeOf(block.size) || facts?.size || "",
    hitPoints: block.hitPoints,
    armorClass: block.armorClass,
    abilities: block.abilities,
    savingThrows: savingThrowBonuses(block.savingThrows),
    speeds,
    hover,
    damageDefenses: block.damageDefenses,
    conditionImmunities: block.conditionImmunities,
    passivePerception: block.passivePerception,
    multiattack: block.multiattack,
    notes: block.notes,
    // Its token in 5eTools' image mirror (16/11/2026), as the sheet's import reads it.
    portrait: block.portrait?.fiveTools,
    actions: formQuickActions(block),
  });
}

// The stat block's attacks as the card's quick actions (lotto W3a), read as the sheet's import reads a monster's block:
// bonus, damage and the save on a hit. The actions with neither damage nor save stay out, as on a monster's card.
function formQuickActions(block) {
  if (!Array.isArray(block?.actions) || !block.actions.length) return [];
  const sheet = parseCharacterSheetImport(JSON.stringify({ ...block, kind: "monster" }));
  return Array.isArray(sheet?.sections?.attacks) ? sheet.sections.attacks : [];
}

/**
 * The forms a source allows among 5eTools monsters (the GM's archive, a pasted bestiary): [{ monster, form }], form being
 * the facts the limits read and monster the record as given, for the stat block to be built from it afterwards. A
 * derived monster is read with its base, the 2024 stat blocks are left out, query narrows by name and source as the
 * sheet's search does; the highest challenge rating first, then by name. [] when the source cannot be used.
 */
export function transformationFormCandidates(monsters = [], context = {}, { query = "", limit = 200 } = {}) {
  const limits = transformationLimits(context);
  if (limits.error) return [];
  const pool = (Array.isArray(monsters) ? monsters : []).filter((monster) => monster && typeof monster.name === "string");
  const modern = pool.filter((monster) => !isFiveTools2024(monster));
  const searched = String(query || "").trim() ? fiveToolsSearch(modern, query, Number.POSITIVE_INFINITY) : modern;
  return searched
    .map((monster) => {
      const resolved = monster._copy ? resolveFiveToolsMonster(monster, pool).monster : monster;
      return { monster, form: resolved && !isFiveTools2024(resolved) ? transformationFormFacts(resolved) : null };
    })
    .filter((entry) => entry.form && transformationFormReasons(entry.form, limits).length === 0)
    .sort((left, right) => (challengeRatingValue(right.form.cr) - challengeRatingValue(left.form.cr))
      || left.monster.name.localeCompare(right.monster.name, "en"))
    .slice(0, Math.max(0, integer(limit)));
}

const RULES_2024_ERROR = "Statblock delle regole 2024: le trasformazioni seguono quelle del 2014.";

/**
 * The form of a 5eTools monster (an archive's, or a pasted JSON's): { form, error }. pool: the monsters loaded with it,
 * for the base of a derived one.
 */
export function transformationFormFromFiveTools(monster, pool = []) {
  const { block, monster: resolved, error } = fiveToolsMonsterToStatblock(monster, { pool });
  if (error || !block) return { form: null, error: error || "Mostro non leggibile." };
  const form = transformationFormFromStatblock(block, resolved);
  return form ? { form, error: "" } : { form: null, error: RULES_2024_ERROR };
}

const TOKEN_META_KEY = "com.thebigpicture.initiative/meta";

/**
 * «Altra forma…», the source «token nella stanza» (lotto W2a, a GM's source of G37; the list is
 * transformationTokenSources): the form of a monster's token in the room. A card imported from 5eTools whose record the GM's archive keeps is read
 * from the archive (monsters, pool: fiveToolsCollection), as its search does: type, challenge rating, the whole stat
 * block. Else the card's own numbers make the form (HP, AC, the abilities from their modifiers, saves, speeds, defenses,
 * Multiattack, the attacks); the type and the challenge rating, which a card does not keep, are asked as for a pasted
 * text. { form, error }, error in Italian.
 */
export function transformationFormFromToken(item, { monsters = [], pool = [] } = {}) {
  const meta = item?.metadata?.[TOKEN_META_KEY] || {};
  const card = meta.initiativeCard && typeof meta.initiativeCard === "object" ? meta.initiativeCard : {};
  const profile = sanitizeMonsterProfile(card[MONSTER_PROFILE_FIELD]);
  if (!profile) return { form: null, error: "Il token non ha la card di un mostro." };
  const [refName = "", refSource = ""] = String(profile.ref || "").split("|").map((part) => part.trim().toLowerCase());
  const record = refName
    ? (Array.isArray(monsters) ? monsters : []).find((monster) => String(monster?.name || "").toLowerCase() === refName
      && (!refSource || String(monster?.source || "").toLowerCase() === refSource))
    : null;
  if (record) return transformationFormFromFiveTools(record, Array.isArray(pool) && pool.length ? pool : monsters);
  const modifiers = card.abilityModifiers && typeof card.abilityModifiers === "object" ? card.abilityModifiers : {};
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"]
    .filter((ability) => modifiers[ability] !== null && modifiers[ability] !== "" && Number.isFinite(Number(modifiers[ability])))
    .map((ability) => [ability, 10 + 2 * Math.floor(Number(modifiers[ability]))]));
  const average = integer(profile.hitPoints?.value) || integer(meta.hpMax);
  const form = sanitizeTransformationForm({
    name: String(item?.name || "").trim(),
    source: "manual",
    size: profile.tokenSize || "",
    ...(average > 0 ? { hitPoints: { average, ...(profile.hitPoints?.formula ? { formula: profile.hitPoints.formula } : {}) } } : {}),
    armorClass: card.armorClass,
    abilities,
    savingThrows: card.savingThrows,
    speeds: { ...(profile.speeds || {}), ...(Number(card.speed) > 0 ? { walk: card.speed } : {}) },
    hover: profile.hover === true,
    damageDefenses: card.damageDefenses,
    conditionImmunities: profile.conditionImmunities,
    passivePerception: card.passivePerception,
    multiattack: profile.multiattack,
    actions: (Array.isArray(card.quickActions) ? card.quickActions : []).filter((action) => action?.kind === "attack"),
  });
  return form ? { form, error: "" } : { form: null, error: "Card del token non leggibile come forma." };
}

/**
 * «Altra forma…» (lotto W2a): the form of what the GM or the player pasted, a monster of 5eTools as JSON or a stat block
 * as text (the parser of the sheet's import, lots ST1–ST3). { form, error }, error in Italian. A JSON with more monsters
 * (a whole bestiary) is refused: one at a time, or the archive's search.
 */
export function transformationFormFromImport(input) {
  const text = String(input ?? "").trim();
  if (!text) return { form: null, error: "Incolla il JSON di un mostro di 5eTools o il testo di uno statblock." };
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (data !== null) {
    if (!isFiveToolsData(data)) return { form: null, error: "Il JSON non è un mostro di 5eTools." };
    const { monsters, pool, excluded2024 } = fiveToolsCollection([data]);
    if (!monsters.length) return { form: null, error: excluded2024 ? RULES_2024_ERROR : "Nel JSON non c'è nessun mostro." };
    if (monsters.length > 1) {
      return { form: null, error: `Il JSON ha ${monsters.length} mostri: incollane uno solo, o cercalo nell'archivio.` };
    }
    return transformationFormFromFiveTools(monsters[0], pool);
  }
  const read = statblockTextImport(text);
  if (read.error || !read.block) return { form: null, error: read.error || "Statblock non leggibile." };
  const form = transformationFormFromStatblock(read.block, read.monster);
  return form ? { form, error: "" } : { form: null, error: RULES_2024_ERROR };
}
