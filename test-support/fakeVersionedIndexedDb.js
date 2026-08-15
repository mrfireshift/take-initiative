function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function compareKey(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const result = compareKey(left[index], right[index]);
      if (result) return result;
    }
    return 0;
  }
  if (left === right) return 0;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  return left < right ? -1 : 1;
}

function keyPathValue(value, keyPath) {
  if (Array.isArray(keyPath)) return keyPath.map((path) => value?.[path]);
  return value?.[keyPath];
}

function matches(query, key) {
  if (!query) return true;
  if (query.kind === "only") return compareKey(key, query.value) === 0;
  if (query.kind === "bound") {
    const lower = compareKey(key, query.lower);
    const upper = compareKey(key, query.upper);
    return (query.lowerOpen ? lower > 0 : lower >= 0) && (query.upperOpen ? upper < 0 : upper <= 0);
  }
  return compareKey(key, query) === 0;
}

function requestError(tx, request, error) {
  request.error = error;
  let prevented = false;
  request.onerror?.({ target: request, preventDefault() { prevented = true; } });
  if (!prevented) {
    tx.error = error;
    tx.abort();
  }
}

export function createVersionedIndexedDB() {
  const databases = new Map();

  function makeTransaction(database, names, mode = "readonly", upgrade = false) {
    const storeNames = Array.isArray(names) ? names : [names];
    const snapshots = mode === "readwrite" && !upgrade
      ? new Map(storeNames.map((name) => [name, new Map(database.stores.get(name)?.records || [])]))
      : null;
    const tx = {
      pending: 0,
      completed: false,
      aborted: false,
      error: null,
      mode,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore(name) {
        if (!database.stores.has(name)) throw new Error(`Missing object store: ${name}`);
        return makeStore(database, name, tx);
      },
      abort() {
        if (tx.aborted || tx.completed) return;
        tx.aborted = true;
        if (snapshots) {
          for (const [name, records] of snapshots) database.stores.get(name).records = new Map(records);
        }
        queueMicrotask(() => tx.onabort?.({ target: tx }));
      },
    };
    tx.completeWhenIdle = () => {
      if (tx.pending || tx.completed || tx.aborted) return;
      queueMicrotask(() => {
        if (!tx.pending && !tx.completed && !tx.aborted) {
          tx.completed = true;
          tx.oncomplete?.({ target: tx });
        }
      });
    };
    return tx;
  }

  function requestIn(tx, executor) {
    const request = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    tx.pending += 1;
    queueMicrotask(() => {
      if (tx.aborted) {
        tx.pending -= 1;
        tx.completeWhenIdle();
        return;
      }
      try {
        request.result = executor();
        request.onsuccess?.({ target: request });
      } catch (error) {
        requestError(tx, request, error);
      } finally {
        tx.pending -= 1;
        tx.completeWhenIdle();
      }
    });
    return request;
  }

  function makeIndex(database, storeName, indexName, tx) {
    const schema = database.stores.get(storeName);
    const indexSchema = schema.indexes.get(indexName);
    const entries = (query) => [...schema.records.values()]
      .filter((value) => matches(query, keyPathValue(value, indexSchema.keyPath)))
      .sort((left, right) => {
        const byIndex = compareKey(keyPathValue(left, indexSchema.keyPath), keyPathValue(right, indexSchema.keyPath));
        if (byIndex) return byIndex;
        return compareKey(left[schema.keyPath], right[schema.keyPath]);
      });
    return {
      getAll(query) { return requestIn(tx, () => entries(query).map(clone)); },
      count(query) { return requestIn(tx, () => entries(query).length); },
      openCursor(query, direction = "next") {
        const request = { result: null, error: null, onsuccess: null, onerror: null };
        const values = entries(query);
        if (direction === "prev") values.reverse();
        let position = 0;
        const emit = () => {
          if (tx.aborted) return;
          tx.pending += 1;
          queueMicrotask(() => {
            if (tx.aborted) {
              tx.pending -= 1;
              tx.completeWhenIdle();
              return;
            }
            if (position >= values.length) {
              request.result = null;
              request.onsuccess?.({ target: request });
            } else {
              const value = values[position];
              request.result = {
                value: clone(value),
                primaryKey: value[schema.keyPath],
                delete() { schema.records.delete(value[schema.keyPath]); },
                continue() { position += 1; emit(); },
              };
              request.onsuccess?.({ target: request });
            }
            tx.pending -= 1;
            tx.completeWhenIdle();
          });
        };
        emit();
        return request;
      },
    };
  }

  function makeStore(database, name, tx) {
    const schema = database.stores.get(name);
    return {
      indexNames: { contains: (indexName) => schema.indexes.has(indexName) },
      createIndex(indexName, keyPath, options = {}) {
        schema.indexes.set(indexName, { keyPath, unique: options.unique === true });
        return makeIndex(database, name, indexName, tx);
      },
      get(key) { return requestIn(tx, () => clone(schema.records.get(key))); },
      getAll(query) {
        const values = [...schema.records.values()]
          .filter((value) => matches(query, value[schema.keyPath]))
          .sort((left, right) => compareKey(left[schema.keyPath], right[schema.keyPath]));
        return requestIn(tx, () => values.map(clone));
      },
      put(value) {
        return requestIn(tx, () => {
          schema.records.set(value[schema.keyPath], clone(value));
          return value[schema.keyPath];
        });
      },
      add(value) {
        return requestIn(tx, () => {
          const key = value[schema.keyPath];
          if (schema.records.has(key)) {
            const error = new Error("Duplicate key");
            error.name = "ConstraintError";
            throw error;
          }
          schema.records.set(key, clone(value));
          return key;
        });
      },
      delete(key) { return requestIn(tx, () => schema.records.delete(key)); },
      index(indexName) {
        if (!schema.indexes.has(indexName)) throw new Error(`Missing index: ${indexName}`);
        return makeIndex(database, name, indexName, tx);
      },
      openCursor(query, direction = "next") {
        const primaryIndex = {
          keyPath: schema.keyPath,
        };
        const index = makeIndex(database, name, "__primary", tx);
        void primaryIndex;
        void index;
        const request = { result: null, error: null, onsuccess: null, onerror: null };
        const values = [...schema.records.values()]
          .filter((value) => matches(query, value[schema.keyPath]))
          .sort((left, right) => compareKey(left[schema.keyPath], right[schema.keyPath]));
        if (direction === "prev") values.reverse();
        let position = 0;
        const emit = () => {
          tx.pending += 1;
          queueMicrotask(() => {
            if (tx.aborted) {
              tx.pending -= 1;
              tx.completeWhenIdle();
              return;
            }
            if (position >= values.length) request.result = null;
            else {
              const value = values[position];
              request.result = {
                value: clone(value),
                delete() { schema.records.delete(value[schema.keyPath]); },
                continue() { position += 1; emit(); },
              };
            }
            request.onsuccess?.({ target: request });
            tx.pending -= 1;
            tx.completeWhenIdle();
          });
        };
        emit();
        return request;
      },
    };
  }

  function makeDatabase(database) {
    const db = {
      get version() { return database.version; },
      objectStoreNames: { contains: (name) => database.stores.has(name) },
      createObjectStore(name, options = {}) {
        if (database.stores.has(name)) throw new Error(`Store exists: ${name}`);
        database.stores.set(name, {
          keyPath: options.keyPath || "id",
          records: new Map(),
          indexes: new Map(),
        });
        return makeStore(database, name, database.upgradeTransaction);
      },
      transaction(names, mode = "readonly") {
        return makeTransaction(database, names, mode);
      },
      close() { database.connections.delete(db); db.onclose?.(); },
      onversionchange: null,
      onclose: null,
    };
    database.connections.add(db);
    return db;
  }

  const api = {
    open(name, requestedVersion) {
      const request = {
        result: null,
        error: null,
        transaction: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        let database = databases.get(name);
        const oldVersion = database?.version || 0;
        const version = Number(requestedVersion) || (database?.version || 1);
        if (database && version < database.version) {
          request.error = Object.assign(new Error("VersionError"), { name: "VersionError" });
          request.onerror?.({ target: request });
          return;
        }
        const needsUpgrade = !database || version > database.version;
        if (!database) {
          database = { version: 0, stores: new Map(), connections: new Set(), upgradeTransaction: null };
          databases.set(name, database);
        }
        const db = makeDatabase(database);
        request.result = db;
        if (needsUpgrade) {
          database.version = version;
          database.upgradeTransaction = makeTransaction(database, [...database.stores.keys()], "versionchange", true);
          request.transaction = database.upgradeTransaction;
          request.onupgradeneeded?.({ target: request, oldVersion, newVersion: version });
          database.upgradeTransaction.completed = true;
          database.upgradeTransaction = null;
        }
        request.onsuccess?.({ target: request });
      });
      return request;
    },
    deleteDatabase(name) {
      databases.delete(name);
      return { onsuccess: null, onerror: null };
    },
    seed(name, { version = 1, stores = {} } = {}) {
      const database = { version, stores: new Map(), connections: new Set(), upgradeTransaction: null };
      for (const [storeName, source] of Object.entries(stores)) {
        const schema = {
          keyPath: source.keyPath || "id",
          records: new Map((source.records || []).map((value) => [value[source.keyPath || "id"], clone(value)])),
          indexes: new Map(Object.entries(source.indexes || {}).map(([indexName, keyPath]) => [indexName, { keyPath, unique: false }])),
        };
        database.stores.set(storeName, schema);
      }
      databases.set(name, database);
    },
    inspect(name) {
      const database = databases.get(name);
      return database ? {
        version: database.version,
        stores: Object.fromEntries([...database.stores.entries()].map(([storeName, schema]) => [storeName, {
          keyPath: schema.keyPath,
          indexes: [...schema.indexes.keys()],
          records: [...schema.records.values()].map(clone),
        }])),
      } : null;
    },
  };
  return api;
}

export const versionedKeyRange = {
  only(value) { return { kind: "only", value }; },
  bound(lower, upper, lowerOpen = false, upperOpen = false) {
    return { kind: "bound", lower, upper, lowerOpen, upperOpen };
  },
};
