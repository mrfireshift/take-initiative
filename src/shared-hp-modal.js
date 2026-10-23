import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSharedHpController } from "./sharedHpController.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { getEffectsMutationSceneContext, runEffectsMutation } from "./effectsMutations.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

const KEY = `${ID}/meta`;
const lifecycle = createSceneLifecycleAdapter({ obr: OBR });
const tokenIds = [...new Set(new URLSearchParams(location.search).getAll("tokenId"))];
const $ = id => document.getElementById(id);
let view = null; let busy = false; let loadRevision = 0; let unsubscribeItems = null;
const controller = createSharedHpController({ api: OBR, runMutation: runEffectsMutation,
  getSceneContext: async () => {
    const local = lifecycle.capture({ operationId: `shared-hp:${crypto.randomUUID()}` });
    const remote = await getEffectsMutationSceneContext({ commandId: local.operationId });
    return { ...remote, local };
  }, isCurrent: context => lifecycle.isCurrent(context?.local),
});
const name = item => item?.name || item?.id || "Token assente";
const hp = item => `${item?.metadata?.[KEY]?.hp ?? "?"}/${item?.metadata?.[KEY]?.hpMax ?? "?"}`;
function node(tag, className, text) {
  const element = document.createElement(tag); element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setStatus(message, tone = "") {
  $("status").textContent = message; $("status").dataset.tone = tone;
}
function renderPreview() {
  const source = view?.items.find(item => item.id === $("source").value);
  const targets = view?.tokens.filter(item => item.id !== source?.id) || [];
  const count = view?.tokens.length || 0;
  $("selection").textContent = count === 1 ? name(view.tokens[0]) : `${count} token selezionati`;
  $("source-summary").hidden = !source;
  $("source-name").textContent = source ? name(source) : "";
  $("source-hp").textContent = source ? `${hp(source)} HP` : "";
  $("tracker-visibility").value = source?.metadata?.[KEY]?.sharedHpTrackerVisibility === "all" ? "all" : "gm";
  $("tracker-visibility").disabled = busy || !source;
  $("preview-count").textContent = source && targets.length ? String(targets.length) : "";
  $("preview").replaceChildren();
  if (source && targets.length) {
    for (const item of targets) {
      const row = node("div", "preview-row");
      const identity = node("div", "identity");
      const label = node("span", "token-name", name(item)); label.title = name(item);
      identity.append(label, node("span", "hint", item.metadata?.[KEY]?.sharedHpSourceId === source.id
        ? "Già collegato · fuori iniziativa" : "Secondario · fuori iniziativa"));
      row.append(identity, node("span", "hp", `${hp(item)} → ${hp(source)}`)); $("preview").append(row);
    }
  } else $("preview").append(node("div", "empty", source
    ? "Seleziona i token secondari sulla mappa e riapri HP condivisi per collegarli."
    : "Scegli il token principale per vedere gli HP che verranno condivisi."));
  const alreadyLinked = !!source && targets.length > 0
    && targets.every(item => item.metadata?.[KEY]?.sharedHpSourceId === source.id);
  $("preview-section").hidden = alreadyLinked;
  $("link").hidden = alreadyLinked;
  $("link").disabled = busy || !source || !targets.length || alreadyLinked;
  $("members").replaceChildren();
  const members = view?.items.filter(item => item.metadata?.[KEY]?.sharedHpSourceId
    && (item.metadata[KEY].sharedHpSourceId === source?.id || tokenIds.includes(item.id))) || [];
  for (const item of members) {
    const root = view.items.find(candidate => candidate.id === item.metadata[KEY].sharedHpSourceId);
    const row = node("div", `row${root ? "" : " broken"}`);
    const identity = node("div", "identity");
    const label = node("span", "token-name", name(item)); label.title = name(item);
    identity.append(label, node("span", "token-detail", root ? `Condivide HP con ${name(root)}` : "Collegamento interrotto: principale assente"));
    const actions = node("div", "row-actions");
    const button = node("button", "button subtle", "Scollega"); button.type = "button"; button.disabled = busy;
    button.setAttribute("aria-label", `Scollega ${name(item)}`);
    button.addEventListener("click", () => act("unlink", [item.id]));
    actions.append(button); row.append(identity, node("span", "hp", `${hp(item)} HP`), actions); $("members").append(row);
  }
  $("member-count").textContent = members.length ? String(members.length) : "";
  if (!members.length) $("members").append(node("div", "empty", "Nessun token collegato a questa riserva."));
  $("unlink-selection").disabled = busy || !view?.tokens.some(item => item.metadata?.[KEY]?.sharedHpSourceId);
  $("unlink-all").disabled = busy || !members.some(item => item.metadata[KEY].sharedHpSourceId === source?.id);
  $("source").disabled = busy;
  $("refresh").disabled = busy;
}
async function load() {
  const revision = ++loadRevision;
  const nextView = await controller.read(tokenIds);
  if (revision !== loadRevision || !lifecycle.isCurrent(nextView.context.local)) return;
  const previous = $("source").value;
  view = nextView;
  $("source").replaceChildren(new Option("Scegli il principale…", ""), ...view.candidates.map(item => new Option(`${name(item)} · ${hp(item)}`, item.id)));
  $("source").value = previous || view.tokens.find(item => item.metadata?.[KEY]?.sharedHpSourceId)?.metadata[KEY].sharedHpSourceId
    || (view.tokens.length === 1 && view.items.some(item => item.metadata?.[KEY]?.sharedHpSourceId === view.tokens[0].id) ? view.tokens[0].id : "");
  renderPreview();
}
async function act(kind, ids) {
  if (busy || !view || !lifecycle.isCurrent(view.context.local)) return;
  busy = true; renderPreview(); setStatus("Salvataggio…");
  try {
    const source = view.items.find(item => item.id === $("source").value);
    const context = { ...view.context, commandId: `shared-hp:${crypto.randomUUID()}`,
      ...(source ? { expectedSourceHP: { hp: source.metadata[KEY].hp, hpMax: source.metadata[KEY].hpMax } } : {}) };
    const result = kind === "link" ? await controller.link(source.id, view.tokens.filter(item => item.id !== source.id).map(item => item.id), context)
      : kind === "visibility" ? await controller.setVisibility(source.id, ids[0], context) : await controller.unlink(ids, context);
    if (result.status !== "applied") throw new Error(result.conflicts?.[0]?.reason || result.reason || "Collegamento non applicato");
    setStatus(result.historyPending ? "Modifica applicata; registrazione nella cronologia in corso." : "Modifica applicata.", "success");
    await load();
  } catch { setStatus("Modifica non applicata. Aggiorna il pannello e verifica il principale e i token selezionati.", "error"); }
  finally { busy = false; renderPreview(); }
}
$("source").addEventListener("change", renderPreview);
$("tracker-visibility").addEventListener("change", () => act("visibility", [$("tracker-visibility").value]));
$("link").addEventListener("click", () => act("link"));
$("unlink-selection").addEventListener("click", () => act("unlink", view.tokens.filter(item => item.metadata?.[KEY]?.sharedHpSourceId).map(item => item.id)));
$("unlink-all").addEventListener("click", () => act("unlink", view.items.filter(item => item.metadata?.[KEY]?.sharedHpSourceId === $("source").value).map(item => item.id)));
$("close").addEventListener("click", () => OBR.popover.close(`${ID}/shared-hp-modal`));
$("refresh").addEventListener("click", () => { if (!busy) return load().catch(() => setStatus("Impossibile aggiornare. Riapri HP condivisi.", "error")); });
OBR.onReady(async () => {
  try {
    await lifecycle.mount(); await load();
    unsubscribeItems = subscribeSceneItemChanges(() => {
      if (!busy) void load().catch(() => setStatus("Impossibile aggiornare. Riapri HP condivisi.", "error"));
    }, { filter: event => event.flags.hpBars || event.flags.trackerStructure });
  } catch (error) { setStatus(error.message, "error"); }
});
lifecycle.subscribe(event => { if (event.phase === "unavailable") { busy = true; ++loadRevision; renderPreview(); setStatus("Scena cambiata: riapri HP condivisi.", "error"); } });
window.addEventListener("pagehide", () => { unsubscribeItems?.(); lifecycle.dispose(); });
