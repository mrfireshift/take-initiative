export function preserveConditionTimingMetadata(instance, storedValue) {
  const next = { ...(instance || {}) };
  const raw = storedValue && typeof storedValue === "object" ? storedValue : {};

  if (
    raw?.expiry?.anchor === "next-turn" &&
    (next?.expiry?.mode === "turn-start" || next?.expiry?.mode === "turn-end")
  ) {
    next.expiry = { ...next.expiry, anchor: "next-turn" };
  }

  const turnKey = String(raw?.appliedAt?.turnKey || "").trim();
  if (turnKey && next.appliedAt) {
    next.appliedAt = { ...next.appliedAt, turnKey };
  }

  if (raw.endsParentOnRemoval === true) {
    next.endsParentOnRemoval = true;
  }
  if (raw.parentRemoval === "target" || raw.parentRemoval === "spell") {
    next.parentRemoval = raw.parentRemoval;
  }
  if (raw.parentEndCondition && typeof raw.parentEndCondition === "object") {
    next.parentEndCondition = { ...raw.parentEndCondition };
  }

  if (Array.isArray(raw.saveReminder)) {
    const reminders = raw.saveReminder
      .filter((value) => value && typeof value === "object")
      .map((value) => ({ ...value }));
    if (reminders.length) next.saveReminder = reminders;
  } else if (raw.saveReminder && typeof raw.saveReminder === "object") {
    next.saveReminder = { ...raw.saveReminder };
  }

  return next;
}
