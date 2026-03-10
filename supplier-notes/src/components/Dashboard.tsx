import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { CustomSelect } from './ui/CustomSelect';
import { OwnerDropdown } from './TaskModal';
import { format } from 'date-fns';
import type { TaskStatus, Priority, DashboardSection } from '../types';
import {
  CheckCircle2,
  Circle,
  Lightbulb,
  Bookmark,
  FileText,
  ChevronRight,
  Trash2,
  ArrowUpRight,
  CheckCheck,
  Pencil,
  Link2,
  Link2Off,
  Plus,
  X,
} from 'lucide-react';

const TASK_COLUMNS: { status: TaskStatus; label: string; colorClass: string; headerBadge: string }[] = [
  { status: 'open',  label: 'Open',        colorClass: 'border-gray-300',  headerBadge: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'  },
  { status: 'doing', label: 'In Progress', colorClass: 'border-amber-400', headerBadge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  { status: 'done',  label: 'Done',        colorClass: 'border-green-400', headerBadge: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
];

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

const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
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
      <CustomSelect
        value={filterProject}
        onChange={(v) => { onProjectChange(v); onSupplierChange('all'); }}
        className="text-xs px-2.5 py-1.5 text-gray-700 dark:text-gray-300"
        options={[
          { value: 'all', label: 'All projects' },
          ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <CustomSelect
        value={filterSupplier}
        onChange={onSupplierChange}
        className="text-xs px-2.5 py-1.5 text-gray-700 dark:text-gray-300"
        options={[
          { value: 'all', label: 'All suppliers' },
          { value: INTERNAL_TAB_ID, label: 'Internal' },
          ...visibleSuppliers.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
    </div>
  );
}

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const addTask = useStore((s) => s.addTask);

  const visibleProjects = projects.filter((p) => !p.archived);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [owner, setOwner] = useState('');
  const [projectId, setProjectId] = useState(visibleProjects[0]?.id ?? '');
  const [supplierId, setSupplierIdState] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const visibleSuppliers = projectId
    ? suppliers.filter((s) => s.projectIds.includes(projectId))
    : suppliers;

  const handleSave = () => {
    if (!title.trim() || !projectId) return;
    addTask({
      title: title.trim(),
      priority,
      status,
      owner,
      projectId,
      supplierId,
      noteId: null,
      dueDate,
      description,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">New Task</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="mb-4">
          <input
            autoFocus
            type="text"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project</label>
            <CustomSelect
              value={projectId}
              onChange={(v) => { setProjectId(v); setSupplierIdState(null); }}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={visibleProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Supplier</label>
            <CustomSelect
              value={supplierId ?? '__internal__'}
              onChange={(v) => setSupplierIdState(v === '__internal__' ? null : v)}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={[
                { value: '__internal__', label: 'Internal' },
                ...visibleSuppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Priority</label>
            <CustomSelect
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
            <CustomSelect
              value={status}
              onChange={(v) => setStatus(v as TaskStatus)}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={[
                { value: 'open', label: 'Open' },
                { value: 'doing', label: 'In Progress' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <OwnerDropdown
            owner={owner}
            onChange={setOwner}
            suppliers={visibleSuppliers.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more detail about this task…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !projectId}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksSection() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const followUps = useStore((s) => s.followUps);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const setDashboardSection = useStore((s) => s.setDashboardSection);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const ownerOptions = (() => {
    const projectSuppliers = filterProject === 'all'
      ? suppliers
      : suppliers.filter((s) => s.projectIds.includes(filterProject));
    return [
      { value: 'all', label: 'All owners' },
      { value: 'unassigned', label: 'Unassigned' },
      { value: 'Internal', label: 'Internal' },
      ...projectSuppliers.map((s) => ({ value: s.name, label: s.name })),
    ];
  })();

  const filtered = tasks
    .filter((t) => filterProject === 'all' || t.projectId === filterProject)
    .filter((t) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return t.supplierId === null;
      return t.supplierId === filterSupplier;
    })
    .filter((t) => {
      if (filterOwner === 'all') return true;
      if (filterOwner === 'unassigned') return !t.owner;
      return t.owner === filterOwner;
    });

  const openCount = filtered.filter((t) => t.status === 'open').length;
  const doingCount = filtered.filter((t) => t.status === 'doing').length;

  return (
    <div className="flex flex-col h-full">
      {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} />}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FilterBar
            filterProject={filterProject}
            filterSupplier={filterSupplier}
            onProjectChange={(id) => { setFilterProject(id); setFilterOwner('all'); }}
            onSupplierChange={setFilterSupplier}
          />
          <CustomSelect
            value={filterOwner}
            onChange={setFilterOwner}
            className="text-xs px-2.5 py-1.5 text-gray-700 dark:text-gray-300"
            options={ownerOptions}
          />
          {(openCount > 0 || doingCount > 0) && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {openCount + doingCount} active
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add task
        </button>
      </div>

      <div className="flex gap-4 flex-1 overflow-x-auto min-h-0">
        {TASK_COLUMNS.map((col) => {
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
              className={`flex-1 min-w-[240px] max-w-xs bg-gray-50 dark:bg-gray-800 rounded-xl border-t-2 ${col.colorClass} flex flex-col`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) { updateTask(dragging, { status: col.status }); setDragging(null); }
              }}
            >
              <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{col.label}</span>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${col.headerBadge}`}>
                  {colTasks.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {colTasks.map((task) => {
                  const supplier = task.supplierId ? suppliers.find((s) => s.id === task.supplierId) : null;
                  const project = projects.find((p) => p.id === task.projectId);
                  const note = notes.find((n) => n.id === task.noteId);
                  const linkedFollowUp = task.linkedFollowUpId
                    ? followUps.find((f) => f.id === task.linkedFollowUpId)
                    : null;
                  const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;

                  // Owner avatar appearance
                  const ownerAvatar = (() => {
                    if (!task.owner) return null;
                    if (task.owner === 'Internal') {
                      return { initials: 'I', bg: 'hsl(0 0% 75%)', title: 'Internal' };
                    }
                    const ownerSupplier = suppliers.find((s) => s.name === task.owner);
                    if (ownerSupplier) {
                      return { initials: ownerInitials(ownerSupplier.name), bg: ownerSupplier.color, title: ownerSupplier.name };
                    }
                    return { initials: ownerInitials(task.owner), bg: `hsl(${ownerHue(task.owner)} 55% 52%)`, title: task.owner };
                  })();

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setEditingTask(task.id)}
                      className={`
                        group bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700
                        border-l-[3px] ${PRIORITY_BORDER[task.priority]}
                        p-3 cursor-grab active:cursor-grabbing
                        hover:shadow-md hover:-translate-y-px
                        transition-all duration-150
                        ${dragging === task.id ? 'opacity-40 scale-95' : ''}
                      `}
                    >
                      {/* Title */}
                      <p className={`text-sm font-medium leading-snug line-clamp-2 mb-2 ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                        {task.title}
                      </p>

                      {/* Tags row */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_LABEL[task.priority].classes}`}>
                          {PRIORITY_LABEL[task.priority].text}
                        </span>
                        {project && (
                          <span
                            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: project.color + '18', color: project.color }}
                          >
                            {project.name}
                          </span>
                        )}
                        {supplier ? (
                          <span
                            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: supplier.color + '18', color: supplier.color }}
                          >
                            {supplier.name}
                          </span>
                        ) : task.supplierId === null && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400">
                            Internal
                          </span>
                        )}
                      </div>

                      {/* Linked follow-up */}
                      {linkedFollowUp && (
                        <button
                          className="flex items-center gap-1 mb-2 text-[11px] text-violet-500 hover:text-violet-700 transition-colors max-w-full"
                          onClick={(e) => { e.stopPropagation(); setDashboardSection('followups'); }}
                          title="Linked follow-up"
                        >
                          <Bookmark className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{linkedFollowUp.text}</span>
                        </button>
                      )}

                      {/* Due date row */}
                      {task.dueDate && urgency && (
                        <div className="mb-1">
                          <span className={`text-[11px] ${DUE_DATE_CLASSES[urgency]}`}>
                            {urgency === 'overdue' ? '⚑ ' : ''}{formatDueDate(task.dueDate)} · {formatTimeLeft(task.dueDate)}
                          </span>
                        </div>
                      )}

                      {/* Footer row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {note && (
                            <button
                              className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors max-w-full"
                              onClick={(e) => { e.stopPropagation(); navigateToNote(task.noteId); }}
                              title="Go to source note"
                            >
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{note.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {ownerAvatar && (
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                              style={{ backgroundColor: ownerAvatar.bg }}
                              title={ownerAvatar.title}
                            >
                              {ownerAvatar.initials}
                            </span>
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title={`Move to ${col.status === 'open' ? 'In Progress' : col.status === 'doing' ? 'Done' : 'Open'}`}
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: NEXT_STATUS[col.status] }); }}
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                          </button>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete task"
                            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                          >
                            <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="py-6 text-center text-xs text-gray-300 dark:text-gray-600">No tasks</div>
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
  const addDecision = useStore((s) => s.addDecision);
  const editingDecisionId = useStore((s) => s.editingDecisionId);
  const setEditingDecision = useStore((s) => s.setEditingDecision);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const visibleProjects = projects.filter((p) => !p.archived);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText, setAddText] = useState('');
  const [addProjectId, setAddProjectId] = useState(() => visibleProjects[0]?.id ?? '');
  const [addSupplierId, setAddSupplierId] = useState<string | null>(null);

  const addFormSuppliers = addProjectId
    ? suppliers.filter((s) => s.projectIds.includes(addProjectId))
    : suppliers;

  const handleAddDecision = () => {
    if (!addText.trim() || !addProjectId) return;
    addDecision({ projectId: addProjectId, supplierId: addSupplierId, noteId: null, text: addText.trim() });
    setAddText('');
    setShowAddForm(false);
  };

  const openAddForm = () => {
    setAddProjectId(visibleProjects[0]?.id ?? '');
    setAddSupplierId(null);
    setAddText('');
    setShowAddForm(true);
  };

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
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FilterBar
            filterProject={filterProject}
            filterSupplier={filterSupplier}
            onProjectChange={setFilterProject}
            onSupplierChange={setFilterSupplier}
          />
          {filtered.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} decision{filtered.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add decision
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
          <input
            ref={addInputRef}
            autoFocus
            type="text"
            placeholder="Decision text"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddDecision(); if (e.key === 'Escape') setShowAddForm(false); }}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-green-400 dark:bg-gray-700 dark:text-gray-100"
          />
          <div className="flex items-center gap-2 mb-3">
            <CustomSelect
              value={addProjectId}
              onChange={(v) => { setAddProjectId(v); setAddSupplierId(null); }}
              className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={visibleProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <CustomSelect
              value={addSupplierId ?? '__internal__'}
              onChange={(v) => setAddSupplierId(v === '__internal__' ? null : v)}
              className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={[
                { value: '__internal__', label: 'Internal' },
                ...addFormSuppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDecision}
              disabled={!addText.trim() || !addProjectId}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add decision
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6">
        {groupKeys.length === 0 && !showAddForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Lightbulb className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No decisions captured yet.</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Select text in a note and press Alt+D to add one.</p>
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
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{supplier.name}</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Internal</span>
                  </>
                )}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-1.5 py-0.5">
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
                      className="group flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all"
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
                            className="w-full text-sm px-2 py-1 border border-green-300 dark:border-green-700 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400 dark:bg-gray-700 dark:text-gray-100"
                          />
                        ) : (
                          <p
                            className="text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400"
                            onClick={() => { setEditingDecision(d.id); setEditText(d.text); }}
                            title="Click to edit"
                          >
                            {d.text}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {project && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ backgroundColor: project.color + '20', color: project.color }}
                            >
                              {project.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {format(new Date(d.createdAt), 'MMM d, HH:mm')}
                          </span>
                          {note && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors"
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
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            onClick={() => { setEditingDecision(d.id); setEditText(d.text); }}
                            title="Edit decision"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                          </button>
                          <button
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
  const addFollowUp = useStore((s) => s.addFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  const setEditingTask = useStore((s) => s.setEditingTask);

  const [filterProject, setFilterProject] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const visibleProjects = projects.filter((p) => !p.archived);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText, setAddText] = useState('');
  const [addProjectId, setAddProjectId] = useState(() => visibleProjects[0]?.id ?? '');
  const [addSupplierId, setAddSupplierId] = useState<string | null>(null);

  const addFormSuppliers = addProjectId
    ? suppliers.filter((s) => s.projectIds.includes(addProjectId))
    : suppliers;

  const handleAddFollowUp = () => {
    if (!addText.trim() || !addProjectId) return;
    addFollowUp({ projectId: addProjectId, supplierId: addSupplierId, text: addText.trim(), status: 'open' });
    setAddText('');
    setShowAddForm(false);
  };

  const openAddForm = () => {
    setAddProjectId(visibleProjects[0]?.id ?? '');
    setAddSupplierId(null);
    setAddText('');
    setShowAddForm(true);
  };

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

    // Linked item resolution
    const taskItem = type === 'task' ? (item as typeof tasks[0]) : null;
    const followUpItem = type === 'followup' ? (item as typeof followUps[0]) : null;
    const linkedTask = followUpItem?.linkedTaskId ? tasks.find((t) => t.id === followUpItem.linkedTaskId) : null;
    const linkedFollowUp = taskItem?.linkedFollowUpId ? followUps.find((f) => f.id === taskItem.linkedFollowUpId) : null;

    // Candidate tasks to link to a follow-up (same project, not already linked to another follow-up)
    const linkableTasks = tasks.filter(
      (t) => t.projectId === projectId &&
        (supplierId === null ? t.supplierId === null : (supplierId ? t.supplierId === supplierId : true)) &&
        (!t.linkedFollowUpId || t.linkedFollowUpId === item.id)
    );

    const isLinking = linkingId === item.id;

    return (
      <div
        key={`${type}-${item.id}`}
        className="group flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all"
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
            : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 hover:text-violet-400 transition-colors" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <span className={`text-sm ${isResolved ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
            {text}
          </span>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {project && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: project.color + '20', color: project.color }}
              >
                {project.name}
              </span>
            )}
            {supplier ? (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: supplier.color + '20', color: supplier.color }}
              >
                {supplier.name}
              </span>
            ) : supplierId === null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 font-medium">
                Internal
              </span>
            )}
            {type === 'task' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_BADGE[(item as typeof tasks[0]).priority]}`}>
                {(item as typeof tasks[0]).priority}
              </span>
            )}
          </div>

          {/* Linked item display */}
          {linkedTask && (
            <div className="flex items-center gap-1 mt-1.5">
              <button
                className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-700 transition-colors max-w-full"
                onClick={() => setEditingTask(linkedTask.id)}
                title="Open linked task"
              >
                <Link2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{linkedTask.title}</span>
              </button>
              <button
                className="p-0.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                onClick={() => {
                  updateFollowUp(item.id, { linkedTaskId: undefined });
                  updateTask(linkedTask.id, { linkedFollowUpId: undefined });
                }}
                title="Remove link"
              >
                <Link2Off className="w-2.5 h-2.5 text-gray-400 hover:text-red-400" />
              </button>
            </div>
          )}
          {linkedFollowUp && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="flex items-center gap-1 text-[10px] text-violet-500 max-w-full">
                <Link2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{linkedFollowUp.text}</span>
              </span>
              <button
                className="p-0.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                onClick={() => {
                  updateTask(item.id, { linkedFollowUpId: undefined });
                  updateFollowUp(linkedFollowUp.id, { linkedTaskId: undefined });
                }}
                title="Remove link"
              >
                <Link2Off className="w-2.5 h-2.5 text-gray-400 hover:text-red-400" />
              </button>
            </div>
          )}

          {/* Inline link picker */}
          {isLinking && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              {type === 'followup' ? (
                <select
                  autoFocus
                  className="w-full text-xs px-2 py-1.5 border border-violet-300 dark:border-violet-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  defaultValue=""
                  onChange={(e) => {
                    const taskId = e.target.value;
                    if (!taskId) { setLinkingId(null); return; }
                    updateFollowUp(item.id, { linkedTaskId: taskId });
                    updateTask(taskId, { linkedFollowUpId: item.id });
                    setLinkingId(null);
                  }}
                  onBlur={() => setLinkingId(null)}
                >
                  <option value="">— pick a task —</option>
                  {linkableTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              ) : (
                <select
                  autoFocus
                  className="w-full text-xs px-2 py-1.5 border border-violet-300 dark:border-violet-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white dark:bg-gray-700 dark:text-gray-100"
                  defaultValue=""
                  onChange={(e) => {
                    const followUpId = e.target.value;
                    if (!followUpId) { setLinkingId(null); return; }
                    updateTask(item.id, { linkedFollowUpId: followUpId });
                    updateFollowUp(followUpId, { linkedTaskId: item.id });
                    setLinkingId(null);
                  }}
                  onBlur={() => setLinkingId(null)}
                >
                  <option value="">— pick a follow-up —</option>
                  {followUps
                    .filter((f) => f.projectId === projectId && !f.linkedTaskId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>{f.text}</option>
                    ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Link button — only show when not already linked */}
          {type === 'followup' && !linkedTask && !isLinking && (
            <button
              className="p-1 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition-colors"
              onClick={(e) => { e.stopPropagation(); setLinkingId(item.id); }}
              title="Link to task"
            >
              <Link2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-violet-500" />
            </button>
          )}
          {type === 'task' && !linkedFollowUp && !isLinking && (
            <button
              className="p-1 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition-colors"
              onClick={(e) => { e.stopPropagation(); setLinkingId(item.id); }}
              title="Link to follow-up"
            >
              <Link2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-violet-500" />
            </button>
          )}
          {type === 'task' && (
            <button
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
              onClick={() => setEditingTask(item.id)}
              title="Open task"
            >
              Task <ArrowUpRight className="w-2.5 h-2.5" />
            </button>
          )}
          {type === 'followup' && (
            <button
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FilterBar
            filterProject={filterProject}
            filterSupplier={filterSupplier}
            onProjectChange={setFilterProject}
            onSupplierChange={setFilterSupplier}
          />
          {openCount > 0 && (
            <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded px-2 py-0.5 font-medium">
              {openCount} open
            </span>
          )}
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add follow-up
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Follow-up text"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFollowUp(); if (e.key === 'Escape') setShowAddForm(false); }}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:bg-gray-700 dark:text-gray-100"
          />
          <div className="flex items-center gap-2 mb-3">
            <CustomSelect
              value={addProjectId}
              onChange={(v) => { setAddProjectId(v); setAddSupplierId(null); }}
              className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={visibleProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <CustomSelect
              value={addSupplierId ?? '__internal__'}
              onChange={(v) => setAddSupplierId(v === '__internal__' ? null : v)}
              className="flex-1 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
              options={[
                { value: '__internal__', label: 'Internal' },
                ...addFormSuppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddFollowUp}
              disabled={!addText.trim() || !addProjectId}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add follow-up
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {openCount === 0 && resolvedCount === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bookmark className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No follow-ups yet.</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Flag a task with the bookmark icon or press Alt+F.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allOpen.map(renderItem)}

            {resolvedCount > 0 && (
              <div className="pt-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors mb-2 px-1"
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
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);

  const counts: Record<DashboardSection, number> = {
    tasks: tasks.filter((t) => t.status !== 'done').length,
    decisions: decisions.length,
    followups:
      tasks.filter((t) => t.isFollowUp && t.status !== 'done').length +
      followUps.filter((f) => f.status === 'open').length,
  };

  const stats = [
    { label: 'Suppliers', value: suppliers.length },
    { label: 'Notes', value: notes.filter((n) => !n.archived).length },
    { label: 'Open tasks', value: tasks.filter((t) => t.status !== 'done').length },
    { label: 'Follow-ups', value: followUps.filter((f) => f.status === 'open').length },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30 dark:bg-gray-900 min-h-0">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 px-6 pt-4 pb-4 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{value}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 px-6 pt-0 pb-0 flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {SECTION_CONFIG.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setDashboardSection(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              dashboardSection === id
                ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {icon}
            {label}
            {counts[id] > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                dashboardSection === id
                  ? 'bg-gray-200 dark:bg-white/15 text-gray-900 dark:text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
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
