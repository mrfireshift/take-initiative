import {
  aggregateCombatLogEvents,
  normalizeCombatLogEvent,
} from "./combatLogCore.js";
import { normalizeCombatLogCausality } from "./combatLogCausalityCore.js";

export const COMBAT_LOG_CATEGORY_ORDER = Object.freeze([
  "hp",
  "spell",
  "save",
  "condition",
  "resource",
  "movement",
  "turn",
  "roster",
  "undo",
  "note",
  "other",
]);

const CATEGORY_META = Object.freeze({
  hp: Object.freeze({ label: "HP", tone: "#ef4444" }),
  spell: Object.freeze({ label: "Incantesimo", tone: "#a855f7" }),
  save: Object.freeze({ label: "Tiro salvezza", tone: "#f97316" }),
  condition: Object.freeze({ label: "Condizione", tone: "#ec4899" }),
  resource: Object.freeze({ label: "Risorsa", tone: "#14b8a6" }),
  movement: Object.freeze({ label: "Movimento", tone: "#22c55e" }),
  turn: Object.freeze({ label: "Turno", tone: "#3b82f6" }),
  roster: Object.freeze({ label: "Incontro", tone: "#06b6d4" }),
  undo: Object.freeze({ label: "Undo", tone: "#f59e0b" }),
  note: Object.freeze({ label: "Nota", tone: "#eab308" }),
  other: Object.freeze({ label: "Altro", tone: "#94a3b8" }),
});

const OUTCOME_LABELS = Object.freeze({
  passed: "Superato",
  pass: "Superato",
  success: "Confermato",
  succeeded: "Confermato",
  confirmed: "Confermato",
  failed: "Fallito",
  failure: "Fallito",
  hit: "Colpito",
  miss: "Mancato",
  critical: "Critico",
  immune: "Immune",
  resisted: "Resistito",
  resisted_successfully: "Resistito",
});

const NO_TURN_KEY = "__NO_TURN__";

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value, fallback = 1) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? Math.max(1, Math.round(number)) : fallback;
}

function numberText(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function signedNumber(value) {
  const number = finiteNumber(value);
  if (number === null || number === 0) return "0";
  return number > 0 ? `+${numberText(number)}` : numberText(number);
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function safeJson(value) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

export function normalizePresentationSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .trim();
}

export function getCombatLogCategoryMeta(category) {
  const key = COMBAT_LOG_CATEGORY_ORDER.includes(String(category)) ? String(category) : "other";
  return CATEGORY_META[key];
}

function targetName(target) {
  if (typeof target === "string" || typeof target === "number") return String(target);
  return stringValue(target?.name || target?.targetName || target?.id || target?.instanceId) || "Bersaglio sconosciuto";
}

function targetId(target, index = 0) {
  return stringValue(target?.id || target?.tokenId || target?.targetId || target?.name) || `target-${index}`;
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizePresentationSearch(item?.name || item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTargets(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = stringValue(item?.id);
    const name = normalizePresentationSearch(item?.name);
    const key = id ? `id:${id}` : `name:${name}`;
    if (!name && !id) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function eventCausality(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  return payload.causality && typeof payload.causality === "object"
    ? normalizeCombatLogCausality(payload.causality)
    : null;
}

function mergePresentationTargets(event, causality) {
  const targets = [];
  const byKey = new Map();
  const add = (target, index) => {
    const normalized = {
      id: targetId(target, index),
      name: targetName(target),
      ...(typeof target === "object" && target !== null ? clone(target) : {}),
    };
    const key = normalized.id
      ? `id:${normalized.id}`
      : `name:${normalizePresentationSearch(normalized.name)}`;
    if (!key || key === "name:") return;
    const previousIndex = byKey.get(key);
    if (previousIndex === undefined) {
      byKey.set(key, targets.length);
      targets.push(normalized);
      return;
    }
    targets[previousIndex] = {
      ...targets[previousIndex],
      ...normalized,
      name: targets[previousIndex].name || normalized.name,
    };
  };
  for (const [index, target] of (Array.isArray(event?.targets) ? event.targets : []).entries()) {
    add(target, index);
  }
  for (const [index, target] of (Array.isArray(causality?.targets) ? causality.targets : []).entries()) {
    add(target, index + targets.length);
  }
  return targets;
}

function turnContext(event) {
  const turn = event?.turn && typeof event.turn === "object" ? event.turn : null;
  const id = stringValue(turn?.id);
  const name = stringValue(turn?.name);
  if (!id && !name) return { turnKey: NO_TURN_KEY, turnName: "Fuori turno", turn: null };
  const turnKey = `turn:${id || name}`;
  const turnName = name || id || "Contesto turno non disponibile";
  return { turnKey, turnName, turn: clone(turn) };
}

function collectionItemName(item, field) {
  if (typeof item === "string" || typeof item === "number") return String(item);
  return stringValue(
    item?.displayLabel
      || item?.name
      || item?.condition
      || item?.spellName
      || item?.label
      || item?.id
      || item?.instanceId
      || (field === "concentrations" ? item?.key : "")
  ) || (field === "concentrations" ? "Concentrazione senza nome" : "Elemento senza nome");
}

function facetItemText(item, field) {
  return collectionItemName(item, field);
}

function facetChangeLines(facet, field) {
  const lines = [];
  const targets = Array.isArray(facet?.targets) ? facet.targets : [];
  for (const target of targets) {
    const prefix = targetName(target);
    for (const item of Array.isArray(target.added) ? target.added : []) {
      lines.push(`${prefix}: + ${facetItemText(item, field)}`);
    }
    for (const item of Array.isArray(target.removed) ? target.removed : []) {
      lines.push(`${prefix}: − ${facetItemText(item, field)}`);
    }
    for (const item of Array.isArray(target.updated) ? target.updated : []) {
      const before = facetItemText(item.before, field);
      const after = facetItemText(item.after, field);
      lines.push(`${prefix}: ↻ ${before} → ${after}`);
    }
  }
  return lines;
}

function hpTargetLine(target) {
  const before = target?.before || {};
  const after = target?.after || {};
  const delta = finiteNumber(target?.delta)
    ?? ((finiteNumber(after.hp) ?? 0) - (finiteNumber(before.hp) ?? 0));
  const hpMaxDelta = finiteNumber(target?.hpMaxDelta)
    ?? ((finiteNumber(after.hpMax) ?? 0) - (finiteNumber(before.hpMax) ?? 0));
  const name = targetName(target);
  const line = `${name}: ${numberText(before.hp)}/${numberText(before.hpMax)} → ${numberText(after.hp)}/${numberText(after.hpMax)} (${signedNumber(delta)} HP)`;
  return hpMaxDelta === 0 ? line : `${line}; HP max ${signedNumber(hpMaxDelta)}`;
}

function hpTargets(event) {
  const facetTargets = event?.facets?.hp?.targets;
  if (Array.isArray(facetTargets) && facetTargets.length) return facetTargets;
  return Array.isArray(event?.targets) ? event.targets.filter((target) => target?.before || target?.after) : [];
}

function outcomeLabel(value) {
  const raw = stringValue(value);
  if (!raw) return "";
  return OUTCOME_LABELS[raw.toLocaleLowerCase("it-IT")] || raw;
}

function outcomeValue(item) {
  if (item && typeof item === "object") return item.outcome || item.result || item.attackOutcome;
  return item;
}

function outcomeCollectionValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.keys(value).sort().map((key) => value[key]);
  }
  return [];
}

function collectOutcomes(event) {
  const values = [];
  const add = (value) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const label = outcomeLabel(value);
    if (label && !values.includes(label)) values.push(label);
  };
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  add(payload.outcome);
  for (const key of ["outcomes", "results"]) {
    for (const item of outcomeCollectionValues(payload[key])) add(outcomeValue(item));
  }
  for (const target of Array.isArray(payload.targets) ? payload.targets : []) add(target?.outcome);
  for (const attack of Array.isArray(payload.attacks) ? payload.attacks : []) {
    add(attack?.attackOutcome || attack?.outcome);
  }
  const causality = eventCausality(event);
  add(causality?.action?.attackOutcome);
  for (const target of Array.isArray(causality?.targets) ? causality.targets : []) add(target?.outcome);
  return values;
}

function explicitDamageLines(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const causality = eventCausality(event);
  const lines = [];
  const total = finiteNumber(payload.damage);
  if (total !== null && total > 0) lines.push(`${numberText(total)} danni`);
  const legacyRoll = finiteNumber(payload.damageRoll);
  if (legacyRoll !== null && legacyRoll > 0 && total !== 0) {
    lines.push(`Tiro del danno: ${numberText(legacyRoll)}`);
  }
  for (const target of Array.isArray(payload.targets) ? payload.targets : []) {
    const damage = finiteNumber(target?.damage);
    if (damage !== null && damage > 0) lines.push(`${targetName(target)}: ${numberText(damage)} danni`);
  }
  const causalRoll = finiteNumber(causality?.action?.damageRoll);
  if (causalRoll !== null && legacyRoll === null && causalRoll > 0 && total !== 0) {
    lines.push(`Tiro del danno: ${numberText(causalRoll)}`);
  }
  for (const target of Array.isArray(causality?.targets) ? causality.targets : []) {
    const name = targetName(target);
    const requested = finiteNumber(target?.requestedDamage);
    const applied = finiteNumber(target?.appliedHpDelta);
    if (
      requested !== null
      && requested > 0
      && target?.outcome !== "passed"
      && target?.outcome !== "immune"
      && target?.damageFactor !== 0
      && target?.damageFactor !== "zero"
    ) {
      lines.push(`${name}: ${numberText(requested)} danni richiesti`);
    }
    if (applied !== null && applied !== 0) lines.push(`${name}: ${signedNumber(applied)} HP applicati`);
  }
  return [...new Set(lines)];
}

function explicitContextLines(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const causality = eventCausality(event);
  const lines = [];
  const legacySpellName = stringValue(payload.spellName || payload.spell?.name);
  const legacyCasterName = stringValue(payload.casterName || payload.caster?.name);
  const spellName = legacySpellName || stringValue(causality?.cause?.spellName);
  const casterName = legacyCasterName || stringValue(causality?.actor?.name);
  const explicitSource = stringValue(payload.sourceName || payload.causeName);
  if (spellName) lines.push(`Incantesimo: ${spellName}`);
  if (legacyCasterName) lines.push(`Caster: ${casterName}`);
  else if (casterName) lines.push(`Incantatore: ${casterName}`);
  if (explicitSource) lines.push(`Fonte esplicita: ${explicitSource}`);
  const causalSourceKnown = !!(
    causality?.cause?.spellId
    || causality?.cause?.spellName
    || causality?.actor?.id
    || causality?.actor?.name
  );
  if ((event?.category === "hp" || hpTargets(event).length)
    && !casterName
    && !explicitSource
    && !causalSourceKnown) {
    lines.push("Fonte: non tracciata");
  }
  return lines;
}

function causalityDetailLines(event) {
  const causality = eventCausality(event);
  if (!causality) return [];
  const lines = [];
  if (causality.cause?.slotLevel !== undefined) {
    lines.push(`Livello slot: ${numberText(causality.cause.slotLevel)}`);
  }
  if (causality.phase) lines.push(`Fase: ${causality.phase}`);
  if (causality.action?.label) lines.push(`Azione: ${causality.action.label}`);
  if (causality.action?.attackOutcome) {
    lines.push(`Esito attacco: ${outcomeLabel(causality.action.attackOutcome)}`);
  }
  if (causality.concentration?.action) {
    const labels = { start: "avviata", continue: "proseguita", end: "terminata", break: "interrotta" };
    lines.push(`Concentrazione: ${labels[causality.concentration.action] || causality.concentration.action}`);
  }
  if (causality.zone?.action) lines.push(`Zona: ${causality.zone.action}`);
  for (const target of Array.isArray(causality.targets) ? causality.targets : []) {
    const targetLines = [];
    if (target.outcome) targetLines.push(outcomeLabel(target.outcome));
    if (
      finiteNumber(target.requestedDamage) !== null
      && target.requestedDamage > 0
      && target.outcome !== "passed"
      && target.outcome !== "immune"
      && target.damageFactor !== 0
      && target.damageFactor !== "zero"
    ) {
      targetLines.push(`${numberText(target.requestedDamage)} richiesti`);
    }
    if (finiteNumber(target.appliedHpDelta) !== null && target.appliedHpDelta !== 0) {
      targetLines.push(`${signedNumber(target.appliedHpDelta)} HP applicati`);
    }
    if (finiteNumber(target.damageFactor) !== null && target.damageFactor > 0) {
      targetLines.push(`fattore ${numberText(target.damageFactor)}`);
    }
    if (targetLines.length) lines.push(`${targetName(target)}: ${targetLines.join(", ")}`);
    else if (target?.name) lines.push(targetName(target));
  }
  return lines;
}

function eventSummary(event, targets, outcomes) {
  const category = event.category;
  const hpLines = hpTargets(event).map(hpTargetLine);
  const facetLines = ["conditions", "spells", "concentrations"]
    .flatMap((field) => facetChangeLines(event?.facets?.[field], field));
  if (category === "hp") {
    const lines = [...hpLines, ...facetLines];
    return lines.join(" · ") || "Variazione HP registrata";
  }
  if (category === "movement") {
    const movement = targets.map((target) => `${target.name}: ${numberText(target.cells)} caselle`);
    return movement.join(" · ") || "Movimento registrato";
  }
  if (category === "save") {
    const outcomeText = outcomes.join(", ");
    const targetText = targets.map((target) => target.name).join(", ");
    const damageText = explicitDamageLines(event).join(", ");
    const facetText = facetLines.join(", ");
    return [outcomeText, targetText, facetText, damageText].filter(Boolean).join(" · ") || "Risoluzione tiro salvezza";
  }
  if (category === "note") return stringValue(event?.payload?.text) || "Nota manuale";
  if (category === "undo") return stringValue(event?.payload?.description) || "Azioni annullate";
  if (category === "turn") return targets.map((target) => target.name).join(", ") || stringValue(event?.payload?.actorName) || "Cambio turno";
  if (category === "roster") return targets.map((target) => target.name).join(", ") || "Aggiornamento incontro";
  if (hpLines.length || facetLines.length) return [...hpLines, ...facetLines].join(" · ");
  if (targets.length) return targets.map((target) => target.name).join(", ");
  return stringValue(event?.label) || getCombatLogCategoryMeta(category).label;
}

function detailSections(event, targets, outcomes, turnName) {
  const sections = [];
  const hpLines = hpTargets(event).map(hpTargetLine);
  if (hpLines.length) sections.push({ label: "HP", lines: hpLines });
  for (const [field, label] of [
    ["conditions", "Condizioni"],
    ["spells", "Incantesimi"],
    ["concentrations", "Concentrazione"],
  ]) {
    const lines = facetChangeLines(event?.facets?.[field], field);
    if (lines.length) sections.push({ label, lines });
  }
  if (outcomes.length) sections.push({ label: "Esito", lines: outcomes });
  const causalityLines = causalityDetailLines(event);
  if (causalityLines.length) sections.push({ label: "Causalità", lines: causalityLines });
  const damageLines = explicitDamageLines(event);
  if (damageLines.length) sections.push({ label: "Danno esplicito", lines: damageLines });
  const contextLines = explicitContextLines(event);
  if (contextLines.length) sections.push({ label: "Contesto", lines: contextLines });
  if (turnName && turnName !== "Fuori turno") {
    sections.push({ label: "Turno", lines: [`Durante il turno di ${turnName}`] });
  }
  if (event?.category === "movement" && (
    event?.payload?.movementCorrection
    || event?.payload?.nativeUndo
    || targets.some((target) => Number(target?.cells) < 0)
  )) {
    const correctionSource = String(event?.payload?.undoSource || "").trim();
    const correctionLabel = correctionSource === "history"
      ? "Correzione da Undo della Cronologia"
      : correctionSource === "obr-native"
        ? "Correzione da Undo OBR"
        : "Correzione movimento registrata";
    sections.push({ label: "Undo", lines: [correctionLabel] });
  }
  if (event?.source) {
    sections.push({
      label: "Registrazione",
      lines: [event.category === "note" && event.source === "manual" ? "Nota manuale" : event.source === "manual" ? "Manuale" : "Automatica"],
    });
  }
  return sections;
}

function projectedEvent(rawEvent, index) {
  const event = normalizeCombatLogEvent(rawEvent);
  const category = COMBAT_LOG_CATEGORY_ORDER.includes(String(event.category)) ? String(event.category) : "other";
  const meta = getCombatLogCategoryMeta(category);
  const context = turnContext(event);
  const causality = eventCausality(event);
  const targets = uniqueTargets(mergePresentationTargets(event, causality));
  const outcomes = collectOutcomes(event);
  const title = stringValue(event.label) || meta.label;
  const summary = eventSummary({ ...event, category }, targets, outcomes);
  const details = detailSections({ ...event, category }, targets, outcomes, context.turnName);
  const sequence = positiveInteger(event.sequence, index + 1);
  const at = finiteNumber(event.at);
  const id = stringValue(event.id) || `event:${sequence}:${at ?? "na"}:${index}`;
  const technical = {
    version: Number(event.version) || 1,
    kind: stringValue(event.kind) || "change",
    source: stringValue(event.source) || "automatic",
    historyEntryId: stringValue(event.historyEntryId) || null,
    commandId: stringValue(event.commandId) || null,
    correlationId: stringValue(event.correlationId) || null,
    causality: {
      instanceId: stringValue(causality?.cause?.instanceId) || null,
      actionId: stringValue(causality?.action?.id) || null,
      reminderActivationId: stringValue(causality?.reminder?.activationId) || null,
    },
  };
  const detailText = details.flatMap((section) => section.lines).join(" ");
  const searchableText = [
    title,
    meta.label,
    summary,
    context.turnName,
    targets.map((target) => target.name).join(" "),
    outcomes.join(" "),
    detailText,
    causality?.cause?.spellName || "",
    causality?.actor?.name || "",
    causality?.phase || "",
    causality?.action?.label || "",
    causality?.concentration?.action || "",
    safeJson(event.payload),
  ].join(" ");
  return {
    id,
    sequence,
    at,
    round: positiveInteger(event.round),
    turnKey: context.turnKey,
    turnName: context.turnName,
    turn: context.turn,
    category,
    categoryLabel: meta.label,
    tone: meta.tone,
    kind: technical.kind,
    title,
    summary,
    details,
    targets,
    outcomes,
    causality,
    searchableText,
    technical,
    boundary: category === "turn" || category === "round",
  };
}

function groupEvents(events) {
  const rounds = new Map();
  for (const event of events) {
    let round = rounds.get(event.round);
    if (!round) {
      round = { round: event.round, turns: [] };
      rounds.set(event.round, round);
    }
    let turn = round.turns.find((candidate) => candidate.turnKey === event.turnKey);
    if (!turn) {
      turn = {
        turnKey: event.turnKey,
        turnName: event.turnName,
        events: [],
      };
      round.turns.push(turn);
    }
    turn.events.push(event);
  }
  const groups = [...rounds.values()].sort((a, b) => a.round - b.round);
  for (const round of groups) {
    round.turns.sort((a, b) => (a.events[0]?.sequence || 0) - (b.events[0]?.sequence || 0));
    for (const turn of round.turns) turn.events.sort((a, b) => a.sequence - b.sequence);
  }
  return groups;
}

function buildSummary(session, events, groups) {
  const rounds = [...new Set(events.map((event) => event.round))].sort((a, b) => a - b);
  const turns = [...new Map(events
    .filter((event) => event.turnKey !== NO_TURN_KEY)
    .map((event) => [event.turnKey, { key: event.turnKey, name: event.turnName }])).values()];
  const participants = uniqueByName(events.flatMap((event) => [
    ...event.targets,
    ...(event.causality?.actor?.name ? [{ name: event.causality.actor.name }] : []),
    ...(event.turnName !== "Fuori turno" ? [{ name: event.turnName }] : []),
  ]));
  const categoryCounts = Object.fromEntries(COMBAT_LOG_CATEGORY_ORDER.map((category) => [
    category,
    events.filter((event) => event.category === category).length,
  ]).filter(([, count]) => count > 0));
  const timestamps = events.map((event) => event.at).filter((value) => value !== null).sort((a, b) => a - b);
  return {
    hasSession: Boolean(session?.id),
    sessionId: stringValue(session?.id) || null,
    sessionName: stringValue(session?.name) || "Nessun registro attivo",
    startedAt: finiteNumber(session?.startedAt),
    firstEventAt: timestamps[0] ?? null,
    lastEventAt: timestamps.at(-1) ?? null,
    totalEvents: events.length,
    roundCount: rounds.length,
    rounds,
    turnCount: turns.length,
    turns,
    participantCount: participants.length,
    participants: participants.map((participant) => participant.name),
    categoryCounts,
    outOfTurnEvents: events.filter((event) => event.turnKey === NO_TURN_KEY).length,
    groupCount: groups.length,
    localStorageLabel: "Locale a questo browser GM",
  };
}

export function buildCombatLogPresentation(session, rawEvents = []) {
  const normalizedEvents = aggregateCombatLogEvents(Array.isArray(rawEvents) ? rawEvents : [])
    .map((event, index) => projectedEvent(event, index));
  const groups = groupEvents(normalizedEvents);
  const sessionSummary = buildSummary(session, normalizedEvents, groups);
  const availableCategories = COMBAT_LOG_CATEGORY_ORDER
    .filter((category) => sessionSummary.categoryCounts[category])
    .map((category) => ({
      value: category,
      label: getCombatLogCategoryMeta(category).label,
      count: sessionSummary.categoryCounts[category],
    }));
  const availableOutcomes = [...new Set(normalizedEvents.flatMap((event) => event.outcomes))]
    .sort((a, b) => a.localeCompare(b, "it"))
    .map((value) => ({ value, label: value }));
  return {
    sessionSummary,
    groups,
    events: normalizedEvents,
    participants: sessionSummary.participants,
    availableCategories,
    availableOutcomes,
  };
}

function matchesParticipant(event, participant) {
  if (!participant) return true;
  const wanted = normalizePresentationSearch(participant);
  return event.targets.some((target) => normalizePresentationSearch(target.name) === wanted)
    || normalizePresentationSearch(event.causality?.actor?.name) === wanted
    || normalizePresentationSearch(event.turnName) === wanted;
}

export function filterCombatLogPresentation(presentation, filters = {}) {
  const normalizedFilters = {
    query: normalizePresentationSearch(filters.query),
    category: stringValue(filters.category),
    participant: stringValue(filters.participant),
    outcome: stringValue(filters.outcome),
  };
  const matches = presentation?.events?.filter((event) => {
    if (normalizedFilters.category && event.category !== normalizedFilters.category) return false;
    if (normalizedFilters.participant && !matchesParticipant(event, normalizedFilters.participant)) return false;
    if (normalizedFilters.outcome && !event.outcomes.includes(normalizedFilters.outcome)) return false;
    if (normalizedFilters.query && !normalizePresentationSearch(event.searchableText).includes(normalizedFilters.query)) return false;
    return true;
  }) || [];
  const groups = groupEvents(matches);
  return {
    ...presentation,
    filters: normalizedFilters,
    groups,
    events: matches,
    sessionSummary: {
      ...presentation.sessionSummary,
      visibleEvents: matches.length,
      totalEvents: presentation?.sessionSummary?.totalEvents || 0,
    },
  };
}

export function formatCombatLogTimestamp(value, { timeOnly = false } = {}) {
  const timestamp = finiteNumber(value);
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleString("it-IT", timeOnly
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { dateStyle: "short", timeStyle: "short" });
}

function formatInterval(summary) {
  if (summary?.firstEventAt === null || summary?.lastEventAt === null) return "nessun evento";
  return `${formatCombatLogTimestamp(summary.firstEventAt)} – ${formatCombatLogTimestamp(summary.lastEventAt)}`;
}

export function serializeCombatLogPresentationText(session, presentation) {
  const model = presentation?.groups ? presentation : buildCombatLogPresentation(session, presentation?.events || []);
  const summary = model.sessionSummary;
  const lines = [
    `Registro combattimento: ${summary.sessionName}`,
    `Storage: ${summary.localStorageLabel}`,
    `Inizio: ${formatCombatLogTimestamp(summary.startedAt)}`,
    `Intervallo: ${formatInterval(summary)}`,
    `Eventi: ${summary.totalEvents}`,
    "",
  ];
  for (const round of model.groups) {
    lines.push(`ROUND ${round.round}`);
    for (const turn of round.turns) {
      lines.push(`  TURNO: ${turn.turnName}`);
      for (const event of turn.events) {
        const time = formatCombatLogTimestamp(event.at, { timeOnly: true });
        lines.push(`    [${time}] ${event.title} · ${event.categoryLabel}`);
        if (event.summary) lines.push(`      ${event.summary}`);
        for (const section of event.details) {
          for (const line of section.lines) lines.push(`      ${section.label}: ${line}`);
        }
      }
    }
    lines.push("");
  }
  if (!model.groups.length) lines.push("Nessun evento registrato.");
  return lines.join("\n").trimEnd();
}

export { NO_TURN_KEY };
