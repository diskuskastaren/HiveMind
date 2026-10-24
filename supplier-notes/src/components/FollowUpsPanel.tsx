import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { ArrowUpRight, Bookmark, CheckCircle2, ChevronDown, ChevronRight, Circle, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconButton, SectionLabel } from './common';

/** Follow-ups for the active supplier (or Internal) — shown as a tab in the side panel. */
export function FollowUpsPanel() {
  const activeTabId = useStore((s) => s.activeTabId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const suppliers = useStore((s) => s.suppliers);

  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  const updateTask = useStore((s) => s.updateTask);
  const setEditingTask = useStore((s) => s.setEditingTask);

  const [showResolved, setShowResolved] = useState(false);
  const [newText, setNewText] = useState('');
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
    addFollowUp({ supplierId: contextSupplierId, projectId: activeProjectId, text, status: 'open' });
    setNewText('');
    inputRef.current?.focus();
  };

  const linkedTaskTitle = (taskId?: string) => (taskId ? tasks.find((t) => t.id === taskId)?.title : undefined);

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
        {openFlaggedTasks.map((task) => (
          <FollowUpRow
            key={`task-${task.id}`}
            text={task.title}
            resolved={false}
            isTask
            onResolve={() => updateTask(task.id, { status: 'done' })}
            onUnflag={() => updateTask(task.id, { isFollowUp: false })}
            onOpenTask={() => setEditingTask(task.id)}
          />
        ))}
        {openStandalone.map((item) => (
          <FollowUpRow
            key={`fu-${item.id}`}
            text={item.text}
            resolved={false}
            linkedTask={linkedTaskTitle(item.linkedTaskId)}
            onOpenTask={item.linkedTaskId ? () => setEditingTask(item.linkedTaskId!) : undefined}
            onResolve={() => updateFollowUp(item.id, { status: 'resolved' })}
            onDelete={() => deleteFollowUp(item.id)}
          />
        ))}
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
            className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showResolved ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Resolved <span className="tabular-nums">{resolvedCount}</span>
          </button>
          {showResolved && (
            <>
              {resolvedFlaggedTasks.map((task) => (
                <FollowUpRow
                  key={`task-${task.id}`}
                  text={task.title}
                  resolved
                  isTask
                  onResolve={() => updateTask(task.id, { status: 'open' })}
                  onUnflag={() => updateTask(task.id, { isFollowUp: false })}
                  onOpenTask={() => setEditingTask(task.id)}
                />
              ))}
              {resolvedStandalone.map((item) => (
                <FollowUpRow
                  key={`fu-${item.id}`}
                  text={item.text}
                  resolved
                  onResolve={() => updateFollowUp(item.id, { status: 'open' })}
                  onDelete={() => deleteFollowUp(item.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface FollowUpRowProps {
  text: string;
  resolved: boolean;
  isTask?: boolean;
  linkedTask?: string;
  onResolve: () => void;
  onDelete?: () => void;
  onUnflag?: () => void;
  onOpenTask?: () => void;
}

function FollowUpRow({ text, resolved, isTask, linkedTask, onResolve, onDelete, onUnflag, onOpenTask }: FollowUpRowProps) {
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
        <span className={cn('text-ui leading-snug', resolved && 'text-muted-foreground line-through')}>{text}</span>
        {(isTask || linkedTask) && onOpenTask && (
          <button
            type="button"
            onClick={onOpenTask}
            className="inline-flex h-5 max-w-full items-center gap-1 self-start rounded-full bg-brand-soft px-2 text-2xs font-medium text-brand-soft-foreground hover:opacity-80"
            title="Open task"
          >
            <span className="truncate">{isTask ? 'Flagged task' : `Task: ${linkedTask}`}</span>
            <ArrowUpRight className="size-3 shrink-0" />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/fu:opacity-100">
        {isTask && onUnflag && (
          <IconButton label="Remove from follow-ups" size="icon-xs" onClick={onUnflag}>
            <Bookmark className="fill-current text-primary" />
          </IconButton>
        )}
        {!isTask && onDelete && (
          <IconButton label="Delete follow-up" size="icon-xs" className="hover:text-destructive" onClick={onDelete}>
            <Trash2 />
          </IconButton>
        )}
      </div>
    </div>
  );
}
