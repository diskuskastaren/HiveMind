import { useState } from 'react';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import {
  Building2,
  Columns3,
  Download,
  FolderOpen,
  HelpCircle,
  Home,
  ListChecks,
  PanelRight,
  Plus,
  Search,
  Settings2,
  SquareCheck,
  Upload,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { exportAllData } from '../utils/export';
import { pickAndImportBackup } from '../utils/backup';
import { ColorDot } from './common';
import type { ActiveView } from '../types';

export function CommandPalette() {
  const [newProjectMode, setNewProjectMode] = useState(false);
  const [projectName, setProjectName] = useState('');

  const projects = useStore((s) => s.projects);
  const suppliers = useStore((s) => s.suppliers);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeTabId = useStore((s) => s.activeTabId);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const toggleSearch = useStore((s) => s.toggleSearch);
  const toggleSettings = useStore((s) => s.toggleSettings);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const addProject = useStore((s) => s.addProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const setActiveView = useStore((s) => s.setActiveView);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const getExportData = useStore((s) => s.getExportData);
  const importData = useStore((s) => s.importData);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);

  const run = (fn: () => void) => () => {
    toggleCommandPalette();
    fn();
  };

  const projectSuppliers = activeProjectId ? suppliers.filter((s) => s.projectIds.includes(activeProjectId)) : suppliers;

  const openSupplier = (id: string) => {
    openTab(id);
    setActiveView('notes');
  };

  const goTo = (view: ActiveView) => setActiveView(view);

  const createProject = () => {
    if (projectName.trim()) addProject(projectName.trim());
    toggleCommandPalette();
  };

  return (
    <CommandDialog
      open
      onOpenChange={(open) => !open && toggleCommandPalette()}
      title="Command palette"
      description="Jump to a supplier, project or action"
      showCloseButton={false}
      className="top-[15vh] translate-y-0 sm:max-w-xl"
    >
      {newProjectMode ? (
        <div className="flex flex-col gap-3 p-4">
          <label htmlFor="cmd-new-project" className="text-ui font-medium">
            New project
          </label>
          <Input
            id="cmd-new-project"
            autoFocus
            placeholder="Project name…"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createProject();
            }}
          />
          <p className="text-xs text-muted-foreground">Press Enter to create, Esc to cancel.</p>
        </div>
      ) : (
        <>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No matching commands</CommandEmpty>

            {activeTabId && (
              <CommandGroup heading="Actions">
                <CommandItem
                  keywords={['new', 'note', 'create']}
                  onSelect={run(() => {
                    if (activeTabId === INTERNAL_TAB_ID) addInternalNote();
                    else addNote(activeTabId);
                    setActiveView('notes');
                  })}
                >
                  <Plus />
                  New note
                  <CommandShortcut>Ctrl N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  keywords={['new', 'task', 'action', 'item']}
                  onSelect={run(() => {
                    setActiveView('notes');
                    setRightPanelTab('tasks');
                    if (!rightPanelOpen) toggleRightPanel();
                  })}
                >
                  <SquareCheck />
                  New task
                  <span className="ml-auto text-xs text-muted-foreground">Opens the task panel</span>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Go to">
              <CommandItem keywords={['home', 'dashboard', 'overview']} onSelect={run(() => goTo('dashboard'))}>
                <Home />
                Overview
              </CommandItem>
              <CommandItem keywords={['tasks', 'decisions', 'follow-ups', 'follow up']} onSelect={run(() => goTo('tasks'))}>
                <ListChecks />
                Follow-up
              </CommandItem>
              <CommandItem keywords={['kanban', 'board', 'tasks']} onSelect={run(() => goTo('tasks'))}>
                <Columns3 />
                Kanban board
                <span className="ml-auto text-xs text-muted-foreground">View tasks as Kanban</span>
              </CommandItem>
              <CommandItem keywords={['search', 'find']} onSelect={run(() => setTimeout(() => toggleSearch(), 50))}>
                <Search />
                Search everything
                <CommandShortcut>Ctrl Shift F</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            {(activeProjectId || projectSuppliers.length > 0) && (
              <CommandGroup heading="Suppliers">
                {activeProjectId && (
                  <CommandItem value="Internal workspace" keywords={['internal', 'workspace']} onSelect={run(() => openSupplier(INTERNAL_TAB_ID))}>
                    <Building2 />
                    Internal workspace
                    <span className="ml-auto text-xs text-muted-foreground">Notes not linked to a supplier</span>
                  </CommandItem>
                )}
                {projectSuppliers.map((s) => (
                  <CommandItem key={s.id} value={`supplier ${s.name} ${s.id}`} keywords={['switch', 'supplier']} onSelect={run(() => openSupplier(s.id))}>
                    <span className="flex size-4 items-center justify-center">
                      <ColorDot color={s.color} />
                    </span>
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Projects">
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <CommandItem key={p.id} value={`project ${p.name} ${p.id}`} keywords={['switch', 'project']} onSelect={run(() => setActiveProject(p.id))}>
                    <FolderOpen />
                    {p.name}
                    {p.id === activeProjectId && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
                  </CommandItem>
                ))}
              <CommandItem keywords={['new', 'project', 'create']} onSelect={() => setNewProjectMode(true)}>
                <Plus />
                New project
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="App">
              <CommandItem keywords={['toggle', 'panel', 'sidebar']} onSelect={run(toggleRightPanel)}>
                <PanelRight />
                Toggle side panel
                <CommandShortcut>Ctrl ]</CommandShortcut>
              </CommandItem>
              <CommandItem keywords={['backup', 'export', 'data', 'json']} onSelect={run(() => exportAllData(getExportData()))}>
                <Download />
                Backup all data
                <span className="ml-auto text-xs text-muted-foreground">Export everything to JSON</span>
              </CommandItem>
              <CommandItem keywords={['restore', 'import', 'backup', 'json']} onSelect={run(() => pickAndImportBackup(importData))}>
                <Upload />
                Restore from backup
              </CommandItem>
              <CommandItem keywords={['settings', 'preferences']} onSelect={run(toggleSettings)}>
                <Settings2 />
                Settings
                <CommandShortcut>Ctrl ,</CommandShortcut>
              </CommandItem>
              <CommandItem keywords={['help', 'guide']} onSelect={run(toggleHelp)}>
                <HelpCircle />
                Help guide
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="flex gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>↑↓ to navigate</span>
            <span>Enter to run</span>
            <span>Esc to close</span>
          </div>
        </>
      )}
    </CommandDialog>
  );
}
