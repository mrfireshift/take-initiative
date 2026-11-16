// The features that grant an action of the attack console's Azioni tab as a bonus action (lot T4a of
// docs/STUDIO_AZIONI_DI_TURNO.md, decision A1). Each does the same action through the same command
// (buildPcTurnActionMutation), with its own cost in it (Step of the Wind's ki, a species trait's use) and its name in the
// log; Adrenaline Rush adds its temporary hit points as its own trait gives them (speciesHpTraitCore.js). The plugin counts
// no action of the turn: a feature here only says where the action comes from and what it spends. Pure.
import { classFeatureResourceStatus, getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { activeClassFeatureInstances } from "./classFeatureCore.js";
import { ID } from "./constants.js";
import { bossMetadataSnapshot } from "./bossActionExecutionCore.js";
import { planSpeciesHpTrait } from "./speciesHpTraitCore.js";

const META_KEY = `${ID}/meta`;
const freezeVia = (kinds, extra = {}) => Object.freeze({ kinds: Object.freeze(kinds), ...extra });

// kinds: the actions it grants; note: what stays at the table (the plugin measures no distance); whileActive: only while
// the feature is active (the Eagle totem spirit comes and goes with Rage).
export const PC_TURN_ACTION_VIAS = Object.freeze({
  "ladro-azione-scaltra": freezeVia(["dash", "disengage", "hide"]),
  "monaco-ki-passo-del-vento": freezeVia(["dash", "disengage"], { note: "Per il turno raddoppia anche la distanza dei salti." }),
  "ranger-revised-passo-veloce": freezeVia(["dash"]),
  "ranger-svanire": freezeVia(["hide"]),
  "ranger-revised-svanire": freezeVia(["hide"]),
  "ladro-pianificatore-maestro-di-tattiche": freezeVia(["help"],
    { note: "Aiutando in un attacco, il nemico può essere fino a 9 m dal ladro invece che entro 1,5 m." }),
  "specie-goblin-fuga-agile": freezeVia(["disengage", "hide"]),
  "specie-goblin-multiverso-fuga-agile": freezeVia(["disengage", "hide"]),
  "specie-orco-aggressivo": freezeVia(["dash"],
    { note: "Solo verso una creatura ostile che vede o sente, finendo il movimento più vicino a lei." }),
  "specie-orco-multiverso-scarica-di-adrenalina": freezeVia(["dash"],
    { note: "Con lo Scatto, PF temporanei pari al bonus di competenza: non si sommano a quelli che ha già." }),
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila": freezeVia(["dash"], { whileActive: true }),
});

const text = (value) => String(value ?? "").trim();
const metaOf = (item) => item?.metadata?.[META_KEY] || {};

export function pcTurnActionViaKinds(featureId) {
  return [...(PC_TURN_ACTION_VIAS[text(featureId)]?.kinds || [])];
}

export function pcTurnActionViaNote(featureId) {
  return PC_TURN_ACTION_VIAS[text(featureId)]?.note || "";
}

// The feature's cost now, as the sheet reads it: the first pool it spends, with what is left (null: it spends nothing).
function viaCost(feature, card, stateValue) {
  const status = classFeatureResourceStatus(feature, card, stateValue);
  const entry = status.entries.find((value) => value.poolId) || null;
  if (!entry) return null;
  const pool = getClassFeatureResourcePool(entry.poolId);
  return { pool, poolId: entry.poolId, name: text(pool?.name) || entry.poolId, amount: entry.amount, ready: entry.ready,
    current: entry.current, maximum: entry.maximum, unlimited: entry.unlimited };
}

// Why the feature cannot grant that action now, or "": not a feature of the sheet, not this action, not active (the Eagle
// without Rage), its pool spent. The turn's own checks (its turn, a Help's target) stay with the action.
export function pcTurnActionViaBlocker({ featureId = "", kind = "", sourceItem = null, turnState = null } = {}) {
  const spec = PC_TURN_ACTION_VIAS[text(featureId)];
  const feature = getClassFeatureDefinition(featureId);
  if (!spec || !feature) return "Capacità non valida per questa azione.";
  if (!spec.kinds.includes(kind)) return `${feature.name} non dà questa azione.`;
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  if (!getEnabledClassFeatures(card).some((entry) => entry.id === feature.id)) return `${feature.name} non è nella scheda.`;
  if (spec.whileActive && !activeClassFeatureInstances(meta.classFeatureState, turnState?.round ?? null)
    .some((instance) => instance.featureId === feature.id)) return `${feature.name}: solo mentre è attivo (in Ira).`;
  const cost = viaCost(feature, card, meta.classFeatureState);
  if (cost && !cost.ready) return `${feature.name}: nessun uso rimasto (${cost.name}).`;
  if (cost && !cost.pool) return `${feature.name}: risorsa non trovata.`;
  return "";
}

// The feature's part of the command: { featureId, name, spent, operations, tempHp, warning }. Its pool spent once
// (class-feature:adjust-resource, as a reaction feature spends it); Adrenaline Rush's temporary hit points on the
// creature, with the same plan and the same hp:set as its trait (none when it already has more: they do not add up).
export function planPcTurnActionVia({ featureId = "", kind = "", sourceItem = null, turnState = null, eventId = "" } = {}) {
  const blocker = pcTurnActionViaBlocker({ featureId, kind, sourceItem, turnState });
  if (blocker) throw new Error(blocker);
  const feature = getClassFeatureDefinition(featureId);
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  const cost = viaCost(feature, card, meta.classFeatureState);
  const operations = [];
  let spent = "";
  if (cost && !cost.unlimited) {
    operations.push({ type: "class-feature:adjust-resource", operationId: `${eventId}:via-resource`, sourceId: sourceItem.id, pool: cost.pool,
      characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers || null, adjustment: { delta: -cost.amount } });
    const left = Number.isFinite(cost.current) ? Math.max(0, cost.current - cost.amount) : null;
    spent = left !== null && Number.isFinite(cost.maximum) ? `${cost.name} ${left}/${cost.maximum}` : `${cost.name} −${cost.amount}`;
  }
  let tempHp = null;
  let warning = "";
  if (feature.hpTrait) {
    const plan = planSpeciesHpTrait({ feature, card, targetMeta: meta, targetName: sourceItem.name || "" });
    if (!plan.ok) throw new Error(plan.blocker);
    warning = plan.warning || "";
    if (plan.change?.changed) {
      operations.push({ type: "hp:set", updates: [{ itemId: sourceItem.id, hp: plan.change.afterHP, hpMax: plan.change.hpMax,
        tempHp: plan.change.afterTempHp, hpIntent: { mode: plan.mode, amount: plan.amount, eventId },
        expectedHP: bossMetadataSnapshot(meta, "hp"), expectedHPMax: bossMetadataSnapshot(meta, "hpMax") }] });
      tempHp = { amount: plan.amount, after: plan.change.afterTempHp };
    }
  }
  return { featureId: feature.id, name: feature.name, spent, operations, tempHp, warning };
}
