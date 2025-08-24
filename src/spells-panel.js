// src/spells-panel.js
import OBR from "@owlbear-rodeo/sdk";
import {
  addOrUpdateSpell,
  registerConcentration,
  breakConcentration,
  getCasterConcentrations,
  clearSpellsOnItems, // resta per "Termina Incantesimo" se lo userai in seguito
} from "./spells.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init, { once: true });

async function init() {
  const f        = $("f");
  const iName    = $("name");
  const iDur     = $("dur");
  const iConc    = $("conc");
  const iCaster  = $("caster");
  const btnEnd   = $("end");      // se non esiste nell'HTML, resta null e non fa nulla
  const concWrap = $("concWrap");
  const concList = $("concList");
  const btnCancel = $("cancel");

  try { iName.setAttribute("autocomplete", "off"); iName.focus(); } catch {}

  // SRD (opzionale)
  try {
    const mod = await import("./spells-srd.js");
    const SRD = Array.isArray(mod.SPELLS_5E_SRD) ? mod.SPELLS_5E_SRD : [];
    if (SRD.length) {
      const dl = $("spell-list");
      for (const n of SRD) {
        const opt = document.createElement("option");
        opt.value = n;
        dl.appendChild(opt);
      }
    }
  } catch {}

  // Target dal context o selezione
  const targetIds = await getContextOrSelectionIds();

  // Popola caster: QUALSIASI token in iniziativa
  const allCasters = await getAllInitiativeCharacters();
  for (const it of allCasters) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name || it.id;
    iCaster.appendChild(opt);
  }
  if (targetIds.length === 1 && allCasters.some(c => c.id === targetIds[0])) {
    iCaster.value = targetIds[0];
  }

  // Abilita/disabilita select caster in base al toggle
  const refreshCasterEnabled = () => {
    const on = !!iConc.checked;
    iCaster.disabled = !on;
    iCaster.style.opacity = on ? "1" : ".6";
  };
  iConc.addEventListener("change", refreshCasterEnabled);
  refreshCasterEnabled();

  // Riepilogo concentrazione: visibile SOLO se apri sul caster e ha concentrazioni
  const contextCasterId = await deduceContextSingleId();
  await refreshCasterSummary(contextCasterId, concWrap, concList);

  // Submit: aggiungi/aggiorna spell
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name   = (iName.value || "").trim();
    const turns  = Math.max(1, Math.floor(Number(iDur.value) || 1));
    const wantsC = !!iConc.checked;
    if (!name) { iName.focus(); return; }

    let casterId = iCaster.value || null;
if (wantsC && !casterId && allCasters.length) {
  casterId = allCasters[0].id; // fallback
}

// 🔒 Regola D&D: un caster può avere una sola concentrazione.
// Se il caster ha già concentrazioni attive, interrompile TUTTE prima di applicare la nuova.
if (wantsC && casterId) {
  try {
    const conc = await getCasterConcentrations(casterId); // { key: {targets:[...]}, ... }
    const keys = Object.keys(conc || {});
    for (const k of keys) {
      await breakConcentration(casterId, k);
    }
  } catch (e) {
    console.warn("[spell-panel] break previous concentration:", e);
  }
}

// Applica l'incantesimo ai target selezionati
for (const id of targetIds) {
  await addOrUpdateSpell(id, name, turns, {
    conc: wantsC && !!casterId,
    source: wantsC ? casterId : undefined,
  });
}

// Registra la nuova concentrazione sul caster (se richiesto)
if (wantsC && casterId) {
  await registerConcentration(casterId, name, targetIds);
}

    try { await OBR.contextMenu.close?.(); } catch {}
  });

// === Annulla: rimuove TUTTI gli incantesimi dai token selezionati
btnCancel?.addEventListener("click", async () => {
  const ids = await getContextOrSelectionIds();
  if (!ids.length) return;
  await clearSpellsOnItems(ids);
  try { await OBR.contextMenu.close?.(); } catch {}
});
}

/* ---------------- helpers ---------------- */

async function getContextOrSelectionIds() {
  try {
    const ctx = await OBR.contextMenu.getContext();
    const ids = (ctx?.items || []).map(i => i.id).filter(Boolean);
    if (ids.length) return ids;
  } catch {}
  try {
    const sel = await OBR.player.getSelection();
    if (sel?.length) return sel.filter(Boolean);
  } catch {}
  return [];
}

async function deduceContextSingleId() {
  try {
    const ctx = await OBR.contextMenu.getContext();
    const ids = (ctx?.items || []).map(i => i.id);
    if (ids.length === 1) return ids[0];
  } catch {}
  try {
    const sel = await OBR.player.getSelection();
    if (sel?.length === 1) return sel[0];
  } catch {}
  return null;
}

async function getAllInitiativeCharacters() {
  try {
    const items = await OBR.scene.items.getItems(
      (it) => it.layer === "CHARACTER" && !!(it.metadata && it.metadata[META_KEY])
    );
    items.sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id, "it"));
    return items;
  } catch { return []; }
}

async function refreshCasterSummary(casterId, wrap, list) {
  list.replaceChildren();
  if (!casterId) { wrap.style.display = "none"; return; }
  try {
    const conc = await getCasterConcentrations(casterId); // { [spellKey]: { targets: [] } }
    const entries = Object.entries(conc || {});
    if (!entries.length) { wrap.style.display = "none"; return; }
    wrap.style.display = "";

    for (const [key, info] of entries) {
      const nice = key ? key[0].toUpperCase()+key.slice(1) : key;
      const n    = Array.isArray(info?.targets) ? info.targets.length : 0;

      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${nice} (${n})`;

      const btn = document.createElement("button");
      btn.className = "iconbtn";
      btn.type = "button";
      btn.textContent = "✕";
      btn.title = "Interrompi questa concentrazione";
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await breakConcentration(casterId, key);
        await refreshCasterSummary(casterId, wrap, list);
      });

      const row = document.createElement("span");
      row.className = "row";
      row.append(chip, btn);
      list.append(row);
    }
  } catch {
    wrap.style.display = "none";
  }
}
