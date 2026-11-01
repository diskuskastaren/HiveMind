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

test('importing a backup normalizes records, repairs links and resets navigation', () => {
  useStore.setState({ activeProjectId: 'old-project', openTabs: ['gone'], activeTabId: 'gone', activeNoteId: 'gone-note' });
  useStore.getState().importData({
    version: 5, exportedAt: 1,
    projects: [{ id: 'p2', name: 'Imported', color: '#000', archived: false, createdAt: 1 }],
    suppliers: [{ id: 's2', name: 'Supplier', projectIds: ['p2'] }],
    notes: [{ id: 'n2', projectIds: ['p2'], supplierIds: ['s2'], title: 'Kickoff' }],
    tasks: [{ id: 't2', projectId: 'p2', supplierId: 's2', noteId: 'n2', title: 'Send drawings', linkedFollowUpId: 'f2' }],
    decisions: [{ id: 'd2', projectId: 'p2', supplierId: null, noteId: null, text: 'Go', createdAt: 1 }],
    followUps: [{ id: 'f2', projectId: 'p2', supplierId: 's2', text: 'Chase drawings', status: 'open', createdAt: 1 }],
  });
  const s = useStore.getState();
  assert.equal(s.activeProjectId, 'p2');
  assert.deepEqual(s.openTabs, []);
  assert.equal(s.activeNoteId, null);
  assert.equal(s.activeView, 'dashboard');
  assert.equal(s.notes[0].content, '');
  assert.equal(s.tasks[0].status, 'open');
  assert.equal(s.followUps[0].linkedTaskId, 't2', 'one-sided link repaired on import');
  assert.equal(s.decisions[0].status, 'active');
});

test('hydration fills settings added in newer versions and drops dangling navigation', async () => {
  memory.set('Combobulator-data', JSON.stringify({ version: 11, state: {
    projects: [{ id: 'p', name: 'P', color: '#000', archived: false, createdAt: 1 }],
    suppliers: [], notes: [], tasks: [], decisions: [], followUps: [],
    activeProjectId: 'deleted', openTabs: ['deleted-supplier'], activeTabId: 'deleted-supplier', activeNoteId: 'x',
    rightPanelOpen: true,
    settings: { openaiApiKey: '', groqApiKey: '', gptModel: 'gpt-4o', temperature: 0.2, theme: 'dark' },
  } }));
  await useStore.persist.rehydrate();
  const s = useStore.getState();
  assert.equal(s.settings.gptModel, 'gpt-4o');
  assert.equal(s.settings.autoSummarize, true);
  assert.equal(s.settings.chunkIntervalSeconds, 60);
  assert.equal(s.activeProjectId, 'p');
  assert.deepEqual(s.openTabs, []);
  assert.equal(s.activeTabId, null);
});

test('task/follow-up linking is atomic and survives relinking', () => {
  useStore.setState({
    tasks: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    followUps: [{ id: 'f', text: 'F', status: 'open' }],
  });
  useStore.getState().linkTaskAndFollowUp('a', 'f');
  useStore.getState().linkTaskAndFollowUp('b', 'f');
  const { tasks, followUps } = useStore.getState();
  assert.equal(tasks.find((t) => t.id === 'a').linkedFollowUpId, undefined);
  assert.equal(tasks.find((t) => t.id === 'b').linkedFollowUpId, 'f');
  assert.equal(followUps[0].linkedTaskId, 'b');
  useStore.getState().unlinkTaskAndFollowUp({ taskId: 'b' });
  assert.equal(useStore.getState().followUps[0].linkedTaskId, undefined);
});
