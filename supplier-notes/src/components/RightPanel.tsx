import { useState, useMemo, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import type { TaskStatus, Priority, Task } from '../types';
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Lightbulb,
  Zap,
  Bookmark,
  FileText,
  Pencil,
  Mic,
} from 'lucide-react';
import { TranscriptTab } from './TranscriptTab';

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
  open: <Circle className="w-4 h-4 text-gray-400" />,
  doing: <Clock className="w-4 h-4 text-yellow-500" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

const PRIORITY_BORDER: Record<Priority, string> = {
  low:    'border-l-gray-200',
  medium: 'border-l-amber-400',
  high:   'border-l-red-500',
};

const PRIORITY_LABEL: Record<Priority, { text: string; classes: string }> = {
  low:    { text: 'Low',    classes: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'  },
  medium: { text: 'Medium', classes: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  high:   { text: 'High',   classes: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'    },
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
};

function ownerInitials(owner: string): string {
  return owner.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
}

function ownerHue(owner: string): number {
  let hash = 0;
  for (let i = 0; i < owner.length; i++) hash = owner.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
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
  overdue: 'text-red-500 dark:text-red-400 font-medium',
  soon:    'text-amber-600 dark:text-amber-400',
  normal:  'text-gray-400 dark:text-gray-500',
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
  };

  const renderTaskCard = (task: Task, showNoteLink: boolean) => {
    const taskNote = notes.find((n) => n.id === task.noteId);
    const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;
    const ownerAvatar = (() => {
      if (!task.owner) return null;
      if (task.owner === 'Internal') return { initials: 'I', bg: 'hsl(0 0% 75%)', title: 'Internal' };
      return { initials: ownerInitials(task.owner), bg: `hsl(${ownerHue(task.owner)} 55% 52%)`, title: task.owner };
    })();

    return (
      <div
        key={task.id}
        onClick={() => setEditingTask(task.id)}
        className={`
          group bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700
          border-l-[3px] ${PRIORITY_BORDER[task.priority]}
          p-2.5 cursor-pointer hover:shadow-sm transition-all duration-150
        `}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: NEXT_STATUS[task.status] }); }}
            className="mt-0.5 flex-shrink-0"
            title={`Status: ${task.status} — click to cycle`}
          >
            {STATUS_ICONS[task.status]}
          </button>
          <p className={`flex-1 text-sm font-medium leading-snug line-clamp-2 ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              className={`p-0.5 rounded transition-colors ${task.isFollowUp ? 'text-violet-500' : 'opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-violet-400'}`}
              onClick={(e) => { e.stopPropagation(); updateTask(task.id, { isFollowUp: !task.isFollowUp }); }}
              title={task.isFollowUp ? 'Remove from follow-ups' : 'Add to follow-ups'}
            >
              <Bookmark className="w-3.5 h-3.5" fill={task.isFollowUp ? 'currentColor' : 'none'} />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-opacity"
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
              title="Delete task"
            >
              <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 pl-6">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_LABEL[task.priority].classes}`}>
              {PRIORITY_LABEL[task.priority].text}
            </span>
            {task.dueDate && urgency && (
              <span className={`text-[11px] ${DUE_DATE_CLASSES[urgency]}`}>
                {urgency === 'overdue' ? '⚑ ' : ''}{formatDueDate(task.dueDate)} · {formatTimeLeft(task.dueDate)}
              </span>
            )}
          </div>
          {ownerAvatar && (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: ownerAvatar.bg }}
              title={ownerAvatar.title}
            >
              {ownerAvatar.initials}
            </span>
          )}
        </div>
        {showNoteLink && taskNote && (
          <button
            className="flex items-center gap-1 mt-1.5 pl-6 text-[11px] text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors max-w-full"
            onClick={(e) => { e.stopPropagation(); navigateToNote(task.noteId); }}
            title="Go to source note"
          >
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{taskNote.title || 'Untitled note'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="border-l border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 h-full flex-shrink-0 w-96"
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {(['tasks', 'decisions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightPanelTab(tab)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium capitalize transition-colors ${
              rightPanelTab === tab
                ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab}
            {tabCounts[tab] > 0 && (
              <span className="ml-1 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5">
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setRightPanelTab('transcript')}
          className={`flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
            rightPanelTab === 'transcript'
              ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Mic className="w-3 h-3" />
          {isRecording ? (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          ) : (activeNote?.transcripts?.length ?? 0) > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          ) : null}
        </button>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Always mounted so recording survives switching to Tasks/Decisions tabs */}
        <div className={rightPanelTab !== 'transcript' ? 'hidden' : ''}>
          <TranscriptTab />
        </div>
        {rightPanelTab === 'tasks' && (
          <div className="p-3 space-y-1">
            {/* Quick add */}
            <div className="flex items-center gap-1 mb-3">
              <input
                type="text"
                placeholder="Quick add task…"
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAddTask()}
                className="flex-1 text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={handleQuickAddTask}
                className="p-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {detectedActions.length > 0 && (
              <div className="mb-3 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 p-2">
                <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Detected in note
                </div>
                {detectedActions.map((line, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-0.5">
                    <span className="flex-1 text-xs text-amber-900 dark:text-amber-300 truncate" title={line}>
                      {line}
                    </span>
                    <button
                      className="text-[10px] px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-300 dark:hover:bg-amber-700 flex-shrink-0 transition-colors"
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
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* This note section */}
            <div className="flex items-center gap-3 pt-2 pb-1">
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 flex-shrink-0">
                This note
              </span>
              {noteTasks.length > 0 && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
                  {noteTasks.length}
                </span>
              )}
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            </div>

            {noteTasks.map((task) => renderTaskCard(task, false))}

            {noteTasks.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-1.5 pl-1 italic">
                None yet — add one above or select text in the editor.
              </p>
            )}

            {/* Other notes section */}
            {otherTasks.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-3 pb-1">
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-shrink-0">
                    Other notes
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                </div>
                {otherTasks.map((task) => renderTaskCard(task, true))}
              </>
            )}
          </div>
        )}

        {rightPanelTab === 'decisions' && (
          <div className="p-3 space-y-1">
            <div className="flex items-center gap-1 mb-3">
              <input
                type="text"
                placeholder="Quick add decision…"
                value={quickDecision}
                onChange={(e) => setQuickDecision(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAddDecision()}
                className="flex-1 text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={handleQuickAddDecision}
                className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* This note section */}
            <div className="flex items-center gap-3 pt-2 pb-1">
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 flex-shrink-0">
                This note
              </span>
              {noteDecisions.length > 0 && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
                  {noteDecisions.length}
                </span>
              )}
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            </div>

            {noteDecisions.map((d) => {
              const isEditing = editingDecisionId === d.id;
              return (
                <div key={d.id} className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Lightbulb className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        ref={decisionEditRef}
                        autoFocus
                        type="text"
                        value={editDecisionText}
                        onChange={(e) => setEditDecisionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editDecisionText.trim()) {
                            updateDecision(d.id, { text: editDecisionText.trim() });
                            setEditingDecision(null);
                          }
                          if (e.key === 'Escape') setEditingDecision(null);
                        }}
                        onBlur={() => {
                          if (editDecisionText.trim()) updateDecision(d.id, { text: editDecisionText.trim() });
                          setEditingDecision(null);
                        }}
                        className="w-full text-sm px-1.5 py-1 border border-green-300 dark:border-green-700 rounded focus:outline-none focus:ring-1 focus:ring-green-400 dark:bg-gray-700 dark:text-gray-100"
                      />
                    ) : (
                      <div
                        className="text-sm cursor-pointer dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
                        onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                        title="Click to edit"
                      >
                        {d.text}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {format(new Date(d.createdAt), 'MMM d, HH:mm')}
                    </div>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                        title="Edit decision"
                      >
                        <Pencil className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      </button>
                      <button
                        className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        onClick={() => deleteDecision(d.id)}
                        title="Delete decision"
                      >
                        <Trash2 className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {noteDecisions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-1.5 pl-1 italic">
                None yet — add one above or select text in the editor.
              </p>
            )}

            {/* Other notes section */}
            {otherDecisions.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-3 pb-1">
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-shrink-0">
                    Other notes
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                </div>

                {otherDecisions.map((d) => {
                  const isEditing = editingDecisionId === d.id;
                  const sourceNote = notes.find((n) => n.id === d.noteId);
                  return (
                    <div key={d.id} className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Lightbulb className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            ref={decisionEditRef}
                            autoFocus
                            type="text"
                            value={editDecisionText}
                            onChange={(e) => setEditDecisionText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editDecisionText.trim()) {
                                updateDecision(d.id, { text: editDecisionText.trim() });
                                setEditingDecision(null);
                              }
                              if (e.key === 'Escape') setEditingDecision(null);
                            }}
                            onBlur={() => {
                              if (editDecisionText.trim()) updateDecision(d.id, { text: editDecisionText.trim() });
                              setEditingDecision(null);
                            }}
                            className="w-full text-sm px-1.5 py-1 border border-green-300 dark:border-green-700 rounded focus:outline-none focus:ring-1 focus:ring-green-400 dark:bg-gray-700 dark:text-gray-100"
                          />
                        ) : (
                          <div
                            className="text-sm cursor-pointer dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
                            onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                            title="Click to edit"
                          >
                            {d.text}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {format(new Date(d.createdAt), 'MMM d, HH:mm')}
                          </span>
                          {sourceNote && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors"
                              onClick={() => navigateToNote(d.noteId)}
                              title="Go to source note"
                            >
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[120px]">{sourceNote.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                            title="Edit decision"
                          >
                            <Pencil className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                          </button>
                          <button
                            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            onClick={() => deleteDecision(d.id)}
                            title="Delete decision"
                          >
                            <Trash2 className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
