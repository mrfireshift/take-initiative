// src/conditions.js
import OBR, { buildText, buildShape } from "@owlbear-rodeo/sdk";
import { ID, isOnlyActiveTurnLabelChange } from "./constants.js";

const META_KEY = `${ID}/meta`;
const COND_LABEL_META = `${ID}/condLabel`;
const COND_WIDGET_META = `${ID}/condWidgetOf`; // = <tokenId>, usato sia su SHAPE che TEXT

// === Catalogo condizioni predefinite (ordine UI)
export const CONDITION_LIST = [
  "Accecato",
  "Affascinato",
  "Afferrato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Privo di sensi",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
  "Indebolimento",
  "Ira",
];


export const CONDITION_EMOJI = Object.freeze({
  "Accecato": "👁️",
  "Affascinato": "💖",
  "Afferrato": "✊",
  "Assordato": "🔇",
  "Avvelenato": "☠️",
  "Incapacitato": "💫",
  "Invisibile": "🫥",
  "Paralizzato": "⚡",
  "Pietrificato": "🪨",
  "Privo di sensi": "💤",
  "Prono": "⬇️",
  "Spaventato": "😨",
  "Stordito": "💥",
  "Trattenuto": "⛓️",
  "Indebolimento": "🩸",
  "Ira": "🔥",
});

export function formatConditionName(name) {
  const clean = String(name || "").trim();
  const emoji = CONDITION_EMOJI[clean];
  return emoji ? `${emoji} ${clean}` : clean;
}
const MAX_CUSTOM_SLOTS = 3;
const CONDITION_SCHEMA_VERSION = 2;
let __conditionIdSequence = 0;

export const CONDITION_EXPIRY_MODES = Object.freeze([
  "manual",
  "rounds",
  "turn-start",
  "turn-end",
  "concentration",
]);

const __CONDITION_EXPIRY_MODE_SET = new Set(CONDITION_EXPIRY_MODES);

function __durationFrom(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function __conditionActive(value) {
  if (value && typeof value === "object") return value.active !== false;
  return !!value;
}

function __conditionName(value) {
  if (value && typeof value === "object") {
    return String(value.condition || value.name || "").trim();
  }
  return String(value || "").trim();
}

function __normalizeAppliedAt(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  const round = Math.max(1, Math.floor(Number(value.round || 1)));
  if (Number.isFinite(round)) out.round = round;
  if (value.actorId) out.actorId = String(value.actorId);
  if (value.phase) out.phase = String(value.phase);
  return Object.keys(out).length ? out : null;
}

function __normalizeExpiry(value, legacyTurns = null, legacyTiming = "rounds") {
  const raw = value && typeof value === "object" ? value : {};
  let mode = String(raw.mode || raw.kind || (legacyTurns ? legacyTiming : "manual")).trim().toLowerCase();
  if (mode === "round") mode = "rounds";
  if (!__CONDITION_EXPIRY_MODE_SET.has(mode)) mode = legacyTurns ? "rounds" : "manual";

  const out = { mode };
  if (mode === "rounds" || mode === "turn-start" || mode === "turn-end") {
    out.remaining = __durationFrom(raw.remaining ?? raw.turns ?? legacyTurns) || 1;
  }

  const actor = String(raw.actor || "").trim().toLowerCase();
  if (actor === "source" || actor === "target") out.actor = actor;
  if (raw.actorId) out.actorId = String(raw.actorId);
  if (raw.actorName) out.actorName = String(raw.actorName);
  return out;
}

function __normalizeConditionInstance(value, fallbackId) {
  if (!value || typeof value !== "object" || value.active === false) return null;
  const condition = __conditionName(value);
  if (!condition) return null;

  const instance = {
    id: String(value.id || fallbackId || ""),
    condition,
    active: true,
    expiry: __normalizeExpiry(
      value.expiry,
      __durationFrom(value.turns),
      value.durationBy || value.timing || "rounds"
    ),
  };

  if (!instance.id) return null;
  if (value.sourceId) instance.sourceId = String(value.sourceId);
  if (value.sourceName) instance.sourceName = String(value.sourceName);
  if (value.targetId) instance.targetId = String(value.targetId);
  if (value.parentEffectId) instance.parentEffectId = String(value.parentEffectId);
  if (value.type) instance.type = String(value.type);
  const appliedAt = __normalizeAppliedAt(value.appliedAt);
  if (appliedAt) instance.appliedAt = appliedAt;
  const createdAt = Number(value.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) instance.createdAt = createdAt;
  if (value.legacy === true) instance.legacy = true;
  return instance;
}

function __legacyInstance(name, value, id) {
  if (!__conditionActive(value)) return null;
  const raw = value && typeof value === "object" ? value : {};
  return __normalizeConditionInstance({
    ...raw,
    id,
    condition: name,
    active: true,
    legacy: true,
  }, id);
}

function __allConditionInstances(cond = {}) {
  const src = cond && typeof cond === "object" ? cond : {};
  const out = [];
  const seen = new Set();

  const push = (instance) => {
    if (!instance || seen.has(instance.id)) return;
    seen.add(instance.id);
    out.push(instance);
  };

  const stored = Array.isArray(src.instances) ? src.instances : [];
  stored.forEach((value, index) => {
    push(__normalizeConditionInstance(value, `instance:${index}`));
  });

  const flags = src.flags && typeof src.flags === "object" ? src.flags : {};
  for (const [name, value] of Object.entries(flags)) {
    push(__legacyInstance(name, value, `legacy:flag:${encodeURIComponent(name)}`));
  }

  const custom = Array.isArray(src.custom) ? src.custom.filter(Boolean) : [];
  custom.forEach((value, index) => {
    const name = __conditionName(value);
    if (!name) return;
    push(__legacyInstance(name, value, `legacy:custom:${index}:${encodeURIComponent(name)}`));
  });

  return out;
}

function __cloneConditionInstance(instance) {
  return {
    ...instance,
    expiry: { ...(instance.expiry || { mode: "manual" }) },
    ...(instance.appliedAt ? { appliedAt: { ...instance.appliedAt } } : {}),
  };
}

export function getConditionInstances(cond = {}) {
  return __allConditionInstances(cond).map(__cloneConditionInstance);
}

function __persistableConditionInstance(instance) {
  const next = __cloneConditionInstance(instance);
  delete next.legacy;
  return next;
}

function __conditionsForWrite(cond = {}) {
  return {
    version: CONDITION_SCHEMA_VERSION,
    instances: __allConditionInstances(cond).map(__persistableConditionInstance),
  };
}

function __normalizeConditions(cond = {}) {
  const src = cond && typeof cond === "object" ? cond : {};
  return {
    version: Number(src.version) || 1,
    flags: src.flags && typeof src.flags === "object" ? { ...src.flags } : {},
    custom: Array.isArray(src.custom) ? src.custom.filter(Boolean).slice(0, MAX_CUSTOM_SLOTS) : [],
    instances: __allConditionInstances(src),
  };
}

function __newConditionInstanceId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  __conditionIdSequence += 1;
  return `condition:${Date.now().toString(36)}:${__conditionIdSequence.toString(36)}`;
}

function __buildConditionInstance(conditionName, opts = {}, targetId = "") {
  const condition = String(conditionName || "").trim();
  if (!condition) return null;

  const sourceId = String(opts.sourceId || "").trim();
  const expiry = __normalizeExpiry(
    opts.expiry,
    __durationFrom(opts.turns),
    opts.durationBy || opts.timing || "rounds"
  );

  if (expiry.mode === "turn-start" || expiry.mode === "turn-end") {
    expiry.actor = expiry.actor === "source" ? "source" : "target";
    if (!expiry.actorId) {
      expiry.actorId = expiry.actor === "source" ? sourceId : String(targetId || "");
    }
  }

  const instance = {
    id: __newConditionInstanceId(),
    condition,
    active: true,
    targetId: String(targetId || ""),
    expiry,
    createdAt: Date.now(),
  };

  if (sourceId) instance.sourceId = sourceId;
  if (opts.sourceName) instance.sourceName = String(opts.sourceName);
  if (opts.parentEffectId) instance.parentEffectId = String(opts.parentEffectId);
  if (opts.type || opts.effectType) instance.type = String(opts.type || opts.effectType);
  const appliedAt = __normalizeAppliedAt(opts.appliedAt);
  if (appliedAt) instance.appliedAt = appliedAt;
  return instance;
}

function __compactExpiryLabel(instance) {
  const expiry = instance?.expiry || { mode: "manual" };
  const remaining = __durationFrom(expiry.remaining);
  if (expiry.mode === "rounds") return remaining ? ` (${remaining})` : "";
  if (expiry.mode === "turn-start") return ` (I${remaining && remaining > 1 ? `:${remaining}` : ""})`;
  if (expiry.mode === "turn-end") return ` (F${remaining && remaining > 1 ? `:${remaining}` : ""})`;
  if (expiry.mode === "concentration") return " (C)";
  return "";
}

function __fullExpiryLabel(instance) {
  const expiry = instance?.expiry || { mode: "manual" };
  const remaining = __durationFrom(expiry.remaining) || 1;
  const actor = String(expiry.actorName || "").trim()
    || (expiry.actor === "source" ? "fonte" : "bersaglio");
  if (expiry.mode === "rounds") return `${remaining} round`;
  if (expiry.mode === "turn-start") {
    return `inizio turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  }
  if (expiry.mode === "turn-end") {
    return `fine turno ${actor}${remaining > 1 ? ` (tra ${remaining})` : ""}`;
  }
  if (expiry.mode === "concentration") return "concentrazione";
  return "manuale";
}

export function formatConditionInstance(instance) {
  const name = __conditionName(instance);
  if (!name) return "";
  const parts = [formatConditionName(name)];
  if (instance?.sourceName) parts.push(`fonte: ${instance.sourceName}`);
  parts.push(__fullExpiryLabel(instance));
  return parts.join(" | ");
}
function __groupConditionInstances(cond = {}) {
  const groups = new Map();
  for (const instance of __allConditionInstances(cond)) {
    const name = __conditionName(instance);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const group = groups.get(key) || { name, instances: [] };
    group.instances.push(instance);
    groups.set(key, group);
  }

  const ordered = Array.from(groups.values());
  ordered.sort((a, b) => {
    const ai = CONDITION_LIST.indexOf(a.name);
    const bi = CONDITION_LIST.indexOf(b.name);
    if (ai >= 0 || bi >= 0) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }
    return a.name.localeCompare(b.name);
  });

  return ordered.map((group) => ({
    ...group,
    label: group.instances.length > 1
      ? `${formatConditionName(group.name)} x${group.instances.length}`
      : `${formatConditionName(group.name)}${__compactExpiryLabel(group.instances[0])}`,
  }));
}
function __conditionLabel(name, value) {
  const instance = value?.condition
    ? value
    : __legacyInstance(name, value, `label:${encodeURIComponent(name)}`);
  return instance
    ? `${formatConditionName(name)}${__compactExpiryLabel(instance)}`
    : formatConditionName(name);
}
// Colore bordo per condizione (fallback a PILL_CFG.border)
const COND_BORDER = Object.freeze({
  "Accecato":        "#9b59b6",
  "Affascinato":     "#8e44ad",
  "Afferrato":       "#d35400",
  "Assordato":       "#95a5a6",
  "Avvelenato":      "#2ecc71",
  "Incapacitato":    "#e74c3c",
  "Invisibile":      "#7f8c8d",
  "Paralizzato":     "#3498db",
  "Pietrificato":    "#34495e",
  "Privo di sensi":  "#c0392b",
  "Prono":           "#f39c12",
  "Spaventato":      "#1abc9c",
  "Stordito":        "#e67e22",
  "Trattenuto":      "#ff6f00",
  "Indebolimento":   "#d81b60",
  "Ira":             "#ff0000",
});

// Aggiorna automaticamente le pillole quando qualsiasi item cambia.
// Evita doppie registrazioni in dev/HMR.
let __COND_WATCH_MOUNTED = false;
let __COND_REFRESH_TIMER = null;

function __scheduleConditionLabelRefresh() {
  if (__COND_REFRESH_TIMER) clearTimeout(__COND_REFRESH_TIMER);
  __COND_REFRESH_TIMER = setTimeout(() => {
    __COND_REFRESH_TIMER = null;
    refreshConditionLabels().catch(() => {});
  }, 80);
}

function __isOnlyConditionWidgetChange(changes = []) {
  return changes.length > 0 && changes.every((it) =>
    !!it?.metadata?.[COND_WIDGET_META] && !it?.metadata?.[META_KEY]
  );
}

export function mountConditionsLabelWatcher() {
  if (__COND_WATCH_MOUNTED) return;
  __COND_WATCH_MOUNTED = true;

  OBR.scene.items.onChange(async (changes = []) => {
    if (isOnlyActiveTurnLabelChange(changes)) return;
    if (__isOnlyConditionWidgetChange(changes)) return;
    __scheduleConditionLabelRefresh();
  });
}

// === Helpers lettura/scrittura metadati condizione
export async function getItemConditions(itemId) {
  const [it] = await OBR.scene.items.getItems(i => i.id === itemId);
  return __normalizeConditions(it?.metadata?.[META_KEY]?.conditions || {});
}

export async function setItemConditions(itemId, next) {
  await OBR.scene.items.updateItems([itemId], (list) => {
    const it = list[0];
    if (!it) return;
    const me = { ...(it.metadata?.[META_KEY] || {}) };
    me.conditions = __conditionsForWrite(next);
    it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
  });
}

function __sameCondition(instance, name) {
  return __conditionName(instance).toLocaleLowerCase() === String(name || "").trim().toLocaleLowerCase();
}

export async function toggleFlagForItems(itemIds, flagName, opts = {}) {
  const name = String(flagName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const isActive = cond.instances.some((instance) => __sameCondition(instance, name));
      cond.instances = isActive
        ? cond.instances.filter((instance) => !__sameCondition(instance, name))
        : [...cond.instances, __buildConditionInstance(name, opts, it.id)].filter(Boolean);
      if (cond.instances.length) me.conditions = cond;
      else delete me.conditions;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function addCustomForItems(itemIds, text, opts = {}) {
  const name = String(text || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const customIndexes = cond.instances
        .map((instance, index) => CONDITION_LIST.includes(__conditionName(instance)) ? -1 : index)
        .filter((index) => index >= 0);
      if (customIndexes.length >= MAX_CUSTOM_SLOTS) {
        cond.instances.splice(customIndexes[customIndexes.length - 1], 1);
      }
      const instance = __buildConditionInstance(name, opts, it.id);
      if (instance) cond.instances.push(instance);
      me.conditions = cond;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function adjustConditionDurationsForItems(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();

  const items = await OBR.scene.items.getItems(itemIds);
  const updates = new Map();

  for (const it of items) {
    const cond = __conditionsForWrite(it?.metadata?.[META_KEY]?.conditions || {});
    let changed = false;
    const nextInstances = [];

    for (const instance of cond.instances) {
      const expiry = instance.expiry || { mode: "manual" };
      const remaining = __durationFrom(expiry.remaining);
      if (expiry.mode !== "rounds" || !remaining) {
        nextInstances.push(instance);
        continue;
      }

      const nextRemaining = Math.max(0, remaining + delta);
      changed = true;
      if (nextRemaining > 0) {
        nextInstances.push({
          ...instance,
          expiry: { ...expiry, remaining: nextRemaining },
        });
      }
    }

    if (changed) {
      updates.set(it.id, {
        version: CONDITION_SCHEMA_VERSION,
        instances: nextInstances,
      });
    }
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const it of drafts) {
        const me = { ...(it.metadata?.[META_KEY] || {}) };
        const next = updates.get(it.id);
        if (next?.instances?.length) me.conditions = next;
        else delete me.conditions;
        it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
      }
    });
  }

  return updates;
}

export async function advanceConditionTurnBoundariesForItems(itemIds, boundaries = []) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  const events = (Array.isArray(boundaries) ? boundaries : [])
    .map((entry) => ({
      mode: entry?.phase === "start" ? "turn-start" : entry?.phase === "end" ? "turn-end" : "",
      actorId: String(entry?.actorId || "").trim(),
    }))
    .filter((entry) => entry.mode && entry.actorId);
  if (!ids.length || !events.length) return new Map();

  const items = await OBR.scene.items.getItems(ids);
  const updates = new Map();

  for (const it of items) {
    const cond = __conditionsForWrite(it?.metadata?.[META_KEY]?.conditions || {});
    let changed = false;
    const nextInstances = [];

    for (const instance of cond.instances) {
      const expiry = instance.expiry || { mode: "manual" };
      if (expiry.mode !== "turn-start" && expiry.mode !== "turn-end") {
        nextInstances.push(instance);
        continue;
      }

      const actorId = String(
        expiry.actorId || (expiry.actor === "source" ? instance.sourceId : instance.targetId) || ""
      );
      const initialRemaining = __durationFrom(expiry.remaining) || 1;
      let remaining = initialRemaining;
      for (const event of events) {
        if (event.mode === expiry.mode && event.actorId === actorId) remaining -= 1;
      }

      if (remaining === initialRemaining) {
        nextInstances.push(instance);
        continue;
      }

      changed = true;
      if (remaining > 0) {
        nextInstances.push({
          ...instance,
          expiry: { ...expiry, actorId, remaining },
        });
      }
    }

    if (changed) {
      updates.set(it.id, {
        version: CONDITION_SCHEMA_VERSION,
        instances: nextInstances,
      });
    }
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const it of drafts) {
        const me = { ...(it.metadata?.[META_KEY] || {}) };
        const next = updates.get(it.id);
        if (next?.instances?.length) me.conditions = next;
        else delete me.conditions;
        it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
      }
    });
  }

  return updates;
}

export async function addOrUpdateConditionForItems(itemIds, conditionName, opts = {}) {
  const name = String(conditionName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const instance = __buildConditionInstance(name, opts, it.id);
      if (instance) cond.instances.push(instance);
      me.conditions = cond;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function removeConditionInstanceFromItems(itemIds, instanceId) {
  const id = String(instanceId || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!id || !ids.length) return;

  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const nextInstances = cond.instances.filter((instance) => instance.id !== id);
      if (nextInstances.length === cond.instances.length) continue;
      if (nextInstances.length) {
        me.conditions = { version: CONDITION_SCHEMA_VERSION, instances: nextInstances };
      } else {
        delete me.conditions;
      }
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function removeConditionInstancesFromItems(removals = []) {
  const byItem = new Map();
  for (const removal of Array.isArray(removals) ? removals : []) {
    const itemId = String(removal?.itemId || "").trim();
    const instanceId = String(removal?.instanceId || "").trim();
    if (!itemId || !instanceId) continue;
    const ids = byItem.get(itemId) || new Set();
    ids.add(instanceId);
    byItem.set(itemId, ids);
  }
  if (!byItem.size) return;

  await OBR.scene.items.updateItems([...byItem.keys()], (drafts) => {
    for (const it of drafts) {
      const removeIds = byItem.get(it.id);
      if (!removeIds?.size) continue;
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const nextInstances = cond.instances.filter((instance) => !removeIds.has(instance.id));
      if (nextInstances.length === cond.instances.length) continue;
      if (nextInstances.length) {
        me.conditions = { version: CONDITION_SCHEMA_VERSION, instances: nextInstances };
      } else {
        delete me.conditions;
      }
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function removeConditionFromItems(itemIds, conditionName) {
  const name = String(conditionName || "").trim();
  const ids = (itemIds || []).filter(Boolean);
  if (!name || !ids.length) return;

  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cond = __conditionsForWrite(me.conditions || {});
      const nextInstances = cond.instances.filter((instance) => !__sameCondition(instance, name));
      if (nextInstances.length === cond.instances.length) continue;
      if (nextInstances.length) {
        me.conditions = { version: CONDITION_SCHEMA_VERSION, instances: nextInstances };
      } else {
        delete me.conditions;
      }
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

export async function clearAllConditionsForItems(itemIds) {
  const ids = (itemIds || []).filter(Boolean);
  if (!ids.length) return;
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      delete me.conditions;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}
// Payload Slate minimale per un testo monoriga
function _mkSlateParagraph(text) {
  return [{ type: "paragraph", children: [{ text: String(text || "") }] }];
}

// === Stima dimensioni testo (via canvas 2D)
function __measureTextPx(text, fontSize = 12, fontFamily = "Inter, system-ui, sans-serif") {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = `${fontSize}px ${fontFamily}`;
    const m = ctx.measureText(String(text || ""));
    const w = Math.ceil(m.width);
    const h = Math.ceil(fontSize * 1.25);
    return { w, h };
  } catch {
    const t = String(text || "");
    return { w: Math.ceil(t.length * fontSize * 0.6), h: Math.ceil(fontSize * 1.25) };
  }
}

// Geometria pill: padding/angoli/stroke
const PILL_CFG = {
  fontSize: 16,
  padX: 4,
  padY: 1,
  stroke: 2,
  // colori
  bg: "rgba(0,0,0,0.75)",
  border: "rgba(255, 0, 0, 1)",
  textFill: "#ffffff",
  textStroke: "rgba(0,0,0,.85)",
  textStrokeW: 2,
};

// Calcola size pill a partire dal testo
function __pillSizeFor(text) {
  const { w, h } = __measureTextPx(text, PILL_CFG.fontSize);
  return {
    width: w + PILL_CFG.padX * 2 + PILL_CFG.stroke * 4,
    height: h + PILL_CFG.padY * 2 + PILL_CFG.stroke * 2,
  };
}

// Margine tra chip e chip
const CHIP_GAP = 2;
const CHIP_Z = {
  bg: 100000,
  text: 100001,
};

const CHIP_LAYOUT_NUDGE = {
  x: 0,     // sposta tutto il blocco a sinistra (px). Negativo = sinistra
  topGap: 48,  // usato anche come baseGap per anchor top/bottom
  rowGap: CHIP_GAP,
};

// === Stack condiviso con spells ===
const STACK_GAP = 2; // deve combaciare con spells-tag.js
const CONC_WIDGET_META   = `${ID}/concWidgetOf`;
const CONC_WIDGET_KEY    = `${ID}/concWidgetKey`;
const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`;

// === NUOVO: configurazione anchor della colonna (top/bottom/center)
const STACK_ANCHOR = "top";              // "bottom" | "top" | "center"
const STACK_DIR    = 1;                     // 1 = giù, -1 = su
const STACK_BASE_GAP = CHIP_LAYOUT_NUDGE.topGap || 6;
const STACK_CENTER_OFFSET = 0;
function stackBaseY(targetItem) {
  const h = Number(targetItem.height) || 70;
  if (STACK_ANCHOR === "top")    return targetItem.position.y - h / 2 - STACK_BASE_GAP;
  if (STACK_ANCHOR === "center") return targetItem.position.y + STACK_CENTER_OFFSET;
  // default: bottom
  return targetItem.position.y + h / 2 + STACK_BASE_GAP;
}

// Metadata per identificare ogni chip (oltre al "owner" token)
const COND_WIDGET_KEY_META = `${ID}/condWidgetKey`; // es. "flag:Prono" o "custom:avvelenato"

// Ordina le flag secondo la tua UI + custom in coda
function __orderedParts(cond = {}) {
  return __groupConditionInstances(cond).map((group) => ({
    name: group.name,
    label: group.label,
    key: __chipKeyFor(group.name),
  }));
}
// Genera una chiave stabile per ogni parte
function __chipKeyFor(part) {
  if (CONDITION_LIST.includes(part)) return `flag:${part}`;
  const slug = String(part).toLowerCase().trim().replace(/\s+/g, "-").slice(0, 32);
  return `custom:${slug}`;
}

function __collectCondWidgetBuckets(items = []) {
  const buckets = new Map();
  const removeIds = new Set();

  for (const item of items) {
    const key = item.metadata?.[COND_WIDGET_KEY_META];
    if (!key) {
      removeIds.add(item.id);
      continue;
    }

    const strKey = String(key);
    const bucket = buckets.get(strKey) || { shape: null, text: null, shapes: [], texts: [] };
    if (item.type === "SHAPE") bucket.shapes.push(item);
    else if (item.type === "TEXT") bucket.texts.push(item);
    buckets.set(strKey, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.shape = bucket.shapes[0] || null;
    bucket.text = bucket.texts[0] || null;
    for (const extra of bucket.shapes.slice(1)) removeIds.add(extra.id);
    for (const extra of bucket.texts.slice(1)) removeIds.add(extra.id);
  }

  return { buckets, removeIds };
}

async function upsertCondLabelForItem(it) {
  return upsertCondWidgetForItem(it);
}

// Lock anti-race: un solo upsert alla volta per token
const __COND_UPSERT_LOCK = new Set();

export async function refreshConditionLabels(itemIds) {
  let items = [];
  if (Array.isArray(itemIds) && itemIds.length) {
    const idset = new Set(itemIds.filter(Boolean));
    items = await OBR.scene.items.getItems(i => idset.has(i.id));
  } else {
    items = await OBR.scene.items.getItems(i => !!i.metadata?.[META_KEY]);
  }

  for (const it of items) {
    if (!it) continue;
    if (__COND_UPSERT_LOCK.has(it.id)) continue;
    __COND_UPSERT_LOCK.add(it.id);
    try { await upsertCondWidgetForItem(it); } catch {} finally { __COND_UPSERT_LOCK.delete(it.id); }
  }
}

// === Anchor-based stack: calcola la Y per "cond:<key>"
async function __stackCYForCondition(targetItem, condKey, condHeight) {
  const tid = targetItem.id;

  // 1) SPELL rows presenti su questo target (qualsiasi caster)
  const spellLabels = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE")
       && i.metadata?.[CONC_WIDGET_META] === tid
       && !!i.metadata?.[CONC_WIDGET_CASTER]
  );
  const spellRows = new Map(); // sig -> height
  for (const itx of spellLabels) {
    const k = (itx.metadata?.[CONC_WIDGET_KEY] || "").toString().toLowerCase();
    const c = (itx.metadata?.[CONC_WIDGET_CASTER] || "").toString();
    if (!k || !c) continue;
    const sig = `${k}|${c}`;
    const h = itx.type === "SHAPE" ? (Number(itx.height) || condHeight) : null;
    if (!spellRows.has(sig)) spellRows.set(sig, h || condHeight);
    else if (h) spellRows.set(sig, h);
  }

  // 2) COND rows presenti (bg)
  const condShapes = await OBR.scene.items.getItems(
    (i) => i.type === "SHAPE" && i.metadata?.[COND_WIDGET_META] === tid
  );
  const condRows = new Map(); // key -> height
  for (const sh of condShapes) {
    const key = sh.metadata?.[COND_WIDGET_KEY_META];
    if (!key) continue;
    condRows.set(String(key), Number(sh.height) || condHeight);
  }
  if (!condRows.has(condKey)) condRows.set(condKey, condHeight);

  // 3) ordine: spells poi condizioni
  const entries = [];
  for (const [sig, h] of spellRows) entries.push({ group: 0, key: sig, h });
  for (const [key, h] of condRows)  entries.push({ group: 1, key, h });
  entries.sort((A, B) => (A.group - B.group) || String(A.key).localeCompare(String(B.key)));

  // 4) Stack usando l'anchor configurato
  const baseY = stackBaseY(targetItem);
  let cy = baseY, prevH = 0;
  for (let i = 0; i < entries.length; i++) {
    const h = Number(entries[i].h) || condHeight;
    if (i === 0) {
      cy = baseY + STACK_DIR * (h / 2);
    } else {
      cy = cy + STACK_DIR * ((prevH / 2) + STACK_GAP + (h / 2));
    }
    if (entries[i].group === 1 && entries[i].key === condKey) return Math.round(cy);
    prevH = h;
  }
  return Math.round(baseY + STACK_DIR * (condHeight / 2));
}

// === Versione a widget (SHAPE + TEXT) — multi-chip, una per condizione ===
async function upsertCondWidgetForItem(it) {
  const cond = it.metadata?.[META_KEY]?.conditions || {};
  const parts = __orderedParts(cond);
  const wantNone = parts.length === 0;

  const existing = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === it.id
  );

  let { buckets, removeIds } = __collectCondWidgetBuckets(existing);

  if (wantNone) {
    if (existing.length) await OBR.scene.items.deleteItems(existing.map(x => x.id));
    return;
  }

  const sizes = parts.map(p => {
    const label = p.label;
    const { width, height } = __pillSizeFor(label);
    return { label, name: p.name, width, height, key: p.key };
  });

  const totalWidth = sizes.reduce((acc, s) => acc + s.width, 0) + CHIP_GAP * (sizes.length - 1);
  const maxH = sizes.reduce((m, s) => Math.max(m, s.height), 0);

  const hasH = typeof it.height === "number" && !Number.isNaN(it.height);
  const tokenTop = hasH ? (it.position.y - it.height / 2) : (it.position.y - 60);

  const startX = it.position.x - totalWidth;
  const anchorY = tokenTop - 8 - (maxH / 2); // legacy (non usato dal nuovo stack, ma lasciato intatto)

  // === Layout a colonna singola (1 per riga), centrato orizzontalmente al token ===
  const CENTER_X = it.position.x + CHIP_LAYOUT_NUDGE.x;
  const rows = sizes.map(s => [s]);

  const layout = Object.create(null);
  for (let r = 0; r < rows.length; r++) {
    const s = rows[r][0];
    const cy = await __stackCYForCondition(it, s.key, s.height);
    const cx = CENTER_X;
    layout[s.key] = { pos: { x: cx, y: cy }, width: s.width, height: s.height, label: s.label };
  }

  // 1) CREA quelli mancanti
  const toAdd = [];
  let xCreate = startX;
  for (const s of sizes) {
    const key = s.key;
    const slot = layout[key];
    const cx = slot.pos.x;
    const cy = slot.pos.y;

    const pair = buckets.get(key) || {};
    if (!pair.shape) {
      const borderCol = COND_BORDER[s.name] || PILL_CFG.border;
      const shapeBuilt = buildShape()
        .shapeType("RECTANGLE")
        .position({ x: cx, y: cy })
        .attachedTo(it.id)
        .fillColor(PILL_CFG.bg)
        .strokeColor(borderCol)
        .strokeWidth(PILL_CFG.stroke)
        .width(s.width)
        .height(s.height)
        .layer("TEXT")
        .name(`Condizione: ${s.label} (bg)`)
        .metadata({ [COND_WIDGET_META]: it.id, [COND_WIDGET_KEY_META]: key })
        .build();
      try { if ("cornerRadius" in shapeBuilt) shapeBuilt.cornerRadius = PILL_CFG.radius; } catch {}
      shapeBuilt.locked = true;
      shapeBuilt.disableHit = true;
      shapeBuilt.zIndex = CHIP_Z.bg;
      toAdd.push(shapeBuilt);
    }

    if (!pair.text) {
      const textBuilt = buildText()
        .richText(_mkSlateParagraph(s.label))
        .position({ x: cx, y: cy })
        .attachedTo(it.id)
        .layer("TEXT")
        .name(`Condizione: ${s.label} (testo)`)
        .metadata({ [COND_WIDGET_META]: it.id, [COND_WIDGET_KEY_META]: key })
        .build();
      textBuilt.locked = true;
      textBuilt.disableHit = true;
      textBuilt.zIndex = CHIP_Z.text;
      toAdd.push(textBuilt);
    }
  }
  if (toAdd.length) {
    await OBR.scene.items.addItems(toAdd);

    const fresh = await OBR.scene.items.getItems(
      (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[COND_WIDGET_META] === it.id
    );
    const collected = __collectCondWidgetBuckets(fresh);
    buckets = collected.buckets;
    for (const id of collected.removeIds) removeIds.add(id);
  }

  // 2) AGGIORNA (posizione/size/stile/testo)
  const idsSet = new Set();
  for (const s of sizes) {
    const pair = buckets.get(s.key) || {};
    if (pair.shape) idsSet.add(pair.shape.id);
    if (pair.text)  idsSet.add(pair.text.id);
  }
  const idsToUpdate = Array.from(idsSet);

  // 3) CANCELLA extra
  const validKeys = new Set(sizes.map(s => s.key));
  for (const [key, pair] of buckets.entries()) {
    if (!validKeys.has(key)) {
      if (pair.shape) removeIds.add(pair.shape.id);
      if (pair.text)  removeIds.add(pair.text.id);
    }
  }
  const toRemove = Array.from(removeIds);
  if (toRemove.length) await OBR.scene.items.deleteItems(toRemove);

  // 4) UPDATE atomico
  await OBR.scene.items.updateItems(idsToUpdate, (draft) => {
    for (const itx of draft) {
      const key  = itx.metadata?.[COND_WIDGET_KEY_META];
      const slot = key ? layout[key] : null;
      if (!slot) continue;

      if (itx.attachedTo !== it.id) itx.attachedTo = it.id;
      if (itx.layer !== "TEXT") itx.layer = "TEXT";
      itx.locked = true;
      itx.disableHit = true;

      if (itx.type === "SHAPE") {
        const posChanged = !itx.position || itx.position.x !== slot.pos.x || itx.position.y !== slot.pos.y;
        const wChanged   = itx.width  !== slot.width  || itx.height !== slot.height;

        if (posChanged) itx.position = { x: slot.pos.x, y: slot.pos.y };
        if (wChanged) { itx.width = slot.width; itx.height = slot.height; }
        if ("cornerRadius" in itx && itx.cornerRadius !== PILL_CFG.radius) itx.cornerRadius = PILL_CFG.radius;
        if (itx.zIndex !== CHIP_Z.bg) itx.zIndex = CHIP_Z.bg;

      } else if (itx.type === "TEXT") {
        const posChanged = !itx.position || itx.position.x !== slot.pos.x || itx.position.y !== slot.pos.y;
        if (posChanged) itx.position = { x: slot.pos.x, y: slot.pos.y };
        if (itx.zIndex !== CHIP_Z.text) itx.zIndex = CHIP_Z.text;

        itx.text = itx.text || {};
        itx.text.type = "RICH";

        const curLabel =
          (Array.isArray(itx.text.richText) && itx.text.richText[0]?.children?.[0]?.text) ||
          itx.text.plainText || "";

        if (curLabel !== slot.label) {
          itx.text.richText = _mkSlateParagraph(slot.label);
          if (itx.text.plainText) delete itx.text.plainText;
        }

        if (itx.text.width !== slot.width)   itx.text.width  = slot.width;
        if (itx.text.height !== slot.height) itx.text.height = slot.height;

        const st = (itx.text.style = itx.text.style || {});
        if (st.fillColor !== PILL_CFG.textFill)        st.fillColor = PILL_CFG.textFill;
        if (st.strokeColor !== PILL_CFG.textStroke)    st.strokeColor = PILL_CFG.textStroke;
        if (st.strokeWidth !== PILL_CFG.textStrokeW)   st.strokeWidth = PILL_CFG.textStrokeW;
        if (st.fontSize !== PILL_CFG.fontSize)         st.fontSize = PILL_CFG.fontSize;
        if (st.textAlign !== "CENTER")                 st.textAlign = "CENTER";
        if (st.textAlignVertical !== "MIDDLE")         st.textAlignVertical = "MIDDLE";
      }
    }
  });
}

// Best-effort: rimuovi vecchie LABEL legacy (compat)
export async function __cleanupLegacyConditionLabels() {
  try {
    const labs = await OBR.scene.items.getItems(i => i.type === "LABEL" && i.metadata?.[COND_LABEL_META]);
    if (labs.length) await OBR.scene.items.deleteItems(labs.map(l => l.id));
  } catch {}
}

// Modifica
// Sostituisci la buildConditionChips esistente
export function buildConditionChips(cond = {}, opts = {}) {
  const cap = Array.isArray(opts.cap) ? opts.cap : [];
  const compact = !!opts.compact;
  const groups = __groupConditionInstances(cond);
  const pending = groups.slice();
  const ordered = [];

  for (const name of cap) {
    const index = pending.findIndex((group) => group.name === name);
    if (index >= 0) ordered.push(...pending.splice(index, 1));
  }
  ordered.push(...pending);

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "inline-flex",
    gap: "6px",
    alignItems: "center",
    pointerEvents: "none",
  });

  for (const group of ordered) {
    const chip = document.createElement("span");
    chip.textContent = group.label;
    const borderCol = COND_BORDER[group.name] || "rgba(255, 255, 255, 1)";
    Object.assign(chip.style, {
      fontSize: compact ? "10px" : "11px",
      fontWeight: "500",
      padding: compact ? "2px 6px" : "4px 8px",
      borderRadius: "999px",
      background: "rgba(0,0,0,.72)",
      color: "#fff",
      border: `2px solid ${borderCol}`,
      lineHeight: "1",
      whiteSpace: "nowrap",
      userSelect: "none",
      pointerEvents: "none",
    });
    wrap.appendChild(chip);
  }

  return wrap;
}
