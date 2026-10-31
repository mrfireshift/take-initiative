import { ID } from "./constants.js";
import { calculateQuickHPChange, quickHPStateOf } from "./quickHpCore.js";

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
// writes: [{ itemId, damage }]; hpById, tempHpById: the HP and temporary hit points of the casters before (or after
// other writes of the same command). The caster's temporary hit points take the damage first (CAP-TEMP).
// Returns the casters' writes ({ itemId, hp, hpMax, tempHp, damage, sources }) and the bonds that end (their pills).
export function planWardingBondDamage({ writes = [], itemsById = new Map(), hpById = new Map(), tempHpById = new Map() } = {}) {
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
    const state = quickHPStateOf(casterMeta);
    const hpBefore = previous ? previous.hp : hpById.has(casterId) ? integer(hpById.get(casterId)) : state.hp;
    const tempHpBefore = previous ? previous.tempHp : tempHpById.has(casterId) ? integer(tempHpById.get(casterId)) : state.tempHp;
    const change = calculateQuickHPChange({ value: damage, hp: hpBefore, hpMax: state.hpMax, tempHp: tempHpBefore });
    const hp = change.afterHP;
    casterWrites.set(casterId, {
      itemId: casterId,
      hp,
      hpMax: integer(casterMeta.hpMax),
      tempHp: change.afterTempHp,
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

// Lot U3a of the system UX audit: what these two spells do to an Effetti console command, for its preview. The
// coordinator plans the command the same way (effectsMutations.js): Warding Bond first, on the damage each write
// declares (the console's `requested`), then Death Ward on every write, the casters' included.
// entries: [{ item, change }] with calculateQuickHPChange's change; items: the scene's items, where the casters are.
// Returns the HP and temporary hit points each creature is left with, by id ({ hp, tempHp, bondDamage, ward }), and
// the notes the coordinator would write.
export function previewReactionHp({ entries = [], items = [] } = {}) {
  const itemsById = new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const results = new Map();
  const hpById = new Map();
  const tempHpById = new Map();
  const writes = [];
  for (const { item, change } of Array.isArray(entries) ? entries : []) {
    if (!item?.id || !change || !Number.isFinite(change.afterHP)) continue;
    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    results.set(item.id, { hp: change.afterHP, tempHp: integer(change.afterTempHp), bondDamage: 0, ward: false });
    hpById.set(item.id, change.afterHP);
    tempHpById.set(item.id, integer(change.afterTempHp));
    const damage = change.mode === "damage" ? integer(change.requested) : 0;
    if (damage > 0) writes.push({ itemId: item.id, damage });
  }
  const bond = planWardingBondDamage({ writes, itemsById, hpById, tempHpById });
  for (const write of bond.writes) {
    results.set(write.itemId, { hp: write.hp, tempHp: write.tempHp, bondDamage: write.damage, ward: false });
  }
  const notes = [...bond.notes];
  for (const [itemId, result] of results) {
    const item = itemsById.get(itemId);
    const damage = Math.max(0, integer(item?.metadata?.[META_KEY]?.hp) - result.hp);
    const ward = planDeathWard({ item, hpAfter: result.hp, damage });
    if (!ward) continue;
    result.hp = ward.hp;
    result.ward = true;
    notes.push(ward.note);
  }
  return { byId: results, notes };
}
