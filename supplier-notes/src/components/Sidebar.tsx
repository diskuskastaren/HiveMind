import { useState, useRef, useEffect } from 'react';
import { useStore, INTERNAL_TAB_ID, SUPPLIER_COLORS } from '../store/store';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  FolderOpen,
  Link2,
  Unlink,
  Settings,
  Archive,
  ArchiveRestore,
  Moon,
  Sun,
} from 'lucide-react';

export function Sidebar() {
  const [search, setSearch] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [suppliersCollapsed, setSuppliersCollapsed] = useState(false);
  const [archivedNotesExpanded, setArchivedNotesExpanded] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const addSupplier = useStore((s) => s.addSupplier);
  const deleteSupplier = useStore((s) => s.deleteSupplier);
  const linkSupplierToProject = useStore((s) => s.linkSupplierToProject);
  const unlinkSupplierFromProject = useStore((s) => s.unlinkSupplierFromProject);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const setActiveNote = useStore((s) => s.setActiveNote);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const toggleArchiveNote = useStore((s) => s.toggleArchiveNote);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const openConfirmDialog = useStore((s) => s.openConfirmDialog);
  const darkMode = useStore((s) => s.settings.darkMode);
  const updateSettings = useStore((s) => s.updateSettings);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const projectSuppliers = activeProjectId
    ? suppliers.filter((s) => s.projectIds.includes(activeProjectId))
    : [];

  const filtered = projectSuppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const unlinkableSuppliers = activeProjectId
    ? suppliers.filter((s) => !s.projectIds.includes(activeProjectId))
    : [];

  const isInternalTab = activeTabId === INTERNAL_TAB_ID;

  const allContextNotes = activeTabId && activeProjectId
    ? isInternalTab
      ? notes.filter((n) => n.internal && n.projectIds.includes(activeProjectId)).sort((a, b) => b.createdAt - a.createdAt)
      : notes.filter((n) => n.supplierIds.includes(activeTabId) && n.projectIds.includes(activeProjectId)).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  const activeNotes = allContextNotes.filter((n) => !n.archived);
  const archivedNotes = allContextNotes.filter((n) => n.archived);

  const internalNoteCount = activeProjectId
    ? notes.filter((n) => n.internal && !n.archived && n.projectIds.includes(activeProjectId)).length
    : 0;

  const activeSupplier = isInternalTab ? null : suppliers.find((s) => s.id === activeTabId);

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
      setProjectMenuOpen(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  function htmlPreview(html: string): string {
    const el = document.createElement('div');
    el.innerHTML = html;
    const text = el.textContent || '';
    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  }

  const ColorDot = ({ supplier }: { supplier: (typeof suppliers)[0] }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const updateSupplier = useStore((s) => s.updateSupplier);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
      <div ref={ref} className="relative flex-shrink-0">
        <button
          className="w-2 h-2 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all"
          style={{ backgroundColor: supplier.color }}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          title="Change color"
        />
        {open && (
          <div className="absolute left-0 top-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 w-[120px]">
            {SUPPLIER_COLORS.map((c) => (
              <button
                key={c}
                className="block w-4 h-4 rounded-full hover:scale-110 transition-transform"
                style={{ backgroundColor: c, outline: c === supplier.color ? '2px solid #374151' : 'none', outlineOffset: '2px' }}
                onClick={(e) => { e.stopPropagation(); updateSupplier(supplier.id, { color: c }); setOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const SupplierRow = ({ supplier }: { supplier: (typeof suppliers)[0] }) => (
    <div
      role="button"
      tabIndex={0}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group cursor-pointer ${
        activeTabId === supplier.id ? 'bg-gray-100 dark:bg-gray-800 font-medium' : ''
      }`}
      onClick={() => openTab(supplier.id)}
      onKeyDown={(e) => e.key === 'Enter' && openTab(supplier.id)}
      onContextMenu={(e) => handleContextMenu(e, supplier.id)}
    >
      <ColorDot supplier={supplier} />
      <span className="truncate flex-1">{supplier.name}</span>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          handleContextMenu(e, supplier.id);
        }}
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
      </button>
    </div>
  );

  return (
    <div className="w-60 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50/50 dark:bg-gray-900 h-full select-none flex-shrink-0">
      {/* Project selector */}
      <div className="p-3 pb-1 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-sm"
          >
            {activeProject ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeProject.color }} />
                <span className="truncate flex-1 font-medium text-left">{activeProject.name}</span>
              </>
            ) : (
              <>
                <FolderOpen className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-gray-400 dark:text-gray-500 flex-1 text-left">Select project…</span>
              </>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          </button>

          {projectMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setProjectMenuOpen(false); setAddingProject(false); }} />
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 max-h-[300px] overflow-y-auto">
                {projects.filter((p) => !p.archived).map((p) => (
                  <button
                    key={p.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      p.id === activeProjectId ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white' : ''
                    }`}
                    onClick={() => {
                      setActiveProject(p.id);
                      setProjectMenuOpen(false);
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate flex-1">{p.name}</span>
                  </button>
                ))}
                {projects.length === 0 && !addingProject && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">No projects yet</p>
                )}
                <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                  {addingProject ? (
                    <div className="px-2 py-1">
                      <input
                        ref={projectInputRef}
                        autoFocus
                        type="text"
                        placeholder="Project name…"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddProject();
                          if (e.key === 'Escape') { setAddingProject(false); setNewProjectName(''); }
                        }}
                        onBlur={() => { if (!newProjectName.trim()) { setAddingProject(false); setNewProjectName(''); } }}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-500 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingProject(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> New project
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Project actions row */}
        {activeProject && (
          <div className="flex items-center gap-1 mt-1.5 px-1">
            {editingProject ? (
              <input
                autoFocus
                type="text"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editProjectName.trim()) {
                    updateProject(activeProject.id, { name: editProjectName.trim() });
                    setEditingProject(false);
                  }
                  if (e.key === 'Escape') setEditingProject(false);
                }}
                onBlur={() => {
                  if (editProjectName.trim()) updateProject(activeProject.id, { name: editProjectName.trim() });
                  setEditingProject(false);
                }}
                className="flex-1 px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-100"
              />
            ) : (
              <>
                <button
                  onClick={() => { setEditProjectName(activeProject.name); setEditingProject(true); }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Rename project"
                >
                  <Settings className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    openConfirmDialog({
                      title: 'Delete project',
                      message: `Delete project "${activeProject.name}"? All notes, tasks, and decisions in this project will be removed.`,
                      confirmLabel: 'Delete',
                      onConfirm: () => deleteProject(activeProject.id),
                    });
                  }}
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 dark:text-gray-500 hover:text-red-500"
                  title="Delete project"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      {activeProjectId && (
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search suppliers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>
      )}

      {/* Suppliers */}
      <div className="flex-1 overflow-y-auto px-2">
        {activeProjectId ? (
          <>
            <div className="mb-1">
              <button
                className="flex items-center gap-1 px-1 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 w-full"
                onClick={() => setSuppliersCollapsed(!suppliersCollapsed)}
              >
                {suppliersCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Suppliers
              </button>

              {!suppliersCollapsed && (
                <div className="space-y-0.5">
                  {filtered.sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                    <SupplierRow key={s.id} supplier={s} />
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
                      {search ? 'No matches' : 'No suppliers in this project'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Internal workspace */}
            <button
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mt-1 ${
                isInternalTab ? 'bg-gray-100 dark:bg-gray-800 font-medium' : ''
              }`}
              onClick={() => openTab(INTERNAL_TAB_ID)}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-400 dark:bg-gray-600" />
              <span className="truncate flex-1 text-gray-600 dark:text-gray-400">Internal</span>
            </button>

            {/* Add supplier */}
            {addingSupplier ? (
              <div className="px-1 py-1">
                <input
                  ref={supplierInputRef}
                  autoFocus
                  type="text"
                  placeholder="Supplier name…"
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
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 dark:text-gray-100"
                />
              </div>
            ) : (
              <div className="space-y-0.5">
                <button
                  onClick={() => setAddingSupplier(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md w-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add supplier
                </button>
                {unlinkableSuppliers.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setLinkMenuOpen(!linkMenuOpen)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md w-full transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Link existing supplier
                    </button>
                    {linkMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setLinkMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] max-h-[200px] overflow-y-auto">
                          {unlinkableSuppliers.map((s) => (
                            <button
                              key={s.id}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                              onClick={() => {
                                linkSupplierToProject(s.id, activeProjectId);
                                setLinkMenuOpen(false);
                              }}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Notes for active supplier / internal */}
            {activeTabId && (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isInternalTab ? 'Internal Notes' : `Notes${activeSupplier ? ` — ${activeSupplier.name}` : ''}`}
                  </span>
                  <div className="flex items-center gap-1">
                      <button
                      onClick={() => isInternalTab ? addInternalNote() : addNote(activeTabId)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 dark:text-gray-500 hover:text-blue-600"
                      title="New blank note"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-0.5">
                  {activeNotes.map((n) => (
                    <div
                      key={n.id}
                      className={`group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                        activeNoteId === n.id ? 'bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/15' : ''
                      }`}
                      onClick={() => navigateToNote(n.id)}
                    >
                      <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate dark:text-gray-300">{n.title || 'Untitled'}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</div>
                        {n.content && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{htmlPreview(n.content)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          onClick={(e) => { e.stopPropagation(); toggleArchiveNote(n.id); }}
                          title="Archive note"
                        >
                          <Archive className="w-3 h-3 text-gray-400 hover:text-amber-500" />
                        </button>
                        <button
                          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConfirmDialog({
                              title: 'Delete note',
                              message: 'Delete this note and all its linked tasks and decisions?',
                              confirmLabel: 'Delete',
                              onConfirm: () => deleteNote(n.id),
                            });
                          }}
                          title="Delete note"
                        >
                          <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeNotes.length === 0 && archivedNotes.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">No notes yet. Create one above.</p>
                  )}
                  {activeNotes.length === 0 && archivedNotes.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">All notes are archived.</p>
                  )}
                </div>

                {/* Archived notes section */}
                {archivedNotes.length > 0 && (
                  <div className="mt-2">
                    <button
                      className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 w-full transition-colors"
                      onClick={() => setArchivedNotesExpanded((v) => !v)}
                    >
                      {archivedNotesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Archive className="w-3 h-3" />
                      {archivedNotes.length} archived
                    </button>
                    {archivedNotesExpanded && (
                      <div className="space-y-0.5">
                        {archivedNotes.map((n) => (
                          <div
                            key={n.id}
                            className={`group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors opacity-60 ${
                              activeNoteId === n.id ? 'bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/15 opacity-100' : ''
                            }`}
                            onClick={() => navigateToNote(n.id)}
                          >
                            <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate text-gray-500 dark:text-gray-400">{n.title || 'Untitled'}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</div>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                onClick={(e) => { e.stopPropagation(); toggleArchiveNote(n.id); }}
                                title="Unarchive note"
                              >
                                <ArchiveRestore className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                              </button>
                              <button
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                openConfirmDialog({
                                  title: 'Delete note',
                                  message: 'Delete this note and all its linked tasks and decisions?',
                                  confirmLabel: 'Delete',
                                  onConfirm: () => deleteNote(n.id),
                                });
                              }}
                              title="Delete note"
                              >
                                <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="px-3 py-8 text-center">
            <FolderOpen className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Select or create a project to get started</p>
          </div>
        )}
      </div>

      {/* Settings footer */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1">
        <button
          onClick={toggleSettings}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md flex-1 transition-colors"
          title="Settings (Ctrl+,)"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
        <button
          onClick={() => updateSettings({ darkMode: !darkMode })}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex-shrink-0"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const sup = suppliers.find((s) => s.id === contextMenu.id);
              if (!sup) return null;
              return (
                <>
                  {activeProjectId && (
                    <button
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center gap-2"
                      onClick={() => {
                        openConfirmDialog({
                          title: 'Remove from project',
                          message: `Remove "${sup.name}" from this project? Notes in this project for this supplier will be deleted.`,
                          confirmLabel: 'Remove',
                          onConfirm: () => unlinkSupplierFromProject(sup.id, activeProjectId),
                        });
                        setContextMenu(null);
                      }}
                    >
                      <Unlink className="w-3.5 h-3.5" /> Remove from project
                    </button>
                  )}
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
                      onClick={() => {
                        openConfirmDialog({
                          title: 'Delete supplier',
                          message: `Delete "${sup.name}" globally? This removes ALL notes, tasks, and decisions for this supplier across all projects.`,
                          confirmLabel: 'Delete',
                          onConfirm: () => deleteSupplier(sup.id),
                        });
                        setContextMenu(null);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete supplier
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
