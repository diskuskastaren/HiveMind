import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const memory = new Map();
globalThis.window = { dispatchEvent() {} };
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

const bundle = await build({ entryPoints: ['src/store/store.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { useStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('replacing a decision keeps a navigable chain and an audit record', () => {
  useStore.setState({
    projects: [{ id: 'p', name: 'Project', color: '#000', archived: false, createdAt: 1 }],
    suppliers: [], notes: [], tasks: [], decisions: [], followUps: [], activeProjectId: 'p',
  });
  const firstId = useStore.getState().addDecision({ projectId: 'p', supplierId: null, noteId: null,
    text: 'Ship Friday' });
  const nextId = useStore.getState().addDecision({ projectId: 'p', supplierId: null, noteId: null,
    text: 'Ship Monday', supersedesId: firstId });
  const decisions = useStore.getState().decisions;
  assert.equal(decisions.find((item) => item.id === firstId).status, 'superseded');
  assert.equal(decisions.find((item) => item.id === nextId).supersedesId, firstId);
  assert.ok(decisions.find((item) => item.id === firstId).history.some((entry) => entry.action === 'superseded'));
});

test('unlinking a supplier preserves decisions and clears dead source links', () => {
  useStore.setState({
    projects: [{ id: 'p', name: 'Project', color: '#000', archived: false, createdAt: 1 }],
    suppliers: [{ id: 's', name: 'Supplier', projectIds: ['p'] }],
    notes: [{ id: 'n', projectIds: ['p'], supplierIds: ['s'], title: 'Meeting', content: '', attendees: '', createdAt: 1, updatedAt: 1 }],
    tasks: [{ id: 't', projectId: 'p', supplierId: 's', noteId: 'n', title: 'Action', status: 'open', priority: 'medium', owner: '', dueDate: '', description: '', createdAt: 1 }],
    decisions: [{ id: 'd', projectId: 'p', supplierId: 's', noteId: 'n', text: 'Approved', createdAt: 1, status: 'active', relatedTaskIds: ['t'] }],
    followUps: [], activeProjectId: 'p',
  });
  useStore.getState().unlinkSupplierFromProject('s', 'p');
  const decision = useStore.getState().decisions.find((item) => item.id === 'd');
  assert.ok(decision);
  assert.equal(decision.noteId, null);
  assert.equal(decision.sourceNoteTitle, 'Meeting');
  assert.deepEqual(decision.relatedTaskIds, []);
});
