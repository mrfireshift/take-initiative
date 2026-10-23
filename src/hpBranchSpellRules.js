import { ID } from "./constants.js";

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

function pill(condition, { turns, effectId, detail, deferredEffect = null }) {
  return {
    condition,
    expiry: turns ? { mode: "rounds", remaining: turns } : { mode: "manual" },
    effectId,
    effectKind: "debuff",
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

// After the damage: change is the area command's HP change for the creature (calculateQuickHPChange).
export function planHpBranchAfterDamage({
  spellId = "", outcome = "", item = null, change = null, context = {}, casterId = "", casterName = "",
} = {}) {
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
  if (spellId !== "finger-of-death") return { pills: [], death: null };
  // Killed: a monster at 0 HP; a PC only when the damage left over reaches its HP maximum (instant death).
  const pc = String(value?.attitude || "").trim().toLocaleLowerCase("it") === "pc";
  const hpMax = Number(change?.hpMax ?? value?.hpMax);
  const killed = !pc || Math.max(0, Number(change?.requested) - before) >= hpMax;
  if (!killed || creatureKind(context, value) === "other") return { pills: [], death: null };
  const caster = String(casterName || "il caster").trim();
  const reminder = `${String(item?.name || "La creatura").trim()} si rianima come zombi, permanentemente al comando di ${caster}`
    + `${creatureKind(context, value) ? "" : " (se era un umanoide)"}.`;
  return {
    pills: [pill("Si rianima come zombi", {
      effectId: "finger-of-death-zombie",
      detail: `${reminder} Il token dello zombi lo aggiunge il GM.`,
      deferredEffect: {
        id: "finger-of-death-zombie",
        timing: "turn-start",
        actor: "source",
        anchor: "next-turn",
        reminder,
        provenance: { spellId: "finger-of-death", spellName: "Dito della morte", ...(casterId ? { casterId } : {}) },
      },
    })],
    death: null,
  };
}
