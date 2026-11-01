import type { FollowUp, Task } from '../types';

type LinkableTask = Pick<Task, 'id' | 'linkedFollowUpId'>;
type LinkableFollowUp = Pick<FollowUp, 'id' | 'linkedTaskId'>;

/**
 * A task and a follow-up can be linked 1:1, stored on both sides (`task.linkedFollowUpId`,
 * `followUp.linkedTaskId`). Older versions wrote the two sides separately, which left
 * one-sided, stale and duplicate links behind — the cause of follow-ups showing the wrong task,
 * appearing in "link" pickers although already linked, or not showing their link at all.
 *
 * This returns consistent pairs. Links recorded on both sides win, then follow-up-side links,
 * then task-side links; each task and each follow-up ends up in at most one pair, and links to
 * records that no longer exist are dropped. Unchanged records keep their identity.
 */
export function normalizeFollowUpLinks<T extends LinkableTask, F extends LinkableFollowUp>(tasks: T[], followUps: F[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const followUpIds = new Set(followUps.map((item) => item.id));
  const candidates: Array<{ taskId: string; followUpId: string; rank: number }> = [];
  for (const item of followUps) {
    const task = item.linkedTaskId ? taskById.get(item.linkedTaskId) : undefined;
    if (!task) continue;
    candidates.push({ taskId: task.id, followUpId: item.id, rank: task.linkedFollowUpId === item.id ? 0 : 1 });
  }
  for (const task of tasks) {
    if (task.linkedFollowUpId && followUpIds.has(task.linkedFollowUpId)) {
      candidates.push({ taskId: task.id, followUpId: task.linkedFollowUpId, rank: 2 });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const taskToFollowUp = new Map<string, string>();
  const followUpToTask = new Map<string, string>();
  for (const { taskId, followUpId } of candidates) {
    if (taskToFollowUp.has(taskId) || followUpToTask.has(followUpId)) continue;
    taskToFollowUp.set(taskId, followUpId);
    followUpToTask.set(followUpId, taskId);
  }

  let changed = false;
  const nextTasks = tasks.map((task) => {
    const linked = taskToFollowUp.get(task.id);
    if ((task.linkedFollowUpId || undefined) === linked) return task;
    changed = true;
    return { ...task, linkedFollowUpId: linked };
  });
  const nextFollowUps = followUps.map((item) => {
    const linked = followUpToTask.get(item.id);
    if ((item.linkedTaskId || undefined) === linked) return item;
    changed = true;
    return { ...item, linkedTaskId: linked };
  });
  return { tasks: changed ? nextTasks : tasks, followUps: changed ? nextFollowUps : followUps, changed };
}

/** Link `taskId` and `followUpId`, releasing any previous partner of either side. */
export function linkFollowUp<T extends LinkableTask, F extends LinkableFollowUp>(tasks: T[], followUps: F[], taskId: string, followUpId: string) {
  if (!tasks.some((task) => task.id === taskId) || !followUps.some((item) => item.id === followUpId)) return { tasks, followUps };
  return {
    tasks: tasks.map((task) => task.id === taskId
      ? (task.linkedFollowUpId === followUpId ? task : { ...task, linkedFollowUpId: followUpId })
      : task.linkedFollowUpId === followUpId ? { ...task, linkedFollowUpId: undefined } : task),
    followUps: followUps.map((item) => item.id === followUpId
      ? (item.linkedTaskId === taskId ? item : { ...item, linkedTaskId: taskId })
      : item.linkedTaskId === taskId ? { ...item, linkedTaskId: undefined } : item),
  };
}

/** Remove the link held by a task and/or follow-up, on both sides. */
export function unlinkFollowUp<T extends LinkableTask, F extends LinkableFollowUp>(tasks: T[], followUps: F[], ids: { taskId?: string; followUpId?: string }) {
  const taskIds = new Set<string>();
  const followUpIds = new Set<string>();
  if (ids.taskId) {
    taskIds.add(ids.taskId);
    const task = tasks.find((item) => item.id === ids.taskId);
    if (task?.linkedFollowUpId) followUpIds.add(task.linkedFollowUpId);
    for (const item of followUps) if (item.linkedTaskId === ids.taskId) followUpIds.add(item.id);
  }
  if (ids.followUpId) {
    followUpIds.add(ids.followUpId);
    const item = followUps.find((candidate) => candidate.id === ids.followUpId);
    if (item?.linkedTaskId) taskIds.add(item.linkedTaskId);
    for (const task of tasks) if (task.linkedFollowUpId === ids.followUpId) taskIds.add(task.id);
  }
  return {
    tasks: tasks.map((task) => taskIds.has(task.id) && task.linkedFollowUpId ? { ...task, linkedFollowUpId: undefined } : task),
    followUps: followUps.map((item) => followUpIds.has(item.id) && item.linkedTaskId ? { ...item, linkedTaskId: undefined } : item),
  };
}

/** The follow-up linked to a task (either side of the link counts). */
export function linkedFollowUpOf<F extends LinkableFollowUp>(task: LinkableTask, followUps: F[]): F | undefined {
  return (task.linkedFollowUpId ? followUps.find((item) => item.id === task.linkedFollowUpId) : undefined)
    ?? followUps.find((item) => item.linkedTaskId === task.id);
}

/** The task linked to a follow-up (either side of the link counts). */
export function linkedTaskOf<T extends LinkableTask>(followUp: LinkableFollowUp, tasks: T[]): T | undefined {
  return (followUp.linkedTaskId ? tasks.find((task) => task.id === followUp.linkedTaskId) : undefined)
    ?? tasks.find((task) => task.linkedFollowUpId === followUp.id);
}

/** True when the item has no link partner, i.e. it may be offered in a "link to…" picker. */
export function isUnlinkedTask(task: LinkableTask, followUps: LinkableFollowUp[]) {
  return !linkedFollowUpOf(task, followUps);
}
export function isUnlinkedFollowUp(followUp: LinkableFollowUp, tasks: LinkableTask[]) {
  return !linkedTaskOf(followUp, tasks);
}
