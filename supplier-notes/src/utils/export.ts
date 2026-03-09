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

/** Convert AI summary markdown to HTML with Calibri 11pt styling for Outlook. */
export function summaryToHtmlForEmail(md: string): string {
  const bodyStyle = 'font-family: Calibri, sans-serif; font-size: 11pt;';
  const headingStyle = 'font-family: Calibri, sans-serif; font-size: 11pt; font-weight: bold; margin: 12pt 0 4pt 0;';
  const bulletStyle = 'font-family: Calibri, sans-serif; font-size: 11pt; margin: 2pt 0;';

  const htmlLines = md.split('\n').map((line) => {
    if (/^## (.+)$/.test(line)) {
      const text = line.replace(/^## /, '').replace(/\*\*(.+?)\*\*/g, '$1');
      return `<p style="${headingStyle}">${text}</p>`;
    }
    if (/^- (.+)$/.test(line)) {
      const text = line.replace(/^- /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return `<p style="${bulletStyle}">&bull; ${text}</p>`;
    }
    if (line.trim() === '') return '';
    const text = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `<p style="${bodyStyle}">${text}</p>`;
  });

  return `<html><body style="${bodyStyle}">${htmlLines.join('')}</body></html>`;
}

/** Convert AI summary markdown to plain text for email body (Outlook-friendly). */
export function summaryToPlainTextForEmail(md: string): string {
  return (
    md
      // ## Heading -> blank line + heading + newline
      .replace(/^## (.+)$/gm, '\n$1\n')
      // - item -> bullet + space
      .replace(/^- (.+)$/gm, '• $1')
      // **bold** -> plain text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Build a mailto URL with optional body truncation for client URL length limits. */
export function getMailtoUrl(subject: string, body: string, maxBodyLength = 1500): string {
  const encodedSubject = encodeURIComponent(subject);
  const truncated = body.length > maxBodyLength ? body.slice(0, maxBodyLength) + '\n\n[… truncated]' : body;
  const encodedBody = encodeURIComponent(truncated);
  return `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
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
  downloadFile(json, `Combobulator-data-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`, 'application/json');
}
