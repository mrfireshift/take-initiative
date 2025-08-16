// src/contextMenu.js
import OBR from "@owlbear-rodeo/sdk";

/**
 * Namespace stabile dell’estensione.
 * NON cambiare: altri moduli importano { ID } da qui.
 */
export const ID = "com.thebigpicture.initiative";

/** Chiave metadata condivisa dai token (hp, initiative, attitude, ecc.) */
const META_KEY = `${ID}/meta`;
const BASE_URL = (import.meta?.env?.BASE_URL ?? "/"); // es. "/" o "/initiative-tracker/"
const ORIGIN   = window.location.origin.replace(/\/+$/, "");
const ASSET    = (name) => `${ORIGIN}${BASE_URL}${name}`.replace(/([^:]\/)\/+/g, "$1");

// Icone (i file stanno in 'public/', ma si servono dalla root)
const ICON_ADD    = ASSET("add.svg");
const ICON_MARK   = ASSET("mark.svg");
const ICON_REMOVE = ASSET("remove.svg");

/** Evita doppie registrazioni in dev/HMR */
if (!window.__TBP_CTX_MOUNTED) {
  window.__TBP_CTX_MOUNTED = false;
}

/* ----------------------------- Filtri utili ----------------------------- */
function isCharacter() {
  return { key: "layer", value: "CHARACTER" };
}
function hasMeta(op /* "==" | "!=" */) {
  return { key: ["metadata", META_KEY], operator: op, value: undefined };
}

/* ----------------------- Altezza submenu (embed) ------------------------ */
const ROW_H = 32;
const GAP_Y = 6;
const PAD_Y = 8;
const EMBED_3ROWS_H = PAD_Y * 2 + ROW_H * 3 + GAP_Y * 2; // = 124px

/* --------------------------- Group unificato ---------------------------- */
const MENU_GROUP = `${ID}/initiative-manage`;

/* --------------------------- Helper “chiudi” ---------------------------- */
function closeContextMenuSoon() {
  Promise.resolve().then(() => {
    OBR.player.deselect().catch(() => {});
  });
  setTimeout(() => {
    OBR.player.deselect().catch(() => {});
  }, 20);
}

/* ============================ REGISTRAZIONE ============================= */
export function setupContextMenu() {
  if (window.__TBP_CTX_MOUNTED) return;
  window.__TBP_CTX_MOUNTED = true;

  /* ======================= “Segna come…” (EMBED) ======================= */
  OBR.contextMenu.create({
    id: `${ID}/mark-as`,
    group: MENU_GROUP, // <— TOP-LEVEL
    icons: [
      {
        icon: ICON_MARK,
        label: "Segna come…",
        filter: { every: [isCharacter(), hasMeta("!=")] },
      },
    ],
    embed: {
      url: "/ctx-mark.html",
      height: EMBED_3ROWS_H,
    },
  });

  /* =================== “Rimuovi dall’iniziativa” (CLICK) =================== */
  OBR.contextMenu.create({
    id: `${ID}/remove-from-initiative`,
    group: MENU_GROUP, // <— TOP-LEVEL
    icons: [
      {
        icon: ICON_REMOVE,
        label: "Rimuovi dall’iniziativa",
        filter: { every: [isCharacter(), hasMeta("!=")] },
      },
    ],
    /** @param {import("@owlbear-rodeo/sdk").ContextMenuContext} ctx */
    async onClick(ctx) {
      try {
        if (!ctx.items?.length) return;
        await OBR.scene.items.updateItems(ctx.items, (items) => {
          for (const it of items) {
            if (it.metadata) delete it.metadata[META_KEY];
          }
        });
      } catch (err) {
        console.warn("[contextMenu] remove-from-initiative:", err);
      } finally {
        closeContextMenuSoon();
      }
    },
  });

  /* ============== “Aggiungi all’iniziativa come…” (EMBED) ============== */
  OBR.contextMenu.create({
    id: `${ID}/add-to-initiative`,
    group: MENU_GROUP, // <— TOP-LEVEL
    icons: [
      {
        icon: ICON_ADD,
        label: "Aggiungi all’iniziativa come…",
        filter: { every: [isCharacter(), hasMeta("==")] },
      },
    ],
    embed: {
      url: "/ctx-add.html",
      height: EMBED_3ROWS_H,
    },
  });
}
