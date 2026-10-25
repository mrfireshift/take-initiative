import { ID } from "./constants.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { takesDeathSaveDamage } from "./deathSaveCore.js";
import { createMonsterActionContext } from "./monsterActionContextCore.js";
import { bossActionUsageAvailability, consumeBossActionUsage, bossActionUsageSummary } from "./bossActionUsageCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";
import { componentDamageAfterDefense, damageDefenseFor, damageDefensesForItem, profileDamageDefensesForItem, sanitizeDamageDefenses,
  EVASION_DEFENSE, evasionAppliesTo, evasionFactor, evasionForItem } from "./damageDefensesCore.js";

export const BOSS_ACTION_STATE_FIELD = "bossActionState";
// The seam drawing kept on the map (Cucitura del Non-Luogo): { sourceId, actionInstanceId } of its boss and use.
export const BOSS_SEAM_ITEM_KEY = `${ID}/bossSeam`;
const META_KEY = `${ID}/meta`;
const clone = (value) => structuredClone(value);

export function isBossActionCreature(item) {
  const id = String(item?.id || "");
  return !!id && item?.type === "IMAGE" && item?.layer === "CHARACTER" && !item.attachedTo
    && id !== "__LAIR__" && !id.startsWith("__EPIC__") && !/::p\d+$/.test(id);
}

// A spell's token with hit points (Mano arcana, an animated object) is an object a creature can hit: a target of an
// attack or a save, never an actor. At 0 HP the HP write removes it (effectsMutations.js).
export function isBossActionObjectTarget(item) {
  return !!String(item?.id || "") && item?.type === "IMAGE" && item?.layer === "PROP" && !item.attachedTo
    && item.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.kind === "spell-board-token"
    && Number.isFinite(Number(item.metadata?.[META_KEY]?.hpMax));
}

export function isBossActionTargetItem(item) {
  return isBossActionCreature(item) || isBossActionObjectTarget(item);
}

export function bossInstanceForItem(item, profile) {
  const state = item?.metadata?.[META_KEY]?.[BOSS_ACTION_STATE_FIELD];
  if (state?.version === 1 && state.boundTokenId === item.id
      && state.bossDefinitionId === profile.bossDefinitionId && typeof state.bossInstanceId === "string"
      && state.bossInstanceId.trim()) return state.bossInstanceId;
  // A duplicated token can retain the definition, never another token's runtime identity.
  return `boss-instance:${item.id}:${profile.bossDefinitionId}`;
}

export function bossMetadataSnapshot(meta, field) {
  return Object.hasOwn(meta || {}, field) ? {present:true,value:clone(meta[field])} : {present:false};
}

export function bossRuntimeStateForItem(item, profile) {
  const previous=item?.metadata?.[META_KEY]?.[BOSS_ACTION_STATE_FIELD];
  return {
    ...(previous?.version===1 && previous.boundTokenId===item.id
        && previous.bossDefinitionId===profile.bossDefinitionId ? clone(previous) : {}),
    version:1,boundTokenId:item.id,bossDefinitionId:profile.bossDefinitionId,
    bossInstanceId:bossInstanceForItem(item,profile),
  };
}

// ---- Epic Action sequence (profile v19) ----
// Only a profile that declares a sequence keeps the round log on the boss token: every Epic Action resolved or
// registered from the console in this round, in order. Like the 1/Round counters it is keyed by the canonical
// round, so a new round starts empty without any listener.
export function bossProfileUsesSequence(profile) {
  return !!profile?.abilities?.some((ability) => ability.sequence);
}
export function bossEpicRoundLog(runtimeState, round) {
  const log = runtimeState?.epicLog;
  return Number.isSafeInteger(round) && log?.round === round && Array.isArray(log.actionIds)
    ? log.actionIds.filter((id) => typeof id === "string" && id) : [];
}
// Cucitura del Non-Luogo: the seam exists until the end of the round in which it was drawn, or until it is torn.
export function bossActiveSeam(runtimeState, round) {
  const seam = runtimeState?.seam;
  return seam && typeof seam === "object" && Number.isSafeInteger(round) && seam.round === round ? seam : null;
}
// v22: an ability for the boss above half its hit points, or at half or less (the alternative seam combo).
// Read from the canonical HP of the token; "" when the gate is open or the ability has none.
export function bossHpGateBlocker(action, sourceItem) {
  const gate = action?.hpGate;
  if (!gate) return "";
  const meta = sourceItem?.metadata?.[META_KEY] || {};
  const hp = Number(meta.hp), hpMax = Number(meta.hpMax);
  const boss = sourceItem?.name || "Il boss";
  if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) return `${action.name}: PF di ${boss} non leggibili.`;
  const bloodied = hp * 2 <= hpMax;
  if (gate === "bloodied" && !bloodied) return `${action.name} richiede che ${boss} abbia la metà o meno dei suoi PF (${hp}/${hpMax}).`;
  if (gate === "unbloodied" && bloodied) return `${action.name} non è più disponibile: ${boss} ha la metà o meno dei suoi PF (${hp}/${hpMax}).`;
  return "";
}
// What the sequence forbids now, from the data on the token (a hard block); "" when nothing does.
export function bossSequenceBlocker(profile, action, runtimeState, round, sourceName = "") {
  if (action?.category !== "epic-action" || !bossProfileUsesSequence(profile)) return "";
  const name = (id) => profile.abilities.find((entry) => entry.id === id)?.name || id;
  const boss = sourceName || String(profile.name || "").split(",")[0].trim() || "Il boss";
  const seam = bossActiveSeam(runtimeState, round);
  const seamAbility = seam ? profile.abilities.find((entry) => entry.id === seam.actionId && entry.execution?.kind === "seam") : null;
  if (seamAbility?.execution.seam.blocks.includes(action.id)) return `Finché la cucitura esiste, ${boss} non può usare ${action.name}.`;
  const log = bossEpicRoundLog(runtimeState, round);
  // v20: a first Epic Action that allows only some epic actions until the end of the round (Gather the Winter Sky);
  // the actions that follow it (Meteor Swarm, Rock) are allowed too.
  for (const id of new Set(log)) {
    const opener = profile.abilities.find((entry) => entry.id === id && entry.sequence?.allowOnly);
    if (!opener || opener.id === action.id || opener.sequence.allowOnly.includes(action.id) || action.sequence?.after === opener.id) continue;
    const allowed = [...new Set([...opener.sequence.allowOnly, ...profile.abilities.filter((entry) => entry.sequence?.after === opener.id).map((entry) => entry.id)])].map(name);
    return `Durante ${opener.name} ${boss} può usare soltanto ${allowed.join(", ")}.`;
  }
  const sequence = action.sequence;
  if (!sequence) return "";
  if (!Number.isSafeInteger(round) || round < 1) return "Round canonico non impostato: la sequenza delle Azioni Epiche si verifica solo in combattimento.";
  if (sequence.slot === "first" && log.length)
    return `${action.name} dev’essere la prima Azione Epica del round: nel round ${round} ${boss} ha già usato ${name(log[0])}.`;
  if (sequence.after && !log.includes(sequence.after)) return `${action.name} richiede ${name(sequence.after)} nello stesso round.`;
  if (action.execution?.target?.area?.shape === "seam" && !seam) return `La cucitura di ${name(sequence.after)} non c’è più.`;
  return "";
}
const isPlayerCharacter = (item) => String(item?.metadata?.[META_KEY]?.attitude || "").toLocaleLowerCase("it") === "pc";
// The Epic Action slots of the round: one at the end of each player character's turn, in initiative order
// (a character at 0 HP keeps its slot). Read-only: the order may hold virtual ids, which are never characters.
export function bossEpicSlot(turnState, items = []) {
  const order = Array.isArray(turnState?.order) ? turnState.order.map((id) => String(id || "")) : [];
  if (!order.length) return null;
  const pcs = new Map((Array.isArray(items) ? items : []).filter(isPlayerCharacter).map((item) => [item.id, item]));
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(turnState?.current) || 0)));
  const slots = order.map((id, index) => ({ id, index })).filter((row) => pcs.has(row.id));
  if (!slots.length) return null;
  const done = slots.filter((row) => row.index <= current);
  const nameOf = (row) => pcs.get(row.id)?.name || row.id;
  return { total: slots.length, index: done.length, last: done.length === slots.length,
    after: done.length ? nameOf(done[done.length - 1]) : "", remaining: slots.filter((row) => row.index > current).map(nameOf) };
}
// "Last Epic Action of the round" depends on the order and on the GM's own slots (e.g. a major NPC ally):
// a warning the GM confirms, never a block. "" when the current slot is the last one.
export function bossSequenceWarning(action, slot) {
  if (action?.sequence?.slot !== "last") return "";
  if (!slot) return "Nessun personaggio nell’ordine di iniziativa: verifica tu che sia l’ultima Azione Epica del round.";
  if (slot.last) return "";
  return `Non è l’ultimo slot del round: ${slot.remaining.length === 1 ? "deve" : "devono"} ancora agire ${slot.remaining.join(", ")}. Confermalo solo se è davvero l’ultima Azione Epica del round.`;
}

// spellId: the Spellcasting spell actually cast, so the provenance names it (defaults to the first listed).
export function buildBossActionUse({profile,action,sourceItem,actionInstanceId,round,spellId}={}) {
  if (!isBossActionCreature(sourceItem) || !action || !actionInstanceId)
    throw new Error("Identità azione boss mancante.");
  const sourceMeta=sourceItem.metadata?.[META_KEY] || {};
  const before=bossRuntimeStateForItem(sourceItem,profile);
  const availability=bossActionUsageAvailability(action,before,{phaseId:profile.phaseId,round});
  // A spent counter is named first; then the Epic Action sequence of the round (profile v19+).
  if (availability.tracked && !availability.available) throw new Error(availability.reason || "Risorsa esaurita.");
  // v22: the hit point gate, from the canonical HP of the token.
  const gated=bossHpGateBlocker(action,sourceItem);
  if (gated) throw new Error(gated);
  const blocked=bossSequenceBlocker(profile,action,before,round,sourceItem.name);
  if (blocked) throw new Error(blocked);
  const runtimeState=consumeBossActionUsage(action,before,{phaseId:profile.phaseId,round});
  // v19: the round log of Epic Actions; a line on the seam tears it (the seam is gone).
  const logged=bossProfileUsesSequence(profile) && action.category==="epic-action" && Number.isSafeInteger(round) && round>0;
  if (logged) runtimeState.epicLog={round,actionIds:[...bossEpicRoundLog(before,round),action.id]};
  if (action.execution?.target?.area?.shape==="seam") delete runtimeState.seam;
  const context=createMonsterActionContext({profile,bossInstanceId:before.bossInstanceId,
    tokenId:sourceItem.id,actorName:sourceItem.name || profile.name,action,actionInstanceId,...(spellId?{spellId}:{})});
  if (!context) throw new Error("Provenance dell’azione boss non valida.");
  runtimeState.lastAction={actionInstanceId,profileId:profile.profileId,profileRevision:profile.profileRevision,
    phaseId:profile.phaseId,actionId:action.id};
  const resources=availability.tracked ? [{actionId:action.id,phaseId:profile.phaseId,
    period:availability.period,limit:availability.limit,beforeUsed:availability.used,
    afterUsed:availability.used+1,...(availability.period==="round"?{round}:{})}] : [];
  return {runtimeState,context,resources,metadataPatches:[{id:sourceItem.id,fields:{
    initiativeCard:{mode:"assert",expected:bossMetadataSnapshot(sourceMeta,"initiativeCard")},
    [BOSS_ACTION_STATE_FIELD]:{value:runtimeState,expected:bossMetadataSnapshot(sourceMeta,BOSS_ACTION_STATE_FIELD)},
  }}],sceneMetadataPreconditions:availability.period==="round" || logged ? [{key:ID+"/state",field:"round",value:round}] : []};
}
// GM tool: clear every 1/Round and 1/Phase counter and the mark's per-round use of this boss token,
// e.g. for a new combat or a replayed phase. One command, one History entry, undoable like any boss action.
export function buildBossResourceReset({profile, sourceItem, actionInstanceId, round} = {}) {
  if (!isBossActionCreature(sourceItem) || !actionInstanceId) throw new Error("Identità del boss mancante.");
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const before = bossRuntimeStateForItem(sourceItem, profile);
  const summary = bossActionUsageSummary(before, round);
  if (summary.valid && !summary.total && !before.epicLog && !before.seam) throw new Error("Nessuna risorsa da azzerare.");
  const runtimeState = {...clone(before),usageState:{version:1,rounds:{},phases:{}}};
  delete runtimeState.markUses;
  // A new combat starts its Epic Action sequence again (round log and seam, profile v19).
  delete runtimeState.epicLog;
  delete runtimeState.seam;
  const context = createMonsterActionContext({profile,bossInstanceId:before.bossInstanceId,tokenId:sourceItem.id,
    actorName:sourceItem.name || profile.name,action:{id:"resource-reset",name:"Azzera risorse"},actionInstanceId});
  if (!context) throw new Error("Provenance dell’azzeramento non valida.");
  const label = `${sourceItem.name || profile.name}: risorse azzerate`;
  const causality = {...context,resourceReset:{round:Number.isSafeInteger(round)?round:null,rounds:summary.rounds,
    phaseUses:summary.phaseUses,markUses:summary.markUses}};
  return {operations:[],causality,options:{commandId:actionInstanceId,correlationId:actionInstanceId,sourceId:sourceItem.id,
    targetIds:[sourceItem.id],kind:"monster-action",label,
    metadataPatches:[{id:sourceItem.id,fields:{
      initiativeCard:{mode:"assert",expected:bossMetadataSnapshot(sourceMeta,"initiativeCard")},
      [BOSS_ACTION_STATE_FIELD]:{value:runtimeState,expected:bossMetadataSnapshot(sourceMeta,BOSS_ACTION_STATE_FIELD)},
    }}],
    history:{kind:"monster-action",label,payload:{causality}}}};
}

export function damageAmount(value) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean")
    throw new Error("Inserisci il danno di ogni componente.");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000)
    throw new Error("Il danno deve essere un intero non negativo.");
  return amount;
}

// Actor Profile defenses (resistance/immunity/vulnerability) apply per damage type after the save/attack factor.
// The GM may ignore a defense for one resolution; the preview the GM saw must match the profile at commit.
export function defendedComponents(components, inputs, factor, targetItem, ignoredTypes = [], expectedDefenses, marked = false) {
  const profileDefenses = damageDefensesForItem(targetItem, META_KEY);
  const ownProfileDefenses = profileDamageDefensesForItem(targetItem, META_KEY);
  if (expectedDefenses !== undefined && JSON.stringify(sanitizeDamageDefenses(expectedDefenses)) !== JSON.stringify(profileDefenses))
    throw new Error(`Le difese ai danni di ${targetItem.name || targetItem.id} sono cambiate: riapri l’azione.`);
  // A boss mark changes only this resolution's cold defense; the Actor Profile is never rewritten.
  const defenses = marked ? bossMarkedDefenses(profileDefenses) : profileDefenses;
  const ignored = new Set(Array.isArray(ignoredTypes) ? ignoredTypes : []);
  return components.map((component) => {
    const inputAmount = inputs[component.id];
    if (factor === "zero") return {...clone(component),inputAmount,factor,defense:null,amount:0};
    const profileDefense = damageDefenseFor(defenses, component.type);
    const defense = profileDefense && !ignored.has(component.type) ? profileDefense : null;
    const markRule = marked && component.type === "cold" ? {mark:{rule:"cold-ward-break",profileDefense:damageDefenseFor(profileDefenses,"cold")}} : {};
    // Effective defenses include active effects; the source says which one the log should credit.
    const defenseSource = damageDefenseFor(ownProfileDefenses, component.type) === profileDefense ? "actor-profile" : "effect";
    return {...clone(component),inputAmount,factor,defense,
      ...(profileDefense ? {defenseSource,...(defense ? {} : {defenseIgnored:profileDefense})} : {}),...markRule,
      amount:componentDamageAfterDefense(inputAmount,factor,defense)};
  });
}

// ---- boss marks (Mark of the Frostmaiden) ----
// One pill per target, shared by every phase of the same boss definition (the phase-3 token may differ).
export function bossMarkEffectId(profile, markId) {
  return `monster-mark:${profile?.bossDefinitionId}:${markId}`;
}
export function bossProfileMarkIds(profile) {
  return [...new Set((Array.isArray(profile?.abilities) ? profile.abilities : [])
    .flatMap((entry) => [entry.execution?.onFailed?.mark?.id, entry.execution?.requiresMark?.id]).filter(Boolean))];
}
export function bossMarkInstances(item, profile) {
  const ids = new Set(bossProfileMarkIds(profile).map((id) => bossMarkEffectId(profile, id)));
  return conditionInstancesOf(item).filter((instance) => ids.has(instance?.effectId) && instance.active !== false);
}
export function bossTargetMarked(item, profile) {
  return bossMarkInstances(item, profile).length > 0;
}
// Cold-ward-break: the first cold damage each round from the boss ignores cold resistance and
// treats cold immunity as resistance. The per-round use lives in the boss runtime state.
export function bossMarkedDefenses(defenses) {
  const withoutCold = (list) => (Array.isArray(list) ? list : []).filter((type) => type !== "cold");
  const immune = (defenses?.immunities || []).includes("cold");
  return {immunities:withoutCold(defenses?.immunities),
    resistances:immune ? [...withoutCold(defenses?.resistances), "cold"] : withoutCold(defenses?.resistances),
    vulnerabilities:[...(defenses?.vulnerabilities || [])]};
}
export function bossMarkReady(item, profile, sourceItem, round) {
  if (!bossTargetMarked(item, profile)) return false;
  return sourceItem?.metadata?.[META_KEY]?.[BOSS_ACTION_STATE_FIELD]?.markUses?.[item.id] !== round;
}
// The rule is spent only when cold damage is actually dealt (a miss or a zero cold roll keeps it).
export function bossMarkApplies({ profile, sourceItem, targetItem, round, components = [], amounts = {}, factor = "full" } = {}) {
  const cold = (Array.isArray(components) ? components : []).find((component) => component.type === "cold");
  return !!cold && factor !== "zero" && Number(amounts?.[cold.id]) > 0 && bossMarkReady(targetItem, profile, sourceItem, round);
}
// Detonation of the Mark: only a creature marked by this boss.
export function bossMarkBlocker(action, item, profile) {
  return action?.execution?.requiresMark && item && !bossTargetMarked(item, profile)
    ? "Il bersaglio deve essere marchiato dal boss." : "";
}
function recordMarkUses(runtimeState, ids, round) {
  if (!ids.length) return;
  const previous = runtimeState.markUses && typeof runtimeState.markUses === "object" ? runtimeState.markUses : {};
  runtimeState.markUses = {...Object.fromEntries(Object.entries(previous).filter(([, value]) => value === round)),
    ...Object.fromEntries(ids.map((id) => [id, round]))};
}
function markExpectation(expectedMarkedIds, targets, markedIds) {
  if (!Array.isArray(expectedMarkedIds)) return;
  const changed = targets.find((target) => markedIds.includes(target.id) !== expectedMarkedIds.includes(target.id));
  if (changed) throw new Error(`Il marchio di ${changed.name || changed.id} è cambiato: riapri l’azione.`);
}

// Commit-time precondition: the target's Actor Profile (and so its defenses) must not change before the commit.
export function targetProfileAssert(item) {
  return {id:item.id,fields:{initiativeCard:{mode:"assert",expected:bossMetadataSnapshot(item.metadata?.[META_KEY] || {},"initiativeCard")}}};
}

function conditionInstancesOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}
// Creatures the boss currently holds: an active Afferrato whose source is the boss token.
export function bossGrappledIds(items = [], sourceId = "") {
  return (Array.isArray(items) ? items : []).filter((item) => item?.id && item.id !== sourceId
    && conditionInstancesOf(item).some((instance) => instance?.condition === "Afferrato" && instance.sourceId === sourceId && instance.active !== false))
    .map((item) => item.id);
}
// Titan's Grasp holds one creature at a time; Crush needs the creature the boss holds.
export function bossGrappleBlocker(action, targetId, grappledIds = []) {
  const rule = action?.execution?.grapple;
  if (rule === "grab" && grappledIds.length) return grappledIds.includes(targetId)
    ? "Il bersaglio è già Afferrato dal boss." : "Il boss tiene già una creatura Afferrata.";
  if (rule === "hold" && targetId && !grappledIds.includes(targetId)) return "Il bersaglio deve essere Afferrato dal boss.";
  return "";
}

export function buildBossActionMutation({
  profile, action, sourceItem, targetItem, mode = "", outcome = "",
  componentAmounts = {}, actionInstanceId, round, manualConfirmed=false, ignoredDefenses = [], expectedDefenses,
  turnState = null, grappledIds = [], expectedMarkedIds, expectedEvasion, rider = "", teleport = null, critical = false,
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionTargetItem(targetItem))
    throw new Error("Attore e bersaglio devono essere token creatura reali.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  const execution = action?.execution;
  if (!["SUPPORTED","PARTIAL"].includes(action?.automation)
      || !["attack-damage","save-damage"].includes(execution?.kind))
    throw new Error("Questa capacità resta un riferimento manuale.");
  const attack = execution.kind === "attack-damage";
  // Frostmaiden's Kiss and an attack with a chosen effect on a hit: their manual text is a follow-up, not a prerequisite.
  if (attack && !execution.drain && !execution.onHit && !action.sequence && action.automation==="PARTIAL" && action.manualText && manualConfirmed!==true)
    throw new Error("Conferma manualmente la restrizione dell’azione prima di risolverla.");
  if (attack && (!execution.attack?.modes?.includes(mode) || !["hit","miss"].includes(outcome)))
    throw new Error("Scegli modalità e risultato dell'attacco.");
  if (!attack && !["failed","passed"].includes(outcome)) throw new Error("Scegli l'esito del tiro salvezza.");
  // v21 (Il Corpo Non Era Qui): the boss teleports first, in the same command as the save (one History entry).
  const destination = execution.teleport ? placementPoint(teleport) : null;
  if (execution.teleport && !destination) throw new Error("Scegli sulla mappa dove si teletrasporta il boss.");
  const grappleBlocker = bossGrappleBlocker(action, targetItem.id, Array.isArray(grappledIds) ? grappledIds : [])
    || bossMarkBlocker(action, targetItem, profile);
  if (grappleBlocker) throw new Error(grappleBlocker);
  // Arto che Precede il Corpo (v18): on a hit the boss picks one effect; a grab holds one creature at a time.
  const hitChoice = attack && outcome === "hit" && execution.onHit ? execution.onHit.choices.find((choice) => choice.id === rider) : null;
  if (attack && outcome === "hit" && execution.onHit && !hitChoice) throw new Error("Scegli l’effetto del colpo.");
  if (hitChoice?.id === "grab" && (Array.isArray(grappledIds) ? grappledIds : []).length)
    throw new Error(grappledIds.includes(targetItem.id) ? "Il bersaglio è già Afferrato dal boss." : "Il boss tiene già una creatura Afferrata.");
  // A miss, or a passed save against an all-or-nothing effect (Titan's Grasp), deals no damage.
  const miss = attack ? outcome === "miss" : outcome === "passed" && execution.success === "none";
  const evasion = !attack && evasionAppliesTo(execution) && evasionForItem(targetItem, META_KEY);
  if (expectedEvasion !== undefined && expectedEvasion !== evasion) throw new Error(`L’Elusione di ${targetItem.name || targetItem.id} è cambiata: riapri l’azione.`);
  const evasionUsed = evasion && !(Array.isArray(ignoredDefenses) ? ignoredDefenses : []).includes(EVASION_DEFENSE);
  const baseFactor = !attack && outcome === "passed" ? "half" : "full";
  const factor = evasionUsed ? evasionFactor(baseFactor) : baseFactor;
  const components = execution.damage;
  if (!Array.isArray(components) || !components.length || new Set(components.map(c=>c.id)).size !== components.length)
    throw new Error("Componenti di danno non valide.");
  if (!miss && Object.keys(componentAmounts).some(id=>!components.some(c=>c.id===id)))
    throw new Error("Componente di danno sconosciuta.");
  const inputs = Object.fromEntries(components.map(component => [component.id, miss ? null : damageAmount(componentAmounts[component.id])]));
  const marked = bossMarkApplies({profile,sourceItem,targetItem,round,components,amounts:inputs,factor:miss?"zero":factor});
  markExpectation(expectedMarkedIds,[targetItem],marked?[targetItem.id]:[]);
  const damageComponents = defendedComponents(components,inputs,miss?"zero":factor,targetItem,ignoredDefenses,expectedDefenses,marked);
  const requestedDamage = damageComponents.reduce((sum,c)=>sum+c.amount,0);
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  let change = null;
  if (!miss) {
    if (!Number.isFinite(targetMeta.hp) || !Number.isFinite(targetMeta.hpMax)
        || targetMeta.hp < 0 || targetMeta.hpMax < 0) throw new Error("Il bersaglio non ha HP canonici validi.");
    change = calculateQuickHPChange({value:requestedDamage,hp:targetMeta.hp,hpMax:targetMeta.hpMax,deathSaveDamage:takesDeathSaveDamage(targetMeta)});
  }
  const use=buildBossActionUse({profile,action,sourceItem,actionInstanceId,round});
  recordMarkUses(use.runtimeState,marked?[targetItem.id]:[],round);
  const manualText = hitChoice?.id === "pull"
    ? `Trascina ${targetItem.name || "il bersaglio"} di ${hitChoice.distance} ft. verso ${sourceItem.name || profile.name} sulla mappa (se ${hitChoice.maxSize} o più piccolo).`
    : hitChoice?.id === "grab" ? `Afferrato (CD ${hitChoice.escapeDC} per sfuggire): verifica che sia ${hitChoice.maxSize} o più piccolo.`
    : attack ? action.manualText || "" : outcome === "failed" ? action.manualText || "" : "";
  // Frostmaiden's Kiss: the boss regains the necrotic damage taken (after defenses), within its maximum.
  let drain = null;
  if (execution.drain && change) {
    const necrotic = damageComponents.find((component) => component.id === execution.drain.component)?.amount || 0;
    const healing = calculateQuickHPChange({mode:QUICK_HP_MODES.HEAL,value:necrotic,hp:sourceMeta.hp,hpMax:sourceMeta.hpMax});
    drain = {component:execution.drain.component,amount:necrotic,healing,
      maxHpReduction:{targetId:targetItem.id,amount:necrotic,manual:true}};
  }
  // Detonation of the Mark: the mark ends on the target whatever the outcome.
  const consumedMarks = execution.consumesMark ? bossMarkInstances(targetItem, profile).map((instance) => instance.id) : [];
  // Standard conditions (the ones of the Conditions popover), independent and removed by hand.
  const appliedAt = bossConditionAppliedAt(turnState);
  const conditions = !attack && outcome === "failed" ? (execution.onFailed?.conditions || []).map((entry) => ({condition:entry.condition,
    instanceId:bossGroupConditionInstanceId(actionInstanceId,entry.condition,targetItem.id),expiry:clone(entry.expiry),
    ...(entry.escapeDC?{escapeDC:entry.escapeDC}:{})}))
    : hitChoice?.id === "grab" ? [{condition:hitChoice.condition,instanceId:bossGroupConditionInstanceId(actionInstanceId,hitChoice.condition,targetItem.id),
      expiry:{mode:"manual"},escapeDC:hitChoice.escapeDC}] : [];
  const conditionOperations = conditions.map((entry) => ({type:"condition:add",targetIds:[targetItem.id],conditionName:entry.condition,
    instanceIds:{[targetItem.id]:entry.instanceId},
    options:{sourceId:sourceItem.id,sourceName:sourceItem.name || profile.name,parentEffectId:"",type:"automatic",manualRemoval:true,
      expiry:clone(entry.expiry),...(appliedAt?{appliedAt}:{})}}));
  const causality = {
    ...use.context,resources:use.resources,
    targets:[{id:targetItem.id,name:targetItem.name,outcome,requestedDamage,
      ...(change?{appliedHpDelta:change.delta}:{}),damageComponents:clone(damageComponents),
      ...(conditions.length?{conditions:clone(conditions)}:{}),...(evasion?{evasion:evasionUsed?"applied":"ignored"}:{})}],
    ...(attack ? {attack:{...clone(execution.attack),mode,outcome}}
      : {save:{...clone(execution.save),outcome,damageFactor:miss?"zero":factor,success:execution.success}}),
    ...(conditions.length?{conditionsApplied:conditions.map((entry)=>({targetId:targetItem.id,...clone(entry),...(appliedAt?{appliedAt}:{})}))}:{}),
    ...(execution.grapple?{grapple:{rule:execution.grapple,heldBefore:clone(grappledIds)}}:{}),
    ...(hitChoice?{onHit:{choice:hitChoice.id,...(hitChoice.id==="grab"?{escapeDC:hitChoice.escapeDC,heldBefore:clone(grappledIds)}:{distance:hitChoice.distance})}}:{}),
    ...(marked?{mark:{rule:"cold-ward-break",targetIds:[targetItem.id],round}}:{}),
    ...(consumedMarks.length?{markConsumed:{targetId:targetItem.id,instanceIds:consumedMarks}}:{}),
    ...(drain?{drain:{component:drain.component,amount:drain.amount,bossHpBefore:drain.healing.hp,bossHpAfter:drain.healing.afterHP,
      healed:drain.healing.afterHP-drain.healing.hp,maxHpReduction:drain.maxHpReduction}}:{}),
    ...(destination?{teleport:{range:execution.teleport.range,from:placementPoint(sourceItem.position),to:destination}}:{}),
  };
  Object.assign(use.runtimeState.lastAction,{targetId:targetItem.id,outcome,...(attack?{mode}:{})});
  // A critical hit (its dice already doubled by the GM): two death save failures on a PC at 0 HP.
  const criticalHit = attack && outcome === "hit" && critical === true;
  const label = `${sourceItem.name || profile.name}: ${action.name} → ${targetItem.name || targetItem.id}${criticalHit ? " (critico)" : ""}`;
  return {
    change,damageComponents,manualText,causality,conditions,drain:causality.drain || null,
    operations:[...(change?.changed || drain?.healing.changed ? [{type:"hp:set",updates:[
      ...(change?.changed?[{itemId:targetItem.id,hp:change.afterHP,hpMax:change.hpMax,
        hpIntent:{mode:"damage",amount:change.requested,eventId:actionInstanceId,...(criticalHit && change.deathSaveDamage?{critical:true}:{})},
        expectedHP:bossMetadataSnapshot(targetMeta,"hp"),expectedHPMax:bossMetadataSnapshot(targetMeta,"hpMax")}]:[]),
      ...(drain?.healing.changed?[{itemId:sourceItem.id,hp:drain.healing.afterHP,hpMax:drain.healing.hpMax,
        expectedHP:bossMetadataSnapshot(sourceMeta,"hp"),expectedHPMax:bossMetadataSnapshot(sourceMeta,"hpMax")}]:[]),
    ]}] : []),...conditionOperations,
    ...(consumedMarks.length?[{type:"condition:remove-instances",targetIds:[targetItem.id],removals:consumedMarks.map((instanceId)=>({itemId:targetItem.id,instanceId}))}]:[]),
    ...(conditionOperations.length || consumedMarks.length?[{type:"condition:automate",subjectIds:[targetItem.id]}]:[])],
    options:{
      commandId:actionInstanceId,correlationId:actionInstanceId,sourceId:sourceItem.id,
      targetIds:destination?[targetItem.id,sourceItem.id]:[targetItem.id],kind:"monster-action",label,
      // The spells' teleport: moved after the commit, recorded with the command and undone with it.
      ...(destination?{sideEffects:[{type:"token:teleport",targetId:sourceItem.id,position:destination,operationId:actionInstanceId}]}:{}),
      metadataPatches:[...use.metadataPatches,...(change?.changed?[targetProfileAssert(targetItem)]:[])],
      sceneMetadataPreconditions:use.sceneMetadataPreconditions,
      history:{kind:"monster-action",label,payload:{causality,damageComponents:clone(damageComponents),
        ...(manualText?{manualRemainder:manualText}:{})}},
    },
  };
}

export function isBossActionGroupExecution(action) {
  return ["SUPPORTED", "PARTIAL"].includes(action?.automation)
    && ["save-damage", "save-effect"].includes(action?.execution?.kind) && action.execution.target?.mode === "multiple"
    || isBossActionGroupAttack(action);
}
// Divine Brilliance: one attack per creature of the group (v10).
export function isBossActionGroupAttack(action) {
  return ["SUPPORTED", "PARTIAL"].includes(action?.automation)
    && action?.execution?.kind === "attack-damage" && action.execution.target?.mode === "multiple";
}
// The HP trigger of a reaction (Divine Brilliance): the boss is below the printed threshold.
export function bossTriggerMet(action, sourceItem) {
  const below = action?.execution?.trigger?.hpBelow;
  const hp = sourceItem?.metadata?.[META_KEY]?.hp;
  return Number.isInteger(below) && Number.isFinite(hp) && hp < below;
}

// Soul-Numbing Cold's pill: a debuff named after the action, its parts read from validated data only.
export function bossEffectSummaryParts(effect) {
  return [
    ...(effect?.speedPenalty ? [{id:"speed-penalty",label:`Velocità −${effect.speedPenalty} ft`}] : []),
    ...(effect?.noHealing ? [{id:"no-healing",label:"0 PF dalle cure"}] : []),
    ...(effect?.noTempHP ? [{id:"no-temp-hp",label:"No PF temporanei"}] : []),
  ];
}

// Same shape as the spell resolver's appliedAt: the turn key lets a next-turn expiry skip the turn in progress.
export function bossConditionAppliedAt(turnState) {
  const order = Array.isArray(turnState?.order) ? turnState.order : [];
  if (!order.length) return null;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(turnState.current) || 0)));
  return {
    round: Math.max(1, Math.floor(Number(turnState.round) || 1)),
    actorId: String(order[current] || "").replace(/::p\d+$/u, "") || null,
    phase: "turn",
    turnKey: currentInitiativeTurnKey(turnState),
  };
}

// Placement rule shared with spellAreaRules.getBossActionAreaRuleById (same string contract).
export function bossActionAreaRuleId(area) {
  // v19: the line along the seam (its width); the tool lays it on the seam drawn by the GM.
  if (area?.shape === "seam") return Number.isInteger(area?.size) && area.size > 0 ? `boss-action-area:seam:${area.size}ft` : "";
  return ["cone", "circle", "emanation"].includes(area?.shape) && Number.isInteger(area?.size) && area.size > 0
    ? `boss-action-area:${area.shape}:${area.size}ft` : "";
}
// Cucitura del Non-Luogo: a line between two free points, up to the printed length.
export function bossSeamRuleId(seam) {
  return Number.isInteger(seam?.maxLength) && Number.isInteger(seam?.width) && seam.maxLength > 0 && seam.width > 0
    ? `boss-action-area:line:${seam.maxLength}ft:${seam.width}ft` : "";
}

export function bossAreaShapeLabel(area) {
  // v22: the lines of Strappare le Cuciture, one on each chosen segment.
  if (area?.shape === "seam" && area.segments) return "linee sulle cuciture";
  return { cone: "cono", circle: "cerchio", emanation: "emanazione", seam: "linea sulla cucitura" }[area?.shape] || String(area?.shape || "area");
}

// Only a recharge note is a precondition the GM must confirm before resolving (Breath's Special Recharge
// and its sequence); other manual text describes what happens afterwards and stays a reminder.
export function bossGroupRequiresConfirmation(action) {
  // A recharge note (Breath) or an explicit requirement (Meteor Swarm after Gather the Winter Sky).
  // v19: a recharge that follows the sequence (Strappare la Cucitura after the seam) is checked from the round log.
  return (!!action?.usage?.note && !action?.sequence) || action?.execution?.requiresConfirmation === true;
}

// A passed save can grant immunity to the action's condition (Blinding Gleam): a buff pill on the target.
export function bossImmunityEffectId(action) {
  return action?.execution?.onPassed?.immunity ? `monster-action:${action.id}:immune` : "";
}
export function bossImmunityName(action) {
  return `Immune · ${action?.name || ""}`;
}
export function bossTargetImmune(item, action) {
  const effectId = bossImmunityEffectId(action);
  if (!effectId) return false;
  const value = item?.metadata?.[META_KEY]?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.some((instance) => instance?.effectId === effectId && instance.active !== false);
}

function placementPoint(value) {
  const x = Number(value?.x), y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// The drawn area is provenance, not geometry to recompute: the tool already resolved the hits.
export function sanitizeBossAreaPlacement(value, area) {
  const ruleId = bossActionAreaRuleId(area);
  if (!value || typeof value !== "object" || !ruleId || value.ruleId !== ruleId) return null;
  const start = placementPoint(value.start), end = placementPoint(value.end);
  // A cone needs a direction; a circle or an emanation may report its centre only.
  if (!start || !end || (area.shape === "cone" && start.x === end.x && start.y === end.y)) return null;
  const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map((id) => String(id || "")).filter(Boolean))];
  const areaTargetIds = ids(value.areaTargetIds);
  // Multi-point areas: the creatures the console found within the inner radius of this point.
  return { ruleId, start, end, areaTargetIds, ...(Array.isArray(value.innerTargetIds) ? { innerTargetIds: ids(value.innerTargetIds) } : {}) };
}

// v22: the segments of a chained seam, in drawing order: segment i joins points[i] and points[i + 1].
export function bossSeamSegments(seam) {
  const points = Array.isArray(seam?.points) ? seam.points.map(placementPoint) : [];
  if (points.length < 3 || points.some((value) => !value)) return [];
  return points.slice(1).map((end, index) => ({ index, start: points[index], end }));
}
export function bossSeamSegmentLabel(index) {
  const letter = (value) => String.fromCharCode(65 + value);
  return `${letter(index)}–${letter(index + 1)}`;
}
// Each drawn line must lie on a distinct segment of the seam of this round (either direction).
export function bossSeamSegmentPlacements(seam, values, area) {
  const segments = bossSeamSegments(seam);
  if (!segments.length) throw new Error("Le cuciture di questo round non ci sono più.");
  const rows = (Array.isArray(values) ? values : []).map((value) => sanitizeBossAreaPlacement(value, area));
  if (!rows.length || rows.some((row) => !row)) throw new Error("Scegli almeno una cucitura e mostra la sua linea prima di applicare.");
  const same = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  const used = new Set();
  return rows.map((row) => {
    const segment = segments.find((entry) => !used.has(entry.index)
      && ((same(row.start, entry.start) && same(row.end, entry.end)) || (same(row.start, entry.end) && same(row.end, entry.start))));
    if (!segment) throw new Error("Una linea non segue una cucitura del round (o la ripete): mostrala di nuovo.");
    used.add(segment.index);
    return { ...row, segment: segment.index };
  }).sort((a, b) => a.segment - b.segment);
}

export function bossGroupConditionInstanceId(actionInstanceId, conditionName, targetId) {
  return `${actionInstanceId}:${String(conditionName).toLocaleLowerCase("it")}:${targetId}`;
}

// One coordinated command for every chosen creature: per-target saves, shared per-component
// scaling, conditions only on failure. All decisions are required before any mutation exists.
export function buildBossActionGroupMutation({
  profile, action, sourceItem, targetItems = [], outcomes = {}, componentAmounts = {},
  actionInstanceId, round, turnState = null, manualConfirmed = false, areaPlacement = null, areaPlacements = null, innerIds = null,
  ignoredDefenses = {}, expectedDefenses, expectedImmuneIds, expectedMarkedIds, expectedEvasionIds,
} = {}) {
  if (!isBossActionCreature(sourceItem)) throw new Error("L’attore deve essere il token reale del boss.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  if (!isBossActionGroupExecution(action)) throw new Error("Questa capacità non usa bersagli multipli.");
  if (isBossActionGroupAttack(action)) return buildBossActionGroupAttackMutation(arguments[0]);
  if (bossGroupRequiresConfirmation(action) && manualConfirmed !== true) throw new Error("Conferma ricarica e sequenza prima di risolvere l’azione.");
  const execution = action.execution;
  // Meteor Swarm: every point drawn; the group comes from the union, each creature counted once.
  const multiArea = execution.target.area?.count ? execution.target.area : null;
  const placements = multiArea ? (Array.isArray(areaPlacements) ? areaPlacements : []).map((value) => sanitizeBossAreaPlacement(value, multiArea)) : [];
  if (multiArea && (placements.length !== multiArea.count || placements.some((row) => !row)))
    throw new Error(`Disegna tutte le ${multiArea.count} esplosioni prima di applicare.`);
  // v22 (Strappare le Cuciture): one line on each segment of the chained seam the GM chose, each segment once.
  const segmentArea = execution.target.area?.shape === "seam" && execution.target.area.segments ? execution.target.area : null;
  const segmentRows = segmentArea ? bossSeamSegmentPlacements(bossActiveSeam(bossRuntimeStateForItem(sourceItem, profile), round), areaPlacements, segmentArea) : null;
  const placement = multiArea
    ? {ruleId:placements[0].ruleId,areaTargetIds:[...new Set(placements.flatMap((row) => row.areaTargetIds))]}
    : segmentRows
    ? {ruleId:segmentRows[0].ruleId,start:segmentRows[0].start,end:segmentRows[0].end,areaTargetIds:[...new Set(segmentRows.flatMap((row) => row.areaTargetIds))]}
    : execution.target.selection === "area" ? sanitizeBossAreaPlacement(areaPlacement, execution.target.area) : null;
  if (execution.target.selection === "area" && !placement) throw new Error("Disegna l’area sulla mappa prima di applicare.");
  // v19: the line follows the seam drawn this round, end to end.
  if (execution.target.area?.shape === "seam" && !segmentArea) {
    const seam = bossActiveSeam(bossRuntimeStateForItem(sourceItem, profile), round);
    const same = (a, b) => Math.abs(a.x - Number(b?.x)) < 0.5 && Math.abs(a.y - Number(b?.y)) < 0.5;
    if (seam && !(same(placement.start, seam.start) && same(placement.end, seam.end))) throw new Error("La linea non segue la cucitura: disegnala di nuovo.");
  }
  // Components scoped to the inner radius (Meteor Swarm's bludgeoning) reach only the creatures the GM kept "within".
  const innerSet = new Set(multiArea?.innerRadius ? (Array.isArray(innerIds) ? innerIds : []).map((id) => String(id || "")) : []);
  const componentsFor = (target) => (execution.damage || []).filter((component) => !component.scope || innerSet.has(target.id));
  const seen = new Set();
  const targets = [];
  for (const item of Array.isArray(targetItems) ? targetItems : []) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    if (!isBossActionTargetItem(item) || item.id === sourceItem.id) throw new Error("Ogni bersaglio deve essere un token creatura reale diverso dal boss.");
    targets.push(item);
  }
  if (!targets.length) throw new Error("Seleziona almeno un bersaglio.");
  if (targets.length > Math.min(50, execution.target.maxTargets || 50))
    throw new Error(execution.target.maxTargets === 1 ? "Un solo bersaglio per questa azione." : execution.target.maxTargets ? `Al massimo ${execution.target.maxTargets} bersagli.` : "Troppi bersagli per una sola risoluzione.");
  const components = execution.damage || [];
  if (Object.keys(componentAmounts).some((id) => !components.some((component) => component.id === id)))
    throw new Error("Componente di danno sconosciuta.");
  const inputs = Object.fromEntries(components.map((component) => [component.id, damageAmount(componentAmounts[component.id])]));
  for (const target of targets) {
    if (!["failed", "passed"].includes(outcomes?.[target.id])) throw new Error(`Manca l’esito del tiro salvezza per ${target.name || target.id}.`);
    const meta = target.metadata?.[META_KEY] || {};
    if (components.length && (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax) || meta.hp < 0 || meta.hpMax < 0))
      throw new Error(`${target.name || target.id} non ha HP canonici validi.`);
  }
  const immunity = execution.onPassed?.immunity || null;
  const immuneIds = new Set(targets.filter((target) => bossTargetImmune(target, action)).map((target) => target.id));
  if (Array.isArray(expectedImmuneIds)) {
    const changed = targets.find((target) => immuneIds.has(target.id) !== expectedImmuneIds.includes(target.id));
    if (changed) throw new Error(`L’immunità di ${changed.name || changed.id} è cambiata: riapri l’azione.`);
  }
  // Evasion (Rogue): a DEX save that halves damage deals none on a success and half on a failure.
  const evasionIds = evasionAppliesTo(execution) ? targets.filter((target) => evasionForItem(target, META_KEY)).map((target) => target.id) : [];
  if (Array.isArray(expectedEvasionIds)) {
    const changed = targets.find((target) => evasionIds.includes(target.id) !== expectedEvasionIds.includes(target.id));
    if (changed) throw new Error(`L’Elusione di ${changed.name || changed.id} è cambiata: riapri l’azione.`);
  }
  const evasionUsed = (id) => evasionIds.includes(id) && !(ignoredDefenses?.[id] || []).includes(EVASION_DEFENSE);
  const factorFor = (target) => {
    const base = outcomes[target.id] === "passed" ? "half" : "full";
    return evasionUsed(target.id) ? evasionFactor(base) : base;
  };
  const markedIds = targets.filter((target) => bossMarkApplies({profile,sourceItem,targetItem:target,round,components:componentsFor(target),amounts:inputs,
    factor:factorFor(target)})).map((target) => target.id);
  markExpectation(expectedMarkedIds,targets,markedIds);
  const use = buildBossActionUse({profile,action,sourceItem,actionInstanceId,round});
  recordMarkUses(use.runtimeState,markedIds,round);
  const appliedAt = bossConditionAppliedAt(turnState);
  const failedConditions = execution.onFailed?.conditions || [];
  const failedMark = execution.onFailed?.mark || null;
  const failedEffect = execution.onFailed?.effect || null;
  const hpUpdates = [], changes = [], causalTargets = [], conditionOperations = [];
  const conditionExpiry = (entry) => ({...clone(entry.expiry),...(entry.expiry.actor === "source" ? {actorId:sourceItem.id} : {})});
  const immunityOptions = immunity ? {sourceId:sourceItem.id,sourceName:sourceItem.name || profile.name,parentEffectId:"",type:"automatic",
    effectId:bossImmunityEffectId(action),effectKind:"buff",effectDetail:`Immune a ${immunity.condition} di ${action.name} per 24 ore.`,
    manualRemoval:true,expiry:{mode:"manual"}} : null;
  for (const target of targets) {
    const outcome = outcomes[target.id];
    const immune = immuneIds.has(target.id);
    const factor = factorFor(target);
    const damageComponents = defendedComponents(componentsFor(target),inputs,factor,target,ignoredDefenses?.[target.id] || [],
      expectedDefenses === undefined ? undefined : expectedDefenses?.[target.id] || {},markedIds.includes(target.id));
    const requestedDamage = damageComponents.reduce((sum,component)=>sum+component.amount,0);
    const meta = target.metadata?.[META_KEY] || {};
    const change = calculateQuickHPChange({value:requestedDamage,hp:meta.hp,hpMax:meta.hpMax,deathSaveDamage:takesDeathSaveDamage(meta)});
    changes.push({targetId:target.id,targetName:target.name || target.id,outcome,change});
    if (change.changed || components.length && (meta.sharedHpSourceId || targets.some(item=>item.metadata?.[META_KEY]?.sharedHpSourceId===target.id))) hpUpdates.push({itemId:target.id,hp:change.afterHP,hpMax:change.hpMax,
      hpIntent:{mode:"damage",amount:change.requested,eventId:actionInstanceId},
      expectedHP:bossMetadataSnapshot(meta,"hp"),expectedHPMax:bossMetadataSnapshot(meta,"hpMax")});
    // An immune creature still takes the damage; only the condition it is immune to is skipped.
    const conditions = outcome === "failed" && !immune ? failedConditions.map((entry) => ({condition:entry.condition,
      instanceId:bossGroupConditionInstanceId(actionInstanceId,entry.condition,target.id),
      expiry:conditionExpiry(entry),...(entry.saveReminder?{saveReminder:clone(entry.saveReminder)}:{})})) : [];
    if (failedEffect && outcome === "failed") conditions.push({condition:action.name,effect:true,
      instanceId:bossGroupConditionInstanceId(actionInstanceId,"effect",target.id),expiry:clone(failedEffect.expiry)});
    // A creature already marked keeps its single mark.
    const alreadyMarked = !!failedMark && bossTargetMarked(target, profile);
    if (failedMark && outcome === "failed" && !alreadyMarked) conditions.push({condition:action.name,mark:true,
      instanceId:bossGroupConditionInstanceId(actionInstanceId,"mark",target.id),expiry:clone(failedMark.expiry)});
    const immunityApplied = !!immunity && outcome === "passed" && !immune;
    // A no-damage action (Soul-Numbing Cold) records no damage or HP fields at all.
    causalTargets.push({id:target.id,name:target.name,outcome,...(components.length?{damageFactor:factor,requestedDamage,
      appliedHpDelta:change.delta,hpBefore:change.hp,hpAfter:change.afterHP,damageComponents}:{}),conditions,
      ...(immunity?{immune,immunityApplied}:{}),...(failedMark?{alreadyMarked}:{}),...(markedIds.includes(target.id)?{markRule:true}:{}),
      ...(evasionIds.includes(target.id)?{evasion:evasionUsed(target.id)?"applied":"ignored"}:{}),
      ...(multiArea?.innerRadius?{inner:innerSet.has(target.id)}:{})});
  }
  for (const entry of failedConditions) {
    const failedIds = causalTargets.filter((target) => target.conditions.some((condition) => condition.condition === entry.condition)).map((target) => target.id);
    if (!failedIds.length) continue;
    const reminder = entry.saveReminder ? {...clone(entry.saveReminder),
      label:`Se supera il TS, termina ${entry.condition}${immunityOptions ? " e diventa Immune per 24 ore" : ""}.`,
      // The repeated save reuses the reminder resolution: success removes the condition and, when the
      // action grants immunity, applies the same Immune pill as a passed initial save.
      ...(immunityOptions ? {resolution:{success:{mode:"remove-effect",actions:[{kind:"condition",action:"apply",
        name:bossImmunityName(action),options:clone(immunityOptions)}]}}} : {})} : null;
    conditionOperations.push({
      type:"condition:add",targetIds:failedIds,conditionName:entry.condition,
      instanceIds:Object.fromEntries(failedIds.map((id) => [id,bossGroupConditionInstanceId(actionInstanceId,entry.condition,id)])),
      options:{sourceId:sourceItem.id,sourceName:sourceItem.name || profile.name,
        // An independent instance never merges with the same condition applied by another source.
        // Like the spells' conditionRule (Sunbeam, Color Spray), a standard condition carries no
        // effectId/effectKind: those would turn it into a spell-effect pill instead of the condition chip.
        parentEffectId:"",type:"automatic",manualRemoval:true,
        expiry:conditionExpiry(entry),...(reminder?{saveReminder:reminder}:{}),...(appliedAt?{appliedAt}:{})},
    });
  }
  const affected = failedEffect ? causalTargets.filter((target) => target.conditions.some((condition) => condition.effect)).map((target) => target.id) : [];
  // The expiry anchors on each target's own next turn (actorId defaults to the target in condition:add).
  if (affected.length) conditionOperations.push({
    type:"condition:add",targetIds:affected,conditionName:action.name,
    instanceIds:Object.fromEntries(affected.map((id) => [id,bossGroupConditionInstanceId(actionInstanceId,"effect",id)])),
    options:{sourceId:sourceItem.id,sourceName:sourceItem.name || profile.name,parentEffectId:"",type:"automatic",
      effectId:`monster-action:${action.id}`,effectKind:"debuff",effectDetail:action.manualText || action.name,
      summaryParts:bossEffectSummaryParts(failedEffect),manualRemoval:true,expiry:clone(failedEffect.expiry),...(appliedAt?{appliedAt}:{})},
  });
  const newlyMarked = failedMark ? causalTargets.filter((target) => target.conditions.some((condition) => condition.mark)).map((target) => target.id) : [];
  if (newlyMarked.length) conditionOperations.push({
    type:"condition:add",targetIds:newlyMarked,conditionName:action.name,
    instanceIds:Object.fromEntries(newlyMarked.map((id) => [id,bossGroupConditionInstanceId(actionInstanceId,"mark",id)])),
    options:{sourceId:sourceItem.id,sourceName:sourceItem.name || profile.name,parentEffectId:"",type:"automatic",
      effectId:bossMarkEffectId(profile,failedMark.id),effectKind:"debuff",effectDetail:action.manualText || action.name,
      summaryParts:[{id:"mark-cold",label:"Freddo: Res. ignorata 1/round"}],manualRemoval:true,expiry:clone(failedMark.expiry),...(appliedAt?{appliedAt}:{})},
  });
  const immuneNow = causalTargets.filter((target) => target.immunityApplied).map((target) => target.id);
  if (immuneNow.length) conditionOperations.push({
    type:"condition:add",targetIds:immuneNow,conditionName:bossImmunityName(action),
    instanceIds:Object.fromEntries(immuneNow.map((id) => [id,bossGroupConditionInstanceId(actionInstanceId,"immune",id)])),
    options:{...clone(immunityOptions),...(appliedAt?{appliedAt}:{})},
  });
  const operations = [
    ...(hpUpdates.length ? [{type:"hp:set",updates:hpUpdates}] : []),
    ...conditionOperations,
    ...(conditionOperations.length ? [{type:"condition:automate",subjectIds:conditionOperations.flatMap((operation)=>operation.targetIds)}] : []),
  ];
  const chosenIds = causalTargets.map((target) => target.id);
  const addedManually = placement ? chosenIds.filter((id) => !placement.areaTargetIds.includes(id)) : [];
  const removedManually = placement ? placement.areaTargetIds.filter((id) => !chosenIds.includes(id)) : [];
  const area = execution.target.area;
  const where = area?.shape === "emanation" ? `centrata su ${sourceItem.name || area.origin}` : `origine libera: ${area?.origin}`;
  const computedInner = multiArea ? [...new Set(placements.flatMap((row) => row.innerTargetIds || []))].filter((id) => chosenIds.includes(id)) : [];
  const finalInner = chosenIds.filter((id) => innerSet.has(id));
  const innerAdded = finalInner.filter((id) => !computedInner.includes(id));
  const innerRemoved = computedInner.filter((id) => !finalInner.includes(id));
  const manualSteps = [
    segmentRows
      ? `Area: ${segmentRows.length} ${segmentRows.length === 1 ? "linea" : "linee"} di ${area.size} ft. posate dal GM sulle cuciture scelte (${segmentRows.map((row) => bossSeamSegmentLabel(row.segment)).join(", ")}); bersagli dall'unione delle linee, ciascuno contato una volta${addedManually.length || removedManually.length ? `, ${addedManually.length} aggiunti e ${removedManually.length} tolti a mano` : ""}.`
    : multiArea
      ? `Area: ${multiArea.count} cerchi di ${area.size} ft. disegnati dal GM su punti liberi; bersagli dall'unione delle esplosioni, ciascuno contato una volta${addedManually.length || removedManually.length ? `, ${addedManually.length} aggiunti e ${removedManually.length} tolti a mano` : ""}. Entro ${area.innerRadius} ft. da un punto: ${finalInner.length} (calcolati dai centri disegnati${innerAdded.length || innerRemoved.length ? `, ${innerAdded.length} aggiunti e ${innerRemoved.length} tolti a mano` : ""}).`
    : placement
      ? `Area: ${bossAreaShapeLabel(area)} di ${area.size} ft. ${["emanation", "seam"].includes(area.shape) ? area.shape === "seam" ? "posata sulla cucitura" : "posizionata" : "disegnato"} dal GM (${where}); bersagli dal disegno${addedManually.length || removedManually.length ? `, ${addedManually.length} aggiunti e ${removedManually.length} tolti a mano` : ""}.`
      : area ? `Area: ${bossAreaShapeLabel(area)} di ${area.size} ft. da ${area.origin}; creature incluse scelte dal GM.`
        : `Bersagli scelti dal GM: ${causalTargets.length} su un massimo di ${execution.target.maxTargets}, entro ${execution.target.range} ft. e visibili.`,
    // v19+: a recharge that follows the sequence is verified from the round log, not by the GM.
    ...(action.usage?.note ? [action.sequence ? `${action.usage.note}: verificata dal registro del round (sequenza delle Azioni Epiche).` : `${action.usage.note}: disponibilità verificata dal GM.`] : []),
    ...(action.manualText ? [action.manualText] : []),
  ];
  const causality = {
    ...use.context,resources:use.resources,
    save:{...clone(execution.save),...(execution.success?{success:execution.success}:{})},
    ...(area?{area:{...clone(area),...(segmentRows
      ? {verification:"placed",segments:segmentRows.map((row)=>row.segment),placements:segmentRows.map((row)=>({ruleId:row.ruleId,start:row.start,end:row.end})),
        areaTargetIds:placement.areaTargetIds,addedManually,removedManually}
      : multiArea
      ? {verification:"placed",placements:placements.map((row)=>({ruleId:row.ruleId,start:row.start,end:row.end})),
        areaTargetIds:placement.areaTargetIds,addedManually,removedManually,
        ...(multiArea.innerRadius?{innerTargetIds:computedInner,innerIds:finalInner,innerAddedManually:innerAdded,innerRemovedManually:innerRemoved}:{})}
      : placement
      ? {verification:"placed",placement:{ruleId:placement.ruleId,start:placement.start,end:placement.end},
        areaTargetIds:placement.areaTargetIds,addedManually,removedManually}
      : {verification:"manual"})}}:{selection:{mode:"manual",maxTargets:execution.target.maxTargets,range:execution.target.range}}),
    ...(failedEffect?{effect:{...clone(failedEffect),summaryParts:bossEffectSummaryParts(failedEffect)}}:{}),
    ...(failedMark?{markApplied:{id:failedMark.id,effectId:bossMarkEffectId(profile,failedMark.id),applied:newlyMarked,
      alreadyMarked:causalTargets.filter((target)=>target.alreadyMarked).map((target)=>target.id)}}:{}),
    ...(markedIds.length?{mark:{rule:"cold-ward-break",targetIds:markedIds,round}}:{}),
    targets:causalTargets,
    conditionsApplied:causalTargets.flatMap((target)=>target.conditions.map((condition)=>({targetId:target.id,...condition,
      ...(appliedAt?{appliedAt}:{})}))),
    ...(immunity?{immunity:{condition:immunity.condition,duration:immunity.duration,
      alreadyImmune:causalTargets.filter((target)=>target.immune).map((target)=>target.id),applied:immuneNow}}:{}),
    manualVerification:{confirmedByGM:true,automated:false,steps:manualSteps},
  };
  Object.assign(use.runtimeState.lastAction,{targetIds:causalTargets.map((target)=>target.id),
    outcomes:Object.fromEntries(causalTargets.map((target)=>[target.id,target.outcome]))});
  const label = `${sourceItem.name || profile.name}: ${action.name} → ${causalTargets.length} bersagli`;
  return {
    changes,causality,manualText:action.manualText || "",
    damageComponents:causalTargets.map((target)=>({targetId:target.id,components:target.damageComponents})),
    operations,
    options:{
      commandId:actionInstanceId,correlationId:actionInstanceId,sourceId:sourceItem.id,
      targetIds:causalTargets.map((target)=>target.id),kind:"monster-action",label,
      metadataPatches:[...use.metadataPatches,...targets.filter((target)=>hpUpdates.some((update)=>update.itemId===target.id)).map(targetProfileAssert)],
      sceneMetadataPreconditions:use.sceneMetadataPreconditions,
      history:{kind:"monster-action",label,payload:{causality,
        damageComponents:causalTargets.map((target)=>({targetId:target.id,components:clone(target.damageComponents)})),
        manualRemainder:manualSteps.join("\n")}},
    },
  };
}

// Divine Brilliance: the printed attack against every chosen creature, each with its own attack roll
// (hit/miss) and its own damage roll; defenses and the boss mark apply per creature. One command, one
// History entry. The trigger (boss below the printed HP) is checked on the committed boss state.
export function buildBossActionGroupAttackMutation({
  profile, action, sourceItem, targetItems = [], outcomes = {}, targetAmounts = {},
  actionInstanceId, round, manualConfirmed = false, areaPlacement = null,
  ignoredDefenses = {}, expectedDefenses, expectedMarkedIds,
} = {}) {
  if (!isBossActionCreature(sourceItem)) throw new Error("L’attore deve essere il token reale del boss.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  if (!isBossActionGroupAttack(action)) throw new Error("Questa capacità non è un attacco di gruppo.");
  const execution = action.execution;
  if (execution.requiresConfirmation && manualConfirmed !== true) throw new Error("Conferma innesco e Reazione disponibile prima di risolvere l’azione.");
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  if (execution.trigger && !bossTriggerMet(action, sourceItem))
    throw new Error(`Innesco non avvenuto: ${sourceItem.name || profile.name} deve essere sotto ${execution.trigger.hpBelow} PF${Number.isFinite(sourceMeta.hp) ? ` (ora ${sourceMeta.hp})` : ""}.`);
  const placement = sanitizeBossAreaPlacement(areaPlacement, execution.target.area);
  if (!placement) throw new Error("Posiziona l’emanazione sulla mappa prima di applicare.");
  const seen = new Set();
  const targets = [];
  for (const item of Array.isArray(targetItems) ? targetItems : []) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    if (!isBossActionTargetItem(item) || item.id === sourceItem.id) throw new Error("Ogni bersaglio deve essere un token creatura reale diverso dal boss.");
    targets.push(item);
  }
  if (!targets.length) throw new Error("Seleziona almeno un bersaglio.");
  if (targets.length > 50) throw new Error("Troppi bersagli per una sola risoluzione.");
  const components = execution.damage || [];
  const knownIds = new Set(components.map((component) => component.id));
  const inputsFor = {};
  for (const target of targets) {
    const outcome = outcomes?.[target.id];
    if (!["hit", "miss"].includes(outcome)) throw new Error(`Manca l’esito dell’attacco contro ${target.name || target.id}.`);
    const meta = target.metadata?.[META_KEY] || {};
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax) || meta.hp < 0 || meta.hpMax < 0)
      throw new Error(`${target.name || target.id} non ha HP canonici validi.`);
    // Only conscious creatures: a creature at 0 HP is not a valid target of the reaction.
    if (execution.target.conscious && meta.hp <= 0) throw new Error(`${target.name || target.id} è a 0 PF: non è cosciente.`);
    const typed = targetAmounts?.[target.id] || {};
    if (Object.keys(typed).some((id) => !knownIds.has(id))) throw new Error("Componente di danno sconosciuta.");
    // Each hit has its own damage roll; a miss records none.
    inputsFor[target.id] = Object.fromEntries(components.map((component) => [component.id, outcome === "miss" ? null : damageAmount(typed[component.id])]));
  }
  const markedIds = targets.filter((target) => outcomes[target.id] === "hit" && bossMarkApplies({profile,sourceItem,targetItem:target,round,
    components,amounts:inputsFor[target.id],factor:"full"})).map((target) => target.id);
  markExpectation(expectedMarkedIds,targets,markedIds);
  const use = buildBossActionUse({profile,action,sourceItem,actionInstanceId,round});
  recordMarkUses(use.runtimeState,markedIds,round);
  const hpUpdates = [], changes = [], causalTargets = [];
  for (const target of targets) {
    const outcome = outcomes[target.id];
    const damageComponents = defendedComponents(components,inputsFor[target.id],outcome === "miss" ? "zero" : "full",target,
      ignoredDefenses?.[target.id] || [],expectedDefenses === undefined ? undefined : expectedDefenses?.[target.id] || {},markedIds.includes(target.id));
    const requestedDamage = damageComponents.reduce((sum,component)=>sum+component.amount,0);
    const meta = target.metadata?.[META_KEY] || {};
    const change = calculateQuickHPChange({value:requestedDamage,hp:meta.hp,hpMax:meta.hpMax,deathSaveDamage:takesDeathSaveDamage(meta)});
    changes.push({targetId:target.id,targetName:target.name || target.id,outcome,change});
    if (change.changed) hpUpdates.push({itemId:target.id,hp:change.afterHP,hpMax:change.hpMax,
      hpIntent:{mode:"damage",amount:change.requested,eventId:`${actionInstanceId}:${target.id}`},
      expectedHP:bossMetadataSnapshot(meta,"hp"),expectedHPMax:bossMetadataSnapshot(meta,"hpMax")});
    causalTargets.push({id:target.id,name:target.name,outcome,requestedDamage,appliedHpDelta:change.delta,hpBefore:change.hp,hpAfter:change.afterHP,
      damageComponents,conditions:[],...(markedIds.includes(target.id)?{markRule:true}:{})});
  }
  const chosenIds = causalTargets.map((target) => target.id);
  const addedManually = chosenIds.filter((id) => !placement.areaTargetIds.includes(id));
  const removedManually = placement.areaTargetIds.filter((id) => !chosenIds.includes(id));
  const area = execution.target.area;
  const manualSteps = [
    `Area: emanazione di ${area.size} ft. centrata su ${sourceItem.name || area.origin}; bersagli dal disegno, solo creature coscienti${addedManually.length || removedManually.length ? `, ${addedManually.length} aggiunti e ${removedManually.length} tolti a mano` : ""}.`,
    `Innesco: ${sourceItem.name || profile.name} a ${sourceMeta.hp} PF, sotto ${execution.trigger.hpBelow}; Reazione disponibile verificata dal GM.`,
    "Tiro per colpire e danni di ogni bersaglio tirati dal GM (un critico va inserito con i dadi già raddoppiati).",
    ...(action.manualText ? [action.manualText] : []),
  ];
  const causality = {
    ...use.context,resources:use.resources,
    attack:{...clone(execution.attack),mode:"ranged",sourceAction:execution.sourceAction},
    trigger:{hpBelow:execution.trigger.hpBelow,bossHp:sourceMeta.hp},
    area:{...clone(area),verification:"placed",placement:{ruleId:placement.ruleId,start:placement.start,end:placement.end},
      areaTargetIds:placement.areaTargetIds,addedManually,removedManually},
    ...(markedIds.length?{mark:{rule:"cold-ward-break",targetIds:markedIds,round}}:{}),
    targets:causalTargets,
    manualVerification:{confirmedByGM:true,automated:false,steps:manualSteps},
  };
  Object.assign(use.runtimeState.lastAction,{targetIds:chosenIds,outcomes:Object.fromEntries(causalTargets.map((target)=>[target.id,target.outcome]))});
  const label = `${sourceItem.name || profile.name}: ${action.name} → ${causalTargets.length} bersagli`;
  return {
    changes,causality,manualText:action.manualText || "",
    damageComponents:causalTargets.map((target)=>({targetId:target.id,components:target.damageComponents})),
    operations:hpUpdates.length ? [{type:"hp:set",updates:hpUpdates}] : [],
    options:{
      commandId:actionInstanceId,correlationId:actionInstanceId,sourceId:sourceItem.id,
      targetIds:chosenIds,kind:"monster-action",label,
      metadataPatches:[...use.metadataPatches,...targets.filter((target)=>hpUpdates.some((update)=>update.itemId===target.id)).map(targetProfileAssert)],
      sceneMetadataPreconditions:use.sceneMetadataPreconditions,
      history:{kind:"monster-action",label,payload:{causality,
        damageComponents:causalTargets.map((target)=>({targetId:target.id,components:clone(target.damageComponents)})),
        manualRemainder:manualSteps.join("\n")}},
    },
  };
}

// ---- Hurl (throw) and Epic Resistance (effect-end), profile v16 ----
const SPELLS_FIELD = `${ID}/spells`;
// Hurl: the distances the GM can pick, one step at a time up to the printed maximum.
export function bossThrowDistances(execution) {
  const { max = 0, step = 0 } = execution?.distance || {};
  // A flat throw (Scagliare) has no distance choice: its reach is informational.
  return step > 0 ? Array.from({ length: Math.floor(max / step) }, (_, index) => (index + 1) * step) : [];
}
export function bossThrowEdgeInstanceId(actionInstanceId, targetId) {
  return bossGroupConditionInstanceId(actionInstanceId, "edge", targetId);
}

export function buildBossThrowMutation({
  profile, action, sourceItem, targetItem, distance, damage, landing = "",
  actionInstanceId, round, grappledIds = [], ignoredDefenses = [], expectedDefenses,
  collisionItem = null, collisionOutcome = "", collisionIgnoredDefenses = [], collisionExpectedDefenses,
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(targetItem)) throw new Error("Attore e bersaglio devono essere token creatura reali.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  const execution = action?.execution;
  if (execution?.kind !== "throw") throw new Error("Questa capacità non è un lancio.");
  if (!(Array.isArray(grappledIds) ? grappledIds : []).includes(targetItem.id)) throw new Error("Il bersaglio deve essere Afferrato dal boss.");
  const stepped = Number(execution.distance?.step) > 0;
  if (stepped && !bossThrowDistances(execution).includes(Number(distance))) throw new Error("Scegli la distanza del lancio.");
  // Without an edge (Scagliare) the creature always lands, Prono.
  if (!execution.edge) landing = "platform";
  if (!["platform", "edge"].includes(landing)) throw new Error("Scegli dove atterra il bersaglio.");
  if (collisionItem && !execution.collision) throw new Error("Questo lancio non colpisce altre creature.");
  if (collisionItem && (!isBossActionCreature(collisionItem) || [sourceItem.id, targetItem.id].includes(collisionItem.id)))
    throw new Error("La creatura colpita deve essere un altro token creatura reale.");
  if (collisionItem && !["failed", "passed"].includes(collisionOutcome)) throw new Error("Scegli l’esito del TS della creatura colpita.");
  const [component] = execution.damage;
  const inputs = { [component.id]: damageAmount(damage) };
  const damageComponents = defendedComponents([component], inputs, "full", targetItem, ignoredDefenses, expectedDefenses, false);
  const requestedDamage = damageComponents.reduce((sum, entry) => sum + entry.amount, 0);
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  if (!Number.isFinite(targetMeta.hp) || !Number.isFinite(targetMeta.hpMax) || targetMeta.hp < 0 || targetMeta.hpMax < 0)
    throw new Error("Il bersaglio non ha HP canonici validi.");
  const change = calculateQuickHPChange({ value: requestedDamage, hp: targetMeta.hp, hpMax: targetMeta.hpMax,
    deathSaveDamage: takesDeathSaveDamage(targetMeta) });
  // Scagliare: a creature the target is thrown against takes the same roll (its own defenses) and Prono on a failure.
  let collision = null;
  if (collisionItem) {
    const collisionMeta = collisionItem.metadata?.[META_KEY] || {};
    if (!Number.isFinite(collisionMeta.hp) || !Number.isFinite(collisionMeta.hpMax) || collisionMeta.hp < 0 || collisionMeta.hpMax < 0)
      throw new Error("La creatura colpita non ha HP canonici validi.");
    const failed = collisionOutcome === "failed";
    const collisionComponents = defendedComponents([component], inputs, failed ? "full" : "zero", collisionItem, collisionIgnoredDefenses, collisionExpectedDefenses, false);
    const collisionDamage = collisionComponents.reduce((sum, entry) => sum + entry.amount, 0);
    collision = { item: collisionItem, meta: collisionMeta, outcome: collisionOutcome, components: collisionComponents, damage: collisionDamage,
      change: calculateQuickHPChange({ value: collisionDamage, hp: collisionMeta.hp, hpMax: collisionMeta.hpMax,
        deathSaveDamage: takesDeathSaveDamage(collisionMeta) }),
      condition: failed ? { condition: execution.collision.onFailed.condition, instanceId: bossGroupConditionInstanceId(actionInstanceId, `collision-${execution.collision.onFailed.condition}`, collisionItem.id) } : null };
  }
  // The grapple ends: every Afferrato and Trattenuto the boss put on the target.
  const released = conditionInstancesOf(targetItem).filter((instance) => ["Afferrato", "Trattenuto"].includes(instance?.condition)
    && instance.sourceId === sourceItem.id && instance.active !== false).map((instance) => ({ id: instance.id, condition: instance.condition }));
  const use = buildBossActionUse({ profile, action, sourceItem, actionInstanceId, round });
  const sourceName = sourceItem.name || profile.name;
  const landingCondition = landing === "platform" ? {
    condition: execution.onLanding.condition, instanceId: bossGroupConditionInstanceId(actionInstanceId, execution.onLanding.condition, targetItem.id),
  } : null;
  // Beyond the edge: a pill marks the creature hanging there; the DEX save arrives as a reminder on that pill.
  const edge = landing === "edge" ? {
    targetId: targetItem.id, instanceId: bossThrowEdgeInstanceId(actionInstanceId, targetItem.id), name: "Appeso al bordo",
    save: clone(execution.edge.save),
    detail: `TS DES CD ${execution.edge.save.dc}: fallimento, precipita; successo, resta appeso e nel proprio turno può spendere 10 ft di movimento per tornare sulla piattaforma.`,
  } : null;
  const operations = [
    ...(change.changed || collision?.change.changed ? [{ type: "hp:set", updates: [
      ...(change.changed ? [{ itemId: targetItem.id, hp: change.afterHP, hpMax: change.hpMax,
        expectedHP: bossMetadataSnapshot(targetMeta, "hp"), expectedHPMax: bossMetadataSnapshot(targetMeta, "hpMax") }] : []),
      ...(collision?.change.changed ? [{ itemId: collisionItem.id, hp: collision.change.afterHP, hpMax: collision.change.hpMax,
        expectedHP: bossMetadataSnapshot(collision.meta, "hp"), expectedHPMax: bossMetadataSnapshot(collision.meta, "hpMax") }] : []),
    ] }] : []),
    ...(released.length ? [{ type: "condition:remove-instances", targetIds: [targetItem.id], removals: released.map((entry) => ({ itemId: targetItem.id, instanceId: entry.id })) }] : []),
    ...(landingCondition ? [{ type: "condition:add", targetIds: [targetItem.id], conditionName: landingCondition.condition,
      instanceIds: { [targetItem.id]: landingCondition.instanceId },
      options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } } }] : []),
    ...(edge ? [{ type: "condition:add", targetIds: [targetItem.id], conditionName: edge.name, instanceIds: { [targetItem.id]: edge.instanceId },
      options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", effectId: `monster-action:${action.id}:edge`,
        effectKind: "debuff", effectDetail: edge.detail, manualRemoval: true, expiry: { mode: "manual" } } }] : []),
    ...(collision?.condition ? [{ type: "condition:add", targetIds: [collisionItem.id], conditionName: collision.condition.condition,
      instanceIds: { [collisionItem.id]: collision.condition.instanceId },
      options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } } }] : []),
    { type: "condition:automate", subjectIds: [targetItem.id, ...(collision ? [collisionItem.id] : [])] },
  ];
  const causality = {
    ...use.context, resources: use.resources,
    throw: { distance: stepped ? Number(distance) : Number(execution.distance.max), landing,
      ...(collision ? { collision: { targetId: collisionItem.id, name: collisionItem.name, save: clone(execution.collision.save), outcome: collisionOutcome,
        requestedDamage: collision.damage, hpBefore: collision.change.hp, hpAfter: collision.change.afterHP, damageComponents: clone(collision.components),
        ...(collision.condition ? { condition: collision.condition.condition } : {}) } } : {}), releasedConditions: released, ...(landingCondition ? { condition: landingCondition.condition } : {}),
      ...(edge ? { edge: { save: edge.save, pillInstanceId: edge.instanceId } } : {}) },
    targets: [{ id: targetItem.id, name: targetItem.name, requestedDamage, appliedHpDelta: change.delta, hpBefore: change.hp, hpAfter: change.afterHP,
      damageComponents: clone(damageComponents) }],
  };
  Object.assign(use.runtimeState.lastAction, { targetId: targetItem.id, distance: stepped ? Number(distance) : Number(execution.distance.max), landing,
    ...(collision ? { collisionTargetId: collisionItem.id, collisionOutcome } : {}) });
  const label = `${sourceName}: ${action.name} → ${targetItem.name || targetItem.id}${stepped ? ` (${distance} ft, ${landing === "edge" ? "oltre il bordo" : "sulla piattaforma"})` : ""}${collision ? ` · contro ${collisionItem.name || collisionItem.id}` : ""}`;
  const manualRemainder = landing === "edge"
    ? `Oltre il bordo: TS DES CD ${execution.edge.save.dc} dal promemoria. Direzione e punto d'arrivo sulla mappa.`
    : "Direzione e punto d'arrivo sulla mappa.";
  return {
    change, damageComponents, causality, manualText: manualRemainder, released, edge,
    extraChanges: collision?.change.changed ? [{ item: collisionItem, change: collision.change }] : [],
    operations,
    options: {
      commandId: actionInstanceId, correlationId: actionInstanceId, sourceId: sourceItem.id, targetIds: [targetItem.id, ...(collision ? [collisionItem.id] : [])], kind: "monster-action", label,
      metadataPatches: [...use.metadataPatches, ...(change.changed ? [targetProfileAssert(targetItem)] : []), ...(collision?.change.changed ? [targetProfileAssert(collisionItem)] : [])],
      sceneMetadataPreconditions: use.sceneMetadataPreconditions,
      history: { kind: "monster-action", label, payload: { causality, damageComponents: clone(damageComponents), manualRemainder } },
    },
  };
}

// Everything active on the boss token that Epic Resistance may end: each spell (with the conditions it
// imposes) and every other condition or pill.
export function bossActiveEffects(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const spells = (Array.isArray(meta[SPELLS_FIELD]) ? meta[SPELLS_FIELD] : []).filter((spell) => String(spell?.instanceId || "").trim());
  const spellIds = new Set(spells.map((spell) => String(spell.instanceId)));
  const conditions = conditionInstancesOf(item).filter((instance) => instance?.id && instance.active !== false);
  return [
    ...spells.map((spell) => ({ kind: "spell", instanceId: String(spell.instanceId), name: String(spell.name || "Incantesimo"),
      ...(spell.casterName ? { sourceName: String(spell.casterName) } : {}), concentration: spell.conc === true,
      conditions: conditions.filter((instance) => String(instance.parentEffectId || "") === String(spell.instanceId))
        .map((instance) => String(instance.condition || "")) })),
    ...conditions.filter((instance) => !spellIds.has(String(instance.parentEffectId || ""))).map((instance) => ({
      kind: "condition", instanceId: String(instance.id), name: String(instance.condition || "Condizione"),
      ...(instance.effectKind ? { effectKind: String(instance.effectKind) } : {}), ...(instance.sourceName ? { sourceName: String(instance.sourceName) } : {}) })),
  ];
}

// Cucitura del Non-Luogo: the seam drawn by the GM is kept on the boss token until the end of the round (or until
// it is torn); the map drawing is only its picture. No creature is affected: one History entry, undoable.
export function buildBossSeamMutation({ profile, action, sourceItem, seam = null, actionInstanceId, round } = {}) {
  if (!isBossActionCreature(sourceItem)) throw new Error("L’attore deve essere il token reale del boss.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  const execution = action?.execution;
  if (execution?.kind !== "seam") throw new Error("Questa capacità non crea una cucitura.");
  // v22 (Cucitura Spezzata): a chain of points; each segment up to the printed length, the recorded length is their total.
  const chain = execution.seam.points || 0;
  const points = chain ? (Array.isArray(seam?.points) ? seam.points : []).map(placementPoint) : null;
  if (chain && (points.length !== chain || points.some((value) => !value))) throw new Error(`Disegna tutti i ${chain} punti delle cuciture prima di applicare.`);
  if (chain && points.some((value, index) => index && value.x === points[index - 1].x && value.y === points[index - 1].y)) throw new Error("Due punti consecutivi coincidono: ridisegna le cuciture.");
  const segmentsFeet = chain ? (Array.isArray(seam?.segmentsFeet) ? seam.segmentsFeet : []).map(Number) : null;
  if (chain && (segmentsFeet.length !== chain - 1 || segmentsFeet.some((value) => !Number.isFinite(value) || value <= 0))) throw new Error("Lunghezza delle cuciture non leggibile: ridisegnale.");
  if (chain && segmentsFeet.some((value) => value > execution.seam.maxLength)) throw new Error(`Ogni cucitura è lunga al massimo ${execution.seam.maxLength} ft.`);
  const start = chain ? points[0] : placementPoint(seam?.start), end = chain ? points[chain - 1] : placementPoint(seam?.end);
  if (!start || !end || (!chain && start.x === end.x && start.y === end.y)) throw new Error("Disegna la cucitura sulla mappa prima di applicare.");
  const lengthFeet = chain ? segmentsFeet.reduce((sum, value) => sum + value, 0) : Number(seam?.lengthFeet);
  if (!Number.isFinite(lengthFeet) || lengthFeet <= 0 || (!chain && lengthFeet > execution.seam.maxLength)) throw new Error(`La cucitura è lunga al massimo ${execution.seam.maxLength} ft.`);
  // The kept areas, their outlines and the portals: 4 for a two-point seam, up to 12 for a chain.
  const itemIds = [...new Set((Array.isArray(seam?.itemIds) ? seam.itemIds : []).map((id) => String(id || "")).filter(Boolean))].slice(0, chain ? 12 : 4);
  const use = buildBossActionUse({ profile, action, sourceItem, actionInstanceId, round });
  use.runtimeState.seam = { round, actionId: action.id, actionInstanceId, start, end, lengthFeet, itemIds, ...(chain ? { points, segmentsFeet } : {}) };
  Object.assign(use.runtimeState.lastAction, { seam: { lengthFeet } });
  const sourceName = sourceItem.name || profile.name;
  const blocked = execution.seam.blocks.map((id) => profile.abilities.find((entry) => entry.id === id)?.name || id);
  const causality = { ...use.context, resources: use.resources, seam: { round, start, end, lengthFeet, width: execution.seam.width, blocks: clone(execution.seam.blocks),
    ...(chain ? { points: clone(points), segmentsFeet: clone(segmentsFeet) } : {}) } };
  const label = `${sourceName}: ${action.name} · ${lengthFeet} ft fino alla fine del round`;
  const manualRemainder = `${action.manualText || ""}${blocked.length ? ` Finché la cucitura esiste, ${sourceName} non può usare ${blocked.join(", ")}.` : ""}`.trim();
  return {
    causality, seam: use.runtimeState.seam, manualText: manualRemainder,
    operations: [],
    options: {
      commandId: actionInstanceId, correlationId: actionInstanceId, sourceId: sourceItem.id, targetIds: [sourceItem.id], kind: "monster-action", label,
      metadataPatches: use.metadataPatches, sceneMetadataPreconditions: use.sceneMetadataPreconditions,
      history: { kind: "monster-action", label, payload: { causality, manualRemainder } },
    },
  };
}

// Epic Resistance: the roll is recorded whatever it is; at or above the threshold the chosen effect ends.
export function buildBossEffectEndMutation({ profile, action, sourceItem, effect = null, roll, actionInstanceId, round } = {}) {
  if (!isBossActionCreature(sourceItem)) throw new Error("L’attore deve essere il token reale del boss.");
  if (!actionInstanceId || typeof actionInstanceId !== "string") throw new Error("Identità azione mancante.");
  const execution = action?.execution;
  if (execution?.kind !== "effect-end") throw new Error("Questa capacità non termina effetti.");
  const value = Number(roll);
  if (!Number.isInteger(value) || value < 1 || value > execution.roll.die) throw new Error(`Inserisci il risultato del d${execution.roll.die} (1–${execution.roll.die}).`);
  const chosen = bossActiveEffects(sourceItem).find((entry) => entry.kind === effect?.kind && entry.instanceId === String(effect?.instanceId || ""));
  if (!chosen) throw new Error(`L’effetto scelto non è più attivo su ${sourceItem.name || profile.name}: riapri l’azione.`);
  const passed = value >= execution.roll.threshold;
  const use = buildBossActionUse({ profile, action, sourceItem, actionInstanceId, round });
  const sourceName = sourceItem.name || profile.name;
  // A spell ends through the coordinator's spell removal (its conditions and the caster's concentration
  // on this target go with it); a condition or pill is removed alone.
  const operations = !passed ? [] : chosen.kind === "spell"
    ? [{ type: "spell:remove-requested", targetIds: [sourceItem.id], instanceId: chosen.instanceId }, { type: "condition:automate", subjectIds: [sourceItem.id] }]
    : [{ type: "condition:remove-instances", targetIds: [sourceItem.id], removals: [{ itemId: sourceItem.id, instanceId: chosen.instanceId }] },
      { type: "condition:automate", subjectIds: [sourceItem.id] }];
  const causality = {
    ...use.context, resources: use.resources,
    effectEnd: { effect: clone(chosen), roll: value, die: execution.roll.die, threshold: execution.roll.threshold, outcome: passed ? "passed" : "failed", ended: passed },
  };
  Object.assign(use.runtimeState.lastAction, { effect: { kind: chosen.kind, instanceId: chosen.instanceId }, roll: value, outcome: passed ? "passed" : "failed" });
  const label = `${sourceName}: ${action.name} ${passed ? "riuscita" : "fallita"} (${value}) · ${chosen.name}`;
  const manualRemainder = passed ? `${chosen.name} termina su ${sourceName}.` : `${chosen.name} resta su ${sourceName}.`;
  return {
    causality, effect: chosen, roll: value, passed, manualText: manualRemainder,
    operations,
    options: {
      commandId: actionInstanceId, correlationId: actionInstanceId, sourceId: sourceItem.id, targetIds: [sourceItem.id], kind: "monster-action", label,
      metadataPatches: use.metadataPatches, sceneMetadataPreconditions: use.sceneMetadataPreconditions,
      history: { kind: "monster-action", label, payload: { causality, manualRemainder } },
    },
  };
}
