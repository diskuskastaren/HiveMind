import { escapeHtml } from './html.ts';

/**
 * A deliberately small Markdown subset for AI-written meeting summaries: headings (#–######),
 * bullet lists (-, *, +), numbered lists (1. / 1)), paragraphs, **bold**, *italic* and `code`.
 * All text is HTML-escaped before formatting, so model output can never inject markup.
 */
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string };

export function parseSummaryMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const rawLine of (markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) { endParagraph(); continue; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    const bullet = /^[-*+•]\s+(.+)$/.exec(line);
    const numbered = /^\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (heading) {
      endParagraph();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
    } else if (bullet || numbered) {
      endParagraph();
      const ordered = !!numbered;
      const last = blocks[blocks.length - 1];
      const text = (bullet ?? numbered)![1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(text);
      else blocks.push({ kind: 'list', ordered, items: [text] });
    } else if (/^(\*\*|__)[^*_]+(\*\*|__):?$/.test(line)) {
      // A line that is only bold text (e.g. "**Decisions:**") reads as a heading.
      endParagraph();
      blocks.push({ kind: 'heading', level: 4, text: line.replace(/^(\*\*|__)|(\*\*|__)(?=:?$)/g, '') });
    } else {
      paragraph.push(line);
    }
  }
  endParagraph();
  return blocks;
}

/** Escaped inline formatting. */
function inline(text: string, styles: { strong?: string } = {}) {
  const strongOpen = styles.strong ? `<strong style="${styles.strong}">` : '<strong>';
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_m, a, b) => `${strongOpen}${a ?? b}</strong>`)
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(?!\s)([^_]+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

/** HTML for the in-app summary view. */
export function summaryToHtml(markdown: string): string {
  return parseSummaryMarkdown(markdown).map((block) => {
    if (block.kind === 'heading') return `<p class="mt-3 mb-1 font-semibold first:mt-0">${inline(block.text)}</p>`;
    if (block.kind === 'list') {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag} class="mb-2 ml-4 ${block.ordered ? 'list-decimal' : 'list-disc'} text-subtle-foreground">${block.items.map((item) => `<li class="leading-snug">${inline(item)}</li>`).join('')}</${tag}>`;
    }
    return `<p class="mb-2">${inline(block.text)}</p>`;
  }).join('');
}

/** HTML in the note editor's own structure (headings as h3, proper lists). */
export function summaryToNoteHtml(markdown: string): string {
  return parseSummaryMarkdown(markdown).map((block) => {
    if (block.kind === 'heading') return `<h3>${inline(block.text)}</h3>`;
    if (block.kind === 'list') {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li><p>${inline(item)}</p></li>`).join('')}</${tag}>`;
    }
    return `<p>${inline(block.text)}</p>`;
  }).join('');
}

/** Outlook-friendly HTML (Calibri 11pt, inline styles). */
export function summaryToEmailHtml(markdown: string): string {
  const body = 'font-family: Calibri, sans-serif; font-size: 11pt;';
  const heading = `${body} font-weight: bold; margin: 12pt 0 4pt 0;`;
  const html = parseSummaryMarkdown(markdown).map((block) => {
    if (block.kind === 'heading') return `<p style="${heading}">${inline(block.text).replace(/<\/?strong[^>]*>/g, '')}</p>`;
    if (block.kind === 'list') {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag} style="${body} margin: 2pt 0 6pt 18pt; padding: 0;">${block.items.map((item) => `<li style="${body} margin: 2pt 0;">${inline(item)}</li>`).join('')}</${tag}>`;
    }
    return `<p style="${body} margin: 0 0 6pt 0;">${inline(block.text)}</p>`;
  }).join('');
  return `<html><body style="${body}">${html}</body></html>`;
}

/** Plain text (mailto bodies, clipboard). */
export function summaryToPlainText(markdown: string): string {
  return parseSummaryMarkdown(markdown).map((block) => {
    const clean = (text: string) => text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_m, a, b) => a ?? b).replace(/`([^`]+)`/g, '$1');
    if (block.kind === 'heading') return clean(block.text);
    if (block.kind === 'list') return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${clean(item)}`).join('\n');
    return clean(block.text);
  }).join('\n\n');
}
