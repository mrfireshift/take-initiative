// src/ctx-add.ts
import OBR, { type Theme } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { rememberFactionForIds } from "./factionRegistry.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const META_KEY = `${ID}/meta`;
const DEFAULT_INITIATIVE = 10;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

/* ---------------------- Shim: leggi target del context ---------------------- */
async function getCtxItemsSafe(): Promise<string[]> {
  // Alcune versioni dell’SDK non tipizzano getContext: usiamo "any"
  const cm: any = (OBR as any)?.contextMenu;
  if (cm && typeof cm.getContext === "function") {
    try {
      const ctx = await cm.getContext();
      if (ctx?.items?.length) return ctx.items as string[];
    } catch { /* ignora e fai fallback */ }
  }
  // Fallback: usa la selezione del player
  try {
    return await OBR.player.getSelection();
  } catch {
    return [];
  }
}

/* ----------------------- THEME (identico a ctx-mark) ----------------------- */
export function applyTheme(t: Theme) {
  const text  = t.text?.primary ?? (t.mode === "DARK" ? "#fff" : "#111");
  const hover = t.mode === "DARK" ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
  const r = document.documentElement.style;
  r.setProperty("--obrt-text", text);
  r.setProperty("--obrt-hover", hover);
  document.body.style.color = text;
}

/* ---------------------- Utility: chiusura sicura ---------------------- */
// Forza la chiusura anche quando non c'è selezione attiva:
// 1) seleziona i target del context (se ci sono) → 2) microtask → 3) deseleziona
let __ctxCloseTimer: number | null = null;

async function closeContextMenuSoon() {
  try {
    const ids = await getCtxItemsSafe();
    if (ids.length) {
      await OBR.player.select(ids).catch(() => {});
    }
    await Promise.resolve(); // microtask: lascia finire gli update
    await OBR.player.deselect().catch(() => {});
  } finally {
    if (__ctxCloseTimer !== null) {
      clearTimeout(__ctxCloseTimer);
      __ctxCloseTimer = null;
    }
    __ctxCloseTimer = window.setTimeout(() => {
      __ctxCloseTimer = null;
      void OBR.player.deselect().catch(() => {});
    }, 60);
  }
}

/* --------------------------- Azione principale ------------------------- */
async function addToInitiative(attitude: "ally" | "neutral" | "enemy" | "pc") { // NEW: pc
  const operation = sceneLifecycle.capture({ operationId: `ctx-add:${attitude}:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  // Nel menu embedded fidati del context; se manca, fallback alla selezione
  const ids = await getCtxItemsSafe();
  if (!sceneLifecycle.isCurrent(operation)) return;

  try {
    if (!ids || ids.length === 0) return;

    // Aiuta la chiusura: allinea la selezione per un tick
    await OBR.player.select(ids).catch(() => {});
    if (!sceneLifecycle.isCurrent(operation)) return;

    await OBR.scene.items.updateItems(ids, (items) => {
  for (const it of items) {
    it.metadata = it.metadata || {};
    const prev = (it.metadata as any)[META_KEY] || {};
    (it.metadata as any)[META_KEY] = {
      ...prev,
      initiative: prev.initiative ?? DEFAULT_INITIATIVE,
      attitude,
      inInitiative: true,   // ← chiave: entra in lista anche se “in memoria”
    };
  }
});
    if (!sceneLifecycle.isCurrent(operation)) return;
    await rememberFactionForIds(ids, attitude, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    }).catch(() => {});

  } catch (e) {
    console.warn("[ctx-add] update error:", (e as any)?.message || e);
  } finally {
    await closeContextMenuSoon();
  }
}

/* ------------------------------ Wiring UI ------------------------------ */
function wireUI() {
  const qs = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
  qs('[data-att="ally"]').forEach((el)    => el.addEventListener("click", () => void addToInitiative("ally")));
  qs('[data-att="neutral"]').forEach((el) => el.addEventListener("click", () => void addToInitiative("neutral")));
  qs('[data-att="enemy"]').forEach((el)   => el.addEventListener("click", () => void addToInitiative("enemy")));
  qs('[data-att="pc"]').forEach((el)      => el.addEventListener("click", () => void addToInitiative("pc"))); // NEW: pc

  // ESC per chiudere
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeContextMenuSoon(); }, { once: true });
}

/* ----------------------------- Bootstrap/HMR --------------------------- */
declare global { interface Window { __TBP_CTX_ADD_WIRED__?: boolean } }

OBR.onReady(async () => {
  if (!OBR.isAvailable) return; // se aperto fuori da OBR, non fare nulla
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    document.querySelectorAll<HTMLElement>("[data-att]").forEach((element) => { element.style.pointerEvents = "none"; });
    return;
  }

  // Tema (identico a ctx-mark)
  try {
    const theme = await OBR.theme.getTheme();
    applyTheme(theme);
    OBR.theme.onChange(applyTheme);
  } catch (e) {
    console.warn("[ctx-add] theme error:", e);
  }

  // Wiring UI una sola volta (HMR-safe)
  if (!window.__TBP_CTX_ADD_WIRED__) {
    window.__TBP_CTX_ADD_WIRED__ = true;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireUI, { once: true });
    } else {
      wireUI();
    }
  }
  sceneLifecycle.subscribe((event) => {
    document.querySelectorAll<HTMLElement>("[data-att]").forEach((element) => {
      element.style.pointerEvents = event.phase === "ready" ? "auto" : "none";
    });
  });
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
