// src/contextMenu.js
import OBR from "@owlbear-rodeo/sdk";

/**
 * Namespace stabile dell’estensione.
 * NON cambiare: altri moduli importano { ID } da qui.
 */
export const ID = "com.thebigpicture.initiative";

/** Chiavi e util */
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

const BASE_URL = (import.meta?.env?.BASE_URL ?? "/"); // es. "/" o "/initiative-tracker/"
const ORIGIN   = window.location.origin.replace(/\/+$/, "");
const ASSET    = (name) => `${ORIGIN}${BASE_URL}${name}`.replace(/([^:]\/)\/+/g, "$1");

// Icone (i file stanno in 'public/', ma si servono dalla root)
const ICON_ADD    = ASSET("add.svg");
const ICON_MARK   = ASSET("mark.svg");
const ICON_REMOVE = ASSET("remove.svg");
const ICON_PARAGON = ICON_MARK; // se vuoi: ASSET("paragon.svg")

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

function hasLegendaryActive() {
  return { key: ["metadata", META_KEY, "legendary", "max"], operator: ">", value: 0 };
}
function hasParagonActive() {
  return { key: ["metadata", META_KEY, "paragon", "actions"], operator: ">", value: 1 };
}

/* ----------------------- Altezza submenu (embed) ------------------------ */
const ROW_H = 32;
const GAP_Y = 6;
const PAD_Y = 8;
const EMBED_3ROWS_H = PAD_Y * 2 + ROW_H * 3 + GAP_Y * 2; // = 124px
const EMBED_4ROWS_H = PAD_Y * 2 + ROW_H * 4 + GAP_Y * 3; // = 170px circa

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
/* ---------------- Legendary: toggle create/remove (default=3) ----------- */
async function toggleLegendaryDefault(itemIds) {
  if (!itemIds?.length) return;

  const items = await OBR.scene.items.getItems(itemIds);
  const allHave = items.length > 0 && items.every(it => !!it.metadata?.[META_KEY]?.legendary);

  // se stiamo provando ad ACCENDERE e c'è Paragon attivo su almeno uno → blocca
  if (!allHave) {
    const blocked = items.some(it => {
      const p = it.metadata?.[META_KEY]?.paragon;
      return p && Number(p.actions) > 1; // attivo
    });
    if (blocked) {
      console.warn("[legendary] impossibile attivare: token con Paragon Boss attivo");
      return;
    }
  }

  await OBR.scene.items.updateItems(itemIds, (draft) => {
    for (const it of draft) {
      const m  = it.metadata || {};
      const me = { ...(m[META_KEY] || {}) };
      if (allHave) {
        if (me.legendary) delete me.legendary;        // OFF
      } else {
        me.legendary = { max: 3, current: 3 };        // ON (default)
      }
      m[META_KEY] = me;
      it.metadata = m;
    }
  });
}

// Toggle Paragon Boss sul token (default actions = 2)
// N.B. vietato se il token ha Legendary attive (max > 0)
async function toggleParagonBossOn(ids) {
  if (!ids?.length) return;

  // leggi item correnti
  const items = await OBR.scene.items.getItems(ids);
  const blocked = items.some(it => {
    const me = it.metadata?.[META_KEY];
    return me?.legendary && Number(me.legendary.max) > 0;
  });
  if (blocked) {
    console.warn("[paragon] impossibile attivare: token con Legendary attive");
    return;
  }

  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cur = me.paragon && typeof me.paragon === "object" ? me.paragon : null;

      // toggle: se assente → ON con 2 azioni, se presente → OFF
      if (!cur) {
        me.paragon = { actions: 2 }; // default
      } else {
        delete me.paragon;
      }

      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });

  // pulizia stato scena per le iniziative paragon (se disattivo)
  try {
    const st = await OBR.scene.getMetadata();
    const prev = st?.[STATE_KEY] || {};
    const par = { ...(prev.paragonInits || {}) };
    let changed = false;
    for (const id of ids) {
      if (!items.find(x => x.id === id)?.metadata?.[META_KEY]?.paragon && par[id]) {
        delete par[id];
        changed = true;
      }
    }
    if (changed) {
      await OBR.scene.setMetadata({
        ...st,
        [STATE_KEY]: { ...(prev || {}), paragonInits: par },
      });
    }
  } catch (e) {
    console.warn("[paragon] cleanup stato fallito", e?.message || e);
  }
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
      height: EMBED_4ROWS_H,
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
      height: EMBED_4ROWS_H,
    },
  });
  /* ===================== “Abilita Azioni Leggendarie” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/legendary-enable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_MARK,
    label: "Abilita Azioni Leggendarie",
    // Mostra solo su CHARACTER tracciati, senza Paragon, e senza Legendary
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
      ],
    },
  }],
  onClick: async (ctx) => {
    try {
      const ids = (ctx.items || []).map(i => i.id);
      if (!ids.length) return;
      await toggleLegendaryDefault(ids); // attiva (default 3) perché nessun selezionato le ha
    } catch (err) {
      console.warn("[contextMenu] legendary-enable:", err);
    } finally {
      closeContextMenuSoon();
    }
  },
});

/* ===================== “Disabilita Azioni Leggendarie” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/legendary-disable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_MARK,
    label: "Disabilita Azioni Leggendarie",
    // Mostra solo su CHARACTER tracciati, senza Paragon, e con Legendary presenti
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "legendary"], operator: "!=", value: undefined },
      ],
    },
  }],
  onClick: async (ctx) => {
    try {
      const ids = (ctx.items || []).map(i => i.id);
      if (!ids.length) return;
      await toggleLegendaryDefault(ids); // spegne perché TUTTI le hanno (allHave === true)
    } catch (err) {
      console.warn("[contextMenu] legendary-disable:", err);
    } finally {
      closeContextMenuSoon();
    }
  },
});

/* ===================== “Abilita Paragon Boss” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/paragon-enable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_PARAGON,
    label: "Abilita Paragon Boss",
    // Mostra solo su CHARACTER tracciati, senza Legendary e senza Paragon
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
      ],
    },
  }],
  onClick: async ({ items }) => {
    try {
      await toggleParagonBossOn(items.map(i => i.id)); // ON (perché assente)
    } finally {
      try { await OBR.player.deselect(); } catch {}
    }
  },
});

/* ===================== “Disabilita Paragon Boss” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/paragon-disable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_PARAGON,
    label: "Disabilita Paragon Boss",
    // Mostra solo su CHARACTER tracciati, senza Legendary e con Paragon presente
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "paragon"],   operator: "!=", value: undefined },
      ],
    },
  }],
  onClick: async ({ items }) => {
    try {
      await toggleParagonBossOn(items.map(i => i.id)); // OFF (perché presente)
    } finally {
      try { await OBR.player.deselect(); } catch {}
    }
  },
});
}