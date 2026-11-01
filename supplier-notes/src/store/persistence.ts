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
  /**
   * Call once the store has fully hydrated (read, migrated and merged without errors).
   * Writes are ignored until then.
   */
  markHydrated(): void;
  /** Why the stored workspace could not be read, if it could not. Writes stay disabled. */
  readonly readError: string | null;
  readonly canWrite: boolean;
  /** Resolves once the latest snapshot has been written; rejects if that write failed. */
  flush(): Promise<void>;
  /**
   * Hand every unsent snapshot to the backend immediately, without waiting for writes in flight
   * (the backend queues them in order). Used when the window closes: the desktop main process
   * then finishes its queue before quitting, however long a write takes.
   */
  sendPendingNow(): void;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value && typeof (value as PromiseLike<unknown>).then === 'function';

function sameSnapshot(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

const RETRY_DELAYS_MS = [2_000, 10_000, 30_000];

/**
 * zustand persist storage with properties the default JSON storage lacks:
 *
 * 1. **No writes until the workspace has loaded completely.** Store updates while loading — or after
 *    reading, migrating or merging failed — would otherwise save the empty default state over real data.
 * 2. **Skips unchanged snapshots.** zustand calls `setItem` after *every* update, including pure UI
 *    state (dialogs, menus); those no longer serialize and rewrite the whole workspace.
 * 3. **Write-behind.** At most one write is in flight; newer snapshots replace older pending ones, so
 *    fast typing produces a handful of writes instead of one per keystroke.
 * 4. **Retries.** A failed write is retried a few times (and on flush) instead of being forgotten
 *    until the next edit.
 */
export function createWriteBehindStorage<S extends Record<string, unknown>>(
  getBackend: () => PersistBackend,
  hooks: PersistHooks = {},
): WriteBehindStorage<S> {
  let readSucceeded = false;
  let readError: string | null = null;
  let hydrated = false;
  let storeName = '';
  let lastAccepted: StorageValue<S> | undefined;
  let pending: StorageValue<S> | undefined;
  // The newest snapshot whose write failed; retried until a newer snapshot supersedes it.
  let failed: StorageValue<S> | undefined;
  let lastError: string | null = null;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // A flag, not just the promise: with a synchronous backend drain() completes before its
  // promise could even be assigned, so "is a drain running" must be tracked separately.
  let isDraining = false;
  let drainPromise: Promise<void> = Promise.resolve();
  const sent = new Set<Promise<void>>();

  const canWrite = () => readSucceeded && hydrated;
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const scheduleRetry = () => {
    if (retryTimer || retryAttempt >= RETRY_DELAYS_MS.length) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryAttempt++;
      if (failed && !pending) { pending = failed; failed = undefined; start(); }
    }, RETRY_DELAYS_MS[retryAttempt]);
    (retryTimer as { unref?: () => void }).unref?.();
  };

  /** Write one snapshot; resolves when acknowledged (never rejects). */
  const writeSnapshot = async (snapshot: StorageValue<S>) => {
    try {
      const result = getBackend().write(storeName, JSON.stringify(snapshot));
      // Synchronous backends (localStorage) complete without yielding.
      const status = isThenable(result) ? await result : result;
      if (failed === snapshot) failed = undefined;
      if (!failed) { lastError = null; retryAttempt = 0; }
      hooks.onStatus?.(status);
    } catch (error) {
      // Keep the snapshot for a retry unless something newer is already waiting.
      if (!pending) failed = snapshot;
      lastAccepted = undefined;
      lastError = message(error);
      hooks.onError?.(lastError);
      scheduleRetry();
    }
  };

  const drain = async () => {
    isDraining = true;
    try {
      while (pending) {
        const next = pending;
        pending = undefined;
        await writeSnapshot(next);
      }
    } finally {
      isDraining = false;
    }
  };
  const start = () => { if (!isDraining) drainPromise = drain(); };

  return {
    get canWrite() { return canWrite(); },
    get readError() { return readError; },

    markHydrated() {
      hydrated = true;
    },

    getItem: (name) => {
      storeName = name;
      const parse = (raw: string | null) => {
        const value = raw ? (JSON.parse(raw) as StorageValue<S>) : null;
        readSucceeded = true;
        return value;
      };
      const fail = (error: unknown) => {
        readError = message(error);
        hooks.onError?.(readError);
        return null;
      };
      try {
        const raw = getBackend().read(name);
        if (isThenable(raw)) return Promise.resolve(raw).then(parse).catch(fail);
        return parse(raw);
      } catch (error) {
        return fail(error);
      }
    },

    setItem: (name, value) => {
      if (!canWrite()) return;
      storeName = name;
      if (lastAccepted && lastAccepted.version === value.version &&
          sameSnapshot(lastAccepted.state as Record<string, unknown>, value.state as Record<string, unknown>)) return;
      lastAccepted = value;
      failed = undefined; // superseded by this newer snapshot
      pending = value;
      start();
    },

    removeItem: () => { /* The workspace is never deleted through zustand. */ },

    sendPendingNow: () => {
      const next = pending ?? failed;
      if (!next) return;
      pending = undefined;
      failed = undefined;
      const write = writeSnapshot(next);
      sent.add(write);
      void write.finally(() => sent.delete(write));
    },

    flush: async () => {
      if (failed && !pending) { pending = failed; failed = undefined; }
      while (isDraining || pending || sent.size) {
        start();
        await Promise.all([drainPromise, ...sent]);
      }
      if (failed) throw new Error(lastError || 'Saving failed');
    },
  };
}
