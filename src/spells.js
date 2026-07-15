import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { removeConditionInstancesByParentEffects } from "./conditions.js";
import { getSpellDefinition } from "./spells-srd.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const CONC_META_KEY = ID + "/concentration";

const keyOf = (name) => String(name || "").trim().toLocaleLowerCase();

function createId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return prefix + ":" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2);
}

export function createSpellInstanceId() {
  return createId("spell");
}

function linkedConditionRemoval(itemId, spell) {
  const parentEffectId = String(spell?.instanceId || "").trim();
  return itemId && parentEffectId ? { itemId, parentEffectId } : null;
}

async function removeLinkedConditions(removals) {
  const valid = (Array.isArray(removals) ? removals : []).filter(Boolean);
  if (valid.length) await removeConditionInstancesByParentEffects(valid);
}

export function getSpellsFromItem(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const list = meta[SPELLS_META_KEY];
  return Array.isArray(list) ? list : [];
}

export async function setSpellsOnItem(itemId, spells) {
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    const it = drafts[0];
    if (!it) return;
    const meta = {
      ...(it.metadata?.[META_KEY] || {}),
      [SPELLS_META_KEY]: Array.isArray(spells) ? spells : [],
    };
    it.metadata = { ...(it.metadata || {}), [META_KEY]: meta };
  });
}

async function __getConcentration(casterId) {
  const [it] = await OBR.scene.items.getItems([casterId]);
  const conc = it?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
  return { caster: it, conc };
}

async function __setConcentration(casterId, obj) {
  await OBR.scene.items.updateItems([casterId], (drafts) => {
    const it = drafts[0];
    if (!it) return;
    const meta = {
      ...(it.metadata?.[META_KEY] || {}),
      [CONC_META_KEY]: obj || {},
    };
    it.metadata = { ...(it.metadata || {}), [META_KEY]: meta };
  });
}

export async function addOrUpdateSpell(itemId, name, turns, opts = {}) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return null;

  const list = getSpellsFromItem(item).slice();
  const instanceId = String(opts?.instanceId || "").trim();
  const sourceId = String(opts?.source || "").trim();
  const spellId = String(opts?.spellId || "").trim();
  const idx = instanceId
    ? list.findIndex((spell) => String(spell.instanceId || "") === instanceId)
    : list.findIndex((spell) =>
      keyOf(spell.name) === keyOf(name)
      && (!sourceId || !spell.casterId || String(spell.casterId) === sourceId)
    );
  const normalizedTurns = Math.max(1, Math.floor(Number(turns) || 1));
  const extra = {};

  if (sourceId) extra.casterId = sourceId;
  if (opts.conc != null) extra.conc = !!opts.conc;
  if (instanceId) extra.instanceId = instanceId;
  if (spellId) extra.spellId = spellId;

  if (idx >= 0) {
    list[idx] = { ...list[idx], turns: normalizedTurns, ...extra };
  } else {
    list.push({
      id: createId("spell-entry"),
      name: String(name).trim(),
      turns: normalizedTurns,
      ...extra,
    });
  }

  await setSpellsOnItem(itemId, list);
  return idx >= 0 ? list[idx] : list[list.length - 1];
}

export async function removeSpellByName(itemId, name) {
  return removeSpellByNameAndSource(itemId, name, null);
}

export async function removeSpellByNameAndSource(itemId, name, casterId) {
  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;

  const want = keyOf(name);
  const sourceId = String(casterId || "").trim();
  const list = getSpellsFromItem(item);
  const removed = [];
  const next = list.filter((spell) => {
    if (keyOf(spell.name) !== want) return true;
    if (sourceId && spell.casterId && String(spell.casterId) !== sourceId) return true;
    removed.push(spell);
    return false;
  });
  if (!removed.length) return;

  await setSpellsOnItem(itemId, next);
  await removeLinkedConditions(
    removed.map((spell) => linkedConditionRemoval(itemId, spell))
  );
}

export async function removeSpellByInstance(itemId, instanceId) {
  const id = String(instanceId || "").trim();
  if (!itemId || !id) return;

  const [item] = await OBR.scene.items.getItems([itemId]);
  if (!item) return;
  const list = getSpellsFromItem(item);
  const next = list.filter((spell) => String(spell.instanceId || "") !== id);
  if (next.length === list.length) return;

  await setSpellsOnItem(itemId, next);
  await removeLinkedConditions([{ itemId, parentEffectId: id }]);
}

async function clearExpiredConcentrations(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const casterId = String(entry?.casterId || "").trim();
    const ref = String(entry?.instanceId || entry?.name || "").trim();
    if (!casterId || !ref) continue;
    const signature = casterId + "|" + ref;
    if (seen.has(signature)) continue;
    seen.add(signature);
    await breakConcentration(casterId, ref);
  }
}

export async function tickSpellsForItems(itemIds) {
  if (!itemIds?.length) return new Map();
  const items = await OBR.scene.items.getItems(itemIds);
  const updates = new Map();
  const removals = [];
  const expiredConcentrations = [];

  for (const it of items) {
    const list = getSpellsFromItem(it);
    if (!list.length) continue;

    const next = [];
    for (const spell of list) {
      const turns = Math.max(0, Number(spell.turns || 0) - 1);
      if (turns > 0) {
        next.push({ ...spell, turns });
      } else {
        removals.push(linkedConditionRemoval(it.id, spell));
        if (spell.conc) expiredConcentrations.push(spell);
      }
    }

    if (JSON.stringify(next) !== JSON.stringify(list)) updates.set(it.id, next);
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const it of drafts) {
        const meta = {
          ...(it.metadata?.[META_KEY] || {}),
          [SPELLS_META_KEY]: updates.get(it.id) || [],
        };
        it.metadata = { ...(it.metadata || {}), [META_KEY]: meta };
      }
    });
  }

  await removeLinkedConditions(removals);
  await clearExpiredConcentrations(expiredConcentrations);
  return updates;
}

export async function adjustSpellsForItems(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();

  const items = await OBR.scene.items.getItems(itemIds);
  const updates = new Map();
  const removals = [];
  const expiredConcentrations = [];

  for (const it of items) {
    const list = getSpellsFromItem(it);
    if (!list.length) continue;

    const next = [];
    for (const spell of list) {
      const current = Math.max(0, Number(spell.turns || 0));
      const turns = Math.max(0, current + delta);
      if (turns > 0) {
        next.push({ ...spell, turns });
      } else {
        removals.push(linkedConditionRemoval(it.id, spell));
        if (spell.conc) expiredConcentrations.push(spell);
      }
    }

    if (JSON.stringify(next) !== JSON.stringify(list)) updates.set(it.id, next);
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const it of drafts) {
        const meta = {
          ...(it.metadata?.[META_KEY] || {}),
          [SPELLS_META_KEY]: updates.get(it.id) || [],
        };
        it.metadata = { ...(it.metadata || {}), [META_KEY]: meta };
      }
    });
  }

  await removeLinkedConditions(removals);
  await clearExpiredConcentrations(expiredConcentrations);
  return updates;
}

export async function registerConcentration(casterId, name, targetIds, opts = {}) {
  const key = keyOf(name);
  const { conc } = await __getConcentration(casterId);
  const previous = conc[key] && typeof conc[key] === "object" ? conc[key] : {};
  const targets = new Set([
    ...(Array.isArray(previous.targets) ? previous.targets : []),
    ...(Array.isArray(targetIds) ? targetIds : []),
  ]);
  const entry = { ...previous, targets: [...targets], name: String(name || "").trim() };
  if (opts.instanceId) entry.instanceId = String(opts.instanceId);
  if (opts.spellId) entry.spellId = String(opts.spellId);
  await __setConcentration(casterId, { ...conc, [key]: entry });
}

export async function getCasterConcentrations(casterId) {
  const { conc } = await __getConcentration(casterId);
  return conc;
}

export async function breakConcentration(casterId, nameOrInstanceId) {
  const wanted = String(nameOrInstanceId || "").trim();
  const key = keyOf(wanted);
  const { conc } = await __getConcentration(casterId);
  let matchedKey = Object.prototype.hasOwnProperty.call(conc, key) ? key : "";
  if (!matchedKey) {
    matchedKey = Object.keys(conc || {}).find((candidate) =>
      String(conc[candidate]?.instanceId || "") === wanted
    ) || "";
  }
  if (!matchedKey) return;

  const entry = conc[matchedKey] || {};
  const targets = Array.isArray(entry.targets) ? entry.targets : [];
  const instanceId = String(entry.instanceId || "").trim();
  const spellName = String(entry.name || matchedKey).trim();

  for (const targetId of targets) {
    if (instanceId) await removeSpellByInstance(targetId, instanceId);
    else await removeSpellByNameAndSource(targetId, spellName, casterId);
  }

  const next = { ...conc };
  delete next[matchedKey];
  await __setConcentration(casterId, next);
}

export async function breakAllConcentrations(casterId) {
  const { conc } = await __getConcentration(casterId);
  for (const key of Object.keys(conc || {})) {
    await breakConcentration(casterId, key);
  }
}

export async function clearSpellsOnItems(itemIds) {
  const ids = Array.from(new Set(Array.isArray(itemIds) ? itemIds.filter(Boolean) : []));
  if (!ids.length) return;

  const items = await OBR.scene.items.getItems(ids);
  const updates = new Map();
  const removals = [];

  for (const item of items) {
    const list = getSpellsFromItem(item);
    const keep = list.filter((spell) => !!spell.conc);
    for (const spell of list) {
      if (!spell.conc) removals.push(linkedConditionRemoval(item.id, spell));
    }
    if (keep.length !== list.length) updates.set(item.id, keep);
  }

  if (updates.size) {
    await OBR.scene.items.updateItems([...updates.keys()], (drafts) => {
      for (const it of drafts) {
        const meta = {
          ...(it.metadata?.[META_KEY] || {}),
          [SPELLS_META_KEY]: updates.get(it.id) || [],
        };
        it.metadata = { ...(it.metadata || {}), [META_KEY]: meta };
      }
    });
  }

  await removeLinkedConditions(removals);
}

export function buildSpellChips(spells) {
  const frag = document.createDocumentFragment();
  const list = Array.isArray(spells) ? spells : [];
  for (const spell of list) {
    const displayName = getSpellDefinition(spell.name)?.displayName || spell.name;
    const chip = document.createElement("span");
    chip.className = "chip spell-chip";
    chip.textContent = formatSpellChip(displayName, spell.turns);
    chip.title = displayName + " — " + spell.turns + " round rimanenti";
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
  const normalizedName = String(name || "").trim();
  const short = normalizedName.length > 10
    ? normalizedName.slice(0, 9) + "…"
    : normalizedName;
  const remaining = Math.max(0, Math.floor(Number(turns) || 0));
  return short + " (" + remaining + ")";
}
