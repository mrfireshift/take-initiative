import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";

export function queueSpellAreaEffectsMutation(operations = []) {
  // La serializzazione appartiene al coordinatore ARCH-003: mantenere una
  // seconda coda qui permetterebbe a un piano preparato prima del turno di
  // essere applicato dopo una scrittura concorrente.
  return runEffectsMutation(operations, {
    history: false,
    kind: "spell-area",
    label: "Aggiornata area effetti",
  }).then(async (result) => {
    const applied = requireAppliedEffectsMutation(result);
    if (applied.changedIds?.length) {
      // La mutation area viene spesso avviata dal controller static-zone,
      // mentre il normale refresh del bottone non passa dal percorso cast.
      // Aggiorna subito le pill dopo il commit canonico.
      try {
        const { refreshConditionLabels } = await import("./conditions.js");
        await refreshConditionLabels(applied.changedIds);
      } catch (error) {
        console.warn("[spell-area] refresh pill condizioni:", error?.message || error);
      }
    }
    return applied;
  });
}
