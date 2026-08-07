import { cloneOptionsValue } from "./optionsNormalize.js";

const ATTITUDES = new Set(["pc", "ally", "neutral", "enemy"]);

const clone = (value) => cloneOptionsValue(value);

function attitudeOf(value) {
  const attitude = String(value || "").trim().toLowerCase();
  return ATTITUDES.has(attitude) ? attitude : "neutral";
}

function ratioOf(hp, hpMax) {
  const current = Number(hp);
  const maximum = Number(hpMax);
  if (!Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.max(0, Math.min(1, (Number.isFinite(current) ? current : 0) / maximum));
}

export function hpStatusForRatio(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return "unknown";
  if (ratio <= 0) return "down";
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.5) return "bloodied";
  if (ratio <= 0.75) return "hurt";
  return "healthy";
}

export function hpStatusLabel(status) {
  return ({
    down: "Fuori combattimento",
    critical: "Critico",
    bloodied: "Ferito",
    hurt: "Provato",
    healthy: "In salute",
    unknown: "Stato sconosciuto",
  })[status] || "Stato sconosciuto";
}

function statusRatio(status) {
  return ({ down: 0, critical: 0.2, bloodied: 0.45, hurt: 0.7, healthy: 1 })[status] ?? 0;
}

export function projectHpDisclosure({ hp, hpMax } = {}, mode = "hidden") {
  const normalizedMode = ["exact", "bar", "status", "hidden"].includes(mode)
    ? mode
    : "hidden";
  const ratio = ratioOf(hp, hpMax);
  if (normalizedMode === "hidden" || ratio === null) return { mode: "hidden" };
  if (normalizedMode === "exact") {
    return {
      mode: "exact",
      hp: Number.isFinite(Number(hp)) ? Number(hp) : 0,
      hpMax: Number(hpMax),
      ratio,
      status: hpStatusForRatio(ratio),
    };
  }
  const status = hpStatusForRatio(ratio);
  return {
    mode: normalizedMode,
    ratio: normalizedMode === "status" ? statusRatio(status) : ratio,
    status,
  };
}

function summaryConditions(conditions) {
  const source = conditions && typeof conditions === "object" ? conditions : {};
  const instances = Array.isArray(source.instances) ? source.instances : [];
  const legacyCount = Object.values(source.flags || {}).filter((value) => value !== false).length
    + (Array.isArray(source.custom) ? source.custom.filter(Boolean).length : 0);
  if (!instances.length && !legacyCount) return { version: 2, instances: [] };
  return {
    version: 2,
    instances: [{
      id: "player-summary:conditions",
      condition: "Condizione",
      expiry: { mode: "manual" },
    }],
  };
}

function summarySpells(spells) {
  return Array.isArray(spells) && spells.length
    ? [{ name: "Incantesimo", targets: null }]
    : [];
}

function projectEntryEffects(entry, policy = {}) {
  const next = {
    ...entry,
    conditions: entry.conditions && typeof entry.conditions === "object"
      ? clone(entry.conditions)
      : { version: 2, instances: [] },
    spells: Array.isArray(entry.spells) ? clone(entry.spells) : [],
  };
  if (policy.conditions === "hidden") next.conditions = { version: 2, instances: [] };
  else if (policy.conditions === "summary") next.conditions = summaryConditions(entry.conditions);
  if (policy.spells === "hidden") next.spells = [];
  else if (policy.spells === "summary") next.spells = summarySpells(entry.spells);
  if (policy.concentration === "hidden") {
    next.isConcentrating = false;
    next.concSpellKey = null;
  } else if (policy.concentration === "summary") {
    next.concSpellKey = null;
  }
  return next;
}

function projectBoss(entry, visibility) {
  if (visibility === "full") return entry;
  const hasBossDetails = !!entry.isEpic
    || Number(entry.paragonActions) > 1
    || Number(entry.legendary?.max) > 0
    || Number(entry.legendaryResistances?.max) > 0;
  return {
    ...entry,
    bossDisclosure: hasBossDetails ? visibility : "none",
    isEpic: visibility === "summary" ? !!entry.isEpic : false,
    paragonActions: 0,
    legendary: { max: 0, current: 0 },
    legendaryResistances: { max: 0, current: 0 },
  };
}

export function projectTrackerEntry(entry, {
  role = "PLAYER",
  surface = "trackerClassic",
  hpPolicy = {},
  effectsPolicy = {},
  bossDetails = "full",
} = {}) {
  if (!entry || typeof entry !== "object" || role === "GM") return entry;
  const attitude = attitudeOf(entry.attitude);
  const disclosure = projectHpDisclosure(entry, hpPolicy?.[surface]?.[attitude] || "hidden");
  let next = {
    ...entry,
    quickActions: [],
    classFeatures: [],
    hpDisclosure: disclosure,
    hp: disclosure.mode === "exact" ? disclosure.hp : null,
    hpMax: disclosure.mode === "exact" ? disclosure.hpMax : null,
  };
  next = projectEntryEffects(next, effectsPolicy);
  next = projectBoss(next, bossDetails);
  if (Array.isArray(entry.__groupMembers)) {
    next.__groupMembers = entry.__groupMembers.map((member) => projectTrackerEntry(member, {
      role, surface, hpPolicy, effectsPolicy, bossDetails,
    }));
  }
  return next;
}

export function projectTrackerEntries(entries, options = {}) {
  return (Array.isArray(entries) ? entries : []).map((entry) => projectTrackerEntry(entry, options));
}

export function mapHpDisclosure({ hp, hpMax, attitude } = {}, hpPolicy = {}) {
  return projectHpDisclosure(
    { hp, hpMax },
    hpPolicy?.map?.[attitudeOf(attitude)] || "hidden",
  );
}

export function projectSceneItemEffects(item, {
  role = "PLAYER",
  policy = {},
  metaKey,
  spellsKey,
  concentrationKey,
} = {}) {
  if (!item || role === "GM") return item;
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const pluginMeta = metadata[metaKey];
  if (!pluginMeta || typeof pluginMeta !== "object") return item;
  const nextPluginMeta = { ...pluginMeta };
  if (policy.conditions === "hidden") nextPluginMeta.conditions = { version: 2, instances: [] };
  else if (policy.conditions === "summary") nextPluginMeta.conditions = summaryConditions(pluginMeta.conditions);
  if (policy.spells === "hidden") nextPluginMeta[spellsKey] = [];
  else if (policy.spells === "summary") {
    const spells = Array.isArray(pluginMeta[spellsKey]) ? pluginMeta[spellsKey] : [];
    const targets = [...new Set(spells.flatMap((spell) =>
      Array.isArray(spell?.targets) ? spell.targets.filter(Boolean) : []))];
    nextPluginMeta[spellsKey] = spells.length
      ? [{ name: "Incantesimo", ...(targets.length ? { targets } : {}) }]
      : [];
  }
  if (policy.concentration === "hidden") nextPluginMeta[concentrationKey] = {};
  else if (policy.concentration === "summary" && nextPluginMeta[concentrationKey]) {
    const values = Object.values(nextPluginMeta[concentrationKey]);
    const targets = [...new Set(values.flatMap((value) =>
      Array.isArray(value?.targets) ? value.targets.filter(Boolean) : []))];
    nextPluginMeta[concentrationKey] = values.length
      ? { Incantesimo: targets.length ? { targets } : {} }
      : {};
  }
  return { ...item, metadata: { ...metadata, [metaKey]: nextPluginMeta } };
}

function stripResolution(value) {
  const next = { ...value };
  delete next.resolution;
  return next;
}

function redactDcText(value) {
  return typeof value === "string"
    ? value.replace(/\s+CD\s*\d+/giu, "").replace(/\s{2,}/gu, " ").trim()
    : value;
}

export function projectReminderNotice(value, {
  role = "PLAYER",
  policy = {},
  directResolution = "assisted",
} = {}) {
  if (!value || typeof value !== "object") return null;
  if (role === "GM") {
    return directResolution === "informational" ? stripResolution(clone(value)) : clone(value);
  }
  const visibility = policy.visibility || "hidden";
  if (visibility === "hidden") return null;
  let next = stripResolution(clone(value));
  if (!policy.showDc) {
    delete next.dc;
    delete next.saveDc;
    next.label = redactDcText(next.label);
    next.saveLabel = redactDcText(next.saveLabel);
    next.instruction = redactDcText(next.instruction);
  }
  if (!policy.showCaster) {
    delete next.casterName;
    delete next.sourceName;
    delete next.casterId;
    delete next.sourceId;
  }
  if (visibility === "summary") {
    delete next.failureEffect;
    delete next.instruction;
    delete next.dc;
    delete next.saveDc;
    delete next.casterName;
    delete next.sourceName;
    delete next.casterId;
    delete next.sourceId;
    next.label = "Effetto da risolvere";
    next.saveLabel = "Effetto da risolvere";
  } else if (visibility === "notice") {
    next.spellName = "Effetto";
    next.effectName = "Effetto";
    next.label = "È richiesto un intervento";
    next.saveLabel = "È richiesto un intervento";
    next.instruction = "È richiesto un intervento.";
    delete next.failureEffect;
    delete next.dc;
    delete next.saveDc;
    delete next.casterName;
    delete next.sourceName;
    delete next.casterId;
    delete next.sourceId;
  }
  return next;
}

export function projectReminderNotices(values, options = {}) {
  return (Array.isArray(values) ? values : [])
    .map((value) => projectReminderNotice(value, options))
    .filter(Boolean);
}
