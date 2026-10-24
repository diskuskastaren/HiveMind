import { useState } from 'react';
import { useStore } from '../store/store';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DecisionDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const decision = useStore((s) => s.decisions.find((item) => item.id === id));
  const decisions = useStore((s) => s.decisions);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const updateDecision = useStore((s) => s.updateDecision);
  const addDecision = useStore((s) => s.addDecision);
  const navigateToNote = useStore((s) => s.navigateToNote);
  const setEditingTask = useStore((s) => s.setEditingTask);
  const [replacement, setReplacement] = useState('');
  const [replacementProjectId, setReplacementProjectId] = useState(decision?.projectId || '');
  const [rationale, setRationale] = useState(decision?.rationale || '');
  const [comments, setComments] = useState(decision?.comments || '');
  if (!decision) return null;

  const predecessor = decisions.find((item) => item.id === decision.supersedesId);
  const successor = decisions.find((item) => item.supersedesId === decision.id);
  const chain = [decision];
  const seen = new Set([decision.id]);
  let cursor = predecessor;
  while (cursor && !seen.has(cursor.id)) { chain.unshift(cursor); seen.add(cursor.id); cursor = decisions.find((item) => item.id === cursor?.supersedesId); }
  cursor = successor;
  while (cursor && !seen.has(cursor.id)) { chain.push(cursor); seen.add(cursor.id); cursor = decisions.find((item) => item.supersedesId === cursor?.id); }
  const relatedTasks = tasks.filter((task) => task.projectId === decision.projectId);
  const status = decision.status || 'active';

  const saveDetails = () => updateDecision(id, { rationale: rationale.trim(), comments: comments.trim() });
  const replace = () => {
    if (!replacement.trim() || !replacementProjectId) return;
    addDecision({
      projectId: replacementProjectId,
      supplierId: decision.supplierId,
      noteId: decision.noteId,
      text: replacement.trim(),
      supersedesId: decision.id,
      relatedTaskIds: decision.relatedTaskIds || [],
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Decision history</DialogTitle>
        <DialogDescription>Review what applies now and how this decision changed.</DialogDescription>
        <div className="flex flex-col gap-4 text-sm">
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center gap-2"><Badge variant="outline">{status}</Badge><span className="text-xs text-muted-foreground">{new Date(decision.createdAt).toLocaleString()}</span></div>
            <p>{decision.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{decision.projectName || 'Project'}{decision.supplierName ? ` · ${decision.supplierName}` : ''}</p>
            {decision.noteId && <Button variant="link" size="xs" className="px-0" onClick={() => { navigateToNote(decision.noteId); onClose(); }}>Open source note</Button>}
            {!decision.noteId && decision.sourceNoteTitle && <p className="text-xs text-muted-foreground">Source note removed: {decision.sourceNoteTitle}</p>}
          </div>
          {chain.length > 1 && <div className="rounded-lg border p-3 text-xs"><p className="mb-2 font-medium">Decision chain</p>{chain.map((item) => <p key={item.id} className="border-l-2 py-1 pl-2">{item.status || 'active'} · {item.text}</p>)}</div>}
          <label className="flex flex-col gap-1.5">Reason <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={saveDetails} placeholder="Why was this decided?" /></label>
          <label className="flex flex-col gap-1.5">Comments <Textarea value={comments} onChange={(e) => setComments(e.target.value)} onBlur={saveDetails} placeholder="Additional context" /></label>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Related tasks</span>
            {relatedTasks.length === 0 && <span className="text-xs text-muted-foreground">No tasks in this project.</span>}
            {relatedTasks.map((task) => <label key={task.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={(decision.relatedTaskIds || []).includes(task.id)} onChange={(event) => {
              const ids = new Set(decision.relatedTaskIds || []);
              if (event.target.checked) ids.add(task.id); else ids.delete(task.id);
              updateDecision(id, { relatedTaskIds: [...ids] });
            }} /><button type="button" className="text-left hover:underline" onClick={() => { setEditingTask(task.id); onClose(); }}>{task.title}</button></label>)}
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Changes</span>
            {(decision.history || []).slice().reverse().map((entry) => <div key={entry.id} className="border-l-2 pl-3 text-xs">
              <span className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString()} · {entry.action}</span>
              <p>{entry.text}</p>
              {entry.comment && <p className="text-muted-foreground">{entry.comment}</p>}
            </div>)}
          </div>
          {status === 'active' && <div className="flex flex-col gap-2 border-t pt-4">
            <span className="font-medium">Replace this decision</span>
            <Select value={replacementProjectId} onValueChange={setReplacementProjectId}><SelectTrigger size="sm" aria-label="Project for replacement"><SelectValue placeholder="Choose project" /></SelectTrigger><SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            <div className="flex gap-2"><Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="New decision" /><Button onClick={replace} disabled={!replacement.trim() || !replacementProjectId}>Replace</Button></div>
            <Button variant="outline" size="sm" className="self-start" onClick={() => updateDecision(id, { status: 'revoked' })}>Revoke decision</Button>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
