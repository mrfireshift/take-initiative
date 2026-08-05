import OBR from "@owlbear-rodeo/sdk";
import {
  TRACKER_POPOVER_ID,
  setCompactTrackerManualWidth,
} from "./trackerPopover.js";
import { compactTrackerManualResizeWidth } from "./trackerCompactSizingCore.js";

const STYLE_ID = "tbp-compact-resize-style";

function mountResizeStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tbp-compact-resize-handle {
      position: absolute;
      top: 12px;
      bottom: 12px;
      z-index: 50;
      display: none;
      width: 12px;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: ew-resize;
      touch-action: none;
    }
    .tbp-root[data-tracker-layout="compact"] > .tbp-compact-resize-handle {
      display: block;
    }
    .tbp-compact-resize-handle[data-resize-side="left"] { left: 0; }
    .tbp-compact-resize-handle[data-resize-side="right"] { right: 0; }
    .tbp-compact-resize-handle::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 2px;
      height: 34px;
      border-radius: 999px;
      background: rgba(148, 163, 184, .22);
      transform: translate(-50%, -50%);
      transition: background-color .12s ease, box-shadow .12s ease;
    }
    .tbp-compact-resize-handle:hover::after,
    .tbp-compact-resize-handle:focus-visible::after,
    .tbp-compact-resize-handle[data-resizing="1"]::after {
      background: rgba(96, 165, 250, .88);
      box-shadow: 0 0 8px rgba(59, 130, 246, .55);
    }
  `;
  document.head.appendChild(style);
}

function pointerX(event) {
  return Number.isFinite(event.screenX) ? event.screenX : event.clientX;
}

export function mountCompactTrackerResizeHandles({
  container,
  isCompact,
  onResizeStart,
  onAutoFitRequest,
}) {
  mountResizeStyle();
  container.style.position = "relative";

  let session = null;
  let resizeFrame = 0;
  let pendingWidth = null;

  const requestWidth = (width) => {
    const nextWidth = setCompactTrackerManualWidth(width);
    if (!nextWidth) return;
    pendingWidth = nextWidth;
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const requestedWidth = pendingWidth;
      pendingWidth = null;
      if (!requestedWidth || !isCompact()) return;
      void OBR.popover.setWidth(TRACKER_POPOVER_ID, requestedWidth).catch(() => {});
    });
  };

  const mountHandle = (side) => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "tbp-compact-resize-handle";
    handle.dataset.resizeSide = side;
    handle.dataset.cardSelectionIgnore = "1";
    handle.title = "Trascina per ridimensionare. Doppio click per ripristinare l'adattamento automatico";
    handle.setAttribute("aria-label", handle.title);

    handle.addEventListener("pointerdown", (event) => {
      if (!isCompact() || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startWidth = Number(document.documentElement.clientWidth) || window.innerWidth || 320;
      session = {
        pointerId: event.pointerId,
        side,
        startX: pointerX(event),
        startWidth,
        viewportWidth: startWidth + 32,
        started: false,
      };
      const startedSession = session;
      handle.dataset.resizing = "1";
      handle.setPointerCapture?.(event.pointerId);
      void OBR.viewport.getWidth().then((viewportWidth) => {
        if (session !== startedSession) return;
        session.viewportWidth = Number(viewportWidth) || session.viewportWidth;
      }).catch(() => {});
    });

    handle.addEventListener("pointermove", (event) => {
      if (!session || session.pointerId !== event.pointerId || session.side !== side) return;
      event.preventDefault();
      const delta = pointerX(event) - session.startX;
      if (Math.abs(delta) < 1) return;
      if (!session.started) {
        session.started = true;
        onResizeStart?.();
      }
      requestWidth(compactTrackerManualResizeWidth(
        session.startWidth,
        delta,
        side,
        session.viewportWidth,
      ));
    });

    const finishResize = (event) => {
      if (session?.pointerId !== event.pointerId) return;
      session = null;
      delete handle.dataset.resizing;
      if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    };
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    handle.addEventListener("lostpointercapture", (event) => {
      if (session?.pointerId !== event.pointerId) return;
      session = null;
      delete handle.dataset.resizing;
    });
    handle.addEventListener("dblclick", (event) => {
      if (!isCompact()) return;
      event.preventDefault();
      event.stopPropagation();
      setCompactTrackerManualWidth(null);
      onAutoFitRequest?.();
    });
    return handle;
  };

  container.append(mountHandle("left"), mountHandle("right"));
}
