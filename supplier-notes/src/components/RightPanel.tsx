import { useState, useMemo, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import type { TaskStatus, Priority } from '../types';
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Lightbulb,
  Filter,
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

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
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

  const [filterMode, setFilterMode] = useState<'note' | 'supplier'>('supplier');

  const detectedActions = useMemo(() => detectActionLines(activeNoteContent), [activeNoteContent]);

  const contextSupplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;

  const supplierTasks = tasks
    .filter((t) => t.projectId === activeProjectId && t.supplierId === contextSupplierId)
    .filter((t) => (filterMode === 'note' && activeNoteId ? t.noteId === activeNoteId : true))
    .sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.createdAt - a.createdAt;
    });

  const supplierDecisions = decisions
    .filter((d) => d.projectId === activeProjectId && d.supplierId === contextSupplierId)
    .filter((d) => (filterMode === 'note' && activeNoteId ? d.noteId === activeNoteId : true))
    .sort((a, b) => b.createdAt - a.createdAt);

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
    tasks: supplierTasks.length,
    decisions: supplierDecisions.length,
  };

  return (
    <div
      className="border-l border-gray-200 flex flex-col bg-white h-full flex-shrink-0 w-96"
    >
      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(['tasks', 'decisions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightPanelTab(tab)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium capitalize transition-colors ${
              rightPanelTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {tabCounts[tab] > 0 && (
              <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setRightPanelTab('transcript')}
          className={`flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
            rightPanelTab === 'transcript'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
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

      {/* Filter toggle — hidden for transcript tab */}
      {rightPanelTab !== 'transcript' && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
          <button
            onClick={() => setFilterMode(filterMode === 'note' ? 'supplier' : 'note')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <Filter className="w-3 h-3" />
            {filterMode === 'note' ? 'This note' : 'All notes'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {rightPanelTab === 'transcript' && <TranscriptTab />}
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
                className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleQuickAddTask}
                className="p-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {detectedActions.length > 0 && (
              <div className="mb-3 border border-amber-200 rounded-lg bg-amber-50/50 p-2">
                <div className="text-[10px] font-medium text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Detected in note
                </div>
                {detectedActions.map((line, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-0.5">
                    <span className="flex-1 text-xs text-amber-900 truncate" title={line}>
                      {line}
                    </span>
                    <button
                      className="text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded hover:bg-amber-300 flex-shrink-0 transition-colors"
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

            {supplierTasks.map((task) => {
              const taskNote = notes.find((n) => n.id === task.noteId);
              return (
              <div
                key={task.id}
                className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setEditingTask(task.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTask(task.id, { status: NEXT_STATUS[task.status] });
                  }}
                  className="mt-0.5 flex-shrink-0"
                  title={`Status: ${task.status} — click to cycle`}
                >
                  {STATUS_ICONS[task.status]}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                    {task.title}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </span>
                    {task.owner && <span className="text-[10px] text-gray-400">@{task.owner}</span>}
                    {task.dueDate && <span className="text-[10px] text-gray-400">{task.dueDate}</span>}
                  </div>
                  {filterMode === 'supplier' && taskNote && (
                    <button
                      className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors max-w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToNote(task.noteId);
                      }}
                      title="Go to source note"
                    >
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{taskNote.title || 'Untitled note'}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    className={`p-0.5 rounded transition-colors ${
                      task.isFollowUp
                        ? 'text-violet-500'
                        : 'opacity-0 group-hover:opacity-100 text-gray-300 hover:text-violet-400'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateTask(task.id, { isFollowUp: !task.isFollowUp });
                    }}
                    title={task.isFollowUp ? 'Remove from follow-ups' : 'Add to follow-ups'}
                  >
                    <Bookmark
                      className="w-3.5 h-3.5"
                      fill={task.isFollowUp ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask(task.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              </div>
              );
            })}

            {supplierTasks.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">
                No tasks yet. Add one above or select text in the editor.
              </p>
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
                className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                onClick={handleQuickAddDecision}
                className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {supplierDecisions.map((d) => {
              const isEditing = editingDecisionId === d.id;
              return (
                <div key={d.id} className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50">
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
                        className="w-full text-sm px-1.5 py-1 border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                    ) : (
                      <div
                        className="text-sm cursor-pointer hover:text-gray-600"
                        onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                        title="Click to edit"
                      >
                        {d.text}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {format(new Date(d.createdAt), 'MMM d, HH:mm')}
                    </div>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        className="p-0.5 hover:bg-gray-200 rounded"
                        onClick={() => { setEditingDecision(d.id); setEditDecisionText(d.text); }}
                        title="Edit decision"
                      >
                        <Pencil className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        className="p-0.5 hover:bg-gray-200 rounded"
                        onClick={() => deleteDecision(d.id)}
                        title="Delete decision"
                      >
                        <Trash2 className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {supplierDecisions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">No decisions captured yet.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
