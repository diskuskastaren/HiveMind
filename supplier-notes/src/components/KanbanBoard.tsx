import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { CustomSelect } from './ui/CustomSelect';
import type { TaskStatus, Priority } from '../types';
import { X, ChevronRight, FileText } from 'lucide-react';

const COLUMNS: { status: TaskStatus; label: string; headerBadge: string; topBorder: string }[] = [
  { status: 'open',  label: 'Open',  headerBadge: 'bg-gray-100 text-gray-500',    topBorder: 'border-gray-300' },
  { status: 'doing', label: 'Doing', headerBadge: 'bg-amber-50 text-amber-700',   topBorder: 'border-amber-400' },
  { status: 'done',  label: 'Done',  headerBadge: 'bg-green-50 text-green-700',   topBorder: 'border-green-400' },
];

const PRIORITY_BORDER: Record<Priority, string> = {
  low:    'border-l-gray-200',
  medium: 'border-l-amber-400',
  high:   'border-l-red-500',
};

const PRIORITY_LABEL: Record<Priority, { text: string; classes: string }> = {
  low:    { text: 'Low',    classes: 'bg-gray-100 text-gray-500' },
  medium: { text: 'Medium', classes: 'bg-amber-50 text-amber-700' },
  high:   { text: 'High',   classes: 'bg-red-50 text-red-600' },
};

function ownerInitials(owner: string): string {
  return owner
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

// Deterministic hue from a string so each owner gets a consistent color
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

const DUE_DATE_CLASSES: Record<DueDateUrgency, string> = {
  overdue: 'text-red-500 font-medium',
  soon:    'text-amber-600',
  normal:  'text-gray-400',
};

export function KanbanBoard() {
  const tasks        = useStore((s) => s.tasks);
  const projects     = useStore((s) => s.projects);
  const suppliers    = useStore((s) => s.suppliers);
  const notes        = useStore((s) => s.notes);
  const updateTask   = useStore((s) => s.updateTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const toggleKanban = useStore((s) => s.toggleKanban);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [filterProject,  setFilterProject]  = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [dragging,       setDragging]       = useState<string | null>(null);

  const filtered = tasks
    .filter((t) => filterProject === 'all' || t.projectId === filterProject)
    .filter((t) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return t.supplierId === null;
      return t.supplierId === filterSupplier;
    });

  const projectSuppliers = filterProject === 'all'
    ? suppliers
    : suppliers.filter((s) => s.projectIds.includes(filterProject));

  const handleDragStart = (taskId: string) => setDragging(taskId);
  const handleDragEnd   = () => setDragging(null);
  const handleDrop = (status: TaskStatus) => {
    if (dragging) { updateTask(dragging, { status }); setDragging(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={toggleKanban} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-tight">Task Board</h2>
          <div className="flex items-center gap-3">
            <CustomSelect
              value={filterProject}
              onChange={(v) => { setFilterProject(v); setFilterSupplier('all'); }}
              className="text-sm px-3 py-1.5 text-gray-700"
              options={[
                { value: 'all', label: 'All projects' },
                ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <CustomSelect
              value={filterSupplier}
              onChange={setFilterSupplier}
              className="text-sm px-3 py-1.5 text-gray-700"
              options={[
                { value: 'all', label: 'All suppliers' },
                { value: INTERNAL_TAB_ID, label: 'Internal' },
                ...projectSuppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <button onClick={toggleKanban} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 min-h-[400px]">
            {COLUMNS.map((col) => {
              const colTasks = filtered
                .filter((t) => t.status === col.status)
                .sort((a, b) => {
                  const priorityOrder = { high: 0, medium: 1, low: 2 };
                  const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
                  return pd !== 0 ? pd : b.createdAt - a.createdAt;
                });

              return (
                <div
                  key={col.status}
                  className={`flex-1 min-w-[260px] bg-gray-50 rounded-lg border-t-2 ${col.topBorder}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col.status)}
                >
                  {/* Column header */}
                  <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {col.label}
                    </span>
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${col.headerBadge}`}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="px-2 pb-2 space-y-2">
                    {colTasks.map((task) => {
                      const supplier = task.supplierId
                        ? suppliers.find((s) => s.id === task.supplierId)
                        : null;
                      const project = projects.find((p) => p.id === task.projectId);
                      const note    = notes.find((n) => n.id === task.noteId);
                      const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;
                      const hue     = task.owner ? ownerHue(task.owner) : 0;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => handleDragStart(task.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setEditingTask(task.id)}
                          className={`
                            group bg-white rounded-lg border border-gray-200
                            border-l-[3px] ${PRIORITY_BORDER[task.priority]}
                            p-3 cursor-grab active:cursor-grabbing
                            hover:shadow-md hover:-translate-y-px
                            transition-all duration-150
                            ${dragging === task.id ? 'opacity-40 scale-95' : ''}
                          `}
                        >
                          {/* Title */}
                          <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 mb-2">
                            {task.title}
                          </p>

                          {/* Tags row: project + supplier/internal + priority */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-2">
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_LABEL[task.priority].classes}`}>
                              {PRIORITY_LABEL[task.priority].text}
                            </span>
                            {project && (
                              <span
                                className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: project.color + '18',
                                  color: project.color,
                                }}
                              >
                                {project.name}
                              </span>
                            )}
                            {supplier ? (
                              <span
                                className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: supplier.color + '18',
                                  color: supplier.color,
                                }}
                              >
                                {supplier.name}
                              </span>
                            ) : task.supplierId === null && (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">
                                Internal
                              </span>
                            )}
                          </div>

                          {/* Due date row */}
                          {task.dueDate && urgency && (
                            <div className="mt-1">
                              <span className={`text-[11px] ${DUE_DATE_CLASSES[urgency]}`}>
                                {urgency === 'overdue' ? '⚑ ' : ''}{formatDueDate(task.dueDate)}
                              </span>
                            </div>
                          )}

                          {/* Footer row: source note (left) + owner (right) */}
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <div className="flex-1 min-w-0">
                              {note && (
                                <button
                                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 transition-colors max-w-full"
                                  onClick={(e) => { e.stopPropagation(); navigateToNote(task.noteId); }}
                                  title="Go to source note"
                                >
                                  <FileText className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{note.title || 'Untitled note'}</span>
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {task.owner && (
                                <span
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                                  style={{ backgroundColor: `hsl(${hue} 55% 52%)` }}
                                  title={task.owner}
                                >
                                  {ownerInitials(task.owner)}
                                </span>
                              )}
                              {col.status !== 'done' && (
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-100 rounded"
                                  title={`Move to ${col.status === 'open' ? 'Doing' : 'Done'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTask(task.id, {
                                      status: col.status === 'open' ? 'doing' : 'done',
                                    });
                                  }}
                                >
                                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
