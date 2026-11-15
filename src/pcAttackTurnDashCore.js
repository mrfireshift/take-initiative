// The dashes registered in the attack console (Azioni → Scatto, lot T1 of docs/STUDIO_AZIONI_DI_TURNO.md, decision D3):
// kept in the actor's console state with the movement turn they belong to, so a History Undo takes them back wherever it
// is asked. The movement panel (speedCheck.js) adds them to its own dash count. Only constants here: the tracker page
// reads it without the console's modules.
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
// pcAttackCore.js: PC_ATTACK_STATE_FIELD.
const PC_ATTACK_STATE_FIELD = "pcAttackState";
export const TURN_ACTIONS_STATE_KEY = "turnActions";
// The movement panel's own limit (speedCheck.js, adjustSpeedCheckDash).
export const MAX_TURN_DASHES = 9;

// The dashes of this movement turn (speedCheckCore.js, resolveSpeedCheckTurn: "round:index:id"); another turn's are none.
export function consoleDashCount(item, turnKey) {
  const key = String(turnKey || "");
  const record = item?.metadata?.[META_KEY]?.[PC_ATTACK_STATE_FIELD]?.[TURN_ACTIONS_STATE_KEY];
  if (!key || !record || typeof record !== "object" || String(record.turnKey || "") !== key) return 0;
  return Math.max(0, Math.min(MAX_TURN_DASHES, Math.floor(Number(record.dashes) || 0)));
}
