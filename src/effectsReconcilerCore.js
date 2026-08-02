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

function batchItemIds(batch) {
  return new Set([
    ...(batch?.conditions || []),
    ...(batch?.concentration || []),
  ]);
}

function batchCoversRequest(batch, request) {
  if (!batch) return false;
  if (batch.full) return true;
  if (request.full) return false;
  const covered = batchItemIds(batch);
  const requested = batchItemIds(request);
  return requested.size > 0 && [...requested].every((id) => covered.has(id));
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
  let activeBatch = null;
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
        activeBatch = batch;
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
        activeBatch = null;
      }
    } finally {
      activeBatch = null;
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

  function request({
    full = false,
    conditions = [],
    concentration = [],
    joinCovered = false,
  } = {}) {
    const normalizedRequest = {
      full: full === true,
      conditions: normalizeIds(conditions),
      concentration: normalizeIds(concentration),
    };

    if (joinCovered && batchCoversRequest(pending, normalizedRequest)) {
      const revision = latestRevision;
      const done = new Promise((resolve, reject) => {
        waiters.push({ revision, resolve, reject });
      });
      return { revision, done, joined: true };
    }
    if (
      joinCovered
      && !hasPendingWork(pending)
      && batchCoversRequest(activeBatch, normalizedRequest)
    ) {
      const revision = activeBatch.revision;
      const done = new Promise((resolve, reject) => {
        waiters.push({ revision, resolve, reject });
      });
      return { revision, done, joined: true };
    }

    pending.full ||= normalizedRequest.full;
    for (const id of normalizedRequest.conditions) pending.conditions.add(id);
    for (const id of normalizedRequest.concentration) pending.concentration.add(id);

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
      active: activeBatch ? {
        full: activeBatch.full,
        conditions: [...activeBatch.conditions],
        concentration: [...activeBatch.concentration],
        revision: activeBatch.revision,
      } : null,
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

function collectAssignmentIds(value, output) {
  if (Array.isArray(value)) {
    for (const entry of value) collectAssignmentIds(entry, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  const casterId = String(value.casterId || "").trim();
  if (casterId) output.add(casterId);
  for (const field of ["targets", "targetIds"]) {
    for (const targetId of Array.isArray(value[field]) ? value[field] : []) {
      const id = String(targetId || "").trim();
      if (id) output.add(id);
    }
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") collectAssignmentIds(nested, output);
  }
}

export function collectEffectsInvalidation(event, {
  metaKey,
  spellsKey,
  concentrationKey,
} = {}) {
  const conditions = new Set();
  const concentration = new Set();
  const changedRecords = Array.isArray(event?.changedRecords)
    ? event.changedRecords
    : [];
  let movementChanged = false;

  if (changedRecords.length) {
    for (const record of changedRecords) {
      const recordFlags = record?.flags || {};
      movementChanged ||= recordFlags.movement === true;
      const recordItems = [record?.before?.item, record?.after?.item].filter(Boolean);
      const item = recordItems.at(-1);
      if (!item?.id) continue;
      if (recordFlags.conditions) conditions.add(item.id);
      if (recordFlags.concentration) {
        concentration.add(item.id);
        for (const recordItem of recordItems) {
          const pluginMeta = recordItem?.metadata?.[metaKey];
          if (!pluginMeta || typeof pluginMeta !== "object") continue;
          collectAssignmentIds(pluginMeta?.[spellsKey], concentration);
          if (concentrationKey) {
            collectAssignmentIds(pluginMeta?.[concentrationKey], concentration);
          }
        }
      }
    }
  }

  const changedItems = [
    ...(Array.isArray(event?.items) ? event.items : []),
    ...(Array.isArray(event?.removedItems) ? event.removedItems : []),
  ];

  if (!changedRecords.length) {
    movementChanged = event?.flags?.movement === true;
    for (const item of changedItems) {
      const pluginMeta = item?.metadata?.[metaKey];
      if (!item?.id || !pluginMeta || typeof pluginMeta !== "object") continue;
      if (event?.flags?.conditions) conditions.add(item.id);
      if (event?.flags?.concentration) {
        concentration.add(item.id);
        collectAssignmentIds(pluginMeta?.[spellsKey], concentration);
        if (concentrationKey) {
          collectAssignmentIds(pluginMeta?.[concentrationKey], concentration);
        }
      }
    }
  }

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
