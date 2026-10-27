// What a monster's action does, read from its text by rule (attacchi dei mostri, fase 5, lotto 0). Pure.
// One reader for every book: it looks for the fixed phrases of the 2014 Monster Manual in the plain text ("DC 13
// Constitution saving throw", "a 60-foot cone", "or be frightened for 1 minute", "can repeat the saving throw at the end
// of each of its turns", "grappled (escape DC 16)"), never for a monster's name. What it does not recognise is not
// returned: the action's note keeps it. The text may carry 5eTools' tags or not ({@condition frightened} or
// "frightened"): they are made plain first.

const CONDITIONS = Object.freeze(["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed",
  "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]);
const CONDITION = `(${CONDITIONS.join("|")})`;
const ABILITIES = Object.freeze({ strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" });
const SAVE = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i;
const DAMAGE = /(\d+) \((\d+d\d+(?: ?[+-−] ?\d+)?)\) (\w+) damage/g;

// The 2024 stat blocks' tags as the 2025 Monster Manual prints them (fase 3, lotto 6): "{@atkr m}" → "Melee Attack
// Roll:", "{@actSave dex}" → "Dexterity Saving Throw:", "{@actSaveFail 2}" → "Second Failure:", "{@hom}" → "Hit or Miss:".
// null for any other tag. One table for the adapter's text and the rules' text.
const ATTACK_ROLL_KINDS = Object.freeze({ m: "Melee", r: "Ranged", "m,r": "Melee or Ranged", "r,m": "Melee or Ranged" });
const SAVE_ABILITY_NAMES = Object.freeze({ str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" });
const ORDINALS = Object.freeze({ 1: "First", 2: "Second", 3: "Third" });
export function fiveTools2024TagText(tag, parts = []) {
  if (tag === "atkr") return `${ATTACK_ROLL_KINDS[String(parts[0] || "").trim()] || "Attack"} Attack Roll:`;
  if (tag === "actSave") return `${SAVE_ABILITY_NAMES[String(parts[0] || "").trim()] || "Saving"} Saving Throw:`;
  if (tag === "actSaveFail") {
    const step = String(parts[0] || "").trim();
    return !step ? "Failure:" : ORDINALS[step] ? `${ORDINALS[step]} Failure:` : `Failure ${step}:`;
  }
  if (tag === "actSaveFailBy") return `Failure by ${parts[0] || 5} or More:`;
  if (tag === "actSaveSuccess") return "Success:";
  if (tag === "actSaveSuccessOrFail") return "Failure or Success:";
  if (tag === "actTrigger") return "Trigger:";
  if (tag === "actResponse") return "Response:";
  if (tag === "hom") return "Hit or Miss:";
  return null;
}

// 5eTools' tags as the book prints them: "{@dc 13}" → "DC 13", "{@condition prone}" → "prone", "{@damage 2d6}" → "2d6".
export function monsterActionPlainText(value) {
  return String(value ?? "").replace(/\{@(\w+)(?: ([^}]*))?\}/g, (_, tag, body = "") => {
    const parts = body.split("|");
    const printed2024 = fiveTools2024TagText(tag, parts);
    if (printed2024 !== null) return printed2024;
    if (tag === "dc") return `DC ${parts[0]}`;
    if (tag === "hit") return `${Number(parts[0]) >= 0 ? "+" : ""}${parts[0]}`;
    if (tag === "h") return "Hit: ";
    if (tag === "chance") return parts[1] || `${parts[0]} percent`;
    return parts[2] || parts[0];
  }).replace(/\s+/g, " ").trim();
}

const sentencesOf = (text) => text.split(/(?<=\.)\s+(?=[A-Z])/);

// The conditions a failure (or a hit) gives: "or be frightened", "or become poisoned and paralyzed", "is knocked prone",
// "or fall unconscious", "be magically charmed". Never one the text only names ("can't be charmed", "immune to").
export function monsterActionConditions(text) {
  const plain = monsterActionPlainText(text);
  const found = [];
  const pattern = new RegExp(String.raw`\b(?:be|become|becomes|is|are|fall|falls|knocked)(?: \w+ly)?(?: knocked)? ${CONDITION}((?:(?:,| and| or|, and) (?:is |be |become )?${CONDITION})*)`, "gi");
  for (const match of plain.matchAll(pattern)) {
    // A condition the sentence only names or asks for ("can't be charmed", "while it is invisible", "if the target is
    // prone") is not an effect.
    const before = plain.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
    if (/\b(?:can't|cannot|immune to|while|if|unless)\b[^.,;]{0,25}$/.test(before)) continue;
    for (const name of match[0].toLowerCase().match(new RegExp(CONDITION, "gi")) || []) {
      const condition = name.toLowerCase();
      if (!found.includes(condition)) found.push(condition);
    }
  }
  return found.slice(0, 3);
}

// How long it lasts: { rounds } (1 minute = 10 rounds), { until: "turn-end" | "turn-start", anchor: "target" | "source" }
// ("until the end of its next turn", "until the end of the dragon's next turn"), or null.
export function monsterActionDuration(text) {
  const plain = monsterActionPlainText(text);
  const timed = plain.match(/\bfor (1|one|\d+) (round|minute|hour)s?\b/i);
  if (timed) {
    const count = /^(1|one)$/i.test(timed[1]) ? 1 : Number(timed[1]);
    const unit = timed[2].toLowerCase();
    return { rounds: unit === "round" ? count : unit === "minute" ? count * 10 : count * 600 };
  }
  const until = plain.match(/\buntil the (end|start) of (its|the target's|the creature's|their|[\w' ]+?'s) next turn/i);
  if (until) {
    const owner = until[2].toLowerCase();
    return { until: until[1].toLowerCase() === "end" ? "turn-end" : "turn-start",
      anchor: ["its", "the target's", "the creature's", "their"].includes(owner) ? "target" : "source" };
  }
  return null;
}

// The repeated save: { timing: "turn-end" | "turn-start", ends: true when a success ends it }, or null.
export function monsterActionRepeat(text) {
  const plain = monsterActionPlainText(text);
  const match = plain.match(/\b(?:can|must) repeat the saving throw at the (end|start) of each of (?:its|their) turns/i);
  if (!match) return null;
  return { timing: match[1].toLowerCase() === "end" ? "turn-end" : "turn-start",
    ends: /ending the effect on (?:itself|themselves|it) on a success/i.test(plain) };
}

// "immune to the dragon's Frightful Presence for the next 24 hours": the hours, or null.
export function monsterActionImmunityHours(text) {
  const match = monsterActionPlainText(text).match(/\bimmune to (?:the |this |that |its |[\w' ]+?'s )?[\w' -]+? for the next (\d+) hours/i);
  return match ? Number(match[1]) : null;
}

// Where an area starts and who it takes: origin "self" (a breath, "within 30 feet of the dragon", a cube) or "point" (a
// sphere "centered on a point"); choice: "each creature of its choice".
export function monsterActionAreaOrigin(text, shape = "") {
  const plain = monsterActionPlainText(text);
  const choice = /\bof (?:its|their|the [\w' -]+?'s) choice\b/i.test(plain);
  let origin = null;
  if (/centered on a point|at a point|on a point (?:it|that it|the [\w' ]+) can see/i.test(plain)) origin = "point";
  // "within 120 feet of the dragon", "of it", "of Arveiaturace": a sphere that is not on a point is the monster's own.
  else if (["cone", "line", "cube"].includes(shape) || /within \d+ feet of\b/i.test(plain)
    || /centered on (?:itself|it|the [\w' -]+)\b/i.test(plain)) origin = "self";
  return { origin, choice };
}

// What a failed save does beyond its damage: { conditions, duration, repeat, immuneHours, endsOnDamage }. Read on the
// failure's sentences (the one with the DC, those opening with "On a failed save") and on what follows them.
export function monsterSaveEffects(text) {
  const plain = monsterActionPlainText(text);
  const sentences = sentencesOf(plain);
  const start = sentences.findIndex((sentence) => SAVE.test(sentence));
  const failure = start < 0 ? "" : [sentences[start], ...sentences.slice(start + 1).filter((sentence) => /^On a fail(?:ed save|ure)/i.test(sentence))].join(" ");
  const after = start < 0 ? plain : sentences.slice(start).join(" ");
  const conditions = monsterActionConditions(failure);
  return {
    conditions,
    duration: conditions.length ? monsterActionDuration(after) : null,
    repeat: monsterActionRepeat(after),
    immuneHours: monsterActionImmunityHours(after),
    endsOnDamage: /\bends? (?:for (?:a|the) creature )?if (?:the|a|that) (?:creature|target) takes (?:any )?damage/i.test(after),
  };
}

// What a hit does beyond its damage: a save ({ ability, dc, half, damage, conditions, duration, repeat }), a grapple
// ({ escapeDC, conditions: the ones while grappled, as "restrained" }), prone, a push in feet. Empty when nothing is read.
export function monsterHitEffects(text) {
  const plain = monsterActionPlainText(text);
  const hit = plain.includes("Hit: ") ? plain.slice(plain.indexOf("Hit: ") + 5) : plain;
  const effects = {};
  const save = hit.match(SAVE);
  if (save) {
    const from = hit.slice(hit.search(SAVE));
    const failed = sentencesOf(from)[0] || "";
    const damage = [...failed.matchAll(DAMAGE)].slice(0, 2).map((match) => ({ type: match[3], formula: match[2].replace(/\s+/g, "").replace("−", "-") }));
    const conditions = monsterActionConditions(failed).filter((condition) => condition !== "grappled");
    effects.save = { ability: ABILITIES[save[2].toLowerCase()], dc: Number(save[1]), half: /half as much damage/i.test(from),
      ...(damage.length ? { damage } : {}), ...(conditions.length ? { conditions } : {}),
      ...(conditions.length && monsterActionDuration(from) ? { duration: monsterActionDuration(from) } : {}),
      ...(monsterActionRepeat(from) ? { repeat: monsterActionRepeat(from) } : {}) };
    if (!damage.length && !conditions.length) delete effects.save;
  }
  const grapple = hit.match(/\bgrappled \(escape DC (\d+)\)/i);
  if (grapple) {
    const whileGrappled = hit.match(new RegExp(String.raw`Until (?:this|the) grapple ends, the (?:target|creature) is ${CONDITION}`, "i"));
    effects.grapple = { escapeDC: Number(grapple[1]), ...(whileGrappled ? { conditions: [whileGrappled[1].toLowerCase()] } : {}) };
  }
  if (!effects.save && /\b(?:is|be) knocked prone\b/i.test(hit)) effects.prone = true;
  const push = hit.match(/\bpushed (?:up to )?(\d+) feet/i);
  if (push) effects.pushFeet = Number(push[1]);
  return effects;
}
