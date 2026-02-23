import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import { Search, X, FileText, CheckSquare, Lightbulb } from 'lucide-react';

interface SearchResult {
  type: 'note' | 'task' | 'decision';
  id: string;
  /** For notes: all linked project IDs. For tasks/decisions: single-element array. */
  projectIds: string[];
  /** For notes: all linked supplier IDs. For tasks/decisions: single-element array. */
  supplierIds: string[];
  noteId?: string;
  title: string;
  detail: string;
  date: number;
}

export function SearchModal() {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'note' | 'task' | 'decision'>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const toggleSearch = useStore((s) => s.toggleSearch);
  const openTab = useStore((s) => s.openTab);
  const setActiveNote = useStore((s) => s.setActiveNote);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setActiveProject = useStore((s) => s.setActiveProject);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function htmlToText(html: string): string {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent || '';
  }

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const all: SearchResult[] = [];

    if (filterType === 'all' || filterType === 'note') {
      notes.forEach((n) => {
        const text = htmlToText(n.content);
        if (
          n.title.toLowerCase().includes(q) ||
          text.toLowerCase().includes(q) ||
          n.attendees.toLowerCase().includes(q)
        ) {
          all.push({
            type: 'note',
            id: n.id,
            projectIds: n.projectIds,
            supplierIds: n.supplierIds,
            title: n.title || 'Untitled',
            detail: text.slice(0, 100),
            date: n.updatedAt,
          });
        }
      });
    }

    if (filterType === 'all' || filterType === 'task') {
      tasks.forEach((t) => {
        if (t.title.toLowerCase().includes(q) || t.owner.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q))) {
          all.push({
            type: 'task',
            id: t.id,
            projectIds: [t.projectId],
            supplierIds: t.supplierId ? [t.supplierId] : [],
            noteId: t.noteId,
            title: t.title,
            detail: `${t.status} · ${t.priority}${t.owner ? ` · @${t.owner}` : ''}`,
            date: t.createdAt,
          });
        }
      });
    }

    if (filterType === 'all' || filterType === 'decision') {
      decisions.forEach((d) => {
        if (d.text.toLowerCase().includes(q)) {
          all.push({
            type: 'decision',
            id: d.id,
            projectIds: [d.projectId],
            supplierIds: d.supplierId ? [d.supplierId] : [],
            noteId: d.noteId,
            title: d.text,
            detail: '',
            date: d.createdAt,
          });
        }
      });
    }

    let filtered = all;
    if (filterProject !== 'all') {
      filtered = filtered.filter((r) => r.projectIds.includes(filterProject));
    }
    if (filterSupplier !== 'all') {
      filtered = filtered.filter((r) =>
        filterSupplier === INTERNAL_TAB_ID
          ? r.supplierIds.length === 0
          : r.supplierIds.includes(filterSupplier),
      );
    }

    return filtered.sort((a, b) => b.date - a.date).slice(0, 50);
  }, [query, filterType, filterProject, filterSupplier, notes, tasks, decisions]);

  const ICONS = {
    note: <FileText className="w-4 h-4 text-blue-500" />,
    task: <CheckSquare className="w-4 h-4 text-yellow-500" />,
    decision: <Lightbulb className="w-4 h-4 text-green-500" />,
  };

  const handleSelect = (result: SearchResult) => {
    // Prefer the first linked project; open the corresponding supplier tab
    const targetProjectId = result.projectIds[0];
    const project = projects.find((p) => p.id === targetProjectId);
    if (project) setActiveProject(targetProjectId);

    const targetSupplierId = result.supplierIds[0];
    const supplier = targetSupplierId ? suppliers.find((s) => s.id === targetSupplierId) : null;
    if (supplier) {
      openTab(targetSupplierId);
    } else if (result.supplierIds.length === 0) {
      openTab(INTERNAL_TAB_ID);
    }

    if (result.type === 'note') {
      setActiveNote(result.id);
    } else if (result.type === 'task') {
      if (result.noteId) setActiveNote(result.noteId);
      setRightPanelTab('tasks');
      setEditingTask(result.id);
    } else if (result.type === 'decision') {
      if (result.noteId) setActiveNote(result.noteId);
      setRightPanelTab('decisions');
    }
    toggleSearch();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/30" onClick={toggleSearch} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center px-4 border-b border-gray-200">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search notes, tasks, decisions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={() => {}}
            className="flex-1 px-3 py-3.5 text-sm border-none outline-none bg-transparent"
          />
          <button onClick={toggleSearch} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-wrap">
          {(['all', 'note', 'task', 'decision'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                filterType === type ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200" />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-200 rounded-full bg-white focus:outline-none"
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
            className="text-xs px-2 py-1 border border-gray-200 rounded-full bg-white focus:outline-none"
          >
            <option value="all">All suppliers</option>
            <option value={INTERNAL_TAB_ID}>Internal</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((r) => {
                const linkedProjects = r.projectIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;
                const linkedSuppliers = r.supplierIds.map((id) => suppliers.find((s) => s.id === id)).filter(Boolean) as typeof suppliers;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => handleSelect(r)}
                  >
                    <span className="mt-0.5">{ICONS[r.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{r.title}</div>
                      {r.detail && <div className="text-xs text-gray-400 truncate">{r.detail}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {linkedProjects.map((p) => (
                          <span
                            key={p.id}
                            className="text-[10px] px-1.5 py-0.5 rounded-full inline-block"
                            style={{ backgroundColor: p.color + '20', color: p.color }}
                          >
                            {p.name}
                          </span>
                        ))}
                        {linkedSuppliers.length > 0 ? linkedSuppliers.map((s) => (
                          <span
                            key={s.id}
                            className="text-[10px] px-1.5 py-0.5 rounded-full inline-block"
                            style={{ backgroundColor: s.color + '20', color: s.color }}
                          >
                            {s.name}
                          </span>
                        )) : r.supplierIds.length === 0 && r.type !== 'note' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full inline-block bg-indigo-50 text-indigo-500">
                            Internal
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {format(new Date(r.date), 'MMM d')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query ? (
            <p className="text-sm text-gray-400 text-center py-8">No results found</p>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Start typing to search…</p>
          )}
        </div>
      </div>
    </div>
  );
}
