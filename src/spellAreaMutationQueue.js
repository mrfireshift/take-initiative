import { runEffectsMutation } from "./effectsMutations.js";

let mutationQueue = Promise.resolve();

export function queueSpellAreaEffectsMutation(operations = []) {
  const run = () => runEffectsMutation(operations);
  const task = mutationQueue.then(run, run);
  mutationQueue = task.catch(() => {});
  return task;
}
