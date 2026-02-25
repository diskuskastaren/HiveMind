import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import type { TaskStatus, Priority, DashboardSection } from '../types';
import {
  CheckCircle2,
  Circle,
  Clock,
  Lightbulb,
  Bookmark,
  FileText,
  GripVertical,
  ChevronRight,
  Trash2,
  ArrowUpRight,
  CheckCheck,
  Pencil,
} from 'lucide-react';

const TASK_COLUMNS: { status: TaskStatus; label: string; colorClass: string }[] = [
  { status: 'open', label: 'Open', colorClass: 'border-gray-300' },
  { status: 'doing', label: 'In Progress', colorClass: 'border-yellow-400' },
  { status: 'done', label: 'Done', colorClass: 'border-green-400' },
];

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  open: <Circle className="w-4 h-4 text-gray-400" />,
  doing: <Clock className="w-4 h-4 text-yellow-500" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
};

function FilterBar({
  filterProject,
  filterSupplier,
  onProjectChange,
  onSupplierChange,
}: {
  filterProject: string;
  filterSupplier: string;
  onProjectChange: (id: string) => void;
  onSupplierChange: (id: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);

  const visibleSuppliers = filterProject === 'all'
    ? suppliers
    : suppliers.filter((s) => s.projectIds.includes(filterProject));

  return (
    <div className="flex items-center gap-2">
      <select
        value={filterProject}
        onChange={(e) => { onProjectChange(e.target.value); onSupplierChange('all'); }}
        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
      >
        <option value="all">All projects</option>
        {projects.filter((p) => !p.archived).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select
        value={filterSupplier}
        onChange={(e) => onSupplierChange(e.target.value)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
      >
        <option value="all">All suppliers</option>
        <option value={INTERNAL_TAB_ID}>Internal</option>
        {visibleSuppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

function TasksSection() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [dragging, setDragging] = useState<string | null>(null);

  const filtered = tasks
    .filter((t) => filterProject === 'all' || t.projectId === filterProject)
    .filter((t) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return t.supplierId === null;
      return t.supplierId === filterSupplier;
    });

  const openCount = filtered.filter((t) => t.status === 'open').length;
  const doingCount = filtered.filter((t) => t.status === 'doing').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FilterBar
            filterProject={filterProject}
            filterSupplier={filterSupplier}
            onProjectChange={setFilterProject}
            onSupplierChange={setFilterSupplier}
          />
          {(openCount > 0 || doingCount > 0) && (
            <span className="text-xs text-gray-400">
              {openCount + doingCount} active
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto min-h-0">
        {TASK_COLUMNS.map((col) => {
          const colTasks = filtered
            .filter((t) => t.status === col.status)
            .sort((a, b) => b.createdAt - a.createdAt);

          return (
            <div
              key={col.status}
              className={`flex-1 min-w-[240px] max-w-xs bg-gray-50 rounded-xl border-t-2 ${col.colorClass} flex flex-col`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) { updateTask(dragging, { status: col.status }); setDragging(null); }
              }}
            >
              <div className="px-3 py-2.5 flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
                  {colTasks.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {colTasks.map((task) => {
                  const supplier = task.supplierId ? suppliers.find((s) => s.id === task.supplierId) : null;
                  const project = projects.find((p) => p.id === task.projectId);
                  const note = notes.find((n) => n.id === task.noteId);

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`group bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${
                        dragging === task.id ? 'opacity-50' : ''
                      }`}
                      onClick={() => setEditingTask(task.id)}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                            {task.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority]}`}
                              title={task.priority}
                            />
                            {project && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: project.color + '20', color: project.color }}
                              >
                                {project.name}
                              </span>
                            )}
                            {supplier ? (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: supplier.color + '20', color: supplier.color }}
                              >
                                {supplier.name}
                              </span>
                            ) : task.supplierId === null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500 font-medium">
                                Internal
                              </span>
                            )}
                            {task.owner && <span className="text-[10px] text-gray-400">@{task.owner}</span>}
                            {task.dueDate && <span className="text-[10px] text-gray-400">{task.dueDate}</span>}
                          </div>
                          {note && (
                            <button
                              className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400 hover:text-blue-600 transition-colors max-w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToNote(task.noteId);
                              }}
                              title="Go to source note"
                            >
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{note.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                            title={`Move to ${col.status === 'open' ? 'In Progress' : col.status === 'doing' ? 'Done' : 'Open'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTask(task.id, { status: NEXT_STATUS[col.status] });
                            }}
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button
                            className="p-0.5 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete task"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(task.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="py-6 text-center text-xs text-gray-300">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DecisionsSection() {
  const decisions = useStore((s) => s.decisions);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const deleteDecision = useStore((s) => s.deleteDecision);
  const updateDecision = useStore((s) => s.updateDecision);
  const editingDecisionId = useStore((s) => s.editingDecisionId);
  const setEditingDecision = useStore((s) => s.setEditingDecision);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const filtered = decisions
    .filter((d) => filterProject === 'all' || d.projectId === filterProject)
    .filter((d) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return d.supplierId === null;
      return d.supplierId === filterSupplier;
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  // Group by supplier
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, d) => {
    const key = d.supplierId ?? '__internal__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <FilterBar
          filterProject={filterProject}
          filterSupplier={filterSupplier}
          onProjectChange={setFilterProject}
          onSupplierChange={setFilterSupplier}
        />
        {filtered.length > 0 && (
          <span className="text-xs text-gray-400">{filtered.length} decision{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-6">
        {groupKeys.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Lightbulb className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No decisions captured yet.</p>
            <p className="text-xs text-gray-300 mt-1">Select text in a note and press Alt+D to add one.</p>
          </div>
        )}

        {groupKeys.map((key) => {
          const supplier = key === '__internal__' ? null : suppliers.find((s) => s.id === key);
          const groupDecisions = grouped[key];

          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                {supplier ? (
                  <>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: supplier.color }} />
                    <span className="text-xs font-semibold text-gray-600">{supplier.name}</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span className="text-xs font-semibold text-indigo-600">Internal</span>
                  </>
                )}
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                  {groupDecisions.length}
                </span>
              </div>

              <div className="space-y-1">
                {groupDecisions.map((d) => {
                  const note = notes.find((n) => n.id === d.noteId);
                  const project = projects.find((p) => p.id === d.projectId);
                  const isEditing = editingDecisionId === d.id;
                  return (
                    <div
                      key={d.id}
                      className="group flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
                    >
                      <Lightbulb className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            autoFocus
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editText.trim()) {
                                updateDecision(d.id, { text: editText.trim() });
                                setEditingDecision(null);
                              }
                              if (e.key === 'Escape') setEditingDecision(null);
                            }}
                            onBlur={() => {
                              if (editText.trim()) updateDecision(d.id, { text: editText.trim() });
                              setEditingDecision(null);
                            }}
                            className="w-full text-sm px-2 py-1 border border-green-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400"
                          />
                        ) : (
                          <p
                            className="text-sm text-gray-800 cursor-pointer hover:text-gray-600"
                            onClick={() => { setEditingDecision(d.id); setEditText(d.text); }}
                            title="Click to edit"
                          >
                            {d.text}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {project && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: project.color + '20', color: project.color }}
                            >
                              {project.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(d.createdAt), 'MMM d, HH:mm')}
                          </span>
                          {note && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors"
                              onClick={() => navigateToNote(d.noteId)}
                              title="Go to source note"
                            >
                              <FileText className="w-3 h-3" />
                              <span className="truncate max-w-[160px]">{note.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            onClick={() => { setEditingDecision(d.id); setEditText(d.text); }}
                            title="Edit decision"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button
                            className="p-1 hover:bg-red-50 rounded transition-colors"
                            onClick={() => deleteDecision(d.id)}
                            title="Delete decision"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FollowUpsSection() {
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const updateTask = useStore((s) => s.updateTask);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  const setEditingTask = useStore((s) => s.setEditingTask);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [showResolved, setShowResolved] = useState(false);

  const filteredTasks = tasks
    .filter((t) => t.isFollowUp)
    .filter((t) => filterProject === 'all' || t.projectId === filterProject)
    .filter((t) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return t.supplierId === null;
      return t.supplierId === filterSupplier;
    });

  const filteredFollowUps = followUps
    .filter((f) => filterProject === 'all' || f.projectId === filterProject)
    .filter((f) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return f.supplierId === null;
      return f.supplierId === filterSupplier;
    });

  const openTasks = filteredTasks.filter((t) => t.status !== 'done');
  const resolvedTasks = filteredTasks.filter((t) => t.status === 'done');
  const openStandalone = filteredFollowUps.filter((f) => f.status === 'open');
  const resolvedStandalone = filteredFollowUps.filter((f) => f.status === 'resolved');

  const openCount = openTasks.length + openStandalone.length;
  const resolvedCount = resolvedTasks.length + resolvedStandalone.length;

  // Group open items by supplier
  const allOpen = [
    ...openTasks.map((t) => ({ type: 'task' as const, item: t, supplierId: t.supplierId, projectId: t.projectId })),
    ...openStandalone.map((f) => ({ type: 'followup' as const, item: f, supplierId: f.supplierId, projectId: f.projectId })),
  ].sort((a, b) => b.item.createdAt - a.item.createdAt);

  const allResolved = [
    ...resolvedTasks.map((t) => ({ type: 'task' as const, item: t, supplierId: t.supplierId, projectId: t.projectId })),
    ...resolvedStandalone.map((f) => ({ type: 'followup' as const, item: f, supplierId: f.supplierId, projectId: f.projectId })),
  ].sort((a, b) => b.item.createdAt - a.item.createdAt);

  const renderItem = (entry: typeof allOpen[0]) => {
    const { type, item, supplierId, projectId } = entry;
    const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null;
    const project = projects.find((p) => p.id === projectId);
    const text = type === 'task' ? (item as typeof tasks[0]).title : (item as typeof followUps[0]).text;
    const isResolved = type === 'task' ? (item as typeof tasks[0]).status === 'done' : (item as typeof followUps[0]).status === 'resolved';

    return (
      <div
        key={`${type}-${item.id}`}
        className="group flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
      >
        <button
          className="mt-0.5 flex-shrink-0"
          onClick={() => {
            if (type === 'task') {
              updateTask(item.id, { status: isResolved ? 'open' : 'done' });
            } else {
              updateFollowUp(item.id, { status: isResolved ? 'open' : 'resolved' });
            }
          }}
          title={isResolved ? 'Mark as open' : 'Mark as resolved'}
        >
          {isResolved
            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
            : <Circle className="w-4 h-4 text-gray-300 hover:text-violet-400 transition-colors" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <span className={`text-sm ${isResolved ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {text}
          </span>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {project && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: project.color + '20', color: project.color }}
              >
                {project.name}
              </span>
            )}
            {supplier ? (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: supplier.color + '20', color: supplier.color }}
              >
                {supplier.name}
              </span>
            ) : supplierId === null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500 font-medium">
                Internal
              </span>
            )}
            {type === 'task' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[(item as typeof tasks[0]).priority]}`}>
                {(item as typeof tasks[0]).priority}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {type === 'task' && (
            <button
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded hover:bg-violet-100 transition-colors"
              onClick={() => setEditingTask(item.id)}
              title="Open task"
            >
              Task <ArrowUpRight className="w-2.5 h-2.5" />
            </button>
          )}
          {type === 'followup' && (
            <button
              className="p-1 hover:bg-red-50 rounded transition-colors"
              onClick={() => deleteFollowUp(item.id)}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <FilterBar
          filterProject={filterProject}
          filterSupplier={filterSupplier}
          onProjectChange={setFilterProject}
          onSupplierChange={setFilterSupplier}
        />
        {openCount > 0 && (
          <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-medium">
            {openCount} open
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {openCount === 0 && resolvedCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bookmark className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No follow-ups yet.</p>
            <p className="text-xs text-gray-300 mt-1">Flag a task with the bookmark icon or press Alt+F.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allOpen.map(renderItem)}

            {resolvedCount > 0 && (
              <div className="pt-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2 px-1"
                  onClick={() => setShowResolved((v) => !v)}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
                </button>
                {showResolved && (
                  <div className="space-y-2">
                    {allResolved.map(renderItem)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SECTION_CONFIG: { id: DashboardSection; label: string; icon: React.ReactNode }[] = [
  { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { id: 'decisions', label: 'Decisions', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: 'followups', label: 'Follow-ups', icon: <Bookmark className="w-3.5 h-3.5" /> },
];

export function Dashboard() {
  const dashboardSection = useStore((s) => s.dashboardSection);
  const setDashboardSection = useStore((s) => s.setDashboardSection);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const followUps = useStore((s) => s.followUps);

  const counts: Record<DashboardSection, number> = {
    tasks: tasks.filter((t) => t.status !== 'done').length,
    decisions: decisions.length,
    followups:
      tasks.filter((t) => t.isFollowUp && t.status !== 'done').length +
      followUps.filter((f) => f.status === 'open').length,
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30 min-h-0">
      {/* Section tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 flex-shrink-0 border-b border-gray-200 bg-white">
        {SECTION_CONFIG.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setDashboardSection(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              dashboardSection === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {icon}
            {label}
            {counts[id] > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                dashboardSection === id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-hidden p-6 min-h-0">
        {dashboardSection === 'tasks' && <TasksSection />}
        {dashboardSection === 'decisions' && <DecisionsSection />}
        {dashboardSection === 'followups' && <FollowUpsSection />}
      </div>
    </div>
  );
}
