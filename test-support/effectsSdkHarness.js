import { createEffectsDiagnostics } from "../src/effectsDiagnosticsCore.js";
import { createEffectsReconcileQueue } from "../src/effectsReconcilerCore.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function seededEffectsRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export class RandomLatencyEffectsSdk {
  constructor({
    initialTokens = { "token-a": [], "token-b": [], "token-c": [] },
    random = Math.random,
    maxDelayMs = 6,
  } = {}) {
    this.random = random;
    this.maxDelayMs = maxDelayMs;
    this.tokens = new Map(Object.entries(initialTokens).map(([id, effects]) => [id, {
      id,
      version: 0,
      effects: new Set(effects),
    }]));
    this.widgets = new Map();
    this.listeners = new Set();
    this.pendingNotifications = new Set();
    this.operationLog = [];
    this.widgetSequence = 0;
    this.operationSequence = 0;
    this.activeCalls = 0;
    this.maxConcurrentCalls = 0;
  }

  latency() {
    return Math.floor(this.random() * (this.maxDelayMs + 1));
  }

  async pause() {
    await wait(this.latency());
  }

  async runCall(operation) {
    this.activeCalls += 1;
    this.maxConcurrentCalls = Math.max(this.maxConcurrentCalls, this.activeCalls);
    try {
      await this.pause();
      return operation();
    } finally {
      this.activeCalls -= 1;
    }
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(change) {
    for (const listener of this.listeners) {
      const delivery = (async () => {
        await this.pause();
        try {
          await listener(clone(change));
        } catch {}
      })();
      this.pendingNotifications.add(delivery);
      delivery.finally(() => this.pendingNotifications.delete(delivery));
    }
  }

  async setEffect(tokenId, effectId, active) {
    return this.runCall(() => {
      const token = this.tokens.get(tokenId);
      if (!token) throw new Error(`Unknown token: ${tokenId}`);
      if (active) token.effects.add(effectId);
      else token.effects.delete(effectId);
      token.version += 1;
      const operation = {
        seq: ++this.operationSequence,
        tokenId,
        effectId,
        active: active === true,
        version: token.version,
      };
      this.operationLog.push(operation);
      this.emit({ kind: "metadata", tokenIds: [tokenId], operation });
      return clone(operation);
    });
  }

  async getToken(tokenId) {
    return this.runCall(() => {
      const token = this.tokens.get(tokenId);
      if (!token) return null;
      return { id: token.id, version: token.version, effects: [...token.effects].sort() };
    });
  }

  async getWidgets(tokenId) {
    return this.runCall(() => [...this.widgets.values()]
      .filter((widget) => widget.tokenId === tokenId)
      .map((widget) => clone(widget)));
  }

  async addItems(items) {
    return this.runCall(() => {
      const added = items.map((item) => {
        const widget = { ...clone(item), id: `widget-${++this.widgetSequence}` };
        this.widgets.set(widget.id, widget);
        return clone(widget);
      });
      if (added.length) {
        this.emit({ kind: "widgets", tokenIds: [...new Set(added.map((item) => item.tokenId))] });
      }
      return added;
    });
  }

  async updateItems(itemIds, patch) {
    return this.runCall(() => {
      const updated = [];
      for (const itemId of itemIds) {
        const current = this.widgets.get(itemId);
        if (!current) continue;
        const next = { ...current, ...clone(patch) };
        this.widgets.set(itemId, next);
        updated.push(clone(next));
      }
      if (updated.length) {
        this.emit({ kind: "widgets", tokenIds: [...new Set(updated.map((item) => item.tokenId))] });
      }
      return updated;
    });
  }

  async deleteItems(itemIds) {
    return this.runCall(() => {
      const removed = [];
      for (const itemId of itemIds) {
        const widget = this.widgets.get(itemId);
        if (!widget) continue;
        removed.push(clone(widget));
        this.widgets.delete(itemId);
      }
      if (removed.length) {
        this.emit({ kind: "widgets", tokenIds: [...new Set(removed.map((item) => item.tokenId))] });
      }
      return removed;
    });
  }

  tokenIds() {
    return [...this.tokens.keys()];
  }

  snapshot() {
    return {
      tokens: [...this.tokens.values()].map((token) => ({
        id: token.id,
        version: token.version,
        effects: [...token.effects].sort(),
      })),
      widgets: [...this.widgets.values()].map((widget) => clone(widget)),
    };
  }

  async waitForNotifications() {
    for (let iteration = 0; iteration < 300; iteration++) {
      const pending = [...this.pendingNotifications];
      if (!pending.length) return;
      await Promise.allSettled(pending);
    }
    throw new Error("Effects SDK notifications did not become idle");
  }
}

export class EffectsClientHarness {
  constructor({ id, sdk }) {
    this.id = id;
    this.sdk = sdk;
    this.locks = new Set();
    this.revisions = new Map();
    this.pending = new Set();
    this.diagnostics = createEffectsDiagnostics({ enabled: true, clientId: id });
    this.unsubscribe = sdk.onChange((change) => {
      const tasks = (change.tokenIds || []).map((tokenId) =>
        this.requestReconcile(tokenId, change.kind)
      );
      return Promise.allSettled(tasks);
    });
  }

  track(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
    return promise;
  }

  requestReconcile(tokenId, reason = "manual") {
    const revision = (this.revisions.get(tokenId) || 0) + 1;
    this.revisions.set(tokenId, revision);
    return this.track(this.reconcile(tokenId, revision, reason));
  }

  async sdkCall(session, method, requestedItems, operation) {
    this.diagnostics.sdkCall(session, method, { requestedItems });
    try {
      const result = await operation();
      const returnedItems = Array.isArray(result) ? result.length : result ? 1 : 0;
      this.diagnostics.sdkResult(session, method, { returnedItems });
      return result;
    } catch (error) {
      this.diagnostics.sdkError(session, method);
      throw error;
    }
  }

  async reconcile(tokenId, revision, reason) {
    const session = this.diagnostics.beginReconcile("effects-harness", {
      revision,
      targeted: true,
      tokenId,
      reason,
    });
    let outcome = "completed";
    let tokenVersion = null;
    let effectsSeen = 0;
    let widgetsSeen = 0;

    if (this.locks.has(tokenId)) {
      this.diagnostics.lockSkipped(session, { tokenId });
      this.diagnostics.finishReconcile(session, {
        outcome: "lock-skipped",
        tokenId,
        tokenVersion,
        effectsSeen,
        widgetsSeen,
      });
      return;
    }

    this.locks.add(tokenId);
    try {
      const token = await this.sdkCall(session, "getItems", 1, () => this.sdk.getToken(tokenId));
      const widgets = await this.sdkCall(session, "getItems", 0, () => this.sdk.getWidgets(tokenId));
      tokenVersion = token?.version ?? null;
      effectsSeen = token?.effects?.length || 0;
      widgetsSeen = widgets.length;

      if (revision !== this.revisions.get(tokenId)) {
        this.diagnostics.revisionStale(session, {
          tokenId,
          stage: "after-snapshot",
          latestRevision: this.revisions.get(tokenId),
        });
      }

      const expected = new Set(token?.effects || []);
      const byEffect = new Map();
      for (const widget of widgets) {
        if (!byEffect.has(widget.effectId)) byEffect.set(widget.effectId, []);
        byEffect.get(widget.effectId).push(widget);
      }

      const deleteIds = [];
      const updateIds = [];
      const addItems = [];

      for (const [effectId, matches] of byEffect) {
        matches.sort((left, right) => left.id.localeCompare(right.id));
        if (!expected.has(effectId)) {
          deleteIds.push(...matches.map((widget) => widget.id));
          continue;
        }
        const [keeper, ...duplicates] = matches;
        deleteIds.push(...duplicates.map((widget) => widget.id));
        if (keeper?.tokenVersion !== tokenVersion) updateIds.push(keeper.id);
      }

      for (const effectId of expected) {
        if (!byEffect.has(effectId)) {
          addItems.push({ tokenId, effectId, tokenVersion, renderedBy: this.id });
        }
      }

      if (deleteIds.length) {
        const removed = await this.sdkCall(
          session,
          "deleteItems",
          deleteIds.length,
          () => this.sdk.deleteItems(deleteIds)
        );
        this.diagnostics.widgetMutation(session, "deleted", removed.length);
      }
      if (addItems.length) {
        const added = await this.sdkCall(
          session,
          "addItems",
          addItems.length,
          () => this.sdk.addItems(addItems)
        );
        this.diagnostics.widgetMutation(session, "added", added.length);
      }
      if (updateIds.length) {
        const updated = await this.sdkCall(
          session,
          "updateItems",
          updateIds.length,
          () => this.sdk.updateItems(updateIds, { tokenVersion, renderedBy: this.id })
        );
        this.diagnostics.widgetMutation(session, "updated", updated.length);
      }

      if (revision !== this.revisions.get(tokenId)) {
        this.diagnostics.revisionStale(session, {
          tokenId,
          stage: "complete",
          latestRevision: this.revisions.get(tokenId),
        });
      }
    } catch (error) {
      outcome = "failed";
      throw error;
    } finally {
      this.locks.delete(tokenId);
      this.diagnostics.finishReconcile(session, {
        outcome,
        tokenId,
        tokenVersion,
        effectsSeen,
        widgetsSeen,
      });
    }
  }

  async waitForIdle() {
    for (let iteration = 0; iteration < 300; iteration++) {
      const pending = [...this.pending];
      if (!pending.length) return;
      await Promise.allSettled(pending);
    }
    throw new Error(`Effects client ${this.id} did not become idle`);
  }

  close() {
    this.unsubscribe?.();
  }
}

class CoordinatedEffectsWriterHarness extends EffectsClientHarness {
  constructor({ id, sdk }) {
    super({ id, sdk });
    this.unsubscribe?.();
    this.queue = createEffectsReconcileQueue({
      run: async (batch) => {
        for (const tokenId of batch.conditions) {
          const revision = (this.revisions.get(tokenId) || 0) + 1;
          this.revisions.set(tokenId, revision);
          await this.reconcile(tokenId, revision, "metadata");
        }
      },
    });
    this.unsubscribe = sdk.onChange((change) => {
      if (change.kind !== "metadata") return undefined;
      return this.queue.request({ conditions: change.tokenIds || [] }).done;
    });
  }

  async waitForIdle() {
    await this.queue.idle();
    await super.waitForIdle();
  }
}

class PassiveEffectsClientHarness {
  constructor({ id, sdk }) {
    this.id = id;
    this.pending = new Set();
    this.metadataEvents = 0;
    this.widgetEvents = 0;
    this.unsubscribe = sdk.onChange((change) => {
      if (change.kind === "metadata") this.metadataEvents += 1;
      if (change.kind === "widgets") this.widgetEvents += 1;
    });
  }

  async waitForIdle() {}

  close() {
    this.unsubscribe?.();
  }
}

export function compareEffectsSnapshot(snapshot) {
  const expected = new Set();
  for (const token of snapshot.tokens) {
    for (const effectId of token.effects) expected.add(`${token.id}|${effectId}`);
  }

  const counts = new Map();
  for (const widget of snapshot.widgets) {
    const signature = `${widget.tokenId}|${widget.effectId}`;
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }

  const missing = [...expected].filter((signature) => !counts.has(signature));
  const duplicates = [...counts.entries()]
    .filter(([signature, count]) => expected.has(signature) && count > 1)
    .map(([signature, count]) => ({ signature, count }));
  const orphans = [...counts.keys()].filter((signature) => !expected.has(signature));
  return {
    consistent: missing.length === 0 && duplicates.length === 0 && orphans.length === 0,
    expectedWidgets: expected.size,
    actualWidgets: snapshot.widgets.length,
    missing,
    duplicates,
    orphans,
  };
}

async function settleEffectsSdk(sdk, clients) {
  for (let iteration = 0; iteration < 300; iteration++) {
    await sdk.waitForNotifications();
    await Promise.all(clients.map((client) => client.waitForIdle()));
    await sdk.waitForNotifications();
    if (
      sdk.pendingNotifications.size === 0 &&
      clients.every((client) => client.pending.size === 0)
    ) {
      await wait(1);
      if (
        sdk.pendingNotifications.size === 0 &&
        clients.every((client) => client.pending.size === 0)
      ) return;
    }
  }
  throw new Error("Effects SDK harness did not become idle");
}

export async function runEffectsStressScenario({ seed = 1, mutationCount = 16 } = {}) {
  if (mutationCount < 10 || mutationCount > 20) {
    throw new RangeError("mutationCount must be between 10 and 20");
  }

  const random = seededEffectsRandom(seed);
  const sdk = new RandomLatencyEffectsSdk({
    random: seededEffectsRandom(seed ^ 0x9e3779b9),
  });
  const clients = [
    new EffectsClientHarness({ id: "client-a", sdk }),
    new EffectsClientHarness({ id: "client-b", sdk }),
  ];
  const tokenIds = sdk.tokenIds();
  const effectIds = [
    "condition:accecato",
    "condition:prono",
    "spell:velocita",
    "spell:invisibilita",
  ];
  const writes = [];

  for (let index = 0; index < mutationCount - 1; index++) {
    const tokenId = tokenIds[Math.floor(random() * tokenIds.length)];
    const effectId = effectIds[Math.floor(random() * effectIds.length)];
    const active = index % 4 === 0 ? true : index % 4 === 1 ? false : random() >= 0.45;
    writes.push(sdk.setEffect(tokenId, effectId, active));
    if (random() < 0.45) await sdk.pause();
  }
  await Promise.all(writes);

  // Ultima intenzione deterministica: garantisce almeno un widget atteso.
  await sdk.setEffect("token-a", "spell:velocita", true);
  await settleEffectsSdk(sdk, clients);

  const beforeFinalSweep = compareEffectsSnapshot(sdk.snapshot());

  // Watchdog diagnostico esplicito: non nasconde lo stato precedente, che resta
  // nel report, ma permette al test di verificare anche la convergenza finale.
  for (const client of clients) {
    await Promise.all(tokenIds.map((tokenId) => client.requestReconcile(tokenId, "final-sweep")));
    await settleEffectsSdk(sdk, clients);
  }

  const snapshot = sdk.snapshot();
  const finalState = compareEffectsSnapshot(snapshot);
  const report = {
    seed,
    mutationCount,
    clientCount: clients.length,
    operationLog: clone(sdk.operationLog),
    beforeFinalSweep,
    finalState,
    sdk: {
      maxConcurrentCalls: sdk.maxConcurrentCalls,
      widgets: snapshot.widgets.length,
    },
    clients: clients.map((client) => client.diagnostics.summary()),
  };

  for (const client of clients) client.close();
  return report;
}

export async function runCoordinatedEffectsStressScenario({ seed = 1, mutationCount = 16 } = {}) {
  if (mutationCount < 10 || mutationCount > 20) {
    throw new RangeError("mutationCount must be between 10 and 20");
  }

  const random = seededEffectsRandom(seed);
  const sdk = new RandomLatencyEffectsSdk({
    random: seededEffectsRandom(seed ^ 0x85ebca6b),
  });
  const writer = new CoordinatedEffectsWriterHarness({ id: "gm-background", sdk });
  const observer = new PassiveEffectsClientHarness({ id: "player-client", sdk });
  const clients = [writer, observer];
  const tokenIds = sdk.tokenIds();
  const effectIds = [
    "condition:accecato",
    "condition:prono",
    "spell:velocita",
    "spell:invisibilita",
  ];
  const writes = [];

  for (let index = 0; index < mutationCount - 1; index += 1) {
    const tokenId = tokenIds[Math.floor(random() * tokenIds.length)];
    const effectId = effectIds[Math.floor(random() * effectIds.length)];
    const active = index % 4 === 0 ? true : index % 4 === 1 ? false : random() >= 0.45;
    writes.push(sdk.setEffect(tokenId, effectId, active));
    if (random() < 0.45) await sdk.pause();
  }
  await Promise.all(writes);
  await sdk.setEffect("token-a", "spell:velocita", true);
  await settleEffectsSdk(sdk, clients);

  const snapshot = sdk.snapshot();
  const report = {
    seed,
    mutationCount,
    finalState: compareEffectsSnapshot(snapshot),
    operationLog: clone(sdk.operationLog),
    writer: writer.diagnostics.summary(),
    observer: {
      metadataEvents: observer.metadataEvents,
      widgetEvents: observer.widgetEvents,
    },
    renderedBy: [...new Set(snapshot.widgets.map((widget) => widget.renderedBy).filter(Boolean))],
    queue: writer.queue.getState(),
  };

  for (const client of clients) client.close();
  return report;
}
