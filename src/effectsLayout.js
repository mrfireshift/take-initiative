import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getConditionWidgetLayoutParts } from "./conditions.js";
import { effectsDiagnostics } from "./effectsDiagnostics.js";
import {
  EFFECTS_LAYOUT_CONFIG,
  planEffectsLayout,
  planEffectsWidgetDiff,
} from "./effectsLayoutCore.js";
import { getSpellWidgetLayoutData } from "./spells-tag.js";

const META_KEY = `${ID}/meta`;

const COND_WIDGET_META = `${ID}/condWidgetOf`;
const COND_WIDGET_KEY_META = `${ID}/condWidgetKey`;
const COND_WIDGET_LAYOUT_META = `${ID}/condWidgetLayout`;
const COND_WIDGET_LAYOUT_VERSION = 2;

const CONC_WIDGET_META = `${ID}/concWidgetOf`;
const CONC_WIDGET_KEY = `${ID}/concWidgetKey`;
const CONC_WIDGET_CASTER = `${ID}/concWidgetCaster`;
const CONC_LABEL_HASHKEY = `${ID}/concLabelHash`;
const CONC_DOT_LAYOUT_KEY = `${ID}/concDotLayout`;
const CONC_DOT_LAYOUT_VERSION = 9;
const CONC_LABEL_LAYOUT_KEY = `${ID}/concLabelLayout`;
const CONC_LABEL_LAYOUT_VERSION = 2;

const DOT_BG_NAME = "Concentrazione (bg)";
const DOT_TEXT_NAME = "Concentrazione (C)";
const LABEL_BG_NAME = "Concentrazione (label bg)";

let measureContext = null;
let reconcileRevision = 0;
let sceneGridDpi = null;

export function setEffectsLayoutGridDpi(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return false;
  const next = Math.max(1, raw);
  const changed = sceneGridDpi !== next;
  sceneGridDpi = next;
  return changed;
}

async function getEffectsLayoutGridDpi() {
  if (Number.isFinite(sceneGridDpi)) return sceneGridDpi;
  try {
    setEffectsLayoutGridDpi(await OBR.scene.grid.getDpi());
  } catch {
    setEffectsLayoutGridDpi(70);
  }
  return sceneGridDpi;
}

function measureTextWidth(text, fontSize, fontWeight) {
  try {
    measureContext ||= document.createElement("canvas").getContext("2d");
    if (measureContext) {
      measureContext.font = `${fontWeight} ${fontSize}px ${EFFECTS_LAYOUT_CONFIG.fontFamily}`;
      return Math.ceil(measureContext.measureText(String(text || "")).width);
    }
  } catch {}
  return Math.ceil(String(text || "").length * fontSize * 0.55);
}

function hash32(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function spellLabelHash(spec) {
  return hash32(`${spec.text}|${spec.width}|${spec.fontSize}|${spec.height}`);
}

function normalizeToken(item) {
  const pluginMeta = item?.metadata?.[META_KEY];
  if (!item?.id || !pluginMeta || typeof pluginMeta !== "object") return null;
  const spells = getSpellWidgetLayoutData(item);
  return {
    id: item.id,
    position: item.position,
    width: item.width,
    height: item.height,
    image: item.image,
    grid: item.grid,
    scale: item.scale,
    conditionParts: getConditionWidgetLayoutParts(pluginMeta.conditions || {}),
    concentrationKey: spells.concentrationKey,
    spellEntries: spells.spellEntries,
    assignments: spells.assignments,
  };
}

function classifyExistingWidget(item) {
  const conditionTarget = item?.metadata?.[COND_WIDGET_META];
  if (conditionTarget) {
    const key = String(item.metadata?.[COND_WIDGET_KEY_META] || "").trim();
    return {
      item,
      identity: key ? `condition|${conditionTarget}|${key}` : null,
      valid: !!key && item.type === "LABEL" &&
        item.metadata?.[COND_WIDGET_LAYOUT_META] === COND_WIDGET_LAYOUT_VERSION,
    };
  }

  const targetId = item?.metadata?.[CONC_WIDGET_META];
  const casterId = item?.metadata?.[CONC_WIDGET_CASTER];
  if (!targetId && !casterId) return null;

  if (!casterId && (item.name === DOT_BG_NAME || item.name === DOT_TEXT_NAME)) {
    return {
      item,
      identity: targetId ? `dot|${targetId}` : null,
      valid: !!targetId && item.type === "LABEL" && item.name === DOT_TEXT_NAME &&
        item.text?.plainText === "C" &&
        item.metadata?.[CONC_DOT_LAYOUT_KEY] === CONC_DOT_LAYOUT_VERSION,
    };
  }

  const key = String(item?.metadata?.[CONC_WIDGET_KEY] || "").trim().toLowerCase();
  return {
    item,
    identity: targetId && casterId && key ? `spell|${targetId}|${casterId}|${key}` : null,
    valid: !!targetId && !!casterId && !!key && item.type === "LABEL" &&
      item.name === LABEL_BG_NAME &&
      item.metadata?.[CONC_LABEL_LAYOUT_KEY] === CONC_LABEL_LAYOUT_VERSION,
  };
}

function isEffectsWidgetItem(item) {
  return !!item?.metadata?.[COND_WIDGET_META] || !!item?.metadata?.[CONC_WIDGET_META];
}

function commonLabelNeedsUpdate(item, spec) {
  const text = item.text || {};
  const textStyle = text.style || {};
  const style = item.style || {};
  return item.type !== "LABEL" ||
    item.attachedTo !== spec.targetId ||
    item.layer !== "TEXT" ||
    item.locked !== true ||
    item.disableHit !== true ||
    item.position?.x !== spec.x ||
    item.position?.y !== spec.y ||
    text.width !== spec.width ||
    text.height !== spec.height ||
    text.type !== "PLAIN" ||
    text.plainText !== spec.text ||
    style.backgroundColor !== spec.backgroundColor ||
    style.backgroundOpacity !== spec.backgroundOpacity ||
    style.cornerRadius !== spec.height / 2 ||
    style.maxViewScale !== spec.maxViewScale ||
    style.pointerWidth !== 0 ||
    style.pointerHeight !== 0 ||
    style.pointerDirection !== spec.pointerDirection ||
    textStyle.padding !== 0 ||
    textStyle.fontFamily !== spec.fontFamily ||
    textStyle.fontSize !== spec.fontSize ||
    textStyle.fontWeight !== spec.fontWeight ||
    textStyle.lineHeight !== spec.lineHeight ||
    textStyle.textAlign !== "CENTER" ||
    textStyle.textAlignVertical !== "MIDDLE" ||
    textStyle.fillColor !== spec.textFill ||
    textStyle.fillOpacity !== 1 ||
    textStyle.strokeColor !== spec.textStroke ||
    textStyle.strokeWidth !== spec.textStrokeWidth ||
    item.zIndex !== spec.zIndex;
}

function widgetNeedsUpdate(item, spec) {
  if (spec.kind === "dot") {
    // Le coordinate del badge sono relative all'attachment dopo la creazione.
    // Riscriverle a ogni ciclo fa traslare i badge già esistenti in Owlbear.
    return item.attachedTo !== spec.targetId ||
      item.layer !== "TEXT" ||
      item.locked !== true ||
      item.disableHit !== true ||
      item.metadata?.[CONC_WIDGET_KEY] !== spec.key ||
      item.style?.backgroundColor !== spec.backgroundColor ||
      item.style?.backgroundOpacity !== 1 ||
      item.zIndex !== spec.zIndex;
  }
  if (commonLabelNeedsUpdate(item, spec)) return true;
  return spec.kind === "spell" && item.metadata?.[CONC_LABEL_HASHKEY] !== spellLabelHash(spec);
}

function isConditionLikeSpec(spec) {
  return spec.kind === "condition" || spec.kind === "spell-effect";
}

function metadataForSpec(spec) {
  if (isConditionLikeSpec(spec)) {
    return {
      [COND_WIDGET_META]: spec.targetId,
      [COND_WIDGET_KEY_META]: spec.key,
      [COND_WIDGET_LAYOUT_META]: COND_WIDGET_LAYOUT_VERSION,
    };
  }
  if (spec.kind === "dot") {
    return {
      [CONC_WIDGET_META]: spec.targetId,
      [CONC_WIDGET_KEY]: spec.key,
      [CONC_DOT_LAYOUT_KEY]: CONC_DOT_LAYOUT_VERSION,
    };
  }
  return {
    [CONC_WIDGET_META]: spec.targetId,
    [CONC_WIDGET_KEY]: spec.key,
    [CONC_WIDGET_CASTER]: spec.casterId,
    [CONC_LABEL_HASHKEY]: spellLabelHash(spec),
    [CONC_LABEL_LAYOUT_KEY]: CONC_LABEL_LAYOUT_VERSION,
  };
}

function nameForSpec(spec) {
  if (isConditionLikeSpec(spec)) {
    return `${spec.kind === "spell-effect" ? "Effetto spell" : "Condizione"}: ${spec.text} (bg)`;
  }
  if (spec.kind === "dot") return DOT_TEXT_NAME;
  return LABEL_BG_NAME;
}

function buildWidget(spec) {
  const widget = buildLabel()
    .plainText(spec.text)
    .position({ x: spec.x, y: spec.y })
    .width(spec.width)
    .height(spec.height)
    .padding(0)
    .fontFamily(spec.fontFamily)
    .fontSize(spec.fontSize)
    .fontWeight(spec.fontWeight)
    .lineHeight(spec.lineHeight)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .fillColor(spec.textFill)
    .strokeColor(spec.textStroke)
    .strokeWidth(spec.textStrokeWidth)
    .backgroundColor(spec.backgroundColor)
    .backgroundOpacity(spec.backgroundOpacity)
    .cornerRadius(spec.height / 2)
    .pointerWidth(0)
    .pointerHeight(0)
    .pointerDirection(spec.pointerDirection)
    .maxViewScale(spec.maxViewScale)
    .attachedTo(spec.targetId)
    .layer("TEXT")
    .name(nameForSpec(spec))
    .metadata(metadataForSpec(spec))
    .build();
  widget.locked = true;
  widget.disableHit = true;
  widget.zIndex = spec.zIndex;
  return widget;
}

function applySpec(item, spec) {
  item.locked = true;
  item.disableHit = true;
  item.attachedTo = spec.targetId;
  item.layer = "TEXT";
  item.zIndex = spec.zIndex;
  item.metadata = { ...(item.metadata || {}), ...metadataForSpec(spec) };
  item.style = item.style || {};
  item.style.backgroundColor = spec.backgroundColor;
  item.style.backgroundOpacity = spec.backgroundOpacity;

  if (spec.kind === "dot") return;

  item.position = { x: spec.x, y: spec.y };
  item.style.cornerRadius = spec.height / 2;
  item.style.maxViewScale = spec.maxViewScale;
  item.style.pointerWidth = 0;
  item.style.pointerHeight = 0;
  item.style.pointerDirection = spec.pointerDirection;
  item.text = item.text || {};
  item.text.type = "PLAIN";
  item.text.plainText = spec.text;
  item.text.width = spec.width;
  item.text.height = spec.height;
  item.text.style = item.text.style || {};
  item.text.style.padding = 0;
  item.text.style.fontFamily = spec.fontFamily;
  item.text.style.fontSize = spec.fontSize;
  item.text.style.fontWeight = spec.fontWeight;
  item.text.style.lineHeight = spec.lineHeight;
  item.text.style.textAlign = "CENTER";
  item.text.style.textAlignVertical = "MIDDLE";
  item.text.style.fillColor = spec.textFill;
  item.text.style.fillOpacity = 1;
  item.text.style.strokeColor = spec.textStroke;
  item.text.style.strokeWidth = spec.textStrokeWidth;
}

async function sdkGetSceneItems(session) {
  effectsDiagnostics.sdkCall(session, "getItems");
  try {
    const items = await OBR.scene.items.getItems();
    effectsDiagnostics.sdkResult(session, "getItems", { returnedItems: items.length });
    return items;
  } catch (error) {
    effectsDiagnostics.sdkError(session, "getItems");
    throw error;
  }
}

async function sdkGetLocalWidgets(session) {
  effectsDiagnostics.sdkCall(session, "getItems");
  try {
    const items = await OBR.scene.local.getItems(isEffectsWidgetItem);
    effectsDiagnostics.sdkResult(session, "getItems", { returnedItems: items.length });
    return items;
  } catch (error) {
    effectsDiagnostics.sdkError(session, "getItems");
    throw error;
  }
}

async function sdkDeleteLocalItems(session, itemIds) {
  if (!itemIds.length) return;
  effectsDiagnostics.sdkCall(session, "deleteItems", { requestedItems: itemIds.length });
  try {
    await OBR.scene.local.deleteItems(itemIds);
    effectsDiagnostics.widgetMutation(session, "deleted", itemIds.length);
  } catch (error) {
    effectsDiagnostics.sdkError(session, "deleteItems");
    throw error;
  }
}

async function sdkAddLocalItems(session, items) {
  if (!items.length) return;
  effectsDiagnostics.sdkCall(session, "addItems", { requestedItems: items.length });
  try {
    await OBR.scene.local.addItems(items);
    effectsDiagnostics.widgetMutation(session, "added", items.length);
  } catch (error) {
    effectsDiagnostics.sdkError(session, "addItems");
    throw error;
  }
}

async function sdkUpdateLocalItems(session, updates) {
  if (!updates.length) return;
  const specs = new Map(updates.map(({ item, spec }) => [item.id, spec]));
  const items = updates.map(({ item }) => item);
  effectsDiagnostics.sdkCall(session, "updateItems", { requestedItems: items.length });
  try {
    await OBR.scene.local.updateItems(items, (draft) => {
      for (const item of draft) {
        const spec = specs.get(item.id);
        if (spec) applySpec(item, spec);
      }
    });
    effectsDiagnostics.widgetMutation(session, "updated", items.length);
  } catch (error) {
    effectsDiagnostics.sdkError(session, "updateItems");
    throw error;
  }
}

async function sdkDeleteGlobalLegacyWidgets(session, itemIds) {
  if (!itemIds.length) return;
  effectsDiagnostics.sdkCall(session, "deleteItems", { requestedItems: itemIds.length });
  try {
    await OBR.scene.items.deleteItems(itemIds);
    effectsDiagnostics.widgetMutation(session, "deleted", itemIds.length);
    effectsDiagnostics.event("layout:global-legacy-cleanup", {
      reconcileId: session?.id,
      deletedWidgets: itemIds.length,
    });
  } catch (error) {
    effectsDiagnostics.sdkError(session, "deleteItems");
    throw error;
  }
}

export async function cleanupLocalEffectsLayout() {
  const items = await OBR.scene.local.getItems(isEffectsWidgetItem);
  if (items.length) await OBR.scene.local.deleteItems(items.map((item) => item.id));
  return items.length;
}

export async function inspectEffectsLayoutStores() {
  const [globalWidgets, localWidgets] = await Promise.all([
    OBR.scene.items.getItems(isEffectsWidgetItem),
    OBR.scene.local.getItems(isEffectsWidgetItem),
  ]);
  return {
    globalWidgets: globalWidgets.length,
    localWidgets: localWidgets.length,
    globalIds: globalWidgets.map((item) => item.id).sort(),
    localIds: localWidgets.map((item) => item.id).sort(),
  };
}

export async function reconcileEffectsLayout(batch = {}, context = {}) {
  const revision = ++reconcileRevision;
  const requestedIds = new Set([
    ...(Array.isArray(batch.conditions) ? batch.conditions : []),
    ...(Array.isArray(batch.concentration) ? batch.concentration : []),
  ].filter(Boolean));
  const session = effectsDiagnostics.beginReconcile("effects-layout", {
    revision,
    queueRevision: batch.revision,
    targeted: batch.full !== true,
    requestedTokens: requestedIds.size,
  });
  let outcome = "completed";
  let sceneItems = [];
  let localWidgets = [];
  let globalLegacyWidgets = [];
  let tokens = [];
  let desired = [];
  let diff = { additions: [], updates: [], deleteIds: [] };
  let deletedGlobalWidgets = 0;
  let staleRecorded = false;

  const stopIfStale = (stage) => {
    if (!context.isStale?.()) return false;
    outcome = "stale";
    if (!staleRecorded) {
      staleRecorded = true;
      effectsDiagnostics.revisionStale(session, {
        stage,
        queueRevision: batch.revision,
      });
    }
    return true;
  };

  try {
    [sceneItems, localWidgets] = await Promise.all([
      sdkGetSceneItems(session),
      sdkGetLocalWidgets(session),
    ]);
    tokens = sceneItems.map(normalizeToken).filter(Boolean);
    const sceneDpi = await getEffectsLayoutGridDpi();
    desired = planEffectsLayout({ tokens, sceneDpi, measureText: measureTextWidth });
    const existing = localWidgets.map(classifyExistingWidget).filter(Boolean);
    globalLegacyWidgets = sceneItems.map(classifyExistingWidget).filter(Boolean);
    diff = planEffectsWidgetDiff({ desired, existing, needsUpdate: widgetNeedsUpdate });

    if (stopIfStale("before-widget-commit")) return { outcome, desiredWidgets: desired.length };

    if (context.cleanupGlobalWidgets === true) {
      deletedGlobalWidgets = globalLegacyWidgets.length;
      await sdkDeleteGlobalLegacyWidgets(
        session,
        globalLegacyWidgets.map(({ item }) => item.id)
      );
    }
    if (stopIfStale("after-global-cleanup")) return { outcome, desiredWidgets: desired.length };
    await sdkDeleteLocalItems(session, diff.deleteIds);
    if (stopIfStale("after-delete")) return { outcome, desiredWidgets: desired.length };
    await sdkAddLocalItems(session, diff.additions.map(buildWidget));
    if (stopIfStale("after-add")) return { outcome, desiredWidgets: desired.length };
    await sdkUpdateLocalItems(session, diff.updates);
    stopIfStale("after-update");
    if (!deletedGlobalWidgets && !diff.deleteIds.length &&
      !diff.additions.length && !diff.updates.length) {
      if (outcome !== "stale") outcome = "no-change";
    }
  } catch (error) {
    outcome = "failed";
    throw error;
  } finally {
    effectsDiagnostics.finishReconcile(session, {
      outcome,
      scannedItems: sceneItems.length,
      scannedLocalWidgets: localWidgets.length,
      scannedTokens: tokens.length,
      globalLegacyWidgets: globalLegacyWidgets.length,
      deletedGlobalWidgets,
      plannedWidgets: desired.length,
      addedWidgets: diff.additions.length,
      updatedWidgets: diff.updates.length,
      deletedWidgets: diff.deleteIds.length,
    });
  }

  return { outcome, desiredWidgets: desired.length };
}
