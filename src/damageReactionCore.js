// Avvisi di reazione, lot R3b (docs/STUDIO_AVVISI_REAZIONE.md §6.7): the reactions that change the damage of one attack,
// applied where the damage is computed (defendedComponents, the consoles' previews), so that what the GM sees is what is
// written. Pure.
//
// Order (decision E1): the outcome's factor and the halving first (Uncanny Dodge), then the reductions (Parry, Deflect
// Missiles...), then the resistances (Spectral Defense...) with the target's own defenses, as the PHB puts resistance and
// vulnerability after every other modifier. Halving and reductions follow the damage of each type, as the defenses do:
// the points a piece loses to the rounding go back to the type's first piece. A reduction leaves the components in the
// order the console shows them, only from the types it covers (decision E2), never below 0.
import { componentDamageAfterDefense, RESISTANCE_VULNERABILITY } from "./damageDefensesCore.js";
import { reactionTriggerEntry } from "./reactionTriggerCatalog.js";

const text = (value, limit = 120) => String(value ?? "").trim().slice(0, limit);
const halfDown = (value) => Math.floor(Math.max(0, Number(value) || 0) / 2);

// The effect kinds a damage reaction may have in the catalog.
export const DAMAGE_REACTION_KINDS = Object.freeze(["halve", "reduce", "resistance"]);

// Canzone di Difesa (decision E4): 5 points for each level of the slot spent.
export function damageReactionAmount(reaction) {
  const entry = reactionTriggerEntry(reaction?.reactionId);
  if (entry?.effect?.kind !== "reduce") return 0;
  if (Number.isInteger(entry.effect.perSlotLevel)) {
    const level = Math.floor(Number(reaction?.slotLevel));
    return Number.isInteger(level) && level >= 1 && level <= 9 ? level * entry.effect.perSlotLevel : 0;
  }
  const amount = Math.floor(Number(reaction?.amount));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

// The reactions of a request, checked against the catalog: { reactionId, reactorId, reactorName, featureId, kind, label,
// amount, slotLevel, types }. types: the damage types it covers (null: every type of the attack).
export function normalizeDamageReactions(reactions) {
  const seen = new Set();
  const list = [];
  for (const value of Array.isArray(reactions) ? reactions : []) {
    const entry = reactionTriggerEntry(value?.reactionId);
    const kind = entry?.effect?.kind === "resistance" ? "resistance" : entry?.effect?.kind;
    if (!entry || !DAMAGE_REACTION_KINDS.includes(kind) || !["R3b", "R4"].includes(entry.lot)) continue;
    const reactorId = text(value?.reactorId, 220);
    const key = `${reactorId}|${entry.id}`;
    if (!reactorId || seen.has(key)) continue;
    seen.add(key);
    const types = Array.isArray(entry.filters?.damageTypes) ? [...entry.filters.damageTypes] : null;
    list.push({
      reactionId: entry.id, reactorId, reactorName: text(value?.reactorName, 80) || "Creatura", featureId: text(value?.featureId, 220),
      kind, label: entry.label, types,
      ...(kind === "reduce" ? { amount: damageReactionAmount(value) } : {}),
      ...(Number.isInteger(entry.effect.perSlotLevel) ? { slotLevel: Math.floor(Number(value?.slotLevel)) || null } : {}),
    });
  }
  return list;
}

// Halves each type's damage (rounded down), the rounding back on the type's first piece.
function halveByType(components, inputs) {
  const out = { ...inputs };
  const byType = new Map();
  for (const component of components) {
    const input = Number(out[component.id]);
    if (!Number.isFinite(input)) continue;
    const row = byType.get(component.type) || { ids: [], total: 0 };
    row.ids.push(component.id);
    row.total += input;
    byType.set(component.type, row);
  }
  for (const row of byType.values()) {
    let given = 0;
    for (const id of row.ids) {
      out[id] = halfDown(out[id]);
      given += out[id];
    }
    out[row.ids[0]] += halfDown(row.total) - given;
  }
  return out;
}

const covers = (reaction, type) => !reaction.types || reaction.types.includes(type);

/**
 * components: [{ id, type }] in the console's order; inputs: { id: amount typed } (null on a miss); factor: the
 * outcome's ("full", "half", "zero"). Returns { active, inputs, factor, resistanceTypes, records }: the inputs and the
 * factor to compute with (the halvings already in the inputs, so the factor is "full"), the types the reactions resist,
 * and one record per reaction for the History and the combat log ({ reactionId, reactorId, text }).
 */
export function adjustForDamageReactions({ components = [], inputs = {}, factor = "full", reactions = [] } = {}) {
  const list = normalizeDamageReactions(reactions);
  if (!list.length || factor === "zero") return { active: false, inputs, factor, resistanceTypes: [], records: [] };
  const rows = (Array.isArray(components) ? components : []).filter((component) => component?.id);
  let adjusted = { ...inputs };
  if (factor === "half") adjusted = halveByType(rows, adjusted);
  const records = [];
  for (const reaction of list.filter((entry) => entry.kind === "halve")) {
    adjusted = halveByType(rows, adjusted);
    records.push({ reactionId: reaction.reactionId, reactorId: reaction.reactorId, text: `${reaction.label} di ${reaction.reactorName}: danno dimezzato` });
  }
  for (const reaction of list.filter((entry) => entry.kind === "reduce")) {
    let left = reaction.amount;
    let taken = 0;
    for (const component of rows) {
      if (left <= 0) break;
      const input = Number(adjusted[component.id]);
      if (!Number.isFinite(input) || input <= 0 || !covers(reaction, component.type)) continue;
      const take = Math.min(input, left);
      adjusted[component.id] = input - take;
      left -= take;
      taken += take;
    }
    records.push({ reactionId: reaction.reactionId, reactorId: reaction.reactorId, amount: taken,
      text: `${reaction.label} di ${reaction.reactorName}: −${taken}` });
  }
  const resistanceTypes = new Set();
  for (const reaction of list.filter((entry) => entry.kind === "resistance")) {
    for (const component of rows) if (covers(reaction, component.type)) resistanceTypes.add(component.type);
    records.push({ reactionId: reaction.reactionId, reactorId: reaction.reactorId, text: `${reaction.label} di ${reaction.reactorName}: resistenza` });
  }
  return { active: true, inputs: adjusted, factor: "full", resistanceTypes: [...resistanceTypes], records };
}

// A type's defense with a reaction's resistance on top: a resistance does not stack, an immunity stays, a vulnerability
// becomes «Res. e Vuln.» (lot M6).
export function defenseWithReactionResistance(defense) {
  if (defense === "immunity" || defense === "resistance" || defense === RESISTANCE_VULNERABILITY) return defense;
  if (defense === "vulnerability") return RESISTANCE_VULNERABILITY;
  return "resistance";
}

/**
 * Lot R3b-5, the spell panel's damage (spellDamageDefenseCore.js counts it in parts, one defense per type):
 * parts [{ type, amount }]; factor the outcome's; defenseFor(type) the creature's defense for that type (null: none, or
 * a damage of several types in one number that the GM counts by hand); reactions as adjustForDamageReactions.
 * { value, records } with the reactions, or null without (the caller's count stays as it was).
 */
export function spellDamageWithReactions({ parts = [], factor = "full", defenseFor = () => null, reactions = [] } = {}) {
  const list = (Array.isArray(parts) ? parts : []).filter((part) => part && String(part.type || "").trim());
  if (!list.length || !Array.isArray(reactions) || !reactions.length) return null;
  const components = list.map((part, index) => ({ id: `p${index}`, type: String(part.type).trim() }));
  const inputs = Object.fromEntries(list.map((part, index) => [`p${index}`, Math.max(0, Math.floor(Number(part.amount) || 0))]));
  const adjusted = adjustForDamageReactions({ components, inputs, factor, reactions });
  if (!adjusted.active) return null;
  const resisted = new Set(adjusted.resistanceTypes);
  const byType = new Map();
  for (const component of components) byType.set(component.type, (byType.get(component.type) || 0) + (Number(adjusted.inputs[component.id]) || 0));
  let value = 0;
  for (const [type, total] of byType) {
    const own = defenseFor(type) || null;
    value += componentDamageAfterDefense(total, adjusted.factor, resisted.has(type) ? defenseWithReactionResistance(own) : own);
  }
  return { value, records: adjusted.records };
}
