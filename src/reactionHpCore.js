import { ID } from "./constants.js";

// CAP-REACTION, lotto 2 (PHB 2014): the hit points two active spells change in the same command as the damage,
// where the death saves are planned (the coordinator's HP block and the area command's own HP write).
// - Death Ward: the first time damage would drop the creature to 0 hit points it drops to 1 instead, and an effect
//   that would kill it outright without damage (Power Word Kill, Divine Word) is negated; either way the ward ends.
// - Warding Bond: each time the warded creature takes damage, the caster takes the same amount; the spell ends when
//   the caster drops to 0 hit points (the 18 m between them stay at the table).
const META_KEY = `${ID}/meta`;
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));

function activePills(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false && instance.id);
}

export function deathWardPill(item) {
  return activePills(item).find((pill) => pill.mechanics?.deathWard === true) || null;
}

// hpAfter: the HP the write would leave; damage: the damage of the write (0 for a death without damage).
// null when the ward does not trigger; else the HP to write instead and the ward's pill to remove.
export function planDeathWard({ item = null, hpAfter, damage = 0, instantDeath = false } = {}) {
  const ward = deathWardPill(item);
  if (!ward) return null;
  const before = integer(item?.metadata?.[META_KEY]?.hp);
  const after = Math.floor(Number(hpAfter));
  const name = item?.name || "La creatura";
  if (instantDeath && integer(damage) <= 0) {
    return { hp: before, removeInstanceIds: [String(ward.id)], negatedDeath: true,
      note: `Interdizione alla morte: ${name} non muore e l'interdizione termina.` };
  }
  if (before > 0 && Number.isFinite(after) && after <= 0 && integer(damage) > 0) {
    return { hp: 1, removeInstanceIds: [String(ward.id)], negatedDeath: instantDeath,
      note: `Interdizione alla morte: ${name} resta a 1 PF e l'interdizione termina.` };
  }
  return null;
}

export function wardingBondPill(item) {
  return activePills(item).find((pill) => pill.mechanics?.wardingBond === true && pill.sourceId) || null;
}

// The damage the warded creatures of these writes take, mirrored on their casters.
// writes: [{ itemId, damage }]; hpById: the HP of the casters before (or after other writes of the same command).
// Returns the casters' writes ({ itemId, hp, hpMax, damage, sources }) and the bonds that end (their pills).
export function planWardingBondDamage({ writes = [], itemsById = new Map(), hpById = new Map() } = {}) {
  const casterWrites = new Map();
  const removals = [];
  const notes = [];
  for (const write of Array.isArray(writes) ? writes : []) {
    const damage = integer(write?.damage);
    const target = itemsById.get(String(write?.itemId || ""));
    const bond = damage > 0 ? wardingBondPill(target) : null;
    const casterId = String(bond?.sourceId || "");
    const caster = casterId && casterId !== target?.id ? itemsById.get(casterId) : null;
    const casterMeta = caster?.metadata?.[META_KEY] || {};
    if (!bond || !caster || !Object.hasOwn(casterMeta, "hp") || !Object.hasOwn(casterMeta, "hpMax")) continue;
    const previous = casterWrites.get(casterId);
    const hpBefore = previous ? previous.hp : integer(hpById.has(casterId) ? hpById.get(casterId) : casterMeta.hp);
    const hp = Math.max(0, hpBefore - damage);
    casterWrites.set(casterId, {
      itemId: casterId,
      hp,
      hpMax: integer(casterMeta.hpMax),
      damage: (previous?.damage || 0) + damage,
      sources: [...(previous?.sources || []), target.id],
    });
    notes.push(`Vincolo di interdizione: ${caster.name || "il caster"} subisce ${damage} danni con ${target.name || "il protetto"}.`);
    if (hpBefore > 0 && hp <= 0) {
      removals.push({ itemId: target.id, instanceId: String(bond.id) });
      notes.push(`Vincolo di interdizione: ${caster.name || "il caster"} è a 0 PF, il vincolo termina.`);
    }
  }
  return { writes: [...casterWrites.values()], removals, notes };
}
