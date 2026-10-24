import { useState, useMemo, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import type { TaskStatus, Task, Decision } from '../types';
import { Bookmark, CheckCircle2, Circle, Clock, FileText, Gavel, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TranscriptTab } from './TranscriptTab';
import { FollowUpsPanel } from './FollowUpsPanel';
import { IconButton, PriorityBadge, SectionLabel } from './common';
import type { RightPanelTab } from '../types';

function detectActionLines(html: string): string[] {
  if (!html) return [];
  const el = document.createElement('div');
  el.innerHTML = html;
  const lines: string[] = [];
  el.querySelectorAll('p, li').forEach((node) => {
    const text = (node.textContent || '').trim();
    if (/^(TODO|AI):\s*/i.test(text)) {
      lines.push(text);
    }
  });
  return lines;
}

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  open: <Circle className="size-4 text-border-strong" />,
  doing: <Clock className="size-4 text-warning" />,
  done: <CheckCircle2 className="size-4 text-success" />,
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
};

function ownerInitials(owner: string): string {
  return owner
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

type DueDateUrgency = 'overdue' | 'soon' | 'normal';

function getDueDateUrgency(dueDate: string): DueDateUrgency {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return 'normal';
  const diffDays = (d.getTime() - Date.now()) / 86_400_000;
  if (diffDays < 0) return 'overdue';
  if (diffDays < 3) return 'soon';
  return 'normal';
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimeLeft(dueDate: string): string {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return '';
  const diffMs = d.getTime() - Date.now();
  const absDays = Math.floor(Math.abs(diffMs) / 86_400_000);
  const absHours = Math.floor(Math.abs(diffMs) / 3_600_000);
  if (diffMs < 0) return absDays >= 1 ? `${absDays}d overdue` : `${absHours}h overdue`;
  if (absDays >= 1) return `${absDays}d left`;
  if (absHours >= 1) return `${absHours}h left`;
  return 'due soon';
}

const DUE_DATE_CLASSES: Record<DueDateUrgency, string> = {
  overdue: 'text-recording font-medium',
  soon: 'text-warning',
  normal: 'text-muted-foreground',
};

export function RightPanel() {
  const rightPanelTab = useStore((s) => s.rightPanelTab);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const isRecording = useStore((s) => s.transcriptRecording);
  const activeNote = useStore((s) => s.notes.find((n) => n.id === s.activeNoteId));
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeNoteId = useStore((s) => s.activeNoteId);

  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const decisions = useStore((s) => s.decisions);
  const followUps = useStore((s) => s.followUps);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const addDecision = useStore((s) => s.addDecision);
  const updateDecision = useStore((s) => s.updateDecision);
  const deleteDecision = useStore((s) => s.deleteDecision);
  const editingDecisionId = useStore((s) => s.editingDecisionId);
  const setEditingDecision = useStore((s) => s.setEditingDecision);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const activeNoteContent = useStore((s) => s.notes.find((n) => n.id === s.activeNoteId)?.content || '');

  const [quickTask, setQuickTask] = useState('');
  const [quickDecision, setQuickDecision] = useState('');
  const [editDecisionText, setEditDecisionText] = useState('');
  const decisionEditRef = useRef<HTMLInputElement>(null);

  const detectedActions = useMemo(() => detectActionLines(activeNoteContent), [activeNoteContent]);

  const contextSupplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;

  const taskSortFn = (a: Task, b: Task) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return b.createdAt - a.createdAt;
  };

  const noteTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.projectId === activeProjectId && t.supplierId === contextSupplierId && t.noteId === activeNoteId)
        .sort(taskSortFn),
    [tasks, activeProjectId, contextSupplierId, activeNoteId],
  );

  const otherTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.projectId === activeProjectId && t.supplierId === contextSupplierId && t.noteId !== activeNoteId)
        .sort(taskSortFn),
    [tasks, activeProjectId, contextSupplierId, activeNoteId],
  );

  const noteDecisions = useMemo(
    () =>
      decisions
        .filter((d) => d.projectId === activeProjectId && d.supplierId === contextSupplierId && d.noteId === activeNoteId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [decisions, activeProjectId, contextSupplierId, activeNoteId],
  );

  const otherDecisions = useMemo(
    () =>
      decisions
        .filter((d) => d.projectId === activeProjectId && d.supplierId === contextSupplierId && d.noteId !== activeNoteId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [decisions, activeProjectId, contextSupplierId, activeNoteId],
  );

  const openFollowUpCount =
    tasks.filter((t) => t.supplierId === contextSupplierId && t.projectId === activeProjectId && t.isFollowUp && t.status !== 'done').length +
    followUps.filter((f) => f.supplierId === contextSupplierId && f.projectId === activeProjectId && f.status === 'open').length;

  const handleQuickAddTask = () => {
    if (!quickTask.trim() || !activeTabId || !activeNoteId || !activeProjectId) return;
    addTask({
      projectId: activeProjectId,
      supplierId: contextSupplierId,
      noteId: activeNoteId,
      title: quickTask.trim(),
      status: 'open',
      priority: 'medium',
      owner: '',
      dueDate: '',
      description: '',
    });
    setQuickTask('');
  };

  const handleQuickAddDecision = () => {
    if (!quickDecision.trim() || !activeTabId || !activeNoteId || !activeProjectId) return;
    addDecision({ projectId: activeProjectId, supplierId: contextSupplierId, noteId: activeNoteId, text: quickDecision.trim() });
    setQuickDecision('');
  };

  const tabCounts = {
    tasks: noteTasks.length + otherTasks.length,
    decisions: noteDecisions.length + otherDecisions.length,
    followups: openFollowUpCount,
  };

  const renderTaskCard = (task: Task, showNoteLink: boolean) => {
    const taskNote = notes.find((n) => n.id === task.noteId);
    const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;
    const done = task.status === 'done';

    return (
      <div
        key={task.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditingTask(task.id)}
        onKeyDown={(e) => e.key === 'Enter' && setEditingTask(task.id)}
        className="group/task flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            updateTask(task.id, { status: NEXT_STATUS[task.status] });
          }}
          className="mt-0.5 shrink-0"
          title={`Status: ${task.status} — click to cycle`}
          aria-label={`Status ${task.status}, click to change`}
        >
          {STATUS_ICONS[task.status]}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={cn('line-clamp-2 text-ui leading-snug', done && 'text-muted-foreground line-through')}>{task.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            {task.dueDate && urgency && (
              <span className={cn('text-2xs tabular-nums', DUE_DATE_CLASSES[urgency])}>
                {formatDueDate(task.dueDate)} · {formatTimeLeft(task.dueDate)}
              </span>
            )}
            <span className="flex-1" />
            {task.owner && (
              <span
                title={task.owner}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-semibold text-subtle-foreground"
              >
                {ownerInitials(task.owner)}
              </span>
            )}
          </div>
          {showNoteLink && taskNote && (
            <button
              type="button"
              className="flex max-w-full items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                navigateToNote(task.noteId);
              }}
              title="Go to source note"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{taskNote.title || 'Untitled note'}</span>
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            label={task.isFollowUp ? 'Remove from follow-ups' : 'Add to follow-ups'}
            size="icon-xs"
            className={cn(task.isFollowUp ? 'text-primary' : 'opacity-0 group-hover/task:opacity-100')}
            onClick={(e) => {
              e.stopPropagation();
              updateTask(task.id, { isFollowUp: !task.isFollowUp });
            }}
          >
            <Bookmark className={task.isFollowUp ? 'fill-current' : undefined} />
          </IconButton>
          <IconButton
            label="Delete task"
            size="icon-xs"
            className="opacity-0 group-hover/task:opacity-100 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteTask(task.id);
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    );
  };

  const renderDecision = (d: Decision, showNoteLink: boolean) => {
    const isEditing = editingDecisionId === d.id;
    const sourceNote = showNoteLink ? notes.find((n) => n.id === d.noteId) : undefined;
    const startEdit = () => {
      setEditingDecision(d.id);
      setEditDecisionText(d.text);
    };
    return (
      <div key={d.id} className="group/dec flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5">
        <Gavel className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isEditing ? (
            <Input
              ref={decisionEditRef}
              autoFocus
              aria-label="Edit decision"
              value={editDecisionText}
              onChange={(e) => setEditDecisionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editDecisionText.trim()) {
                  updateDecision(d.id, { text: editDecisionText.trim() });
                  setEditingDecision(null);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingDecision(null);
                }
              }}
              onBlur={() => {
                if (editDecisionText.trim()) updateDecision(d.id, { text: editDecisionText.trim() });
                setEditingDecision(null);
              }}
              className="h-8 text-ui"
            />
          ) : (
            <button type="button" className="text-left text-ui leading-snug" onClick={startEdit} title="Click to edit">
              {d.text}
            </button>
          )}
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span className="tabular-nums">{format(new Date(d.createdAt), 'MMM d, HH:mm')}</span>
            {sourceNote && (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 transition-colors hover:text-foreground"
                onClick={() => navigateToNote(d.noteId)}
                title="Go to source note"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{sourceNote.title || 'Untitled note'}</span>
              </button>
            )}
          </div>
        </div>
        {!isEditing && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/dec:opacity-100">
            <IconButton label="Edit decision" size="icon-xs" onClick={startEdit}>
              <Pencil />
            </IconButton>
          <IconButton label="Revoke decision" size="icon-xs" className="hover:text-destructive" onClick={() => deleteDecision(d.id)}>
              <Trash2 />
            </IconButton>
          </div>
        )}
      </div>
    );
  };

  const quickAdd = (value: string, setValue: (v: string) => void, onAdd: () => void, placeholder: string) => (
    <div className="flex items-center gap-1.5">
      <Input
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        className="h-8 bg-card text-ui"
      />
      <Button size="icon-sm" onClick={onAdd} aria-label={placeholder} disabled={!value.trim()}>
        <Plus />
      </Button>
    </div>
  );

  const countBadge = (n: number) => (n > 0 ? <span className="text-2xs text-muted-foreground tabular-nums">{n}</span> : null);

  return (
    <aside aria-label="Note side panel" className="flex h-full w-90 shrink-0 flex-col border-l bg-sidebar">
      <Tabs value={rightPanelTab} onValueChange={(v) => setRightPanelTab(v as RightPanelTab)} className="shrink-0 p-3 pb-0">
        <TabsList className="w-full">
          <TabsTrigger value="tasks" className="text-xs">
            Tasks {countBadge(tabCounts.tasks)}
          </TabsTrigger>
          <TabsTrigger value="decisions" className="text-xs">
            Decisions {countBadge(tabCounts.decisions)}
          </TabsTrigger>
          <TabsTrigger value="followups" className="text-xs">
            Follow-ups {countBadge(tabCounts.followups)}
          </TabsTrigger>
          <TabsTrigger value="transcript" className="text-xs">
            {isRecording ? (
              <span className="size-1.5 animate-pulse rounded-full bg-recording" />
            ) : (activeNote?.transcripts?.length ?? 0) > 0 ? (
              <span className="size-1.5 rounded-full bg-success" />
            ) : null}
            Transcript
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Always mounted so recording survives switching to the other tabs */}
        <div className={rightPanelTab !== 'transcript' ? 'hidden' : ''}>
          <TranscriptTab />
        </div>

        {rightPanelTab === 'tasks' && (
          <div className="flex flex-col gap-4 p-3">
            {quickAdd(quickTask, setQuickTask, handleQuickAddTask, 'Add task to this note…')}

            {detectedActions.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-warning-soft p-2.5">
                <div className="flex items-center gap-1 text-xs font-medium text-warning">
                  <Zap className="size-3.5" /> Detected in note
                </div>
                {detectedActions.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs" title={line}>
                      {line}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const title = line.replace(/^(TODO|AI):\s*/i, '');
                        if (title && activeTabId && activeNoteId && activeProjectId) {
                          addTask({
                            projectId: activeProjectId,
                            supplierId: contextSupplierId,
                            noteId: activeNoteId,
                            title,
                            status: 'open',
                            priority: 'medium',
                            owner: '',
                            dueDate: '',
                            description: '',
                          });
                        }
                      }}
                    >
                      → Task
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-0.5">
              <SectionLabel count={noteTasks.length}>This note</SectionLabel>
              {noteTasks.map((task) => renderTaskCard(task, false))}
              {noteTasks.length === 0 && <p className="px-1 py-1.5 text-xs text-muted-foreground">None yet — add one above or select text in the editor.</p>}
            </div>

            {otherTasks.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <SectionLabel count={otherTasks.length}>Other notes</SectionLabel>
                {otherTasks.map((task) => renderTaskCard(task, true))}
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'decisions' && (
          <div className="flex flex-col gap-4 p-3">
            {quickAdd(quickDecision, setQuickDecision, handleQuickAddDecision, 'Record a decision…')}
            <div className="flex flex-col gap-2">
              <SectionLabel count={noteDecisions.length} className="pb-0">
                This note
              </SectionLabel>
              {noteDecisions.map((d) => renderDecision(d, false))}
              {noteDecisions.length === 0 && (
                <p className="px-1 py-1.5 text-xs text-muted-foreground">None yet — add one above or select text in the editor.</p>
              )}
            </div>
            {otherDecisions.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel count={otherDecisions.length} className="pb-0">
                  Other notes
                </SectionLabel>
                {otherDecisions.map((d) => renderDecision(d, true))}
              </div>
            )}
          </div>
        )}

        {rightPanelTab === 'followups' && (
          <div className="p-3">
            <FollowUpsPanel />
          </div>
        )}
      </div>
    </aside>
  );
}
