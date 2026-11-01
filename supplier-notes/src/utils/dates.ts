/**
 * Due dates are stored as local calendar days ('yyyy-MM-dd'). `new Date('2026-11-01')` would
 * parse them as UTC midnight, which shows the previous day west of UTC and marked tasks
 * overdue from 01:00 on their due day in Central Europe. These helpers compare calendar days.
 */
const DAY_MS = 86_400_000;

export type DueUrgency = 'overdue' | 'soon' | 'normal';

/** Local midnight of a 'yyyy-MM-dd' string, or null when it is not a valid date. */
export function parseDueDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/** Whole calendar days from today to the due date (negative = overdue, 0 = due today). */
export function daysUntilDue(value: string, now = new Date()): number | null {
  const due = parseDueDate(value);
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

export function dueUrgency(value: string, now = new Date()): DueUrgency {
  const days = daysUntilDue(value, now);
  if (days === null) return 'normal';
  if (days < 0) return 'overdue';
  if (days <= 2) return 'soon';
  return 'normal';
}

export function formatDueDate(value: string): string {
  const due = parseDueDate(value);
  return due ? due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : value;
}

export function formatTimeLeft(value: string, now = new Date()): string {
  const days = daysUntilDue(value, now);
  if (days === null) return '';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return days < 0 ? `${-days}d overdue` : `${days}d left`;
}
