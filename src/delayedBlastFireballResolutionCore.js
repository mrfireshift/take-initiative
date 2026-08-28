import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { areaMembershipTargetIds } from "./spellAreaMembershipCore.js";
import { getSpellAreaRuleById } from "./spellAreaRules.js";
import {
  AOE_AREA_META_KEY,
} from "./aoeStyle.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";
import {
  buildDelayedBlastFireballTerminalCommand,
  DELAYED_BLAST_FIREBALL_ID,
  DELAYED_BLAST_FIREBALL_RULE_ID,
  delayedBlastFireballCurrentDice,
  delayedBlastFireballPosition,
  normalizeDelayedBlastFireballCastContext,
} from "./delayedBlastFireballRules.js";
import { executeSpellAreaResolution } from "./spellAreaResolutionExecutor.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

const text = (value) => String(value ?? "").trim();

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function uniqueIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter(Boolean))];
}

function itemMeta(item) {
  return item?.metadata?.[META_KEY]
    && typeof item.metadata[META_KEY] === "object"
    ? item.metadata[META_KEY]
    : {};
}

function trackedHP(item) {
  const meta = itemMeta(item);
  return !!item?.id
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax));
}

function rootZoneItem(items, instanceId) {
  return (Array.isArray(items) ? items : []).find((item) => {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    return text(metadata?.instanceId) === text(instanceId)
      && metadata?.role === "root";
  }) || null;
}

function concentrationEntry(caster, instanceId) {
  const concentration = itemMeta(caster)[CONCENTRATION_KEY];
  if (!concentration || typeof concentration !== "object") return null;
  return Object.values(concentration).find((entry) => (
    text(entry?.instanceId) === text(instanceId)
  )) || null;
}

function spellEntry(caster, instanceId) {
  const spells = itemMeta(caster)[SPELLS_KEY];
  if (!Array.isArray(spells)) return null;
  return spells.find((entry) => text(entry?.instanceId) === text(instanceId)) || null;
}

function fallbackBounds(item) {
  const position = point(item?.position);
  if (!position) return null;
  const width = Math.max(1, Number(item?.width || item?.image?.width || 1));
  const height = Math.max(1, Number(item?.height || item?.image?.height || width));
  return {
    min: position,
    max: { x: position.x + width, y: position.y + height },
    center: { x: position.x + width / 2, y: position.y + height / 2 },
  };
}

async function loadBounds(items, runtime) {
  const byId = runtime?.boundsById instanceof Map
    ? runtime.boundsById
    : runtime?.boundsById && typeof runtime.boundsById === "object"
      ? new Map(Object.entries(runtime.boundsById))
      : new Map();
  const getItemBounds = runtime?.getItemBounds
    || ((ids) => OBR.scene.items.getItemBounds(ids));
  await Promise.all((Array.isArray(items) ? items : []).map(async (item) => {
    if (!item?.id || byId.has(item.id)) return;
    try {
      const result = await getItemBounds([item.id]);
      const bounds = Array.isArray(result) ? result[0] : result?.[item.id] || result;
      if (bounds) byId.set(item.id, bounds);
    } catch {
      // Geometry remains usable in tests/offline scenes through the fallback.
    }
    if (!byId.has(item.id)) {
      const fallback = fallbackBounds(item);
      if (fallback) byId.set(item.id, fallback);
    }
  }));
  return byId;
}

function currentAreaContext({ root, instanceId, casterId, allItems, runtime } = {}) {
  const area = translatedZoneArea(root);
  if (!area) return null;
  const rule = getSpellAreaRuleById(
    text(root?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.ruleId)
      || DELAYED_BLAST_FIREBALL_RULE_ID,
  );
  if (!rule) return null;
  return loadBounds((Array.isArray(allItems) ? allItems : []).filter(trackedHP), runtime)
    .then((boundsById) => {
      const candidates = (Array.isArray(allItems) ? allItems : [])
        .filter(trackedHP)
        .map((item) => ({ item, bounds: boundsById.get(item.id) }))
        .filter((entry) => entry.bounds);
      // The explosion is not the placement preview: the caster is a valid
      // creature target when the current pearl radius contains it.
      const explosionRule = {
        ...rule,
        targeting: { ...(rule.targeting || {}), includeCaster: true },
        zonePolicy: {
          ...(rule.zonePolicy || {}),
          membershipTargeting: {
            ...(rule.zonePolicy?.membershipTargeting || {}),
            includeCaster: true,
          },
        },
      };
      const targetIds = areaMembershipTargetIds({
        sourceId: casterId,
        rule: explosionRule,
        area,
        candidates,
        metaKey: META_KEY,
      });
      return {
        area,
        targetIds,
        boundsById,
        position: point(area.origin) || point(root?.position),
      };
    });
}

/**
 * Reads the live pearl and recalculates membership at detonation time. No
 * target list is persisted at cast time, so movement during the wait is
 * reflected in this snapshot.
 */
export async function getDelayedBlastFireballTerminalContext({
  casterId = "",
  instanceId = "",
  runtime = {},
} = {}) {
  const readAllItems = runtime.readAllItems
    || (() => OBR.scene.items.getItems());
  const allItems = await readAllItems();
  const caster = (Array.isArray(allItems) ? allItems : [])
    .find((item) => text(item?.id) === text(casterId)) || null;
  const zoneItems = runtime.getStaticZoneItems
    ? await runtime.getStaticZoneItems({ instanceId })
    : (Array.isArray(allItems) ? allItems : [])
      .filter((item) => text(item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.instanceId) === text(instanceId));
  const root = rootZoneItem(zoneItems, instanceId);
  if (!caster || !root) {
    return {
      valid: false,
      errors: [{ code: "delayed-blast-fireball-pearl-missing", message: "La perla non è più presente nella scena." }],
      allItems,
      caster,
      root,
      targetIds: [],
    };
  }
  const concentration = concentrationEntry(caster, instanceId);
  const spell = spellEntry(caster, instanceId);
  const pending = concentration?.pendingTermination || null;
  const castContext = normalizeDelayedBlastFireballCastContext(
    concentration?.castContext || spell?.castContext || {},
    { slotLevel: spell?.slotLevel || 7 },
  );
  const geometry = await currentAreaContext({
    root,
    instanceId,
    casterId,
    allItems,
    runtime,
  });
  if (!geometry) {
    return {
      valid: false,
      errors: [{ code: "delayed-blast-fireball-pearl-geometry-missing", message: "La geometria della perla non è più disponibile." }],
      allItems,
      caster,
      root,
      concentration,
      spell,
      pending,
      castContext,
      targetIds: [],
    };
  }
  return {
    valid: true,
    allItems,
    caster,
    root,
    concentration,
    spell,
    pending,
    castContext,
    ...geometry,
    currentDice: delayedBlastFireballCurrentDice(castContext),
    position: geometry.position || delayedBlastFireballPosition(castContext),
    instanceId: text(instanceId),
    casterId: text(casterId),
  };
}

/**
 * Builds the ordinary area-resolution command used by the shared executor.
 * This helper intentionally contains no HP mutation or custom damage path.
 */
export async function buildDelayedBlastFireballTerminalResolutionCommand({
  casterId = "",
  instanceId = "",
  pendingTermination = null,
  castContext = null,
  targetIds = undefined,
  outcomes = {},
  damage = null,
  sceneEpoch = null,
  runtime = {},
} = {}) {
  const context = await getDelayedBlastFireballTerminalContext({
    casterId,
    instanceId,
    runtime,
  });
  if (!context.valid) return { command: null, context };
  // The mutation transport exposes a termination event wrapper while the
  // resolver needs the canonical pending record itself.  Accept both forms
  // so callers from the panel, tracker card and reload path converge on the
  // same request id.
  const pendingEvent = pendingTermination || context.pending;
  const pending = pendingEvent?.pendingTermination || pendingEvent;
  const requestId = text(pending?.requestId);
  const currentTargetIds = uniqueIds(context.targetIds);
  const requestedTargetIds = targetIds === undefined
    ? currentTargetIds
    : uniqueIds(targetIds).filter((id) => currentTargetIds.includes(id));
  // The scene snapshot is authoritative at detonation time.  A popup may
  // have been open while the caster's turn-end accumulation changed the
  // instance, so never let its original payload overwrite the live state.
  const sourceContext = context.castContext || castContext || {};
  const command = buildDelayedBlastFireballTerminalCommand({
    casterId,
    instanceId,
    requestId,
    sceneEpoch: sceneEpoch ?? runtime.sceneEpoch ?? currentSceneEpoch(),
    slotLevel: sourceContext?.slotLevel || context.castContext?.slotLevel || 7,
    castContext: sourceContext,
    position: context.position,
    preview: context.root?.metadata?.[AOE_AREA_META_KEY] || null,
    targetIds: requestedTargetIds,
    outcomes,
    damage: damage ?? context.currentDice,
  });
  return { command, context };
}

/**
 * Resolves the terminal blast through executeSpellAreaResolution. The same
 * transaction then resumes the gateway and removes the parent/concentration.
 */
export async function executeDelayedBlastFireballTerminalResolution({
  casterId = "",
  instanceId = "",
  pendingTermination = null,
  castContext = null,
  targetIds = undefined,
  outcomes = {},
  damage = null,
  runtime = {},
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  const effectiveEpoch = sceneEpoch ?? runtime.sceneEpoch ?? currentSceneEpoch();
  const current = typeof isCurrent === "function"
    ? () => isCurrent(effectiveEpoch)
    : () => isCurrentSceneEpoch(effectiveEpoch);
  if (!current()) throw new Error("scene-epoch-stale-before-delayed-blast-fireball");
  const built = await buildDelayedBlastFireballTerminalResolutionCommand({
    casterId,
    instanceId,
    pendingTermination,
    castContext,
    targetIds,
    outcomes,
    damage,
    sceneEpoch: effectiveEpoch,
    runtime,
  });
  if (!built.command || !built.context?.valid) {
    throw new Error(
      built.context?.errors?.[0]?.code || "delayed-blast-fireball-terminal-context-invalid",
    );
  }
  const dependencies = {
    ...runtime,
    sceneEpoch: effectiveEpoch,
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { operationId: commandId } : {}),
    ...(typeof isCurrent === "function" ? { isCurrent: current } : {}),
  };
  return executeSpellAreaResolution(built.command, dependencies);
}

export const DELAYED_BLAST_FIREBALL_TERMINAL_META = Object.freeze({
  spellId: DELAYED_BLAST_FIREBALL_ID,
  radiusMeters: 6,
  saveAbility: "dex",
  damageType: "fuoco",
});
