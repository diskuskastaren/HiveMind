import { useState, useRef, useEffect } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { OwnerDropdown } from './TaskModal';
import { format } from 'date-fns';
import type { TaskStatus, Priority, DashboardSection } from '../types';
import { DecisionDetailDialog } from './DecisionDetailDialog';
import {
  ArrowUpRight,
  Bookmark,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  Gavel,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { ColorDot, EntityChip, IconButton, PriorityBadge, PRIORITY_LABEL, STATUS_LABEL } from './common';
import { DatePicker } from './DatePicker';

const TASK_COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'open', label: 'Open', dot: 'bg-border-strong' },
  { status: 'doing', label: 'In progress', dot: 'bg-warning' },
  { status: 'done', label: 'Done', dot: 'bg-success' },
];

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

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: 'doing',
  doing: 'done',
  done: 'open',
};

type Option = { value: string; label: string; color?: string };

function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Option[]; label: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="bg-card text-ui shadow-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.color && <ColorDot color={o.color} />}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

  const visibleSuppliers = filterProject === 'all' ? suppliers : suppliers.filter((s) => s.projectIds.includes(filterProject));

  return (
    <>
      <FilterSelect
        label="Filter by project"
        value={filterProject}
        onChange={(v) => {
          onProjectChange(v);
          onSupplierChange('all');
        }}
        options={[
          { value: 'all', label: 'All projects' },
          ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color })),
        ]}
      />
      <FilterSelect
        label="Filter by supplier"
        value={filterSupplier}
        onChange={onSupplierChange}
        options={[
          { value: 'all', label: 'All suppliers' },
          { value: INTERNAL_TAB_ID, label: 'Internal' },
          ...visibleSuppliers.map((s) => ({ value: s.id, label: s.name, color: s.color })),
        ]}
      />
    </>
  );
}

/** Project/supplier pickers shared by the "new task/decision/follow-up" forms. */
function ScopeFields({
  projectId,
  supplierId,
  onProjectChange,
  onSupplierChange,
}: {
  projectId: string;
  supplierId: string | null;
  onProjectChange: (id: string) => void;
  onSupplierChange: (id: string | null) => void;
}) {
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const visibleProjects = projects.filter((p) => !p.archived);
  const visibleSuppliers = projectId ? suppliers.filter((s) => s.projectIds.includes(projectId)) : suppliers;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scope-project" className="text-xs font-normal text-muted-foreground">
          Project
        </Label>
        <Select value={projectId} onValueChange={(v) => { onProjectChange(v); onSupplierChange(null); }}>
          <SelectTrigger id="scope-project" className="w-full">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {visibleProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <ColorDot color={p.color} />
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scope-supplier" className="text-xs font-normal text-muted-foreground">
          Supplier
        </Label>
        <Select value={supplierId ?? '__internal__'} onValueChange={(v) => onSupplierChange(v === '__internal__' ? null : v)}>
          <SelectTrigger id="scope-supplier" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__internal__">Internal</SelectItem>
            {visibleSuppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <ColorDot color={s.color} />
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CreateTaskModal({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId: string }) {
  const suppliers = useStore((s) => s.suppliers);
  const addTask = useStore((s) => s.addTask);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [owner, setOwner] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [supplierId, setSupplierIdState] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const visibleSuppliers = projectId ? suppliers.filter((s) => s.projectIds.includes(projectId)) : suppliers;

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">Create a task that is not linked to a note</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input
            autoFocus
            aria-label="Task title"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <ScopeFields projectId={projectId} supplierId={supplierId} onProjectChange={setProjectId} onSupplierChange={setSupplierIdState} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-priority" className="text-xs font-normal text-muted-foreground">
                Priority
              </Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger id="new-task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-status" className="text-xs font-normal text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger id="new-task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['open', 'doing', 'done'] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-owner" className="text-xs font-normal text-muted-foreground">
                Owner
              </Label>
              <OwnerDropdown
                id="new-task-owner"
                owner={owner}
                onChange={setOwner}
                suppliers={visibleSuppliers.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-due" className="text-xs font-normal text-muted-foreground">
                Due date
              </Label>
              <DatePicker id="new-task-due" value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-task-description" className="text-xs font-normal text-muted-foreground">
              Description
            </Label>
            <Textarea
              id="new-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more detail about this task…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !projectId}>
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline "add decision / follow-up" form with text + project/supplier scope. */
function InlineAddForm({
  placeholder,
  submitLabel,
  defaultProjectId,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  defaultProjectId: string;
  onSubmit: (text: string, projectId: string, supplierId: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const submit = () => {
    if (!text.trim() || !projectId) return;
    onSubmit(text.trim(), projectId, supplierId);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <Input
        autoFocus
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <ScopeFields projectId={projectId} supplierId={supplierId} onProjectChange={setProjectId} onSupplierChange={setSupplierId} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!text.trim() || !projectId}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function SectionToolbar({ children, actionLabel, onAction }: { children: React.ReactNode; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {children}
      <span className="flex-1" />
      <Button size="sm" onClick={onAction}>
        <Plus />
        {actionLabel}
      </Button>
    </div>
  );
}

function TasksSection({ defaultProjectId }: { defaultProjectId: string }) {
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

  const [filterProject, setFilterProject] = useState(defaultProjectId || 'all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const ownerOptions: Option[] = (() => {
    const projectSuppliers = filterProject === 'all' ? suppliers : suppliers.filter((s) => s.projectIds.includes(filterProject));
    return [
      { value: 'all', label: 'All owners' },
      { value: 'unassigned', label: 'Unassigned' },
      { value: 'Internal', label: 'Internal' },
      ...projectSuppliers.map((s) => ({ value: s.name, label: s.name, color: s.color })),
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

  const activeCount = filtered.filter((t) => t.status !== 'done').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {showCreateModal && <CreateTaskModal defaultProjectId={filterProject !== 'all' ? filterProject : defaultProjectId} onClose={() => setShowCreateModal(false)} />}
      <SectionToolbar actionLabel="New task" onAction={() => setShowCreateModal(true)}>
        <FilterBar
          filterProject={filterProject}
          filterSupplier={filterSupplier}
          onProjectChange={(id) => {
            setFilterProject(id);
            setFilterOwner('all');
          }}
          onSupplierChange={setFilterSupplier}
        />
        <FilterSelect label="Filter by owner" value={filterOwner} onChange={setFilterOwner} options={ownerOptions} />
        {activeCount > 0 && <span className="text-xs text-muted-foreground">{activeCount} active</span>}
      </SectionToolbar>

      <div className="grid min-h-0 flex-1 grid-cols-[repeat(3,minmax(260px,1fr))] gap-4 overflow-x-auto">
        {TASK_COLUMNS.map((col) => {
          const colTasks = filtered
            .filter((t) => t.status === col.status)
            .sort((a, b) => {
              const priorityOrder = { high: 0, medium: 1, low: 2 };
              const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
              return pd !== 0 ? pd : b.createdAt - a.createdAt;
            });

          return (
            <section
              key={col.status}
              aria-label={col.label}
              className={cn(
                'flex min-h-0 flex-col rounded-xl border bg-sidebar transition-colors',
                dropTarget === col.status && dragging && 'border-primary/60 bg-brand-soft/40',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.status);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={() => {
                if (dragging) {
                  updateTask(dragging, { status: col.status });
                  setDragging(null);
                }
                setDropTarget(null);
              }}
            >
              <div className="flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-2">
                <span className={cn('size-2 rounded-full', col.dot)} />
                <h2 className="text-ui font-semibold">{col.label}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{colTasks.length}</span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
                {colTasks.map((task) => {
                  const supplier = task.supplierId ? suppliers.find((s) => s.id === task.supplierId) : null;
                  const project = projects.find((p) => p.id === task.projectId);
                  const note = notes.find((n) => n.id === task.noteId);
                  const linkedFollowUp =
                    (task.linkedFollowUpId ? followUps.find((f) => f.id === task.linkedFollowUpId) : null) ??
                    followUps.find((f) => f.linkedTaskId === task.id) ??
                    null;
                  const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;
                  const ownerSupplier = task.owner ? suppliers.find((s) => s.name === task.owner) : undefined;
                  const done = task.status === 'done';

                  return (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onClick={() => setEditingTask(task.id)}
                      className={cn(
                        'group/card flex cursor-grab flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-xs transition-all hover:shadow-md active:cursor-grabbing',
                        dragging === task.id && 'scale-95 opacity-40',
                      )}
                    >
                      <p className={cn('line-clamp-2 text-ui leading-snug font-medium', done && 'text-muted-foreground line-through')}>{task.title}</p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {project && <EntityChip color={project.color}>{project.name}</EntityChip>}
                        <EntityChip color={supplier?.color ?? '#71717a'}>{supplier?.name ?? 'Internal'}</EntityChip>
                        <PriorityBadge priority={task.priority} />
                      </div>

                      {linkedFollowUp && (
                        <button
                          type="button"
                          className="flex max-w-full items-center gap-1 self-start rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-soft-foreground hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDashboardSection('followups');
                          }}
                          title="Linked follow-up"
                        >
                          <Bookmark className="size-3 shrink-0" />
                          <span className="truncate">{linkedFollowUp.text}</span>
                        </button>
                      )}

                      <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                        <div className="min-w-0 flex-1">
                          {note && (
                            <button
                              type="button"
                              className="flex max-w-full items-center gap-1 transition-colors hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToNote(task.noteId);
                              }}
                              title="Go to source note"
                            >
                              <FileText className="size-3 shrink-0" />
                              <span className="truncate">{note.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                        {task.dueDate && urgency && (
                          <span className={cn('shrink-0 tabular-nums', DUE_DATE_CLASSES[urgency])} title={formatTimeLeft(task.dueDate)}>
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                        {task.owner && (
                          <span
                            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-2xs font-semibold text-subtle-foreground"
                            style={ownerSupplier ? { backgroundColor: ownerSupplier.color, color: '#fff' } : undefined}
                            title={task.owner}
                          >
                            {ownerInitials(task.owner)}
                          </span>
                        )}
                        <span className="hidden items-center group-hover/card:flex">
                          <IconButton
                            label={`Move to ${STATUS_LABEL[NEXT_STATUS[col.status]]}`}
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTask(task.id, { status: NEXT_STATUS[col.status] });
                            }}
                          >
                            <ChevronRight />
                          </IconButton>
                          <IconButton
                            label="Delete task"
                            size="icon-xs"
                            className="hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(task.id);
                            }}
                          >
                            <Trash2 />
                          </IconButton>
                        </span>
                      </div>
                    </article>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                    {dragging ? 'Drop here' : 'No tasks'}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DecisionsSection({ defaultProjectId }: { defaultProjectId: string }) {
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

  const [filterProject, setFilterProject] = useState(defaultProjectId || 'all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [decisionQuery, setDecisionQuery] = useState('');
  const [decisionScope, setDecisionScope] = useState<'current' | 'history' | 'all'>('current');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const visibleProjects = projects.filter((p) => !p.archived);

  const filtered = decisions
    .filter((d) => decisionScope === 'all' || (decisionScope === 'current' ? (d.status || 'active') === 'active' : (d.status || 'active') !== 'active'))
    .filter((d) => !decisionQuery.trim() || `${d.text} ${d.rationale || ''} ${d.comments || ''}`.toLowerCase().includes(decisionQuery.toLowerCase()))
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SectionToolbar actionLabel="New decision" onAction={() => setShowAddForm(true)}>
        <FilterBar filterProject={filterProject} filterSupplier={filterSupplier} onProjectChange={setFilterProject} onSupplierChange={setFilterSupplier} />
        <Input className="h-8 max-w-40 text-xs" aria-label="Search decisions" placeholder="Search decisions" value={decisionQuery} onChange={(event) => setDecisionQuery(event.target.value)} />
        <div className="flex gap-1">
          {(['current', 'history', 'all'] as const).map((scope) => <Button key={scope} size="xs" variant={decisionScope === scope ? 'default' : 'outline'} onClick={() => setDecisionScope(scope)}>{scope === 'current' ? 'Current' : scope === 'history' ? 'History' : 'All'}</Button>)}
        </div>
        {filtered.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} decision{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </SectionToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        {showAddForm && (
          <InlineAddForm
            placeholder="Decision text"
            submitLabel="Add decision"
            defaultProjectId={filterProject !== 'all' ? filterProject : defaultProjectId || visibleProjects[0]?.id || ''}
            onCancel={() => setShowAddForm(false)}
            onSubmit={(text, projectId, supplierId) => {
              addDecision({ projectId, supplierId, noteId: null, text });
              setShowAddForm(false);
            }}
          />
        )}

        {groupKeys.length === 0 && !showAddForm && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gavel />
              </EmptyMedia>
              <EmptyTitle>No decisions captured yet</EmptyTitle>
              <EmptyDescription>Select text in a note and press Alt D to add one.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-5">
          {groupKeys.map((key) => {
            const supplier = key === '__internal__' ? null : suppliers.find((s) => s.id === key);
            const groupDecisions = grouped[key];

            return (
              <section key={key} className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-ui font-semibold">
                  <ColorDot color={supplier?.color ?? '#71717a'} />
                  {supplier?.name ?? 'Internal'}
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{groupDecisions.length}</span>
                </h2>

                {groupDecisions.map((d) => {
                  const note = notes.find((n) => n.id === d.noteId);
                  const project = projects.find((p) => p.id === d.projectId);
                  const isEditing = editingDecisionId === d.id;
                  const startEdit = () => {
                    setEditingDecision(d.id);
                    setEditText(d.text);
                  };
                  return (
                    <div key={d.id} className="group/dec flex items-start gap-3 rounded-lg border bg-card p-3.5 shadow-xs">
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {isEditing ? (
                          <Input
                            ref={editInputRef}
                            autoFocus
                            aria-label="Edit decision"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editText.trim()) {
                                updateDecision(d.id, { text: editText.trim() });
                                setEditingDecision(null);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingDecision(null);
                              }
                            }}
                            onBlur={() => {
                              if (editText.trim()) updateDecision(d.id, { text: editText.trim() });
                              setEditingDecision(null);
                            }}
                          />
                        ) : (
                          <button type="button" className="text-left text-sm leading-relaxed" onClick={startEdit} title="Click to edit">
                            {d.text}
                          </button>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded border px-1.5 py-0.5 text-2xs">{d.status || 'active'}</span>
                          {project && <EntityChip color={project.color}>{project.name}</EntityChip>}
                          {!project && d.projectName && <span>{d.projectName}</span>}
                          <span className="tabular-nums">{format(new Date(d.createdAt), 'MMM d, HH:mm')}</span>
                          {note && (
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-1 transition-colors hover:text-foreground"
                              onClick={() => navigateToNote(d.noteId)}
                              title="Go to source note"
                            >
                              <ArrowUpRight className="size-3 shrink-0" />
                              <span className="max-w-40 truncate">{note.title || 'Untitled note'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/dec:opacity-100">
                          <Button variant="outline" size="xs" onClick={() => setSelectedDecisionId(d.id)}>History</Button>
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
                })}
              </section>
            );
          })}
        </div>
      </div>
      {selectedDecisionId && <DecisionDetailDialog id={selectedDecisionId} onClose={() => setSelectedDecisionId(null)} />}
    </div>
  );
}

function FollowUpsSection({ defaultProjectId }: { defaultProjectId: string }) {
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const updateTask = useStore((s) => s.updateTask);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const focusedFollowUpId = useStore((s) => s.focusedFollowUpId);

  const [filterProject, setFilterProject] = useState(defaultProjectId || 'all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editingFollowUpText, setEditingFollowUpText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  useEffect(() => {
    if (!focusedFollowUpId) return;
    const target = followUps.find((item) => item.id === focusedFollowUpId);
    if (target?.status === 'resolved') setShowResolved(true);
    requestAnimationFrame(() => document.getElementById(`followup-${focusedFollowUpId}`)?.scrollIntoView({ block: 'center' }));
  }, [focusedFollowUpId, followUps]);
  const visibleProjects = projects.filter((p) => !p.archived);

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

  const allOpen = [
    ...openTasks.map((t) => ({ type: 'task' as const, item: t, supplierId: t.supplierId, projectId: t.projectId })),
    ...openStandalone.map((f) => ({ type: 'followup' as const, item: f, supplierId: f.supplierId, projectId: f.projectId })),
  ].sort((a, b) => b.item.createdAt - a.item.createdAt);

  const allResolved = [
    ...resolvedTasks.map((t) => ({ type: 'task' as const, item: t, supplierId: t.supplierId, projectId: t.projectId })),
    ...resolvedStandalone.map((f) => ({ type: 'followup' as const, item: f, supplierId: f.supplierId, projectId: f.projectId })),
  ].sort((a, b) => b.item.createdAt - a.item.createdAt);

  const renderItem = (entry: (typeof allOpen)[0]) => {
    const { type, item, supplierId, projectId } = entry;
    const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null;
    const project = projects.find((p) => p.id === projectId);
    const text = type === 'task' ? (item as (typeof tasks)[0]).title : (item as (typeof followUps)[0]).text;
    const isResolved = type === 'task' ? (item as (typeof tasks)[0]).status === 'done' : (item as (typeof followUps)[0]).status === 'resolved';

    // Linked item resolution
    const taskItem = type === 'task' ? (item as (typeof tasks)[0]) : null;
    const followUpItem = type === 'followup' ? (item as (typeof followUps)[0]) : null;
    const linkedTask = followUpItem
      ? ((followUpItem.linkedTaskId ? tasks.find((t) => t.id === followUpItem.linkedTaskId) : null) ??
        tasks.find((t) => t.linkedFollowUpId === followUpItem.id) ??
        null)
      : null;
    const linkedFollowUp = taskItem
      ? ((taskItem.linkedFollowUpId ? followUps.find((f) => f.id === taskItem.linkedFollowUpId) : null) ??
        followUps.find((f) => f.linkedTaskId === taskItem.id) ??
        null)
      : null;

    // Candidate tasks to link to a follow-up (same project, not already linked to another follow-up)
    const linkableTasks = tasks.filter((t) => t.projectId === projectId && (!t.linkedFollowUpId || t.linkedFollowUpId === item.id));
    const linkableFollowUps = followUps.filter((f) => f.projectId === projectId && !f.linkedTaskId);

    return (
      <div key={`${type}-${item.id}`} id={type === 'followup' ? `followup-${item.id}` : undefined} className={cn('group/fu flex items-start gap-3 rounded-lg border bg-card p-3.5 shadow-xs', type === 'followup' && focusedFollowUpId === item.id && 'border-primary')}>
        <button
          type="button"
          className="mt-0.5 shrink-0"
          onClick={() => {
            if (type === 'task') {
              updateTask(item.id, { status: isResolved ? 'open' : 'done' });
            } else {
              updateFollowUp(item.id, { status: isResolved ? 'open' : 'resolved' });
            }
          }}
          title={isResolved ? 'Mark as open' : 'Mark as resolved'}
          aria-label={isResolved ? 'Mark as open' : 'Mark as resolved'}
        >
          {isResolved ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : (
            <Circle className="size-4 text-border-strong transition-colors hover:text-primary" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {type === 'followup' && editingFollowUpId === item.id ? (
            <Input
              autoFocus
              aria-label="Edit follow-up"
              className="h-8"
              value={editingFollowUpText}
              onChange={(e) => setEditingFollowUpText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const t = editingFollowUpText.trim();
                  if (t) updateFollowUp(item.id, { text: t });
                  setEditingFollowUpId(null);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingFollowUpId(null);
                }
              }}
              onBlur={() => {
                const t = editingFollowUpText.trim();
                if (t) updateFollowUp(item.id, { text: t });
                setEditingFollowUpId(null);
              }}
            />
          ) : (
            <span className={cn('text-sm leading-snug', isResolved && 'text-muted-foreground line-through')}>{text}</span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {project && <EntityChip color={project.color}>{project.name}</EntityChip>}
            <EntityChip color={supplier?.color ?? '#71717a'}>{supplier?.name ?? 'Internal'}</EntityChip>
            {taskItem && <PriorityBadge priority={taskItem.priority} />}
            {taskItem && (
              <button
                type="button"
                className="inline-flex h-5 items-center gap-1 rounded-full bg-brand-soft px-2 text-2xs font-medium text-brand-soft-foreground hover:opacity-80"
                onClick={() => setEditingTask(item.id)}
                title="Open task"
              >
                Flagged task <ArrowUpRight className="size-3" />
              </button>
            )}
          </div>

          {linkedTask && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 text-2xs font-medium text-brand-soft-foreground hover:opacity-80"
                onClick={() => setEditingTask(linkedTask.id)}
                title="Open linked task"
              >
                <Link2 className="size-3 shrink-0" />
                <span className="truncate">Task: {linkedTask.title}</span>
              </button>
              <IconButton
                label="Remove link"
                size="icon-xs"
                className="hover:text-destructive"
                onClick={() => {
                  updateFollowUp(item.id, { linkedTaskId: undefined });
                  updateTask(linkedTask.id, { linkedFollowUpId: undefined });
                }}
              >
                <Link2Off />
              </IconButton>
            </div>
          )}
          {linkedFollowUp && (
            <div className="flex items-center gap-1">
              <span className="inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 text-2xs font-medium text-brand-soft-foreground">
                <Link2 className="size-3 shrink-0" />
                <span className="truncate">{linkedFollowUp.text}</span>
              </span>
              <IconButton
                label="Remove link"
                size="icon-xs"
                className="hover:text-destructive"
                onClick={() => {
                  updateTask(item.id, { linkedFollowUpId: undefined });
                  updateFollowUp(linkedFollowUp.id, { linkedTaskId: undefined });
                }}
              >
                <Link2Off />
              </IconButton>
            </div>
          )}

          {/* Link picker — only when not already linked */}
          {type === 'followup' && !linkedTask && linkableTasks.length > 0 && (
            <Select
              value=""
              onValueChange={(taskId) => {
                updateFollowUp(item.id, { linkedTaskId: taskId });
                updateTask(taskId, { linkedFollowUpId: item.id });
              }}
            >
              <SelectTrigger size="sm" className="w-fit max-w-full border-dashed bg-transparent text-xs text-muted-foreground shadow-none">
                <span className="flex items-center gap-1.5">
                  <Link2 className="size-3" /> Link to task
                </span>
              </SelectTrigger>
              <SelectContent>
                {linkableTasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === 'task' && !linkedFollowUp && linkableFollowUps.length > 0 && (
            <Select
              value=""
              onValueChange={(followUpId) => {
                updateTask(item.id, { linkedFollowUpId: followUpId });
                updateFollowUp(followUpId, { linkedTaskId: item.id });
              }}
            >
              <SelectTrigger size="sm" className="w-fit max-w-full border-dashed bg-transparent text-xs text-muted-foreground shadow-none">
                <span className="flex items-center gap-1.5">
                  <Link2 className="size-3" /> Link to follow-up
                </span>
              </SelectTrigger>
              <SelectContent>
                {linkableFollowUps.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {type === 'followup' && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/fu:opacity-100">
            <IconButton
              label="Edit follow-up"
              size="icon-xs"
              onClick={() => {
                setEditingFollowUpId(item.id);
                setEditingFollowUpText((item as (typeof followUps)[0]).text);
              }}
            >
              <Pencil />
            </IconButton>
            <IconButton label="Delete follow-up" size="icon-xs" className="hover:text-destructive" onClick={() => deleteFollowUp(item.id)}>
              <Trash2 />
            </IconButton>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SectionToolbar actionLabel="New follow-up" onAction={() => setShowAddForm(true)}>
        <FilterBar filterProject={filterProject} filterSupplier={filterSupplier} onProjectChange={setFilterProject} onSupplierChange={setFilterSupplier} />
        {openCount > 0 && <span className="text-xs text-muted-foreground">{openCount} open</span>}
      </SectionToolbar>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex max-w-3xl flex-col gap-2">
          {showAddForm && (
            <InlineAddForm
              placeholder="Follow-up text"
              submitLabel="Add follow-up"
              defaultProjectId={filterProject !== 'all' ? filterProject : defaultProjectId || visibleProjects[0]?.id || ''}
              onCancel={() => setShowAddForm(false)}
              onSubmit={(text, projectId, supplierId) => {
                addFollowUp({ projectId, supplierId, text, status: 'open' });
                setShowAddForm(false);
              }}
            />
          )}
          {openCount === 0 && resolvedCount === 0 && !showAddForm ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bookmark />
                </EmptyMedia>
                <EmptyTitle>No follow-ups yet</EmptyTitle>
                <EmptyDescription>Flag a task with the bookmark icon or select text and press Alt F.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {allOpen.map(renderItem)}
              {resolvedCount > 0 && (
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setShowResolved((v) => !v)}>
                    <CheckCheck />
                    {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
                  </Button>
                  {showResolved && allResolved.map(renderItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const SECTION_CONFIG: { id: DashboardSection; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'followups', label: 'Follow-ups' },
];

/** The Follow-up view: tasks (board), decisions and follow-ups across suppliers. */
export function Dashboard() {
  const dashboardSection = useStore((s) => s.dashboardSection);
  const setDashboardSection = useStore((s) => s.setDashboardSection);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const followUps = useStore((s) => s.followUps);

  const inScope = (projectId: string) => !activeProjectId || projectId === activeProjectId;
  const counts: Record<DashboardSection, number> = {
    tasks: tasks.filter((t) => inScope(t.projectId) && t.status !== 'done').length,
    decisions: decisions.filter((d) => inScope(d.projectId)).length,
    followups:
      tasks.filter((t) => inScope(t.projectId) && t.isFollowUp && t.status !== 'done').length +
      followUps.filter((f) => inScope(f.projectId) && f.status === 'open').length,
  };
  const defaultProjectId = activeProjectId ?? '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-8 pt-7 pb-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-display font-semibold tracking-tight">Follow-up</h1>
          <p className="text-muted-foreground">Everything that came out of your meetings, across suppliers.</p>
        </div>
        <Tabs value={dashboardSection} onValueChange={(v) => setDashboardSection(v as DashboardSection)}>
          <TabsList>
            {SECTION_CONFIG.map(({ id, label }) => (
              <TabsTrigger key={id} value={id} className="px-3">
                {label}
                {counts[id] > 0 && <span className="text-xs text-muted-foreground tabular-nums">{counts[id]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* key: reset section filters when the active project changes */}
      {dashboardSection === 'tasks' && <TasksSection key={`t-${defaultProjectId}`} defaultProjectId={defaultProjectId} />}
      {dashboardSection === 'decisions' && <DecisionsSection key={`d-${defaultProjectId}`} defaultProjectId={defaultProjectId} />}
      {dashboardSection === 'followups' && <FollowUpsSection key={`f-${defaultProjectId}`} defaultProjectId={defaultProjectId} />}
    </div>
  );
}
