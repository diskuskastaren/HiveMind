import type { PersistStorage, StorageValue } from 'zustand/middleware';

/** Where the serialized workspace lives: Electron IPC in the desktop app, localStorage in the browser. */
export interface PersistBackend {
  read(name: string): Promise<string | null> | string | null;
  write(name: string, raw: string): Promise<unknown> | void;
}

export interface PersistHooks {
  onStatus?: (status: unknown) => void;
  onError?: (message: string) => void;
}

export interface WriteBehindStorage<S> extends PersistStorage<S> {
  /** Resolves once every accepted snapshot has been handed to the backend and acknowledged. */
  flush(): Promise<void>;
  /** True once a read has succeeded; writes are ignored before that. */
  readonly canWrite: boolean;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value && typeof (value as PromiseLike<unknown>).then === 'function';

function sameSnapshot(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * zustand persist storage with three properties the default JSON storage lacks:
 *
 * 1. **No writes before a successful read.** Store updates that happen while the workspace is still
 *    loading (or after loading failed) would otherwise save the empty default state over real data.
 * 2. **Skips unchanged snapshots.** zustand calls `setItem` after *every* update, including pure UI
 *    state (dialogs, menus); those no longer serialize and rewrite the whole workspace.
 * 3. **Write-behind.** At most one write is in flight; newer snapshots replace older pending ones, so
 *    fast typing produces a handful of writes instead of one per keystroke. `flush()` waits for the
 *    latest snapshot (used by the window-close handshake).
 */
export function createWriteBehindStorage<S extends Record<string, unknown>>(
  getBackend: () => PersistBackend,
  hooks: PersistHooks = {},
): WriteBehindStorage<S> {
  let canWrite = false;
  let lastAccepted: StorageValue<S> | undefined;
  let storeName = '';
  let pending: StorageValue<S> | undefined;
  // A flag, not just the promise: with a synchronous backend drain() completes before its
  // promise could even be assigned, so "is a drain running" must be tracked separately.
  let isDraining = false;
  let drainPromise: Promise<void> = Promise.resolve();

  const report = (error: unknown) => hooks.onError?.(error instanceof Error ? error.message : String(error));

  const drain = async () => {
    isDraining = true;
    try {
      while (pending) {
        const next = pending;
        pending = undefined;
        let raw: string;
        try { raw = JSON.stringify(next); }
        catch (error) { report(error); lastAccepted = undefined; continue; }
        try {
          const result = getBackend().write(storeName, raw);
          // Synchronous backends (localStorage) complete without yielding.
          const status = isThenable(result) ? await result : result;
          hooks.onStatus?.(status);
        } catch (error) {
          // Forget the snapshot so the next change retries the whole workspace.
          lastAccepted = undefined;
          report(error);
        }
      }
    } finally {
      isDraining = false;
    }
  };

  return {
    get canWrite() { return canWrite; },

    getItem: (name) => {
      storeName = name;
      // Writes are only enabled after the stored workspace parsed successfully, so a corrupt or
      // unreadable file is never overwritten by the empty default state.
      const parse = (raw: string | null) => {
        const value = raw ? (JSON.parse(raw) as StorageValue<S>) : null;
        canWrite = true;
        return value;
      };
      try {
        const raw = getBackend().read(name);
        if (isThenable(raw)) {
          return Promise.resolve(raw).then(parse).catch((error) => { report(error); return null; });
        }
        return parse(raw);
      } catch (error) {
        report(error);
        return null;
      }
    },

    setItem: (name, value) => {
      if (!canWrite) return;
      storeName = name;
      if (lastAccepted && lastAccepted.version === value.version &&
          sameSnapshot(lastAccepted.state as Record<string, unknown>, value.state as Record<string, unknown>)) return;
      lastAccepted = value;
      pending = value;
      if (!isDraining) drainPromise = drain();
    },

    removeItem: () => { /* The workspace is never deleted through zustand. */ },

    flush: async () => {
      while (isDraining || pending) {
        if (!isDraining) drainPromise = drain();
        await drainPromise;
      }
    },
  };
}
