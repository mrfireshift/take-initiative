// The Online dice tray (docs/PIANO_DADI_ONLINE.md, lot D-3): a popover opened by the 🎲 of the tracker, Online room
// profile only. The roller's browser draws the values (diceCore.js), the 3D tray shows them (diceScene.js). The
// GM's hidden roll stays on this screen. Every other roll goes to the other screens (lot D-4, diceRollHost.js) and
// stays as this player's latest roll in their player metadata.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  createDiceRollRecord,
  diceRollDetail,
  diceRollHistoryWith,
  diceThrowParameters,
  normalizeDiceRollRecord,
  parseDiceFormula,
  physicalDiceOf,
  rollDiceFormula,
  withAdvantage,
} from "./diceCore.js";
import { DICE_STYLE_KEYS, normalizeDiceStyle } from "./diceStyles.js";
import {
  DICE_LAST_ROLL_KEY,
  DICE_ROLL_CHANNEL,
  DICE_TRAY_STATE_CHANNEL,
  assignedCharacterName,
  diceCountsOf,
  diceRollAuthor,
  formulaWithDie,
  readDiceSessionHistory,
  rememberDiceRoll,
} from "./diceTrayCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectDiceSoundsEnabled, selectDiceStyle } from "./options/optionsSelectors.js";
// The header moves the panel, as in the other panels of the plugin (the tracker opens it with openTrackedPopover).
import "./popoverDrag.js";

const POPOVER_ID = `${ID}/dice-tray`;
const DIE_BUTTONS = [4, 6, 8, 10, 12, 20, 100];
const STYLE_LABELS = Object.freeze({
  galaxy: "Galassia", gemstone: "Gemma", glass: "Vetro", iron: "Ferro",
  nebula: "Nebulosa", sunrise: "Alba", sunset: "Tramonto", walnut: "Noce",
});

const $ = (id) => document.getElementById(id);
const formula = $("formula");
const detail = $("detail");
const total = $("total");
const rollButton = $("roll");
const advantage = $("advantage");
const disadvantage = $("disadvantage");
const hiddenToggle = $("hidden");
const styleButton = $("styleButton");
const styleMenu = $("styleMenu");
const historyPanel = $("history");
const historyToggle = $("historyToggle");
const score = $("score");
const clearTray = $("clearTray");
const soundToggle = $("soundToggle");

let tray = null;
let sound = null;
let rolling = false;
let player = { id: "", connectionId: "", name: "" };
let isGm = false;
let currentStyle = normalizeDiceStyle(null);

// The pictures of Owlbear Rodeo Dice (public/dice/previews): each die in each style.
const BASE = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
const previewUrl = (style, sides) => `${BASE}dice/previews/${style}/d${sides}.png`;

const styleChoices = new Map(DICE_STYLE_KEYS.map((key) => {
  const choice = document.createElement("button");
  choice.type = "button";
  choice.className = "style-choice";
  choice.setAttribute("role", "radio");
  const picture = document.createElement("img");
  picture.alt = "";
  picture.loading = "lazy";
  picture.src = previewUrl(key, 20);
  choice.append(picture, document.createTextNode(STYLE_LABELS[key] || key));
  choice.addEventListener("click", () => {
    chooseStyle(key);
    showStyleMenu(false);
  });
  $("styleList").append(choice);
  return [key, choice];
}));

const dieButtons = new Map(DIE_BUTTONS.map((sides) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "picture-button";
  button.title = `d${sides}: clic per aggiungerlo, clic destro per toglierlo`;
  button.setAttribute("aria-label", `d${sides}`);
  const picture = document.createElement("img");
  picture.alt = "";
  button.append(picture);
  button.addEventListener("click", () => editFormula(formulaWithDie(formula.value, sides, 1)));
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editFormula(formulaWithDie(formula.value, sides, -1));
  });
  $("dice").append(button);
  return [sides, button];
}));
renderStyle();

function renderStyle() {
  $("styleImage").src = previewUrl(currentStyle, 20);
  styleButton.title = `Stile dei dadi: ${STYLE_LABELS[currentStyle] || currentStyle}`;
  for (const [sides, button] of dieButtons) button.querySelector("img").src = previewUrl(currentStyle, sides);
  for (const [key, choice] of styleChoices) choice.setAttribute("aria-checked", String(key === currentStyle));
}

function chooseStyle(key) {
  currentStyle = normalizeDiceStyle(key);
  renderStyle();
  void runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tools: { ...(current.tools || {}), diceStyle: currentStyle },
  })).catch((error) => console.warn("[dice-tray] stile non salvato:", error?.message || error));
}

// The style menu and the history share the tray's space: one at a time.
function showStyleMenu(show) {
  styleMenu.hidden = !show;
  styleButton.setAttribute("aria-expanded", String(show));
  if (show) showHistory(false);
}

function showHistory(show) {
  if (show) renderHistory();
  historyPanel.hidden = !show;
  historyToggle.setAttribute("aria-pressed", String(show));
  if (show) showStyleMenu(false);
}

function renderCounts() {
  const counts = diceCountsOf(formula.value);
  for (const [sides, button] of dieButtons) {
    button.querySelector(".count")?.remove();
    if (!counts[sides]) continue;
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(counts[sides]);
    button.append(badge);
  }
}

function editFormula(text) {
  formula.value = text;
  renderCounts();
  setDetail("");
}

// The result over the tray; the × empties the tray.
function showScore(result) {
  score.hidden = !result;
  total.textContent = result ? String(result.total) : "";
  $("breakdown").textContent = result ? diceRollDetail(result) : "";
}

function emptyTray() {
  tray?.clear();
  showScore(null);
  clearTray.hidden = true;
  setDetail("");
}

function setDetail(text, tone = "") {
  detail.textContent = text;
  detail.dataset.tone = tone;
}

function setMode(button) {
  for (const toggle of [advantage, disadvantage]) {
    toggle.setAttribute("aria-pressed", String(toggle === button && toggle.getAttribute("aria-pressed") !== "true"));
  }
}

// The session's rolls, this screen's and the others' (the background's host keeps them). `arrived` is a roll just
// received, which the host may not have written yet.
function renderHistory(arrived = null) {
  const list = $("historyList");
  const history = arrived ? diceRollHistoryWith(readDiceSessionHistory(), arrived) : readDiceSessionHistory();
  list.replaceChildren(...history.map((record) => {
    const item = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${diceRollAuthor(record)}${record.hidden ? " · nascosto" : ""}`;
    const value = document.createElement("span");
    value.className = "total";
    value.textContent = String(record.total);
    const line = document.createElement("span");
    line.className = "formula";
    line.textContent = `${record.formula} · ${new Date(record.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    item.append(who, value, line);
    return item;
  }));
  if (!list.children.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nessun tiro in questa sessione.";
    list.append(empty);
  }
}

async function characterName() {
  try { return assignedCharacterName(await OBR.scene.items.getItems(), player.id); } catch { return ""; }
}

// The others see the roll while this tray plays it; a screen that opens later finds it in the player metadata.
async function shareRoll(record) {
  if (record.hidden) return;
  await Promise.all([
    OBR.broadcast.sendMessage(DICE_ROLL_CHANNEL, record, { destination: "REMOTE" }),
    OBR.player.setMetadata({ [DICE_LAST_ROLL_KEY]: record }),
  ]).catch((error) => console.warn("[dice-tray] tiro non condiviso:", error?.message || error));
}

// Lot D-5: the impact sounds, unless this browser turned them off.
function soundsOn() {
  return soundToggle.getAttribute("aria-pressed") === "true";
}

function soundHooks() {
  if (!sound || !soundsOn()) return {};
  return { onPrepare: (sounds) => sound.prepare(sounds), onImpact: (impact) => void sound.play(impact) };
}

function renderSoundToggle(on) {
  soundToggle.setAttribute("aria-pressed", String(on));
  soundToggle.querySelector(".sound-on").setAttribute("display", on ? "inline" : "none");
  soundToggle.querySelector(".sound-off").setAttribute("display", on ? "none" : "inline");
  soundToggle.title = on ? "Suoni dei dadi: attivi" : "Suoni dei dadi: spenti";
}

async function roll() {
  if (rolling || !tray) return;
  sound?.unlock();
  const mode = advantage.getAttribute("aria-pressed") === "true"
    ? "advantage"
    : disadvantage.getAttribute("aria-pressed") === "true" ? "disadvantage" : null;
  const parsed = withAdvantage(parseDiceFormula(formula.value), mode);
  if (!parsed.ok) {
    setDetail(parsed.error, "error");
    return;
  }
  rolling = true;
  rollButton.disabled = true;
  const result = rollDiceFormula(parsed);
  const style = currentStyle;
  const record = createDiceRollRecord({
    id: globalThis.crypto.randomUUID(),
    result,
    throws: diceThrowParameters(physicalDiceOf(result).length),
    player,
    character: await characterName(),
    style,
    hidden: isGm && hiddenToggle.getAttribute("aria-pressed") === "true",
  });
  void shareRoll(record);
  showScore(null);
  clearTray.hidden = false;
  setDetail(`Tiro: ${result.formula}`);
  showHistory(false);
  showStyleMenu(false);
  try {
    const shown = await tray.roll(record, { style, ...soundHooks() });
    rememberDiceRoll(record);
    // An emptied tray keeps its result off.
    if (shown) showScore(result);
  } catch (error) {
    showScore(null);
    setDetail(`Tiro non riuscito: ${error?.message || error}`, "error");
  } finally {
    rolling = false;
    rollButton.disabled = false;
  }
}

formula.addEventListener("input", () => { renderCounts(); setDetail(""); });
formula.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void roll();
  }
});
$("clear").addEventListener("click", () => editFormula(""));
clearTray.addEventListener("click", emptyTray);
advantage.addEventListener("click", () => setMode(advantage));
disadvantage.addEventListener("click", () => setMode(disadvantage));
hiddenToggle.addEventListener("click", () => {
  hiddenToggle.setAttribute("aria-pressed", String(hiddenToggle.getAttribute("aria-pressed") !== "true"));
});
rollButton.addEventListener("click", () => void roll());
historyToggle.addEventListener("click", () => showHistory(historyPanel.hidden));
styleButton.addEventListener("click", () => showStyleMenu(styleMenu.hidden));
soundToggle.addEventListener("click", () => {
  const on = !soundsOn();
  renderSoundToggle(on);
  if (on) sound?.unlock();
  void runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tools: { ...(current.tools || {}), diceSounds: on },
  })).catch((error) => console.warn("[dice-tray] suoni non salvati:", error?.message || error));
});
// The toolbar's 🎲 toggles the tray: it needs to know whether the tray is open.
const sayOpen = (open) => void OBR.broadcast.sendMessage(DICE_TRAY_STATE_CHANNEL, { open }, { destination: "LOCAL" }).catch(() => {});
window.addEventListener("pagehide", () => sayOpen(false));
const close = () => {
  sayOpen(false);
  void OBR.popover.close(POPOVER_ID).catch(() => {});
};
$("close").addEventListener("click", close);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!styleMenu.hidden || !historyPanel.hidden) {
    showStyleMenu(false);
    showHistory(false);
  } else if (event.target !== formula) close();
});

OBR.onReady(async () => {
  sayOpen(true);
  await startRuntimeOptions().catch(() => {});
  try { currentStyle = normalizeDiceStyle(runtimeOptionsService.get(selectDiceStyle)); } catch {}
  renderStyle();
  try { renderSoundToggle(runtimeOptionsService.get(selectDiceSoundsEnabled) !== false); } catch {}
  const [role, name, connectionId] = await Promise.all([
    OBR.player.getRole().catch(() => "PLAYER"),
    OBR.player.getName().catch(() => ""),
    OBR.player.getConnectionId().catch(() => ""),
  ]);
  isGm = role === "GM";
  hiddenToggle.hidden = !isGm;
  player = { id: String(OBR.player.id || ""), connectionId: String(connectionId || ""), name: String(name || "") };
  OBR.broadcast.onMessage(DICE_ROLL_CHANNEL, (event) => {
    const record = normalizeDiceRollRecord(event?.data);
    if (record && !historyPanel.hidden) renderHistory(record);
  });
  // The 3D code and the assets load with the tray only (three.js, cannon-es and the Dice's models).
  const [{ createDiceTray }, { createDiceSound }] = await Promise.all([import("./diceScene.js"), import("./diceSound.js")]);
  const canvas = $("tray");
  sound = createDiceSound({ base: import.meta.env.BASE_URL || "/" });
  tray = await createDiceTray({ canvas, base: import.meta.env.BASE_URL || "/" });
  const fit = () => tray.resize(canvas.clientWidth, canvas.clientHeight);
  new ResizeObserver(fit).observe(canvas);
  fit();
  $("loading").remove();
  formula.focus();
});
