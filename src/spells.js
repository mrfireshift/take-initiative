import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { runEffectsMutation } from "./effectsMutations.js";
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

export function getSpellsFromItem(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const list = meta[SPELLS_META_KEY];
  return Array.isArray(list) ? list : [];
}

export async function setSpellsOnItem(itemId, spells) {
  await runEffectsMutation([{
    type: "spell:set",
    targetIds: [itemId],
    spells: Array.isArray(spells) ? spells : [],
  }]);
}

async function __getConcentration(casterId) {
  const [it] = await OBR.scene.items.getItems([casterId]);
  const conc = it?.metadata?.[META_KEY]?.[CONC_META_KEY] || {};
  return { caster: it, conc };
}

export async function addOrUpdateSpell(itemId, name, turns, opts = {}) {
  const plan = await runEffectsMutation([{
    type: "spell:upsert",
    targetIds: [itemId],
    name: String(name || "").trim(),
    turns,
    conc: opts.conc,
    source: opts.source,
    instanceId: opts.instanceId,
    spellId: opts.spellId,
  }]);
  const state = plan.states.find((entry) => entry.id === itemId);
  const instanceId = String(opts?.instanceId || "").trim();
  const sourceId = String(opts?.source || "").trim();
  return state?.spells.find((spell) => instanceId
    ? String(spell?.instanceId || "") === instanceId
    : keyOf(spell?.name) === keyOf(name) &&
      (!sourceId || !spell?.casterId || String(spell.casterId) === sourceId)
  ) || null;
}

export async function removeSpellByName(itemId, name) {
  return removeSpellByNameAndSource(itemId, name, null);
}

export async function removeSpellByNameAndSource(itemId, name, casterId) {
  await runEffectsMutation([{
    type: "spell:remove-name-source",
    targetIds: [itemId],
    name,
    casterId,
  }]);
}

export async function removeSpellByInstance(itemId, instanceId) {
  const id = String(instanceId || "").trim();
  if (!itemId || !id) return;
  await runEffectsMutation([{
    type: "spell:remove-instance",
    targetIds: [itemId],
    instanceId: id,
  }]);
}

export async function tickSpellsForItems(itemIds) {
  return adjustSpellsForItems(itemIds, -1);
}

export async function adjustSpellsForItems(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  const plan = await runEffectsMutation([{
    type: "spell:adjust",
    targetIds: ids,
    delta,
  }]);
  const updates = new Map();
  const scope = new Set(ids);
  for (const change of plan.changes) {
    if (scope.has(change.id) && change.fields.spells) {
      updates.set(change.id, change.after.spells || []);
    }
  }
  return updates;
}

export async function registerConcentration(casterId, name, targetIds, opts = {}) {
  await runEffectsMutation([{
    type: "concentration:register",
    casterId,
    targetIds,
    name,
    instanceId: opts.instanceId,
    spellId: opts.spellId,
  }]);
}

export async function getCasterConcentrations(casterId) {
  const { conc } = await __getConcentration(casterId);
  return conc;
}

export async function breakConcentration(casterId, nameOrInstanceId) {
  await runEffectsMutation([{
    type: "concentration:break",
    casterIds: [casterId],
    reference: nameOrInstanceId,
  }]);
}

export async function breakAllConcentrations(casterId) {
  await breakAllConcentrationsForItems([casterId]);
}

export async function breakAllConcentrationsForItems(casterIds) {
  await runEffectsMutation([{
    type: "concentration:break",
    casterIds: Array.from(new Set((casterIds || []).filter(Boolean))),
  }]);
}

export async function clearSpellsOnItems(itemIds) {
  const ids = Array.from(new Set(Array.isArray(itemIds) ? itemIds.filter(Boolean) : []));
  if (!ids.length) return;
  await runEffectsMutation([{
    type: "spell:clear-non-concentration",
    targetIds: ids,
  }]);
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
