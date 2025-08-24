// src/spells.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const META_KEY        = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;        // [{ id, name, turns, conc?, casterId? }]
const CONC_META_KEY   = `${ID}/concentration`; // sul CASTER: { [spellKey]: { targets: string[] } }

// util
const keyOf = (name) => String(name || "").trim().toLowerCase();

// ===== Base storage =====
export function getSpellsFromItem(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const list = meta[SPELLS_META_KEY];
  return Array.isArray(list) ? list : [];
}

export async function setSpellsOnItem(itemId, spells) {
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    const it = drafts[0]; if (!it) return;
    it.metadata = it.metadata || {};
    it.metadata[META_KEY] = it.metadata[META_KEY] || {};
    it.metadata[META_KEY][SPELLS_META_KEY] = Array.isArray(spells) ? spells : [];
  });
}

// ===== Concentrazione (salvata sul caster) =====
async function __getConcentration(casterId) {
  const [it] = await OBR.scene.items.getItems([casterId]);
  const conc = it?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
  return { caster: it, conc };
}
async function __setConcentration(casterId, obj) {
  await OBR.scene.items.updateItems([casterId], (drafts) => {
    const it = drafts[0]; if (!it) return;
    it.metadata = it.metadata || {};
    it.metadata[META_KEY] = it.metadata[META_KEY] || {};
    it.metadata[META_KEY][CONC_META_KEY] = obj || {};
  });
}

// ===== CRUD incantesimi =====
export async function addOrUpdateSpell(itemId, name, turns, opts = {}) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;

  const list = getSpellsFromItem(item).slice();
  const idx  = list.findIndex((s) => keyOf(s.name) === keyOf(name));
  const t    = Math.max(1, Math.floor(Number(turns) || 1));

  const extra = {};
  if (opts && typeof opts === "object") {
    if (opts.source)  extra.casterId = String(opts.source);
    if (opts.conc != null) extra.conc = !!opts.conc;
  }

  if (idx >= 0) list[idx] = { ...list[idx], turns: t, ...extra };
  else list.push({ id: crypto.randomUUID(), name: String(name).trim(), turns: t, ...extra });

  await setSpellsOnItem(itemId, list);
}

export async function removeSpellByName(itemId, name) {
  return removeSpellByNameAndSource(itemId, name, null);
}

// rimuovi per nome e, se passato, SOLO se l’origine è quel caster
export async function removeSpellByNameAndSource(itemId, name, casterId /* nullable */) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;
  const want = keyOf(name);
  const next = getSpellsFromItem(item).filter((s) => {
    if (keyOf(s.name) !== want) return true;
    if (casterId && s.casterId && s.casterId !== casterId) return true; // lascia gli altri caster
    return false;
  });
  await setSpellsOnItem(itemId, next);
}

// ===== Avanzamento round =====
export async function tickSpellsForItems(itemIds) {
  if (!itemIds?.length) return new Map();
  const items = await OBR.scene.items.getItems(itemIds);
  const updates = new Map();

  for (const it of items) {
    const list = getSpellsFromItem(it);
    if (!list.length) continue;

    const next = list
      .map((s) => ({ ...s, turns: Math.max(0, Number(s.turns || 0) - 1) }))
      .filter((s) => s.turns > 0);

    if (JSON.stringify(next) !== JSON.stringify(list)) updates.set(it.id, next);
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const d of drafts) {
        d.metadata = d.metadata || {};
        d.metadata[META_KEY] = d.metadata[META_KEY] || {};
        d.metadata[META_KEY][SPELLS_META_KEY] = updates.get(d.id) || [];
      }
    });
  }
  return updates;
}

// ⬇️ Aggiunta: applica un delta (+/-) ai turni rimanenti degli incantesimi
export async function adjustSpellsForItems(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();

  const items = await OBR.scene.items.getItems(itemIds);
  const updates = new Map();

  for (const it of items) {
    const list = getSpellsFromItem(it);
    if (!list.length) continue;

    const next = list
      .map(s => {
        const cur = Math.max(0, Number(s.turns || 0));
        const n = Math.max(0, cur + delta);   // +1 se vado indietro, -1 se avanti
        return { ...s, turns: n };
      })
      .filter(s => s.turns > 0);               // non resuscita scaduti

    if (JSON.stringify(next) !== JSON.stringify(list)) {
      updates.set(it.id, next);
    }
  }

  if (updates.size) {
    await OBR.scene.items.updateItems(Array.from(updates.keys()), (drafts) => {
      for (const it of drafts) {
        const arr = updates.get(it.id) || [];
        it.metadata = it.metadata || {};
        it.metadata[`${ID}/meta`] = it.metadata[`${ID}/meta`] || {};
        it.metadata[`${ID}/meta`][`${ID}/spells`] = arr;
      }
    });
  }
  return updates;
}

// ===== Concentrazione: registro e break =====
export async function registerConcentration(casterId, name, targetIds) {
  const key = keyOf(name);
  const { conc } = await __getConcentration(casterId);
  const prev = conc[key]?.targets || [];
  const set = new Set([...prev, ...(Array.isArray(targetIds) ? targetIds : [])]);
  conc[key] = { targets: Array.from(set) };
  await __setConcentration(casterId, conc);
}
export async function getCasterConcentrations(casterId) {
  const { conc } = await __getConcentration(casterId);
  return conc; // { [spellKey]: { targets: [...] } }
}

// interrompe SOLO quella spell del caster
export async function breakConcentration(casterId, name) {
  const key = keyOf(name);
  const { conc } = await __getConcentration(casterId);
  const entry = conc[key];
  if (!entry) return;

  const targets = Array.isArray(entry.targets) ? entry.targets : [];
  for (const tId of targets) {
    await removeSpellByNameAndSource(tId, name, casterId);
  }
  const next = { ...conc };
  delete next[key];
  await __setConcentration(casterId, next);
}

// interrompe TUTTO ciò su cui il caster si sta concentrando
export async function breakAllConcentrations(casterId) {
  const { conc } = await __getConcentration(casterId);
  const keys = Object.keys(conc || {});
  for (const k of keys) {
    const human = k; // già in minuscolo
    await breakConcentration(casterId, human);
  }
}

// ⬇️ NUOVO: pulisce TUTTI gli incantesimi dai token selezionati
export async function clearSpellsOnItems(itemIds) {
  const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
  if (!ids.length) return;

  // 1) leggi i token per sapere quali caster vanno “sganciati”
  const items = await OBR.scene.items.getItems(ids);

  // mappa casterId -> { spellKey -> Set(targetIds) }
  const toDetach = new Map();

  for (const it of items) {
    const list = getSpellsFromItem(it);
    for (const s of list) {
      if (s.conc && s.casterId) {
        const key = spellKey(s.name);
        if (!toDetach.has(s.casterId)) toDetach.set(s.casterId, new Map());
        const bySpell = toDetach.get(s.casterId);
        if (!bySpell.has(key)) bySpell.set(key, new Set());
        bySpell.get(key).add(it.id);
      }
    }
  }

  // 2) azzera gli incantesimi sui target
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const it of drafts) {
      it.metadata = it.metadata || {};
      it.metadata[META_KEY] = it.metadata[META_KEY] || {};
      it.metadata[META_KEY][SPELLS_META_KEY] = [];
    }
  });

  // 3) ripulisci i registri di concentrazione dei caster
  for (const [casterId, spellsMap] of toDetach.entries()) {
    const [caster] = await OBR.scene.items.getItems([casterId]);
    const conc = caster?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
    let changed = false;

    for (const [key, setIds] of spellsMap.entries()) {
      const entry = conc[key];
      if (!entry) continue;
      const prevTargets = Array.isArray(entry.targets) ? entry.targets : [];
      const nextTargets = prevTargets.filter(tid => !setIds.has(tid));
      if (nextTargets.length !== prevTargets.length) {
        changed = true;
        if (nextTargets.length) conc[key] = { targets: nextTargets };
        else delete conc[key];
      }
    }
    if (changed) {
      await __setConcentration(casterId, conc);
    }
  }
}

// ===== UI helper (chips) =====
export function buildSpellChips(spells) {
  const frag = document.createDocumentFragment();
  const list = Array.isArray(spells) ? spells : [];
  for (const s of list) {
    const chip = document.createElement("span");
    chip.className = "chip spell-chip";
    chip.textContent = formatSpellChip(s.name, s.turns);
    chip.title = `${s.name} — ${s.turns} round rimanenti`;
    Object.assign(chip.style, {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 6px",
      borderRadius: "10px",
      background: "rgba(90, 140, 255, 0.25)",
      border: "1px solid rgba(32, 32, 32, 0.94)",
      boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
      fontSize: "10px",
      lineHeight: "1",
      color: "#e6eefc",
      whiteSpace: "nowrap",
    });
    frag.appendChild(chip);
  }
  return frag;
}
function formatSpellChip(name, turns) {
  const n = String(name || "").trim();
  const short = n.length > 10 ? n.slice(0, 9) + "…" : n;
  const t = Math.max(0, Math.floor(Number(turns) || 0));
  return `${short} (${t})`;
}
