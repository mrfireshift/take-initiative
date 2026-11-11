// CAP-ALLOCATION (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md): Mass Heal (PHB 2014) restores up to 700 hit points, divided as
// the caster chooses among the creatures it can see within range. The owner's decisions of 11/11/2026 (A-D1): each box
// starts with the hit points its target misses, in the targets' order, while the 700 last; the GM corrects them. A
// creature never takes more than it misses, so what is written is what it regains. The conditions it ends and the
// creatures it skips are in cleanseSpellRules.js (A-D2–A-D4).
export const MASS_HEAL_SPELL_ID = "mass-heal";
export const MASS_HEAL_SHARE_FIELD = "share";
export const MASS_HEAL_TOTAL = 700;

// A box: "" when empty (the share is the plugin's), a whole number of hit points, null when unreadable.
export function parseMassHealShare(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /^\d+$/u.test(raw) ? Number(raw) : null;
}

function missingHp(entry) {
  const hp = Number(entry?.hp);
  const hpMax = Number(entry?.hpMax);
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return null;
  return Math.max(0, Math.floor(hpMax) - Math.floor(Math.min(hp, hpMax)));
}

// The share of each target: the boxes written (capped at what the target misses), then for the empty ones what it
// misses, in order, from what is left of the 700. hpById: { [id]: { hp, hpMax } }; a target without tracked hit
// points takes what is written, and nothing on its own. Valid when the boxes are numbers and stay within the 700.
export function massHealAllocation({ targetIds = [], targetContexts = {}, hpById = {} } = {}) {
  const ids = [...new Set((Array.isArray(targetIds) ? targetIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const byTarget = {};
  const autoIds = [];
  const invalidIds = [];
  const cappedIds = [];
  for (const id of ids) {
    const written = parseMassHealShare(targetContexts?.[id]?.[MASS_HEAL_SHARE_FIELD]);
    if (written === null) {
      invalidIds.push(id);
      byTarget[id] = 0;
      continue;
    }
    if (written === "") {
      autoIds.push(id);
      continue;
    }
    const missing = missingHp(hpById?.[id]);
    byTarget[id] = missing === null ? written : Math.min(written, missing);
    if (missing !== null && written > missing) cappedIds.push(id);
  }
  let remaining = Math.max(0, MASS_HEAL_TOTAL - Object.values(byTarget).reduce((sum, share) => sum + share, 0));
  for (const id of autoIds) {
    const share = Math.min(missingHp(hpById?.[id]) ?? 0, remaining);
    byTarget[id] = share;
    remaining -= share;
  }
  const assigned = Object.values(byTarget).reduce((sum, share) => sum + share, 0);
  const error = invalidIds.length ? "invalid" : !ids.length ? "no-targets" : assigned > MASS_HEAL_TOTAL ? "over" : "";
  return { total: MASS_HEAL_TOTAL, assigned, byTarget, autoIds, invalidIds, cappedIds, valid: !error, error };
}

export function massHealAllocationText(allocation) {
  return `PF assegnati ${allocation?.assigned ?? 0}/${allocation?.total ?? MASS_HEAL_TOTAL}`;
}
