import {
  advanceInitiativeState,
  createSerialProcessor,
  initiativeStateDigest,
  isCurrentRenderRevision,
} from "../src/initiativeRenderCore.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const activeId = (state) => state?.order?.[state.current] ?? null;

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RandomLatencyInitiativeSdk {
  constructor({ initialState, random, maxDelayMs = 7 }) {
    this.state = clone(initialState);
    this.random = random;
    this.maxDelayMs = maxDelayMs;
    this.metadataListeners = new Set();
  }

  latency() {
    return Math.floor(this.random() * (this.maxDelayMs + 1));
  }

  async pause() {
    await wait(this.latency());
  }

  onMetadataChange(listener) {
    this.metadataListeners.add(listener);
    return () => this.metadataListeners.delete(listener);
  }

  async setState(state) {
    await this.pause();
    this.state = clone(state);
    const snapshot = clone(this.state);
    for (const listener of this.metadataListeners) listener(snapshot);
    if (this.random() < 0.35) {
      await this.pause();
      for (const listener of this.metadataListeners) listener(clone(snapshot));
    }
  }

  async select(itemId) {
    await this.pause();
    return itemId;
  }

  async setLabel(itemId) {
    await this.pause();
    return itemId ? `Turno di ${itemId}` : null;
  }
}

export class InitiativeSdkHarness {
  constructor({ initialState, sdk, navigationSettleMs = 2 }) {
    this.sdk = sdk;
    this.visualState = clone(initialState);
    this.confirmedState = clone(initialState);
    this.navigationSettleMs = navigationSettleMs;
    this.navigationRevision = 0;
    this.renderRevision = 0;
    this.latestRenderRevision = 0;
    this.lastQueuedMetadataDigest = initiativeStateDigest(initialState);
    this.metadataProcessor = createSerialProcessor();
    this.metadataProcessing = 0;
    this.maxMetadataConcurrency = 0;
    this.navigationDesired = null;
    this.navigationRunning = false;
    this.navigationTimer = null;
    this.pending = new Set();
    this.selection = activeId(initialState);
    this.label = this.selection ? `Turno di ${this.selection}` : null;
    this.optimisticRenderCount = 0;
    this.confirmedRenderCount = 0;
    this.skippedStaleRenders = 0;
    this.staleRenderCommits = 0;
    this.skippedDuplicateMetadata = 0;
    this.sdk.onMetadataChange((state) => this.#queueMetadata(state));
  }

  #track(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
    return promise;
  }

  click(direction) {
    const next = advanceInitiativeState(this.visualState, direction);
    this.visualState = clone(next);
    const revision = ++this.navigationRevision;
    const nextActiveId = activeId(next);

    this.optimisticRenderCount += 1;
    this.#track(this.sdk.select(nextActiveId).then((selectedId) => {
      if (revision === this.navigationRevision) this.selection = selectedId;
    }));
    this.#track(this.sdk.setLabel(nextActiveId).then((label) => {
      if (revision === this.navigationRevision) this.label = label;
    }));
    this.#queueNavigation(next);
    return clone(next);
  }

  #queueNavigation(state) {
    this.navigationDesired = clone(state);
    if (this.navigationTimer !== null) clearTimeout(this.navigationTimer);
    this.navigationTimer = setTimeout(() => {
      this.navigationTimer = null;
      this.#flushNavigation();
    }, this.navigationSettleMs);
  }

  #flushNavigation() {
    if (this.navigationRunning || !this.navigationDesired) return;
    const desired = this.navigationDesired;
    this.navigationDesired = null;
    this.navigationRunning = true;
    this.#track(this.sdk.setState(desired).finally(() => {
      this.navigationRunning = false;
      if (this.navigationDesired) this.#queueNavigation(this.navigationDesired);
    }));
  }

  #queueMetadata(state) {
    const digest = initiativeStateDigest(state);
    if (digest === this.lastQueuedMetadataDigest) {
      this.skippedDuplicateMetadata += 1;
      return;
    }
    this.lastQueuedMetadataDigest = digest;
    const task = async () => {
      this.metadataProcessing += 1;
      this.maxMetadataConcurrency = Math.max(this.maxMetadataConcurrency, this.metadataProcessing);
      try {
        this.confirmedState = clone(state);
        await this.#renderConfirmedState(state);
      } finally {
        this.metadataProcessing -= 1;
      }
    };
    this.#track(this.metadataProcessor.enqueue(task));
  }

  async #renderConfirmedState(state) {
    const renderRevision = ++this.renderRevision;
    this.latestRenderRevision = renderRevision;
    await this.sdk.pause();
    if (!isCurrentRenderRevision(renderRevision, this.latestRenderRevision)) {
      this.skippedStaleRenders += 1;
      return;
    }
    if (activeId(state) !== activeId(this.visualState)) {
      this.skippedStaleRenders += 1;
      return;
    }
    this.confirmedRenderCount += 1;
    if (activeId(state) !== activeId(this.visualState)) this.staleRenderCommits += 1;
  }

  async waitForIdle() {
    for (let iteration = 0; iteration < 200; iteration++) {
      if (this.navigationTimer !== null) {
        await wait(this.navigationSettleMs + 1);
        continue;
      }
      if (this.navigationDesired && !this.navigationRunning) this.#flushNavigation();
      const pending = Array.from(this.pending);
      if (pending.length) {
        await Promise.allSettled(pending);
        continue;
      }
      await this.metadataProcessor.idle();
      if (
        this.navigationTimer === null &&
        !this.navigationDesired &&
        !this.navigationRunning &&
        this.pending.size === 0 &&
        this.metadataProcessor.pending === 0
      ) return;
    }
    throw new Error("Initiative SDK harness did not become idle");
  }
}
