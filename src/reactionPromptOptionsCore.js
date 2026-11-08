// Reaction prompts (docs/STUDIO_AVVISI_REAZIONE.md): the GM's options, normalized. Light on purpose: the options panel
// (a frequent popover) reads it without the spell catalog (test/spellAreaIndex.test.js). Pure.
import { REACTION_TRIGGER_CATALOG } from "./reactionTriggerCatalog.js";

const text = (value, limit = 160) => String(value ?? "").trim().slice(0, limit);

// ---------------------------------------------------------------------------------------------------------------
// Options: the GM's own (this browser), lot R1 puts them in options-local. Decisions D3 and D4 of the study: on for
// the characters on hit, damage and a spell cast; off for miss, movement and the other creatures; Counterspell not on
// cantrips; muted per creature and reaction, at most REACTION_PROMPT_MUTED_LIMIT entries (the newest kept).
// ---------------------------------------------------------------------------------------------------------------
export const REACTION_PROMPT_MUTED_LIMIT = 200;
export const REACTION_PROMPT_DEFAULTS = Object.freeze({
  enabled: true,
  // Miss on since lot R3c (decision D3: off until its reactions were wired).
  triggers: Object.freeze({ hit: true, damage: true, miss: true, spellCast: true, move: false }),
  actors: Object.freeze({ pcs: true, npcs: false }),
  counterspellCantrips: false,
  // Lot R6a (decisions D1 and H4): the characters' reactions on the table screen, read only. Off by default; the Online
  // profile sends them to the characters' players anyway (R6b).
  screen: false,
  muted: Object.freeze([]),
});
const ACTOR_KEY_PATTERN = /^[ain][0-9A-Za-z_:.-]{1,220}$/u;
const REACTION_IDS = new Set(REACTION_TRIGGER_CATALOG.map((entry) => entry.id));

const booleanOr = (value, fallback) => (typeof value === "boolean" ? value : fallback);

function normalizeMuted(value) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(value) ? value : []) {
    const actor = text(row?.actor, 222);
    const reaction = text(row?.reaction, 80);
    if (!ACTOR_KEY_PATTERN.test(actor) || !REACTION_IDS.has(reaction)) continue;
    const key = `${actor}|${reaction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // name: the creature's name when it was muted, for the options' list only (the key is a short hash).
    const name = text(row?.name, 80);
    result.push({ actor, reaction, ...(name ? { name } : {}) });
  }
  return result.slice(-REACTION_PROMPT_MUTED_LIMIT);
}

export function normalizeReactionPromptOptions(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const triggers = source.triggers && typeof source.triggers === "object" ? source.triggers : {};
  const actors = source.actors && typeof source.actors === "object" ? source.actors : {};
  const defaults = REACTION_PROMPT_DEFAULTS;
  return {
    enabled: booleanOr(source.enabled, defaults.enabled),
    triggers: Object.fromEntries(Object.entries(defaults.triggers).map(([key, fallback]) => [key, booleanOr(triggers[key], fallback)])),
    actors: { pcs: booleanOr(actors.pcs, defaults.actors.pcs), npcs: booleanOr(actors.npcs, defaults.actors.npcs) },
    counterspellCantrips: booleanOr(source.counterspellCantrips, defaults.counterspellCantrips),
    screen: booleanOr(source.screen, defaults.screen),
    muted: normalizeMuted(source.muted),
  };
}

export function isReactionPromptMuted(options, actorKey, reactionId) {
  const actor = text(actorKey, 222);
  const reaction = text(reactionId, 80);
  return normalizeReactionPromptOptions(options).muted.some((row) => row.actor === actor && row.reaction === reaction);
}

// "Non chiedere più" (muted true) and its ↺ in the options (muted false): new options, the source left as it is.
// name: the creature's name, shown in the options' list.
export function withReactionPromptMuted(options, actorKey, reactionId, muted = true, name = "") {
  const normalized = normalizeReactionPromptOptions(options);
  const actor = text(actorKey, 222);
  const reaction = text(reactionId, 80);
  const others = normalized.muted.filter((row) => !(row.actor === actor && row.reaction === reaction));
  return { ...normalized, muted: normalizeMuted(muted ? [...others, { actor, reaction, name }] : others) };
}

