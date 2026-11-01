import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteBehindStorage } from './persistence.ts';

const snapshot = (state, version = 11) => ({ state, version });

test('never writes before the stored workspace has been read successfully', async () => {
  const writes = [];
  let release;
  const reading = new Promise((resolve) => { release = resolve; });
  const storage = createWriteBehindStorage(() => ({ read: () => reading, write: (_n, raw) => { writes.push(raw); } }));
  const pendingRead = storage.getItem('workspace');
  storage.setItem('workspace', snapshot({ notes: [] })); // update while still loading
  assert.equal(writes.length, 0);
  release(JSON.stringify(snapshot({ notes: [{ id: 'kept' }] })));
  assert.deepEqual((await pendingRead).state.notes, [{ id: 'kept' }]);
  storage.setItem('workspace', snapshot({ notes: [] })); // read done, but migrate/merge not finished
  assert.equal(writes.length, 0);
  storage.markHydrated();
  storage.setItem('workspace', snapshot({ notes: [{ id: 'kept' }, { id: 'new' }] }));
  await storage.flush();
  assert.equal(writes.length, 1);
});

test('a failed or corrupt read keeps writes disabled so the file is not overwritten', async () => {
  const errors = [];
  const writes = [];
  const failing = createWriteBehindStorage(() => ({ read: () => Promise.reject(new Error('Data file is not valid JSON')), write: (_n, raw) => writes.push(raw) }),
    { onError: (message) => errors.push(message) });
  assert.equal(await failing.getItem('w'), null);
  failing.markHydrated();
  failing.setItem('w', snapshot({ notes: [] }));
  const corrupt = createWriteBehindStorage(() => ({ read: () => '{broken', write: (_n, raw) => writes.push(raw) }),
    { onError: (message) => errors.push(message) });
  assert.equal(corrupt.getItem('w'), null);
  corrupt.markHydrated();
  corrupt.setItem('w', snapshot({ notes: [] }));
  await failing.flush(); await corrupt.flush();
  assert.equal(writes.length, 0);
  assert.equal(errors.length, 2);
});

test('skips unchanged snapshots and coalesces writes while one is in flight', async () => {
  const writes = [];
  let finishWrite;
  const storage = createWriteBehindStorage(() => ({
    read: () => null,
    write: (_n, raw) => { writes.push(JSON.parse(raw).state.text); return new Promise((resolve) => { finishWrite = resolve; }); },
  }));
  storage.getItem('w');
  storage.markHydrated();
  const notes = [{ id: 'n' }];
  storage.setItem('w', snapshot({ notes, text: 'a' }));
  storage.setItem('w', snapshot({ notes, text: 'a' })); // same references: UI-only change
  storage.setItem('w', snapshot({ notes, text: 'ab' }));
  storage.setItem('w', snapshot({ notes, text: 'abc' }));
  assert.deepEqual(writes, ['a']); // only the first is in flight
  finishWrite({ ok: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(writes, ['a', 'abc']); // 'ab' was superseded before it was sent
  const flushed = storage.flush();
  finishWrite({ ok: true });
  await flushed;
  storage.setItem('w', snapshot({ notes, text: 'abc' }));
  assert.equal(writes.length, 2);
});

test('a failed write is kept and retried on flush; flush reports a write that still fails', async () => {
  const errors = [];
  let fail = true;
  const written = [];
  const storage = createWriteBehindStorage(() => ({
    read: () => null,
    write: (_n, raw) => { if (fail) throw new Error('disk full'); written.push(JSON.parse(raw).state.text); },
  }), { onError: (message) => errors.push(message) });
  storage.getItem('w');
  storage.markHydrated();
  storage.setItem('w', snapshot({ text: 'last edit' }));
  await assert.rejects(storage.flush(), /disk full/);
  fail = false;
  await storage.flush(); // no new edit needed: the failed snapshot is written now
  assert.deepEqual(written, ['last edit']);
  assert.ok(errors.length >= 2);
});

test('closing hands over unsent snapshots without waiting for a slow write', async () => {
  const sent = [];
  let finishSlow;
  const storage = createWriteBehindStorage(() => ({
    read: () => null,
    write: (_n, raw) => { sent.push(JSON.parse(raw).state.text); return sent.length === 1 ? new Promise((r) => { finishSlow = r; }) : Promise.resolve(); },
  }));
  storage.getItem('w');
  storage.markHydrated();
  storage.setItem('w', snapshot({ text: 'A' })); // slow write in flight (e.g. a backup runs)
  storage.setItem('w', snapshot({ text: 'B' })); // waiting behind it
  storage.sendPendingNow();
  assert.deepEqual(sent, ['A', 'B'], 'B reaches the backend immediately');
  finishSlow({});
  await storage.flush();
});

test('a load that fails after reading keeps saving disabled', async () => {
  const writes = [];
  const storage = createWriteBehindStorage(() => ({ read: () => JSON.stringify(snapshot({ notes: [{ id: 'real' }] })), write: (_n, raw) => writes.push(raw) }));
  storage.getItem('w');
  // migrate/merge threw → the app never calls markHydrated()
  storage.setItem('w', snapshot({ notes: [] }));
  await storage.flush();
  assert.equal(writes.length, 0);
  assert.equal(storage.canWrite, false);
});
