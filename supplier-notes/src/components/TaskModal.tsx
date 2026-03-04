import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import type { TaskStatus, Priority } from '../types';
import { CustomSelect } from './ui/CustomSelect';

function ownerInitials(owner: string): string {
  return owner.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
}

function ownerHue(owner: string): number {
  let hash = 0;
  for (let i = 0; i < owner.length; i++) hash = owner.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}
import { X, Trash2, FileText, Link2, Link2Off, Bookmark, Plus } from 'lucide-react';

type OwnerOption = { value: string; label: string; color?: string };

function OwnerAvatar({ value, color }: { value: string; color?: string }) {
  const hue = ownerHue(value);
  const bg = color ?? `hsl(${hue} 55% 52%)`;
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {ownerInitials(value)}
    </span>
  );
}

function OwnerDropdown({
  owner,
  onChange,
  suppliers,
}: {
  owner: string;
  onChange: (v: string) => void;
  suppliers: { id: string; name: string; color: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options: OwnerOption[] = [
    { value: '', label: 'Unassigned' },
    { value: 'Internal', label: 'Internal' },
    ...suppliers.map((s) => ({ value: s.name, label: s.name, color: s.color })),
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => o.value === owner) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 text-left"
      >
        {selected.value ? (
          <OwnerAvatar value={selected.value} color={selected.color} />
        ) : (
          <span className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0" />
        )}
        <span className="flex-1 truncate text-gray-700">{selected.label}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                o.value === owner ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.value ? (
                <OwnerAvatar value={o.value} color={o.color} />
              ) : (
                <span className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0" />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskModal() {
  const editingTaskId = useStore((s) => s.editingTaskId);
  const task = useStore((s) => s.tasks.find((t) => t.id === s.editingTaskId));
  const notes = useStore((s) => s.notes);
  const suppliers = useStore((s) => s.suppliers);
  const followUps = useStore((s) => s.followUps);
  const updateTask = useStore((s) => s.updateTask);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [priority, setPriority] = useState<Priority>('medium');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [newFollowUpText, setNewFollowUpText] = useState('');
  const newFollowUpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status);
      setPriority(task.priority);
      setOwner(task.owner);
      setDueDate(task.dueDate);
      setDescription(task.description ?? '');
      setShowFollowUpPicker(false);
      setCreatingFollowUp(false);
      setNewFollowUpText('');
    }
  }, [task]);

  const projects = useStore((s) => s.projects);

  if (!editingTaskId || !task) return null;

  const note = notes.find((n) => n.id === task.noteId);
  const supplier = suppliers.find((s) => s.id === task.supplierId);
  const project = projects.find((p) => p.id === task.projectId);
  const linkedFollowUp = task.linkedFollowUpId ? followUps.find((f) => f.id === task.linkedFollowUpId) : null;
  const linkableFollowUps = followUps.filter(
    (f) => f.projectId === task.projectId && (!f.linkedTaskId || f.linkedTaskId === task.id)
  );

  const save = () => {
    updateTask(editingTaskId, {
      title,
      status,
      priority,
      owner,
      dueDate,
      description,
    });
    setEditingTask(null);
  };

  const handleDelete = () => {
    if (confirm('Delete this task?')) {
      deleteTask(editingTaskId);
      setEditingTask(null);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={() => setEditingTask(null)} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit Task</h2>
          <button onClick={() => setEditingTask(null)} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source info */}
        <div className="text-xs text-gray-400 mb-4 flex items-center gap-2 flex-wrap">
          {project && (
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: project.color + '20', color: project.color }}>
              {project.name}
            </span>
          )}
          {supplier && (
            <>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: supplier.color }} />
              <span>{supplier.name}</span>
              <span className="text-gray-300">·</span>
            </>
          )}
          {note && (
            <button
              onClick={() => navigateToNote(task.noteId)}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline transition-colors"
              title="Go to source note"
            >
              <FileText className="w-3 h-3" />
              {note.title || 'Untitled note'}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CustomSelect
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as TaskStatus)}
              className="w-full px-3 py-2 text-sm text-gray-700"
              options={[
                { value: 'open', label: 'Open' },
                { value: 'doing', label: 'Doing' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <CustomSelect
              label="Priority"
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
              className="w-full px-3 py-2 text-sm text-gray-700"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <OwnerDropdown
              owner={owner}
              onChange={setOwner}
              suppliers={suppliers.filter((s) => project && s.projectIds.includes(project.id))}
            />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more detail about this task…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Linked Follow-up</label>
            {linkedFollowUp ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg">
                <Bookmark className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-violet-800 truncate">{linkedFollowUp.text}</span>
                <button
                  type="button"
                  onClick={() => {
                    updateTask(editingTaskId, { linkedFollowUpId: undefined });
                    updateFollowUp(linkedFollowUp.id, { linkedTaskId: undefined });
                  }}
                  className="flex-shrink-0 p-0.5 hover:bg-violet-100 rounded transition-colors"
                  title="Remove link"
                >
                  <Link2Off className="w-3.5 h-3.5 text-violet-400 hover:text-red-500" />
                </button>
              </div>
            ) : creatingFollowUp ? (
              <div className="flex items-center gap-2">
                <input
                  ref={newFollowUpRef}
                  autoFocus
                  type="text"
                  value={newFollowUpText}
                  onChange={(e) => setNewFollowUpText(e.target.value)}
                  placeholder="Follow-up text…"
                  className="flex-1 px-3 py-2 text-sm border border-violet-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFollowUpText.trim()) {
                      const newId = addFollowUp({
                        text: newFollowUpText.trim(),
                        status: 'open',
                        projectId: task.projectId,
                        supplierId: task.supplierId,
                      });
                      updateTask(editingTaskId, { linkedFollowUpId: newId });
                      updateFollowUp(newId, { linkedTaskId: editingTaskId });
                      setCreatingFollowUp(false);
                      setNewFollowUpText('');
                    }
                    if (e.key === 'Escape') {
                      setCreatingFollowUp(false);
                      setNewFollowUpText('');
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!newFollowUpText.trim()}
                  onClick={() => {
                    if (!newFollowUpText.trim()) return;
                    const newId = addFollowUp({
                      text: newFollowUpText.trim(),
                      status: 'open',
                      projectId: task.projectId,
                      supplierId: task.supplierId,
                    });
                    updateTask(editingTaskId, { linkedFollowUpId: newId });
                    updateFollowUp(newId, { linkedTaskId: editingTaskId });
                    setCreatingFollowUp(false);
                    setNewFollowUpText('');
                  }}
                  className="px-3 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setCreatingFollowUp(false); setNewFollowUpText(''); }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ) : showFollowUpPicker ? (
              <div className="space-y-1.5">
                <select
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-violet-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
                  defaultValue=""
                  onChange={(e) => {
                    const followUpId = e.target.value;
                    if (!followUpId) return;
                    updateTask(editingTaskId, { linkedFollowUpId: followUpId });
                    updateFollowUp(followUpId, { linkedTaskId: editingTaskId });
                    setShowFollowUpPicker(false);
                  }}
                  onBlur={(e) => {
                    if (!e.relatedTarget) setShowFollowUpPicker(false);
                  }}
                >
                  <option value="">— pick a follow-up —</option>
                  {linkableFollowUps.map((f) => (
                    <option key={f.id} value={f.id}>{f.text}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setShowFollowUpPicker(false); setCreatingFollowUp(true); }}
                  className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 transition-colors px-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create new follow-up instead
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {linkableFollowUps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFollowUpPicker(true)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-600 transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Link existing…
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCreatingFollowUp(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {linkableFollowUps.length === 0 ? 'Create follow-up…' : 'Create new…'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setEditingTask(null)}
              className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
