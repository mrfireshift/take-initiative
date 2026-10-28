import { buildSpellActiveResolutionResourceOperations } from "./spellActiveResolutionCore.js";

// CAP-RESOURCE (PHB 2014): the zones whose triggers consume the counter of their spell, kept on the owner instance
// of the caster (castContext.uses, set at the cast by initialSpellUses):
// - Cordon of Arrows: one piece of ammunition flies at each creature it resolves for, saved or not; the spell ends
//   when no ammunition remains.
// - Guardian of Faith: it vanishes once it has dealt a total of 60 damage; the damage of a trigger counts as dealt,
//   the last one in full.
export const ZONE_RESOURCE_SPENDS = Object.freeze({
  "phb2014-cordone-di-frecce": "per-target",
  "guardian-of-faith": "damage",
});

const text = (value) => String(value ?? "").trim();
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function zoneResourceSpendAmount({ spellId = "", targetIds = [], damages = [] } = {}) {
  const mode = ZONE_RESOURCE_SPENDS[text(spellId)];
  if (mode === "per-target") return new Set((Array.isArray(targetIds) ? targetIds : []).map(text).filter(Boolean)).size;
  if (mode === "damage") return (Array.isArray(damages) ? damages : []).reduce((sum, damage) => sum + count(damage), 0);
  return 0;
}

// The operations of one trigger: the counter goes down on the owner instance, or the spell ends with its zone.
// null when the spell keeps no counter (a zone cast before CAP-RESOURCE) or the trigger consumes nothing.
export function zoneTriggerResourceSpend({
  spellId = "",
  spellName = "",
  ownerEntry = null,
  casterId = "",
  targetIds = [],
  damages = [],
} = {}) {
  if (!ZONE_RESOURCE_SPENDS[text(spellId)]) return null;
  const uses = ownerEntry?.castContext?.uses;
  const remaining = Number.isFinite(Number(uses?.remaining)) ? count(uses.remaining) : null;
  const instanceId = text(ownerEntry?.instanceId);
  if (!uses || remaining === null || remaining <= 0 || !instanceId) return null;
  const wanted = zoneResourceSpendAmount({ spellId, targetIds, damages });
  const consume = Math.min(wanted, remaining);
  if (consume <= 0) return null;
  const plan = buildSpellActiveResolutionResourceOperations({
    action: { resource: { key: text(uses.key), consume, endSpellAtZero: true } },
    payload: { instanceId, casterId, spellId, spellName },
    spellEntry: { ...ownerEntry, casterId: text(ownerEntry.casterId) || text(casterId) },
  });
  if (!plan.valid) return null;
  const ended = plan.remaining === 0;
  const total = count(uses.total) || remaining;
  const name = text(spellName) || text(ownerEntry?.name) || "Incantesimo";
  return {
    operations: [...plan.operations],
    sideEffects: ended ? [{ type: "static-zone:remove-ended", selectors: [{ instanceId }] }] : [],
    remainingBefore: remaining,
    remainingAfter: plan.remaining,
    ended,
    note: ended
      ? ZONE_RESOURCE_SPENDS[text(spellId)] === "damage"
        ? `${name}: ha inflitto ${total} danni e svanisce.`
        : `${name}: ultima ${text(uses.label) || "risorsa"} usata, l'incantesimo termina.`
      : `${name}: ${plan.remaining}/${total} ${text(uses.label)}.`,
  };
}
