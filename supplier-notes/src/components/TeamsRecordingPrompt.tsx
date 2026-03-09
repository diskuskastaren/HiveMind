import { useState } from 'react';
import { ChevronLeft, ChevronRight, Mic, PlusCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { useStore, INTERNAL_TAB_ID } from '../store/store';

export function TeamsRecordingPrompt() {
  const suppliers = useStore((s) => s.suppliers);
  const allNotes = useStore((s) => s.notes);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const openTab = useStore((s) => s.openTab);
  const addNote = useStore((s) => s.addNote);
  const addInternalNote = useStore((s) => s.addInternalNote);
  const setActiveNote = useStore((s) => s.setActiveNote);
  const setTeamsPromptOpen = useStore((s) => s.setTeamsPromptOpen);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);

  const currentNote = allNotes.find((n) => n.id === activeNoteId) ?? null;

  // #region agent log
  fetch('http://127.0.0.1:7896/ingest/c146e78a-3d4e-4dca-921a-e6b2eea30863',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6cf3ea'},body:JSON.stringify({sessionId:'6cf3ea',location:'TeamsRecordingPrompt.tsx:render',message:'component rendering',data:{supplierCount:suppliers.length,suppliersWithoutProjectIds:suppliers.filter((s:any)=>!s.projectIds).map((s:any)=>s.id),activeProjectId,activeNoteId,hasCurrentNote:!!currentNote},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  // null = top-level, string = drilled into a supplier
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [supplierListExpanded, setSupplierListExpanded] = useState(false);

  const projectSuppliers = suppliers
    .filter((s) => !activeProjectId || s.projectIds.includes(activeProjectId))
    .sort((a, b) => a.name.localeCompare(b.name));

  function dismiss() {
    setTeamsPromptOpen(false);
  }

  function ensureTranscriptPanelOpen() {
    if (!rightPanelOpen) toggleRightPanel();
    setRightPanelTab('transcript');
  }

  function fireAutostart() {
    ensureTranscriptPanelOpen();
    // Small delay so the panel is mounted before the event fires
    setTimeout(() => window.dispatchEvent(new CustomEvent('teams:autostart')), 50);
  }

  function handleStartCurrent() {
    dismiss();
    fireAutostart();
  }

  function handleStartExisting(supplierId: string, noteId: string) {
    openTab(supplierId);
    setActiveNote(noteId);
    dismiss();
    fireAutostart();
  }

  function handleStartNew(supplierId: string) {
    if (supplierId === INTERNAL_TAB_ID) {
      openTab(INTERNAL_TAB_ID);
      addInternalNote();
    } else {
      openTab(supplierId);
      addNote(supplierId);
    }
    dismiss();
    fireAutostart();
  }

  // ── Level 2: note list for a selected supplier ──────────────────────────
  if (selectedSupplier !== null) {
    const isInternal = selectedSupplier === INTERNAL_TAB_ID;
    const supplierInfo = isInternal ? null : suppliers.find((s) => s.id === selectedSupplier);

    const supplierNotes = allNotes
      .filter(
        (n) =>
          !n.archived &&
          (!activeProjectId || n.projectIds.includes(activeProjectId)) &&
          (isInternal ? !!n.internal : n.supplierIds.includes(selectedSupplier)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={dismiss} />

        <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[420px] max-h-[70vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setSelectedSupplier(null)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md transition-colors -ml-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {supplierInfo && (
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: supplierInfo.color }}
              />
            )}
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1 truncate">
              {isInternal ? 'Internal' : supplierInfo?.name ?? 'Supplier'}
            </span>
            <button
              onClick={dismiss}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="px-5 pt-3 pb-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
            Choose an existing note or create a new one
          </p>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {supplierNotes.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No existing notes</p>
            )}
            {supplierNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => handleStartExisting(selectedSupplier, n.id)}
                className="w-full text-left px-5 py-3.5 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {n.title?.trim() || 'Untitled note'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Updated {format(new Date(n.updatedAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <Mic className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
              </button>
            ))}
          </div>

          {/* New note footer */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button
              onClick={() => handleStartNew(selectedSupplier)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <PlusCircle className="w-4 h-4" /> Create new note
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Level 1: top-level prompt ────────────────────────────────────────────
  const currentSupplierName = currentNote?.internal
    ? 'Internal'
    : suppliers.find((s) => currentNote?.supplierIds?.includes(s.id))?.name ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={dismiss} />

      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[420px] overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Teams meeting detected</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Where should this meeting be recorded?</p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Current note */}
          {currentNote && (
            <button
              onClick={handleStartCurrent}
              className="w-full text-left px-4 py-3.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide mb-1">
                    Current note
                  </p>
                  <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 truncate">
                    {currentNote.title?.trim() || 'Untitled note'}
                  </p>
                  {currentSupplierName && (
                    <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">{currentSupplierName}</p>
                  )}
                </div>
                <Mic className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 flex-shrink-0 transition-colors" />
              </div>
            </button>
          )}

          {/* Supplier picker */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setSupplierListExpanded((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                {currentNote ? 'Different supplier or note' : 'Choose supplier'}
              </span>
              <ChevronRight
                className={`w-4 h-4 text-gray-300 dark:text-gray-600 transition-transform ${supplierListExpanded ? 'rotate-90' : ''}`}
              />
            </button>

            {supplierListExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-800 max-h-56 overflow-y-auto">
                {projectSuppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSupplier(s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{s.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                  </button>
                ))}
                <button
                  onClick={() => setSelectedSupplier(INTERNAL_TAB_ID)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">Internal</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
