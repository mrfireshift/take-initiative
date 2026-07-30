import { ID } from "./constants.js";
import { getSpellDefinition } from "./spells-srd.js";
import { spellExpiryCounter } from "./spellExpiryCore.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const CONC_META_KEY = ID + "/concentration";

function getSpellsFromItem(item) {
  const spells = item?.metadata?.[META_KEY]?.[SPELLS_META_KEY];
  return Array.isArray(spells) ? spells : [];
}

function getEffectInstancesFromItem(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(conditions)
    ? conditions
    : Array.isArray(conditions?.instances)
      ? conditions.instances
      : [];
  return instances.filter((instance) => instance && instance.active !== false);
}

function spellDisplayName(value) {
  const raw = String(value || "").trim();
  return getSpellDefinition(raw)?.displayName || raw || "Incantesimo";
}

export function factionKey(item) {
  const attitude = String(item?.metadata?.[META_KEY]?.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}

export function factionColor(item) {
  const attitude = factionKey(item);
  if (attitude === "enemy") return "#ef4444";
  if (attitude === "ally") return "#22c55e";
  if (attitude === "pc") return "#38bdf8";
  return "#eab308";
}

export function spellOverviewGroups(items = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groups = new Map();

  for (const target of items) {
    for (const spell of getSpellsFromItem(target)) {
      const instanceId = String(spell?.instanceId || "").trim();
      const casterId = String(spell?.casterId || "").trim();
      const storedName = String(spell?.name || "").trim();
      const fallbackKey = casterId + "\u0000" + storedName.toLocaleLowerCase("it");
      const key = instanceId ? "instance:" + instanceId : "legacy:" + fallbackKey;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          instanceId,
          storedName,
          spellId: String(spell?.spellId || "").trim(),
          castContext: spell?.castContext && typeof spell.castContext === "object"
            ? { ...spell.castContext }
            : null,
          name: spellDisplayName(spell?.spellId || storedName),
          casterId,
          casterName: byId.get(casterId)?.name || "Non indicato",
          concentrating: !!spell?.conc,
          concentrationRef: instanceId || storedName,
          targets: new Map(),
          turns: [],
          counters: [],
          effectInstances: [],
        };
        groups.set(key, group);
      }
      group.concentrating = group.concentrating || !!spell?.conc;
      if (!group.spellId && spell?.spellId) group.spellId = String(spell.spellId);
      if (!group.castContext && spell?.castContext && typeof spell.castContext === "object") {
        group.castContext = { ...spell.castContext };
      }
      if (spell?.castContext?.staticZoneOwner !== true) {
        group.targets.set(target.id, target.name || target.id);
      }
      group.turns.push(Math.max(0, Math.floor(Number(spell?.turns) || 0)));
      group.counters.push(spellExpiryCounter(spell));
    }
  }

  for (const caster of items) {
    const concentrations = caster?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
    for (const [key, info] of Object.entries(concentrations)) {
      const instanceId = String(info?.instanceId || "").trim();
      const storedName = String(info?.name || key).trim();
      const exactKey = instanceId ? "instance:" + instanceId : "";
      const legacyKey = "legacy:" + caster.id + "\u0000" + storedName.toLocaleLowerCase("it");
      const groupKey = exactKey || legacyKey;
      let group = (exactKey && groups.get(exactKey)) || groups.get(legacyKey);
      if (!group) {
        const spellId = String(info?.spellId || "").trim();
        group = {
          key: groupKey,
          instanceId,
          storedName,
          spellId,
          castContext: null,
          name: spellDisplayName(spellId || storedName),
          casterId: caster.id,
          casterName: caster.name || caster.id,
          concentrating: true,
          concentrationRef: instanceId || key,
          targets: new Map(),
          turns: [],
          counters: [],
          effectInstances: [],
        };
        groups.set(groupKey, group);
      }
      group.concentrating = true;
      group.casterId = caster.id;
      group.casterName = caster.name || caster.id;
      group.concentrationRef = instanceId || key;
      if (!group.spellId && info?.spellId) group.spellId = String(info.spellId);
      for (const targetId of Array.from(new Set(
        (Array.isArray(info?.targets) ? info.targets : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      ))) {
        group.targets.set(targetId, byId.get(targetId)?.name || targetId);
      }
    }
  }

  for (const item of items) {
    for (const instance of getEffectInstancesFromItem(item)) {
      const parentEffectId = String(instance?.parentEffectId || "").trim();
      const instanceId = String(instance?.id || "").trim();
      if (!parentEffectId || !instanceId) continue;
      const group = groups.get("instance:" + parentEffectId);
      if (!group) continue;
      group.effectInstances.push({
        itemId: item.id,
        instanceId,
        effectId: String(instance?.effectId || "").trim(),
        active: instance.active !== false,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "it") || a.casterName.localeCompare(b.casterName, "it")
  );
}

export function spellOverviewGroupCanTerminate(group, staticZoneCount = 0) {
  return (group?.targets instanceof Map && group.targets.size > 0)
    || Math.max(0, Math.floor(Number(staticZoneCount) || 0)) > 0
    || (!!group?.concentrating && !!String(group?.casterId || "").trim());
}

export function spellTurnsLabel(turns = [], counters = []) {
  const exact = Array.from(new Set(counters.filter((value) => /[IF]\s[CB]/.test(value))));
  if (exact.length) return exact.join(" / ");
  const values = turns.filter(Number.isFinite);
  if (!values.length) return "Durata non indicata";
  if (values.some((value) => value > 10)) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? min + " round" : min + "-" + max + " round";
}

export function getTrackerBaseItemId(value) {
  const id = String(value || "").trim();
  if (!id || id === "__LAIR__" || id.startsWith("__EPIC__")) return "";
  return id.replace(/::p\d+$/, "");
}
