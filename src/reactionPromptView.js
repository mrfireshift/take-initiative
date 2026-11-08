// Reaction prompts, lot R1 (docs/STUDIO_AVVISI_REAZIONE.md): the prompt above Registra in the attack console and in the
// Boss console. It says who can react, with what and why; Usa opens the flow that already exists (the console's own
// handler: Shield cast with its slot and reaction, the spell panel for Absorb Elements and Hellish Rebuke); Ignora
// closes it; "Non chiedere più" mutes that reaction of that creature in this browser. It writes nothing itself.
// - "before" (decision D2, soft stop): shown when the GM picks an outcome that allows it; Registra counts as Ignora.
// - "after": shown once Registra is applied (Hellish Rebuke); it closes when the GM picks the next outcome.
// The same event on the same draft does not come back once answered (section 5.1, point 7).
import { ID } from "./constants.js";
import { reactionCandidates, reactionEventSignature, withReactionPromptMuted } from "./reactionCandidatesCore.js";
import { createReactionPromptOption } from "./reactionPromptOption.js";

const META_KEY = `${ID}/meta`;
// The catalog's lots this build wires (reactionTriggerCatalog.js): the others stay in the catalog, unprompted.
export const REACTION_PROMPT_LOTS = Object.freeze(["R1"]);
const DISMISSED_LIMIT = 64;

// The candidates of one phase, with the lots wired. Pure.
export function reactionPromptCandidates({ event = null, items = [], state = null, options = undefined, distance = null } = {}, phase = "before") {
  if (!event) return [];
  const events = Array.isArray(event) ? event : [event];
  const seen = new Set();
  const list = [];
  for (const entry of events) {
    for (const candidate of reactionCandidates(entry, { items, state, options, distance }).candidates) {
      if (candidate.timing !== phase || !REACTION_PROMPT_LOTS.includes(candidate.lot) || seen.has(candidate.key)) continue;
      seen.add(candidate.key);
      list.push(candidate);
    }
  }
  return list;
}

// What a row says after the reaction's name: its effect and, for Shield, the rolls it turns into a miss (the console
// does not know the roll: the GM changes the outcome, decision of section 3.2). Pure.
export function reactionPromptEffectText(candidate, items = []) {
  const short = String(candidate?.short || "");
  // Absorb Elements: the type of this damage («fuoco», the spell's own choice id, is also its Italian label).
  if (candidate?.reactionId === "absorb-elements" && candidate.variant) return `Resistenza ai danni da ${candidate.variant}, anche ora`;
  if (candidate?.reactionId !== "shield") return short;
  const item = (Array.isArray(items) ? items : []).find((entry) => entry?.id === candidate.reactorId);
  const ac = Math.floor(Number(item?.metadata?.[META_KEY]?.initiativeCard?.armorClass));
  if (!Number.isInteger(ac) || ac <= 0) return `${short}: se il tiro non arriva alla CA + 5, segna Mancato`;
  return `${short} · CA ${ac} → ${ac + 5}: un tiro da ${ac} a ${ac + 4} diventa Mancato`;
}

const signatureOf = (context, phase) => (context?.event
  ? `${phase}|${String(context.draftKey || "")}|${(Array.isArray(context.event) ? context.event : [context.event]).map(reactionEventSignature).join("+")}`
  : "");

const NOOP = Object.freeze({ update() {}, showAfter() {}, dismiss() {}, destroy() {}, current: () => [] });

/**
 * box: the container above Registra (absent in a page without it: nothing happens). onUse(candidate, phase): the
 * console's own flow, awaited. option: the local options (reactionPromptOption.js).
 */
export function createReactionPrompt(box, {
  documentRef = globalThis.document, onUse = null, option = null, buttonClass = "mini-button",
} = {}) {
  if (!box || !documentRef?.createElement) return NOOP;
  const store = option || createReactionPromptOption();
  let options = typeof store.read === "function" ? store.read() : undefined;
  let before = null;
  let after = null;
  let busy = false;
  let shown = { phase: "", signature: "", list: [], items: [] };
  let domSignature = "";
  let unsubscribe = null;
  let destroyed = false;
  const dismissed = [];
  const isDismissed = (signature) => dismissed.includes(signature);
  const remember = (signature) => {
    if (!signature || isDismissed(signature)) return;
    dismissed.push(signature);
    if (dismissed.length > DISMISSED_LIMIT) dismissed.splice(0, dismissed.length - DISMISSED_LIMIT);
  };
  const element = (tag, text = "", className = "") => {
    const node = documentRef.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function compute() {
    const beforeSignature = signatureOf(before, "before");
    if (beforeSignature && !isDismissed(beforeSignature)) {
      const list = reactionPromptCandidates({ ...before, options }, "before");
      if (list.length) return { phase: "before", signature: beforeSignature, list, items: before.items || [] };
    }
    const afterSignature = signatureOf(after, "after");
    if (afterSignature && !isDismissed(afterSignature)) {
      const list = reactionPromptCandidates({ ...after, options }, "after");
      if (list.length) return { phase: "after", signature: afterSignature, list, items: after.items || [] };
    }
    return { phase: "", signature: "", list: [], items: [] };
  }

  async function use(candidate) {
    if (busy || typeof onUse !== "function") return;
    const answered = shown.signature;
    busy = true;
    render();
    try { await onUse(candidate, shown.phase); remember(answered); }
    catch (error) { console.warn("[reaction-prompt] use:", error?.message || error); }
    finally { busy = false; render(); }
  }

  async function mute(candidate) {
    options = withReactionPromptMuted(options, candidate.actorKey, candidate.reactionId, true, candidate.reactorName);
    render();
    try { await store.mute?.(candidate.actorKey, candidate.reactionId, true, candidate.reactorName); }
    catch (error) { console.warn("[reaction-prompt] mute:", error?.message || error); }
  }

  function render() {
    if (destroyed) return;
    shown = compute();
    const signature = JSON.stringify([shown.phase, shown.signature, shown.list.map((candidate) => [candidate.key, reactionPromptEffectText(candidate, shown.items)]), busy]);
    if (signature === domSignature) return;
    domSignature = signature;
    box.replaceChildren();
    box.hidden = !shown.list.length;
    if (!shown.list.length) return;
    box.dataset.phase = shown.phase;
    box.setAttribute?.("role", "group");
    box.setAttribute?.("aria-label", "Reazione possibile");
    const head = element("div", "", "reaction-prompt-head");
    const tag = element("span", "Reazione", "cost-tag reaction-prompt-tag");
    tag.dataset.cost = "reaction";
    head.append(tag, element("span", shown.list[0].why, "reaction-prompt-why"));
    const rows = shown.list.map((candidate) => {
      const row = element("div", "", "reaction-prompt-row");
      row.title = candidate.rule;
      const text = element("span", "", "reaction-prompt-text");
      text.append(element("strong", candidate.reactorName), ` · ${candidate.label}`);
      const effect = element("span", reactionPromptEffectText(candidate, shown.items), "reaction-prompt-effect");
      const useButton = element("button", "Usa", `${buttonClass} reaction-prompt-use`);
      useButton.type = "button";
      useButton.disabled = busy;
      useButton.dataset.reactionPromptUse = candidate.key;
      useButton.title = `${candidate.reactorName}: ${candidate.label}. ${candidate.rule}`;
      useButton.addEventListener("click", () => { void use(candidate); });
      const muteButton = element("button", "Non chiedere più", "reaction-prompt-mute");
      muteButton.type = "button";
      muteButton.disabled = busy;
      muteButton.dataset.reactionPromptMute = candidate.key;
      muteButton.title = `Non chiedere più per ${candidate.reactorName} · ${candidate.label} (Opzioni → Avvisi di reazione per ripristinarlo)`;
      muteButton.addEventListener("click", () => { void mute(candidate); });
      const body = element("div", "", "reaction-prompt-body");
      body.append(text, effect);
      row.append(body, useButton, muteButton);
      return row;
    });
    const foot = element("div", "", "reaction-prompt-foot");
    if (shown.phase === "before") foot.append(element("span", "Registra senza usarla vale come Ignora.", "reaction-prompt-hint"));
    const ignore = element("button", "Ignora", `${buttonClass} reaction-prompt-ignore`);
    ignore.type = "button";
    ignore.disabled = busy;
    ignore.dataset.reactionPromptIgnore = "1";
    ignore.addEventListener("click", () => { remember(shown.signature); render(); });
    foot.append(ignore);
    box.append(head, ...rows, foot);
  }

  void Promise.resolve(store.subscribe?.((next) => { options = next; render(); }))
    .then((stop) => { if (destroyed && typeof stop === "function") stop(); else unsubscribe = typeof stop === "function" ? stop : null; })
    .catch((error) => console.warn("[reaction-prompt] options:", error?.message || error));

  return {
    // The draft's event, before Registra: null when it has no outcome that allows a reaction. A new event closes the
    // notice of the attack registered before (the GM moved on).
    update(context = {}) {
      before = context?.event ? { ...context } : null;
      if (before) after = null;
      render();
    },
    // Once Registra is applied: the event of the attack registered, with the items read again.
    showAfter(context = {}) {
      after = context?.event ? { ...context } : null;
      render();
    },
    // Registra pressed with the prompt open: it counts as Ignora.
    dismiss() {
      if (shown.phase === "before") remember(shown.signature);
      render();
    },
    current: () => shown.list.slice(),
    destroy() {
      destroyed = true;
      try { unsubscribe?.(); } catch {}
      try { store.stop?.(); } catch {}
      box.replaceChildren();
      box.hidden = true;
    },
  };
}
