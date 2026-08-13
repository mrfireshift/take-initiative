import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const EFFECTS_HOVER_TOOL_ID = `${ID}/effects-hover-tool`;
const EFFECTS_HOVER_MODE_ID = `${ID}/effects-hover-mode`;
const HOVER_DELAY_MS = 110;
const HOVER_EXIT_DELAY_MS = 80;

let mounted = false;
let onHoverTargetChange = null;
let scheduledTargetId = "";
let hoverTimer = null;

function normalizeTargetId(value) {
  return String(value || "").trim();
}

function targetIdFromEvent(event) {
  const target = event?.target;
  const meta = target?.metadata?.[META_KEY];
  return target?.id && meta && typeof meta === "object"
    ? String(target.id)
    : "";
}

function scheduleHoverTarget(targetId) {
  const nextTargetId = normalizeTargetId(targetId);
  if (nextTargetId === scheduledTargetId && hoverTimer !== null) return;
  if (nextTargetId === scheduledTargetId && hoverTimer === null) return;

  scheduledTargetId = nextTargetId;
  if (hoverTimer !== null) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    onHoverTargetChange?.(scheduledTargetId);
  }, nextTargetId ? HOVER_DELAY_MS : HOVER_EXIT_DELAY_MS);
}

function clearHoverTarget({ notify = true } = {}) {
  const hadTarget = !!scheduledTargetId;
  if (hoverTimer !== null) clearTimeout(hoverTimer);
  hoverTimer = null;
  scheduledTargetId = "";
  if (notify && hadTarget) onHoverTargetChange?.("");
}

function modeDefinition() {
  return {
    id: EFFECTS_HOVER_MODE_ID,
    icons: [{
      icon: "/conditions-panel.svg",
      label: "Anteprima effetti",
      filter: { activeTools: [EFFECTS_HOVER_TOOL_ID] },
    }],
    onToolMove: (_context, event) => {
      scheduleHoverTarget(targetIdFromEvent(event));
    },
    onToolClick: (_context, event) => !!event?.target,
    onToolDoubleClick: (_context, event) => !!event?.target,
    onDeactivate: clearHoverTarget,
  };
}

export async function mountEffectsHoverTool(callback) {
  if (mounted) return true;
  mounted = true;
  onHoverTargetChange = typeof callback === "function" ? callback : null;
  clearHoverTarget({ notify: false });

  try {
    try { await OBR.tool.removeMode(EFFECTS_HOVER_MODE_ID); } catch {}
    try { await OBR.tool.remove(EFFECTS_HOVER_TOOL_ID); } catch {}
    await OBR.tool.create({
      id: EFFECTS_HOVER_TOOL_ID,
      icons: [{ icon: "/conditions.svg", label: "Ispeziona effetti" }],
      defaultMode: EFFECTS_HOVER_MODE_ID,
    });
    await OBR.tool.createMode(modeDefinition());
    return true;
  } catch (error) {
    clearHoverTarget({ notify: false });
    onHoverTargetChange = null;
    mounted = false;
    try { await OBR.tool.removeMode(EFFECTS_HOVER_MODE_ID); } catch {}
    try { await OBR.tool.remove(EFFECTS_HOVER_TOOL_ID); } catch {}
    throw error;
  }
}

export async function unmountEffectsHoverTool() {
  clearHoverTarget({ notify: false });
  onHoverTargetChange = null;
  mounted = false;
  try { await OBR.tool.removeMode(EFFECTS_HOVER_MODE_ID); } catch {}
  try { await OBR.tool.remove(EFFECTS_HOVER_TOOL_ID); } catch {}
}
