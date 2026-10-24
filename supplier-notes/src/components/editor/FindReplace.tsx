import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, Decoration } from '@tiptap/pm/view';
import { useCallback, useEffect } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div role="search" className="mt-2 flex flex-col gap-1.5 rounded-lg border bg-card p-2 shadow-xs">
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            aria-label="Find"
            value={findTerm}
            onChange={(e) => handleFindChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? prev(findTerm) : next(findTerm);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
              }
            }}
            placeholder="Find…"
            className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground"
          />
          {matchCount > 0 && (
            <span className="shrink-0 font-mono text-2xs whitespace-nowrap text-muted-foreground">
              {currentMatch + 1} of {matchCount}
            </span>
          )}
          {findTerm && matchCount === 0 && <span className="shrink-0 text-2xs text-destructive">No results</span>}
        </label>
        <Button variant="outline" size="icon-sm" onClick={() => prev(findTerm)} disabled={matchCount === 0} title="Previous match (Shift+Enter)" aria-label="Previous match">
          <ChevronUp />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => next(findTerm)} disabled={matchCount === 0} title="Next match (Enter)" aria-label="Next match">
          <ChevronDown />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleClose} title="Close (Escape)" aria-label="Close find and replace">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Replace className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            aria-label="Replace"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') replaceOne(findTerm, replaceTerm);
              if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
              }
            }}
            placeholder="Replace…"
            className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button variant="outline" size="sm" onClick={() => replaceOne(findTerm, replaceTerm)} disabled={matchCount === 0 || !findTerm}>
          Replace
        </Button>
        <Button variant="outline" size="sm" onClick={() => replaceAll(findTerm, replaceTerm)} disabled={matchCount === 0 || !findTerm}>
          Replace all
        </Button>
      </div>
    </div>
  );
}
