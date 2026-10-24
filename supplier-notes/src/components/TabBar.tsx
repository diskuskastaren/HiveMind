import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { ArrowLeft, ChevronRight, PanelRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ColorDot, IconButton } from './common';

const VIEW_LABEL = { dashboard: 'Overview', tasks: 'Follow-up', notes: 'Notes' } as const;

/** Top bar of the main area: breadcrumb, recording status and view-level actions. */
export function TabBar() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const suppliers = useStore((s) => s.suppliers);
  const projects = useStore((s) => s.projects);
  const notes = useStore((s) => s.notes);
  const activeView = useStore((s) => s.activeView);
  const previousView = useStore((s) => s.previousView);
  const goBackToPreviousView = useStore((s) => s.goBackToPreviousView);
  const toggleSearch = useStore((s) => s.toggleSearch);
  const transcriptRecording = useStore((s) => s.transcriptRecording);
  const recordingNoteId = useStore((s) => s.recordingNoteId);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);

  const handleJumpToRecording = () => {
    if (!recordingNoteId) return;
    navigateToNote(recordingNoteId);
    setRightPanelTab('transcript');
    if (!rightPanelOpen) toggleRightPanel();
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeSupplier = activeTabId && activeTabId !== INTERNAL_TAB_ID ? suppliers.find((s) => s.id === activeTabId) : null;
  const isInternal = activeTabId === INTERNAL_TAB_ID;
  const activeNote = notes.find((n) => n.id === activeNoteId);
  const showBackButton = activeView === 'notes' && (previousView === 'dashboard' || previousView === 'tasks');

  const crumbSep = <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-ui text-muted-foreground">
        {showBackButton && previousView && (
          <>
            <Button variant="ghost" size="xs" onClick={goBackToPreviousView} className="-ml-1.5 text-subtle-foreground">
              <ArrowLeft />
              {VIEW_LABEL[previousView]}
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        {activeProject ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <ColorDot color={activeProject.color} />
            <span className="max-w-40 truncate">{activeProject.name}</span>
          </span>
        ) : (
          <span className="italic">No project</span>
        )}
        {activeView !== 'notes' ? (
          <>
            {crumbSep}
            <span className="font-medium text-foreground">{VIEW_LABEL[activeView]}</span>
          </>
        ) : (
          (activeSupplier || isInternal) && (
            <>
              {crumbSep}
              <span className="flex min-w-0 items-center gap-1.5">
                {activeSupplier && <ColorDot color={activeSupplier.color} />}
                <span className="max-w-40 truncate">{activeSupplier ? activeSupplier.name : 'Internal'}</span>
              </span>
              {activeNote && (
                <>
                  {crumbSep}
                  <span className="truncate font-medium text-foreground">{activeNote.title || 'Untitled'}</span>
                </>
              )}
            </>
          )
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        {transcriptRecording && recordingNoteId && (
          <button
            type="button"
            onClick={handleJumpToRecording}
            title="Active recording — click to return to the note"
            className="mr-1 flex h-7 items-center gap-2 rounded-full bg-recording-soft px-2.5 text-xs font-medium text-recording transition-opacity hover:opacity-80"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-recording" />
            Recording
          </button>
        )}
        <IconButton label="Search everything" shortcut="Ctrl Shift F" onClick={toggleSearch}>
          <Search />
        </IconButton>
        {activeView === 'notes' && activeTabId && (
          <IconButton
            label="Toggle side panel"
            shortcut="Ctrl ]"
            onClick={toggleRightPanel}
            aria-pressed={rightPanelOpen}
            className={cn(rightPanelOpen && 'bg-accent text-foreground')}
          >
            <PanelRight />
          </IconButton>
        )}
      </div>
    </header>
  );
}
