import type { Note, NoteSection } from '../types';
import { escapeHtml } from './html.ts';

/**
 * Tabs ("sections") inside a meeting note.
 *
 * A note without `sections` (every note created before tabs existed, and every note with a
 * single tab) is a plain note: `content` is its text, exactly as before.
 *
 * A note with two or more sections keeps each tab's HTML in `sections`, which is the source of
 * truth. `content` is then a read-only mirror of the whole note — every tab as an `<h2>` with
 * its name, followed by its text — so search, previews, exports, AI context and older app
 * versions keep reading the complete note without knowing about tabs.
 */

/** Id of the one implicit tab of a plain note. */
export const MAIN_SECTION_ID = '__main__';
export const FIRST_SECTION_TITLE = 'Notes';
export const RECOVERED_SECTION_TITLE = 'Recovered';

const uid = () => crypto.randomUUID();

export function hasSections(note: Pick<Note, 'sections'>): note is Pick<Note, 'sections'> & { sections: NoteSection[] } {
  return Array.isArray(note.sections) && note.sections.length >= 2;
}

/** The note's whole HTML, built from its tabs. */
export function composeContent(sections: NoteSection[]): string {
  return sections.map((section) => `<h2>${escapeHtml(section.title)}</h2>${section.content}`).join('');
}

/** The note's tabs; a plain note has one implicit tab holding `content`. */
export function noteSections(note: Pick<Note, 'sections' | 'content'>): NoteSection[] {
  return hasSections(note) ? note.sections : [{ id: MAIN_SECTION_ID, title: FIRST_SECTION_TITLE, content: note.content || '' }];
}

/** The tab to show: the remembered one if it still exists, otherwise the first. */
export function resolveSection(note: Pick<Note, 'sections' | 'content'>, sectionId: string | undefined): NoteSection {
  const sections = noteSections(note);
  return sections.find((section) => section.id === sectionId) ?? sections[0];
}

/**
 * Store `sections` on the note and refresh its `content` mirror. Fewer than two tabs make the
 * note plain again: the remaining tab's text becomes `content` and `sections` is removed.
 */
export function withSections<T extends Note>(note: T, sections: NoteSection[]): T {
  const { sections: _old, ...rest } = note;
  if (sections.length < 2) return { ...rest, content: sections[0]?.content ?? '' } as T;
  return { ...rest, sections, content: composeContent(sections) } as T;
}

/** A name for a new tab that no other tab of the note uses ("Tab 2", "Tab 3", …). */
export function nextSectionTitle(sections: NoteSection[]): string {
  const taken = new Set(sections.map((section) => section.title.trim().toLocaleLowerCase()));
  let n = sections.length + 1;
  while (taken.has(`tab ${n}`)) n++;
  return `Tab ${n}`;
}

/**
 * Add a tab after `afterId` (or at the end). A plain note is split first: its text becomes the
 * first tab, unchanged.
 */
export function addSection(note: Note, options: { title?: string; content?: string; afterId?: string; id?: string } = {}): { note: Note; sectionId: string } {
  const current = hasSections(note)
    ? note.sections
    : [{ id: uid(), title: FIRST_SECTION_TITLE, content: note.content || '' }];
  const section: NoteSection = {
    id: options.id ?? uid(),
    title: options.title?.trim() || nextSectionTitle(current),
    content: options.content ?? '',
  };
  const afterIndex = options.afterId ? current.findIndex((item) => item.id === options.afterId) : -1;
  const at = afterIndex >= 0 ? afterIndex + 1 : current.length;
  const sections = [...current.slice(0, at), section, ...current.slice(at)];
  return { note: withSections(note, sections), sectionId: section.id };
}

/** Change a tab's name or text. On a plain note, the implicit tab's text is `content`. */
export function updateSection(note: Note, sectionId: string, updates: { title?: string; content?: string }): Note {
  if (!hasSections(note)) {
    return updates.content === undefined ? note : { ...note, content: updates.content };
  }
  const title = updates.title?.trim();
  const sections = note.sections.map((section) => section.id === sectionId
    ? { ...section, ...(title ? { title } : {}), ...(updates.content !== undefined ? { content: updates.content } : {}) }
    : section);
  return withSections(note, sections);
}

/** Move a tab to position `toIndex` (clamped). */
export function moveSection(note: Note, sectionId: string, toIndex: number): Note {
  if (!hasSections(note)) return note;
  const from = note.sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return note;
  const sections = [...note.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(Math.max(0, Math.min(toIndex, sections.length)), 0, moved);
  return withSections(note, sections);
}

export interface RemovedSection {
  section: NoteSection;
  index: number;
  /** Name of the tab that was left when removing made the note plain again (for Undo). */
  remainingTitle?: string;
}

/** Remove a tab. Removing the second-to-last tab makes the note plain again. */
export function removeSection(note: Note, sectionId: string): { note: Note; removed: RemovedSection | null } {
  if (!hasSections(note)) return { note, removed: null };
  const index = note.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return { note, removed: null };
  const sections = note.sections.filter((section) => section.id !== sectionId);
  return {
    note: withSections(note, sections),
    removed: { section: note.sections[index], index, remainingTitle: sections.length === 1 ? sections[0].title : undefined },
  };
}

/** Put back a removed tab at its old position (used by "Undo"). */
export function restoreSection(note: Note, removed: RemovedSection): Note {
  const current = hasSections(note)
    ? note.sections
    : [{ id: uid(), title: removed.remainingTitle || FIRST_SECTION_TITLE, content: note.content || '' }];
  if (current.some((section) => section.id === removed.section.id)) return note;
  const at = Math.max(0, Math.min(removed.index, current.length));
  return withSections(note, [...current.slice(0, at), removed.section, ...current.slice(at)]);
}

/**
 * Append HTML to a note: to the given tab of a tabbed note, or to the end of a plain note.
 */
export function appendToSection(note: Note, sectionId: string | undefined, html: string): Note {
  if (!hasSections(note)) return { ...note, content: `${note.content || ''}${html}` };
  const target = resolveSection(note, sectionId);
  return updateSection(note, target.id, { content: `${target.content}${html}` });
}

/**
 * Apply an update to `content` of a tabbed note made by code that does not know about tabs.
 * Text added at the end goes to the given tab; any other change is kept as a new tab, so
 * nothing written is lost and the tabs are never overwritten by the mirror.
 */
export function applyContentWrite(note: Note, sectionId: string | undefined, content: string): Note {
  if (!hasSections(note) || content === note.content) return note;
  if (content.startsWith(note.content)) return appendToSection(note, sectionId, content.slice(note.content.length));
  return addSection(note, { title: RECOVERED_SECTION_TITLE, content }).note;
}

const isSection = (value: unknown): value is NoteSection =>
  !!value && typeof value === 'object' &&
  typeof (value as NoteSection).id === 'string' && typeof (value as NoteSection).title === 'string' &&
  typeof (value as NoteSection).content === 'string';

/**
 * Bring a loaded or imported note's tabs into a consistent shape: malformed tabs are dropped,
 * duplicate ids are renewed, a single tab makes the note plain, and the mirror is rebuilt. If
 * `content` no longer matches the tabs (it was edited by an app version without tabs), that
 * text is kept as an extra "Recovered" tab instead of being overwritten.
 */
export function normalizeNoteSections<T extends Note>(note: T): T {
  if (note.sections === undefined) return note;
  if (!Array.isArray(note.sections)) {
    const { sections: _invalid, ...rest } = note;
    return rest as T;
  }
  const seen = new Set<string>();
  const sections = note.sections.filter(isSection).map((section) => {
    const id = seen.has(section.id) || section.id === MAIN_SECTION_ID ? uid() : section.id;
    seen.add(id);
    return id === section.id ? section : { ...section, id };
  });
  if (sections.length < 2) {
    // A single stored tab: the note is plain. Keep whichever text is there.
    const { sections: _single, ...rest } = note;
    const content = typeof note.content === 'string' && note.content ? note.content : sections[0]?.content ?? '';
    return { ...rest, content } as T;
  }
  const mirror = composeContent(sections);
  const content = typeof note.content === 'string' ? note.content : '';
  if (content && content !== mirror) {
    sections.push({ id: uid(), title: RECOVERED_SECTION_TITLE, content });
    return { ...note, sections, content: composeContent(sections) };
  }
  if (sections.length === note.sections.length && content === mirror && sections.every((s, i) => s === note.sections![i])) return note;
  return { ...note, sections, content: mirror };
}

/** Text of the note's tabs without their names (for short previews). */
export function sectionsBodyHtml(note: Pick<Note, 'sections' | 'content'>): string {
  return hasSections(note) ? note.sections.map((section) => section.content).join('') : note.content || '';
}
