import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID, SUPPLIER_COLORS } from '../store/store';
import { TEMPLATES } from '../utils/templates';
import { format } from 'date-fns';
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  HelpCircle,
  Home,
  Link2,
  ListChecks,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  Sun,
  Trash2,
  Unlink,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ColorDot, IconButton, Monogram } from './common';
import type { ActiveView, Note, Supplier } from '../types';

function htmlPreview(html: string): string {
  const el = document.createElement('div');
  // Separate block elements so headings and paragraphs don't run together
  el.innerHTML = html.replace(/<\/(p|h[1-6]|li|div|blockquote)>/g, ' </$1>');
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

const NAV_ITEM =
  'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-ui text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground';

export function Sidebar() {
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [suppliersCollapsed, setSuppliersCollapsed] = useState(false);
  const [archivedNotesExpanded, setArchivedNotesExpanded] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');

  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const addSupplier = useStore((s) => s.addSupplier);
  const updateSupplier = useStore((s) => s.updateSupplier);
  const deleteSupplier = useStore((s) => s.deleteSupplier);
  const togglePinSupplier = useStore((s) => s.togglePinSupplier);
  const setSupplierTemplate = useStore((s) => s.setSupplierTemplate);
  const linkSupplierToProject = useStore((s) => s.linkSupplierToProject);
  const unlinkSupplierFromProject = useStore((s) => s.unlinkSupplierFromProject);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const toggleArchiveNote = useStore((s) => s.toggleArchiveNote);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const projectSuppliers = activeProjectId ? suppliers.filter((s) => s.projectIds.includes(activeProjectId)) : [];
  const filtered = projectSuppliers
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  const unlinkableSuppliers = activeProjectId ? suppliers.filter((s) => !s.projectIds.includes(activeProjectId)) : [];

  const isInternalTab = activeTabId === INTERNAL_TAB_ID;

  const projectNotes = activeProjectId ? notes.filter((n) => !n.archived && n.projectIds.includes(activeProjectId)) : [];
  const noteCountFor = (supplierId: string) =>
    supplierId === INTERNAL_TAB_ID
      ? projectNotes.filter((n) => n.internal).length
      : projectNotes.filter((n) => n.supplierIds.includes(supplierId)).length;
  const followUpCount = activeProjectId
    ? tasks.filter((t) => t.projectId === activeProjectId && t.status !== 'done').length +
      followUps.filter((f) => f.projectId === activeProjectId && f.status === 'open').length
    : 0;

  const allContextNotes =
    activeTabId && activeProjectId
      ? isInternalTab
        ? notes.filter((n) => n.internal && n.projectIds.includes(activeProjectId)).sort((a, b) => b.createdAt - a.createdAt)
        : notes
            .filter((n) => n.supplierIds.includes(activeTabId) && n.projectIds.includes(activeProjectId))
            .sort((a, b) => b.createdAt - a.createdAt)
      : [];
  const activeNotes = allContextNotes.filter((n) => !n.archived);
  const archivedNotes = allContextNotes.filter((n) => n.archived);

  const handleAddSupplier = () => {
    if (newSupplierName.trim()) {
      const id = addSupplier(newSupplierName.trim());
      openTab(id);
      setNewSupplierName('');
      setAddingSupplier(false);
    }
  };

  const handleAddProject = () => {
    if (newProjectName.trim()) {
      addProject(newProjectName.trim());
      setNewProjectName('');
      setAddingProject(false);
    }
  };

  const commitProjectRename = () => {
    if (activeProject && editProjectName.trim()) updateProject(activeProject.id, { name: editProjectName.trim() });
    setEditingProject(false);
  };

  const openSupplier = (id: string) => {
    openTab(id);
    setActiveView('notes');
  };

  const confirmDeleteNote = (id: string) =>
    openConfirmDialog({
      title: 'Delete note?',
      message: 'This note and all its linked tasks and decisions will be removed.',
      confirmLabel: 'Delete note',
      onConfirm: () => deleteNote(id),
    });

  const navItem = (view: ActiveView, label: string, icon: React.ReactNode, trailing?: React.ReactNode) => {
    const on = activeView === view;
    return (
      <button
        type="button"
        onClick={() => setActiveView(view)}
        aria-current={on ? 'page' : undefined}
        className={cn(NAV_ITEM, on && 'bg-sidebar-accent font-medium text-foreground')}
      >
        <span className={cn('flex text-muted-foreground', on && 'text-primary')}>{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        {trailing}
      </button>
    );
  };

  const NoteRow = ({ note, archived }: { note: Note; archived?: boolean }) => {
    const on = activeNoteId === note.id && activeView === 'notes';
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          navigateToNote(note.id);
          setActiveView('notes');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            navigateToNote(note.id);
            setActiveView('notes');
          }
        }}
        className={cn(
          'group/note flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent',
          on && 'bg-sidebar-accent',
          archived && !on && 'opacity-60',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-ui', on ? 'font-medium text-foreground' : 'text-subtle-foreground')}>
            {note.title || 'Untitled'}
          </div>
          {note.content && !archived && <div className="truncate text-2xs text-muted-foreground">{htmlPreview(note.content)}</div>}
        </div>
        <span className="mt-0.5 shrink-0 text-2xs text-muted-foreground tabular-nums group-hover/note:hidden">
          {format(new Date(note.createdAt), 'MMM d')}
        </span>
        <div className="hidden shrink-0 items-center gap-0.5 group-hover/note:flex">
          <IconButton
            label={archived ? 'Unarchive note' : 'Archive note'}
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              toggleArchiveNote(note.id);
            }}
          >
            {archived ? <ArchiveRestore /> : <Archive />}
          </IconButton>
          <IconButton
            label="Delete note"
            size="icon-xs"
            className="hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              confirmDeleteNote(note.id);
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    );
  };

  const NotesTree = () => (
    <div className="mt-0.5 mb-1.5 ml-[15px] flex flex-col gap-px border-l border-sidebar-border pl-2">
      {activeNotes.map((n) => (
        <NoteRow key={n.id} note={n} />
      ))}
      {activeNotes.length === 0 && (
        <p className="px-2 py-1.5 text-2xs text-muted-foreground">
          {archivedNotes.length > 0 ? 'All notes are archived.' : 'No notes yet.'}
        </p>
      )}
      <button
        type="button"
        onClick={() => (isInternalTab ? addInternalNote() : activeTabId && addNote(activeTabId))}
        className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-ui text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <Plus className="size-3.5" />
        <span className="flex-1 text-left">New note</span>
        <Kbd className="bg-transparent">Ctrl N</Kbd>
      </button>
      {archivedNotes.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setArchivedNotesExpanded((v) => !v)}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-ui text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Archive className="size-3.5" />
            <span className="flex-1 text-left">Archived</span>
            <span className="text-2xs tabular-nums">{archivedNotes.length}</span>
            {archivedNotesExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          {archivedNotesExpanded && archivedNotes.map((n) => <NoteRow key={n.id} note={n} archived />)}
        </>
      )}
    </div>
  );

  const SupplierMenu = ({ supplier }: { supplier: Supplier }) => (
    <DropdownMenu open={menuFor === supplier.id} onOpenChange={(o) => setMenuFor(o ? supplier.id : null)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${supplier.name} options`}
          onClick={(e) => e.stopPropagation()}
          className="flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/sup:opacity-100 hover:bg-background hover:text-foreground data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{supplier.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => togglePinSupplier(supplier.id)}>
          {supplier.pinned ? <PinOff /> : <Pin />}
          {supplier.pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileText className="text-muted-foreground" />
            <span className="flex-1">Default template</span>
            <span className="text-xs text-muted-foreground">
              {supplier.defaultTemplate ? TEMPLATES[supplier.defaultTemplate]?.name.split(' ')[0] : 'None'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup
              value={supplier.defaultTemplate ?? 'none'}
              onValueChange={(v) => setSupplierTemplate(supplier.id, v === 'none' ? null : v)}
            >
              <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {tpl.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <div className="px-2 py-1.5">
          <div className="mb-1.5 text-xs text-muted-foreground">Color</div>
          <div className="grid grid-cols-5 gap-1.5">
            {SUPPLIER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                className="h-5 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  boxShadow: c === supplier.color ? `0 0 0 2px var(--popover), 0 0 0 4px ${c}` : undefined,
                }}
                onClick={() => {
                  updateSupplier(supplier.id, { color: c });
                  setMenuFor(null);
                }}
              />
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        {activeProjectId && (
          <DropdownMenuItem
            onSelect={() =>
              openConfirmDialog({
                title: 'Remove from project?',
                message: `Remove "${supplier.name}" from this project? Notes in this project for this supplier will be deleted.`,
                confirmLabel: 'Remove',
                onConfirm: () => unlinkSupplierFromProject(supplier.id, activeProjectId),
              })
            }
          >
            <Unlink />
            Remove from project
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            openConfirmDialog({
              title: 'Delete supplier?',
              message: `Delete "${supplier.name}" globally? This removes ALL notes, tasks, and decisions for this supplier across all projects.`,
              confirmLabel: 'Delete supplier',
              onConfirm: () => deleteSupplier(supplier.id),
            })
          }
        >
          <Trash2 />
          Delete supplier…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const SupplierRow = ({ supplier }: { supplier: Supplier }) => {
    const on = activeTabId === supplier.id;
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => openSupplier(supplier.id)}
          onKeyDown={(e) => e.key === 'Enter' && openSupplier(supplier.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuFor(supplier.id);
          }}
          className={cn(NAV_ITEM, 'group/sup', on && 'font-medium text-foreground')}
        >
          <span className="flex w-4 justify-center">
            <ColorDot color={supplier.color} />
          </span>
          <span className="flex-1 truncate text-left">{supplier.name}</span>
          {supplier.pinned && <Pin className="size-3 text-muted-foreground" aria-label="Pinned" />}
          <span className="text-2xs text-muted-foreground tabular-nums group-hover/sup:hidden">{noteCountFor(supplier.id)}</span>
          <SupplierMenu supplier={supplier} />
        </div>
        {on && <NotesTree />}
      </>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-62 shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar px-2.5 py-3 text-sidebar-foreground select-none"
    >
      {/* Project switcher + search */}
      <div className="flex flex-col gap-2">
        {editingProject && activeProject ? (
          <Input
            autoFocus
            value={editProjectName}
            aria-label="Project name"
            onChange={(e) => setEditProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitProjectRename();
              if (e.key === 'Escape') setEditingProject(false);
            }}
            onBlur={commitProjectRename}
            className="h-10"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Switch project"
                className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
              >
                {activeProject ? (
                  <Monogram name={activeProject.name} color={activeProject.color} />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground">
                    <Plus className="size-3.5" />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-ui font-semibold">{activeProject?.name ?? 'Select project'}</span>
                  <span className="text-xs text-muted-foreground">
                    {activeProject
                      ? `Project · ${projectSuppliers.length} supplier${projectSuppliers.length === 1 ? '' : 's'}`
                      : `${projects.filter((p) => !p.archived).length} projects`}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => setActiveProject(p.id)}>
                    <Monogram name={p.name} color={p.color} className="size-5 rounded text-2xs" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === activeProjectId && <Check />}
                  </DropdownMenuItem>
                ))}
              {projects.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet</div>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAddingProject(true)}>
                <Plus />
                New project
              </DropdownMenuItem>
              {activeProject && (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditProjectName(activeProject.name);
                      setEditingProject(true);
                    }}
                  >
                    <Pencil />
                    Rename “{activeProject.name}”
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      openConfirmDialog({
                        title: 'Delete project?',
                        message: `Delete project "${activeProject.name}"? All notes, tasks, and decisions in this project will be removed.`,
                        confirmLabel: 'Delete project',
                        onConfirm: () => deleteProject(activeProject.id),
                      })
                    }
                  >
                    <Trash2 />
                    Delete project…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {addingProject && (
          <Input
            autoFocus
            placeholder="Project name…"
            aria-label="New project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddProject();
              if (e.key === 'Escape') {
                setAddingProject(false);
                setNewProjectName('');
              }
            }}
            onBlur={() => {
              if (!newProjectName.trim()) {
                setAddingProject(false);
                setNewProjectName('');
              }
            }}
            className="h-8"
          />
        )}

        <button
          type="button"
          onClick={toggleCommandPalette}
          className="flex h-8 w-full items-center gap-2 rounded-lg border bg-background px-2 text-ui text-muted-foreground shadow-xs transition-colors hover:text-foreground"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      {/* Primary navigation */}
      <div className="flex flex-col gap-0.5">
        {navItem('dashboard', 'Overview', <Home className="size-4" />)}
        {navItem(
          'notes',
          'Notes',
          <FileText className="size-4" />,
          activeProjectId ? <span className="text-xs text-muted-foreground tabular-nums">{projectNotes.length}</span> : undefined,
        )}
        {navItem(
          'tasks',
          'Follow-up',
          <ListChecks className="size-4" />,
          followUpCount > 0 ? (
            <span className="inline-flex h-4.5 items-center rounded-full bg-brand-soft px-1.5 text-2xs font-semibold text-brand-soft-foreground tabular-nums">
              {followUpCount}
            </span>
          ) : undefined,
        )}
      </div>

      {/* Suppliers */}
      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeProjectId ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex h-6 items-center justify-between pr-0.5 pl-2">
              <button
                type="button"
                onClick={() => setSuppliersCollapsed(!suppliersCollapsed)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Suppliers
                {suppliersCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
              <div className="flex items-center gap-0.5">
                <IconButton label="Filter suppliers" size="icon-xs" onClick={() => setFilterOpen((v) => !v)}>
                  <Search />
                </IconButton>
                {unlinkableSuppliers.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton label="Link existing supplier" size="icon-xs">
                        <Link2 />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 w-52">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Link existing supplier</DropdownMenuLabel>
                      {unlinkableSuppliers.map((s) => (
                        <DropdownMenuItem key={s.id} onSelect={() => linkSupplierToProject(s.id, activeProjectId)}>
                          <ColorDot color={s.color} />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <IconButton label="Add supplier" size="icon-xs" onClick={() => setAddingSupplier(true)}>
                  <Plus />
                </IconButton>
              </div>
            </div>

            {(filterOpen || search) && (
              <Input
                autoFocus
                placeholder="Filter suppliers…"
                aria-label="Filter suppliers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('');
                    setFilterOpen(false);
                  }
                }}
                className="mb-1 h-7 text-ui"
              />
            )}

            {addingSupplier && (
              <Input
                autoFocus
                placeholder="Supplier name…"
                aria-label="New supplier name"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSupplier();
                  if (e.key === 'Escape') {
                    setAddingSupplier(false);
                    setNewSupplierName('');
                  }
                }}
                onBlur={() => {
                  if (!newSupplierName.trim()) {
                    setAddingSupplier(false);
                    setNewSupplierName('');
                  }
                }}
                className="mb-1 h-7 text-ui"
              />
            )}

            {!suppliersCollapsed && (
              <>
                {filtered.map((s) => (
                  <SupplierRow key={s.id} supplier={s} />
                ))}
                {filtered.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{search ? 'No matches' : 'No suppliers in this project'}</p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => openSupplier(INTERNAL_TAB_ID)}
              className={cn(NAV_ITEM, 'mt-1', isInternalTab && 'font-medium text-foreground')}
            >
              <span className="flex w-4 justify-center text-muted-foreground">
                <Building2 className="size-3.5" />
              </span>
              <span className="flex-1 text-left">Internal</span>
              <span className="text-2xs text-muted-foreground tabular-nums">{noteCountFor(INTERNAL_TAB_ID)}</span>
            </button>
            {isInternalTab && <NotesTree />}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">Select or create a project to get started</div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-0.5 border-t border-sidebar-border pt-2.5">
        <button type="button" onClick={toggleSettings} className={cn(NAV_ITEM, 'flex-1')}>
          <Settings2 className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">Settings</span>
          <Kbd className="bg-transparent">Ctrl ,</Kbd>
        </button>
        <IconButton label="Help guide" side="top" onClick={toggleHelp}>
          <HelpCircle />
        </IconButton>
        <IconButton
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          side="top"
          onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
      </div>
    </nav>
  );
}

