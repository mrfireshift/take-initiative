const clone = (value) => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Il metadata harness accetta soltanto valori JSON-safe");
  }
  return JSON.parse(serialized);
};

// Simula la semantica documentata di setMetadata: merge shallow al commit,
// mentre l'ordine di completamento resta controllato dal test.
export class DeterministicMetadataHarness {
  constructor({ scene = {}, room = {} } = {}) {
    this.metadata = { scene: clone(scene), room: clone(room) };
    this.pending = new Map();
    this.operations = [];
    this.sequence = 0;
  }

  api(scope) {
    if (scope !== "scene" && scope !== "room") throw new Error(`Scope sconosciuto: ${scope}`);
    return {
      getMetadata: async () => clone(this.metadata[scope]),
      setMetadata: (update) => this.enqueue(scope, update),
    };
  }

  enqueue(scope, update) {
    const operation = {
      id: `${scope}-${++this.sequence}`,
      scope,
      update: clone(update),
    };
    this.operations.push(operation);
    return new Promise((resolve, reject) => {
      this.pending.set(operation.id, { ...operation, resolve, reject });
    });
  }

  pendingOperations() {
    return [...this.pending.values()].map(({ resolve, reject, ...operation }) => clone(operation));
  }

  commit(operationId) {
    const operation = this.pending.get(operationId);
    if (!operation) throw new Error(`Operazione metadata non pendente: ${operationId}`);
    this.pending.delete(operationId);
    this.metadata[operation.scope] = {
      ...this.metadata[operation.scope],
      ...clone(operation.update),
    };
    operation.resolve();
    return clone({
      id: operation.id,
      scope: operation.scope,
      update: operation.update,
    });
  }

  commitNext() {
    const [operation] = this.pendingOperations();
    if (!operation) throw new Error("Nessuna operazione metadata pendente");
    return this.commit(operation.id);
  }

  fail(operationId, error = new Error("Metadata write failed")) {
    const operation = this.pending.get(operationId);
    if (!operation) throw new Error(`Operazione metadata non pendente: ${operationId}`);
    this.pending.delete(operationId);
    operation.reject(error);
  }

  snapshot(scope) {
    return clone(this.metadata[scope]);
  }
}

export class DeterministicSceneEpochHarness {
  constructor() {
    this.epoch = 0;
    this.baseline = null;
  }

  changeScene(baseline) {
    this.epoch += 1;
    this.baseline = clone(baseline);
  }

  capture(operation) {
    return { epoch: this.epoch, operation: clone(operation) };
  }

  commit(captured) {
    if (captured?.epoch !== this.epoch) return false;
    return captured.operation;
  }
}
