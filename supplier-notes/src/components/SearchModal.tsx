import { useState, useMemo } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import { Archive, FileText, Gavel, Search, SquareCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { EntityChip } from './common';

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

type FilterType = 'all' | 'note' | 'task' | 'decision';

export function SearchModal() {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');

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
        if (n.title.toLowerCase().includes(q) || text.toLowerCase().includes(q) || n.attendees.toLowerCase().includes(q)) {
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
        filterSupplier === INTERNAL_TAB_ID ? r.supplierIds.length === 0 : r.supplierIds.includes(filterSupplier),
      );
    }

    return filtered.sort((a, b) => b.date - a.date).slice(0, 50);
  }, [query, filterType, filterProject, filterSupplier, notes, tasks, decisions]);

  const ICONS = {
    note: <FileText className="size-4 text-muted-foreground" />,
    task: <SquareCheck className="size-4 text-muted-foreground" />,
    decision: <Gavel className="size-4 text-muted-foreground" />,
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
    <Dialog open onOpenChange={(open) => !open && toggleSearch()}>
      <DialogContent showCloseButton={false} className="top-[10vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search notes, tasks and decisions</DialogDescription>
        <label className="flex h-12 items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            aria-label="Search"
            placeholder="Search notes, tasks, decisions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </label>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={filterType}
            onValueChange={(v) => v && setFilterType(v as FilterType)}
          >
            <ToggleGroupItem value="all" className="px-2.5 text-xs">All</ToggleGroupItem>
            <ToggleGroupItem value="note" className="px-2.5 text-xs">Notes</ToggleGroupItem>
            <ToggleGroupItem value="task" className="px-2.5 text-xs">Tasks</ToggleGroupItem>
            <ToggleGroupItem value="decision" className="px-2.5 text-xs">Decisions</ToggleGroupItem>
          </ToggleGroup>
          <div className="mx-1 h-4 w-px bg-border" />
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger size="sm" className="text-xs" aria-label="Filter by project">
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
            <SelectTrigger size="sm" className="text-xs" aria-label="Filter by supplier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              <SelectItem value={INTERNAL_TAB_ID}>Internal</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {results.length > 0 ? (
            <div className="p-1.5">
              {results.map((r) => {
                const linkedProjects = r.projectIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;
                const linkedSuppliers = r.supplierIds.map((id) => suppliers.find((s) => s.id === id)).filter(Boolean) as typeof suppliers;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
                    onClick={() => handleSelect(r)}
                  >
                    <span className="mt-0.5">{ICONS[r.type]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={r.archived ? 'text-muted-foreground' : 'font-medium'}>{r.title}</span>
                        {r.archived && (
                          <Badge variant="outline" className="h-4.5 text-2xs text-muted-foreground">
                            <Archive />
                            Archived
                          </Badge>
                        )}
                      </div>
                      {r.detail && <div className="truncate text-xs text-muted-foreground">{r.detail}</div>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex flex-wrap justify-end gap-1">
                        {linkedProjects.map((p) => (
                          <EntityChip key={p.id} color={p.color}>
                            {p.name}
                          </EntityChip>
                        ))}
                        {linkedSuppliers.length > 0
                          ? linkedSuppliers.map((s) => (
                              <EntityChip key={s.id} color={s.color}>
                                {s.name}
                              </EntityChip>
                            ))
                          : r.supplierIds.length === 0 &&
                            r.type !== 'note' && (
                              <EntityChip color="#71717a">Internal</EntityChip>
                            )}
                      </div>
                      <div className="text-2xs text-muted-foreground tabular-nums">{format(new Date(r.date), 'MMM d')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{query ? 'No results found' : 'Start typing to search…'}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
