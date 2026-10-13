// Definition-only parsing and validation. No DOM, SDK, token mutation, or runtime state.
export const BOSS_ACTION_PROFILE_VERSION = 19;
export const BOSS_ACTION_PARSER_VERSION = 19;
// Version 3 adds one multi-target save shape: explicit GM-chosen targets, area metadata only
// (never geometry), and a single on-failure condition with an actor-turn expiry.
// Version 4 widens that shape to a closed set: cone, circle on a point or emanation from the boss;
// DEX/CON saves; one or two printed components; Accecato or Prono with a closed expiry set; an
// optional repeated save on a 1-minute condition and an optional immunity on a passed save.
// Version 5 adds a closed single-target save shape (STR/DEX/CON, half or no damage on a success,
// Afferrato/Trattenuto until removed, a grab/hold grapple rule) and a no-damage group save whose
// targets the GM picks (up to a printed maximum) and whose failure is a debuff pill on the target.
// Version 6 adds a boss mark (a pill shared by the phases of one boss, with the cold-ward-break rule),
// a single save that requires and consumes that mark, and a melee spell attack whose necrotic damage
// heals the boss (the maximum-HP reduction stays manual).
// Version 7 adds an optional presentation group per ability, read only from an explicit
// `manifestation` sub-heading of the stat block (e.g. Titano / Proiezione Fatata), never from prose.
// Version 8 lists every printed Spellcasting spell ({ spellId, name, perDay }) from a closed catalog
// mapping instead of the single Slow reference; per-day limits stay informational (manual).
// Version 9 adds a multi-point area save (Meteor Swarm): `count` circles drawn on free points, an
// optional `innerRadius` around each point for components with `scope: "inner"`, no failure
// condition, and a requirement the GM confirms before drawing (`requiresConfirmation`).
// Version 10 adds a group attack reaction (Divine Brilliance): the printed attack of another ability of
// the same profile (`sourceAction`, copied and cross-checked) against every conscious creature in an
// emanation from the boss, one attack roll and one damage roll per target, an HP trigger (`hpBelow`)
// and a requirement the GM confirms (the reaction is available).
// Version 11 lets a trait carry `auras`: closed aura definitions (radius, debuff pills, turn-start or
// turn-end reminders with a fixed save or a direct damage roll) that become custom auras on the bound
// token. Only anchored trait texts produce them (Aura Gelida, Primal Blizzard); the rest stays manual.
// Version 12 keeps the v11 contract; the parser adds the debuff pill of Aura Gelida (who is inside).
// Version 13 lets an aura name who it affects (`targets: "pc"`, the Primal Blizzard push) and adds a
// `concentration-save` reminder: only a creature that is concentrating saves, and a failure breaks it.
// Version 14 lets an aura save apply a standard condition on a failure (`failureCondition`: Prono, the
// Primal Blizzard push), independent of the aura and removed by hand.
// Version 15 lets a Spellcasting spell be at will (`atWill: true` instead of `perDay`): passo velato.
// Version 16 adds Hurl (`throw`: the grabbed creature, damage per 10 ft, Prono on the platform or a DEX save
// at the edge) and Epic Resistance (`effect-end`: a flat d20 against a threshold ends one effect on the boss).
// Version 17 opens the shapes to a second boss (Shothragoth): force and psychic damage, STR group saves, a
// plain melee attack, an emanation save with a push and Prono, trait auras of any listed damage type
// (named after the trait), Epic Resistance in either gender and the Italian "(Ricarica Speciale)".
// Version 18 adds a single save with Prono on a failure (Il Corpo Non Era Qui), a melee attack whose hit
// lets the boss choose an effect (`onHit.choices`: pull, or a grab one creature at a time) and a flat-damage
// throw with a collision save on a second creature (Scagliare).
// Version 19 adds the Epic Action sequence (`sequence`: the first or the last Epic Action of the round, optionally
// after another one in the same round), a seam that lasts until the end of the round and blocks other actions
// (Cucitura del Non-Luogo, `seam`) and a group save in a line along that seam (`area.shape: "seam"`, INT saves).
export const BOSS_ACTION_SPELLS = Object.freeze({ lentezza: "slow", "tempesta di ghiaccio": "ice-storm", "sfera congelante di otiluke": "freezing-sphere", "passo velato": "misty-step" });
export const BOSS_ACTION_SPELL_IDS = Object.freeze(Object.values(BOSS_ACTION_SPELLS));
export const BOSS_ACTION_GROUP_CONDITIONS = Object.freeze(["Accecato", "Prono"]);
const NEXT_ACTOR_TURN_END = Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" });
const MANUAL_EXPIRY = Object.freeze({ mode: "manual" });
const ONE_MINUTE = Object.freeze({ mode: "rounds", remaining: 10 });
const GROUP_AREA_SHAPES = Object.freeze(["cone", "circle", "emanation"]);
const GROUP_SAVE_ABILITIES = Object.freeze(["dex", "con"]);
const NEXT_TARGET_TURN_END = Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" });
const SINGLE_SAVE_ABILITIES = Object.freeze(["str", "dex", "con"]);
const SINGLE_SAVE_CONDITIONS = Object.freeze(["Afferrato", "Trattenuto"]);
const COUNT_WORDS = Object.freeze({ una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6 });

const CATEGORIES = new Set(["trait", "epic-action", "reaction", "action"]);
const AUTOMATION = new Set(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]);
const IDENTITY_KEYS = ["profileId", "profileRevision", "bossDefinitionId", "phaseId"];
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:+-]{0,127}$/;
const DICE_PATTERN = /^([1-9]\d{0,2})d([1-9]\d{0,3})([+-]\d{1,4})?$/;
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

// Synchronous SHA-256 lets the local store verify full source integrity without reparsing HTML.
function sourceHash(text) {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  const rotate = (n, bits) => (n >>> bits) | (n << (32 - bits));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + words[i]) >>> 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [a, b, c, d, e, f, g, h] = [(first + second) >>> 0, a, b, c, (d + first) >>> 0, e, f, g];
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => { hash[i] = (hash[i] + value) >>> 0; });
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function fail(message) { throw new Error(`Invalid boss action profile: ${message}`); }
function object(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object`);
  if (Object.getOwnPropertySymbols(value).length) fail(`${label} has unexpected symbols`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!allowed.includes(key) || !Object.hasOwn(descriptor, "value")) fail(`${label} has unexpected field ${key}`);
  }
  return value;
}
function string(value, label, empty = false) {
  if (typeof value !== "string" || (!empty && !value.trim())) fail(`${label} must be text`);
  return value;
}
function identity(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) fail(`${label} identity is invalid`);
  return value;
}
function number(value, label, min = 0, max = 10000) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} number is invalid`);
  return value;
}
function list(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) fail(`${label} must be a plain array`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if ((key !== "length" && !/^(0|[1-9]\d*)$/.test(key)) || !Object.hasOwn(descriptor, "value")) fail(`${label} has unexpected executable fields`);
  }
  return value;
}
function usage(value) {
  object(value, ["limit", "period", "note"], "usage");
  const result = {};
  if (value.limit !== undefined || value.period !== undefined) {
    result.limit = number(value.limit, "usage.limit", 1, 1000);
    if (!["round", "phase", "day"].includes(value.period)) fail("usage.period is invalid");
    result.period = value.period;
  }
  if (value.note !== undefined) result.note = string(value.note, "usage.note");
  return result;
}
function damage(value, version) {
  const seen = new Set();
  return list(value, "damage").map((part) => {
    object(part, ["id", "formula", "printedAverage", "average", "type", ...(version >= 9 ? ["scope"] : [])], "damage component");
    const id = identity(part.id, "damage.id");
    if (seen.has(id)) fail("duplicate damage id");
    seen.add(id);
    if (!(version >= 17 ? ["slashing", "cold", "bludgeoning", "necrotic", "radiant", "force", "psychic"] : version >= 4 ? ["slashing", "cold", "bludgeoning", "necrotic", "radiant"] : version >= 2 ? ["slashing", "cold", "bludgeoning", "necrotic"] : ["slashing", "cold", "bludgeoning"]).includes(part.type)) fail("unsupported damage type");
    if (typeof part.formula !== "string" || !DICE_PATTERN.test(part.formula)) fail("damage formula is invalid");
    const result = { id, formula: part.formula, type: part.type };
    if (part.printedAverage !== undefined) result.printedAverage = number(part.printedAverage, "printedAverage");
    if (part.average !== undefined) result.average = number(part.average, "average");
    if ((part.printedAverage === undefined) === (part.average === undefined)) fail("damage must have one average provenance");
    if (part.scope !== undefined) {
      if (part.scope !== "inner") fail("unsupported damage scope");
      result.scope = "inner";
    }
    return result;
  });
}
function sameRecord(value, expected) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(expected).length
    && Object.keys(expected).every((key) => value[key] === expected[key]);
}
function groupConditions(value, version) {
  object(value, ["conditions"], "onFailed");
  const conditions = list(value.conditions, "onFailed conditions").map((entry) => {
    object(entry, ["condition", "expiry", ...(version >= 4 ? ["saveReminder"] : [])], "onFailed condition");
    if (!(version >= 4 ? BOSS_ACTION_GROUP_CONDITIONS : ["Accecato"]).includes(entry.condition)) fail("unsupported failed condition");
    const expiry = [NEXT_ACTOR_TURN_END, ...(version >= 4 ? [MANUAL_EXPIRY, ONE_MINUTE] : [])].find((candidate) => sameRecord(entry.expiry, candidate));
    if (!expiry) fail("unsupported condition expiry");
    const result = { condition: entry.condition, expiry: { ...expiry } };
    if (entry.saveReminder !== undefined) {
      // A repeated save ends a 1-minute condition at the end of each of the target's turns.
      object(entry.saveReminder, ["ability", "timing", "dc"], "condition save reminder");
      if (expiry !== ONE_MINUTE || entry.saveReminder.timing !== "turn-end" || !GROUP_SAVE_ABILITIES.includes(entry.saveReminder.ability)) fail("unsupported condition save reminder");
      result.saveReminder = { ability: entry.saveReminder.ability, timing: "turn-end", dc: number(entry.saveReminder.dc, "reminder DC", 1, 30) };
    }
    return result;
  });
  if (conditions.length !== 1) fail("unsupported failed condition count");
  return { conditions };
}
function groupImmunity(value, conditions) {
  object(value, ["immunity"], "onPassed");
  object(value.immunity, ["condition", "duration"], "immunity");
  if (value.immunity.condition !== conditions[0].condition || value.immunity.duration !== "24h") fail("unsupported immunity");
  return { immunity: { condition: value.immunity.condition, duration: "24h" } };
}
function groupArea(value, version) {
  object(value, ["shape", "size", "origin", ...(version >= 9 ? ["count", "innerRadius"] : [])], "target area");
  if (!(version >= 19 ? [...GROUP_AREA_SHAPES, "seam"] : version >= 4 ? GROUP_AREA_SHAPES : ["cone"]).includes(value.shape)) fail("unsupported area shape");
  const area = { shape: value.shape, size: number(value.size, "area size", 1, 1000), origin: string(value.origin, "area origin") };
  // Meteor Swarm: several circles on free points; the inner radius marks "within N ft of a point".
  if (value.count !== undefined || value.innerRadius !== undefined) {
    if (value.shape !== "circle" || value.count === undefined) fail("unsupported multi-point area");
    area.count = number(value.count, "area count", 2, 6);
    if (value.innerRadius !== undefined) area.innerRadius = number(value.innerRadius, "inner radius", 1, area.size);
  }
  return area;
}
// The area is drawn by the GM with the shared placement tool (free origin); targets come from that drawing.
function groupSaveExecution(value, version) {
  object(value, ["kind", "save", "target", "damage", "success", "onFailed", ...(version >= 4 ? ["onPassed"] : []), ...(version >= 9 ? ["requiresConfirmation"] : [])], "group save execution");
  object(value.target, ["mode", "selection", "area"], "group target");
  if (value.target.mode !== "multiple" || value.target.selection !== "area") fail("unsupported group target mode");
  const area = groupArea(value.target.area, version);
  object(value.save, ["ability", "dc"], "save");
  if (!(version >= 19 ? [...GROUP_SAVE_ABILITIES, "str", "int"] : version >= 17 ? [...GROUP_SAVE_ABILITIES, "str"] : version >= 4 ? GROUP_SAVE_ABILITIES : ["con"]).includes(value.save.ability) || value.success !== "half") fail("unsupported group save mechanic");
  const components = damage(value.damage, version >= 17 ? 17 : version >= 9 ? 9 : version >= 4 ? 4 : 3);
  if (components.some((part) => part.printedAverage === undefined)
    || (version >= 4 ? components.length > 2 || new Set(components.map((part) => part.type)).size !== components.length
      : components.length !== 2 || components[0].type !== "cold" || components[1].type !== "necrotic")) fail("unsupported group save damage components");
  // An inner-scoped component needs the inner radius, and at least one component reaches the whole area.
  if (components.some((part) => part.scope) && (!area.innerRadius || components.every((part) => part.scope))) fail("unsupported inner damage scope");
  if (area.innerRadius && !components.some((part) => part.scope)) fail("unsupported inner radius");
  // v9: an area save may have no failure condition (Meteor Swarm).
  const onFailed = version >= 9 && value.onFailed === undefined ? null : groupConditions(value.onFailed, version);
  if (value.requiresConfirmation !== undefined && value.requiresConfirmation !== true) fail("unsupported confirmation flag");
  if (value.onPassed !== undefined && !onFailed) fail("unsupported immunity");
  return { kind: "save-damage", save: { ability: value.save.ability, dc: number(value.save.dc, "save DC", 1, 30) },
    target: { mode: "multiple", selection: "area", area }, damage: components, success: "half", ...(onFailed ? { onFailed } : {}),
    ...(value.onPassed !== undefined ? { onPassed: groupImmunity(value.onPassed, onFailed.conditions) } : {}),
    ...(value.requiresConfirmation === true ? { requiresConfirmation: true } : {}) };
}
// Grasp grabs (Afferrato with an escape DC, Trattenuto) and may hit nothing on a success; Crush holds a
// creature the Titan already grabbed and changes no condition. Blizzard Strike keeps its v1-v4 shape.
function singleSaveExecution(value, version) {
  object(value, ["kind", "save", "target", "damage", "success", "onFailed", "grapple", ...(version >= 6 ? ["requiresMark", "consumesMark"] : [])], "single save execution");
  object(value.target, ["mode", "maxTargets", "range"], "target");
  if (value.target.mode !== "single" || value.target.maxTargets !== 1) fail("unsupported target mode");
  const target = { mode: "single", maxTargets: 1, ...(value.target.range !== undefined ? { range: number(value.target.range, "target range", 1) } : {}) };
  object(value.save, ["ability", "dc"], "save");
  if (!SINGLE_SAVE_ABILITIES.includes(value.save.ability) || !["half", "none"].includes(value.success)) fail("unsupported save mechanic");
  const components = damage(value.damage, version >= 18 ? 17 : 5);
  if (components.length > 2 || new Set(components.map((part) => part.type)).size !== components.length) fail("unsupported save damage components");
  const result = { kind: "save-damage", save: { ability: value.save.ability, dc: number(value.save.dc, "save DC", 1, 30) }, target, damage: components, success: value.success };
  if (value.onFailed !== undefined) {
    object(value.onFailed, ["conditions"], "onFailed");
    const seen = new Set();
    const conditions = list(value.onFailed.conditions, "onFailed conditions").map((entry) => {
      object(entry, ["condition", "expiry", "escapeDC"], "onFailed condition");
      if (!(version >= 18 ? [...SINGLE_SAVE_CONDITIONS, "Prono"] : SINGLE_SAVE_CONDITIONS).includes(entry.condition) || seen.has(entry.condition)) fail("unsupported failed condition");
      seen.add(entry.condition);
      // Detonation of the Mark: Trattenuto until the end of the target's next turn (v6).
      const expiry = [MANUAL_EXPIRY, ...(version >= 6 && entry.condition === "Trattenuto" ? [NEXT_TARGET_TURN_END] : [])].find((candidate) => sameRecord(entry.expiry, candidate));
      if (!expiry) fail("unsupported condition expiry");
      if (entry.escapeDC !== undefined && entry.condition !== "Afferrato") fail("unsupported escape DC");
      return { condition: entry.condition, expiry: { ...expiry }, ...(entry.escapeDC !== undefined ? { escapeDC: number(entry.escapeDC, "escape DC", 1, 30) } : {}) };
    });
    if (conditions.length > 2) fail("unsupported failed condition count");
    result.onFailed = { conditions };
  }
  if (value.grapple !== undefined) {
    const grabbed = result.onFailed?.conditions.find((entry) => entry.condition === "Afferrato");
    if (value.grapple === "grab" ? !grabbed?.escapeDC || result.success !== "none" : value.grapple !== "hold" || result.onFailed) fail("unsupported grapple rule");
    result.grapple = value.grapple;
  }
  if (value.requiresMark !== undefined) {
    object(value.requiresMark, ["id"], "required mark");
    if (value.consumesMark !== true || result.grapple) fail("unsupported mark requirement");
    result.requiresMark = { id: identity(value.requiresMark.id, "mark id") };
    result.consumesMark = true;
  } else if (value.consumesMark !== undefined) fail("unsupported mark requirement");
  if (target.range === undefined && result.grapple === undefined && result.requiresMark === undefined) fail("single save needs a range, a grapple rule or a mark");
  return result;
}
// Frostmaiden's Kiss: melee spell attack; the necrotic damage taken heals the boss. The maximum-HP
// reduction of the target stays a manual step (canonical HP fields are never lowered automatically).
function drainAttackExecution(value) {
  object(value, ["kind", "attack", "target", "damage", "drain"], "drain attack execution");
  object(value.attack, ["bonus", "type", "modes", "reach"], "attack");
  const modes = list(value.attack.modes, "attack modes");
  if (value.attack.type !== "spell" || modes.length !== 1 || modes[0] !== "melee") fail("unsupported drain attack");
  object(value.target, ["mode", "maxTargets"], "target");
  if (value.target.mode !== "single" || value.target.maxTargets !== 1) fail("unsupported target mode");
  const components = damage(value.damage, 6);
  if (components.length !== 2 || components[0].type !== "necrotic" || components[1].type !== "cold" || components.some((part) => part.printedAverage === undefined)) fail("unsupported drain damage components");
  object(value.drain, ["component", "healsSource", "maxHpReduction"], "drain");
  if (value.drain.component !== components[0].id || value.drain.healsSource !== true || value.drain.maxHpReduction !== "manual") fail("unsupported drain");
  return { kind: "attack-damage", attack: { bonus: number(value.attack.bonus, "attack bonus", -30, 30), type: "spell", modes: ["melee"], reach: number(value.attack.reach, "reach", 1) },
    target: { mode: "single", maxTargets: 1 }, damage: components, drain: { component: components[0].id, healsSource: true, maxHpReduction: "manual" } };
}
// Soul-Numbing Cold: no damage; the failure is a debuff pill until the end of the target's next turn.
function groupEffectExecution(value, version) {
  object(value, ["kind", "save", "target", "onFailed"], "group effect execution");
  object(value.target, ["mode", "selection", "maxTargets", "range"], "group target");
  if (value.target.mode !== "multiple" || value.target.selection !== "manual") fail("unsupported group target mode");
  object(value.save, ["ability", "dc"], "save");
  if (!GROUP_SAVE_ABILITIES.includes(value.save.ability)) fail("unsupported group save mechanic");
  if (version >= 6 && value.onFailed?.mark !== undefined) {
    // Mark of the Frostmaiden: a pill until it detonates or the boss is defeated (removed by hand).
    object(value.onFailed, ["mark"], "onFailed");
    object(value.onFailed.mark, ["id", "rule", "expiry"], "mark");
    if (value.onFailed.mark.rule !== "cold-ward-break" || !sameRecord(value.onFailed.mark.expiry, MANUAL_EXPIRY)) fail("unsupported mark");
    return { kind: "save-effect", save: { ability: value.save.ability, dc: number(value.save.dc, "save DC", 1, 30) },
      target: { mode: "multiple", selection: "manual", maxTargets: number(value.target.maxTargets, "max targets", 1, 6), range: number(value.target.range, "target range", 1) },
      onFailed: { mark: { id: identity(value.onFailed.mark.id, "mark id"), rule: "cold-ward-break", expiry: { ...MANUAL_EXPIRY } } } };
  }
  object(value.onFailed, ["effect"], "onFailed");
  object(value.onFailed.effect, ["speedPenalty", "noHealing", "noTempHP", "expiry"], "failed effect");
  const effect = value.onFailed.effect;
  if (effect.noHealing !== true || effect.noTempHP !== true || !sameRecord(effect.expiry, NEXT_TARGET_TURN_END)) fail("unsupported failed effect");
  return { kind: "save-effect", save: { ability: value.save.ability, dc: number(value.save.dc, "save DC", 1, 30) },
    target: { mode: "multiple", selection: "manual", maxTargets: number(value.target.maxTargets, "max targets", 1, 6), range: number(value.target.range, "target range", 1) },
    onFailed: { effect: { speedPenalty: number(effect.speedPenalty, "speed penalty", 5, 120), noHealing: true, noTempHP: true, expiry: { ...NEXT_TARGET_TURN_END } } } };
}
// Divine Brilliance: the referenced ranged spell attack (Polar Ray) against every conscious creature
// within the emanation; the visibility of each creature and the boss's reaction stay manual.
function groupAttackExecution(value) {
  object(value, ["kind", "printedTotalAverage", "attack", "target", "damage", "sourceAction", "trigger", "requiresConfirmation"], "group attack execution");
  object(value.target, ["mode", "selection", "area", "conscious"], "group attack target");
  if (value.target.mode !== "multiple" || value.target.selection !== "area" || value.target.conscious !== true) fail("unsupported group attack target");
  const area = groupArea(value.target.area, 4);
  if (area.shape !== "emanation") fail("unsupported group attack area");
  object(value.attack, ["bonus", "type", "modes", "range"], "attack");
  const modes = list(value.attack.modes, "attack modes");
  if (value.attack.type !== "spell" || modes.length !== 1 || modes[0] !== "ranged") fail("unsupported group attack");
  object(value.attack.range, ["normal"], "attack range");
  const components = damage(value.damage, 4);
  if (!components.length || components.length > 2 || new Set(components.map((part) => part.type)).size !== components.length) fail("unsupported group attack damage components");
  object(value.trigger, ["hpBelow"], "trigger");
  if (value.requiresConfirmation !== true) fail("group attack needs a confirmation");
  return { kind: "attack-damage", ...(value.printedTotalAverage !== undefined ? { printedTotalAverage: number(value.printedTotalAverage, "printed total average") } : {}),
    attack: { bonus: number(value.attack.bonus, "attack bonus", -30, 30), type: "spell", modes: ["ranged"], range: { normal: number(value.attack.range.normal, "normal range", 1) } },
    target: { mode: "multiple", selection: "area", area, conscious: true }, damage: components,
    sourceAction: identity(value.sourceAction, "source action"), trigger: { hpBelow: number(value.trigger.hpBelow, "trigger HP", 1, 100000) }, requiresConfirmation: true };
}
const AURA_EVENTS = Object.freeze(["turn-start", "turn-end"]);
const AURA_SAVE_ABILITIES = Object.freeze(["str", "dex", "con"]);
const AURA_DAMAGE_TYPES = Object.freeze(["freddo"]);
const AURA_FAILURE_CONDITIONS = Object.freeze(["Prono"]);
// Italian damage phrases of the stat blocks and their damage types (v17 grammars).
const DAMAGE_PHRASES = Object.freeze({ "da forza": "force", psichici: "psychic", contundenti: "bludgeoning", taglienti: "slashing",
  "da freddo": "cold", necrotici: "necrotic", radiosi: "radiant" });
function shortText(value, label, max) {
  const text = string(value, label);
  if (text.length > max) fail(`${label} is too long`);
  return text;
}
// Trait auras (v11): what the custom aura system can run, nothing more.
function bossAuras(value, version) {
  const keys = new Set();
  const auras = list(value, "auras").map((aura) => {
    object(aura, ["key", "name", "radiusFeet", "origin", "scope", "pills", "reminders", ...(version >= 13 ? ["targets"] : [])], "aura");
    if (aura.targets !== undefined && aura.targets !== "pc") fail("unsupported aura targets");
    const key = identity(aura.key, "aura key");
    if (keys.has(key)) fail("duplicate aura key");
    keys.add(key);
    const radiusFeet = number(aura.radiusFeet, "aura radius", 5, 300);
    if (radiusFeet % 5) fail("aura radius must be a multiple of 5 ft");
    if (aura.scope !== undefined && aura.scope !== "platform") fail("unsupported aura scope");
    const pillKeys = new Set();
    const pills = list(aura.pills, "aura pills").map((pill) => {
      object(pill, ["key", "label", "detail", "kind"], "aura pill");
      const pillKey = identity(pill.key, "aura pill key");
      if (pillKeys.has(pillKey) || pill.kind !== "debuff") fail("unsupported aura pill");
      pillKeys.add(pillKey);
      return { key: pillKey, label: shortText(pill.label, "aura pill label", 60), detail: shortText(pill.detail, "aura pill detail", 240), kind: "debuff" };
    });
    const reminderKeys = new Set();
    const reminders = list(aura.reminders, "aura reminders").map((reminder) => {
      object(reminder, ["key", "event", "resolution", "label", "ability", "dc", "damage", ...(version >= 14 ? ["failureCondition"] : [])], "aura reminder");
      if (reminder.failureCondition !== undefined && (reminder.resolution !== "manual-save" || !AURA_FAILURE_CONDITIONS.includes(reminder.failureCondition))) fail("unsupported aura failure condition");
      const reminderKey = identity(reminder.key, "aura reminder key");
      if (reminderKeys.has(reminderKey) || !AURA_EVENTS.includes(reminder.event)) fail("unsupported aura reminder");
      reminderKeys.add(reminderKey);
      const result = { key: reminderKey, event: reminder.event, resolution: reminder.resolution, label: shortText(reminder.label, "aura reminder label", 240) };
      if (reminder.resolution === "manual-save") {
        if (!AURA_SAVE_ABILITIES.includes(reminder.ability) || reminder.damage !== undefined) fail("unsupported aura save");
        return { ...result, ability: reminder.ability, dc: number(reminder.dc, "aura save DC", 1, 30),
          ...(reminder.failureCondition ? { failureCondition: reminder.failureCondition } : {}) };
      }
      // v13: a Constitution save for concentration, asked only of a concentrating creature.
      if (version >= 13 && reminder.resolution === "concentration-save") {
        if (reminder.ability !== undefined || reminder.damage !== undefined) fail("unsupported concentration save");
        return { ...result, dc: number(reminder.dc, "concentration save DC", 1, 30) };
      }
      if (reminder.resolution !== "manual-damage" || reminder.ability !== undefined || reminder.dc !== undefined) fail("unsupported aura reminder resolution");
      object(reminder.damage, ["dice", "type"], "aura damage");
      if (typeof reminder.damage.dice !== "string" || !DICE_PATTERN.test(reminder.damage.dice) || !(version >= 17 ? [...AURA_DAMAGE_TYPES, "psichico"] : AURA_DAMAGE_TYPES).includes(reminder.damage.type)) fail("unsupported aura damage");
      return { ...result, damage: { dice: reminder.damage.dice, type: reminder.damage.type } };
    });
    if (pills.length > 2 || !reminders.length || reminders.length > 2) fail("unsupported aura shape");
    return { key, name: shortText(aura.name, "aura name", 60), radiusFeet, origin: shortText(aura.origin, "aura origin", 60),
      ...(aura.scope ? { scope: aura.scope } : {}), ...(aura.targets ? { targets: aura.targets } : {}), pills, reminders };
  });
  if (!auras.length || auras.length > 3) fail("unsupported aura count");
  return auras;
}
// Hurl: only the creature this boss holds; the GM picks the distance and where it lands.
function throwExecution(value, version) {
  object(value, ["kind", "target", "grapple", "distance", "damage", "onLanding", "edge", ...(version >= 18 ? ["collision"] : [])], "throw execution");
  object(value.target, ["mode", "maxTargets"], "target");
  if (value.target.mode !== "single" || value.target.maxTargets !== 1 || value.grapple !== "release") fail("unsupported throw target");
  object(value.onLanding, ["condition"], "throw landing");
  if (value.onLanding.condition !== "Prono") fail("unsupported throw landing");
  // v18 (Scagliare): flat damage, always Prono, an optional collision with a second creature; no edge.
  if (value.collision !== undefined) {
    object(value.distance, ["max"], "throw distance");
    const components = damage(value.damage, 17);
    if (components.length !== 1 || components[0].printedAverage === undefined || value.edge !== undefined) fail("unsupported flat throw");
    object(value.collision, ["save", "onFailed"], "throw collision");
    object(value.collision.save, ["ability", "dc"], "collision save");
    object(value.collision.onFailed, ["sameDamage", "condition"], "collision failure");
    if (value.collision.save.ability !== "dex" || value.collision.onFailed.sameDamage !== true || value.collision.onFailed.condition !== "Prono") fail("unsupported throw collision");
    return { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max: number(value.distance.max, "throw distance", 5, 120) },
      damage: components, onLanding: { condition: "Prono" },
      collision: { save: { ability: "dex", dc: number(value.collision.save.dc, "collision DC", 1, 30) }, onFailed: { sameDamage: true, condition: "Prono" } } };
  }
  object(value.distance, ["max", "step"], "throw distance");
  const max = number(value.distance.max, "throw distance", 5, 120), step = number(value.distance.step, "throw step", 5, 60);
  if (max % step) fail("unsupported throw distance");
  const components = damage(value.damage, 4);
  if (components.length !== 1 || components[0].type !== "bludgeoning" || components[0].printedAverage === undefined) fail("unsupported throw damage");
  object(value.edge, ["save"], "throw edge");
  object(value.edge.save, ["ability", "dc"], "throw edge save");
  if (value.edge.save.ability !== "dex") fail("unsupported throw edge save");
  return { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max, step }, damage: components,
    onLanding: { condition: "Prono" }, edge: { save: { ability: "dex", dc: number(value.edge.save.dc, "edge DC", 1, 30) } } };
}
// Epic Resistance: one effect on the boss ends on a flat d20 at or above the threshold.
function effectEndExecution(value) {
  object(value, ["kind", "roll"], "effect end execution");
  object(value.roll, ["die", "threshold"], "effect end roll");
  if (value.roll.die !== 20) fail("unsupported effect end die");
  return { kind: "effect-end", roll: { die: 20, threshold: number(value.roll.threshold, "effect end threshold", 2, 20) } };
}
// v17: a plain melee attack, one or two printed components (Fauce Impossibile).
const CREATURE_SIZES = Object.freeze(["Minuscola", "Piccola", "Media", "Grande", "Enorme", "Mastodontica"]);
// v18 (Arto che Precede il Corpo): after a hit the boss picks one effect: a pull toward it, or a grab (one at a time).
function onHitChoices(value) {
  object(value, ["choices"], "on hit");
  const choices = list(value.choices, "on hit choices").map((entry) => {
    if (entry?.id === "pull") {
      object(entry, ["id", "distance", "maxSize"], "pull");
      if (!CREATURE_SIZES.includes(entry.maxSize)) fail("unsupported pull size");
      return { id: "pull", distance: number(entry.distance, "pull distance", 5, 60), maxSize: entry.maxSize };
    }
    object(entry, ["id", "condition", "escapeDC", "maxSize", "single"], "grab");
    if (entry.id !== "grab" || entry.condition !== "Afferrato" || entry.single !== true || !CREATURE_SIZES.includes(entry.maxSize)) fail("unsupported on hit choice");
    return { id: "grab", condition: "Afferrato", escapeDC: number(entry.escapeDC, "escape DC", 1, 30), maxSize: entry.maxSize, single: true };
  });
  if (choices.length !== 2 || new Set(choices.map((entry) => entry.id)).size !== 2) fail("unsupported on hit choices");
  return { choices };
}
function meleeAttackExecution(value, version) {
  object(value, ["kind", "attack", "target", "damage", ...(version >= 18 ? ["onHit"] : [])], "melee attack execution");
  object(value.attack, ["bonus", "type", "modes", "reach"], "attack");
  const modes = list(value.attack.modes, "attack modes");
  if (modes.length !== 1 || modes[0] !== "melee" || !["weapon", "spell"].includes(value.attack.type)) fail("unsupported melee attack");
  object(value.target, ["mode", "maxTargets"], "target");
  if (value.target.mode !== "single" || value.target.maxTargets !== 1) fail("unsupported target mode");
  const components = damage(value.damage, 17);
  if (!components.length || components.length > 2 || new Set(components.map((part) => part.type)).size !== components.length
    || components.some((part) => part.printedAverage === undefined)) fail("unsupported melee attack damage");
  return { kind: "attack-damage", attack: { bonus: number(value.attack.bonus, "attack bonus", -30, 30), type: value.attack.type, modes: ["melee"],
    reach: number(value.attack.reach, "reach", 1) }, target: { mode: "single", maxTargets: 1 }, damage: components,
    ...(value.onHit !== undefined ? { onHit: onHitChoices(value.onHit) } : {}) };
}
function spellListExecution(value, version) {
  object(value, ["kind", "spells", "saveDC", "attackBonus"], "spell reference");
  const seen = new Set();
  const spells = list(value.spells, "spells").map((entry) => {
    object(entry, ["spellId", "name", "perDay", ...(version >= 15 ? ["atWill"] : [])], "spell");
    if (!BOSS_ACTION_SPELL_IDS.includes(entry.spellId) || seen.has(entry.spellId)) fail("unsupported spell reference");
    seen.add(entry.spellId);
    const name = string(entry.name, "spell name");
    if (name.length > 80 || BOSS_ACTION_SPELLS[name.toLocaleLowerCase("it")] !== entry.spellId) fail("unsupported spell name");
    // v15: an at-will spell has no daily limit; every other spell keeps its printed per-day count.
    if (entry.atWill !== undefined) {
      if (entry.atWill !== true || entry.perDay !== undefined) fail("unsupported at-will spell");
      return { spellId: entry.spellId, name, atWill: true };
    }
    return { spellId: entry.spellId, name, perDay: number(entry.perDay, "spell per day", 1, 9) };
  });
  if (!spells.length) fail("spell list is empty");
  return { kind: "spell-reference", spells, saveDC: number(value.saveDC, "spell save DC", 1, 30), attackBonus: number(value.attackBonus, "spell attack bonus", -30, 30) };
}
// Spells a Spellcasting reference can open: the v8 list, or the single Slow of v1-v7 profiles.
// Cucitura del Non-Luogo (v19): a line between two points the GM draws, kept until the end of the round;
// while it exists the listed epic actions of the same profile cannot be used.
function seamExecution(value) {
  object(value, ["kind", "seam"], "seam execution");
  object(value.seam, ["width", "maxLength", "range", "blocks"], "seam");
  const blocks = list(value.seam.blocks, "seam blocks").map((id) => identity(id, "seam block"));
  if (blocks.length > 4 || new Set(blocks).size !== blocks.length) fail("seam blocks are invalid");
  return { kind: "seam", seam: { width: number(value.seam.width, "seam width", 5, 30), maxLength: number(value.seam.maxLength, "seam length", 5, 300),
    range: number(value.seam.range, "seam range", 5, 300), blocks } };
}
// The Epic Action sequence (v19): the first or the last Epic Action of the round, optionally after another one.
function sequence(value) {
  object(value, ["slot", "after"], "sequence");
  if (!["first", "last"].includes(value.slot)) fail("sequence slot is invalid");
  return { slot: value.slot, ...(value.after !== undefined ? { after: identity(value.after, "sequence.after") } : {}) };
}
export function bossSpellReferenceIds(execution) {
  if (execution?.kind !== "spell-reference") return [];
  return Array.isArray(execution.spells) ? execution.spells.map((entry) => entry.spellId) : execution.spellId ? [execution.spellId] : [];
}
function execution(value, version) {
  if (version >= 3 && value?.kind === "save-damage" && value?.target?.mode === "multiple") return groupSaveExecution(value, version);
  if (version >= 5 && value?.kind === "save-effect") return groupEffectExecution(value, version);
  if (version >= 5 && value?.kind === "save-damage" && value?.target?.mode === "single") return singleSaveExecution(value, version);
  if (version >= 6 && value?.kind === "attack-damage" && value?.drain !== undefined) return drainAttackExecution(value);
  if (version >= 8 && value?.kind === "spell-reference") return spellListExecution(value, version);
  if (version >= 10 && value?.kind === "attack-damage" && value?.target?.mode === "multiple") return groupAttackExecution(value);
  if (version >= 16 && value?.kind === "throw") return throwExecution(value, version);
  if (version >= 16 && value?.kind === "effect-end") return effectEndExecution(value);
  if (version >= 19 && value?.kind === "seam") return seamExecution(value);
  if (version >= 17 && value?.kind === "attack-damage" && value?.target?.mode === "single" && value?.drain === undefined
    && Array.isArray(value?.attack?.modes) && value.attack.modes.length === 1 && value.attack.modes[0] === "melee") return meleeAttackExecution(value, version);
  object(value, ["kind", "attack", "save", "target", "damage", "success", "spellId", "saveDC", "attackBonus", ...(version >= 2 ? ["printedTotalAverage"] : [])], "execution");
  if (value.kind === "spell-reference") {
    object(value, ["kind", "spellId", "saveDC", "attackBonus"], "spell reference");
    if (value.spellId !== "slow") fail("unsupported spell reference");
    return { kind: value.kind, spellId: "slow", saveDC: number(value.saveDC, "spell save DC", 1, 30), attackBonus: number(value.attackBonus, "spell attack bonus", -30, 30) };
  }
  if (!["attack-damage", "save-damage"].includes(value.kind)) fail("unsupported execution kind");
  object(value, value.kind === "attack-damage" ? ["kind", "attack", "target", "damage", ...(version >= 2 ? ["printedTotalAverage"] : [])] : ["kind", "save", "target", "damage", "success"], "damage execution");
  object(value.target, value.kind === "attack-damage" ? ["mode", "maxTargets"] : ["mode", "maxTargets", "range"], "target");
  if (value.target.mode !== "single" || value.target.maxTargets !== 1) fail("unsupported target mode");
  const target = { mode: "single", maxTargets: 1 };
  const components = damage(value.damage, version);
  if (components.length !== 2 && !(version >= 2 && value.kind === "attack-damage" && components.length === 1)) fail("unsupported damage component count");
  if (value.kind === "attack-damage") {
    const printedTotal = value.printedTotalAverage === undefined ? {} : { printedTotalAverage: number(value.printedTotalAverage, "printed total average") };
    object(value.attack, version >= 2 ? ["bonus", "type", "modes", "reach", "range"] : ["bonus", "modes", "reach", "range"], "attack");
    const modes = list(value.attack.modes, "attack modes");
    const dualMode = modes.length === 2 && modes[0] === "melee" && modes[1] === "ranged";
    const rangedMode = version >= 2 && modes.length === 1 && modes[0] === "ranged";
    if (!dualMode && !rangedMode) fail("unsupported attack modes");
    if (value.attack.type !== undefined && !["weapon", "spell"].includes(value.attack.type)) fail("unsupported attack type");
    object(value.attack.range, ["normal", "long"], "attack range");
    const normal = number(value.attack.range.normal, "normal range", 1);
    const attack = { bonus: number(value.attack.bonus, "attack bonus", -30, 30) };
    if (value.attack.type !== undefined) attack.type = value.attack.type;
    if (dualMode) {
      const long = number(value.attack.range.long, "long range", normal);
      if (components.length !== 2 || components[0].type !== "slashing" || components[1].type !== "cold") fail("unsupported attack damage components");
      return { kind: value.kind, ...printedTotal, attack: { ...attack, modes: ["melee", "ranged"], reach: number(value.attack.reach, "reach", 1), range: { normal, long } }, target, damage: components };
    }
    if (value.attack.reach !== undefined) fail("ranged attack has unexpected reach");
    if (components.length === 1 && components[0].type === "bludgeoning") {
      if (attack.type === "spell" || components[0].printedAverage === undefined) fail("unsupported ranged weapon damage");
      const long = number(value.attack.range.long, "long range", normal);
      return { kind: value.kind, ...printedTotal, attack: { ...attack, modes: ["ranged"], range: { normal, long } }, target, damage: components };
    }
    if (components.length !== 2 || components[0].type !== "cold" || components[1].type !== "necrotic" || components.some((part) => part.average === undefined) || attack.type === "weapon" || value.attack.range.long !== undefined) fail("unsupported ranged spell damage");
    return { kind: value.kind, ...printedTotal, attack: { ...attack, modes: ["ranged"], range: { normal } }, target, damage: components };
  }
  object(value.save, ["ability", "dc"], "save");
  if (value.save.ability !== "str" || value.success !== "half") fail("unsupported save mechanic");
  if (components[0].type !== "bludgeoning" || components[1].type !== "cold") fail("unsupported save damage components");
  target.range = number(value.target.range, "target range", 1);
  return { kind: value.kind, save: { ability: "str", dc: number(value.save.dc, "save DC", 1, 30) }, target, damage: components, success: "half" };
}

export function sanitizeBossActionBinding(value) {
  try {
    if (!value || typeof value !== "object") return null;
    const result = {};
    for (const key of IDENTITY_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      result[key] = identity(descriptor.value, key);
      if (key === "profileRevision" && !/^[a-f0-9]{64}$/i.test(result[key])) return null;
    }
    return result;
  } catch { return null; }
}

// Only strict structured data is consumed here; validation never interprets HTML or prose.
export function validateBossActionProfile(value) {
  object(value, ["profileVersion", "parserVersion", ...IDENTITY_KEYS, "name", "type", "rawSource", "diagnostics", "abilities"], "profile");
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, BOSS_ACTION_PROFILE_VERSION].includes(value.profileVersion) || value.parserVersion !== value.profileVersion) fail("unsupported profile/parser version");
  const binding = sanitizeBossActionBinding(value);
  if (!binding) fail("profile identity is invalid");
  object(value.rawSource, ["html", "sourceName", "sourceHash"], "rawSource");
  const html = string(value.rawSource.html, "rawSource.html");
  if (value.rawSource.sourceHash !== sourceHash(html)) fail("source integrity hash mismatch");
  const ids = new Set();
  const abilities = list(value.abilities, "abilities").map((entry) => {
    object(entry, ["id", "name", "category", "automation", "rawText", "usage", "execution", "manualText", ...(value.profileVersion >= 7 ? ["group"] : []),
      ...(value.profileVersion >= 11 ? ["auras"] : []), ...(value.profileVersion >= 19 ? ["sequence"] : [])], "ability");
    const id = identity(entry.id, "ability.id");
    if (ids.has(id)) fail("duplicate ability id");
    ids.add(id);
    if (!CATEGORIES.has(entry.category) || !AUTOMATION.has(entry.automation)) fail("unsupported ability category/automation");
    const result = { id, name: string(entry.name, "ability.name"), category: entry.category, automation: entry.automation, rawText: string(entry.rawText, "ability.rawText"), usage: usage(entry.usage) };
    if (entry.group !== undefined) {
      result.group = string(entry.group, "ability.group");
      if (result.group.length > 60 || entry.category === "trait") fail("ability group is invalid");
    }
    if (entry.auras !== undefined) {
      // A trait aura is data for the custom aura system, never an execution.
      if (entry.category !== "trait" || entry.automation !== "PARTIAL" || entry.execution !== undefined) fail("aura must be a partial trait");
      result.auras = bossAuras(entry.auras, value.profileVersion);
    } else if (entry.automation === "UNSUPPORTED") {
      if (entry.execution !== undefined) fail("unsupported ability has executable data");
    } else {
      if (entry.category === "trait") fail("unsupported executable trait");
      result.execution = execution(entry.execution, value.profileVersion);
      if (entry.automation === "SUPPORTED" && result.execution.kind !== "attack-damage") fail("partial mechanics must remain PARTIAL");
    }
    if (entry.sequence !== undefined) {
      if (entry.category !== "epic-action") fail("only an epic action has a sequence");
      result.sequence = sequence(entry.sequence);
    }
    if (entry.manualText !== undefined) result.manualText = string(entry.manualText, "manualText");
    if (entry.automation !== "SUPPORTED" && !result.manualText) fail("manual text is required for incomplete automation");
    return result;
  });
  // v19: a sequence names another epic action of the same profile; a seam is the first Epic Action and blocks
  // epic actions of the same profile; a line on the seam is the last Epic Action, after a seam ability.
  const epicAction = (id) => abilities.find((entry) => entry.id === id && entry.category === "epic-action");
  for (const ability of abilities) {
    if (ability.sequence?.after && (ability.sequence.after === ability.id || !epicAction(ability.sequence.after))) fail("sequence.after is invalid");
    if (ability.execution?.kind === "seam"
      && (ability.sequence?.slot !== "first" || ability.sequence.after || ability.execution.seam.blocks.some((id) => id === ability.id || !epicAction(id)))) fail("seam is invalid");
    if (ability.execution?.target?.area?.shape === "seam"
      && (ability.category !== "epic-action" || ability.sequence?.slot !== "last" || epicAction(ability.sequence.after)?.execution?.kind !== "seam")) fail("seam line is invalid");
  }
  if (!abilities.length) fail("abilities must not be empty");
  // A group attack repeats another ability of the same profile: same attack and damage, single target.
  for (const ability of abilities) {
    if (!ability.execution?.sourceAction) continue;
    const source = abilities.find((entry) => entry.id === ability.execution.sourceAction);
    const printed = source?.execution;
    if (!printed || printed.kind !== "attack-damage" || printed.target?.mode !== "single"
      || JSON.stringify(printed.attack) !== JSON.stringify(ability.execution.attack)
      || JSON.stringify(printed.damage) !== JSON.stringify(ability.execution.damage)
      || printed.printedTotalAverage !== ability.execution.printedTotalAverage) fail("group attack source action is invalid");
  }
  const diagnostics = list(value.diagnostics, "diagnostics").map((row) => {
    object(row, ["code", "message", "abilityId"], "diagnostic");
    const result = { code: string(row.code, "diagnostic.code"), message: string(row.message, "diagnostic.message") };
    if (row.abilityId !== undefined) result.abilityId = identity(row.abilityId, "diagnostic.abilityId");
    return result;
  });
  return { profileVersion: value.profileVersion, parserVersion: value.parserVersion, ...binding, name: string(value.name, "profile.name"), type: string(value.type, "profile.type"), rawSource: { html, sourceName: string(value.rawSource.sourceName, "sourceName", true), sourceHash: value.rawSource.sourceHash }, diagnostics, abilities };
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? whole;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�";
  });
}
function slug(value) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ability"; }
function hasClass(node, name) { return node.attrs?.class?.split(/\s+/).includes(name); }
function textOf(node) {
  const plain = (part) => typeof part === "string" ? decodeEntities(part) : part.tag === "br" ? " " : part.children.map(plain).join("");
  return plain(node).replace(/\s+/g, " ").trim();
}
function nodesOf(node) { return typeof node === "string" ? [] : [node, ...node.children.flatMap(nodesOf)]; }

// A small inert tree reader, not a browser parser: attributes are data and blocked containers
// are skipped before their contents can be recognized as entries. No resource is ever loaded.
function readHTML(html) {
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const blocked = new Set(["head", "script", "style", "iframe", "object", "svg", "math", "template", "noscript"]);
  let offset = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start < 0) { stack.at(-1).children.push(html.slice(offset)); break; }
    stack.at(-1).children.push(html.slice(offset, start));
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) fail("unclosed HTML comment");
      offset = end + 3;
      continue;
    }
    let end = start + 1, quote = null;
    for (; end < html.length; end += 1) {
      const char = html[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end === html.length) fail("unclosed HTML tag");
    const token = html.slice(start + 1, end);
    offset = end + 1;
    if (/^!/.test(token)) continue;
    const match = token.match(/^\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([\s\S]*)$/i);
    if (!match) fail("malformed HTML tag");
    const tag = match[2].toLowerCase();
    if (match[1]) {
      if (stack.length < 2 || stack.at(-1).tag !== tag) fail(`malformed HTML closing ${tag}`);
      stack.pop();
      continue;
    }
    if (blocked.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "ig");
      close.lastIndex = offset;
      const found = close.exec(html);
      if (!found) fail(`unclosed HTML ${tag}`);
      offset = close.lastIndex;
      continue;
    }
    const attrs = {};
    for (const item of match[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const key = item[1].toLowerCase();
      if (key === "class" || key === "id") attrs[key] = decodeEntities(item[2] ?? item[3] ?? item[4] ?? "");
    }
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !/\/\s*$/.test(match[3])) stack.push(node);
  }
  if (stack.length !== 1) fail("unclosed HTML document");
  return root;
}

function parseTitle(title) {
  const label = title.replace(/\.\s*$/, "").trim();
  // A counted limit may also carry the Special Recharge note: "(1/Round, Special Recharge)".
  const suffix = label.match(/\s*\((\d+)\/(Round|Phase|Giorno)(, Special Recharge)?\)$/i);
  if (suffix) return { name: label.slice(0, suffix.index).trim(), usage: { limit: Number(suffix[1]), period: { round: "round", phase: "phase", giorno: "day" }[suffix[2].toLowerCase()], ...(suffix[3] ? { note: "Special Recharge" } : {}) } };
  // "(Ricarica Speciale)" is the Italian note (v17): the same Special Recharge.
  const recharge = label.match(/\s*\((?:Special Recharge|Ricarica Speciale)\)$/i);
  return recharge ? { name: label.slice(0, recharge.index).trim(), usage: { note: "Special Recharge" } } : { name: label, usage: {} };
}
// Trait auras: anchored texts only; the origin names the manifestation that emanates the aura (the bound token).
const AURA_DAMAGE_PHRASES = Object.freeze({ "da freddo": "freddo", psichici: "psichico" });
function traitGrammar(body, { bossName = "", actionName = "" } = {}) {
  let match = body.match(/^Una creatura (?:diversa da ([^.,]+) )?che inizia il proprio turno entro (\d+) ft\. (dalla|dal|da) ([^.,]+?) subisce (\d+) \((\d+d\d+)\) danni (da freddo|psichici)\.( Il Titano non emana quest['’]aura\.)?$/i);
  if (match && bossName && actionName && (!match[1] || match[1] === bossName)) {
    const phrase = match[7].toLowerCase();
    return { automation: "PARTIAL", auras: [{ key: slug(actionName), name: actionName, radiusFeet: Number(match[2]), origin: match[4],
      pills: [{ key: "inside", label: actionName, detail: `Entro ${match[2]} ft. ${match[3].toLowerCase()} ${match[4]}: ${match[5]} (${match[6]}) danni ${phrase} a inizio turno.`, kind: "debuff" }],
      reminders: [{ key: "damage", event: "turn-start", resolution: "manual-damage", label: `Inizia il turno entro ${match[2]} ft. ${match[3].toLowerCase()} ${match[4]}: ${match[5]} (${match[6]}) danni ${phrase}.`, damage: { dice: match[6], type: AURA_DAMAGE_PHRASES[phrase] } }] }],
      manualText: `${match[8] ? `${match[8].trim()} ` : ""}Il danno del promemoria non legge le difese del profilo attore${phrase === "da freddo" ? " né il marchio" : ""}: inseriscilo già corretto.` };
  }
  match = body.match(/^L['’]area entro (\d+) ft\. dal ([^.,]+) è scarsamente oscurata da neve e vento soprannaturali\. I tiri per colpire contro ([^.,]+) effettuati da una creatura nella tormenta, o che attraversano la tormenta, hanno Svantaggio\. \3 ignora questo oscuramento\. Alla fine del proprio turno, una creatura che mantiene la concentrazione su un incantesimo mentre si trova entro \1 ft\. da \3 deve superare un tiro salvezza su Costituzione con CD (\d+) o perde la concentrazione\. Quando una creatura inizia il proprio turno sulla piattaforma, Tiro Salvezza su Forza: CD (\d+)\. Fallimento: il bersaglio viene spinto fino a (\d+) ft\. in linea retta direttamente lontano dal \2( e ha la condizione Prono)?\.$/i);
  if (match && bossName && match[3] === bossName) {
    return { automation: "PARTIAL", auras: [
      { key: "primal-blizzard", name: "Primal Blizzard", radiusFeet: Number(match[1]), origin: match[2],
        pills: [{ key: "blizzard", label: "Nella tormenta", detail: `Scarsamente oscurato · Svantaggio ai tiri per colpire contro ${match[3]}.`, kind: "debuff" }],
        reminders: [{ key: "concentration", event: "turn-end", resolution: "concentration-save", label: `Mantiene la concentrazione nella tormenta: TS COS CD ${match[4]} o la perde.`, dc: Number(match[4]) }] },
      // The push reaches the whole platform: the radius starts from the blizzard and the GM fits it to the map.
      // The push is asked of the player characters only, at the start of their turn.
      { key: "primal-blizzard-wind", name: "Primal Blizzard · Vento", radiusFeet: Number(match[1]), origin: match[2], scope: "platform", targets: "pc", pills: [],
        reminders: [{ key: "push", event: "turn-start", resolution: "manual-save", label: `Sulla piattaforma: TS FOR CD ${match[5]}; fallimento: spinto fino a ${match[6]} ft. lontano dal ${match[2]}${match[7] ? " e Prono" : ""}.`, ability: "str", dc: Number(match[5]),
          ...(match[7] ? { failureCondition: "Prono" } : {}) }] },
    ], manualText: `Vale anche per gli attacchi che attraversano la tormenta da fuori. Il TS di concentrazione compare solo a chi si concentra e, se fallisce, la interrompe; la spinta riguarda solo i personaggi. Spinta ed Edge of the Storm si risolvono sulla mappa; adatta il raggio di «Primal Blizzard · Vento» alla piattaforma.` };
  }
  return null;
}
function grammar(body, category, { bossName = "", actionName = "" } = {}) {
  if (category === "trait") return traitGrammar(body, { bossName, actionName });
  let match = body.match(/^Tiro per Colpire in Mischia o a Distanza: ([+-]\d+), portata (\d+) ft\. o gittata (\d+)\/(\d+) ft\. Colpito: (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni taglienti più (\d+) \((\d+d\d+)\) danni da freddo\.$/i);
  if (match) return { automation: "SUPPORTED", execution: { kind: "attack-damage", attack: { bonus: Number(match[1]), modes: ["melee", "ranged"], reach: Number(match[2]), range: { normal: Number(match[3]), long: Number(match[4]) } }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "slashing", formula: match[6].replace(/\s+/g, ""), printedAverage: Number(match[5]), type: "slashing" }, { id: "cold", formula: match[8], printedAverage: Number(match[7]), type: "cold" }] } };
  match = body.match(/^Tiro per Colpire a Distanza: ([+-]\d+), gittata (\d+)\/(\d+) ft\. Colpito: (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni contundenti\. (Auril può usare questa Azione Epica soltanto mentre Gather the Winter Sky è attivo\.)$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "attack-damage", attack: { bonus: Number(match[1]), type: "weapon", modes: ["ranged"], range: { normal: Number(match[2]), long: Number(match[3]) } }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "bludgeoning", formula: match[5].replace(/\s+/g, ""), printedAverage: Number(match[4]), type: "bludgeoning" }] }, manualText: match[6] };
  match = body.match(/^Tiro per Colpire con Incantesimo a Distanza: ([+-]\d+), gittata (\d+) ft\. Colpito: (\d+) \((\d+)d(\d+)\) danni, di cui (\d+)d(\d+) da freddo e (\d+)d(\d+) necrotici\.$/i);
  if (match && Number(match[4]) === Number(match[6]) + Number(match[8]) && match[5] === match[7] && match[5] === match[9]) return { automation: "SUPPORTED", execution: { kind: "attack-damage", printedTotalAverage: Number(match[3]), attack: { bonus: Number(match[1]), type: "spell", modes: ["ranged"], range: { normal: Number(match[2]) } }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "cold", formula: `${match[6]}d${match[7]}`, average: Math.floor(Number(match[6]) * (Number(match[7]) + 1) / 2), type: "cold" }, { id: "necrotic", formula: `${match[8]}d${match[9]}`, average: Math.floor(Number(match[8]) * (Number(match[9]) + 1) / 2), type: "necrotic" }] } };
  match = body.match(/^Tiro Salvezza su Forza: CD (\d+), una creatura entro (\d+) ft\. da ([^.]+)\. Fallimento: (\d+) \((\d+)d(\d+) contundenti più (\d+)d(\d+) da freddo\) danni, e (il bersaglio viene spinto fino a (\d+) ft\. in una direzione scelta da \3\.) Successo: Metà danni soltanto\.$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "str", dc: Number(match[1]) }, target: { mode: "single", maxTargets: 1, range: Number(match[2]) }, damage: [{ id: "bludgeoning", formula: `${match[5]}d${match[6]}`, average: Math.floor(Number(match[5]) * (Number(match[6]) + 1) / 2), type: "bludgeoning" }, { id: "cold", formula: `${match[7]}d${match[8]}`, average: Math.floor(Number(match[7]) * (Number(match[8]) + 1) / 2), type: "cold" }], success: "half" }, manualText: match[9][0].toUpperCase() + match[9].slice(1) };
  // Breath of the Long Night: the whole description is anchored; the duration must name this boss.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), ogni creatura in un Cono di (\d+) ft\. che origina dal ([^.,]+)\. Fallimento: (\d+) \((\d+d\d+)\) danni da freddo più (\d+) \((\d+d\d+)\) danni necrotici, e il bersaglio ha la condizione (Accecato) fino alla fine del turno successivo di ([^.,]+)\. Successo: Metà danni soltanto\. (\9 può usare questa Azione Epica soltanto se (?:ha usato Breathe Deep come prima Azione Epica dello stesso round e soltanto se )?è l'ultima Azione Epica che usa (?:nel round|durante il round \d+)\.)$/i);
  if (match && bossName && match[9] === bossName) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "multiple", selection: "area", area: { shape: "cone", size: Number(match[2]), origin: match[3] } }, damage: [{ id: "cold", formula: match[5], printedAverage: Number(match[4]), type: "cold" }, { id: "necrotic", formula: match[7], printedAverage: Number(match[6]), type: "necrotic" }], success: "half", onFailed: { conditions: [{ condition: match[8], expiry: { ...NEXT_ACTOR_TURN_END } }] } }, manualText: match[10] };
  // Frostmaiden's Kiss: the necrotic damage taken heals this boss; the maximum-HP reduction stays manual.
  match = body.match(/^Tiro per Colpire con Incantesimo in Mischia: ([+-]\d+), portata (\d+) ft\. Colpito: (\d+) \((\d+d\d+)\) danni necrotici più (\d+) \((\d+d\d+)\) danni da freddo\. Il massimo dei Punti Ferita del bersaglio è ridotto di un ammontare pari ai danni necrotici subiti, e ([^.,]+) recupera altrettanti Punti Ferita\. La riduzione dura finché il bersaglio non completa un Riposo Lungo\. Questo attacco origina dalla Proiezione Fatata\.$/i);
  if (match && bossName && match[7] === bossName) return { automation: "PARTIAL", execution: { kind: "attack-damage", attack: { bonus: Number(match[1]), type: "spell", modes: ["melee"], reach: Number(match[2]) }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "necrotic", formula: match[4], printedAverage: Number(match[3]), type: "necrotic" }, { id: "cold", formula: match[6], printedAverage: Number(match[5]), type: "cold" }], drain: { component: "necrotic", healsSource: true, maxHpReduction: "manual" } }, manualText: "Riduci a mano il massimo dei Punti Ferita del bersaglio dei danni necrotici subiti, fino al suo Riposo Lungo. L'attacco origina dalla Proiezione Fatata." };
  // Mark of the Frostmaiden: one creature; the mark stays until it detonates or this boss is defeated.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), una creatura che la Proiezione Fatata può vedere entro (\d+) ft\. Fallimento: Il bersaglio è marchiato finché il marchio non detona o ([^.,]+) non viene sconfitta\. Mentre è marchiato, la prima volta in ogni round in cui il bersaglio subisce danni da freddo da \3, la sua Resistenza al freddo è ignorata; l['’]Immunità al freddo è trattata come Resistenza per quella singola istanza di danno\.$/i);
  if (match && bossName && match[3] === bossName && actionName) return { automation: "PARTIAL", execution: { kind: "save-effect", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "multiple", selection: "manual", maxTargets: 1, range: Number(match[2]) }, onFailed: { mark: { id: slug(actionName), rule: "cold-ward-break", expiry: { ...MANUAL_EXPIRY } } } }, manualText: `Bersaglio che la Proiezione Fatata può vedere entro ${match[2]} ft. Se ${match[3]} viene sconfitta, rimuovi il marchio a mano.` };
  // Detonation of the Mark: only a creature marked by this boss; the mark ends whatever the outcome.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), una creatura marchiata da ([^.]+)\. Fallimento: (\d+) \((\d+d\d+)\) danni da freddo più (\d+) \((\d+d\d+)\) danni radiosi, e il bersaglio ha la condizione Trattenuto fino alla fine del proprio turno successivo\. Successo: Metà danni soltanto\. Il marchio termina sul bersaglio sia con un fallimento sia con un successo\. (Libertà di movimento previene la condizione Trattenuto\.)$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "cold", formula: match[4], printedAverage: Number(match[3]), type: "cold" }, { id: "radiant", formula: match[6], printedAverage: Number(match[5]), type: "radiant" }], success: "half", onFailed: { conditions: [{ condition: "Trattenuto", expiry: { ...NEXT_TARGET_TURN_END } }] }, requiresMark: { id: slug(match[2]) }, consumesMark: true }, manualText: `${match[7]} Se il bersaglio ne è protetto, rimuovi Trattenuto a mano.` };
  // Meteor Swarm: N free points, each a circle; the inner circles may not overlap; bludgeoning only near a point.
  match = body.match(/^(La Proiezione Fatata lancia meteor swarm; in quel momento l['’]incantesimo può essere bersagliato da controincantesimo, con la gittata misurata dalla Proiezione Fatata\. ([^.,;]+) può usare questa Azione Epica soltanto se ha usato Gather the Winter Sky come prima Azione Epica dello stesso round, e deve usarla come ultima Azione Epica del round \d+\.) \2 sceglie (due|tre|quattro|cinque|sei) punti che può vedere; ciascuno genera un['’]esplosione con Raggio di (\d+) ft\., e le aree con Raggio di (\d+) ft\. centrate sui punti scelti non possono sovrapporsi\. Tiro Salvezza su Destrezza: CD (\d+), ogni creatura in una o più esplosioni\. Fallimento: (\d+) \((\d+d\d+)\) danni da freddo, più (\d+) \((\d+d\d+)\) danni contundenti se il bersaglio si trova entro \5 ft\. da almeno uno dei punti scelti\. Successo: Metà danni soltanto\. Una creatura subisce ciascuna componente di danno una sola volta, anche se è inclusa in più esplosioni\. Elusione si applica normalmente\.$/i);
  if (match && bossName && match[2] === bossName) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "dex", dc: Number(match[6]) }, target: { mode: "multiple", selection: "area", area: { shape: "circle", size: Number(match[4]), origin: "punti scelti", count: COUNT_WORDS[match[3].toLowerCase()], innerRadius: Number(match[5]) } }, damage: [{ id: "cold", formula: match[8], printedAverage: Number(match[7]), type: "cold" }, { id: "bludgeoning", formula: match[10], printedAverage: Number(match[9]), type: "bludgeoning", scope: "inner" }], success: "half", requiresConfirmation: true }, manualText: match[1] };
  // Titan's Grasp: Afferrato (escape DC) and Trattenuto on a failure, nothing on a success; reach and suspension stay manual.
  match = body.match(/^Tiro Salvezza su Destrezza: CD (\d+), una creatura (entro \d+ ft\. dal bordo della piattaforma ed entro la portata di una delle mani esposte del Titano)\. Fallimento: (\d+) \((\d+d\d+)\) danni contundenti più (\d+) \((\d+d\d+)\) danni da freddo, e il bersaglio ha le condizioni Afferrato \(CD (\d+) per sfuggire\) e Trattenuto ed (è sospeso fino a \d+ ft\. sopra la piattaforma)\. Successo: Nessun danno e il bersaglio non viene afferrato\. Il Titano può tenere una sola creatura Afferrata in questo modo alla volta\.$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "dex", dc: Number(match[1]) }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "bludgeoning", formula: match[4], printedAverage: Number(match[3]), type: "bludgeoning" }, { id: "cold", formula: match[6], printedAverage: Number(match[5]), type: "cold" }], success: "none", onFailed: { conditions: [{ condition: "Afferrato", expiry: { ...MANUAL_EXPIRY }, escapeDC: Number(match[7]) }, { condition: "Trattenuto", expiry: { ...MANUAL_EXPIRY } }] }, grapple: "grab" }, manualText: `Verifica che il bersaglio sia ${match[2]}. Su TS fallito il bersaglio ${match[8]}.` };
  // Crush: only the creature the Titan holds; the grapple and the restraint stay as they are.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), la creatura Afferrata dal Titano\. Fallimento: (\d+) \((\d+d\d+)\) danni contundenti più (\d+) \((\d+d\d+)\) danni da freddo\. Successo: Metà danni soltanto\. (In entrambi i casi il bersaglio rimane Afferrato e Trattenuto\.)$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "single", maxTargets: 1 }, damage: [{ id: "bludgeoning", formula: match[3], printedAverage: Number(match[2]), type: "bludgeoning" }, { id: "cold", formula: match[5], printedAverage: Number(match[4]), type: "cold" }], success: "half", grapple: "hold" }, manualText: match[6] };
  // Soul-Numbing Cold: up to N creatures this boss can see; speed, healing and temporary HP stay manual.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), fino a (una|due|tre|quattro|cinque|sei) creature che ([^.,]+) può vedere entro (\d+) ft\. Fallimento: Fino alla fine del turno successivo del bersaglio, la sua Velocità è ridotta di (\d+) ft\., recupera 0 Punti Ferita da qualsiasi cura e non può ottenere Punti Ferita Temporanei\.$/i);
  if (match && bossName && match[3] === bossName) return { automation: "PARTIAL", execution: { kind: "save-effect", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "multiple", selection: "manual", maxTargets: COUNT_WORDS[match[2].toLowerCase()], range: Number(match[4]) }, onFailed: { effect: { speedPenalty: Number(match[5]), noHealing: true, noTempHP: true, expiry: { ...NEXT_TARGET_TURN_END } } } }, manualText: `Bersagli che ${match[3]} può vedere entro ${match[4]} ft., scelti da te. Velocità, cure e Punti Ferita Temporanei non vengono modificati: l'etichetta ricorda gli effetti fino alla fine del turno successivo del bersaglio.` };
  // Hand Slam: circle on a free point; the difficult terrain and the delayed collapse stay manual text.
  match = body.match(/^Tiro Salvezza su Destrezza: CD (\d+), ogni creatura in un['’]area con Raggio di (\d+) ft\. centrata su (un punto della piattaforma)\. Fallimento: (\d+) \((\d+d\d+)\) danni contundenti più (\d+) \((\d+d\d+)\) danni da freddo, e il bersaglio ha la condizione (Prono)\. Successo: Metà danni soltanto\. (L['’]area colpita diventa Terreno Difficile\. Alla fine del round successivo, l['’]area crolla\. Tiro Salvezza su Destrezza: CD \d+, ogni creatura nell['’]area che crolla\. Fallimento: il bersaglio precipita\. Successo: il bersaglio si sposta nello spazio libero più vicino fuori dall['’]area\.)$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "dex", dc: Number(match[1]) }, target: { mode: "multiple", selection: "area", area: { shape: "circle", size: Number(match[2]), origin: match[3] } }, damage: [{ id: "bludgeoning", formula: match[5], printedAverage: Number(match[4]), type: "bludgeoning" }, { id: "cold", formula: match[7], printedAverage: Number(match[6]), type: "cold" }], success: "half", onFailed: { conditions: [{ condition: match[8], expiry: { ...MANUAL_EXPIRY } }] } }, manualText: match[9] };
  // Blinding Gleam: emanation from this boss; 1 minute with an end-of-turn repeated save; passing the initial
  // or a later save grants immunity.
  match = body.match(/^Tiro Salvezza su Costituzione: CD (\d+), ogni creatura in un['’]Emanazione di (\d+) ft\. che origina da ([^.,]+) e che non abbia Copertura Totale\. Fallimento: (\d+) \((\d+d\d+)\) danni radiosi, e il bersaglio ha la condizione (Accecato) per 1 minuto\. Il bersaglio ripete il tiro salvezza alla fine di ciascuno dei propri turni e la condizione termina con un successo\. Successo: Metà danni soltanto e il bersaglio non è \6\. Una creatura che supera il tiro salvezza iniziale o uno successivo è immune alla condizione \6 di ([^.]+) per 24 ore\.$/i);
  if (match && bossName && match[3] === bossName && actionName && match[7] === actionName) return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: "con", dc: Number(match[1]) }, target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: Number(match[2]), origin: match[3] } }, damage: [{ id: "radiant", formula: match[5], printedAverage: Number(match[4]), type: "radiant" }], success: "half", onFailed: { conditions: [{ condition: match[6], expiry: { ...ONE_MINUTE }, saveReminder: { ability: "con", timing: "turn-end", dc: Number(match[1]) } }] }, onPassed: { immunity: { condition: match[6], duration: "24h" } } }, manualText: "Le creature con Copertura Totale non sono incluse: toglile dal gruppo." };
  // Divine Brilliance: the attack is another ability of this profile, resolved after the loop (sourceAttack).
  // A melee attack whose hit lets the boss choose: a pull or a grab one creature at a time (v18: Arto che Precede il Corpo).
  match = body.match(/^Tiro per Colpire in Mischia: ([+-]\d+), portata (\d+) ft\. Colpito: (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi)(?: più (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi))?, e ([^.,:]+) sceglie uno dei seguenti effetti: Trascinare\. Se il bersaglio è (Minuscolo|Piccolo|Medio|Grande|Enorme|Mastodontico) o più piccolo, viene trascinato di (\d+) ft\. verso \9\. Afferrare\. Se il bersaglio è (Minuscolo|Piccolo|Medio|Grande|Enorme|Mastodontico) o più piccolo, ha la condizione Afferrato \(CD (\d+) per sfuggire\)\. \9 può tenere Afferrata una sola creatura alla volta\.$/i);
  if (match && bossName && match[9] === bossName) {
    const parts = [[match[3], match[4], match[5]], ...(match[6] ? [[match[6], match[7], match[8]]] : [])].map(([average, formula, phrase]) => {
      const type = DAMAGE_PHRASES[phrase.toLowerCase()];
      return { id: type, formula: formula.replace(/\s+/g, ""), printedAverage: Number(average), type };
    });
    const size = (word) => ({ minuscolo: "Minuscola", piccolo: "Piccola", medio: "Media", grande: "Grande", enorme: "Enorme", mastodontico: "Mastodontica" })[word.toLowerCase()];
    if (new Set(parts.map((part) => part.type)).size === parts.length) return { automation: "PARTIAL",
      execution: { kind: "attack-damage", attack: { bonus: Number(match[1]), type: "weapon", modes: ["melee"], reach: Number(match[2]) }, target: { mode: "single", maxTargets: 1 }, damage: parts,
        onHit: { choices: [{ id: "pull", distance: Number(match[11]), maxSize: size(match[10]) },
          { id: "grab", condition: "Afferrato", escapeDC: Number(match[13]), maxSize: size(match[12]), single: true }] } },
      manualText: `Sul colpo ${match[9]} sceglie: Trascinare (${match[11]} ft. verso di sé, se ${match[10]} o più piccolo) oppure Afferrare (CD ${match[13]}, se ${match[12]} o più piccolo; una creatura alla volta). La taglia e il trascinamento si verificano sulla mappa.` };
  }
  // A single save after a teleport, Prono on a failure (v18: Il Corpo Non Era Qui); the teleport stays on the map.
  match = body.match(/^([^.,]+) si teletrasporta fino a (\d+) ft\. in uno spazio libero che può percepire, poi sceglie una creatura entro (\d+) ft\. dallo spazio che ha lasciato o da quello in cui è comparso\. Tiro Salvezza su (Forza|Destrezza|Costituzione): CD (\d+), quella creatura\. Fallimento: (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi), e il bersaglio ha la condizione Prono\. Successo: Metà danni soltanto\.$/i);
  if (match && bossName && match[1] === bossName) {
    const type = DAMAGE_PHRASES[match[8].toLowerCase()];
    return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: { forza: "str", destrezza: "dex", costituzione: "con" }[match[4].toLowerCase()], dc: Number(match[5]) },
      target: { mode: "single", maxTargets: 1, range: Number(match[3]) }, damage: [{ id: type, formula: match[7].replace(/\s+/g, ""), printedAverage: Number(match[6]), type }],
      success: "half", onFailed: { conditions: [{ condition: "Prono", expiry: { ...MANUAL_EXPIRY } }] } },
      manualText: `Teletrasporto fino a ${match[2]} ft. sulla mappa; il bersaglio è una creatura entro ${match[3]} ft. dallo spazio lasciato o da quello d'arrivo.` };
  }
  // A throw with flat damage, always Prono, and a DEX save for a creature it is thrown against (v18: Scagliare).
  match = body.match(/^Una creatura Afferrata da ([^.,]+) viene scagliata fino a (\d+) ft\. in una direzione scelta da \1 e ha la condizione Prono\. La presa termina\. Il bersaglio subisce (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi)\. Se viene scagliato contro un['’]altra creatura, quella creatura effettua un Tiro Salvezza su Destrezza: CD (\d+)\. Fallimento: subisce gli stessi danni e ha la condizione Prono\.$/i);
  if (match && bossName && match[1] === bossName) {
    const type = DAMAGE_PHRASES[match[5].toLowerCase()];
    return { automation: "PARTIAL", execution: { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max: Number(match[2]) },
      damage: [{ id: type, formula: match[4].replace(/\s+/g, ""), printedAverage: Number(match[3]), type }], onLanding: { condition: "Prono" },
      collision: { save: { ability: "dex", dc: Number(match[6]) }, onFailed: { sameDamage: true, condition: "Prono" } } },
      manualText: `Direzione fino a ${match[2]} ft. sulla mappa. Se colpisce un'altra creatura, quella effettua il TS DES CD ${match[6]}: segnalo nella console.` };
  }
  // A plain melee attack with one or two printed components (v17: Fauce Impossibile).
  match = body.match(/^Tiro per Colpire in Mischia: ([+-]\d+), portata (\d+) ft\. Colpito: (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi)(?: più (\d+) \((\d+d\d+(?:\s*[+-]\s*\d+)?)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi))?\.$/i);
  if (match) {
    const parts = [[match[3], match[4], match[5]], ...(match[6] ? [[match[6], match[7], match[8]]] : [])].map(([average, formula, phrase]) => {
      const type = DAMAGE_PHRASES[phrase.toLowerCase()];
      return { id: type, formula: formula.replace(/\s+/g, ""), printedAverage: Number(average), type };
    });
    if (new Set(parts.map((part) => part.type)).size === parts.length) return { automation: "SUPPORTED",
      execution: { kind: "attack-damage", attack: { bonus: Number(match[1]), type: "weapon", modes: ["melee"], reach: Number(match[2]) }, target: { mode: "single", maxTargets: 1 }, damage: parts } };
  }
  // An emanation save from this boss with a push and Prono on a failure (v17: Marea Informe); the push stays on the map.
  match = body.match(/^Tiro Salvezza su (Forza|Destrezza|Costituzione): CD (\d+), ogni altra creatura in un['’]Emanazione di (\d+) ft\. che origina da ([^.,]+)\. Fallimento: (\d+) \((\d+d\d+)\) danni (da forza|psichici|contundenti|taglienti|da freddo|necrotici|radiosi), (il bersaglio viene spinto fino a (\d+) ft\. in linea retta direttamente lontano da \4) e ha la condizione Prono\. Successo: Metà danni soltanto\.$/i);
  if (match && bossName && match[4] === bossName) {
    const type = DAMAGE_PHRASES[match[7].toLowerCase()];
    return { automation: "PARTIAL", execution: { kind: "save-damage", save: { ability: { forza: "str", destrezza: "dex", costituzione: "con" }[match[1].toLowerCase()], dc: Number(match[2]) },
      target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: Number(match[3]), origin: match[4] } },
      damage: [{ id: type, formula: match[6], printedAverage: Number(match[5]), type }], success: "half",
      onFailed: { conditions: [{ condition: "Prono", expiry: { ...MANUAL_EXPIRY } }] } },
      manualText: `Sul fallimento ${match[8]}: la spinta si risolve sulla mappa.` };
  }
  // Hurl: the creature the Titan holds; damage per 10 ft travelled; Prono on the platform, a DEX save at the edge.
  match = body.match(/^Il Titano scaglia la creatura che ha Afferrato fino a (\d+) ft\. in una direzione scelta da ([^.,]+)\. Il bersaglio subisce (\d+) \((\d+d\d+)\) danni contundenti per ogni (\d+) ft\. percorsi e cade Prono se atterra sulla piattaforma\. Se viene scagliato oltre il bordo della piattaforma, Tiro Salvezza su Destrezza: CD (\d+)\. Fallimento: il bersaglio precipita\. Successo: il bersaglio si aggrappa al bordo e rimane appeso\.$/i);
  if (match && bossName && match[2] === bossName && Number(match[1]) % Number(match[5]) === 0) return { automation: "PARTIAL",
    execution: { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max: Number(match[1]), step: Number(match[5]) },
      damage: [{ id: "bludgeoning", formula: match[4], printedAverage: Number(match[3]), type: "bludgeoning" }], onLanding: { condition: "Prono" },
      edge: { save: { ability: "dex", dc: Number(match[6]) } } },
    manualText: `Direzione e punto d'arrivo si scelgono sulla mappa. Oltre il bordo, il TS DES CD ${match[6]} arriva come promemoria: chi fallisce precipita, chi lo supera resta appeso.` };
  // Cucitura del Non-Luogo: the first Epic Action of the round; the seam lasts until the end of the round and
  // blocks the epic action it names (resolved by name after the import loop).
  match = body.match(/^([^.,]+) può usare questa Azione Epica soltanto se è la prima Azione Epica che usa nel round\. Sceglie due punti su superfici che può percepire entro (\d+) ft\. da sé, distanti non più di (\d+) ft\. l['’]uno dall['’]altro\. Fra i due punti compare una cucitura nera larga (\d+) ft\., chiaramente visibile, che rimane fino alla fine del round\. (Il suo spazio è Terreno Difficile\.) Finché la cucitura esiste, \1 non può usare ([^.]+)\.$/i);
  if (match && bossName && match[1] === bossName && category === "epic-action") return { automation: "PARTIAL", sequence: { slot: "first" }, seamBlocks: match[6],
    execution: { kind: "seam", seam: { width: Number(match[4]), maxLength: Number(match[3]), range: Number(match[2]), blocks: [] } },
    manualText: `I due punti stanno su superfici che ${match[1]} può percepire entro ${match[2]} ft. da sé. Lo spazio della cucitura è Terreno Difficile.` };
  // Strappare la Cucitura: the last Epic Action of the round, after the seam; a line along the whole seam.
  match = body.match(/^([^.,]+) può usare questa Azione Epica soltanto se è l['’]ultima Azione Epica che usa nel round e se nello stesso round ha usato ([^.]+)\. La cucitura si spalanca in una Linea larga (\d+) ft\. lungo l['’]intero percorso\. Tiro Salvezza su Intelligenza: CD (\d+), ogni creatura nella Linea\. Fallimento: (\d+) \((\d+d\d+)\) danni da forza più (\d+) \((\d+d\d+)\) danni psichici, il bersaglio viene spinto fino a (\d+) ft\. perpendicolarmente alla cucitura verso un lato determinato a caso e ha la condizione Prono\. Successo: Metà danni soltanto\. Poi la cucitura scompare\. Se non viene strappata, collassa alla fine del round senza effetto\.$/i);
  if (match && bossName && match[1] === bossName && category === "epic-action") return { automation: "PARTIAL", sequence: { slot: "last" }, afterName: match[2],
    execution: { kind: "save-damage", save: { ability: "int", dc: Number(match[4]) }, target: { mode: "multiple", selection: "area", area: { shape: "seam", size: Number(match[3]), origin: match[2] } },
      damage: [{ id: "force", formula: match[6], printedAverage: Number(match[5]), type: "force" }, { id: "psychic", formula: match[8], printedAverage: Number(match[7]), type: "psychic" }],
      success: "half", onFailed: { conditions: [{ condition: "Prono", expiry: { ...MANUAL_EXPIRY } }] } },
    manualText: `Sul fallimento il bersaglio viene spinto fino a ${match[9]} ft. perpendicolarmente alla cucitura, verso un lato determinato a caso: la spinta si risolve sulla mappa. Poi la cucitura scompare.` };
  // Epic Resistance: a flat d20; at or above the threshold one effect on the boss ends.
  match = body.match(/^([^.,]+) sceglie una condizione, un incantesimo o un altro effetto che (?:la|lo) influenza e tira 1d20\. Con (\d+)\+, l['’]effetto termina su di (?:lei|lui)\. \1 può usare questa Azione Epica anche se normalmente non potrebbe compiere azioni, se le sue azioni sono controllate da un['’]altra creatura o se un incantesimo o un effetto altera le sue statistiche\. (Il tiro non è una prova con il d20: non può avere Vantaggio o Svantaggio, non riceve bonus o penalità e nessun effetto può sostituirlo, alterarlo o farlo ripetere\.)( Epic Resistance resta disponibile durante Gather the Winter Sky\.)?$/i);
  if (match && bossName && match[1] === bossName && category === "epic-action") return { automation: "PARTIAL",
    execution: { kind: "effect-end", roll: { die: 20, threshold: Number(match[2]) } },
    manualText: `${match[3]}${match[4] || ""} Utilizzabile anche quando ${match[1]} non potrebbe agire.` };
  match = body.match(/^Innesco: ([^.,]+) scende sotto (\d+) Punti Ferita per la prima volta\. Risposta: \1 effettua immediatamente un attacco con ([^.,]+?) contro ogni creatura cosciente che può vedere entro (\d+) ft\. (Se la Reazione di \1 non è disponibile quando si verifica l['’]innesco, questa Reazione è perduta\.)$/i);
  if (match && category === "reaction" && bossName && match[1] === bossName) return { automation: "PARTIAL", usage: { limit: 1, period: "phase" }, sourceAttack: match[3],
    execution: { kind: "attack-damage", target: { mode: "multiple", selection: "area", area: { shape: "emanation", size: Number(match[4]), origin: match[1] }, conscious: true },
      sourceAction: slug(match[3]), trigger: { hpBelow: Number(match[2]) }, requiresConfirmation: true },
    manualText: `${match[5]} Togli dal gruppo le creature che ${match[1]} non può vedere.` };
  match = body.match(/^(.+?) lancia uno dei seguenti incantesimi, senza componenti materiali e usando Carisma come caratteristica da incantatore \(CD (\d+) per i tiri salvezza degli incantesimi, ([+-]\d+) ai tiri per colpire con incantesimo\): (A volontà: passo velato )?3\/Giorno Ciascuno: lentezza, tempesta di ghiaccio 1\/Giorno: sfera congelante di Otiluke\.$/i);
  if (match) return { automation: "PARTIAL", execution: { kind: "spell-reference", spells: [{ spellId: "slow", name: "lentezza", perDay: 3 }, { spellId: "ice-storm", name: "tempesta di ghiaccio", perDay: 3 }, { spellId: "freezing-sphere", name: "sfera congelante di Otiluke", perDay: 1 },
    // The at-will spell goes last: a request that names no spell keeps opening the first one (Slow, as in v1-v7).
    ...(match[4] ? [{ spellId: "misty-step", name: "passo velato", atWill: true }] : [])], saveDC: Number(match[2]), attackBonus: Number(match[3]) }, manualText: body };
  return null;
}

export async function importBossActionHTML(html, { sourceName = "" } = {}) {
  if (typeof html !== "string" || !html.trim()) fail("HTML source is empty");
  string(sourceName, "sourceName", true);
  const tree = readHTML(html);
  const all = nodesOf(tree);
  const blocks = all.filter((node) => hasClass(node, "statblock"));
  const phases = all.filter((node) => hasClass(node, "phase"));
  if (blocks.length !== 1 || phases.length !== 1) fail("HTML must contain one statblock and one phase");
  const blockNodes = nodesOf(blocks[0]);
  const name = textOf(blockNodes.find((node) => hasClass(node, "name")) || { children: [] });
  const type = textOf(blockNodes.find((node) => hasClass(node, "type")) || { children: [] });
  if (!name || !type) fail("statblock name/type is missing");
  const bossDefinitionId = slug(name.split(",")[0]);
  const hash = sourceHash(html);
  const phaseId = slug(phases[0].attrs.id || `phase-${hash.slice(0, 12)}`);
  const diagnostics = [], abilities = [], ids = new Set();
  let category = null, group = null;
  for (const node of blockNodes) {
    if (hasClass(node, "section-title")) {
      category = { tratti: "trait", "azioni epiche": "epic-action", reazioni: "reaction", azioni: "action" }[textOf(node).toLowerCase()] || null;
      group = null;
    }
    // A manifestation sub-heading groups the following entries of the same section (presentation only).
    if (hasClass(node, "manifestation")) {
      group = textOf(node) || null;
      if (!category || category === "trait" || (group && group.length > 60)) fail("manifestation heading is misplaced or too long");
    }
    if (!hasClass(node, "entry")) continue;
    if (!category) fail("entry has an unknown section category");
    const titleNodes = nodesOf(node).filter((child) => hasClass(child, "title"));
    if (titleNodes.length !== 1 || !textOf(titleNodes[0])) fail("entry title is missing or ambiguous");
    const title = textOf(titleNodes[0]);
    const { name: actionName, usage: actionUsage } = parseTitle(title);
    if (!actionName) fail("entry title is empty");
    const rawText = textOf(node);
    const body = rawText.slice(title.length).trim();
    let id = slug(actionName), suffix = 2;
    while (ids.has(id)) id = `${slug(actionName)}-${suffix++}`;
    ids.add(id);
    const recognized = grammar(body, category, { bossName: name.split(",")[0].trim(), actionName });
    const entry = { id, name: actionName, category, automation: "UNSUPPORTED", rawText, usage: actionUsage, ...(group ? { group } : {}), ...(recognized || { manualText: rawText }) };
    if (!recognized) diagnostics.push({ code: "UNSUPPORTED_ABILITY", abilityId: id, message: `${actionName}: esecuzione manuale; grammatica non supportata.` });
    abilities.push(entry);
  }
  // A seam names the epic action it blocks and a line on the seam names the seam: both by printed name.
  // A name that is not another epic action of this profile leaves the ability manual.
  const manual = (entry, message) => {
    for (const key of ["seamBlocks", "afterName", "execution", "sequence"]) delete entry[key];
    Object.assign(entry, { automation: "UNSUPPORTED", manualText: entry.rawText });
    diagnostics.push({ code: "UNSUPPORTED_ABILITY", abilityId: entry.id, message });
  };
  const epicByName = (name) => abilities.find((other) => other.name === name && other.category === "epic-action");
  for (const entry of abilities) {
    if (entry.seamBlocks === undefined) continue;
    const blocked = epicByName(entry.seamBlocks);
    if (!blocked || blocked === entry) { manual(entry, `${entry.name}: azione bloccata non trovata nel profilo.`); continue; }
    entry.execution.seam.blocks = [blocked.id];
    delete entry.seamBlocks;
  }
  for (const entry of abilities) {
    if (entry.afterName === undefined) continue;
    const seam = epicByName(entry.afterName);
    if (!seam || seam.execution?.kind !== "seam") { manual(entry, `${entry.name}: cucitura di riferimento non trovata nel profilo.`); continue; }
    entry.sequence = { ...entry.sequence, after: seam.id };
    delete entry.afterName;
  }
  // Group attacks copy the printed attack of the ability they name; without it they stay manual.
  for (const entry of abilities) {
    if (entry.sourceAttack === undefined) continue;
    const source = abilities.find((other) => other.name === entry.sourceAttack && other.execution?.kind === "attack-damage" && other.execution.target?.mode === "single" && other.execution.attack?.modes?.length === 1 && other.execution.attack.modes[0] === "ranged" && other.execution.attack.type === "spell");
    delete entry.sourceAttack;
    if (source) {
      const printed = source.execution;
      entry.execution = { ...entry.execution, ...(printed.printedTotalAverage !== undefined ? { printedTotalAverage: printed.printedTotalAverage } : {}),
        attack: structuredClone(printed.attack), damage: structuredClone(printed.damage), sourceAction: source.id };
    } else {
      Object.assign(entry, { automation: "UNSUPPORTED", usage: {}, manualText: entry.rawText });
      delete entry.execution;
      diagnostics.push({ code: "UNSUPPORTED_ABILITY", abilityId: entry.id, message: `${entry.name}: attacco di riferimento non trovato nel profilo.` });
    }
  }
  return validateBossActionProfile({ profileVersion: BOSS_ACTION_PROFILE_VERSION, parserVersion: BOSS_ACTION_PARSER_VERSION, profileId: `${bossDefinitionId}-${phaseId}`, profileRevision: sourceHash(`${BOSS_ACTION_PARSER_VERSION}\n${html}`), bossDefinitionId, phaseId, name, type, rawSource: { html, sourceName, sourceHash: hash }, diagnostics, abilities });
}
