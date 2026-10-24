// Wild Magic Surge engine (PHB 2014): the d100 the table rolled finds its row in the catalog's table
// (class-features-runtime.json, "wildMagicTable"), and the row's action is planned here, without side effects.
// What the plugin can reproduce is reproduced: a buff pill with its duration and defenses, a condition, the
// spell cast from the spell panel without a slot, healing, sorcery points, a spell slot. Everything else stays
// at the table, and every row can still put a pill of its own on the sorcerer through the small buff builder.
import { BUFF_ALL_DAMAGE_TYPES, planBuffApplication } from "./buffPresetCore.js";

export const WILD_MAGIC_SURGE_FEATURE_ID = "stregone-magia-selvaggia-impulso-di-magia-selvaggia";
export const WILD_MAGIC_TIDES_POOL_ID = "stregone-magia-selvaggia-onde-di-caos-usi";
export const WILD_MAGIC_SORCERY_POINTS_POOL_ID = "stregone-punti-stregoneria";

export const WILD_MAGIC_ACTION_KINDS = Object.freeze({
  BUFF: "buff",
  CONDITION: "condition",
  SPELL: "spell",
  HEAL: "heal",
  SORCERY_POINTS: "sorcery-points",
  SPELL_SLOT: "spell-slot",
  MANUAL: "manual",
});

const MINUTE = Object.freeze({ duration: 1, unit: "minutes" });
const ROUND = Object.freeze({ duration: 1, unit: "rounds" });
const MANUAL = Object.freeze({ duration: null, unit: "rounds" });
const buff = (name, icon, duration, extra = {}) => Object.freeze({ kind: "buff", buff: Object.freeze({ name, icon, ...duration, ...extra }) });
const condition = (conditionName, rounds, extra = {}) => Object.freeze({ kind: "condition", conditionName, rounds, ...extra });
const spell = (extra = {}) => Object.freeze({ kind: "spell", ...extra });
const manual = (hint, pill = null) => Object.freeze({ kind: "manual", hint, ...(pill ? { pill } : {}) });

// One action per row of the table, keyed by its range. The short pill names are the plugin's own words: the
// table's text is shown as the catalog has it. "self" casts target the sorcerer; durations follow the table.
export const WILD_MAGIC_SURGE_ACTIONS = Object.freeze({
  "01-02": buff("Impulso a ogni turno", "⚡", MINUTE, { notes: ["d100 a inizio turno"] }),
  "03-04": buff("Vede l'invisibile", "👁️", MINUTE),
  "05-06": manual("Il modron compare accanto allo Stregone: token e statistiche li gestisce il DM.", { name: "Modron evocato", icon: "🎁", ...MINUTE }),
  "07-08": spell({ slotLevel: 3, self: true }),
  "09-10": spell({ slotLevel: 5 }),
  "11-12": manual("Tira un d10 per la statura al tavolo.", { name: "Statura cambiata", icon: "✨", ...MANUAL }),
  "13-14": spell({ self: true, rounds: 10 }),
  "15-16": buff("Rigenerazione 5 PF", "❤️", MINUTE, { notes: ["+5 PF a inizio turno"] }),
  "17-18": buff("Barba di piume", "🪽", MANUAL, { notes: ["Fino allo starnuto"] }),
  "19-20": spell({ self: true }),
  "21-22": buff("Prossimo TS con svantaggio", "🍀", MINUTE, { notes: ["Svantaggio al TS del prossimo incantesimo"] }),
  "23-24": buff("Pelle blu", "✨", MANUAL, { notes: ["Fino a Rimuovi maledizione"] }),
  "25-26": buff("Terzo occhio", "👁️", MINUTE, { notes: ["Vantaggio Percezione (vista)"] }),
  "27-28": buff("Lancio come azione bonus", "⚡", MINUTE, { notes: ["Incantesimi da 1 azione"] }),
  "29-30": manual("Sposta il token entro 18 m: il movimento entra nel log."),
  "31-32": buff("Sul Piano Astrale", "🌙", ROUND, { notes: ["Torna a fine del prossimo turno"] }),
  "33-34": buff("Prossimo danno massimo", "🔥", MINUTE, { notes: ["Danni dell'incantesimo massimizzati"] }),
  "35-36": manual("Tira un d10 per l'età al tavolo.", { name: "Età cambiata", icon: "✨", ...MANUAL }),
  "37-38": manual("I flumph compaiono entro 18 m: token e statistiche li gestisce il DM.", { name: "Flumph evocati", icon: "🎁", ...MINUTE }),
  "39-40": Object.freeze({ kind: "heal", dice: "2d10" }),
  "41-42": buff("Pianta in vaso", "🍀", ROUND, {
    notes: ["Incapacitato", "Fino al prossimo turno"],
    defenses: [{ kind: "vulnerability", type: BUFF_ALL_DAMAGE_TYPES }],
    condition: "Incapacitato",
  }),
  "43-44": buff("Teletrasporto bonus 6 m", "🪽", MINUTE),
  "45-46": spell({ self: true, rounds: 100 }),
  "47-48": manual("L'unicorno compare entro 1,5 m: token e statistiche li gestisce il DM.", { name: "Unicorno evocato", icon: "🎁", ...MINUTE }),
  "49-50": buff("Non può parlare", "🌙", MINUTE, { notes: ["Bolle rosa"] }),
  "51-52": buff("Scudo spettrale", "🛡️", MINUTE, { notes: ["+2 CA", "Imm. dardo incantato"] }),
  "53-54": buff("Immune all'alcol", "🧪", MANUAL, { notes: ["5d6 giorni"] }),
  "55-56": buff("Senza capelli", "✨", MANUAL, { notes: ["Ricrescono in 24 ore"] }),
  "57-58": buff("Tocco infuocato", "🔥", MINUTE, { notes: ["Incendia ciò che tocca"] }),
  "59-60": Object.freeze({ kind: "spell-slot" }),
  "61-62": buff("Parla gridando", "⚡", MINUTE),
  "63-64": spell({ self: true, rounds: 600 }),
  "65-66": manual("4d10 fulmine a tre creature entro 9 m: applicali dalla console o dagli HP rapidi."),
  "67-68": condition("Spaventato", 1, { note: "Dalla creatura più vicina, fino alla fine del prossimo turno." }),
  "69-70": condition("Invisibile", 10, { selection: true, note: "Seleziona sulla mappa le creature entro 9 m." }),
  "71-72": buff("Resistenza a tutto", "🛡️", MINUTE, { defenses: [{ kind: "resistance", type: BUFF_ALL_DAMAGE_TYPES }] }),
  "73-74": condition("Avvelenato", 0, { selection: true, note: "Seleziona la creatura tirata a caso; 1d4 ore, fine manuale." }),
  "75-76": buff("Luce radiosa", "☀️", MINUTE, { notes: ["Luce intensa 9 m", "Accieca entro 1,5 m"] }),
  "77-78": spell({ self: true, rounds: 600 }),
  "79-80": buff("Farfalle e petali", "✨", MINUTE),
  "81-82": buff("Azione aggiuntiva", "⚡", ROUND),
  "83-84": manual("1d10 necrotici a ogni creatura entro 9 m, lo Stregone recupera il totale: risolvilo con gli HP rapidi."),
  "85-86": spell({ self: true }),
  "87-88": spell({ rounds: 100 }),
  "89-90": condition("Invisibile", 10, { note: "Finisce se attacca o lancia un incantesimo." }),
  "91-92": buff("Reincarnazione pronta", "🍀", MINUTE, { notes: ["Se muore entro 1 minuto"] }),
  "93-94": buff("Taglia aumentata", "💪", MINUTE),
  "95-96": buff("Vulnerabile ai perforanti", "🔥", MINUTE, {
    defenses: [{ kind: "vulnerability", type: "piercing" }],
    selection: true,
  }),
  "97-98": buff("Musica eterea", "✨", MINUTE),
  "99-00": Object.freeze({ kind: "sorcery-points" }),
});

// "01-02" → [1, 2]; "99-00" → [99, 100]: the "00" of a d100 is 100.
export function wildMagicRangeBounds(range) {
  const match = /^(\d{1,3})\s*-\s*(\d{1,3})$/u.exec(String(range || "").trim());
  if (!match) return null;
  const value = (text) => (Number(text) === 0 ? 100 : Number(text));
  const low = value(match[1]);
  const high = value(match[2]);
  return low >= 1 && high <= 100 && low <= high ? [low, high] : null;
}

// The d100 as typed at the table: 1-100, with 0 and "00" read as 100.
export function normalizeWildMagicRoll(value) {
  const textValue = String(value ?? "").trim();
  if (!/^\d{1,3}$/u.test(textValue)) return null;
  const roll = Number(textValue) === 0 ? 100 : Number(textValue);
  return roll >= 1 && roll <= 100 ? roll : null;
}

export function wildMagicRowForRoll(rows, value) {
  const roll = normalizeWildMagicRoll(value);
  if (roll === null) return null;
  return (Array.isArray(rows) ? rows : []).find((row) => {
    const bounds = wildMagicRangeBounds(row?.d100);
    return bounds && roll >= bounds[0] && roll <= bounds[1];
  }) || null;
}

// "2d10" → { count: 2, sides: 10 }; the healing roll the GM can let the plugin make.
export function parseWildMagicDice(expression) {
  const match = /^(\d{1,2})d(\d{1,3})$/iu.exec(String(expression || "").trim());
  return match ? { count: Number(match[1]), sides: Number(match[2]) } : null;
}

export function rollWildMagicDice(expression, random = Math.random) {
  const dice = parseWildMagicDice(expression);
  if (!dice) return null;
  let total = 0;
  for (let index = 0; index < dice.count; index += 1) total += 1 + Math.floor(random() * dice.sides);
  return total;
}

// The pill the small builder starts from: the row's own buff, its manual suggestion, or a pill named after it.
export function wildMagicPillDraft(row) {
  const action = WILD_MAGIC_SURGE_ACTIONS[row?.d100];
  const base = action?.kind === "buff" ? action.buff : action?.pill || null;
  return {
    name: base?.name || `Impulso ${row?.d100 || ""}`.trim(),
    icon: base?.icon || "✨",
    duration: base ? base.duration ?? null : 1,
    unit: base ? base.unit || "rounds" : "minutes",
    notes: Array.isArray(base?.notes) ? base.notes.join(", ") : "",
  };
}

// The plan of a row for this sorcerer: what Applica does, in a shape the popup executes with the runtime calls.
// The pill drafted by the builder (draft) replaces the row's own buff when the GM edited it.
export function planWildMagicSurgeAction(row, {
  sorcererId = "",
  sorcererName = "",
  selectionIds = [],
  spell = null,
  healTotal = null,
  draft = null,
} = {}) {
  const id = String(sorcererId || "").trim();
  if (!row || !id) return { ok: false, error: "Nessuno Stregone." };
  const action = WILD_MAGIC_SURGE_ACTIONS[row.d100] || manual("Risolvi l'esito al tavolo.");
  const label = `Impulso di Magia Selvaggia ${row.d100}`;
  const others = (Array.isArray(selectionIds) ? selectionIds : []).map(String).filter((value) => value && value !== id);
  const pill = (definition, targetIds) => {
    // The defenses are written as the builder's rows ({ kind, type }), "all" for every damage type.
    const { defenses, ...rest } = definition;
    const plan = planBuffApplication({
      definition: rest,
      defenseRows: Array.isArray(defenses) ? defenses : null,
      sourceId: id,
      sourceName: sorcererName || "Stregone",
      effectKey: `wild-magic-${row.d100}`,
    });
    return plan.ok ? { ...plan, targetIds } : null;
  };
  if (draft) {
    const plan = pill(draft, [id]);
    return plan ? { ok: true, kind: "buff", label, pill: plan } : { ok: false, error: "Dai un nome alla pillola." };
  }
  switch (action.kind) {
    case "buff": {
      const targetIds = action.buff.selection ? [id, ...others] : [id];
      const plan = pill(action.buff, targetIds);
      if (!plan) return { ok: false, error: "Pillola non valida." };
      return {
        ok: true, kind: "buff", label, pill: plan,
        ...(action.buff.condition ? { condition: { conditionName: action.buff.condition, targetIds: [id], rounds: 1 } } : {}),
      };
    }
    case "condition": {
      const targetIds = action.selection ? others : [id];
      if (!targetIds.length) return { ok: false, error: action.note || "Seleziona i bersagli sulla mappa." };
      return { ok: true, kind: "condition", label, condition: { conditionName: action.conditionName, targetIds, rounds: action.rounds } };
    }
    case "spell": {
      if (!row.spellId || !spell) return { ok: false, error: "Incantesimo non disponibile nel catalogo." };
      const slotLevel = Math.max(Number(spell.level) || 0, Number(action.slotLevel) || 0) || null;
      return {
        ok: true, kind: "spell", label,
        route: {
          sourceId: id, casterId: id, spellId: row.spellId, slotSource: "none",
          ...(slotLevel ? { slotLevel } : {}),
          ...(action.rounds ? { durationTurns: action.rounds } : {}),
          targetIds: action.self ? [id] : [],
          origin: "wild-magic-surge",
          // PHB 2014: a spell the surge casts needs no concentration and lasts its full duration.
          withoutConcentration: true,
        },
        noConcentration: row.noConcentration === true,
      };
    }
    case "heal": {
      const amount = Math.floor(Number(healTotal));
      if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: `Inserisci il totale di ${action.dice}.` };
      return { ok: true, kind: "heal", label, heal: { targetId: id, amount, dice: action.dice } };
    }
    case "sorcery-points":
      return { ok: true, kind: "sorcery-points", label, poolId: WILD_MAGIC_SORCERY_POINTS_POOL_ID };
    case "spell-slot":
      return { ok: true, kind: "spell-slot", label };
    default:
      return { ok: true, kind: "manual", label, hint: action.hint || "Risolvi l'esito al tavolo." };
  }
}

// What the Applica button says for a row before the GM presses it.
export function wildMagicActionSummary(row) {
  const action = WILD_MAGIC_SURGE_ACTIONS[row?.d100];
  switch (action?.kind) {
    case "buff": return action.buff.condition ? `Pillola «${action.buff.name}» e ${action.buff.condition}` : `Pillola «${action.buff.name}»`;
    case "condition": return `${action.conditionName}${action.selection ? " ai selezionati" : " sullo Stregone"}`;
    case "spell": return "Lancio dal pannello incantesimi, senza slot";
    case "heal": return `Cura ${action.dice}`;
    case "sorcery-points": return "Recupera tutti i punti stregoneria";
    case "spell-slot": return "Recupera lo slot speso di livello più basso";
    default: return "Da risolvere al tavolo";
  }
}

// Wild Magic's 59-60: the lowest slot level the sorcerer has spent (Pact Magic aside); null when none is spent.
export function lowestSpentSpellSlot(slotRows = []) {
  return (Array.isArray(slotRows) ? slotRows : [])
    .filter((row) => row && row.pact !== true && Number(row.current) < Number(row.maximum))
    .sort((left, right) => Number(left.level) - Number(right.level))[0] || null;
}

// The surge as the History and the combat log name it: "Impulso di Magia Selvaggia (72): Resistenza a tutto".
// outcome: what Applica did, in the GM's words (the pill, the spell, "al tavolo").
export function wildMagicSurgeRecord({ row = null, roll = null, outcome = "", sorcererId = "", sorcererName = "" } = {}) {
  const normalizedRoll = normalizeWildMagicRoll(roll);
  const range = String(row?.d100 || "").trim();
  const shown = normalizedRoll === null ? range : String(normalizedRoll).padStart(2, "0");
  const text = String(outcome || "").trim() || "al tavolo";
  return {
    label: `Impulso di Magia Selvaggia${shown ? ` (${shown})` : ""}: ${text}`.slice(0, 160),
    payload: {
      wildMagicSurge: {
        ...(normalizedRoll === null ? {} : { roll: normalizedRoll }),
        range,
        effect: String(row?.effect || "").trim().slice(0, 300),
        outcome: text.slice(0, 160),
        ...(sorcererId ? { sorcererId: String(sorcererId) } : {}),
        ...(sorcererName ? { sorcererName: String(sorcererName).slice(0, 100) } : {}),
      },
    },
  };
}

// The combat log's lines of a surge (combatLogPresentationCore.js).
export function wildMagicSurgeLogLines(surge) {
  if (!surge || typeof surge !== "object") return [];
  const roll = Number.isInteger(surge.roll) ? `d100 ${surge.roll}${surge.range ? ` (${surge.range})` : ""}` : surge.range ? `riga ${surge.range}` : "";
  return [
    [String(surge.sorcererName || "").trim(), roll].filter(Boolean).join(" · "),
    surge.effect ? `Effetto: ${surge.effect}` : "",
    surge.outcome ? `Esito: ${surge.outcome}` : "",
  ].filter(Boolean);
}
