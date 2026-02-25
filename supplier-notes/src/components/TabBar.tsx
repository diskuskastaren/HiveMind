import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { LayoutDashboard, FileText, ChevronRight, ArrowLeft, Search } from 'lucide-react';

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

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeSupplier = activeTabId && activeTabId !== INTERNAL_TAB_ID
    ? suppliers.find((s) => s.id === activeTabId)
    : null;
  const isInternal = activeTabId === INTERNAL_TAB_ID;

  const showBackButton = activeView === 'notes' && previousView === 'dashboard';

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-3 py-1.5 flex-shrink-0 h-10">
      {/* Left: back button or breadcrumb */}
      {showBackButton ? (
        <button
          onClick={goBackToPreviousView}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
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
            <span className="text-gray-400 italic">No project</span>
          )}

          {(activeSupplier || isInternal) && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
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
                <span className="text-gray-400">Internal</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Right: search + view toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={toggleSearch}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          title="Search (Ctrl+Shift+F)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setActiveView('notes')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'notes'
                ? 'bg-gray-100 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Notes view"
          >
            <FileText className="w-3.5 h-3.5" />
            Notes
          </button>
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'dashboard'
                ? 'bg-gray-100 text-gray-800'
                : 'text-gray-500 hover:text-gray-700'
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
