import { useEffect } from 'react';
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
import { FileText, Keyboard, FolderOpen } from 'lucide-react';
import { WelcomeScreen } from './components/WelcomeScreen';

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
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Supplier Meeting Notes</h1>
          <p className="text-sm text-gray-500 mb-8">
            Select or create a project in the sidebar to get started.
          </p>
          <p className="text-xs text-gray-400">
            Use the project dropdown in the sidebar, or press{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Ctrl+K</kbd>
          </p>
        </div>
      </div>
    );
  }

  if (activeTabId && !activeNoteId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-400 mb-2">No notes yet</h2>
          <button
            onClick={() => activeTabId === INTERNAL_TAB_ID ? addInternalNote() : addNote(activeTabId)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Create first note
          </button>
          <p className="text-xs text-gray-400 mt-3">
            or press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">Ctrl+N</kbd>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-8 h-8 text-blue-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Select a supplier</h1>
        <p className="text-sm text-gray-500 mb-8">
          Choose a supplier from the sidebar to view or create meeting notes.
        </p>

        <div className="bg-gray-50 rounded-xl p-4 text-left">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Keyboard className="w-3.5 h-3.5" /> Keyboard shortcuts
          </h3>
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
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600 font-mono w-fit">
                  {key}
                </kbd>
                <span className="text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (s.editingTaskId) { s.setEditingTask(null); return; }
        if (s.settingsOpen) { s.toggleSettings(); return; }
        if (s.commandPaletteOpen) { s.toggleCommandPalette(); return; }
        if (s.searchOpen) { s.toggleSearch(); return; }
        if (s.activeView === 'dashboard') { s.setActiveView('notes'); return; }
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
      const s = useStore.getState();
      if (!s.transcriptRecording) s.setTeamsPromptOpen(true);
    };

    electronTeams.onMeetingJoined(onJoined);
    return () => electronTeams.offMeetingJoined(onJoined);
  }, [teamsEnabled]);

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TabBar />
        <div className={activeView === 'dashboard' ? 'hidden' : 'flex-1 flex flex-col overflow-hidden min-h-0'}>
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
        {activeView === 'dashboard' && <Dashboard />}
      </div>

      {commandPaletteOpen && <CommandPalette />}
      {searchOpen && <SearchModal />}
      {settingsOpen && <SettingsModal />}
      {editingTaskId && <TaskModal />}
      {teamsPromptOpen && <TeamsRecordingPrompt />}
    </div>
  );
}
