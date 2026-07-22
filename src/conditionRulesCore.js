const CONDITION_LABELS = Object.freeze({
  incapacitato: "Incapacitato",
  prono: "Prono",
});

const CONTINUOUS_IMPLICATIONS = Object.freeze(new Map([
  ["paralizzato", Object.freeze(["Incapacitato"])],
  ["pietrificato", Object.freeze(["Incapacitato"])],
  ["privo di sensi", Object.freeze(["Incapacitato"])],
  ["stordito", Object.freeze(["Incapacitato"])],
]));

export function conditionKey(value) {
  const name = value && typeof value === "object"
    ? value.condition || value.name
    : value;
  return String(name || "").trim().toLocaleLowerCase("it");
}

function activeInstances(instances) {
  return (Array.isArray(instances) ? instances : [])
    .filter((instance) => instance && instance.active !== false && conditionKey(instance));
}

export function hasEffectiveCondition(instances, conditionName) {
  const wanted = conditionKey(conditionName);
  if (!wanted) return false;
  return getEffectiveConditionInstances(instances)
    .some((instance) => conditionKey(instance) === wanted);
}

export function getEffectiveConditionInstances(instances = []) {
  const explicit = activeInstances(instances).map((instance) => ({ ...instance }));
  const explicitKeys = new Set(explicit.map(conditionKey));
  const effective = [...explicit];
  const derivedByKey = new Map();
  const queue = [...explicit];

  while (queue.length) {
    const parent = queue.shift();
    const implied = CONTINUOUS_IMPLICATIONS.get(conditionKey(parent)) || [];
    for (const childName of implied) {
      const childKey = conditionKey(childName);
      if (!childKey || explicitKeys.has(childKey)) continue;

      const existing = derivedByKey.get(childKey);
      if (existing) {
        const parentId = String(parent.id || "").trim();
        if (parentId && !existing.derivedFromInstanceIds.includes(parentId)) {
          existing.derivedFromInstanceIds.push(parentId);
        }
        continue;
      }

      const parentId = String(parent.id || "").trim();
      const derived = {
        ...parent,
        id: `derived:${childKey}`,
        condition: CONDITION_LABELS[childKey] || childName,
        active: true,
        derived: true,
        derivedFromInstanceIds: parentId ? [parentId] : [],
      };
      delete derived.legacy;
      derivedByKey.set(childKey, derived);
      effective.push(derived);
      queue.push(derived);
    }
  }

  return effective;
}

export function getConditionEntryAdditions(beforeInstances = [], afterInstances = []) {
  const before = activeInstances(beforeInstances);
  const after = activeInstances(afterInstances);
  const enteredUnconscious = !before.some((instance) => conditionKey(instance) === "privo di sensi")
    && after.some((instance) => conditionKey(instance) === "privo di sensi");
  const alreadyProne = after.some((instance) => conditionKey(instance) === "prono");
  if (!enteredUnconscious || alreadyProne) return [];

  const trigger = after.find((instance) => conditionKey(instance) === "privo di sensi");
  return [{ condition: "Prono", triggeredBy: trigger || null }];
}
