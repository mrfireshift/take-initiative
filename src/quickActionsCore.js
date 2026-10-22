import { getPcAttackCantrip } from "./pcAttackCantripCatalog.js";
import { getPcAttackSpell } from "./pcAttackSpellCatalog.js";

export const QUICK_ACTION_VERSION = 2;
export const MAX_QUICK_ACTIONS = 12;
// Attacks share the quickActions storage but are a list of their own (own tab in the card, own ⚔ launcher
// on the tracker card), with their own limit.
export const MAX_QUICK_ACTION_ATTACKS = 8;

export const QUICK_ACTION_KINDS = Object.freeze([
  "spell",
  "condition",
  "feature",
  "attack",
]);

// Attack quick actions (tracking only): the GM enters the rolled total of each typed component.
// Same ids as DAMAGE_TYPES in damageDefensesCore.js, kept local so the tracker menu stays dependency-free.
export const QUICK_ACTION_ATTACK_RANGES = Object.freeze(["melee", "ranged"]);
export const QUICK_ACTION_ATTACK_DAMAGE_TYPES = Object.freeze([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
]);
export const MAX_QUICK_ACTION_ATTACK_COMPONENTS = 3;

export const QUICK_ACTION_TARGET_MODES = Object.freeze([
  "self",
  "selection",
]);

export const QUICK_ACTION_SPELL_LAUNCH_MODES = Object.freeze([
  "auto",
  "review",
]);

export const QUICK_ACTION_EXPIRY_MODES = Object.freeze([
  "manual",
  "rounds",
  "turn-start",
  "turn-end",
]);

// "slot" spends a spell slot; "uses" a counter of the action that comes back with the long rest; "free" nothing.
export const QUICK_ACTION_SPELL_COSTS = Object.freeze(["slot", "uses", "free"]);
export const MAX_QUICK_ACTION_USES = 9;
const QUICK_ACTION_USES_POOL_PREFIX = "quick-action-uses:";

const spellCostSet = new Set(QUICK_ACTION_SPELL_COSTS);
const kindSet = new Set(QUICK_ACTION_KINDS);
const targetModeSet = new Set(QUICK_ACTION_TARGET_MODES);
const spellLaunchModeSet = new Set(QUICK_ACTION_SPELL_LAUNCH_MODES);
const expiryModeSet = new Set(QUICK_ACTION_EXPIRY_MODES);
const attackRangeSet = new Set(QUICK_ACTION_ATTACK_RANGES);
const attackDamageTypeSet = new Set(QUICK_ACTION_ATTACK_DAMAGE_TYPES);

function shortText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalInteger(value, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sanitizeId(value) {
  return shortText(value, 96).replace(/[^a-zA-Z0-9:_-]/g, "");
}

export function sanitizeQuickAction(value) {
  if (!value || typeof value !== "object") return null;

  const id = sanitizeId(value.id);
  const kind = kindSet.has(value.kind) ? value.kind : "";
  const label = shortText(value.label, 80);
  if (!id || !kind || !label) return null;

  const targetMode = targetModeSet.has(value.targetMode)
    ? value.targetMode
    : "selection";

  if (kind === "spell") {
    const spellId = shortText(value.spellId, 160);
    if (!spellId) return null;
    const legacyLaunchMode = value.workflow === "area" ? "review" : "auto";
    const launchMode = spellLaunchModeSet.has(value.launchMode)
      ? value.launchMode
      : legacyLaunchMode;
    // The cost of the cast: a spell slot (the default, never stored, so existing actions keep their shape), a
    // counter of its own (a spell from a feat, a species or an item) or nothing.
    const cost = spellCostSet.has(value.cost) ? value.cost : "slot";
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      spellId,
      targetMode,
      slotLevel: optionalInteger(value.slotLevel, 1, 9),
      turns: optionalInteger(value.turns, 1, 999),
      applyAutomations: value.applyAutomations !== false,
      launchMode,
      ...(cost !== "slot" ? { cost } : {}),
      ...(cost === "uses" ? { uses: optionalInteger(value.uses, 1, MAX_QUICK_ACTION_USES) ?? 1 } : {}),
    };
  }

  if (kind === "feature") {
    const featureId = shortText(value.featureId, 220);
    if (!featureId) return null;
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      featureId,
      targetMode,
    };
  }

  if (kind === "attack") {
    // A cantrip attack: one quick action per caster; the cantrip, its range and its damage are picked in the
    // attack console. spellIds optionally lists the cantrips this actor knows (empty: every attack cantrip).
    if (value.source?.kind === "cantrip") {
      const known = Array.isArray(value.source.spellIds) ? value.source.spellIds : [];
      const spellIds = [...new Set(known.map((spellId) => String(spellId || "")))].filter((spellId) => getPcAttackCantrip(spellId));
      return {
        version: QUICK_ACTION_VERSION,
        id,
        label,
        kind,
        targetMode: "selection",
        source: { kind: "cantrip", ...(spellIds.length ? { spellIds } : {}) },
      };
    }
    // A leveled attack spell (lotto L4): the same shape; the spell and its slot are picked in the attack console.
    if (value.source?.kind === "spell") {
      const known = Array.isArray(value.source.spellIds) ? value.source.spellIds : [];
      const spellIds = [...new Set(known.map((spellId) => String(spellId || "")))].filter((spellId) => getPcAttackSpell(spellId));
      return {
        version: QUICK_ACTION_VERSION,
        id,
        label,
        kind,
        targetMode: "selection",
        source: { kind: "spell", ...(spellIds.length ? { spellIds } : {}) },
      };
    }
    // Component ids come from their position: no identity to persist. The formula is a hint, never evaluated.
    const source = Array.isArray(value.components) ? value.components : [];
    if (!source.length || source.length > MAX_QUICK_ACTION_ATTACK_COMPONENTS) return null;
    const components = [];
    for (const [index, component] of source.entries()) {
      const type = attackDamageTypeSet.has(component?.type) ? component.type : "";
      if (!type) return null;
      const formula = shortText(component.formula, 24);
      components.push({ id: `c${index + 1}`, type, ...(formula ? { formula } : {}) });
    }
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      targetMode: "selection",
      range: attackRangeSet.has(value.range) ? value.range : "melee",
      components,
    };
  }

  const conditionName = shortText(value.conditionName, 80);
  if (!conditionName) return null;
  const expiryMode = expiryModeSet.has(value.expiryMode)
    ? value.expiryMode
    : "manual";
  return {
    version: QUICK_ACTION_VERSION,
    id,
    label,
    kind,
    conditionName,
    targetMode,
    expiryMode,
    duration: expiryMode === "manual"
      ? null
      : optionalInteger(value.duration, 1, 999) ?? 1,
  };
}

// Attacks pasted into the Attacks tab: a JSON array of attacks, or { attacks: [...] } (other fields, such as
// the character's name, are ignored). Each entry is validated as an attack quick action; the ids are the
// caller's. Nothing is saved here: the attacks become editor rows to review.
export function parseQuickActionAttackImport(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch {
    return { attacks: [], invalid: 0, error: "Blocco non leggibile: incollalo così com'è." };
  }
  const entries = Array.isArray(data) ? data : Array.isArray(data?.attacks) ? data.attacks : null;
  if (!entries) return { attacks: [], invalid: 0, error: "Nel blocco non c'è un elenco di attacchi." };
  const attacks = [];
  let invalid = 0;
  for (const entry of entries) {
    const attack = entry && typeof entry === "object"
      ? sanitizeQuickAction({ ...entry, id: "import", kind: "attack" })
      : null;
    if (!attack) {
      invalid += 1;
      continue;
    }
    const { id: _id, ...draft } = attack;
    attacks.push(draft);
  }
  return { attacks, invalid, error: "" };
}

// The counter of a spell quick action with its own uses: a class-feature resource pool built from the action, kept in
// classFeatureState.resources like the others (History, Undo, reset at the long rest).
export function quickActionUsesPool(action) {
  const normalized = sanitizeQuickAction(action);
  if (normalized?.kind !== "spell" || normalized.cost !== "uses") return null;
  return {
    id: `${QUICK_ACTION_USES_POOL_PREFIX}${normalized.id}`,
    name: `Usi: ${normalized.label}`,
    capacity: { type: "fixed", value: normalized.uses },
    refresh: [{ event: "riposo_lungo", amount: "massimo" }],
  };
}

// The uses left of an action with its own counter (resources is classFeatureState.resources); null without one.
export function quickActionUsesLeft(action, resources = {}) {
  const pool = quickActionUsesPool(action);
  if (!pool) return null;
  const maximum = pool.capacity.value;
  const stored = resources?.[pool.id]?.current;
  const current = stored === null || stored === undefined ? maximum : Number(stored);
  return { pool, current: Number.isFinite(current) ? Math.max(0, Math.min(maximum, Math.floor(current))) : maximum, maximum };
}

export function isAttackQuickAction(action) {
  return action?.kind === "attack";
}

// limit caps the quick actions, attackLimit the attacks: each list counts on its own.
export function sanitizeQuickActions(values, { limit = MAX_QUICK_ACTIONS, attackLimit = MAX_QUICK_ACTION_ATTACKS } = {}) {
  const source = Array.isArray(values) ? values : [];
  const maximum = Math.max(1, Math.min(256, Math.floor(Number(limit) || MAX_QUICK_ACTIONS)));
  const attackMaximum = Math.max(1, Math.min(256, Math.floor(Number(attackLimit) || MAX_QUICK_ACTION_ATTACKS)));
  const seen = new Set();
  const actions = [];
  let quickCount = 0;
  let attackCount = 0;
  for (const value of source) {
    const action = sanitizeQuickAction(value);
    if (!action || seen.has(action.id)) continue;
    const attack = isAttackQuickAction(action);
    if (attack ? attackCount >= attackMaximum : quickCount >= maximum) continue;
    seen.add(action.id);
    actions.push(action);
    if (attack) attackCount += 1;
    else quickCount += 1;
  }
  return actions;
}

export function findQuickAction(profile, actionId) {
  const wantedId = sanitizeId(actionId);
  if (!wantedId) return null;
  return sanitizeQuickActions(profile?.quickActions)
    .find((action) => action.id === wantedId) || null;
}

export function quickActionInitialTargetIds(action, sourceId, selectedIds = []) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized) return [];
  const normalizedSourceId = String(sourceId || "").trim();
  if (normalized.targetMode === "self") {
    return normalizedSourceId ? [normalizedSourceId] : [];
  }
  return Array.from(new Set(
    (Array.isArray(selectedIds) ? selectedIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

export function quickActionDirectTargetIds(action, sourceId, selectedIds = []) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized) return [];
  const initialIds = quickActionInitialTargetIds(
    normalized,
    sourceId,
    selectedIds,
  );
  if (normalized.targetMode === "self") return initialIds;
  return initialIds.length === 1 ? initialIds : [];
}
