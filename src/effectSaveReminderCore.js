import { ID } from "./constants.js";
import { initiativeTurnKeyAtOrdinal } from "./turnBoundaryCore.js";
import { fleshToStoneReminderForInstance } from "./fleshToStoneRules.js";
import {
  buildEffectSaveReminderResolution,
  buildMovementEscapeReminderResolution,
  buildDeferredEffectResolution,
  normalizeReminderResolution,
  REMINDER_RESOLUTIONS_FIELD,
} from "./reminderResolutionCore.js";
import { normalizeDeferredEffects } from "./spellLifecycleContracts.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;
const TIMINGS = new Set(["turn-start", "turn-end", "damage"]);
const CONCENTRATION_TURN_REMINDERS = Object.freeze({});
const ABILITIES = Object.freeze({
  str: Object.freeze({ key: "str", label: "Forza", short: "FOR" }),
  dex: Object.freeze({ key: "dex", label: "Destrezza", short: "DES" }),
  con: Object.freeze({ key: "con", label: "Costituzione", short: "COS" }),
  int: Object.freeze({ key: "int", label: "Intelligenza", short: "INT" }),
  wis: Object.freeze({ key: "wis", label: "Saggezza", short: "SAG" }),
  cha: Object.freeze({ key: "cha", label: "Carisma", short: "CAR" }),
});
const ABILITY_ALIASES = new Map([
  ["str", "str"], ["strength", "str"], ["for", "str"], ["forza", "str"],
  ["dex", "dex"], ["dexterity", "dex"], ["des", "dex"], ["destrezza", "dex"],
  ["con", "con"], ["constitution", "con"], ["cos", "con"], ["costituzione", "con"],
  ["int", "int"], ["intelligence", "int"], ["intelligenza", "int"],
  ["wis", "wis"], ["wisdom", "wis"], ["sag", "wis"], ["saggezza", "wis"],
  ["cha", "cha"], ["charisma", "cha"], ["car", "cha"], ["carisma", "cha"],
]);

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

function normalizedAbility(value) {
  const alias = String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return ABILITIES[ABILITY_ALIASES.get(alias)] || null;
}

function optionalDC(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(99, Math.round(number)));
}

export function normalizeEffectSaveReminder(value) {
  if (!value || typeof value !== "object") return null;
  const ability = normalizedAbility(value.ability);
  const timing = String(value.timing || value.event || "").trim();
  const damage = value.damage && typeof value.damage === "object"
    ? {
      ...value.damage,
      ...(value.damage.dice ? { dice: String(value.damage.dice).trim().slice(0, 80) } : {}),
      ...(value.damage.type ? { type: String(value.damage.type).trim().slice(0, 80) } : {}),
      ...(Number.isInteger(Number(value.damage.baseSlot)) && Number(value.damage.baseSlot) >= 0
        ? { baseSlot: Number(value.damage.baseSlot) }
        : {}),
      ...(Number.isInteger(Number(value.damage.additionalPerSlotAbove)) && Number(value.damage.additionalPerSlotAbove) > 0
        ? { additionalPerSlotAbove: Number(value.damage.additionalPerSlotAbove) }
        : {}),
    }
    : null;
  const hasValidDamage = !!(damage?.dice && damage?.type);
  const mode = ["manual-damage", "consume", "manual-heal", "choice"].includes(value.mode)
    ? value.mode
    : (!ability && hasValidDamage ? "manual-damage" : "");
  const informational = mode === "consume";
  if ((!ability && !hasValidDamage && !informational) || !TIMINGS.has(timing)) return null;
  const dc = optionalDC(value.dc);
  const dcSource = value.dcSource === "source-spell" ? "source-spell" : "";
  const resolution = normalizeReminderResolution(value.resolution);
  return {
    ...(ability ? { ability: ability.key } : {}),
    timing,
    actor: value.actor === "source" ? "source" : "target",
    ...(mode ? { mode } : {}),
    ...(ability ? { success: value.success === "keep-effect" ? "keep-effect" : "remove-effect" } : {}),
    ...(dc !== null ? { dc } : {}),
    ...(dcSource ? { dcSource } : {}),
    ...(value.label ? { label: String(value.label).trim().slice(0, 160) } : {}),
    ...(value.failure ? {
      failure: String(value.failure).trim().slice(0, 160),
    } : {}),
    ...(hasValidDamage ? { damage } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

export function normalizeEffectSaveReminders(value) {
  const reminders = (Array.isArray(value) ? value : [value])
    .map(normalizeEffectSaveReminder)
    .filter(Boolean);
  const unique = new Map(reminders.map((reminder) => [
    `${reminder.timing}:${reminder.actor}`,
    reminder,
  ]));
  return [...unique.values()];
}

function conditionInstances(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  if (Array.isArray(conditions)) return conditions;
  return Array.isArray(conditions?.instances) ? conditions.instances : [];
}

function spellInstances(item) {
  const spells = item?.metadata?.[META_KEY]?.[`${ID}/spells`];
  return Array.isArray(spells) ? spells : [];
}

function normalizedConditionKey(value) {
  return String(value?.condition || value?.name || value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const FREEDOM_OF_MOVEMENT_KEYS = new Set([
  "freedom-of-movement",
  "freedom of movement",
  "liberta di movimento",
]);

function freedomEscapeDefinition(item) {
  const condition = conditionInstances(item).find((instance) =>
    instance?.active !== false
      && instance?.mechanics?.movement?.escape
      && typeof instance.mechanics.movement.escape === "object"
  );
  if (condition) {
    return {
      instance: condition,
      escape: condition.mechanics.movement.escape,
    };
  }

  const spell = spellInstances(item).find((entry) =>
    FREEDOM_OF_MOVEMENT_KEYS.has(String(entry?.spellId || "").trim().toLocaleLowerCase("it"))
    || FREEDOM_OF_MOVEMENT_KEYS.has(normalizedConditionKey(entry?.name))
  );
  return spell
    ? {
      instance: {
        id: `spell:${String(spell.instanceId || spell.id || "freedom-of-movement")}`,
        appliedAt: spell.appliedAt,
      },
      escape: {
        costMeters: 1.5,
        conditions: ["Afferrato", "Trattenuto"],
        prompt: "Spendere 1,5 m di movimento per liberarsi?",
      },
    }
    : null;
}

function magicalRestriction(instance) {
  const type = String(instance?.type || instance?.effectType || "")
    .trim()
    .toLocaleLowerCase("it");
  return instance?.magical === true
    || instance?.mechanics?.magical === true
    || String(instance?.sourceType || "").trim().toLocaleLowerCase("it") === "spell"
    || type === "spell"
    || type === "spell-effect";
}

function freedomEscapeNoticesForTiming({
  item,
  timing,
  boundaryActorId,
  eventKey,
  noticeTurnKey,
}) {
  if (timing !== "turn-start" || String(item?.id || "") !== boundaryActorId) return [];
  const definition = freedomEscapeDefinition(item);
  if (!definition) return [];
  if (String(definition.instance?.appliedAt?.turnKey || "").trim() === eventKey) return [];

  const cost = Number(definition.escape?.costMeters);
  const conditionKeys = new Set(
    (Array.isArray(definition.escape?.conditions) ? definition.escape.conditions : [])
      .map(normalizedConditionKey)
      .filter(Boolean),
  );
  if (!Number.isFinite(cost) || cost <= 0 || !conditionKeys.size) return [];

  return conditionInstances(item)
    .filter((restriction) => (
      restriction?.active !== false
      && restriction?.id
      && conditionKeys.has(normalizedConditionKey(restriction))
      && !magicalRestriction(restriction)
    ))
    .map((restriction) => {
      const activationId = `${item.id}:${restriction.id}:movement-escape:${eventKey}`;
      const resolutions = item?.metadata?.[META_KEY]?.[REMINDER_RESOLUTIONS_FIELD];
      if (
        resolutions
        && typeof resolutions === "object"
        && Object.prototype.hasOwnProperty.call(resolutions, activationId)
      ) return null;
      const conditionName = String(restriction.condition || restriction.name || "restrizione")
        .trim() || "restrizione";
      const defaultPrompt = `Spendere ${String(cost).replace(".", ",")} m di movimento per liberarsi da ${conditionName}?`;
      const configuredPrompt = String(definition.escape?.prompt || "").trim();
      const instruction = configuredPrompt
        ? configuredPrompt.replace(/\?\s*$/u, ` da ${conditionName}?`)
        : defaultPrompt;
      const resolution = buildMovementEscapeReminderResolution({
        targetId: item.id,
        restrictionInstanceId: restriction.id,
        activationId,
        turnKey: noticeTurnKey,
        costMeters: cost,
      });
      if (!resolution) return null;
      return {
        activationId,
        turnKey: noticeTurnKey,
        effectName: "Libertà di movimento",
        saveLabel: `Movimento ${String(cost).replace(".", ",")} m`,
        instruction,
        timing,
        kind: "effect-reminder",
        eyebrow: "Libertà di movimento",
        resolution,
        target: {
          id: item.id,
          name: String(item.name || "Token").trim().slice(0, 100) || "Token",
          portrait: itemPortrait(item),
        },
      };
    })
    .filter(Boolean);
}

function concentrationEntries(item) {
  const concentrations = item?.metadata?.[META_KEY]?.[CONC_META_KEY];
  return concentrations && typeof concentrations === "object"
    ? Object.entries(concentrations)
    : [];
}

function concentrationTurnReminder(key, entry) {
  const candidates = [
    entry?.spellId,
    key,
    entry?.name,
  ].map((value) => String(value || "").trim().toLocaleLowerCase("it"));
  return candidates
    .map((candidate) => CONCENTRATION_TURN_REMINDERS[candidate])
    .find(Boolean) || null;
}

export function effectSaveReminderSourceIds(items = []) {
  return uniqueIds((Array.isArray(items) ? items : []).flatMap((item) => (
    conditionInstances(item)
      .filter((instance) => (
        instance?.active !== false
        && normalizeEffectSaveReminders(instance?.saveReminder)
          .some((reminder) => reminder.dcSource === "source-spell")
      ))
      .map((instance) => instance?.sourceId)
  )));
}

function itemPortrait(item) {
  return String(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url
    || ""
  ).trim().slice(0, 2048);
}

function actorId(value) {
  const id = String(value || "").trim();
  if (!id || id === "__LAIR__" || id.startsWith("__EPIC__")) return "";
  return id.replace(/::p\d+$/, "");
}

function stateSnapshot(state) {
  const order = Array.isArray(state?.order) ? state.order.map(String) : [];
  if (!order.length) return null;
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)),
  );
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return { order, current, round };
}

function currentTurnStartBoundary(state) {
  const current = stateSnapshot(state);
  if (!current) return null;
  const currentActorId = actorId(current.order[current.current]);
  if (!currentActorId) return null;
  const ordinal = ((current.round - 1) * current.order.length) + current.current;
  return {
    timing: "turn-start",
    actorId: currentActorId,
    turnKey: initiativeTurnKeyAtOrdinal(current.order, ordinal),
    noticeTurnKey: initiativeTurnKeyAtOrdinal(current.order, ordinal),
  };
}

export function effectSaveReminderBoundaries(previousState, nextState) {
  const previous = stateSnapshot(previousState);
  const next = stateSnapshot(nextState);
  if (!previous || !next || previous.order.length !== next.order.length) return [];
  if (previous.order.some((id, index) => id !== next.order[index])) return [];
  const length = next.order.length;
  const previousOrdinal = ((previous.round - 1) * length) + previous.current;
  const nextOrdinal = ((next.round - 1) * length) + next.current;
  const distance = nextOrdinal - previousOrdinal;
  if (distance <= 0 || distance > 1000) return [];

  const boundaries = [];
  for (let ordinal = previousOrdinal; ordinal < nextOrdinal; ordinal += 1) {
    const endingActorId = actorId(next.order[ordinal % length]);
    const startingActorId = actorId(next.order[(ordinal + 1) % length]);
    const endingTurnKey = initiativeTurnKeyAtOrdinal(next.order, ordinal);
    const startingTurnKey = initiativeTurnKeyAtOrdinal(next.order, ordinal + 1);
    if (endingActorId) {
      boundaries.push({
        timing: "turn-end",
        actorId: endingActorId,
        turnKey: endingTurnKey,
        noticeTurnKey: startingTurnKey,
      });
    }
    if (startingActorId) {
      boundaries.push({
        timing: "turn-start",
        actorId: startingActorId,
        turnKey: startingTurnKey,
        noticeTurnKey: startingTurnKey,
      });
    }
  }
  return boundaries;
}

function spellSaveDC(item) {
  return optionalDC(
    item?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC,
  );
}

function reminderDC(reminder, instance, itemsById) {
  const explicit = optionalDC(reminder.dc);
  if (explicit !== null) return explicit;
  if (reminder.dcSource !== "source-spell") return null;
  return spellSaveDC(itemsById.get(String(instance?.sourceId || "").trim()));
}

function reminderNotice({
  item,
  instance,
  reminder,
  activationId,
  turnKey,
  itemsById,
}) {
  const ability = ABILITIES[reminder.ability];
  const hasDamageOnly = !ability && !!(reminder.damage?.dice && reminder.damage?.type);
  const informational = !ability && !hasDamageOnly && reminder.mode === "consume";
  if (!item?.id || !instance?.id || (!ability && !hasDamageOnly && !informational) || !activationId) return null;
  const dc = ability ? reminderDC(reminder, instance, itemsById) : null;
  const sourceName = String(
    itemsById.get(String(instance?.sourceId || "").trim())?.name
    || instance?.sourceName
    || ""
  ).trim().slice(0, 100);
  const effectName = String(
    instance.condition || instance.name || instance.effectDetail || "Effetto"
  ).trim().slice(0, 120) || "Effetto";
  const spellName = String(
    instance.spellName
    || (instance.type === "spell" && instance.name ? instance.name : "")
    || ""
  ).trim().slice(0, 120);
  const spellId = String(instance.spellId || "").trim().slice(0, 120);
  const saveLabel = ability
    ? `TS ${ability.label}${dc === null ? "" : ` CD ${dc}`}`
    : (reminder.damage?.dice
      ? `Danni (${reminder.damage.dice})`
      : (reminder.label || "Promemoria effetto"));
  const instruction = reminder.label || (
    ability
      ? (reminder.success === "remove-effect"
        ? "In caso di successo rimuovi l'effetto."
        : "Risolvi il tiro e mantieni l'effetto.")
      : "Inserisci i danni e conferma."
  );
  const parentSpell = spellInstances(item).find((s) => s.instanceId === instance.parentEffectId);
  const slotLevelCandidate = Number(instance?.slotLevel ?? parentSpell?.castContext?.slotLevel ?? parentSpell?.slotLevel);
  const slotLevel = Number.isInteger(slotLevelCandidate) && slotLevelCandidate >= 0 ? slotLevelCandidate : null;
  const resolution = buildEffectSaveReminderResolution({
    item,
    instance,
    reminder,
    dc,
    activationId,
    turnKey,
    slotLevel,
  });
  return {
    activationId,
    turnKey,
    effectName,
    ...(spellName ? { spellName } : {}),
    ...(spellId ? { spellId } : {}),
    saveLabel,
    instruction,
    timing: reminder.timing,
    ...(ability ? { ability: ability.short } : {}),
    ...(dc !== null ? { dc } : {}),
    ...(sourceName ? { sourceName } : {}),
    kind: ability ? "effect-save" : "effect-reminder",
    ...(ability ? {} : { eyebrow: informational ? "Promemoria effetto" : "Danno continuo" }),
    ...(resolution ? { resolution } : {}),
    target: {
      id: item.id,
      name: String(item.name || "Token").trim().slice(0, 100) || "Token",
      portrait: itemPortrait(item),
    },
  };
}

function deferredEffectNotice({
  item,
  instance,
  deferredEffect,
  activationId,
  turnKey,
  itemsById,
}) {
  if (!item?.id || !instance?.id || !deferredEffect?.id || !activationId) return null;
  const save = deferredEffect.save && typeof deferredEffect.save === "object"
    ? deferredEffect.save
    : null;
  const ability = save ? ABILITIES[String(save.ability || "").trim().toLowerCase()] : null;
  const dc = save ? optionalDC(save.dc) : null;
  const source = deferredEffect.provenance || {};
  const sourceName = String(
    itemsById.get(String(instance?.sourceId || source.casterId || "").trim())?.name
      || source.casterName
      || instance?.sourceName
      || ""
  ).trim().slice(0, 100);
  const effectName = String(
    instance.condition || instance.name || deferredEffect.reminder || "Effetto"
  ).trim().slice(0, 120) || "Effetto";
  const saveLabel = ability
    ? `TS ${ability.label}${dc === null ? "" : ` CD ${dc}`}`
    : deferredEffect.reminder;
  const resolution = buildDeferredEffectResolution({
    item,
    instance,
    deferredEffect,
    activationId,
    turnKey,
  });
  return {
    activationId,
    turnKey,
    effectName,
    saveLabel,
    instruction: deferredEffect.reminder,
    ...(deferredEffect.timing !== "immediate"
      ? { timing: deferredEffect.timing }
      : {}),
    ...(ability ? { ability: ability.short } : {}),
    ...(dc !== null ? { dc } : {}),
    ...(sourceName ? { sourceName } : {}),
    kind: ability ? "effect-save" : "effect-reminder",
    eyebrow: ability ? "Tiro salvezza differito" : "Promemoria effetto",
    ...(resolution ? { resolution } : {}),
    target: {
      id: item.id,
      name: String(item.name || "Token").trim().slice(0, 100) || "Token",
      portrait: itemPortrait(item),
    },
  };
}

function noticesForTiming(
  items,
  itemsById,
  timing,
  boundaryActorId,
  eventKey,
  noticeTurnKey = eventKey,
) {
  const notices = [];
  for (const item of Array.isArray(items) ? items : []) {
    notices.push(...freedomEscapeNoticesForTiming({
      item,
      timing,
      boundaryActorId,
      eventKey,
      noticeTurnKey,
    }));
    for (const instance of conditionInstances(item)) {
      if (instance?.active === false || !instance?.id) continue;
      for (const normalizedReminder of normalizeEffectSaveReminders(
        instance.saveReminder,
      )) {
        const reminder = fleshToStoneReminderForInstance({
          instance,
          conditions: conditionInstances(item),
          reminder: normalizedReminder,
        });
        if (reminder.timing !== timing) continue;
        const wantedActorId = reminder.actor === "source"
          ? actorId(instance.sourceId)
          : String(item.id || "").trim();
        if (!wantedActorId || wantedActorId !== boundaryActorId) continue;
        if (
          timing === "turn-start"
          && String(instance?.appliedAt?.turnKey || "").trim() === eventKey
        ) {
          continue;
        }
        const activationId = `${instance.id}:${timing}:${eventKey}`;
        const resolutions = item?.metadata?.[META_KEY]?.[REMINDER_RESOLUTIONS_FIELD];
        if (
          resolutions
          && typeof resolutions === "object"
          && Object.prototype.hasOwnProperty.call(resolutions, activationId)
        ) continue;
        const notice = reminderNotice({
          item,
          instance,
          reminder,
          activationId,
          turnKey: noticeTurnKey,
          itemsById,
        });
        if (notice) notices.push(notice);
      }
      for (const deferredEffect of normalizeDeferredEffects(
        instance.deferredEffects ?? instance.deferredEffect,
      )) {
        if (deferredEffect.timing !== timing) continue;
        const wantedActorId = deferredEffect.actor === "source"
          ? actorId(deferredEffect.provenance?.casterId || instance.sourceId)
          : String(item.id || "").trim();
        if (timing !== "immediate" && (!wantedActorId || wantedActorId !== boundaryActorId)) continue;
        if (
          deferredEffect.anchor === "next-turn"
          && String(instance?.appliedAt?.turnKey || "").trim() === eventKey
        ) continue;
        const activationId = `${item.id}:${instance.id}:deferred:${deferredEffect.id}:${timing}:${eventKey}`;
        const resolutions = item?.metadata?.[META_KEY]?.[REMINDER_RESOLUTIONS_FIELD];
        if (
          resolutions
          && typeof resolutions === "object"
          && Object.prototype.hasOwnProperty.call(resolutions, activationId)
        ) continue;
        const notice = deferredEffectNotice({
          item,
          instance,
          deferredEffect,
          activationId,
          turnKey: noticeTurnKey,
          itemsById,
        });
        if (notice) notices.push(notice);
      }
    }
  }
  return notices;
}

function concentrationNoticesForTiming(
  items,
  timing,
  boundaryActorId,
  eventKey,
  noticeTurnKey = eventKey,
) {
  if (timing !== "turn-start") return [];
  const caster = (Array.isArray(items) ? items : []).find(
    (item) => actorId(item?.id) === boundaryActorId,
  );
  if (!caster?.id) return [];

  const notices = [];
  for (const [key, entry] of concentrationEntries(caster)) {
    const reminder = concentrationTurnReminder(key, entry);
    if (!reminder) continue;
    if (String(entry?.appliedAt?.turnKey || "").trim() === eventKey) continue;
    const reference = String(entry?.instanceId || key).trim();
    if (!reference) continue;
    notices.push({
      activationId: `${reference}:concentration-reminder:${eventKey}`,
      turnKey: noticeTurnKey,
      effectName: String(entry?.name || reminder.effectName)
        .trim()
        .slice(0, 120) || reminder.effectName,
      saveLabel: reminder.saveLabel,
      instruction: reminder.instruction,
      timing,
      kind: "effect-reminder",
      eyebrow: "Concentrazione",
      target: {
        id: caster.id,
        name: String(caster.name || "Token").trim().slice(0, 100) || "Token",
        portrait: itemPortrait(caster),
      },
    });
  }
  return notices;
}

export function planEffectSaveReminderNotices({
  items = [],
  previousInitiativeState = null,
  initiativeState = null,
  includeCurrentTurnStart = true,
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const itemsById = new Map(list.map((item) => [String(item?.id || ""), item]));
  const boundaries = effectSaveReminderBoundaries(
    previousInitiativeState,
    initiativeState,
  );
  if (includeCurrentTurnStart) {
    const currentStart = currentTurnStartBoundary(initiativeState);
    if (currentStart) boundaries.push(currentStart);
  }
  const uniqueBoundaries = new Map(boundaries.map((boundary) => [
    `${boundary.timing}:${boundary.actorId}:${boundary.turnKey}`,
    boundary,
  ]));
  const notices = [
    ...noticesForTiming(
      list,
      itemsById,
      "immediate",
      "",
      "immediate",
      "",
    ),
    ...[...uniqueBoundaries.values()].flatMap((boundary) => [
    ...noticesForTiming(
      list,
      itemsById,
      boundary.timing,
      boundary.actorId,
      boundary.turnKey,
      boundary.noticeTurnKey,
    ),
    ...concentrationNoticesForTiming(
      list,
      boundary.timing,
      boundary.actorId,
      boundary.turnKey,
      boundary.noticeTurnKey,
    ),
    ]),
  ];
  return [...new Map(notices.map((notice) => [
    notice.activationId,
    notice,
  ])).values()];
}

export function effectSaveReminderNoticesForDamage({
  items = [],
  damageById = new Map(),
  eventId = Date.now(),
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const itemsById = new Map(list.map((item) => [String(item?.id || ""), item]));
  const damagedIds = uniqueIds(
    typeof damageById?.keys === "function"
      ? [...damageById.keys()]
      : Object.keys(damageById || {}),
  );
  return damagedIds.flatMap((itemId) => noticesForTiming(
    list.filter((item) => item?.id === itemId),
    itemsById,
    "damage",
    itemId,
    String(eventId),
  ));
}

function replayNoticeTarget(item, descriptor = {}) {
  const targetId = String(
    descriptor?.targetId
      || descriptor?.notice?.targets?.[0]?.id
      || descriptor?.notice?.resolution?.target?.id
      || "",
  ).trim();
  if (!item?.id || targetId !== String(item.id)) return null;
  return {
    id: targetId,
    name: String(item.name || descriptor?.notice?.targets?.[0]?.name || "Token")
      .trim()
      .slice(0, 100) || "Token",
    portrait: itemPortrait(item),
  };
}

function replayEffectInstance(item, descriptor = {}) {
  const instanceId = String(
    descriptor?.instanceId
      || descriptor?.notice?.resolution?.effect?.instanceId
      || "",
  ).trim();
  if (!instanceId) return { instanceId: "", instance: null };
  const instances = [
    ...conditionInstances(item),
    ...spellInstances(item),
  ];
  return {
    instanceId,
    instance: instances.find((entry) => String(entry?.id || entry?.instanceId || "").trim() === instanceId)
      || null,
  };
}

/**
 * Rebuilds a historical effect-save notice from current canonical items.
 * The historical descriptor supplies only the activation/resolution shape;
 * target identity, active effect presence and resolution state are checked
 * against the current owner state before a replay is accepted.
 */
export function effectSaveReminderNoticeFromHistoryReplay({
  replay = null,
  items = [],
} = {}) {
  const descriptor = replay?.descriptor && typeof replay.descriptor === "object"
    ? replay.descriptor
    : replay;
  const noticeDescriptor = descriptor?.notice && typeof descriptor.notice === "object"
    ? descriptor.notice
    : descriptor;
  const activationId = String(
    replay?.activationId
      || descriptor?.activationId
      || noticeDescriptor?.activationId
      || "",
  ).trim();
  const targetId = String(
    replay?.targetId
      || descriptor?.targetId
      || noticeDescriptor?.targets?.[0]?.id
      || noticeDescriptor?.resolution?.target?.id
      || "",
  ).trim();
  if (!activationId || !targetId) return null;
  const item = (Array.isArray(items) ? items : [])
    .find((candidate) => String(candidate?.id || "") === targetId);
  const target = replayNoticeTarget(item, { ...descriptor, targetId, notice: noticeDescriptor });
  if (!target) return null;
  const resolutions = item?.metadata?.[META_KEY]?.[REMINDER_RESOLUTIONS_FIELD];
  if (
    resolutions
    && typeof resolutions === "object"
    && Object.prototype.hasOwnProperty.call(resolutions, activationId)
  ) return null;

  const { instanceId, instance } = replayEffectInstance(item, {
    ...descriptor,
    notice: noticeDescriptor,
  });
  if (instanceId && (!instance || instance.active === false)) return null;
  const resolutionValue = noticeDescriptor?.resolution;
  const sourceId = String(
    replay?.sourceId
      || descriptor?.sourceId
      || resolutionValue?.source?.id
      || instance?.sourceId
      || "",
  ).trim();
  const instanceSourceId = String(instance?.sourceId || "").trim();
  if (sourceId && instanceSourceId && sourceId !== instanceSourceId) return null;
  const resolution = normalizeReminderResolution(resolutionValue, {
    targetId,
    sourceId: instanceSourceId || sourceId,
    instanceId,
  });
  if (!resolution) return null;
  const sourceItem = (Array.isArray(items) ? items : [])
    .find((candidate) => String(candidate?.id || "") === (instanceSourceId || sourceId));
  const sourceName = String(
    sourceItem?.name
      || noticeDescriptor?.sourceName
      || "",
  ).trim().slice(0, 100);
  const effectName = String(
    noticeDescriptor?.effectName
      || noticeDescriptor?.spellName
      || instance?.condition
      || instance?.name
      || "Effetto",
  ).trim().slice(0, 120) || "Effetto";
  return {
    activationId,
    ...(String(noticeDescriptor?.turnKey || "").trim()
      ? { turnKey: String(noticeDescriptor.turnKey).trim().slice(0, 300) }
      : {}),
    ...(String(noticeDescriptor?.timing || "").trim()
      ? { timing: String(noticeDescriptor.timing).trim().slice(0, 40) }
      : {}),
    effectName,
    ...(String(noticeDescriptor?.spellName || "").trim()
      ? { spellName: String(noticeDescriptor.spellName).trim().slice(0, 120) }
      : {}),
    saveLabel: String(noticeDescriptor?.saveLabel || "Promemoria effetto")
      .trim().slice(0, 160) || "Promemoria effetto",
    instruction: String(noticeDescriptor?.instruction || noticeDescriptor?.saveLabel || "Risolvi il reminder.")
      .trim().slice(0, 320) || "Risolvi il reminder.",
    ...(String(noticeDescriptor?.ability || "").trim()
      ? { ability: String(noticeDescriptor.ability).trim().slice(0, 20) }
      : {}),
    ...(Number.isFinite(Number(noticeDescriptor?.dc))
      ? { dc: Number(noticeDescriptor.dc) }
      : {}),
    ...(sourceName ? { sourceName } : {}),
    kind: noticeDescriptor?.kind === "effect-reminder" ? "effect-reminder" : "effect-save",
    ...(String(noticeDescriptor?.eyebrow || "").trim()
      ? { eyebrow: String(noticeDescriptor.eyebrow).trim().slice(0, 80) }
      : {}),
    resolution,
    target: {
      id: target.id,
      name: target.name,
      portrait: target.portrait,
    },
  };
}
