import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getQuickActionSpellOptions, getSpellDefinition } from "./spells-srd.js";
import { spellSlotChoices } from "./spellSlotSpendCore.js";
import {
  COUNTERSPELL_OUTCOMES,
  counterspellCheck,
  counterspellOutcome,
  counterspellSuggestedSpellIds,
} from "./counterspellCore.js";
import { castCounterspell, counterspellSlotOptions, loadCounterspellScene } from "./counterspellRuntime.js";
import { COUNTERSPELL_POPOVER_ID } from "./counterspellLauncher.js";
import "./popoverDrag.js";

// Counterspell's popup: who is casting, which spell at which level, the slot it is countered with; the verdict follows
// the PHB 2014 rule (counterspellCore.js) and Lancia casts it with its slot and the reaction (counterspellRuntime.js).
const META_KEY = `${ID}/meta`;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const casterId = params.get("source") || "";
const quickActionId = params.get("quickAction") || "";
const requestedSlotLevel = Number(params.get("slotLevel")) || null;
const requestedSlotSource = params.get("slotSource") || "";
const catalog = getQuickActionSpellOptions();
let scene = { caster: null, candidates: [], unit: "", rangeLimit: 18 };
let slotOptions = [];
let checkResult = "";
let busy = false;
let done = false;

function setStatus(message, tone = "") {
  $("status").textContent = message || "";
  $("status").dataset.tone = tone;
}

const levelLabel = (level) => (level === 0 ? "Trucchetto" : `${level}° liv.`);
const selectedTarget = () => scene.candidates.find((entry) => entry.item.id === $("target").value) || null;
const selectedSlot = () => slotOptions.find((option) => option.value === $("slot").value) || null;
const selectedSpell = () => getSpellDefinition($("spell").value.trim());
const selectedLevel = () => ($("spellLevel").value === "" ? null : Number($("spellLevel").value));

function renderSpellList() {
  const target = selectedTarget()?.item;
  const suggested = new Set(counterspellSuggestedSpellIds(target, META_KEY));
  const ordered = [
    ...catalog.filter((option) => suggested.has(option.id)),
    ...catalog.filter((option) => !suggested.has(option.id)),
  ];
  $("spellList").replaceChildren(...ordered.map((option) => {
    const element = document.createElement("option");
    element.value = option.label;
    element.label = `${suggested.has(option.id) ? "★ " : ""}${levelLabel(option.level)}`;
    return element;
  }));
  $("spellHint").textContent = suggested.size
    ? `★ in cima: gli incantesimi della scheda di ${target.name}.`
    : "Cerca nel catalogo o scrivi un nome libero e il suo livello.";
}

function targetSlotRows(target) {
  const card = target?.metadata?.[META_KEY]?.initiativeCard || {};
  return spellSlotChoices({ characterBuild: card.characterBuild, resources: target?.metadata?.[META_KEY]?.classFeatureState?.resources, spellLevel: 1 });
}

function render() {
  const entry = selectedTarget();
  const level = selectedLevel();
  const slot = selectedSlot();
  $("rangeHint").textContent = entry?.distance === null || entry?.distance === undefined
    ? ""
    : `${entry.inRange ? "A" : "Fuori gittata:"} ${entry.distance} ${scene.unit || ""} dal lanciatore${entry.inRange ? "" : ` (Controincantesimo: ${scene.rangeLimit} ${scene.unit})`}.`;
  $("rangeHint").dataset.tone = entry && !entry.inRange ? "warn" : "";
  const check = counterspellCheck({ slotLevel: slot?.level, spellLevel: level });
  const outcome = counterspellOutcome({ check, checkResult, checkTotal: $("checkTotal").value });
  $("checkBlock").hidden = !check.known || check.automatic;
  for (const button of document.querySelectorAll(".outcomes button")) {
    button.setAttribute("aria-pressed", String(button.dataset.result === checkResult));
  }
  const spellName = $("spell").value.trim() || "l'incantesimo";
  $("verdict").dataset.state = outcome || "pending";
  $("verdictText").replaceChildren(
    document.createTextNode(!check.known ? "Scegli l'incantesimo e il suo livello."
      : check.automatic ? `${spellName} viene annullato.`
        : outcome === COUNTERSPELL_OUTCOMES.COUNTERED ? `Prova riuscita: ${spellName} viene annullato.`
          : outcome === COUNTERSPELL_OUTCOMES.FAILED ? `Prova fallita: ${spellName} ha effetto.`
            : `Prova di caratteristica da incantatore, CD ${check.dc}.`),
    Object.assign(document.createElement("small"), {
      textContent: !check.known ? "Fino al livello dello slot è automatico."
        : check.automatic ? `Slot ${check.slotLevel}° ≥ ${level === 0 ? "trucchetto" : `${level}°`}: annullamento automatico.`
          : `${level}° livello oltre lo slot ${check.slotLevel}°: serve la prova.`,
    }),
  );
  const target = entry?.item;
  const slots = targetSlotRows(target);
  $("targetSlotRow").hidden = !target || !slots.length || !(level >= 1) || outcome === COUNTERSPELL_OUTCOMES.FAILED;
  $("targetSlotText").textContent = `${target?.name || "Il lanciatore"} perde lo slot di ${level}° livello`;
  $("cast").disabled = busy || done || !entry || !$("spell").value.trim() || level === null || !outcome;
}

async function cast() {
  if (busy || done) return;
  busy = true;
  render();
  setStatus("Registrazione…");
  try {
    const spell = selectedSpell();
    const result = await castCounterspell({
      casterId,
      quickActionId,
      slot: selectedSlot(),
      targetId: $("target").value,
      spell,
      spellName: $("spell").value.trim(),
      spellLevel: selectedLevel(),
      checkResult,
      checkTotal: $("checkTotal").value,
      spendTargetSlot: !$("targetSlotRow").hidden && $("targetSlot").checked,
    }, { confirm: async (message) => window.confirm(message) });
    if (result.status === "cast") {
      done = true;
      setStatus(result.message, "ok");
      window.setTimeout(() => void OBR.popover.close(COUNTERSPELL_POPOVER_ID).catch(() => {}), 2500);
    } else {
      setStatus(result.message, result.status === "invalid" ? "error" : "");
    }
  } catch (error) {
    setStatus(String(error?.message || error || "Lancio non riuscito."), "error");
  } finally {
    busy = false;
    render();
  }
}

$("spellLevel").replaceChildren(
  new Option("Livello", ""),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => new Option(level === 0 ? "Trucchetto" : `${level}°`, String(level))),
);
$("spell").addEventListener("input", () => {
  const spell = selectedSpell();
  if (spell) $("spellLevel").value = String(spell.level);
  render();
});
$("spellLevel").addEventListener("change", render);
$("slot").addEventListener("change", render);
$("target").addEventListener("change", () => { renderSpellList(); render(); });
$("checkTotal").addEventListener("input", () => { checkResult = ""; render(); });
for (const button of document.querySelectorAll(".outcomes button")) {
  button.addEventListener("click", () => {
    checkResult = button.dataset.result === checkResult ? "" : button.dataset.result;
    $("checkTotal").value = "";
    render();
  });
}
$("targetSlot").addEventListener("change", render);
$("cast").addEventListener("click", () => void cast());
$("close").addEventListener("click", () => void OBR.popover.close(COUNTERSPELL_POPOVER_ID).catch(() => {}));

OBR.onReady(async () => {
  scene = await loadCounterspellScene(casterId);
  if (!scene.caster) {
    setStatus("Il lanciatore non è sulla scena.", "error");
    return;
  }
  $("title").textContent = scene.caster.name || "Controincantesimo";
  $("target").replaceChildren(
    new Option("— Scegli la creatura —", ""),
    ...scene.candidates.map((entry) => new Option(
      `${entry.item.name || "Creatura"}${entry.distance === null ? "" : ` · ${entry.distance} ${scene.unit}`}${entry.inRange ? "" : " · fuori gittata"}`,
      entry.item.id,
    )),
  );
  // The creature selected on the map, when there is one, is the likely caster being countered.
  const selection = await OBR.player.getSelection().catch(() => []);
  const picked = (selection || []).find((id) => scene.candidates.some((entry) => entry.item.id === id));
  if (picked) $("target").value = picked;
  slotOptions = counterspellSlotOptions(scene.caster);
  $("slot").replaceChildren(...slotOptions.map((option) => {
    const element = new Option(`${option.label}${option.value.startsWith("free-") ? " · senza slot" : ""}`, option.value);
    element.disabled = !option.available;
    return element;
  }));
  const preferred = slotOptions.find((option) => option.available
    && (requestedSlotSource ? option.source === requestedSlotSource : !requestedSlotLevel || option.level === requestedSlotLevel))
    || slotOptions.find((option) => option.available) || slotOptions[0];
  if (preferred) $("slot").value = preferred.value;
  renderSpellList();
  render();
  $("spell").focus();
});
