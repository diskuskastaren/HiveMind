import { useEffect, useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from './store/store';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { NoteEditor } from './components/NoteEditor';
import { RightPanel } from './components/RightPanel';
import { CommandPalette } from './components/CommandPalette';
import { TaskModal } from './components/TaskModal';
import { Dashboard } from './components/Dashboard';
import { Overview } from './components/Overview';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';
import { TeamsRecordingPrompt } from './components/TeamsRecordingPrompt';
import { ConfirmDialog } from './components/ConfirmDialog';
import { UpdateDialog } from './components/UpdateDialog';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RecoveryScreen } from './components/RecoveryScreen';
import { FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Kbd } from '@/components/ui/kbd';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TEMPLATES } from './utils/templates';

function EmptyState() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const suppliers = useStore((s) => s.suppliers);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);

  if (!activeProjectId) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-brand-soft text-primary">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>Choose a project</EmptyTitle>
          <EmptyDescription>Pick one from the switcher at the top of the sidebar.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={toggleCommandPalette}>
            Open command palette <Kbd>Ctrl K</Kbd>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (activeTabId) {
    const supplier = activeTabId === INTERNAL_TAB_ID ? null : suppliers.find((s) => s.id === activeTabId);
    const name = supplier?.name ?? 'Internal';
    const template = supplier?.defaultTemplate ? TEMPLATES[supplier.defaultTemplate]?.name : null;
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No notes for {name} yet</EmptyTitle>
          <EmptyDescription>
            {template ? `New notes start from ${name}’s default template: ${template}.` : 'Create a note to start capturing the meeting.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => (activeTabId === INTERNAL_TAB_ID ? addInternalNote() : addNote(activeTabId))}>
            Create first note <Kbd className="bg-primary-foreground/15 text-primary-foreground">Ctrl N</Kbd>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <Overview />;
}

export default function App() {
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const projects = useStore((s) => s.projects);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const editingTaskId = useStore((s) => s.editingTaskId);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeView = useStore((s) => s.activeView);
  const transcriptRecording = useStore((s) => s.transcriptRecording);
  const teamsEnabled = useStore((s) => s.settings.teamsEnabled);
  const teamsPromptOpen = useStore((s) => s.teamsPromptOpen);
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    document.documentElement.classList.add('no-transition');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.offsetHeight;
    document.documentElement.classList.remove('no-transition');
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        // Dialogs, menus and popovers close themselves (and mark the event handled)
        if (e.defaultPrevented) return;
        const overlayOpen =
          s.editingTaskId || s.helpOpen || s.settingsOpen || s.commandPaletteOpen || s.searchOpen || s.teamsPromptOpen || s.confirmDialog;
        if (overlayOpen) return;
        if (s.activeView === 'tasks' || s.activeView === 'dashboard') s.setActiveView('notes');
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
          s.setActiveView('notes');
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
    const handler = (event: Event) => {
      toast.error('Could not save data', {
        description: (event as CustomEvent<string>).detail || 'Open Settings → Data to restore a backup.',
        duration: Infinity,
      });
      (window as any).electronStore?.status?.().then((status: { error?: string }) => {
        if (status.error) setRecoveryError(status.error);
      }).catch(() => {});
    };
    let lastBackupError = '';
    let lastAttachmentWarning = '';
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ backupError?: string; attachmentWarning?: string }>).detail;
      const error = detail?.backupError;
      if (error && error !== lastBackupError) toast.error('Automatic backup failed', { description: error, duration: Infinity });
      lastBackupError = error || '';
      const warning = detail?.attachmentWarning;
      if (warning && warning !== lastAttachmentWarning) toast.warning('Some attachments are not in the backup', { description: warning, duration: Infinity });
      lastAttachmentWarning = warning || '';
    };
    window.addEventListener('storage-error', handler);
    window.addEventListener('storage-status', onStatus);
    const checkRecovery = () => (window as any).electronStore?.status?.().then((status: { error?: string }) => {
      if (status.error) setRecoveryError(status.error);
    }).catch(() => {});
    checkRecovery();
    const offHydration = useStore.persist.onFinishHydration(checkRecovery);
    return () => {
      window.removeEventListener('storage-error', handler);
      window.removeEventListener('storage-status', onStatus);
      offHydration();
    };
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

  const overlays = (
    <>
      {commandPaletteOpen && <CommandPalette />}
      {searchOpen && <SearchModal />}
      {settingsOpen && <SettingsModal />}
      {helpOpen && <HelpModal />}
      {editingTaskId && <TaskModal />}
      {teamsPromptOpen && <TeamsRecordingPrompt />}
      <ConfirmDialog />
      <UpdateDialog />
      <Toaster position="bottom-right" />
    </>
  );

  if (recoveryError) return <RecoveryScreen error={recoveryError} />;

  // First run: no sidebar until there is a project to put things in
  if (projects.length === 0) {
    return (
      <TooltipProvider delayDuration={400}>
        <WelcomeScreen />
        {overlays}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full overflow-hidden bg-background text-foreground">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar />
          <div className={activeView === 'notes' ? 'flex min-h-0 flex-1 overflow-hidden' : 'hidden'}>
            <div className="relative min-w-0 flex-1 overflow-hidden">{activeNoteId ? <NoteEditor /> : <EmptyState />}</div>
            {/* Always mounted when a supplier is open (or recording is active) so the
                transcription hook survives panel toggles and project switches mid-recording */}
            {(activeTabId || transcriptRecording) && (
              <div className={rightPanelOpen ? 'flex' : 'hidden'}>
                <RightPanel />
              </div>
            )}
          </div>
          {activeView === 'tasks' && <Dashboard />}
          {activeView === 'dashboard' && <Overview />}
        </main>

        {overlays}
      </div>
    </TooltipProvider>
  );
}
