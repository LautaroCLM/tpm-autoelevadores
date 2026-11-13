/**
 * scripts/idb-shim.mjs
 * Polyfill estándar en memoria para IndexedDB, window y CustomEvent
 * Permite ejecutar la lógica de producción de lib/offline/queue.ts en Node.js.
 */

class MockIDBRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
    this.result = undefined;
    this.error = null;
  }
}

class MockObjectStore {
  constructor(name, keyPath, memoryMap) {
    this.name = name;
    this.keyPath = keyPath;
    this.map = memoryMap;
  }

  createIndex(indexName, keyPath, options) {}

  put(item) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const key = item[this.keyPath] || item.id;
      this.map.set(key, JSON.parse(JSON.stringify(item)));
      req.result = key;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  get(key) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const val = this.map.get(key);
      req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll() {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const vals = Array.from(this.map.values()).map((v) => JSON.parse(JSON.stringify(v)));
      req.result = vals;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  delete(key) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      this.map.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
}

class MockIDBTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
  }

  objectStore(name) {
    return this.db._getStore(name);
  }
}

class MockIDBDatabase {
  constructor(name) {
    this.name = name;
    this.stores = new Map();
    this.storeMaps = new Map();
    this.objectStoreNames = {
      contains: (n) => this.stores.has(n),
    };
  }

  createObjectStore(name, options = {}) {
    const keyPath = options.keyPath || 'id';
    if (!this.storeMaps.has(name)) {
      this.storeMaps.set(name, new Map());
    }
    const store = new MockObjectStore(name, keyPath, this.storeMaps.get(name));
    this.stores.set(name, store);
    return store;
  }

  _getStore(name) {
    return this.stores.get(name);
  }

  transaction(storeNames, mode) {
    return new MockIDBTransaction(this, storeNames, mode);
  }
}

export function setupIndexedDBShim() {
  const dbs = new Map();

  const mockFactory = {
    open(name, version) {
      const req = new MockIDBRequest();
      queueMicrotask(() => {
        let isNew = !dbs.has(name);
        let db = dbs.get(name);
        if (!db) {
          db = new MockIDBDatabase(name);
          dbs.set(name, db);
        }
        req.result = db;
        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }
        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      });
      return req;
    },
  };

  globalThis.window = globalThis;
  globalThis.indexedDB = mockFactory;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict) {
      this.type = type;
      this.detail = eventInitDict?.detail;
    }
  };
  globalThis.dispatchEvent = () => true;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}
