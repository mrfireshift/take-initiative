import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { DELAYED_BLAST_FIREBALL_ID } from "./delayedBlastFireballRules.js";
import {
  executeDelayedBlastFireballTerminalResolution,
  getDelayedBlastFireballTerminalContext,
} from "./delayedBlastFireballResolutionCore.js";
import {
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
  buildSpellUnifiedPopupEvent,
} from "./spellUnifiedPopupProtocol.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { initializePopoverDrag } from "./popoverDrag.js";
import { evasionFactor, evasionForItem } from "./damageDefensesCore.js";
import {
  magicalDamageDefensesForItem,
  spellDamageAfterDefense,
  spellDamageBeforeDefense,
  spellDamageDefenseRows,
  spellDamageDefenseText,
  spellDamageDefenseTitle,
  spellDamageTypes,
} from "./spellDamageDefenseCore.js";

const params = new URLSearchParams(globalThis.location?.search || "");
const payload = (() => {
  try {
    return JSON.parse(params.get("payload") || "null");
  } catch {
    return null;
  }
})();
const META_KEY = `${ID}/meta`;
const $ = (id) => document.getElementById(id);
let context = null;
let outcomes = {};
const ignoredDefenses = new Map();
let busy = false;
let notified = false;

function text(value) {
  return String(value ?? "").trim();
}

function uniqueIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(text)
    .filter(Boolean))];
}

function currentEpoch() {
  // The parent panel and this popup run in separate Owlbear realms.  Their
  // numeric scene epochs are not interchangeable, so prefer the popup's live
  // epoch and only fall back to the payload for test/offline runtimes.
  const live = currentSceneEpoch();
  return Number.isInteger(Number(live))
    ? Number(live)
    : Number.isInteger(Number(payload?.sceneEpoch))
      ? Number(payload.sceneEpoch)
      : 0;
}

function setStatus(message, error = false) {
  const node = $("status");
  if (!node) return;
  node.hidden = !message;
  node.textContent = text(message);
  node.dataset.kind = error ? "error" : "";
}

async function notifyParent(status, message = "", result = null) {
  if (notified || !payload) return;
  notified = true;
  await OBR.broadcast.sendMessage(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    buildSpellUnifiedPopupEvent({
      source: "delayed-blast-fireball-resolution",
      status,
      instanceId: payload.instanceId,
      actionId: payload.actionId,
      popoverId: payload.popoverId,
      message,
      ...(result?.historyEntryId ? { historyEntryId: result.historyEntryId } : {}),
      ...(result?.undoAvailable !== undefined ? { undoAvailable: result.undoAvailable === true } : {}),
    }),
    { destination: "LOCAL" },
  ).catch(() => {});
}

// What the save asks, with the DC fixed at the cast or on the caster's sheet.
function renderFacts() {
  const dc = Number(context?.castContext?.spellSaveDC
    ?? context?.caster?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC);
  $("facts").textContent = [
    `TS Destrezza${Number.isInteger(dc) && dc > 0 ? ` CD ${dc}` : ""}`,
    "metà se supera",
  ].join(" · ");
}

// Beside the main button: what is still missing, or what it will register.
function renderSummary(missing, amount = null) {
  const node = $("summary");
  node.replaceChildren();
  if (missing) {
    node.textContent = missing;
  } else if (amount !== null) {
    const number = document.createElement("strong");
    number.textContent = String(amount);
    node.append("Danni ", number);
  }
  node.hidden = !node.childNodes.length;
}

// Under the total: each defense at work and what it does to the number. Whose it is, when there are several creatures. A
// click ignores it, as in the other popups.
function renderDamageDefenseChips(ids, itemsById, roll) {
  const types = spellDamageTypes(DELAYED_BLAST_FIREBALL_ID);
  const chips = ids.flatMap((id) => {
    const item = itemsById.get(id);
    const name = text(item?.name) || id;
    return spellDamageDefenseRows({
      types,
      defenses: magicalDamageDefensesForItem(item, META_KEY),
      ignoredTypes: [...(ignoredDefenses.get(id) || [])],
    }).map((row) => {
      // Evasion (a Dexterity save that halves): nothing on a success, half on a failure, as the executor counts it.
      const outcomeFactor = outcomes[id] === "passed" ? "half" : "full";
      const factor = evasionForItem(item, META_KEY) ? evasionFactor(outcomeFactor) : outcomeFactor;
      const before = roll !== null && outcomes[id] && factor !== "zero" ? spellDamageBeforeDefense(roll, factor) : 0;
      const numbers = roll !== null && outcomes[id] && factor !== "zero"
        ? { before, after: row.ignored ? before : spellDamageAfterDefense(roll, factor, row.defense) }
        : { before: 0, after: 0 };
      const said = spellDamageDefenseText(row, numbers);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `defense-chip damage-defense is-${row.defense}`;
      chip.textContent = ids.length > 1 ? `${name} · ${said}` : said;
      chip.title = spellDamageDefenseTitle(row, { name, ...numbers, where: "in questa azione" });
      chip.disabled = busy;
      chip.setAttribute("aria-pressed", String(!row.ignored));
      chip.addEventListener("click", () => {
        const ignored = new Set(ignoredDefenses.get(id) || []);
        if (ignored.has(row.type)) ignored.delete(row.type);
        else ignored.add(row.type);
        ignoredDefenses.set(id, ignored);
        render();
      });
      return chip;
    });
  });
  $("damageDefenses").replaceChildren(...chips);
  $("damageDefenses").hidden = !chips.length;
}

function render() {
  const targetRoot = $("targets");
  if (!targetRoot) return;
  targetRoot.replaceChildren();
  const itemsById = new Map((Array.isArray(context?.allItems) ? context.allItems : [])
    .map((item) => [text(item?.id), item]));
  const ids = uniqueIds(context?.targetIds);
  for (const id of ids) {
    const item = itemsById.get(id);
    const row = document.createElement("div");
    row.className = "target";
    const name = document.createElement("span");
    name.className = "target-name";
    name.textContent = text(item?.name) || id;
    name.title = name.textContent;
    const hp = document.createElement("span");
    hp.className = "target-hp";
    const meta = item?.metadata?.[META_KEY] || {};
    hp.textContent = Number.isFinite(Number(meta.hp)) && Number(meta.hpMax) > 0 ? `${Number(meta.hp)}/${Number(meta.hpMax)}` : "";
    row.append(name, hp);
    const outcomeGroup = document.createElement("div");
    outcomeGroup.className = "segmented mini";
    for (const [value, label] of [["passed", "Superato"], ["failed", "Fallito"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.outcome = value;
      button.setAttribute("aria-pressed", String(outcomes[id] === value));
      button.addEventListener("click", () => {
        if (busy) return;
        outcomes[id] = value;
        render();
      });
      outcomeGroup.append(button);
    }
    row.append(outcomeGroup);
    targetRoot.append(row);
  }
  renderFacts();
  const dice = document.createElement("span");
  dice.className = "dice";
  dice.textContent = `${Math.max(0, Number(context?.currentDice) || 0)}d6`;
  $("damageLabel").replaceChildren("Fuoco", dice);
  $("damageField").hidden = !ids.length;
  $("bulkOutcomes").hidden = !ids.length;
  // Empty until the GM writes the roll; with nobody in the radius there is nothing to write.
  const written = $("damage").value;
  const roll = written !== "" && Number.isFinite(Number(written)) && Number(written) >= 0 ? Number(written) : null;
  const missingOutcomes = ids.filter((id) => !["passed", "failed"].includes(outcomes[id])).length;
  $("apply").disabled = busy || !context?.valid || missingOutcomes > 0 || (ids.length > 0 && roll === null);
  if (context?.valid) {
    renderSummary(
      !ids.length ? "Nessuna creatura nel raggio."
        : missingOutcomes ? `Manca l'esito di ${missingOutcomes} ${missingOutcomes === 1 ? "creatura" : "creature"}.`
          : roll === null ? "Manca il danno." : "",
      roll,
    );
  } else {
    renderSummary("");
  }
  renderDamageDefenseChips(ids, itemsById, roll);
}

async function loadContext() {
  if (!payload?.casterId || !payload?.instanceId) {
    setStatus("Contesto della detonazione non valido.", true);
    return;
  }
  try {
    context = await getDelayedBlastFireballTerminalContext({
      casterId: payload.casterId,
      instanceId: payload.instanceId,
    });
    if (!context.valid) {
      setStatus(context.errors?.[0]?.message || "La perla non è più disponibile.", true);
      $("apply").disabled = true;
      return;
    }
    const activeIds = new Set(uniqueIds(context.targetIds));
    outcomes = Object.fromEntries(Object.entries(outcomes)
      .filter(([id]) => activeIds.has(id)));
    setStatus("");
    render();
  } catch (error) {
    setStatus(error?.message || "Impossibile leggere la posizione corrente della perla.", true);
  }
}

async function apply() {
  if (busy || !context?.valid) return;
  const epoch = currentEpoch();
  if (!isCurrentSceneEpoch(epoch)) {
    setStatus("La scena è cambiata: riapri la detonazione.", true);
    return;
  }
  busy = true;
  render();
  setStatus("Detonazione in corso…");
  try {
    const result = await executeDelayedBlastFireballTerminalResolution({
      casterId: payload.casterId,
      instanceId: payload.instanceId,
      pendingTermination: payload.pendingTermination,
      castContext: payload.castContext,
      outcomes,
      damage: Number($("damage")?.value),
      ignoredDefenses: Object.fromEntries([...ignoredDefenses].map(([id, types]) => [id, [...types]])),
      sceneEpoch: epoch,
      commandId: `delayed-blast-fireball:${payload.instanceId}:${Date.now().toString(36)}`,
      isCurrent: (value) => isCurrentSceneEpoch(value),
    });
    if (["applied", "noop"].includes(String(result?.status || ""))) {
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED, "Detonazione completata.", result);
      await OBR.popover.close(payload.popoverId).catch(() => {});
      return;
    }
    setStatus(result?.errors?.[0]?.message || "Detonazione non riuscita.", true);
  } catch (error) {
    setStatus(error?.message || "Detonazione non riuscita.", true);
  } finally {
    busy = false;
    render();
  }
}

async function close() {
  await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  await OBR.popover.close(payload?.popoverId).catch(() => {});
}

if (!payload) {
  setStatus("Payload di detonazione non valido.", true);
} else {
  $("app").dataset.popoverId = text(payload.popoverId);
  initializePopoverDrag($("app"));
  $("title").textContent = text(payload.spellName) || "Palla di fuoco ritardata";
  $("subtitle").textContent = text(payload.casterName);
  $("subtitle").hidden = !$("subtitle").textContent;
  $("close").addEventListener("click", () => void close());
  $("apply").addEventListener("click", () => void apply());
  $("damage").addEventListener("input", render);
  for (const button of document.querySelectorAll("[data-bulk-outcome]")) {
    button.addEventListener("click", () => {
      if (busy) return;
      for (const id of uniqueIds(context?.targetIds)) outcomes[id] = button.dataset.bulkOutcome;
      render();
    });
  }
  window.addEventListener("beforeunload", () => { void notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED); }, { once: true });
  void OBR.onReady(async () => {
    await loadContext();
    OBR.scene.items.onChange(() => {
      if (!busy) void loadContext();
    });
  });
}
