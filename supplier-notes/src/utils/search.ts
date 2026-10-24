import type { Note, Task, Decision, FollowUp } from '../types';

export type SearchKind = 'note' | 'task' | 'decision' | 'followup' | 'transcript';
export interface SearchItem {
  type: SearchKind;
  id: string;
  title: string;
  body: string;
  projectIds: string[];
  supplierIds: string[];
  noteId?: string;
  date: number;
  archived?: boolean;
  normalizedTitle: string;
  normalizedBody: string;
}

function plain(html: string) {
  if (typeof document !== 'undefined') {
    const element = document.createElement('div');
    element.innerHTML = html;
    return element.textContent || '';
  }
  return html.replace(/<[^>]*>/g, ' ');
}
const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
function item(data: Omit<SearchItem, 'normalizedTitle' | 'normalizedBody'>): SearchItem {
  return { ...data, normalizedTitle: normalize(data.title), normalizedBody: normalize(data.body) };
}

export function buildSearchIndex(notes: Note[], tasks: Task[], decisions: Decision[], followUps: FollowUp[]): SearchItem[] {
  const entries: SearchItem[] = [];
  for (const note of notes) {
    entries.push(item({ type: 'note', id: note.id, title: note.title || 'Untitled note',
      body: `${note.attendees} ${plain(note.content || '')}`, projectIds: note.projectIds || [], supplierIds: note.supplierIds || [],
      noteId: note.id, date: note.updatedAt, archived: note.archived }));
    for (const transcript of note.transcripts || []) entries.push(item({
      type: 'transcript', id: transcript.id, title: `${note.title || 'Untitled note'} · Transcript`,
      body: `${transcript.rawText || ''} ${transcript.summary || ''}`, projectIds: note.projectIds || [],
      supplierIds: note.supplierIds || [], noteId: note.id, date: transcript.recordedAt || note.updatedAt,
    }));
  }
  for (const task of tasks) entries.push(item({ type: 'task', id: task.id, title: task.title,
    body: `${task.description || ''} ${task.owner || ''} ${(task.updates || []).map((update) => update.text).join(' ')}`,
    projectIds: [task.projectId], supplierIds: task.supplierId ? [task.supplierId] : [],
    noteId: task.noteId || undefined, date: task.createdAt }));
  for (const decision of decisions) entries.push(item({ type: 'decision', id: decision.id, title: decision.text,
    body: `${decision.rationale || ''} ${decision.comments || ''} ${(decision.history || []).map((entry) => entry.text).join(' ')}`,
    projectIds: [decision.projectId], supplierIds: decision.supplierId ? [decision.supplierId] : [],
    noteId: decision.noteId || undefined, date: decision.updatedAt || decision.createdAt }));
  for (const followUp of followUps) entries.push(item({ type: 'followup', id: followUp.id, title: followUp.text,
    body: '', projectIds: [followUp.projectId], supplierIds: followUp.supplierId ? [followUp.supplierId] : [],
    date: followUp.createdAt }));
  return entries;
}

export function searchLocal(index: SearchItem[], query: string, filters: {
  type?: SearchKind | 'all'; projectId?: string; supplierId?: string; since?: number;
}, limit = 100): Array<SearchItem & { score: number; snippet: string }> {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const result = [];
  for (const entry of index) {
    if (filters.type && filters.type !== 'all' && entry.type !== filters.type) continue;
    if (filters.projectId && filters.projectId !== 'all' && !entry.projectIds.includes(filters.projectId)) continue;
    if (filters.supplierId && filters.supplierId !== 'all' &&
        (filters.supplierId === '__internal__' ? entry.supplierIds.length !== 0 : !entry.supplierIds.includes(filters.supplierId))) continue;
    if (filters.since && entry.date < filters.since) continue;
    let score = 0;
    for (const word of words) {
      const titlePos = entry.normalizedTitle.indexOf(word);
      const bodyPos = entry.normalizedBody.indexOf(word);
      if (titlePos < 0 && bodyPos < 0) { score = 0; break; }
      score += titlePos >= 0 ? 10 + (titlePos === 0 ? 3 : 0) : 2;
      if (bodyPos >= 0) score += 1;
    }
    if (!score) continue;
    const first = entry.normalizedBody.indexOf(words[0]);
    const start = Math.max(0, first - 55);
    const snippet = entry.body.slice(start, start + 160).trim();
    result.push({ ...entry, score, snippet: `${start ? '…' : ''}${snippet}${start + 160 < entry.body.length ? '…' : ''}` });
  }
  return result.sort((a, b) => b.score - a.score || b.date - a.date).slice(0, limit);
}
