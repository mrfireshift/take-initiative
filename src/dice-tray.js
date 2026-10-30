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
  assignedCharacterName,
  diceCountsOf,
  diceRollAuthor,
  formulaWithDie,
  readDiceSessionHistory,
  rememberDiceRoll,
} from "./diceTrayCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectDiceSoundsEnabled, selectDiceStyle } from "./options/optionsSelectors.js";

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
const styleSelect = $("diceStyle");
const historyPanel = $("history");
const historyToggle = $("historyToggle");
const soundToggle = $("soundToggle");

let tray = null;
let sound = null;
let rolling = false;
let player = { id: "", connectionId: "", name: "" };
let isGm = false;

for (const key of DICE_STYLE_KEYS) styleSelect.append(new Option(STYLE_LABELS[key] || key, key));

const dieButtons = new Map(DIE_BUTTONS.map((sides) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "die";
  button.textContent = `d${sides}`;
  button.title = `Aggiungi un d${sides} (clic destro per toglierlo)`;
  button.addEventListener("click", () => editFormula(formulaWithDie(formula.value, sides, 1)));
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editFormula(formulaWithDie(formula.value, sides, -1));
  });
  $("dice").append(button);
  return [sides, button];
}));

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
  soundToggle.textContent = on ? "🔊" : "🔇";
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
    total.textContent = "";
    return;
  }
  rolling = true;
  rollButton.disabled = true;
  const result = rollDiceFormula(parsed);
  const style = normalizeDiceStyle(styleSelect.value);
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
  total.textContent = "…";
  setDetail(result.formula);
  historyPanel.hidden = true;
  historyToggle.setAttribute("aria-pressed", "false");
  try {
    await tray.roll(record, { style, ...soundHooks() });
    total.textContent = String(result.total);
    setDetail(diceRollDetail(result));
    rememberDiceRoll(record);
  } catch (error) {
    total.textContent = "";
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
advantage.addEventListener("click", () => setMode(advantage));
disadvantage.addEventListener("click", () => setMode(disadvantage));
hiddenToggle.addEventListener("click", () => {
  hiddenToggle.setAttribute("aria-pressed", String(hiddenToggle.getAttribute("aria-pressed") !== "true"));
});
rollButton.addEventListener("click", () => void roll());
historyToggle.addEventListener("click", () => {
  const show = historyPanel.hidden;
  if (show) renderHistory();
  historyPanel.hidden = !show;
  historyToggle.setAttribute("aria-pressed", String(show));
});
soundToggle.addEventListener("click", () => {
  const on = !soundsOn();
  renderSoundToggle(on);
  if (on) sound?.unlock();
  void runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tools: { ...(current.tools || {}), diceSounds: on },
  })).catch((error) => console.warn("[dice-tray] suoni non salvati:", error?.message || error));
});
styleSelect.addEventListener("change", () => {
  void runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tools: { ...(current.tools || {}), diceStyle: normalizeDiceStyle(styleSelect.value) },
  })).catch((error) => console.warn("[dice-tray] stile non salvato:", error?.message || error));
});
const close = () => void OBR.popover.close(POPOVER_ID).catch(() => {});
$("close").addEventListener("click", close);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && event.target !== formula) close();
});

OBR.onReady(async () => {
  await startRuntimeOptions().catch(() => {});
  try { styleSelect.value = normalizeDiceStyle(runtimeOptionsService.get(selectDiceStyle)); } catch {}
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
