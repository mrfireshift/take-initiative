import { ID } from "./constants.js";
import { componentDamageAfterDefense, damageDefenseFor, damageDefensesForItem } from "./damageDefensesCore.js";

// Magic Missile (PHB 2014): three darts, one more per slot above 1st; each one hits a creature of the caster's
// choice automatically for 1d4 + 1 force damage, several on the same creature if the caster wants. Each dart is its
// own roll and its own damage: each target has a box per dart it takes ("4 - 3": three darts, the second still to
// roll), a resistance halves each one, a concentrating target saves once per dart and a dying PC takes one failure
// per dart. Shield blocks every dart.
const META_KEY = `${ID}/meta`;

export const MAGIC_MISSILE_SPELL_ID = "magic-missile";
export const MAGIC_MISSILE_DARTS_FIELD = "darts";
export const MAGIC_MISSILE_DART_DICE = "1d4+1";
// The immunity the Shield pill declares in its mechanics (spells-srd.js).
export const MAGIC_MISSILE_SHIELD_IMMUNITY = "magic-missile";
const BASE_DARTS = 3;
const BASE_SLOT = 1;

export function magicMissileDartTotal(slotLevel) {
  const slot = Math.max(BASE_SLOT, Math.floor(Number(slotLevel) || BASE_SLOT));
  return BASE_DARTS + (slot - BASE_SLOT);
}

// The darts written on a target, one per box: a whole number is its damage, "-" a dart still to roll (null).
// Separated by spaces, commas or "+". null when unreadable.
export function parseMagicMissileDarts(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,;+]+/u).filter(Boolean);
  const darts = parts.map((part) => (/^\d+$/u.test(part) ? Number(part) : part === "-" ? null : Number.NaN));
  return darts.some((dart) => Number.isNaN(dart)) ? null : darts;
}

// The value stored for a target's boxes: the damage of each dart, "-" where it is still empty.
export function magicMissileDartsValue(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => (value === null || value === undefined || String(value).trim() === ""
      ? "-" : String(Math.max(0, Math.floor(Number(value) || 0)))))
    .join(" ");
}

// The darts of each target: the boxes written on it, and for the targets left untouched an even share of the darts
// left (the first in the order take the extra ones), still to roll. Valid when every dart has a target and a damage.
export function magicMissileDartAllocation({ targetIds = [], targetContexts = {}, slotLevel } = {}) {
  const total = magicMissileDartTotal(slotLevel);
  const ids = [...new Set((Array.isArray(targetIds) ? targetIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const byTarget = {};
  const damagesByTarget = {};
  const invalidIds = [];
  const autoIds = [];
  for (const id of ids) {
    const raw = String(targetContexts?.[id]?.[MAGIC_MISSILE_DARTS_FIELD] ?? "").trim();
    if (!raw) {
      autoIds.push(id);
      continue;
    }
    const darts = parseMagicMissileDarts(raw);
    if (!darts) invalidIds.push(id);
    damagesByTarget[id] = darts || [];
    byTarget[id] = (darts || []).length;
  }
  const written = Object.values(byTarget).reduce((sum, darts) => sum + darts, 0);
  const remaining = Math.max(0, total - written);
  autoIds.forEach((id, index) => {
    const count = Math.floor(remaining / autoIds.length) + (index < remaining % autoIds.length ? 1 : 0);
    byTarget[id] = count;
    damagesByTarget[id] = Array.from({ length: count }, () => null);
  });
  const assigned = Object.values(byTarget).reduce((sum, darts) => sum + darts, 0);
  const missing = Object.values(damagesByTarget).reduce((sum, darts) => sum + darts.filter((dart) => dart === null).length, 0);
  const error = invalidIds.length ? "invalid" : !ids.length ? "no-targets"
    : assigned > total ? "over" : assigned < total ? "under" : missing ? "missing" : "";
  return { total, assigned, missing, byTarget, damagesByTarget, autoIds, invalidIds, valid: !error, error };
}

export function magicMissileAllocationText(allocation) {
  const missing = Number(allocation?.missing) || 0;
  return `Dardi assegnati ${allocation?.assigned ?? 0}/${allocation?.total ?? BASE_DARTS}`
    + (missing ? ` · ${missing} da tirare` : "");
}

function activeInstances(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false);
}

// Shield (or any active effect declaring the same immunity) on the target.
export function magicMissileBlockedByShield(item) {
  return activeInstances(item).some((instance) => (
    Array.isArray(instance.mechanics?.immunities)
      && instance.mechanics.immunities.includes(MAGIC_MISSILE_SHIELD_IMMUNITY)
  ));
}

// What protects the target from the darts: its force defense and Shield.
export function magicMissileTargetGuard(item) {
  return {
    defense: damageDefenseFor(damageDefensesForItem(item, META_KEY), "force"),
    shielded: magicMissileBlockedByShield(item),
  };
}

// The damage of each dart after the guard, and their sum.
export function magicMissileTargetDamage({ rolls = [], guard = {} } = {}) {
  // A dart still to roll counts 0 in the preview (the cast waits for every damage).
  const darts = (Array.isArray(rolls) ? rolls : []).map((roll) => Math.max(0, Math.floor(Number(roll) || 0)));
  const dartDamages = darts.map((roll) => (
    guard?.shielded === true ? 0 : componentDamageAfterDefense(roll, "full", guard?.defense || null)
  ));
  return {
    darts: darts.length,
    rolls: darts,
    dartDamages,
    damage: dartDamages.reduce((sum, damage) => sum + damage, 0),
    defense: guard?.defense || null,
    shielded: guard?.shielded === true,
  };
}

// The darts one after the other from the target's hit points: those landing at 0 HP (one death save failure each)
// and the damage that counts for the death saves, as one hit would: up to the dart that drops the target (its
// leftover decides the massive damage), or the largest dart for a target already at 0 HP.
export function magicMissileDeathSaveHits({ hp = 0, dartDamages = [] } = {}) {
  const before = Math.max(0, Math.floor(Number(hp) || 0));
  const damages = (Array.isArray(dartDamages) ? dartDamages : []).map((damage) => Math.max(0, Math.floor(Number(damage) || 0)));
  let current = before;
  let dealt = 0;
  let hitsAtZero = 0;
  let largestAtZero = 0;
  for (const damage of damages) {
    if (damage <= 0) continue;
    if (current <= 0) {
      hitsAtZero += 1;
      largestAtZero = Math.max(largestAtZero, damage);
    } else {
      current -= damage;
      dealt += damage;
    }
  }
  return { hitsAtZero, damageInstance: before > 0 ? dealt : largestAtZero };
}

export function magicMissileTargetText({ darts = 0, dartDamages = [], shielded = false, defense = null } = {}) {
  if (darts <= 0) return "Nessun dardo";
  const count = `${darts} ${darts === 1 ? "dardo" : "dardi"}`;
  if (shielded) return `${count} · bloccati da Scudo`;
  const tag = defense === "immunity" ? " (immune)" : defense === "resistance" ? " (resistenza)"
    : defense === "vulnerability" ? " (vulnerabilità)" : "";
  const sum = dartDamages.reduce((total, damage) => total + damage, 0);
  return `${count} · ${dartDamages.join(" + ")}${dartDamages.length > 1 ? ` = ${sum}` : ""}${tag}`;
}
