// src/concentration-widget.js
import OBR, { buildText, buildShape } from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";

// ====== METADATA KEYS ======
const META_KEY          = `${ID}/meta`;
const CONC_META_KEY     = `${ID}/concentration`;
const CONC_WIDGET_META  = `${ID}/concWidgetOf`;   // su SHAPE e TEXT
const CONC_WIDGET_KEY   = `${ID}/concWidgetKey`;  // spell key

// ====== STILE / POSIZIONE ======
const DOT_DIAMETER = 40; // world px
const DOT_GAP      = 1;  // distanza dal bordo
const DOT_FONT     = 24;

// ====== Colore deterministico per spell ======
function hueFromKey(key) { let h=0,s=String(key||""); for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%360; }
function spellColor(key) { const hue = hueFromKey(key); return { solid: `hsl(${hue}, 70%, 45%)` }; }

// ====== Lettura concentrazione (una sola per caster) ======
function readConcKey(it) {
  const conc = it?.metadata?.[META_KEY]?.[CONC_META_KEY];
  if (!conc || typeof conc !== "object") return null;
  const keys = Object.keys(conc);
  return keys.length ? keys[0] : null;
}

// ====== Centro del pallino (alto/sx, poco fuori dal token) ======
function calcDotCenterFor(it, d = DOT_DIAMETER, gap = DOT_GAP) {
  const w = Number(it.width)  || 70;
  const h = Number(it.height) || 70;
  const left = it.position.x - w / 2;
  const top  = it.position.y - h / 2;
  return { cx: left - gap - d / 2, cy: top - gap - d / 2 };
}

// ====== Upsert singolo pallino (SHAPE + TEXT) ======
async function upsertDotForItem(it) {
  const key = readConcKey(it);
  const wantOn = !!key;

  // eventuali widget esistenti già attaccati a questo token
  const existing = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[CONC_WIDGET_META] === it.id
  );

  if (!wantOn) {
    if (existing.length) await OBR.scene.items.deleteItems(existing.map(x => x.id));
    return;
  }

  const { cx, cy } = calcDotCenterFor(it, DOT_DIAMETER, DOT_GAP);
  const col = spellColor(key);

  // rettangolo della TEXT (top-left)
  const tx = cx - DOT_DIAMETER / 2;
  const ty = cy - DOT_DIAMETER / 2;

  let dotShape = existing.find(x => x.type === "SHAPE");
  let dotText  = existing.find(x => x.type === "TEXT");

  // crea con i builder (schema valido per OBR)
  const toAdd = [];
  if (!dotShape) {
    dotShape = buildShape()
      .shapeType("CIRCLE")
      .position({ x: cx, y: cy })
      .width(DOT_DIAMETER)
      .height(DOT_DIAMETER)
      .fillColor(col.solid)
      .strokeColor("rgba(0,0,0,1)")
      .strokeWidth(2)
      .attachedTo(it.id)
      .layer("TEXT")
      .name("Concentrazione (bg)")
      .metadata({ [CONC_WIDGET_META]: it.id, [CONC_WIDGET_KEY]: key })
      .build();
    dotShape.locked = true;
    dotShape.disableHit = true;
    dotShape.zIndex = 100020;
    toAdd.push(dotShape);
  }
  if (!dotText) {
    dotText = buildText()
      .position({ x: tx, y: ty })     // top-left del riquadro
      .width(DOT_DIAMETER)
      .height(DOT_DIAMETER)
      .plainText("C")
      .textType("PLAIN")
      .fontSize(DOT_FONT)
      .textAlign("CENTER")
      .textAlignVertical("MIDDLE")
      .fillColor("#ffffff")
      .strokeColor("rgba(0,0,0,.85)")
      .strokeWidth(2)
      .attachedTo(it.id)
      .layer("TEXT")
      .name("Concentrazione (C)")
      .metadata({ [CONC_WIDGET_META]: it.id, [CONC_WIDGET_KEY]: key })
      .build();
    dotText.locked = true;
    dotText.disableHit = true;
    dotText.zIndex = 100021; // sopra la shape
    toAdd.push(dotText);
  }

  if (toAdd.length) await OBR.scene.items.addItems(toAdd);

  // aggiorna posizione/colore anche se già esistevano
  const ids = [dotShape?.id, dotText?.id].filter(Boolean);
  if (ids.length) {
    await OBR.scene.items.updateItems(ids, (draft) => {
      for (const x of draft) {
        x.attachedTo = it.id;
        x.layer = "TEXT";
        x.locked = true;
        x.disableHit = true;
        x.metadata = { ...(x.metadata || {}), [CONC_WIDGET_META]: it.id, [CONC_WIDGET_KEY]: key };

        if (x.type === "SHAPE") {
          x.position = { x: cx, y: cy };
          x.width = DOT_DIAMETER;
          x.height = DOT_DIAMETER;
          x.fillColor = col.solid;
          x.strokeColor = "rgba(0,0,0,1)";
          x.strokeWidth = 2;
          x.zIndex = 100020;
        } else if (x.type === "TEXT") {
          x.position = { x: tx, y: ty };     // top-left del riquadro
          x.width = DOT_DIAMETER;
          x.height = DOT_DIAMETER;
          x.text = x.text || { type: "PLAIN", plainText: "C", style: {} };
          x.text.type = "PLAIN";
          x.text.plainText = "C";
          const st = x.text.style = x.text.style || {};
          st.fillColor = "#ffffff";
          st.strokeColor = "rgba(0,0,0,.85)";
          st.strokeWidth = 2;
          st.fontSize = DOT_FONT;
          st.textAlign = "CENTER";
          st.textAlignVertical = "MIDDLE";
          x.zIndex = 100021;
        }
      }
    });
  }
}

// ====== Lock anti-race ======
const __CONC_UPSERT_LOCK = new Set();

// ====== Refresh globale ======
export async function refreshConcentrationDots(itemIds) {
  let items = [];
  if (Array.isArray(itemIds) && itemIds.length) {
    const idset = new Set(itemIds.filter(Boolean));
    items = await OBR.scene.items.getItems(i => idset.has(i.id));
  } else {
    items = await OBR.scene.items.getItems(i => !!i.metadata?.[META_KEY]);
  }

  const should = new Set();

  for (const it of items) {
    if (!it) continue;
    const key = readConcKey(it);

    if (!key) {
      const orphan = await OBR.scene.items.getItems(
        (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[CONC_WIDGET_META] === it.id
      );
      if (orphan.length) await OBR.scene.items.deleteItems(orphan.map(o => o.id));
      continue;
    }

    should.add(it.id);
    if (__CONC_UPSERT_LOCK.has(it.id)) continue;

    __CONC_UPSERT_LOCK.add(it.id);
    try {
      await upsertDotForItem(it);
    } finally {
      __CONC_UPSERT_LOCK.delete(it.id);
    }
  }

  // pulizia orfani globali
  const allDots = await OBR.scene.items.getItems(
    (i) => (i.type === "TEXT" || i.type === "SHAPE") && i.metadata?.[CONC_WIDGET_META]
  );
  const toRemove = [];
  for (const d of allDots) {
    const ownerId = d.metadata?.[CONC_WIDGET_META];
    if (!ownerId || !should.has(ownerId)) toRemove.push(d.id);
  }
  if (toRemove.length) await OBR.scene.items.deleteItems(toRemove);
}

// ====== Watcher una sola volta ======
let __mounted = false;
export function mountConcentrationWatcher() {
  if (__mounted) return;
  __mounted = true;

  // refresh immediato all’avvio
  refreshConcentrationDots().catch(() => {});

  // riallinea a ogni variazione scena
  OBR.scene.items.onChange(async (ev) => {
    try {
      await refreshConcentrationDots(ev?.ids);
    } catch {}
  });
}
