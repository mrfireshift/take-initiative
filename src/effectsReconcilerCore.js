function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function createPendingBatch() {
  return {
    full: false,
    conditions: new Set(),
    concentration: new Set(),
  };
}

function hasPendingWork(pending) {
  return pending.full || pending.conditions.size > 0 || pending.concentration.size > 0;
}

export function isEffectsWidgetWriterRole(role) {
  return String(role || "").trim().toUpperCase() === "GM";
}

export function isEffectsLocalRendererRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  return normalized === "GM" || normalized === "PLAYER";
}

export function createEffectsReconcileQueue({
  run,
  scheduleTask = (callback) => queueMicrotask(callback),
} = {}) {
  if (typeof run !== "function") throw new TypeError("run must be a function");

  let pending = createPendingBatch();
  let scheduled = false;
  let running = false;
  let latestRevision = 0;
  let completedRevision = 0;
  const waiters = [];
  const idleWaiters = [];

  function settleRevisionWaiters(revision, error = null) {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.revision > revision) continue;
      waiters.splice(index, 1);
      if (error) waiter.reject(error);
      else waiter.resolve({ revision: waiter.revision, completedRevision: revision });
    }
  }

  function settleIdleWaiters() {
    if (running || scheduled || hasPendingWork(pending)) return;
    for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function takePending() {
    const batch = {
      full: pending.full,
      conditions: [...pending.conditions],
      concentration: [...pending.concentration],
      revision: latestRevision,
    };
    pending = createPendingBatch();
    return batch;
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (hasPendingWork(pending)) {
        const batch = takePending();
        let error = null;
        try {
          await run(batch, {
            revision: batch.revision,
            isStale: () => batch.revision < latestRevision,
          });
        } catch (caught) {
          error = caught;
        }
        completedRevision = Math.max(completedRevision, batch.revision);
        settleRevisionWaiters(batch.revision, error);
      }
    } finally {
      running = false;
      if (hasPendingWork(pending)) scheduleDrain();
      else settleIdleWaiters();
    }
  }

  function scheduleDrain() {
    if (running || scheduled) return;
    scheduled = true;
    scheduleTask(() => {
      scheduled = false;
      void drain();
    });
  }

  function request({ full = false, conditions = [], concentration = [] } = {}) {
    pending.full ||= full === true;
    for (const id of normalizeIds(conditions)) pending.conditions.add(id);
    for (const id of normalizeIds(concentration)) pending.concentration.add(id);

    if (!hasPendingWork(pending)) {
      return { revision: latestRevision, done: Promise.resolve({ revision: latestRevision }) };
    }

    const revision = ++latestRevision;
    const done = new Promise((resolve, reject) => {
      waiters.push({ revision, resolve, reject });
    });
    scheduleDrain();
    return { revision, done };
  }

  function idle() {
    if (!running && !scheduled && !hasPendingWork(pending)) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  return {
    request,
    idle,
    getState: () => ({
      running,
      scheduled,
      latestRevision,
      completedRevision,
      pending: {
        full: pending.full,
        conditions: [...pending.conditions],
        concentration: [...pending.concentration],
      },
    }),
  };
}

function collectCasterIds(value, output) {
  if (Array.isArray(value)) {
    for (const entry of value) collectCasterIds(entry, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  const casterId = String(value.casterId || "").trim();
  if (casterId) output.add(casterId);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") collectCasterIds(nested, output);
  }
}

export function collectEffectsInvalidation(event, {
  metaKey,
  spellsKey,
} = {}) {
  const conditions = new Set();
  const concentration = new Set();
  const changedItems = [
    ...(Array.isArray(event?.items) ? event.items : []),
    ...(Array.isArray(event?.removedItems) ? event.removedItems : []),
  ];

  for (const item of changedItems) {
    const pluginMeta = item?.metadata?.[metaKey];
    if (!item?.id || !pluginMeta || typeof pluginMeta !== "object") continue;
    if (event?.flags?.conditions) conditions.add(item.id);
    if (event?.flags?.concentration) {
      concentration.add(item.id);
      collectCasterIds(pluginMeta?.[spellsKey], concentration);
    }
  }

  const movementChanged = event?.flags?.movement === true;
  const effectsFlagged = !!(
    movementChanged
    || event?.flags?.conditions
    || event?.flags?.concentration
  );
  return {
    full: movementChanged
      || (effectsFlagged && conditions.size === 0 && concentration.size === 0),
    conditions: [...conditions],
    concentration: [...concentration],
  };
}

export function conditionLabelNeedsUpdate(widget, desired) {
  if (!widget || widget.type !== "LABEL") return true;
  const text = widget.text || {};
  const textStyle = text.style || {};
  const style = widget.style || {};
  const position = widget.position || {};

  return widget.attachedTo !== desired.targetId ||
    widget.layer !== "TEXT" ||
    widget.locked !== true ||
    widget.disableHit !== true ||
    position.x !== desired.x ||
    position.y !== desired.y ||
    text.width !== desired.width ||
    text.height !== desired.height ||
    text.type !== "PLAIN" ||
    text.plainText !== desired.label ||
    style.backgroundColor !== desired.backgroundColor ||
    style.backgroundOpacity !== desired.backgroundOpacity ||
    style.cornerRadius !== desired.height / 2 ||
    style.maxViewScale !== desired.maxViewScale ||
    style.pointerWidth !== 0 ||
    style.pointerHeight !== 0 ||
    style.pointerDirection !== "LEFT" ||
    textStyle.padding !== 0 ||
    textStyle.fontFamily !== desired.fontFamily ||
    textStyle.fontSize !== desired.fontSize ||
    textStyle.fontWeight !== desired.fontWeight ||
    textStyle.lineHeight !== desired.lineHeight ||
    textStyle.textAlign !== "CENTER" ||
    textStyle.textAlignVertical !== "MIDDLE" ||
    textStyle.fillColor !== desired.textFill ||
    textStyle.fillOpacity !== 1 ||
    textStyle.strokeColor !== desired.textStroke ||
    textStyle.strokeWidth !== desired.textStrokeWidth ||
    widget.zIndex !== desired.zIndex;
}
