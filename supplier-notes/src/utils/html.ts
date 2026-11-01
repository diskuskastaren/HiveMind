/**
 * Plain text from stored note HTML.
 *
 * Uses DOMParser, whose documents are inert: scripts do not run and images do not load.
 * Setting `innerHTML` on an element created with `document.createElement` is NOT inert —
 * `<img onerror=…>` in imported or stored HTML executes immediately, with full access to the
 * desktop app's preload API. Never parse stored HTML that way.
 */
export function htmlToText(html: string, options: { separateBlocks?: boolean } = {}): string {
  if (!html) return '';
  const source = options.separateBlocks ? html.replace(/<\/(p|h[1-6]|li|div|blockquote|tr)>/gi, ' </$1>') : html;
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(source, 'text/html').body.textContent || '';
  }
  return source.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Paragraph/list-item texts of stored HTML, parsed inertly. */
export function htmlBlockTexts(html: string, selector = 'p, li'): string[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll(selector), (node) => (node.textContent || '').trim());
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
