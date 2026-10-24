import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, searchLocal } from './search.ts';
import { validateSuggestions, sourceHash, analyzeMeeting } from './meetingIntelligence.ts';
import { validateExport } from './validateExport.ts';
import { upgradeDecision } from './decisionMigration.ts';

test('searches all information types and ranks a title match first', () => {
  const notes = [{ id: 'n', projectIds: ['p'], supplierIds: ['s'], title: 'Pump review', content: '<p>Flow target</p>', attendees: '', createdAt: 1, updatedAt: 2,
    transcripts: [{ id: 'tr', rawText: 'Supplier promised a revised pump curve', duration: 5, recordedAt: 3 }] }];
  const tasks = [{ id: 't', projectId: 'p', supplierId: 's', noteId: 'n', title: 'Revise pump curve', status: 'open', priority: 'high', owner: '', dueDate: '', description: '', createdAt: 4 }];
  const decisions = [{ id: 'd', projectId: 'p', supplierId: 's', noteId: 'n', text: 'Pump curve approved', createdAt: 5 }];
  const followUps = [{ id: 'f', projectId: 'p', supplierId: 's', text: 'Ask about pump test', status: 'open', createdAt: 6 }];
  const index = buildSearchIndex(notes, tasks, decisions, followUps);
  assert.equal(index.length, 5);
  const result = searchLocal(index, 'pump curve', {});
  assert.equal(result[0].type, 'decision');
  assert.ok(result.some((item) => item.type === 'transcript'));
  assert.equal(searchLocal(index, 'pump', { type: 'followup' }).length, 1);
  assert.equal(searchLocal(index, 'pump', { projectId: 'other' }).length, 0);
});

test('validates AI source quotes and rejects incomplete analysis', () => {
  const transcript = 'Alex will send the revised plan tomorrow.';
  const valid = { suggestions: [{ kind: 'task', text: 'Send revised plan', owner: 'Alex', dueDate: '', priority: 'medium', sourceQuote: 'Alex will send the revised plan', timestampSeconds: null }] };
  assert.equal(validateSuggestions(valid, transcript)[0].status, 'pending');
  assert.equal(validateSuggestions({ suggestions: [valid.suggestions[0], valid.suggestions[0]] }, transcript).length, 1);
  assert.equal(sourceHash(transcript), sourceHash(transcript));
  assert.throws(() => validateSuggestions({ suggestions: [{ ...valid.suggestions[0], sourceQuote: 'Not in the source' }] }, transcript), /untraceable/);
  assert.throws(() => validateSuggestions({}, transcript), /incomplete/);
});

test('search stays bounded with a large local collection', () => {
  const tasks = Array.from({ length: 20_000 }, (_, index) => ({ id: `t${index}`, projectId: 'p', supplierId: null, noteId: null,
    title: `Follow up item ${index}`, status: 'open', priority: 'medium', owner: '', dueDate: '', description: '', createdAt: index }));
  const index = buildSearchIndex([], tasks, [], []);
  const started = performance.now();
  const result = searchLocal(index, 'follow up', {});
  assert.equal(result.length, 100);
  assert.ok(performance.now() - started < 2000);
});

test('AI service failure is reported without creating data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Offline'); };
  try { await assert.rejects(analyzeMeeting('Meeting text', 'key', 'gpt-4o-mini'), /Offline/); }
  finally { globalThis.fetch = originalFetch; }
});

test('accepts version 5 exports with projects and rejects malformed collections', () => {
  const value = { version: 5, exportedAt: 1, projects: [{ id: 'p' }], suppliers: [], notes: [], tasks: [], decisions: [], followUps: [] };
  assert.equal(validateExport(value).version, 5);
  assert.throws(() => validateExport({ ...value, notes: {} }), /notes/);
});

test('migrates legacy decisions without losing identity or source references', () => {
  const legacy = { id: 'd1', projectId: 'p1', supplierId: 's1', noteId: 'n1', text: 'Ship Friday', createdAt: 123 };
  const migrated = upgradeDecision(legacy);
  assert.equal(migrated.id, legacy.id);
  assert.equal(migrated.noteId, legacy.noteId);
  assert.equal(migrated.status, 'active');
  assert.equal(migrated.history[0].text, legacy.text);
});
