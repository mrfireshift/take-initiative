import { ID } from "./constants.js";
import { initiativeTurnKeyAtOrdinal } from "./turnBoundaryCore.js";
import {
  buildEffectSaveReminderResolution,
  buildDeferredEffectResolution,
  normalizeReminderResolution,
  REMINDER_RESOLUTIONS_FIELD,
} from "./reminderResolutionCore.js";
import { normalizeDeferredEffects } from "./spellLifecycleContracts.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;
const TIMINGS = new Set(["turn-start", "turn-end", "damage"]);
const CONCENTRATION_TURN_REMINDERS = Object.freeze({
  "heat-metal": Object.freeze({
    effectName: "Riscaldare il Metallo",
    saveLabel: "Azione bonus",
    instruction: "Può usare un'azione bonus per infliggere di nuovo 2d8 danni da fuoco; risolvi poi l'eventuale TS Costituzione del portatore.",
  }),
  "heat metal": Object.freeze({
    effectName: "Riscaldare il Metallo",
    saveLabel: "Azione bonus",
    instruction: "Può usare un'azione bonus per infliggere di nuovo 2d8 danni da fuoco; risolvi poi l'eventuale TS Costituzione del portatore.",
  }),
  "riscaldare il metallo": Object.freeze({
    effectName: "Riscaldare il Metallo",
    saveLabel: "Azione bonus",
    instruction: "Può usare un'azione bonus per infliggere di nuovo 2d8 danni da fuoco; risolvi poi l'eventuale TS Costituzione del portatore.",
  }),
});
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
  if (!ability || !TIMINGS.has(timing)) return null;
  const dc = optionalDC(value.dc);
  const dcSource = value.dcSource === "source-spell" ? "source-spell" : "";
  const resolution = normalizeReminderResolution(value.resolution);
  const damage = value.damage && typeof value.damage === "object"
    ? {
      ...value.damage,
      ...(value.damage.dice ? { dice: String(value.damage.dice).trim().slice(0, 80) } : {}),
      ...(value.damage.type ? { type: String(value.damage.type).trim().slice(0, 80) } : {}),
    }
    : null;
  return {
    ability: ability.key,
    timing,
    actor: value.actor === "source" ? "source" : "target",
    success: value.success === "keep-effect" ? "keep-effect" : "remove-effect",
    ...(dc !== null ? { dc } : {}),
    ...(dcSource ? { dcSource } : {}),
    ...(value.label ? { label: String(value.label).trim().slice(0, 160) } : {}),
    ...(value.failure ? {
      failure: String(value.failure).trim().slice(0, 160),
    } : {}),
    ...(damage?.dice && damage?.type ? { damage } : {}),
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
  if (!item?.id || !instance?.id || !ability || !activationId) return null;
  const dc = reminderDC(reminder, instance, itemsById);
  const sourceName = String(
    itemsById.get(String(instance?.sourceId || "").trim())?.name
    || instance?.sourceName
    || ""
  ).trim().slice(0, 100);
  const effectName = String(
    instance.condition || instance.name || instance.effectDetail || "Effetto"
  ).trim().slice(0, 120) || "Effetto";
  const saveLabel = `TS ${ability.label}${dc === null ? "" : ` CD ${dc}`}`;
  const instruction = reminder.label || (
    reminder.success === "remove-effect"
      ? "In caso di successo rimuovi l'effetto."
      : "Risolvi il tiro e mantieni l'effetto."
  );
  const resolution = buildEffectSaveReminderResolution({
    item,
    instance,
    reminder,
    dc,
    activationId,
    turnKey,
  });
  return {
    activationId,
    turnKey,
    effectName,
    saveLabel,
    instruction,
    timing: reminder.timing,
    ability: ability.short,
    ...(dc !== null ? { dc } : {}),
    ...(sourceName ? { sourceName } : {}),
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
    for (const instance of conditionInstances(item)) {
      if (instance?.active === false || !instance?.id) continue;
      for (const reminder of normalizeEffectSaveReminders(
        instance.saveReminder,
      )) {
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
