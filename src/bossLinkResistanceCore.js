// Rimebound Link (Boss Actions, profile v26): while the link is active, the tokens linked to the boss through shared hit
// points (the Titan) resist all damage; the first damage of the round to the boss token itself (the Projection) ends it
// until the next round. Pure data: no SDK. Nothing is shown to the players: there is no pill, the resistance is added
// in memory where the plugin computes damage, and the GM gets notices.
//
// The boss token keeps one field, merged into its metadata: { enabled, name, holder, breaker, brokenRound? }. The link
// is active in every canonical round except the one recorded in brokenRound, so nothing listens to the round change.
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
export const BOSS_LINK_RESISTANCE_FIELD = "bossLinkResistance";
const IN_MEMORY_INSTANCE_ID = "boss-link-resistance";
// The ids of DAMAGE_TYPES (damageDefensesCore), repeated so the effects coordinator does not load the actor profile code.
export const BOSS_LINK_DAMAGE_TYPE_IDS = Object.freeze(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);

const text = (value) => (typeof value === "string" ? value.trim() : "");
const metaOf = (item) => item?.metadata?.[META_KEY] || {};
const snapshot = (meta, field) => (Object.hasOwn(meta, field) ? { present: true, value: structuredClone(meta[field]) } : { present: false });

// The record to keep on the boss token for a profile (at binding); null when the profile has no link.
export function bossLinkResistanceRecord(profile, previous = null) {
  const ability = (Array.isArray(profile?.abilities) ? profile.abilities : []).find((entry) => entry?.linkResistance);
  if (!ability) return null;
  const { holder, breaker } = ability.linkResistance;
  const same = previous?.enabled === true && previous.name === ability.name;
  return { enabled: true, name: ability.name, holder, breaker, ...(same && Number.isSafeInteger(previous.brokenRound) ? { brokenRound: previous.brokenRound } : {}) };
}

// The link of a boss token in a round: null without a record, otherwise its names and whether it is active now.
export function bossLinkResistanceState(sourceItem, round) {
  const record = metaOf(sourceItem)[BOSS_LINK_RESISTANCE_FIELD];
  if (record?.enabled !== true) return null;
  const canonical = Number.isSafeInteger(round) && round >= 1;
  return { name: text(record.name) || "Rimebound Link", holder: text(record.holder) || "Titano", breaker: text(record.breaker) || "Proiezione",
    brokenRound: Number.isSafeInteger(record.brokenRound) ? record.brokenRound : null,
    active: canonical && record.brokenRound !== round, round: canonical ? round : null };
}

// A linked token (a member of the boss's shared hit points, not the boss token) that resists now.
export function bossLinkResistsFor(item, sourceItem, round) {
  const sourceId = text(metaOf(item).sharedHpSourceId);
  if (!item?.id || !sourceId || sourceId !== sourceItem?.id || item.id === sourceItem.id) return null;
  const state = bossLinkResistanceState(sourceItem, round);
  return state?.active ? state : null;
}

// The item as the damage code reads it: an in-memory effect with resistance to every damage type. It is never written
// back (callers pass it to the damage arithmetic only); without an active link the item is returned unchanged.
export function withBossLinkDefenses(item, sourceItem, round) {
  const state = bossLinkResistsFor(item, sourceItem, round);
  if (!state) return item;
  const meta = metaOf(item);
  const instance = { id: `${IN_MEMORY_INSTANCE_ID}:${sourceItem.id}`, condition: state.name, active: true, hidden: true,
    mechanics: { damageDefenses: { immunities: [], resistances: [...BOSS_LINK_DAMAGE_TYPE_IDS], vulnerabilities: [] } } };
  const value = meta.conditions;
  const conditions = Array.isArray(value) ? [...value, instance]
    : value && typeof value === "object" ? { ...value, instances: [...(Array.isArray(value.instances) ? value.instances : []), instance] }
      : [instance];
  return { ...item, metadata: { ...item.metadata, [META_KEY]: { ...meta, conditions } } };
}

// For the effects coordinator: after a shared hit point plan, the link of each boss whose group took damage.
// - damage to a linked token while the link is active: a notice (already halved when the plugin applied it);
// - damage to the boss token while the link is active: the link ends for this round, in the same command (Undo
//   restores it), and a notice.
// appliedIds: linked tokens whose damage the plugin already reduced with the link's resistance.
export function planBossLinkResistance({ items = [], groups = [], round, appliedIds = [] } = {}) {
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  const applied = new Set(Array.isArray(appliedIds) ? appliedIds : []);
  const metadataPatches = [], notices = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const source = byId.get(group?.sourceId);
    const state = bossLinkResistanceState(source, round);
    if (!state?.active) continue;
    const damaged = Array.isArray(group.damageHitIds) ? group.damageHitIds : [];
    const holders = damaged.filter((id) => id !== source.id);
    const portrait = text(source.image?.url).slice(0, 2048);
    if (holders.length) {
      notices.push({ kind: "resisted", sourceId: source.id, sourceName: source.name || "", portrait, name: state.name, holder: state.holder,
        targets: holders.map((id) => byId.get(id)?.name || id), applied: holders.every((id) => applied.has(id)) });
    }
    if (damaged.includes(source.id)) {
      const meta = metaOf(source);
      metadataPatches.push({ id: source.id, fields: { [BOSS_LINK_RESISTANCE_FIELD]: {
        value: { ...meta[BOSS_LINK_RESISTANCE_FIELD], brokenRound: round }, expected: snapshot(meta, BOSS_LINK_RESISTANCE_FIELD) } } });
      notices.push({ kind: "broken", sourceId: source.id, sourceName: source.name || "", portrait, name: state.name, holder: state.holder, breaker: state.breaker, round });
    }
  }
  return { metadataPatches, notices };
}

export function bossLinkResistanceNoticeText(notice) {
  if (notice?.kind === "broken")
    return `${notice.name} interrotto: la ${notice.breaker} ha subito danni. Il ${notice.holder} perde la Resistenza fino all'inizio del prossimo round.`;
  if (notice?.kind === "resisted")
    return `${notice.name} attivo: il ${notice.holder} ha Resistenza a tutti i danni${notice.targets?.length ? ` (${notice.targets.join(", ")})` : ""}. ${notice.applied ? "Danno già dimezzato." : "Dimezza tu il danno se non l'hai già fatto."}`;
  return "";
}

// The GM's popover (boss-link-notice.html, on the model of the speed and concentration warnings): one card for the notices
// of one command. A broken link sets the tone; the Titan's damage stays as a line above it.
export function bossLinkNoticeCard(notices = []) {
  const list = (Array.isArray(notices) ? notices : []).filter((notice) => ["resisted", "broken"].includes(notice?.kind));
  if (!list.length) return null;
  const broken = list.find((notice) => notice.kind === "broken");
  const resisted = list.filter((notice) => notice.kind === "resisted");
  const first = broken || resisted[0];
  const lines = resisted.map((notice) => ({ strong: (notice.targets || []).join(", ") || notice.holder,
    text: notice.applied ? ": Resistenza a tutti i danni, danno già dimezzato." : ": Resistenza a tutti i danni, dimezza il danno se non l'hai già fatto." }));
  if (broken) lines.push({ strong: broken.breaker, text: ` colpita: il ${broken.holder} perde la Resistenza fino al round ${broken.round + 1}.` });
  return {
    tone: broken ? "broken" : "active",
    eyebrow: `${first.name} · solo GM`,
    title: broken ? "Link interrotto" : `${first.holder} resistente`,
    lines,
    badge: broken ? { label: "ROUND", value: String(broken.round + 1) } : { label: "DANNO", value: "½" },
    name: first.sourceName || first.breaker || first.holder,
    portrait: first.portrait || "",
  };
}
