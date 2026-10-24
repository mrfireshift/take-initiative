// Records a cast the plugin does not automate (spells-srd.js, isSpellCastRecordOnly): Counterspell, Cure Wounds,
// Wish... One command spends what the cast costs (spellSlotSpendCore.js: a slot, a Pact Magic slot, a use of the quick
// action), so the History entry, its Undo and its combat log entry name the spell. No pill and no effect: the table
// resolves the spell. A cast that spends nothing changes nothing and has no History entry: it goes to the combat log
// only. executeSpellApplication delegates here when the request is recordOnly.
import OBR from "@owlbear-rodeo/sdk";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { createSpellInstanceId } from "./spells.js";
import { attachSpellExecutionHistory } from "./spellExecutionHistoryCore.js";
import {
  buildSpellCastRecordCausality,
  buildSpellCastRecordLogEntry,
  spellCastRecordLabel,
} from "./spellCastRecordCore.js";
import { counterspellLabel } from "./counterspellCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

// The combat log of this page: the History owner writes the log of a History entry, a cast without one is written
// here, once the options say whether the log is on (combatLog.js, as the Quick HP console does).
export async function recordInCombatLog(entry, sceneEpoch) {
  const [{ startRuntimeOptions }, combatLog] = await Promise.all([
    import("./options/optionsRuntime.js"),
    import("./combatLog.js"),
  ]);
  await startRuntimeOptions().catch(() => {});
  combatLog.mountCombatLogEventSink();
  return combatLog.recordHistoryInCombatLog(entry, { sceneEpoch });
}

export async function executeSpellCastRecord({
  spell = null,
  enteredName = "",
  casterId = "",
  casterName = "",
  targetIds = [],
  castContext = {},
  sceneEpoch = null,
  visualSceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
  extraOperations = [],
  // What the cast spends, for the combat log (planSpellCastCost's spent): "slot di 3° livello".
  castCost = "",
} = {}) {
  const stale = () => typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch);
  const caster = String(casterId || "").trim();
  const targets = uniqueIds(targetIds);
  const spellName = String(spell?.displayName || spell?.name || enteredName || spell?.id || "").trim();
  const items = await OBR.scene.items.getItems(uniqueIds([caster, ...targets])).catch(() => []);
  if (stale()) throw new Error("scene-epoch-stale-before-spell-record");
  const names = new Map((Array.isArray(items) ? items : []).map((item) => [item?.id, String(item?.name || "")]));
  // Counterspell names what it countered (counterspellCore.js): in its label and in the entry's payload.
  const counterspell = castContext?.counterspell && typeof castContext.counterspell === "object" ? castContext.counterspell : null;
  const label = counterspell ? counterspellLabel(counterspell) : spellCastRecordLabel(spellName);
  const extraPayload = counterspell ? { counterspell } : null;
  const causality = buildSpellCastRecordCausality({
    spellId: spell?.id,
    spellName,
    slotLevel: castContext?.slotLevel,
    casterId: caster,
    casterName: casterName || names.get(caster) || "",
    targets: targets.map((id) => ({ id, name: names.get(id) || "" })),
    cost: castCost,
  });
  const operations = (Array.isArray(extraOperations) ? extraOperations : []).filter(Boolean);
  let result;
  if (operations.length) {
    const mutation = await runEffectsMutation(operations, {
      kind: "spell",
      label,
      targetIds: uniqueIds([caster, ...targets]),
      history: { kind: "spell", label, payload: { ...(extraPayload || {}), causality } },
      ...(sceneIdentity ? { sceneIdentity } : {}),
      ...(commandId ? { commandId } : {}),
    });
    requireAppliedEffectsMutation(mutation);
    result = attachSpellExecutionHistory([...mutation.changedIds], mutation);
  } else {
    await recordInCombatLog(buildSpellCastRecordLogEntry({ label, causality, extraPayload }), sceneEpoch ?? currentSceneEpoch())
      .catch((error) => {
        console.warn("[spell] cast record log:", error?.message || error);
      });
    result = attachSpellExecutionHistory([], { undoAvailable: false });
  }
  // The lifecycle adapter reports a scene that changed after the commit; no animation on the next scene.
  if (stale()) return result;
  // Only the one-shot layers of its animation: a recorded cast leaves no pill for a loop to last with.
  const eventId = createSpellInstanceId();
  void emitMatchedSpellVisual({
    spellId: spell?.id,
    casterId: caster,
    targetIds: targets,
    eventId,
    lifecycleId: eventId,
    sceneEpoch: Number.isInteger(visualSceneEpoch) ? visualSceneEpoch : currentSceneEpoch(),
    persistent: false,
  }).catch((error) => {
    console.warn("[spell] matched visual:", error?.message || error);
  });
  return result;
}
