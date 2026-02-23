import type { Note, Task, Decision } from '../types';
import { format } from 'date-fns';

function htmlToPlain(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || '';
}

function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<u>(.*?)<\/u>/gi, '$1');
  md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<mark>(.*?)<\/mark>/gi, '==$1==');
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = inner.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1');
    return `> ${text}\n\n`;
  });
  md = md.replace(/<hr\s*\/?>/gi, '---\n\n');
  md = md.replace(/<ul[^>]*>/gi, '');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*><p>(.*?)<\/p><\/li>/gi, '- $1\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<[^>]+>/g, '');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

export function exportNoteMarkdown(note: Note, supplierName: string, projectName?: string): string {
  const date = format(new Date(note.createdAt), 'yyyy-MM-dd HH:mm');
  let md = `# ${note.title || 'Untitled Note'}\n\n`;
  if (projectName) md += `**Project:** ${projectName}  \n`;
  md += `**Supplier:** ${supplierName}  \n`;
  md += `**Date:** ${date}  \n`;
  if (note.attendees) md += `**Attendees:** ${note.attendees}  \n`;
  md += '\n---\n\n';
  md += htmlToMarkdown(note.content);
  return md;
}

export function exportEmailSummary(
  note: Note,
  supplierName: string,
  projectName: string,
  tasks: Task[],
  decisions: Decision[],
): string {
  const date = format(new Date(note.createdAt), 'yyyy-MM-dd');
  const noteTasks = tasks.filter((t) => t.noteId === note.id);
  const noteDec = decisions.filter((d) => d.noteId === note.id);

  let out = `Meeting Notes: ${note.title || 'Untitled'} — ${supplierName}`;
  if (projectName) out += ` (${projectName})`;
  out += ` (${date})\n`;
  out += '='.repeat(60) + '\n\n';

  const plain = htmlToPlain(note.content);
  const summary = plain.length > 400 ? plain.slice(0, 400) + '…' : plain;
  out += `SUMMARY\n${summary}\n\n`;

  if (noteDec.length) {
    out += 'DECISIONS\n';
    noteDec.forEach((d, i) => (out += `  ${i + 1}. ${d.text}\n`));
    out += '\n';
  }

  if (noteTasks.length) {
    out += 'ACTION ITEMS\n';
    noteTasks.forEach((t, i) => {
      const owner = t.owner ? ` [${t.owner}]` : '';
      const due = t.dueDate ? ` (due ${t.dueDate})` : '';
      out += `  ${i + 1}. ${t.title}${owner}${due} — ${t.status}\n`;
    });
    out += '\n';
  }

  return out;
}

export function downloadFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllData(data: object) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `supplier-notes-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`, 'application/json');
}
