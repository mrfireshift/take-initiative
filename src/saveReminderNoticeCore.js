import { normalizeReminderResolution } from "./reminderResolutionCore.js";

const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

const TIMING_LABELS = Object.freeze({
  "turn-start": "Inizio turno",
  "turn-end": "Fine turno",
  damage: "Dopo il danno",
  enter: "Ingresso nell'area",
  leave: "Uscita dall'area",
});

function normalizeTiming(value) {
  const timing = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIMING_LABELS, timing)
    ? timing
    : "";
}

function timingLabel(value) {
  return TIMING_LABELS[normalizeTiming(value)] || "";
}

function normalizeTarget(value) {
  const id = normalizedText(value?.id, "", 200);
  if (!id) return null;
  return {
    id,
    name: normalizedText(value?.name, "Token", 100),
    portrait: normalizedText(value?.portrait, "", 2048),
  };
}

function uniqueTargets(values = []) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const target = normalizeTarget(value);
    if (!target || byId.has(target.id)) continue;
    byId.set(target.id, target);
  }
  return [...byId.values()];
}

function normalizeEntry(value) {
  const activationId = normalizedText(value?.activationId, "", 300);
  const targets = uniqueTargets(value?.targets);
  if (!activationId || !targets.length) return null;
  const turnKey = normalizedText(value?.turnKey, "", 300);
  const kind = value?.kind === "effect-save"
    ? "effect-save"
    : value?.kind === "effect-reminder"
      ? "effect-reminder"
      : value?.kind === "zone-effect"
        ? "zone-effect"
        : "zone";
  const timing = normalizeTiming(value?.timing);
  const resolution = normalizeReminderResolution(value?.resolution);
  return {
    activationId,
    ...(turnKey ? { turnKey } : {}),
    ...(timing ? { timing } : {}),
    spellName: normalizedText(value?.spellName, "Incantesimo", 100),
    label: normalizedText(value?.label, "Tiro salvezza richiesto", 160),
    kind,
    ...(value?.eyebrow
      ? { eyebrow: normalizedText(value.eyebrow, "", 80) }
      : {}),
    ...(value?.instruction
      ? { instruction: normalizedText(value.instruction, "", 320) }
      : {}),
    ...(resolution ? { resolution } : {}),
    targets,
  };
}

function entryGroupKey(entry) {
  const turnKey = normalizedText(entry?.turnKey, "", 300);
  if (turnKey) return `turn:${turnKey}`;
  const targetIds = uniqueTargets(entry?.targets)
    .map((target) => target.id)
    .sort();
  return targetIds.length ? `targets:${targetIds.join(",")}` : "";
}

function batchFromEntries(entries, groupKey) {
  const byActivationId = new Map();
  for (const entry of entries) {
    if (!entry || byActivationId.has(entry.activationId)) continue;
    byActivationId.set(entry.activationId, entry);
  }
  const values = [...byActivationId.values()];
  if (!values.length || !groupKey) return null;
  const targets = uniqueTargets(values.flatMap((entry) => entry.targets));
  const turnKey = normalizedText(
    [...values].reverse().find((entry) => entry.turnKey)?.turnKey,
    "",
    300,
  );
  return {
    groupKey,
    ...(turnKey ? { turnKey } : {}),
    activationIds: values.map((entry) => entry.activationId),
    entries: values,
    targets,
  };
}

export function pruneZoneReminderNoticeBatch(
  currentBatch = null,
  pendingActivationIds = [],
) {
  const entries = Array.isArray(currentBatch?.entries)
    ? currentBatch.entries.map(normalizeEntry).filter(Boolean)
    : [];
  if (!entries.length) return null;
  const pending = new Set(
    (Array.isArray(pendingActivationIds)
      ? pendingActivationIds
      : [...(pendingActivationIds || [])])
      .map((value) => normalizedText(value, "", 300))
      .filter(Boolean),
  );
  const remaining = entries.filter((entry) => (
    (entry.kind !== "zone" && entry.kind !== "zone-effect")
    || pending.has(entry.activationId)
  ));
  if (!remaining.length) return null;
  const groupKey = normalizedText(currentBatch?.groupKey, "", 700);
  return groupKey ? batchFromEntries(remaining, groupKey) : null;
}

export function pruneEffectSaveReminderNoticeBatch(
  currentBatch = null,
  currentActivationIds = [],
) {
  const entries = Array.isArray(currentBatch?.entries)
    ? currentBatch.entries.map(normalizeEntry).filter(Boolean)
    : [];
  if (!entries.length) return null;
  const current = new Set(
    (Array.isArray(currentActivationIds)
      ? currentActivationIds
      : [...(currentActivationIds || [])])
      .map((value) => normalizedText(value, "", 300))
      .filter(Boolean),
  );
  const remaining = entries.filter((entry) => (
    (entry.kind !== "effect-save" && entry.kind !== "effect-reminder")
    || current.has(entry.activationId)
  ));
  if (!remaining.length) return null;
  const groupKey = normalizedText(currentBatch?.groupKey, "", 700);
  return groupKey ? batchFromEntries(remaining, groupKey) : null;
}

export function mergeSaveReminderNoticeBatch(
  currentBatch = null,
  incomingValues = [],
) {
  let batch = currentBatch?.entries?.length
    ? batchFromEntries(
      currentBatch.entries.map(normalizeEntry).filter(Boolean),
      normalizedText(currentBatch.groupKey, "", 700),
    )
    : null;

  for (const value of Array.isArray(incomingValues) ? incomingValues : []) {
    const entry = normalizeEntry(value);
    if (!entry) continue;
    const groupKey = entryGroupKey(entry);
    if (!groupKey) continue;
    batch = batch?.groupKey === groupKey
      ? batchFromEntries([...batch.entries, entry], groupKey)
      : batchFromEntries([entry], groupKey);
  }
  return batch;
}

function targetSummary(targets = []) {
  const values = uniqueTargets(targets);
  if (!values.length) return "Token";
  if (values.length === 1) return values[0].name;
  if (values.length === 2) return `${values[0].name} e ${values[1].name}`;
  return `${values[0].name}, ${values[1].name} e altri ${values.length - 2}`;
}

export function saveReminderNoticeBatchPresentation(batch = null) {
  const entries = Array.isArray(batch?.entries) ? batch.entries : [];
  const targets = uniqueTargets(batch?.targets);
  if (!entries.length || !targets.length) return null;
  if (entries.length === 1) {
    const entry = entries[0];
    const affectedTargets = targetSummary(entry.targets);
    const phase = timingLabel(entry.timing);
    const baseEyebrow = entry.eyebrow || (
      entry.kind === "effect-save"
        ? "Tiro salvezza"
        : entry.kind === "effect-reminder"
          ? "Promemoria"
        : entry.kind === "zone-effect"
          ? "Danno di zona"
          : "Effetto di zona"
    );
    const ariaAction = entry.kind === "zone-effect"
      ? "effetto di zona"
      : entry.kind === "effect-reminder"
        ? "promemoria di concentrazione"
        : "tiro salvezza richiesto";
    return {
      kind: entry.kind,
      eyebrow: phase ? `${baseEyebrow} · ${phase}` : baseEyebrow,
      title: `${affectedTargets} (${entry.spellName})`,
      primaryTarget: targets[0],
      ariaLabel: `${entry.spellName}: ${ariaAction} per ${affectedTargets}`,
      rows: [{
        activationId: entry.activationId,
        title: "",
        detail: entry.instruction || entry.label,
        targets: entry.targets,
        ...(entry.resolution ? { resolution: entry.resolution } : {}),
      }],
    };
  }

  const sharedTarget = targets.length === 1;
  const phases = Array.from(new Set(entries.map((entry) =>
    timingLabel(entry.timing)
  ).filter(Boolean)));
  const sharedPhase = phases.length === 1 ? phases[0] : "";
  const kinds = new Set(entries.map((entry) => entry.kind));
  const aggregateLabel = kinds.size === 1 && kinds.has("zone-effect")
    ? "Danni di zona"
    : kinds.size === 1 && kinds.has("effect-reminder")
      ? "Promemoria"
      : kinds.has("zone-effect") || kinds.has("effect-reminder")
        ? "Reminder"
        : "Tiri salvezza";
  return {
    kind: "aggregate",
    eyebrow: sharedPhase
      ? `${aggregateLabel} · ${sharedPhase}`
      : aggregateLabel,
    title: sharedTarget ? targets[0].name : "Più bersagli",
    primaryTarget: targets[0],
    ariaLabel: `${aggregateLabel} per ${targetSummary(targets)}`,
    rows: entries.map((entry) => {
      const entryPhase = timingLabel(entry.timing);
      const baseTitle = sharedTarget
        ? entry.spellName
        : `${entry.spellName} · ${targetSummary(entry.targets)}`;
      return {
        activationId: entry.activationId,
        title: !sharedPhase && entryPhase
          ? `${baseTitle} · ${entryPhase}`
          : baseTitle,
        detail: entry.instruction || entry.label,
        targets: entry.targets,
        ...(entry.resolution ? { resolution: entry.resolution } : {}),
      };
    }),
  };
}
