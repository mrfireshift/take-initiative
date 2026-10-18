// Buffs composed in the Conditions popup: consumables, gifts and any benefit without a caster or
// concentration. Pure data: a buff definition becomes condition options and, when it gives a
// spell's effect, the spell to cast. A defense lives in mechanics.damageDefenses, which Boss
// Actions apply like profile defenses; notes become micropills (summaryParts).
import { DAMAGE_TYPES, damageTypeLabel, mergeDamageDefenses } from "./damageDefensesCore.js";

export const BUFF_OPTION_PREFIX = "buff:";
export const BUFF_SAVED_OPTION_PREFIX = "buff-saved:";
export const BUFF_NEW_OPTION_VALUE = "buff-new";
export const BUFF_ALL_DAMAGE_TYPES = "all";
export const BUFF_DURATION_UNITS = Object.freeze([
  Object.freeze({ id: "rounds", label: "round", rounds: 1 }),
  Object.freeze({ id: "minutes", label: "minuti", rounds: 10 }),
  Object.freeze({ id: "hours", label: "ore", rounds: 600 }),
]);
export const BUFF_DEFENSE_KINDS = Object.freeze([
  Object.freeze({ id: "resistance", label: "Resistenza", list: "resistances", tag: "Res." }),
  Object.freeze({ id: "immunity", label: "Immunità", list: "immunities", tag: "Imm." }),
  Object.freeze({ id: "vulnerability", label: "Vulnerabilità", list: "vulnerabilities", tag: "Vuln." }),
]);
export const BUFF_ICONS = Object.freeze(["🧪", "🎁", "✨", "🛡️", "💪", "⚡", "🔥", "❄️", "🪽", "👁️", "🍀", "❤️", "🌙", "☀️"]);
const MAX_NOTES = 4;
const MAX_DEFENSES = 13;

// The pill colors come from the icon family, so a composed buff needs no color picker.
const THEMES = Object.freeze({
  default: Object.freeze({ accent: "#34d399", background: "#064e3b", text: "#ecfdf5" }),
  "🎁": Object.freeze({ accent: "#fbbf24", background: "#713f12", text: "#fffbeb" }),
  "🛡️": Object.freeze({ accent: "#93c5fd", background: "#1e3a8a", text: "#eff6ff" }),
  "🔥": Object.freeze({ accent: "#fb923c", background: "#7c2d12", text: "#fff7ed" }),
  "❄️": Object.freeze({ accent: "#7dd3fc", background: "#0c4a6e", text: "#f0f9ff" }),
  "⚡": Object.freeze({ accent: "#facc15", background: "#713f12", text: "#fefce8" }),
  "✨": Object.freeze({ accent: "#c4b5fd", background: "#4c1d95", text: "#f5f3ff" }),
  "🌙": Object.freeze({ accent: "#a5b4fc", background: "#312e81", text: "#eef2ff" }),
});

export function buffTheme(icon) {
  const emoji = BUFF_ICONS.includes(icon) ? icon : BUFF_ICONS[0];
  return { emoji, ...(THEMES[emoji] || THEMES.default) };
}

const text = (value, maxLength = 80) => String(value || "").trim().slice(0, maxLength);
const TYPE_IDS = DAMAGE_TYPES.map((entry) => entry.id);

// A defense row of the composer: { kind, type } where type may be "all".
function defensesFromRows(rows = []) {
  const lists = { immunities: [], resistances: [], vulnerabilities: [] };
  for (const row of Array.isArray(rows) ? rows.slice(0, MAX_DEFENSES) : []) {
    const kind = BUFF_DEFENSE_KINDS.find((entry) => entry.id === row?.kind);
    if (!kind) continue;
    if (row.type === BUFF_ALL_DAMAGE_TYPES) lists[kind.list].push(...TYPE_IDS);
    else if (TYPE_IDS.includes(row?.type)) lists[kind.list].push(row.type);
  }
  return mergeDamageDefenses(lists);
}

function hasDefenses(defenses) {
  return BUFF_DEFENSE_KINDS.some((kind) => defenses[kind.list].length > 0);
}

// Composer rows back from a stored defense set ("all" when every type is listed).
export function buffDefenseRows(defenses) {
  const clean = mergeDamageDefenses(defenses);
  return BUFF_DEFENSE_KINDS.flatMap((kind) => clean[kind.list].length === TYPE_IDS.length
    ? [{ kind: kind.id, type: BUFF_ALL_DAMAGE_TYPES }]
    : clean[kind.list].map((type) => ({ kind: kind.id, type })));
}

function defenseSentence(defenses) {
  return BUFF_DEFENSE_KINDS.flatMap((kind) => {
    const types = defenses[kind.list];
    if (!types.length) return [];
    return [`${kind.label} ${types.length === TYPE_IDS.length ? "a tutti i danni" : types.map(damageTypeLabel).join(", ")}`];
  }).join("; ");
}

export function normalizeBuffDefinition(value = {}) {
  const unit = BUFF_DURATION_UNITS.some((entry) => entry.id === value?.unit) ? value.unit : "hours";
  const duration = Math.floor(Number(value?.duration));
  return {
    name: text(value?.name),
    icon: BUFF_ICONS.includes(value?.icon) ? value.icon : BUFF_ICONS[0],
    detail: text(value?.detail, 240),
    defenses: mergeDamageDefenses(value?.defenses),
    notes: (Array.isArray(value?.notes) ? value.notes : String(value?.notes || "").split(","))
      .map((note) => text(note, 40)).filter(Boolean).slice(0, MAX_NOTES),
    spellId: text(value?.spellId, 120),
    spellChoice: text(value?.spellChoice, 80),
    duration: Number.isInteger(duration) && duration > 0 ? Math.min(9999, duration) : null,
    unit,
  };
}

const model = (id, definition) => Object.freeze({ id, ...normalizeBuffDefinition(definition) });

// Starting points: the GM edits any field before applying or saving a buff of their own.
export const BUFF_PRESETS = Object.freeze([
  model("pozione-di-resistenza", { name: "Pozione di Resistenza", defenses: { resistances: ["fire"] }, duration: 1, unit: "hours",
    detail: "Resistenza a un tipo di danno per 1 ora." }),
  model("pozione-di-invulnerabilita", { name: "Pozione di Invulnerabilità", defenses: { resistances: TYPE_IDS }, duration: 1, unit: "minutes",
    detail: "Resistenza a tutti i danni per 1 minuto." }),
  model("pozione-di-eroismo", { name: "Pozione di Eroismo", notes: ["10 PF temp."], spellId: "bless", duration: 1, unit: "hours",
    detail: "10 punti ferita temporanei e gli effetti di Benedizione (+1d4 ad attacchi e TS) per 1 ora." }),
  model("pozione-di-crescita", { name: "Pozione di Crescita", spellId: "enlarge-reduce", spellChoice: "enlarge", duration: 1, unit: "hours",
    detail: "Gli effetti di Ingrandire per 1d4 ore, senza concentrazione." }),
  model("pozione-di-forza-del-gigante", { name: "Pozione di Forza del Gigante", icon: "💪", notes: ["For 21"], duration: 1, unit: "hours",
    detail: "Il punteggio di Forza diventa quello del gigante indicato dalla pozione per 1 ora." }),
  model("pozione-di-velocita", { name: "Pozione di Velocità", spellId: "haste", duration: 1, unit: "minutes",
    detail: "Gli effetti di Velocità per 1 minuto, senza concentrazione." }),
  model("pozione-di-volo", { name: "Pozione di Volo", spellId: "fly", duration: 1, unit: "hours",
    detail: "Velocità di volare pari alla velocità camminando per 1 ora; può fluttuare." }),
  model("pozione-di-invisibilita", { name: "Pozione di Invisibilità", spellId: "invisibility", duration: 1, unit: "hours",
    detail: "Invisibile per 1 ora; termina se attacca o lancia un incantesimo." }),
]);
const PRESET_BY_ID = new Map(BUFF_PRESETS.map((entry) => [entry.id, entry]));

export function getBuffPreset(id) {
  return PRESET_BY_ID.get(String(id || "").trim()) || null;
}

export function buffPresetFromOptionValue(value) {
  const raw = String(value || "");
  return raw.startsWith(BUFF_OPTION_PREFIX) ? getBuffPreset(raw.slice(BUFF_OPTION_PREFIX.length)) : null;
}

export function isBuffOptionValue(value) {
  const raw = String(value || "");
  return raw === BUFF_NEW_OPTION_VALUE || raw.startsWith(BUFF_OPTION_PREFIX) || raw.startsWith(BUFF_SAVED_OPTION_PREFIX);
}

export function buffDurationRounds(duration, unit) {
  const factor = BUFF_DURATION_UNITS.find((entry) => entry.id === unit)?.rounds || 1;
  const value = Math.floor(Number(duration));
  return Number.isFinite(value) && value > 0 ? Math.min(100000, value * factor) : null;
}

// The catalog spell as the buff casts it: no concentration and no timing of its own, so the spell
// and its pills last the buff's rounds (the `turns` of the cast).
export function buffSpellDefinition(spell) {
  if (!spell?.id) return null;
  return { ...spell, concentration: false, expiry: null };
}

// Turns a composed buff into the condition name and options of one effect per target and, when
// it gives a spell's effect, the spell to cast. Without defenses or notes the spell's own pills
// are the whole buff, so no extra pill is planned.
export function planBuffApplication({
  definition = null, defenseRows = null, giver = "", sourceId = "", sourceName = "", effectKey = "",
} = {}) {
  const buff = normalizeBuffDefinition(definition || {});
  if (!buff.name) return { ok: false, error: "Dai un nome al buff." };
  const defenses = Array.isArray(defenseRows) ? defensesFromRows(defenseRows) : buff.defenses;
  const rounds = buffDurationRounds(buff.duration, buff.unit);
  if (buff.spellId && !rounds) return { ok: false, error: "Un buff con incantesimo richiede una durata." };
  const giverText = text(giver);
  const unitLabel = BUFF_DURATION_UNITS.find((entry) => entry.id === buff.unit)?.label || "round";
  const defenseText = defenseSentence(defenses);
  const theme = buffTheme(buff.icon);
  return {
    ok: true,
    conditionName: buff.name,
    rounds,
    definition: { ...buff, defenses },
    spell: buff.spellId ? { id: buff.spellId, choice: buff.spellChoice } : null,
    pill: !buff.spellId || hasDefenses(defenses) || buff.notes.length > 0,
    options: {
      ...(sourceId ? { sourceId: String(sourceId) } : {}),
      ...(sourceName || giverText ? { sourceName: String(sourceName || giverText) } : {}),
      effectId: `buff:${text(effectKey, 120) || buff.name.toLocaleLowerCase("it").replace(/\s+/gu, "-")}`,
      effectKind: "buff",
      displayLabel: buff.name,
      ...(buff.notes.length ? { summaryParts: buff.notes.map((label, index) => ({ id: `buff-note-${index + 1}`, label })) } : {}),
      effectDetail: [buff.detail, defenseText ? `${defenseText}.` : "", buff.notes.length ? `${buff.notes.join(" · ")}.` : "",
        giverText ? `Concesso da ${giverText}.` : "", rounds ? `Durata: ${buff.duration} ${unitLabel}.` : ""]
        .filter(Boolean).join(" "),
      theme,
      expiry: rounds ? { mode: "rounds", remaining: rounds } : { mode: "manual" },
      ...(hasDefenses(defenses) ? { mechanics: { damageDefenses: defenses } } : {}),
    },
  };
}

// ---- buffs saved by the GM (browser storage, like the custom aura presets) ----
export function createBuffPresetId() {
  try {
    if (globalThis.crypto?.randomUUID) return `buff-${globalThis.crypto.randomUUID()}`;
  } catch {}
  return `buff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeSavedBuff(value) {
  const id = text(value?.id, 120);
  if (!id) return null;
  const definition = normalizeBuffDefinition(value?.definition || value);
  if (!definition.name) return null;
  return { id, updatedAt: Math.max(0, Math.floor(Number(value?.updatedAt) || 0)), definition };
}

export function normalizeSavedBuffs(values = []) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const saved = normalizeSavedBuff(value);
    if (saved) byId.set(saved.id, saved);
  }
  return [...byId.values()].sort((left, right) => left.definition.name.localeCompare(right.definition.name, "it"));
}
