import type { Decision, Note, Project, Supplier, Task } from '../types';

export type LocalSearchKind = 'note' | 'transcript' | 'task' | 'decision';

export interface LocalSearchCorpus {
  projects: Project[];
  suppliers: Supplier[];
  notes: Note[];
  tasks: Task[];
  decisions: Decision[];
}

export interface LocalSearchResult {
  kind: LocalSearchKind;
  id: string;
  noteId?: string;
  title: string;
  text: string;
  projectIds: string[];
  supplierIds: string[];
  date: number;
  score: number;
  labels: string[];
}

export function htmlToText(html: string): string {
  if (typeof document === 'undefined') return stripTags(html);
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return el.textContent || '';
}

function stripTags(html: string) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9åäö]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreText(query: string, text: string, title = '') {
  const q = query.toLowerCase().trim();
  const lowerText = text.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const terms = tokenize(query);
  let score = 0;
  if (q && lowerTitle.includes(q)) score += 80;
  if (q && lowerText.includes(q)) score += 40;
  for (const term of terms) {
    if (lowerTitle.includes(term)) score += 12;
    if (lowerText.includes(term)) score += 4;
  }
  return score;
}

function labelsFor(projectIds: string[], supplierIds: string[], projects: Project[], suppliers: Supplier[]) {
  const projectLabels = projectIds
    .map((id) => projects.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[];
  const supplierLabels = supplierIds
    .map((id) => suppliers.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];
  return [...projectLabels, ...(supplierLabels.length ? supplierLabels : ['Internal'])];
}

export function searchLocalCorpus(query: string, corpus: LocalSearchCorpus, limit = 8): LocalSearchResult[] {
  if (!query.trim()) return [];
  const results: LocalSearchResult[] = [];
  const { projects, suppliers, notes, tasks, decisions } = corpus;

  for (const note of notes) {
    const title = note.title || 'Untitled note';
    const noteText = [
      title,
      note.attendees,
      htmlToText(note.content),
    ].filter(Boolean).join('\n');
    const noteScore = scoreText(query, noteText, title);
    if (noteScore > 0) {
      results.push({
        kind: 'note',
        id: note.id,
        noteId: note.id,
        title,
        text: noteText,
        projectIds: note.projectIds,
        supplierIds: note.supplierIds,
        date: note.updatedAt,
        score: noteScore + Math.min(10, Math.max(0, (Date.now() - note.updatedAt) / -86_400_000 + 10)),
        labels: labelsFor(note.projectIds, note.supplierIds, projects, suppliers),
      });
    }

    for (const transcript of note.transcripts || []) {
      const transcriptText = [
        transcript.rawText,
        transcript.summary,
      ].filter(Boolean).join('\n\n');
      const transcriptTitle = `${title} transcript`;
      const transcriptScore = scoreText(query, transcriptText, transcriptTitle);
      if (transcriptScore > 0) {
        results.push({
          kind: 'transcript',
          id: transcript.id,
          noteId: note.id,
          title: transcriptTitle,
          text: transcriptText,
          projectIds: note.projectIds,
          supplierIds: note.supplierIds,
          date: transcript.recordedAt || note.updatedAt,
          score: transcriptScore + 15,
          labels: labelsFor(note.projectIds, note.supplierIds, projects, suppliers),
        });
      }
    }
  }

  for (const task of tasks) {
    const text = [task.title, task.owner, task.status, task.priority, task.description].filter(Boolean).join('\n');
    const score = scoreText(query, text, task.title);
    if (score > 0) {
      results.push({
        kind: 'task',
        id: task.id,
        noteId: task.noteId || undefined,
        title: task.title,
        text,
        projectIds: [task.projectId],
        supplierIds: task.supplierId ? [task.supplierId] : [],
        date: task.createdAt,
        score,
        labels: labelsFor([task.projectId], task.supplierId ? [task.supplierId] : [], projects, suppliers),
      });
    }
  }

  for (const decision of decisions) {
    const score = scoreText(query, decision.text, decision.text);
    if (score > 0) {
      results.push({
        kind: 'decision',
        id: decision.id,
        noteId: decision.noteId || undefined,
        title: decision.text,
        text: decision.text,
        projectIds: [decision.projectId],
        supplierIds: decision.supplierId ? [decision.supplierId] : [],
        date: decision.createdAt,
        score,
        labels: labelsFor([decision.projectId], decision.supplierId ? [decision.supplierId] : [], projects, suppliers),
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || b.date - a.date)
    .slice(0, limit);
}

export function buildLocalSearchContext(results: LocalSearchResult[]) {
  return results.map((result, index) => {
    const text = result.text.replace(/\s+/g, ' ').trim().slice(0, 1800);
    return `[${index + 1}] ${result.kind.toUpperCase()}: ${result.title}
Labels: ${result.labels.join(', ')}
Date: ${new Date(result.date).toLocaleDateString()}
Content: ${text}`;
  }).join('\n\n');
}
