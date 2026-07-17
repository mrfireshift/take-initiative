import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  SAVE_KEYS,
  getInitiativeCard,
  loadInitiativeCard,
  hasInitiativeCardValues,
  saveInitiativeCard,
} from "./initiativeCards.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/initiative-card-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";

function closeInitiativeCardPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
const sourceId = new URLSearchParams(window.location.search).get("source") || "";
const labels = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };
const $ = (id) => document.getElementById(id);

let item = null;
let profile = null;
let isGM = false;
let exhaustionSaving = false;

function valueText(value, suffix = "") {
  return value === null || value === undefined ? "-" : `${value}${suffix}`;
}

function signedText(value) {
  if (value === null || value === undefined) return "-";
  return value >= 0 ? `+${value}` : String(value);
}

function renderPortrait() {
  const portrait = $("portrait");
  const fallback = $("portraitFallback");
  const name = String(item?.name || "").trim();
  fallback.textContent = name.slice(0, 1).toUpperCase() || "?";
  const source = String(item?.image?.url || item?.image?.src || item?.image?.href || item?.data?.src || "").trim();
  portrait.querySelector("img")?.remove();
  fallback.style.display = "grid";
  if (!source) return;
  const image = document.createElement("img");
  image.alt = "";
  image.src = source;
  image.addEventListener("load", () => { fallback.style.display = "none"; });
  image.addEventListener("error", () => image.remove());
  portrait.appendChild(image);
}

function renderView() {
  const meta = item?.metadata?.[META_KEY] || {};
  $("title").textContent = item?.name || "Scheda iniziativa";
  renderPortrait();
  $("hp").textContent = `${valueText(meta.hp)} / ${valueText(meta.hpMax)}`;
  $("armorClass").textContent = valueText(profile.armorClass);
  $("passivePerception").textContent = valueText(profile.passivePerception);
  $("speed").textContent = valueText(profile.speed, profile.speed === null ? "" : " m");
  $("exhaustion").textContent = String(profile.exhaustion || 0);
  for (const [id, disabled] of [
    ["exhaustionDown", exhaustionSaving || !isGM || profile.exhaustion <= 0],
    ["exhaustionUp", exhaustionSaving || !isGM || profile.exhaustion >= 5],
  ]) {
    const button = $(id);
    button.style.display = isGM ? "inline-block" : "none";
    button.disabled = disabled;
  }
  $("saves").replaceChildren(...SAVE_KEYS.map((key) => {
    const row = document.createElement("div");
    row.className = "save";
    const label = document.createElement("span");
    label.textContent = labels[key];
    const value = document.createElement("strong");
    value.textContent = signedText(profile.savingThrows[key]);
    row.append(label, value);
    return row;
  }));
}

function setEditing(active) {
  $("view").classList.toggle("hidden", active);
  $("form").classList.toggle("active", active);
  $("edit").style.display = isGM && !active ? "inline-block" : "none";
  if (!active) return;
  $("armorClassInput").value = profile.armorClass ?? "";
  $("passivePerceptionInput").value = profile.passivePerception ?? "";
  $("speedInput").value = profile.speed ?? "";
  $("exhaustionInput").value = profile.exhaustion ?? 0;
  for (const key of SAVE_KEYS) $(`save-${key}`).value = profile.savingThrows[key] ?? "";
  $("status").textContent = "";
}

async function adjustExhaustion(delta) {
  if (!isGM || !item || exhaustionSaving) return;
  const next = Math.max(0, Math.min(5, Number(profile.exhaustion || 0) + delta));
  if (next === profile.exhaustion) return;
  exhaustionSaving = true;
  renderView();
  try {
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: next });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
  } catch (err) {
    console.warn("[initiative-card] Indebolimento:", err?.message || err);
  } finally {
    exhaustionSaving = false;
    renderView();
  }
}

function buildSaveInputs() {
  $("saveInputs").replaceChildren(...SAVE_KEYS.map((key) => {
    const label = document.createElement("label");
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.id = `save-${key}`;
    input.type = "number";
    input.min = "-99";
    input.max = "99";
    label.appendChild(input);
    return label;
  }));
}

OBR.onReady(async () => {
  try {
    const [items, role] = await Promise.all([
      OBR.scene.items.getItems([sourceId]),
      OBR.player.getRole(),
    ]);
    item = items[0] || null;
    isGM = role === "GM";
    if (!item) throw new Error("Token non trovato");
    profile = await loadInitiativeCard(item, { hydrate: isGM });
    buildSaveInputs();
    renderView();
    $("edit").style.display = isGM ? "inline-block" : "none";
    if (isGM && !hasInitiativeCardValues(profile)) setEditing(true);
  } catch (err) {
    $("title").textContent = "Scheda non disponibile";
    $("edit").style.display = "none";
    $("hp").textContent = err?.message || "Errore";
  }
});

$("close").addEventListener("click", closeInitiativeCardPopover);
$("edit").addEventListener("click", () => setEditing(true));
$("cancel").addEventListener("click", () => setEditing(false));
$("exhaustionDown").addEventListener("click", () => void adjustExhaustion(-1));
$("exhaustionUp").addEventListener("click", () => void adjustExhaustion(1));
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isGM || !item) return;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  $("status").textContent = "";
  try {
    const savingThrows = Object.fromEntries(SAVE_KEYS.map((key) => [key, $(`save-${key}`).value]));
    await saveInitiativeCard(item.id, item.name, {
      armorClass: $("armorClassInput").value,
      passivePerception: $("passivePerceptionInput").value,
      speed: $("speedInput").value,
      exhaustion: $("exhaustionInput").value,
      savingThrows,
    });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
    renderView();
    setEditing(false);
  } catch (err) {
    $("status").textContent = err?.message || "Salvataggio non riuscito";
  } finally {
    if (submit) submit.disabled = false;
  }
});
