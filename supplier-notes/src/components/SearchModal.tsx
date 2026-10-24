import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { buildSearchIndex, searchLocal, type SearchKind, type SearchItem } from '../utils/search';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type SavedSearch = { name: string; query: string; type: SearchKind | 'all'; project: string; supplier: string; days: string };
const SAVED_KEY = 'hivemind-saved-searches';
function highlight(text: string, query: string) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const regex = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return text.split(regex).map((part, index) => words.some((word) => part.toLowerCase() === word.toLowerCase())
    ? <mark key={index} className="bg-highlight text-foreground">{part}</mark> : part);
}

export function SearchModal() {
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const followUps = useStore((s) => s.followUps);
  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const toggleSearch = useStore((s) => s.toggleSearch);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const setActiveView = useStore((s) => s.setActiveView);
  const setDashboardSection = useStore((s) => s.setDashboardSection);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const setEditingDecision = useStore((s) => s.setEditingDecision);
  const setFocusedFollowUp = useStore((s) => s.setFocusedFollowUp);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState<SearchKind | 'all'>('all');
  const [project, setProject] = useState('all');
  const [supplier, setSupplier] = useState('all');
  const [days, setDays] = useState('all');
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState<SavedSearch[]>(() => {
    try { const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
  });
  const index = useMemo(() => buildSearchIndex(notes, tasks, decisions, followUps), [notes, tasks, decisions, followUps]);
  const results = useMemo(() => searchLocal(index, deferredQuery, {
    type, projectId: project, supplierId: supplier,
    since: days === 'all' ? undefined : Date.now() - Number(days) * 86_400_000,
  }), [index, deferredQuery, type, project, supplier, days]);
  useEffect(() => setSelected(0), [query, type, project, supplier, days]);

  const saveCurrent = () => {
    if (!query.trim()) return;
    const name = query.trim().slice(0, 40);
    const next = [...saved.filter((item) => item.name !== name), { name, query, type, project, supplier, days }].slice(-10);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };
  const openResult = (result: SearchItem) => {
    const projectId = result.projectIds.find((id) => projects.some((project) => project.id === id));
    if (projectId) setActiveProject(projectId);
    if (result.type === 'note' || result.type === 'transcript') navigateToNote(result.noteId || result.id);
    else {
      setActiveView('tasks');
      if (result.type === 'task') { setDashboardSection('tasks'); setEditingTask(result.id); }
      if (result.type === 'decision') { setDashboardSection('decisions'); setEditingDecision(result.id); }
      if (result.type === 'followup') { setDashboardSection('followups'); setFocusedFollowUp(result.id); }
    }
    toggleSearch();
  };

  return <Dialog open onOpenChange={(open) => !open && toggleSearch()}>
    <DialogContent showCloseButton={false} className="top-[8vh] max-h-[82vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <DialogTitle className="sr-only">Search HiveMind</DialogTitle>
      <DialogDescription className="sr-only">Search notes, tasks, decisions, follow-ups and transcripts</DialogDescription>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Input autoFocus aria-label="Global search" placeholder="Search everything…" value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((current) => Math.max(0, Math.min(results.length - 1, current + 1))); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((current) => Math.max(0, current - 1)); }
            if (event.key === 'Enter' && results[selected]) openResult(results[selected]);
          }} />
        <Button variant="outline" size="sm" disabled={!query.trim()} onClick={saveCurrent}>Save search</Button>
      </div>
      <div className="flex flex-wrap gap-2 border-b px-4 py-2">
        <Select value={type} onValueChange={(value) => setType(value as SearchKind | 'all')}><SelectTrigger size="sm" aria-label="Information type"><SelectValue /></SelectTrigger><SelectContent>{(['all', 'note', 'task', 'decision', 'followup', 'transcript'] as const).map((kind) => <SelectItem key={kind} value={kind}>{kind === 'all' ? 'All types' : kind}</SelectItem>)}</SelectContent></Select>
        <Select value={project} onValueChange={setProject}><SelectTrigger size="sm" aria-label="Project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Select value={supplier} onValueChange={setSupplier}><SelectTrigger size="sm" aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem><SelectItem value={INTERNAL_TAB_ID}>Internal</SelectItem>{suppliers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Select value={days} onValueChange={setDays}><SelectTrigger size="sm" aria-label="Date"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any date</SelectItem><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="365">Last year</SelectItem></SelectContent></Select>
      </div>
      {saved.length > 0 && <div className="flex flex-wrap gap-1 border-b px-4 py-2">{saved.map((item) => <Button key={item.name} variant="ghost" size="xs" onClick={() => { setQuery(item.query); setType(item.type); setProject(item.project); setSupplier(item.supplier); setDays(item.days); }}>{item.name}</Button>)}</div>}
      <div className="min-h-0 overflow-y-auto p-2">
        {!query.trim() && <p className="py-8 text-center text-sm text-muted-foreground">Start typing to search.</p>}
        {query.trim() && results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No results found.</p>}
        {results.map((result, index) => <button key={`${result.type}-${result.id}`} type="button" onMouseEnter={() => setSelected(index)} onClick={() => openResult(result)}
          className={`flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-accent ${selected === index ? 'bg-accent' : ''}`}>
          <div className="flex items-center gap-2"><span className="rounded border px-1.5 text-2xs text-muted-foreground">{result.type}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{highlight(result.title, query)}</span><span className="text-xs text-muted-foreground">{new Date(result.date).toLocaleDateString()}</span></div>
          {result.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{highlight(result.snippet, query)}</p>}
        </button>)}
      </div>
    </DialogContent>
  </Dialog>;
}
