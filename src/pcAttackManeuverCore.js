// Grapple and Shove (PHB 2014, p. 195): special melee attacks that replace one attack of the Attack action. Each is a
// contest, the attacker's Strength (Athletics) against the target's Strength (Athletics) or Dexterity (Acrobatics), the
// target's choice; the target is no more than one size larger. The dice are rolled at the table: the GM records the
// outcome (a tie leaves things as they are, so it is a failure). Pure: no SDK, DOM or runtime state.
// Grapple: on a success the target is Afferrato, its source the grappler (the boss's grapples work the same way,
// bossActionExecutionCore.js); the grapple ends when the target escapes, the grappler lets go, or the grappler is
// incapacitated (condition:automate, effectsMutationCore.js). Shove: on a success the target is pushed 5 feet away (moved
// by hand on the map) or knocked Prono. Every attempt, failed ones included, is one command with its History entry.
import { ID } from "./constants.js";
import { hasEffectiveCondition } from "./conditionRulesCore.js";
import { isBossActionCreature, bossMetadataSnapshot, bossConditionAppliedAt, bossGroupConditionInstanceId } from "./bossActionExecutionCore.js";
import { PC_ATTACK_HISTORY_KIND, PC_ATTACK_STATE_FIELD, PC_ATTACK_STATE_VERSION } from "./pcAttackCore.js";

const META_KEY = `${ID}/meta`;
const GRAPPLED = "Afferrato";
const RESTRAINED = "Trattenuto";
const PRONE = "Prono";

export const PC_MANEUVER_KINDS = Object.freeze(["grapple", "shove"]);
export const PC_MANEUVER_OUTCOMES = Object.freeze(["success", "failure"]);
export const PC_MANEUVER_OUTCOME_LABELS = Object.freeze({ success: "Riesce", failure: "Fallisce" });
// Shove: what the attacker chose before the contest.
export const PC_SHOVE_EFFECTS = Object.freeze(["push", "prone"]);
export const PC_SHOVE_EFFECT_LABELS = Object.freeze({ push: "Spingi via di 1,5 m", prone: "Butta Prono" });
// The end of a grapple: the grappler lets go, the grappled creature escapes, or it tries and fails.
export const PC_GRAPPLE_END_OUTCOMES = Object.freeze(["release", "escaped", "escape-failed"]);
export const PC_MANEUVER_CONTEST = "Atletica contro Atletica o Acrobazia (sceglie il bersaglio)";
export const PC_MANEUVER_KEY_PREFIX = "maneuver::";
const LABELS = Object.freeze({ grapple: "Lotta", shove: "Spinta" });
// What the console reminds before the contest: the checks the plugin leaves to the table.
export const PC_MANEUVER_NOTES = Object.freeze({
  grapple: "Al posto di un attacco dell'azione Attacco. Serve una mano libera; bersaglio al massimo una taglia più grande ed entro portata. Pareggio: fallisce.",
  shove: "Al posto di un attacco dell'azione Attacco. Bersaglio al massimo una taglia più grande ed entro portata. Pareggio: fallisce.",
});

export function pcManeuverLabel(kind) {
  return LABELS[kind] || "";
}

// The console's picker entries (Attacchi tab, after the weapons): every creature can grapple and shove. Never part of
// pcAttackPickerEntries, which decides whether an actor has something to show (the turn's auto-open).
export function pcAttackManeuverEntries() {
  return PC_MANEUVER_KINDS.map((kind) => ({ key: `${PC_MANEUVER_KEY_PREFIX}${kind}`, tab: "attacks", actionId: "", spellId: "",
    maneuver: kind, label: LABELS[kind], mode: "maneuver", level: null, concentration: false, ritual: false, recordOnly: false, pinned: false }));
}

function conditionInstancesOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}
const active = (instance) => instance && instance.active !== false;
const sourceOf = (instance) => String(instance?.sourceId || "");

// The creatures sourceId holds: [{ targetId, name, instanceId }], one row per Afferrato it put on them.
export function pcGrappleHolds(items = [], sourceId = "") {
  if (!sourceId) return [];
  return (Array.isArray(items) ? items : []).filter((item) => item?.id && item.id !== sourceId).flatMap((item) => conditionInstancesOf(item)
    .filter((instance) => active(instance) && instance.condition === GRAPPLED && sourceOf(instance) === sourceId)
    .map((instance) => ({ targetId: item.id, name: item.name || item.id, instanceId: String(instance.id || "") })));
}

// Who holds this creature: [{ grapplerId, name, instanceId, escapeDC? }], one row per active Afferrato on it ("" for one
// put by hand, without a source; escapeDC for a boss's grab). items: the scene's creatures, for the grappler's name.
export function pcGrapplesOn(item, items = []) {
  const byId = new Map((Array.isArray(items) ? items : []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  return conditionInstancesOf(item).filter((instance) => active(instance) && instance.condition === GRAPPLED).map((instance) => {
    const grapplerId = sourceOf(instance);
    return { grapplerId, name: byId.get(grapplerId)?.name || String(instance.sourceName || "") || (grapplerId ? grapplerId : ""),
      instanceId: String(instance.id || ""), ...(Number.isFinite(Number(instance.escapeDC)) && instance.escapeDC ? { escapeDC: Number(instance.escapeDC) } : {}) };
  });
}

function incapacitated(item) {
  return hasEffectiveCondition(conditionInstancesOf(item), "Incapacitato");
}

// Why the maneuver cannot be registered yet ("" when it can).
export function pcManeuverBlocker({ kind = "", sourceItem = null, targetItem = null, outcome = "", effect = "" } = {}) {
  if (!PC_MANEUVER_KINDS.includes(kind)) return "Scegli Lotta o Spinta.";
  if (!isBossActionCreature(sourceItem)) return "L'attaccante non è un token creatura nella scena.";
  if (!targetItem) return "Scegli il bersaglio.";
  if (!isBossActionCreature(targetItem)) return "Il bersaglio deve essere una creatura.";
  if (targetItem.id === sourceItem.id) return "Il bersaglio non può essere l'attaccante.";
  if (incapacitated(sourceItem)) return `${sourceItem.name || "L'attaccante"} è incapacitato: non può agire.`;
  if (kind === "grapple" && pcGrappleHolds([targetItem], sourceItem.id).length)
    return `${targetItem.name || "Il bersaglio"} è già Afferrato da ${sourceItem.name || "questo attaccante"}.`;
  if (kind === "shove" && !PC_SHOVE_EFFECTS.includes(effect)) return "Scegli se spingerlo via o buttarlo Prono.";
  if (!PC_MANEUVER_OUTCOMES.includes(outcome)) return "Scegli l'esito della prova contrapposta.";
  return "";
}

function turnOf(turnState) {
  const turn = bossConditionAppliedAt(turnState);
  return turn?.turnKey ? turn : null;
}

// The actor's attack state keeps its last maneuver: the write every attempt makes (a failed one changes nothing else),
// so it is a command with its History entry and its Undo. The other fields (last attack, uses, open cast) stay.
function maneuverStatePatch(sourceItem, lastManeuver) {
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const current = sourceMeta[PC_ATTACK_STATE_FIELD];
  const state = { ...(current && typeof current === "object" ? structuredClone(current) : {}), version: PC_ATTACK_STATE_VERSION, lastManeuver };
  return { id: sourceItem.id, fields: { [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) } } };
}

function conditionAdd({ condition, targetItem, sourceItem, attackInstanceId, appliedAt }) {
  return { type: "condition:add", targetIds: [targetItem.id], conditionName: condition,
    instanceIds: { [targetItem.id]: bossGroupConditionInstanceId(attackInstanceId, condition, targetItem.id) },
    options: { sourceId: sourceItem.id, sourceName: sourceItem.name || sourceItem.id, parentEffectId: "", type: "automatic", manualRemoval: true,
      expiry: { mode: "manual" }, ...(appliedAt ? { appliedAt } : {}) } };
}

// One Grapple or Shove: the outcome of the contest, and for a Shove the effect chosen.
export function buildPcManeuverMutation({ kind = "", sourceItem, targetItem, outcome = "", effect = "", attackInstanceId, turnState = null } = {}) {
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  const blocker = pcManeuverBlocker({ kind, sourceItem, targetItem, outcome, effect });
  if (blocker) throw new Error(blocker);
  const success = outcome === "success";
  const name = LABELS[kind];
  const condition = !success ? "" : kind === "grapple" ? GRAPPLED : effect === "prone" ? PRONE : "";
  const appliedAt = bossConditionAppliedAt(turnState);
  const turn = turnOf(turnState);
  const sourceName = sourceItem.name || sourceItem.id;
  const targetName = targetItem.name || targetItem.id;
  const label = `${sourceName}: ${name} → ${targetName} (${success ? "riuscita" : "fallita"})`;
  const maneuver = { kind, outcome, contest: PC_MANEUVER_CONTEST, ...(kind === "shove" ? { effect } : {}), ...(condition ? { condition } : {}),
    // The push is moved by hand: the plugin never moves the token.
    ...(success && kind === "shove" && effect === "push" ? { manual: `Sposta ${targetName} di 1,5 m lontano da ${sourceName} sulla mappa.` } : {}) };
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, actionName: name, attackInstanceId, maneuver: kind },
    action: { id: `maneuver:${kind}`, label: name },
    maneuver,
    ...(turn ? { turn } : {}),
    targets: [{ id: targetItem.id, name: targetName, ...(condition ? { conditions: [{ condition,
      instanceId: bossGroupConditionInstanceId(attackInstanceId, condition, targetItem.id) }] } : {}) }],
  };
  const lastManeuver = { attackInstanceId, kind, targetId: targetItem.id, outcome, ...(kind === "shove" ? { effect } : {}),
    ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}) };
  return {
    condition, causality, manualText: maneuver.manual || "", labelTargetIds: condition ? [targetItem.id] : [],
    operations: condition ? [conditionAdd({ condition, targetItem, sourceItem, attackInstanceId, appliedAt }),
      { type: "condition:automate", subjectIds: [targetItem.id] }] : [],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: [targetItem.id],
      kind: PC_ATTACK_HISTORY_KIND, label,
      metadataPatches: [maneuverStatePatch(sourceItem, lastManeuver)],
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: [],
        ...(maneuver.manual ? { manualRemainder: maneuver.manual } : {}) } },
    },
  };
}

// The end of a grapple, from the console of either creature. sourceItem: the console's actor (the grappler, or the
// grappled creature); grappledItem: the creature held (the actor itself, or a creature it holds); instanceId: its
// Afferrato. release: the grappler lets go (the actor must be the grappler); escaped: the grappled creature escapes (its
// action, a contest; against a boss's grab, its escape DC); escape-failed: it tries and stays held (only the record).
// A grapple ending takes with it the Trattenuto the same grappler put on the creature by hand or with its grab
// (never a spell's: those have a parent effect), as the boss's throw does.
export function buildPcGrappleEndMutation({ sourceItem, grappledItem, instanceId = "", outcome = "", items = [], attackInstanceId, turnState = null } = {}) {
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  if (!PC_GRAPPLE_END_OUTCOMES.includes(outcome)) throw new Error("Scegli come finisce la presa.");
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(grappledItem)) throw new Error("Le creature della presa devono essere token reali.");
  const instance = conditionInstancesOf(grappledItem).find((entry) => active(entry) && entry.condition === GRAPPLED && String(entry.id || "") === instanceId);
  if (!instance) throw new Error(`${grappledItem.name || "La creatura"} non è più Afferrata: la presa è già finita.`);
  const grapplerId = sourceOf(instance);
  if (sourceItem.id !== grappledItem.id && sourceItem.id !== grapplerId) throw new Error("Questa presa non riguarda l'attore della console.");
  if (outcome === "release" && sourceItem.id !== grapplerId) throw new Error("Solo chi afferra può lasciare andare.");
  if (outcome !== "release" && incapacitated(grappledItem) && grappledItem.id === sourceItem.id)
    throw new Error(`${grappledItem.name || "La creatura"} è incapacitata: non può tentare di sfuggire.`);
  const grappler = [sourceItem, ...(Array.isArray(items) ? items : [])].find((item) => item?.id && item.id === grapplerId) || null;
  const grapplerName = grappler?.name || String(instance.sourceName || "") || "una creatura";
  const grappledName = grappledItem.name || grappledItem.id;
  const ends = outcome !== "escape-failed";
  const removals = ends ? conditionInstancesOf(grappledItem).filter((entry) => active(entry) && (String(entry.id || "") === instanceId
    || (grapplerId && entry.condition === RESTRAINED && sourceOf(entry) === grapplerId && !entry.parentEffectId)))
    .map((entry) => ({ id: String(entry.id || ""), condition: entry.condition })) : [];
  // The release is the grappler's doing; an escape, the grappled creature's.
  const actor = outcome === "release" ? { id: grapplerId, name: grapplerName } : { id: grappledItem.id, name: grappledName };
  const name = outcome === "release" ? "Lascia andare" : "Sfuggire alla presa";
  const label = outcome === "release" ? `${grapplerName}: lascia andare ${grappledName}`
    : `${grappledName}: sfuggire alla presa di ${grapplerName} (${outcome === "escaped" ? "riuscita" : "fallita"})`;
  const turn = turnOf(turnState);
  const causality = {
    actor: { id: actor.id, tokenId: actor.id, name: actor.name, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, actionName: name, attackInstanceId, maneuver: "grapple-end" },
    action: { id: `maneuver:grapple-end:${outcome}`, label: name },
    maneuver: { kind: "grapple-end", outcome, grapplerId, grapplerName, grappledId: grappledItem.id, grappledName,
      ...(outcome !== "release" ? { contest: instance.escapeDC ? `CD ${instance.escapeDC}` : "Atletica o Acrobazia contro Atletica di chi afferra" } : {}),
      releasedConditions: removals },
    ...(turn ? { turn } : {}),
    targets: [{ id: grappledItem.id, name: grappledName }],
  };
  const lastManeuver = { attackInstanceId, kind: "grapple-end", outcome, targetId: grappledItem.id, ...(grapplerId ? { grapplerId } : {}),
    ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}) };
  return {
    causality, released: removals, labelTargetIds: removals.length ? [grappledItem.id] : [],
    operations: removals.length ? [{ type: "condition:remove-instances", targetIds: [grappledItem.id],
      removals: removals.map((entry) => ({ itemId: grappledItem.id, instanceId: entry.id })) }] : [],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id,
      targetIds: [...new Set([grappledItem.id, sourceItem.id])], kind: PC_ATTACK_HISTORY_KIND, label,
      metadataPatches: [maneuverStatePatch(sourceItem, lastManeuver)],
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: [] } },
    },
  };
}
