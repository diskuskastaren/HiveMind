import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, Decoration } from '@tiptap/pm/view';
import { useCallback, useEffect } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X } from 'lucide-react';

export const findReplaceKey = new PluginKey<FindReplaceState>('findReplace');

type Match = { from: number; to: number };

type FindReplaceState = {
  searchTerm: string;
  currentMatch: number;
  matches: Match[];
  decorations: DecorationSet;
};

function findMatches(doc: any, searchTerm: string): Match[] {
  if (!searchTerm) return [];
  const matches: Match[] = [];
  const lower = searchTerm.toLowerCase();
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text: string = node.text?.toLowerCase() ?? '';
    let idx = 0;
    while (true) {
      const found = text.indexOf(lower, idx);
      if (found === -1) break;
      matches.push({ from: pos + found, to: pos + found + searchTerm.length });
      idx = found + 1;
    }
  });
  return matches;
}

function buildState(doc: any, searchTerm: string, currentMatch: number): FindReplaceState {
  const matches = findMatches(doc, searchTerm);
  const clamped = matches.length === 0 ? 0 : Math.min(currentMatch, matches.length - 1);
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === clamped ? 'find-current' : 'find-match',
      }),
    ),
  );
  return { searchTerm, currentMatch: clamped, matches, decorations };
}

export const FindReplaceExtension = Extension.create({
  name: 'findReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindReplaceState>({
        key: findReplaceKey,

        state: {
          init(_config, state) {
            return buildState(state.doc, '', 0);
          },

          apply(tr, prev) {
            const meta = tr.getMeta(findReplaceKey);
            if (meta !== undefined) {
              return buildState(tr.doc, meta.searchTerm ?? prev.searchTerm, meta.currentMatch ?? 0);
            }
            if (tr.docChanged) {
              return buildState(tr.doc, prev.searchTerm, prev.currentMatch);
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            return findReplaceKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function useFindReplace(editor: any) {
  const setSearch = useCallback(
    (searchTerm: string, currentMatch = 0) => {
      if (!editor) return;
      editor.view.dispatch(
        editor.view.state.tr.setMeta(findReplaceKey, { searchTerm, currentMatch }),
      );
    },
    [editor],
  );

  const getPluginState = useCallback((): FindReplaceState | null => {
    if (!editor) return null;
    return findReplaceKey.getState(editor.view.state) ?? null;
  }, [editor]);

  const next = useCallback(
    (searchTerm: string) => {
      const s = getPluginState();
      if (!s || s.matches.length === 0) return 0;
      const next = (s.currentMatch + 1) % s.matches.length;
      setSearch(searchTerm, next);
      // Scroll match into view
      const match = s.matches[next];
      if (match && editor) {
        editor.view.dispatch(
          editor.view.state.tr
            .setMeta(findReplaceKey, { searchTerm, currentMatch: next })
            .scrollIntoView(),
        );
      }
      return next;
    },
    [editor, getPluginState, setSearch],
  );

  const prev = useCallback(
    (searchTerm: string) => {
      const s = getPluginState();
      if (!s || s.matches.length === 0) return 0;
      const p = (s.currentMatch - 1 + s.matches.length) % s.matches.length;
      setSearch(searchTerm, p);
      return p;
    },
    [getPluginState, setSearch],
  );

  const replaceOne = useCallback(
    (searchTerm: string, replaceTerm: string) => {
      const s = getPluginState();
      if (!s || s.matches.length === 0 || !editor) return;
      const match = s.matches[s.currentMatch];
      if (!match) return;
      editor.view.dispatch(editor.view.state.tr.insertText(replaceTerm, match.from, match.to));
      // Re-run search after replacement
      setSearch(searchTerm, s.currentMatch);
    },
    [editor, getPluginState, setSearch],
  );

  const replaceAll = useCallback(
    (searchTerm: string, replaceTerm: string) => {
      const s = getPluginState();
      if (!s || s.matches.length === 0 || !editor) return;
      const tr = editor.view.state.tr;
      // Replace from end to start to preserve positions
      [...s.matches].reverse().forEach(({ from, to }) => {
        tr.insertText(replaceTerm, from, to);
      });
      editor.view.dispatch(tr);
      setSearch(searchTerm, 0);
    },
    [editor, getPluginState, setSearch],
  );

  return { setSearch, next, prev, replaceOne, replaceAll, getPluginState };
}

type FindReplacePanelProps = {
  editor: any;
  onClose: () => void;
  findTerm: string;
  setFindTerm: (v: string) => void;
  replaceTerm: string;
  setReplaceTerm: (v: string) => void;
};

export function FindReplacePanel({
  editor,
  onClose,
  findTerm,
  setFindTerm,
  replaceTerm,
  setReplaceTerm,
}: FindReplacePanelProps) {
  const { setSearch, next, prev, replaceOne, replaceAll, getPluginState } = useFindReplace(editor);

  const pluginState = getPluginState();
  const matchCount = pluginState?.matches.length ?? 0;
  const currentMatch = pluginState?.currentMatch ?? 0;

  // Sync plugin decorations whenever the search term changes (also fires on mount for pre-filled terms)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSearch(findTerm, 0); }, [findTerm]);

  // Clear decorations when the panel unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { setSearch('', 0); }, []);

  const handleFindChange = (value: string) => {
    setFindTerm(value);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="flex items-center gap-2 px-8 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-wrap flex-shrink-0">
      {/* Search row */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          autoFocus
          value={findTerm}
          onChange={(e) => handleFindChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.shiftKey ? prev(findTerm) : next(findTerm);
            }
            if (e.key === 'Escape') handleClose();
          }}
          placeholder="Find…"
          className="flex-1 min-w-0 text-sm bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
        />
        {matchCount > 0 && (
          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
            {currentMatch + 1}/{matchCount}
          </span>
        )}
        {findTerm && matchCount === 0 && (
          <span className="text-xs text-red-400 flex-shrink-0">No results</span>
        )}
        <button
          onClick={() => prev(findTerm)}
          disabled={matchCount === 0}
          title="Previous match (Shift+Enter)"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => next(findTerm)}
          disabled={matchCount === 0}
          title="Next match (Enter)"
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      {/* Replace row */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Replace className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <input
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') replaceOne(findTerm, replaceTerm);
            if (e.key === 'Escape') handleClose();
          }}
          placeholder="Replace…"
          className="flex-1 min-w-0 text-sm bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
        />
        <button
          onClick={() => replaceOne(findTerm, replaceTerm)}
          disabled={matchCount === 0 || !findTerm}
          className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors whitespace-nowrap flex-shrink-0"
        >
          Replace
        </button>
        <button
          onClick={() => replaceAll(findTerm, replaceTerm)}
          disabled={matchCount === 0 || !findTerm}
          className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors whitespace-nowrap flex-shrink-0"
        >
          All
        </button>
      </div>

      <button
        onClick={handleClose}
        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors flex-shrink-0"
        title="Close (Escape)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
