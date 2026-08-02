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
  }).then((result) => requireAppliedEffectsMutation(result));
}
