import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntilDue, dueUrgency, formatTimeLeft, parseDueDate } from './dates.ts';

test('due dates are calendar days in local time, not UTC instants', () => {
  const morning = new Date(2026, 10, 1, 0, 30);   // 00:30 local on Nov 1
  const evening = new Date(2026, 10, 1, 23, 30);  // 23:30 local on Nov 1
  for (const now of [morning, evening]) {
    assert.equal(daysUntilDue('2026-11-01', now), 0);
    assert.equal(dueUrgency('2026-11-01', now), 'soon', 'due today is not overdue yet');
    assert.equal(formatTimeLeft('2026-11-01', now), 'due today');
  }
  assert.equal(parseDueDate('2026-11-01').getDate(), 1);
  assert.equal(dueUrgency('2026-10-31', morning), 'overdue');
  assert.equal(formatTimeLeft('2026-10-29', morning), '3d overdue');
  assert.equal(formatTimeLeft('2026-11-02', evening), 'due tomorrow');
  assert.equal(dueUrgency('2026-11-04', morning), 'normal');
  assert.equal(daysUntilDue('2027-03-29', new Date(2027, 2, 27, 12)), 2, 'DST change does not shift days');
  assert.equal(parseDueDate('2026-02-31'), null);
  assert.equal(daysUntilDue('', morning), null);
});
