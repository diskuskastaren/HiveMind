import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import { BookOpen, Building2, ChevronDown, ChevronRight, CornerUpRight, Keyboard, Pin, Plus, SquareCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Kbd } from '@/components/ui/kbd';
import { ColorDot, Monogram, PriorityBadge, StatusBadge, formatRelativeTime } from './common';

const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Command palette'],
  ['Ctrl N', 'New note'],
  ['Ctrl Shift F', 'Global search'],
  ['Ctrl ]', 'Toggle side panel'],
  ['Ctrl 1–9', 'Switch supplier'],
  ['Ctrl W', 'Close supplier'],
  ['Alt T / D / F', 'Task, decision, follow-up from selection'],
  ['Tab / Shift Tab', 'Indent / outdent in lists'],
  ['Esc', 'Close overlay'],
];

/** Home screen for the active project: stats, recent work and what needs attention. */
export function Overview() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const openTab = useStore((s) => s.openTab);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const setActiveView = useStore((s) => s.setActiveView);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const inProject = (ids: string[]) => !activeProjectId || ids.includes(activeProjectId);

  const projectSuppliers = suppliers.filter((s) => inProject(s.projectIds));
  const projectNotes = notes.filter((n) => !n.archived && inProject(n.projectIds));
  const projectTasks = tasks.filter((t) => (!activeProjectId || t.projectId === activeProjectId) && t.status !== 'done');
  const projectFollowUps = followUps.filter((f) => (!activeProjectId || f.projectId === activeProjectId) && f.status === 'open');
  const pinnedSuppliers = projectSuppliers.filter((s) => s.pinned);

  const supplierLastTouched = new Map<string, number>();
  for (const n of projectNotes) {
    for (const sid of n.supplierIds) {
      const prev = supplierLastTouched.get(sid) ?? 0;
      if (n.updatedAt > prev) supplierLastTouched.set(sid, n.updatedAt);
    }
  }
  const internalProjectNotes = projectNotes.filter((n) => n.internal);
  const internalLastTouched = internalProjectNotes.length > 0 ? Math.max(...internalProjectNotes.map((n) => n.updatedAt)) : null;

  type RecentItem =
    | { kind: 'supplier'; supplier: (typeof projectSuppliers)[0]; lastTouched: number; noteCount: number }
    | { kind: 'internal'; lastTouched: number; noteCount: number };

  const recentItems: RecentItem[] = [
    ...projectSuppliers
      .filter((s) => supplierLastTouched.has(s.id))
      .map((s) => ({
        kind: 'supplier' as const,
        supplier: s,
        lastTouched: supplierLastTouched.get(s.id)!,
        noteCount: projectNotes.filter((n) => n.supplierIds.includes(s.id)).length,
      })),
    ...(internalLastTouched !== null
      ? [{ kind: 'internal' as const, lastTouched: internalLastTouched, noteCount: internalProjectNotes.length }]
      : []),
  ]
    .sort((a, b) => b.lastTouched - a.lastTouched)
    .slice(0, 6);

  const recentNotes = [...projectNotes]
    .filter((n) => n.supplierIds.length > 0 || n.internal)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  // High-priority or in-progress tasks first, then open follow-ups
  const attentionTasks = projectTasks
    .filter((t) => t.priority === 'high' || t.status === 'doing')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 4);
  const attentionFollowUps = projectFollowUps.slice(0, 5 - attentionTasks.length);

  const supplierById = (id: string | null) => (id ? suppliers.find((s) => s.id === id) : undefined);
  const lastEdited = projectNotes.length > 0 ? Math.max(...projectNotes.map((n) => n.updatedAt)) : null;

  const openSupplier = (id: string) => {
    openTab(id);
    setActiveView('notes');
  };
  const openNote = (id: string) => navigateToNote(id);

  const handleNewNote = () => {
    if (activeTabId && activeTabId !== INTERNAL_TAB_ID) addNote(activeTabId);
    else {
      openTab(INTERNAL_TAB_ID);
      addInternalNote();
    }
    setActiveView('notes');
  };

  const stats = [
    { label: 'Suppliers', value: projectSuppliers.length, sub: pinnedSuppliers.length ? `${pinnedSuppliers.length} pinned` : 'None pinned' },
    { label: 'Notes', value: projectNotes.length, sub: lastEdited ? `Last edited ${formatRelativeTime(lastEdited)}` : 'No notes yet' },
    { label: 'Open tasks', value: projectTasks.length, sub: `${projectTasks.filter((t) => t.status === 'doing').length} in progress` },
    { label: 'Follow-ups', value: projectFollowUps.length, sub: `${projectFollowUps.filter((f) => f.linkedTaskId).length} linked to a task` },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-7 px-10 pt-9 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-display font-semibold tracking-tight">{activeProject?.name ?? 'All projects'}</h1>
            <p className="text-muted-foreground">Pick up where you left off, or choose a supplier in the sidebar.</p>
          </div>
          {activeProjectId && (
            <Button onClick={handleNewNote}>
              <Plus />
              New note
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">Ctrl N</Kbd>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {stats.map((s) => (
            <Card key={s.label} className="gap-1.5 rounded-xl px-4 py-4 shadow-xs">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.sub}</span>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-6">
            {recentNotes.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-sm font-semibold">Recent notes</h2>
                <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                  {recentNotes.map((note) => {
                    const sup = note.internal ? null : suppliers.find((s) => note.supplierIds.includes(s.id));
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => openNote(note.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/60"
                      >
                        {sup ? <ColorDot color={sup.color} /> : <Building2 className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {note.title || <span className="font-normal text-muted-foreground italic">Untitled</span>}
                        </span>
                        <span className="shrink-0 text-ui text-muted-foreground">{sup?.name ?? 'Internal'}</span>
                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {formatRelativeTime(note.updatedAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {(attentionTasks.length > 0 || attentionFollowUps.length > 0) && (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Needs attention</h2>
                  <Button variant="link" size="xs" className="px-0 text-muted-foreground" onClick={() => setActiveView('tasks')}>
                    Open follow-up
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {attentionTasks.map((t) => {
                    const sup = supplierById(t.supplierId);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setEditingTask(t.id)}
                        className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:bg-accent/60"
                      >
                        <SquareCheck className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-ui font-medium">{t.title}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {sup ? <ColorDot color={sup.color} className="size-1.5" /> : null}
                            {sup?.name ?? 'Internal'} · Task{t.dueDate && !isNaN(new Date(t.dueDate).getTime()) ? ` · due ${format(new Date(t.dueDate), 'MMM d')}` : ''}
                          </span>
                        </span>
                        {t.status === 'doing' ? <StatusBadge status="doing" /> : <PriorityBadge priority={t.priority} />}
                      </button>
                    );
                  })}
                  {attentionFollowUps.map((f) => {
                    const sup = supplierById(f.supplierId);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveView('tasks')}
                        className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:bg-accent/60"
                      >
                        <CornerUpRight className="size-4 shrink-0 text-primary" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-ui font-medium">{f.text}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {sup ? <ColorDot color={sup.color} className="size-1.5" /> : null}
                            {sup?.name ?? 'Internal'} · Follow-up
                          </span>
                        </span>
                        <StatusBadge status="open" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-6">
            {recentItems.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-sm font-semibold">Recently active</h2>
                <div className="flex flex-col gap-2">
                  {recentItems.map((item) => {
                    const isInternal = item.kind === 'internal';
                    const name = isInternal ? 'Internal' : item.supplier.name;
                    return (
                      <button
                        key={isInternal ? 'internal' : item.supplier.id}
                        type="button"
                        onClick={() => openSupplier(isInternal ? INTERNAL_TAB_ID : item.supplier.id)}
                        className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/60"
                      >
                        <Monogram name={name} color={isInternal ? '#71717a' : item.supplier.color} className="size-8" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5 font-medium">
                            {name}
                            {!isInternal && item.supplier.pinned && <Pin className="size-3 text-muted-foreground" aria-label="Pinned" />}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'} · {formatRelativeTime(item.lastTouched)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {pinnedSuppliers.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Pin className="size-3.5 text-muted-foreground" /> Pinned
                </h2>
                <div className="flex flex-wrap gap-2">
                  {pinnedSuppliers.map((sup) => (
                    <Button key={sup.id} variant="outline" size="sm" onClick={() => openSupplier(sup.id)}>
                      <ColorDot color={sup.color} />
                      {sup.name}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3 rounded-xl border bg-muted p-4">
              <div className="flex items-center gap-2.5">
                <BookOpen className="size-4.5 text-primary" />
                <h2 className="text-sm font-semibold">Help guide</h2>
              </div>
              <p className="text-ui text-subtle-foreground">Learn how to use projects, notes, tasks, transcription and more.</p>
              <Button variant="outline" size="sm" className="self-start" onClick={toggleHelp}>
                Open guide
              </Button>
            </section>

            <Collapsible open={shortcutsOpen} onOpenChange={setShortcutsOpen} className="flex flex-col gap-2.5">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold">
                <Keyboard className="size-4 text-muted-foreground" />
                Keyboard shortcuts
                {shortcutsOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-2 rounded-lg border bg-card p-3.5">
                  {SHORTCUTS.map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between gap-3 text-ui">
                      <span className="text-subtle-foreground">{desc}</span>
                      <Kbd className="font-mono">{key}</Kbd>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
    </div>
  );
}
