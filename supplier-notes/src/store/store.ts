import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, Supplier, Note, Task, Decision, FollowUp, Transcript, Attachment, RightPanelTab, ActiveView, DashboardSection } from '../types';

export interface AppSettings {
  openaiApiKey: string;
  groqApiKey: string;
  gptModel: string;
  temperature: number;
  customSummaryInstructions: string;
  defaultAudioMode: 'mic' | 'system';
  chunkIntervalSeconds: number;
  autoStopHours: number;
  teamsEnabled: boolean;
  theme: 'light' | 'dark' | 'ladysucker';
  releaseVersionDraft: string;
  releaseNotesDraft: string;
  releaseHistory: Array<{
    id: string;
    version: string;
    notes: string;
    createdAt: number;
  }>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openaiApiKey: '',
  groqApiKey: '',
  gptModel: 'gpt-4o-mini',
  temperature: 0.3,
  customSummaryInstructions: '',
  defaultAudioMode: 'system',
  chunkIntervalSeconds: 60,
  autoStopHours: 4,
  teamsEnabled: true,
  theme: 'light',
  releaseVersionDraft: '',
  releaseNotesDraft: '',
  releaseHistory: [],
};

export const INTERNAL_TAB_ID = '__internal__';

const uid = () => crypto.randomUUID();

const electronAPI = typeof window !== 'undefined' && (window as any).electronStore;

const appStorage = {
  getItem: (name: string): string | null | Promise<string | null> => {
    if (electronAPI) return electronAPI.read();
    try { return localStorage.getItem(name); }
    catch { return null; }
  },
  setItem: (name: string, value: string): void | Promise<void> => {
    if (electronAPI) return electronAPI.write(value);
    try { localStorage.setItem(name, value); }
    catch { window.dispatchEvent(new CustomEvent('storage-error')); }
  },
  removeItem: (name: string): void | Promise<void> => {
    if (electronAPI) return electronAPI.write('');
    try { localStorage.removeItem(name); }
    catch { /* ignore */ }
  },
};

export const SUPPLIER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

const PROJECT_COLORS = [
  '#6366f1', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0284c7', '#65a30d', '#ea580c', '#be185d',
];

export interface ExportData {
  version: 1 | 2 | 3 | 4 | 5;
  exportedAt: number;
  projects?: Project[];
  suppliers: Supplier[];
  notes: Note[];
  tasks: Task[];
  decisions: Decision[];
  followUps?: FollowUp[];
}

interface AppState {
  projects: Project[];
  suppliers: Supplier[];
  notes: Note[];
  tasks: Task[];
  decisions: Decision[];
  followUps: FollowUp[];

  activeProjectId: string | null;
  openTabs: string[];
  activeTabId: string | null;
  activeNoteId: string | null;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  kanbanOpen: boolean;
  editingTaskId: string | null;
  editingDecisionId: string | null;
  activeView: ActiveView;
  previousView: ActiveView | null;
  dashboardSection: DashboardSection;

  addProject: (name: string) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string) => void;

  addSupplier: (name: string) => string;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  togglePinSupplier: (id: string) => void;
  setSupplierTemplate: (id: string, template: string | null) => void;
  linkSupplierToProject: (supplierId: string, projectId: string) => void;
  unlinkSupplierFromProject: (supplierId: string, projectId: string) => void;

  openTab: (supplierId: string) => void;
  closeTab: (supplierId: string) => void;
  setActiveTab: (supplierId: string) => void;

  addNote: (supplierId: string) => string;
  addInternalNote: () => string;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  setActiveNote: (id: string | null) => void;
  addAttachment: (noteId: string, attachment: Attachment) => void;
  removeAttachment: (noteId: string, attachmentId: string) => void;
  addTaskAttachment: (taskId: string, attachment: Attachment) => void;
  removeTaskAttachment: (taskId: string, attachmentId: string) => void;

  addTranscript: (noteId: string, transcript: Transcript) => void;
  updateTranscript: (noteId: string, transcriptId: string, updates: Partial<Omit<Transcript, 'id'>>) => void;
  deleteTranscript: (noteId: string, transcriptId: string) => void;

  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => string;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setEditingTask: (id: string | null) => void;
  toggleArchiveNote: (id: string) => void;

  addFollowUp: (followUp: Omit<FollowUp, 'id' | 'createdAt'>) => string;
  updateFollowUp: (id: string, updates: Partial<FollowUp>) => void;
  deleteFollowUp: (id: string) => void;

  addDecision: (decision: Omit<Decision, 'id' | 'createdAt'>) => string;
  updateDecision: (id: string, updates: Partial<Decision>) => void;
  deleteDecision: (id: string) => void;
  setEditingDecision: (id: string | null) => void;

  transcriptRecording: boolean;
  recordingNoteId: string | null;
  setTranscriptRecording: (recording: boolean) => void;
  setRecordingNote: (noteId: string | null) => void;

  settings: AppSettings;
  settingsOpen: boolean;
  helpOpen: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  toggleSettings: () => void;
  toggleHelp: () => void;

  teamsPromptOpen: boolean;
  setTeamsPromptOpen: (open: boolean) => void;

  confirmDialog: {
    message: string;
    title?: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  } | null;
  openConfirmDialog: (opts: {
    message: string;
    title?: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  }) => void;
  closeConfirmDialog: () => void;

  toggleRightPanel: () => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleCommandPalette: () => void;
  toggleSearch: () => void;
  toggleKanban: () => void;
  navigateToNote: (noteId: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  setDashboardSection: (section: DashboardSection) => void;
  goBackToPreviousView: () => void;

  importData: (data: ExportData) => void;
  getExportData: () => ExportData;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      suppliers: [],
      notes: [],
      tasks: [],
      decisions: [],
      followUps: [],
      activeProjectId: null,
      openTabs: [],
      activeTabId: null,
      activeNoteId: null,
      rightPanelOpen: true,
      rightPanelTab: 'tasks',
      commandPaletteOpen: false,
      searchOpen: false,
      kanbanOpen: false,
      editingTaskId: null,
      editingDecisionId: null,
      activeView: 'notes' as ActiveView,
      previousView: null,
      dashboardSection: 'tasks' as DashboardSection,
      transcriptRecording: false,
      recordingNoteId: null,
      settings: DEFAULT_SETTINGS,
      settingsOpen: false,
      helpOpen: false,
      teamsPromptOpen: false,
      confirmDialog: null,

      // --- Projects ---

      addProject: (name) => {
        const id = uid();
        const idx = get().projects.length % PROJECT_COLORS.length;
        set((s) => ({
          projects: [
            ...s.projects,
            { id, name, color: PROJECT_COLORS[idx], archived: false, createdAt: Date.now() },
          ],
          activeProjectId: id,
        }));
        return id;
      },

      updateProject: (id, updates) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      deleteProject: (id) =>
        set((s) => {
          const remainingProjects = s.projects.filter((p) => p.id !== id);
          const nextProjectId = s.activeProjectId === id
            ? remainingProjects[0]?.id || null
            : s.activeProjectId;
          return {
            projects: remainingProjects,
            activeProjectId: nextProjectId,
            suppliers: s.suppliers.map((sup) => ({
              ...sup,
              projectIds: sup.projectIds.filter((pid) => pid !== id),
            })),
            // Remove the project from each note's projectIds; delete notes that become orphaned
            notes: s.notes
              .map((n) => ({ ...n, projectIds: n.projectIds.filter((pid) => pid !== id) }))
              .filter((n) => n.projectIds.length > 0),
            tasks: s.tasks.filter((t) => t.projectId !== id),
            decisions: s.decisions.filter((d) => d.projectId !== id),
            followUps: s.followUps.filter((f) => f.projectId !== id),
            openTabs: [],
            activeTabId: null,
            activeNoteId: null,
          };
        }),

      setActiveProject: (id) => {
        set(() => ({
          activeProjectId: id,
          openTabs: [],
          activeTabId: null,
          activeNoteId: null,
        }));
      },

      // --- Suppliers ---

      addSupplier: (name) => {
        const id = uid();
        const { suppliers, activeProjectId } = get();
        const idx = suppliers.length % SUPPLIER_COLORS.length;
        const projectIds = activeProjectId ? [activeProjectId] : [];
        set((s) => ({
          suppliers: [
            ...s.suppliers,
            { id, name, pinned: false, defaultTemplate: null, color: SUPPLIER_COLORS[idx], projectIds, createdAt: Date.now() },
          ],
        }));
        return id;
      },

      updateSupplier: (id, updates) =>
        set((s) => ({
          suppliers: s.suppliers.map((x) => (x.id === id ? { ...x, ...updates } : x)),
        })),

      deleteSupplier: (id) =>
        set((s) => {
          const remaining = s.openTabs.filter((t) => t !== id);
          const updatedNotes = s.notes
            .map((n) => ({ ...n, supplierIds: n.supplierIds.filter((sid) => sid !== id) }))
            .filter((n) => n.supplierIds.length > 0 || n.internal);
          const activeNoteStillExists = updatedNotes.some((n) => n.id === s.activeNoteId);
          return {
            suppliers: s.suppliers.filter((x) => x.id !== id),
            notes: updatedNotes,
            tasks: s.tasks.filter((t) => t.supplierId !== id),
            decisions: s.decisions.filter((d) => d.supplierId !== id),
            followUps: s.followUps.filter((f) => f.supplierId !== id),
            openTabs: remaining,
            activeTabId: s.activeTabId === id ? remaining[0] || null : s.activeTabId,
            activeNoteId: activeNoteStillExists ? s.activeNoteId : null,
          };
        }),

      togglePinSupplier: (id) =>
        set((s) => ({
          suppliers: s.suppliers.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)),
        })),

      setSupplierTemplate: (id, template) =>
        set((s) => ({
          suppliers: s.suppliers.map((x) => (x.id === id ? { ...x, defaultTemplate: template } : x)),
        })),

      linkSupplierToProject: (supplierId, projectId) =>
        set((s) => ({
          suppliers: s.suppliers.map((sup) =>
            sup.id === supplierId && !sup.projectIds.includes(projectId)
              ? { ...sup, projectIds: [...sup.projectIds, projectId] }
              : sup,
          ),
        })),

      unlinkSupplierFromProject: (supplierId, projectId) =>
        set((s) => {
          // Remove projectId from notes that belong to this supplier; drop notes that become project-orphaned
          const updatedNotes = s.notes
            .map((n) =>
              n.supplierIds.includes(supplierId) && n.projectIds.includes(projectId)
                ? { ...n, projectIds: n.projectIds.filter((pid) => pid !== projectId) }
                : n,
            )
            .filter((n) => n.projectIds.length > 0);
          const activeNoteStillExists = updatedNotes.some((n) => n.id === s.activeNoteId);
          return {
            suppliers: s.suppliers.map((sup) =>
              sup.id === supplierId
                ? { ...sup, projectIds: sup.projectIds.filter((pid) => pid !== projectId) }
                : sup,
            ),
            notes: updatedNotes,
            tasks: s.tasks.filter((t) => !(t.supplierId === supplierId && t.projectId === projectId)),
            decisions: s.decisions.filter((d) => !(d.supplierId === supplierId && d.projectId === projectId)),
            followUps: s.followUps.filter((f) => !(f.supplierId === supplierId && f.projectId === projectId)),
            openTabs: s.openTabs.filter((t) => t !== supplierId),
            activeTabId: s.activeTabId === supplierId ? null : s.activeTabId,
            activeNoteId: activeNoteStillExists ? s.activeNoteId : null,
          };
        }),

      // --- Tabs ---

      openTab: (supplierId) =>
        set((s) => {
          if (supplierId === INTERNAL_TAB_ID) {
            const tabs = s.openTabs.includes(INTERNAL_TAB_ID) ? s.openTabs : [...s.openTabs, INTERNAL_TAB_ID];
            const internalNotes = s.notes
              .filter((n) => n.internal && !n.archived && s.activeProjectId && n.projectIds.includes(s.activeProjectId))
              .sort((a, b) => b.updatedAt - a.updatedAt);
            return { openTabs: tabs, activeTabId: INTERNAL_TAB_ID, activeNoteId: internalNotes[0]?.id || null };
          }
          const supplier = s.suppliers.find((x) => x.id === supplierId);
          if (!supplier) return {};
          const tabs = s.openTabs.includes(supplierId) ? s.openTabs : [...s.openTabs, supplierId];
          const supplierNotes = s.notes
            .filter((n) => !n.archived && n.supplierIds.includes(supplierId) && n.projectIds.includes(s.activeProjectId!))
            .sort((a, b) => b.updatedAt - a.updatedAt);
          return {
            openTabs: tabs,
            activeTabId: supplierId,
            activeNoteId: supplierNotes[0]?.id || null,
          };
        }),

      closeTab: (supplierId) =>
        set((s) => {
          // Never allow closing the tab that owns the active recording
          if (s.transcriptRecording && s.recordingNoteId) {
            const recordingNote = s.notes.find((n) => n.id === s.recordingNoteId);
            if (recordingNote) {
              const recordingTabId = recordingNote.internal || recordingNote.supplierIds.length === 0
                ? INTERNAL_TAB_ID
                : recordingNote.supplierIds[0];
              if (supplierId === recordingTabId) return {};
            }
          }
          const tabs = s.openTabs.filter((t) => t !== supplierId);
          let nextTab = s.activeTabId;
          let nextNote = s.activeNoteId;
          if (s.activeTabId === supplierId) {
            const idx = s.openTabs.indexOf(supplierId);
            const candidate = tabs[Math.min(idx, tabs.length - 1)] || null;
            nextTab = candidate;
            if (nextTab) {
              const notes = nextTab === INTERNAL_TAB_ID
                ? s.notes.filter((n) => !n.archived && n.internal && s.activeProjectId && n.projectIds.includes(s.activeProjectId))
                : s.notes.filter((n) => !n.archived && n.supplierIds.includes(nextTab!) && n.projectIds.includes(s.activeProjectId!));
              nextNote = notes.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || null;
            } else {
              nextNote = null;
            }

          }
          return { openTabs: tabs, activeTabId: nextTab, activeNoteId: nextNote };
        }),

      setActiveTab: (supplierId) =>
        set((s) => {
          const notes = supplierId === INTERNAL_TAB_ID
            ? s.notes.filter((n) => !n.archived && n.internal && s.activeProjectId && n.projectIds.includes(s.activeProjectId))
            : s.notes.filter((n) => !n.archived && n.supplierIds.includes(supplierId) && n.projectIds.includes(s.activeProjectId!));
          return { activeTabId: supplierId, activeNoteId: notes.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || null };
        }),

      // --- Notes ---

      addNote: (supplierId) => {
        const id = uid();
        const { activeProjectId } = get();
        const now = Date.now();
        const projectIds = activeProjectId ? [activeProjectId] : [];
        set((s) => ({
          notes: [...s.notes, { id, projectIds, supplierIds: [supplierId], title: '', content: '', attendees: '', createdAt: now, updatedAt: now }],
          activeNoteId: id,
        }));
        return id;
      },

      addInternalNote: () => {
        const id = uid();
        const { activeProjectId } = get();
        const now = Date.now();
        const projectIds = activeProjectId ? [activeProjectId] : [];
        set((s) => ({
          notes: [...s.notes, { id, projectIds, supplierIds: [], internal: true, title: '', content: '', attendees: '', createdAt: now, updatedAt: now }],
          activeNoteId: id,
        }));
        return id;
      },

      updateNote: (id, updates) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n)),
        })),

      deleteNote: (id) =>
        set((s) => {
          const remaining = s.notes.filter((n) => n.id !== id);
          let nextNote = s.activeNoteId;
          if (s.activeNoteId === id) {
            const sameContext = s.activeTabId === INTERNAL_TAB_ID
              ? remaining.filter((n) => n.internal && s.activeProjectId && n.projectIds.includes(s.activeProjectId))
              : remaining.filter((n) =>
                  s.activeTabId && n.supplierIds.includes(s.activeTabId) &&
                  s.activeProjectId && n.projectIds.includes(s.activeProjectId),
                );
            nextNote = sameContext.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || null;
          }
          return {
            notes: remaining,
            tasks: s.tasks.filter((t) => t.noteId !== id),
            decisions: s.decisions.filter((d) => d.noteId !== id),
            activeNoteId: nextNote,
          };
        }),

      setActiveNote: (id) => set({ activeNoteId: id }),

      addAttachment: (noteId, attachment) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === noteId
              ? { ...n, attachments: [...(n.attachments ?? []), attachment], updatedAt: Date.now() }
              : n,
          ),
        })),

      removeAttachment: (noteId, attachmentId) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === noteId
              ? { ...n, attachments: (n.attachments ?? []).filter((a) => a.id !== attachmentId) }
              : n,
          ),
        })),

      addTaskAttachment: (taskId, attachment) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, attachments: [...(t.attachments ?? []), attachment] }
              : t,
          ),
        })),

      removeTaskAttachment: (taskId, attachmentId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, attachments: (t.attachments ?? []).filter((a) => a.id !== attachmentId) }
              : t,
          ),
        })),

      // --- Transcripts ---

      addTranscript: (noteId, transcript) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === noteId
              ? { ...n, transcripts: [...(n.transcripts ?? []), transcript], updatedAt: Date.now() }
              : n,
          ),
        })),

      updateTranscript: (noteId, transcriptId, updates) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  transcripts: (n.transcripts ?? []).map((t) =>
                    t.id === transcriptId ? { ...t, ...updates } : t,
                  ),
                  updatedAt: Date.now(),
                }
              : n,
          ),
        })),

      deleteTranscript: (noteId, transcriptId) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  transcripts: (n.transcripts ?? []).filter((t) => t.id !== transcriptId),
                  updatedAt: Date.now(),
                }
              : n,
          ),
        })),

      // --- Tasks ---

      addTask: (task) => {
        const id = uid();
        set((s) => ({ tasks: [...s.tasks, { ...task, id, createdAt: Date.now() }] }));
        return id;
      },

      updateTask: (id, updates) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      deleteTask: (id) => set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== id),
        followUps: s.followUps.map((f) => f.linkedTaskId === id ? { ...f, linkedTaskId: undefined } : f),
      })),

      setEditingTask: (id) => set({ editingTaskId: id }),

      toggleArchiveNote: (id) =>
        set((s) => {
          const note = s.notes.find((n) => n.id === id);
          if (!note) return {};
          const archiving = !note.archived;
          // If archiving the currently active note, move to next non-archived note in context
          let nextNote = s.activeNoteId;
          if (archiving && s.activeNoteId === id) {
            const sameContext = s.activeTabId === INTERNAL_TAB_ID
              ? s.notes.filter((n) => n.id !== id && !n.archived && n.internal && s.activeProjectId && n.projectIds.includes(s.activeProjectId))
              : s.notes.filter((n) => n.id !== id && !n.archived && s.activeTabId && n.supplierIds.includes(s.activeTabId) && s.activeProjectId && n.projectIds.includes(s.activeProjectId));
            nextNote = sameContext.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || null;
          }
          return {
            notes: s.notes.map((n) => n.id === id ? { ...n, archived: !n.archived } : n),
            activeNoteId: nextNote,
          };
        }),

      // --- Follow-ups ---

      addFollowUp: (followUp) => {
        const id = uid();
        set((s) => ({ followUps: [...s.followUps, { ...followUp, id, createdAt: Date.now() }] }));
        return id;
      },

      updateFollowUp: (id, updates) =>
        set((s) => ({ followUps: s.followUps.map((f) => (f.id === id ? { ...f, ...updates } : f)) })),

      deleteFollowUp: (id) => set((s) => ({
        followUps: s.followUps.filter((f) => f.id !== id),
        tasks: s.tasks.map((t) => t.linkedFollowUpId === id ? { ...t, linkedFollowUpId: undefined } : t),
      })),

      // --- Decisions ---

      addDecision: (decision) => {
        const id = uid();
        set((s) => ({ decisions: [...s.decisions, { ...decision, id, createdAt: Date.now() }] }));
        return id;
      },

      updateDecision: (id, updates) =>
        set((s) => ({ decisions: s.decisions.map((d) => (d.id === id ? { ...d, ...updates } : d)) })),

      deleteDecision: (id) => set((s) => ({ decisions: s.decisions.filter((d) => d.id !== id) })),

      setEditingDecision: (id) => set({ editingDecisionId: id }),

      // --- UI ---

      setTranscriptRecording: (recording) => set({ transcriptRecording: recording }),
      setRecordingNote: (noteId) => set({ recordingNoteId: noteId }),

      updateSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
      setTeamsPromptOpen: (open) => set({ teamsPromptOpen: open }),

      openConfirmDialog: (opts) => set({ confirmDialog: opts }),
      closeConfirmDialog: () => set({ confirmDialog: null }),

      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
      toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
      toggleKanban: () => set((s) => ({ kanbanOpen: !s.kanbanOpen })),
      setActiveView: (view) => set({ activeView: view, previousView: null }),
      setDashboardSection: (section) => set({ dashboardSection: section }),
      goBackToPreviousView: () =>
        set((s) => ({ activeView: s.previousView ?? 'notes', previousView: null })),

      navigateToNote: (noteId) =>
        set((s) => {
          if (!noteId) return {};
          const note = s.notes.find((n) => n.id === noteId);
          if (!note) return {};
          const projectId = note.projectIds[0] ?? s.activeProjectId;
          const supplierId = note.internal || note.supplierIds.length === 0
            ? INTERNAL_TAB_ID
            : note.supplierIds[0];
          const openTabs = s.openTabs.includes(supplierId) ? s.openTabs : [...s.openTabs, supplierId];
          return {
            activeProjectId: projectId,
            openTabs,
            activeTabId: supplierId,
            activeNoteId: noteId,
            kanbanOpen: false,
            editingTaskId: null,
            previousView: s.activeView !== 'notes' ? s.activeView : s.previousView,
            activeView: 'notes',
          };
        }),

      // --- Import / Export ---

      importData: (data) => {
        const normaliseNote = (n: any, fallbackProjectId?: string): Note => ({
          ...n,
          projectIds: n.projectIds ?? (n.projectId ? [n.projectId] : (fallbackProjectId ? [fallbackProjectId] : [])),
          supplierIds: n.supplierIds ?? (n.supplierId ? [n.supplierId] : []),
        });

        const hasProjects = (data.version === 2 || data.version === 3 || data.version === 4) && data.projects;
        if (hasProjects) {
          set({
            projects: data.projects!,
            suppliers: data.suppliers,
            notes: data.notes.map((n: any) => normaliseNote(n)),
            tasks: data.tasks,
            decisions: data.decisions,
            followUps: data.followUps || [],
          });
        } else {
          const defaultProject: Project = {
            id: 'imported-default-' + uid(),
            name: 'Imported Project',
            color: '#6366f1',
            archived: false,
            createdAt: Date.now(),
          };
          set({
            projects: [defaultProject],
            activeProjectId: defaultProject.id,
            suppliers: data.suppliers.map((s: any) => ({
              ...s,
              projectIds: s.projectIds || [defaultProject.id],
            })),
            notes: data.notes.map((n: any) => normaliseNote(n, defaultProject.id)),
            tasks: data.tasks.map((t: any) => ({
              ...t,
              projectId: t.projectId || defaultProject.id,
            })),
            decisions: data.decisions.map((d: any) => ({
              ...d,
              projectId: d.projectId || defaultProject.id,
            })),
            followUps: (data.followUps || []).map((f: any) => ({
              ...f,
              projectId: f.projectId || defaultProject.id,
            })),
          });
        }
      },

      getExportData: () => {
        const s = get();
        return {
          version: 5,
          exportedAt: Date.now(),
          projects: s.projects,
          suppliers: s.suppliers,
          notes: s.notes,
          tasks: s.tasks,
          decisions: s.decisions,
          followUps: s.followUps,
        };
      },
    }),
    {
      name: 'Combobulator-data',
      version: 9,
      storage: createJSONStorage(() => appStorage),
      migrate: (persistedState: any, version: number) => {
        let state = persistedState;
        if (version < 2) {
          const defaultProject: Project = {
            id: 'migrated-default',
            name: 'Default Project',
            color: '#6366f1',
            archived: false,
            createdAt: Date.now(),
          };
          state = {
            ...state,
            projects: [defaultProject],
            activeProjectId: defaultProject.id,
            suppliers: (state.suppliers || []).map((s: any) => ({
              ...s,
              projectIds: s.projectIds || [defaultProject.id],
            })),
            notes: (state.notes || []).map((n: any) => ({
              ...n,
              projectId: n.projectId || defaultProject.id,
            })),
            tasks: (state.tasks || []).map((t: any) => ({
              ...t,
              projectId: t.projectId || defaultProject.id,
            })),
            decisions: (state.decisions || []).map((d: any) => ({
              ...d,
              projectId: d.projectId || defaultProject.id,
            })),
          };
        }
        if (version < 3) {
          state = {
            ...state,
            followUps: state.followUps || [],
          };
        }
        if (version < 4) {
          // Migrate notes from single projectId/supplierId to arrays
          state = {
            ...state,
            notes: (state.notes || []).map((n: any) => ({
              ...n,
              projectIds: n.projectIds ?? (n.projectId ? [n.projectId] : []),
              supplierIds: n.supplierIds ?? (n.supplierId ? [n.supplierId] : []),
            })),
          };
        }
        if (version < 5) {
          // Migrate single transcript → transcripts array
          state = {
            ...state,
            notes: (state.notes || []).map((n: any) => {
              const { transcript, ...rest } = n;
              return {
                ...rest,
                transcripts: transcript ? [{ id: uid(), ...transcript }] : [],
              };
            }),
          };
        }
        if (version < 6) {
          // Migrate openai-api-key from localStorage into settings
          let localKey = '';
          try { localKey = localStorage.getItem('openai-api-key') ?? ''; } catch {}
          state = {
            ...state,
            settings: { ...DEFAULT_SETTINGS, openaiApiKey: localKey },
          };
        }
        if (version < 7) {
          // Clean up orphaned bidirectional follow-up links.
          // A task's linkedFollowUpId is orphaned if the follow-up no longer exists;
          // a follow-up's linkedTaskId is orphaned if the task no longer exists.
          const followUpIds = new Set((state.followUps || []).map((f: any) => f.id));
          const taskIds = new Set((state.tasks || []).map((t: any) => t.id));
          state = {
            ...state,
            tasks: (state.tasks || []).map((t: any) =>
              t.linkedFollowUpId && !followUpIds.has(t.linkedFollowUpId)
                ? { ...t, linkedFollowUpId: undefined }
                : t
            ),
            followUps: (state.followUps || []).map((f: any) =>
              f.linkedTaskId && !taskIds.has(f.linkedTaskId)
                ? { ...f, linkedTaskId: undefined }
                : f
            ),
          };
        }
        if (version < 8) {
          state = {
            ...state,
            settings: {
              ...state.settings,
              theme: state.settings?.darkMode ? 'dark' : 'light',
            },
          };
        }
        if (version < 9) {
          state = {
            ...state,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(state.settings || {}),
              releaseHistory: Array.isArray(state.settings?.releaseHistory) ? state.settings.releaseHistory : [],
            },
          };
        }
        return state;
      },
      partialize: (state) => ({
        projects: state.projects,
        suppliers: state.suppliers,
        notes: state.notes,
        tasks: state.tasks,
        decisions: state.decisions,
        followUps: state.followUps,
        activeProjectId: state.activeProjectId,
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        activeNoteId: state.activeNoteId,
        rightPanelOpen: state.rightPanelOpen,
        settings: state.settings,
      }),
    },
  ),
);
