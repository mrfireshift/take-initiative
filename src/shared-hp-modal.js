import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSharedHpController } from "./sharedHpController.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { getEffectsMutationSceneContext, runEffectsMutation } from "./effectsMutations.js";

const KEY = `${ID}/meta`;
const lifecycle = createSceneLifecycleAdapter({ obr: OBR });
const tokenIds = [...new Set(new URLSearchParams(location.search).getAll("tokenId"))];
const $ = id => document.getElementById(id);
let view = null; let busy = false;
const controller = createSharedHpController({ api: OBR, runMutation: runEffectsMutation,
  getSceneContext: async () => {
    const local = lifecycle.capture({ operationId: `shared-hp:${crypto.randomUUID()}` });
    const remote = await getEffectsMutationSceneContext({ commandId: local.operationId });
    return { ...remote, local };
  }, isCurrent: context => lifecycle.isCurrent(context?.local),
});
const name = item => item?.name || item?.id || "Token assente";
const hp = item => `${item?.metadata?.[KEY]?.hp ?? "?"}/${item?.metadata?.[KEY]?.hpMax ?? "?"}`;
function renderPreview() {
  const source = view?.items.find(item => item.id === $("source").value);
  const targets = view?.tokens.filter(item => item.id !== source?.id) || [];
  $("selection").textContent = `Selezionati: ${view?.tokens.map(name).join(", ") || "nessuno"}`;
  $("preview").textContent = source && targets.length
    ? targets.map(item => `${name(item)}: ${hp(item)} → ${hp(source)} · fuori iniziativa`).join("\n")
    : "Scegli il principale e seleziona almeno un token secondario sulla mappa.";
  $("link").disabled = busy || !source || !targets.length;
  $("members").replaceChildren();
  const members = view?.items.filter(item => item.metadata?.[KEY]?.sharedHpSourceId
    && (item.metadata[KEY].sharedHpSourceId === source?.id || tokenIds.includes(item.id))) || [];
  for (const item of members) {
    const root = view.items.find(candidate => candidate.id === item.metadata[KEY].sharedHpSourceId);
    const row = document.createElement("div"); row.className = "row";
    const label = document.createElement("span"); label.textContent = `${name(item)} → ${root ? name(root) : "Collegamento interrotto"} · ${hp(item)}`;
    const button = document.createElement("button"); button.textContent = "Scollega"; button.disabled = busy;
    button.addEventListener("click", () => act("unlink", [item.id])); row.append(label, button); $("members").append(row);
  }
  if (!members.length) $("members").textContent = "Nessun collegamento per questa selezione.";
  $("unlink-selection").disabled = busy || !view?.tokens.some(item => item.metadata?.[KEY]?.sharedHpSourceId);
  $("unlink-all").disabled = busy || !members.some(item => item.metadata[KEY].sharedHpSourceId === source?.id);
  $("source").disabled = busy;
}
async function load() {
  const previous = $("source").value;
  view = await controller.read(tokenIds);
  $("source").replaceChildren(new Option("Scegli il principale…", ""), ...view.candidates.map(item => new Option(`${name(item)} · ${hp(item)}`, item.id)));
  $("source").value = previous || view.tokens.find(item => item.metadata?.[KEY]?.sharedHpSourceId)?.metadata[KEY].sharedHpSourceId
    || (view.tokens.length === 1 && view.items.some(item => item.metadata?.[KEY]?.sharedHpSourceId === view.tokens[0].id) ? view.tokens[0].id : "");
  renderPreview();
}
async function act(kind, ids) {
  if (busy || !view || !lifecycle.isCurrent(view.context.local)) return;
  busy = true; renderPreview(); $("status").textContent = "Salvataggio…";
  try {
    const source = view.items.find(item => item.id === $("source").value);
    const context = { ...view.context, commandId: `shared-hp:${crypto.randomUUID()}`,
      ...(source ? { expectedSourceHP: { hp: source.metadata[KEY].hp, hpMax: source.metadata[KEY].hpMax } } : {}) };
    const result = kind === "link" ? await controller.link(source.id, view.tokens.filter(item => item.id !== source.id).map(item => item.id), context)
      : await controller.unlink(ids, context);
    if (result.status !== "applied") throw new Error(result.conflicts?.[0]?.reason || result.reason || "Collegamento non applicato");
    $("status").textContent = result.historyPending ? "Modifica applicata; registrazione Undo in corso." : "Modifica applicata.";
    await load();
  } catch (error) { $("status").textContent = `${error.message}. Aggiorna il pannello se la scena è cambiata.`; }
  finally { busy = false; renderPreview(); }
}
$("source").addEventListener("change", renderPreview);
$("link").addEventListener("click", () => act("link"));
$("unlink-selection").addEventListener("click", () => act("unlink", view.tokens.filter(item => item.metadata?.[KEY]?.sharedHpSourceId).map(item => item.id)));
$("unlink-all").addEventListener("click", () => act("unlink", view.items.filter(item => item.metadata?.[KEY]?.sharedHpSourceId === $("source").value).map(item => item.id)));
$("close").addEventListener("click", () => OBR.popover.close(`${ID}/shared-hp-modal`));
OBR.onReady(async () => { try { await lifecycle.mount(); await load(); } catch (error) { $("status").textContent = error.message; } });
lifecycle.subscribe(event => { if (event.phase === "unavailable") { busy = true; renderPreview(); $("status").textContent = "Scena cambiata: riapri HP condivisi."; } });
window.addEventListener("pagehide", () => lifecycle.dispose());
