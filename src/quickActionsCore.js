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
// A monster's attack (attacchi dei mostri, lotto 1): a save in place of the attack roll, on one of the six abilities,
// over an area whose creatures the GM picks (or "target": up to maxTargets creatures).
export const QUICK_ACTION_ATTACK_SAVE_ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const QUICK_ACTION_ATTACK_AREA_SHAPES = Object.freeze(["cone", "line", "sphere", "cube", "cylinder", "target"]);
export const MAX_QUICK_ACTION_ATTACK_NOTE = 280;

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
const QUICK_ACTION_RECHARGE_POOL_PREFIX = "quick-action-recharge:";

const spellCostSet = new Set(QUICK_ACTION_SPELL_COSTS);
const kindSet = new Set(QUICK_ACTION_KINDS);
const targetModeSet = new Set(QUICK_ACTION_TARGET_MODES);
const spellLaunchModeSet = new Set(QUICK_ACTION_SPELL_LAUNCH_MODES);
const expiryModeSet = new Set(QUICK_ACTION_EXPIRY_MODES);
const attackRangeSet = new Set(QUICK_ACTION_ATTACK_RANGES);
const attackDamageTypeSet = new Set(QUICK_ACTION_ATTACK_DAMAGE_TYPES);
const attackSaveAbilitySet = new Set(QUICK_ACTION_ATTACK_SAVE_ABILITIES);
const attackAreaShapeSet = new Set(QUICK_ACTION_ATTACK_AREA_SHAPES);

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

// A whole number within the bounds (numbers written as text too, "+7"), or null: never clamped, a printed value
// out of range is a wrong value.
function boundedInteger(value, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).trim().replace(/^\+/, ""));
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

// The save that replaces a monster's attack roll: its ability and DC (both needed: the card's spell save DC is not the
// monster's), half damage on a passed save, its area and the condition of a failed save. Null without one.
function attackSaveOf(value) {
  const save = attackSaveAbilitySet.has(value?.save) ? value.save : "";
  const saveDC = boundedInteger(value?.saveDC, 1, 30);
  if (!save || saveDC === null) return null;
  const condition = shortText(value.onFail?.condition, 80);
  const area = attackAreaOf(value.area);
  return {
    save, saveDC,
    ...(value.saveHalf === true ? { saveHalf: true } : {}),
    ...(area ? { area } : {}),
    ...(condition ? { onFail: { condition } } : {}),
  };
}

// A save's area: its shape and size in feet (a line's width too), or "target" with the creatures it can choose.
function attackAreaOf(value) {
  const shape = attackAreaShapeSet.has(value?.shape) ? value.shape : "";
  if (!shape) return null;
  if (shape === "target") return { shape, maxTargets: boundedInteger(value.maxTargets, 1, 20) ?? 1 };
  const sizeFeet = boundedInteger(value.sizeFeet, 5, 1000);
  if (sizeFeet === null) return null;
  const widthFeet = shape === "line" ? boundedInteger(value.widthFeet, 5, 100) : null;
  // Where it starts (fase 5, lotto 1): "self" (a breath, "within 30 feet of the dragon") or "point"; choice: "each
  // creature of its choice". Optional: an area without them is drawn wherever the GM wants.
  const origin = ["self", "point"].includes(value.origin) ? value.origin : "";
  return { shape, sizeFeet, ...(widthFeet !== null ? { widthFeet } : {}), ...(origin ? { origin } : {}), ...(value.choice === true ? { choice: true } : {}) };
}

// A monster's attack fields besides its damage (attacchi dei mostri, lotto 1), all optional, kept only when valid: the
// save in place of the attack roll (attackSaveOf), else the attack bonus; reach and range in feet (shown, never checked);
// a recharge (Recharge 5–6: 5), uses a day, and a note for what the console does not automate.
function monsterAttackFieldsOf(value, save = attackSaveOf(value)) {
  const attackBonus = save ? null : boundedInteger(value?.attackBonus, -30, 30);
  const reachFeet = boundedInteger(value?.reachFeet, 5, 300);
  const normal = boundedInteger(value?.rangeFeet?.normal, 5, 10000);
  const long = normal === null ? null : boundedInteger(value.rangeFeet.long, normal, 10000);
  const recharge = boundedInteger(value?.recharge, 2, 6);
  const uses = boundedInteger(value?.uses, 1, MAX_QUICK_ACTION_USES);
  const note = shortText(value?.note, MAX_QUICK_ACTION_ATTACK_NOTE);
  return {
    ...(attackBonus !== null ? { attackBonus } : {}),
    ...(save || {}),
    ...(reachFeet !== null ? { reachFeet } : {}),
    ...(normal !== null ? { rangeFeet: { normal, ...(long !== null && long > normal ? { long } : {}) } } : {}),
    ...(recharge !== null ? { recharge } : {}),
    ...(uses !== null ? { uses } : {}),
    ...(note ? { note } : {}),
  };
}

// The monster's fields of a stored weapon attack, for the card's editor to keep them on a row it cannot edit yet
// (collectQuickActions rebuilds an attack from its label, range and components). {} for any other action.
export function quickActionMonsterAttackFields(action) {
  if (action?.kind !== "attack" || action.source) return {};
  return monsterAttackFieldsOf(action);
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
    // A monster's save without damage is an attack only when a failed save applies a condition (Frightful Presence).
    const source = Array.isArray(value.components) ? value.components : [];
    const save = attackSaveOf(value);
    if ((!source.length && !save?.onFail) || source.length > MAX_QUICK_ACTION_ATTACK_COMPONENTS) return null;
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
      ...monsterAttackFieldsOf(value, save),
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
// A monster's attack with uses a day (attacchi dei mostri, lotto 3) has the same counter.
export function quickActionUsesPool(action) {
  const normalized = sanitizeQuickAction(action);
  const uses = normalized?.kind === "spell" && normalized.cost === "uses" ? normalized.uses
    : normalized?.kind === "attack" && !normalized.source && normalized.uses ? normalized.uses : null;
  if (!uses) return null;
  return {
    id: `${QUICK_ACTION_USES_POOL_PREFIX}${normalized.id}`,
    name: `Usi: ${normalized.label}`,
    capacity: { type: "fixed", value: uses },
    refresh: [{ event: "riposo_lungo", amount: "massimo" }],
  };
}

// A monster's attack with a recharge (Recharge 5–6): one charge, spent when it is used and back with a rest. It never
// blocks the attack: the GM rolls the d6 at the table and, when it comes back, simply uses it again.
export function quickActionRechargePool(action) {
  const normalized = sanitizeQuickAction(action);
  if (normalized?.kind !== "attack" || normalized.source || !normalized.recharge) return null;
  return {
    id: `${QUICK_ACTION_RECHARGE_POOL_PREFIX}${normalized.id}`,
    name: `Ricarica: ${normalized.label}`,
    capacity: { type: "fixed", value: 1 },
    refresh: [{ event: "riposo_breve", amount: "massimo" }, { event: "riposo_lungo", amount: "massimo" }],
  };
}

// Every counter of an action: its uses, its recharge.
export function quickActionResourcePools(action) {
  return [quickActionUsesPool(action), quickActionRechargePool(action)].filter(Boolean);
}

// The recharge of an action (resources is classFeatureState.resources): ready until it is used; null without one.
export function quickActionRechargeState(action, resources = {}) {
  const pool = quickActionRechargePool(action);
  if (!pool) return null;
  const stored = resources?.[pool.id]?.current;
  return { pool, recharge: sanitizeQuickAction(action).recharge, ready: stored === null || stored === undefined || Number(stored) > 0 };
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
