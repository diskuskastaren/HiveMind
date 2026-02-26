import { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import type { TaskStatus, Priority } from '../types';
import { X, Trash2, FileText } from 'lucide-react';

export function TaskModal() {
  const editingTaskId = useStore((s) => s.editingTaskId);
  const task = useStore((s) => s.tasks.find((t) => t.id === s.editingTaskId));
  const notes = useStore((s) => s.notes);
  const suppliers = useStore((s) => s.suppliers);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const navigateToNote = useStore((s) => s.navigateToNote);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>('open');
  const [priority, setPriority] = useState<Priority>('medium');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status);
      setPriority(task.priority);
      setOwner(task.owner);
      setDueDate(task.dueDate);
      setDescription(task.description ?? '');
    }
  }, [task]);

  const projects = useStore((s) => s.projects);

  if (!editingTaskId || !task) return null;

  const note = notes.find((n) => n.id === task.noteId);
  const supplier = suppliers.find((s) => s.id === task.supplierId);
  const project = projects.find((p) => p.id === task.projectId);

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

  const SelectField = ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

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
            <SelectField
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as TaskStatus)}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'doing', label: 'Doing' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <SelectField
              label="Priority"
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Unassigned</option>
                <option value="Internal">Internal</option>
                {suppliers
                  .filter((s) => project && s.projectIds.includes(project.id))
                  .map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
              </select>
            </div>
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
