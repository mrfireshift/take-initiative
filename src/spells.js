import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { runEffectsMutation, tickRoundEffects } from "./effectsMutations.js";
import { getSpellDefinition } from "./spells-srd.js";
import { spellExpiryCounter, spellExpiryDescription } from "./spellExpiryCore.js";
import { spellColorFor } from "./spellColorCore.js";

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

export function getVisibleSpellsFromItem(item) {
  return getSpellsFromItem(item).filter(
    (spell) => spell?.castContext?.staticZoneOwner !== true
  );
}

export function getSpellFromItemByName(item, spellName) {
  const spells = getSpellsFromItem(item);
  const target = keyOf(spellName);
  return spells.find((s) => keyOf(s.name) === target) || null;
}

export function getSpellFromItemByInstanceId(item, instanceId) {
  const spells = getSpellsFromItem(item);
  return spells.find((s) => s.id === instanceId) || null;
}

export async function isCastingSpell(casterId, spellName) {
  if (!casterId) return false;
  const items = await OBR.scene.items.getItems([casterId]);
  const it = items[0];
  if (!it) return false;

  const spells = getSpellsFromItem(it);
  const target = keyOf(spellName);
  const activeSpell = spells.find((s) => keyOf(s.name) === target);
  if (!activeSpell) return false;

  const concMeta = it.metadata?.[META_KEY]?.[CONC_META_KEY];
  const conc = concMeta && typeof concMeta === "object" ? concMeta : {};
  return !!conc[target];
}

export async function getCastingDetails(casterId, spellName) {
  if (!casterId) return null;
  const items = await OBR.scene.items.getItems([casterId]);
  const it = items[0];
  if (!it) return null;

  const spells = getSpellsFromItem(it);
  const target = keyOf(spellName);
  const activeSpell = spells.find((s) => keyOf(s.name) === target);
  if (!activeSpell) return null;

  const concMeta = it.metadata?.[META_KEY]?.[CONC_META_KEY];
  const conc = concMeta && typeof concMeta === "object" ? concMeta : {};
  return { caster: it, conc: conc[target] };
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
  await runEffectsMutation([{
    type: "spell:upsert",
    targetIds: [itemId],
    name,
    turns,
    conc: opts.conc,
    source: opts.source,
    instanceId: opts.instanceId,
    spellId: opts.spellId,
    replaceNames: [opts.enteredName, name, opts.storedName],
  }]);
}

export function findSpellByInstance(state, instanceId) {
  return state?.spells.find((spell) => instanceId
    ? String(spell?.id || "").trim() === String(instanceId).trim()
    : false) || null;
}

export async function removeSpellByName(itemId, name) {
  return removeSpellByNameAndSource(itemId, name, null);
}

export async function removeSpellByNameAndSource(itemId, name, casterId = null) {
  if (!itemId || !name) return;
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
  return tickRoundEffects(itemIds, -1);
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

export function buildSpellChips(spells, options = {}) {
  const frag = document.createDocumentFragment();
  const list = Array.isArray(spells) ? spells : [];
  const onTerminate = typeof options.onTerminate === "function" ? options.onTerminate : null;
  for (const spell of list) {
    const displayName = getSpellDefinition(spell.name)?.displayName || spell.name;
    const chip = document.createElement("span");
    chip.className = "chip spell-chip";
    chip.dataset.referenceType = "spells";
    chip.dataset.referenceEntry = displayName;
    const label = document.createElement("span");
    label.textContent = formatSpellChip(displayName, spell);
    chip.appendChild(label);
    chip.title = displayName + " — " + spellExpiryDescription(spell);
    const color = spellColorFor(spell?.spellId || displayName);
    Object.assign(chip.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: onTerminate ? "3px" : "0",
      padding: "2px 6px",
      borderRadius: "999px",
      background: color.solid,
      border: `2px solid ${color.border}`,
      boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
      fontSize: "10px",
      fontWeight: "500",
      lineHeight: "1",
      color: "#e6eefc",
      whiteSpace: "nowrap",
      cursor: "pointer",
    });
    if (onTerminate) {
      const terminate = document.createElement("button");
      terminate.type = "button";
      terminate.textContent = "×";
      terminate.dataset.cardSelectionIgnore = "1";
      terminate.title = `Termina ${displayName} su questo bersaglio`;
      terminate.setAttribute("aria-label", terminate.title);
      Object.assign(terminate.style, {
        minWidth: "10px",
        width: "10px",
        height: "10px",
        padding: "0",
        border: "0",
        borderRadius: "50%",
        background: "rgba(0,0,0,.22)",
        color: "inherit",
        font: "inherit",
        fontSize: "10px",
        fontWeight: "800",
        lineHeight: "10px",
        cursor: "pointer",
      });
      terminate.addEventListener("mouseenter", () => {
        terminate.style.background = "rgba(220,38,38,.72)";
      });
      terminate.addEventListener("mouseleave", () => {
        terminate.style.background = "rgba(0,0,0,.22)";
      });
      terminate.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (terminate.disabled) return;
        terminate.disabled = true;
        try {
          await onTerminate(spell);
        } catch (error) {
          terminate.disabled = false;
          console.warn("[spells] terminate tracker chip:", error?.message || error);
        }
      });
      chip.appendChild(terminate);
    }
    frag.appendChild(chip);
  }
  return frag;
}

function formatSpellChip(name, spell) {
  const normalizedName = String(name || "").trim();
  const short = normalizedName.length > 10
    ? normalizedName.slice(0, 9) + "…"
    : normalizedName;
  const counter = spellExpiryCounter(spell);
  return counter ? short + " (" + counter + ")" : short;
}
