// src/ctx-mark.ts
import OBR, { type Theme } from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";

const META_KEY = `${ID}/meta`;

/* ----------------------- THEME (come in ctx-add) ----------------------- */
function applyTheme(t: Theme) {
  const text  = t.text?.primary ?? (t.mode === "DARK" ? "#fff" : "#111");
  const hover = t.mode === "DARK" ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
  const r = document.documentElement.style;
  r.setProperty("--obrt-text", text);
  r.setProperty("--obrt-hover", hover);
  document.body.style.color = text;
}

/* ---------------------- Utility: chiusura gentile ---------------------- */
function closeContextMenuSoon() {
  // microtask + piccolo delay per non “mangiare” l’update
  Promise.resolve().then(() => { void OBR.player.deselect().catch(() => {}); });
  setTimeout(() => { void OBR.player.deselect().catch(() => {}); }, 20);
}

/* --------------------------- Azione principale ------------------------- */
async function setAttitude(attitude: "ally" | "neutral" | "enemy") {
  try {
    const ids = await OBR.player.getSelection();
    if (!ids || ids.length === 0) return;

    await OBR.scene.items.updateItems(ids, (items) => {
      for (const it of items) {
        it.metadata = it.metadata || {};
        const prev = (it.metadata as any)[META_KEY] || {};
        (it.metadata as any)[META_KEY] = { ...prev, attitude };
      }
    });
  } catch (e) {
    console.warn("[ctx-mark] update error:", (e as any)?.message || e);
  } finally {
    closeContextMenuSoon();
  }
}

/* ------------------------------ Wiring UI ------------------------------ */
function wireUI() {
  const qs = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
  qs('[data-att="ally"]').forEach((el)    => el.addEventListener("click", () => void setAttitude("ally")));
  qs('[data-att="neutral"]').forEach((el) => el.addEventListener("click", () => void setAttitude("neutral")));
  qs('[data-att="enemy"]').forEach((el)   => el.addEventListener("click", () => void setAttitude("enemy")));

  // ESC per chiudere
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeContextMenuSoon(); }, { once: true });
}

/* ----------------------------- Bootstrap/HMR --------------------------- */
declare global { interface Window { __TBP_CTX_MARK_WIRED__?: boolean } }

OBR.onReady(async () => {
  if (!OBR.isAvailable) return; // se aperto fuori da OBR, non fare nulla

  // Tema (identico a ctx-add)
  try {
    const theme = await OBR.theme.getTheme();
    applyTheme(theme);
    OBR.theme.onChange(applyTheme);
  } catch (e) {
    console.warn("[ctx-mark] theme error:", e);
  }

  // Wiring UI una sola volta (HMR-safe)
  if (!window.__TBP_CTX_MARK_WIRED__) {
    window.__TBP_CTX_MARK_WIRED__ = true;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireUI, { once: true });
    } else {
      wireUI();
    }
  }
});