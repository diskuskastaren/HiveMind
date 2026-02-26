import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import type { TaskStatus, Priority } from '../types';
import { X, GripVertical, ChevronRight, FileText } from 'lucide-react';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: 'border-gray-300' },
  { status: 'doing', label: 'Doing', color: 'border-yellow-400' },
  { status: 'done', label: 'Done', color: 'border-green-400' },
];

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
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

  const projectSuppliers = filterProject === 'all'
    ? suppliers
    : suppliers.filter((s) => s.projectIds.includes(filterProject));

  const handleDragStart = (taskId: string) => setDragging(taskId);
  const handleDragEnd = () => setDragging(null);
  const handleDrop = (status: TaskStatus) => {
    if (dragging) {
      updateTask(dragging, { status });
      setDragging(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={toggleKanban} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold">Task Board</h2>
          <div className="flex items-center gap-3">
            <select
              value={filterProject}
              onChange={(e) => { setFilterProject(e.target.value); setFilterSupplier('all'); }}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All projects</option>
              {projects.filter((p) => !p.archived).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All suppliers</option>
              <option value={INTERNAL_TAB_ID}>Internal</option>
              {projectSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button onClick={toggleKanban} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 min-h-[400px]">
            {COLUMNS.map((col) => {
              const colTasks = filtered
                .filter((t) => t.status === col.status)
                .sort((a, b) => b.createdAt - a.createdAt);

              return (
                <div
                  key={col.status}
                  className={`flex-1 min-w-[250px] bg-gray-50 rounded-lg border-t-2 ${col.color}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col.status)}
                >
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{col.label}</span>
                    <span className="text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="px-2 pb-2 space-y-2">
                    {colTasks.map((task) => {
                        const supplier = task.supplierId ? suppliers.find((s) => s.id === task.supplierId) : null;
                        const project = projects.find((p) => p.id === task.projectId);

                      const note = notes.find((n) => n.id === task.noteId);
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => handleDragStart(task.id)}
                          onDragEnd={handleDragEnd}
                          className={`bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${
                            dragging === task.id ? 'opacity-50' : ''
                          }`}
                          onClick={() => {
                            setEditingTask(task.id);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{task.title}</div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span
                                  className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority]}`}
                                  title={task.priority}
                                />
                                {project && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: project.color + '20',
                                      color: project.color,
                                    }}
                                  >
                                    {project.name}
                                  </span>
                                )}
                                {supplier ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: supplier.color + '20',
                                      color: supplier.color,
                                    }}
                                  >
                                    {supplier.name}
                                  </span>
                                ) : task.supplierId === null && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">
                                    Internal
                                  </span>
                                )}
                                {task.owner && (
                                  <span className="text-[10px] text-gray-400">@{task.owner}</span>
                                )}
                                {task.dueDate && (
                                  <span className="text-[10px] text-gray-400">{task.dueDate}</span>
                                )}
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
                            {/* Move buttons for accessibility */}
                            <div className="flex flex-col gap-0.5">
                              {col.status !== 'done' && (
                                <button
                                  className="p-0.5 hover:bg-gray-100 rounded"
                                  title={`Move to ${col.status === 'open' ? 'Doing' : 'Done'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTask(task.id, {
                                      status: col.status === 'open' ? 'doing' : 'done',
                                    });
                                  }}
                                >
                                  <ChevronRight className="w-3 h-3 text-gray-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
