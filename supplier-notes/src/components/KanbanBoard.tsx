import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import type { TaskStatus } from '../types';
import { ChevronRight, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { EntityChip, IconButton, OwnerAvatar, PriorityBadge, STATUS_LABEL } from './common';

// Note: not mounted anywhere at the moment — the Follow-up view hosts the task board.
// Kept as a standalone modal board, restyled on the shared design system.

const COLUMNS: { status: TaskStatus; dot: string }[] = [
  { status: 'open', dot: 'bg-border-strong' },
  { status: 'doing', dot: 'bg-warning' },
  { status: 'done', dot: 'bg-success' },
];

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

export function KanbanBoard() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const updateTask = useStore((s) => s.updateTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const toggleKanban = useStore((s) => s.toggleKanban);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [dragging, setDragging] = useState<string | null>(null);

  const filtered = tasks
    .filter((t) => filterProject === 'all' || t.projectId === filterProject)
    .filter((t) => {
      if (filterSupplier === 'all') return true;
      if (filterSupplier === INTERNAL_TAB_ID) return t.supplierId === null;
      return t.supplierId === filterSupplier;
    });

  const projectSuppliers = filterProject === 'all' ? suppliers : suppliers.filter((s) => s.projectIds.includes(filterProject));

  const handleDrop = (status: TaskStatus) => {
    if (dragging) {
      updateTask(dragging, { status });
      setDragging(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && toggleKanban()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-5xl">
        <DialogHeader className="flex-row items-center justify-between gap-3 pr-8">
          <DialogTitle>Task board</DialogTitle>
          <DialogDescription className="sr-only">Tasks grouped by status</DialogDescription>
          <div className="flex items-center gap-2">
            <Select
              value={filterProject}
              onValueChange={(v) => {
                setFilterProject(v);
                setFilterSupplier('all');
              }}
            >
              <SelectTrigger size="sm" aria-label="Filter by project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger size="sm" aria-label="Filter by supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                <SelectItem value={INTERNAL_TAB_ID}>Internal</SelectItem>
                {projectSuppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="grid min-h-[400px] flex-1 grid-cols-[repeat(3,minmax(240px,1fr))] gap-4 overflow-x-auto">
          {COLUMNS.map((col) => {
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
                className="flex flex-col gap-2 rounded-xl border bg-sidebar p-2.5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.status)}
              >
                <div className="flex items-center gap-2 px-1">
                  <span className={cn('size-2 rounded-full', col.dot)} />
                  <span className="text-ui font-semibold">{STATUS_LABEL[col.status]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{colTasks.length}</span>
                </div>
                {colTasks.map((task) => {
                  const supplier = task.supplierId ? suppliers.find((s) => s.id === task.supplierId) : null;
                  const project = projects.find((p) => p.id === task.projectId);
                  const note = notes.find((n) => n.id === task.noteId);
                  const urgency = task.dueDate ? getDueDateUrgency(task.dueDate) : null;
                  return (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setEditingTask(task.id)}
                      className={cn(
                        'group/card flex cursor-grab flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs transition-all hover:shadow-md active:cursor-grabbing',
                        dragging === task.id && 'scale-95 opacity-40',
                      )}
                    >
                      <p className="line-clamp-2 text-ui leading-snug font-medium">{task.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={task.priority} />
                        {project && <EntityChip color={project.color}>{project.name}</EntityChip>}
                        <EntityChip color={supplier?.color ?? '#71717a'}>{supplier?.name ?? 'Internal'}</EntityChip>
                      </div>
                      {task.dueDate && urgency && (
                        <span className={cn('text-2xs', DUE_DATE_CLASSES[urgency])}>
                          {formatDueDate(task.dueDate)} · {formatTimeLeft(task.dueDate)}
                        </span>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="min-w-0 flex-1">
                          {note && (
                            <button
                              type="button"
                              className="flex max-w-full items-center gap-1 hover:text-foreground"
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
                        <OwnerAvatar name={task.owner} />
                        {col.status !== 'done' && (
                          <IconButton
                            label={`Move to ${col.status === 'open' ? 'In progress' : 'Done'}`}
                            size="icon-xs"
                            className="opacity-0 group-hover/card:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTask(task.id, { status: col.status === 'open' ? 'doing' : 'done' });
                            }}
                          >
                            <ChevronRight />
                          </IconButton>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
