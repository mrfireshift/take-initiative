// Trasformazioni (docs/PIANO_TRASFORMAZIONI.md): the light half of the forms, without 5eTools, for the modules every page
// loads (the card, the class feature runtime): challenge rating and type, the limits of each source (PHB 2014, lotto
// W1), the quick forms of a card (lotto W2a, G37) and the context of a druid. Pure: nothing here reads or writes the scene.
import { normalizeSpeedMeters } from "./speedCheckCore.js";
import { sanitizeQuickAction } from "./quickActionsCore.js";
import { fiveToolsTokenPath, fiveToolsTokenUrl } from "./fiveToolsArchiveCore.js";
import { MONSTER_PROFILE_FIELD, sanitizeMonsterProfile } from "./monsterProfileCore.js";

const TRANSFORMATION_TOKEN_META_KEY = "com.thebigpicture.initiative/meta";

export const TRANSFORMATION_KINDS = Object.freeze([
  "wild-shape",
  "elemental-wild-shape",
  "polymorph",
  "true-polymorph",
  "shapechange",
  "animal-shapes",
  // Lotto W7e: Mass Polymorph (Xanathar), whose form brings temporary hit points instead of its own.
  "mass-polymorph",
  // 27/11 (Guardian of the Gulthias, Strahd Reloaded): a form a monster's own reaction gives, keeping its hit points.
  "monster-form",
]);

// 27/11: the form of a monster's feature ("polymorphs into a shambling mound … retains his game statistics (including his
// hit points), spellcasting abilities"): its mind, features and spells stay, its hit points too (hitPoints: "own"): the
// form brings its AC, Strength and Dexterity, speeds, defenses, senses and attacks. No limit of type or challenge rating:
// the stat block names the form.
export const MONSTER_FORM_TEMPLATE = Object.freeze({ kind: "monster-form", conditionName: "Forma", keepsMind: true,
  keepsFeatures: true, canCast: true, hitPoints: "own" });

// 27/11: the card's quick form a monster's feature names ("polymorphs into a shambling mound"), by name; null without it.
export function transformationFormNamed(card, formName) {
  const wanted = plainTransformationName(formName);
  return wanted ? sanitizeTransformationForms(card?.[TRANSFORMATION_FORMS_FIELD]).find((form) => plainTransformationName(form.name) === wanted) || null : null;
}

// The card's quick forms (G37): at most 8, and a byte budget, since the card goes into the Room's registry, whose
// metadata Owlbear holds to 16 kB in all.
export const TRANSFORMATION_FORMS_FIELD = "transformationForms";
export const MAX_TRANSFORMATION_FORMS = 8;
export const MAX_TRANSFORMATION_FORMS_BYTES = 6000;
const MAX_FORM_ACTIONS = 8;
const MAX_FORM_ACTION_BYTES = 1500;

export const TRANSFORMATION_SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
export const TRANSFORMATION_SIZE_LABELS = Object.freeze({
  tiny: "Minuscola", small: "Piccola", medium: "Media", large: "Grande", huge: "Enorme", gargantuan: "Mastodontica",
});
export const TRANSFORMATION_SPEED_MODES = Object.freeze(["walk", "fly", "swim", "climb", "burrow"]);
const SPEED_LABELS = Object.freeze({ fly: "volo", swim: "nuoto", climb: "scalata", burrow: "scavo" });
// The creature types by their 5eTools key, with the Italian name the messages use.
export const CREATURE_TYPES = Object.freeze({
  aberration: "aberrazione", beast: "bestia", celestial: "celestiale", construct: "costrutto", dragon: "drago",
  elemental: "elementale", fey: "folletto", fiend: "immondo", giant: "gigante", humanoid: "umanoide",
  monstrosity: "mostruosità", ooze: "melma", plant: "vegetale", undead: "non morto",
});
const ITALIAN_TYPES = Object.freeze({
  ...Object.fromEntries(Object.entries(CREATURE_TYPES).map(([key, label]) => [label, key])),
  bestie: "beast", "non morti": "undead", costrutti: "construct", elementali: "elemental",
});
const REQUIRED_TYPE_TEXT = Object.freeze({ beast: "una bestia", elemental: "un elementale" });
// Elemental Wild Shape (PHB 2014, p. 69): these four creatures, by their Monster Manual names.
const WILD_SHAPE_ELEMENTALS = new Set([
  "air elemental", "earth elemental", "fire elemental", "water elemental",
  "elementale dell'aria", "elementale della terra", "elementale del fuoco", "elementale dell'acqua",
]);
const WILD_SHAPE_KINDS = new Set(["wild-shape", "elemental-wild-shape"]);
const DRUID_CLASS_ID = "druido";
const MOON_CIRCLES = new Set(["moon", "luna", "druido-circolo-della-luna"]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const FORM_SOURCES = new Set(["5etools", "manual", "open5e"]);
const DEFENSE_LISTS = Object.freeze(["resistances", "immunities", "vulnerabilities", "nonmagical", "nonmagicalExcept"]);
const CR_EPSILON = 1e-9;

function integer(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : 0;
}

function boundedInteger(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : null;
}

function shortString(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function stringList(value, maxItems, maxLength) {
  const list = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const text = shortString(entry, maxLength);
    if (text && !list.includes(text)) list.push(text);
    if (list.length >= maxItems) break;
  }
  return list;
}

export function plainTransformationName(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'")
    .trim().toLocaleLowerCase("it");
}

function capitalized(text) {
  return text ? `${text[0].toLocaleUpperCase("it")}${text.slice(1)}` : text;
}

function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// "al 4° livello", "all'8° livello": the article before the ordinals read with a vowel (ottavo, undicesimo).
function atLevel(level) {
  return `${level === 8 || level === 11 ? "all'" : "al "}${level}° livello`;
}

// A challenge rating as a number ("1/4" → 0.25, { cr: "1/2", lair: "1" } → 0.5, "17" → 17); null when it is unknown.
export function challengeRatingValue(cr) {
  const raw = cr && typeof cr === "object" ? cr.cr : cr;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const text = String(raw ?? "").trim();
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[2]) > 0 ? Number(fraction[1]) / Number(fraction[2]) : null;
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

// The challenge rating as the books print it: 0.25 → "1/4", 2 → "2"; "" when it is unknown.
export function challengeRatingLabel(cr) {
  const value = challengeRatingValue(cr);
  if (value === null) return "";
  const fractions = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return fractions[value] || String(value);
}

// The creature type of a stat block: 5eTools' type ("beast", { type: "beast", swarmSize: "T" }, { type: { choose } }),
// the text parser's ("swarm of Tiny beasts", "humanoid (any race)") or an Italian name. { type: "" } when unknown.
export function creatureTypeOf(value) {
  const raw = value && typeof value === "object" ? value.type : value;
  const objectSwarm = !!(value && typeof value === "object" && value.swarmSize);
  const chosen = raw && typeof raw === "object" && Array.isArray(raw.choose) ? raw.choose[0] : raw;
  const text = plainTransformationName(typeof chosen === "string" ? chosen : "");
  if (!text) return { type: "" };
  const swarm = objectSwarm || /^(?:swarm|sciame)\b/.test(text);
  const italian = ITALIAN_TYPES[text] || ITALIAN_TYPES[text.replace(/^sciame di\s+/, "").split(/\s+/)[0]];
  const english = Object.keys(CREATURE_TYPES).find((key) => new RegExp(`\\b${key}`).test(text));
  const type = english || italian || "";
  return { type, ...(swarm && type ? { swarm: true } : {}) };
}

/**
 * The limits of a source (§3 of the plan, PHB 2014), from what the caller knows of the creature:
 * - kind: one of TRANSFORMATION_KINDS;
 * - Wild Shape: druidLevel and circle ("moon" for the Circle of the Moon);
 * - Polymorph, True Polymorph: the target's targetCr, or its targetLevel without one;
 * - Shapechange: the caster's casterCr, or its casterLevel.
 * { error } when the source cannot be used; otherwise { kind, types?, excludedTypes?, maxCr?, maxCrText?, noSwim?,
 * noFly?, maxSize?, elementalsOnly? }. Swarms never qualify.
 */
export function transformationLimits({
  kind = "", druidLevel = 0, circle = "", targetCr = null, targetLevel = 0, casterCr = null, casterLevel = 0, crUnknown = false,
} = {}) {
  const moon = MOON_CIRCLES.has(plainTransformationName(circle));
  if (kind === "wild-shape") {
    const level = Math.min(20, integer(druidLevel));
    if (level < 2) return { error: "La Forma Selvatica arriva al 2° livello da druido." };
    // Circle Forms (p. 69): CR 1 from the 2nd level and the druid level divided by 3 from the 6th, ignoring the table's
    // column but not its limitations.
    const maxCr = moon ? (level >= 6 ? Math.max(1, Math.floor(level / 3)) : 1) : level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25;
    return {
      kind, types: ["beast"], maxCr,
      maxCrText: `il limite di GS ${challengeRatingLabel(maxCr)} ${atLevel(level)}${moon ? " (Circolo della Luna)" : ""}`,
      ...(level < 4 ? { noSwim: true } : {}),
      ...(level < 8 ? { noFly: true } : {}),
    };
  }
  if (kind === "elemental-wild-shape") {
    if (!moon || integer(druidLevel) < 10) {
      return { error: "La Forma Selvatica Elementale è del Circolo della Luna, dal 10° livello." };
    }
    return { kind, types: ["elemental"], elementalsOnly: true };
  }
  if (kind === "polymorph" || kind === "true-polymorph") {
    const cr = challengeRatingValue(targetCr);
    const level = Math.min(20, integer(targetLevel));
    // Lotto W7: a monster's card does not keep its challenge rating; the table checks that limit (crUnknown).
    if (cr === null && level < 1 && crUnknown) {
      return { kind, ...(kind === "polymorph" ? { types: ["beast"] } : {}), note: "GS del bersaglio sconosciuto: il limite lo controlla il tavolo." };
    }
    if (cr === null && level < 1) return { error: "Serve il GS del bersaglio, o il suo livello se non ne ha." };
    return {
      kind, ...(kind === "polymorph" ? { types: ["beast"] } : {}),
      maxCr: cr ?? level,
      maxCrText: cr !== null ? `il GS del bersaglio (${challengeRatingLabel(cr)})` : `il livello del bersaglio (${level}°)`,
    };
  }
  if (kind === "shapechange") {
    const cr = challengeRatingValue(casterCr);
    const level = Math.min(20, integer(casterLevel));
    if (cr === null && level < 1 && crUnknown) {
      return { kind, excludedTypes: ["construct", "undead"], note: "GS di chi lancia sconosciuto: il limite lo controlla il tavolo." };
    }
    if (cr === null && level < 1) return { error: "Serve il GS di chi lancia, o il suo livello se non ne ha." };
    return {
      kind, excludedTypes: ["construct", "undead"],
      maxCr: cr ?? level,
      maxCrText: cr !== null ? `il GS di chi lancia (${challengeRatingLabel(cr)})` : `il livello di chi lancia (${level}°)`,
    };
  }
  // Lotto W7e: Mass Polymorph, a beast up to the target's challenge rating, or half its level without one.
  if (kind === "mass-polymorph") {
    const cr = challengeRatingValue(targetCr);
    const level = Math.min(20, integer(targetLevel));
    if (cr === null && level < 1 && crUnknown) {
      return { kind, types: ["beast"], note: "GS del bersaglio sconosciuto: il limite lo controlla il tavolo." };
    }
    if (cr === null && level < 1) return { error: "Serve il GS del bersaglio, o il suo livello se non ne ha." };
    return {
      kind, types: ["beast"],
      maxCr: cr ?? level / 2,
      maxCrText: cr !== null ? `il GS del bersaglio (${challengeRatingLabel(cr)})` : `metà del livello del bersaglio (${level}°)`,
    };
  }
  if (kind === "animal-shapes") {
    return { kind, types: ["beast"], maxCr: 4, maxCrText: "il limite di GS 4", maxSize: "large" };
  }
  if (kind === "monster-form") return { kind };
  return { error: "Trasformazione sconosciuta." };
}

// The reasons a form (a snapshot, or the facts of a record) breaks limits of transformationLimits, in Italian; none when it
// qualifies. Every limit it breaks, not only the first.
export function transformationFormReasons(form, limits) {
  const reasons = [];
  const type = String(form?.type || "");
  if (form?.swarm) reasons.push("Sciame: non si può assumere la forma di uno sciame.");
  if (!type) reasons.push("Tipo sconosciuto: va indicato prima di usare la forma.");
  else if (limits.types && !limits.types.includes(type)) {
    reasons.push(`${capitalized(CREATURE_TYPES[type] || type)}: la forma deve essere ${limits.types.map((entry) => REQUIRED_TYPE_TEXT[entry] || CREATURE_TYPES[entry] || entry).join(" o ")}.`);
  } else if (limits.excludedTypes?.includes(type)) {
    reasons.push(`${capitalized(CREATURE_TYPES[type] || type)}: Trasformazione non permette costrutti né non morti.`);
  }
  if (limits.elementalsOnly && !WILD_SHAPE_ELEMENTALS.has(plainTransformationName(form?.name))) {
    reasons.push("Solo un elementale dell'aria, dell'acqua, del fuoco o della terra.");
  }
  if (limits.maxCr !== undefined) {
    const cr = challengeRatingValue(form?.cr);
    if (cr === null) reasons.push("GS sconosciuto: va indicato prima di usare la forma.");
    else if (cr > limits.maxCr + CR_EPSILON) reasons.push(`GS ${challengeRatingLabel(cr)}: oltre ${limits.maxCrText}.`);
  }
  if (limits.noSwim && Number(form?.speeds?.swim) > 0) reasons.push("Nuota: le forme che nuotano arrivano al 4° livello.");
  if (limits.noFly && Number(form?.speeds?.fly) > 0) reasons.push("Vola: le forme che volano arrivano all'8° livello.");
  if (limits.maxSize) {
    const size = TRANSFORMATION_SIZES.indexOf(String(form?.size || ""));
    if (size < 0) reasons.push("Taglia sconosciuta: va indicata prima di usare la forma.");
    else if (size > TRANSFORMATION_SIZES.indexOf(limits.maxSize)) {
      reasons.push(`Taglia ${TRANSFORMATION_SIZE_LABELS[TRANSFORMATION_SIZES[size]]}: al massimo ${TRANSFORMATION_SIZE_LABELS[limits.maxSize]}.`);
    }
  }
  return reasons;
}

/**
 * Whether a form (a snapshot, or the facts of a record) qualifies for a source: { allowed, reasons }, the reasons in
 * Italian, for the console to show beside a form it refuses. context: as transformationLimits.
 */
export function transformationFormAllowed(form, context = {}) {
  if (!form || typeof form !== "object") return { allowed: false, reasons: ["Nessuna forma scelta."] };
  const limits = transformationLimits(context);
  if (limits.error) return { allowed: false, reasons: [limits.error] };
  const reasons = transformationFormReasons(form, limits);
  return { allowed: reasons.length === 0, reasons, ...(limits.note ? { note: limits.note } : {}) };
}

// The transformation a class feature's pill carries (its effect plan's mechanics.transformation), or null.
export function transformationTemplateOf(feature) {
  const template = feature?.effectPlan?.mechanics?.transformation;
  return template && typeof template === "object" && TRANSFORMATION_KINDS.includes(template.kind) ? template : null;
}

// Lotto W7 (docs/PIANO_TRASFORMAZIONI.md, §3): the four spells of a form (PHB 2014), their pill and what they keep.
// Shapechange keeps the caster's mind, features and spells (G26; its spells need the form's voice and hands, at the
// table); Polymorph and True Polymorph replace the mind and the features; Animal Shapes keeps the mind only.
export const TRANSFORMATION_SPELL_TEMPLATES = Object.freeze({
  shapechange: Object.freeze({ kind: "shapechange", conditionName: "Trasformazione", keepsMind: true, keepsFeatures: true, canCast: true }),
  polymorph: Object.freeze({ kind: "polymorph", conditionName: "Metamorfosi", keepsMind: false, keepsFeatures: false, canCast: false }),
  "true-polymorph": Object.freeze({ kind: "true-polymorph", conditionName: "Metamorfosi Pura", keepsMind: false, keepsFeatures: false,
    canCast: false }),
  "animal-shapes": Object.freeze({ kind: "animal-shapes", conditionName: "Forme Animali", keepsMind: true, keepsFeatures: false,
    canCast: false }),
  // Lotto W7e (Xanathar, verified on the book): the creature keeps its own hit points and gets the form's as temporary
  // ones, which no other source replaces (hitPoints: "temporary"); with none left, or dead, it is back.
  "xanathar-metamorfosi-di-massa": Object.freeze({ kind: "mass-polymorph", conditionName: "Metamorfosi di Massa", keepsMind: false,
    keepsFeatures: false, canCast: false, hitPoints: "temporary" }),
});

export function transformationSpellTemplate(spellId) {
  return TRANSFORMATION_SPELL_TEMPLATES[String(spellId || "").trim()] || null;
}

// The total level of a character's card (its classes), 0 without one.
export function characterTotalLevel(characterBuild = []) {
  return Math.min(20, (Array.isArray(characterBuild) ? characterBuild : []).reduce((sum, entry) => sum + integer(entry?.level), 0));
}

/**
 * What a form's pill carries (lots W2a, W3b, W4a, W7): its label, its detail, and in mechanics the form's damage
 * defenses, its speeds in place of the creature's, and the transformation with the form and its hit points. template:
 * { kind, keepsMind, keepsFeatures, canCast }; label: the pill's name (Forma Selvatica, Metamorfosi...); detail: the text
 * after the form's summary.
 */
export function transformationPillParts({ template, form, label = "Forma", detail = "", portrait = null } = {}) {
  const clean = sanitizeTransformationForm(form);
  // 16/11/2026: the form's portrait on the token, when chosen (the GM's background puts it on and takes it off).
  const tokenPortrait = sanitizeTransformationPortrait(portrait);
  if (!template || !clean) return null;
  const defenses = Object.fromEntries(["resistances", "immunities", "vulnerabilities"]
    .map((list) => [list, clean.damageDefenses?.[list] || []]).filter(([, entries]) => entries.length));
  const speedModes = Object.fromEntries(Object.entries(clean.speeds || {}).map(([mode, meters]) => [mode, { replaceMeters: meters }]));
  const movement = Object.keys(speedModes).length
    ? { label: `${label} · ${clean.name}`, modes: speedModes, ...(clean.speeds.walk ? {} : { suppressModes: ["walk"] }) }
    : null;
  const { conditionName: _conditionName, ...transformation } = template;
  return {
    displayLabel: `${label} · ${clean.name}`,
    detail: `${transformationFormSummary(clean)}.${detail ? ` ${detail}` : ""}`,
    mechanics: {
      ...(Object.keys(defenses).length ? { damageDefenses: defenses } : {}),
      ...(movement ? { movement } : {}),
      transformation: { ...transformation, form: clean, formHp: clean.hitPoints?.average ?? null,
        ...(tokenPortrait ? { portrait: tokenPortrait } : {}) },
    },
  };
}

// The context of transformationLimits for a character (its card's characterBuild): its druid level and circle, for
// Wild Shape and Elemental Wild Shape.
export function transformationContextForCharacter(characterBuild = [], kind = "") {
  if (!WILD_SHAPE_KINDS.has(kind)) return { kind };
  const druid = (Array.isArray(characterBuild) ? characterBuild : []).find((entry) => entry?.classId === DRUID_CLASS_ID);
  return { kind, druidLevel: integer(druid?.level), circle: String(druid?.subclassId || "") };
}

function sanitizeDefenses(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const defenses = {};
  for (const list of DEFENSE_LISTS) {
    const entries = stringList(value[list], 16, 40);
    if (entries.length) defenses[list] = entries;
  }
  return ["resistances", "immunities", "vulnerabilities"].some((list) => defenses[list]) ? defenses : null;
}

/**
 * A form as the card and the pill keep it: the snapshot of transformationCore.js, checked field by field, its strings
 * shortened and its actions bounded (at most 8, each under 1.5 kB). null without a name.
 */
export function sanitizeTransformationForm(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = shortString(value.name, 80);
  if (!name) return null;
  const ref = shortString(value.ref, 120);
  const type = Object.hasOwn(CREATURE_TYPES, value.type) ? value.type : "";
  const size = TRANSFORMATION_SIZES.includes(value.size) ? value.size : "";
  const average = boundedInteger(value.hitPoints?.average, 1, 999);
  const formula = shortString(value.hitPoints?.formula, 40);
  const armorClass = boundedInteger(value.armorClass, 0, 40);
  const abilities = Object.fromEntries(ABILITIES.map((key) => [key, boundedInteger(value.abilities?.[key], 1, 30)])
    .filter(([, score]) => score !== null));
  const savingThrows = Object.fromEntries(ABILITIES.map((key) => [key, boundedInteger(value.savingThrows?.[key], -20, 30)])
    .filter(([, bonus]) => bonus !== null));
  const speeds = Object.fromEntries(TRANSFORMATION_SPEED_MODES.map((mode) => [mode, normalizeSpeedMeters(value.speeds?.[mode])])
    .filter(([, meters]) => meters > 0));
  const damageDefenses = sanitizeDefenses(value.damageDefenses);
  const conditionImmunities = stringList(value.conditionImmunities, 16, 40);
  const passivePerception = boundedInteger(value.passivePerception, 0, 40);
  const multiattack = shortString(value.multiattack, 280);
  const notes = shortString(value.notes, 280);
  // Its token in 5eTools' image mirror (16/11/2026): the path; the mirror's address is the GM's option.
  const portrait = typeof value.portrait === "string" && FIVE_TOOLS_PORTRAIT_PATH.test(value.portrait) ? value.portrait : "";
  // The form's attacks, quick actions of the card's shape (lotto W3a), each with an id of its own in the form.
  const actions = (Array.isArray(value.actions) ? value.actions : [])
    .filter((action) => action && typeof action === "object" && !Array.isArray(action) && jsonBytes(action) <= MAX_FORM_ACTION_BYTES)
    .slice(0, MAX_FORM_ACTIONS)
    .map((action, index) => sanitizeQuickAction({ ...clone(action), id: shortString(action.id, 60) || `form-${index + 1}` }))
    .filter(Boolean);
  return {
    name,
    ...(ref ? { ref } : {}),
    source: FORM_SOURCES.has(value.source) ? value.source : "manual",
    type,
    ...(value.swarm === true && type ? { swarm: true } : {}),
    cr: challengeRatingLabel(value.cr),
    size,
    ...(average !== null ? { hitPoints: { average, ...(formula ? { formula } : {}) } } : {}),
    ...(armorClass !== null ? { armorClass } : {}),
    ...(Object.keys(abilities).length ? { abilities } : {}),
    ...(Object.keys(savingThrows).length ? { savingThrows } : {}),
    speeds,
    ...(value.hover === true && speeds.fly ? { hover: true } : {}),
    ...(damageDefenses ? { damageDefenses } : {}),
    ...(conditionImmunities.length ? { conditionImmunities } : {}),
    ...(passivePerception !== null ? { passivePerception } : {}),
    ...(multiattack ? { multiattack } : {}),
    ...(notes ? { notes } : {}),
    ...(portrait ? { portrait } : {}),
    actions,
  };
}

const FIVE_TOOLS_PORTRAIT_PATH = /^bestiary\/tokens\/[A-Za-z0-9-]{1,24}\/[^/]{1,160}\.webp$/;

// The form's token in 5eTools' image mirror (16/11/2026): the path its snapshot keeps, or the one its 5eTools reference
// gives ("Brown Bear|MM": a quick form saved before the portraits). "" for a form typed or pasted as text.
export function transformationFormPortraitPath(form) {
  if (typeof form?.portrait === "string" && FIVE_TOOLS_PORTRAIT_PATH.test(form.portrait)) return form.portrait;
  if (form?.source !== "5etools") return "";
  const [name, source] = String(form?.ref || "").split("|");
  return name && source ? fiveToolsTokenPath({ name, source, hasToken: true }) : "";
}

// Its address with the GM's mirror (the option «immagini di 5eTools»), "" without either.
export function transformationFormPortraitUrl(form, imagesBase = "") {
  const path = transformationFormPortraitPath(form);
  return path ? fiveToolsTokenUrl(imagesBase, path) : "";
}

// The portrait the token wears in the form, as the pill keeps it: { url, width, height, mime } of a file that loaded, or
// null. Only an https address (or a mirror on this computer), with its size.
export function sanitizeTransformationPortrait(value) {
  if (!value || typeof value !== "object") return null;
  const url = String(value.url || "").trim();
  let parsed = null;
  try { parsed = new URL(url); } catch { return null; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (url.length > 500 || !(parsed.protocol === "https:" || (parsed.protocol === "http:" && local))) return null;
  const width = boundedInteger(value.width, 1, 8192);
  const height = boundedInteger(value.height, 1, 8192);
  if (width === null || height === null) return null;
  const mime = /^image\/[a-z0-9.+-]{1,20}$/.test(String(value.mime || "")) ? String(value.mime) : "image/webp";
  return { url, width, height, mime };
}

// The key that tells two forms apart: their stat block's ref, or their name.
export function transformationFormKey(form) {
  return plainTransformationName(form?.ref || form?.name || "");
}

// The card's quick forms: each one checked, without doubles, at most 8 within the byte budget (in order: one that does
// not fit is left out, the next ones still may).
export function sanitizeTransformationForms(value) {
  const forms = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    if (forms.length >= MAX_TRANSFORMATION_FORMS) break;
    const form = sanitizeTransformationForm(entry);
    const key = form ? transformationFormKey(form) : "";
    if (!form || seen.has(key) || jsonBytes([...forms, form]) > MAX_TRANSFORMATION_FORMS_BYTES) continue;
    seen.add(key);
    forms.push(form);
  }
  return forms;
}

/**
 * The quick forms with one more («Usa e salva»): { forms, error }. The same form already there is replaced where it
 * stands; replaceKey takes the place of another one (the GM's choice when the 8 are full). error, in Italian, leaves the
 * forms as they were: the list is full, or the form does not fit the budget.
 */
export function transformationFormsWith(list, form, { replaceKey = "" } = {}) {
  const current = sanitizeTransformationForms(list);
  const clean = sanitizeTransformationForm(form);
  if (!clean) return { forms: current, error: "Forma non valida." };
  const key = transformationFormKey(clean);
  const replaced = current.findIndex((entry) => transformationFormKey(entry) === key);
  const chosen = replaced >= 0 ? replaced
    : replaceKey ? current.findIndex((entry) => transformationFormKey(entry) === plainTransformationName(replaceKey)) : -1;
  if (chosen < 0 && current.length >= MAX_TRANSFORMATION_FORMS) {
    return { forms: current, error: `Le forme rapide sono già ${MAX_TRANSFORMATION_FORMS}: scegli quale sostituire.` };
  }
  const next = chosen >= 0 ? current.map((entry, index) => (index === chosen ? clean : entry)) : [...current, clean];
  if (jsonBytes(next) > MAX_TRANSFORMATION_FORMS_BYTES) {
    return { forms: current, error: "Spazio delle forme rapide esaurito: togline una prima di salvarne un'altra." };
  }
  return { forms: next, error: "" };
}

// The quick forms without one (its key).
export function transformationFormsWithout(list, key) {
  const wanted = plainTransformationName(key);
  return sanitizeTransformationForms(list).filter((entry) => transformationFormKey(entry) !== wanted);
}

// "Wolf (bestia, GS 1/4): CA 13 · PF 11 · 12 m, nuoto 9 m": what the pill and the console say of a form.
export function transformationFormSummary(form) {
  if (!form || typeof form !== "object") return "";
  const kind = [CREATURE_TYPES[form.type] || "", form.cr ? `GS ${form.cr}` : ""].filter(Boolean).join(", ");
  const speeds = TRANSFORMATION_SPEED_MODES.filter((mode) => Number(form.speeds?.[mode]) > 0)
    .map((mode) => `${mode === "walk" ? "" : `${SPEED_LABELS[mode]} `}${String(form.speeds[mode]).replace(".", ",")} m`)
    .join(", ");
  const parts = [
    Number.isFinite(form.armorClass) ? `CA ${form.armorClass}` : "",
    Number.isFinite(form.hitPoints?.average) ? `PF ${form.hitPoints.average}` : "",
    speeds,
  ].filter(Boolean);
  return `${String(form.name || "").trim()}${kind ? ` (${kind})` : ""}${parts.length ? `: ${parts.join(" · ")}` : ""}`;
}

// The transformation in force on a token (its meta): the first active pill that carries a form, as { instance, template,
// form } (the form checked as the card keeps it), or null.
export function activeTransformation(meta) {
  const conditions = meta?.conditions;
  const instances = Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
  for (const instance of instances) {
    const template = instance && instance.active !== false ? instance.mechanics?.transformation : null;
    const form = template && TRANSFORMATION_KINDS.includes(template.kind) ? sanitizeTransformationForm(template.form) : null;
    if (form) return { instance, template, form };
  }
  return null;
}

const PHYSICAL_ABILITIES = new Set(["str", "dex", "con"]);
const abilityModifierOf = (score) => (Number.isFinite(Number(score)) ? Math.floor((Number(score) - 10) / 2) : null);
const finiteOrNull = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

/**
 * The card as the rules read it while the creature is in a form (lotto W3b, decision G26): the form's AC and physical
 * abilities; its mind (Int, Wis, Cha and their saves) the creature's own when the source keeps it (keepsMind), the form's
 * otherwise. A save is the form's (its stat block's, or its modifier); with keepsFeatures, a proficiency of the creature
 * (its save above its modifier) added to the form's modifier wins when higher. Without a transformation, the card itself.
 */
export function transformedCardView(card, transformation) {
  const base = card && typeof card === "object" ? card : {};
  const form = transformation?.form;
  if (!form) return base;
  const keepsMind = transformation.template?.keepsMind !== false;
  const keepsFeatures = transformation.template?.keepsFeatures !== false;
  const modifiers = { ...(base.abilityModifiers && typeof base.abilityModifiers === "object" ? base.abilityModifiers : {}) };
  const saves = { ...(base.savingThrows && typeof base.savingThrows === "object" ? base.savingThrows : {}) };
  for (const ability of ABILITIES) {
    if (keepsMind && !PHYSICAL_ABILITIES.has(ability)) continue;
    const formModifier = abilityModifierOf(form.abilities?.[ability]);
    const formSave = finiteOrNull(form.savingThrows?.[ability]) ?? formModifier;
    const ownSave = finiteOrNull(base.savingThrows?.[ability]);
    const ownModifier = finiteOrNull(base.abilityModifiers?.[ability]);
    const proficiency = keepsFeatures && ownSave !== null && ownModifier !== null && ownSave - ownModifier >= 2 ? ownSave - ownModifier : 0;
    modifiers[ability] = formModifier;
    saves[ability] = formSave === null ? null : Math.max(formSave, proficiency && formModifier !== null ? formModifier + proficiency : formSave);
  }
  return {
    ...base,
    ...(Number.isFinite(form.armorClass) ? { armorClass: form.armorClass } : {}),
    abilityModifiers: modifiers,
    savingThrows: saves,
  };
}

/**
 * Lotto W3b: the AC the character sheet shows (initiative-card-modal.js): the form's while it lasts, the one the rules
 * read (transformedCardView), with the creature's own in the title. card: the profile; meta: the token's metadata.
 * { armorClass, title }; the card's own AC and no title outside a form.
 */
export function transformationArmorClassView(card, meta) {
  const own = finiteOrNull(card?.armorClass);
  const transformation = activeTransformation(meta);
  const shown = transformation ? finiteOrNull(transformedCardView(card, transformation).armorClass) : own;
  if (!transformation || shown === own) return { armorClass: own, title: "" };
  return { armorClass: shown, title: `CA di ${transformation.form.name}, finché dura la forma; la sua: ${own ?? "—"}` };
}

// «Altra forma…», the source «token nella stanza» (lotto W2a, a GM's source of G37): the monsters' tokens of the scene,
// the creature itself left out, by name. [{ id, name, fromArchive }]: fromArchive when its card names a 5eTools record,
// which transformationFormFromToken (transformationCore.js) reads from the GM's archive.
export function transformationTokenSources(items = [], ownId = "") {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.id && item.id !== ownId && String(item.name || "").trim())
    .map((item) => ({ item, profile: sanitizeMonsterProfile(item.metadata?.[TRANSFORMATION_TOKEN_META_KEY]?.initiativeCard?.[MONSTER_PROFILE_FIELD]) }))
    .filter(({ profile }) => !!profile)
    .map(({ item, profile }) => ({ id: item.id, name: String(item.name).trim(), fromArchive: !!profile.ref }))
    .sort((left, right) => left.name.localeCompare(right.name, "it"));
}
