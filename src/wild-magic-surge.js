import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { CLASS_FEATURE_BY_ID } from "./classFeatureCatalog.js";
import { classFeatureTableText, loadClassFeatureDescriptions } from "./classFeatureDescriptions.js";
import { privateTextMissingNote } from "./privatePackCore.js";
import { getSpellDefinition } from "./spells-srd.js";
import { BUFF_DURATION_UNITS, BUFF_ICONS } from "./buffPresetCore.js";
import { buildSpellUnifiedPanelRouteQuery } from "./spellUnifiedPanelRoutingCore.js";
import {
  planWildMagicSurgeAction,
  rollWildMagicDice,
  WILD_MAGIC_SURGE_ACTIONS,
  WILD_MAGIC_SURGE_FEATURE_ID,
  wildMagicActionSummary,
  wildMagicPillDraft,
  wildMagicRowForRoll,
} from "./wildMagicSurgeCore.js";
import { applyWildMagicSurgePlan, wildMagicTidesSpent } from "./wildMagicSurgeRuntime.js";
import { openTrackedPopover } from "./popoverDragHost.js";

// The Wild Magic Surge engine (wildMagicSurgeCore.js): the GM types the d100 rolled at the table, sees the row,
// and Applica reproduces it where the plugin can; the small builder puts any other outcome on the sorcerer as a pill.
const POPOVER_ID = `${ID}/wild-magic-surge`;
const SPELLS_POPOVER_ID = `${ID}/spells-modal`;
const $ = (id) => document.getElementById(id);
const sorcererId = new URLSearchParams(window.location.search).get("source") || "";
// The rows' ranges and actions come with the catalog; their texts are the Manuale's, from the GM's private pack.
const catalogRows = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID)?.wildMagicTable || [];
let rows = catalogRows;
let sorcererName = "Stregone";
let currentRow = null;
let busy = false;
// This roll's row is already written: a second Applica would write it again, until a new d100 is typed.
let applied = false;

function setStatus(message, kind = "") {
  $("status").textContent = message || "";
  $("status").dataset.kind = kind;
}

// The healing row needs its total: until then Applica stays off and the fixed row says so.
function healTotalMissing() {
  return !!healDice(currentRow) && !(Math.floor(Number($("heal-total").value)) > 0);
}

function syncButtons() {
  $("apply").disabled = busy || !currentRow || applied || healTotalMissing();
  $("pill-apply").disabled = busy || !currentRow;
}

// The fixed row: what is missing, or what Applica does with this row.
function renderSummary() {
  const typed = !!String($("roll").value || "").trim();
  const action = WILD_MAGIC_SURGE_ACTIONS[currentRow?.d100];
  $("summary").dataset.kind = !currentRow && typed ? "warning" : "";
  if (!currentRow) $("summary").textContent = typed ? "Numero fuori tabella (1-100)." : "Manca il d100.";
  else if (applied) $("summary").textContent = "Già applicato: un nuovo d100 per un altro Impulso.";
  else if (healTotalMissing()) $("summary").textContent = "Manca il totale dei PF.";
  else $("summary").textContent = action && action.kind !== "manual" ? "Applica riproduce l'esito." : "Applica non scrive nulla: usa la pillola se serve.";
}

function healDice(row) {
  const action = WILD_MAGIC_SURGE_ACTIONS[row?.d100];
  return action?.kind === "heal" ? action.dice : "";
}

function fillBuilder(row) {
  const draft = wildMagicPillDraft(row);
  $("pill-name").value = draft.name;
  $("pill-icon").value = BUFF_ICONS.includes(draft.icon) ? draft.icon : BUFF_ICONS[0];
  $("pill-notes").value = draft.notes;
  $("pill-duration").value = draft.duration ?? "";
  $("pill-unit").value = draft.unit;
}

function renderRow() {
  const row = wildMagicRowForRoll(rows, $("roll").value);
  currentRow = row;
  applied = false;
  // A message about the row before says nothing about this one.
  setStatus("");
  $("outcome").hidden = !row;
  $("builder").hidden = !row;
  if (!row) {
    renderSummary();
    syncButtons();
    return;
  }
  const action = WILD_MAGIC_SURGE_ACTIONS[row.d100];
  const automated = !!action && action.kind !== "manual";
  $("range").textContent = row.d100;
  $("auto-tag").dataset.auto = String(automated);
  $("auto-tag").textContent = automated ? "Automatico" : "Al tavolo";
  $("effect").textContent = row.effect || privateTextMissingNote("phb2014");
  const spell = row.spellId ? getSpellDefinition(row.spellId) : null;
  $("action-line").textContent = `${wildMagicActionSummary(row)}${spell ? `: ${spell.displayName || spell.name}` : ""}`;
  const notes = [
    action?.kind === "manual" ? action.hint : "",
    action?.note || "",
    row.noConcentration ? "Senza concentrazione: dura per tutta la sua durata e non tocca la concentrazione dello Stregone." : "",
  ].filter(Boolean);
  $("note").hidden = !notes.length;
  $("note").textContent = notes.join(" ");
  const dice = healDice(row);
  $("heal-row").hidden = !dice;
  $("heal-roll").textContent = dice ? `🎲 Tira ${dice}` : "";
  $("heal-total").value = "";
  renderSummary();
  fillBuilder(row);
  $("builder").open = false;
  $("d100").classList.remove("flash");
  void $("d100").offsetWidth;
  $("d100").classList.add("flash");
  syncButtons();
}

async function selectionIds() {
  return Promise.resolve(OBR.player.getSelection()).then((ids) => (Array.isArray(ids) ? ids : [])).catch(() => []);
}

async function openSpellPanel(route) {
  const query = buildSpellUnifiedPanelRouteQuery(route);
  try { await OBR.popover.close(SPELLS_POPOVER_ID); } catch {}
  await openTrackedPopover({
    id: SPELLS_POPOVER_ID,
    url: `/spell-unified-panel.html?${query}`,
    width: 640,
    height: 640,
    anchorReference: "POSITION",
    anchorPosition: { left: 60, top: 60 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
  });
}

async function run(useDraft) {
  if (busy || !currentRow || (applied && !useDraft)) return;
  busy = true;
  syncButtons();
  setStatus("Applicazione…");
  try {
    const row = currentRow;
    const draft = useDraft ? {
      name: $("pill-name").value,
      icon: $("pill-icon").value,
      notes: $("pill-notes").value,
      duration: $("pill-duration").value,
      unit: $("pill-unit").value,
    } : null;
    const plan = planWildMagicSurgeAction(row, {
      sorcererId,
      sorcererName,
      selectionIds: await selectionIds(),
      spell: row.spellId ? getSpellDefinition(row.spellId) : null,
      healTotal: $("heal-total").value,
      draft,
    });
    if (!plan.ok) {
      setStatus(plan.error, "error");
      return;
    }
    const recoverTides = !$("tides-row").hidden && $("tides").checked;
    // The surge is named in History and in the combat log: its roll, its row, what Applica did.
    const record = { sorcererId, sorcererName, recoverTides, row, roll: $("roll").value };
    if (plan.kind === "spell") {
      const spell = getSpellDefinition(row.spellId);
      const spellName = spell?.displayName || spell?.name || row.spellId;
      await applyWildMagicSurgePlan({ ok: true, kind: "manual", hint: "Pannello incantesimi aperto: lancia da lì, senza slot." }, {
        ...record,
        outcome: `lancia ${spellName}${plan.route?.slotLevel ? ` (${plan.route.slotLevel}°)` : ""} senza slot${plan.noConcentration ? ", senza concentrazione" : ""}`,
      });
      await openSpellPanel(plan.route);
      setStatus(`Pannello incantesimi aperto: lancia ${spellName} da lì, senza slot.${recoverTides ? " Onde di Caos recuperate." : ""}`, "ok");
    } else {
      const { message } = await applyWildMagicSurgePlan(plan, record);
      setStatus(message, "ok");
    }
    if (recoverTides) $("tides-row").hidden = true;
    if (!useDraft) {
      applied = true;
      renderSummary();
    }
  } catch (error) {
    setStatus(String(error?.message || error || "Applicazione non riuscita."), "error");
  } finally {
    busy = false;
    syncButtons();
  }
}

$("pill-icon").replaceChildren(...BUFF_ICONS.map((icon) => new Option(icon, icon)));
$("pill-unit").replaceChildren(...BUFF_DURATION_UNITS.map((unit) => new Option(unit.label, unit.id)));
$("roll").addEventListener("input", renderRow);
$("roll").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && currentRow) void run(false);
});
$("random").addEventListener("click", () => {
  $("roll").value = String(1 + Math.floor(Math.random() * 100));
  renderRow();
});
$("heal-roll").addEventListener("click", () => {
  const total = rollWildMagicDice(healDice(currentRow));
  if (total) $("heal-total").value = String(total);
  renderSummary();
  syncButtons();
});
$("heal-total").addEventListener("input", () => {
  renderSummary();
  syncButtons();
});
// Open, the builder can go past the fixed window: the panel brings it into view.
$("builder").addEventListener("toggle", () => {
  if ($("builder").open) $("builder").scrollIntoView({ block: "nearest" });
});
$("apply").addEventListener("click", () => void run(false));
$("pill-apply").addEventListener("click", () => void run(true));
$("close").addEventListener("click", () => void OBR.popover.close(POPOVER_ID).catch(() => {}));

OBR.onReady(async () => {
  await loadClassFeatureDescriptions().catch(() => {});
  rows = catalogRows.map((row) => ({ ...row, effect: row.effect || classFeatureTableText(WILD_MAGIC_SURGE_FEATURE_ID, row.d100) }));
  if (!rows.length) {
    setStatus("Tabella degli Impulsi non disponibile.", "error");
    return;
  }
  const [item] = sorcererId ? await OBR.scene.items.getItems([sorcererId]).catch(() => []) : [];
  if (!item) {
    setStatus("Stregone non trovato sulla scena.", "error");
    return;
  }
  sorcererName = String(item.name || "Stregone").trim() || "Stregone";
  $("subtitle").textContent = sorcererName;
  $("tides-row").hidden = !await wildMagicTidesSpent(sorcererId).catch(() => false);
  $("roll").focus();
});
