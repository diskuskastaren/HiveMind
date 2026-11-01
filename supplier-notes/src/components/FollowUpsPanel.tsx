import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { ArrowUpRight, Bookmark, CheckCircle2, ChevronDown, ChevronRight, Circle, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconButton, SectionLabel, STATUS_LABEL } from './common';
import { InlineEditInput } from './InlineEdit';
import { deleteFollowUpWithUndo } from './undoableActions';
import { linkedFollowUpOf, linkedTaskOf } from '../utils/followUpLinks';
import type { FollowUp, Task } from '../types';

/** Follow-ups for the active supplier (or Internal) — shown as a tab in the side panel. */
export function FollowUpsPanel() {
  const activeTabId = useStore((s) => s.activeTabId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const suppliers = useStore((s) => s.suppliers);

  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const updateTask = useStore((s) => s.updateTask);
  const setEditingTask = useStore((s) => s.setEditingTask);

  const [showResolved, setShowResolved] = useState(false);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeTabId || !activeProjectId) return null;

  const isInternal = activeTabId === INTERNAL_TAB_ID;
  const contextSupplierId = isInternal ? null : activeTabId;
  const supplier = isInternal ? null : suppliers.find((s) => s.id === activeTabId);
  const contextName = isInternal ? 'Internal' : supplier?.name;

  // Tasks flagged as follow-ups for this context
  const flaggedTasks = tasks.filter((t) => t.supplierId === contextSupplierId && t.projectId === activeProjectId && t.isFollowUp);

  // Standalone follow-up items for this context
  const standaloneItems = followUps.filter((f) => f.supplierId === contextSupplierId && f.projectId === activeProjectId);

  const openFlaggedTasks = flaggedTasks.filter((t) => t.status !== 'done');
  const resolvedFlaggedTasks = flaggedTasks.filter((t) => t.status === 'done');
  const openStandalone = standaloneItems.filter((f) => f.status === 'open');
  const resolvedStandalone = standaloneItems.filter((f) => f.status === 'resolved');
  const openCount = openFlaggedTasks.length + openStandalone.length;
  const resolvedCount = resolvedFlaggedTasks.length + resolvedStandalone.length;

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    addFollowUp({ supplierId: contextSupplierId, projectId: activeProjectId, noteId: activeNoteId, text, status: 'open' });
    setNewText('');
    inputRef.current?.focus();
  };

  const renderTask = (task: Task) => {
    const resolved = task.status === 'done';
    const linked = linkedFollowUpOf(task, followUps);
    return (
      <FollowUpRow
        key={`task-${task.id}`}
        text={task.title}
        resolved={resolved}
        onResolve={() => updateTask(task.id, { status: resolved ? 'open' : 'done' })}
        chips={
          <>
            <LinkChip onClick={() => setEditingTask(task.id)} title="Open task">
              Flagged task · {STATUS_LABEL[task.status]}
            </LinkChip>
            {linked && <LinkChip icon title="Linked follow-up">{linked.text}{linked.status === 'resolved' ? ' · resolved' : ''}</LinkChip>}
          </>
        }
        actions={
          <IconButton label="Remove from follow-ups" size="icon-xs" onClick={() => updateTask(task.id, { isFollowUp: false })}>
            <Bookmark className="fill-current text-primary" />
          </IconButton>
        }
      />
    );
  };

  const renderFollowUp = (item: FollowUp) => {
    const resolved = item.status === 'resolved';
    const linked = linkedTaskOf(item, tasks);
    return (
      <FollowUpRow
        key={`fu-${item.id}`}
        text={item.text}
        resolved={resolved}
        editing={editingId === item.id}
        onEditCommit={(text) => updateFollowUp(item.id, { text })}
        onEditDone={() => setEditingId(null)}
        onResolve={() => updateFollowUp(item.id, { status: resolved ? 'open' : 'resolved' })}
        chips={linked && (
          <LinkChip icon onClick={() => setEditingTask(linked.id)} title="Open linked task">
            Task: {linked.title} · {STATUS_LABEL[linked.status]}
          </LinkChip>
        )}
        actions={
          <>
            <IconButton label="Edit follow-up" size="icon-xs" onClick={() => setEditingId(item.id)}>
              <Pencil />
            </IconButton>
            <IconButton label="Delete follow-up" size="icon-xs" className="hover:text-destructive" onClick={() => deleteFollowUpWithUndo(item.id)}>
              <Trash2 />
            </IconButton>
          </>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          placeholder={`Add follow-up for ${contextName}…`}
          aria-label="Add follow-up"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="h-8 bg-card text-ui"
        />
        <Button size="icon-sm" onClick={handleAdd} aria-label="Add follow-up" disabled={!newText.trim()}>
          <Plus />
        </Button>
      </div>

      <div className="flex flex-col gap-0.5">
        <SectionLabel count={openCount}>Open</SectionLabel>
        {openFlaggedTasks.map(renderTask)}
        {openStandalone.map(renderFollowUp)}
        {openCount === 0 && resolvedCount === 0 && (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            No follow-ups yet. Add one above, select text and press Alt F, or flag a task with{' '}
            <Bookmark className="inline size-3" />.
          </p>
        )}
        {openCount === 0 && resolvedCount > 0 && <p className="px-1 py-2 text-xs text-muted-foreground">All follow-ups are resolved.</p>}
      </div>

      {resolvedCount > 0 && (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            aria-expanded={showResolved}
            className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showResolved ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Resolved <span className="tabular-nums">{resolvedCount}</span>
          </button>
          {showResolved && (
            <>
              {resolvedFlaggedTasks.map(renderTask)}
              {resolvedStandalone.map(renderFollowUp)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LinkChip({ children, onClick, title, icon }: { children: React.ReactNode; onClick?: () => void; title: string; icon?: boolean }) {
  const className = 'inline-flex h-5 max-w-full items-center gap-1 self-start rounded-full bg-brand-soft px-2 text-2xs font-medium text-brand-soft-foreground';
  const content = (
    <>
      {icon && <Link2 className="size-3 shrink-0" />}
      <span className="truncate">{children}</span>
      {onClick && <ArrowUpRight className="size-3 shrink-0" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, 'hover:opacity-80')} title={title}>{content}</button>
  ) : (
    <span className={className} title={title}>{content}</span>
  );
}

interface FollowUpRowProps {
  text: string;
  resolved: boolean;
  editing?: boolean;
  onEditCommit?: (text: string) => void;
  onEditDone?: () => void;
  onResolve: () => void;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}

function FollowUpRow({ text, resolved, editing, onEditCommit, onEditDone, onResolve, chips, actions }: FollowUpRowProps) {
  return (
    <div className="group/fu flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60">
      <button
        type="button"
        onClick={onResolve}
        className="mt-0.5 shrink-0"
        title={resolved ? 'Mark as open' : 'Mark as resolved'}
        aria-label={resolved ? 'Mark as open' : 'Mark as resolved'}
      >
        {resolved ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <Circle className="size-4 text-border-strong transition-colors hover:text-primary" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {editing && onEditCommit && onEditDone ? (
          <InlineEditInput label="Edit follow-up" initialValue={text} onCommit={onEditCommit} onDone={onEditDone} />
        ) : (
          <span className={cn('text-ui leading-snug break-words', resolved && 'text-muted-foreground line-through')}>{text}</span>
        )}
        {chips}
      </div>
      {!editing && actions && (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/fu:opacity-100 group-hover/fu:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
