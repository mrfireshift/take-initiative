import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getSpellBoardTokenRule, spellBoardTokenView, SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";
import { spellBoardTokenPortraitUrl } from "./spellBoardTokenTrackerCore.js";

// A summoned token's sheet (Mano arcana): read-only, from its rule and its canonical HP; nothing is written.
const MODAL_ID = `${ID}/spell-board-token-card`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const META_KEY = `${ID}/meta`;
const sourceId = new URLSearchParams(window.location.search).get("source") || "";
const $ = (id) => document.getElementById(id);
const SIZE_LABELS = { Tiny: "Minuscolo", Small: "Piccolo", Medium: "Medio", Large: "Grande", Huge: "Enorme" };

const meters = (value) => (Number.isFinite(Number(value)) && Number(value) > 0
  ? `${String(Number(value)).replace(".", ",")} m`
  : "—");
const modifier = (score) => {
  const value = Math.floor((Number(score) - 10) / 2);
  return Number.isFinite(value) ? (value >= 0 ? `+${value}` : String(value)) : "";
};

function close() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, { type: "closed", id: MODAL_ID }, { destination: "LOCAL" })
    .catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

function render(item, casterName) {
  const view = spellBoardTokenView(item);
  const rule = getSpellBoardTokenRule(view?.spellId);
  if (!view || !rule) {
    $("title").textContent = "Scheda non disponibile";
    $("notes").textContent = "La pedina non è più sulla mappa.";
    return;
  }
  const meta = item.metadata?.[META_KEY] || {};
  const attitude = String(meta.attitude || "ally").trim();
  document.documentElement.dataset.faction = ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "ally";
  $("portrait").src = spellBoardTokenPortraitUrl(item, rule.assetPath);
  $("eyebrow").textContent = `Evocazione · ${view.label}`;
  $("title").textContent = item.name || view.label;
  $("subtitle").textContent = [
    `Oggetto ${SIZE_LABELS[view.sizeCategory] || ""}`.trim(),
    view.fillsSpace ? "" : "non riempie il suo spazio",
    casterName ? `di ${casterName}` : "",
  ].filter(Boolean).join(" · ");
  const hp = Number(view.state?.hp);
  const hpMax = Number(view.state?.hpMax);
  $("hp").textContent = Number.isFinite(hp) && Number.isFinite(hpMax) ? `${hp} / ${hpMax}` : "—";
  $("armorClass").textContent = view.armorClass ?? "—";
  $("reach").textContent = meters(view.reachMeters);
  $("strength").textContent = view.strength ?? "—";
  $("strengthModifier").textContent = view.strength != null ? modifier(view.strength) : "";
  $("dexterity").textContent = view.dexterity ?? "—";
  $("dexterityModifier").textContent = view.dexterity != null ? modifier(view.dexterity) : "";
  $("speed").textContent = meters(view.movementMeters);
  $("fly").textContent = rule.flies === true ? meters(view.movementMeters) : "—";
  $("notes").replaceChildren(...[
    "Si muove e agisce nel turno del caster, con la sua azione bonus: il controllo velocità ne conta i metri a parte.",
    rule.spellId === "arcane-hand" ? "A 0 PF la mano scompare e l'incantesimo termina." : "",
  ].filter(Boolean).map((text) => Object.assign(document.createElement("p"), { textContent: text })));
}

async function refresh() {
  const [item] = await OBR.scene.items.getItems([sourceId]);
  if (!item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]) {
    render(null, "");
    return;
  }
  const casterId = String(item.metadata[SPELL_BOARD_TOKEN_META_KEY].casterId || "").trim();
  const [caster] = casterId ? await OBR.scene.items.getItems([casterId]).catch(() => []) : [];
  render(item, String(caster?.name || "").trim());
}

$("close").addEventListener("click", close);
OBR.onReady(async () => {
  try {
    await refresh();
  } catch (error) {
    $("title").textContent = "Scheda non disponibile";
    $("notes").textContent = String(error?.message || error);
  }
  // Its HP change under the GM's eyes (a hit, the HP editor): the sheet follows, and says so when the token goes.
  let signature = "";
  OBR.scene.items.onChange((items) => {
    const item = items.find((entry) => entry.id === sourceId);
    const meta = item?.metadata?.[META_KEY] || {};
    const next = item ? JSON.stringify([item.name, meta.hp, meta.hpMax, meta.attitude]) : "removed";
    if (next === signature) return;
    signature = next;
    void refresh().catch(() => {});
  });
});
