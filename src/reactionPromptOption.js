import { createLocalOptionsStore } from "./options/localOptionsStore.js";
import { normalizeReactionPromptOptions, withReactionPromptMuted } from "./reactionPromptOptionsCore.js";

// Reaction prompts, lot R1 (docs/STUDIO_AVVISI_REAZIONE.md): the GM's options, local to this browser (options-local,
// under "reactions"; never in the room, decision D4). The local document keeps a key it does not know, so the options
// panel's save leaves these as they are. The consoles and the options panel see a change through the storage event.
export const REACTION_PROMPT_OPTIONS_FIELD = "reactions";

export function createReactionPromptOption(store = createLocalOptionsStore()) {
  const read = (options) => normalizeReactionPromptOptions(options?.[REACTION_PROMPT_OPTIONS_FIELD]);
  return {
    read: () => read(store.getSnapshot()),
    async subscribe(listener) {
      listener(read(await store.start()));
      return store.subscribe((options) => listener(read(options)));
    },
    // The whole block, normalized; the muted list is replaced, not merged.
    set: (value) => store.update(() => ({ [REACTION_PROMPT_OPTIONS_FIELD]: normalizeReactionPromptOptions(value) })),
    // "Non chiedere più" (muted true) and its ↺ in the options (muted false).
    mute: (actorKey, reactionId, muted = true, name = "") => store.update((current) => ({
      [REACTION_PROMPT_OPTIONS_FIELD]: withReactionPromptMuted(read(current), actorKey, reactionId, muted, name),
    })),
    stop: () => store.stop(),
  };
}
