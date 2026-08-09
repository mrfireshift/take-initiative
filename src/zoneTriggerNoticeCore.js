import { ID } from "./constants.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
import {
  buildZoneTriggerReminderResolution,
  normalizeReminderResolution,
} from "./reminderResolutionCore.js";

const META_KEY = `${ID}/meta`;
const NOTICE_TIMINGS = new Set([
  "turn-start",
  "turn-end",
  "damage",
  "enter",
  "leave",
]);

const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

function optionalDC(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(99, Math.round(number)));
}

function normalizeNoticeTiming(value) {
  const timing = String(value || "").trim().toLowerCase();
  return NOTICE_TIMINGS.has(timing) ? timing : "";
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

function itemPortrait(item) {
  return normalizedText(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url,
    "",
    2048,
  );
}

function spellSlotLevel(item, instanceId) {
  const spells = item?.metadata?.[META_KEY]?.[`${ID}/spells`];
  const wanted = String(instanceId || "").trim();
  const entry = Array.isArray(spells)
    ? spells.find((spell) => String(spell?.instanceId || "").trim() === wanted)
    : null;
  const level = Number(entry?.castContext?.slotLevel);
  return Number.isInteger(level) && level >= 0 ? level : null;
}

export function normalizeZoneTriggerNotice(value) {
  const activationId = normalizedText(value?.activationId, "", 300);
  const turnKey = normalizedText(value?.turnKey, "", 300);
  const casterName = normalizedText(value?.casterName, "", 100);
  const targets = (Array.isArray(value?.targets) ? value.targets : [])
    .map(normalizeTarget)
    .filter(Boolean);
  if (!activationId || !targets.length) return null;
  const dc = optionalDC(value?.dc);
  const timing = normalizeNoticeTiming(value?.timing || value?.event);
  const failureEffect = normalizedText(value?.failureEffect, "", 240);
  const eyebrow = normalizedText(value?.eyebrow, "", 80);
  const instruction = normalizedText(value?.instruction, "", 320);
  const resolution = normalizeReminderResolution(value?.resolution);
  const kind = value?.kind === "zone-effect"
    || value?.resolution === "informational"
    ? "zone-effect"
    : "";
  return {
    activationId,
    ...(turnKey ? { turnKey } : {}),
    ...(timing ? { timing } : {}),
    ...(kind ? { kind } : {}),
    spellName: normalizedText(value?.spellName, "Incantesimo", 100),
    label: normalizedText(
      value?.label,
      "Tiro salvezza richiesto",
      160,
    ),
    ...(failureEffect ? { failureEffect } : {}),
    ...(eyebrow ? { eyebrow } : {}),
    ...(instruction ? { instruction } : {}),
    ...(resolution ? { resolution } : {}),
    ...(dc !== null ? { dc } : {}),
    ...(casterName ? { casterName } : {}),
    targets,
  };
}

export function zoneTriggerNoticeFromActivation(
  activation,
  itemsById = new Map(),
) {
  const source = itemsById instanceof Map ? itemsById : new Map();
  const root = source.get(String(activation?.zoneItemId || ""));
  const metadataKey = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
    ? SPELL_STATIC_ZONE_META_KEY
    : root?.metadata && Object.keys(root.metadata).find((key) =>
      key === `${ID}/spellAura`
      || key === `${ID}/classFeatureAura`
      || key === `${ID}/customAura`
    ) || "";
  const zoneMetadata = root?.metadata?.[metadataKey]
    || root?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
    || {};
  const casterId = normalizedText(
    activation?.casterId || zoneMetadata.casterId,
    "",
    200,
  );
  const dc = optionalDC(
    source.get(casterId)?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC,
  );
  const casterName = normalizedText(source.get(casterId)?.name, "", 100);
  const slotLevel = spellSlotLevel(source.get(casterId), activation?.instanceId);
  const targets = (Array.isArray(activation?.targetIds)
    ? activation.targetIds
    : [])
    .map((targetId) => {
      const id = normalizedText(targetId, "", 200);
      const item = source.get(id);
      if (!id || !item) return null;
      return {
        id,
        name: normalizedText(item.name, "Token", 100),
        portrait: itemPortrait(item),
      };
    })
    .filter(Boolean);
  const rawNotice = {
    activationId: activation?.id,
    turnKey: activation?.noticeTurnKey || activation?.turnKey,
    timing: activation?.event,
    resolution: activation?.resolution,
    spellName: normalizedText(
      activation?.spellName
      || String(root?.name || "").replace(/^(?:Zona|Aura mobile):\s*/i, ""),
      "Incantesimo",
      100,
    ),
    label: activation?.label,
    failureEffect: activation?.failureEffect,
    eyebrow: activation?.eyebrow,
    instruction: activation?.instruction,
    ...(activation?.ability ? { ability: activation.ability } : {}),
    ...(dc !== null ? { dc } : {}),
    ...(casterName ? { casterName } : {}),
    targets,
  };
  if (
    activation?.resolution === "manual-heal"
    && targets.length === 1
    && !String(
      source.get(targets[0].id)?.metadata?.[META_KEY]?.creatureType
      || source.get(targets[0].id)?.metadata?.[META_KEY]?.creatureTypeName
      || source.get(targets[0].id)?.metadata?.[META_KEY]?.creatureTypeLabel
      || "",
    ).trim()
  ) {
    rawNotice.instruction = "Verifica il tipo di creatura: Costrutti e Non Morti non possono recuperare PF.";
  }
  const resolution = targets.length === 1
    ? buildZoneTriggerReminderResolution({
      activation: { ...activation, zoneItemId: activation?.zoneItemId },
      targetId: targets[0].id,
      sourceId: casterId,
      sourceName: casterName,
      dc,
      metadataKey,
      slotLevel,
    })
    : null;
  return normalizeZoneTriggerNotice({
    ...rawNotice,
    ...(resolution ? { resolution } : {}),
  });
}

export function shouldClearZoneNoticeAtTurn(
  currentNoticeTurnKey,
  incomingTurnKey,
) {
  const current = normalizedText(currentNoticeTurnKey, "", 300);
  const incoming = normalizedText(incomingTurnKey, "", 300);
  return !current || !incoming || current !== incoming;
}

export function zoneTriggerNoticeDetail(value) {
  const notice = normalizeZoneTriggerNotice(value);
  if (!notice) return "";
  const saveLabel = notice.label.match(
    /^TS\s+[\p{L}\p{M}'’-]+/iu,
  )?.[0] || notice.label;
  const dcLabel = notice.dc === undefined ? "" : ` CD ${notice.dc}`;
  const casterLabel = notice.casterName ? ` (${notice.casterName})` : "";
  if (notice.kind === "zone-effect") {
    return saveLabel === notice.label
      ? notice.label
      : notice.label.replace(
        saveLabel,
        `${saveLabel}${dcLabel}${casterLabel}`,
      );
  }
  const failureLabel = notice.failureEffect
    ? ` — Fallimento: ${notice.failureEffect}`
    : "";
  return `${saveLabel}${dcLabel}${casterLabel}${failureLabel}`;
}

export function planZoneTriggerNoticeDelivery(
  values = [],
  announcedIds = [],
) {
  const announced = new Set(
    (Array.isArray(announcedIds) ? announcedIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const notices = [];
  for (const value of Array.isArray(values) ? values : []) {
    const notice = normalizeZoneTriggerNotice(value);
    if (!notice || announced.has(notice.activationId)) continue;
    announced.add(notice.activationId);
    notices.push(notice);
  }
  return {
    notices,
    announcedIds: [...announced],
  };
}
