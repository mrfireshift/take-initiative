// Trasformazioni (docs/PIANO_TRASFORMAZIONI.md), decision G28: a new form while Shapechange or Animal Shapes lasts, with
// an action, from the attack console. One command of the effects coordinator: the new pill arrives (a copy of the old
// one, the same spell, a new form), the old one makes way, the creature's own HP stay put aside, and one Annulla
// brings the old form back (planTransformationFormChange, planCommandTransformationWrites).
import OBR from "@owlbear-rodeo/sdk";
import { requireAppliedEffectsMutation, runEffectsMutation } from "./effectsMutations.js";
import { planTransformationFormChange } from "./transformationSpellsCore.js";

const newChangeId = () => (typeof globalThis.crypto?.randomUUID === "function"
  ? `transformation-change:${globalThis.crypto.randomUUID()}`
  : `transformation-change:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`);

/**
 * sourceId: the creature in the form; form: the new one (a snapshot of the «Forma» field); portrait: its 5eTools
 * portrait on the token, when chosen. Returns { label }; throws an Error in Italian.
 */
export async function changeTransformationForm({ sourceId = "", form = null, portrait = null } = {}, {
  api = OBR, run = runEffectsMutation, requireApplied = requireAppliedEffectsMutation, newInstanceId = newChangeId,
} = {}) {
  const [item] = sourceId ? await api.scene.items.getItems([sourceId]) : [];
  if (!item) throw new Error("La creatura non è più nella scena.");
  const plan = planTransformationFormChange({ item, form, portrait, newInstanceId: newInstanceId() });
  if (plan.error) throw new Error(plan.error);
  const label = `${String(item.name || "Creatura").trim()}: ${plan.instance.displayLabel}`;
  const result = await run([{ type: "condition:add-instances", instancesByTarget: { [item.id]: [plan.instance] } }], {
    kind: "condition", label, targetIds: [item.id], history: { kind: "condition", label },
  });
  requireApplied(result);
  return { label };
}
