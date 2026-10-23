// Species traits that change hit points: Relentless Endurance, Healing Hands, the temporary hit points of Adrenaline
// Rush, Hungry Jaws and Shifting, and the reactions that reduce the damage just taken (Stone's Endurance, Hadozee
// Dodge). The amounts come from the sheet (level, proficiency bonus, Constitution); the plans say what the HP write is.
// Texts of the 2014 books: Player's Handbook, Volo, Eberron, Mostri del Multiverso, Spelljammer.
// HP stay on the canonical fields: temporary hit points are the part of meta.hp above meta.hpMax (quickHpCore.js).
// Pure: no SDK, DOM or runtime state.
import { abilityModifier, proficiencyBonusForLevel, totalCharacterLevel } from "./abilityModifiersCore.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { DEATH_SAVE_DEAD_CONDITION, readDeathSaves } from "./deathSaveCore.js";

export const SPECIES_HP_TRAIT_KINDS = Object.freeze({
  RELENTLESS: "relentless",
  HEAL: "heal",
  TEMP: "temp",
  SHIFT: "shift",
  REDUCE: "reduce",
});

const AMOUNT_LABELS = Object.freeze({
  level: "pari al livello",
  pb: "pari al bonus di competenza",
  "2pb": "pari al doppio del bonus di competenza",
  "con-min1": "pari alla Costituzione (minimo 1)",
  "level-con-min1": "pari a livello + Costituzione (minimo 1)",
});

function cardLevel(card) {
  return totalCharacterLevel(card?.characterBuild);
}

function cardProficiency(card) {
  return proficiencyBonusForLevel(cardLevel(card));
}

// A fixed amount read from the sheet: null when the level or the Constitution modifier is missing.
export function speciesHpTraitAmount(amount, card = {}) {
  const level = cardLevel(card);
  const proficiency = cardProficiency(card);
  const con = abilityModifier(card?.abilityModifiers, "con");
  if (amount === "level") return level > 0 ? level : null;
  if (amount === "pb") return proficiency;
  if (amount === "2pb") return proficiency === null ? null : 2 * proficiency;
  if (amount === "con-min1") return con === null ? null : Math.max(1, con);
  if (amount === "level-con-min1") return level > 0 && con !== null ? Math.max(1, level + con) : null;
  return null;
}

export function speciesHpTraitAmountLabel(amount) {
  return AMOUNT_LABELS[amount] || "";
}

// Whether a trait needs something from the table before its write: a roll (Healing Hands' d4s, a reduction,
// Beasthide's d6) or the bite's outcome. The others resolve from the sheet alone.
export function speciesHpTraitNeedsRoll(spec) {
  return spec?.dice === "pb-d4" || spec?.kind === SPECIES_HP_TRAIT_KINDS.REDUCE || !!spec?.bonusDie || spec?.onHit === true;
}

// Healing Hands of Mostri del Multiverso: a number of d4s equal to the proficiency bonus, rolled at the table.
export function speciesHealDice(spec, card = {}) {
  if (spec?.dice !== "pb-d4") return null;
  const count = cardProficiency(card);
  return count === null ? null : { count, faces: 4, min: count, max: count * 4, label: `${count}d4` };
}

// Stone's Endurance (1d12 + Constitution) and Hadozee Dodge (1d6 + proficiency): the hint shown with the roll.
export function speciesReductionHint(spec, card = {}) {
  if (spec?.kind !== SPECIES_HP_TRAIT_KINDS.REDUCE) return "";
  const bonus = spec.bonus === "pb" ? cardProficiency(card) : abilityModifier(card?.abilityModifiers, "con");
  if (bonus === null || bonus === undefined) return `${spec.die} + ${spec.bonus === "pb" ? "competenza" : "Costituzione"}`;
  return bonus === 0 ? spec.die : `${spec.die} ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}`;
}

function snapshotHp(change, side) {
  for (const container of [change?.[side], change?.[`${side}Metadata`]]) {
    if (!container || typeof container !== "object" || !Object.prototype.hasOwnProperty.call(container, "hp")) continue;
    const raw = container.hp;
    const value = raw && typeof raw === "object" && typeof raw.present === "boolean"
      ? (raw.present ? raw.value : undefined)
      : raw;
    const number = Number(value);
    return value === undefined || value === null || value === "" || !Number.isFinite(number) ? null : number;
  }
  return null;
}

// The damage the token took last, read from the history (newest entry last): only when that entry is the token's last
// HP change and nothing changed its HP since. Otherwise null, and the GM enters the damage by hand.
export function speciesLastDamageTaken(entries = [], itemId = "", currentHp = null) {
  const id = String(itemId || "").trim();
  const list = Array.isArray(entries) ? entries : [];
  if (!id) return null;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const change = (Array.isArray(list[index]?.changes) ? list[index].changes : [])
      .find((entry) => String(entry?.id || "") === id && (snapshotHp(entry, "before") !== null || snapshotHp(entry, "after") !== null));
    if (!change) continue;
    const before = snapshotHp(change, "before");
    const after = snapshotHp(change, "after");
    if (before === null || after === null || after >= before) return null;
    if (currentHp !== null && Number(currentHp) !== after) return null;
    return { amount: before - after, beforeHP: before, afterHP: after, entryId: String(list[index]?.id || "") };
  }
  return null;
}

function conditionInstances(meta = {}) {
  const conditions = meta?.conditions;
  return Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
}

export function speciesHpTargetDead(meta = {}) {
  return isDead(meta);
}

function isDead(meta = {}) {
  return conditionInstances(meta).some((instance) => String(instance?.condition || instance?.name || "").trim() === DEATH_SAVE_DEAD_CONDITION);
}

function positiveInteger(value) {
  const number = Number(value);
  return value !== "" && value !== null && value !== undefined && Number.isInteger(number) && number > 0 ? number : null;
}

function blocked(reason) {
  return { ok: false, blocker: reason };
}

// The HP write of a trait. targetMeta is the token whose HP change (the character itself, or Healing Hands' target);
// value is the roll entered at the table (Healing Hands of Mostri del Multiverso, the reduction, Beasthide's d6),
// damage the damage being reduced, hit whether Hungry Jaws' bite hit. Returns { ok, change, amount, detail, warning }
// or { ok: false, blocker }. A trait whose write changes nothing still spends its use (a missed bite).
export function planSpeciesHpTrait({ feature, card = {}, targetMeta = {}, targetName = "", value = "", damage = "", hit = true } = {}) {
  const spec = feature?.hpTrait;
  const name = String(feature?.name || "Tratto");
  if (!spec) return blocked(`${name}: tratto senza effetto sui PF.`);
  const hp = Number(targetMeta?.hp);
  const hpMax = Number(targetMeta?.hpMax);
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return blocked(`${name}: PF del bersaglio non validi.`);
  const who = String(targetName || "").trim() || "Il bersaglio";
  if (isDead(targetMeta)) return blocked(`${name}: ${who} è morto.`);

  if (spec.kind === SPECIES_HP_TRAIT_KINDS.RELENTLESS) {
    if (hp > 0) return blocked(`${name}: vale solo a 0 PF.`);
    const tally = readDeathSaves(targetMeta);
    if (tally.successes || tally.failures) return blocked(`${name}: vale solo nel momento in cui scendi a 0 PF, non durante i tiri contro la morte.`);
    const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 1, hp, hpMax });
    return { ok: true, mode: QUICK_HP_MODES.HEAL, amount: 1, change, detail: "Resta a 1 PF invece di scendere a 0" };
  }

  if (spec.kind === SPECIES_HP_TRAIT_KINDS.HEAL) {
    const dice = speciesHealDice(spec, card);
    let amount = null;
    let detail = "";
    if (dice) {
      amount = positiveInteger(value);
      if (amount === null || amount < dice.min || amount > dice.max) return blocked(`${name}: inserisci il totale di ${dice.label} (${dice.min}–${dice.max}).`);
      detail = `${dice.label}: ${amount}`;
    } else {
      amount = speciesHpTraitAmount(spec.amount, card);
      if (amount === null) return blocked(`${name}: manca il livello del personaggio sulla scheda.`);
      detail = `${amount} PF, ${speciesHpTraitAmountLabel(spec.amount)}`;
    }
    if (hp >= hpMax) return blocked(`${name}: ${who} ha già tutti i PF.`);
    const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: amount, hp, hpMax });
    return { ok: true, mode: QUICK_HP_MODES.HEAL, amount, change, detail };
  }

  if (spec.kind === SPECIES_HP_TRAIT_KINDS.TEMP || spec.kind === SPECIES_HP_TRAIT_KINDS.SHIFT) {
    // At 0 HP the temporary hit points would read as hit points regained (the part above hpMax is the temporary one).
    if (hp <= 0) return blocked(`${name}: a 0 PF non si può usare.`);
    if (spec.onHit && hit === false) {
      return { ok: true, mode: QUICK_HP_MODES.TEMP, amount: 0, change: null, detail: "Morso mancato: l'uso è speso, nessun PF temporaneo" };
    }
    const base = speciesHpTraitAmount(spec.amount, card);
    if (base === null) return blocked(`${name}: mancano livello o Costituzione sulla scheda.`);
    let bonus = 0;
    if (spec.bonusDie) {
      bonus = positiveInteger(value);
      const faces = Number(String(spec.bonusDie).match(/d(\d+)/u)?.[1]) || 6;
      if (bonus === null || bonus > faces) return blocked(`${name}: inserisci il ${spec.bonusDie} tirato (1–${faces}).`);
    }
    const amount = base + bonus;
    const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: amount, hp, hpMax });
    const existing = Math.max(0, hp - hpMax);
    return {
      ok: true, mode: QUICK_HP_MODES.TEMP, amount, change,
      detail: `${amount} PF temporanei${bonus ? ` (${base} + ${spec.bonusDie} ${bonus})` : ""}, ${speciesHpTraitAmountLabel(spec.amount)}`,
      ...(change.changed ? {} : { warning: `Ha già ${existing} PF temporanei: non si sommano, l'uso si spende senza guadagno.` }),
    };
  }

  if (spec.kind === SPECIES_HP_TRAIT_KINDS.REDUCE) {
    const reduction = positiveInteger(value);
    if (reduction === null) return blocked(`${name}: inserisci il totale tirato (${speciesReductionHint(spec, card)}).`);
    const taken = positiveInteger(damage);
    if (taken === null) return blocked(`${name}: inserisci i danni subiti.`);
    const restored = Math.min(reduction, taken);
    const afterHP = hp + restored;
    const change = { mode: QUICK_HP_MODES.HEAL, factor: "full", hp, hpMax, requested: restored, afterHP, delta: restored, changed: restored > 0 };
    return { ok: true, mode: QUICK_HP_MODES.HEAL, amount: restored, change,
      detail: `Riduzione ${reduction} su ${taken} danni: ${restored} PF restituiti` };
  }
  return blocked(`${name}: tratto non gestito.`);
}
