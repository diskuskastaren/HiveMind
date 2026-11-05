import { toast } from 'sonner';
import { useStore } from '../store/store';
import { linkedFollowUpOf, linkedTaskOf } from '../utils/followUpLinks';

/** Delete a task immediately and offer "Undo" (restores its follow-up link and decision references). */
export function deleteTaskWithUndo(taskId: string) {
  const state = useStore.getState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const followUpId = linkedFollowUpOf(task, state.followUps)?.id;
  const decisionIds = state.decisions.filter((item) => item.relatedTaskIds?.includes(taskId)).map((item) => item.id);
  state.deleteTask(taskId);
  toast('Task deleted', {
    description: task.title,
    action: { label: 'Undo', onClick: () => useStore.getState().restoreTask(task, { followUpId, decisionIds }) },
  });
}

/** Delete a follow-up immediately and offer "Undo" (restores its task link). */
export function deleteFollowUpWithUndo(followUpId: string) {
  const state = useStore.getState();
  const followUp = state.followUps.find((item) => item.id === followUpId);
  if (!followUp) return;
  const taskId = linkedTaskOf(followUp, state.tasks)?.id;
  state.deleteFollowUp(followUpId);
  toast('Follow-up deleted', {
    description: followUp.text,
    action: { label: 'Undo', onClick: () => useStore.getState().restoreFollowUp(followUp, { taskId }) },
  });
}

/** Revoke a decision and offer "Undo" (reinstates its previous status). */
export function revokeDecisionWithUndo(decisionId: string) {
  const state = useStore.getState();
  const decision = state.decisions.find((item) => item.id === decisionId);
  if (!decision || decision.status === 'revoked') return;
  const previous = decision.status || 'active';
  state.updateDecision(decisionId, { status: 'revoked' });
  toast('Decision revoked', {
    description: decision.text,
    action: { label: 'Undo', onClick: () => useStore.getState().updateDecision(decisionId, { status: previous }) },
  });
}

/** Delete a tab of a note immediately and offer "Undo" (puts it back where it was). */
export function deleteNoteSectionWithUndo(noteId: string, sectionId: string) {
  const removed = useStore.getState().deleteNoteSection(noteId, sectionId);
  if (!removed) return;
  toast('Tab deleted', {
    description: removed.section.title,
    action: { label: 'Undo', onClick: () => useStore.getState().restoreNoteSection(noteId, removed) },
  });
}
