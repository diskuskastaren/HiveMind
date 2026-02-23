import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import {
  Search,
  FileText,
  Plus,
  ArrowRightLeft,
  PanelRight,
  Download,
  Columns3,
  CalendarPlus,
  ClipboardList,
  FolderOpen,
} from 'lucide-react';
import { exportAllData } from '../utils/export';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const toggleSearch = useStore((s) => s.toggleSearch);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const addProject = useStore((s) => s.addProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const toggleKanban = useStore((s) => s.toggleKanban);
  const setNextMeetingPrepSupplier = useStore((s) => s.setNextMeetingPrepSupplier);
  const getExportData = useStore((s) => s.getExportData);
  const importData = useStore((s) => s.importData);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    projects.filter((p) => !p.archived).forEach((p) => {
      cmds.push({
        id: `project-${p.id}`,
        label: p.name,
        description: 'Switch to project',
        icon: <FolderOpen className="w-4 h-4" />,
        action: () => {
          setActiveProject(p.id);
          toggleCommandPalette();
        },
        keywords: `switch project ${p.name}`,
      });
    });

    cmds.push({
      id: 'new-project',
      label: 'New project',
      description: 'Create a new project',
      icon: <Plus className="w-4 h-4" />,
      action: () => {
        const name = prompt('Project name:');
        if (name?.trim()) addProject(name.trim());
        toggleCommandPalette();
      },
      keywords: 'new project create',
    });

    const projectSuppliers = activeProjectId
      ? suppliers.filter((s) => s.projectIds.includes(activeProjectId))
      : suppliers;

    if (activeProjectId) {
      cmds.push({
        id: 'open-internal',
        label: 'Internal workspace',
        description: 'Notes & tasks not linked to any supplier',
        icon: <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />,
        action: () => {
          openTab(INTERNAL_TAB_ID);
          toggleCommandPalette();
        },
        keywords: 'internal workspace notes tasks',
      });
    }

    projectSuppliers.forEach((s) => {
      cmds.push({
        id: `switch-${s.id}`,
        label: s.name,
        description: 'Switch to supplier',
        icon: <ArrowRightLeft className="w-4 h-4" />,
        action: () => {
          openTab(s.id);
          toggleCommandPalette();
        },
        keywords: `switch supplier ${s.name}`,
      });
    });

    if (activeTabId) {
      cmds.push({
        id: 'new-note',
        label: 'New note',
        description: activeTabId === INTERNAL_TAB_ID ? 'Create a blank internal note' : 'Create a blank note',
        icon: <Plus className="w-4 h-4" />,
        action: () => {
          if (activeTabId === INTERNAL_TAB_ID) {
            addInternalNote();
          } else {
            addNote(activeTabId);
          }
          toggleCommandPalette();
        },
        keywords: 'new note create',
      });
      if (activeTabId !== INTERNAL_TAB_ID) {
        cmds.push({
          id: 'new-note-template',
          label: 'New note from template',
          description: 'Create note with default template',
          icon: <ClipboardList className="w-4 h-4" />,
          action: () => {
            addNote(activeTabId, true);
            toggleCommandPalette();
          },
          keywords: 'new note template',
        });
      }
      cmds.push({
        id: 'new-task',
        label: 'New task',
        description: 'Open task panel',
        icon: <FileText className="w-4 h-4" />,
        action: () => {
          setRightPanelTab('tasks');
          toggleCommandPalette();
        },
        keywords: 'new task action item',
      });
      cmds.push({
        id: 'meeting-prep',
        label: 'Next meeting prep',
        description: 'Prepare agenda from open items',
        icon: <CalendarPlus className="w-4 h-4" />,
        action: () => {
          setNextMeetingPrepSupplier(activeTabId);
          toggleCommandPalette();
        },
        keywords: 'meeting prep agenda',
      });
    }

    cmds.push({
      id: 'search',
      label: 'Search everything',
      description: 'Global search across all data',
      icon: <Search className="w-4 h-4" />,
      action: () => {
        toggleCommandPalette();
        setTimeout(() => toggleSearch(), 50);
      },
      keywords: 'search find',
    });

    cmds.push({
      id: 'toggle-panel',
      label: 'Toggle right panel',
      icon: <PanelRight className="w-4 h-4" />,
      action: () => {
        toggleRightPanel();
        toggleCommandPalette();
      },
      keywords: 'toggle panel sidebar',
    });

    cmds.push({
      id: 'kanban',
      label: 'Kanban board',
      description: 'View tasks as Kanban',
      icon: <Columns3 className="w-4 h-4" />,
      action: () => {
        toggleKanban();
        toggleCommandPalette();
      },
      keywords: 'kanban board tasks',
    });

    cmds.push({
      id: 'backup',
      label: 'Backup all data',
      description: 'Export everything to JSON',
      icon: <Download className="w-4 h-4" />,
      action: () => {
        exportAllData(getExportData());
        toggleCommandPalette();
      },
      keywords: 'backup export data json',
    });

    cmds.push({
      id: 'restore',
      label: 'Restore from backup',
      description: 'Import JSON backup file',
      icon: <Download className="w-4 h-4" />,
      action: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target?.result as string);
              if (data.version === 1 || data.version === 2) {
                importData(data);
              } else {
                alert('Unrecognized backup format.');
              }
            } catch {
              alert('Failed to parse backup file.');
            }
          };
          reader.readAsText(file);
        };
        input.click();
        toggleCommandPalette();
      },
      keywords: 'restore import backup json',
    });

    return cmds;
  }, [projects, suppliers, activeProjectId, activeTabId, openTab, addNote, addInternalNote, addProject, setActiveProject, toggleCommandPalette, toggleSearch, toggleRightPanel, toggleKanban, setNextMeetingPrepSupplier, getExportData, importData, setRightPanelTab]);

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase()) ||
          c.keywords?.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault();
      filtered[selectedIdx].action();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/30" onClick={toggleCommandPalette} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden">
        <div className="flex items-center px-4 border-b border-gray-200">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-3.5 text-sm border-none outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                idx === selectedIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="text-gray-400">{cmd.icon}</span>
              <span className="flex-1">{cmd.label}</span>
              {cmd.description && <span className="text-xs text-gray-400">{cmd.description}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No matching commands</p>
          )}
        </div>
      </div>
    </div>
  );
}
