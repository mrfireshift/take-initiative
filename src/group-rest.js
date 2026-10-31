import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { groupRestBenefits, groupRestMemberSummary, groupRestMembers } from "./groupRestCore.js";
import { takeGroupRest } from "./classFeatureRuntime.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { getInitiativeCard, initiativeCardBaseExhaustion, saveInitiativeCard } from "./initiativeCards.js";
import { syncHPBatchToMemory } from "./hpMemory.js";

// Lot U6' of the system UX audit: "Riposo del gruppo", the party's short and long rest from the tracker (groupRestCore.js,
// classFeatureRuntime.js takeGroupRest). GM only.
const POPOVER_ID = `${ID}/group-rest`;
const lifecycle = createSceneLifecycleAdapter({ obr: OBR });
const $ = (id) => document.getElementById(id);
let members = [];
const chosen = new Set();
const recovered = new Map();
let results = new Map();
let busy = false;
let isGM = false;
let unsubscribeItems = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setStatus(message, tone = "") {
  $("status").textContent = message;
  $("status").dataset.tone = tone;
}

const hpText = (member) => (member.tracked
  ? `PF ${member.hp}/${member.hpMax}${member.tempHp > 0 ? ` +${member.tempHp}` : ""}`
  : "PF non tracciati");

function render() {
  const list = $("members");
  list.replaceChildren();
  $("summary").textContent = members.length === 1 ? "1 personaggio nella scena" : `${members.length} personaggi nella scena`;
  if (!members.length) list.append(node("div", "empty", "Nessun personaggio (PG) nella scena."));
  for (const member of members) {
    const row = node("div", `row${chosen.has(member.id) ? "" : " off"}`);
    const check = node("input");
    check.type = "checkbox";
    check.checked = chosen.has(member.id);
    check.disabled = busy;
    check.setAttribute("aria-label", `Includi ${member.name}`);
    check.addEventListener("change", () => {
      if (check.checked) chosen.add(member.id); else chosen.delete(member.id);
      render();
    });
    const identity = node("div", "identity");
    identity.append(node("span", "name", member.name));
    const result = results.get(member.id);
    identity.append(node("span", `detail${result ? " done" : ""}`, result || hpText(member)));
    const amount = node("input", "recovered");
    amount.type = "number";
    amount.min = "0";
    amount.step = "1";
    amount.placeholder = "0";
    amount.value = recovered.get(member.id) || "";
    amount.disabled = busy || !member.tracked || member.sharedHp || !chosen.has(member.id);
    amount.title = member.sharedHp ? "PF condivisi: da aggiornare a mano" : "PF recuperati con i Dadi Vita (riposo breve)";
    amount.setAttribute("aria-label", `PF recuperati da ${member.name}`);
    amount.addEventListener("input", () => {
      const value = Math.max(0, Math.floor(Number(amount.value) || 0));
      if (value) recovered.set(member.id, value); else recovered.delete(member.id);
    });
    row.append(check, identity, amount);
    list.append(row);
  }
  const ready = isGM && !busy && chosen.size > 0 && lifecycle.isReady();
  $("short-rest").disabled = !ready;
  $("long-rest").disabled = !ready;
  $("exhaustion").disabled = busy || !isGM;
}

async function load() {
  const items = await OBR.scene.items.getItems();
  const previous = new Set(members.map((member) => member.id));
  members = groupRestMembers(items);
  // A character that comes into the scene is chosen too; one the GM left out stays out.
  for (const member of members) if (!previous.has(member.id)) chosen.add(member.id);
  for (const id of [...chosen]) if (!members.some((member) => member.id === id)) chosen.delete(id);
  render();
}

// Exhaustion −1 after a long rest: the sheet's own save, character by character (its base level and the room's card
// registry), so each step has its History entry, as from the sheet.
async function lowerExhaustion(ids, operation) {
  const lowered = [];
  const items = await OBR.scene.items.getItems(ids);
  for (const item of items) {
    if (!lifecycle.isCurrent(operation)) break;
    const base = initiativeCardBaseExhaustion(item);
    if (!(base > 0)) continue;
    const profile = getInitiativeCard(item);
    const context = await getEffectsMutationSceneContext({ commandId: `${operation.operationId}:exhaustion:${item.id}` });
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: Math.max(0, Number(profile.exhaustion || 0) - 1) }, {
      baseExhaustion: base - 1,
      isCurrent: () => lifecycle.isCurrent(operation),
      commandId: context.commandId,
      sceneIdentity: context.sceneIdentity,
    });
    lowered.push(item.id);
  }
  return lowered;
}

async function rest(longRest) {
  if (busy || !isGM || !chosen.size || !lifecycle.isReady()) return;
  const operation = lifecycle.capture({ operationId: `group-rest:${crypto.randomUUID()}` });
  busy = true;
  results = new Map();
  const button = $(longRest ? "long-rest" : "short-rest");
  const label = button.textContent;
  button.textContent = "Applico…";
  setStatus("");
  render();
  try {
    const outcome = await takeGroupRest({
      sourceIds: [...chosen],
      longRest,
      recovered: longRest ? {} : Object.fromEntries(recovered),
    });
    if (!lifecycle.isCurrent(operation)) return;
    if (outcome.hpUpdates.length) {
      const items = await OBR.scene.items.getItems(outcome.hpUpdates.map((update) => update.itemId));
      await syncHPBatchToMemory(outcome.hpUpdates.map((update) => ({ itemId: update.itemId, hp: update.hp, hpMax: update.hpMax })), {
        sceneEpoch: operation.epoch, items, isCurrent: () => lifecycle.isCurrent(operation),
      });
    }
    const rested = outcome.members.filter((member) => groupRestBenefits(member, longRest)).map((member) => member.id);
    const lowered = longRest && $("exhaustion").checked ? await lowerExhaustion(rested, operation) : [];
    if (!lifecycle.isCurrent(operation)) return;
    const updatesById = new Map(outcome.hpUpdates.map((update) => [update.itemId, update]));
    const restored = new Set(outcome.restoredIds);
    for (const member of outcome.members) {
      const parts = [groupRestMemberSummary(member, updatesById.get(member.id), { resourcesRestored: restored.has(member.id), longRest })];
      if (lowered.includes(member.id)) parts.push("Indebolimento −1");
      if (outcome.preparingIds.includes(member.id)) parts.push("rivedi gli incantesimi preparati");
      results.set(member.id, parts.join(" · "));
    }
    recovered.clear();
    setStatus(`${outcome.label}: fatto.${outcome.historyPending ? " Cronologia in recupero; non ripetere il riposo." : " Si annulla dalla Cronologia."}`, "success");
  } catch (error) {
    console.warn("[group-rest]", error?.message || error);
    if (lifecycle.isCurrent(operation)) setStatus("Riposo non applicato: un personaggio è cambiato nel frattempo. Riprova.", "error");
  } finally {
    busy = false;
    button.textContent = label;
    if (lifecycle.isCurrent(operation)) await load().catch(() => {});
    render();
  }
}

$("short-rest").addEventListener("click", () => void rest(false));
$("long-rest").addEventListener("click", () => void rest(true));
$("close").addEventListener("click", () => OBR.popover.close(POPOVER_ID));

OBR.onReady(async () => {
  try {
    isGM = (await OBR.player.getRole()) === "GM";
    await lifecycle.mount();
    if (!isGM) {
      setStatus("Il riposo del gruppo è disponibile solo per il GM.", "error");
      render();
      return;
    }
    await load();
    unsubscribeItems = subscribeSceneItemChanges(() => {
      if (!busy) void load().catch(() => {});
    }, { filter: (event) => event.flags.hpBars || event.flags.trackerStructure });
  } catch (error) {
    setStatus(error?.message || "Pannello non disponibile.", "error");
  }
});
lifecycle.subscribe((event) => {
  if (event.phase === "unavailable") { busy = true; render(); setStatus("Scena cambiata: riapri il riposo del gruppo.", "error"); }
});
window.addEventListener("pagehide", () => { unsubscribeItems?.(); lifecycle.dispose(); });
