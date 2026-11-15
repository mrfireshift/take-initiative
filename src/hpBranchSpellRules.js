import { ID } from "./constants.js";
import { MAX_HP_SUMMARY_PART_SUFFIX, maxHpModifiersOf, maxHpSummaryLabel } from "./maxHpModifierCore.js";

// CAP-HP-BRANCH (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, PHB 2014 texts): spells whose effect is read from the hit
// points of the creature. Before the damage, its current hit points (Power Word Kill, Divine Word); after it, whether
// the damage brought it to 0 (Disintegrate, Finger of Death). The area command applies the result: the pills here,
// a death as an HP write to 0 the coordinator turns into Morto (deathSaveCore.js).
const META_KEY = `${ID}/meta`;
const ROUND = 1;
const MINUTE = 10 * ROUND;
const HOUR = 60 * MINUTE;

export const HP_BRANCH_SPELL_IDS = Object.freeze([
  "power-word-kill",
  "divine-word",
  "disintegrate",
  "finger-of-death",
  "xanathar-flusso-di-energia-negativa",
  // CAP-MAXHP, lotto X2: a failed save lowers the maximum by the damage taken (harmReductionPill).
  "harm",
]);
export const HP_BRANCH_SPELL_ID_SET = new Set(HP_BRANCH_SPELL_IDS);

function meta(item) {
  return item?.metadata?.[META_KEY] || {};
}

// The current hit points, temporary ones excluded (they sit above hpMax in meta.hp).
export function currentHitPointsForBranch(value = {}) {
  const hp = Number(value?.hp);
  const hpMax = Number(value?.hpMax);
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return null;
  return Math.max(0, Math.floor(Math.min(hp, hpMax)));
}

// Power Word Stun and Power Word Pain: above these current hit points "the spell has no effect". The cast is spent all the
// same. Single-target spells, on the lifecycle lane; no hit points on the token: the GM decides, the spell applies.
const SPELL_HP_CEILINGS = Object.freeze({
  "power-word-stun": 150,
  "xanathar-parola-del-potere-dolore": 100,
});

export function spellHpCeiling(spellId = "") {
  return SPELL_HP_CEILINGS[String(spellId || "").trim()] ?? null;
}

export function spellHpCeilingRefuses(spellId = "", item = null) {
  const ceiling = spellHpCeiling(spellId);
  if (ceiling === null) return false;
  const hp = currentHitPointsForBranch(meta(item));
  return hp !== null && hp > ceiling;
}

function creatureKind(context = {}, value = {}) {
  const chosen = String(context?.creatureKind || "").trim();
  if (chosen) return chosen;
  const type = String(value?.creatureType || value?.creatureTypeName || value?.creatureTypeLabel || "")
    .trim().toLocaleLowerCase("it");
  if (!type) return "";
  if (/umanoid|humanoid/u.test(type)) return "humanoid";
  if (/celest|element|folletto|fata|fey|immond|fiend|demon|diavol|devil/u.test(type)) return "outsider";
  return "other";
}

// No effectKind: an instantaneous spell leaves no spell pill to show a buff or debuff inside, and the card would hide it.
function pill(condition, { turns, effectId, detail, deferredEffect = null }) {
  return {
    condition,
    expiry: turns ? { mode: "rounds", remaining: turns } : { mode: "manual" },
    effectId,
    effectDetail: detail,
    options: { parentEffectId: "" },
    ...(deferredEffect ? { deferredEffect, manualRemoval: true } : {}),
  };
}

// Divine Word, by the hit points the creature has when it fails.
const DIVINE_WORD_BANDS = Object.freeze([
  Object.freeze({ atMost: 20, death: true }),
  Object.freeze({ atMost: 30, turns: HOUR, conditions: ["Assordato", "Accecato", "Stordito"], label: "1 ora" }),
  Object.freeze({ atMost: 40, turns: 10 * MINUTE, conditions: ["Assordato", "Accecato"], label: "10 minuti" }),
  Object.freeze({ atMost: 50, turns: MINUTE, conditions: ["Assordato"], label: "1 minuto" }),
]);

// Before the damage: Power Word Kill (no save) and Divine Word (on a failed save).
export function planHpBranchBeforeDamage({ spellId = "", outcome = "", item = null, context = {} } = {}) {
  const value = meta(item);
  const hp = currentHitPointsForBranch(value);
  if (hp === null) return { pills: [], death: null };
  if (spellId === "power-word-kill") {
    return hp <= 100
      ? { pills: [], death: { detail: "Ucciso da Parola del potere uccidere (100 PF o meno)." } }
      : { pills: [], death: null };
  }
  if (spellId !== "divine-word" || outcome !== "failed") return { pills: [], death: null };
  const pills = creatureKind(context, value) === "outsider"
    ? [pill("Respinto sul piano d'origine", {
      turns: 24 * HOUR,
      effectId: "divine-word-banished",
      detail: "Celestiale, elementale, folletto o immondo: torna al suo piano d'origine (se non vi si trova già) e per 24 ore non può tornare, se non con desiderio.",
    })]
    : [];
  const band = DIVINE_WORD_BANDS.find((entry) => hp <= entry.atMost);
  if (band?.death) return { pills, death: { detail: `Ucciso da Parola divina (${hp} PF, 20 o meno).` } };
  for (const condition of band?.conditions || []) {
    pills.push(pill(condition, {
      turns: band.turns,
      effectId: `divine-word-${condition.toLocaleLowerCase("it")}`,
      detail: `Parola divina: ${band.conditions.join(", ").toLocaleLowerCase("it")} per ${band.label} (${hp} PF).`,
    }));
  }
  return { pills, death: null };
}

// CAP-MAXHP, lotto X2 (docs/PIANO_CAP_MAXHP.md, 2014): Harm's failed save lowers the maximum "by an amount equal to the
// necrotic damage it took" for 1 hour: the damage after its save and its defenses, the part the temporary hit points took
// included, whatever the 1 HP floor kept (decision M5). The maximum stays at least 1: the amount is cut there, counting an
// earlier Harm, which this one takes the place of when stronger (M2). A disease (M10): a cure that ends one ends it.
export const HARM_REDUCTION_EFFECT_ID = "harm-reduction";

export function harmReductionAmount({ damage = 0, item = null } = {}) {
  const value = meta(item);
  const hpMax = Math.floor(Number(value?.hpMax));
  if (!Number.isFinite(hpMax) || hpMax <= 0) return 0;
  const earlier = maxHpModifiersOf(value).find((modifier) => modifier.stack === "harm");
  const room = hpMax - (earlier ? earlier.amount : 0) - 1;
  return Math.max(0, Math.min(Math.floor(Number(damage) || 0), room));
}

export function harmReductionPill(amount) {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return null;
  return {
    condition: "Ferire",
    expiry: { mode: "manual" },
    effectId: HARM_REDUCTION_EFFECT_ID,
    effectDetail: `${maxHpSummaryLabel(-value)}. Malattia virulenta: il massimo resta ridotto per 1 ora, o finché un effetto che cura `
      + "una malattia non la toglie (Ristorare inferiore, Guarigione, Ristorare superiore). Quando finisce togli la pill: il massimo torna "
      + "com'era; il riposo del gruppo, breve o lungo, la chiude da solo.",
    summaryParts: [{ id: `harm${MAX_HP_SUMMARY_PART_SUFFIX}`, label: maxHpSummaryLabel(-value) }],
    // restEnds (decision M11): any rest of the party outlasts its hour.
    mechanics: { maxHp: { amount: -value, stack: "harm", restEnds: "short" }, disease: true },
    manualRemoval: true,
    options: { parentEffectId: "", spellId: "harm", spellName: "Ferire" },
  };
}

// After the damage: change is the area command's HP change for the creature (calculateQuickHPChange).
export function planHpBranchAfterDamage({
  spellId = "", outcome = "", item = null, change = null, context = {}, casterId = "", casterName = "",
} = {}) {
  if (spellId === "harm") {
    const pill = outcome === "failed" ? harmReductionPill(harmReductionAmount({ damage: change?.requested, item })) : null;
    return { pills: pill ? [pill] : [], death: null };
  }
  const value = meta(item);
  const before = Number(change?.hp);
  const after = Number(change?.afterHP);
  const reduced = Number.isFinite(before) && Number.isFinite(after) && before > 0 && after <= 0;
  if (!reduced) return { pills: [], death: null };
  if (spellId === "disintegrate") {
    return outcome === "failed"
      ? { pills: [], death: { detail: "Disintegrato: cumulo di polvere grigia (tranne gli oggetti magici). Torna in vita solo con resurrezione pura o desiderio." } }
      : { pills: [], death: null };
  }
  // Negative Energy Flood (Xanathar): any creature it kills rises, and it is nobody's: it pursues the closest one it sees.
  const flood = spellId === "xanathar-flusso-di-energia-negativa";
  if (spellId !== "finger-of-death" && !flood) return { pills: [], death: null };
  // Killed: a monster at 0 HP; a PC only when the damage left over reaches its HP maximum (instant death).
  const pc = String(value?.attitude || "").trim().toLocaleLowerCase("it") === "pc";
  const hpMax = Number(change?.hpMax ?? value?.hpMax);
  const killed = !pc || Math.max(0, Number(change?.requested) - before) >= hpMax;
  if (!killed || (!flood && creatureKind(context, value) === "other")) return { pills: [], death: null };
  const caster = String(casterName || "il caster").trim();
  const name = String(item?.name || "La creatura").trim();
  const reminder = flood
    ? `${name} si rianima come zombi: insegue la creatura più vicina che vede.`
    : `${name} si rianima come zombi, permanentemente al comando di ${caster}`
      + `${creatureKind(context, value) ? "" : " (se era un umanoide)"}.`;
  const effectId = flood ? "negative-energy-flood-zombie" : "finger-of-death-zombie";
  return {
    pills: [pill("Si rianima come zombi", {
      effectId,
      detail: `${reminder} Il token dello zombi lo aggiunge il GM.`,
      deferredEffect: {
        id: effectId,
        timing: "turn-start",
        actor: "source",
        anchor: "next-turn",
        reminder,
        provenance: { spellId, spellName: flood ? "Flusso di Energia Negativa" : "Dito della morte", ...(casterId ? { casterId } : {}) },
      },
    })],
    death: null,
  };
}
