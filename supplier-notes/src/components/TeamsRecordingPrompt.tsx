import { useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, FileText, Mic, Plus, Video, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  try { (window as any).electronDebug?.log({sessionId:'6cf3ea',location:'TeamsRecordingPrompt.tsx:render',message:'component rendering',data:{supplierCount:suppliers.length,suppliersWithoutProjectIds:suppliers.filter((s:any)=>!s.projectIds).map((s:any)=>s.id),activeProjectId,activeNoteId,hasCurrentNote:!!currentNote},timestamp:Date.now(),hypothesisId:'H-RENDERER'}); } catch {}
  // #endregion

  // null = top-level, string = drilled into a supplier
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

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

  const isInternalSel = selectedSupplier === INTERNAL_TAB_ID;
  const supplierInfo = selectedSupplier && !isInternalSel ? suppliers.find((s) => s.id === selectedSupplier) : null;
  const supplierNotes =
    selectedSupplier === null
      ? []
      : allNotes
          .filter(
            (n) =>
              !n.archived &&
              (!activeProjectId || n.projectIds.includes(activeProjectId)) &&
              (isInternalSel ? !!n.internal : n.supplierIds.includes(selectedSupplier)),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);

  const currentSupplier = currentNote?.internal ? null : suppliers.find((s) => currentNote?.supplierIds?.includes(s.id));
  const currentSupplierName = currentNote?.internal ? 'Internal' : (currentSupplier?.name ?? null);
  const selectedName = isInternalSel ? 'Internal' : (supplierInfo?.name ?? 'Supplier');

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent showCloseButton={false} className="flex max-h-[75vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {selectedSupplier !== null ? (
          // ── Level 2: note list for a selected supplier ──
          <>
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
              <Button variant="ghost" size="icon-sm" onClick={() => setSelectedSupplier(null)} aria-label="Back">
                <ChevronLeft />
              </Button>
              {supplierInfo ? (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: supplierInfo.color }} />
              ) : (
                <Building2 className="size-4 text-muted-foreground" />
              )}
              <DialogTitle className="flex-1 truncate text-[15px] font-semibold">{selectedName}</DialogTitle>
              <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Close" className="text-muted-foreground">
                <X />
              </Button>
            </div>
            <DialogDescription className="px-5 pt-3 pb-1 text-xs">Choose an existing note or create a new one</DialogDescription>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {supplierNotes.length === 0 && <p className="py-8 text-center text-ui text-muted-foreground">No existing notes</p>}
              {supplierNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleStartExisting(selectedSupplier, n.id)}
                  className="group/note flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.title?.trim() || 'Untitled note'}</p>
                    <p className="text-xs text-muted-foreground">Updated {format(new Date(n.updatedAt), 'MMM d, yyyy')}</p>
                  </div>
                  <Mic className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/note:text-recording" />
                </button>
              ))}
            </div>
            <div className="shrink-0 border-t p-3">
              <Button className="w-full" onClick={() => handleStartNew(selectedSupplier)}>
                <Plus /> New note for {selectedName} &amp; record
              </Button>
            </div>
          </>
        ) : (
          // ── Level 1: top-level prompt ──
          <>
            <div className="flex items-start gap-3.5 px-5 pt-5 pb-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-recording-soft text-recording">
                <Video className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-semibold">Teams meeting detected</DialogTitle>
                <DialogDescription className="mt-0.5">Where should this meeting be recorded?</DialogDescription>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Close" className="-mt-1 -mr-1 text-muted-foreground">
                <X />
              </Button>
            </div>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5">
              {currentNote && (
                <button
                  type="button"
                  onClick={handleStartCurrent}
                  className="flex w-full items-center gap-3 rounded-lg border-[1.5px] border-primary bg-brand-soft px-3.5 py-3 text-left transition-opacity hover:opacity-90"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs font-medium text-brand-soft-foreground">Current note</span>
                    <span className="truncate text-sm font-semibold">{currentNote.title?.trim() || 'Untitled note'}</span>
                    {currentSupplierName && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {currentSupplier && <span className="size-1.5 rounded-full" style={{ backgroundColor: currentSupplier.color }} />}
                        {currentSupplierName}
                      </span>
                    )}
                  </span>
                  <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground">
                    <span className="size-1.5 rounded-full bg-current" /> Record here
                  </span>
                </button>
              )}

              <div className="flex flex-col gap-0.5">
                <span className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                  {currentNote ? 'Or choose a different supplier or note' : 'Choose a supplier'}
                </span>
                {projectSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSupplier(s.id)}
                    className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-2xs font-semibold text-white" style={{ backgroundColor: s.color }}>
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 font-medium">{s.name}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedSupplier(INTERNAL_TAB_ID)}
                  className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Building2 className="size-3.5" />
                  </span>
                  <span className="flex-1 font-medium">Internal</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
