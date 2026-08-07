import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import { ID, SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { buildArea } from "./aoeGeometryCore.js";
import { loadAoEStyle } from "./aoeStyle.js";
import { queueSpellAreaEffectsMutation } from "./spellAreaMutationQueue.js";
import {
  collectActiveMobileAuras,
  mobileAuraMembershipPlan,
  mobileAuraTargetIds,
  SPELL_AURA_META_KEY,
  staleMobileAuraEffectRemovals,
} from "./spellAuraCore.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import { SPELL_AREA_RULES } from "./spellAreaRules.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import {
  mergeMobileAuraReminderMetadata,
  planMobileAuraReminder,
} from "./spellAuraReminderCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { createSceneItemBoundsCache } from "./sceneItemBoundsCache.js";
import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

export { SPELL_AURA_META_KEY } from "./spellAuraCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const STATE_KEY = `${ID}/state`;
const RECONCILE_DELAY_MS = 60;
const RECONCILE_RECOVERY_DELAY_MS = 250;
const ITEM_BOUNDS_TIMEOUT_MS = 1200;

let mounted = false;
let running = false;
let requested = false;
let timer = null;
let recoveryTimer = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
const sceneItemBounds = createSceneItemBoundsCache(
  (itemId) => OBR.scene.items.getItemBounds([itemId]),
  { timeoutMs: ITEM_BOUNDS_TIMEOUT_MS },
);

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundsCenter(bounds) {
  return point(bounds?.center) || (
    point(bounds?.min) && point(bounds?.max)
      ? {
        x: (Number(bounds.min.x) + Number(bounds.max.x)) / 2,
        y: (Number(bounds.min.y) + Number(bounds.max.y)) / 2,
      }
      : null
  );
}

function circleCommands(radius) {
  const handle = radius * 0.5522847498;
  return [
    [Command.MOVE, radius, 0],
    [Command.CUBIC, radius, handle, handle, radius, 0, radius],
    [Command.CUBIC, -handle, radius, -radius, handle, -radius, 0],
    [Command.CUBIC, -radius, -handle, -handle, -radius, 0, -radius],
    [Command.CUBIC, handle, -radius, radius, -handle, radius, 0],
    [Command.CLOSE],
  ];
}

function auraVisualMetadata(aura, dpi, sizeCells, style) {
  return {
    version: 2,
    instanceId: aura.instanceId,
    ruleId: aura.rule.id,
    spellId: aura.spellId,
    casterId: aura.casterId,
    dpi,
    sizeCells,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
  };
}

function buildAuraVisual({
  aura,
  center,
  caster,
  dpi,
  sizeCells,
  reminderUpdate = null,
}) {
  const style = spellAreaStyle(aura.spellId, loadAoEStyle());
  const radius = sizeCells * dpi;
  const metadata = mergeMobileAuraReminderMetadata(
    auraVisualMetadata(aura, dpi, sizeCells, style),
    reminderUpdate,
  );
  return buildPath()
    .commands(circleCommands(radius))
    .fillRule("evenodd")
    .fillColor(style.fillColor)
    .fillOpacity(Math.min(0.18, Math.max(0.06, Number(style.fillOpacity) || 0.12)))
    .strokeColor(style.strokeColor)
    .strokeOpacity(0.9)
    .strokeWidth(Math.max(2, dpi * 0.025 * style.strokeWidth))
    .position(center)
    .attachedTo(aura.casterId)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .disableAttachmentBehavior(["ROTATION", "VISIBLE", "COPY", "SCALE"])
    .visible(true)
    .zIndex((Number(caster?.zIndex) || 0) - 1)
    .metadata({
      [SPELL_AURA_META_KEY]: metadata,
    })
    .name(`Aura mobile: ${aura.spellId}`)
    .build();
}

function trackedCreature(item, orderedIds) {
  const meta = item?.metadata?.[META_KEY];
  return !!item?.id
    && !!meta
    && (meta.inInitiative === true || orderedIds.has(item.id));
}

function auraVisualIsCompatible(item, desired) {
  const style = spellAreaStyle(desired.aura.spellId, loadAoEStyle());
  const expected = auraVisualMetadata(
    desired.aura,
    desired.dpi,
    desired.sizeCells,
    style,
  );
  const actual = item?.metadata?.[SPELL_AURA_META_KEY] || {};
  return item.layer === "DRAWING"
    && item.attachedTo === desired.aura.casterId
    && actual.ruleId === expected.ruleId
    && Number(actual.dpi) === expected.dpi
    && Number(actual.sizeCells) === expected.sizeCells
    && actual.fillColor === expected.fillColor
    && actual.strokeColor === expected.strokeColor;
}

function auraVisualNeedsUpdate(item, desired) {
  if (!desired.reminderUpdate?.changed) return false;
  const metadata = item?.metadata?.[SPELL_AURA_META_KEY] || {};
  const merged = mergeMobileAuraReminderMetadata(metadata, desired.reminderUpdate);
  return JSON.stringify(metadata) !== JSON.stringify(merged);
}

async function reconcileAuraVisuals(desiredVisuals, sceneEpoch) {
  return reconcileOwnedSceneItems({
    desired: desiredVisuals,
    identityOfDesired: (desired) => desired.aura.instanceId,
    readItems: () => OBR.scene.items.getItems(
      (item) => !!item?.metadata?.[SPELL_AURA_META_KEY],
    ),
    identityOfItem: (item) => item?.metadata?.[SPELL_AURA_META_KEY]?.instanceId,
    isCompatible: auraVisualIsCompatible,
    needsUpdate: auraVisualNeedsUpdate,
    buildItem: buildAuraVisual,
    addItems: (items) => OBR.scene.items.addItems(items),
    updateItems: async (updates) => {
      const byId = new Map(updates.map(({ item, spec }) => [item.id, spec]));
      await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
        for (const item of drafts) {
          const desired = byId.get(item.id);
          const metadata = item.metadata?.[SPELL_AURA_META_KEY];
          if (!desired || !metadata) continue;
          item.metadata = {
            ...(item.metadata || {}),
            [SPELL_AURA_META_KEY]: mergeMobileAuraReminderMetadata(
              metadata,
              desired.reminderUpdate,
            ),
          };
        }
      });
    },
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
  });
}

async function reconcileSpellAuras() {
  const sceneEpoch = currentSceneEpoch();
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const [items, sceneMetadata, dpiValue, scale] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata().catch(() => ({})),
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getScale().catch(() => ({
      parsed: { multiplier: 1.5, unit: "m" },
    })),
  ]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const auras = collectActiveMobileAuras(items, {
    metaKey: META_KEY,
    spellsKey: SPELLS_META_KEY,
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = sceneMetadata?.[STATE_KEY]?.order || [];
  const orderedIds = new Set(order.map((id) => String(id || "").split("::p")[0]));
  const creatures = items.filter((item) => trackedCreature(item, orderedIds));
  const requiredIds = new Set([
    ...creatures.map((item) => item.id),
    ...auras.map((aura) => aura.casterId),
  ]);
  const boundedItems = [...requiredIds]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const boundsResult = await sceneItemBounds.load(boundedItems);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!boundsResult.complete) {
    scheduleSpellAuraRecovery();
    return;
  }
  const boundsById = boundsResult.boundsById;
  const candidates = creatures.map((item) => ({
    item,
    bounds: boundsById.get(item.id),
  }));
  const dpi = Math.max(1, Number(dpiValue) || 150);
  const gridScale = {
    multiplier: Number(scale?.parsed?.multiplier) || 1.5,
    unit: String(scale?.parsed?.unit || "m"),
  };
  const operations = [];
  const desiredVisuals = [];
  const existingAuraVisualByInstance = new Map(
    items
      .filter((item) => item?.metadata?.[SPELL_AURA_META_KEY]?.instanceId)
      .map((item) => [
        String(item.metadata[SPELL_AURA_META_KEY].instanceId),
        item,
      ]),
  );
  const newTriggerNotices = [];

  for (const aura of auras) {
    const caster = byId.get(aura.casterId);
    const casterBounds = boundsById.get(aura.casterId);
    const center = boundsCenter(casterBounds);
    if (!caster || !center) continue;
    const sizeCells = spellAreaGridCells(aura.rule.geometry.size, gridScale);
    if (!sizeCells) continue;
    const gridOrigin = point(
      await OBR.scene.grid.snapPosition(center, 1, true, false).catch(() => center)
    ) || center;
    const area = buildArea(
      aura.rule.geometry.shape,
      center,
      { x: center.x + sizeCells * dpi, y: center.y },
      dpi,
      gridOrigin,
    );
    const desiredTargetIds = mobileAuraTargetIds({
      aura,
      area,
      candidates,
      metaKey: META_KEY,
    });
    operations.push(...mobileAuraMembershipPlan({
      aura,
      desiredTargetIds,
      items,
      metaKey: META_KEY,
      sourceName: caster.name || "",
    }).operations);
    const reminderUpdate = planMobileAuraReminder({
      aura,
      auraItem: existingAuraVisualByInstance.get(aura.instanceId) || null,
      desiredTargetIds,
      initiativeState: sceneMetadata?.[STATE_KEY] || {},
      itemsById: byId,
      areaPosition: center,
    });
    newTriggerNotices.push(...reminderUpdate.notices);
    desiredVisuals.push({
      aura,
      center,
      caster,
      dpi,
      sizeCells,
      reminderUpdate,
    });
  }

  const activeInstanceIds = auras.map((aura) => aura.instanceId);
  const auraEffectIds = SPELL_AREA_RULES
    .filter((rule) => rule.kind === "aura")
    .map((rule) => rule.effectPolicy?.effect?.id)
    .filter(Boolean);
  const staleRemovals = staleMobileAuraEffectRemovals(items, {
    activeInstanceIds,
    auraEffectIds,
    metaKey: META_KEY,
  });
  if (staleRemovals.length) {
    operations.unshift({
      type: "condition:remove-instances",
      removals: staleRemovals,
    });
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (operations.length) await queueSpellAreaEffectsMutation(operations);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  await reconcileAuraVisuals(desiredVisuals, sceneEpoch);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (newTriggerNotices.length) {
    void sendProjectedReminderPayload(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerNotices.map((notice) => notice.activationId),
        notices: newTriggerNotices,
      },
    ).catch((error) => {
      console.warn("[spell-aura] trigger notice:", error?.message || error);
    });
  }
}

function scheduleSpellAuraRecovery() {
  if (!mounted || recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    requestSpellAuraReconcile();
  }, RECONCILE_RECOVERY_DELAY_MS);
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (requested) {
      requested = false;
      try {
        await reconcileSpellAuras();
      } catch (error) {
        console.error("[spell-aura] reconcile:", error);
        scheduleSpellAuraRecovery();
      }
    }
  } finally {
    running = false;
  }
}

export function requestSpellAuraReconcile() {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  requested = true;
  if (running || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void pump();
  }, RECONCILE_DELAY_MS);
}

export async function mountSpellAuraController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => requestSpellAuraReconcile(),
    {
      domains: ["aura"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeGrid = OBR.scene.grid.onChange(() => {
    sceneItemBounds.clear();
    requestSpellAuraReconcile();
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      sceneItemBounds.clear();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      return;
    }
    requestSpellAuraReconcile();
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange(
    requestSpellAuraReconcile,
  );
  requestSpellAuraReconcile();
  return true;
}

export function unmountSpellAuraController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeGrid?.();
  unsubscribeGrid = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  sceneItemBounds.clear();
  requested = false;
  mounted = false;
}

globalThis.__tbpSpellAuraController = {
  request: requestSpellAuraReconcile,
  state: () => ({ mounted, running, requested }),
};
