import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFollowUpLinks, linkFollowUp, unlinkFollowUp, linkedFollowUpOf, linkedTaskOf } from './followUpLinks.ts';

test('repairs one-sided, stale and duplicate task/follow-up links', () => {
  const tasks = [
    { id: 't1', linkedFollowUpId: 'f1' },          // consistent with f1
    { id: 't2', linkedFollowUpId: 'f1' },          // stale: f1 belongs to t1
    { id: 't3', linkedFollowUpId: 'f3' },          // one-sided (f3 has no back link)
    { id: 't4', linkedFollowUpId: 'missing' },     // dangling
    { id: 't5' },
  ];
  const followUps = [
    { id: 'f1', linkedTaskId: 't1' },
    { id: 'f2', linkedTaskId: 't5' },              // one-sided from the follow-up side
    { id: 'f3' },
    { id: 'f4', linkedTaskId: 'deleted-task' },    // dangling
  ];
  const result = normalizeFollowUpLinks(tasks, followUps);
  assert.equal(result.changed, true);
  const link = (id) => result.tasks.find((t) => t.id === id).linkedFollowUpId;
  const back = (id) => result.followUps.find((f) => f.id === id).linkedTaskId;
  assert.deepEqual([link('t1'), link('t2'), link('t3'), link('t4'), link('t5')], ['f1', undefined, 'f3', undefined, 'f2']);
  assert.deepEqual([back('f1'), back('f2'), back('f3'), back('f4')], ['t1', 't5', 't3', undefined]);
  assert.equal(result.tasks[0], tasks[0], 'unchanged records keep their identity');
  assert.equal(normalizeFollowUpLinks(result.tasks, result.followUps).changed, false);
});

test('linking releases previous partners on both sides; unlinking clears both sides', () => {
  let tasks = [{ id: 't1', linkedFollowUpId: 'f1' }, { id: 't2' }];
  let followUps = [{ id: 'f1', linkedTaskId: 't1' }, { id: 'f2' }];
  ({ tasks, followUps } = linkFollowUp(tasks, followUps, 't2', 'f1'));
  assert.equal(tasks[0].linkedFollowUpId, undefined);
  assert.equal(tasks[1].linkedFollowUpId, 'f1');
  assert.equal(followUps[0].linkedTaskId, 't2');
  ({ tasks, followUps } = linkFollowUp(tasks, followUps, 't2', 'f2'));
  assert.equal(followUps[0].linkedTaskId, undefined, 'old follow-up released');
  assert.equal(linkedTaskOf(followUps[1], tasks).id, 't2');
  assert.equal(linkedFollowUpOf(tasks[1], followUps).id, 'f2');
  ({ tasks, followUps } = unlinkFollowUp(tasks, followUps, { followUpId: 'f2' }));
  assert.equal(tasks[1].linkedFollowUpId, undefined);
  assert.equal(followUps[1].linkedTaskId, undefined);
  assert.deepEqual(linkFollowUp(tasks, followUps, 'nope', 'f2').tasks, tasks, 'unknown ids are ignored');
});
