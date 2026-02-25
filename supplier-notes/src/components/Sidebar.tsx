import { useState, useRef } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import { TEMPLATE_OPTIONS } from '../utils/templates';
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  CalendarPlus,
  Layout,
  FolderOpen,
  Link2,
  Unlink,
  Settings,
  Archive,
  ArchiveRestore,
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
  const togglePinSupplier = useStore((s) => s.togglePinSupplier);
  const setSupplierTemplate = useStore((s) => s.setSupplierTemplate);
  const linkSupplierToProject = useStore((s) => s.linkSupplierToProject);
  const unlinkSupplierFromProject = useStore((s) => s.unlinkSupplierFromProject);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const setActiveNote = useStore((s) => s.setActiveNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const toggleArchiveNote = useStore((s) => s.toggleArchiveNote);
  const setNextMeetingPrepSupplier = useStore((s) => s.setNextMeetingPrepSupplier);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const projectSuppliers = activeProjectId
    ? suppliers.filter((s) => s.projectIds.includes(activeProjectId))
    : [];

  const filtered = projectSuppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const pinned = filtered.filter((s) => s.pinned).sort((a, b) => a.name.localeCompare(b.name));
  const unpinned = filtered.filter((s) => !s.pinned).sort((a, b) => a.name.localeCompare(b.name));

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

  const SupplierRow = ({ supplier }: { supplier: (typeof suppliers)[0] }) => (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 transition-colors group ${
        activeTabId === supplier.id ? 'bg-gray-100 font-medium' : ''
      }`}
      onClick={() => openTab(supplier.id)}
      onContextMenu={(e) => handleContextMenu(e, supplier.id)}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: supplier.color }} />
      <span className="truncate flex-1">{supplier.name}</span>
      {supplier.pinned && <Pin className="w-3 h-3 text-gray-400 flex-shrink-0" />}
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          handleContextMenu(e, supplier.id);
        }}
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-gray-400" />
      </button>
    </button>
  );

  return (
    <div className="w-60 border-r border-gray-200 flex flex-col bg-gray-50/50 h-full select-none flex-shrink-0">
      {/* Project selector */}
      <div className="p-3 pb-1 border-b border-gray-200">
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 transition-colors text-sm"
          >
            {activeProject ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activeProject.color }} />
                <span className="truncate flex-1 font-medium text-left">{activeProject.name}</span>
              </>
            ) : (
              <>
                <FolderOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-400 flex-1 text-left">Select project…</span>
              </>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          </button>

          {projectMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setProjectMenuOpen(false); setAddingProject(false); }} />
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 max-h-[300px] overflow-y-auto">
                {projects.filter((p) => !p.archived).map((p) => (
                  <button
                    key={p.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                      p.id === activeProjectId ? 'bg-blue-50 text-blue-700' : ''
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
                  <p className="text-xs text-gray-400 px-3 py-2">No projects yet</p>
                )}
                <div className="border-t border-gray-100 mt-1 pt-1">
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
                        className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingProject(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
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
                className="flex-1 px-2 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <>
                <button
                  onClick={() => { setEditProjectName(activeProject.name); setEditingProject(true); }}
                  className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
                  title="Rename project"
                >
                  <Settings className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete project "${activeProject.name}"? All notes, tasks, and decisions in this project will be removed.`)) {
                      deleteProject(activeProject.id);
                    }
                  }}
                  className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search suppliers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                className="flex items-center gap-1 px-1 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 w-full"
                onClick={() => setSuppliersCollapsed(!suppliersCollapsed)}
              >
                {suppliersCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Suppliers
              </button>

              {!suppliersCollapsed && (
                <div className="space-y-0.5">
                  {pinned.map((s) => (
                    <SupplierRow key={s.id} supplier={s} />
                  ))}
                  {pinned.length > 0 && unpinned.length > 0 && <div className="border-t border-gray-200 my-1" />}
                  {unpinned.map((s) => (
                    <SupplierRow key={s.id} supplier={s} />
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">
                      {search ? 'No matches' : 'No suppliers in this project'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Internal workspace */}
            <button
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 transition-colors mt-1 ${
                isInternalTab ? 'bg-gray-100 font-medium' : ''
              }`}
              onClick={() => openTab(INTERNAL_TAB_ID)}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-400" />
              <span className="truncate flex-1 text-gray-600">Internal</span>
              {internalNoteCount > 0 && (
                <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 flex-shrink-0">
                  {internalNoteCount}
                </span>
              )}
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
                  className="w-full px-3 py-1.5 text-sm bg-white border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="space-y-0.5">
                <button
                  onClick={() => setAddingSupplier(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md w-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add supplier
                </button>
                {unlinkableSuppliers.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setLinkMenuOpen(!linkMenuOpen)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md w-full transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Link existing supplier
                    </button>
                    {linkMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setLinkMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px] max-h-[200px] overflow-y-auto">
                          {unlinkableSuppliers.map((s) => (
                            <button
                              key={s.id}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
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
              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isInternalTab ? 'Internal Notes' : `Notes${activeSupplier ? ` — ${activeSupplier.name}` : ''}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isInternalTab && (
                      <button
                        onClick={() => setNextMeetingPrepSupplier(activeTabId)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
                        title="Next meeting prep"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isInternalTab && (
                      <button
                        onClick={() => addNote(activeTabId, true)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
                        title="New note (with template)"
                      >
                        <Layout className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => isInternalTab ? addInternalNote() : addNote(activeTabId)}
                      className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
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
                      className={`group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 transition-colors ${
                        activeNoteId === n.id ? 'bg-blue-50 border border-blue-100' : ''
                      }`}
                      onClick={() => setActiveNote(n.id)}
                    >
                      <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{n.title || 'Untitled'}</div>
                        <div className="text-xs text-gray-400">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</div>
                        {n.content && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{htmlPreview(n.content)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          className="p-0.5 hover:bg-gray-200 rounded"
                          onClick={(e) => { e.stopPropagation(); toggleArchiveNote(n.id); }}
                          title="Archive note"
                        >
                          <Archive className="w-3 h-3 text-gray-400 hover:text-amber-500" />
                        </button>
                        <button
                          className="p-0.5 hover:bg-gray-200 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this note and all its linked tasks and decisions?')) deleteNote(n.id);
                          }}
                          title="Delete note"
                        >
                          <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeNotes.length === 0 && archivedNotes.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">No notes yet. Create one above.</p>
                  )}
                  {activeNotes.length === 0 && archivedNotes.length > 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">All notes are archived.</p>
                  )}
                </div>

                {/* Archived notes section */}
                {archivedNotes.length > 0 && (
                  <div className="mt-2">
                    <button
                      className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-gray-400 hover:text-gray-600 w-full transition-colors"
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
                            className={`group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 transition-colors opacity-60 ${
                              activeNoteId === n.id ? 'bg-blue-50 border border-blue-100 opacity-100' : ''
                            }`}
                            onClick={() => setActiveNote(n.id)}
                          >
                            <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate text-gray-500">{n.title || 'Untitled'}</div>
                              <div className="text-xs text-gray-400">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</div>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button
                                className="p-0.5 hover:bg-gray-200 rounded"
                                onClick={(e) => { e.stopPropagation(); toggleArchiveNote(n.id); }}
                                title="Unarchive note"
                              >
                                <ArchiveRestore className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                              </button>
                              <button
                                className="p-0.5 hover:bg-gray-200 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Delete this note and all its linked tasks and decisions?')) deleteNote(n.id);
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
            <FolderOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Select or create a project to get started</p>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const sup = suppliers.find((s) => s.id === contextMenu.id);
              if (!sup) return null;
              return (
                <>
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                    onClick={() => {
                      togglePinSupplier(sup.id);
                      setContextMenu(null);
                    }}
                  >
                    {sup.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    {sup.pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 py-1 text-xs text-gray-400">Default template</div>
                  <button
                    className={`w-full px-3 py-1 text-sm text-left hover:bg-gray-100 ${!sup.defaultTemplate ? 'font-medium text-blue-600' : ''}`}
                    onClick={() => {
                      setSupplierTemplate(sup.id, null);
                      setContextMenu(null);
                    }}
                  >
                    None
                  </button>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <button
                      key={t.key}
                      className={`w-full px-3 py-1 text-sm text-left hover:bg-gray-100 ${sup.defaultTemplate === t.key ? 'font-medium text-blue-600' : ''}`}
                      onClick={() => {
                        setSupplierTemplate(sup.id, t.key);
                        setContextMenu(null);
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 my-1" />
                  {activeProjectId && (
                    <button
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-orange-50 text-orange-600 flex items-center gap-2"
                      onClick={() => {
                        if (confirm(`Remove "${sup.name}" from this project? Notes in this project for this supplier will be deleted.`)) {
                          unlinkSupplierFromProject(sup.id, activeProjectId);
                        }
                        setContextMenu(null);
                      }}
                    >
                      <Unlink className="w-3.5 h-3.5" /> Remove from project
                    </button>
                  )}
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                    onClick={() => {
                      if (confirm(`Delete "${sup.name}" globally? This removes ALL notes, tasks, and decisions for this supplier across all projects.`)) {
                        deleteSupplier(sup.id);
                      }
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
