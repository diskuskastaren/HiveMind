import { useEffect, useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from './store/store';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { NoteEditor } from './components/NoteEditor';
import { RightPanel } from './components/RightPanel';
import { FollowUpsPanel } from './components/FollowUpsPanel';
import { CommandPalette } from './components/CommandPalette';
import { TaskModal } from './components/TaskModal';
import { Dashboard } from './components/Dashboard';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { TeamsRecordingPrompt } from './components/TeamsRecordingPrompt';
import { ConfirmDialog } from './components/ConfirmDialog';
import { UpdateDialog } from './components/UpdateDialog';
import { FileText, Keyboard, FolderOpen, Pin, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { WelcomeScreen } from './components/WelcomeScreen';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EmptyState() {
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);

  if (!activeProjectId) {
    if (projects.length === 0) {
      return <WelcomeScreen />;
    }
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Supplier Meeting Notes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Select or create a project in the sidebar to get started.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Use the project dropdown in the sidebar, or press{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">Ctrl+K</kbd>
          </p>
        </div>
      </div>
    );
  }

  if (activeTabId && !activeNoteId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-400 dark:text-gray-500 mb-2">No notes yet</h2>
          <button
            onClick={() => activeTabId === INTERNAL_TAB_ID ? addInternalNote() : addNote(activeTabId)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Create first note
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            or press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">Ctrl+N</kbd>
          </p>
        </div>
      </div>
    );
  }

  return <DashboardOverview />;
}

function DashboardOverview() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const suppliers = useStore((s) => s.suppliers);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const followUps = useStore((s) => s.followUps);
  const openTab = useStore((s) => s.openTab);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const projectSuppliers = activeProjectId
    ? suppliers.filter((s) => s.projectIds.includes(activeProjectId))
    : suppliers;
  const projectNotes = activeProjectId
    ? notes.filter((n) => !n.archived && n.projectIds.includes(activeProjectId))
    : notes.filter((n) => !n.archived);
  const projectTasks = activeProjectId
    ? tasks.filter((t) => t.projectId === activeProjectId && t.status !== 'done')
    : tasks.filter((t) => t.status !== 'done');
  const projectFollowUps = activeProjectId
    ? followUps.filter((f) => f.projectId === activeProjectId && f.status === 'open')
    : followUps.filter((f) => f.status === 'open');

  const pinnedSuppliers = projectSuppliers.filter((s) => s.pinned);

  const supplierLastTouched = new Map<string, number>();
  for (const n of projectNotes) {
    for (const sid of n.supplierIds) {
      const prev = supplierLastTouched.get(sid) ?? 0;
      if (n.updatedAt > prev) supplierLastTouched.set(sid, n.updatedAt);
    }
  }

  const internalProjectNotes = projectNotes.filter((n) => n.internal);
  const internalLastTouched = internalProjectNotes.length > 0
    ? Math.max(...internalProjectNotes.map((n) => n.updatedAt))
    : null;

  type RecentItem =
    | { kind: 'supplier'; supplier: typeof projectSuppliers[0]; lastTouched: number; noteCount: number }
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Select a supplier</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Choose a supplier from the sidebar or pick up where you left off.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Suppliers', value: projectSuppliers.length },
            { label: 'Notes', value: projectNotes.length },
            { label: 'Open tasks', value: projectTasks.length },
            { label: 'Follow-ups', value: projectFollowUps.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Pinned suppliers */}
        {pinnedSuppliers.length > 0 && (
          <section className="mb-7">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Pin className="w-3 h-3" /> Pinned
            </h2>
            <div className="flex flex-wrap gap-2">
              {pinnedSuppliers.map((sup) => (
                <button
                  key={sup.id}
                  onClick={() => openTab(sup.id)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sup.color }} />
                  {sup.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recently active */}
        {recentItems.length > 0 && (
          <section className="mb-7">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Recently active
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {recentItems.map((item) => {
                if (item.kind === 'internal') {
                  return (
                    <button
                      key="internal"
                      onClick={() => openTab(INTERNAL_TAB_ID)}
                      className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-left hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 bg-gray-400 dark:bg-gray-600">
                        I
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-gray-100">Internal</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'} · {formatRelativeTime(item.lastTouched)}
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={item.supplier.id}
                    onClick={() => openTab(item.supplier.id)}
                    className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-left hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: item.supplier.color }}
                    >
                      {item.supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-gray-100">{item.supplier.name}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'} · {formatRelativeTime(item.lastTouched)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent notes */}
        {recentNotes.length > 0 && (
          <section className="mb-7">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Recent notes
            </h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
              {recentNotes.map((note) => {
                const sup = note.internal
                  ? null
                  : suppliers.find((s) => note.supplierIds.includes(s.id));
                return (
                  <button
                    key={note.id}
                    onClick={() => navigateToNote(note.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                  >
                    {sup ? (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sup.color }}
                      />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-gray-600 dark:text-gray-400 truncate group-hover:text-gray-800 dark:group-hover:text-gray-200">
                      {note.title || <span className="italic text-gray-400 dark:text-gray-500">Untitled</span>}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{sup?.name ?? 'Internal'}</span>
                    <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0 ml-2">{formatRelativeTime(note.updatedAt)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Keyboard shortcuts — collapsed by default */}
        <section>
          <button
            onClick={() => setShortcutsOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5" />
            Keyboard shortcuts
            {shortcutsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {shortcutsOpen && (
            <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                {[
                  ['Ctrl+K', 'Command palette'],
                  ['Ctrl+N', 'New note'],
                  ['Ctrl+Shift+F', 'Global search'],
                  ['Ctrl+]', 'Toggle right panel'],
                  ['Ctrl+1-9', 'Switch to tab'],
                  ['Ctrl+W', 'Close tab'],
                  ['Alt+T/D/F', 'Task / Decision / Follow-up from selection'],
                  ['Tab / Shift+Tab', 'Indent / Outdent in lists'],
                  ['Escape', 'Close overlay'],
                ].map(([key, desc]) => (
                  <div key={key} className="contents">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-600 dark:text-gray-300 font-mono w-fit">
                      {key}
                    </kbd>
                    <span className="text-gray-500 dark:text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

export default function App() {
  const activeNoteId = useStore((s) => s.activeNoteId);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const editingTaskId = useStore((s) => s.editingTaskId);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeView = useStore((s) => s.activeView);
  const transcriptRecording = useStore((s) => s.transcriptRecording);
  const teamsEnabled = useStore((s) => s.settings.teamsEnabled);
  const teamsPromptOpen = useStore((s) => s.teamsPromptOpen);
  const darkMode = useStore((s) => s.settings.darkMode);

  useEffect(() => {
    document.documentElement.classList.add('no-transition');
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.offsetHeight;
    document.documentElement.classList.remove('no-transition');
  }, [darkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (s.editingTaskId) { s.setEditingTask(null); return; }
        if (s.settingsOpen) { s.toggleSettings(); return; }
        if (s.commandPaletteOpen) { s.toggleCommandPalette(); return; }
        if (s.searchOpen) { s.toggleSearch(); return; }
        if (s.activeView === 'tasks' || s.activeView === 'dashboard') { s.setActiveView('notes'); return; }
        return;
      }

      if (ctrl && e.key === ',') {
        e.preventDefault();
        s.toggleSettings();
        return;
      }

      if (ctrl && e.key === 'k') {
        e.preventDefault();
        s.toggleCommandPalette();
        return;
      }

      if (ctrl && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        s.toggleSearch();
        return;
      }

      if (ctrl && e.key === 'n') {
        e.preventDefault();
        if (s.activeTabId) {
          if (s.activeTabId === INTERNAL_TAB_ID) s.addInternalNote();
          else s.addNote(s.activeTabId);
        }
        return;
      }

      if (ctrl && e.key === ']') {
        e.preventDefault();
        s.toggleRightPanel();
        return;
      }

      if ((e.altKey || ctrl) && e.key === 'w') {
        e.preventDefault();
        if (s.activeTabId) s.closeTab(s.activeTabId);
        return;
      }

      if (ctrl && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (s.openTabs[idx]) s.setActiveTab(s.openTabs[idx]);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handler = () => {
      alert('Storage limit reached. Please export a backup (Ctrl+K → Backup) to avoid data loss.');
    };
    window.addEventListener('storage-error', handler);
    return () => window.removeEventListener('storage-error', handler);
  }, []);

  // When the overlay's "Start Recording" is clicked, show the recording
  // destination prompt as a modal so the user can choose which note to use.
  useEffect(() => {
    if (!teamsEnabled) return;
    const electronTeams = (window as any).electronTeams;
    if (!electronTeams) return;

    const onJoined = () => {
      // #region agent log
      const s = useStore.getState();
      try { (window as any).electronDebug?.log({sessionId:'6cf3ea',location:'App.tsx:onJoined',message:'teams:meeting-joined fired',data:{transcriptRecording:s.transcriptRecording,teamsPromptOpen:s.teamsPromptOpen,activeNoteId:s.activeNoteId,activeTabId:s.activeTabId},timestamp:Date.now(),hypothesisId:'H-RENDERER'}); } catch {}
      // #endregion
      if (!s.transcriptRecording) s.setTeamsPromptOpen(true);
    };

    electronTeams.onMeetingJoined(onJoined);
    return () => electronTeams.offMeetingJoined(onJoined);
  }, [teamsEnabled]);

  return (
    <div className="h-full flex overflow-hidden bg-white dark:bg-gray-900">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TabBar />
        <div className={(activeView === 'tasks' || activeView === 'dashboard') ? 'hidden' : 'flex-1 flex flex-col overflow-hidden min-h-0'}>
          <div className="flex flex-1 overflow-hidden min-h-0">
            <div className="flex-1 overflow-hidden relative">
              {activeNoteId ? <NoteEditor /> : <EmptyState />}
            </div>
              {/* Always mounted when a tab is open (or recording is active) so the hook
                  survives panel toggles and project switches mid-recording */}
              {(activeTabId || transcriptRecording) && (
                <div className={!rightPanelOpen ? 'hidden' : ''}>
                  <RightPanel />
                </div>
              )}
          </div>
          <FollowUpsPanel />
        </div>
        {activeView === 'tasks' && <Dashboard />}
        {activeView === 'dashboard' && <DashboardOverview />}
      </div>

      {commandPaletteOpen && <CommandPalette />}
      {searchOpen && <SearchModal />}
      {settingsOpen && <SettingsModal />}
      {editingTaskId && <TaskModal />}
      {teamsPromptOpen && <TeamsRecordingPrompt />}
      <ConfirmDialog />
      <UpdateDialog />
    </div>
  );
}
