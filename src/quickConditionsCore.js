// Quick conditions of the card's right-click menu (lot 6.6): the conditions a GM sets at the table, one click to add
// or remove. Every applicable condition of conditions.js except Pietrificato (rare); Indebolimento belongs to the
// character sheet and Ira is the Barbarian's class feature, so neither is a quick condition. Pure: the menu page and
// the menu protocol use it without the OBR SDK.
export const QUICK_CONDITION_LIST = Object.freeze([
  "Accecato",
  "Affascinato",
  "Afferrato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Invisibile",
  "Paralizzato",
  "Privo di sensi",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
]);

function conditionKey(name) {
  return String(name || "").trim().toLocaleLowerCase("it");
}

export function isQuickCondition(name) {
  return QUICK_CONDITION_LIST.includes(name);
}

// scope: [{ id, conditions: ["Prono", ...] }], one entry per creature the menu acts on.
function holders(scope, name) {
  const key = conditionKey(name);
  return (Array.isArray(scope) ? scope : []).filter((member) =>
    (Array.isArray(member?.conditions) ? member.conditions : []).some((condition) => conditionKey(condition) === key)
  );
}

// "on" when every creature of the scope has the condition, "mixed" when only some do, "off" otherwise.
export function quickConditionState(scope, name) {
  const members = (Array.isArray(scope) ? scope : []).filter((member) => member?.id);
  if (!members.length) return "off";
  const count = holders(members, name).length;
  if (!count) return "off";
  return count === members.length ? "on" : "mixed";
}

export function quickConditionMenuEntries(scope, emojiByName = {}) {
  return QUICK_CONDITION_LIST.map((name) => ({
    name,
    emoji: String(emojiByName?.[name] || ""),
    state: quickConditionState(scope, name),
  }));
}

// What a click does: when every creature has the condition it comes off all of them; otherwise it goes on the ones
// that lack it (a per-creature toggle would turn a mixed group the other way round).
export function quickConditionToggleTargets(scope, name) {
  const members = (Array.isArray(scope) ? scope : []).filter((member) => member?.id);
  const withIt = new Set(holders(members, name).map((member) => member.id));
  if (members.length && withIt.size === members.length) {
    return { mode: "remove", targetIds: members.map((member) => member.id) };
  }
  return { mode: "add", targetIds: members.filter((member) => !withIt.has(member.id)).map((member) => member.id) };
}
