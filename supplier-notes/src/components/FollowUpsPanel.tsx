import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  ArrowUpRight,
  Bookmark,
} from 'lucide-react';

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

  const [expanded, setExpanded] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeTabId || !activeProjectId) return null;

  const isInternal = activeTabId === INTERNAL_TAB_ID;
  const contextSupplierId = isInternal ? null : activeTabId;
  const supplier = isInternal ? null : suppliers.find((s) => s.id === activeTabId);

  // Tasks flagged as follow-ups for this context
  const flaggedTasks = tasks.filter(
    (t) => t.supplierId === contextSupplierId && t.projectId === activeProjectId && t.isFollowUp,
  );

  // Standalone follow-up items for this context
  const standaloneItems = followUps.filter(
    (f) => f.supplierId === contextSupplierId && f.projectId === activeProjectId,
  );

  const openCount =
    flaggedTasks.filter((t) => t.status !== 'done').length +
    standaloneItems.filter((f) => f.status === 'open').length;

  const resolvedCount =
    flaggedTasks.filter((t) => t.status === 'done').length +
    standaloneItems.filter((f) => f.status === 'resolved').length;

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    addFollowUp({ supplierId: contextSupplierId, projectId: activeProjectId, text, status: 'open' });
    setNewText('');
    inputRef.current?.focus();
  };

  const openFlaggedTasks = flaggedTasks.filter((t) => t.status !== 'done');
  const resolvedFlaggedTasks = flaggedTasks.filter((t) => t.status === 'done');
  const openStandalone = standaloneItems.filter((f) => f.status === 'open');
  const resolvedStandalone = standaloneItems.filter((f) => f.status === 'resolved');

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        )}
        <Bookmark className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Follow-ups</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">· {isInternal ? 'Internal' : supplier?.name}</span>
        {openCount > 0 && (
          <span className="ml-1 text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-full px-1.5 py-0.5 font-medium">
            {openCount} open
          </span>
        )}
        {openCount === 0 && resolvedCount > 0 && (
          <span className="ml-1 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5">
            all resolved
          </span>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="max-h-52 overflow-y-auto">
          <div className="px-4 pb-3 space-y-0.5">
            {/* Quick-add */}
            <div className="flex items-center gap-2 mb-2 pt-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Add a follow-up…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1 text-sm px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={handleAdd}
                className="p-1.5 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors flex-shrink-0"
                title="Add follow-up"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Open items */}
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
                onResolve={() => updateFollowUp(item.id, { status: 'resolved' })}
                onDelete={() => deleteFollowUp(item.id)}
              />
            ))}

            {openCount === 0 && resolvedCount === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                No follow-ups yet. Add one above or flag a task with{' '}
                <Bookmark className="w-3 h-3 inline text-gray-400 dark:text-gray-500" />.
              </p>
            )}

            {/* Resolved section */}
            {resolvedCount > 0 && (
              <div className="pt-1">
                <button
                  className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors mb-1"
                  onClick={() => setShowResolved((v) => !v)}
                >
                  {showResolved ? '▾' : '▸'} {resolvedCount} resolved
                </button>
                {showResolved && (
                  <div className="space-y-0.5">
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
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FollowUpRowProps {
  text: string;
  resolved: boolean;
  isTask?: boolean;
  onResolve: () => void;
  onDelete?: () => void;
  onUnflag?: () => void;
  onOpenTask?: () => void;
}

function FollowUpRow({ text, resolved, isTask, onResolve, onDelete, onUnflag, onOpenTask }: FollowUpRowProps) {
  return (
    <div className="group flex items-center gap-2 px-1 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <button
        onClick={onResolve}
        className="flex-shrink-0"
        title={resolved ? 'Mark as open' : 'Mark as resolved'}
      >
        {resolved ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 hover:text-violet-400 transition-colors" />
        )}
      </button>

      <span
        className={`flex-1 text-sm min-w-0 truncate ${resolved ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
        title={text}
      >
        {text}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {isTask && onOpenTask && (
          <button
            onClick={onOpenTask}
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
            title="Open task"
          >
            Task <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        )}
        {isTask && onUnflag && (
          <button
            onClick={onUnflag}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Remove from follow-ups"
          >
            <Bookmark className="w-3 h-3 text-violet-400" />
          </button>
        )}
        {!isTask && onDelete && (
          <button
            onClick={onDelete}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3 h-3 text-gray-400 dark:text-gray-500" />
          </button>
        )}
      </div>
    </div>
  );
}
