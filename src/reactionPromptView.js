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
import { reactionTriggerEntry } from "./reactionTriggerCatalog.js";
import { abilityModifier } from "./abilityModifiersCore.js";
import { reactionNoticeId } from "./reactionNoticeCore.js";

const META_KEY = `${ID}/meta`;
// The catalog's lots this build wires (reactionTriggerCatalog.js): the others stay in the catalog, unprompted.
export const REACTION_PROMPT_LOTS = Object.freeze(["R1", "R2", "R2b", "R3a", "R3c", "R3b", "R4", "R5"]);
export const REACTION_PROMPT_CONSOLE_HINT = "Registra senza usarla vale come Ignora.";
const DISMISSED_LIMIT = 64;

// The candidates of one phase, with the lots wired. Pure.
// skip: the keys of candidates already taken (lot R3b: a damage reaction already on the draft is not offered again).
export function reactionPromptCandidates({ event = null, items = [], state = null, options = undefined, distance = null, skip = [], monsterReactions = null } = {}, phase = "before") {
  if (!event) return [];
  const skipped = new Set(Array.isArray(skip) ? skip : []);
  const events = Array.isArray(event) ? event : [event];
  const seen = new Set();
  const list = [];
  for (const entry of events) {
    for (const candidate of reactionCandidates(entry, { items, state, options, distance, monsterReactions }).candidates) {
      if (candidate.timing !== phase || !REACTION_PROMPT_LOTS.includes(candidate.lot) || seen.has(candidate.key) || skipped.has(candidate.key)) continue;
      seen.add(candidate.key);
      list.push(candidate);
    }
  }
  return list;
}

// What a row says after the reaction's name: its effect and, for a bonus to the AC, the rolls it turns into a miss (the
// console does not know the roll: the GM changes the outcome, decision of section 3.2). Pure.
const cardOf = (items, id) => (Array.isArray(items) ? items : []).find((entry) => entry?.id === id)?.metadata?.[META_KEY]?.initiativeCard || {};
export function reactionPromptEffectText(candidate, items = []) {
  const short = String(candidate?.short || "");
  // Absorb Elements: the type of this damage («fuoco», the spell's own choice id, is also its Italian label).
  if (candidate?.reactionId === "absorb-elements" && candidate.variant) return `Resistenza ai danni da ${candidate.variant}, anche ora`;
  if (candidate?.reactionId === "counterspell") return "Contrasta: automatico fino al livello dello slot, oltre prova CD 10 + livello";
  const effect = reactionTriggerEntry(candidate?.reactionId)?.effect || {};
  // On another creature (Glorious Defense, Warding Maneuver, Sentinel at Death's Door): whose AC it is.
  const onAlly = candidate?.protectedId && candidate.protectedId !== candidate.reactorId ? ` su ${candidate.protectedName}` : "";
  if (effect.kind === "ac-bonus") {
    const ac = Math.floor(Number(cardOf(items, candidate.protectedId || candidate.reactorId).armorClass));
    const fixed = Number.isInteger(effect.amount) ? effect.amount : Number.isInteger(candidate?.amount) ? candidate.amount
      : effect.ability ? abilityModifier(cardOf(items, candidate.reactorId).abilityModifiers, effect.ability) : null;
    if (Number.isInteger(fixed) && fixed > 0) {
      if (!Number.isInteger(ac) || ac <= 0) return `${short}${onAlly}: se il tiro non arriva alla CA + ${fixed}, segna Mancato`;
      return `${short}${onAlly} · CA ${ac} → ${ac + fixed}: un tiro da ${ac} a ${ac + fixed - 1} diventa Mancato`;
    }
    return `${short}${onAlly}: tira il dado, se il tiro non arriva alla CA${Number.isInteger(ac) && ac > 0 ? ` ${ac}` : ""} più il dado segna Mancato`;
  }
  if (effect.kind === "downgrade-critical") return `${short}${onAlly}: Usa segna Colpito al posto di Critico`;
  if (effect.kind === "reroll") return `${short}${onAlly}: segna l'esito del nuovo tiro`;
  if (candidate?.reactionId === "armor-of-hexes") return "Tira un d6: con 4 o più l'attacco manca, segna Mancato";
  if (candidate?.reactionId === "magic-users-nemesis") {
    const dc = Math.floor(Number(cardOf(items, candidate.reactorId).spellSaveDC));
    return `TS Saggezza${Number.isInteger(dc) && dc > 0 ? ` CD ${dc}` : ""}: se lo fallisce, l'incantesimo fallisce e lo slot è perso`;
  }
  if (candidate?.reactionId === "spell-thief") {
    const dc = Math.floor(Number(cardOf(items, candidate.reactorId).spellSaveDC));
    return `TS di caratteristica da incantatore${Number.isInteger(dc) && dc > 0 ? ` CD ${dc}` : ""}: se lo fallisce, non ha effetto sul ladro, che lo ruba`;
  }
  if (effect.kind === "reduce-roll") return short;
  return `${short}${onAlly}`;
}

const signatureOf = (context, phase) => (context?.event
  ? `${phase}|${String(context.draftKey || "")}|${(Array.isArray(context.event) ? context.event : [context.event]).map(reactionEventSignature).join("+")}`
  : "");

const NOOP = Object.freeze({ update() {}, showAfter() {}, dismiss() {}, destroy() {}, current: () => [] });

/**
 * box: the container above Registra (absent in a page without it: nothing happens). onUse(candidate, phase): the
 * console's own flow, awaited. option: the local options (reactionPromptOption.js). notices (lot R6): what sends the
 * prompt to the players' screens and hears their answers (reactionNoticeBroadcast.js); false: none, null: the default.
 */
export function createReactionPrompt(box, {
  documentRef = globalThis.document, onUse = null, option = null, buttonClass = "mini-button", ignoreHint = REACTION_PROMPT_CONSOLE_HINT,
  onRender = null, notices = null,
} = {}) {
  if (!box || !documentRef?.createElement) return NOOP;
  const store = option || createReactionPromptOption();
  let options = typeof store.read === "function" ? store.read() : undefined;
  let before = null;
  let after = null;
  let busy = false;
  let shown = { phase: "", signature: "", list: [], items: [], event: null };
  // Lot R6: the players' answers to the prompt shown ({ key: answer }), and what sends it to their screens.
  const answers = new Map();
  let answersFor = "";
  let noticeSender = notices === false ? null : notices;
  let noticeLoading = null;
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
      if (list.length) return { phase: "before", signature: beforeSignature, list, items: before.items || [], event: before.event };
    }
    const afterSignature = signatureOf(after, "after");
    if (afterSignature && !isDismissed(afterSignature)) {
      const list = reactionPromptCandidates({ ...after, options }, "after");
      if (list.length) return { phase: "after", signature: afterSignature, list, items: after.items || [], event: after.event };
    }
    return { phase: "", signature: "", list: [], items: [], event: null };
  }

  // Lot R6: a player's Usa marks the row and gives its Usa the focus (Invio confirms); Ignora is only a sign (H5).
  function receiveAnswer(answer) {
    if (destroyed || !shown.signature || answer.promptId !== reactionNoticeId(shown.signature)) return;
    answers.set(answer.key, answer);
    render();
    if (answer.choice === "use") {
      const button = [...box.querySelectorAll?.("[data-reaction-prompt-use]") || []].find((node) => node.dataset.reactionPromptUse === answer.key);
      try { button?.focus?.(); } catch {}
    }
  }
  function sendNotice() {
    if (notices === false) return;
    if (!noticeSender && !noticeLoading && !shown.list.length) return;
    const snapshot = shown;
    const payload = { shown: snapshot, event: snapshot.event, options, effectText: (candidate) => reactionPromptEffectText(candidate, snapshot.items) };
    if (noticeSender) { void noticeSender.update(payload); return; }
    noticeLoading ||= import("./reactionNoticeBroadcast.js")
      .then(({ createReactionNoticeBroadcaster }) => {
        noticeSender = createReactionNoticeBroadcaster();
        noticeSender.onAnswer(receiveAnswer);
        return noticeSender;
      })
      .catch(() => null);
    void noticeLoading.then((sender) => {
      if (sender && !destroyed) void sender.update({ shown, event: shown.event, options, effectText: (candidate) => reactionPromptEffectText(candidate, shown.items) });
    });
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
    if (answersFor !== shown.signature) { answers.clear(); answersFor = shown.signature; }
    const signature = JSON.stringify([shown.phase, shown.signature, shown.list.map((candidate) => [candidate.key, reactionPromptEffectText(candidate, shown.items)]), busy,
      [...answers.values()].map((answer) => [answer.key, answer.choice])]);
    if (signature === domSignature) return;
    domSignature = signature;
    sendNotice();
    box.replaceChildren();
    box.hidden = !shown.list.length;
    if (!shown.list.length) {
      try { onRender?.(false); } catch {}
      return;
    }
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
      // Lot R6: the player's answer from their screen (Online profile).
      const answer = answers.get(candidate.key);
      if (answer) {
        body.append(element("span", `${answer.playerName || "Il giocatore"}: ${answer.choice === "use" ? "Usa" : "ignora"}`,
          `reaction-prompt-answer${answer.choice === "use" ? " is-use" : ""}`));
        if (answer.choice === "use") useButton.className += " reaction-prompt-use-requested";
      }
      row.append(body, useButton, muteButton);
      return row;
    });
    const foot = element("div", "", "reaction-prompt-foot");
    if (shown.phase === "before" && ignoreHint) foot.append(element("span", ignoreHint, "reaction-prompt-hint"));
    const ignore = element("button", "Ignora", `${buttonClass} reaction-prompt-ignore`);
    ignore.type = "button";
    ignore.disabled = busy;
    ignore.dataset.reactionPromptIgnore = "1";
    ignore.addEventListener("click", () => { remember(shown.signature); render(); });
    foot.append(ignore);
    box.append(head, ...rows, foot);
    try { onRender?.(true); } catch {}
  }

  // A sender given by the caller (lot R6) hears the answers from the start.
  if (noticeSender) { try { noticeSender.onAnswer?.(receiveAnswer); } catch {} }
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
      try { void noticeSender?.stop(); } catch {}
      try { unsubscribe?.(); } catch {}
      try { store.stop?.(); } catch {}
      box.replaceChildren();
      box.hidden = true;
    },
  };
}
