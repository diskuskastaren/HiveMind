import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { X } from 'lucide-react';

export function TabBar() {
  const openTabs = useStore((s) => s.openTabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const suppliers = useStore((s) => s.suppliers);
  const projects = useStore((s) => s.projects);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-gray-200 bg-gray-50/80 overflow-x-auto flex-shrink-0">
      {activeProject && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-r border-gray-200 flex-shrink-0">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color }} />
          <span className="text-xs font-medium text-gray-500">{activeProject.name}</span>
        </div>
      )}
      {openTabs.map((tabId, idx) => {
        const isActive = tabId === activeTabId;

        if (tabId === INTERNAL_TAB_ID) {
          return (
            <div
              key={tabId}
              className={`group flex items-center gap-1.5 px-4 py-2 cursor-pointer border-r border-gray-200 min-w-0 max-w-[200px] transition-colors ${
                isActive
                  ? 'bg-white border-b-2 -mb-px relative z-10'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
              style={isActive ? { borderBottomColor: '#6366f1' } : undefined}
              onClick={() => setActiveTab(tabId)}
              title={`Internal (Ctrl+${idx + 1})`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-400" />
              <span className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}>Internal</span>
              <button
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded-sm transition-opacity flex-shrink-0 ml-1"
                onClick={(e) => { e.stopPropagation(); closeTab(tabId); }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        }

        const supplier = suppliers.find((s) => s.id === tabId);
        if (!supplier) return null;

        return (
          <div
            key={tabId}
            className={`group flex items-center gap-1.5 px-4 py-2 cursor-pointer border-r border-gray-200 min-w-0 max-w-[200px] transition-colors ${
              isActive
                ? 'bg-white border-b-2 border-b-transparent -mb-px relative z-10'
                : 'hover:bg-gray-100 text-gray-500'
            }`}
            style={isActive ? { borderBottomColor: supplier.color } : undefined}
            onClick={() => setActiveTab(tabId)}
            title={`${supplier.name} (Ctrl+${idx + 1})`}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: supplier.color }}
            />
            <span className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}>{supplier.name}</span>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded-sm transition-opacity flex-shrink-0 ml-1"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tabId);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
