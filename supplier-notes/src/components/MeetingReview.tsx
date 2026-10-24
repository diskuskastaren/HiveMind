import { useState } from 'react';
import { useStore } from '../store/store';
import type { MeetingSuggestion, Note, Transcript } from '../types';
import { analyzeMeeting, sourceHash } from '../utils/meetingIntelligence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export function MeetingReview({ note, transcript }: { note: Note; transcript: Transcript }) {
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const followUps = useStore((s) => s.followUps);
  const settings = useStore((s) => s.settings);
  const updateTranscript = useStore((s) => s.updateTranscript);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const addDecision = useStore((s) => s.addDecision);
  const updateDecision = useStore((s) => s.updateDecision);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, string>>({});
  const analysis = transcript.analysis;
  const stale = analysis && analysis.sourceHash !== sourceHash(transcript.rawText);

  const run = async (force = false) => {
    if (!transcript.rawText || !settings.openaiApiKey) return;
    if (!force && analysis && !stale) return;
    setBusy(true); setError('');
    try {
      const priorNotes = notes.filter((item) => item.id !== note.id && item.projectIds.some((id) => note.projectIds.includes(id)))
        .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
        .map((item) => `${item.title}: ${item.content.replace(/<[^>]+>/g, ' ').slice(0, 500)}`).join('\n');
      const priorDecisions = decisions.filter((item) => note.projectIds.includes(item.projectId) && (item.status || 'active') === 'active')
        .slice(-10).map((item) => `Current decision: ${item.text}`).join('\n');
      const prior = `${priorNotes}\n${priorDecisions}`;
      const response = await analyzeMeeting(transcript.rawText, settings.openaiApiKey, settings.gptModel, prior);
      const previous = new Map((analysis?.suggestions || []).map((item) => [item.id, item]));
      const previousByQuote = new Map((analysis?.suggestions || []).map((item) => [`${item.kind}:${item.sourceQuote.toLocaleLowerCase()}`, item]));
      updateTranscript(note.id, transcript.id, { analysis: {
        sourceHash: sourceHash(transcript.rawText), analyzedAt: Date.now(), model: response.model,
        promptTokens: response.promptTokens, completionTokens: response.completionTokens,
        suggestions: response.suggestions.map((item) => {
          const earlier = previous.get(item.id) || previousByQuote.get(`${item.kind}:${item.sourceQuote.toLocaleLowerCase()}`);
          return { ...item, status: earlier?.status || 'pending', linkedEntityId: earlier?.linkedEntityId,
            projectId: earlier?.projectId || note.projectIds[0] };
        }),
      } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const change = (id: string, updates: Partial<MeetingSuggestion>) => {
    if (!analysis) return;
    updateTranscript(note.id, transcript.id, { analysis: {
      ...analysis, suggestions: analysis.suggestions.map((item) => item.id === id ? { ...item, ...updates } : item),
    } });
  };
  const candidateFor = (item: MeetingSuggestion) => {
    const projectId = item.projectId || note.projectIds[0];
    const normalized = item.text.toLocaleLowerCase().trim();
    const matches = (candidate: string) => candidate.toLocaleLowerCase().trim() === normalized ||
      (normalized.length > 12 && candidate.toLocaleLowerCase().includes(normalized));
    if (item.saveAs === 'decision') return decisions.find((candidate) => candidate.projectId === projectId &&
      (matches(candidate.text) || (candidate.sourceTranscriptId === transcript.id && candidate.sourceQuote === item.sourceQuote)));
    if (item.saveAs === 'followup') return followUps.find((candidate) => candidate.projectId === projectId &&
      (matches(candidate.text) || (candidate.sourceTranscriptId === transcript.id && candidate.sourceQuote === item.sourceQuote)));
    return tasks.find((candidate) => candidate.projectId === projectId &&
      (matches(candidate.title) || (candidate.sourceTranscriptId === transcript.id && candidate.sourceQuote === item.sourceQuote)));
  };
  const accept = (item: MeetingSuggestion) => {
    const projectId = item.projectId || note.projectIds[0];
    if (!projectId) { setError('Choose a project before accepting this suggestion'); return; }
    const existingId = duplicateChoices[item.id];
    const sourceSuggestionId = `${transcript.id}:${item.id}`;
    const provenance = { sourceTranscriptId: transcript.id, sourceSuggestionId, sourceQuote: item.sourceQuote };
    let linkedEntityId: string;
    if (item.saveAs === 'decision') {
      const existing = decisions.find((candidate) => candidate.sourceSuggestionId === sourceSuggestionId || candidate.id === existingId);
      if (existing) { updateDecision(existing.id, { text: item.text, ...provenance }); linkedEntityId = existing.id; }
      else linkedEntityId = addDecision({ projectId, supplierId: note.supplierIds[0] || null, noteId: note.id,
        text: item.text, rationale: '', relatedTaskIds: [], ...provenance });
    } else if (item.saveAs === 'followup') {
      const existing = followUps.find((candidate) => candidate.sourceSuggestionId === sourceSuggestionId || candidate.id === existingId);
      if (existing) { updateFollowUp(existing.id, { text: item.text, ...provenance }); linkedEntityId = existing.id; }
      else linkedEntityId = addFollowUp({ projectId, supplierId: note.supplierIds[0] || null, noteId: note.id,
        text: item.text, status: 'open', ...provenance });
    } else {
      const existing = tasks.find((candidate) => candidate.sourceSuggestionId === sourceSuggestionId || candidate.id === existingId);
      if (existing) { updateTask(existing.id, { title: item.text, owner: item.owner, dueDate: item.dueDate,
        priority: item.priority, ...provenance }); linkedEntityId = existing.id; }
      else linkedEntityId = addTask({ projectId, supplierId: note.supplierIds[0] || null, noteId: note.id,
        title: item.text, status: 'open', priority: item.priority, owner: item.owner,
        dueDate: item.dueDate, description: '', ...provenance });
    }
    change(item.id, { status: 'accepted', linkedEntityId });
  };

  return <div className="flex flex-col gap-3 border-t pt-4">
    <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Meeting intelligence</h3><p className="text-xs text-muted-foreground">Review suggestions before they become tasks or decisions.</p></div>
      <Button variant="outline" size="sm" disabled={!settings.openaiApiKey || busy || !transcript.rawText} onClick={() => run(!!analysis)}>{busy ? 'Analyzing…' : analysis ? stale ? 'Update analysis' : 'Analyze again' : 'Analyze meeting'}</Button></div>
    <p className="text-xs text-muted-foreground">Analysis sends this transcript, brief excerpts from recent project notes, and current decisions to OpenAI. API charges may apply.</p>
    {!settings.openaiApiKey && <p className="text-xs text-muted-foreground">Add an OpenAI API key in Settings to analyze this meeting.</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {analysis && <p className="text-xs text-muted-foreground">{analysis.suggestions.length} suggestions · {analysis.model}{analysis.promptTokens != null ? ` · ${analysis.promptTokens + (analysis.completionTokens || 0)} tokens` : ''}{stale ? ' · Transcript changed since analysis' : ''}</p>}
    {analysis?.suggestions.map((item) => {
      const duplicate = candidateFor(item);
      return <div key={item.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2"><Badge variant="outline">AI suggestion · {item.kind}</Badge><span className="text-xs text-muted-foreground">{item.status}</span></div>
        <Textarea aria-label="Suggestion text" value={item.text} onChange={(event) => change(item.id, { text: event.target.value })} disabled={item.status !== 'pending'} />
        <div className="grid grid-cols-2 gap-2"><Input aria-label="Owner" placeholder="Owner" value={item.owner} onChange={(event) => change(item.id, { owner: event.target.value })} disabled={item.status !== 'pending'} />
          <Input aria-label="Due date" type="date" value={item.dueDate} onChange={(event) => change(item.id, { dueDate: event.target.value })} disabled={item.status !== 'pending'} /></div>
        <div className="flex flex-wrap gap-2"><Select value={item.saveAs || 'task'} onValueChange={(value) => change(item.id, { saveAs: value as MeetingSuggestion['saveAs'] })} disabled={item.status !== 'pending'}><SelectTrigger size="sm" aria-label="Save as"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="task">Task</SelectItem><SelectItem value="decision">Decision</SelectItem><SelectItem value="followup">Follow-up</SelectItem></SelectContent></Select>
          <Select value={item.priority} onValueChange={(value) => change(item.id, { priority: value as MeetingSuggestion['priority'] })} disabled={item.status !== 'pending'}><SelectTrigger size="sm" aria-label="Priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select>
          <Select value={item.projectId || note.projectIds[0] || ''} onValueChange={(value) => change(item.id, { projectId: value })} disabled={item.status !== 'pending'}><SelectTrigger size="sm" aria-label="Project"><SelectValue /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
        <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">“{item.sourceQuote}”{item.timestampSeconds != null ? ` · ${Math.floor(item.timestampSeconds / 60)}:${String(Math.floor(item.timestampSeconds % 60)).padStart(2, '0')}` : ''}</blockquote>
        {duplicate && item.status === 'pending' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={duplicateChoices[item.id] === duplicate.id} onChange={(event) => setDuplicateChoices((current) => ({ ...current, [item.id]: event.target.checked ? duplicate.id : '' }))} />Possible duplicate: update “{'title' in duplicate ? duplicate.title : duplicate.text}”</label>}
        {item.status === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => accept(item)} disabled={!item.text.trim()}>Accept</Button><Button size="sm" variant="outline" onClick={() => change(item.id, { status: 'rejected' })}>Reject</Button></div>}
      </div>;
    })}
  </div>;
}
