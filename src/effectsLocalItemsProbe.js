import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { evaluateLocalAttachmentProbe } from "./effectsLocalItemsProbeCore.js";

const PROBE_META = `${ID}/effectsLocalProbe`;
const PROBE_NAME = "Effects local attachment probe";

let activeProbe = null;

function errorMessage(error) {
  return String(error?.message || error || "Errore sconosciuto");
}

function markerOffset(token) {
  const scaleY = Math.abs(Number(token?.scale?.y)) || 1;
  const height = Math.max(1, Number(token?.height) || 70) * scaleY;
  return Math.max(54, height / 2 + 30);
}

function compactItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    position: item.position ? { ...item.position } : null,
    attachedTo: item.attachedTo || null,
  };
}

async function settledValue(promise, fallback) {
  try {
    return { ok: true, value: await promise, error: null };
  } catch (error) {
    return { ok: false, value: fallback, error: errorMessage(error) };
  }
}

async function captureSnapshot(probe) {
  const [tokensResult, localsResult, globalsResult, boundsResult, localAttachmentsResult,
    globalAttachmentsResult] = await Promise.all([
    settledValue(OBR.scene.items.getItems([probe.tokenId]), []),
    settledValue(OBR.scene.local.getItems([probe.markerId]), []),
    settledValue(OBR.scene.items.getItems([probe.markerId]), []),
    settledValue(OBR.scene.local.getItemBounds([probe.markerId]), null),
    settledValue(OBR.scene.local.getItemAttachments([probe.tokenId]), []),
    settledValue(OBR.scene.items.getItemAttachments([probe.tokenId]), []),
  ]);
  const token = tokensResult.value[0] || null;
  const marker = localsResult.value[0] || null;
  const localAttachmentIds = localAttachmentsResult.value.map((item) => item.id);
  const globalAttachmentIds = globalAttachmentsResult.value.map((item) => item.id);

  return {
    capturedAt: new Date().toISOString(),
    tokenId: probe.tokenId,
    markerId: probe.markerId,
    tokenExists: !!token,
    tokenPosition: token?.position ? { ...token.position } : null,
    localExists: !!marker,
    globalExists: globalsResult.value.length > 0,
    markerPosition: marker?.position ? { ...marker.position } : null,
    markerBoundsCenter: boundsResult.value?.center ? { ...boundsResult.value.center } : null,
    markerAttachedTo: marker?.attachedTo || null,
    localAttachmentLookup: {
      ok: localAttachmentsResult.ok,
      includesMarker: localAttachmentIds.includes(probe.markerId),
      count: localAttachmentIds.length,
      error: localAttachmentsResult.error,
    },
    globalAttachmentLookup: {
      ok: globalAttachmentsResult.ok,
      includesMarker: globalAttachmentIds.includes(probe.markerId),
      count: globalAttachmentIds.length,
      error: globalAttachmentsResult.error,
    },
    reads: {
      token: { ok: tokensResult.ok, error: tokensResult.error },
      localMarker: { ok: localsResult.ok, error: localsResult.error },
      globalMarker: { ok: globalsResult.ok, error: globalsResult.error },
      localBounds: { ok: boundsResult.ok, error: boundsResult.error },
    },
    token: compactItem(token),
    marker: compactItem(marker),
  };
}

async function resolveToken(tokenId) {
  let targetId = String(tokenId || "").trim();
  if (!targetId) {
    const selection = await OBR.player.getSelection();
    if (selection.length !== 1) {
      throw new Error("Seleziona esattamente un token globale oppure passa start(tokenId).");
    }
    [targetId] = selection;
  }
  const matches = await OBR.scene.items.getItems([targetId]);
  const token = matches[0];
  if (!token) throw new Error(`Token globale non trovato: ${targetId}`);
  return token;
}

async function cleanupLocalProbeItems() {
  const markers = await OBR.scene.local.getItems((item) => !!item?.metadata?.[PROBE_META]);
  if (markers.length) await OBR.scene.local.deleteItems(markers.map((item) => item.id));
  if (activeProbe && markers.some((item) => item.id === activeProbe.markerId)) activeProbe = null;
  return { deleted: markers.length };
}

async function start(tokenId) {
  await cleanupLocalProbeItems();
  const token = await resolveToken(tokenId);
  const probeId = globalThis.crypto?.randomUUID?.() ||
    `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const position = {
    x: Number(token.position?.x) || 0,
    y: (Number(token.position?.y) || 0) - markerOffset(token),
  };
  const marker = buildLabel()
    .plainText("LOCAL → GLOBAL · muovi il token")
    .position(position)
    .width(250)
    .height(32)
    .padding(0)
    .fontSize(16)
    .fontWeight(700)
    .fillColor("#ffffff")
    .strokeColor("#4a044e")
    .strokeWidth(1)
    .backgroundColor("#c026d3")
    .backgroundOpacity(0.94)
    .cornerRadius(16)
    .pointerWidth(0)
    .pointerHeight(0)
    .attachedTo(token.id)
    .layer("TEXT")
    .locked(true)
    .disableHit(true)
    .zIndex(990000)
    .name(PROBE_NAME)
    .metadata({
      [PROBE_META]: { probeId, tokenId: token.id },
    })
    .build();

  try {
    await OBR.scene.local.addItems([marker]);
  } catch (error) {
    return {
      verdict: "unsupported-at-add",
      reason: "Owlbear ha rifiutato un item locale collegato a un token globale.",
      error: errorMessage(error),
      probeId,
      markerId: marker.id,
      tokenId: token.id,
    };
  }

  activeProbe = {
    probeId,
    markerId: marker.id,
    tokenId: token.id,
    before: null,
  };
  activeProbe.before = await captureSnapshot(activeProbe);
  return {
    probeId,
    markerId: marker.id,
    tokenId: token.id,
    instruction: "Muovi il token sulla mappa, attendi un secondo, poi esegui await __tbpEffectsLocalProbe.report().",
    before: activeProbe.before,
    evaluation: evaluateLocalAttachmentProbe(activeProbe.before, activeProbe.before),
  };
}

async function report() {
  if (!activeProbe) throw new Error("Nessun probe attivo in questo contesto: esegui prima start().");
  const latest = await captureSnapshot(activeProbe);
  return {
    probeId: activeProbe.probeId,
    markerId: activeProbe.markerId,
    tokenId: activeProbe.tokenId,
    before: activeProbe.before,
    latest,
    evaluation: evaluateLocalAttachmentProbe(activeProbe.before, latest),
  };
}

async function observe(markerId) {
  const id = String(markerId || "").trim();
  if (!id) throw new Error("Passa il markerId restituito da start().");
  const [locals, globals] = await Promise.all([
    OBR.scene.local.getItems([id]),
    OBR.scene.items.getItems([id]),
  ]);
  return {
    markerId: id,
    localFound: locals.length > 0,
    globalFound: globals.length > 0,
    isolatedOnThisClient: locals.length === 0 && globals.length === 0,
    conclusion: globals.length
      ? "unexpected-global"
      : locals.length
        ? "visible-on-this-client"
        : "not-visible-on-this-client",
  };
}

async function finish() {
  const finalReport = activeProbe ? await report() : null;
  const cleanup = await cleanupLocalProbeItems();
  activeProbe = null;
  return { finalReport, cleanup };
}

export function installEffectsLocalItemsProbe() {
  globalThis.__tbpEffectsLocalProbe = {
    start,
    report,
    observe,
    cleanup: cleanupLocalProbeItems,
    finish,
    state: () => activeProbe ? { ...activeProbe, before: undefined } : null,
    help: () => ({
      start: "await __tbpEffectsLocalProbe.start()",
      report: "await __tbpEffectsLocalProbe.report()",
      observe: "await __tbpEffectsLocalProbe.observe('<markerId>')",
      finish: "await __tbpEffectsLocalProbe.finish()",
      cleanup: "await __tbpEffectsLocalProbe.cleanup()",
    }),
  };
  return globalThis.__tbpEffectsLocalProbe;
}

