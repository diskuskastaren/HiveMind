import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { CustomSelect } from './ui/CustomSelect';
import { format } from 'date-fns';
import { Search, X, FileText, CheckSquare, Lightbulb, Archive } from 'lucide-react';

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
  archived?: boolean;
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
  const setActiveView = useStore((s) => s.setActiveView);

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
            archived: n.archived,
          });
        }
      });
    }

    if (filterType === 'all' || filterType === 'task') {
      tasks.forEach((t) => {
        if (t.title.toLowerCase().includes(q) || t.owner.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)) {
          all.push({
            type: 'task',
            id: t.id,
            projectIds: [t.projectId],
            supplierIds: t.supplierId ? [t.supplierId] : [],
            noteId: t.noteId ?? undefined,
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
            noteId: d.noteId ?? undefined,
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

    setActiveView('notes');
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
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search notes, tasks, decisions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={() => {}}
            className="flex-1 px-3 py-3.5 text-sm border-none outline-none bg-transparent dark:text-gray-100 dark:placeholder-gray-500"
          />
          <button onClick={toggleSearch} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex-wrap">
          {(['all', 'note', 'task', 'decision'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                filterType === type ? 'bg-gray-200 dark:bg-white/15 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
          <CustomSelect
            value={filterProject}
            onChange={setFilterProject}
            className="text-xs px-2.5 py-1 text-gray-700 dark:text-gray-300 rounded-full"
            options={[
              { value: 'all', label: 'All projects' },
              ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <CustomSelect
            value={filterSupplier}
            onChange={setFilterSupplier}
            className="text-xs px-2.5 py-1 text-gray-700 dark:text-gray-300 rounded-full"
            options={[
              { value: 'all', label: 'All suppliers' },
              { value: INTERNAL_TAB_ID, label: 'Internal' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
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
                    className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSelect(r)}
                  >
                    <span className="mt-0.5">{ICONS[r.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm dark:text-gray-200 ${r.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>{r.title}</span>
                        {r.archived && (
                          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-800 flex-shrink-0">
                            <Archive className="w-2.5 h-2.5" />
                            archived
                          </span>
                        )}
                      </div>
                      {r.detail && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.detail}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {linkedProjects.map((p) => (
                          <span
                            key={p.id}
                            className="text-[10px] px-1.5 py-0.5 rounded inline-block"
                            style={{ backgroundColor: p.color + '20', color: p.color }}
                          >
                            {p.name}
                          </span>
                        ))}
                        {linkedSuppliers.length > 0 ? linkedSuppliers.map((s) => (
                          <span
                            key={s.id}
                            className="text-[10px] px-1.5 py-0.5 rounded inline-block"
                            style={{ backgroundColor: s.color + '20', color: s.color }}
                          >
                            {s.name}
                          </span>
                        )) : r.supplierIds.length === 0 && r.type !== 'note' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded inline-block bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400">
                            Internal
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {format(new Date(r.date), 'MMM d')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No results found</p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Start typing to search…</p>
          )}
        </div>
      </div>
    </div>
  );
}
