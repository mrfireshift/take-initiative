import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
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

export { SPELL_AURA_META_KEY } from "./spellAuraCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const STATE_KEY = `${ID}/state`;
const RECONCILE_DELAY_MS = 60;

let mounted = false;
let running = false;
let requested = false;
let timer = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;

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
    .layer("ATTACHMENT")
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

async function itemBounds(items) {
  const entries = await Promise.all(items.map(async (item) => {
    try {
      return [item.id, await OBR.scene.items.getItemBounds([item.id])];
    } catch {
      return [item.id, null];
    }
  }));
  return new Map(entries);
}

async function reconcileAuraVisuals(items, desiredVisuals) {
  const existing = items.filter((item) => item?.metadata?.[SPELL_AURA_META_KEY]);
  const byInstance = new Map();
  for (const item of existing) {
    const instanceId = String(
      item.metadata[SPELL_AURA_META_KEY]?.instanceId || ""
    ).trim();
    if (!byInstance.has(instanceId)) byInstance.set(instanceId, []);
    byInstance.get(instanceId).push(item);
  }

  const desiredIds = new Set(desiredVisuals.map((entry) => entry.aura.instanceId));
  const deleteIds = [];
  const additions = [];
  const metadataUpdates = new Map();
  for (const item of existing) {
    const instanceId = String(
      item.metadata[SPELL_AURA_META_KEY]?.instanceId || ""
    ).trim();
    if (!desiredIds.has(instanceId)) deleteIds.push(item.id);
  }
  for (const desired of desiredVisuals) {
    const matches = byInstance.get(desired.aura.instanceId) || [];
    const style = spellAreaStyle(desired.aura.spellId, loadAoEStyle());
    const expected = auraVisualMetadata(
      desired.aura,
      desired.dpi,
      desired.sizeCells,
      style,
    );
    const keeper = matches.find((item) => {
      const actual = item.metadata?.[SPELL_AURA_META_KEY] || {};
      return item.attachedTo === desired.aura.casterId
        && actual.ruleId === expected.ruleId
        && Number(actual.dpi) === expected.dpi
        && Number(actual.sizeCells) === expected.sizeCells
        && actual.fillColor === expected.fillColor
        && actual.strokeColor === expected.strokeColor;
    });
    deleteIds.push(...matches.filter((item) => item !== keeper).map((item) => item.id));
    if (!keeper) additions.push(buildAuraVisual(desired));
    else if (desired.reminderUpdate?.changed) {
      metadataUpdates.set(keeper.id, desired.reminderUpdate);
    }
  }

  const uniqueDeleteIds = [...new Set(deleteIds.filter(Boolean))];
  if (uniqueDeleteIds.length) await OBR.scene.items.deleteItems(uniqueDeleteIds);
  if (additions.length) await OBR.scene.items.addItems(additions);
  if (metadataUpdates.size) {
    await OBR.scene.items.updateItems([...metadataUpdates.keys()], (drafts) => {
      for (const item of drafts) {
        const update = metadataUpdates.get(item.id);
        const metadata = item.metadata?.[SPELL_AURA_META_KEY];
        if (!update || !metadata) continue;
        item.metadata = {
          ...(item.metadata || {}),
          [SPELL_AURA_META_KEY]: mergeMobileAuraReminderMetadata(
            metadata,
            update,
          ),
        };
      }
    });
  }
}

async function reconcileSpellAuras() {
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const [items, sceneMetadata, dpiValue, scale] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata().catch(() => ({})),
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getScale().catch(() => ({
      parsed: { multiplier: 1.5, unit: "m" },
    })),
  ]);
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
  const boundsById = await itemBounds(boundedItems);
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
  if (operations.length) await queueSpellAreaEffectsMutation(operations);
  await reconcileAuraVisuals(items, desiredVisuals);
  if (newTriggerNotices.length) {
    void OBR.broadcast.sendMessage(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerNotices.map((notice) => notice.activationId),
        notices: newTriggerNotices,
      },
      { destination: "ALL" },
    ).catch((error) => {
      console.warn("[spell-aura] trigger notice:", error?.message || error);
    });
  }
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
      }
    }
  } finally {
    running = false;
  }
}

export function requestSpellAuraReconcile() {
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
  unsubscribeItems = OBR.scene.items.onChange(requestSpellAuraReconcile);
  unsubscribeGrid = OBR.scene.grid.onChange(requestSpellAuraReconcile);
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (ready) requestSpellAuraReconcile();
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
  requested = false;
  mounted = false;
}

globalThis.__tbpSpellAuraController = {
  request: requestSpellAuraReconcile,
  state: () => ({ mounted, running, requested }),
};
