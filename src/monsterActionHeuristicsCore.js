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
  // The 2024 wording (fase 3, lotto 6): "has the Poisoned condition", "has the Grappled condition (escape DC 13)", "has the
  // Blinded and Deafened conditions"; never a choice ("the Charmed or Poisoned condition (pixie's choice)").
  const pattern2024 = new RegExp(String.raw`\bha(?:s|ve) the ${CONDITION}(?:(?:,| and|, and) ${CONDITION})* conditions?\b`, "gi");
  for (const match of [...plain.matchAll(pattern), ...plain.matchAll(pattern2024)].sort((left, right) => left.index - right.index)) {
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
  // 2014 "can repeat the saving throw at the end of each of its turns"; 2024 "repeats the save at the end of each of its
  // turns", "At the end of each of its turns, the target repeats the save".
  const match = plain.match(/\b(?:(?:can|must) repeat the saving throw|repeats the save) at the (end|start) of each of (?:its|their) turns/i)
    || plain.match(/\bAt the (end|start) of each of (?:its|their) turns, the (?:target|creature) repeats the save/i);
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

// The 2024 save as the book prints it (fase 3, lotto 6): "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone.
// Failure: 66 (12d10) Fire damage. Success: Half damage." Read by its labels: the targets, the failure (the first one when
// there are two), the success; what the fields hold leaves the reading, the rest (a second failure, a failure by 5 or
// more, "Failure or Success:", a sentence not understood) is the note. Null without a 2024 save.
const SAVE_2024 = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/;
const SAVE_2024_LABEL = /\b(Failure:|First Failure:|Second Failure:|Third Failure:|Failure \d+:|Failure by \d+ or More:|Success:|Failure or Success:)/;
const SAVE_2024_REPEAT = String.raw`(?:(?:and )?(?:it )?repeats the save at the (?:end|start) of each of (?:its|their) turns|At the (?:end|start) of each of (?:its|their) turns, the (?:target|creature) repeats the save), ending the effect on (?:itself|themselves|it) on a success`;
// A failure's sentence the fields hold all of: its damage, its conditions, their duration, the repeated save that ends them.
function save2024Understood(sentence) {
  return sentence.replace(DAMAGE, "")
    .replace(/\bha(?:s|ve) the \w+(?:(?:,| and|, and) \w+)* conditions?/gi, "")
    .replace(/\buntil the (?:end|start) of [\w' ]+? next turn\b|\bfor (?:1|one|\d+) (?:round|minute|hour)s?\b/gi, "")
    .replace(new RegExp(SAVE_2024_REPEAT, "gi"), "")
    .replace(/\b(?:plus|and|the target|it)\b|[,.]/gi, "").trim() === "";
}

export function monsterSave2024(text) {
  const plain = monsterActionPlainText(text);
  const head = plain.match(SAVE_2024);
  if (!head) return null;
  const pieces = plain.slice(head.index + head[0].length).split(new RegExp(SAVE_2024_LABEL.source, "g"));
  let failure = "", success = "";
  const others = [];
  for (let index = 1; index < pieces.length; index += 2) {
    const label = pieces[index], body = (pieces[index + 1] || "").trim();
    if (["Failure:", "First Failure:"].includes(label) && !failure) failure = body;
    else if (label === "Success:" && !success) success = body;
    else others.push(`${label} ${body}`);
  }
  const sentences = sentencesOf(failure);
  const damage = [...(sentences[0] || "").matchAll(DAMAGE)].slice(0, 3).map((match) => ({ type: match[3].toLowerCase(), formula: match[2].replace(/\s+/g, "").replace("−", "-") }));
  // Never a condition only in some cases ("While grafted, …", "If the target …"), once swallowed or engulfed, nor the
  // monster's own ("until the beholder has the Incapacitated condition").
  const own = sentences.filter((sentence) => !/^(?:While|If|Whenever|Otherwise)\b/i.test(sentence) && !/\bswallow|\bengulf/i.test(sentence))
    .map((sentence) => sentence.replace(/\b(?:or )?until (?:the|this|that) [\w'-]+(?: [\w'-]+)? has the \w+ condition\b/gi, ""));
  const conditions = [...new Set(own.flatMap((sentence) => monsterActionConditions(sentence)))].slice(0, 3);
  const conditionSentence = own.find((sentence) => monsterActionConditions(sentence).length);
  const repeat = monsterActionRepeat(failure);
  // The success's own immunity: "The target is immune to this ghast's Stench for 24 hours" ("for 1 hour").
  const immunity = success.match(/\bimmune to (?:the |this |that |its |[\w' ]+?'s )?[\w' -]+? for (?:the next )?(\d+) hours?\b/i);
  const immuneHours = immunity ? Number(immunity[1]) : null;
  const half = /^Half damage\b/i.test(success);
  const failureLeft = sentences.filter((sentence) => sentence && !save2024Understood(sentence));
  const successLeft = sentencesOf(success.replace(/^Half damage(?: only)?(?:\.\s*|,\s*and\s+)?/i, ""))
    .filter((sentence) => sentence && !(immuneHours && /\bimmune to\b/i.test(sentence)));
  const note = [
    ...(failureLeft.length ? [`Failure: ${failureLeft.join(" ")}`] : []),
    ...(successLeft.join(" ").trim() ? [`Success: ${successLeft.join(" ").trim().replace(/^./, (letter) => letter.toUpperCase())}`] : []),
    ...others,
  ].join(" ");
  return {
    ability: ABILITIES[head[1].toLowerCase()], dc: Number(head[2]), before: plain.slice(0, head.index).trim(),
    targets: (pieces[0] || "").replace(/^[,.]\s*/, "").replace(/\.$/, "").trim(),
    half, damage, conditions,
    duration: conditionSentence ? monsterActionDuration(conditionSentence) : null,
    repeat, immuneHours,
    endsOnDamage: /\bends? (?:for (?:a|the) creature )?if (?:the|a|that) (?:creature|target) takes (?:any )?damage/i.test(failure),
    note,
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
  } else {
    // The 2024 save in a hit (fase 3, lotto 6): "Constitution Saving Throw: DC 10. Failure: The target has the Paralyzed
    // condition until the end of its next turn."
    // Never one after "Hit or Miss:" (the dao's Earth Burst): it takes an area, hit or not, and stays in the note.
    const read = /\bHit or Miss:/.test(hit) ? null : monsterSave2024(hit);
    if (read && (read.damage.length || read.conditions.length)) {
      effects.save = { ability: read.ability, dc: read.dc, half: read.half, ...(read.damage.length ? { damage: read.damage.slice(0, 2) } : {}),
        ...(read.conditions.length ? { conditions: read.conditions } : {}), ...(read.conditions.length && read.duration ? { duration: read.duration } : {}),
        ...(read.repeat ? { repeat: read.repeat } : {}) };
    }
  }
  // A 2024 condition only in some cases the table judges ("moved 20+ feet straight toward it immediately before the hit",
  // "had Advantage on the attack roll", "if it is already …", "If this damage reduces the target to 0 Hit Points") is
  // never applied by itself: it stays in the note.
  const guarded = (sentence) => /\bmoved\b|\battack roll\b|\balready\b|\b0 Hit Points\b/i.test(sentence);
  const sentences = sentencesOf(hit).filter((sentence) => !SAVE.test(sentence) && !guarded(sentence));
  const unguarded = sentences.join(" ");
  // 2014 "grappled (escape DC 16)", 2024 "has the Grappled condition (escape DC 14)".
  const grapple = hit.match(/\bgrappled(?: condition)? \(escape DC (\d+)\)/i);
  // What lasts while held ("Until this grapple ends, the target is restrained", "has the Blinded and Restrained conditions
  // until the grapple ends", "While Grappled, the target has the Restrained condition"): every condition of that
  // sentence, never a condition of its own.
  const whileHeld = (sentence) => /\bgrapple ends\b|\bWhile Grappled\b/i.test(sentence);
  if (grapple) {
    const whileGrappled = sentencesOf(hit).filter((sentence) => whileHeld(sentence) && !SAVE.test(sentence)).flatMap((sentence) => monsterActionConditions(sentence)).filter((condition) => condition !== "grappled");
    effects.grapple = { escapeDC: Number(grapple[1]), ...(whileGrappled.length ? { conditions: [...new Set(whileGrappled)] } : {}) };
  }
  if (!effects.save && (/\b(?:is|be) knocked prone\b/i.test(hit) || /\bha(?:s|ve) the Prone condition\b/i.test(unguarded))) effects.prone = true;
  // Any other condition the hit gives by itself, with its duration, in the 2024 words only ("has the Poisoned condition
  // until the end of the target's next turn"): never the grapple's, never prone, never in a hit with a saving throw (what
  // follows depends on it: "Until this poison ends, the target is paralyzed"), never once swallowed.
  const held = new Set(["grappled", "prone", ...(effects.grapple?.conditions || [])]);
  // Never what lasts only while something else does ("While the cloaker is attached, the target has the Blinded condition").
  const own = (sentence) => /\bha(?:s|ve) the \w+(?:(?:,| and|, and) \w+)* conditions?\b/i.test(sentence) && !whileHeld(sentence)
    && !/\bswallow/i.test(sentence) && !/^While\b/i.test(sentence.trim());
  const direct = /\bsaving throw\b/i.test(hit) ? [] : sentences.filter(own).flatMap((sentence) => monsterActionConditions(sentence).filter((condition) => !held.has(condition))
    .map((condition) => ({ condition, sentence })));
  if (direct.length) {
    const names = [...new Set(direct.map((entry) => entry.condition))].slice(0, 3);
    const duration = monsterActionDuration(direct[0].sentence);
    effects.conditions = names;
    if (duration) effects.duration = duration;
  }
  const push = hit.match(/\bpushed (?:up to )?(\d+) feet/i);
  if (push) effects.pushFeet = Number(push[1]);
  return effects;
}
