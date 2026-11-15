// The turn's actions that are not an attack (docs/STUDIO_AZIONI_DI_TURNO.md, decisions D1, D3–D7, D11, D12): Dash,
// Disengage, Dodge, Help and Hide in the attack console's Azioni tab, beside Grapple and Shove. One click each, never asked
// for: the plugin counts none of the turn's actions (the action economy was dropped on 23/10). Each is a command with its
// History entry and its Undo:
// - Dash (Scatto, lot T1): one more dash in the movement panel of the creature's turn, kept in its console state with that
//   turn (pcAttackTurnDashCore.js); no pill;
// - Disengage (Disimpegno, T1): a pill until the end of its turn, which the opportunity attack prompts read
//   (opportunityAttackCore.js);
// - Dodge (Schivata, T1): a pill until the start of its next turn, the one Patient Defense puts; the console reminds whoever
//   attacks it of the disadvantage, and a Dexterity save of the advantage;
// - Help (Aiuto, T2): on an ally's ability check, «Aiutato» on the ally (as Fey Gift puts it), removed by hand; on an
//   attack, «Bersaglio dell'aiuto» on the enemy, which the first attack roll of the helper's allies spends
//   (attackAdvantagePillsCore.js). Both until the start of the helper's next turn;
// - Hide (Nascondersi, T2): «Nascosto» on the creature, with its Stealth total if the GM gives it; advantage to its attack
//   roll, which ends it; an enemy's only the GM sees (D11);
// - Ready (Preparare, T3, D8): «Azione preparata» on the creature until the start of its next turn, the pill of the card's
//   menu. What and when stay at the table. It goes off with the reaction: the card's «Innesca con un attacco» opens this
//   console off turn, and the attack registered with the reaction removes it (pcAttackExecution.js).
// Pure: no SDK, DOM or runtime state.
import { ID } from "./constants.js";
import { bossConditionAppliedAt, bossGroupConditionInstanceId, bossMetadataSnapshot } from "./bossActionExecutionCore.js";
import { PC_ATTACK_HISTORY_KIND, PC_ATTACK_STATE_FIELD, PC_ATTACK_STATE_VERSION, pcAttackSave } from "./pcAttackCore.js";
import { NEXT_OWN_TURN_START_EXPIRY, READIED_ACTION_CONDITION, conditionInstancesNamed, initiativeTurnCreatureId } from "./reactionTrackerCore.js";
import { resolveSpeedCheckTurn } from "./speedCheckCore.js";
import { MAX_TURN_DASHES, TURN_ACTIONS_STATE_KEY, consoleDashCount } from "./pcAttackTurnDashCore.js";
import { DODGE_CONDITION, HELPED_CONDITION, HELP_TARGET_CONDITION, HIDDEN_CONDITION, consumedAdvantagePills, hiddenPills } from "./attackAdvantagePillsCore.js";
import { CRUSHER_CRITICAL_CONDITION, FEATS_FIELD, SLASHER_CRITICAL_CONDITION, sanitizeFeats } from "./featCatalog.js";

const META_KEY = `${ID}/meta`;

export const PC_TURN_ACTION_KINDS = Object.freeze(["dash", "disengage", "dodge", "help", "hide", "ready"]);
export const PC_TURN_ACTION_KEY_PREFIX = "turn-action::";
const LABELS = Object.freeze({ dash: "Scatto", disengage: "Disimpegno", dodge: "Schivata", help: "Aiuto", hide: "Nascondersi",
  ready: "Preparare" });
export const DISENGAGE_CONDITION = "Disimpegno";
// The name Patient Defense's pill has: a Dodge from either is the same pill (attackAdvantagePillsCore.js, which the save
// panels read too).
export { DODGE_CONDITION, HELPED_CONDITION, HELP_TARGET_CONDITION, HIDDEN_CONDITION };
// Help: an ally's ability check, or an attack against an enemy (the console's «Aiuta in» buttons).
export const PC_HELP_MODES = Object.freeze(["check", "attack"]);
export const PC_HELP_MODE_LABELS = Object.freeze({ check: "Una prova", attack: "Un attacco" });
// Disengage: until the end of the turn it is taken in (the creature's own); Dodge: until the start of its next turn; Help:
// until the start of the helper's next turn (the pill is on another creature, its source the helper).
const DISENGAGE_EXPIRY = Object.freeze({ mode: "turn-end", actor: "target", remaining: 1 });
const HELP_EXPIRY = Object.freeze({ mode: "turn-start", actor: "source", remaining: 1 });
const MAX_STEALTH = 60;
// What the card says of the action (PHB 2014, in short); the line beside Registra says what the plugin does with it.
export const PC_TURN_ACTION_NOTES = Object.freeze({
  dash: "Un movimento extra pari alla velocità, per questo turno.",
  disengage: "Il movimento di questo turno non provoca attacchi di opportunità.",
  dodge: "Fino all'inizio del suo prossimo turno gli attacchi contro hanno svantaggio, se vede chi attacca, e i TS su Destrezza hanno vantaggio. Finisce prima se è incapacitato o la sua velocità scende a 0: allora toglila a mano.",
  help: "Fino all'inizio del suo prossimo turno: un alleato ha vantaggio alla prossima prova del compito in cui lo aiuta, oppure il primo attacco di un alleato contro un nemico entro 1,5 m da lui ha vantaggio. La distanza resta al tavolo.",
  hide: "Una prova di Destrezza (Furtività): il totale fa da CD per chi lo cerca. Nascosto, ha vantaggio al primo attacco e si rivela attaccando; se viene trovato, togli la pill a mano.",
  ready: "Che cosa e quando si dice al tavolo. Fino all'inizio del suo prossimo turno si innesca con la reazione, dal menu della card: «Innesca con un attacco» apre questa console fuori turno, «Innesca senza attacco» segna solo la reazione.",
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
function activeConditions(item, condition) {
  return conditionInstancesOf(item).filter((instance) => instance && instance.active !== false && instance.condition === condition);
}
function hasActiveCondition(item, condition) {
  return activeConditions(item, condition).length > 0;
}
// The readied action as the card's menu reads it (reactionTrackerCore.js: the name, whatever its case).
function hasReadied(item) {
  return conditionInstancesNamed({ instances: conditionInstancesOf(item) }, READIED_ACTION_CONDITION).length > 0;
}
function friendly(item) {
  const attitude = String(item?.metadata?.[META_KEY]?.attitude || "neutral").toLocaleLowerCase("it");
  return attitude === "pc" || attitude === "ally";
}
// The Stealth total the GM typed: an integer, or null when there is none; NaN when it is not a number.
function stealthTotal(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= MAX_STEALTH ? number : NaN;
}

// Why the action cannot be registered now, or "". Only in combat, on the creature's own turn: the pills count turns,
// and the dash belongs to the movement of the turn. Help needs the creature it helps (or the enemy) and its mode.
export function pcTurnActionBlocker({ kind = "", sourceItem = null, turnState = null, targetItem = null, mode = "", stealth = null } = {}) {
  if (!LABELS[kind]) return "Azione non valida.";
  if (!sourceItem?.id) return "Nessuna creatura per questa azione.";
  const order = Array.isArray(turnState?.order) ? turnState.order.filter(Boolean) : [];
  if (!order.length) return "Solo in combattimento, con un ordine di iniziativa.";
  if (initiativeTurnCreatureId(turnState) !== sourceItem.id) return "Solo nel turno della creatura.";
  if (kind === "disengage" && hasActiveCondition(sourceItem, DISENGAGE_CONDITION)) return "Ha già il Disimpegno in questo turno.";
  if (kind === "dodge" && hasActiveCondition(sourceItem, DODGE_CONDITION)) return "È già in Schivata.";
  if (kind === "dash" && consoleDashCount(sourceItem, resolveSpeedCheckTurn(turnState).turnKey) >= MAX_TURN_DASHES)
    return `Già ${MAX_TURN_DASHES} scatti in questo turno.`;
  if (kind === "help") {
    if (!PC_HELP_MODES.includes(mode)) return "Scegli se aiuta una prova o un attacco.";
    if (!targetItem?.id) return mode === "attack" ? "Scegli il nemico." : "Scegli l'alleato da aiutare.";
    if (targetItem.id === sourceItem.id) return "Si aiuta un'altra creatura.";
    const condition = mode === "attack" ? HELP_TARGET_CONDITION : HELPED_CONDITION;
    if (activeConditions(targetItem, condition).some((instance) => String(instance.sourceId || "") === sourceItem.id))
      return `${targetItem.name || "La creatura"} ha già il suo aiuto.`;
  }
  if (kind === "ready" && hasReadied(sourceItem)) return "Ha già un'azione preparata.";
  if (kind === "hide") {
    if (hasActiveCondition(sourceItem, HIDDEN_CONDITION)) return "È già nascosto.";
    if (Number.isNaN(stealthTotal(stealth))) return `Furtività: un numero intero da 0 a ${MAX_STEALTH}, o niente.`;
  }
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

// The pill an action puts, and on whom: { condition, holder, options } or null (Dash).
function actionPill({ kind, sourceItem, targetItem, mode, stealth, sourceName }) {
  if (kind === "disengage") return { condition: DISENGAGE_CONDITION, holder: sourceItem, options: { expiry: { ...DISENGAGE_EXPIRY } } };
  if (kind === "dodge") return { condition: DODGE_CONDITION, holder: sourceItem, options: { expiry: { ...NEXT_OWN_TURN_START_EXPIRY } } };
  // The card menu's own pill and expiry (initiativeList.js, reactionConditionOptions).
  if (kind === "ready") return { condition: READIED_ACTION_CONDITION, holder: sourceItem, options: { expiry: { ...NEXT_OWN_TURN_START_EXPIRY } } };
  if (kind === "help" && mode === "attack") return { condition: HELP_TARGET_CONDITION, holder: targetItem, options: {
    expiry: { ...HELP_EXPIRY },
    effectDetail: `Il primo attacco di un alleato di ${sourceName} contro questa creatura, prima del prossimo turno di ${sourceName}, ha vantaggio. Si toglie da sola con quell'attacco.`,
  } };
  if (kind === "help") return { condition: HELPED_CONDITION, holder: targetItem, options: {
    expiry: { ...HELP_EXPIRY },
    effectDetail: `Vantaggio alla prossima prova del compito in cui ${sourceName} lo aiuta, prima del prossimo turno di ${sourceName}. Togli la pill dopo la prova.`,
  } };
  if (kind === "hide") return { condition: HIDDEN_CONDITION, holder: sourceItem, options: {
    expiry: { mode: "manual" },
    ...(stealth !== null ? { displayLabel: `${HIDDEN_CONDITION} · Furtività ${stealth}` } : {}),
    effectDetail: `Vantaggio al primo attacco; attaccando si rivela. Chi lo cerca confronta la sua Percezione con ${stealth !== null ? `la Furtività ${stealth}` : "la sua Furtività"}. Se viene trovato, togli la pill.`,
    // An enemy's hiding place is the GM's to know (D11).
    ...(friendly(sourceItem) ? {} : { mechanics: { gmOnly: true } }),
  } };
  return null;
}

// One Dash, Disengage, Dodge, Help, Hide or Ready of the creature whose turn it is. targetItem and mode: Help's; stealth:
// Hide's.
export function buildPcTurnActionMutation({ kind = "", sourceItem, attackInstanceId, turnState = null, targetItem = null, mode = "", stealth = null } = {}) {
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  const blocker = pcTurnActionBlocker({ kind, sourceItem, turnState, targetItem, mode, stealth });
  if (blocker) throw new Error(blocker);
  const name = LABELS[kind];
  const sourceName = sourceItem.name || sourceItem.id;
  const appliedAt = bossConditionAppliedAt(turnState);
  const turn = appliedAt?.turnKey ? appliedAt : null;
  const total = kind === "hide" ? stealthTotal(stealth) : null;
  const pill = actionPill({ kind, sourceItem, targetItem, mode, stealth: total, sourceName });
  const holder = pill?.holder || sourceItem;
  const holderName = holder.name || holder.id;
  const instanceId = pill ? bossGroupConditionInstanceId(attackInstanceId, pill.condition, holder.id) : "";
  const speedTurnKey = resolveSpeedCheckTurn(turnState).turnKey;
  const dashes = kind === "dash" ? consoleDashCount(sourceItem, speedTurnKey) + 1 : 0;
  const label = kind === "help" ? `${sourceName}: ${name} → ${holderName}` : `${sourceName}: ${name}`;
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, actionName: name, attackInstanceId, turnAction: kind },
    action: { id: `turn-action:${kind}`, label: name },
    turnAction: { kind, ...(kind === "dash" ? { dashes } : { condition: pill.condition }), ...(kind === "help" ? { mode } : {}),
      ...(total !== null && kind === "hide" ? { stealth: total } : {}) },
    ...(turn ? { turn } : {}),
    targets: [{ id: holder.id, name: holderName, ...(pill ? { conditions: [{ condition: pill.condition, instanceId }] } : {}) }],
  };
  const operations = pill ? [{
    type: "condition:add", targetIds: [holder.id], conditionName: pill.condition, instanceIds: { [holder.id]: instanceId },
    options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true, ...pill.options,
      ...(appliedAt ? { appliedAt } : {}) },
  }, { type: "condition:automate", subjectIds: [holder.id] }] : [];
  return {
    condition: pill?.condition || "", causality, manualText: "", labelTargetIds: pill ? [holder.id] : [],
    operations,
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: [holder.id],
      kind: PC_ATTACK_HISTORY_KIND, label,
      ...(kind === "dash" ? { metadataPatches: [dashStatePatch(sourceItem, speedTurnKey, dashes)] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: [] } },
    },
  };
}

// What the console reminds about a single attack (decisions D5, D7, A4), never a roll of its own: the dice stay the table's.
// - the target in Dodge: disadvantage to an attack roll against it, if it sees the attacker; advantage on a Dexterity save;
// - an attack roll this attacker makes with a pill's advantage (Help, Distracting Strike, Guiding Bolt), which it spends;
// - the attacker hidden: advantage, and the attack gives it away; the target hidden: disadvantage, if it is not seen.
// Nothing about the roll for an attack without one (Magic Missile, an arrow that replaces the roll).
export function pcAttackTargetNotes({ attack = null, targetItem = null, sourceItem = null, items = [] } = {}) {
  if (!attack || !targetItem) return [];
  const save = pcAttackSave(attack);
  if (save) return save === "dex" && hasActiveCondition(targetItem, DODGE_CONDITION) ? ["Schivata: vantaggio al TS su Destrezza."] : [];
  if (attack.mode || attack.spell?.delivery === "auto") return [];
  const notes = [];
  if (hasActiveCondition(targetItem, DODGE_CONDITION)) notes.push("Schivata: svantaggio all'attacco, se il bersaglio vede chi attacca.");
  if (hiddenPills(targetItem).length) notes.push("Bersaglio nascosto: svantaggio all'attacco, se chi attacca non lo vede.");
  if (sourceItem && hiddenPills(sourceItem).length) notes.push("Nascosto: vantaggio all'attacco; attaccando si rivela.");
  if (sourceItem) {
    for (const pill of consumedAdvantagePills({ attackerItem: sourceItem, targetItem, items })) {
      notes.push(`${pill.name}: vantaggio all'attacco; registrato, la pill si toglie.`);
    }
  }
  notes.push(...featAttackNotes({ attack, targetItem, sourceItem }));
  return notes;
}

// Lot F1 of docs/STUDIO_TALENTI.md: what the feats remind about an attack roll and its damage, never a roll of their own.
// Crusher's critical gives advantage to the attacks against its target, Slasher's critical disadvantage to its target's
// attacks; Savage Attacker and Piercer reroll dice once per turn, at the table.
function featAttackNotes({ attack, targetItem, sourceItem }) {
  const notes = [];
  if (hasActiveCondition(targetItem, CRUSHER_CRITICAL_CONDITION)) notes.push("Martello Vivente: vantaggio all'attacco.");
  if (sourceItem && hasActiveCondition(sourceItem, SLASHER_CRITICAL_CONDITION)) notes.push("Bisturi da Battaglia: svantaggio all'attacco.");
  const feats = new Set(sanitizeFeats(sourceItem?.metadata?.[META_KEY]?.initiativeCard?.[FEATS_FIELD]).map((entry) => entry.id));
  const weapon = !attack.cantrip && !attack.spell;
  if (weapon && attack.range === "melee" && feats.has("aggressore-selvaggio")) {
    notes.push("Aggressore Selvaggio: una volta per turno puoi ritirare i dadi dell'arma e tenere il totale che preferisci.");
  }
  if (weapon && (attack.components || []).some((component) => component?.type === "piercing") && feats.has("stile-penetrante")) {
    notes.push("Stile Penetrante: una volta per turno puoi ritirare un dado di danno perforante.");
  }
  return notes;
}
