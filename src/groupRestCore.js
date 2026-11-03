import { ID } from "./constants.js";
import { quickHPStateOf } from "./quickHpCore.js";
import { isSpellBoardTokenItem } from "./spellBoardTokenTrackerCore.js";
import { DEATH_SAVE_DEAD_CONDITION } from "./deathSaveCore.js";
import { returnFromDeathCondition, returnFromDeathPill } from "./stabilizeSpellRules.js";

// Lot U6' of the system UX audit, "Riposo del gruppo": the party's short and long rest in one command (PHB 2014,
// p. 186). The resources come back as on each character's sheet (classFeatureRuntime.js); on a long rest the HP go to
// their maximum and the temporary hit points end, on a short rest each character gets back the HP the GM writes (the
// Hit Dice rolled at the table).
const META_KEY = `${ID}/meta`;
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const text = (value) => String(value ?? "").trim();
// The creature's active pills, read from its metadata as reactionHpCore.js does (no SDK here).
const activePills = (meta) => {
  const value = meta?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false);
};

// The party: every player character on the scene, in initiative or not; not a spell's token or a linked token that
// shares another's hit points. sharedHp: the character is in a group of shared hit points (its source or a linked
// one), where the coordinator takes only damage, healing or temporary hit points (sharedHpCore.js): it rests without
// an HP write.
export function groupRestMembers(items = []) {
  const list = Array.isArray(items) ? items : [];
  const sources = new Set(list.map((item) => text(item?.metadata?.[META_KEY]?.sharedHpSourceId)).filter(Boolean));
  return list
    .filter((item) => item?.id && text(item.metadata?.[META_KEY]?.attitude) === "pc" && !isSpellBoardTokenItem(item)
      && !text(item.metadata?.[META_KEY]?.sharedHpSourceId))
    .map((item) => {
      const meta = item.metadata?.[META_KEY] || {};
      const tracked = Number.isFinite(Number(meta.hp)) && Number.isFinite(Number(meta.hpMax)) && Number(meta.hpMax) > 0;
      const state = tracked ? quickHPStateOf(meta) : { hp: null, hpMax: null, tempHp: 0 };
      return {
        id: item.id,
        name: text(item.name) || "Personaggio",
        tracked,
        hp: state.hp,
        hpMax: state.hpMax,
        tempHp: state.tempHp,
        // The stored values, which the write expects (the old encoding keeps temporary hit points above hpMax).
        rawHp: tracked ? Number(meta.hp) : null,
        rawHpMax: tracked ? Number(meta.hpMax) : null,
        sharedHp: sources.has(item.id),
        // PHB 2014, p. 186: a long rest needs at least 1 HP at its start; the dead do not rest at all.
        down: tracked && state.hp <= 0,
        dead: activePills(meta).some((instance) => text(instance.condition) === DEATH_SAVE_DEAD_CONDITION),
        // CAP-STABILIZE: the return from death of Raise Dead and Resurrection (stabilizeSpellRules.js).
        returnPill: returnFromDeathPill(meta),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "it"));
}

// The HP writes of the rest ("hp:set" updates for the coordinator), for the members chosen. A long rest: HP to their
// maximum, temporary hit points to 0. A short rest: recovered[id] more HP, up to the maximum. Each write carries a
// "rest" intent: losing the temporary hit points that way is no damage (effectsMutations.js, hpWriteIsRest).
export function planGroupRestHpWrites({ members = [], longRest = false, recovered = {}, eventId = "group-rest" } = {}) {
  const updates = [];
  for (const member of Array.isArray(members) ? members : []) {
    if (!member?.tracked || member.sharedHp || !groupRestBenefits(member, longRest)) continue;
    const hp = integer(member.hp);
    const hpMax = integer(member.hpMax);
    const tempHp = integer(member.tempHp);
    const nextHp = longRest ? hpMax : Math.min(hpMax, hp + integer(recovered?.[member.id]));
    const nextTemp = longRest ? 0 : tempHp;
    if (nextHp === hp && nextTemp === tempHp) continue;
    updates.push({
      itemId: member.id,
      hp: nextHp,
      hpMax,
      tempHp: nextTemp,
      hpIntent: { mode: "rest", amount: nextHp - hp, eventId },
      expectedHP: { present: true, value: member.rawHp ?? hp },
      expectedHPMax: { present: true, value: member.rawHpMax ?? hpMax },
    });
  }
  return updates;
}

// CAP-STABILIZE: each long rest takes 1 from the return from death's penalty, in the rest's own command: the pill makes
// way for one with the new value, none at 0. Nothing for a member the rest does not benefit.
export function planGroupRestReturnFromDeath({ members = [], longRest = false } = {}) {
  if (!longRest) return [];
  return (Array.isArray(members) ? members : []).flatMap((member) => {
    const pill = member?.returnPill;
    if (!pill || !groupRestBenefits(member, longRest)) return [];
    const next = integer(pill.mechanics?.returnFromDeathPenalty) - 1;
    return [
      { type: "condition:remove-instances", removals: [{ itemId: member.id, instanceId: text(pill.id) }] },
      ...(next > 0 ? [{ type: "condition:add", targetIds: [member.id], ...returnFromDeathCondition(next) }] : []),
    ];
  });
}

// Whether the member gains anything from this rest: not the dead, and on a long rest not one at 0 HP.
export function groupRestBenefits(member, longRest = false) {
  return !member?.dead && !(longRest && member?.down);
}

// What the rest did to one member, for the panel's summary: "PF 30 → 45", "PF temporanei tolti", the resources.
export function groupRestMemberSummary(member, update, { resourcesRestored = false, longRest = false } = {}) {
  if (member?.dead) return "morto: nessun riposo";
  if (longRest && member?.down) return "a 0 PF: nessun beneficio dal riposo lungo";
  const parts = [];
  if (update && update.hp !== integer(member?.hp)) parts.push(`PF ${integer(member?.hp)} → ${update.hp}`);
  if (update && integer(member?.tempHp) > 0 && update.tempHp === 0) parts.push("PF temporanei tolti");
  if (longRest && member?.returnPill) {
    const next = integer(member.returnPill.mechanics?.returnFromDeathPenalty) - 1;
    parts.push(next > 0 ? `ritorno dalla morte −${next}` : "ritorno dalla morte finito");
  }
  if (resourcesRestored) parts.push("risorse ripristinate");
  if (member?.sharedHp) parts.push("PF condivisi: da aggiornare a mano");
  return parts.length ? parts.join(" · ") : "nulla da ripristinare";
}
