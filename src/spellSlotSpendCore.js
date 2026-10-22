// Which spell slot a cast spends, and the class-feature operation that spends it in the spell's own command
// (spellApplicationExecutor.js and spellAreaResolutionExecutor.js take it as extraOperations, so one Undo
// gives the slot back with the spell). Pure: the callers read the caster's build and resources.
import { SPELL_SLOT_RESOURCE_POOLS, spellSlotStatus } from "./spellSlotCore.js";
import { quickActionUsesLeft, sanitizeQuickAction } from "./quickActionsCore.js";

// "": the slot the rules pick; "pact": Pact Magic; "none": no slot (ritual, a free cast).
export const SPELL_SLOT_SOURCES = Object.freeze(["", "pact", "none"]);

const POOL_BY_ID = new Map(SPELL_SLOT_RESOURCE_POOLS.map((pool) => [pool.id, pool]));

function level(value) {
  const number = Math.floor(Number(value));
  return Number.isInteger(number) && number >= 0 && number <= 9 ? number : null;
}

export function spellSlotLabel(row) {
  if (!row) return "";
  return row.pact ? `slot del Patto (${row.level}°)` : `slot di ${row.level}° livello`;
}

/**
 * The slot a cast spends. Returns { spend, slotLevel, exhausted, reason, message }:
 * - spend: the slot row ({ poolId, level, pact, current, maximum }) or null;
 * - slotLevel: the level the spell is cast at (a Pact Magic slot casts at its own level);
 * - exhausted: the character has slots but none left for this cast (message says which).
 * Nothing is spent for a cantrip, outside the cast and prepare phases, with source "none", or for a caster
 * without slots (monsters, NPCs without a class build).
 */
export function planSpellSlotSpend({
  characterBuild = [],
  resources = {},
  spellLevel = 0,
  slotLevel = null,
  source = "",
  phase = "cast",
} = {}) {
  const baseLevel = level(spellLevel) ?? 0;
  const requestedLevel = Math.max(baseLevel, level(slotLevel) ?? baseLevel);
  const none = (reason) => ({ spend: null, slotLevel: requestedLevel || null, exhausted: false, reason, message: "" });
  const castPhase = String(phase || "cast").trim().toLowerCase();
  if (castPhase !== "cast" && castPhase !== "prepare") return none("phase");
  if (baseLevel === 0) return none("cantrip");
  if (source === "none") return none("free");
  const rows = spellSlotStatus(characterBuild, resources);
  if (!rows.length) return none("no-slots");
  const standard = rows.find((row) => !row.pact && row.level === requestedLevel) || null;
  const pact = rows.find((row) => row.pact && row.level >= baseLevel) || null;
  const hasStandardSlots = rows.some((row) => !row.pact);
  const spendRow = (row) => ({ spend: row, slotLevel: row.level, exhausted: false, reason: row.pact ? "pact" : "standard", message: "" });
  const exhausted = (row) => ({
    spend: null,
    slotLevel: row?.level ?? requestedLevel,
    exhausted: true,
    reason: row ? "exhausted" : "missing-level",
    message: row
      ? `Nessuno ${spellSlotLabel(row)} disponibile.`
      : `Il personaggio non ha slot di ${requestedLevel}° livello.`,
  });
  if (source === "pact") {
    if (!pact) return exhausted(null);
    return pact.current > 0 ? spendRow(pact) : exhausted(pact);
  }
  // A warlock without other slots always casts with Pact Magic, at the pact slot level.
  if (!hasStandardSlots) {
    if (!pact) return exhausted(null);
    return pact.current > 0 ? spendRow(pact) : exhausted(pact);
  }
  if (standard?.current > 0) return spendRow(standard);
  if (pact && pact.level >= requestedLevel && pact.current > 0) return spendRow(pact);
  return exhausted(standard || (pact && pact.level >= requestedLevel ? pact : null));
}

// The slot choices of the spell panel: every level the spell can be cast at, with what is left, then
// Pact Magic. value is what the panel stores (the level, or "pact").
export function spellSlotChoices({ characterBuild = [], resources = {}, spellLevel = 0 } = {}) {
  const baseLevel = level(spellLevel) ?? 0;
  if (baseLevel === 0) return [];
  return spellSlotStatus(characterBuild, resources)
    .filter((row) => row.level >= baseLevel)
    .map((row) => ({
      value: row.pact ? "pact" : String(row.level),
      level: row.level,
      pact: row.pact,
      current: row.current,
      maximum: row.maximum,
      label: `${row.pact ? `Patto ${row.level}°` : `${row.level}°`} · ${row.current}/${row.maximum}`,
    }));
}

/**
 * The cost of a cast, for the quick actions and the spell panel: a spell slot (the default, and every spellbook
 * spell), a use of the quick action's own counter (cost "uses": a spell from a feat, a species or an item) or
 * nothing (cost "free"). Returns { operation, spent, exhausted, message, slotLevel }: operation goes in the
 * spell's command; spent names what it spends, for the status line.
 */
export function planSpellCastCost({
  action = null,
  sourceId = "",
  characterBuild = [],
  abilityModifiers = null,
  resources = {},
  spellLevel = 0,
  slotLevel = null,
  source = "",
  phase = "cast",
} = {}) {
  const quickAction = sanitizeQuickAction(action);
  const castPhase = String(phase || "cast").trim().toLowerCase();
  const nothing = { operation: null, spent: "", exhausted: false, message: "", slotLevel: null };
  if (quickAction?.kind === "spell" && quickAction.cost === "free") return nothing;
  if (quickAction?.kind === "spell" && quickAction.cost === "uses") {
    if (castPhase !== "cast" && castPhase !== "prepare") return nothing;
    const uses = quickActionUsesLeft(quickAction, resources);
    if (!uses.current) {
      return { ...nothing, exhausted: true, message: `Nessun uso rimasto per ${quickAction.label} (0/${uses.maximum}).` };
    }
    return {
      ...nothing,
      operation: {
        type: "class-feature:adjust-resource",
        operationId: `quick-action-use:${quickAction.id}:${Date.now().toString(36)}`,
        sourceId: String(sourceId || "").trim(),
        pool: uses.pool,
        characterBuild,
        abilityModifiers,
        adjustment: { delta: -1 },
      },
      spent: `uso di ${quickAction.label} (${uses.current - 1}/${uses.maximum})`,
    };
  }
  const plan = planSpellSlotSpend({ characterBuild, resources, spellLevel, slotLevel, source, phase });
  return {
    operation: plan.spend
      ? spellSlotSpendOperation({ sourceId, poolId: plan.spend.poolId, characterBuild, abilityModifiers })
      : null,
    spent: spellSlotLabel(plan.spend),
    exhausted: plan.exhausted,
    message: plan.message,
    slotLevel: plan.spend ? plan.slotLevel : null,
  };
}

// The operation that spends one slot of the caster: an ordinary class-feature resource adjustment.
export function spellSlotSpendOperation({
  sourceId = "",
  poolId = "",
  characterBuild = [],
  abilityModifiers = null,
  operationId = "",
} = {}) {
  const pool = POOL_BY_ID.get(poolId);
  const caster = String(sourceId || "").trim();
  if (!pool || !caster) return null;
  return {
    type: "class-feature:adjust-resource",
    operationId: operationId || `spell-slot:${pool.id}:${Date.now().toString(36)}`,
    sourceId: caster,
    pool,
    characterBuild,
    abilityModifiers,
    adjustment: { delta: -1 },
  };
}
