import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { LayoutDashboard, FileText, ChevronRight, ArrowLeft, Search, CheckCircle2 } from 'lucide-react';

export function TabBar() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const suppliers = useStore((s) => s.suppliers);
  const projects = useStore((s) => s.projects);
  const activeView = useStore((s) => s.activeView);
  const previousView = useStore((s) => s.previousView);
  const setActiveView = useStore((s) => s.setActiveView);
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
  const activeSupplier = activeTabId && activeTabId !== INTERNAL_TAB_ID
    ? suppliers.find((s) => s.id === activeTabId)
    : null;
  const isInternal = activeTabId === INTERNAL_TAB_ID;

  const showBackButton = activeView === 'notes' && (previousView === 'dashboard' || previousView === 'tasks');

  return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900 px-3 py-1.5 flex-shrink-0 h-10">
      {/* Left: back button or breadcrumb */}
      {showBackButton ? (
        <button
          onClick={goBackToPreviousView}
          className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
          {activeProject ? (
            <>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: activeProject.color }}
              />
              <span className="font-medium truncate max-w-[120px]" title={activeProject.name}>
                {activeProject.name}
              </span>
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 italic">No project</span>
          )}

          {(activeSupplier || isInternal) && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              {activeSupplier ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeSupplier.color }}
                  />
                  <span className="truncate max-w-[120px]" title={activeSupplier.name}>
                    {activeSupplier.name}
                  </span>
                </>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">Internal</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Right: recording indicator + search + view toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {transcriptRecording && recordingNoteId && (
          <button
            onClick={handleJumpToRecording}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors"
            title="Active recording — click to return to note"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            Recording
          </button>
        )}
        <button
          onClick={toggleSearch}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          title="Search (Ctrl+Shift+F)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => setActiveView('notes')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'notes'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            title="Notes view"
          >
            <FileText className="w-3.5 h-3.5" />
            Notes
          </button>
          <button
            onClick={() => setActiveView('tasks')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'tasks'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            title="Tasks view"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Tasks
          </button>
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'dashboard'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
            title="Dashboard view"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
