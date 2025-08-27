  // src/contextMenu.js
  import {mountConditionsLabelWatcher} from "./conditions";
  import OBR from "@owlbear-rodeo/sdk";
  import { ID } from "./constants.js";
  export { ID }; // re-export per compatibilità con eventuali import esistenti

  /** Chiavi e util */
  const META_KEY = `${ID}/meta`;
  const STATE_KEY = `${ID}/state`;

  const BASE_URL = (import.meta?.env?.BASE_URL ?? "/"); // es. "/" o "/initiative-tracker/"
  const ORIGIN   = window.location.origin.replace(/\/+$/, "");
  const ASSET    = (name) => `${ORIGIN}${BASE_URL}${name}`.replace(/([^:]\/)\/+/g, "$1");

  // Icone (i file stanno in 'public/', ma si servono dalla root)
  const ICON_ADD    = ASSET("add.svg");
  const ICON_MARK   = ASSET("mark.svg");
  const ICON_CONDITIONS   = ASSET("conditions.svg");
  const ICON_REMOVE = ASSET("remove.svg");
  const ICON_BOSS = ASSET("boss.svg");
  const ICON_BOSS_OFF = ASSET("boss-remove.svg");
  const ICON_SPELLS = ASSET("spells.svg")
  
  // ===== DEBUG =====
const DEBUG_CTX = true;
const clog = (...a) => { if (DEBUG_CTX) console.debug("[ctx]", ...a); };

// Dump rapido: nome, id, inInitiative, hp/hpMax, attitude
async function dumpItems(ids, label) {
  try {
    const idset = new Set(ids);
    const arr = await OBR.scene.items.getItems(i => idset.has(i.id));
    clog(label, arr.map(i => ({
      id: i.id,
      name: i.name,
      inInitiative: !!i.metadata?.[META_KEY]?.inInitiative,
      hp: i.metadata?.[META_KEY]?.hp,
      hpMax: i.metadata?.[META_KEY]?.hpMax,
      att: i.metadata?.[META_KEY]?.attitude,
    })));
  } catch (e) {
    console.warn("[ctx] dumpItems error:", e?.message || e);
  }
}

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
  function isNotPC() {
  return { key: ["metadata", META_KEY, "attitude"], operator: "!=", value: "pc" };
  }

  /* ----------------------- Altezza submenu (embed) ------------------------ */
  const ROW_H = 28;
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
  // FIX: usa un filtro per id, non un array
async function toggleLegendaryDefault(itemIds) {
  if (!itemIds?.length) return;

  const idset = new Set(itemIds);
  const items = await OBR.scene.items.getItems(i => idset.has(i.id));

  const allHave = items.length > 0 && items.every(it => !!it.metadata?.[META_KEY]?.legendary);

  if (!allHave) {
    const blocked = items.some(it => {
      const p = it.metadata?.[META_KEY]?.paragon;
      const e = it.metadata?.[META_KEY]?.epic;
      return (p && Number(p.actions) > 1) || !!e;
    });
    if (blocked) {
      console.warn("[legendary] impossibile attivare: token con Paragon/Epic attivo");
      return;
    }
  }

  await OBR.scene.items.updateItems(itemIds, (draft) => {
    for (const it of draft) {
      const m  = it.metadata || {};
      const me = { ...(m[META_KEY] || {}) };
      if (allHave) {
        if (me.legendary) delete me.legendary;
      } else {
        me.legendary = { max: 3, current: 3 };
      }
      m[META_KEY] = me;
      it.metadata = m;
    }
  });
}
async function toggleParagonBossOn(ids) {
  if (!ids?.length) return;

  const idset = new Set(ids);
  const items = await OBR.scene.items.getItems(i => idset.has(i.id));

  const blocked = items.some(it => {
    const me   = it.metadata?.[META_KEY];
    const leg  = me?.legendary && Number(me.legendary.max) > 0;
    const epic = !!me?.epic;
    return leg || epic;
  });
  if (blocked) {
    console.warn("[paragon] impossibile attivare: token con Legendary/Epic attive");
    return;
  }

  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      const cur = me.paragon && typeof me.paragon === "object" ? me.paragon : null;
      if (!cur) me.paragon = { actions: 2 };
      else delete me.paragon;
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });

  // cleanup stato scena se disattivo
  try {
    const st = await OBR.scene.getMetadata();
    const prev = st?.[STATE_KEY] || {};
    const par = { ...(prev.paragonInits || {}) };
    let changed = false;
    for (const id of ids) {
      const stillOn = items.find(x => x.id === id)?.metadata?.[META_KEY]?.paragon;
      if (!stillOn && par[id]) { delete par[id]; changed = true; }
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

async function toggleEpicBossOn(ids) {
  if (!ids?.length) return;

  const idset = new Set(ids);
  const items = await OBR.scene.items.getItems(i => idset.has(i.id));

  const blocked = items.some(it => {
    const me   = it.metadata?.[META_KEY];
    const leg  = me?.legendary && Number(me.legendary.max) > 0;
    const par  = me?.paragon && Number(me.paragon.actions) > 1;
    return leg || par;
  });
  if (blocked) {
    console.warn("[epic] impossibile attivare: token con Legendary/Paragon attivi");
    return;
  }

  await OBR.scene.items.updateItems(ids, (draft) => {
    for (const it of draft) {
      const me = { ...(it.metadata?.[META_KEY] || {}) };
      if (me.epic) { delete me.epic; }
      else { me.epic = { enabled: 1 }; me.initiative = 20; }
      it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
    }
  });
}

  /* ============================ REGISTRAZIONE ============================= */
  export function setupContextMenu() {
    if (window.__TBP_CTX_MOUNTED) return;
    window.__TBP_CTX_MOUNTED = true;

    try { mountConditionsLabelWatcher(); } catch {}

    /* ======================= “Segna come…” (EMBED) ======================= */
    OBR.contextMenu.create({
      id: `${ID}/mark-as`,
      group: MENU_GROUP, // <— TOP-LEVEL
      icons: [
        {
          icon: ICON_MARK,
          label: "Segna come…",
          filter: {
          every: [
          isCharacter(),
          { key: ["metadata", META_KEY, "inInitiative"], operator: "==", value: true }, // ← SOLO se in iniziativa
          ],
          },
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
          filter: {
  every: [
    isCharacter(),
     { key: ["metadata", META_KEY, "inInitiative"], operator: "==", value: true },
        ],
        },
        },
        ],
      /** @param {import("@owlbear-rodeo/sdk").ContextMenuContext} ctx */
      async onClick(ctx) {
        try {
          const ids = Array.isArray(ctx.items)
            ? ctx.items.map(x => typeof x === "string" ? x : x.id)
            : [];
          if (!ids.length) return;

          clog("remove: ctx.items =", ctx.items);
          clog("remove: ids =", ids);

          await dumpItems(ids, "remove: BEFORE");

          await OBR.scene.items.updateItems(ids, (draft) => {
            for (const it of draft) {
              const m  = it.metadata || {};
              const me = { ...(m[META_KEY] || {}) };
              clog("remove:update", it.name, it.id, "had inInitiative=", !!me.inInitiative);
              delete me.inInitiative;                 // << togli SOLO il flag
              m[META_KEY] = me;
              it.metadata = m;
            }
          });

          await dumpItems(ids, "remove: AFTER (immediate)");
          setTimeout(() => { void dumpItems(ids, "remove: AFTER 200ms"); }, 200);
        } catch (err) {
          console.warn("[contextMenu] remove-from-initiative:", err);
        } finally {
          // chiudi menu e deseleziona
          Promise.resolve().then(() => OBR.player.deselect().catch(() => {}));
          setTimeout(() => OBR.player.deselect().catch(() => {}), 20);
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
          label: "Aggiungi all’iniziativa…",
          filter: {
          every: [
          isCharacter(),
          // Mostra la voce solo se NON è già in iniziativa
          { key: ["metadata", META_KEY, "inInitiative"], operator: "!=", value: true },
          ],
        },
        },
      ],
      embed: {
        url: "/ctx-add.html",
        height: EMBED_4ROWS_H,
      },
    });

// === Condizioni (EMBED) ===
OBR.contextMenu.create({
  id: `${ID}/conditions`,
  group: MENU_GROUP, // <-- coerente con gli altri
  icons: [{
    icon: ICON_CONDITIONS,
    label: "Condizioni…",
    filter: { every: [isCharacter(), hasMeta("!=")] },
  }],
  embed: {
    url: "/ctx-conditions.html",   // HTML in root
    height: EMBED_4ROWS_H,         // ~170px; puoi alzarlo a 280-360 se vuoi
  },
});

// === Incantesimi ===
OBR.contextMenu.create({
  id: `${ID}/spells-embed`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_SPELLS,
    label: "Incantesimi…",
    filter: { every: [isCharacter(), hasMeta("!=")] },
  }],
  embed: {
    // usa ASSET() per rispettare BASE_URL anche in hosting sotto sottocartelle
    url: ASSET("ctx-spells.html"),
    // alza un filo l'altezza se vuoi: 260–320 è comodo
    height: 500
  },
});


    /* ===================== “Abilita Azioni Leggendarie” (CLICK) ===================== */
  OBR.contextMenu.create({
    id: `${ID}/legendary-enable`,
    group: MENU_GROUP,
    icons: [{
      icon: ICON_BOSS,
      label: "Abilita Azioni Leggendarie",
      // Mostra solo su CHARACTER tracciati, senza Paragon, e senza Legendary
      filter: {
        every: [
          isCharacter(),
          hasMeta("!="),
          isNotPC(),
          { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "epic"], operator: "==", value: undefined }
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
      icon: ICON_BOSS_OFF,
      label: "Disabilita Azioni Leggendarie",
      // Mostra solo su CHARACTER tracciati, senza Paragon, e con Legendary presenti
      filter: {
        every: [
          isCharacter(),
          hasMeta("!="),
          { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "legendary"], operator: "!=", value: undefined },
          { key: ["metadata", META_KEY, "epic"], operator: "==", value: undefined }
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
      icon: ICON_BOSS,
      label: "Abilita Paragon Boss",
      // Mostra solo su CHARACTER tracciati, senza Legendary e senza Paragon
      filter: {
        every: [
          isCharacter(),
          hasMeta("!="),
          isNotPC(),
          { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "epic"], operator: "==", value: undefined }
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
      icon: ICON_BOSS_OFF,
      label: "Disabilita Paragon Boss",
      // Mostra solo su CHARACTER tracciati, senza Legendary e con Paragon presente
      filter: {
        every: [
          isCharacter(),
          hasMeta("!="),
          { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
          { key: ["metadata", META_KEY, "paragon"],   operator: "!=", value: undefined },
          { key: ["metadata", META_KEY, "epic"], operator: "==", value: undefined }
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
  /* ===================== “Abilita Epic Boss” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/epic-enable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_BOSS,
    label: "Abilita Epic Boss",
    // Mostra solo su CHARACTER tracciati, senza Legendary, senza Paragon, senza Epic
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        isNotPC(),
        { key: ["metadata", META_KEY, "legendary"], operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "paragon"],   operator: "==", value: undefined },
        { key: ["metadata", META_KEY, "epic"],      operator: "==", value: undefined },
      ],
    },
  }],
  onClick: async ({ items }) => {
    try { await toggleEpicBossOn(items.map(i => i.id)); } finally {
      try { await OBR.player.deselect(); } catch {}
    }
  },
});

/* ===================== “Disabilita Epic Boss” (CLICK) ===================== */
OBR.contextMenu.create({
  id: `${ID}/epic-disable`,
  group: MENU_GROUP,
  icons: [{
    icon: ICON_BOSS_OFF,
    label: "Disabilita Epic Boss",
    // Mostra solo su CHARACTER tracciati, con Epic presente
    filter: {
      every: [
        isCharacter(),
        hasMeta("!="),
        { key: ["metadata", META_KEY, "epic"], operator: "!=", value: undefined },
      ],
    },
  }],
  onClick: async ({ items }) => {
    try { await toggleEpicBossOn(items.map(i => i.id)); } finally {
      try { await OBR.player.deselect(); } catch {}
    }
  },
});
}