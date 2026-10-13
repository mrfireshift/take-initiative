const clone = value => structuredClone(value);
const usageKey = (phaseId, actionId) => JSON.stringify([phaseId, actionId]);

function counterState(runtimeState) {
  const usage = runtimeState?.usageState;
  if (usage === undefined) return {version:1,rounds:{},phases:{}};
  if (!usage || usage.version !== 1 || !usage.rounds || !usage.phases
      || typeof usage.rounds !== "object" || Array.isArray(usage.rounds)
      || typeof usage.phases !== "object" || Array.isArray(usage.phases)) {
    throw new Error("Stato risorse boss non valido: verifica il profilo prima di proseguire.");
  }
  for (const counts of [usage.phases, ...Object.values(usage.rounds)]) {
    if (!counts || typeof counts !== "object" || Array.isArray(counts)
        || Object.values(counts).some(count=>!Number.isSafeInteger(count) || count<0)) {
      throw new Error("Contatori risorse boss non validi.");
    }
  }
  return usage;
}

// Counters derive their availability from canonical round; no reset listener is needed.
export function bossActionUsageAvailability(action, runtimeState={}, {phaseId,round}={}) {
  const {period,limit}=action?.usage || {};
  const tracked=["round","phase"].includes(period) && Number.isSafeInteger(limit) && limit>0;
  if (!tracked) return {tracked:false,available:true};
  if (!phaseId || !action?.id) throw new Error("Identità risorsa boss mancante.");
  if (period==="round" && (!Number.isSafeInteger(round) || round<1)) {
    return {tracked:true,available:false,remaining:0,used:0,period,limit,reason:"Round canonico non impostato."};
  }
  const usage=counterState(runtimeState);
  const counts=period==="round" ? usage.rounds[String(round)] || {} : usage.phases;
  const used=counts[usageKey(phaseId,action.id)] || 0;
  return {tracked:true,available:used<limit,remaining:Math.max(0,limit-used),used,period,limit,
    ...(period==="round"?{round}:{}),...(used>=limit?{reason:"Risorsa esaurita."}:{})};
}

export function consumeBossActionUsage(action, runtimeState={}, context={}) {
  const availability=bossActionUsageAvailability(action,runtimeState,context);
  if (!availability.tracked) return clone(runtimeState);
  if (!availability.available) throw new Error(availability.reason || "Risorsa esaurita.");
  const next=clone(runtimeState);
  next.usageState=clone(counterState(runtimeState));
  let counts=next.usageState.phases;
  if (availability.period==="round") {
    counts=next.usageState.rounds[String(context.round)] ??= {};
  }
  counts[usageKey(context.phaseId,action.id)]=availability.used+1;
  // Only the current and the previous round can matter: older rounds, and rounds after the current one
  // (left by an earlier combat or a round reset), are dropped on every new use.
  if (Number.isSafeInteger(context.round) && context.round>0) {
    next.usageState.rounds=Object.fromEntries(Object.entries(next.usageState.rounds)
      .filter(([key])=>Number(key)===context.round || Number(key)===context.round-1));
  }
  return next;
}

// What the boss token has recorded. Uses in rounds after the current one cannot belong to this combat:
// they come from an earlier combat or a round reset, and make the same round numbers look spent.
export function bossActionUsageSummary(runtimeState={}, round) {
  let usage;
  try {usage=counterState(runtimeState);} catch {return {valid:false,rounds:[],futureRounds:[],phaseUses:0,markUses:0,total:0};}
  const rounds=Object.entries(usage.rounds).filter(([,counts])=>Object.values(counts).some(count=>count>0))
    .map(([key])=>Number(key)).filter(Number.isSafeInteger).sort((a,b)=>a-b);
  const phaseUses=Object.values(usage.phases).reduce((sum,count)=>sum+count,0);
  const markUses=Object.keys(runtimeState?.markUses && typeof runtimeState.markUses==="object" ? runtimeState.markUses : {}).length;
  return {valid:true,rounds,futureRounds:Number.isSafeInteger(round)?rounds.filter(value=>value>round):[],phaseUses,markUses,
    total:rounds.length+phaseUses+markUses};
}
