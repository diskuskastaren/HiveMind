import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useStore } from '../store/store';
import { isUnlinkedFollowUp, linkedFollowUpOf } from '../utils/followUpLinks';
import type { TaskStatus, Priority, TaskUpdate } from '../types';
import { format } from 'date-fns';
import { ArrowUpRight, Bookmark, Link2, Link2Off, Paperclip, Plus, SquareCheck, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorDot, EntityChip, ownerInitials, PRIORITY_LABEL, STATUS_LABEL } from './common';
import { DatePicker } from './DatePicker';

const UNASSIGNED = '__unassigned__';

function OwnerAvatar({ value, color }: { value: string; color?: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-subtle-foreground"
      style={color ? { backgroundColor: color, color: '#fff' } : undefined}
    >
      {ownerInitials(value)}
    </span>
  );
}

/** Owner picker: Unassigned, Internal or one of the project's suppliers. */
export function OwnerDropdown({
  owner,
  onChange,
  suppliers,
  id,
}: {
  owner: string;
  onChange: (v: string) => void;
  suppliers: { id: string; name: string; color: string }[];
  id?: string;
}) {
  const options = [
    { value: 'Internal', label: 'Internal', color: undefined as string | undefined },
    ...suppliers.map((s) => ({ value: s.name, label: s.name, color: s.color as string | undefined })),
  ];
  // Keep a free-text owner from older data selectable
  if (owner && !options.some((o) => o.value === owner)) options.push({ value: owner, label: owner, color: undefined });

  return (
    <Select value={owner || UNASSIGNED} onValueChange={(v) => onChange(v === UNASSIGNED ? '' : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>
          <span className="size-5 shrink-0 rounded-full border-2 border-dashed border-border-strong" />
          Unassigned
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <OwnerAvatar value={o.value} color={o.color} />
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PropertyRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function TaskModal() {
  const editingTaskId = useStore((s) => s.editingTaskId);
  const task = useStore((s) => s.tasks.find((t) => t.id === s.editingTaskId));
  const notes = useStore((s) => s.notes);
  const suppliers = useStore((s) => s.suppliers);
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const projects = useStore((s) => s.projects);
  const updateTask = useStore((s) => s.updateTask);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const linkTaskAndFollowUp = useStore((s) => s.linkTaskAndFollowUp);
  const unlinkTaskAndFollowUp = useStore((s) => s.unlinkTaskAndFollowUp);
  const showFollowUp = (id: string) => {
    const s = useStore.getState();
    s.setFocusedFollowUp(id);
    s.setDashboardSection('followups');
    s.setActiveView('tasks');
  };
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);
  const addTaskAttachment = useStore((s) => s.addTaskAttachment);
  const removeTaskAttachment = useStore((s) => s.removeTaskAttachment);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [priority, setPriority] = useState<Priority>('medium');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [newUpdateText, setNewUpdateText] = useState('');
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [newFollowUpText, setNewFollowUpText] = useState('');
  const [unsavedHint, setUnsavedHint] = useState(false);
  const electronAttachments = typeof window !== 'undefined' && (window as any).electronAttachments;

  // Load the form when a task is opened. This must depend on the task *id* only: the flag
  // switch, follow-up linking and attachments save immediately and replace the task object,
  // which used to reset the form and silently discard unsaved title/description edits.
  useEffect(() => {
    const current = useStore.getState().tasks.find((t) => t.id === editingTaskId);
    if (!current) return;
    setTitle(current.title);
    setStatus(current.status);
    setPriority(current.priority);
    setOwner(current.owner);
    setDueDate(current.dueDate);
    setDescription(current.description ?? '');
    setUpdates(current.updates ?? []);
    setNewUpdateText('');
    setCreatingFollowUp(false);
    setNewFollowUpText('');
    setUnsavedHint(false);
  }, [editingTaskId]);

  const handlePickFiles = async () => {
    if (!editingTaskId || !electronAttachments?.pick) return;
    let filePaths: string[] = [];
    try { filePaths = await electronAttachments.pick(); }
    catch (error) { toast.error('Could not attach the file', { description: String(error) }); return; }
    for (const filePath of filePaths) {
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      addTaskAttachment(editingTaskId, {
        id: crypto.randomUUID(),
        fileName,
        filePath,
        attachedAt: Date.now(),
      });
    }
  };

  if (!editingTaskId || !task) return null;

  const note = notes.find((n) => n.id === task.noteId);
  const supplier = suppliers.find((s) => s.id === task.supplierId);
  const project = projects.find((p) => p.id === task.projectId);
  const linkedFollowUp = linkedFollowUpOf(task, followUps) ?? null;
  const linkableFollowUps = followUps.filter((f) => f.projectId === task.projectId && f.status === 'open' && isUnlinkedFollowUp(f, tasks));
  const dirty = title !== task.title || status !== task.status || priority !== task.priority || owner !== task.owner ||
    dueDate !== task.dueDate || description !== (task.description ?? '') ||
    JSON.stringify(updates) !== JSON.stringify(task.updates ?? []) || !!newUpdateText.trim();
  // Escape / clicking outside keeps the dialog open when there are unsaved edits; Cancel discards.
  const requestClose = () => {
    if (dirty) setUnsavedHint(true);
    else setEditingTask(null);
  };

  const handleAddUpdate = () => {
    const text = newUpdateText.trim();
    if (!text) return;
    const entry: TaskUpdate = { id: crypto.randomUUID(), timestamp: Date.now(), text };
    setUpdates((prev) => [entry, ...prev]);
    setNewUpdateText('');
  };

  const handleDeleteUpdate = (id: string) => {
    setUpdates((prev) => prev.filter((u) => u.id !== id));
  };

  const save = () => {
    // A progress note typed but not yet added is saved too, rather than silently dropped.
    const pendingUpdate = newUpdateText.trim();
    updateTask(editingTaskId, {
      title: title.trim() || task.title,
      status,
      priority,
      owner,
      dueDate,
      description,
      updates: pendingUpdate ? [{ id: crypto.randomUUID(), timestamp: Date.now(), text: pendingUpdate }, ...updates] : updates,
    });
    setEditingTask(null);
  };

  const handleDelete = () => {
    openConfirmDialog({
      title: 'Delete task?',
      message: `“${task.title}” will be removed.`,
      confirmLabel: 'Delete task',
      onConfirm: () => {
        deleteTask(editingTaskId);
        setEditingTask(null);
      },
    });
  };

  const createLinkedFollowUp = () => {
    if (!newFollowUpText.trim()) return;
    const newId = addFollowUp({
      text: newFollowUpText.trim(),
      status: 'open',
      projectId: task.projectId,
      supplierId: task.supplierId,
      noteId: task.noteId,
    });
    linkTaskAndFollowUp(editingTaskId, newId);
    setCreatingFollowUp(false);
    setNewFollowUpText('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onEscapeKeyDown={(event) => {
          // Escape in the inline "new follow-up" field only closes that field.
          if (creatingFollowUp) {
            event.preventDefault();
            setCreatingFollowUp(false);
            setNewFollowUpText('');
          }
        }}
      >
        <DialogDescription className="sr-only">Edit task details</DialogDescription>
        <header className="flex h-13 shrink-0 items-center gap-2 border-b pr-3 pl-6 text-ui text-muted-foreground">
          <SquareCheck className="size-4" />
          <DialogTitle className="text-ui font-normal">Task</DialogTitle>
          {note && (
            <>
              <span>·</span>
              <button
                type="button"
                onClick={() => navigateToNote(task.noteId)}
                className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground"
                title="Go to source note"
              >
                {supplier && <ColorDot color={supplier.color} className="size-1.5" />}
                <span className="truncate">{note.title || 'Untitled note'}</span>
                <ArrowUpRight className="size-3 shrink-0" />
              </button>
            </>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="icon-sm" onClick={requestClose} aria-label="Close" className="text-muted-foreground">
            <X />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-wrap overflow-y-auto">
          {/* Main column */}
          <div className="flex min-w-0 flex-[999_1_380px] flex-col gap-6 p-6">
            <Textarea
              aria-label="Title"
              value={title}
              rows={2}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
              autoFocus
              className="min-h-0 resize-none border-0 p-0 text-xl leading-snug font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-description" className="text-xs font-normal text-muted-foreground">
                Description
              </Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more detail about this task…"
                rows={3}
              />
            </div>

            <section className="flex flex-col gap-2.5">
              <h3 className="text-xs text-muted-foreground">Progress updates</h3>
              {updates.length > 0 && (
                <div className="flex max-h-44 flex-col overflow-y-auto pl-1">
                  {updates.map((u, i) => (
                    <div key={u.id} className="group/upd flex gap-3">
                      <span className="flex shrink-0 flex-col items-center">
                        <span className={`mt-1.5 size-2 rounded-full ${i === 0 ? 'bg-primary' : 'bg-border-strong'}`} />
                        {i < updates.length - 1 && <span className="w-px flex-1 bg-border" />}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-3">
                        <p className="text-ui break-words">{u.text}</p>
                        <span className="font-mono text-2xs text-muted-foreground">{format(new Date(u.timestamp), 'MMM d, HH:mm')}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDeleteUpdate(u.id)}
                        aria-label="Remove update"
                        title="Remove update"
                        className="text-muted-foreground opacity-0 group-hover/upd:opacity-100 hover:text-destructive"
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Textarea
                  aria-label="Add a progress note"
                  value={newUpdateText}
                  onChange={(e) => setNewUpdateText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAddUpdate();
                    }
                  }}
                  placeholder="Add a progress note…"
                  rows={2}
                  className="text-ui"
                />
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>
                    <Kbd>Ctrl Enter</Kbd> to add
                  </span>
                  <Button variant="outline" size="xs" onClick={handleAddUpdate} disabled={!newUpdateText.trim()}>
                    Add update
                  </Button>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs text-muted-foreground">Attachments</h3>
                <Button variant="outline" size="xs" onClick={handlePickFiles}>
                  <Paperclip /> Attach file
                </Button>
              </div>
              {task.attachments && task.attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {task.attachments.map((att) => (
                    <span key={att.id} className="group/att inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-ui">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!electronAttachments) return;
                          const problem: string = await electronAttachments.open(att.filePath);
                          if (problem) toast.error(`Could not open ${att.fileName}`, { description: problem });
                        }}
                        className="max-w-48 truncate hover:underline"
                        title={`Open ${att.fileName}`}
                      >
                        {att.fileName}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTaskAttachment(editingTaskId, att.id)}
                        className="hidden text-muted-foreground group-hover/att:inline hover:text-destructive"
                        aria-label="Remove attachment"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="flex h-12 items-center justify-center rounded-lg border border-dashed text-ui text-muted-foreground">No attachments yet</p>
              )}
            </section>
          </div>

          {/* Properties */}
          <aside aria-label="Task properties" className="flex flex-[1_1_240px] flex-col gap-4 border-l bg-sidebar p-5">
            <PropertyRow label="Status" htmlFor="task-status">
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger id="task-status" className="w-full bg-background">
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
            </PropertyRow>
            <PropertyRow label="Priority" htmlFor="task-priority">
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger id="task-priority" className="w-full bg-background">
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
            </PropertyRow>
            <PropertyRow label="Owner" htmlFor="task-owner">
              <OwnerDropdown
                id="task-owner"
                owner={owner}
                onChange={setOwner}
                suppliers={suppliers.filter((s) => project && s.projectIds.includes(project.id))}
              />
            </PropertyRow>
            <PropertyRow label="Due date" htmlFor="task-due">
              <DatePicker id="task-due" value={dueDate} onChange={setDueDate} className="bg-background" />
            </PropertyRow>
            <div className="flex flex-wrap gap-1.5">
              {project && <EntityChip color={project.color}>{project.name}</EntityChip>}
              <EntityChip color={supplier?.color ?? '#71717a'}>{supplier?.name ?? 'Internal'}</EntityChip>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center gap-3">
              <Label htmlFor="task-flag" className="flex flex-1 flex-col items-start gap-0.5">
                <span className="text-ui font-medium">Flag as follow-up</span>
                <span className="text-xs font-normal text-muted-foreground">Shows in Follow-ups</span>
              </Label>
              <Switch id="task-flag" checked={!!task.isFollowUp} onCheckedChange={(v) => updateTask(editingTaskId, { isFollowUp: v })} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Linked follow-up</span>
              {linkedFollowUp ? (
                <div className="flex items-center gap-2 rounded-lg bg-brand-soft px-2.5 py-2 text-brand-soft-foreground">
                  <Bookmark className="size-3.5 shrink-0" />
                  <button
                    type="button"
                    onClick={() => { if (!dirty) { setEditingTask(null); showFollowUp(linkedFollowUp.id); } else setUnsavedHint(true); }}
                    className="flex min-w-0 flex-1 flex-col items-start text-left hover:underline"
                    title="Show in Follow-up board"
                  >
                    <span className={linkedFollowUp.status === 'resolved' ? 'w-full truncate text-ui line-through opacity-70' : 'w-full truncate text-ui'}>{linkedFollowUp.text}</span>
                    <span className="text-2xs opacity-80">{linkedFollowUp.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => unlinkTaskAndFollowUp({ taskId: editingTaskId })}
                    title="Remove link"
                    aria-label="Remove link"
                    className="shrink-0 opacity-70 hover:opacity-100"
                  >
                    <Link2Off className="size-3.5" />
                  </button>
                </div>
              ) : creatingFollowUp ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    aria-label="Follow-up text"
                    value={newFollowUpText}
                    onChange={(e) => setNewFollowUpText(e.target.value)}
                    placeholder="Follow-up text…"
                    className="h-8 bg-background text-ui"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createLinkedFollowUp();
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setCreatingFollowUp(false);
                        setNewFollowUpText('');
                      }
                    }}
                  />
                  <Button size="icon-sm" onClick={createLinkedFollowUp} disabled={!newFollowUpText.trim()} aria-label="Create follow-up">
                    <Plus />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {linkableFollowUps.length > 0 && (
                    <Select
                      value=""
                      onValueChange={(followUpId) => linkTaskAndFollowUp(editingTaskId, followUpId)}
                    >
                      <SelectTrigger className="w-full border-dashed bg-transparent text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <Link2 className="size-3.5" /> Link existing follow-up…
                        </span>
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {linkableFollowUps.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setCreatingFollowUp(true)}>
                    <Plus /> {linkableFollowUps.length === 0 ? 'Create follow-up…' : 'Create new…'}
                  </Button>
                </div>
              )}
            </div>
            <span className="mt-auto pt-2 text-xs text-muted-foreground">Created {format(new Date(task.createdAt), 'MMM d, yyyy')}</span>
          </aside>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t py-3 pr-4 pl-5">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:bg-recording-soft hover:text-destructive">
            <Trash2 /> Delete task
          </Button>
          <span className="flex-1" />
          {unsavedHint && dirty && (
            <span role="status" className="text-xs text-warning">Unsaved changes — save or cancel.</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditingTask(null)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
