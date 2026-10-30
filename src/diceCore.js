// Dice engine of the Online dice tray (docs/PIANO_DADI_ONLINE.md, lot D-1). Pure: no SDK, no DOM.
// The roller's client parses the formula, draws the values with the browser's cryptographic generator and the throw
// of every physical die, and broadcasts the record; the other clients only check it and show it. The 3D tray then
// makes each die land on the value drawn here: the physics never decides a result.

export const DICE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100]);
export const DICE_MAX_COUNT = 30;
export const DICE_MAX_MODIFIER = 999;
export const DICE_FORMULA_MAX_LENGTH = 80;
export const DICE_ROLL_HISTORY_LIMIT = 50;

const SIDE_SET = new Set(DICE_SIDES);
const TERM_PATTERN = /^(\d*)d(\d+|%)(?:(kh|kl|k)(\d+))?$/;
const ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function failure(error) {
  return { ok: false, error };
}

// "2d6+1d20kh1-1d4+3": dice groups with a sign and an optional keep, and one flat modifier. Spaces are ignored,
// "d%" is a d100, "k3" means "keep the 3 highest".
export function parseDiceFormula(text) {
  const source = String(text ?? "").replace(/\s+/g, "").toLowerCase();
  if (!source) return failure("Scrivi una formula, per esempio 1d20+5.");
  if (source.length > DICE_FORMULA_MAX_LENGTH) return failure("Formula troppo lunga.");
  const tokens = source.match(/[+-]?[^+-]+/g);
  if (!tokens || tokens.join("") !== source) return failure("Formula non valida.");
  const groups = [];
  let modifier = 0;
  let count = 0;
  for (const token of tokens) {
    const sign = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+-]/, "");
    if (/^\d+$/.test(body)) {
      modifier += sign * Number(body);
      continue;
    }
    const match = TERM_PATTERN.exec(body);
    if (!match) return failure(`Termine non valido: ${body}.`);
    const dice = match[1] === "" ? 1 : Number(match[1]);
    const sides = match[2] === "%" ? 100 : Number(match[2]);
    if (!SIDE_SET.has(sides)) return failure(`Dado non disponibile: d${match[2]}.`);
    if (dice < 1) return failure("Ogni gruppo ha almeno un dado.");
    let keep = null;
    if (match[3]) {
      const kept = Number(match[4]);
      if (kept < 1 || kept > dice) return failure(`Si tengono da 1 a ${dice} dadi in ${body}.`);
      keep = { mode: match[3] === "kl" ? "low" : "high", count: kept };
    }
    count += dice;
    groups.push({ count: dice, sides, sign, keep });
  }
  if (!groups.length) return failure("Serve almeno un dado.");
  if (count > DICE_MAX_COUNT) return failure(`Al massimo ${DICE_MAX_COUNT} dadi per tiro.`);
  if (Math.abs(modifier) > DICE_MAX_MODIFIER) return failure("Modificatore troppo grande.");
  return { ok: true, groups, modifier };
}

// Advantage or disadvantage turns the single d20 into 2d20 keeping the higher or the lower.
export function withAdvantage(parsed, mode) {
  if (!parsed?.ok || (mode !== "advantage" && mode !== "disadvantage")) return parsed;
  const d20 = parsed.groups.filter((group) => group.sides === 20);
  if (d20.length !== 1 || d20[0].count !== 1 || d20[0].keep) {
    return failure("Vantaggio e svantaggio valgono con un solo d20.");
  }
  return {
    ...parsed,
    groups: parsed.groups.map((group) => (group === d20[0]
      ? { ...group, count: 2, keep: { mode: mode === "advantage" ? "high" : "low", count: 1 } }
      : group)),
  };
}

export function formatDiceFormula(parsed) {
  if (!parsed?.ok) return "";
  const parts = parsed.groups.map((group, index) => {
    const keep = group.keep ? `${group.keep.mode === "low" ? "kl" : "kh"}${group.keep.count}` : "";
    const sign = group.sign < 0 ? "-" : index ? "+" : "";
    return `${sign}${group.count}d${group.sides}${keep}`;
  });
  if (parsed.modifier) parts.push(parsed.modifier > 0 ? `+${parsed.modifier}` : String(parsed.modifier));
  return parts.join("");
}

// The tray's buttons: { 20: 1, 6: 2 } and +3 → "1d20+2d6+3" (bigger dice first, the d100 first of all).
export function formulaFromDiceCounts(counts, modifier = 0) {
  const parts = [...DICE_SIDES].reverse()
    .map((sides) => [sides, Math.max(0, Math.floor(Number(counts?.[sides]) || 0))])
    .filter(([, count]) => count > 0)
    .map(([sides, count]) => `${count}d${sides}`);
  const flat = Math.trunc(Number(modifier) || 0);
  if (flat) parts.push(String(flat));
  return parts.join("+").replace(/\+-/g, "-");
}

export function cryptoRandomUint32(source = globalThis.crypto) {
  const values = new Uint32Array(1);
  source.getRandomValues(values);
  return values[0];
}

// A value from 1 to `sides` with no modulo bias: draws above the last whole multiple of `sides` are thrown away.
export function randomDieValue(sides, nextUint32 = cryptoRandomUint32) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  let draw = nextUint32();
  while (draw >= limit) draw = nextUint32();
  return (draw % sides) + 1;
}

function keptFlags(values, keep) {
  if (!keep) return values.map(() => true);
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => (keep.mode === "low" ? left.value - right.value : right.value - left.value)
      || left.index - right.index);
  const kept = new Set(order.slice(0, keep.count).map((entry) => entry.index));
  return values.map((_, index) => kept.has(index));
}

export function diceRollTotal(groups, modifier = 0) {
  return groups.reduce((total, group) => total + group.sign * group.dice
    .filter((die) => die.kept)
    .reduce((sum, die) => sum + die.value, 0), 0) + modifier;
}

export function rollDiceFormula(parsed, { nextUint32 = cryptoRandomUint32 } = {}) {
  if (!parsed?.ok) return null;
  const groups = parsed.groups.map((group) => {
    const values = Array.from({ length: group.count }, () => randomDieValue(group.sides, nextUint32));
    const kept = keptFlags(values, group.keep);
    return {
      sides: group.sides,
      sign: group.sign,
      keep: group.keep,
      dice: values.map((value, index) => ({ value, kept: kept[index] })),
    };
  });
  return {
    formula: formatDiceFormula(parsed),
    groups,
    modifier: parsed.modifier,
    total: diceRollTotal(groups, parsed.modifier),
  };
}

// A d100 is two physical d10: tens (00–90) and units (0–9); 100 is "00" and "0".
export function percentileDigits(value) {
  const v = Math.max(1, Math.min(100, Math.floor(Number(value) || 1)));
  return { tens: v === 100 ? 0 : Math.floor(v / 10) * 10, units: v % 10 };
}

// The physical dice the tray throws, in order, with the face each one must show.
export function physicalDiceOf(result) {
  const dice = [];
  for (const group of result?.groups || []) {
    for (const die of group.dice) {
      if (group.sides === 100) {
        const { tens, units } = percentileDigits(die.value);
        dice.push({ sides: 10, face: tens, percentile: "tens", kept: die.kept });
        dice.push({ sides: 10, face: units, percentile: "units", kept: die.kept });
      } else {
        dice.push({ sides: group.sides, face: die.value, kept: die.kept });
      }
    }
  }
  return dice;
}

const round4 = (value) => Math.round(value * 10_000) / 10_000;

// Where and how each physical die is thrown into the tray (unit-free numbers the 3D scene scales): a start point,
// a push toward the middle, a spin, an orientation. Drawn by the roller and sent with the roll, so every client
// throws the dice the same way.
export function diceThrowParameters(count, { nextUint32 = cryptoRandomUint32 } = {}) {
  const unit = () => nextUint32() / 0x100000000;
  const between = (min, max) => round4(min + (max - min) * unit());
  return Array.from({ length: Math.max(0, Math.min(2 * DICE_MAX_COUNT, Math.floor(Number(count) || 0))) }, () => {
    const angle = unit() * Math.PI * 2;
    const half = unit() * Math.PI;
    const [qx, qy, qz] = [unit() - 0.5, unit() - 0.5, unit() - 0.5];
    const norm = Math.hypot(qx, qy, qz) || 1;
    return {
      position: { x: between(-1, 1), y: between(1.5, 2.5), z: between(-1, 1) },
      velocity: { x: round4(-Math.cos(angle) * 4), y: between(-1, 0), z: round4(-Math.sin(angle) * 4) },
      angularVelocity: { x: between(-12, 12), y: between(-12, 12), z: between(-12, 12) },
      rotation: {
        x: round4((qx / norm) * Math.sin(half)),
        y: round4((qy / norm) * Math.sin(half)),
        z: round4((qz / norm) * Math.sin(half)),
        w: round4(Math.cos(half)),
      },
    };
  });
}

// "1d20kh1: 14, 9 scartato · 1d6: 4 · +3 = 21"
export function diceRollDetail(result) {
  if (!result?.groups?.length) return "";
  const parts = result.groups.map((group) => {
    const keep = group.keep ? `${group.keep.mode === "low" ? "kl" : "kh"}${group.keep.count}` : "";
    const values = group.dice.map((die) => (die.kept ? String(die.value) : `${die.value} scartato`)).join(", ");
    return `${group.sign < 0 ? "−" : ""}${group.dice.length}d${group.sides}${keep}: ${values}`;
  });
  if (result.modifier) parts.push(result.modifier > 0 ? `+${result.modifier}` : `−${Math.abs(result.modifier)}`);
  return `${parts.join(" · ")} = ${result.total}`;
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function finite(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : 0;
}

function cleanVector(value, keys, limit) {
  return Object.fromEntries(keys.map((key) => [key, finite(value?.[key], -limit, limit)]));
}

// The record a roll travels as. `hidden` is the GM's own roll: it never leaves the GM's browser.
export function createDiceRollRecord({ id, result, throws, player = {}, character = "", at = Date.now(), hidden = false }) {
  return {
    id: String(id || ""),
    playerId: String(player.id || ""),
    connectionId: String(player.connectionId || ""),
    playerName: cleanText(player.name, 60),
    character: cleanText(character, 60),
    formula: result.formula,
    groups: result.groups,
    modifier: result.modifier,
    total: result.total,
    throws: Array.isArray(throws) ? throws : [],
    at: Math.floor(Number(at) || Date.now()),
    ...(hidden ? { hidden: true } : {}),
  };
}

// A roll received from another client: checked field by field, the total computed again from the values. Anything
// outside the tray's limits makes it unreadable (null).
export function normalizeDiceRollRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "");
  if (!ID_PATTERN.test(id)) return null;
  if (!Array.isArray(raw.groups) || !raw.groups.length) return null;
  let diceCount = 0;
  const groups = [];
  for (const group of raw.groups) {
    const sides = Number(group?.sides);
    if (!SIDE_SET.has(sides) || !Array.isArray(group?.dice) || !group.dice.length) return null;
    diceCount += group.dice.length;
    if (diceCount > DICE_MAX_COUNT) return null;
    const dice = [];
    for (const die of group.dice) {
      const value = Number(die?.value);
      if (!Number.isInteger(value) || value < 1 || value > sides) return null;
      dice.push({ value, kept: die?.kept !== false });
    }
    const keepCount = Number(group?.keep?.count);
    const keep = group?.keep && Number.isInteger(keepCount) && keepCount >= 1 && keepCount <= dice.length
      ? { mode: group.keep.mode === "low" ? "low" : "high", count: keepCount }
      : null;
    groups.push({ sides, sign: Number(group?.sign) < 0 ? -1 : 1, keep, dice });
  }
  const modifier = Math.trunc(finite(raw.modifier, -DICE_MAX_MODIFIER, DICE_MAX_MODIFIER));
  const physical = physicalDiceOf({ groups }).length;
  const throws = (Array.isArray(raw.throws) ? raw.throws : []).slice(0, physical).map((entry) => ({
    position: cleanVector(entry?.position, ["x", "y", "z"], 10),
    velocity: cleanVector(entry?.velocity, ["x", "y", "z"], 50),
    angularVelocity: cleanVector(entry?.angularVelocity, ["x", "y", "z"], 50),
    rotation: cleanVector(entry?.rotation, ["x", "y", "z", "w"], 1),
  }));
  const playerId = String(raw.playerId || "");
  const connectionId = String(raw.connectionId || "");
  return {
    id,
    playerId: ID_PATTERN.test(playerId) ? playerId : "",
    connectionId: ID_PATTERN.test(connectionId) ? connectionId : "",
    playerName: cleanText(raw.playerName, 60),
    character: cleanText(raw.character, 60),
    formula: cleanText(raw.formula, DICE_FORMULA_MAX_LENGTH),
    groups,
    modifier,
    total: diceRollTotal(groups, modifier),
    throws: throws.length === physical ? throws : [],
    at: Math.floor(finite(raw.at, 0, Number.MAX_SAFE_INTEGER)),
    ...(raw.hidden === true ? { hidden: true } : {}),
  };
}

// The latest rolls, newest first, one per id, at most `limit`.
export function diceRollHistoryWith(history, record, limit = DICE_ROLL_HISTORY_LIMIT) {
  const current = Array.isArray(history) ? history : [];
  if (!record?.id) return current.slice(0, limit);
  return [record, ...current.filter((entry) => entry?.id !== record.id)]
    .sort((left, right) => (right.at || 0) - (left.at || 0))
    .slice(0, limit);
}
