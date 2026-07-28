import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { formatDistance } from "./distance3dCore.js";
import { readElevation } from "./distance3d.js";

const LABEL_OWNER_META = `${ID}/elevationLabelOf`;
const LABEL_LAYOUT_META = `${ID}/elevationLabelLayout`;
const HP_BAR_META = `${ID}/hpbar`;
const LABEL_LAYOUT_VERSION = 5;
const LABEL_HEIGHT = 21;
const LABEL_BAR_GAP = 3;
const MAX_VIEW_SCALE = 1.35;
let mounted = false;
let running = false;
let queued = false;
let timer = 0;

function labelText(elevation, unit) {
  const arrow = elevation > 0 ? "\u25B2" : "\u25BC";
  const suffix = unit ? ` ${unit}` : "";
  return `${arrow} ${formatDistance(Math.abs(elevation), 2)}${suffix}`;
}

function labelSpec(token, elevation, unit, hpBar) {
  const width = Math.max(54, Math.min(118, 26 + labelText(elevation, unit).length * 6.5));
  if (hpBar) {
    return {
      text: labelText(elevation, unit),
      width,
      x: Math.round(Number(hpBar.position?.x) || 0),
      y: Math.round((Number(hpBar.position?.y) || 0) - LABEL_HEIGHT - LABEL_BAR_GAP),
      color: "#111827",
    };
  }
  const scaleX = Math.abs(Number(token.scale?.x)) || 1;
  const scaleY = Math.abs(Number(token.scale?.y)) || 1;
  const tokenWidth = Math.max(1, (Number(token.width) || 70) * scaleX);
  const tokenHeight = Math.max(1, (Number(token.height) || 70) * scaleY);
  const diameter = Math.min(tokenWidth, tokenHeight);
  const left = Number(token.position?.x || 0) - tokenWidth / 2;
  const top = Number(token.position?.y || 0) - tokenHeight / 2;
  const radius = diameter / 2;
  const concentrationX = left + radius * (0.9 - Math.SQRT1_2);
  return {
    text: labelText(elevation, unit),
    width,
    x: Math.round(concentrationX - width / 2),
    y: Math.round(top + diameter * 0.76),
    color: "#111827",
  };
}

function differs(label, spec, tokenId) {
  return label.attachedTo !== tokenId ||
    label.position?.x !== spec.x || label.position?.y !== spec.y ||
    label.text?.plainText !== spec.text ||
    label.text?.width !== spec.width || label.text?.height !== LABEL_HEIGHT ||
    label.style?.backgroundColor !== spec.color ||
    label.metadata?.[LABEL_LAYOUT_META] !== LABEL_LAYOUT_VERSION;
}

async function reconcileElevationLabels() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const [items, scale] = await Promise.all([
      OBR.scene.items.getItems(),
      OBR.scene.grid.getScale().catch(() => ({ parsed: { unit: "" } })),
    ]);
    const unit = String(scale?.parsed?.unit || "").trim();
    const tokens = items.filter((item) => item.layer === "CHARACTER" && !item.attachedTo);
    const tokensById = new Map(tokens.map((item) => [item.id, item]));
    const labels = items.filter((item) => item.type === "LABEL" && item.metadata?.[LABEL_OWNER_META]);
    const labelsByOwner = new Map(labels.map((item) => [item.metadata[LABEL_OWNER_META], item]));
    const hpBarsByOwner = new Map(items
      .filter((item) => item.metadata?.[HP_BAR_META]?.kind === "bg")
      .map((item) => [item.metadata[HP_BAR_META].targetId, item]));
    const removeIds = [];
    const addItems = [];
    const updates = new Map();

    for (const label of labels) {
      const token = tokensById.get(label.metadata?.[LABEL_OWNER_META]);
      if (!token || readElevation(token) === 0) removeIds.push(label.id);
    }

    for (const token of tokens) {
      const elevation = readElevation(token);
      if (elevation === 0) continue;
      const spec = labelSpec(token, elevation, unit, hpBarsByOwner.get(token.id));
      const current = labelsByOwner.get(token.id);
      if (!current) {
        const label = buildLabel()
          .plainText(spec.text)
          .position({ x: spec.x, y: spec.y })
          .width(spec.width).height(LABEL_HEIGHT)
          .padding(0)
          .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
          .fontSize(13).fontWeight(700).lineHeight(1)
          .textAlign("CENTER").textAlignVertical("MIDDLE")
          .fillColor("#f8fafc").strokeColor("rgba(2,6,23,.75)").strokeWidth(1)
          .backgroundColor(spec.color).backgroundOpacity(0.86)
          .cornerRadius(LABEL_HEIGHT / 2).pointerWidth(0).pointerHeight(0)
          .pointerDirection("LEFT").maxViewScale(MAX_VIEW_SCALE)
          .attachedTo(token.id).layer("TEXT")
          .name(`Quota: ${token.name || "Token"}`)
          .metadata({
            [LABEL_OWNER_META]: token.id,
            [LABEL_LAYOUT_META]: LABEL_LAYOUT_VERSION,
          })
          .build();
        label.locked = true;
        label.disableHit = true;
        label.zIndex = 220010;
        addItems.push(label);
      } else if (differs(current, spec, token.id)) {
        updates.set(current.id, { tokenId: token.id, spec });
      }
    }

    if (removeIds.length) await OBR.scene.items.deleteItems(removeIds);
    if (addItems.length) await OBR.scene.items.addItems(addItems);
    if (updates.size) {
      await OBR.scene.items.updateItems(Array.from(updates.keys()), (draft) => {
        for (const label of draft) {
          const next = updates.get(label.id);
          if (!next) continue;
          const { tokenId, spec } = next;
          label.attachedTo = tokenId;
          label.position = { x: spec.x, y: spec.y };
          label.locked = true;
          label.disableHit = true;
          label.layer = "TEXT";
          label.zIndex = 220010;
          label.style = label.style || {};
          label.style.backgroundColor = spec.color;
          label.style.backgroundOpacity = 0.86;
          label.style.cornerRadius = LABEL_HEIGHT / 2;
          label.style.pointerWidth = 0;
          label.style.pointerHeight = 0;
          label.style.pointerDirection = "LEFT";
          label.style.maxViewScale = MAX_VIEW_SCALE;
          label.text = label.text || {};
          label.text.type = "PLAIN";
          label.text.plainText = spec.text;
          label.text.width = spec.width;
          label.text.height = LABEL_HEIGHT;
          label.text.style = label.text.style || {};
          label.text.style.padding = 0;
          label.text.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
          label.text.style.fontSize = 13;
          label.text.style.fontWeight = 700;
          label.text.style.lineHeight = 1;
          label.text.style.textAlign = "CENTER";
          label.text.style.textAlignVertical = "MIDDLE";
          label.metadata = {
            ...(label.metadata || {}),
            [LABEL_OWNER_META]: tokenId,
            [LABEL_LAYOUT_META]: LABEL_LAYOUT_VERSION,
          };
        }
      });
    }
  } catch (error) {
    console.warn("[elevation-label] reconcile:", error);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      scheduleElevationLabels();
    }
  }
}

function scheduleElevationLabels() {
  clearTimeout(timer);
  timer = setTimeout(() => void reconcileElevationLabels(), 80);
}

export function mountElevationLabelWatcher() {
  if (mounted) return;
  mounted = true;
  void OBR.player.getRole().then((role) => {
    if (role !== "GM") return;
    OBR.scene.items.onChange(scheduleElevationLabels);
    OBR.scene.grid.onChange(scheduleElevationLabels);
    scheduleElevationLabels();
  }).catch(() => {});
}
