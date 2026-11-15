// The turn's actions that are not an attack (lot T1 of docs/STUDIO_AZIONI_DI_TURNO.md, decisions D1, D3, D4, D5, D12):
// Dash, Disengage and Dodge in the attack console's Azioni tab, beside Grapple and Shove. One click each, never asked
// for: the plugin counts none of the turn's actions (the action economy was dropped on 23/10). Each is a command with its
// History entry and its Undo:
// - Dash (Scatto): one more dash in the movement panel of the creature's turn, kept in its console state with that turn
//   (pcAttackTurnDashCore.js); no pill;
// - Disengage (Disimpegno): a pill until the end of its turn, which the opportunity attack prompts read
//   (opportunityAttackCore.js);
// - Dodge (Schivata): a pill until the start of its next turn, the one Patient Defense puts; the console reminds whoever
//   attacks it of the disadvantage, and a Dexterity save of the advantage.
// Pure: no SDK, DOM or runtime state.
import { ID } from "./constants.js";
import { bossConditionAppliedAt, bossGroupConditionInstanceId, bossMetadataSnapshot } from "./bossActionExecutionCore.js";
import { PC_ATTACK_HISTORY_KIND, PC_ATTACK_STATE_FIELD, PC_ATTACK_STATE_VERSION, pcAttackSave } from "./pcAttackCore.js";
import { NEXT_OWN_TURN_START_EXPIRY, initiativeTurnCreatureId } from "./reactionTrackerCore.js";
import { resolveSpeedCheckTurn } from "./speedCheckCore.js";
import { MAX_TURN_DASHES, TURN_ACTIONS_STATE_KEY, consoleDashCount } from "./pcAttackTurnDashCore.js";

const META_KEY = `${ID}/meta`;

export const PC_TURN_ACTION_KINDS = Object.freeze(["dash", "disengage", "dodge"]);
export const PC_TURN_ACTION_KEY_PREFIX = "turn-action::";
const LABELS = Object.freeze({ dash: "Scatto", disengage: "Disimpegno", dodge: "Schivata" });
export const DISENGAGE_CONDITION = "Disimpegno";
// The name Patient Defense's pill has: a Dodge from either is the same pill.
export const DODGE_CONDITION = "Schivata";
// Disengage: until the end of the turn it is taken in (the creature's own); Dodge: until the start of its next turn.
const DISENGAGE_EXPIRY = Object.freeze({ mode: "turn-end", actor: "target", remaining: 1 });
// What the card says of the action (PHB 2014, in short); the line beside Registra says what the plugin does with it.
export const PC_TURN_ACTION_NOTES = Object.freeze({
  dash: "Un movimento extra pari alla velocità, per questo turno.",
  disengage: "Il movimento di questo turno non provoca attacchi di opportunità.",
  dodge: "Fino all'inizio del suo prossimo turno gli attacchi contro hanno svantaggio, se vede chi attacca, e i TS su Destrezza hanno vantaggio. Finisce prima se è incapacitato o la sua velocità scende a 0: allora toglila a mano.",
});

export function pcTurnActionLabel(kind) {
  return LABELS[kind] || "";
}

// The console's picker entries (Azioni tab, before Grapple and Shove): every creature can take them. Never part of
// pcAttackPickerEntries, which decides whether an actor has something to show (the turn's auto-open).
export function pcAttackTurnActionEntries() {
  return PC_TURN_ACTION_KINDS.map((kind) => ({ key: `${PC_TURN_ACTION_KEY_PREFIX}${kind}`, tab: "actions", actionId: "", spellId: "",
    turnAction: kind, label: LABELS[kind], mode: "turn-action", level: null, concentration: false, ritual: false, recordOnly: false,
    pinned: false }));
}

function conditionInstancesOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}
function hasActiveCondition(item, condition) {
  return conditionInstancesOf(item).some((instance) => instance && instance.active !== false && instance.condition === condition);
}

// Why the action cannot be registered now, or "". Only in combat, on the creature's own turn: the pills count turns,
// and the dash belongs to the movement of the turn.
export function pcTurnActionBlocker({ kind = "", sourceItem = null, turnState = null } = {}) {
  if (!LABELS[kind]) return "Azione non valida.";
  if (!sourceItem?.id) return "Nessuna creatura per questa azione.";
  const order = Array.isArray(turnState?.order) ? turnState.order.filter(Boolean) : [];
  if (!order.length) return "Solo in combattimento, con un ordine di iniziativa.";
  if (initiativeTurnCreatureId(turnState) !== sourceItem.id) return "Solo nel turno della creatura.";
  if (kind === "disengage" && hasActiveCondition(sourceItem, DISENGAGE_CONDITION)) return "Ha già il Disimpegno in questo turno.";
  if (kind === "dodge" && hasActiveCondition(sourceItem, DODGE_CONDITION)) return "È già in Schivata.";
  if (kind === "dash" && consoleDashCount(sourceItem, resolveSpeedCheckTurn(turnState).turnKey) >= MAX_TURN_DASHES)
    return `Già ${MAX_TURN_DASHES} scatti in questo turno.`;
  return "";
}

// The dash count of this turn in the actor's console state; the other fields (last attack, uses, open cast) stay.
function dashStatePatch(sourceItem, turnKey, dashes) {
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const current = sourceMeta[PC_ATTACK_STATE_FIELD];
  const state = { ...(current && typeof current === "object" ? structuredClone(current) : {}), version: PC_ATTACK_STATE_VERSION,
    [TURN_ACTIONS_STATE_KEY]: { turnKey, dashes } };
  return { id: sourceItem.id, fields: { [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) } } };
}

// One Dash, Disengage or Dodge of the creature whose turn it is.
export function buildPcTurnActionMutation({ kind = "", sourceItem, attackInstanceId, turnState = null } = {}) {
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  const blocker = pcTurnActionBlocker({ kind, sourceItem, turnState });
  if (blocker) throw new Error(blocker);
  const name = LABELS[kind];
  const sourceName = sourceItem.name || sourceItem.id;
  const appliedAt = bossConditionAppliedAt(turnState);
  const turn = appliedAt?.turnKey ? appliedAt : null;
  const condition = kind === "disengage" ? DISENGAGE_CONDITION : kind === "dodge" ? DODGE_CONDITION : "";
  const instanceId = condition ? bossGroupConditionInstanceId(attackInstanceId, condition, sourceItem.id) : "";
  const speedTurnKey = resolveSpeedCheckTurn(turnState).turnKey;
  const dashes = kind === "dash" ? consoleDashCount(sourceItem, speedTurnKey) + 1 : 0;
  const label = `${sourceName}: ${name}`;
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, actionName: name, attackInstanceId, turnAction: kind },
    action: { id: `turn-action:${kind}`, label: name },
    turnAction: { kind, ...(kind === "dash" ? { dashes } : { condition }) },
    ...(turn ? { turn } : {}),
    targets: [{ id: sourceItem.id, name: sourceName, ...(condition ? { conditions: [{ condition, instanceId }] } : {}) }],
  };
  const operations = condition ? [{
    type: "condition:add", targetIds: [sourceItem.id], conditionName: condition, instanceIds: { [sourceItem.id]: instanceId },
    options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true,
      expiry: kind === "dodge" ? { ...NEXT_OWN_TURN_START_EXPIRY } : { ...DISENGAGE_EXPIRY }, ...(appliedAt ? { appliedAt } : {}) },
  }, { type: "condition:automate", subjectIds: [sourceItem.id] }] : [];
  return {
    condition, causality, manualText: "", labelTargetIds: condition ? [sourceItem.id] : [],
    operations,
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: [sourceItem.id],
      kind: PC_ATTACK_HISTORY_KIND, label,
      ...(kind === "dash" ? { metadataPatches: [dashStatePatch(sourceItem, speedTurnKey, dashes)] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: [] } },
    },
  };
}

// What the console reminds about the target of a single attack (decision D5): a creature in Dodge gives disadvantage to
// the attack rolls against it, if it sees the attacker, and has advantage on a Dexterity save. Nothing for an attack
// without a roll (Magic Missile, an arrow that replaces the roll).
export function pcAttackTargetNotes({ attack = null, targetItem = null } = {}) {
  if (!attack || !targetItem || !hasActiveCondition(targetItem, DODGE_CONDITION)) return [];
  const save = pcAttackSave(attack);
  if (save) return save === "dex" ? ["Schivata: vantaggio al TS su Destrezza."] : [];
  if (attack.mode || attack.spell?.delivery === "auto") return [];
  return ["Schivata: svantaggio all'attacco, se il bersaglio vede chi attacca."];
}
