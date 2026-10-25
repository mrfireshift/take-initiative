import { ID } from "./constants.js";
import { bossSpellReferenceIds, BOSS_ACTION_SPELL_IDS } from "./bossActionProfileCore.js";
import { scaledQuickHPAmount } from "./quickHpCore.js";
import { componentDamageAfterDefense, damageDefenseFor, evasionFactor } from "./damageDefensesCore.js";
import { buildCircleArea, areaHitsBounds } from "./aoeGeometryCore.js";
import { bossAreaShapeLabel, bossGroupRequiresConfirmation, bossEffectSummaryParts, bossMarkedDefenses, isBossActionObjectTarget } from "./bossActionExecutionCore.js";

const META_KEY = `${ID}/meta`;
// Compact floating console size; the height fits the longest simple resolution (Blizzard / multi-target) without scrolling.
export const BOSS_ACTIONS_WIDTH = 380;
export const BOSS_ACTIONS_HEIGHT = 500;
const CATEGORIES = ["trait", "action", "epic-action", "reaction", "other"];
const CATEGORY_LABELS = { trait: "Tratti", action: "Azioni", "epic-action": "Azioni Epiche", reaction: "Reazioni", other: "Riferimenti" };

function realId(value) {
  const id = String(value || "").trim();
  return !!id && !id.startsWith("__") && !id.includes("::");
}

export function isBossActionSourceItem(item) {
  return realId(item?.id) && item?.type === "IMAGE" && item?.layer === "CHARACTER" && !item.attachedTo;
}

export function bossActionTargets(items = [], sourceId = "") {
  return (Array.isArray(items) ? items : [])
    .filter((item) => (isBossActionSourceItem(item) && item.id !== sourceId
      && (item.metadata?.[META_KEY]?.inInitiative === true || !!item.metadata?.[META_KEY]?.sharedHpSourceId))
      // A spell's token with hit points (Mano arcana) can be hit like a creature.
      || isBossActionObjectTarget(item))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "it"));
}

export function bossActionGroups(profile) {
  const actions = Array.isArray(profile?.abilities) ? profile.abilities : [];
  return CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    abilities: actions.filter((action) => category === "other"
      ? !CATEGORIES.slice(0, -1).includes(action?.category)
      : action?.category === category),
  })).filter((group) => group.abilities.length > 0);
}

// Console layout. Combat: every non-trait ability, grouped by the stat block's manifestation
// sub-heading (Titano, Proiezione Fatata, ...) in document order, otherwise by category; reactions last.
export function bossCombatGroups(profile) {
  const groups = [];
  const byKey = new Map();
  for (const action of Array.isArray(profile?.abilities) ? profile.abilities : []) {
    if (action?.category === "trait") continue;
    const key = action.category === "reaction" ? "reaction" : action.group ? `group:${action.group}` : `category:${action.category}`;
    if (!byKey.has(key)) {
      const group = { key, label: action.category === "reaction" ? CATEGORY_LABELS.reaction : action.group || CATEGORY_LABELS[action.category] || CATEGORY_LABELS.other, abilities: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).abilities.push(action);
  }
  return [...groups.filter((group) => group.key !== "reaction"), ...groups.filter((group) => group.key === "reaction")];
}

// ---- multi-point areas (Meteor Swarm): measured on the scene grid, with the area tool's geometry ----
// Feet per grid cell from the scene scale: feet as such, metres with the catalog's 5 ft = 1.5 m.
// Grid distance between two token rectangles (5e: adjacent = one cell), in feet; null without a scale.
export function bossReachFeet(a, b, dpi, feetPerCell) {
  const cell = Number(dpi), feet = Number(feetPerCell);
  if (!(cell > 0) || !(feet > 0) || !a?.min || !a?.max || !b?.min || !b?.max) return null;
  const gapX = Math.max(0, Number(a.min.x) - Number(b.max.x), Number(b.min.x) - Number(a.max.x));
  const gapY = Math.max(0, Number(a.min.y) - Number(b.max.y), Number(b.min.y) - Number(a.max.y));
  // Lenient (a warning only): a gap shorter than a whole cell still counts as adjacent.
  return (Math.floor(Math.max(gapX, gapY) / cell + 1e-6) + 1) * feet;
}

export function bossFeetPerCell(scale) {
  const multiplier = Number(scale?.parsed?.multiplier);
  const unit = String(scale?.parsed?.unit || "").trim().toLowerCase();
  if (!(multiplier > 0)) return null;
  if (["ft", "feet", "piedi"].includes(unit)) return multiplier;
  if (unit === "m") return (multiplier / 1.5) * 5;
  return null;
}
export function bossPointDistanceFeet(a, b, dpi, feetPerCell) {
  return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y)) / dpi * feetPerCell;
}
// Creatures whose token touches the circle of radiusFeet around a drawn point (same rule as the area tool).
export function bossInnerTargetIds({ center, radiusFeet, dpi, feetPerCell, bounds = [] } = {}) {
  if (!center || !(dpi > 0) || !(feetPerCell > 0) || !(radiusFeet > 0)) return [];
  const area = buildCircleArea(center, { x: center.x + (radiusFeet / feetPerCell) * dpi, y: center.y }, dpi);
  return (Array.isArray(bounds) ? bounds : []).filter((row) => row?.id && row.bounds && areaHitsBounds(area, row.bounds)).map((row) => row.id);
}
// The inner circles of two points may not overlap: centres at least two inner radii apart.
export function bossPointTooClose(center, centers = [], { radiusFeet, dpi, feetPerCell } = {}) {
  if (!(dpi > 0) || !(feetPerCell > 0) || !(radiusFeet > 0)) return -1;
  return centers.findIndex((other) => bossPointDistanceFeet(center, other, dpi, feetPerCell) < radiusFeet * 2);
}

// Passive summary: traits only, with the text after the printed title.
export function bossPassiveAbilities(profile) {
  return (Array.isArray(profile?.abilities) ? profile.abilities : []).filter((action) => action?.category === "trait").map((action) => {
    const raw = String(action.rawText || "");
    const text = raw.startsWith(action.name) ? raw.slice(action.name.length).replace(/^\s*(\([^)]*\))?\s*\.?\s*/u, "") : raw;
    return { id: action.id, name: action.name, text };
  });
}

export function bossActionExecutionKind(action) {
  if (!["SUPPORTED", "PARTIAL"].includes(action?.automation)) return "";
  const execution = action?.execution;
  // Multi-target saves have their own console flow; single-target forms never receive them.
  // A group attack (Divine Brilliance, v10) uses the same group flow, with attack rolls instead of saves.
  if (["save-damage", "save-effect", "attack-damage"].includes(execution?.kind) && execution.target?.mode === "multiple") return "group-save";
  if (["attack-damage", "save-damage"].includes(execution?.kind)) return execution.kind;
  // v16: Hurl (the held creature) and Epic Resistance (an effect on the boss) have their own forms; v19: the seam.
  if (["throw", "effect-end", "seam"].includes(execution?.kind)) return execution.kind;
  // Only spells of the closed catalog mapping can open the spell panel.
  const spellIds = bossSpellReferenceIds(execution);
  if (execution?.kind === "spell-reference" && spellIds.length && spellIds.every((id) => BOSS_ACTION_SPELL_IDS.includes(id))) return execution.kind;
  return "";
}

export function bossActionManualText(action) {
  const manual = String(action?.manualText || "").trim();
  if (manual) return manual;
  return action?.automation !== "SUPPORTED" ? String(action?.rawText || "") : "";
}

export function bossActionDamageComponents(action) {
  return (Array.isArray(action?.execution?.damage) ? action.execution.damage : []).map((component) => {
    const average = component?.printedAverage ?? component?.average;
    return { ...component, defaultAmount: Number.isInteger(average) && average >= 0 ? average : "" };
  });
}

export function bossActionAttackSummary(action) {
  const attack=action?.execution?.attack || {};
  const parts=["Attacco "+(Number(attack.bonus)>=0?"+":"")+attack.bonus];
  if(attack.modes?.length===1)parts.push(attack.modes[0]==="melee"?"Mischia":"Distanza");
  if(attack.reach!==undefined)parts.push("portata "+attack.reach+" ft.");
  const range=attack.range;
  const normal=Array.isArray(range)?range[0]:range?.normal;
  const long=Array.isArray(range)?range[1]:range?.long;
  if(normal!==undefined)parts.push("gittata "+normal+(long!==undefined?"/"+long:"")+" ft.");
  return parts.join(" · ")+" (verifica manuale)";
}

export function validateBossActionSelection({ sourceId, action, targetId, targets = [], mode = "", outcome = "", componentAmounts = {}, manualConfirmed = false, rider = "",
  teleport = null, critical = false } = {}) {
  const reject = (error) => ({ ok: false, error });
  const kind = bossActionExecutionKind(action);
  if (!["attack-damage", "save-damage"].includes(kind) || !action?.id) return reject("Questa abilità richiede una risoluzione manuale.");
  if (!realId(sourceId)) return reject("Il boss deve essere un token reale.");
  // v20: a requirement on the round's sequence (Rock while Gather is active) is checked from the round log.
  const requiresManual=kind==="attack-damage" && !action.execution?.drain && !action.execution?.onHit && !action.sequence && action.automation==="PARTIAL" && !!String(action.manualText || "").trim();
  if(requiresManual && manualConfirmed!==true)return reject("Conferma il prerequisito manuale prima di risolvere l’azione.");
  if (!bossActionTargets(targets, sourceId).some((item) => item.id === targetId)) return reject("Seleziona una creatura reale presente nel tracker.");
  if (kind === "attack-damage" && !(action.execution.attack?.modes || []).includes(mode)) return reject("Seleziona la modalità di attacco.");
  const outcomes = kind === "attack-damage" ? ["hit", "miss"] : ["failed", "passed"];
  if (!outcomes.includes(outcome)) return reject("Seleziona l'esito dell'attacco o del tiro salvezza.");
  // Arto che Precede il Corpo (v18): a hit needs the chosen effect.
  const choices = kind === "attack-damage" ? action.execution.onHit?.choices || [] : [];
  if (outcome === "hit" && choices.length && !choices.some((choice) => choice.id === rider)) return reject("Scegli l’effetto del colpo.");
  const amounts = {};
  if (outcome !== "miss") {
    const components = bossActionDamageComponents(action);
    if (!components.length) return reject("Componenti di danno non disponibili.");
    for (const component of components) {
      const input = componentAmounts?.[component.id];
      const amount = Number(input);
      if (!component.id || input === null || input === undefined || String(input).trim() === "" || !Number.isInteger(amount) || amount < 0) {
        return reject(`Inserisci un danno intero non negativo per ${component.type || component.id || "ogni componente"}.`);
      }
      amounts[component.id] = amount;
    }
  }
  // v21 (Il Corpo Non Era Qui): the destination of the boss's teleport, picked on the map.
  const destination = action.execution?.teleport && Number.isFinite(Number(teleport?.x)) && Number.isFinite(Number(teleport?.y))
    ? { x: Number(teleport.x), y: Number(teleport.y) } : null;
  if (action.execution?.teleport && !destination) return reject("Scegli sulla mappa dove si teletrasporta il boss.");
  return { ok: true, value: { sourceId, actionId: action.id, targetId, mode: kind === "attack-damage" ? mode : "", outcome, componentAmounts: amounts, ...(requiresManual?{manualConfirmed:true}:{}),
    ...(destination ? { teleport: destination } : {}),
    ...(kind === "attack-damage" && outcome === "hit" && critical === true ? { critical: true } : {}),
    ...(outcome === "hit" && choices.length ? { rider } : {}) } };
}

const DAMAGE_TYPE_LABELS = { slashing: "taglienti", cold: "freddo", bludgeoning: "contundenti", necrotic: "necrotici", radiant: "radiosi", force: "forza", psychic: "psichici" };
const OUTCOME_LABELS = { hit: "colpito", miss: "mancato", failed: "TS fallito", passed: "TS superato" };

const ABILITY_LABELS = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };

export function bossAbilityLabel(ability) {
  return ABILITY_LABELS[String(ability || "").toLowerCase()] || String(ability || "").toUpperCase();
}

export function bossPhaseLabel(phaseId) {
  const match = String(phaseId || "").match(/^(?:fase|phase)[-_ ]?(\d+)$/i);
  return match ? `Fase ${match[1]}` : String(phaseId || "");
}

export function bossDamageTypeLabel(type) {
  return DAMAGE_TYPE_LABELS[type] || String(type || "");
}

export function bossTargetLabel(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const name = String(item?.name || item?.id || "");
  return Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax) ? `${name} · ${meta.hp}/${meta.hpMax} PF` : name;
}

// Describes what the commit writes and what the GM still resolves; derived from validated data only.
export function bossActionAutomationSummary(action, availability = {}) {
  const kind = bossActionExecutionKind(action);
  if (kind === "group-save" && action.execution.onFailed?.mark) {
    return {
      automatic: `Automatico al commit: etichetta ${action.name} sul bersaglio che fallisce, fino a rimozione; la prima volta in ogni round in cui subisce danni da freddo da un'azione del boss, la Resistenza al freddo è ignorata e l'Immunità vale come Resistenza. Una sola voce della cronologia annullabile.`,
      manual: "Resta manuale: scelta e visibilità del bersaglio, TS, rimozione del marchio se il boss viene sconfitto, danni da freddo inflitti fuori dalla console.",
    };
  }
  if (kind === "throw" && action.execution.collision) {
    return {
      automatic: `Automatico al commit: danni al bersaglio (con le sue difese), fine della presa (Afferrato e Trattenuto del boss), Prono. Se lo scagli contro un'altra creatura: TS DES CD ${action.execution.collision.save.dc}, sul fallimento gli stessi danni (con le sue difese) e Prono. Una voce della cronologia annullabile.`,
      manual: "Resta manuale: direzione sulla mappa, tiro dei danni, se e contro chi va a sbattere.",
    };
  }
  if (kind === "throw") {
    return {
      automatic: `Automatico al commit: danni contundenti al bersaglio (con le sue difese), fine della presa (Afferrato e Trattenuto del boss), Prono se atterra sulla piattaforma oppure l'etichetta «Appeso al bordo» e il promemoria del TS DES CD ${action.execution.edge.save.dc} se finisce oltre il bordo. Una voce della cronologia annullabile.`,
      manual: "Resta manuale: direzione e punto d'arrivo sulla mappa, tiro dei danni, la caduta di chi fallisce il TS.",
    };
  }
  if (kind === "seam") {
    return {
      automatic: action.execution.seam.points ? `Automatico al commit: le ${action.execution.seam.points - 1} cuciture fra ${action.execution.seam.points} punti (larghe ${action.execution.seam.width} ft, fino a ${action.execution.seam.maxLength} ft ciascuna) restano registrate sul boss fino alla fine del round e bloccano le azioni indicate; i disegni e i portali restano sulla mappa; il loro spazio è Terreno Difficile nel controllo della velocità (costo doppio). Sequenza e soglia dei PF verificate. Una voce della cronologia annullabile.` : `Automatico al commit: la cucitura (larga ${action.execution.seam.width} ft, fino a ${action.execution.seam.maxLength} ft) resta registrata sul boss fino alla fine del round e blocca le azioni indicate; il disegno resta sulla mappa; il suo spazio è Terreno Difficile nel controllo della velocità (costo doppio). Sequenza verificata: solo come prima Azione Epica del round. Una voce della cronologia annullabile.`,
      manual: `Resta manuale: ${action.execution.seam.points ? `i ${action.execution.seam.points} punti` : "i due punti"} (superfici percepite entro ${action.execution.seam.range} ft.), la rimozione del disegno se la cucitura collassa a fine round.`,
    };
  }
  if (kind === "effect-end") {
    return {
      automatic: `Automatico al commit: con ${action.execution.roll.threshold}+ sul d${action.execution.roll.die} l'effetto scelto termina (un incantesimo con le sue condizioni e la concentrazione del lanciatore su Auril). Riuscita o fallita, una voce in cronologia e nel registro combattimento.`,
      manual: "Resta manuale: il tiro del d20 (senza bonus, Vantaggio o Svantaggio).",
    };
  }
  if (kind === "group-save" && action.execution.kind === "attack-damage") {
    const execution = action.execution;
    return {
      automatic: `Automatico al commit: danni per tipo a ogni bersaglio colpito (un tiro di danni per bersaglio), difese e marchio per creatura, uso 1/fase registrato, una sola voce della cronologia annullabile.`,
      manual: `Resta manuale: innesco (${presentationName(execution)} sotto ${execution.trigger?.hpBelow} PF, verificato anche al commit) e Reazione disponibile, creature che il boss può vedere, tiro per colpire e danni di ogni bersaglio (critici inclusi).`,
    };
  }
  if (kind === "group-save" && action.execution.kind === "save-effect") {
    return {
      automatic: `Automatico al commit: etichetta ${action.name} sui falliti fino alla fine del loro turno successivo (${bossEffectSummaryParts(action.execution.onFailed.effect).map((part) => part.label).join(", ")}), una sola voce della cronologia annullabile.`,
      manual: `Resta manuale: scelta dei bersagli (massimo ${action.execution.target.maxTargets}), TS di ogni bersaglio, applicazione di velocità, cure e PF temporanei.`,
    };
  }
  if (kind === "group-save") {
    const conditions = (action.execution.onFailed?.conditions || []).map((entry) => `${entry.condition} sui falliti ${bossConditionDurationText(entry)}`);
    const area = action.execution.target?.area;
    const parts = [
      ...(area?.segments ? ["una linea su ogni cucitura scelta del round", "un solo TS e un solo danno per creatura anche in più linee", "sequenza verificata (dopo le cuciture; l’ultimo slot del round si conferma se l’ordine dice altro)"]
        : area?.shape === "seam" ? ["la linea segue la cucitura del round", "sequenza verificata (dopo la cucitura; l’ultimo slot del round si conferma se l’ordine dice altro)"]
        : action.sequence ? ["sequenza e ricarica verificate dal registro del round (l’ultimo slot si conferma se l’ordine dice altro)"] : []),
      "danni per tipo a ogni bersaglio (metà su TS superato)",
      ...(area?.innerRadius ? [`componenti "entro ${area.innerRadius} ft" calcolate dai centri disegnati`] : []),
      ...conditions,
      ...(action.execution.onPassed?.immunity ? ["Immune sui superati"] : []),
      ...(area?.shape === "seam" ? [area.segments ? "tutte le cuciture scompaiono dal boss e dalla mappa" : "la cucitura scompare dal boss e dalla mappa"] : []),
      "una sola voce della cronologia annullabile",
    ];
    return {
      automatic: `Automatico al commit: ${parts.join(", ")}.`,
      manual: `Resta manuale: area e creature incluse, TS di ogni bersaglio, danni tirati (o medie), ${bossGroupRestrictions(action).slice(1).join("; ") || "restrizioni d’uso"}.`,
    };
  }
  if (!["attack-damage", "save-damage"].includes(kind)) return null;
  const automatic = [kind === "save-damage" ? `danni per tipo agli HP del bersaglio (${action.execution.success === "none" ? "nessun danno" : "metà"} su TS superato)` : "danni per tipo agli HP del bersaglio"];
  const failedConditions = kind === "save-damage" ? action.execution.onFailed?.conditions || [] : [];
  if (failedConditions.length) automatic.push(`${failedConditions.map((entry) => entry.condition).join(" e ")} sul TS fallito, fino a rimozione manuale`);
  if (action.execution?.grapple === "grab") automatic.push("blocco se il boss tiene già una creatura Afferrata");
  if (action.execution?.grapple === "hold") automatic.push("solo sulla creatura Afferrata dal boss");
  if (action.execution?.requiresMark) automatic.push("solo su una creatura marchiata dal boss; il marchio viene rimosso");
  if (action.execution?.drain) automatic.push("il boss recupera i PF pari ai danni necrotici subiti");
  if (action.execution?.onHit) automatic.push("sul colpo l'effetto scelto: Afferrato (una creatura alla volta) oppure il promemoria del trascinamento");
  if (action.sequence) automatic.push("requisito di sequenza verificato dal registro del round");
  if (action.execution?.teleport) automatic.push(`teletrasporto del boss sulla casella scelta (entro ${action.execution.teleport.range} ft), annullabile insieme al resto`);
  if (availability?.tracked) automatic.push(`uso ${availability.limit}/${availability.period === "round" ? "round" : "fase"} registrato`);
  automatic.push("una voce della cronologia annullabile");
  const manual = [kind === "save-damage" ? "tiro salvezza del bersaglio" : "tiro per colpire", "danni tirati (o medie)", "distanza e visibilità"];
  if (kind === "attack-damage" && action.automation === "PARTIAL" && String(action.manualText || "").trim() && !action.sequence) manual.push("prerequisito da confermare");
  if (kind === "save-damage" && String(action.manualText || "").trim()) manual.push("effetti testuali su TS fallito");
  return { automatic: "Automatico al commit: " + automatic.join(", ") + ".", manual: "Resta manuale: " + manual.join(", ") + "." };
}

function presentationName(execution) {
  return execution?.target?.area?.origin || "il boss";
}

// Hurl: GM choices before the commit; the target must be the creature the boss holds.
export function validateBossThrowSelection({ sourceId, action, targetId, targets = [], grappledIds = [], distance, damage, landing,
  collisionTargetId = "", collisionOutcome = "" } = {}) {
  const reject = (error) => ({ ok: false, error });
  if (bossActionExecutionKind(action) !== "throw" || !action?.id) return reject("Questa abilità non è un lancio.");
  if (!realId(sourceId)) return reject("Il boss deve essere un token reale.");
  if (!bossActionTargets(targets, sourceId).some((item) => item.id === targetId)) return reject("Seleziona la creatura Afferrata dal boss.");
  if (!grappledIds.includes(targetId)) return reject("Il bersaglio deve essere Afferrato dal boss.");
  const { max, step } = action.execution.distance;
  if (step && !(Number(distance) > 0 && Number(distance) <= max && Number(distance) % step === 0)) return reject("Scegli la distanza del lancio.");
  const amount = Number(damage);
  if (damage === null || damage === undefined || String(damage).trim() === "" || !Number.isInteger(amount) || amount < 0) return reject("Inserisci i danni del lancio.");
  // Without an edge (Scagliare) the creature always lands, Prono.
  const landed = action.execution.edge ? landing : "platform";
  if (!["platform", "edge"].includes(landed)) return reject("Scegli dove atterra il bersaglio.");
  if (collisionTargetId) {
    if (!action.execution.collision) return reject("Questo lancio non colpisce altre creature.");
    if (collisionTargetId === targetId || !bossActionTargets(targets, sourceId).some((item) => item.id === collisionTargetId)) return reject("Scegli un’altra creatura del tracker.");
    if (!["failed", "passed"].includes(collisionOutcome)) return reject("Scegli l’esito del TS della creatura colpita.");
  }
  return { ok: true, value: { sourceId, actionId: action.id, targetId, ...(step ? { distance: Number(distance) } : {}), damage: amount, landing: landed,
    ...(collisionTargetId ? { collisionTargetId, collisionOutcome } : {}) } };
}
// Epic Resistance: one active effect and the d20 roll; the commit records the outcome either way.
export function validateBossEffectEndSelection({ sourceId, action, effects = [], effect = null, roll } = {}) {
  const reject = (error) => ({ ok: false, error });
  if (bossActionExecutionKind(action) !== "effect-end" || !action?.id) return reject("Questa abilità non termina effetti.");
  if (!realId(sourceId)) return reject("Il boss deve essere un token reale.");
  const chosen = effects.find((entry) => entry.kind === effect?.kind && entry.instanceId === effect?.instanceId);
  if (!chosen) return reject(effects.length ? "Scegli l’effetto da terminare." : "Nessun effetto attivo sul boss.");
  const value = Number(roll);
  const die = action.execution.roll.die;
  if (roll === null || roll === undefined || String(roll).trim() === "" || !Number.isInteger(value) || value < 1 || value > die) return reject(`Inserisci il risultato del d${die} (1–${die}).`);
  return { ok: true, value: { sourceId, actionId: action.id, effect: { kind: chosen.kind, instanceId: chosen.instanceId }, roll: value } };
}

export function bossActionResultSummary(result = {}) {
  if (result.seam) return result.seam.segments ? `${result.seam.segments} cuciture, ${result.seam.lengthFeet} ft in tutto, fino alla fine del round` : `cucitura di ${result.seam.lengthFeet} ft fino alla fine del round`;
  if (Array.isArray(result.groupTargets)) {
    return [...result.groupTargets.map((target) => [
      target.name || target.id, OUTCOME_LABELS[target.outcome] || "", ...(target.damage !== undefined ? [`${target.damage} danni`] : []),
      ...(Number.isFinite(target.hpBefore) && Number.isFinite(target.hpAfter) ? [`PF ${target.hpBefore} → ${target.hpAfter}`] : []),
      ...(target.conditions || []),
      ...(target.immune ? ["già Immune"] : []),
      ...(target.immunityApplied ? ["Immune"] : []),
      ...(target.markRule ? ["marchio: Res. freddo ignorata"] : []),
      ...(target.evasion ? ["Elusione"] : []),
      ...(target.alreadyMarked ? ["già marchiato"] : []),
    ].filter(Boolean).join(" · ")), ...(result.seamTorn ? [result.seamChain ? "Cuciture strappate: scompaiono tutte" : "Cucitura strappata: scompare"] : [])].join("\n");
  }
  const parts = [];
  const target = result.target?.name || result.target?.id;
  if (target) parts.push(target + (OUTCOME_LABELS[result.outcome] ? " · " + OUTCOME_LABELS[result.outcome] : ""));
  const components = Array.isArray(result.damageComponents) ? result.damageComponents : [];
  if (components.length && result.outcome !== "miss") {
    const total = components.reduce((sum, component) => sum + (Number(component.amount) || 0), 0);
    parts.push(`${total} danni (${components.map((component) => `${bossDamageTypeLabel(component.type)} ${component.amount}`).join(" + ")})`);
  } else if (result.outcome === "miss") parts.push("nessun danno");
  const hp = result.hpChange;
  if (hp && Number.isFinite(hp.before) && Number.isFinite(hp.after)) parts.push(`PF ${hp.before} → ${hp.after}${Number.isFinite(hp.hpMax) ? "/" + hp.hpMax : ""}`);
  // A grab chosen on a hit is named once, with its escape DC.
  const conditions = (Array.isArray(result.conditions) ? result.conditions : []).filter((name) => !(result.onHit?.choice === "grab" && name === "Afferrato"));
  if (conditions.length) parts.push(conditions.join(", "));
  if (result.markRule) parts.push("marchio: Resistenza al freddo ignorata");
  if (result.evasion) parts.push("Elusione");
  if (result.markConsumed) parts.push("marchio rimosso");
  if (result.drain) parts.push(`boss +${result.drain.healed} PF`, `PF massimi del bersaglio −${result.drain.maxHpReduction.amount}: a mano`);
  if (result.throw) parts.push(`${result.throw.distance} ft`, result.throw.landing === "edge" ? `oltre il bordo: TS DES CD ${result.throw.edge?.save?.dc} nel promemoria` : "Prono",
    ...(result.throw.releasedConditions?.length ? ["presa terminata"] : []),
    ...(result.throw.collision ? [`contro ${result.throw.collision.name || result.throw.collision.targetId}: TS ${result.throw.collision.outcome === "failed" ? `fallito, ${result.throw.collision.requestedDamage} danni e Prono` : "superato"}`] : []));
  if (result.teleport) parts.push("boss teletrasportato");
  if (result.onHit) parts.push(result.onHit.choice === "grab" ? `Afferrato (CD ${result.onHit.escapeDC})` : `trascinalo di ${result.onHit.distance} ft sulla mappa`);
  if (result.effectEnd) return `${result.effectEnd.passed ? "riuscita" : "fallita"} (${result.effectEnd.roll} su ${result.effectEnd.threshold}+): ${result.effectEnd.name} ${result.effectEnd.passed ? "termina" : "resta"}`;
  for (const resource of Array.isArray(result.resources) ? result.resources : []) {
    parts.push(`uso ${resource.afterUsed}/${resource.limit} ${resource.period === "round" ? "nel round " + resource.round : "nella fase"}`);
  }
  return parts.join(" · ");
}

// Map selection → candidate target. The boss stays the actor; virtual IDs and attachments never qualify.
export function bossSelectionTarget(selectedItems = [], sourceId = "") {
  const items = Array.isArray(selectedItems) ? selectedItems : [];
  const candidates = bossActionTargets(items, sourceId);
  if (candidates.length === 1) return { status: "single", target: candidates[0], candidates };
  if (candidates.length > 1) return { status: "multiple", target: null, candidates };
  if (!items.length) return { status: "none", target: null, candidates };
  if (items.every((item) => item?.id === sourceId)) return { status: "boss", target: null, candidates };
  return { status: items.some(isBossActionSourceItem) ? "untracked" : "invalid", target: null, candidates };
}

// Draft rule: the map selection drives the target only while the draft is pristine.
// Once any decision exists the target is locked; a different selection is only offered as an explicit switch.
// A locked draft without any target may still take a single selection: no decision moves between creatures.
export function reconcileBossDraftTarget({ targetId = null, locked = false } = {}, selection = {}) {
  if (locked && !targetId && selection.status === "single") return { targetId: selection.target.id, suggestion: null, candidates: [] };
  if (locked && !targetId) return { targetId: null, suggestion: null, candidates: selection.status === "multiple" ? selection.candidates : [] };
  if (locked) {
    const suggestion = selection.status === "single" && selection.target?.id !== targetId ? selection.target : null;
    return { targetId, suggestion, candidates: [] };
  }
  if (selection.status === "single") return { targetId: selection.target.id, suggestion: null, candidates: [] };
  return { targetId: null, suggestion: null, candidates: selection.status === "multiple" ? selection.candidates : [] };
}

export function bossSelectionHint(status) {
  return {
    none: "Seleziona una creatura sulla mappa.",
    boss: "Il boss è l’attore: seleziona il bersaglio sulla mappa.",
    untracked: "La creatura selezionata non è nel tracker.",
    invalid: "Seleziona una creatura sulla mappa.",
    multiple: "Più token selezionati: scegline uno.",
  }[status] || "";
}

export function bossActionRowMeta(action, availability = {}) {
  const kind = bossActionExecutionKind(action);
  const execution = action?.execution || {};
  let tag = "Manuale";
  if (kind === "attack-damage") tag = `Attacco ${Number(execution.attack?.bonus) >= 0 ? "+" : ""}${execution.attack?.bonus}`;
  else if (kind === "seam") tag = execution.seam?.points ? `${execution.seam.points} punti · fino a ${execution.seam.maxLength} ft per tratto` : `Cucitura fino a ${execution.seam?.maxLength} ft`;
  else if (kind === "save-damage") tag = `TS ${bossAbilityLabel(execution.save?.ability)} ${execution.save?.dc}`;
  else if (kind === "throw") tag = execution.distance?.step ? `Lancio fino a ${execution.distance?.max} ft · ${execution.damage?.[0]?.formula} ogni ${execution.distance?.step} ft`
    : `Lancio fino a ${execution.distance?.max} ft · ${execution.damage?.[0]?.formula}`;
  else if (kind === "effect-end") tag = `d${execution.roll?.die} · ${execution.roll?.threshold}+ termina un effetto`;
  else if (kind === "spell-reference") tag = bossSpellReferenceIds(execution).length > 1 ? `Incantesimi (${bossSpellReferenceIds(execution).length})` : "Incantesimo";
  else if (kind === "group-save" && execution.kind === "attack-damage") tag = `Attacco ${Number(execution.attack?.bonus) >= 0 ? "+" : ""}${execution.attack?.bonus} · ogni creatura entro ${execution.target?.area?.size} ft`;
  else if (kind === "group-save") tag = `TS ${bossAbilityLabel(execution.save?.ability)} ${execution.save?.dc} · ${execution.target?.area ? `${execution.target.area.count ? `${execution.target.area.count}× ` : ""}${bossAreaShapeLabel(execution.target.area)} ${execution.target.area.size} ft` : execution.target?.maxTargets === 1 ? "1 bersaglio" : execution.target?.maxTargets ? `fino a ${execution.target.maxTargets} bersagli` : "più bersagli"}`;
  const usage = action?.usage || {};
  const period = (value) => (value === "round" ? "round" : value === "phase" ? "fase" : "giorno");
  let badge = "", exhausted = false;
  if (availability?.tracked) {
    exhausted = availability.available === false;
    badge = exhausted ? "Esaurita" : `${availability.remaining}/${availability.limit} ${period(availability.period)}`;
  } else if (usage.limit) badge = `${usage.limit}/${period(usage.period)}`;
  else if (usage.note) badge = "Ricarica";
  // v19: the place in the round's Epic Actions; a sequence block (from the round log or the seam) disables it.
  if (action?.sequence?.slot) tag += action.sequence.slot === "first" ? " · prima del round" : " · ultima del round";
  if (availability?.sequenceBlocked) { exhausted = true; badge = "Bloccata"; }
  // v22: the hit point gate (the alternative seam combo below half HP).
  // The badge names the requirement, not the current state.
  if (availability?.hpGated) { exhausted = true; badge = action.hpGate === "bloodied" ? "Solo a ½ PF o meno" : "Solo sopra ½ PF"; }
  return { kind, tag, badge, exhausted };
}

export function bossDamageTotal(components = [], amounts = {}, outcome = "") {
  if (outcome === "miss") return 0;
  const factor = outcome === "passed" ? "half" : "full";
  return components.reduce((sum, component) => {
    const value = Number(amounts?.[component.id]);
    return sum + (Number.isInteger(value) && value >= 0 ? scaledQuickHPAmount(value, factor) : 0);
  }, 0);
}

// Group draft rule: like the single target, the map selection drives the group only while pristine.
// A locked group is never replaced silently; a different selection becomes an explicit offer.
export function reconcileBossDraftGroup({ targetIds = [], locked = false } = {}, selection = {}) {
  const candidates = (Array.isArray(selection.candidates) ? selection.candidates : []).map((item) => item.id);
  const unique = [...new Set(candidates)];
  if (!locked || !targetIds.length) return { targetIds: unique, suggestion: null };
  const same = unique.length === targetIds.length && unique.every((id) => targetIds.includes(id));
  return { targetIds: [...targetIds], suggestion: unique.length && !same ? unique : null };
}

// How long a group condition lasts, from validated data only.
export function bossConditionDurationText(entry, bossName = "") {
  const expiry = entry?.expiry || {};
  if (expiry.mode === "turn-end" && expiry.actor === "source") return `fino alla fine del prossimo turno di ${bossName || "boss"}`;
  if (expiry.mode === "rounds" && expiry.remaining === 10) {
    return `per 1 minuto${entry.saveReminder ? ` (TS ${bossAbilityLabel(entry.saveReminder.ability)} ${entry.saveReminder.dc} a fine turno)` : ""}`;
  }
  return "fino a rimozione manuale";
}

// The noun used in the console steps for the action's area.
export function bossAreaNoun(area) {
  if (area?.shape === "seam" && area.segments) return "le linee sulle cuciture";
  return { cone: "il cono", circle: "il cerchio", emanation: "l’emanazione", seam: "la linea sulla cucitura" }[area?.shape] || "l’area";
}

// Area actions follow the console steps: confirm restrictions (only with a recharge to verify), draw, saves, apply.
export function bossGroupApplyBlocker({ targetIds = [], outcomes = {}, manualConfirmed = false, areaRequired = false, area = null,
  confirmationRequired = true, areaShape = null, maxTargets = 0, confirmationText = "", drawnCount = 0,
  outcomeValues = ["failed", "passed"], missingDamageIds = [] } = {}) {
  if (areaRequired && confirmationRequired && !manualConfirmed) return confirmationText || "Conferma ricarica e sequenza.";
  if (areaRequired && areaShape?.count && drawnCount < areaShape.count) return `Disegna tutte le ${areaShape.count} esplosioni (${drawnCount}/${areaShape.count}).`;
  // v22: at least one chosen seam, with its line shown.
  if (areaRequired && areaShape?.segments && !drawnCount) return "Scegli le cuciture da strappare e mostra le loro linee.";
  if (areaRequired && !area) return `${areaShape?.shape === "emanation" ? "Posiziona" : "Disegna"} ${bossAreaNoun(areaShape || { shape: "cone" })} sulla mappa.`;
  if (!targetIds.length) return areaRequired ? "Nessuna creatura del tracker nell’area." : "Seleziona i bersagli sulla mappa.";
  if (maxTargets && targetIds.length > maxTargets) return maxTargets === 1 ? `Un solo bersaglio: togline ${targetIds.length - 1}.` : `Al massimo ${maxTargets} bersagli: togline ${targetIds.length - maxTargets}.`;
  const missing = targetIds.filter((id) => !outcomeValues.includes(outcomes?.[id])).length;
  if (missing) return missing === 1 ? "Manca l’esito di 1 bersaglio." : `Manca l’esito di ${missing} bersagli.`;
  // Group attack: every hit needs its own damage roll.
  const noDamage = targetIds.filter((id) => missingDamageIds.includes(id)).length;
  if (noDamage) return noDamage === 1 ? "Inserisci i danni di 1 bersaglio colpito." : `Inserisci i danni di ${noDamage} bersagli colpiti.`;
  if (confirmationRequired && !manualConfirmed) return "Conferma le verifiche manuali.";
  return "";
}

// After a drawing, the map selection can only add creatures explicitly; nothing replaces the drawn group.
export function reconcileBossAreaGroup({ targetIds = [], area = null } = {}, selection = {}) {
  if (!area) return { targetIds: [...targetIds], suggestion: null };
  const extras = [...new Set((Array.isArray(selection.candidates) ? selection.candidates : []).map((item) => item.id))]
    .filter((id) => !targetIds.includes(id));
  return { targetIds: [...targetIds], suggestion: extras.length ? extras : null };
}

export function bossGroupRestrictions(action) {
  const execution = action?.execution || {};
  const area = execution.target?.area;
  const parts = [];
  if (area && execution.target?.selection !== "area") parts.push(`${bossAreaShapeLabel(area)} di ${area.size} ft. dal ${area.origin}: scegli tu le creature incluse`);
  // v19: a recharge that follows the sequence (after the seam) is verified from the round log.
  if (action?.usage?.note && !action.sequence) parts.push(`${action.usage.note === "Special Recharge" ? "Ricarica speciale" : action.usage.note}: verifica che sia disponibile`);
  if (action?.manualText) parts.push(action.manualText);
  return parts;
}

// What the GM confirms before drawing: a recharge (Breath) or a requirement (Meteor Swarm).
export function bossGroupConfirmationText(action) {
  if (action?.execution?.trigger) return "Conferma innesco e Reazione disponibile.";
  return action?.usage?.note ? "Conferma ricarica e sequenza." : "Conferma requisito e sequenza.";
}
// The outcomes of one group row: attack rolls for a group attack, saves otherwise.
// Area colour theme per boss definition (closed map, presentation only): Auril's areas are frost.
const BOSS_AREA_THEMES = Object.freeze({ auril: "frost", shothragoth: "void" });
export function bossAreaTheme(profile) {
  return BOSS_AREA_THEMES[profile?.bossDefinitionId] || "";
}
export function bossGroupOutcomes(action) {
  return action?.execution?.kind === "attack-damage" ? [["hit", "Colpito"], ["miss", "Mancato"]] : [["failed", "Fallito"], ["passed", "Superato"]];
}
// Targets hit by a group attack without a complete, valid damage roll.
export function bossGroupMissingDamageIds(action, targetIds = [], outcomes = {}, targetAmounts = {}) {
  if (action?.execution?.kind !== "attack-damage") return [];
  const components = bossActionDamageComponents(action);
  return (Array.isArray(targetIds) ? targetIds : []).filter((id) => outcomes?.[id] === "hit" && components.some((component) => {
    const input = targetAmounts?.[id]?.[component.id];
    const amount = Number(input);
    return input === null || input === undefined || String(input).trim() === "" || !Number.isInteger(amount) || amount < 0;
  }));
}

export function validateBossActionGroupSelection({ sourceId, action, targetIds = [], targets = [], outcomes = {}, componentAmounts = {}, manualConfirmed = false, area = null,
  areas = null, innerIds = [], targetAmounts = {} } = {}) {
  const reject = (error) => ({ ok: false, error });
  if (bossActionExecutionKind(action) !== "group-save" || !action?.id) return reject("Questa abilità non usa bersagli multipli.");
  if (!realId(sourceId)) return reject("Il boss deve essere un token reale.");
  const tracked = new Set(bossActionTargets(targets, sourceId).map((item) => item.id));
  const ids = [...new Set((Array.isArray(targetIds) ? targetIds : []).filter(Boolean))];
  if (!ids.length) return reject("Seleziona i bersagli sulla mappa.");
  if (ids.some((id) => !tracked.has(id))) return reject("Ogni bersaglio deve essere una creatura reale presente nel tracker.");
  const areaRequired = action.execution.target?.selection === "area";
  const confirmationRequired = bossGroupRequiresConfirmation(action);
  const multi = action.execution.target?.area?.count || 0;
  const segments = action.execution.target?.area?.segments === true;
  const drawn = Array.isArray(areas) ? areas.length : 0;
  const attackGroup = action.execution.kind === "attack-damage";
  const blocker = bossGroupApplyBlocker({ targetIds: ids, outcomes, manualConfirmed, areaRequired, area: multi ? (drawn === multi ? areas : null) : segments ? (drawn ? areas : null) : area,
    confirmationRequired, areaShape: action.execution.target?.area, maxTargets: action.execution.target?.maxTargets || 0,
    confirmationText: bossGroupConfirmationText(action), drawnCount: drawn, outcomeValues: bossGroupOutcomes(action).map(([value]) => value),
    missingDamageIds: bossGroupMissingDamageIds(action, ids, outcomes, targetAmounts) });
  if (blocker) return reject(blocker);
  if (attackGroup) {
    // One damage roll per hit; a miss carries none.
    const perTarget = Object.fromEntries(ids.filter((id) => outcomes[id] === "hit").map((id) => [id,
      Object.fromEntries(bossActionDamageComponents(action).map((component) => [component.id, Number(targetAmounts[id][component.id])]))]));
    return { ok: true, value: { sourceId, actionId: action.id, targetIds: ids, outcomes: Object.fromEntries(ids.map((id) => [id, outcomes[id]])),
      targetAmounts: perTarget, manualConfirmed: true, areaPlacement: structuredClone(area) } };
  }
  const amounts = {};
  for (const component of bossActionDamageComponents(action)) {
    const input = componentAmounts?.[component.id];
    const amount = Number(input);
    if (input === null || input === undefined || String(input).trim() === "" || !Number.isInteger(amount) || amount < 0)
      return reject(`Inserisci un danno intero non negativo per ${bossDamageTypeLabel(component.type)}.`);
    amounts[component.id] = amount;
  }
  return { ok: true, value: { sourceId, actionId: action.id, targetIds: ids,
    outcomes: Object.fromEntries(ids.map((id) => [id, outcomes[id]])), componentAmounts: amounts, manualConfirmed: confirmationRequired ? true : manualConfirmed === true,
    ...(areaRequired && segments ? { areaPlacements: structuredClone(areas) }
      : areaRequired && multi ? { areaPlacements: structuredClone(areas), innerIds: ids.filter((id) => (Array.isArray(innerIds) ? innerIds : []).includes(id)) }
      : areaRequired ? { areaPlacement: structuredClone(area) } : {}) } };
}

// Preview with the same arithmetic as the commit: outcome factor first, then the Actor Profile defense.
export function bossDefendedDamage(components = [], amounts = {}, outcome = "", profileDefenses = {}, ignoredTypes = [], marked = false, evasion = false) {
  const defenses = marked ? bossMarkedDefenses(profileDefenses) : profileDefenses;
  if (outcome === "miss") return 0;
  const base = outcome === "passed" ? "half" : "full";
  // Evasion: a passed DEX save takes nothing, a failed one half (the shared factors have no "zero").
  const factor = evasion ? evasionFactor(base) : base;
  if (factor === "zero") return 0;
  const ignored = new Set(Array.isArray(ignoredTypes) ? ignoredTypes : []);
  return components.reduce((sum, component) => {
    const value = Number(amounts?.[component.id]);
    if (!Number.isInteger(value) || value < 0) return sum;
    const defense = damageDefenseFor(defenses, component.type);
    return sum + componentDamageAfterDefense(value, factor, defense && !ignored.has(component.type) ? defense : null);
  }, 0);
}
